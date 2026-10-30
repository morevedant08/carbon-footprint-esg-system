"""
dashboard/app.py

Streamlit dashboard for the AI-Driven Industrial Carbon Footprint & ESG
Intelligence System.

Talks to the FastAPI backend (must be running separately) for live
predictions and optimization, and visualizes the underlying training data
directly from disk.

USAGE:
    1. Make sure the backend is running in a separate terminal:
       python -m uvicorn backend.main:app --reload --port 8000
    2. pip install streamlit requests plotly pandas
    3. streamlit run dashboard/app.py
"""

import streamlit as st
import pandas as pd
import numpy as np
import requests
import plotly.express as px

API_BASE = "http://localhost:8000"

st.set_page_config(
    page_title="Carbon Footprint & ESG Intelligence",
    layout="wide",
)

st.title("🌍 AI-Driven Industrial Carbon Footprint & ESG Intelligence System")

tab1, tab2, tab3 = st.tabs(["📊 Emissions Overview", "🔮 Scope 3 Prediction", "🚚 Logistics Optimization"])

# ---------------------------------------------------------------------------
# TAB 1: Emissions Overview (visualizes the real training dataset directly)
# ---------------------------------------------------------------------------
with tab1:
    st.subheader("Training Data Overview — Real Company Disclosures (NZDPU/CDU)")

    try:
        df = pd.read_csv("data/processed/scope3_final_enriched.csv")

        col1, col2, col3 = st.columns(3)
        col1.metric("Companies", f"{len(df):,}")
        col2.metric("Sectors covered", df["sics_sector"].nunique())
        col3.metric("Countries covered", df["jurisdiction"].nunique())

        st.markdown("#### Scope 1 / 2 / 3 distribution by sector (median, tCO2e)")
        sector_summary = df.groupby("sics_sector")[["scope_1", "scope_2", "scope_3"]].median().reset_index()
        sector_summary_melted = sector_summary.melt(
            id_vars="sics_sector", var_name="Scope", value_name="Median tCO2e"
        )
        fig = px.bar(
            sector_summary_melted, x="sics_sector", y="Median tCO2e", color="Scope",
            barmode="group", title="Median emissions by sector and scope"
        )
        fig.update_layout(xaxis_title="Sector", yaxis_title="Median tCO2e (log scale)")
        fig.update_yaxes(type="log")
        st.plotly_chart(fig, use_container_width=True)

        st.markdown("#### Company count by jurisdiction")
        juris_counts = df["jurisdiction"].value_counts().head(10).reset_index()
        juris_counts.columns = ["Jurisdiction", "Company Count"]
        fig2 = px.bar(juris_counts, x="Jurisdiction", y="Company Count",
                       title="Top 10 jurisdictions by company count")
        st.plotly_chart(fig2, use_container_width=True)

        st.markdown("#### Scope 1 vs Scope 3 relationship (log-log)")
        fig3 = px.scatter(
            df, x="scope_1", y="scope_3", color="sics_sector",
            hover_name="company_name", log_x=True, log_y=True,
            title="Scope 1 vs Scope 3 emissions (each point = one company)"
        )
        st.plotly_chart(fig3, use_container_width=True)

        with st.expander("View raw training data"):
            st.dataframe(df[["company_name", "jurisdiction", "sics_sector",
                              "scope_1", "scope_2", "scope_3"]])

        st.markdown("#### Model Reliability by Segment")
        st.caption("Out-of-fold R² (honest, held-out evaluation) by sector, jurisdiction, and company size. "
                   "Higher R² = more reliable predictions for that segment.")
        try:
            rel_df = pd.read_csv("data/processed/model_reliability_by_segment.csv")
            for seg_type in rel_df["segment_type"].unique():
                seg_data = rel_df[rel_df["segment_type"] == seg_type].sort_values("r2", ascending=False)
                fig_rel = px.bar(
                    seg_data, x="segment", y="r2", text="n_companies",
                    title=f"R² by {seg_type}",
                    labels={"r2": "R² (out-of-fold)", "segment": ""}
                )
                fig_rel.update_traces(texttemplate="n=%{text}", textposition="outside")
                fig_rel.update_layout(yaxis_range=[0, max(0.8, seg_data["r2"].max() + 0.1)])
                st.plotly_chart(fig_rel, use_container_width=True)
        except FileNotFoundError:
            st.info("Reliability breakdown not found. Run the segment analysis script first.")

    except FileNotFoundError:
        st.warning("Training data not found at data/processed/scope3_final_enriched.csv. "
                    "Make sure you're running Streamlit from the project root folder.")

# ---------------------------------------------------------------------------
# TAB 2: Scope 3 Prediction (calls the live FastAPI backend)
# ---------------------------------------------------------------------------
with tab2:
    st.subheader("Predict Scope 3 Emissions for a New Vendor/Company")
    st.caption("Calls the trained XGBoost model via the FastAPI backend (must be running on port 8000).")

    with st.form("predict_form"):
        c1, c2 = st.columns(2)
        with c1:
            company_name = st.text_input("Company name", "Example Manufacturing Ltd")
            scope_1 = st.number_input("Scope 1 emissions (tCO2e)", min_value=0.0, value=50000.0)
            scope_2 = st.number_input("Scope 2 emissions (tCO2e)", min_value=0.0, value=15000.0)
            sics_sector = st.selectbox(
                "SICS Sector",
                ["Resource Transformation", "Infrastructure", "Transportation",
                 "Extractives & Minerals Processing", "Renewable Resources & Alternative Energy"]
            )
            jurisdiction = st.text_input("Jurisdiction (country)", "India")

        with c2:
            st.caption("Optional — improves prediction accuracy if known")
            revenue = st.number_input("Annual revenue (USD)", min_value=0.0, value=0.0)
            employees = st.number_input("Employees", min_value=0.0, value=0.0)
            market_cap = st.number_input("Market cap (USD)", min_value=0.0, value=0.0)
            ebitda = st.number_input("EBITDA (USD)", value=0.0)

        submitted = st.form_submit_button("Predict Scope 3 Emissions")

    if submitted:
        payload = {
            "company_name": company_name,
            "scope_1": scope_1,
            "scope_2": scope_2,
            "sics_sector": sics_sector,
            "jurisdiction": jurisdiction,
            "revenue": revenue if revenue > 0 else None,
            "employees": employees if employees > 0 else None,
            "market_cap": market_cap if market_cap > 0 else None,
            "ebitda": ebitda if ebitda != 0 else None,
        }
        try:
            response = requests.post(f"{API_BASE}/predict/scope3", json=payload, timeout=10)
            if response.status_code == 200:
                result = response.json()
                st.success(f"Predicted Scope 3 emissions: **{result['predicted_scope3_tco2e']:,.0f} tCO2e**")
                st.info(result["note"])
                st.caption(f"Used real financial data: {result['used_real_financials']}")
            else:
                st.error(f"API error {response.status_code}: {response.text}")
        except requests.exceptions.ConnectionError:
            st.error(
                "Could not connect to the backend API. Make sure it's running:\n\n"
                "`python -m uvicorn backend.main:app --reload --port 8000`"
            )

# ---------------------------------------------------------------------------
# TAB 3: Logistics Optimization (calls the live FastAPI backend)
# ---------------------------------------------------------------------------
with tab3:
    st.subheader("Optimize Logistics Routing for Carbon Reduction")
    st.caption("Calls the MILP optimizer via the FastAPI backend. Cost figures are documented "
               "synthetic assumptions — see optimization/milp_optimizer.py.")

    c1, c2 = st.columns(2)
    with c1:
        sample_size = st.slider("Number of shipments to optimize", 50, 1000, 200, step=50)
    with c2:
        reduction_target = st.slider("Target emission reduction (%)", 5, 30, 10, step=5) / 100

    if st.button("Run Optimization"):
        try:
            response = requests.post(
                f"{API_BASE}/optimize/logistics",
                json={"sample_size": sample_size, "reduction_target": reduction_target},
                timeout=60,
            )
            if response.status_code == 200:
                result = response.json()

                m1, m2, m3 = st.columns(3)
                m1.metric("Emissions Reduction Achieved", f"{result['actual_reduction_pct']}%")
                m2.metric("Cost Change", f"{result['cost_change_pct']}%")
                m3.metric("Shipments Optimized", len(result["assignments"]))

                col_a, col_b = st.columns(2)
                col_a.metric("Baseline Emissions (kg CO2e)", f"{result['baseline_emissions_kg']:,.0f}")
                col_a.metric("Optimized Emissions (kg CO2e)", f"{result['optimized_emissions_kg']:,.0f}")
                col_b.metric("Baseline Cost", f"{result['baseline_cost']:,.0f}")
                col_b.metric("Optimized Cost", f"{result['optimized_cost']:,.0f}")

                assignments_df = pd.DataFrame(result["assignments"])
                st.markdown("#### Vehicle reassignment breakdown")
                shift_counts = assignments_df.groupby(
                    ["original_vehicle", "recommended_vehicle"]
                ).size().reset_index(name="count")
                shift_counts = shift_counts[shift_counts["original_vehicle"] != shift_counts["recommended_vehicle"]]
                if len(shift_counts) > 0:
                    fig = px.bar(
                        shift_counts, x="original_vehicle", y="count", color="recommended_vehicle",
                        title="Shipments reassigned (original vehicle -> recommended vehicle)"
                    )
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("No vehicle reassignments were needed at this target.")

                with st.expander("View full routing plan"):
                    st.dataframe(assignments_df)

                st.caption(result["note"])

            elif response.status_code == 422:
                st.warning(f"No feasible solution at {reduction_target*100:.0f}% reduction target. "
                           f"Try a lower target.")
            else:
                st.error(f"API error {response.status_code}: {response.text}")
        except requests.exceptions.ConnectionError:
            st.error(
                "Could not connect to the backend API. Make sure it's running:\n\n"
                "`python -m uvicorn backend.main:app --reload --port 8000`"
            )
