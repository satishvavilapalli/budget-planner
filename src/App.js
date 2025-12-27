// src/App.js
import React, { useState, useEffect } from "react";
import OverviewTab from "./OverviewTab";
import ScenarioTab from "./ScenarioTab";
import TrendsTab from "./TrendsTab";

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load config once (used by Scenario + header)
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const configRes = await fetch("http://127.0.0.1:5000/api/config");
        const configData = await configRes.json();
        setConfig(configData);
      } catch (error) {
        console.error("🚨 Initial load error:", error);
        setConfig({ baseBudget: 428710000 });
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  if (loading && !config) {
    return (
      <div className="bg-slate-950 flex items-center justify-center">
        <div className="text-center text-sm text-slate-400">
          <div className="font-semibold mb-2 text-slate-100">
            Loading Optimized Spend Allocation…
          </div>
          <div>
            Powered by Google Meridian • Base Budget:{" "}
            {config?.baseBudget?.toLocaleString() || "Loading..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    // NOTE: no min-h-screen here, so height = content height
    <div className="bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-white/10">
        <div className="w-full px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-50">
              MMM Decision Dashboard
            </h1>
            <p className="text-xs text-slate-400">
              Portfolio overview, scenario planning, and trends for marketing
              investments
            </p>
          </div>
          <div className="text-xs text-right text-slate-400">
            Powered by Google Meridian MMM
            <br />
            Base Budget:{" "}
            {config?.baseBudget ? config.baseBudget.toLocaleString() : "N/A"}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-white/10 bg-slate-900">
          <div className="w-full px-4">
            <nav className="flex gap-4 text-sm overflow-x-auto">
              <button
                onClick={() => setActiveTab("overview")}
                className={`py-3 border-b-2 -mb-px ${
                  activeTab === "overview"
                    ? "border-indigo-400 text-indigo-200 font-medium"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                Overview
              </button>

              <button
                onClick={() => setActiveTab("scenario")}
                className={`py-3 border-b-2 -mb-px ${
                  activeTab === "scenario"
                    ? "border-indigo-400 text-indigo-200 font-medium"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                Scenario Planning
              </button>

              <button
                onClick={() => setActiveTab("trends")}
                className={`py-3 border-b-2 -mb-px ${
                  activeTab === "trends"
                    ? "border-indigo-400 text-indigo-200 font-medium"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                Trends
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content (no flex-1; height is just content) */}
      <main className="w-full px-4 py-6">
        {activeTab === "overview" && <OverviewTab />}

        <div style={{ display: activeTab === "scenario" ? "block" : "none" }}>
          <ScenarioTab config={config} />
        </div>

        {activeTab === "trends" && <TrendsTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-900/90">
        <div className="w-full px-4 py-3 text-xs text-slate-400 flex items-center justify-between overflow-x-auto">
          <span>Internal • Commercial Effectiveness Team</span>
          <span>
            Backend: Flask @ 127.0.0.1:5000 • Model: Google Meridian MMM
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
