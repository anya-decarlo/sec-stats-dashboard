"""Statistical helpers — stdlib only (statistics + math).

Kept separate from build.py so the math is unit-testable.
"""

from __future__ import annotations

import math
import statistics as st


def describe(xs: list[float]) -> dict:
    """Descriptive statistics for a numeric series."""
    n = len(xs)
    if n == 0:
        return {"n": 0}
    q1, q2, q3 = st.quantiles(xs, n=4) if n >= 4 else (None, st.median(xs), None)
    mean = st.fmean(xs)
    sd = st.stdev(xs) if n > 1 else 0.0
    skew = (
        sum((x - mean) ** 3 for x in xs) / n / (sd ** 3) if n > 2 and sd else 0.0
    )
    return {
        "n": n,
        "mean": round(mean, 4),
        "median": q2,
        "sd": round(sd, 4),
        "cv": round(sd / mean, 4) if mean else None,   # coefficient of variation
        "skew": round(skew, 3),
        "min": min(xs),
        "q1": q1,
        "q3": q3,
        "iqr": (q3 - q1) if q1 is not None else None,
        "max": max(xs),
    }


def ols(xs: list[float], ys: list[float]) -> dict:
    """Ordinary least squares: slope, intercept, R^2, residuals."""
    n = len(xs)
    mx, my = st.fmean(xs), st.fmean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sxy / sxx if sxx else 0.0
    intercept = my - slope * mx
    fitted = [intercept + slope * x for x in xs]
    residuals = [y - f for y, f in zip(ys, fitted)]
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum(r ** 2 for r in residuals)
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
    return {
        "slope": slope,
        "intercept": intercept,
        "r2": round(r2, 4),
        "fitted": fitted,
        "residuals": residuals,
        "resid_sd": round(st.stdev(residuals), 4) if n > 2 else 0.0,
    }


def iqr_fences(xs: list[float], k: float = 1.5) -> tuple[float, float]:
    """Tukey fences for outlier flagging."""
    if len(xs) < 4:
        return (min(xs, default=0), max(xs, default=0))
    q1, _, q3 = st.quantiles(xs, n=4)
    iqr = q3 - q1
    return (q1 - k * iqr, q3 + k * iqr)


def z_scores(xs: list[float]) -> list[float]:
    if len(xs) < 2:
        return [0.0] * len(xs)
    m, sd = st.fmean(xs), st.stdev(xs)
    return [(x - m) / sd if sd else 0.0 for x in xs]


def cagr(first: float, last: float, periods: float) -> float | None:
    if first <= 0 or last <= 0 or periods <= 0:
        return None
    return round(((last / first) ** (1 / periods) - 1) * 100, 2)


def histogram(xs: list[float], bins: int = 12) -> dict:
    """Equal-width bins -> {edges, counts} for a bar-chart histogram."""
    if not xs:
        return {"edges": [], "counts": []}
    lo, hi = min(xs), max(xs)
    if hi == lo:
        hi = lo + 1
    width = (hi - lo) / bins
    counts = [0] * bins
    for x in xs:
        i = min(int((x - lo) / width), bins - 1)
        counts[i] += 1
    edges = [round(lo + i * width, 3) for i in range(bins + 1)]
    return {"edges": edges, "counts": counts}
