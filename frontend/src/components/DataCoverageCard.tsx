"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  FileText,
  AlertTriangle,
} from "lucide-react";
import Pill from "./Pill";

interface DataCoverageCardProps {
  calculatedCount?: number;
  totalCount?: number;
  excludedCount?: number;
  correctedCount?: number;
  retainedCount?: number;
}

export default function DataCoverageCard({
  calculatedCount = 1,
  totalCount = 15,
  excludedCount = 137,
  correctedCount = 35,
  retainedCount = 1069,
}: DataCoverageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const percentage = Math.round((calculatedCount / totalCount) * 100);

  const unmodeledCategories = [
    "Cat 1: Purchased Goods & Services",
    "Cat 2: Capital Goods",
    "Cat 3: Fuel- and Energy-Related Activities",
    "Cat 4: Upstream Transportation & Distribution",
    "Cat 5: Waste Generated in Operations",
    "Cat 6: Business Travel",
    "Cat 7: Employee Commuting",
    "Cat 8: Upstream Leased Assets",
    "Cat 9: Downstream Transportation & Distribution",
    "Cat 10: Processing of Sold Products",
    "Cat 11: Use of Sold Products",
    "Cat 12: End-of-Life Treatment of Sold Products",
    "Cat 13: Downstream Leased Assets",
    "Cat 14: Franchises",
    "Cat 15: Investments",
  ];

  return (
    <div className="disclosure-panel p-5 border-l-4 border-l-[#d97706] relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
        <div className="flex items-start gap-2.5">
          <div className="p-1 rounded bg-[#291b07] border border-[#78350f] text-[#fbbf24] mt-0.5">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100">
              GHG Protocol Scope 3 Data Coverage & Disclosure Honesty
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Transparent demarcation of calculated totals, unmodeled sub-categories, and dataset exclusions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Pill variant="cost-not-modelled" label="logistics costs synthetic" />
          <Pill variant="real-disclosure" label="NZDPU/CDP real data" />
        </div>
      </div>

      {/* Progress Bar & Fraction */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-300 font-medium">
            Scope 3 Categories Modeled:{" "}
            <span className="text-slate-100 font-semibold num-tabular">
              {calculatedCount} of {totalCount}
            </span>
          </span>
          <span className="text-slate-400 num-tabular">{percentage}% calculated</span>
        </div>

        {/* Utilitarian Progress Bar */}
        <div className="w-full bg-[#1e2736] h-1.5 rounded overflow-hidden">
          <div
            className="bg-[#38bdf8] h-full rounded transition-all duration-300"
            style={{ width: `${Math.max(percentage, 7)}%` }}
          />
        </div>
      </div>

      {/* Structured Callout Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 mb-3.5">
        <div className="p-3 rounded bg-[#0f151f] border border-[#1f2939]">
          <span className="font-semibold text-slate-200 block mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24]" />
            What is NOT yet calculated:
          </span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Only aggregate Scope 3 total is modeled. <strong>14 of 15</strong> GHG Protocol Scope 3
            sub-categories are not broken out because source disclosures in NZDPU report total Scope 3.
          </p>
        </div>

        <div className="p-3 rounded bg-[#0f151f] border border-[#1f2939]">
          <span className="font-semibold text-slate-200 block mb-1 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#38bdf8]" />
            Dataset Integrity & Exclusions:
          </span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            <strong>{retainedCount.toLocaleString()} companies</strong> in training set after excluding{" "}
            <strong className="text-slate-200">{excludedCount} companies</strong> with irreconcilable
            data-quality issues (ratio far from sector median). 35 were corrected for kg-vs-tonne unit errors; none were fabricated.
          </p>
        </div>
      </div>

      {/* Expandable Category Audit */}
      <div className="border-t border-[#1f2838] pt-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="cursor-pointer flex items-center justify-between w-full text-left text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>Audit full 15 GHG Protocol Scope 3 categories</span>
            <span className="text-[10px] bg-[#161f2d] px-1.5 py-0.5 rounded text-slate-400 border border-[#233145] num-tabular">
              {calculatedCount} modeled / {totalCount - calculatedCount} unmodeled
            </span>
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-[#1f2838] space-y-3 text-xs">
            <div className="p-2.5 rounded bg-[#0b1b24] border border-[#0369a1]/40 flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#38bdf8] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-200">
                  Calculated Category: Aggregate Value-Chain Scope 3
                </span>
                <p className="text-slate-400 mt-0.5 text-[11px]">
                  Trained on self-reported disclosures (CDP / ADEME via NZDPU). Deployed model: XGBoost (CV R² = 0.4874, CV std = 0.0543).
                </p>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-400 block mb-2">
                Unmodeled categories (plain disclosure):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {unmodeledCategories.map((cat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-1.5 rounded bg-[#0f1520] border border-[#1f2839] text-slate-400 text-[11px]"
                  >
                    <XCircle className="w-3 h-3 text-[#f87171]/70 shrink-0" />
                    <span className="truncate">{cat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded border-synthetic-dashed text-[#fbbf24] text-[11px] leading-relaxed">
              <strong>Logistics Modeling Disclosure:</strong> Fleet route optimization is demonstrated using a synthetic 12,000-delivery dataset because granular corporate routing data is commercially confidential. The cost-per-km values used by the MILP optimizer are documented synthetic assumptions, not real supplier pricing.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
