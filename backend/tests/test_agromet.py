"""Agro-meteorology formulas pinned to published reference values (FAO-56, Saxton & Rawls 2006, USDA)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services import agromet as a


def test_fao56_example_18_penman_monteith():
    """FAO-56 Example 18 (Uccle, 6 July, 50 deg 48' N, 100 m): Ra 41.09 MJ/m2/d, ETo 3.9 mm/d."""
    ra = a.extraterrestrial_radiation(50.8, np.array([187]))
    assert ra[0] == pytest.approx(41.09, abs=0.05)
    es = (a.saturation_vapour_pressure(21.5) + a.saturation_vapour_pressure(12.3)) / 2
    rh = 1.409 / es * 100  # example's actual vapour pressure ea = 1.409 kPa
    eto = a.eto_penman_monteith(tmax=np.array([21.5]), tmin=np.array([12.3]), rh_mean=np.array([rh]),
                                u2=np.array([2.078]), rs=np.array([22.07]), ra=ra, elevation_m=100)
    assert eto[0] == pytest.approx(3.9, abs=0.1)


def test_daily_eto_falls_back_to_hargreaves_and_never_invents_values():
    idx = pd.date_range("2024-07-01", periods=3, freq="D")
    df = pd.DataFrame({
        "T2M_MAX": [35.0, 35.0, np.nan], "T2M_MIN": [25.0, 25.0, np.nan],
        "RH2M": [50.0, np.nan, 50.0], "WS2M": [2.0, 2.0, 2.0], "ALLSKY_SFC_SW_DWN": [25.0, 25.0, 25.0],
    }, index=idx)
    out = a.daily_eto(df, lat=31.4, elevation_m=180)
    assert list(out.ETO_METHOD[:2]) == ["penman_monteith", "hargreaves"]
    assert out.ETO.iloc[0] > 4 and out.ETO.iloc[1] > 4
    assert np.isnan(out.ETO.iloc[2]) and pd.isna(out.ETO_METHOD.iloc[2])  # no temperature -> missing, not zero


def test_saxton_rawls_loam_matches_published_table():
    sr = a.saxton_rawls_awc(40, 20, 2.5)  # loam: WP 0.12-0.14, FC 0.28, AWC 0.14
    assert sr["field_capacity_m3m3"] == pytest.approx(0.28, abs=0.01)
    assert sr["awc_m3m3"] == pytest.approx(0.14, abs=0.01)
    assert a.saxton_rawls_awc(90, 5, 1.0)["awc_m3m3"] < 0.06  # sand holds little water


@pytest.mark.parametrize("sand,clay,expected", [
    (38.4, 21.5, "loam"), (23.4, 36.3, "clay loam"), (13.2, 30.6, "silty clay loam"),
    (90, 5, "sand"), (10, 50, "silty clay"), (60, 10, "sandy loam"), (20, 10, "silt loam"),
])
def test_usda_texture_triangle(sand, clay, expected):
    assert a.usda_texture_class(sand, clay) == expected


def test_usda_scs_effective_rain_is_continuous_and_bounded():
    assert a.effective_rain_usda_scs(0) == 0
    assert a.effective_rain_usda_scs(100) == pytest.approx(84.0)
    assert a.effective_rain_usda_scs(250) == pytest.approx(150.0)
    assert a.effective_rain_usda_scs(250.001) == pytest.approx(150.0, abs=0.01)
    assert a.effective_rain_usda_scs(400) == pytest.approx(165.0)


def test_stage_weights_exclude_sowing_and_harvest_from_frost_and_heat():
    w = a.season_month_weights(6, (0.2, 0.27, 0.33, 0.2), (0.3, 1.2, 0.35))  # maize May..Oct
    assert w[0]["frost_weight"] == 0 and w[-1]["frost_weight"] == 0
    assert w[0]["heat_weight"] == 0 and w[3]["heat_weight"] == 1.0
    assert w[0]["kc"] == pytest.approx(0.3) and max(x["kc"] for x in w) == pytest.approx(1.2, abs=0.01)


def test_warming_raises_eto_by_a_few_percent_per_degree():
    f = a.temperature_eto_factor(1.0, 25.0)
    assert 1.02 < f < 1.03
    assert a.temperature_eto_factor(0.0, 25.0) == 1.0
