"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import MetricCard from "@/components/MetricCard";
import DataCoverageCard from "@/components/DataCoverageCard";
import BackendBanner from "@/components/BackendBanner";
import Pill from "@/components/Pill";
import {
  Building2,
  Globe2,
  Cpu,
  TrendingDown,
  BarChart2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ErrorBar,
  Cell,
  CartesianGrid,
} from "recharts";

export default function DashboardPage() {
  const {
    data: coverage,
    error: coverageError,
  } = useQuery({
    queryKey: ["coverage-stats"],
    queryFn: api.getCoverageStats,
  });

  const {
    data: modelsData,
    error: modelsError,
  } = useQuery({
    queryKey: ["model-comparison"],
    queryFn: api.getModelComparison,
  });

  const {
    data: sectorsData,
  } = useQuery({
    queryKey: ["sector-breakdown"],
    queryFn: api.getSectorBreakdown,
  });

  const {
    data: validationData,
    error: validationError,
  } = useQuery({
    queryKey: ["validation-results"],
    queryFn: api.getValidationResults,
  });

  const hasAnyError = Boolean(coverageError || modelsError || validationError);

  const chartData =
    modelsData?.models.map((m) => ({
      name: m.model_name.replace(" (sklearn)", "").replace(" Regression", ""),
      fullName: m.model_name,
      cvMean: m.cv_r2_mean,
      std: m.cv_r2_std,
      testR2: m.test_r2,
      isSelected: m.is_selected,
    })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f2838]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-100">
              Industrial Carbon & Scope 3 Intelligence System
            </h1>
            <Pill variant="real-disclosure" label="Real Disclosures" />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Trained on 1,069 companies from self-reported disclosures (CDP / ADEME via NZDPU) with out-of-fold reliability calibration
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/predictions"
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#0369a1] hover:bg-[#0284c7] text-white transition-colors"
          >
            <span>Run prediction</span>
          </Link>
          <Link
            href="/reduction-advisor"
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#161f2d] hover:bg-[#1c2738] text-slate-300 border border-[#273549] transition-colors"
          >
            <span>Reduction advisor</span>
          </Link>
        </div>
      </div>

      <BackendBanner forcedError={hasAnyError} />

      {/* Top Metric Cards - Crisp, compact tiles without fluffy shadows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          title="Training Companies"
          value={coverage?.dataset_integrity.training_companies_retained || 1069}
          unit="firms"
          subtext="After excluding 137 anomalies"
          pillVariant="real-disclosure"
          pillLabel="NZDPU/CDP"
          icon={<Building2 className="w-4 h-4 text-slate-500" />}
        />

        <MetricCard
          title="Deployed Model"
          value="XGBoost"
          unit={`CV R² ${(modelsData?.models.find((m) => m.is_selected)?.cv_r2_mean ?? 0.487).toFixed(3)}`}
          subtext={`Lowest variance across folds (std ${(modelsData?.models.find((m) => m.is_selected)?.cv_r2_std ?? 0.0543).toFixed(4)})`}
          pillVariant="selected"
          pillLabel="champion"
          icon={<Cpu className="w-4 h-4 text-slate-500" />}
        />

        <MetricCard
          title="Jurisdictions Covered"
          value={51}
          unit="countries"
          subtext="France & Germany top R² (0.66, 0.64)"
          pillVariant="deterministic"
          pillLabel="CDU/ADEME"
          icon={<Globe2 className="w-4 h-4 text-slate-500" />}
        />

        <MetricCard
          title="Fleet Optimization"
          value="21.3%"
          unit="CO₂ cut"
          subtext="Consistent factor basis (max feasible 24.0%)"
          pillVariant="synthetic"
          pillLabel="PuLP MILP"
          icon={<TrendingDown className="w-4 h-4 text-[#2dd4bf]" />}
        />
      </div>

      {/* Mandatory Honesty Card */}
      <DataCoverageCard
        calculatedCount={coverage?.scope3_categories.calculated_count ?? 1}
        totalCount={coverage?.scope3_categories.total_count ?? 15}
        excludedCount={coverage?.dataset_integrity.excluded_companies ?? 137}
        correctedCount={coverage?.dataset_integrity.kg_vs_tonne_corrected ?? 35}
        retainedCount={coverage?.dataset_integrity.training_companies_retained ?? 1069}
      />

      {/* Model Comparison Section: Chart + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Model Bake-Off Chart with CV Variance */}
        <div className="lg:col-span-7 data-table-container p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#38bdf8]" />
                  Model Bake-Off: 5-Fold Cross Validation R²
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Performance spread across all 7 models is only 0.015. Error bars show ±1 standard deviation.
                </p>
              </div>
              <Pill variant="selected" label="XGBoost selected" />
            </div>

            <div className="h-60 w-full mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 15, right: 10, left: -20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#1f2838" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={10}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    domain={[0, 0.65]}
                    tickCount={6}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111722",
                      borderColor: "#232e3e",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#f8fafc",
                    }}
                    formatter={(val: any, name: any, item: any) => [
                      `CV R²: ${Number(val).toFixed(4)} (±${item.payload.std.toFixed(4)})`,
                      item.payload.fullName,
                    ]}
                  />
                  <Bar dataKey="cvMean" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isSelected ? "#2dd4bf" : "#243247"}
                      />
                    ))}
                    <ErrorBar
                      dataKey="std"
                      width={3}
                      strokeWidth={1.5}
                      stroke="#d97706"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-2 p-2.5 rounded bg-[#0c121b] border border-[#1e2736] text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Selection rationale:</strong> {modelsData?.selection_rationale || "XGBoost was deployed because it delivers robust cross-validation stability (CV std = 0.0543) and strong out-of-fold generalization across unseen filings."}
          </div>
        </div>

        {/* Right: Model Comparison Data Table */}
        <div className="lg:col-span-5 data-table-container p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-slate-100">
                Evaluation Metrics (1,069 Companies)
              </h3>
              <span className="text-[10px] text-slate-500 font-medium">5-Fold CV</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1f2838] text-slate-400">
                    <th className="text-left pb-2 font-medium">Model</th>
                    <th className="text-right pb-2 font-medium">CV Mean</th>
                    <th className="text-right pb-2 font-medium">CV Std</th>
                    <th className="text-right pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2331]">
                  {modelsData?.models.map((m, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-[#151c27] transition-colors ${
                        m.is_selected ? "bg-[#0b1d22]/40" : ""
                      }`}
                    >
                      <td className="py-2 font-medium text-slate-200">
                        {m.model_name}
                      </td>
                      <td className="py-2 text-right text-slate-100 num-tabular">
                        {m.cv_r2_mean.toFixed(4)}
                      </td>
                      <td
                        className={`py-2 text-right num-tabular ${
                          m.is_selected
                            ? "text-[#2dd4bf] font-semibold"
                            : "text-slate-400"
                        }`}
                      >
                        {m.cv_r2_std.toFixed(4)}
                      </td>
                      <td className="py-2 text-right">
                        <Pill
                          variant={m.is_selected ? "selected" : m.badge}
                          label={m.is_selected ? "selected" : undefined}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#1f2838] text-[11px] text-slate-400">
            Trained with log emissions, financials (revenue, employees, market cap, EBITDA), sector, and jurisdiction.
          </div>
        </div>
      </div>

      {/* Segment Reliability Snapshot */}
      <div className="data-table-container p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
          <div>
            <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2dd4bf]" />
              Held-Out Segment Reliability (Out-Of-Fold R²)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Each company was evaluated strictly by a cross-validation fold model that never saw it during training
            </p>
          </div>
          <Link
            href="/emissions-analytics"
            className="text-xs text-[#38bdf8] hover:underline font-medium"
          >
            View all segment breakdowns
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Best Sectors */}
          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[11px] font-medium text-slate-400 block mb-2">
              Top predictable sectors
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Renewable Energy</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.615</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Infrastructure</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.534</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Transportation</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.528</span>
              </div>
            </div>
          </div>

          {/* Top Jurisdictions */}
          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[11px] font-medium text-slate-400 block mb-2">
              Top predictable jurisdictions
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">France (ADEME)</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.711</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Germany</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.624</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Japan</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.521</span>
              </div>
            </div>
          </div>

          {/* Revenue Quartile Honesty */}
          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[11px] font-medium text-slate-400 block mb-2">
              Company size limitation
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Small Quartile</span>
                <span className="font-semibold text-[#2dd4bf] num-tabular">R² = 0.229</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Mid-Large Quartile</span>
                <span className="text-[#fbbf24] num-tabular">R² = 0.203</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Large Mega-Cap</span>
                <span className="text-[#f87171] num-tabular">R² = -0.055</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Against Independent Benchmark (Pladifes COGEM) */}
      {/* Validation Against Independent Benchmark (Pladifes COGEM) */}
      <div className="data-table-container p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1f2838]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#38bdf8]" />
                Independent Validation Benchmark: Pladifes COGEM (10 Independent Global Corporations)
              </h3>
              <Pill variant="real-disclosure" label="Zero-Tuning Benchmark" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict external validation comparing model predictions against independent third-party estimates with USD-normalized financials. Overlapping training firms are excluded from headline metrics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Pill variant="deterministic" label="10 Independent Firms" />
            <Pill variant="synthetic" label="3 Training Overlap Excluded" />
          </div>
        </div>

        {/* Headline Summary KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-medium">
              Median Error (Independent)
            </span>
            <span className="text-lg font-bold text-[#fbbf24] num-tabular block mt-0.5">
              {validationData?.headline_metrics.median_times_off != null
                ? `${validationData.headline_metrics.median_times_off.toFixed(1)}x off`
                : "281.9x off"}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Mean: {validationData?.headline_metrics.mean_times_off != null
                ? `${validationData.headline_metrics.mean_times_off.toFixed(1)}x`
                : "347.8x"}
            </span>
          </div>

          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-medium">
              Within 3x Accuracy
            </span>
            <span className="text-lg font-bold text-[#38bdf8] num-tabular block mt-0.5">
              {validationData?.headline_metrics.pct_within_3x != null
                ? `${validationData.headline_metrics.pct_within_3x.toFixed(1)}%`
                : "10.0%"}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              BMW (1.57x), GM (3.43x)
            </span>
          </div>

          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-medium">
              Systematic Under-Prediction
            </span>
            <span className="text-lg font-bold text-[#f87171] num-tabular block mt-0.5">
              {validationData?.headline_metrics.under_predicted_pct != null
                ? `${validationData.headline_metrics.under_predicted_pct.toFixed(0)}%`
                : "100%"}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {validationData?.headline_metrics.under_predicted_count ?? 10} of {validationData?.headline_companies_count ?? 10} under-predicted
            </span>
          </div>

          <div className="p-3 rounded bg-[#0d131c] border border-[#1e2736]">
            <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-medium">
              Within 80% CI
            </span>
            <span className="text-lg font-bold text-[#2dd4bf] num-tabular block mt-0.5">
              {validationData?.headline_metrics.in_reliability_range_count ?? 2} / {validationData?.headline_companies_count ?? 10}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              BMW & GM fall in 80% bounds
            </span>
          </div>
        </div>

        {/* Independent Validation Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2838] text-slate-400">
                <th className="text-left pb-2 font-medium">Company Name</th>
                <th className="text-left pb-2 font-medium">SICS Sector</th>
                <th className="text-right pb-2 font-medium">Revenue (USD)</th>
                <th className="text-right pb-2 font-medium">COGEM Estimate</th>
                <th className="text-right pb-2 font-medium">Model Prediction</th>
                <th className="text-right pb-2 font-medium">Times Off</th>
                <th className="text-center pb-2 font-medium">In 80% CI?</th>
                <th className="text-right pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b2331]">
              {(validationData?.independent_companies || validationData?.records.filter((r) => !r.in_training_set) || []).map((c, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-[#151c27] transition-colors"
                >
                  <td className="py-2.5 font-medium text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span>{c.company_name}</span>
                      {c.ticker_used && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({c.ticker_used})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-slate-400">
                    {c.sics_sector}
                  </td>
                  <td className="py-2.5 text-right text-slate-300 num-tabular">
                    {c.revenue_usd != null
                      ? `$${(c.revenue_usd / 1e9).toFixed(1)}B`
                      : c.revenue != null
                      ? `$${(c.revenue / 1e9).toFixed(1)}B`
                      : "Missing (NaN)"}
                  </td>
                  <td className="py-2.5 text-right text-slate-200 num-tabular">
                    {c.cogem_actual_scope3.toLocaleString()} tCO₂e
                  </td>
                  <td className="py-2.5 text-right font-medium text-[#38bdf8] num-tabular">
                    {c.our_predicted_scope3.toLocaleString()} tCO₂e
                  </td>
                  <td className="py-2.5 text-right text-[#fbbf24] font-medium num-tabular">
                    {c.times_off.toFixed(1)}x
                  </td>
                  <td className="py-2.5 text-center">
                    {c.in_reliability_range ? (
                      <span className="text-[#2dd4bf] font-medium">Yes</span>
                    ) : (
                      <span className="text-slate-500">No</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <Pill
                      variant="deterministic"
                      label="Independent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Training Set Overlap Section (Shown for Information Only) */}
        {((validationData?.overlap_companies && validationData.overlap_companies.length > 0) ||
          validationData?.records.some((r) => r.in_training_set)) && (
          <div className="mt-4 pt-4 border-t border-[#1f2838]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">
                In Training Set (Shown for Information Only — Excluded from Headline Metrics)
              </span>
              <Pill variant="synthetic" label="Overlap Companies" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs opacity-75">
                <thead>
                  <tr className="border-b border-[#1f2838] text-slate-400">
                    <th className="text-left pb-1.5 font-medium">Company Name</th>
                    <th className="text-left pb-1.5 font-medium">SICS Sector</th>
                    <th className="text-right pb-1.5 font-medium">Revenue (USD)</th>
                    <th className="text-right pb-1.5 font-medium">COGEM Estimate</th>
                    <th className="text-right pb-1.5 font-medium">Model Prediction</th>
                    <th className="text-right pb-1.5 font-medium">Times Off</th>
                    <th className="text-right pb-1.5 font-medium">Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2331]">
                  {(validationData?.overlap_companies || validationData?.records.filter((r) => r.in_training_set) || []).map((c, idx) => (
                    <tr key={idx} className="hover:bg-[#151c27]">
                      <td className="py-2 font-medium text-slate-300">{c.company_name}</td>
                      <td className="py-2 text-slate-400">{c.sics_sector}</td>
                      <td className="py-2 text-right text-slate-300 num-tabular">
                        {c.revenue_usd != null ? `$${(c.revenue_usd / 1e9).toFixed(1)}B` : "Missing"}
                      </td>
                      <td className="py-2 text-right text-slate-300 num-tabular">
                        {c.cogem_actual_scope3.toLocaleString()} tCO₂e
                      </td>
                      <td className="py-2 text-right text-[#38bdf8] num-tabular">
                        {c.our_predicted_scope3.toLocaleString()} tCO₂e
                      </td>
                      <td className="py-2 text-right text-[#fbbf24] num-tabular">{c.times_off.toFixed(1)}x</td>
                      <td className="py-2 text-right text-[11px] text-slate-400">{c.notes || "In training set"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Honest Limitations & Methodology Disclosures */}
        <div className="mt-4 p-3.5 rounded bg-[#0d131c] border border-[#1e2736] space-y-2 text-[11px] text-slate-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-slate-200 block">
                Independent Validation Methodology & Transparent Limitations:
              </strong>
              <p className="text-slate-400 leading-relaxed">
                {validationData?.limitation_note ||
                  "COGEM values are third-party model estimates from Pladifes/CGEE, not direct company disclosures. Their Scope 1/2 inputs are also estimates, and accounting definitions (especially downstream Scope 3 Category 11 use-of-sold-products for oil & gas majors) differ from CDP/ADEME corporate filings. The model systematically under-predicts very large emitters because tree models cannot extrapolate above the highest values in the training dataset (where only 7 companies had Scope 3 > 300M tCO2e and only 5 companies had revenue > USD 100 billion). All 10 independent test companies have revenues exceeding USD 100 billion."}
              </p>
              <p className="text-slate-400 leading-relaxed">
                <span className="text-slate-300 font-medium">Training Set Overlap (BP, Uniper, Volkswagen): </span>
                {validationData?.overlap_note ||
                  "Three companies in the 13-company COGEM dataset (BP P.L.C., Uniper SE, VOLKSWAGEN AG) are also present in the training set (scope3_final_corrected_usd_clean.csv). To maintain strict independence of validation metrics, these overlapping companies are excluded from headline metrics and presented separately for information only."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
