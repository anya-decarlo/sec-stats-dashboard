#!/usr/bin/env python3
"""Builds data.js for the dashboard.

Reads EDGAR companyfacts JSON (cached under data/raw or a --raw-dir such
as ../sec-data-quality/data/raw), computes every quantity the page needs
— series, descriptive stats, OLS trend + residuals, growth-outlier flags,
histogram bins, revenue-vs-income scatter pairs — and writes them out as
a JS constant. The page itself is fully static; this file is the model.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path

import stats

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "data" / "raw"
OUT = ROOT / "data.js"

TAG_TO_METRIC = {
    "Revenues": "revenue",
    "SalesRevenueNet": "revenue",
    "RevenueFromContractWithCustomerExcludingAssessedTax": "revenue",
    "RevenueFromContractWithCustomerIncludingAssessedTax": "revenue",
    "NetIncomeLoss": "net_income",
    "OperatingIncomeLoss": "operating_income",
    "EarningsPerShareDiluted": "eps_diluted",
}
METRIC_LABEL = {
    "revenue": "Revenue",
    "net_income": "Net income",
    "operating_income": "Operating income",
    "eps_diluted": "Diluted EPS",
}


def dec_year(end: str) -> float:
    d = date.fromisoformat(end)
    return d.year + d.timetuple().tm_yday / 365.25


def duration_days(f: dict) -> int | None:
    if f.get("start") and f.get("end"):
        return (date.fromisoformat(f["end"]) - date.fromisoformat(f["start"])).days
    return None


def series(facts: list[dict], lo: int, hi: int) -> list[dict]:
    """Latest-filed fact per period + full filing history (for restatement
    context in the outlier case files)."""
    by_period: dict[tuple, list[dict]] = defaultdict(list)
    for f in facts:
        d = duration_days(f)
        if d is not None and lo <= d <= hi and f.get("filed"):
            by_period[(f["start"], f["end"])].append(f)
    out = []
    for (start, end), group in sorted(by_period.items(), key=lambda t: t[0][1]):
        group.sort(key=lambda f: f["filed"])
        latest = group[-1]
        vals = {f["val"] for f in group}
        out.append({
            "start": start, "end": end, "val": latest["val"],
            "restated": len(vals) > 1,
            "filings": [
                {"form": f["form"], "filed": f["filed"],
                 "accn": f["accn"], "val": f["val"]}
                for f in group
            ],
        })
    return out


def build_entity(payload: dict) -> dict:
    facts = [
        {"tag": tag, "unit": unit, **r}
        for tax in payload["facts"].values()
        for tag, meta in tax.items()
        if tag in TAG_TO_METRIC
        for unit, rows in meta["units"].items()
        for r in rows
    ]
    # merge all tag variants into each canonical metric, then build the
    # series — Apple's pre-2018 `Revenues` and post-2018
    # `RevenueFromContractWithCustomer…` combine into one long series
    by_metric: dict[str, list[dict]] = defaultdict(list)
    for f in facts:
        by_metric[TAG_TO_METRIC[f["tag"]]].append(f)

    metrics: dict[str, dict] = {}
    for metric, mfacts in by_metric.items():
        unit = "USD/shares" if metric == "eps_diluted" else "USD"
        mfacts = [f for f in mfacts if f["unit"] == unit]
        annual = series(mfacts, 350, 400)
        quarterly = series(mfacts, 75, 105)
        if annual:
            metrics[metric] = {"annual": annual, "quarterly": quarterly,
                               "unit": unit}

    result: dict[str, dict] = {}
    for metric, m in metrics.items():
        annual, quarterly = m["annual"], m["quarterly"]
        vals = [p["val"] for p in annual]
        xs = [dec_year(p["end"]) for p in annual]
        yoy = [
            round((v - pv) / abs(pv) * 100, 2)
            for v, pv in zip(vals, vals[1:]) if pv
        ]
        yoy_years = [p["end"][:4] for p in annual[1:]]
        lo_f, hi_f = stats.iqr_fences(yoy)
        zs = stats.z_scores(yoy)

        linear = stats.ols(xs, vals)
        pos = [v for v in vals if v > 0]
        log_fit = None
        if len(pos) == len(vals) and len(vals) > 2:
            ly = [math.log10(v) for v in vals]
            lf = stats.ols(xs, ly)
            log_fit = {
                "r2": lf["r2"],
                "growth_pct": round((10 ** lf["slope"] - 1) * 100, 2),
                "fitted": [10 ** f for f in lf["fitted"]],
            }

        result[metric] = {
            "label": METRIC_LABEL[metric],
            "unit": m["unit"],
            "annual": annual,
            "quarterly": quarterly,
            "x_years": xs,
            "yoy": {"values": yoy, "years": yoy_years,
                    "fences": [round(lo_f, 2), round(hi_f, 2)],
                    "z": [round(z, 2) for z in zs]},
            "stats": {
                "annual": stats.describe(vals),
                "quarterly": stats.describe([p["val"] for p in quarterly]),
                "yoy": stats.describe(yoy),
            },
            "model": {
                "linear": {
                    "slope": linear["slope"], "r2": linear["r2"],
                    "fitted": linear["fitted"],
                    "residuals": [round(r, 4) for r in linear["residuals"]],
                    "resid_sd": linear["resid_sd"],
                },
                "log": log_fit,
                "cagr": stats.cagr(vals[0], vals[-1], xs[-1] - xs[0]),
            },
            "yoy_hist": stats.histogram(yoy),
        }

    # scatter pairs: revenue vs net income, matched on period end
    pairs = []
    if "revenue" in result and "net_income" in result:
        ni = {p["end"]: p["val"] for p in result["net_income"]["annual"]}
        for p in result["revenue"]["annual"]:
            if p["end"] in ni:
                pairs.append({"x": p["val"], "y": ni[p["end"]],
                              "label": p["end"][:4]})
        if len(pairs) > 2:
            fit = stats.ols([p["x"] for p in pairs], [p["y"] for p in pairs])
            result["rev_ni_scatter"] = {
                "pairs": pairs, "r2": fit["r2"], "slope": fit["slope"],
                "intercept": fit["intercept"],
            }
    return result


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--raw-dir", default=str(RAW_DIR))
    p.add_argument("--out", default=str(OUT))
    args = p.parse_args()

    entities = {}
    for path in sorted(Path(args.raw_dir).glob("CIK*.json")):
        payload = json.loads(path.read_text())
        ticker = path.stem.split("_")[-1]
        entities[ticker] = {
            "name": payload["entityName"],
            "metrics": build_entity(payload),
        }
        n = sum(len(m["annual"]) for m in entities[ticker]["metrics"].values()
                if "annual" in m)
        print(f"{ticker}: {n} annual points")

    payload_out = {"generated": date.today().isoformat(), "entities": entities}
    Path(args.out).write_text(
        "const DASH = " + json.dumps(payload_out) + ";\n"
    )
    print(f"wrote {args.out} ({Path(args.out).stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
