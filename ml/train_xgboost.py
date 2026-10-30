"""
train_xgboost.py

Trains the ACTUAL XGBoost model for Scope 3 emission prediction,
using the enriched dataset (NZDPU disclosures + sector + jurisdiction +
yfinance financials).

This matches the README's stated model choice exactly (previous training
runs used scikit-learn's GradientBoostingRegressor as a stand-in, since
XGBoost couldn't be installed in the sandbox used to prototype this).

USAGE:
    1. pip install xgboost scikit-learn pandas numpy
    2. Ensure data/processed/scope3_final_enriched.csv exists
       (this was already generated and is included in your project folder)
    3. Run: python ml/train_xgboost.py

OUTPUT:
    - Prints Test R², Test MAE, and 5-fold Cross-Validation R² (mean + std)
    - Saves the trained model to ml/model_artifacts/scope3_xgboost.pkl
    - Saves a comparison CSV against the previous Random Forest baseline
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, KFold, GridSearchCV
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
import xgboost as xgb
import pickle
import os

INPUT_PATH = "data/processed/scope3_final_corrected_usd.csv"
# NOTE: uses the currency-normalized dataset (1,069 rows, financials in USD as of 2026-10-23).
MODEL_OUTPUT_PATH = "ml/model_artifacts/scope3_xgboost_usd.pkl"
COMPARISON_OUTPUT_PATH = "data/processed/model_comparison_results_usd.csv"


def build_features(df: pd.DataFrame):
    df = df.copy()

    # Log-transform skewed numeric fields (standard practice for emissions/financial data)
    df["log_scope1"] = np.log1p(df["scope_1"])
    df["log_scope2"] = np.log1p(df["scope_2"])
    df["log_scope3"] = np.log1p(df["scope_3"])
    df["log_revenue"] = np.log1p(df["revenue"])
    df["log_employees"] = np.log1p(df["employees"])
    df["log_market_cap"] = np.log1p(df["market_cap"])
    df["log_ebitda"] = np.log1p(df["ebitda"].clip(lower=0))

    # Flag whether real financial data was found (vs. imputed)
    df["has_financials"] = df[["revenue", "employees", "market_cap", "ebitda"]].notna().all(axis=1).astype(int)

    # Simplify jurisdiction to top 8 countries + "Other" (avoids sparse one-hot columns)
    top_countries = df["jurisdiction"].value_counts().head(8).index.tolist()
    df["jurisdiction_simplified"] = df["jurisdiction"].apply(lambda x: x if x in top_countries else "Other")

    return df


def main():
    df = pd.read_csv(INPUT_PATH)
    df = build_features(df)

    numeric_feats = ["log_scope1", "log_scope2", "log_revenue", "log_employees", "log_market_cap", "log_ebitda"]
    cat_feats = ["sics_sector", "jurisdiction_simplified"]

    X = df[numeric_feats + ["has_financials"] + cat_feats]
    y = df["log_scope3"]

    preprocessor = ColumnTransformer(transformers=[
        ("num", SimpleImputer(strategy="median"), numeric_feats),
        ("flag", "passthrough", ["has_financials"]),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_feats),
    ])

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    kf = KFold(n_splits=5, shuffle=True, random_state=42)

    # ------------------------------------------------------------------
    # Tune XGBoost with a small grid search (same spirit as the RF tuning
    # already done, so results are fairly comparable)
    # ------------------------------------------------------------------
    xgb_pipe = Pipeline([
        ("prep", preprocessor),
        ("model", xgb.XGBRegressor(objective="reg:squarederror", random_state=42, n_jobs=-1))
    ])

    param_grid = {
        "model__n_estimators": [200, 400],
        "model__max_depth": [3, 4, 6],
        "model__learning_rate": [0.02, 0.05, 0.1],
    }

    print("Running grid search for XGBoost (this may take a minute)...")
    grid = GridSearchCV(xgb_pipe, param_grid, cv=kf, scoring="r2", n_jobs=-1)
    grid.fit(X_train, y_train)

    print("\nBest XGBoost params:", grid.best_params_)
    best_xgb = grid.best_estimator_

    preds = best_xgb.predict(X_test)
    test_r2 = r2_score(y_test, preds)
    test_mae = mean_absolute_error(y_test, preds)
    cv_scores = cross_val_score(best_xgb, X, y, cv=kf, scoring="r2")

    print(f"\nXGBoost Test R²:  {test_r2:.4f}")
    print(f"XGBoost Test MAE: {test_mae:.4f}")
    print(f"XGBoost CV R² (mean): {cv_scores.mean():.4f}  (std: {cv_scores.std():.4f})")

    # ------------------------------------------------------------------
    # Also retrain baseline + Random Forest here for a clean, one-run
    # comparison table (avoids relying on separately-run earlier scripts)
    # ------------------------------------------------------------------
    comparison_models = {
        "Baseline (Linear Regression)": LinearRegression(),
        "Random Forest (tuned)": RandomForestRegressor(
            n_estimators=200, max_depth=6, min_samples_leaf=3, random_state=42
        ),
        "XGBoost (tuned)": best_xgb.named_steps["model"],
    }

    results = []
    for name, model in comparison_models.items():
        pipe = Pipeline([("prep", preprocessor), ("model", model)])
        pipe.fit(X_train, y_train)
        preds_i = pipe.predict(X_test)
        r2_i = r2_score(y_test, preds_i)
        mae_i = mean_absolute_error(y_test, preds_i)
        cv_i = cross_val_score(pipe, X, y, cv=kf, scoring="r2")
        results.append({
            "Model": name,
            "Test R2": round(r2_i, 4),
            "Test MAE": round(mae_i, 4),
            "CV R2 mean": round(cv_i.mean(), 4),
            "CV R2 std": round(cv_i.std(), 4),
        })

    results_df = pd.DataFrame(results)
    print("\n=== Final Model Comparison ===")
    print(results_df.to_string(index=False))

    os.makedirs("ml/model_artifacts", exist_ok=True)
    os.makedirs("data/processed", exist_ok=True)

    # Save the final trained XGBoost model (fit on ALL data for deployment)
    best_xgb.fit(X, y)
    with open(MODEL_OUTPUT_PATH, "wb") as f:
        pickle.dump(best_xgb, f)

    results_df.to_csv(COMPARISON_OUTPUT_PATH, index=False)

    print(f"\nSaved trained XGBoost model to {MODEL_OUTPUT_PATH}")
    print(f"Saved comparison table to {COMPARISON_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
