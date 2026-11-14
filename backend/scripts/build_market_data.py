"""Rebuild `data/market_faostat.json` from the official FAOSTAT bulk downloads.

Usage (from backend/):  .venv\\Scripts\\python.exe scripts\\build_market_data.py

Pulls two FAOSTAT domains for each country we have crop calendars for:
  * QCL  - Crops and livestock products: national average Yield (kg/ha)
  * PP   - Producer Prices: Producer Price (USD/tonne)
and keeps the mean of the most recent (up to 3) reported years, provided the newest one is no
older than MAX_AGE_YEARS behind the newest year in the file. Anything older or missing is written
as null with the reason, so the engine reports "no market data" instead of guessing.
"""

from __future__ import annotations

import csv
import io
import json
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

BULK = "https://bulks-faostat.fao.org/production/{name}.zip"
OUT = Path(__file__).resolve().parents[2] / "data" / "market_faostat.json"
MAX_AGE_YEARS = 5
N_YEARS = 3

COUNTRIES = {
    "PAK": {"area": "Pakistan", "files": ("Prices_E_Asia", "Production_Crops_Livestock_E_Asia")},
    "USA": {"area": "United States of America", "files": ("Prices_E_Americas", "Production_Crops_Livestock_E_Americas")},
}

# crop_id -> FAOSTAT item code (None = FAOSTAT does not report this crop separately)
ITEMS: dict[str, tuple[str | None, str]] = {
    "wheat": ("15", "Wheat"),
    "maize": ("56", "Maize (corn)"),
    "rice": ("27", "Rice (paddy)"),
    "cotton": ("328", "Seed cotton, unginned"),
    "soybean": ("236", "Soya beans"),
    "chickpea": ("191", "Chick peas, dry"),
    "sorghum": ("83", "Sorghum"),
    "mungbean": (None, "Mungbean (not reported separately by FAOSTAT)"),
    "berseem": (None, "Berseem clover fodder (no FAOSTAT price series)"),
}


def _rows(name: str):
    with urllib.request.urlopen(BULK.format(name=name), timeout=180) as resp:
        blob = resp.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        csv_name = next(n for n in zf.namelist() if n.endswith("_NOFLAG.csv"))
        text = zf.read(csv_name).decode("latin-1")
    return list(csv.DictReader(io.StringIO(text)))


def _series(rows, area: str, item_code: str, element: str) -> tuple[dict[int, float], int]:
    newest_in_file = 0
    out: dict[int, float] = {}
    for row in rows:
        ycols = [c for c in row if c and c.startswith("Y") and c[1:].isdigit()]
        if ycols:
            newest_in_file = max(newest_in_file, max(int(c[1:]) for c in ycols))
        if row["Area"] != area or row["Item Code"] != item_code or row["Element"] != element:
            continue
        for c in ycols:
            v = row.get(c)
            if v not in (None, ""):
                out[int(c[1:])] = float(v)
    return out, newest_in_file


def _recent(series: dict[int, float], newest_in_file: int) -> tuple[float | None, list[int], str | None]:
    if not series:
        return None, [], "not reported"
    years = sorted(series)[-N_YEARS:]
    if years[-1] < newest_in_file - MAX_AGE_YEARS:
        return None, years, f"latest value is from {years[-1]} (older than {MAX_AGE_YEARS} years)"
    return round(sum(series[y] for y in years) / len(years), 1), years, None


def main() -> int:
    result = {
        "source": "FAOSTAT, Food and Agriculture Organization of the United Nations",
        "datasets": {
            "yield": "Crops and livestock products (QCL), element 'Yield' (kg/ha), national average",
            "price": "Producer Prices (PP), element 'Producer Price (USD/tonne)'",
        },
        "url": "https://www.fao.org/faostat/en/#data",
        "retrieved_at": date.today().isoformat(),
        "method": f"Mean of the latest {N_YEARS} reported years; values older than {MAX_AGE_YEARS} years are not used.",
        "countries": {},
    }
    for iso, cfg in COUNTRIES.items():
        price_rows = _rows(cfg["files"][0])
        qcl_rows = _rows(cfg["files"][1])
        crops = {}
        for crop_id, (code, item_name) in ITEMS.items():
            if code is None:
                crops[crop_id] = {"item": item_name, "yield_kg_ha": None, "price_usd_t": None,
                                  "missing": "FAOSTAT has no separate series for this crop"}
                continue
            ys, ynew = _series(qcl_rows, cfg["area"], code, "Yield")
            ps, pnew = _series(price_rows, cfg["area"], code, "Producer Price (USD/tonne)")
            yv, yyears, yerr = _recent(ys, ynew)
            pv, pyears, perr = _recent(ps, pnew)
            entry = {"item": item_name, "item_code": code, "yield_kg_ha": yv, "yield_years": yyears,
                     "price_usd_t": pv, "price_years": pyears}
            reasons = [f"yield {yerr}" for _ in [0] if yerr] + [f"price {perr}" for _ in [0] if perr]
            if reasons:
                entry["missing"] = "; ".join(reasons)
            crops[crop_id] = entry
        result["countries"][iso] = {"name": cfg["area"], "crops": crops}
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
