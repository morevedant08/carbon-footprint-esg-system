"""
clean.py

Cleans the raw NZDPU (Climate Data Utility) export of company-level
Scope 1 / Scope 2 / Scope 3 emissions data.

Input:  data/raw/nzdpu_companies_raw.xlsx
Output: data/processed/nzdpu_companies_clean.csv

What this script fixes:
  1. Real header row is buried a few rows down (Excel copy-paste artifact)
     -> detected and promoted automatically.
  2. Company names have "(opens in new tab)" suffix from the website link
     -> stripped.
  3. Emission values are strings like "685,701.41 tCO₂e" or "—"
     -> converted to proper floats, "—" becomes NaN.
  4. Two Scope 2 columns both got labelled "Market Based" during copy-paste
     -> the second one is renamed to "Location Based" (verify against the
        source site if you want to be 100% certain which is which).
  5. Rows that are entirely empty are dropped.
"""

import pandas as pd
import numpy as np
import re


RAW_PATH = "data/raw/nzdpu_companies_raw.xlsx"
OUT_PATH = "data/processed/nzdpu_companies_clean.csv"


def find_header_row(raw_df: pd.DataFrame) -> int:
    """Find the row index that actually contains the column headers."""
    for i, row in raw_df.iterrows():
        row_str = " ".join(str(v) for v in row.values)
        if "Company Name" in row_str and "Scope 1" in row_str:
            return i
    raise ValueError("Could not locate header row — inspect the file manually.")


def clean_emission_value(val):
    """Convert '685,701.41 tCO₂e' -> 685701.41 (float). '—' or blank -> NaN."""
    if pd.isna(val):
        return np.nan
    s = str(val).strip()
    if s in ("—", "-", "", "nan", "NaN"):
        return np.nan
    # remove unit text and thousands separators, keep digits/decimal/minus
    s = re.sub(r"tCO2?e", "", s, flags=re.IGNORECASE)
    s = s.replace(",", "").replace("tCO₂e", "").strip()
    s = re.sub(r"[^\d\.\-]", "", s)
    if s in ("", "-", "."):
        return np.nan
    try:
        return float(s)
    except ValueError:
        return np.nan


def clean_company_name(val):
    if pd.isna(val):
        return np.nan
    s = str(val)
    s = s.replace("(opens in new tab)", "").strip()
    return s


def load_and_clean(raw_path: str = RAW_PATH) -> pd.DataFrame:
    raw = pd.read_excel(raw_path, header=None)

    header_row = find_header_row(raw)
    df = pd.read_excel(raw_path, header=header_row)

    # Drop fully-empty rows/columns that sometimes survive the copy-paste
    df = df.dropna(axis=0, how="all")
    df = df.loc[:, ~df.columns.str.contains("^Unnamed", na=False)]

    # Standardize column names
    df.columns = [str(c).strip() for c in df.columns]

    rename_map = {}
    scope2_seen = 0
    for c in df.columns:
        cl = c.lower()
        if "company name" in cl:
            rename_map[c] = "company_name"
        elif "reporting year" in cl:
            rename_map[c] = "reporting_year"
        elif "data provider" in cl:
            rename_map[c] = "data_provider"
        elif "scope 1" in cl:
            rename_map[c] = "scope_1"
        elif "scope 2" in cl:
            scope2_seen += 1
            # first occurrence = market-based, second = location-based
            # (NZDPU export mislabeled both as "Market Based" in this pull —
            #  verify against the source site if exact attribution matters)
            rename_map[c] = "scope_2_market_based" if scope2_seen == 1 else "scope_2_location_based"
        elif "scope 3" in cl:
            rename_map[c] = "scope_3"

    df = df.rename(columns=rename_map)

    # Clean company names
    if "company_name" in df.columns:
        df["company_name"] = df["company_name"].apply(clean_company_name)

    # Clean numeric emission columns
    for col in ["scope_1", "scope_2_market_based", "scope_2_location_based", "scope_3"]:
        if col in df.columns:
            df[col] = df[col].apply(clean_emission_value)

    # Unified Scope 2: prefer market-based, fall back to location-based
    if "scope_2_market_based" in df.columns and "scope_2_location_based" in df.columns:
        df["scope_2"] = df["scope_2_market_based"].fillna(df["scope_2_location_based"])

    # Reporting year as int where possible
    if "reporting_year" in df.columns:
        df["reporting_year"] = pd.to_numeric(df["reporting_year"], errors="coerce")

    # Drop exact duplicate rows
    df = df.drop_duplicates()

    # Reset index
    df = df.reset_index(drop=True)

    return df


def summarize(df: pd.DataFrame) -> None:
    print(f"Total rows: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    print()
    print("Non-null counts:")
    print(df[["scope_1", "scope_2", "scope_3"]].notna().sum() if "scope_2" in df.columns else df.notna().sum())
    print()
    complete = df.dropna(subset=["scope_1", "scope_3"]) if "scope_1" in df.columns and "scope_3" in df.columns else df
    print(f"Rows with BOTH Scope 1 and Scope 3 present: {len(complete)}")
    if "scope_2" in df.columns:
        complete_all3 = df.dropna(subset=["scope_1", "scope_2", "scope_3"])
        print(f"Rows with Scope 1, 2, AND 3 all present: {len(complete_all3)}")


if __name__ == "__main__":
    df = load_and_clean()
    summarize(df)
    df.to_csv(OUT_PATH, index=False)
    print(f"\nSaved cleaned data to {OUT_PATH}")
