# AI-Driven Industrial Carbon Footprint & ESG Intelligence System

A working, end-to-end AI/ML system that predicts industrial Scope 3 greenhouse gas emissions and recommends carbon-reducing logistics routing, built on real corporate disclosure data.

## Table of Contents

- [Overview](#overview)
- [What This System Actually Does](#what-this-system-actually-does)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Data Sources](#data-sources)
- [Scope 3 Prediction: Methodology & Results](#scope-3-prediction-methodology--results)
- [Logistics Optimization: Methodology & Results](#logistics-optimization-methodology--results)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)
- [License](#license)

## Overview

This project predicts Scope 3 (value chain) greenhouse gas emissions for companies using machine learning trained on real corporate disclosures, and recommends cost/emissions-optimal logistics routing using mixed-integer linear programming (MILP). It includes a live API, an interactive Next.js web application, a Streamlit dashboard, and automated PDF report generation.

Unlike many student ML projects, every component here has been built, run, and validated end-to-end — not just designed. Data quality issues were found and fixed during development, model performance was validated against real disclosed figures (not just cross-validation scores), and every limitation below reflects an actual finding, not a hypothetical caveat.

## What This System Actually Does

1. **Predicts Scope 3 emissions** for a company given its Scope 1/2 emissions, sector, jurisdiction, and (optionally) financial data — using a model trained on 1,069 real company disclosures.
2. **Recommends logistics routing changes** (which vehicle type to use per shipment) to hit a target emissions-reduction percentage while minimizing cost, subject to realistic payload and range constraints.
3. **Visualizes** both of the above in an interactive dashboard.
4. **Generates audit-style PDF reports** summarizing emissions data, model performance, and reliability by segment.

## System Architecture

```
┌──────────────────────────┐
│   Real Data Sources        │
│  (NZDPU/CDU disclosures,   │
│   yfinance financials)     │
└────────────┬────────────────┘
             │
             ▼
┌────────────────────────────────┐
│  Data Cleaning & Correction     │
│  (unit-error fixes, anomaly     │
│   exclusion, feature building)  │
└────────────┬────────────────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌─────────────────┐  ┌──────────────────────────┐
│ ML Models         │  │ MILP Optimizer             │
│ (XGBoost primary,  │  │ (PuLP - vehicle routing    │
│ 6 others compared) │  │  under payload/range       │
│ Predicts Scope 3   │  │  constraints)               │
└─────────┬───────────┘  └────────────┬─────────────────┘
          │                             │
          └──────────────┬──────────────┘
                          ▼
              ┌────────────────────────┐
              │     FastAPI Backend      │
              │  /predict/scope3          │
              │  /optimize/logistics      │
              └───────────┬────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────────┐
│  Streamlit Dashboard    │   │  ReportLab PDF Generator   │
└───────────────────────┘   └───────────────────────────┘
```

## Technology Stack

| Component | Technology |
|---|---|
| Language | Python 3.12 |
| Backend API | FastAPI + Uvicorn |
| Dashboard | Streamlit + Plotly |
| ML | scikit-learn, XGBoost, LightGBM |
| Optimization | PuLP (MILP) |
| Reports | ReportLab, Matplotlib |
| Financial data | yfinance |
| Fuzzy matching | RapidFuzz (company-to-ticker matching) |

## Data Sources

### 1. Scope 3 Training Data — Authentic Corporate Disclosures

**Source:** NZDPU / Climate Data Utility (climatedatautility.org) — CDP and ADEME disclosure providers (self-reported, not audited).

**Collection:** Queried via the Data Explorer, filtered to industrial-relevant sectors (Extractives & Minerals Processing, Infrastructure, Renewable Resources & Alternative Energy, Resource Transformation, Transportation), 2022-2024 reporting years. CDP-sourced data is limited to 50 companies/day by the provider; ADEME data has no such limit.

**Fields:** Company name, reporting year, jurisdiction, SICS sector, Scope 1, Scope 2 (market- and location-based), Scope 3 (total).

**Enrichment & Ticker-Matching:** Company financials (revenue, employee count, market cap, EBITDA) were added via `yfinance`, matched by company name using RapidFuzz string matching with a match threshold of **fuzzy score ≥ 60** (65.8% initial match rate).
- **Manual Audit:** An audit of 40 randomly sampled matches found 39 correct and 1 mismatch (~2.5% error rate).
- **5 Confirmed Mismatches Blanked:** 5 companies with incorrect Yahoo Finance matches were identified and set to `NaN` with `has_financials = 0` via `pipeline/blank_bad_matches.py` (Horizon Global Corporation, MOBICO GROUP PLC, CKD Corp, Asia Cement Corporation, Titan). No replacement values were invented or imputed. Output: `data/processed/scope3_final_corrected_usd_clean.csv` and `blanked_matches_log.csv`. 477 companies retain reported USD financials.

**Currency Normalization (Date: 2026-10-23):** Financial metrics previously mixed local reporting currencies (JPY, EUR, KRW) with USD. All financials are normalized to USD using fixed-date historical FX rates (2026-10-23) in `pipeline/enrich_financials.py`, with persistent columns `fx_rate` and `fx_date` stored in the clean dataset. Key rates: EUR: 1.120448 (confirmed), GBP: 1.337489, CHF: 1.219795, JPY: 0.006377, KRW: 0.000754, CNY: 0.149748, HKD: 0.127530, INR: 0.010558, BRL: 0.201402, NOK: 0.107234, CAD: 0.714153.

**Data quality correction:** Initial analysis found 172 of 1,206 companies (14.3%) with Scope 3-to-(Scope 1+2) ratios more than 15x their sector median. Investigation found:
- 35 companies had values consistent with a kilogram-vs-tonne unit reporting error — corrected by dividing by 1000.
- 137 companies had no verifiable explanation (likely inconsistent Scope 3 category-boundary reporting, a known real-world challenge in Scope 3 disclosure) — excluded from training rather than estimated.

This correction improved cross-validated R² from ~0.39 to ~0.49. Full detail in `data/DATA_SOURCES.md`.

**Final clean training set:** 1,069 companies, 5 sectors, 50+ jurisdictions (`data/processed/scope3_final_corrected_usd_clean.csv`).

### 2. Logistics Optimization Data — Synthetic (Disclosed)

**Source:** Synthetically generated (Kaggle-style), 12,000 delivery shipment records.

**Why synthetic:** Real, facility-level logistics/routing data (vendor capacity, delivery constraints, per-route emissions) is not publicly available at the granularity a MILP optimizer needs. This is a deliberate, disclosed design choice, not a hidden limitation.

**What's real about it:** Vehicle-type emission factors used by the optimizer are computed directly from this dataset's actual distance/emissions figures, not assumed. Cost-per-km figures are a documented modeling assumption (see `optimization/milp_optimizer.py`), not real company pricing.

## Scope 3 Prediction: Methodology & Results

**Model:** XGBoost (primary/deployed model `ml/model_artifacts/scope3_xgboost_clean.pkl`), selected for its low cross-validation variance across folds and solid test MAE.

**Full model comparison** (5-fold cross-validation on USD clean dataset, 1,069 companies):

| Model | CV R² (mean) | CV R² (std) | Test R² | Test MAE |
|---|---|---|---|---|
| **XGBoost (Deployed)** | **0.4879** | **0.0534** | **0.4542** | **1.5643** |
| Ridge Regression | 0.4966 | 0.0627 | 0.4714 | 1.5847 |
| Linear Regression | 0.4963 | 0.0629 | 0.4711 | 1.5858 |
| Extra Trees | 0.4946 | 0.0581 | 0.4377 | 1.5757 |
| LightGBM | 0.4889 | 0.0695 | 0.4406 | 1.5870 |
| Random Forest | 0.4863 | 0.0716 | 0.4269 | 1.5987 |
| Gradient Boosting | 0.4694 | 0.0801 | 0.4360 | 1.5908 |

**Intensity Target Experiment:** An experiment evaluating whether predicting carbon intensity (`log(Scope 3) - log(Revenue)`) improves out-of-fold accuracy for large-revenue firms was conducted via `ml/experiment_intensity_target.py`. The experiment yielded a decisive **Null Result** (large revenue quartile out-of-fold R² degraded from -0.2656 to -0.5819, and full-dataset combined R² dropped by 0.0476). Per the predefined decision criteria, the intensity target was **not adopted**.

**Reliability by segment** (out-of-fold R², i.e., each company evaluated by a model that never saw it during training):

| Best-performing sectors | R² | Historical Firms |
|---|---|---|
| Renewable Resources & Alternative Energy | 0.625 | 31 |
| Infrastructure | 0.536 | 319 |
| Transportation | 0.531 | 174 |
| Resource Transformation | 0.444 | 375 |
| Extractives & Minerals Processing | 0.273 | 170 |

| Best-performing jurisdictions | R² |
|---|---|
| France | 0.699 |
| Germany | 0.632 |
| Japan | 0.530 |

### External Validation: Pladifes COGEM Benchmark (13 Global Corporations)
Validated against 13 multinational industrial corporations from the Pladifes COGEM dataset (`ml/validate_against_cogem.py` -> `data/processed/cogem_validation_clean.csv`):
- **Training Set Overlap Exclusion:** Three companies (BP P.L.C., Uniper SE, VOLKSWAGEN AG) are also present in the NZDPU training set. They are flagged `in_training_set = True` and excluded from headline metrics to guarantee strict independence.
- **Headline metrics on 10 independent companies (All revenues > $100B USD):**
  - **Median error:** **281.92x off** (100% under-predicted).
  - **Within 2x accuracy:** **10.0%** (BMW at 1.57x).
  - **Within 3x accuracy:** **10.0%** (General Motors is at 3.43x).
  - **Within 80% empirical CI:** **20.0%** (2 of 10: BMW and GM fall within the model's 80% bounds).
- **Large-Company Extrapolation Warning:** Decision trees cannot extrapolate beyond training upper bounds (only 7 companies in the training set had Scope 3 > 300M tCO2e, and only 5 had revenue > $100B). When revenue or Scope 1+2 exceeds the 95th percentile of training data ($39.1B USD or 22.5M tCO2e), the system triggers an explicit, non-dismissible extrapolation warning.

## Logistics Optimization: Methodology & Results

**Approach:** Given a batch of shipments, a MILP (via PuLP) assigns each shipment to a vehicle type (Cargo Bicycle, Drone, Motorcycle, Electric Van, Diesel Van, Heavy Truck) to minimize total cost, subject to achieving a target percentage reduction in total emissions versus the current assignment.

**Consistent Baseline Basis:**
- Baseline emissions are defined on the exact same basis as the optimized plan: `sum(distance * emission_factor[original_vehicle])` = **14,412.68 kg CO2e** (200 shipments, seed 42). The dataset-recorded total (13,344.52 kg) is reported as a separate reference.
- **Maximum Feasible Reduction:** **24.0%** (boundary: 23.98%, min achievable emissions = 10,956.26 kg CO2e).
- **Target Feasibility:**
  - **10% Target:** Optimal, achieves 11,344.44 kg CO2e (**21.3% actual reduction** on factor basis; 15.0% on recorded basis).
  - **15% Target:** Optimal, achieves 11,344.44 kg CO2e (**21.3% actual reduction**).
  - **20% Target:** Optimal, achieves 11,344.44 kg CO2e (**21.3% actual reduction**).
  - **25% & 30% Targets:** **Infeasible** (physically exceeds maximum feasible reduction of 24.0%).
- **Repair vs. Optimization Split (`optimization/feasible_baseline_analysis.py`):**
  - Total reduction = 3,068.24 kg CO2e.
  - Repair component (swapping initial vehicles violating payload/range) = **7.25 kg CO2e (0.24%)**.
  - Optimization component (reassigning valid vehicles to lower-emission modes) = **3,060.99 kg CO2e (99.76%)**.

## Project Structure

```
carbon-footprint-esg-system/
├── data/
│   ├── raw/                          # (reserved for future raw ingestion)
│   ├── processed/                    # Cleaned, corrected, enriched datasets
│   ├── synthetic/                    # Synthetic logistics dataset
│   └── DATA_SOURCES.md               # Full data provenance & correction log
│
├── pipeline/
│   └── enrich_financials.py          # yfinance financial enrichment
│
├── ml/
│   ├── train_xgboost.py              # Primary model training
│   ├── train_all_models.py           # 7-model comparison
│   └── model_artifacts/              # Trained .pkl models
│
├── optimization/
│   └── milp_optimizer.py             # MILP logistics optimizer (PuLP)
│
├── backend/
│   ├── main.py                       # FastAPI app
│   ├── routes/                       # predict.py, optimize.py
│   └── schemas/                      # Pydantic request/response models
│
├── dashboard/
│   └── app.py                        # Streamlit dashboard (3 tabs)
│
├── reports/
│   ├── report_generator.py           # ReportLab PDF generation
│   └── output/                       # Generated PDF reports
│
├── requirements.txt
└── README.md
```

## Installation & Setup

### Prerequisites
- Python 3.12+ (installed from python.org, NOT the Microsoft Store version — the Store version works but triggers extra PATH warnings)
- pip

### Steps

```bash
git clone <repo-url>
cd carbon-footprint-esg-system

pip install -r requirements.txt
```

**On Windows, if `uvicorn` or `streamlit` commands aren't recognized after install**, use the Python module form instead:
```bash
python -m uvicorn backend.main:app --reload --port 8000
python -m streamlit run dashboard\app.py
```

### Running the full system

**Terminal 1 — FastAPI Backend:**
```bash
python -m uvicorn backend.main:app --reload --port 8000
```
API docs available at `http://localhost:8000/docs`

**Terminal 2 — Next.js Web Application (Recommended Modern UI):**
```bash
cd frontend
npm install
npm run dev
```
Opens at `http://localhost:3000`.

#### Frontend Environment Configuration (`NEXT_PUBLIC_API_URL`)
- For **local development**, copy `frontend/.env.example` to `frontend/.env.local`:
  ```bash
  cp frontend/.env.example frontend/.env.local
  ```
  Default is `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- For **production deployment** (e.g. Vercel or Render):
  - In your hosted dashboard (Vercel project settings or Render environment variables), set:
    ```env
    NEXT_PUBLIC_API_URL=https://your-backend-api.onrender.com
    ```
  - **Cold-Start Handling:** On free-tier services like Render, the backend may sleep when inactive. The web application detects this and displays a friendly notice: *"Waking the server, this can take up to a minute..."* rather than failing immediately.
  - If `NEXT_PUBLIC_API_URL` is omitted on a hosted domain, the web application renders a clear setup banner directing the administrator to configure the missing environment variable instead of silently failing or attempting to reach `localhost`.

**Terminal 3 — Streamlit Dashboard (Alternative UI):**
```bash
python -m streamlit run dashboard/app.py
```
Opens at `http://localhost:8501`.

**Terminal 4 — Reports & Pipeline Tools:**
```bash
# Generate PDF report:
python reports/report_generator.py

# Regenerate RESULTS_SUMMARY.md from raw/processed data artifacts:
python pipeline/make_results_summary.py

# Run test suite:
python -m unittest discover tests
```

## Usage

1. **Dashboard → Emissions Overview:** explore the real training data — emissions by sector, jurisdiction, and the model's reliability breakdown by segment.
2. **Dashboard → Scope 3 Prediction:** enter a company's Scope 1/2, sector, jurisdiction, and optional financials to get a live prediction from the backend.
3. **Dashboard → Logistics Optimization:** set a shipment batch size and emissions reduction target, run the optimizer, and see the recommended vehicle reassignment plan.
4. **PDF Reports:** generate a full report with real charts, model comparison tables, and reliability breakdowns, optionally spotlighting one company.

## Known Limitations

- **Model accuracy is directional, not precise.** R² ≈ 0.48-0.50 means the model explains roughly half the variance in Scope 3 emissions. Treat predictions as order-of-magnitude estimates, not audit-grade figures.
- **Systematic under-prediction for mega-emitters.** Tree-based regressors cannot extrapolate beyond training upper bounds (only 26 companies in NZDPU training data had Scope 3 > 100M tCO2e). Independent validation on 12 multinational conglomerates in the Pladifes COGEM sample showed a median error of 61.7x (100% under-predicted), driven by Scope 3 Category 11 use-of-sold-products boundary differences in oil and automotive majors. Predictions for firms exceeding the 95th percentile trigger an explicit Large-Company Extrapolation Warning.
- **Financial data coverage is partial.** Only 65.8% of companies matched to a stock ticker via yfinance; unmatched companies use median-imputed financials with a `has_financials` flag.
- **Logistics data is synthetic**, explicitly disclosed. Cost figures are documented modeling assumptions, not real pricing.
- **~11% of Scope 3 disclosures were excluded** as irreconcilable reporting-boundary anomalies, rather than estimated or fabricated.
- **Not a substitute for regulatory disclosure.** AI-generated estimates are not universally recognized as valid compliance data by all regulators.

## Roadmap

- Expand training data via additional NZDPU pulls (more years, broader sectors) or a paid full-scale dataset (e.g., Pladifes/CGEE, ~€1,200) to test whether R² improves toward GHGbench's published 0.688 ceiling at 10x the data.
- Post-hoc calibration layer for large-cap company under-prediction.
- Replace synthetic logistics data with real company data if/when available.
- Category-level Scope 3 breakdown (currently only total Scope 3 is predicted).
- Basic automated test suite.

## License

This project is provided as a working reference implementation. Add your chosen license (e.g., MIT, Apache 2.0) here.

---

Built as a demonstration that authentic, freely-available data — combined with honest data quality investigation — can produce a legitimate, defensible Scope 3 prediction system, even without access to proprietary commercial datasets.
