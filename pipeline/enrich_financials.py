"""
enrich_financials.py

Enriches the NZDPU Scope 1/2/3 dataset with company financial data
(revenue, employees, market cap, EBITDA) pulled from Yahoo Finance via yfinance.

Per published research (GHGbench, arXiv:2605.13743), firm financials are the
single strongest driver of Scope 3 prediction accuracy - stronger than sector
or jurisdiction alone. This script adds that missing piece.

USAGE:
    1. pip install yfinance rapidfuzz pandas
    2. Place your cleaned NZDPU export as data/processed/nzdpu_v2_final.csv
       (columns expected: company_name, reporting_year, jurisdiction,
        sics_sector, scope_1, scope_2, scope_3)
    3. Run: python pipeline/enrich_financials.py

NOTE ON COVERAGE:
    Not every company in your dataset will be found - yfinance only covers
    publicly listed companies with a known ticker. Expect roughly 40-70%
    match rate depending on how many large-cap vs. small/private companies
    are in your dataset. This is normal and should be documented as a
    limitation, not hidden.
"""

import pandas as pd
import numpy as np
import yfinance as yf
import time
import re
import os
try:
    from rapidfuzz import fuzz
except ImportError:
    from difflib import SequenceMatcher
    class _FuzzFallback:
        @staticmethod
        def token_sort_ratio(s1: str, s2: str) -> float:
            w1 = " ".join(sorted(str(s1).split()))
            w2 = " ".join(sorted(str(s2).split()))
            return SequenceMatcher(None, w1, w2).ratio() * 100
    fuzz = _FuzzFallback()

INPUT_PATH = "data/processed/nzdpu_v2_final.csv"
OUTPUT_PATH = "data/processed/nzdpu_enriched_financials.csv"
FAILED_LOG_PATH = "data/processed/unmatched_companies.csv"

# ---------------------------------------------------------------------------
# STEP 1: Clean company names to improve ticker search hit rate
# ---------------------------------------------------------------------------

SUFFIXES_TO_STRIP = [
    r"\bLtd\.?\b", r"\bLimited\b", r"\bInc\.?\b", r"\bCorp\.?\b",
    r"\bCorporation\b", r"\bCo\.,?\s*Ltd\.?\b", r"\bGmbH\b", r"\bAG\b",
    r"\bS\.A\.\b", r"\bSA\b", r"\bPLC\b", r"\bN\.V\.\b", r"\bBV\b",
    r"\bAB\b", r"\bASA\b", r"\bOyj?\b", r"\bplc\b", r"\bK\.K\.\b",
]

def simplify_name(name: str) -> str:
    name = str(name)
    for pattern in SUFFIXES_TO_STRIP:
        name = re.sub(pattern, "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^\w\s]", "", name)  # strip punctuation
    return name.strip()


# ---------------------------------------------------------------------------
# STEP 2: Search for a ticker symbol given a company name
# ---------------------------------------------------------------------------

def find_ticker(company_name: str):
    """
    Uses yfinance's search endpoint to guess a ticker for a company name.
    Returns the best-guess ticker symbol, or None if no confident match.
    """
    query = simplify_name(company_name)
    try:
        search = yf.Search(query, max_results=5)
        quotes = search.quotes
        if not quotes:
            return None

        # Fuzzy-match the returned candidate names against our query
        best_score = 0
        best_symbol = None
        for q in quotes:
            candidate_name = q.get("shortname") or q.get("longname") or ""
            score = fuzz.token_sort_ratio(query.lower(), candidate_name.lower())
            if score > best_score:
                best_score = score
                best_symbol = q.get("symbol")

        # Only accept reasonably confident matches
        if best_score >= 60:
            return best_symbol
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# STEP 3: Currency Normalization and Financial Pulling
# ---------------------------------------------------------------------------

FIXED_FX_DATE = "2026-10-23"

# Rates to USD (1 unit of local currency = X USD) as of 2026-10-23 market close from Yahoo Finance
FX_RATES_TO_USD = {
    "USD": 1.0,
    "EUR": 1.120448,
    "JPY": 0.006377,
    "INR": 0.010558,
    "GBP": 1.337489,
    "GBp": 0.01337489,  # 1/100 GBP
    "KRW": 0.000754,
    "CAD": 0.714153,
    "CHF": 1.219795,
    "TWD": 0.030703,
    "BRL": 0.201402,
    "ZAR": 0.060679,
    "ZAc": 0.00060679,  # 1/100 ZAR
    "AUD": 0.701980,
    "THB": 0.029638,
    "NOK": 0.107234,
    "SEK": 0.100952,
    "CNY": 0.149748,
    "HKD": 0.127530,
    "DKK": 0.150131,
    "NZD": 0.568500,
    "MYR": 0.245086,
    "SGD": 0.783269,
    "PHP": 0.015769,
    "IDR": 0.000055,
    "AED": 0.272287,
}


def get_fx_rate(currency: str, date: str = FIXED_FX_DATE) -> float:
    """
    Returns the exchange rate to USD (1 local unit = X USD).
    Checks known dictionary first, then attempts a live pull for the fixed date.
    Returns np.nan if currency cannot be converted.
    """
    if not currency or pd.isna(currency):
        return np.nan
    curr = str(currency).strip()
    if curr == "USD":
        return 1.0
    if curr in FX_RATES_TO_USD:
        return FX_RATES_TO_USD[curr]

    # Handle sub-units
    if curr == "GBp":
        gbp_rate = get_fx_rate("GBP", date)
        return gbp_rate / 100.0 if pd.notna(gbp_rate) else np.nan
    if curr == "ZAc":
        zar_rate = get_fx_rate("ZAR", date)
        return zar_rate / 100.0 if pd.notna(zar_rate) else np.nan

    # Fallback to yfinance ticker lookup for the fixed date
    try:
        pair = f"{curr}USD=X"
        h = yf.Ticker(pair).history(start="2026-10-20", end="2026-10-25")
        if not h.empty:
            dates = h.index.strftime("%Y-%m-%d").tolist()
            target = date if date in dates else dates[-1]
            rate = float(h.loc[h.index.strftime("%Y-%m-%d") == target, "Close"].iloc[0])
            FX_RATES_TO_USD[curr] = rate
            return rate
    except Exception:
        pass

    return np.nan


def convert_financials_to_usd(
    financial_currency: str,
    trading_currency: str,
    revenue_local: float,
    market_cap_local: float,
    ebitda_local: float,
    employees: float = np.nan,
    fx_date: str = FIXED_FX_DATE,
):
    """
    Converts local financials to USD.
    - revenue and ebitda report in financialCurrency
    - marketCap in yfinance reports in trading currency (or GBP if currency is GBp)
    - If a currency cannot be converted, leaves financials as NaN and sets has_financials = 0.
    """
    fc = financial_currency or trading_currency
    tc = trading_currency or fc

    rate_rev = get_fx_rate(fc, date=fx_date)

    # For market cap, yfinance reports marketCap in GBP even if quote currency is GBp
    if tc == "GBp":
        rate_mc = get_fx_rate("GBP", date=fx_date)
    elif tc == "ZAc":
        rate_mc = get_fx_rate("ZAR", date=fx_date)
    else:
        rate_mc = get_fx_rate(tc, date=fx_date)

    if pd.isna(rate_rev):
        # Cannot convert revenue/ebitda currency: leave as NaN and flag has_financials = 0
        return {
            "financial_currency": fc,
            "revenue_local": revenue_local,
            "market_cap_local": market_cap_local,
            "ebitda_local": ebitda_local,
            "fx_rate_used": np.nan,
            "fx_date": fx_date,
            "revenue": np.nan,
            "market_cap": np.nan,
            "ebitda": np.nan,
            "employees": employees,
            "has_financials": 0,
        }

    rev_usd = revenue_local * rate_rev if pd.notna(revenue_local) else np.nan
    eb_usd = ebitda_local * rate_rev if pd.notna(ebitda_local) else np.nan

    if pd.notna(rate_mc):
        mc_usd = market_cap_local * rate_mc if pd.notna(market_cap_local) else np.nan
    else:
        mc_usd = np.nan

    has_fin = int(
        pd.notna(rev_usd)
        and pd.notna(mc_usd)
        and pd.notna(eb_usd)
        and pd.notna(employees)
    )

    return {
        "financial_currency": fc,
        "revenue_local": revenue_local,
        "market_cap_local": market_cap_local,
        "ebitda_local": ebitda_local,
        "fx_rate_used": rate_rev,
        "fx_date": fx_date,
        "revenue": rev_usd,
        "market_cap": mc_usd,
        "ebitda": eb_usd,
        "employees": employees,
        "has_financials": has_fin,
    }


def get_financials(ticker_symbol: str):
    """
    Pulls financials and currency information for a given ticker,
    normalizing values to USD using fixed-date FX rates.
    """
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info

        financial_currency = info.get("financialCurrency") or info.get("currency")
        trading_currency = info.get("currency") or financial_currency
        revenue = info.get("totalRevenue", np.nan)
        employees = info.get("fullTimeEmployees", np.nan)
        market_cap = info.get("marketCap", np.nan)
        ebitda = info.get("ebitda", np.nan)

        converted = convert_financials_to_usd(
            financial_currency=financial_currency,
            trading_currency=trading_currency,
            revenue_local=revenue,
            market_cap_local=market_cap,
            ebitda_local=ebitda,
            employees=employees,
        )
        return converted
    except Exception:
        return {
            "financial_currency": None,
            "revenue_local": np.nan,
            "market_cap_local": np.nan,
            "ebitda_local": np.nan,
            "fx_rate_used": np.nan,
            "fx_date": FIXED_FX_DATE,
            "revenue": np.nan,
            "market_cap": np.nan,
            "ebitda": np.nan,
            "employees": np.nan,
            "has_financials": 0,
        }


# ---------------------------------------------------------------------------
# MAIN & DATASET NORMALIZATION
# ---------------------------------------------------------------------------

def normalize_existing_dataset(
    input_path: str = "data/processed/scope3_final_corrected.csv",
    output_path: str = "data/processed/scope3_final_corrected_usd.csv",
    cache_path: str = "data/processed/ticker_currency_cache.json",
):
    """
    Reads the existing corrected dataset, maps currency and FX rates for each company,
    converts financials to USD, and writes out scope3_final_corrected_usd.csv.
    """
    import json
    df = pd.read_csv(input_path)
    print(f"Loaded {len(df)} companies from {input_path}")

    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, "r") as f:
            cache = json.load(f)

    currencies_seen = set()
    converted_count = 0
    failed_count = 0

    fin_currencies = []
    fx_rates_list = []
    rev_usd_list = []
    mc_usd_list = []
    eb_usd_list = []
    has_fin_list = []

    # Preserve local columns
    df["revenue_local"] = df["revenue"]
    df["market_cap_local"] = df["market_cap"]
    df["ebitda_local"] = df["ebitda"]

    for idx, row in df.iterrows():
        t = row["ticker"]
        rev_local = row["revenue_local"]
        mc_local = row["market_cap_local"]
        eb_local = row["ebitda_local"]
        emp = row["employees"]

        if pd.isna(t) or pd.isna(rev_local):
            fin_currencies.append(None)
            fx_rates_list.append(np.nan)
            rev_usd_list.append(np.nan)
            mc_usd_list.append(np.nan)
            eb_usd_list.append(np.nan)
            has_fin_list.append(0)
            continue

        info = cache.get(t, {})
        fc = info.get("financialCurrency") or info.get("currency")
        tc = info.get("currency") or fc

        if not fc:
            # Currency cannot be determined
            failed_count += 1
            fin_currencies.append(None)
            fx_rates_list.append(np.nan)
            rev_usd_list.append(np.nan)
            mc_usd_list.append(np.nan)
            eb_usd_list.append(np.nan)
            has_fin_list.append(0)
            continue

        converted = convert_financials_to_usd(
            financial_currency=fc,
            trading_currency=tc,
            revenue_local=rev_local,
            market_cap_local=mc_local,
            ebitda_local=eb_local,
            employees=emp,
        )

        if pd.isna(converted["revenue"]):
            failed_count += 1
        else:
            converted_count += 1
            currencies_seen.add(fc)

        fin_currencies.append(converted["financial_currency"])
        fx_rates_list.append(converted["fx_rate_used"])
        rev_usd_list.append(converted["revenue"])
        mc_usd_list.append(converted["market_cap"])
        eb_usd_list.append(converted["ebitda"])
        has_fin_list.append(converted["has_financials"])

    df["financial_currency"] = fin_currencies
    df["fx_rate_used"] = fx_rates_list
    df["fx_date"] = FIXED_FX_DATE
    df["revenue"] = rev_usd_list
    df["market_cap"] = mc_usd_list
    df["ebitda"] = eb_usd_list
    df["has_financials"] = has_fin_list

    # Recompute log features with USD financials
    df["log_scope1"] = np.log1p(df["scope_1"])
    df["log_scope2"] = np.log1p(df["scope_2"])
    df["log_scope3"] = np.log1p(df["scope_3"])
    df["log_revenue"] = np.log1p(df["revenue"])
    df["log_employees"] = np.log1p(df["employees"])
    df["log_market_cap"] = np.log1p(df["market_cap"])
    df["log_ebitda"] = np.log1p(df["ebitda"].clip(lower=0))

    df.to_csv(output_path, index=False)

    print("\n=== Currency Normalization Summary ===")
    print(f"Total dataset rows: {len(df)}")
    print(f"Companies successfully converted to USD: {converted_count}")
    print(f"Failed currency conversions: {failed_count}")
    print(f"Currencies converted ({len(currencies_seen)}): {sorted(list(currencies_seen))}")
    print(f"Conversion FX Date used: {FIXED_FX_DATE}")
    print(f"Saved normalized dataset to {output_path}")

    return df


def main():
    normalize_existing_dataset()


if __name__ == "__main__":
    main()
