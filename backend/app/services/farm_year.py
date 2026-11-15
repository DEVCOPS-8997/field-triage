"""Your farm's year": a rotation folded onto the 12 calendar months, plus plain key moments.

Pure and deterministic (no network, no randomness). Null means "no data or not applicable" and is
never turned into zero.

Layout
------
Cash crops are laid end to end from the first crop's sowing month (same rule as the bare-soil
calculation in `rotation_engine`), and the cover crop fills the gaps between cash crops. The cycle
length is a whole number of years (12, 24 or 36 months).

Folding multi-year cycles onto calendar months
----------------------------------------------
A 24- or 36-month cycle has 2 or 3 "cycle years". For each calendar month:
  * `crops` is the union of every crop on the field in that month in any cycle year, oldest crop
    first (the crop sown earlier is listed first), then the cover crop;
  * `bare` is True only if the field is bare in that month in EVERY cycle year;
  * `cover_crop` is True when the cover crop is the only crop there in every cycle year it appears;
  * `stage` is the stage of the main crop: the first listed cash crop, in the first cycle year it is
    present that month.

Stages
------
Each season month is an equal slice of the season. The month's stage is the FAO-56 stage
(`stage_fractions` = initial, development, mid, late) that overlaps it most, named for farmers:
initial -> sowing, development -> growing, mid -> flowering, late -> harvest. For seasons of three
months or more the sowing month is always "sowing" and the harvest month always "harvest".

Risks (share of past years, 0..1)
---------------------------------
  * heat_risk: a cash crop is flowering this month and the month had at least one day at or above
    the crop's heat limit (lowered by the warming scenario, nearest counted threshold, as in the
    season replay). None when no crop flowers this month.
  * frost_risk: a frost-sensitive crop is on the field and the month had at least one frost day.
    None when no frost-sensitive crop is there.
  * dry_risk: crop water demand (Kc x ETo, with the warming scenario raising ETo; the catalog
    seasonal need spread by Kc when ETo is missing) exceeded effective rain (rain x scenario
    multiplier, USDA-SCS) plus, only when the farmer gave `water_available_mm`, that water spread
    evenly over the season months. None when no cash crop grows this month.
  * heavy_rain_risk: the month had at least one day with 25 mm of rain or more. Site-level; the rain
    scenario multiplier is not applied because daily amounts are not kept in the monthly profile.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

from app.models.schemas import FarmMonth, MonthRecord, Scenario
from app.services.agromet import (
    DEFAULT_STAGE_FRACTIONS,
    effective_rain_usda_scs,
    season_month_weights,
    temperature_eto_factor,
)
from app.utils.validation import is_valid_number, validate_crop_calendar

MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
STAGE_NAMES = ("sowing", "growing", "flowering", "harvest")


# ---------------------------------------------------------------------------------------------
# Cycle layout (shared with the bare-soil calculation)
# ---------------------------------------------------------------------------------------------
def _earliest_month_ge(min_abs_month: int, target_calendar_month: int) -> int:
    current_cal_month = ((min_abs_month - 1) % 12) + 1
    return min_abs_month + (target_calendar_month - current_cal_month) % 12


def _crop_end_abs_month(start_abs_month: int, sow_month: int, harvest_month: int) -> int:
    span = (harvest_month - sow_month) if sow_month <= harvest_month else (12 - sow_month + harvest_month)
    return start_abs_month + span


@dataclass(frozen=True)
class CycleLayout:
    """Absolute 1-based months of each cash crop (and cover crop spans) in one rotation cycle."""

    starts: tuple[int, ...]
    ends: tuple[int, ...]
    cycle_end_sow: int
    cycle_months: int
    cover_spans: tuple[tuple[int, int], ...]

    def position(self, abs_month: int) -> int:
        return (abs_month - self.starts[0]) % self.cycle_months

    def calendar_month(self, position: int) -> int:
        return ((self.starts[0] + position - 1) % 12) + 1


def cycle_layout(
    sequence_crops: list[dict[str, Any]],
    cover_crop: dict[str, Any] | None,
    region_id: str,
) -> CycleLayout:
    calendars = [validate_crop_calendar(c, region_id) for c in sequence_crops]
    first_sow, first_harv = calendars[0]
    starts: list[int] = [first_sow]
    ends: list[int] = [_crop_end_abs_month(first_sow, first_sow, first_harv)]
    for sow_m, harv_m in calendars[1:]:
        next_start = _earliest_month_ge(ends[-1], sow_m)
        if next_start <= starts[-1]:
            next_start += 12
        starts.append(next_start)
        ends.append(_crop_end_abs_month(next_start, sow_m, harv_m))

    cycle_end_sow = _earliest_month_ge(max(ends[-1], starts[0] + 1), first_sow)
    if cycle_end_sow <= starts[0]:
        cycle_end_sow += 12
    cycle_months = cycle_end_sow - starts[0]

    cover_spans: list[tuple[int, int]] = []
    if cover_crop is not None:
        cover_sow, cover_harv = validate_crop_calendar(cover_crop, region_id)
        for idx, end_curr in enumerate(ends):
            next_cash_start = starts[idx + 1] if idx + 1 < len(starts) else cycle_end_sow
            if next_cash_start - end_curr <= 1:
                continue
            c_start = _earliest_month_ge(end_curr, cover_sow)
            c_end = _crop_end_abs_month(c_start, cover_sow, cover_harv)
            while c_end <= next_cash_start:
                cover_spans.append((c_start, c_end))
                c_start += 12
                c_end += 12
    return CycleLayout(tuple(starts), tuple(ends), cycle_end_sow, cycle_months, tuple(cover_spans))


# ---------------------------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------------------------
def _norm_fractions(fractions: Sequence[float] | None) -> tuple[float, float, float, float]:
    fr = tuple(float(v) for v in (fractions or DEFAULT_STAGE_FRACTIONS))
    if len(fr) != 4 or sum(fr) <= 0:
        return DEFAULT_STAGE_FRACTIONS
    total = sum(fr)
    return tuple(v / total for v in fr)  # type: ignore[return-value]


def stage_for_month(k: int, n: int, fractions: Sequence[float] | None) -> str:
    """Farmer stage name of season month `k` (0-based) of an `n`-month season."""
    if n >= 3 and k == 0:
        return "sowing"
    if n >= 3 and k == n - 1:
        return "harvest"
    fr = _norm_fractions(fractions)
    a0, a1 = k / n, (k + 1) / n
    bounds, acc = [], 0.0
    for f in fr:
        bounds.append((acc, acc + f))
        acc += f
    overlaps = [max(0.0, min(a1, b1) - max(a0, b0)) for b0, b1 in bounds]
    best = max(range(4), key=lambda i: (overlaps[i], -i))
    return STAGE_NAMES[best]


# ---------------------------------------------------------------------------------------------
# Farm year
# ---------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class YearCount:
    """`hits` of `n` past years, for the crop named (used for plain sentences)."""

    crop: str
    hits: int
    n: int
    threshold_c: float | None = None

    @property
    def share(self) -> float:
        return self.hits / self.n


@dataclass(frozen=True)
class MonthDetail:
    month: int
    heat: YearCount | None = None
    frost: YearCount | None = None
    dry: YearCount | None = None
    heavy_rain: YearCount | None = None
    tmax_mean_c: float | None = None
    main_crop: str | None = None


@dataclass(frozen=True)
class FarmYearResult:
    months: tuple[FarmMonth, ...]
    details: tuple[MonthDetail, ...]
    n_years: int = 0
    notes: dict[str, Any] = field(default_factory=dict)


def _count(values: list[bool]) -> tuple[int, int] | None:
    return (sum(values), len(values)) if values else None


def _heat_key(threshold_c: float, temp_delta_c: float, heat_buckets_c: list[int | float]) -> tuple[str, float]:
    eff = float(threshold_c) - float(temp_delta_c)
    nearest = min(sorted(float(b) for b in heat_buckets_c), key=lambda b: (abs(b - eff), b))
    return (str(int(nearest)) if nearest.is_integer() else str(nearest)), nearest


def build_farm_year(
    *,
    sequence_crops: list[dict[str, Any]],
    cover_crop: dict[str, Any] | None,
    region_id: str,
    monthly: list[MonthRecord],
    scenario: Scenario,
    heat_buckets_c: list[int | float],
    parameters: dict[str, Any],
    water_available_mm: float | None = None,
    ndvi_monthly_mean: list[Any] | None = None,
    layout: CycleLayout | None = None,
) -> FarmYearResult:
    """Twelve `FarmMonth` entries (January..December) and the counts behind them."""
    layout = layout or cycle_layout(sequence_crops, cover_crop, region_id)
    cfg = parameters.get("farm_year") or {}
    erosion_thr = float(cfg.get("erosion_heavy_rain_risk", 0.3))
    opp_tmax = float(cfg.get("opportunity_max_tmax_c", 40.0))
    opp_frost = float(cfg.get("opportunity_max_frost_share", 0.0))
    mult = float(scenario.rain_multiplier)
    delta = float(scenario.temp_delta_c)

    # Occupancy by cycle position: cash entries (crop index, season month k, season length n).
    cyc = layout.cycle_months
    cash_at: list[list[tuple[int, int, int]]] = [[] for _ in range(cyc)]
    for idx, (st, en) in enumerate(zip(layout.starts, layout.ends, strict=True)):
        n = en - st + 1
        for a in range(st, en + 1):
            cash_at[layout.position(a)].append((idx, a - st, n))
    cover_at = [False] * cyc
    for cs, ce in layout.cover_spans:
        for a in range(cs, ce + 1):
            cover_at[layout.position(a)] = True

    by_month: dict[int, list[MonthRecord]] = {m: [] for m in range(1, 13)}
    for rec in sorted(monthly, key=lambda r: (r.year, r.month)):
        by_month[rec.month].append(rec)
    n_years = len({r.year for r in monthly if is_valid_number(r.rain_mm)})

    weights_cache: dict[int, list[dict[str, float | None]]] = {}

    def crop_weights(idx: int, n: int) -> list[dict[str, float | None]]:
        if idx not in weights_cache:
            crop = sequence_crops[idx]
            cal = (crop.get("calendars") or {}).get(region_id, {}) or {}
            kc = crop.get("kc") if isinstance(crop.get("kc"), list) and len(crop["kc"]) == 3 else None
            weights_cache[idx] = season_month_weights(n, cal.get("stage_fractions"), kc)
        return weights_cache[idx]

    months: list[FarmMonth] = []
    details: list[MonthDetail] = []
    for m in range(1, 13):
        positions = [p for p in range(cyc) if layout.calendar_month(p) == m]
        entries: list[tuple[int, int, int]] = []
        seen_idx: set[int] = set()
        for p in positions:
            for e in sorted(cash_at[p]):
                if e[0] not in seen_idx:
                    seen_idx.add(e[0])
                    entries.append(e)
        has_cover = any(cover_at[p] for p in positions)
        names = list(dict.fromkeys(str(sequence_crops[i].get("name", sequence_crops[i]["crop_id"])) for i, _, _ in entries))
        if has_cover and cover_crop is not None:
            cname = str(cover_crop.get("name", cover_crop["crop_id"]))
            if cname not in names:
                names.append(cname)
        bare = not entries and not has_cover
        cover_only = has_cover and not entries

        stage = None
        stages: list[tuple[int, int, int, str]] = []
        for idx, k, n in entries:
            cal = (sequence_crops[idx].get("calendars") or {}).get(region_id, {}) or {}
            stages.append((idx, k, n, stage_for_month(k, n, cal.get("stage_fractions"))))
        if stages:
            stage = stages[0][3]

        recs = by_month[m]

        # Heat at flowering: worst crop this month.
        heat: YearCount | None = None
        for idx, _k, _n, st in stages:
            if st != "flowering":
                continue
            crop = sequence_crops[idx]
            key, thr = _heat_key(float(crop["heat_threshold_c"]), delta, heat_buckets_c)
            c = _count([int(r.heat_days_ge[key]) > 0 for r in recs if is_valid_number(r.heat_days_ge.get(key))])
            if c is None:
                continue
            yc = YearCount(str(crop.get("name", crop["crop_id"])), c[0], c[1], thr)
            if heat is None or yc.share > heat.share:
                heat = yc

        # Frost while a frost-sensitive crop is on the field.
        frost_vals = [int(r.frost_days_le_0c) > 0 for r in recs if is_valid_number(r.frost_days_le_0c)]  # type: ignore[arg-type]
        site_frost = _count(frost_vals)
        sensitive = [sequence_crops[i] for i, _, _ in entries if bool(sequence_crops[i].get("frost_sensitive"))]
        if has_cover and cover_crop is not None and cover_crop.get("frost_sensitive"):
            sensitive.append(cover_crop)
        frost: YearCount | None = None
        if sensitive and site_frost is not None:
            frost = YearCount(str(sensitive[0].get("name", sensitive[0]["crop_id"])), site_frost[0], site_frost[1])

        # Dry: demand vs effective rain (+ farmer water spread over the season).
        dry: YearCount | None = None
        for idx, k, n in entries:
            crop = sequence_crops[idx]
            w = crop_weights(idx, n)
            kcs = [x["kc"] for x in w]
            kc_k = w[k]["kc"]
            if kc_k is not None and all(v is not None for v in kcs) and sum(kcs) > 0:  # type: ignore[arg-type]
                share_k = float(kc_k) / float(sum(kcs))  # type: ignore[arg-type]
            else:
                share_k = 1.0 / n
            irr = (float(water_available_mm) / n) if water_available_mm is not None else 0.0
            hits: list[bool] = []
            for r in recs:
                if not is_valid_number(r.rain_mm):
                    continue
                if kc_k is not None and is_valid_number(r.eto_mm):
                    demand = float(kc_k) * float(r.eto_mm) * temperature_eto_factor(delta, r.tmean_c)  # type: ignore[arg-type]
                else:
                    demand = float(crop["water_need_mm"]) * share_k
                supply = effective_rain_usda_scs(float(r.rain_mm) * mult) + irr  # type: ignore[arg-type]
                hits.append(demand > supply)
            c = _count(hits)
            if c is None:
                continue
            yc = YearCount(str(crop.get("name", crop["crop_id"])), c[0], c[1])
            if dry is None or yc.share > dry.share:
                dry = yc

        hr = _count([int(r.heavy_rain_days_ge_25mm) >= 1 for r in recs if is_valid_number(r.heavy_rain_days_ge_25mm)])  # type: ignore[arg-type]
        heavy = YearCount("", hr[0], hr[1]) if hr else None

        tmaxes = [float(r.tmax_mean_c) for r in recs if is_valid_number(r.tmax_mean_c)]  # type: ignore[arg-type]
        tmax_mean = (sum(tmaxes) / len(tmaxes) + delta) if tmaxes else None

        ndvi = None
        if isinstance(ndvi_monthly_mean, list) and len(ndvi_monthly_mean) == 12 and is_valid_number(ndvi_monthly_mean[m - 1]):
            ndvi = round(float(ndvi_monthly_mean[m - 1]), 3)

        heavy_risk = round(heavy.share, 2) if heavy else None
        opportunity = bool(
            bare
            and tmax_mean is not None
            and tmax_mean < opp_tmax
            and site_frost is not None
            and site_frost[0] / site_frost[1] <= opp_frost
        )
        months.append(FarmMonth(
            month=m,
            crops=names,
            cover_crop=cover_only,
            bare=bare,
            stage=stage,
            heat_risk=round(heat.share, 2) if heat else None,
            frost_risk=round(frost.share, 2) if frost else None,
            dry_risk=round(dry.share, 2) if dry else None,
            heavy_rain_risk=heavy_risk,
            erosion_alert=bool(bare and heavy_risk is not None and heavy_risk >= erosion_thr),
            ndvi=ndvi,
            opportunity=opportunity,
        ))
        details.append(MonthDetail(
            month=m, heat=heat, frost=frost, dry=dry, heavy_rain=heavy,
            tmax_mean_c=None if tmax_mean is None else round(tmax_mean, 1),
            main_crop=names[0] if names else None,
        ))
    return FarmYearResult(months=tuple(months), details=tuple(details), n_years=n_years)


# ---------------------------------------------------------------------------------------------
# Key moments (plain sentences)
# ---------------------------------------------------------------------------------------------
def month_runs(months: set[int] | list[int]) -> list[list[int]]:
    """Group calendar months into runs of consecutive months (December wraps to January)."""
    ms = set(months)
    if not ms:
        return []
    if len(ms) == 12:
        return [list(range(1, 13))]
    runs: list[list[int]] = []
    for m in range(1, 13):
        prev = 12 if m == 1 else m - 1
        if m in ms and prev not in ms:
            run = [m]
            nxt = m % 12 + 1
            while nxt in ms and nxt != m:
                run.append(nxt)
                nxt = nxt % 12 + 1
            runs.append(run)
    return runs


def _run_text(run: list[int]) -> str:
    if len(run) == 1:
        return MONTH_NAMES[run[0] - 1]
    return f"{MONTH_NAMES[run[0] - 1]}–{MONTH_NAMES[run[-1] - 1]}"


def _join(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def months_text(months: set[int] | list[int]) -> str:
    return _join([_run_text(r) for r in month_runs(months)])


def build_key_moments(
    result: FarmYearResult,
    parameters: dict[str, Any],
    *,
    include_satellite: bool = False,
) -> list[str]:
    """Two or three plain sentences about the rotation's year at this spot."""
    cfg = parameters.get("farm_year") or {}
    heat_thr = float(cfg.get("key_moment_heat_risk", 0.3))
    rain_thr = float(cfg.get("key_moment_heavy_rain_risk", 0.3))
    dry_thr = float(cfg.get("key_moment_dry_risk", 0.5))
    opp_tmax = float(cfg.get("opportunity_max_tmax_c", 40.0))
    ndvi_bare = float(parameters.get("ndvi_bare_threshold", 0.2))
    fm = {m.month: m for m in result.months}
    det = {d.month: d for d in result.details}
    out: list[str] = []

    # 1. Bare window and what could fit there.
    bare = {m for m, x in fm.items() if x.bare}
    if bare:
        runs = month_runs(bare)
        longest = max(runs, key=lambda r: (len(r), -r[0]))
        line = f"Your field is usually bare in {_run_text(longest)}."
        if any(fm[m].opportunity for m in longest):
            if all(4 <= m <= 9 for m in longest):
                line += " That is a window for a short crop like mungbean or a cover crop."
            else:
                line += " That is a window for a short fodder crop or a cover crop."
        elif all(det[m].tmax_mean_c is not None and det[m].tmax_mean_c >= opp_tmax for m in longest):  # type: ignore[operator]
            line += " It is very hot then, so crop residue or mulch helps keep the soil from baking."
        out.append(line)
    else:
        out.append("Your field has a crop on it in every month of the year, which keeps living roots in the soil.")

    # 2. Satellite evidence (current rotation only, when MODIS NDVI was merged).
    if include_satellite:
        ndvi = {m: x.ndvi for m, x in fm.items() if x.ndvi is not None}
        if ndvi:
            low = {m for m, v in ndvi.items() if v < ndvi_bare}
            if low & bare:
                out.append(f"NASA MODIS satellite greenness confirms the field is usually bare in {months_text(low & bare)}.")
            elif low:
                out.append(
                    f"NASA MODIS satellite greenness shows the field is usually bare in {months_text(low)}, "
                    "which differs from the usual crop calendar, so check your sowing dates."
                )
            elif bare:
                out.append(
                    "NASA MODIS satellite greenness shows some green cover in every month, "
                    "even when the crop calendar says the field is bare."
                )
            else:
                out.append("NASA MODIS satellite greenness confirms something is growing on the field in every month.")

    # 3. Heat at flowering.
    heats = [d for d in result.details if d.heat is not None]
    if heats:
        worst = max(heats, key=lambda d: (d.heat.share, -d.month))  # type: ignore[union-attr]
        h = worst.heat
        assert h is not None
        if h.share >= heat_thr and h.hits > 0:
            out.append(
                f"{h.crop} flowers in {MONTH_NAMES[worst.month - 1]}, when this spot had heat of "
                f"{h.threshold_c:.0f} °C or more in {h.hits} of the last {h.n} years."
            )

    # 4. Heavy rain and bare soil.
    wet = {m for m, x in fm.items() if x.heavy_rain_risk is not None and x.heavy_rain_risk >= rain_thr}
    if wet:
        line = f"Heavy rain (25 mm or more in a day) often comes in {months_text(wet)}."
        eroding = {m for m, x in fm.items() if x.erosion_alert}
        if eroding:
            line += f" Your field is bare in {months_text(eroding)}, and bare soil washes away fastest then."
        elif not (wet & bare):
            line += " A crop covers the field then, which helps hold the soil."
        out.append(line)

    # 5. Frost on a frost-sensitive crop.
    frosts = [d for d in result.details if d.frost is not None and d.frost.hits > 0]
    if frosts:
        worst = max(frosts, key=lambda d: (d.frost.share, -d.month))  # type: ignore[union-attr]
        f = worst.frost
        assert f is not None
        out.append(
            f"Frost came in {MONTH_NAMES[worst.month - 1]} in {f.hits} of the last {f.n} years "
            f"while {f.crop} was in the field."
        )

    # 6. Water shortfall.
    drys = [d for d in result.details if d.dry is not None]
    if drys:
        worst = max(drys, key=lambda d: (d.dry.share, -d.month))  # type: ignore[union-attr]
        dr = worst.dry
        assert dr is not None
        if dr.share >= dry_thr and dr.hits > 0:
            out.append(
                f"In {MONTH_NAMES[worst.month - 1]}, {dr.crop} needed more water than the rain gave in "
                f"{dr.hits} of the last {dr.n} years, so plan irrigation for then."
            )

    out = out[:3]
    if len(out) < 2:
        n = result.n_years
        out.append(
            (f"Over the last {n} years of NASA weather for this spot, " if n else "In the weather record for this spot, ")
            + "no frequent heat, frost or heavy-rain problem showed up in the crop months."
        )
    return out
