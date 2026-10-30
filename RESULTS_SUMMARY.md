# Results Summary: Round 3 Data Cleaning, Retraining, Validation & Optimizer Fixes

This document compiles all final empirical results, data audit tables, cross-validation metrics, independent validation results, and optimizer benchmarks for Round 3.

---

## 1. Currency Conversion & Foreign Exchange Rates

- **FX Date:** `2026-10-23`
- **Persistent Columns Added:** `fx_rate` (USD per unit of local currency) and `fx_date` (`2026-10-23`) added to all records in `data/processed/scope3_final_corrected_usd_clean.csv`.
- **Exchange Rates Table:**

| Currency Code | USD per Local Unit | Method & Verification Result |
|---|---|---|
| **EUR** | 1.120448 | **Verified:** Rate is ~1.12 USD/EUR. BASF local disclosure of €61.58B converts to $69.00B (6.90e10 USD), confirming EUR conversion was already correctly applied. |
| **GBP** | 1.337489 | Yahoo Finance pair `GBPUSD=X` on 2026-10-23. Minor denomination GBp scaled by 1/100. |
| **CHF** | 1.219795 | Yahoo Finance pair `CHFUSD=X` on 2026-10-23. |
| **JPY** | 0.006377 | Yahoo Finance pair `JPYUSD=X` (~156.8 JPY/USD). Largest currency group (199 firms). |
| **KRW** | 0.000754 | Yahoo Finance pair `KRWUSD=X` (~1,326 KRW/USD). |
| **CNY** | 0.149748 | Yahoo Finance pair `CNYUSD=X` (~6.68 CNY/USD). |
| **HKD** | 0.127530 | Yahoo Finance pair `HKDUSD=X` (~7.84 HKD/USD). |
| **CAD** | 0.723500 | Yahoo Finance pair `CADUSD=X`. |
| **AUD** | 0.669200 | Yahoo Finance pair `AUDUSD=X`. |
| **INR** | 0.011899 | Yahoo Finance pair `INRUSD=X`. |
| **BRL** | 0.175500 | Yahoo Finance pair `BRLUSD=X`. |
| **DKK** | 0.150240 | Yahoo Finance pair `DKKUSD=X`. |
| **SEK** | 0.095400 | Yahoo Finance pair `SEKUSD=X`. |
| **NOK** | 0.091700 | Yahoo Finance pair `NOKUSD=X`. |
| **PLN** | 0.250500 | Yahoo Finance pair `PLNUSD=X`. |
| **MXN** | 0.050400 | Yahoo Finance pair `MXNUSD=X`. |
| **TWD** | 0.031200 | Yahoo Finance pair `TWDUSD=X`. |
| **SGD** | 0.760100 | Yahoo Finance pair `SGDUSD=X`. |
| **ZAR** | 0.056800 | Yahoo Finance pair `ZARUSD=X`. Minor denomination ZAc scaled by 1/100. |
| **THB** | 0.029800 | Yahoo Finance pair `THBUSD=X`. |
| **MYR** | 0.230500 | Yahoo Finance pair `MYRUSD=X`. |
| **IDR** | 0.000064 | Yahoo Finance pair `IDRUSD=X`. |
| **CLP** | 0.001050 | Yahoo Finance pair `CLPUSD=X`. |
| **USD** | 1.000000 | Identity. |

- **Unusual Reporting Currencies:** 21 rows flagged by the data-quality check (e.g. multinational subsidiaries in Chile, Indonesia, or South Africa reporting in USD). Per instructions, rows were printed for review and retained without auto-removal.

---

## 2. Number of Companies with Revenue After Cleaning

- **Total Companies in Training Dataset:** 1,069 companies
- **Pre-Clean Companies with Verified USD Financials (`scope3_final_corrected_usd.csv`):** 568 companies
- **Verified Bad Matches Blanked (5 companies):**
  1. *Horizon Global Corporation* ($3,217 recorded revenue due to shell company ticker mismatch)
  2. *MOBICO GROUP PLC* (HKD financials pulled for UK transport operator)
  3. *CKD Corp* (KRW financials pulled for Japanese manufacturer)
  4. *Asia Cement Corporation* (KRW financials pulled for Taiwanese/Chinese corporation)
  5. *Titan* (CNY financials pulled for Belgian materials firm)
- **Policy Applied:** All financial columns (`revenue`, `market_cap`, `ebitda`, `employees`, `ticker`) set to `NaN` and `has_financials = 0`. No values were invented or imputed (`blanked_matches_log.csv`).
- **Post-Clean Companies with Verified USD Financials (`scope3_final_corrected_usd_clean.csv`):** **563 companies** (52.67% of dataset).

---

## 3. Old vs. New Model Comparison Table (7 Models)

Evaluated with 5-fold cross-validation and a 20% held-out test set (`random_state=42`) using `ml/train_all_models.py`.

| Model | Old CV R² Mean | Old CV R² Std | Clean CV R² Mean | Clean CV R² Std | Clean Test R² | Clean Test MAE | Selection Status |
|---|---|---|---|---|---|---|---|
| **XGBoost** | 0.4874 | 0.0543 | **0.4879** | **0.0534** | **0.4542** | **1.5643** | **Selected Champion** (Lowest CV fold std, lowest test MAE) |
| **Ridge Regression** | 0.4995 | 0.0592 | **0.4966** | 0.0627 | 0.4714 | 1.5847 | Regularized linear baseline |
| **Linear Regression** | 0.4991 | 0.0592 | **0.4963** | 0.0629 | 0.4711 | 1.5858 | Baseline linear model |
| **Extra Trees** | — | — | **0.4946** | 0.0581 | 0.4377 | 1.5757 | High-variance tree ensemble |
| **LightGBM** | 0.4828 | 0.0617 | **0.4889** | 0.0695 | 0.4406 | 1.5870 | Gradient boosted trees |
| **Random Forest** | 0.4784 | 0.0673 | **0.4863** | 0.0716 | 0.4269 | 1.5987 | Bagging ensemble |
| **Gradient Boosting** | 0.4973 | 0.0573 | **0.4694** | 0.0801 | 0.4360 | 1.5908 | Sklearn gradient booster |

*Artifacts Saved:* `data/processed/full_model_comparison_clean.csv`, `ml/model_artifacts/scope3_xgboost_clean.pkl`, `data/processed/model_reliability_by_segment_clean.csv`, and `data/processed/oof_residual_quantiles_clean.json`.

---

## 4. Intensity-Target Experiment (Cross-Validation Decided)

Evaluated via `ml/experiment_intensity_target.py` on `data/processed/scope3_final_corrected_usd_clean.csv`.

| Evaluation Slice | Absolute Target Model (`log_scope3`) | Intensity Target Model (`log_scope3 - log_revenue`) | Delta (Δ) | Decision Criteria Impact |
|---|---|---|---|---|
| **Valid Revenue Subset (n=563) Overall CV R²** | 0.4127 | 0.3678 | -0.0449 | Overall fit decreased |
| **Valid Revenue Subset CV MAE** | 1.5927 | 1.6373 | +0.0446 | Error increased |
| **Small Revenue Quartile R² (n=141)** | 0.1706 | 0.2037 | +0.0331 | Slight gain |
| **Mid-Small Revenue Quartile R² (n=141)** | 0.1417 | 0.0638 | -0.0779 | Moderate drop |
| **Mid-Large Revenue Quartile R² (n=140)** | 0.0911 | 0.1557 | +0.0646 | Moderate gain |
| **Large Revenue Quartile R² (n=141)** | **-0.2656** | **-0.5819** | **-0.3163** | **Degraded sharply** |
| **Full Dataset Combined OOF R²** | **0.4879** | **0.4402** | **-0.0476** | **Dropped by > 0.01** |

### Decision
- **DO NOT ADOPT (Null Result)**.
- **Reason:** Per protocol (Section 3.2), the intensity target was to be adopted *only* if Large quartile out-of-fold R² clearly improved AND overall R² did not fall by more than 0.01. Because Large quartile R² degraded from -0.2656 to -0.5819 (worse by -0.3163) and overall combined R² dropped by 0.0476, the intensity formulation was rejected and the absolute target model was retained.

---

## 5. Out-of-Fold Segment Reliability Table

Evaluated using out-of-fold cross-validation predictions from `scope3_xgboost_clean.pkl`:

### SICS Sectors
| SICS Sector | Out-of-Fold R² | Historical Companies (n) |
|---|---|---|
| Renewable Resources & Alternative Energy | 0.625 | 31 |
| Infrastructure | 0.536 | 319 |
| Transportation | 0.531 | 174 |
| Resource Transformation | 0.444 | 375 |
| Extractives & Minerals Processing | 0.273 | 170 |

### Jurisdictions (n ≥ 10)
| Jurisdiction | Out-of-Fold R² | Historical Companies (n) |
|---|---|---|
| France | 0.699 | 74 |
| Germany | 0.632 | 41 |
| Japan | 0.530 | 291 |
| Republic of Korea | 0.431 | 63 |
| India | 0.380 | 64 |
| United Kingdom | 0.370 | 86 |
| Brazil | 0.348 | 30 |
| United States of America | 0.246 | 100 |
| Other Jurisdictions | 0.532 | 190 |

### Revenue Quartiles (Companies with Verified Revenue)
| Revenue Quartile | Range (USD) | Out-of-Fold R² | Historical Companies (n) |
|---|---|---|---|
| **Small** | < $1.26 Billion | 0.245 | 141 |
| **Mid-Small** | $1.26B – $3.57B | 0.101 | 141 |
| **Mid-Large** | $3.57B – $9.70B | 0.191 | 140 |
| **Large** | > $9.70 Billion | **-0.047** | 141 |

*Note:* Because Large revenue quartile R² (-0.047) is below 0.10, the backend returns `no_better_than_average: true` and the UI explicitly warns: *"No better than the average for this group"*.

---

## 6. Training Set Distribution Counts (Mega-Emitters)

- **Training rows with Revenue > USD 100 Billion (`> 1e11 USD`):** **5 companies**
  - Toyota Motor Corporation: $331.0B
  - Volkswagen AG: $279.2B
  - Apple Inc.: $383.3B
  - BP P.L.C.: $213.0B
  - TotalEnergies SE: $218.9B
- **Training rows with Scope 3 > 300 Million tCO2e (`> 3e8 tCO2e`):** **7 companies**
  - TotalEnergies SE (423.0M), BP P.L.C. (337.5M), Volkswagen AG (336.5M), Shell, Petrobras, Eni, Equinor.

---

## 7. Independent COGEM Validation Metrics & Overlap List

Evaluated via `ml/validate_against_cogem.py` using `scope3_xgboost_clean.pkl` against the 13-company Pladifes COGEM dataset.

### Training Set Overlap (Excluded from Headline Metrics)
Three companies in the COGEM dataset are present in the NZDPU training set:
1. **BP P.L.C.:** COGEM = 337,515,648 tCO2e, Model = 560,139 tCO2e (602.56x off, under-predicted)
2. **Uniper SE:** COGEM = 48,228,000 tCO2e, Model = 23,892,112 tCO2e (2.02x off; missing revenue in yfinance)
3. **VOLKSWAGEN AKTIENGESELLSCHAFT:** COGEM = 336,547,000 tCO2e, Model = 19,348,740 tCO2e (17.39x off, under-predicted)

*Status:* Flagged as `in_training_set = True` and listed separately as "in training set; shown for information only".

### Headline Metrics on 10 Independent Companies (All Revenues > USD 100B)
| Metric | Value | Detail |
|---|---|---|
| **Median Times Off** | **281.92x** | Robust central error |
| **Mean Times Off** | **347.85x** | Skewed by upstream/downstream boundary differences |
| **% Within 2x** | **10.0%** | 1 of 10: BMW at 1.57x |
| **% Within 3x** | **10.0%** | 1 of 10: General Motors is at 3.43x |
| **Under-Predicted Count** | **10 / 10 (100.0%)** | Systematic under-prediction for mega-emitters |
| **Inside 80% Empirical CI Range** | **2 / 10 (20.0%)** | BMW and General Motors fall within out-of-fold 80% bounds |
| **Revenue > USD 100 Billion** | **10 / 10 (100.0%)** | Median times off: 281.92x, 100% under-predicted |
| **Revenue ≤ USD 100 Billion** | **0 companies** | No small/mid-cap independent validation data available |

*Methodological Note:* Zero tuning, recalibration, or rescaling was performed using COGEM data.

---

## 8. Optimizer Baseline & Feasibility Analysis

**Shipment Batch:** 200 shipments (`random_state=42`) from `data/synthetic/logistics_emissions.csv`

### Consistent Baseline Fix
- **Factor-Based Baseline (`sum(distance * emission_factor[original_vehicle])`):** **14,412.68 kg CO2e**
- **Recorded Reference Baseline (Dataset Recorded Total):** **13,344.52 kg CO2e**
- **Minimum Achievable Emissions:** **10,956.26 kg CO2e**
- **Maximum Feasible Reduction:** **24.0%** (exact boundary: 23.98% factor basis / 17.90% recorded basis)

### Target Feasibility Table (Section 5.2)
| Target Reduction | Solver Status | Factor Basis Actual Reduction | Recorded Basis Actual Reduction | Optimized Emissions (kg CO2e) | Cost Change |
|---|---|---|---|---|---|
| **10%** | **Optimal** | **21.3%** | **15.0%** | 11,344.44 | -11.9% |
| **15%** | **Optimal** | **21.3%** | **15.0%** | 11,344.44 | -11.9% |
| **20%** | **Optimal** | **21.3%** | **15.0%** | 11,344.44 | -11.9% |
| **25%** | **Infeasible** | N/A | N/A | N/A | Target exceeds 24.0% max feasible reduction |
| **30%** | **Infeasible** | N/A | N/A | N/A | Target exceeds 24.0% max feasible reduction |

### Repair vs. Optimization Split (`optimization/feasible_baseline_analysis.py`)
- **Total Potential Reduction (Unconstrained to Optimal):** **3,068.24 kg CO2e**
- **Repair Component (initial assignments violating payload or range constraints):** **7.25 kg CO2e (0.24%)**
- **Optimization Component (reassigning valid shipments to lower-emission modes):** **3,060.99 kg CO2e (99.76%)**

---

## 9. Execution & Integrity Audit (Steps Failed or Skipped)

- **Failed or Skipped Steps:** **None.** Every step (1.1–1.4, 2.1–2.2, 3.1–3.3, 4.1–4.4, 5.1–5.5, 6.1–6.3, 7.1–7.4, 8) was executed in sequence.
- **Audits & Checks:**
  - EUR currency exchange rate confirmed verified (~1.12 USD/EUR).
  - RapidFuzz ticker matching audit verified 39/40 correct matches.
  - 5 mismatches blanked with zero invented values.
  - Intensity target evaluated strictly via cross-validation and rejected with a transparent null result record.
  - Overlapping COGEM companies excluded from headline validation metrics.
  - Optimizer baseline unified to factor basis across backend and frontend.
  - All old files preserved; new outputs written under clean filenames (`_clean.csv`, `_clean.pkl`).
