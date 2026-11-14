"""Agro-meteorology from live NASA POWER daily data and SoilGrids texture.

Pure, deterministic calculations (no network):

- Reference evapotranspiration ETo, FAO-56 Penman-Monteith (Allen et al. 1998, eq. 6), from
  POWER T2M_MAX, T2M_MIN, RH2M, WS2M (2 m wind) and ALLSKY_SFC_SW_DWN (MJ m-2 day-1).
  Days without radiation/humidity/wind (POWER solar data lags by weeks) fall back to Hargreaves
  (FAO-56 eq. 52), which needs only temperature and extraterrestrial radiation.
- Plant-available soil water from SoilGrids sand/clay/organic matter with the Saxton & Rawls (2006)
  pedotransfer functions (field capacity at -33 kPa, wilting point at -1500 kPa).
- USDA texture class from sand/clay/silt (USDA soil texture triangle).
- Monthly effective rainfall with the USDA Soil Conservation Service method used by FAO CROPWAT.
- Crop-stage weights per calendar month (FAO-56 four-stage Kc curve) so heat, frost and water demand
  are evaluated in the growth stage where they actually matter.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
import pandas as pd

STEFAN_BOLTZMANN = 4.903e-9  # MJ K-4 m-2 day-1
SOLAR_CONSTANT = 0.0820  # MJ m-2 min-1
DEFAULT_STAGE_FRACTIONS: tuple[float, float, float, float] = (0.2, 0.3, 0.3, 0.2)


# --------------------------------------------------------------------------------------- ETo
def saturation_vapour_pressure(t_c: np.ndarray | float) -> np.ndarray | float:
    """FAO-56 eq. 11, kPa."""
    return 0.6108 * np.exp(17.27 * t_c / (t_c + 237.3))


def extraterrestrial_radiation(lat_deg: float, doy: np.ndarray) -> np.ndarray:
    """Daily extraterrestrial radiation Ra (FAO-56 eq. 21), MJ m-2 day-1."""
    phi = math.radians(lat_deg)
    j = np.asarray(doy, dtype="float64")
    dr = 1.0 + 0.033 * np.cos(2.0 * math.pi * j / 365.0)
    decl = 0.409 * np.sin(2.0 * math.pi * j / 365.0 - 1.39)
    ws = np.arccos(np.clip(-math.tan(phi) * np.tan(decl), -1.0, 1.0))
    return (24.0 * 60.0 / math.pi) * SOLAR_CONSTANT * dr * (
        ws * math.sin(phi) * np.sin(decl) + math.cos(phi) * np.cos(decl) * np.sin(ws)
    )


def eto_penman_monteith(
    *,
    tmax: np.ndarray,
    tmin: np.ndarray,
    rh_mean: np.ndarray,
    u2: np.ndarray,
    rs: np.ndarray,
    ra: np.ndarray,
    elevation_m: float,
) -> np.ndarray:
    """FAO-56 Penman-Monteith grass reference ETo (mm/day). Soil heat flux G = 0 for daily steps."""
    tmean = (tmax + tmin) / 2.0
    pressure = 101.3 * ((293.0 - 0.0065 * elevation_m) / 293.0) ** 5.26  # eq. 7
    gamma = 0.000665 * pressure  # eq. 8
    es = (saturation_vapour_pressure(tmax) + saturation_vapour_pressure(tmin)) / 2.0  # eq. 12
    ea = np.clip(rh_mean, 0.0, 100.0) / 100.0 * es  # eq. 19
    delta = 4098.0 * saturation_vapour_pressure(tmean) / (tmean + 237.3) ** 2  # eq. 13
    rso = (0.75 + 2e-5 * elevation_m) * ra  # eq. 37
    rns = (1.0 - 0.23) * rs  # eq. 38
    rs_rso = np.clip(np.divide(rs, rso, out=np.full_like(rs, np.nan), where=rso > 0), 0.25, 1.0)
    rnl = (
        STEFAN_BOLTZMANN
        * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4)
        / 2.0
        * (0.34 - 0.14 * np.sqrt(np.clip(ea, 0.0, None)))
        * (1.35 * rs_rso - 0.35)
    )  # eq. 39
    rn = rns - rnl
    num = 0.408 * delta * rn + gamma * (900.0 / (tmean + 273.0)) * u2 * (es - ea)
    den = delta + gamma * (1.0 + 0.34 * u2)
    return np.clip(num / den, 0.0, None)


def eto_hargreaves(*, tmax: np.ndarray, tmin: np.ndarray, ra: np.ndarray) -> np.ndarray:
    """FAO-56 eq. 52 (Hargreaves), mm/day. Ra converted to mm/day with 0.408."""
    tmean = (tmax + tmin) / 2.0
    return np.clip(0.0023 * (tmean + 17.8) * np.sqrt(np.clip(tmax - tmin, 0.0, None)) * 0.408 * ra, 0.0, None)


def daily_eto(df: pd.DataFrame, *, lat: float, elevation_m: float | None) -> pd.DataFrame:
    """Return a frame (same index) with `ETO` mm/day and `ETO_METHOD` ('penman_monteith'|'hargreaves').

    `df` has a DatetimeIndex and POWER columns; missing inputs are NaN. Days without valid
    temperature get NaN ETo (never zero).
    """
    z = float(elevation_m) if elevation_m is not None and math.isfinite(elevation_m) else 0.0
    idx = pd.DatetimeIndex(df.index)
    ra = extraterrestrial_radiation(lat, idx.day_of_year.to_numpy())

    def col(name: str) -> np.ndarray:
        return df[name].to_numpy(dtype="float64") if name in df.columns else np.full(len(df), np.nan)

    tmax, tmin = col("T2M_MAX"), col("T2M_MIN")
    rh, u2, rs = col("RH2M"), col("WS2M"), col("ALLSKY_SFC_SW_DWN")
    with np.errstate(invalid="ignore", divide="ignore"):
        pm = eto_penman_monteith(tmax=tmax, tmin=tmin, rh_mean=rh, u2=u2, rs=rs, ra=ra, elevation_m=z)
        hg = eto_hargreaves(tmax=tmax, tmin=tmin, ra=ra)
    pm_ok = np.isfinite(pm)
    eto = np.where(pm_ok, pm, hg)
    method = np.where(pm_ok, "penman_monteith", np.where(np.isfinite(hg), "hargreaves", None))
    return pd.DataFrame({"ETO": eto, "ETO_METHOD": method}, index=df.index)


# ------------------------------------------------------------------------------------ Soil
def organic_matter_pct(soc_g_kg: float | None) -> float | None:
    """Soil organic matter (% by weight) from organic carbon using the van Bemmelen factor 1.724."""
    if soc_g_kg is None or not math.isfinite(soc_g_kg):
        return None
    return soc_g_kg / 10.0 * 1.724


def saxton_rawls_awc(sand_pct: float, clay_pct: float, om_pct: float) -> dict[str, float]:
    """Saxton & Rawls (2006) eqs. 1-2: wilting point, field capacity and available water (m3/m3)."""
    s, c = sand_pct / 100.0, clay_pct / 100.0
    om = min(max(om_pct, 0.0), 8.0)  # equations are calibrated for OM <= 8 %
    t1500 = -0.024 * s + 0.487 * c + 0.006 * om + 0.005 * s * om - 0.013 * c * om + 0.068 * s * c + 0.031
    wp = t1500 + (0.14 * t1500 - 0.02)
    t33 = -0.251 * s + 0.195 * c + 0.011 * om + 0.006 * s * om - 0.027 * c * om + 0.452 * s * c + 0.299
    fc = t33 + (1.283 * t33**2 - 0.374 * t33 - 0.015)
    return {"wilting_point_m3m3": wp, "field_capacity_m3m3": fc, "awc_m3m3": max(0.0, fc - wp)}


def usda_texture_class(sand_pct: float, clay_pct: float) -> str:
    """USDA soil texture triangle class name."""
    sand, clay = sand_pct, clay_pct
    silt = 100.0 - sand - clay
    if silt + 1.5 * clay < 15:
        return "sand"
    if silt + 2 * clay < 30:
        return "loamy sand"
    if clay >= 40:
        if silt >= 40:
            return "silty clay"
        if sand <= 45:
            return "clay"
    if clay >= 35 and sand > 45:
        return "sandy clay"
    if 27 <= clay < 40:
        if sand <= 20:
            return "silty clay loam"
        if sand <= 45:
            return "clay loam"
    if 20 <= clay < 35 and silt < 28 and sand > 45:
        return "sandy clay loam"
    if silt >= 80 and clay < 12:
        return "silt"
    if silt >= 50 and (12 <= clay < 27 or clay < 12):
        return "silt loam"
    if 7 <= clay < 27 and 28 <= silt < 50 and sand <= 52:
        return "loam"
    return "sandy loam"


# ------------------------------------------------------------------------------------ Rain
def effective_rain_usda_scs(monthly_rain_mm: float) -> float:
    """USDA SCS monthly effective rainfall (FAO CROPWAT 'USDA S.C. method'), mm/month."""
    p = max(0.0, float(monthly_rain_mm))
    if p <= 250.0:
        return p * (125.0 - 0.2 * p) / 125.0
    return 125.0 + 0.1 * p


# ------------------------------------------------------------------------------ Crop stages
def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def kc_at(x: float, fractions: Sequence[float], kc: Sequence[float]) -> float:
    """FAO-56 four-stage Kc curve at season fraction x in [0, 1]."""
    f1, f2, f3, _ = fractions
    kc_ini, kc_mid, kc_end = kc
    b1, b2, b3 = f1, f1 + f2, f1 + f2 + f3
    if x <= b1:
        return kc_ini
    if x <= b2:
        return kc_ini + (kc_mid - kc_ini) * (x - b1) / max(f2, 1e-9)
    if x <= b3:
        return kc_mid
    return kc_mid + (kc_end - kc_mid) * (x - b3) / max(1.0 - b3, 1e-9)


def season_month_weights(
    n_months: int,
    fractions: Sequence[float] | None,
    kc: Sequence[float] | None,
) -> list[dict[str, float | None]]:
    """Per calendar month of a season: mean Kc, heat-sensitive weight and frost-sensitive weight.

    Each month is treated as an equal slice of the season. The heat-sensitive window is the FAO
    mid-season stage (flowering and grain/boll fill); the frost-sensitive window spans the
    development and mid-season stages (emergence is after the sowing month's frost risk, and the
    late stage is maturation). Weights are the fraction of the month inside the window (0..1).
    """
    fr = tuple(float(v) for v in (fractions or DEFAULT_STAGE_FRACTIONS))
    total = sum(fr)
    fr = tuple(v / total for v in fr) if total > 0 else DEFAULT_STAGE_FRACTIONS
    mid0, mid1 = fr[0] + fr[1], fr[0] + fr[1] + fr[2]
    frost0, frost1 = fr[0], mid1
    out: list[dict[str, float | None]] = []
    for k in range(n_months):
        a0, a1 = k / n_months, (k + 1) / n_months
        width = a1 - a0
        mean_kc: float | None = None
        if kc is not None:
            samples = [kc_at(a0 + width * (i + 0.5) / 20.0, fr, kc) for i in range(20)]
            mean_kc = sum(samples) / len(samples)
        out.append({
            "kc": mean_kc,
            "heat_weight": _overlap(a0, a1, mid0, mid1) / width,
            "frost_weight": _overlap(a0, a1, frost0, frost1) / width,
        })
    return out


def temperature_eto_factor(delta_t_c: float, tmean_c: float | None) -> float:
    """Relative ETo change for a warming scenario, from the Hargreaves temperature term (Tmean+17.8)."""
    if delta_t_c == 0 or tmean_c is None or not math.isfinite(tmean_c) or tmean_c + 17.8 <= 0:
        return 1.0
    return 1.0 + float(delta_t_c) / (float(tmean_c) + 17.8)
