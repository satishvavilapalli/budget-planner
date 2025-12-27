// src/TrendsTab.jsx
import React, { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";

const CHANNELS = [
  { key: "TV",            spend: "TV_spend",            impr: "TV_impression",            color: "#8B5CF6" },
  { key: "Meta Ads",      spend: "Meta_Ads_spend",      impr: "Meta_Ads_impression",      color: "#2DD4BF" },
  { key: "TikTok",        spend: "TikTok_spend",        impr: "TikTok_impression",        color: "#FBBF24" },
  { key: "Google Search", spend: "Google_Search_spend", impr: "Google_Search_impression", color: "#60A5FA" },
  { key: "YouTube",       spend: "YouTube_spend",       impr: "YouTube_impression",       color: "#FB7185" },
];

function safeDiv(a, b) {
  if (b === 0 || b === null || b === undefined) return null;
  const v = a / b;
  return Number.isFinite(v) ? v : null;
}
function mean(arr) {
  const xs = arr.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function avgLastN(arr, n) {
  const xs = arr.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  if (!xs.length) return null;
  return mean(xs.slice(Math.max(0, xs.length - n)));
}
function fmtCompact(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const abs = Math.abs(x);
  if (abs >= 1e12) return (x / 1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return (x / 1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return (x / 1e6).toFixed(2) + "M";
  if (abs >= 1e3)  return (x / 1e3).toFixed(1) + "K";
  return (Math.round(x * 100) / 100).toString();
}

function darkPlotLayout(title) {
  return {
    title: { text: title, font: { size: 14, color: "#E2E8F0" }, x: 0.02, y: 0.96 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#E2E8F0" },
    margin: { l: 56, r: 36, t: 44, b: 44 },
    xaxis: {
      type: "date",
      tickformat: "%b %Y",
      dtick: "M1",
      gridcolor: "rgba(51,65,85,.55)",
      zerolinecolor: "rgba(51,65,85,.75)",
      tickfont: { color: "#94A3B8" },
      linecolor: "rgba(255,255,255,.10)",
    },
    yaxis: {
      gridcolor: "rgba(51,65,85,.55)",
      zerolinecolor: "rgba(51,65,85,.75)",
      tickfont: { color: "#94A3B8" },
      linecolor: "rgba(255,255,255,.10)",
    },
    legend: { orientation: "h", x: 0.02, y: 1.14, font: { size: 11, color: "#94A3B8" } },
    hoverlabel: {
      bgcolor: "rgba(2,6,23,.95)",
      bordercolor: "rgba(255,255,255,.12)",
      font: { color: "#E2E8F0" },
    },
    dragmode: false,
  };
}

// localStorage keys
const STORAGE_KEYS = {
  STATE: "trends_ui_state_v1",
  ROWS: "trends_rows_v1",
};

export default function TrendsTab() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [mixView, setMixView] = useState("split");
  const [showImpr, setShowImpr] = useState(true);
  const [showECPM, setShowECPM] = useState(true);

  const saveStateToStorage = (partial) => {
    try {
      const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.STATE) || "{}");
      const merged = { ...existing, ...partial };
      window.localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(merged));
    } catch {
      // ignore
    }
  };

  const loadStateFromStorage = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.STATE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const loadRowsFromStorage = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.ROWS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const storedState = loadStateFromStorage();
    if (storedState) {
      if (storedState.startMonth) setStartMonth(storedState.startMonth);
      if (storedState.endMonth) setEndMonth(storedState.endMonth);
      if (storedState.mixView) setMixView(storedState.mixView);
      if (typeof storedState.showImpr === "boolean") setShowImpr(storedState.showImpr);
      if (typeof storedState.showECPM === "boolean") setShowECPM(storedState.showECPM);
    }

    const storedRows = loadRowsFromStorage();
    if (storedRows && Array.isArray(storedRows) && storedRows.length) {
      setRows(storedRows);
      setLoading(false);
    }

    let cancelled = false;

    async function run() {
      try {
        setErr("");
        const res = await fetch("http://127.0.0.1:5000/api/trends");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = Array.isArray(json?.rows) ? json.rows : [];
        if (cancelled) return;

        setRows(data);
        window.localStorage.setItem(STORAGE_KEYS.ROWS, JSON.stringify(data));

        if (!storedState || (!storedState.startMonth && !storedState.endMonth)) {
          const months = [...new Set(data.map((r) => r.month).filter(Boolean))].sort();
          const start = months[0] || "";
          const end = months[months.length - 1] || "";
          setStartMonth(start);
          setEndMonth(end);
          saveStateToStorage({ startMonth: start, endMonth: end });
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load /api/trends");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveStateToStorage({ startMonth, endMonth, mixView, showImpr, showECPM });
  }, [startMonth, endMonth, mixView, showImpr, showECPM]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (startMonth ? r.month >= startMonth : true))
        .filter((r) => (endMonth ? r.month <= endMonth : true))
        .sort((a, b) => (a.month > b.month ? 1 : -1)),
    [rows, startMonth, endMonth]
  );

  const series = useMemo(() => {
    const x = filtered.map((r) => `${r.month}-01`);
    const conversions = filtered.map((r) => Number(r.conversions ?? 0));
    const revenue = filtered.map((r) => Number(r.revenue ?? 0));
    const rpc = filtered.map((r) =>
      r.revenue_per_conversion == null ? null : Number(r.revenue_per_conversion)
    );
    const totalSpend = filtered.map((r) => Number(r.total_spend ?? 0));
    const cpa = filtered.map((r) => safeDiv(Number(r.total_spend ?? 0), Number(r.conversions ?? 0)));
    const digitalPct = filtered.map((r) =>
      safeDiv(Number(r.digital_spend ?? 0), Number(r.total_spend ?? 0))
    );
    return { x, conversions, revenue, rpc, totalSpend, cpa, digitalPct };
  }, [filtered]);

  const plotConfig = useMemo(
    () => ({
      displayModeBar: true,
      responsive: true,
      scrollZoom: false,
    }),
    []
  );

  const performanceData = useMemo(
    () => [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "Conversions",
        x: series.x,
        y: series.conversions,
        line: { color: "#8B5CF6", width: 3 },
        marker: { size: 7, color: "#8B5CF6" },
        hovertemplate:
          "<b>%{x|%b %Y}</b><br>Conversions: <b>%{y:.3g}</b><extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Revenue",
        x: series.x,
        y: series.revenue,
        yaxis: "y2",
        line: { color: "#2DD4BF", width: 3 },
        hovertemplate:
          "<b>%{x|%b %Y}</b><br>Revenue: <b>%{y:.3g}</b><extra></extra>",
      },
    ],
    [series]
  );

  const performanceLayout = useMemo(() => {
    const l = darkPlotLayout("Performance — National");
    l.yaxis.title = { text: "Conversions", font: { size: 11, color: "#94A3B8" } };
    l.yaxis2 = {
      overlaying: "y",
      side: "right",
      gridcolor: "rgba(0,0,0,0)",
      tickfont: { color: "#94A3B8" },
      title: { text: "Revenue", font: { size: 11, color: "#94A3B8" } },
    };
    return l;
  }, []);

  const totalSpendData = useMemo(
    () => [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "Total spend",
        x: series.x,
        y: series.totalSpend,
        line: { color: "rgba(226,232,240,.95)", width: 3 },
        marker: { size: 7, color: "rgba(226,232,240,.95)" },
        hovertemplate:
          "<b>%{x|%b %Y}</b><br>Total spend: <b>%{y:.3g}</b><extra></extra>",
      },
    ],
    [series]
  );

  const totalSpendLayout = useMemo(() => {
    const l = darkPlotLayout("Total spend (monthly)");
    l.yaxis.title = { text: "Spend", font: { size: 11, color: "#94A3B8" } };
    return l;
  }, []);

  const mixBars = useMemo(() => {
    const x = series.x;

    if (mixView === "split") {
      return [
        {
          type: "bar",
          name: "Digital",
          x,
          y: filtered.map((r) => Number(r.digital_spend ?? 0)),
          marker: { color: "rgba(45,212,191,.85)" },
          hovertemplate:
            "<b>%{x|%b %Y}</b><br>Digital spend: <b>%{y:.3g}</b><extra></extra>",
        },
        {
          type: "bar",
          name: "Traditional",
          x,
          y: filtered.map((r) => Number(r.traditional_spend ?? 0)),
          marker: { color: "rgba(139,92,246,.85)" },
          hovertemplate:
            "<b>%{x|%b %Y}</b><br>Traditional spend: <b>%{y:.3g}</b><extra></extra>",
        },
      ];
    }

    const totals = CHANNELS.map((ch) => ({
      ch,
      total: filtered.reduce((s, r) => s + Number(r[ch.spend] ?? 0), 0),
    })).sort((a, b) => b.total - a.total);

    const top = totals.slice(0, 3).map((o) => o.ch);

    const traces = top.map((ch) => ({
      type: "bar",
      name: ch.key,
      x,
      y: filtered.map((r) => Number(r[ch.spend] ?? 0)),
      marker: { color: ch.color },
      hovertemplate: `<b>%{x|%b %Y}</b><br>${ch.key} spend: <b>%{y:.3g}</b><extra></extra>`,
    }));

    traces.push({
      type: "bar",
      name: "Other",
      x,
      y: filtered.map((r) => {
        const all = CHANNELS.reduce((s, ch2) => s + Number(r[ch2.spend] ?? 0), 0);
        const topSum = top.reduce((s, ch2) => s + Number(r[ch2.spend] ?? 0), 0);
        return Math.max(0, all - topSum);
      }),
      marker: { color: "rgba(226,232,240,.20)" },
      hovertemplate:
        "<b>%{x|%b %Y}</b><br>Other spend: <b>%{y:.3g}</b><extra></extra>",
    });

    return traces;
  }, [filtered, mixView, series.x]);

  const mixLayout = useMemo(() => {
    const l = darkPlotLayout("Spend mix (monthly) — simple bars");
    l.barmode = "group";
    l.yaxis.title = { text: "Spend", font: { size: 11, color: "#94A3B8" } };
    return l;
  }, []);

  const impressionsData = useMemo(() => {
    const x = series.x;
    const traces = CHANNELS.map((ch) => ({
      type: "scatter",
      mode: "lines+markers",
      name: ch.key,
      x,
      y: filtered.map((r) => Number(r[ch.impr] ?? 0)),
      line: { color: ch.color, width: 2 },
      marker: { size: 5, color: ch.color },
      hovertemplate: `<b>%{x|%b %Y}</b><br>${ch.key} impressions: %{y:.3g}<extra></extra>`,
    }));

    if (filtered.some((r) => r.Organic_TV_impression != null)) {
      traces.push({
        type: "scatter",
        mode: "lines",
        name: "Organic TV",
        x,
        y: filtered.map((r) => Number(r.Organic_TV_impression ?? 0)),
        line: { color: "rgba(226,232,240,.55)", width: 2, dash: "dot" },
        hovertemplate:
          "<b>%{x|%b %Y}</b><br>Organic TV impressions: %{y:.3g}<extra></extra>",
      });
    }

    return traces;
  }, [filtered, series.x]);

  const impressionsLayout = useMemo(() => {
    const l = darkPlotLayout("Impressions by channel (monthly)");
    l.yaxis.title = { text: "Impressions", font: { size: 11, color: "#94A3B8" } };
    return l;
  }, []);

  const ecpmData = useMemo(
    () =>
      CHANNELS.map((ch) => {
        const x = series.x;
        const y = filtered.map((r) => {
          const imp = Number(r[ch.impr] ?? 0);
          const sp = Number(r[ch.spend] ?? 0);
          return imp > 0 ? 1000 * (sp / imp) : null;
        });
        return {
          type: "scatter",
          mode: "lines+markers",
          name: ch.key,
          x,
          y,
          line: { color: ch.color, width: 2 },
          marker: { size: 5, color: ch.color },
          hovertemplate: `<b>%{x|%b %Y}</b><br>${ch.key} eCPM proxy: %{y:.3g}<extra></extra>`,
        };
      }),
    [filtered, series.x]
  );

  const ecpmLayout = useMemo(() => {
    const l = darkPlotLayout("eCPM proxy (monthly)");
    l.yaxis.title = { text: "eCPM proxy", font: { size: 11, color: "#94A3B8" } };
    return l;
  }, []);

  if (loading && !rows.length) {
    return (
      <div className="p-6 text-slate-200">
        <div className="text-sm">Loading Trends…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6 text-slate-200">
        <div className="text-sm text-rose-200">Failed to load Trends: {err}</div>
        <div className="text-xs text-slate-400 mt-2">
          Ensure Flask is running on{" "}
          <code className="text-slate-200">127.0.0.1:5000</code> and CORS allows your React origin.
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute -top-40 -left-40 h-[620px] w-[620px] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute -top-40 -right-20 h-[520px] w-[520px] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -bottom-56 left-1/3 h-[700px] w-[700px] rounded-full bg-rose-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-[1400px] px-0 sm:px-2 lg:px-4 py-1 sm:py-2">
        <div className="flex flex-col gap-2 mb-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Trends (Monthly, National)
          </h1>
          <p className="text-sm text-slate-300 max-w-4xl">
            Geo filter removed. All plots show the{" "}
            <span className="font-medium text-slate-200">national aggregate</span> across all geos.
            All visuals are <span className="font-medium text-slate-200">monthly</span>.
          </p>
        </div>

        <div className="sticky top-0 z-20 mb-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] p-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <label className="block text-[11px] tracking-wide text-slate-300 mb-2">
                  Start month
                </label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <label className="block text-[11px] tracking-wide text-slate-300 mb-2">
                  End month
                </label>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <label className="block text-[11px] tracking-wide text-slate-300 mb-2">
                  Mix view
                </label>
                <select
                  value={mixView}
                  onChange={(e) => setMixView(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="split">Digital vs Traditional</option>
                  <option value="top3">Top 3 channels + Other</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showImpr}
                  onChange={(e) => setShowImpr(e.target.checked)}
                  className="accent-violet-500"
                />
                Show impressions
              </label>
              <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showECPM}
                  onChange={(e) => setShowECPM(e.target.checked)}
                  className="accent-violet-500"
                />
                Show eCPM proxy
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_10px_30px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border:white/10 border-white/10">
              <div>
                <div className="text-sm font-medium">Performance (monthly)</div>
                <div className="text-xs text-slate-300">
                  Conversions + revenue (dual axis)
                </div>
              </div>
              <div className="text-[11px] text-slate-300 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5">
                Hover · Use toolbar to zoom
              </div>
            </div>
            <div className="p-4">
              <div className="h-[420px]">
                <Plot
                  data={performanceData}
                  layout={performanceLayout}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          </div>

          <div className="col-span-12 rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_10px_30px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <div className="text-sm font-medium">Spend (monthly)</div>
                <div className="text-xs text-slate-300">
                  Total spend trend + simple mix (bars)
                </div>
              </div>
              <div className="text-[11px] text-slate-300 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5">
                Simple
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="h-[340px]">
                <Plot
                  data={totalSpendData}
                  layout={totalSpendLayout}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
              <div className="h-[280px]">
                <Plot
                  data={mixBars}
                  layout={mixLayout}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          </div>

          {showImpr && (
            <div className="col-span-12 lg:col-span-6 rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_10px_30px_rgba(0,0,0,0.35)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div>
                  <div className="text-sm font-medium">Impressions (monthly)</div>
                  <div className="text-xs text-slate-300">Channel volume trend</div>
                </div>
                <div className="text-[11px] text-slate-300 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5">
                  Legend to isolate
                </div>
              </div>
              <div className="p-4">
                <div className="h-[280px]">
                  <Plot
                    data={impressionsData}
                    layout={impressionsLayout}
                    config={plotConfig}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            </div>
          )}

          {showECPM && (
            <div className="col-span-12 lg:col-span-6 rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_10px_30px_rgba(0,0,0,0.35)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div>
                  <div className="text-sm font-medium">eCPM proxy (monthly)</div>
                  <div className="text-xs text-slate-300">1000 × spend / impressions</div>
                </div>
                <div className="text-[11px] text-amber-200 rounded-full border border-amber-200/20 bg-amber-500/10 px-3 py-1.5">
                  Proxy
                </div>
              </div>
              <div className="p-4">
                <div className="h-[280px]">
                  <Plot
                    data={ecpmData}
                    layout={ecpmLayout}
                    config={plotConfig}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {!filtered.length && (
          <div className="mt-4 text-sm text-slate-300">No data in selected range.</div>
        )}
      </div>
    </div>
  );
}
