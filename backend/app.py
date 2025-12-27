import os
import pickle
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from meridian.analysis import optimizer, analyzer
from meridian import constants as c

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

print("🚀 LOADING MERIDIAN MODEL (ONCE)...")

# LOAD MODEL ONCE
with open("meridian_model.pkl", "rb") as f:
    mmm = pickle.load(f)

budget_optimizer = optimizer.BudgetOptimizer(mmm)
model_analyzer = analyzer.Analyzer(mmm)
final_ds = pd.read_csv("final_ds.csv")

# 🔥 CHANNEL CONFIG
SPEND_COLS = [
    "TV_spend",
    "Meta_Ads_spend",
    "TikTok_spend",
    "Google_Search_spend",
    "YouTube_spend",
]
CHANNEL_NAMES = ["TV", "Meta Ads", "TikTok", "Google Search", "YouTube"]
UI_KEYS = ["tv", "meta", "tiktok", "google", "youtube"]
COLORS = ["#8B5CF6", "#1877F2", "#000000", "#4285F4", "#FF0000"]

# 🔥 DYNAMIC BASE BUDGET = SUM ALL total_spend
BASE_BUDGET = round(final_ds["total_spend"].sum(), 0)
print(f"✅ DYNAMIC BASE BUDGET: ${BASE_BUDGET:,} (SUM final_ds.total_spend)")

# ---- OVERVIEW: PORTFOLIO + CHANNEL BREAKDOWN ----
print("🔥 PRE-COMPUTING OVERVIEW + EXPECTED OUTCOME DATA...")

# 1) Total Marketing Spend: sum of 5 media spend columns (full period)
total_marketing_spend = float(final_ds[SPEND_COLS].sum().sum())

# 2) Total Revenue & Conversions: from dataset (no hard-coded 195)
final_ds["conversions"] = final_ds["conversions"].fillna(0)
final_ds["revenue_per_conversion"] = final_ds["revenue_per_conversion"].fillna(0)

total_conversions = float(final_ds["conversions"].sum())
total_revenue = float(
    (final_ds["conversions"] * final_ds["revenue_per_conversion"]).sum()
)

# 3) ROI per channel via Analyzer.roi (posterior mean)
roi_tensor = model_analyzer.roi(
    use_posterior=True,
    new_data=None,
    selected_geos=None,
    selected_times=None,
    aggregate_geos=True,
    use_kpi=True,
    batch_size=100,
)
roi_np = roi_tensor.numpy()
roi_mean = roi_np.mean(axis=(0, 1))  # per channel

channels = mmm.input_data.get_all_channels()
df_roi = pd.DataFrame(list(zip(channels, roi_mean)), columns=["channel", "roi_mean"])

# 4) Incremental outcome per channel (needed only to construct expected_outcome table)
inc = model_analyzer.incremental_outcome(
    use_posterior=True,
    new_data=None,
    non_media_baseline_values=None,
    scaling_factor0=0.0,
    scaling_factor1=1.0,
    selected_geos=None,
    selected_times=None,
    media_selected_times=None,
    aggregate_geos=True,      # national level
    aggregate_times=False,    # keep time dimension
    inverse_transform_outcome=True,
    use_kpi=True,
    by_reach=True,
    include_non_paid_channels=True,
    batch_size=100,
)
inc_np = inc.numpy()
inc_mean = inc_np.mean(axis=(0, 1))  # time × channel

times = mmm.input_data.time.values
df_inc_raw = pd.DataFrame(inc_mean, columns=channels)
df_inc_raw.insert(0, "time", pd.to_datetime(times))

int_cols = [
    "TV",
    "Meta_Ads",
    "TikTok",
    "Google_Search",
    "YouTube",
    "Organic_TV",
    "Promo",
]
for col in int_cols:
    if col in df_inc_raw.columns:
        df_inc_raw[col] = df_inc_raw[col].astype(float)

# 5) Expected outcome (national, by time)
exp_outcome = model_analyzer.expected_outcome(
    use_posterior=True,
    selected_geos=None,
    selected_times=None,
    aggregate_geos=True,
    aggregate_times=False,
    inverse_transform_outcome=True,
    use_kpi=True,
    batch_size=100,
)
exp_np = exp_outcome.numpy()
exp_mean = exp_np.mean(axis=(0, 1))  # time
df_exp = pd.DataFrame({"time": pd.to_datetime(times), "expected": exp_mean})

# 6) Merge and compute baseline vs channels_total
df_expected_outcome = df_inc_raw.merge(df_exp, on="time")
df_expected_outcome["channels_total"] = df_expected_outcome[channels].sum(axis=1)
df_expected_outcome["baseline"] = (
    df_expected_outcome["expected"] - df_expected_outcome["channels_total"]
)

cols_to_int = [
    "TV",
    "Meta_Ads",
    "TikTok",
    "Google_Search",
    "YouTube",
    "Organic_TV",
    "Promo",
    "expected",
    "channels_total",
    "baseline",
]
for col in cols_to_int:
    if col in df_expected_outcome.columns:
        df_expected_outcome[col] = df_expected_outcome[col].astype(int)

# 7) Join final_ds spends with expected outcome on time (for spend-expected endpoint)
final_ds_merged = final_ds.copy()
final_ds_merged["time"] = pd.to_datetime(final_ds_merged["time"])
df_exp_merged = df_exp.copy()
df_exp_merged["time"] = pd.to_datetime(df_exp_merged["time"])

df_spend_expected = final_ds_merged.merge(df_exp_merged, on="time", how="inner")
df_spend_expected = df_spend_expected[
    [
        "time",
        "TV_spend",
        "Meta_Ads_spend",
        "TikTok_spend",
        "Google_Search_spend",
        "YouTube_spend",
        "expected",
    ]
]

# For full-period overview: use df_expected_outcome’s channel columns as incremental revenue
MODEL_CHANNELS = ["TV", "Meta_Ads", "TikTok", "Google_Search", "YouTube"]

channel_revenue_full = {}
for ch in MODEL_CHANNELS:
    if ch in df_expected_outcome.columns:
        channel_revenue_full[ch] = float(df_expected_outcome[ch].sum())
    else:
        channel_revenue_full[ch] = 0.0

total_incremental_full = sum(channel_revenue_full.values())

channel_performance = []
for i, ch in enumerate(MODEL_CHANNELS):
    spend_col = SPEND_COLS[i]
    ch_spend = float(final_ds[spend_col].sum())

    # ROI from df_roi (Meridian’s ROI)
    roi_row = df_roi[df_roi["channel"].str.contains(ch, case=False)]
    ch_roi = float(roi_row["roi_mean"].iloc[0]) if not roi_row.empty else 0.0

    ch_revenue = channel_revenue_full[ch]

    revenue_contribution_pct = (
        (ch_revenue / total_incremental_full * 100) if total_incremental_full > 0 else 0.0
    )
    spend_share_pct = (
        (ch_spend / total_marketing_spend * 100) if total_marketing_spend > 0 else 0.0
    )

    channel_performance.append(
        {
            "channel": CHANNEL_NAMES[i],
            "key": UI_KEYS[i],
            "spend": round(ch_spend, 0),
            "roi": round(ch_roi, 2),
            # conversions removed here because model incremental outcome is already in revenue units
            "conversions": 0,
            "revenue": round(ch_revenue, 0),
            "contribution": round(revenue_contribution_pct, 1),
            "spendShare": round(spend_share_pct, 1),
            "color": COLORS[i],
        }
    )

# Overall portfolio ROI (simple mean of channel ROI for display)
overall_roi_display = round(float(df_roi["roi_mean"].mean()), 2)

OVERVIEW_DATA = {
    "channelPerformance": channel_performance,
    "kpis": {
        "totalSpend": round(total_marketing_spend, 0),
        "totalRevenue": round(total_revenue, 0),
        "overallROI": overall_roi_display,
        "totalConversions": round(total_conversions, 0),
    },
}

# ---- ENDPOINTS ----

@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify({"baseBudget": BASE_BUDGET})

@app.route("/api/incremental", methods=["GET"])
def get_incremental_outcome():
    try:
        df = df_expected_outcome.copy()
        df["week"] = pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d")
        recent = df.tail(6).reset_index(drop=True)

        inc_data = []
        for _, row in recent.iterrows():
            inc_data.append(
                {
                    "week": row["week"],
                    "TV": int(row.get("TV", 0)),
                    "Meta_Ads": int(row.get("Meta_Ads", 0)),
                    "TikTok": int(row.get("TikTok", 0)),
                    "Google_Search": int(row.get("Google_Search", 0)),
                    "YouTube": int(row.get("YouTube", 0)),
                    "total_inc": int(
                        row[["TV", "Meta_Ads", "TikTok", "Google_Search", "YouTube"]].sum()
                    ),
                }
            )

        print(f"✅ Incremental (from expected_outcome table): {len(inc_data)} weeks")
        return jsonify({"last6months": inc_data})
    except Exception as e:
        print(f"🚨 Incremental error: {e}")
        return jsonify({"last6months": []})

@app.route("/api/expected", methods=["GET"])
def get_expected_outcome():
    """
    Returns last 6 periods with baseline, per-channel contributions, and total expected.
    """
    try:
        df = df_expected_outcome.copy()
        df["week"] = pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d")
        df_recent = df.tail(6).reset_index(drop=True)

        rows = []
        for _, row in df_recent.iterrows():
            rows.append(
                {
                    "week": row["week"],
                    "baseline": int(row.get("baseline", 0)),
                    "expected": int(row.get("expected", 0)),
                    "channels_total": int(row.get("channels_total", 0)),
                    "TV": int(row.get("TV", 0)),
                    "Meta_Ads": int(row.get("Meta_Ads", 0)),
                    "TikTok": int(row.get("TikTok", 0)),
                    "Google_Search": int(row.get("Google_Search", 0)),
                    "YouTube": int(row.get("YouTube", 0)),
                    "Organic_TV": int(row.get("Organic_TV", 0)),
                    "Promo": int(row.get("Promo", 0)),
                }
            )

        print(f"✅ Expected outcome (with baseline): {len(rows)} weeks")
        return jsonify({"last6months": rows})
    except Exception as e:
        print(f"🚨 Expected outcome error: {e}")
        return jsonify({"last6months": []})

@app.route("/api/spend-expected", methods=["GET"])
def get_spend_expected():
    """
    Returns time series with channel spends and expected outcome (model-based).
    Joins final_ds channel spends with expected outcome on time.
    """
    try:
        df = df_spend_expected.copy()
        df["time"] = pd.to_datetime(df["time"])
        df["date"] = df["time"].dt.strftime("%Y-%m-%d")

        # Optional filters: ?start=YYYY-MM-DD&end=YYYY-MM-DD
        start = request.args.get("start")
        end = request.args.get("end")
        if start:
            df = df[df["date"] >= start]
        if end:
            df = df[df["date"] <= end]

        rows = []
        for _, row in df.iterrows():
            rows.append(
                {
                    "date": row["date"],
                    "TV_spend": float(row.get("TV_spend", 0.0)),
                    "Meta_Ads_spend": float(row.get("Meta_Ads_spend", 0.0)),
                    "TikTok_spend": float(row.get("TikTok_spend", 0.0)),
                    "Google_Search_spend": float(row.get("Google_Search_spend", 0.0)),
                    "YouTube_spend": float(row.get("YouTube_spend", 0.0)),
                    "expected": float(row.get("expected", 0.0)),
                }
            )

        print(f"✅ Spend+Expected rows: {len(rows)}")
        return jsonify(
            {
                "meta": {
                    "grain": "day_or_week",
                    "n_rows": len(rows),
                    "start": start,
                    "end": end,
                },
                "rows": rows,
            }
        )
    except Exception as e:
        print(f"🚨 spend-expected error: {e}")
        return jsonify({"meta": {"error": str(e)}, "rows": []})

@app.route("/api/optimize", methods=["POST"])
def optimize_budget():
    try:
        data = request.get_json()
        target_budget = data.get("targetBudget", BASE_BUDGET)

        if target_budget <= 0:
            return jsonify(
                {"channels": [], "totalRevenue": 0, "totalSpend": 0, "avgROI": 0}
            )

        num_channels = len(UI_KEYS)
        pct_of_spend = [1.0 / num_channels] * num_channels

        opt_results = budget_optimizer.optimize(
            fixed_budget=True,
            budget=float(target_budget),
            pct_of_spend=pct_of_spend,
            use_kpi=True,
        )

        opt_mean = opt_results.optimized_data.sel(metric=c.MEAN)
        opt_df = (
            opt_mean[["spend", "incremental_outcome", "roi"]]
            .to_dataframe()
            .reset_index()
        )

        MODEL_CHANNELS = ["TV", "Meta_Ads", "TikTok", "Google_Search", "YouTube"]

        channels_out = []
        total_revenue_opt = 0.0
        total_spend_opt = 0.0

        for _, row in opt_df.iterrows():
            ch_name = str(row["channel"])
            for i, model_ch in enumerate(MODEL_CHANNELS):
                if model_ch.lower() in ch_name.lower():
                    channels_out.append(
                        {
                            "channel": CHANNEL_NAMES[i],
                            "key": UI_KEYS[i],
                            "spend": round(float(row["spend"]), 0),
                            "revenue": round(float(row["incremental_outcome"]), 0),
                            "roi": round(float(row["roi"]), 2),
                            "revShare": round(
                                (
                                    row["incremental_outcome"]
                                    / opt_df["incremental_outcome"].sum()
                                )
                                * 100,
                                1,
                            ),
                            "spendShare": round(
                                (row["spend"] / opt_df["spend"].sum()) * 100, 1
                            ),
                            "color": COLORS[i],
                        }
                    )
                    total_revenue_opt += float(row["incremental_outcome"])
                    total_spend_opt += float(row["spend"])
                    break

        return jsonify(
            {
                "channels": channels_out,
                "totalRevenue": round(float(total_revenue_opt), 0),
                "totalSpend": round(float(total_spend_opt), 0),
                "avgROI": round(
                    total_revenue_opt / total_spend_opt, 2
                )
                if total_spend_opt > 0
                else 0,
                "targetBudget": target_budget,
            }
        )
    except Exception as e:
        print(f"🚨 Optimizer error: {e}")
        return jsonify(
            {"channels": [], "totalRevenue": 0, "totalSpend": 0, "avgROI": 0}
        )

@app.route("/api/trends", methods=["GET"])
def get_trends_monthly_national():
    """
    Returns monthly, national aggregates derived solely from final_ds.csv.
    """
    df = final_ds.copy()

    if "time" not in df.columns:
        return jsonify({"meta": {"error": "final_ds missing 'time' column"}, "rows": []})

    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"])

    df["month"] = df["time"].dt.to_period("M").astype(str)

    start = request.args.get("start")
    end = request.args.get("end")
    if start:
        df = df[df["month"] >= start]
    if end:
        df = df[df["month"] <= end]

    digital_cols = [
        col
        for col in [
            "Meta_Ads_spend",
            "TikTok_spend",
            "Google_Search_spend",
            "YouTube_spend",
        ]
        if col in df.columns
    ]
    trad_cols = [col for col in ["TV_spend"] if col in df.columns]

    if "digital_spend" not in df.columns:
        df["digital_spend"] = df[digital_cols].sum(axis=1) if digital_cols else 0.0
    if "traditional_spend" not in df.columns:
        df["traditional_spend"] = df[trad_cols].sum(axis=1) if trad_cols else 0.0
    if "total_spend" not in df.columns:
        df["total_spend"] = df["digital_spend"] + df["traditional_spend"]

    if "revenue" not in df.columns:
        if "conversions" in df.columns and "revenue_per_conversion" in df.columns:
            df["conversions"] = df["conversions"].fillna(0)
            df["revenue_per_conversion"] = df["revenue_per_conversion"].fillna(0)
            df["revenue"] = (
                df["conversions"] * df["revenue_per_conversion"]
            )
        else:
            df["revenue"] = 0.0

    sum_cols = [
        "conversions",
        "revenue",
        "total_spend",
        "digital_spend",
        "traditional_spend",
        "TV_spend",
        "Meta_Ads_spend",
        "TikTok_spend",
        "Google_Search_spend",
        "YouTube_spend",
        "TV_impression",
        "Meta_Ads_impression",
        "TikTok_impression",
        "Google_Search_impression",
        "YouTube_impression",
        "Organic_TV_impression",
        "Promo",
        "population",
        "competitor_sales_control",
        "sentiment_score_control",
    ]
    present_sum_cols = [col for col in sum_cols if col in df.columns]

    g = df.groupby("month", as_index=False)
    out = g[present_sum_cols].sum() if present_sum_cols else g.size().rename("n")

    if "conversions" in df.columns and "revenue_per_conversion" in df.columns:
        rpc_num = df["conversions"].fillna(0) * df[
            "revenue_per_conversion"
        ].fillna(0)
        tmp = df[["month"]].copy()
        tmp["rpc_num"] = rpc_num
        tmp["conv"] = df["conversions"].fillna(0)

        rpc_month = tmp.groupby("month", as_index=False)[
            ["rpc_num", "conv"]
        ].sum()
        rpc_month["revenue_per_conversion"] = rpc_month["rpc_num"] / rpc_month[
            "conv"
        ].replace({0: np.nan})
        rpc_month = rpc_month[["month", "revenue_per_conversion"]]

        out = out.merge(rpc_month, on="month", how="left")
    else:
        out["revenue_per_conversion"] = np.nan

    out = out.replace([np.inf, -np.inf], np.nan).fillna(0)

    rows = out.sort_values("month").to_dict(orient="records")
    return jsonify(
        {
            "meta": {
                "grain": "month",
                "level": "national",
                "n_rows": len(rows),
                "start": start,
                "end": end,
            },
            "rows": rows,
        }
    )

@app.route("/api/overview", methods=["GET"])
def get_overview():
    """
    GET /api/overview?start=YYYY-MM-DD&end=YYYY-MM-DD

    If no start/end are provided, returns full-period KPIs (3 years) from OVERVIEW_DATA.
    If dates are provided, filters both spends and incremental outcome (from df_expected_outcome
    channel columns) to that window and recomputes:
      - Total Marketing Spend
      - Total Revenue
      - Total Conversions
      - ROI (incremental outcome / spend)
      - Channel breakdown
    """
    start = request.args.get("start")
    end = request.args.get("end")

    if not start and not end:
        return jsonify(OVERVIEW_DATA)

    ds = final_ds.copy()
    ds["time"] = pd.to_datetime(ds["time"], errors="coerce")

    inc_df = df_expected_outcome.copy()
    inc_df["time"] = pd.to_datetime(inc_df["time"], errors="coerce")

    if start:
        start_ts = pd.to_datetime(start)
        ds = ds[ds["time"] >= start_ts]
        inc_df = inc_df[inc_df["time"] >= start_ts]
    if end:
        end_ts = pd.to_datetime(end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
        ds = ds[ds["time"] <= end_ts]
        inc_df = inc_df[inc_df["time"] <= end_ts]

    if ds.empty or inc_df.empty:
        return jsonify(
            {
                "channelPerformance": [],
                "kpis": {
                    "totalSpend": 0.0,
                    "totalRevenue": 0.0,
                    "overallROI": 0.0,
                    "totalConversions": 0.0,
                },
            }
        )

    # Total Marketing Spend in window
    total_marketing_spend_win = float(ds[SPEND_COLS].sum().sum())

    # Total conversions and revenue in window from dataset
    ds["conversions"] = ds["conversions"].fillna(0)
    ds["revenue_per_conversion"] = ds["revenue_per_conversion"].fillna(0)

    total_conversions_win = float(ds["conversions"].sum())
    total_revenue_win = float(
        (ds["conversions"] * ds["revenue_per_conversion"]).sum()
    )

    # Incremental revenue per channel in window (from df_expected_outcome channel columns)
    channel_revenue = {}
    for ch in MODEL_CHANNELS:
        if ch in inc_df.columns:
            channel_revenue[ch] = float(inc_df[ch].sum())
        else:
            channel_revenue[ch] = 0.0

    total_incremental_win = sum(channel_revenue.values())

    channel_performance_win = []
    for i, ch in enumerate(MODEL_CHANNELS):
        spend_col = SPEND_COLS[i]
        ch_spend = float(ds[spend_col].sum()) if spend_col in ds.columns else 0.0

        roi_row = df_roi[df_roi["channel"].str.contains(ch, case=False)]
        ch_roi = float(roi_row["roi_mean"].iloc[0]) if not roi_row.empty else 0.0

        ch_revenue = channel_revenue[ch]

        revenue_contribution_pct = (
            (ch_revenue / total_incremental_win) * 100.0
            if total_incremental_win > 0
            else 0.0
        )
        spend_share_pct = (
            (ch_spend / total_marketing_spend_win) * 100.0
            if total_marketing_spend_win > 0
            else 0.0
        )

        channel_performance_win.append(
            {
                "channel": CHANNEL_NAMES[i],
                "key": UI_KEYS[i],
                "spend": round(ch_spend, 0),
                "roi": round(ch_roi, 2),
                # conversions again omitted here for the windowed view
                "conversions": 0,
                "revenue": round(ch_revenue, 0),
                "contribution": round(revenue_contribution_pct, 1),
                "spendShare": round(spend_share_pct, 1),
                "color": COLORS[i],
            }
        )

    overall_roi_win = (
        total_incremental_win / total_marketing_spend_win
        if total_marketing_spend_win > 0
        else 0.0
    )

    return jsonify(
        {
            "channelPerformance": channel_performance_win,
            "kpis": {
                "totalSpend": round(total_marketing_spend_win, 0),
                "totalRevenue": round(total_revenue_win, 0),
                "overallROI": round(overall_roi_win, 2),
                "totalConversions": round(total_conversions_win, 0),
            },
        }
    )

if __name__ == "__main__":
    print("🚀 PRODUCTION READY - DYNAMIC MMM DASHBOARD!")
    print(f"📊 final_ds: {len(final_ds)} rows, Budget: ${BASE_BUDGET:,}")
    app.run(debug=True, port=5000)
