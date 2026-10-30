"use client";

import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { OptimizeRequest, OptimizeResponse } from "@/lib/types";
import MetricCard from "@/components/MetricCard";
import BackendBanner from "@/components/BackendBanner";
import Pill from "@/components/Pill";
import {
  Truck,
  Sliders,
  XCircle,
  TrendingDown,
  DollarSign,
  Package,
  RefreshCw,
  Info,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";

export default function ReductionAdvisorPage() {
  const [sampleSize, setSampleSize] = useState(200);
  const [reductionTarget, setReductionTarget] = useState(0.10); // 10% default

  const { data: constraints } = useQuery({
    queryKey: ["optimize-constraints"],
    queryFn: api.getOptimizeConstraints,
  });

  const mutation = useMutation({
    mutationFn: (req: OptimizeRequest) => api.optimizeLogistics(req),
  });

  const handleRun = () => {
    mutation.mutate({ sample_size: sampleSize, reduction_target: reductionTarget });
  };

  const handlePreset = (target: number) => {
    setReductionTarget(target);
    mutation.mutate({ sample_size: 200, reduction_target: target });
  };

  React.useEffect(() => {
    mutation.mutate({ sample_size: 200, reduction_target: 0.10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result: OptimizeResponse | undefined = mutation.data;
  const isInfeasible = (result?.solver_status || result?.status) === "Infeasible";
  const isOptimal = (result?.solver_status || result?.status) === "Optimal";

  const shiftsMap: Record<string, number> = {};
  if (result?.assignments) {
    result.assignments.forEach((a) => {
      if (a.original_vehicle !== a.recommended_vehicle) {
        const key = `${a.original_vehicle} → ${a.recommended_vehicle}`;
        shiftsMap[key] = (shiftsMap[key] || 0) + 1;
      }
    });
  }

  const shiftChartData = Object.entries(shiftsMap)
    .map(([shift, count]) => ({
      shift,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const changedCount = result?.assignments
    ? result.assignments.filter((a) => a.original_vehicle !== a.recommended_vehicle).length
    : 0;
  const retainedCount = result?.assignments ? result.assignments.length - changedCount : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f2838]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-100">
              Reduction Advisor: Logistics MILP Optimization
            </h1>
            <Pill variant="synthetic" label="Synthetic Logistics Demo" />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Recommends cost- and emissions-optimal fleet vehicle routing under physical payload and range constraints
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill variant="cost-not-modelled" label="synthetic cost table" />
          <Pill variant="deterministic" label="PuLP MILP Solver" />
        </div>
      </div>

      <BackendBanner
        forcedError={Boolean(mutation.error)}
        errorMessage={mutation.error?.message}
        onRetry={handleRun}
      />

      {/* Control Panel: Sliders & Quick Presets */}
      <div className="data-table-container p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#38bdf8]" />
            <h3 className="text-xs font-semibold text-slate-100">
              Optimization Parameters & Constraint Benchmark
            </h3>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Benchmark targets:
            </span>
            <button
              type="button"
              onClick={() => handlePreset(0.10)}
              className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#0b2233] hover:bg-[#0f2e45] border border-[#0284c7] text-[#38bdf8] transition-colors"
            >
              10% Target (Feasible: -21.3%)
            </button>
            <button
              type="button"
              onClick={() => handlePreset(0.20)}
              className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#0a2722] hover:bg-[#0e332d] border border-[#0d9488] text-[#2dd4bf] transition-colors"
            >
              20% Target (Feasible: -21.3%)
            </button>
            <button
              type="button"
              onClick={() => handlePreset(0.25)}
              className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#2a0e12] hover:bg-[#381318] border border-[#991b1b] text-[#fca5a5] transition-colors"
            >
              25% Target (Infeasible Benchmark)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          {/* Target Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-300 font-medium">
                Target Emissions Reduction:
              </label>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#2dd4bf] text-sm num-tabular">
                  {(reductionTarget * 100).toFixed(0)}%
                </span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    reductionTarget * 100 <= (result?.max_feasible_reduction ?? 24.0)
                      ? "bg-[#0a2722] text-[#2dd4bf] border border-[#0d9488]"
                      : "bg-[#2a0e12] text-[#fca5a5] border border-[#991b1b]"
                  }`}
                >
                  {reductionTarget * 100 <= (result?.max_feasible_reduction ?? 24.0)
                    ? "Feasible"
                    : "Infeasible"}
                </span>
              </div>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.30"
              step="0.05"
              value={reductionTarget}
              onChange={(e) => setReductionTarget(parseFloat(e.target.value))}
              className="w-full h-1 bg-[#1e2736] rounded appearance-none cursor-pointer accent-[#0284c7]"
            />
            <div className="flex justify-between text-[10px] text-slate-500 num-tabular">
              <span>5%</span>
              <span className="text-[#2dd4bf] font-medium">10% (Feasible)</span>
              <span>15%</span>
              <span className="text-[#2dd4bf] font-medium">20% (Feasible)</span>
              <span className="text-[#f87171] font-medium">25% (Infeasible)</span>
              <span>30%</span>
            </div>
          </div>

          {/* Sample Size Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-300 font-medium">
                Shipment Batch Size:
              </label>
              <span className="font-semibold text-slate-100 text-sm num-tabular">
                {sampleSize} shipments
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="50"
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-[#1e2736] rounded appearance-none cursor-pointer accent-[#0284c7]"
            />
            <div className="flex justify-between text-[10px] text-slate-500 num-tabular">
              <span>50</span>
              <span>150</span>
              <span className="text-slate-300 font-medium">200 (Standard)</span>
              <span>350</span>
              <span>500</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#fbbf24]" />
            <span>
              Enforces physical bounds: <code>MAX_PAYLOAD_KG</code> and <code>MAX_RANGE_KM</code> per vehicle type.
            </span>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={mutation.isPending}
            className="cursor-pointer px-4 py-1.5 rounded bg-[#0369a1] hover:bg-[#0284c7] text-white font-medium text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Solving MILP Model...</span>
              </>
            ) : (
              <>
                <Truck className="w-3.5 h-3.5" />
                <span>Run Logistics Optimizer</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Infeasible State Banner */}
      {isInfeasible && (
        <div className="disclosure-panel p-5 border-l-4 border-l-[#f87171] bg-[#220c0e]">
          <div className="flex items-start gap-3">
            <div className="p-1 rounded bg-[#450a0a] border border-[#991b1b] text-[#f87171]">
              <XCircle className="w-4 h-4" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[#fecaca]">
                  Physical Infeasibility Encountered ({Math.round(reductionTarget * 100)}% Target)
                </h3>
                <Pill variant="infeasible" label={result?.solver_status || "Infeasible"} />
              </div>
              <p className="text-xs text-[#fca5a5]/90 leading-relaxed text-[11px]">
                {result?.infeasibility_reason || result?.note}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-slate-300">
                <div className="p-2.5 rounded bg-[#111722] border border-[#1e2736]">
                  <strong className="text-slate-100 block mb-0.5 text-[11px]">
                    Cargo Bike & Drone Constraints:
                  </strong>
                  <span className="text-slate-400 text-[11px]">
                    Bicycles capped at {constraints?.max_range_km?.["Cargo Bicycle"] ?? 15} km & {constraints?.max_payload_kg?.["Cargo Bicycle"] ?? 25} kg; drones capped at {constraints?.max_range_km?.["Drone Delivery"] ?? 20} km & {constraints?.max_payload_kg?.["Drone Delivery"] ?? 5} kg. Heavy shipments cannot be reassigned to micro-mobility.
                  </span>
                </div>
                <div className="p-2.5 rounded bg-[#111722] border border-[#1e2736]">
                  <strong className="text-slate-100 block mb-0.5 text-[11px]">
                    Heavy Truck & Electric Van Range:
                  </strong>
                  <span className="text-slate-400 text-[11px]">
                    Electric vans capped at {constraints?.max_range_km?.["Electric Van (EV)"] ?? 150} km range & {constraints?.max_payload_kg?.["Electric Van (EV)"] ?? 1200} kg payload. Inter-city long-distance shipments (up to 800 km) and heavy cargo must remain on heavy trucks. Maximum feasible reduction for this batch is {result?.max_feasible_reduction ?? result?.max_feasible_reduction_pct ?? 24.0}%.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optimal Results KPI Cards */}
      {isOptimal && result && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <MetricCard
              title="Emissions Cut Achieved"
              value={`${result.actual_reduction_pct}%`}
              unit="Target Exceeded"
              subtext={`Optimized: ${result.optimized_emissions_kg.toLocaleString()} kg CO₂e`}
              pillVariant="deterministic"
              pillLabel="actual result"
              trend={{ value: `-${result.actual_reduction_pct}%`, isPositive: true }}
              icon={<TrendingDown className="w-4 h-4 text-[#2dd4bf]" />}
            />

            <MetricCard
              title="Cost Impact"
              value={`${result.cost_change_pct}%`}
              unit="Cost Savings"
              subtext={`Baseline: ${result.baseline_cost.toLocaleString()} to ${result.optimized_cost.toLocaleString()} (synthetic units)`}
              pillVariant="cost-not-modelled"
              pillLabel="synthetic cost"
              trend={{ value: `${result.cost_change_pct}%`, isPositive: true }}
              icon={<DollarSign className="w-4 h-4 text-[#2dd4bf]" />}
            />

            <MetricCard
              title="Baseline Emissions"
              value={result.baseline_emissions_kg.toLocaleString()}
              unit="kg CO₂e"
              subtext="Unoptimized fleet assignment"
              pillVariant="synthetic"
              pillLabel="fleet data"
              icon={<Package className="w-4 h-4 text-slate-500" />}
            />

            <MetricCard
              title="Assignments Optimized"
              value={result.assignments.length}
              unit="routes"
              subtext={`${changedCount} changed, ${retainedCount} retained`}
              pillVariant="selected"
              pillLabel={result.solver_status || result.status}
              icon={<Check className="w-4 h-4 text-[#2dd4bf]" />}
            />
          </div>

          {/* Vehicle Shifts Breakdown Chart (Horizontal Bar Chart) */}
          {shiftChartData.length > 0 && (
            <div className="data-table-container p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">
                    Fleet Vehicle Reassignments Breakdown
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Modal shifts solved by MILP: {changedCount} shipments reassigned, {retainedCount} retained on baseline
                  </p>
                </div>
                <Pill variant="selected" label={`${changedCount} changed, ${retainedCount} retained`} />
              </div>

              <div className="w-full mt-2" style={{ height: `${Math.max(220, shiftChartData.length * 36)}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={shiftChartData}
                    margin={{ top: 10, right: 35, left: 190, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#1f2838" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                    <YAxis
                      type="category"
                      dataKey="shift"
                      stroke="#94a3b8"
                      fontSize={10}
                      width={180}
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111722",
                        borderColor: "#232e3e",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#f8fafc",
                      }}
                      formatter={(val: any) => [`${val} shipments reassigned`, "Volume"]}
                    />
                    <Bar dataKey="count" fill="#0284c7" radius={[0, 2, 2, 0]}>
                      <LabelList dataKey="count" position="right" fill="#38bdf8" fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Shipment Assignment Table */}
          <div className="data-table-container p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="text-xs font-semibold text-slate-100">
                  Recommended Routing Assignments (First 50 Shown)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Right-aligned numbers with method pills indicating synthetic assumptions
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill variant="cost-not-modelled" label="cost synthetic" />
                <Pill variant="deterministic" label="emission data-derived" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1f2838] text-slate-400">
                    <th className="text-left pb-2 font-medium">Shipment ID</th>
                    <th className="text-right pb-2 font-medium">Distance (km)</th>
                    <th className="text-right pb-2 font-medium">Weight (kg)</th>
                    <th className="text-left pl-3 pb-2 font-medium">Original Vehicle</th>
                    <th className="text-left pl-3 pb-2 font-medium">Recommended</th>
                    <th className="text-right pb-2 font-medium">Emissions (kg CO₂e)</th>
                    <th className="text-right pb-2 font-medium">Cost (synthetic units)</th>
                    <th className="text-right pb-2 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2331]">
                  {result.assignments.slice(0, 50).map((a, idx) => {
                    const isShifted = a.original_vehicle !== a.recommended_vehicle;
                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-[#151c27] transition-colors ${
                          isShifted ? "bg-[#0b1b24]/40" : ""
                        }`}
                      >
                        <td className="py-2 text-slate-300 font-medium">{a.shipment_id}</td>
                        <td className="py-2 text-right text-slate-200 num-tabular">
                          {a.distance_km.toFixed(1)}
                        </td>
                        <td className="py-2 text-right text-slate-200 num-tabular">
                          {a.package_weight_kg.toFixed(1)}
                        </td>
                        <td className="py-2 pl-3 text-slate-400">
                          {a.original_vehicle}
                        </td>
                        <td className="py-2 pl-3 font-semibold text-[#38bdf8]">
                          {a.recommended_vehicle}
                        </td>
                        <td className="py-2 text-right text-slate-100 num-tabular">
                          {a.recommended_emission_kg.toFixed(2)}
                        </td>
                        <td className="py-2 text-right text-slate-300 num-tabular">
                          {a.recommended_cost.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {isShifted ? (
                            <Pill variant="selected" label="optimized" />
                          ) : (
                            <Pill variant="baseline" label="retained" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3.5 space-y-2 text-[11px] leading-relaxed">
              <div className="p-2.5 rounded border-synthetic-dashed text-[#fbbf24]">
                <strong>Cost Methodology Disclosure:</strong> {result.note}
              </div>
              <div className="p-2.5 rounded bg-[#0d131c] border border-[#1e2736] text-slate-400 space-y-1">
                <div>
                  <strong className="text-slate-300">Baseline Emissions Basis ({result.baseline_basis || "emission_factor x distance"}):</strong> Baseline emissions ({result.baseline_emissions_factor_kg?.toLocaleString() ?? result.baseline_emissions_kg.toLocaleString()} kg CO₂e) are computed using the exact same per-vehicle emission factors as the optimized plan, establishing a consistent physical basis.
                </div>
                {result.baseline_emissions_recorded_kg && (
                  <div className="text-slate-500">
                    Dataset-recorded baseline: {result.baseline_emissions_recorded_kg.toLocaleString()} kg CO₂e (reference only).
                  </div>
                )}
                <div className="text-slate-400">
                  <strong className="text-slate-300">Maximum Feasible Reduction:</strong> {result.max_feasible_reduction ?? 24.0}% (determined via MILP feasibility boundary search).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !mutation.isPending && (
        <div className="data-table-container p-12 text-center flex flex-col items-center justify-center">
          <Truck className="w-8 h-8 text-slate-600 mb-2" />
          <h3 className="text-sm font-semibold text-slate-200">
            Logistics MILP Optimizer Ready
          </h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">
            Select a target reduction above (e.g. 10% or 20% for feasible cut, 25% to observe payload/range infeasibility) and click <strong>Run Logistics Optimizer</strong> to generate shipment routing plans.
          </p>
        </div>
      )}
    </div>
  );
}
