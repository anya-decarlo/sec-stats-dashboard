/* Renders the dashboard from the DASH constant produced by build.py. */

const $ = (id) => document.getElementById(id);
const state = { entity: null, metric: "revenue" };
const charts = {};

const ACCENT = "#2563eb", WARN = "#dc2626", GRAY = "#9ca3af", GREEN = "#059669";

const fmt = {
  money(v, unit) {
    if (unit === "USD/shares") return "$" + v.toFixed(2);
    const a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    return "$" + v.toLocaleString();
  },
  num(v) { return v == null ? "—" : (+v).toLocaleString(undefined, { maximumFractionDigits: 2 }); },
  pct(v) { return v == null ? "—" : v + "%"; },
};

function metricData() {
  return DASH.entities[state.entity].metrics[state.metric];
}

function kill(name) { if (charts[name]) { charts[name].destroy(); } }

function mk(name, id, cfg) {
  kill(name);
  charts[name] = new Chart($(id), cfg);
}

/* ---------- controls ---------- */

function renderControls() {
  const eb = $("entityBtns"), mb = $("metricBtns");
  eb.innerHTML = ""; mb.innerHTML = "";
  for (const [t, e] of Object.entries(DASH.entities)) {
    const b = document.createElement("button");
    b.className = "chip" + (t === state.entity ? " on" : "");
    b.textContent = t;
    b.onclick = () => { state.entity = t; renderAll(); };
    eb.appendChild(b);
  }
  for (const [m, d] of Object.entries(DASH.entities[state.entity].metrics)) {
    if (m === "rev_ni_scatter") continue;
    const b = document.createElement("button");
    b.className = "chip" + (m === state.metric ? " on" : "");
    b.textContent = d.label;
    b.onclick = () => { state.metric = m; renderAll(); };
    mb.appendChild(b);
  }
}

/* ---------- descriptive stats ---------- */

function renderStats() {
  const d = metricData(), s = d.stats;
  const cols = ["n", "mean", "median", "sd", "cv", "skew", "min", "q1", "q3", "max"];
  const val = (row, c) =>
    row[c] == null ? "—"
    : c === "n" ? row[c]
    : ["cv", "skew"].includes(c) ? row[c]
    : c === "mean" || c === "median" || c === "sd" || ["min", "q1", "q3", "max"].includes(c)
      ? fmt.money(row[c], d.unit) : row[c];
  let html = "<tr><th></th>" + ["Annual", "Quarterly", "YoY %"].map(h => `<th>${h}</th>`).join("") + "</tr>";
  for (const c of cols) {
    html += `<tr><td>${c}</td><td>${val(s.annual, c)}</td><td>${val(s.quarterly, c)}</td><td>${c === "n" ? (s.yoy[c] ?? "—") : c === "cv" ? (s.yoy[c] ?? "—") : s.yoy[c] == null ? "—" : s.yoy[c]}</td></tr>`;
  }
  $("statsTable").innerHTML = html;
  const sk = s.annual.skew, cv = s.annual.cv;
  $("statsInterp").textContent =
    `Annual ${d.label.toLowerCase()}: CV ${cv} (variation relative to mean), ` +
    `skew ${sk} ${sk > 0.5 ? "— right tail: recent years pull the mean up" :
      sk < -0.5 ? "— left tail" : "— roughly symmetric"}.`;
}

/* ---------- trend & model ---------- */

function renderTrend() {
  const d = metricData();
  const labels = d.x_years.map(x => x.toFixed(1));
  const logOn = $("logScale").checked;
  const datasets = [
    { label: "Reported", data: d.annual.map(p => p.val),
      borderColor: ACCENT, backgroundColor: ACCENT, pointRadius: 4, tension: 0 },
    { label: `Linear fit (R²=${d.model.linear.r2})`,
      data: d.model.linear.fitted, borderColor: GRAY, borderDash: [6, 4],
      pointRadius: 0, fill: false },
  ];
  if (d.model.log) {
    datasets.push({
      label: `Log-linear fit (R²=${d.model.log.r2}, ${d.model.log.growth_pct}%/yr)`,
      data: d.model.log.fitted, borderColor: GREEN, borderDash: [2, 3],
      pointRadius: 0, fill: false });
  }
  mk("trend", "trendChart", {
    type: "line",
    data: { labels, datasets },
    options: {
      scales: {
        y: { type: logOn ? "logarithmic" : "linear",
             ticks: { callback: v => fmt.money(v, d.unit) } },
        x: { title: { display: true, text: "fiscal year end" } },
      },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
    },
  });
  const m = d.model;
  $("modelNotes").innerHTML =
    `OLS slope ${fmt.money(m.linear.slope, d.unit)}/yr · CAGR ${fmt.pct(m.cagr)}` +
    (m.log ? ` · log-linear implies ${m.log.growth_pct}%/yr compounding` : "") +
    ` · residual sd ${fmt.money(m.linear.resid_sd, d.unit)}`;
}

/* ---------- residuals ---------- */

function renderResid() {
  const d = metricData();
  mk("resid", "residChart", {
    type: "bar",
    data: {
      labels: d.annual.map(p => p.end.slice(0, 4)),
      datasets: [{ label: "actual − fitted",
        data: d.model.linear.residuals,
        backgroundColor: d.model.linear.residuals.map(r =>
          Math.abs(r) > 2 * d.model.linear.resid_sd ? WARN : ACCENT) }],
    },
    options: {
      scales: { y: { ticks: { callback: v => fmt.money(v, d.unit) } } },
      plugins: { legend: { display: false } },
    },
  });
}

/* ---------- growth & outliers ---------- */

let growthIdx = [];
function renderGrowth() {
  const d = metricData(), y = d.yoy;
  const outlier = y.values.map((v, i) => v < y.fences[0] || v > y.fences[1] || Math.abs(y.z[i]) > 2);
  growthIdx = [];
  mk("growth", "growthChart", {
    type: "bar",
    data: {
      labels: y.years,
      datasets: [{ label: "YoY %", data: y.values,
        backgroundColor: y.values.map((v, i) => outlier[i] ? WARN : ACCENT) }],
    },
    options: {
      onClick: (e, els) => { if (els.length) showCasefile(els[0].index, outlier); },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      scales: { y: { title: { display: true, text: "YoY %" } } },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c =>
          ` ${c.parsed.y}%  z=${y.z[c.dataIndex]}${outlier[c.dataIndex] ? "  ⚠ outlier" : ""}` } } },
    },
  });
}

function showCasefile(i, outlier) {
  const d = metricData(), y = d.yoy;
  const pt = d.annual[i + 1];          // yoy[i] belongs to annual[i+1]
  const box = $("casefile");
  const flags = [];
  if (y.values[i] < y.fences[0] || y.values[i] > y.fences[1])
    flags.push(`outside IQR fence [${y.fences[0]}, ${y.fences[1]}]`);
  if (Math.abs(y.z[i]) > 2) flags.push(`|z|=${Math.abs(y.z[i])} > 2`);
  const filings = pt.filings.map(f =>
    `<li>${f.form} filed ${f.filed} — ${fmt.money(f.val, d.unit)} <span style="color:var(--muted)">(${f.accn})</span></li>`).join("");
  box.style.display = "block";
  box.innerHTML = `
    <h3>FY${y.years[i]} ${d.label} — ${fmt.money(pt.val, d.unit)} (${y.values[i]}% YoY)
      <span class="badge ${pt.restated ? "" : "ok"}">${pt.restated ? "RESTATED" : "clean"}</span></h3>
    ${flags.length ? "Flagged: " + flags.join("; ") + "." : "Within normal range."}
    Reported in ${pt.filings.length} filing${pt.filings.length > 1 ? "s" : ""}:
    <ul>${filings}</ul>`;
}

/* ---------- distribution: histogram + box plots ---------- */

function renderDist() {
  const d = metricData(), h = d.yoy_hist;
  const labels = h.edges.slice(0, -1).map((e, i) => `${e}…${h.edges[i + 1]}`);
  mk("hist", "histChart", {
    type: "bar",
    data: { labels, datasets: [{ label: "count", data: h.counts,
      backgroundColor: ACCENT, barPercentage: 1, categoryPercentage: 1 }] },
    options: { plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxRotation: 60, autoSkip: true } },
                y: { title: { display: true, text: "# years" } } } },
  });
  drawBoxplot();
}

function drawBoxplot() {
  // YoY growth spread per entity for the selected metric — same metric,
  // shared scale, so spreads are directly comparable.
  const rows = [];
  let lo = Infinity, hi = -Infinity;
  for (const [t, e] of Object.entries(DASH.entities)) {
    const m = e.metrics[state.metric];
    if (!m || !m.yoy.values.length) continue;
    const s = m.stats.yoy, f = m.yoy.fences;
    if (s.q1 == null || s.q3 == null) continue;
    rows.push({ t, q1: s.q1, q3: s.q3, med: s.median,
                min: Math.max(s.min, f[0]), max: Math.min(s.max, f[1]),
                outs: m.yoy.values.filter(v => v < f[0] || v > f[1]) });
    lo = Math.min(lo, s.min); hi = Math.max(hi, s.max);
  }
  if (!rows.length) { $("boxplot").innerHTML = ""; return; }
  const W = 560, H = 40 + rows.length * 42, pad = 48;
  const x = v => pad + (v - lo) / (hi - lo) * (W - pad - 12);
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%">`;
  svg += `<line x1="${x(lo)}" x2="${x(hi)}" y1="${H - 24}" y2="${H - 24}" stroke="#d1d5db"/>`;
  rows.forEach((r, i) => {
    const cy = 20 + i * 42;
    svg += `<text x="0" y="${cy + 4}" font-size="11" fill="#374151">${r.t}</text>`;
    svg += `<line x1="${x(r.min)}" x2="${x(r.max)}" y1="${cy}" y2="${cy}" stroke="${GRAY}"/>`;
    for (const e of [r.min, r.max])
      svg += `<line x1="${x(e)}" x2="${x(e)}" y1="${cy - 6}" y2="${cy + 6}" stroke="${GRAY}"/>`;
    svg += `<rect x="${x(r.q1)}" y="${cy - 9}" width="${x(r.q3) - x(r.q1)}" height="18"
            fill="${ACCENT}22" stroke="${ACCENT}"/>`;
    svg += `<line x1="${x(r.med)}" x2="${x(r.med)}" y1="${cy - 9}" y2="${cy + 9}"
            stroke="${ACCENT}" stroke-width="2"/>`;
    for (const o of r.outs)
      svg += `<circle cx="${x(o)}" cy="${cy}" r="3.5" fill="${WARN}"/>`;
  });
  svg += `<text x="${pad}" y="${H - 6}" font-size="10" fill="#6b7280">YoY growth % — whiskers at IQR fences, dots = outliers</text></svg>`;
  $("boxplot").innerHTML = svg;
}

/* ---------- scatter ---------- */

function renderScatter() {
  const d = DASH.entities[state.entity].metrics.rev_ni_scatter;
  if (!d) { $("scatterNotes").textContent = "no paired data"; return; }
  const xs = d.pairs.map(p => p.x);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const line = [{ x: x0, y: d.intercept + d.slope * x0 },
                { x: x1, y: d.intercept + d.slope * x1 }];
  mk("scatter", "scatterChart", {
    type: "scatter",
    data: { datasets: [
      { label: "FY (revenue, net income)", data: d.pairs,
        backgroundColor: ACCENT,
        pointRadius: 4 },
      { type: "line", label: `fit (R²=${d.r2})`, data: line,
        borderColor: GRAY, borderDash: [6, 4], pointRadius: 0, fill: false },
    ] },
    options: {
      scales: {
        x: { ticks: { callback: v => fmt.money(v, "USD") },
             title: { display: true, text: "revenue" } },
        y: { ticks: { callback: v => fmt.money(v, "USD") },
             title: { display: true, text: "net income" } },
      },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c =>
          `FY${c.raw.label}: rev ${fmt.money(c.raw.x, "USD")}, NI ${fmt.money(c.raw.y, "USD")}` } } },
    },
  });
  $("scatterNotes").textContent =
    `Each $1B of revenue associates with ${(d.slope * 1e9 / 1e6).toFixed(0)}M ` +
    `net income on average (marginal margin ${(d.slope * 100).toFixed(1)}%), R²=${d.r2}.`;
}

/* ---------- boot ---------- */

function renderAll() {
  renderControls();
  renderStats(); renderTrend(); renderResid();
  renderGrowth(); renderDist(); renderScatter();
}

$("logScale").onchange = renderTrend;
state.entity = Object.keys(DASH.entities)[0];
$("foot").textContent =
  `Data: SEC EDGAR companyfacts API · generated ${DASH.generated} · source: build.py`;
renderAll();
