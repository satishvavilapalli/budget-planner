// src/OverviewTab.jsx
import API_BASE_URL from "./apiConfig";
import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
  Cell,
} from "recharts";

// Format numbers in millions
const formatMillions = (num) => {
  if (num == null) return "—";
  const millions = num / 1_000_000;
  return (
    millions.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "M"
  );
};

// color palette for contribution bar
const CONTRIBUTION_COLORS = {
  BASELINE: "#F9AB00", // gold
  TV: "#8B5CF6", // purple
  META: "#1877F2", // Meta blue
  TIKTOK: "#14B8A6", // teal
  GSEARCH: "#4285F4", // Google blue
  YOUTUBE: "#FF0000", // red
  PROMO: "#F97316", // orange
  ORGTV: "#22C55E", // green
};

// Keys for localStorage
const STORAGE_KEYS = {
  RANGE: "overview_range_v1",
  OVERVIEW: "overview_data_v1",
  AGG: "overview_agg_contrib_v1",
};

const OverviewTab = ({ selectedMonth }) => {
  const [channelPerformance, setChannelPerformance] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Persisted cache of last result (not just full‑period)
  const [aggContrib, setAggContrib] = useState([]);
  const [contribLoading, setContribLoading] = useState(true);

  // ---- helper: persist & restore ----
  const saveToStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  };

  const loadFromStorage = (key, fallback) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  // ---- data fetchers ----

  const fetchOverview = async (params = {}) => {
    setLoading(true);
    try {
      // let url = "http://127.0.0.1:5000/api/overview";   keep this.
      let url = `${API_BASE_URL}/api/overview`;   
      const query = new URLSearchParams();
      if (params.start) query.append("start", params.start);
      if (params.end) query.append("end", params.end);
      const qs = query.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      setChannelPerformance(data.channelPerformance || []);
      setKpis(data.kpis || {});

      // persist latest overview result (for any range)
      saveToStorage(STORAGE_KEYS.OVERVIEW, {
        channelPerformance: data.channelPerformance || [],
        kpis: data.kpis || {},
      });
    } catch (e) {
      console.error("❌ OVERVIEW ERROR:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAggregatedExpected = async (params = {}) => {
    setContribLoading(true);
    try {
      // const res = await fetch("http://127.0.0.1:5000/api/expected");
      const res = await fetch(`${API_BASE_URL}/api/expected`);  
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = data.last6months || [];

      let filtered = rows;
      if (params.start) {
        filtered = filtered.filter((r) => r.week >= params.start);
      }
      if (params.end) {
        filtered = filtered.filter((r) => r.week <= params.end);
      }

      const agg = {
        baseline: 0,
        TV: 0,
        Meta_Ads: 0,
        TikTok: 0,
        Google_Search: 0,
        YouTube: 0,
        Promo: 0,
        Organic_TV: 0,
      };

      filtered.forEach((r) => {
        agg.baseline += r.baseline || 0;
        agg.TV += r.TV || 0;
        agg.Meta_Ads += r.Meta_Ads || 0;
        agg.TikTok += r.TikTok || 0;
        agg.Google_Search += r.Google_Search || 0;
        agg.YouTube += r.YouTube || 0;
        agg.Promo += r.Promo || 0;
        agg.Organic_TV += r.Organic_TV || 0;
      });

      const items = [
        { id: "BASELINE", label: "Baseline", value: agg.baseline },
        { id: "TV", label: "TV", value: agg.TV },
        { id: "META", label: "Meta Ads", value: agg.Meta_Ads },
        { id: "TIKTOK", label: "TikTok", value: agg.TikTok },
        { id: "GSEARCH", label: "Google Search", value: agg.Google_Search },
        { id: "YOUTUBE", label: "YouTube", value: agg.YouTube },
        { id: "PROMO", label: "Promo", value: agg.Promo },
        { id: "ORGTV", label: "Organic TV", value: agg.Organic_TV },
      ].filter((d) => d.value !== 0);

      const total = items.reduce((s, d) => s + d.value, 0);
      const withPct = items.map((d) => {
        const pct = total > 0 ? d.value / total : 0;
        const pctText = (pct * 100).toFixed(1);
        const valMillions = d.value / 1_000_000;
        const valLabel =
          valMillions >= 1
            ? `${valMillions.toFixed(0)}M`
            : d.value.toLocaleString("en-US");
        return {
          ...d,
          pct,
          pctLabel: pctText,
          outcomeText: `${pctText}% (${valLabel})`,
        };
      });

      withPct.sort((a, b) => b.pct - a.pct);
      setAggContrib(withPct);

      // persist latest agg contribution for any range
      saveToStorage(STORAGE_KEYS.AGG, withPct);
    } catch (e) {
      console.error("❌ AGG EXPECTED ERROR:", e);
      setAggContrib([]);
    } finally {
      setContribLoading(false);
    }
  };

  // ---- initial mount: restore last state, then refetch if needed ----
  useEffect(() => {
    // restore date range
    const storedRange = loadFromStorage(STORAGE_KEYS.RANGE, null);
    if (storedRange) {
      setStartDate(storedRange.start || "");
      setEndDate(storedRange.end || "");
    }

    // restore overview data
    const storedOverview = loadFromStorage(STORAGE_KEYS.OVERVIEW, null);
    if (storedOverview) {
      setChannelPerformance(storedOverview.channelPerformance || []);
      setKpis(storedOverview.kpis || {});
      setLoading(false);
    }

    // restore agg contrib
    const storedAgg = loadFromStorage(STORAGE_KEYS.AGG, null);
    if (storedAgg) {
      setAggContrib(storedAgg);
      setContribLoading(false);
    }

    // Always refetch in background with current range to stay fresh
    const params = {
      start: storedRange?.start || undefined,
      end: storedRange?.end || undefined,
    };
    fetchOverview(params);
    fetchAggregatedExpected(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- user applies date range ----
  const handleApplyDateRange = (e) => {
    e.preventDefault();
    const params = {
      start: startDate || undefined,
      end: endDate || undefined,
    };

    if (!startDate && !endDate) {
      // reset to full period
      saveToStorage(STORAGE_KEYS.RANGE, { start: "", end: "" });
      fetchOverview({});
      fetchAggregatedExpected({});
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      alert("End date must be on or after start date.");
      return;
    }

    // persist chosen range
    saveToStorage(STORAGE_KEYS.RANGE, {
      start: params.start || "",
      end: params.end || "",
    });

    fetchOverview(params);
    fetchAggregatedExpected(params);
  };

  const totalSpend = kpis.totalSpend || 0;
  const totalRevenue = kpis.totalRevenue || 0;
  const overallROI = kpis.overallROI || 0;
  const totalConversions = kpis.totalConversions || 0;

  const cumulativeData = useMemo(() => {
    if (!aggContrib.length) return [];
    let running = 0;
    return aggContrib.map((item) => {
      const start = running;
      const end = running + item.pct;
      running = end;
      return {
        name: item.label,
        id: item.id,
        start,
        width: item.pct,
        end,
        pctLabel: item.pctLabel,
        outcomeText: item.outcomeText,
      };
    });
  }, [aggContrib]);

  if (loading && !channelPerformance.length) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900 rounded-2xl border border-white/10">
        <div className="text-sm text-slate-300">
          Loading Meridian model results...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <div className="flex items-center">
          <div className="text-indigo-300 mr-3 text-xl">📊</div>
          <div>
            <div className="font-semibold text-slate-50">
              Powered by Google Meridian MMM
            </div>
            <div className="text-xs text-slate-300">
              Showing period:{" "}
              <span className="font-medium text-slate-100">
                {startDate || endDate
                  ? `${startDate || "Start"} → ${endDate || "End"}`
                  : selectedMonth}
              </span>{" "}
              | Model-based attribution with adstock &amp; saturation
            </div>
          </div>
        </div>
        <div className="text-[11px] text-emerald-200 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-400/40">
          Model trained
        </div>
      </div>

      {/* Date range filter */}
      <form
        onSubmit={handleApplyDateRange}
        className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex items-center justify-center gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-end gap-3">
          <div className="w-36">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white shadow-md shadow-indigo-500/30"
          >
            Apply date range
          </button>
        </div>
      </form>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] border border-indigo-300/40">
          <div className="text-[11px] text-indigo-100 mb-1 uppercase tracking-wide">
            Total Marketing Spend
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {formatMillions(totalSpend)}
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] border border-emerald-300/40">
          <div className="text-[11px] text-emerald-100 mb-1 uppercase tracking-wide">
            Total Revenue
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {formatMillions(totalRevenue)}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-700 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] border border-purple-300/40">
          <div className="text-[11px] text-purple-100 mb-1 uppercase tracking-wide">
            Overall ROI
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {overallROI.toFixed(2)}x
          </div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-cyan-700 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] border border-cyan-300/40">
          <div className="text-[11px] text-cyan-100 mb-1 uppercase tracking-wide">
            Total Conversions
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {formatMillions(totalConversions)}
          </div>
        </div>
      </div>

      {/* Channel Performance Table */}
      <div className="bg-slate-900 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden border border-white/10">
        <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800">
          <h3 className="text-base font-semibold text-slate-50 mb-1">
            Channel Performance Breakdown
          </h3>
          <p className="text-xs text-slate-400">
            Historical actuals from Meridian MMM attribution model
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-slate-300 uppercase tracking-wider">
                  Channel
                </th>
                <th className="px-6 py-3 text-right font-semibold text-slate-300 uppercase tracking-wider">
                  Spend
                </th>
                <th className="px-6 py-3 text-right font-semibold text-slate-300 uppercase tracking-wider">
                  Inc Rev
                </th>
                <th className="px-6 py-3 text-right font-semibold text-slate-300 uppercase tracking-wider">
                  ROI
                </th>
                <th className="px-6 py-3 text-right font-semibold text-slate-300 uppercase tracking-wider">
                  Conversions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {channelPerformance
                .slice()
                .sort((a, b) => b.roi - a.roi)
                .map((channel, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-800/70 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center">
                        <div
                          className="w-3 h-3 rounded-full mr-3 shadow-sm"
                          style={{ backgroundColor: channel.color }}
                        />
                        <span className="font-medium text-slate-50">
                          {channel.channel}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-slate-100 font-mono">
                        {formatMillions(channel.spend)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-slate-100 font-mono">
                        {formatMillions(channel.revenue)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={
                          channel.roi >= 3.5
                            ? "text-emerald-300 font-bold"
                            : channel.roi >= 2.5
                            ? "text-amber-300 font-bold"
                            : "text-rose-300 font-bold"
                        }
                      >
                        {channel.roi}x
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-slate-100 font-mono">
                        {formatMillions(channel.conversions)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cumulative contribution chart */}
      <div className="bg-slate-900 rounded-2xl border border-white/10 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-50">
            Contribution by baseline and marketing channels
          </h3>
          <span className="text-[11px] text-slate-400">
            Aggregated over selected period
          </span>
        </div>

        {/* Legend-style labels */}
        <div className="flex flex-wrap gap-3 mb-3">
          {aggContrib.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1 text-[11px] text-slate-300"
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor:
                    CONTRIBUTION_COLORS[item.id] || "#4B5563",
                }}
              />
              <span>{item.label}</span>
              <span className="text-slate-500">{item.pctLabel}%</span>
            </div>
          ))}
        </div>

        <div className="h-72">
          {contribLoading ? (
            <div className="flex items-center justify-center h-full text-xs text-slate-400">
              Loading contributions...
            </div>
          ) : !cumulativeData.length ? (
            <div className="flex items-center justify-center h-full text-xs text-slate-400">
              No data for selected range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cumulativeData}
                layout="vertical"
                margin={{ top: 10, right: 80, left: 80, bottom: 10 }}
              >
                <CartesianGrid horizontal={false} stroke="#1f2937" />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10, fill: "#cbd5f5" }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#cbd5f5" }}
                />

                <Bar
                  dataKey="width"
                  stackId="contrib"
                  radius={[4, 4, 4, 4]}
                  isAnimationActive={false}
                  activeBar={false}
                >
                  <LabelList
                    dataKey="outcomeText"
                    position="right"
                    offset={6}
                    formatter={(val) => val}
                    style={{
                      fill: "#e5e7eb",
                      fontSize: 11,
                    }}
                  />
                  {cumulativeData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        CONTRIBUTION_COLORS[entry.id] || "#4B5563"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
