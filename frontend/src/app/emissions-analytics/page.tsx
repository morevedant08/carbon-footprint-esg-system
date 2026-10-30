"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import MetricCard from "@/components/MetricCard";
import BackendBanner from "@/components/BackendBanner";
import Pill from "@/components/Pill";
import {
  BarChart2,
  Globe2,
  ShieldCheck,
  Building,
  Layers,
  Check,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from "recharts";

export default function EmissionsAnalyticsPage() {
  const [activeSegmentTab, setActiveSegmentTab] = useState<
    "Sector" | "Jurisdiction" | "Company Size (Revenue Quartile)"
  >("Sector");

  const {
    data: sectorData,
    error: sectorError,
  } = useQuery({
    queryKey: ["sector-breakdown"],
    queryFn: api.getSectorBreakdown,
  });

  const {
    data: jurisdictionData,
    error: jurError,
  } = useQuery({
    queryKey: ["jurisdiction-breakdown"],
    queryFn: api.getJurisdictionBreakdown,
  });

  const {
    data: reliabilityData,
    error: relError,
  } = useQuery({
    queryKey: ["reliability-by-segment"],
    queryFn: api.getReliabilityBySegment,
  });

  const {
    data: modelComparisonData,
    error: modelComparisonError,
  } = useQuery({
    queryKey: ["model-comparison"],
    queryFn: api.getModelComparison,
  });

  const {
    data: validationData,
    error: validationError,
  } = useQuery({
    queryKey: ["validation-results"],
    queryFn: api.getValidationResults,
  });

  const hasError = Boolean(
    sectorError || jurError || relError || modelComparisonError || validationError
  );

  const sectorChartData =
    sectorData?.sectors.map((s) => ({
      name: s.sector.length > 20 ? s.sector.slice(0, 18) + "..." : s.sector,
      fullName: s.sector,
      scope1: Math.round(s.scope_1_median),
      scope2: Math.round(s.scope_2_median),
      scope3: Math.round(s.scope_3_median),
      ratio: s.scope3_to_scope12_ratio,
      companies: s.company_count,
    })) || [];

  const jurChartData =
    jurisdictionData?.top_10.map((j) => ({
      name: j.jurisdiction === "United Kingdom of Great Britain and Northern Ireland"
        ? "United Kingdom"
        : j.jurisdiction === "United States of America"
        ? "United States"
        : j.jurisdiction,
      companies: j.company_count,
      scope3Median: Math.round(j.scope_3_median),
    })) || [];

  const currentReliabilityRecords =
    reliabilityData?.by_segment_type[activeSegmentTab] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f2838]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-100">
              Sector Analytics & Segment Reliability
            </h1>
            <Pill variant="real-disclosure" label="1,069 Real Disclosures" />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Sector distributions, geographic breakdowns, and held-out segment predictability
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill variant="deterministic" label="Sector Aggregates" />
          <Pill variant="high-reliability" label="Out-of-Fold R²" />
        </div>
      </div>

      <BackendBanner forcedError={hasError} />

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          title="Total Modeled Firms (Self-Reported CDP / ADEME)"
          value={sectorData?.total_companies || 1069}
          unit="companies"
          subtext="Self-reported disclosures (CDP / ADEME via NZDPU)"
          pillVariant="real-disclosure"
          icon={<Building className="w-4 h-4 text-slate-500" />}
        />

        <MetricCard
          title="Sectors Modeled"
          value={sectorData?.total_sectors || 5}
          unit="SICS sectors"
          subtext="Resource Trans. & Infra. dominate (65%)"
          pillVariant="deterministic"
          icon={<Layers className="w-4 h-4 text-slate-500" />}
        />

        <MetricCard
          title="Top Jurisdiction R²"
          value="0.711"
          unit="France"
          subtext="Germany second at R² = 0.624"
          pillVariant="high-reliability"
          pillLabel="highest reliability"
          icon={<ShieldCheck className="w-4 h-4 text-[#2dd4bf]" />}
        />

        <MetricCard
          title="Top Sector R²"
          value="0.615"
          unit="Renewables"
          subtext="Infrastructure R² = 0.534"
          pillVariant="high-reliability"
          icon={<BarChart2 className="w-4 h-4 text-[#38bdf8]" />}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Emissions by Sector */}
        <div className="lg:col-span-7 data-table-container p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-100">
                Median Corporate Emissions by Sector (tCO₂e)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Logarithmic scale prevents visual distortion from energy & extractives giants
              </p>
            </div>
            <Pill variant="real-disclosure" label="Medians" />
          </div>

          <div className="h-68 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sectorChartData}
                margin={{ top: 15, right: 10, left: 10, bottom: 20 }}
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
                  scale="log"
                  domain={[100, 50000000]}
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(val) =>
                    val >= 1000000
                      ? `${val / 1000000}M`
                      : val >= 1000
                      ? `${val / 1000}k`
                      : val
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111722",
                    borderColor: "#232e3e",
                    borderRadius: "4px",
                    fontSize: "11px",
                    color: "#f8fafc",
                  }}
                  formatter={(val: any, name: any) => [
                    `${Number(val).toLocaleString()} tCO₂e`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                <Bar dataKey="scope1" name="Scope 1 (Direct)" fill="#2563eb" radius={[2, 2, 0, 0]} />
                <Bar dataKey="scope2" name="Scope 2 (Electricity)" fill="#d97706" radius={[2, 2, 0, 0]} />
                <Bar dataKey="scope3" name="Scope 3 (Value chain)" fill="#0d9488" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Jurisdictions Distribution */}
        <div className="lg:col-span-5 data-table-container p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-100">
                  Top 10 Jurisdictions by Disclosure Volume
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Self-reported disclosures across CDP and ADEME via NZDPU
                </p>
              </div>
              <Globe2 className="w-4 h-4 text-slate-500" />
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={jurChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 25, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#1f2838" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={10}
                    width={85}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111722",
                      borderColor: "#232e3e",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#f8fafc",
                    }}
                    formatter={(val: any) => [`${val} Companies`, "Volume"]}
                  />
                  <Bar dataKey="companies" fill="#1e293b" radius={[0, 2, 2, 0]}>
                    {jurChartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index < 3 ? "#0284c7" : "#1e293b"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-2 text-[11px] text-slate-400">
            Japan (291), USA (100), and UK (86) comprise 45% of total disclosures.
          </div>
        </div>
      </div>

      {/* Sector Summary Data Table */}
      <div className="data-table-container p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-xs font-semibold text-slate-100">
              Industrial Sector Emission Statistics (Authoritative Training Set)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregated from 1,069 companies in scope3_final_corrected.csv
            </p>
          </div>
          <Pill variant="real-disclosure" label="Real Disclosures" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2838] text-slate-400">
                <th className="text-left pb-2 font-medium">SICS Sector</th>
                <th className="text-right pb-2 font-medium">Firms</th>
                <th className="text-right pb-2 font-medium">Dataset %</th>
                <th className="text-right pb-2 font-medium">Scope 1 (Median)</th>
                <th className="text-right pb-2 font-medium">Scope 2 (Median)</th>
                <th className="text-right pb-2 font-medium">Scope 3 (Median)</th>
                <th className="text-right pb-2 font-medium">Scope 3 / (S1+S2)</th>
                <th className="text-left pl-4 pb-2 font-medium">Representative Firms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b2331]">
              {sectorData?.sectors.map((s, idx) => (
                <tr key={idx} className="hover:bg-[#151c27] transition-colors">
                  <td className="py-2.5 font-medium text-slate-200">
                    {s.sector}
                  </td>
                  <td className="py-2.5 text-right text-slate-300 num-tabular">
                    {s.company_count}
                  </td>
                  <td className="py-2.5 text-right text-slate-400 num-tabular">
                    {s.pct_of_dataset}%
                  </td>
                  <td className="py-2.5 text-right text-slate-200 num-tabular">
                    {s.scope_1_median.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right text-slate-200 num-tabular">
                    {s.scope_2_median.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right font-medium text-[#2dd4bf] num-tabular">
                    {s.scope_3_median.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right text-[#38bdf8] num-tabular">
                    {s.scope3_to_scope12_ratio}x
                  </td>
                  <td className="py-2.5 pl-4 text-slate-400 truncate max-w-xs">
                    {s.sample_companies.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Segment Reliability Out-Of-Fold Analysis */}
      <div className="data-table-container p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2dd4bf]" />
              Held-Out Segment Reliability (Out-Of-Fold R²)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Each company evaluated strictly by a cross-validation fold model that never saw it during training
            </p>
          </div>

          <div className="inline-flex rounded bg-[#0b0f16] p-0.5 border border-[#1f2838]">
            {(
              [
                "Sector",
                "Jurisdiction",
                "Company Size (Revenue Quartile)",
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveSegmentTab(tab)}
                className={`cursor-pointer px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeSegmentTab === tab
                    ? "bg-[#18202d] text-slate-100 border border-[#2b394e]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab === "Company Size (Revenue Quartile)" ? "Company Size" : tab}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2838] text-slate-400">
                <th className="text-left pb-2 font-medium">Segment</th>
                <th className="text-right pb-2 font-medium">Historical Firms</th>
                <th className="text-right pb-2 font-medium">Held-Out R²</th>
                <th className="text-left pl-6 pb-2 font-medium">Predictability Band</th>
                <th className="text-right pb-2 font-medium">Confidence Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b2331]">
              {currentReliabilityRecords.map((r, idx) => {
                const tier =
                  r.r2 >= 0.55
                    ? "high-reliability"
                    : r.r2 >= 0.4
                    ? "moderate-reliability"
                    : "low-reliability";

                return (
                  <tr key={idx} className="hover:bg-[#151c27] transition-colors">
                    <td className="py-2.5 font-medium text-slate-200">
                      {r.segment}
                    </td>
                    <td className="py-2.5 text-right text-slate-400 num-tabular">
                      {r.n_companies}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-100 num-tabular">
                      {r.r2.toFixed(3)}
                    </td>
                    <td className="py-2.5 pl-6">
                      <div className="w-44 bg-[#1e2736] h-1.5 rounded overflow-hidden">
                        <div
                          className={`h-full rounded ${
                            r.r2 >= 0.55
                              ? "bg-[#2dd4bf]"
                              : r.r2 >= 0.4
                              ? "bg-[#38bdf8]"
                              : "bg-[#f87171]"
                          }`}
                          style={{ width: `${Math.max(10, r.r2 * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <Pill variant={tier} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3.5 p-2.5 rounded bg-[#0d131c] border border-[#1e2736] text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Revenue size finding:</strong> Tree-based regressors cannot extrapolate beyond training bounds. Mega-cap corporations report Scope 3 emissions orders of magnitude higher than median firms, resulting in lower R² (0.313) than small and mid-market firms (R² 0.413–0.484).
        </div>
      </div>

      {/* Data Fix & Currency Normalization Audit Card */}
      <div className="data-table-container p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1f2838]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#2dd4bf]" />
                Data Fix & Currency Normalization Audit Trail
              </h3>
              <Pill variant="real-disclosure" label="USD Normalization (2026-10-23)" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Empirical impact of converting mixed reporting currencies (JPY/EUR/KRW) to USD on model performance
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Pill variant="selected" label="XGBoost Champion" />
            <Pill variant="deterministic" label="5-Fold CV" />
          </div>
        </div>

        <div className="my-3.5 p-3 rounded bg-[#0d131c] border border-[#1e2736] text-[11px] text-slate-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-200 block mb-0.5">Audit Disclosure:</strong>
            <p className="text-slate-400 leading-relaxed">
              {modelComparisonData?.data_fix_note ||
                "Financial currency normalization: Previously, revenue, market cap, and EBITDA pulled from Yahoo Finance were in mixed reporting currencies (JPY/EUR/KRW alongside USD). All financials are now normalized to USD using fixed-date foreign exchange rates (2026-10-23). Both before and after metrics are reported openly."}
            </p>
          </div>
        </div>

        {/* Before and After Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2838] text-slate-400">
                <th className="text-left pb-2 font-medium">Model</th>
                <th className="text-right pb-2 font-medium">Old CV R² (Mixed Currencies)</th>
                <th className="text-right pb-2 font-medium">New CV R² (USD Normalized)</th>
                <th className="text-right pb-2 font-medium">Delta (Δ R²)</th>
                <th className="text-right pb-2 font-medium">CV Std (New)</th>
                <th className="text-right pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b2331]">
              {modelComparisonData?.models.map((newM, idx) => {
                const oldM = modelComparisonData?.old_models?.find(
                  (o) => o.model_name === newM.model_name
                );
                const delta = oldM ? newM.cv_r2_mean - oldM.cv_r2_mean : 0;
                return (
                  <tr
                    key={idx}
                    className={`hover:bg-[#151c27] transition-colors ${
                      newM.is_selected ? "bg-[#0b1d22]/40" : ""
                    }`}
                  >
                    <td className="py-2.5 font-medium text-slate-200">
                      {newM.model_name}
                    </td>
                    <td className="py-2.5 text-right text-slate-400 num-tabular">
                      {oldM ? oldM.cv_r2_mean.toFixed(4) : "—"}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-100 num-tabular">
                      {newM.cv_r2_mean.toFixed(4)}
                    </td>
                    <td
                      className={`py-2.5 text-right font-medium num-tabular ${
                        delta > 0
                          ? "text-[#2dd4bf]"
                          : delta < 0
                          ? "text-[#fbbf24]"
                          : "text-slate-400"
                      }`}
                    >
                      {delta > 0 ? `+${delta.toFixed(4)}` : delta.toFixed(4)}
                    </td>
                    <td className="py-2.5 text-right text-slate-400 num-tabular">
                      ±{newM.cv_r2_std.toFixed(4)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Pill
                        variant={newM.is_selected ? "selected" : newM.badge}
                        label={newM.is_selected ? "deployed champion" : undefined}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3.5 p-2.5 rounded bg-[#0d131c] border border-[#1e2736] text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Key Observation:</strong> Normalizing financial units slightly improved linear and ridge regularization baselines (Ridge CV R² 0.4959 → 0.4995) by eliminating extreme 1e14 scale outliers. Non-linear tree models remained consistent around R² ≈ 0.48–0.49 because tree splits on rank/log-scales are inherently invariant to monotonic scaling, confirming robustness to currency magnitude adjustments.
        </div>
      </div>

      {/* Independent COGEM Validation Benchmark */}
      <div className="data-table-container p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#38bdf8]" />
              Independent Benchmark: Pladifes COGEM Validation (10 Independent Corporations)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              External validation with USD-normalized financials; evaluated with honest out-of-fold intervals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill variant="real-disclosure" label="Pladifes COGEM" />
            <Pill variant="deterministic" label="10 of 10 Under-Predicted" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2838] text-slate-400">
                <th className="text-left pb-2 font-medium">Company Name</th>
                <th className="text-left pb-2 font-medium">SICS Sector</th>
                <th className="text-right pb-2 font-medium">Revenue (USD)</th>
                <th className="text-right pb-2 font-medium">COGEM Actual Scope 3</th>
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

        {/* Training Overlap Section */}
        {((validationData?.overlap_companies && validationData.overlap_companies.length > 0) ||
          validationData?.records.some((r) => r.in_training_set)) && (
          <div className="mt-4 pt-3.5 border-t border-[#1f2838]">
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

        <div className="mt-3.5 p-3 rounded bg-[#0d131c] border border-[#1e2736] text-[11px] text-slate-400 leading-relaxed space-y-1.5">
          <div>
            <strong className="text-slate-300">Benchmark assessment:</strong> Across 10 independent headline companies with USD financials, the model systematically under-predicts COGEM estimates (median error 281.9x, 100% under-predicted) because tree models cannot extrapolate to mega-cap emitter scales (&gt;300M tCO₂e). However, automotive leaders BMW (1.57x off) and GM (3.43x off) fall within the model&apos;s 80% out-of-fold confidence interval bounds.
          </div>
          <div>
            <strong className="text-slate-300">Training set overlap:</strong> BP P.L.C., Uniper SE, and VOLKSWAGEN AG are present in the NZDPU training dataset and are excluded from headline metrics.
          </div>
        </div>
      </div>
    </div>
  );
}
