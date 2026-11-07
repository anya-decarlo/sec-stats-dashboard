# sec-stats-dashboard

An interactive statistics page over real SEC EDGAR financials —
descriptive statistics, trend analysis, outlier investigation, data
modeling, and explicit visualization-selection rationale, all in one
static page. Third in a series with
[sec-data-quality](https://github.com/anya-decarlo/sec-data-quality)
(checks & lineage) and
[sec-financial-analytics](https://github.com/anya-decarlo/sec-financial-analytics)
(SQL analytics).

## View it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

or serve the repo root with GitHub Pages — `index.html`, `app.js`, and
the committed `data.js` are the whole site; Chart.js is the only external
dependency (CDN).

## Rebuild the data

```bash
python3 build.py --raw-dir ../sec-data-quality/data/raw   # reuse cache
# or point --raw-dir anywhere with CIK*_*.json companyfacts payloads
python3 -m unittest discover -s tests
```

`build.py` computes every number the page renders — series, statistics,
model fits, outlier flags — and writes them as `const DASH = {...}` in
`data.js`. The page itself does no math beyond formatting; the Python
"model" layer is what's being presented.

## What each panel demonstrates

| Panel | Demonstrates | Why that chart |
|---|---|---|
| Descriptive stats | n/mean/median/sd/CV/skew/quartiles across three windows (annual, quarterly, YoY) | Table — precision beats pictures for summary numbers |
| Trend & fit | OLS linear vs log-linear fit, R², CAGR, log-scale toggle | Line — continuity over ordered time; fits overlaid, never replacing the points |
| Residual check | residual bars vs ±2·sd band coloring | A model is validated by where it's wrong, not by R² |
| Growth & outliers | YoY growth bars, IQR-fence and z>2 flags, click-through **case files** with per-filing lineage + restatement badge | Zero-anchored bars keep sign readable; outliers get an investigation UI, not just a color |
| Distribution | histogram + hand-drawn SVG box plots comparing entity spreads, outlier dots | Answers "what's normal?" rather than "which years?" |
| Revenue → income | scatter + regression, marginal-margin interpretation | Two continuous variables — a line chart would fake a time order |
| Selection guide | the decision table behind every choice on the page | meta-panel: question → data shape → chart → rejected alternative |

## Modeling notes baked in

- **Tag fragmentation is real**: Apple's pre-2018 revenue lives under
  `SalesRevenueNet`, post-2018 under `RevenueFromContractWithCustomer…` —
  `build.py` merges variants into a canonical metric, same approach as
  the sibling repos.
- **Two fits, honestly compared**: linear and log-linear R² are shown
  side by side; the log fit's slope is reported as a %/yr compounding
  rate so the models are comparable in business terms.
- **Outliers get investigated, not discarded**: each flagged point opens
  a case file showing every filing that reported the number — a
  restatement vs a real shock vs a tagging artifact looks different in
  that view.

## Layout

```
index.html   static dashboard shell
app.js       rendering (Chart.js + hand-drawn SVG box plot)
data.js      generated data bundle (committed so Pages just works)
build.py     EDGAR JSON -> statistics -> data.js
stats.py     stdlib stats: describe, OLS, IQR fences, z, CAGR, histogram
tests/       unittest suite for the math
```
