// src/ScenarioTab.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";

const ScenarioTab = () => {
  const [baseBudget, setBaseBudget] = useState(0);
  const [tempBudget, setTempBudget] = useState(0);
  const [historicalBudget, setHistoricalBudget] = useState(0);
  const [growthPct, setGrowthPct] = useState(0);
  const [optimizationData, setOptimizationData] = useState([]);
  const [loading, setLoading] = useState(true);

  const runOptimizer = useCallback(async (budget) => {
    if (budget <= 0) return;

    setLoading(true);
    try {
      // const response = await fetch("http://127.0.0.1:5000/api/optimize", {   -- revert back
      const response = await fetch(`${API_BASE_URL}/api/optimize`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetBudget: budget }),
      });
      const data = await response.json();
      setOptimizationData(data.channels || []);
    } catch (e) {
      console.error("Optimization error:", e);
      setOptimizationData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // fetch("http://127.0.0.1:5000/api/config")    - revert it back
    fetch(`${API_BASE_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => {
        const initialBudget = data.baseBudget || 428710000;
        setBaseBudget(initialBudget);
        setTempBudget(initialBudget);
        setHistoricalBudget(initialBudget);
        runOptimizer(initialBudget);
      })
      .catch(() => {
        const fallback = 428710000;
        setBaseBudget(fallback);
        setTempBudget(fallback);
        setHistoricalBudget(fallback);
        runOptimizer(fallback);
      });
  }, [runOptimizer]);

  useEffect(() => {
    if (baseBudget > 0) {
      const targetTotal = Number(baseBudget) * (1 + growthPct);
      runOptimizer(targetTotal);
    }
  }, [growthPct, baseBudget, runOptimizer]);

  // Helper: show millions with "M"
  const formatMillions = (num) => {
    if (num == null) return "—";
    const millions = num / 1_000_000;
    return `${millions.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}M`;
  };

  // Helper: normal currency (still used for per-channel rows)
  const formatCurrency = (num) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(num || 0);

  const optimizedSpend = useMemo(
    () => optimizationData.reduce((sum, ch) => sum + (ch.spend || 0), 0),
    [optimizationData]
  );

  const optimizedRevenue = useMemo(
    () => optimizationData.reduce((sum, ch) => sum + (ch.revenue || 0), 0),
    [optimizationData]
  );

  const avgROI = useMemo(
    () => (optimizedSpend > 0 ? (optimizedRevenue / optimizedSpend).toFixed(2) : "0.00"),
    [optimizedRevenue, optimizedSpend]
  );

  const handleBudgetSubmit = () => {
    if (tempBudget > 0 && tempBudget !== baseBudget) {
      setBaseBudget(tempBudget);
      runOptimizer(tempBudget);
    }
  };

  const handleResetHistorical = () => {
    setTempBudget(historicalBudget);
    setBaseBudget(historicalBudget);
    setGrowthPct(0);
    runOptimizer(historicalBudget);
  };

  const ScenarioButton = ({ pct, label }) => {
    const isActive = growthPct === pct;
    const projectedBudget = Number(baseBudget) * (1 + pct);
    return (
      <div
        className={`p-3 rounded-lg border-2 cursor-pointer flex justify-between items-center transition-all text-sm ${
          isActive
            ? "border-indigo-400 bg-slate-800 shadow-lg"
            : "border-slate-700 bg-slate-900 hover:border-indigo-400 hover:bg-slate-800"
        }`}
        onClick={() => setGrowthPct(pct)}
      >
        <div>
          <div
            className={`font-semibold ${
              isActive ? "text-indigo-200" : "text-slate-100"
            }`}
          >
            {label}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {formatMillions(projectedBudget)}
          </div>
        </div>
        {isActive && <div className="text-indigo-300 font-bold">✓</div>}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-[80vh]">
      {/* LEFT: Controls */}
      <div className="xl:col-span-1 space-y-4">
        {/* 1. Base Budget + RESET BUTTON */}
        <div className="bg-slate-900 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center">
            <span className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded mr-2 font-bold text-[10px]">
              1
            </span>
            Base Budget
          </h3>
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">
              $
            </span>
            <input
              type="number"
              className="w-full pl-8 pr-3 py-2 border border-slate-700 rounded-lg font-semibold text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/60 bg-slate-950 text-slate-100"
              value={tempBudget}
              onChange={(e) => setTempBudget(Number(e.target.value))}
              placeholder="Enter budget"
            />
          </div>

          <div className="space-y-2 mb-2">
            <button
              onClick={handleBudgetSubmit}
              disabled={tempBudget <= 0 || tempBudget === baseBudget}
              className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-all duration-200 shadow-sm disabled:bg-slate-700 disabled:cursor-not-allowed text-sm"
            >
              Submit Budget
            </button>

            <button
              onClick={handleResetHistorical}
              disabled={baseBudget === historicalBudget && growthPct === 0}
              className="w-full py-2 px-4 bg-slate-700 text-slate-100 font-semibold rounded-lg hover:bg-slate-600 transition-all duration-200 shadow-sm disabled:bg-slate-800 disabled:cursor-not-allowed text-sm text-center"
            >
              🔄 Reset to Historical ({formatMillions(historicalBudget)})
            </button>
          </div>

          <div className="text-xs text-slate-400 mt-2 text-center space-y-1">
            <div>Active: {formatMillions(baseBudget)}</div>
            <div className="text-slate-500">
              Historical: {formatMillions(historicalBudget)}
            </div>
          </div>
        </div>

        {/* 2. Growth Scenarios */}
        <div className="bg-slate-900 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-4 border border-white/10 flex-1 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center">
            <span className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded mr-2 font-bold text-[10px]">
              2
            </span>
            Growth Scenario
          </h3>
          <div className="space-y-2 flex-1">
            <ScenarioButton pct={0} label="Optimize Base" />
            <ScenarioButton pct={0.1} label="+10% Growth" />
            <ScenarioButton pct={0.2} label="+20% Growth" />
            <ScenarioButton pct={0.3} label="+30% Growth" />
            <ScenarioButton pct={0.5} label="+50% Aggressive" />
          </div>
        </div>
      </div>

      {/* RIGHT: Results + Table */}
      <div className="xl:col-span-3 space-y-6 relative">
        {/* KPI Cards – in millions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Optimized Revenue – emerald */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] text-center border border-emerald-300/40">
            <div className="text-emerald-100 text-xs font-semibold uppercase tracking-wide">
              Optimized Revenue
            </div>
            <div className="text-3xl font-bold mt-2">
              {formatMillions(optimizedRevenue)}
            </div>
          </div>

          {/* Projected ROI – purple */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] text-center border border-purple-300/40">
            <div className="text-purple-100 text-xs font-semibold uppercase tracking-wide">
              Projected ROI
            </div>
            <div className="text-3xl font-bold mt-2">{avgROI}x</div>
          </div>

          {/* Total Spend Target – indigo */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)] border border-indigo-300/40 text-center">
            <div className="text-indigo-100 text-xs font-semibold uppercase tracking-wide">
              Total Spend Target
            </div>
            <div className="text-3xl font-bold text-white mt-2">
              {formatMillions(optimizedSpend)}
            </div>
            <div className="text-xs text-emerald-100 mt-1">
              +{Math.round(growthPct * 100)}% vs Base
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center z-10 rounded-2xl">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
              <span className="text-sm font-medium text-slate-100">
                Running Meridian Optimizer...
              </span>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-900 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden border border-white/10 h-96 flex flex-col relative">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white border-b border-slate-800">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base">Recommended Allocation</h3>
              <div className="text-right">
                <div className="text-xs opacity-90">Total Spend Target</div>
                <div className="text-lg font-bold">
                  {formatMillions(optimizedSpend)}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/80 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-300 uppercase tracking-wider">
                    Channel
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300 uppercase tracking-wider">
                    Optimized Spend
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300 uppercase tracking-wider">
                    ROI
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300 uppercase tracking-wider">
                    Incremental Revenue
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300 uppercase tracking-wider">
                    Rev Share
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300 uppercase tracking-wider">
                    Spend Share
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {optimizationData.length > 0 ? (
                  optimizationData
                    .sort((a, b) => (b.roi || 0) - (a.roi || 0))
                    .map((row, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-800/70 transition-colors"
                      >
                        <td className="px-6 py-3 font-medium text-slate-100 flex items-center">
                          <div
                            className="w-3 h-3 rounded-full mr-3"
                            style={{ backgroundColor: row.color || "#6b7280" }}
                          ></div>
                          {row.channel}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-100">
                          {formatCurrency(row.spend || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-300">
                          {(row.roi || 0)}x
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-100">
                          {formatCurrency(row.revenue || 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {row.revShare || 0}%
                        </td>
                        <td className="px-4 py-3 text-right text-slate-200 font-semibold">
                          {row.spendShare || 0}%
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-6 py-10 text-center text-slate-400"
                    >
                      {loading ? "Running optimizer..." : "No optimization data"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Footer button removed */}
        </div>
      </div>
    </div>
  );
};

export default ScenarioTab;
