# Data Sources — Final

This project uses two datasets, each serving a distinct pipeline. Both are finalized as of this stage.

## 1. Scope 3 Emissions Prediction Dataset

**File:** `data/processed/scope3_training_data.csv`
**Rows:** 451 companies
**Source:** NZDPU / Climate Data Utility (climatedatautility.org) — CDP and ADEME disclosures
**Authenticity:** 100% real, verified corporate GHG disclosures
**Fields:** company_name, reporting_year, data_provider, scope_1, scope_2_market, scope_2_location, scope_2 (merged), scope_3, log_scope1, log_scope2, log_scope3

**Collection method:** Manually queried and exported via NZDPU's Data Explorer, filtered to industrial-relevant sectors (Extractives & Minerals Processing, Infrastructure, Renewable Resources & Alternative Energy, Resource Transformation, Transportation). CDP-sourced rows are subject to a 50-company/day download limit; ADEME-sourced rows are not.

**Known limitation:** No sector/industry classification column in the current export. Planned enrichment (next step): pull company financials (revenue, employee count, market cap, EBITDA) via yfinance, matched by ticker — shown by published research (GHGbench, arXiv:2605.13743) to be the single largest driver of Scope 3 prediction accuracy, more impactful than sector alone.

**Target model performance:** R² 0.5–0.65 (realistic, benchmarked against GHGbench's published best result of R² = 0.688 on a much larger dataset).

**Data quality correction (applied after initial training):** 172 of 1,206 companies
(14.3%) showed Scope 3-to-(Scope 1+2) ratios more than 15x their sector's median —
implausible given otherwise-normal Scope 1/2 and revenue figures. Investigation found:
- **35 companies**: consistent with a kilogram-vs-tonne unit reporting error (values
  ~1000x sector-normal). Corrected by dividing Scope 3 by 1000.
  See `data/processed/unit_corrected_companies.csv`.
- **137 companies**: no verifiable correction (likely inconsistent Scope 3
  category-boundary reporting across companies — a well-documented real-world
  challenge in Scope 3 disclosure). Excluded from training rather than
  estimated/fabricated. See `data/processed/excluded_anomalies_final.csv`.

Final training dataset: **1,069 companies** (`scope3_final_corrected.csv` and `scope3_final_corrected_usd.csv`).
This correction improved cross-validated R² from ~0.39 to ~0.48.

---

## 2. Currency Normalization & Ticker Match Cleaning (Round 3 Audit)

### Ticker-Matching Method & Threshold
- Company names from NZDPU/CDP/ADEME disclosures were matched to stock tickers via `yfinance` search using RapidFuzz string matching with a similarity threshold of **fuzzy score ≥ 60**.
- **Manual Audit:** A manual audit of 40 randomly sampled companies found 39 correct matches and 1 mismatch (~2.5% mismatch rate), confirming overall high match quality.
- **5 Verified Mismatches Blanked:** 5 companies with confirmed incorrect matches were identified:
  1. *Horizon Global Corporation* ($3,217 revenue recorded due to shell entity ticker match)
  2. *MOBICO GROUP PLC* (HKD financials pulled for a UK firm)
  3. *CKD Corp* (KRW financials pulled for a Japanese firm)
  4. *Asia Cement Corporation* (KRW financials pulled for a Taiwanese/Chinese firm)
  5. *Titan* (CNY financials pulled for a Belgian firm)
- **Zero-Imputation Policy:** Via `pipeline/blank_bad_matches.py`, all financial fields (`revenue`, `market_cap`, `ebitda`, `employees`, `ticker`) for these 5 companies were set to `NaN` and `has_financials = 0`. No replacement values were invented or imputed. Output: `data/processed/scope3_final_corrected_usd_clean.csv` and `blanked_matches_log.csv`.
- **Resulting Clean Financial Count:** 563 companies out of 1,069 have verified USD financials (down from 568).

### Persistent FX Columns & Exchange Rates (Date: 2026-10-23)
Persistent columns `fx_rate` (USD per unit of local currency) and `fx_date` (`2026-10-23`) were added across all rows in the clean dataset:
| Currency | USD per Local Unit | Verification Note |
|---|---|---|
| **EUR** | 1.120448 | Verified: ~1.12 USD/EUR; BASF €61.58B converted to $69.00B (6.90e10 USD) |
| **GBP** | 1.337489 | Verified |
| **CHF** | 1.219795 | Verified |
| **JPY** | 0.006377 | Verified (156.8 JPY per USD) |
| **KRW** | 0.000754 | Verified (1,326 KRW per USD) |
| **CNY** | 0.149748 | Verified (6.68 CNY per USD) |
| **HKD** | 0.127530 | Verified (7.84 HKD per USD) |
| **USD** | 1.000000 | Baseline |

### Unusual Currency Review
A pipeline data-quality check flags rows where reporting currency is unusual for jurisdiction (e.g. USD reported by foreign subsidiaries). 21 rows were flagged and retained for audit without auto-removal.

### Model Retraining on Clean Data (`scope3_final_corrected_usd_clean.csv`)
All 7 models were retrained (`ml/train_all_models.py`):
| Model | Old CV R² (std) | Clean CV R² (std) | Clean Test R² | Clean Test MAE |
|---|---|---|---|---|
| **XGBoost (Deployed)** | 0.4874 (0.0543) | **0.4879 (0.0534)** | **0.4542** | **1.5643** |
| **Ridge Regression** | 0.4995 (0.0592) | 0.4966 (0.0627) | 0.4714 | 1.5847 |
| **Linear Regression** | 0.4991 (0.0592) | 0.4963 (0.0629) | 0.4711 | 1.5858 |
| **Extra Trees** | — | 0.4946 (0.0581) | 0.4377 | 1.5757 |
| **LightGBM** | 0.4828 (0.0617) | 0.4889 (0.0695) | 0.4406 | 1.5870 |
| **Random Forest** | 0.4784 (0.0673) | 0.4863 (0.0716) | 0.4269 | 1.5987 |
| **Gradient Boosting** | 0.4973 (0.0573) | 0.4694 (0.0801) | 0.4360 | 1.5908 |

*Artifacts:* `data/processed/full_model_comparison_clean.csv`, `ml/model_artifacts/scope3_xgboost_clean.pkl`, and `data/processed/model_reliability_by_segment_clean.csv`.

---

## 3. Intensity-Target Experiment (Cross-Validation Decided)

An experiment evaluating whether predicting carbon intensity (`log(Scope 3) - log(Revenue)`) improves prediction accuracy for large-revenue companies was conducted (`ml/experiment_intensity_target.py`):
- **Decision Rule:** Adopt only if XGBoost Large revenue quartile out-of-fold R² clearly improves AND overall out-of-fold R² does not drop by more than 0.01.
- **Results:**
  - Absolute target on valid revenue: Overall R² = 0.4127; Large quartile R² = -0.2656
  - Intensity target on valid revenue: Overall R² = 0.3678; Large quartile R² = -0.5819 (degraded by -0.3163)
  - Combined full dataset: Absolute R² = 0.4879 vs Combined Intensity R² = 0.4402 (dropped by 0.0476 > 0.01 threshold)
- **Decision: DO NOT ADOPT (Null Result).** The absolute target model was retained.

---

## 4. Independent External Validation: Pladifes COGEM Benchmark

Conducted via `ml/validate_against_cogem.py` using `scope3_xgboost_clean.pkl`.

### Training Set Overlap Separation
Three of the 13 companies in the COGEM dataset are also present in the NZDPU training set:
1. **BP P.L.C.** (in training set; COGEM: 337.5M tCO2e, Pred: 560k tCO2e, 602.6x off)
2. **Uniper SE** (in training set; COGEM: 48.2M tCO2e, Pred: 23.9M tCO2e, 2.0x off; missing revenue)
3. **VOLKSWAGEN AKTIENGESELLSCHAFT** (in training set; COGEM: 336.5M tCO2e, Pred: 19.3M tCO2e, 17.4x off)

To guarantee independence, these 3 companies are flagged `in_training_set = True` and excluded from headline validation metrics.

### Headline Metrics on 10 Independent Companies (All Revenues > $100B)
- **Median Times Off:** **281.92x**
- **Mean Times Off:** **347.85x**
- **Within 2x:** **10.0%** (BMW at 1.57x)
- **Within 3x:** **10.0%** (GM is at 3.43x)
- **Under-Predicted Count:** **10 / 10 (100.0%)**
- **Inside 80% Range:** **2 / 10 (20.0%)** (BMW and General Motors)
- **Revenue Breakdown:** All 10 companies have revenue > $100 Billion (0 companies ≤ $100B).
- **Core Limitation:** Tree models cannot extrapolate beyond training bounds (training has only 7 companies with Scope 3 > 300M tCO2e and 5 with revenue > $100B).

---

## 5. Logistics / Supply Chain Optimization: Consistent Baseline Basis

**File:** `data/synthetic/logistics_emissions.csv` (12,000 synthetic shipments)
**Optimizer:** `optimization/milp_optimizer.py` (PuLP MILP)

### Baseline Basis Fix
Previously, the optimizer computed baseline emissions from recorded dataset totals (13,344.52 kg for 200 shipments) while the optimized plan used per-vehicle emission factors.
- **Consistent Basis:** Baseline is now explicitly defined as `sum(distance * emission_factor[original_vehicle])` = **14,412.68 kg CO2e**.
- **Recorded Reference Total:** 13,344.52 kg CO2e is preserved as a separate reference.
- **Maximum Feasible Reduction:** **24.0%** (exact boundary: 23.98%, min emissions = 10,956.26 kg CO2e).
- **Target Feasibility on 200 Shipments (seed 42):**
  - **10% Target:** Optimal, achieves 11,344.44 kg CO2e (**21.3% actual reduction** on factor basis; 15.0% on recorded basis).
  - **15% Target:** Optimal, achieves 11,344.44 kg CO2e (**21.3% actual reduction**).
  - **20% Target:** Optimal, achieves 11,344.44 kg CO2e (**21.3% actual reduction**).
  - **25% Target:** **Infeasible** (exceeds max feasible reduction of 24.0%).
  - **30% Target:** **Infeasible**.
- **Repair vs. Optimization Split (`optimization/feasible_baseline_analysis.py`):**
  - Total reduction = 3,068.24 kg CO2e.
  - Repair component (swapping initial vehicles violating payload/range) = **7.25 kg CO2e (0.24%)**.
  - Optimization component (reassigning valid vehicles to lower-emission modes) = **3,060.99 kg CO2e (99.76%)**.

---

## Summary

| Dataset / Component | Rows | Authenticity | Pipeline Role |
|---|---|---|---|
| Scope 3 Clean Training Data | 1,069 | 100% Real (NZDPU / CDP / ADEME) | ML prediction (`scope3_xgboost_clean.pkl`) |
| Pladifes COGEM Validation | 13 | External third-party benchmark (10 independent, 3 overlap) | Independent validation audit (`cogem_validation_clean.csv`) |
| Logistics Synthetic Routing | 12,000 | Synthetic (disclosed) | PuLP MILP optimizer (consistent factor baseline) |
