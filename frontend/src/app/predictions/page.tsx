"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Scope3PredictionRequest } from "@/lib/types";
import MetricCard from "@/components/MetricCard";
import BackendBanner from "@/components/BackendBanner";
import Pill from "@/components/Pill";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  Compass,
  AlertTriangle,
} from "lucide-react";

function roundToSigFigs(num: number, sigFigs: number = 3): number {
  if (num === 0 || !isFinite(num)) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(num)));
  const scale = Math.pow(10, sigFigs - 1 - magnitude);
  return Math.round(num * scale) / scale;
}

function formatSigFigs(num: number, sigFigs: number = 3): string {
  const rounded = roundToSigFigs(num, sigFigs);
  return rounded.toLocaleString();
}

export default function PredictionsPage() {
  const [formData, setFormData] = useState<Scope3PredictionRequest>({
    company_name: "Aarti Industries Ltd",
    scope_1: 45000,
    scope_2: 12000,
    sics_sector: "Resource Transformation",
    jurisdiction: "India",
    revenue: 500000000,
    employees: 1500,
    market_cap: 800000000,
    ebitda: 60000000,
  });

  const [expandedWhy, setExpandedWhy] = useState(true);

  const mutation = useMutation({
    mutationFn: (req: Scope3PredictionRequest) => api.predictScope3(req),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleTemplateSelect = (template: Scope3PredictionRequest) => {
    setFormData(template);
    mutation.mutate(template);
  };

  React.useEffect(() => {
    mutation.mutate(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templates: { name: string; desc: string; data: Scope3PredictionRequest }[] = [
    {
      name: "Toyota Motor Corp (Mega-Cap)",
      desc: "Triggers large-company extrapolation warning (Rev $331B USD)",
      data: {
        company_name: "Toyota Motor Corporation",
        scope_1: 2970000,
        scope_2: 2470000,
        sics_sector: "Transportation",
        jurisdiction: "Japan",
        revenue: 331000000000,
        employees: 375000,
        market_cap: 250000000000,
        ebitda: 35000000000,
      },
    },
    {
      name: "Mid-Market French Industrial",
      desc: "High reliability segment (France R² = 0.699)",
      data: {
        company_name: "Derichebourg SA",
        scope_1: 106987,
        scope_2: 15656,
        sics_sector: "Infrastructure",
        jurisdiction: "France",
        revenue: 3468900000,
        employees: 5256,
        market_cap: 1456314000,
        ebitda: 239100000,
      },
    },
    {
      name: "Indian Chemical Producer",
      desc: "Moderate reliability (Resource Transformation R² = 0.444, India R² = 0.380)",
      data: {
        company_name: "Aarti Industries Ltd",
        scope_1: 45000,
        scope_2: 12000,
        sics_sector: "Resource Transformation",
        jurisdiction: "India",
        revenue: 500000000,
        employees: 1500,
        market_cap: 800000000,
        ebitda: 60000000,
      },
    },
  ];

  const result = mutation.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f2838]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-100">
              Scope 3 Emissions Prediction
            </h1>
            <Pill variant="selected" label="XGBoost Regressor" />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Inference calibrated with out-of-fold prediction intervals and segment reliability disclosures
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill variant="real-disclosure" label="NZDPU Trained" />
          <Pill variant="deterministic" label="80% Interval" />
        </div>
      </div>

      <BackendBanner
        forcedError={Boolean(mutation.error)}
        errorMessage={mutation.error?.message}
        onRetry={() => mutation.mutate(formData)}
      />

      {/* Demonstration Profiles */}
      <div className="data-table-container p-4">
        <span className="text-xs font-medium text-slate-300 block mb-2">
          In-Domain Demonstration Profiles
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {templates.map((t, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleTemplateSelect(t.data)}
              className="cursor-pointer text-left p-2.5 rounded bg-[#0f1520] hover:bg-[#161f2d] border border-[#1f2939] hover:border-[#2f3d53] transition-colors"
            >
              <span className="font-medium text-xs text-slate-200 block truncate">
                {t.name}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {t.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Form on Left, Forecast Card on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Input Form */}
        <div className="lg:col-span-5 data-table-container p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#38bdf8]" />
              Operational & Financial Parameters
            </h3>
            <span className="text-[10px] text-slate-500 font-medium">Model Inputs</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Company Name
              </label>
              <input
                type="text"
                required
                value={formData.company_name}
                onChange={(e) =>
                  setFormData({ ...formData, company_name: e.target.value })
                }
                className="w-full px-3 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] font-medium"
                placeholder="e.g. Acme Industrial Corp"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  SICS Sector
                </label>
                <select
                  value={formData.sics_sector}
                  onChange={(e) =>
                    setFormData({ ...formData, sics_sector: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7]"
                >
                  <option value="Resource Transformation">Resource Transformation</option>
                  <option value="Infrastructure">Infrastructure</option>
                  <option value="Transportation">Transportation</option>
                  <option value="Extractives & Minerals Processing">
                    Extractives & Minerals
                  </option>
                  <option value="Renewable Resources & Alternative Energy">
                    Renewable Resources
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Jurisdiction (Country)
                </label>
                <input
                  type="text"
                  required
                  value={formData.jurisdiction}
                  onChange={(e) =>
                    setFormData({ ...formData, jurisdiction: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7]"
                  placeholder="e.g. France, India, Japan"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Scope 1 (Direct tCO₂e)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={formData.scope_1}
                  onChange={(e) =>
                    setFormData({ ...formData, scope_1: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] num-tabular"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Scope 2 (Electricity tCO₂e)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={formData.scope_2}
                  onChange={(e) =>
                    setFormData({ ...formData, scope_2: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] num-tabular"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#1f2939]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-400">
                  Financial indicators (improves prediction accuracy)
                </span>
                <span className="text-[10px] text-slate-500">Optional</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    Annual Revenue (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.revenue || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        revenue: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] num-tabular text-xs"
                    placeholder="e.g. 500000000"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Employees</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.employees || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        employees: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] num-tabular text-xs"
                    placeholder="e.g. 2500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    Market Cap (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.market_cap || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        market_cap: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] num-tabular text-xs"
                    placeholder="e.g. 1200000000"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">EBITDA (USD)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.ebitda || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ebitda: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c121b] border border-[#1f2939] text-slate-100 focus:outline-none focus:border-[#0284c7] num-tabular text-xs"
                    placeholder="e.g. 80000000"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="cursor-pointer w-full py-2 px-4 rounded bg-[#0369a1] hover:bg-[#0284c7] text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing inference...</span>
                </>
              ) : (
                <span>Predict Scope 3 Value Chain Emissions</span>
              )}
            </button>
          </form>
        </div>

        {/* Right: Forecast Card with Interval & Disclosure */}
        <div className="lg:col-span-7 space-y-5">
          {result ? (
            <div className="disclosure-panel p-5 border-l-4 border-l-[#0284c7]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#1f2838]">
                <div>
                  <span className="text-xs font-medium text-slate-400 block">
                    Forecast Value Chain Scope 3
                  </span>
                  <h2 className="text-base font-semibold text-slate-100 mt-0.5">
                    {result.company_name}
                  </h2>
                  {result.reliability_note && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {result.reliability_note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {result.no_better_than_average ? (
                    <Pill
                      variant="low-reliability"
                      label="NO BETTER THAN AVERAGE FOR THIS GROUP"
                    />
                  ) : (
                    <Pill
                      variant={
                        (result.reliability_tier || result.segment_reliability.reliability_tier) === "high"
                          ? "high-reliability"
                          : (result.reliability_tier || result.segment_reliability.reliability_tier) === "medium"
                          ? "moderate-reliability"
                          : "low-reliability"
                      }
                      label={`${(result.reliability_tier || result.segment_reliability.reliability_tier).toUpperCase()} RELIABILITY`}
                    />
                  )}
                  <Pill
                    variant="deterministic"
                    label={result.confidence_interval_level}
                  />
                </div>
              </div>

              {result.no_better_than_average && result.no_better_than_average_note && (
                <div className="mt-3 p-2.5 rounded bg-[#291417] border border-[#f87171]/50 text-xs text-[#fca5a5] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
                  <span>{result.no_better_than_average_note}</span>
                </div>
              )}

              {/* Confidence Interval Display (Never a Bare Point Number) */}
              <div className="py-5 border-b border-[#1f2838]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400 block">
                    Prediction Range ({result.confidence_interval_level}):
                  </span>
                  {result.extrapolation_warning && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-950/70 border border-amber-500 text-amber-300 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Extrapolation Warning: Large Emitter
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-baseline gap-2.5 my-1.5">
                  <span className="text-2xl sm:text-3xl font-bold text-slate-100 num-tabular tracking-tight">
                    {formatSigFigs(result.ci_lower_tco2e, 3)} to {formatSigFigs(result.ci_upper_tco2e, 3)}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    tCO₂e (80% empirical interval)
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-medium mt-1">
                  Point estimate: <span className="font-semibold text-[#38bdf8] num-tabular">{formatSigFigs(result.predicted_scope3_tco2e, 3)} tCO₂e</span>
                </div>

                {/* Interval Bounds Graphic */}
                {(() => {
                  const lower = Math.max(1, result.ci_lower_tco2e);
                  const upper = Math.max(2, result.ci_upper_tco2e);
                  const point = Math.max(1, result.predicted_scope3_tco2e);
                  const spanRatio = upper / lower;
                  const useLog = spanRatio > 3;

                  let markerPercent: number;
                  if (useLog) {
                    const logLower = Math.log10(lower);
                    const logUpper = Math.log10(upper);
                    const logPoint = Math.log10(point);
                    markerPercent = ((logPoint - logLower) / Math.max(0.001, logUpper - logLower)) * 100;
                  } else {
                    markerPercent = ((point - lower) / Math.max(1, upper - lower)) * 100;
                  }
                  const clampedPercent = Math.min(96, Math.max(4, markerPercent));

                  return (
                    <div className="mt-3.5 p-3.5 rounded bg-[#0d131c] border border-[#1e2736] space-y-2.5">
                      <div className="flex items-center justify-between text-xs num-tabular text-slate-300">
                        <div>
                          <span className="text-slate-500 block text-[10px]">
                            Lower Bound (10th percentile)
                          </span>
                          <span className="font-semibold text-[#38bdf8] text-xs">
                            {formatSigFigs(result.ci_lower_tco2e, 3)} tCO₂e
                          </span>
                        </div>

                        <div className="text-center">
                          <span className="text-slate-500 block text-[10px]">
                            Point Estimate
                          </span>
                          <span className="font-semibold text-slate-200 text-xs">
                            {formatSigFigs(result.predicted_scope3_tco2e, 3)} tCO₂e
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-slate-500 block text-[10px]">
                            Upper Bound (90th percentile)
                          </span>
                          <span className="font-semibold text-[#38bdf8] text-xs">
                            {formatSigFigs(result.ci_upper_tco2e, 3)} tCO₂e
                          </span>
                        </div>
                      </div>

                      {/* True Location Range Visualizer */}
                      <div className="relative w-full h-3 bg-[#1e2736] rounded-full overflow-hidden mt-1.5">
                        <div className="absolute inset-y-0 inset-x-0 bg-gradient-to-r from-[#0369a1] via-[#0284c7] to-[#38bdf8] rounded-full opacity-60" />
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-white shadow-sm shadow-white -translate-x-1/2 rounded"
                          style={{ left: `${clampedPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{useLog ? "Log-scale range bar (span > 3x)" : "Linear range bar"}</span>
                        <span>Marker at {clampedPercent.toFixed(0)}% ({formatSigFigs(result.predicted_scope3_tco2e, 3)} tCO₂e)</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Prominent Amber Callout for Large-Company Extrapolation */}
                {result.extrapolation_warning && (
                  <div className="mt-3 p-3.5 rounded border border-amber-500/70 bg-amber-950/25 text-amber-100 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                        Large-Company Extrapolation Warning
                      </h4>
                      <p className="text-xs text-amber-100/90 leading-relaxed">
                        This company is larger than most companies the model was trained on. Predictions for the largest emitters are systematically too low (see validation).
                      </p>
                      {result.extrapolation_note && (
                        <p className="text-[11px] text-amber-300/80 font-mono mt-0.5">
                          {result.extrapolation_note}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Expandable "Why These Numbers" Disclosure */}
              <div className="mt-3.5">
                <button
                  type="button"
                  onClick={() => setExpandedWhy(!expandedWhy)}
                  className="cursor-pointer flex items-center justify-between w-full text-left text-xs font-medium text-slate-300 hover:text-white transition-colors py-1.5"
                >
                  <span className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Why these numbers? (Segment Reliability Audit)</span>
                  </span>
                  {expandedWhy ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {expandedWhy && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#1f2838] space-y-2.5 text-xs text-slate-300">
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      {result.interval_method || "10th and 90th percentile of out-of-fold log-residuals in matching segment (80% empirical prediction interval)"}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="p-2 rounded bg-[#0d131c] border border-[#1e2736]">
                        <span className="text-[10px] text-slate-500 block">
                          Sector Baseline
                        </span>
                        <span className="font-medium text-slate-200 truncate block text-xs">
                          {result.segment_reliability.sector}
                        </span>
                        <span className="text-[#2dd4bf] font-medium text-xs mt-0.5 block num-tabular">
                          R² = {result.segment_reliability.sector_r2.toFixed(3)}
                        </span>
                      </div>

                      <div className="p-2 rounded bg-[#0d131c] border border-[#1e2736]">
                        <span className="text-[10px] text-slate-500 block">
                          Jurisdiction
                        </span>
                        <span className="font-medium text-slate-200 truncate block text-xs">
                          {result.segment_reliability.jurisdiction}
                        </span>
                        <span className="text-[#2dd4bf] font-medium text-xs mt-0.5 block num-tabular">
                          R² = {result.segment_reliability.jurisdiction_r2.toFixed(3)}
                        </span>
                      </div>

                      <div className="p-2 rounded bg-[#0d131c] border border-[#1e2736]">
                        <span className="text-[10px] text-slate-500 block">
                          Revenue Quartile
                        </span>
                        <span className="font-medium text-slate-200 truncate block text-xs">
                          {result.segment_reliability.revenue_quartile}
                        </span>
                        <span className="text-[#2dd4bf] font-medium text-xs mt-0.5 block num-tabular">
                          {result.segment_reliability.revenue_quartile_r2 != null
                            ? `R² = ${result.segment_reliability.revenue_quartile_r2.toFixed(3)}`
                            : "Imputed / NA"}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-[#0d131c] border border-[#1e2736] text-[11px] text-slate-400 leading-relaxed">
                      <strong>Composite Reliability:</strong> R² ={" "}
                      <span className="text-slate-200 font-semibold num-tabular">
                        {result.segment_reliability.composite_r2.toFixed(3)}
                      </span>
                      {" "}(unweighted mean of sector R² = {result.segment_reliability.sector_r2.toFixed(3)}, jurisdiction R² = {result.segment_reliability.jurisdiction_r2.toFixed(3)}
                      {result.segment_reliability.revenue_quartile_r2 != null ? `, revenue quartile R² = ${result.segment_reliability.revenue_quartile_r2.toFixed(3)}` : ""}).
                      {" "}{result.note}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="data-table-container p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
              <Compass className="w-8 h-8 text-slate-600 mb-2" />
              <h3 className="text-sm font-semibold text-slate-200">
                Awaiting Company Inputs
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                Provide parameters on the left or select a demonstration profile to calculate Scope 3 emissions with honest prediction intervals.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
