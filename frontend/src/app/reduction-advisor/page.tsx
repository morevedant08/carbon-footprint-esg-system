"use client";

import React, { useState, useEffect } from "react";
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
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Legend,
} from "recharts";

export default function ReductionAdvisorPage() {
  const [sampleSize, setSampleSize] = useState(200);
  const [reductionTarget, setReductionTarget] = useState(0.10); // 10% default
  const [mode, setMode] = useState<"minimal_disruption" | "cost_minimizing">("minimal_disruption");

  const { data: constraints } = useQuery({
    queryKey: ["optimize-constraints"],
    queryFn: api.getOptimizeConstraints,
  });

  const mutation = useMutation({
    mutationFn: (req: OptimizeRequest) => api.optimizeLogistics(req),
  });

  const handleRun = () => {
    mutation.mutate({
      sample_size: sampleSize,
      reduction_target: reductionTarget,
      mode,
      include_sweep: true,
    });
  };

  const handlePreset = (target: number) => {
    setReductionTarget(target);
    mutation.mutate({
      sample_size: sampleSize,
      reduction_target: target,
      mode,
      include_sweep: true,
    });
  };

  // Debounced auto-run (400ms) on slider, sample size, or mode changes
  useEffect(() => {
    const timer = setTimeout(() => {
      mutation.mutate({
        sample_size: sampleSize,
        reduction_target: reductionTarget,
        mode,
        include_sweep: true,
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [reductionTarget, sampleSize, mode]);

  const result: OptimizeResponse | undefined = mutation.data;
  const isInfeasible = (result?.solver_status || result?.status) === "Infeasible";
  const isOptimal = (result?.solver_status || result?.status) === "Optimal";
  const maxFeasible = result?.max_feasible_reduction ?? 24.0;

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

  const totalChanged = result?.number_changed ?? (result?.assignments
    ? result.assignments.filter((a) => a.original_vehicle !== a.recommended_vehicle).length
    : 0);
  const forcedChanged = result?.forced_changes ?? 0;
  const optionalChanged = result?.optional_changes ?? Math.max(0, totalChanged - forcedChanged);
  const retainedCount = result?.assignments ? result.assignments.length - totalChanged : 0;

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
          <Pill
            variant={mode === "minimal_disruption" ? "selected" : "baseline"}
            label={mode === "minimal_disruption" ? "Minimal Disruption (Default)" : "Cost-Minimizing Mode"}
          />
          <Pill variant="deterministic" label="PuLP MILP Solver" />
        </div>
      </div>

      <BackendBanner
        forcedError={Boolean(mutation.error)}
        errorMessage={mutation.error?.message}
        onRetry={handleRun}
      />

      {/* Control Panel: Optimization Mode, Sliders & Quick Presets */}
      <div className="data-table-container p-5 space-y-4">
        {/* Mode Selector and Benchmark Presets */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#1f2838]">
          {/* Mode Selector */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-300 block">
              Optimization Objective:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("minimal_disruption")}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                  mode === "minimal_disruption"
                    ? "bg-[#0b2233] border-[#0284c7] text-[#38bdf8] shadow-sm shadow-[#0284c7]/20"
                    : "bg-[#0f1520] border-[#1e2736] text-slate-400 hover:text-slate-200"
                }`}
              >
                Minimal Disruption (Default)
              </button>
              <button
                type="button"
                onClick={() => setMode("cost_minimizing")}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                  mode === "cost_minimizing"
                    ? "bg-[#0a2722] border-[#0d9488] text-[#2dd4bf] shadow-sm shadow-[#0d9488]/20"
                    : "bg-[#0f1520] border-[#1e2736] text-slate-400 hover:text-slate-200"
                }`}
              >
                Cost Minimizing
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-300 block">
              Benchmark Targets:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePreset(0.05)}
                className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#0f172a] hover:bg-[#1e293b] border border-slate-700 text-slate-300 transition-colors"
              >
                5% Target
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.10)}
                className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#0b2233] hover:bg-[#0f2e45] border border-[#0284c7] text-[#38bdf8] transition-colors"
              >
                10% Target
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.15)}
                className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#082229] hover:bg-[#0b2c35] border border-[#0891b2] text-[#22d3ee] transition-colors"
              >
                15% Target
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.20)}
                className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#0a2722] hover:bg-[#0e332d] border border-[#0d9488] text-[#2dd4bf] transition-colors"
              >
                20% Target
              </button>
              <button
                type="button"
                onClick={() => handlePreset(Number((maxFeasible / 100).toFixed(2)))}
                className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#251b08] hover:bg-[#34260a] border border-[#d97706] text-[#fbbf24] transition-colors"
              >
                Max Boundary ({maxFeasible}%)
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.25)}
                className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded bg-[#2a0e12] hover:bg-[#381318] border border-[#991b1b] text-[#fca5a5] transition-colors"
              >
                25% (Infeasible Test)
              </button>
            </div>
          </div>
        </div>

        {/* Sliders Grid */}
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
                    reductionTarget * 100 <= maxFeasible
                      ? "bg-[#0a2722] text-[#2dd4bf] border border-[#0d9488]"
                      : "bg-[#2a0e12] text-[#fca5a5] border border-[#991b1b]"
                  }`}
                >
                  {reductionTarget * 100 <= maxFeasible ? "Feasible" : "Infeasible"}
                </span>
              </div>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.30"
              step="0.01"
              value={reductionTarget}
              onChange={(e) => setReductionTarget(parseFloat(e.target.value))}
              className="w-full h-1 bg-[#1e2736] rounded appearance-none cursor-pointer accent-[#0284c7]"
            />
            <div className="flex justify-between text-[10px] text-slate-500 num-tabular">
              <span>5%</span>
              <span className="text-[#38bdf8]">10%</span>
              <span className="text-[#2dd4bf]">15%</span>
              <span className="text-[#2dd4bf]">20%</span>
              <span className="text-[#fbbf24] font-medium">Max ({maxFeasible}%)</span>
              <span className="text-[#f87171]">30% (Infeasible)</span>
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

        {/* Action bar and status */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />
            <span>
              {mode === "minimal_disruption"
                ? "Minimal Disruption Mode: reassigns only the required shipments to hit target; breaks ties by synthetic cost."
                : "Cost-Minimizing Mode: optimizes overall operating cost regardless of total vehicle switches."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {mutation.isPending && (
              <span className="text-[11px] text-[#38bdf8] flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Solving MILP (400ms auto-debounce)...</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleRun}
              disabled={mutation.isPending}
              className="cursor-pointer px-4 py-1.5 rounded bg-[#0369a1] hover:bg-[#0284c7] text-white font-medium text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Update Optimization</span>
            </button>
          </div>
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
                  Physical Infeasibility Encountered ({(reductionTarget * 100).toFixed(0)}% Target)
                </h3>
                <Pill variant="infeasible" label="Infeasible" />
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
                    Electric vans capped at {constraints?.max_range_km?.["Electric Van (EV)"] ?? 150} km range & {constraints?.max_payload_kg?.["Electric Van (EV)"] ?? 1200} kg payload. Inter-city long-distance shipments (up to 800 km) and heavy cargo must remain on heavy trucks. Maximum physically feasible reduction is {maxFeasible}%.
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
              unit={`Target: ${(reductionTarget * 100).toFixed(0)}%`}
              subtext={`Optimized: ${result.optimized_emissions_kg.toLocaleString()} kg CO₂e`}
              pillVariant="deterministic"
              pillLabel="actual cut"
              trend={{ value: `-${result.actual_reduction_pct}%`, isPositive: true }}
              icon={<TrendingDown className="w-4 h-4 text-[#2dd4bf]" />}
            />

            <MetricCard
              title="Shipments Reassigned"
              value={totalChanged}
              unit={`of ${result.assignments.length}`}
              subtext={`${forcedChanged} forced (limits) + ${optionalChanged} optional (target)`}
              pillVariant={mode === "minimal_disruption" ? "selected" : "baseline"}
              pillLabel={mode === "minimal_disruption" ? "min disruption" : "cost-min"}
              icon={<Truck className="w-4 h-4 text-[#38bdf8]" />}
            />

            <MetricCard
              title="Scenario A: Eco Savings"
              value={`${result.cost_scenario_a?.cost_change_pct ?? result.cost_change_pct}%`}
              unit="Synthetic Model"
              subtext={`Baseline: ${result.cost_scenario_a?.baseline_cost ?? result.baseline_cost} to ${result.cost_scenario_a?.optimized_cost ?? result.optimized_cost}`}
              pillVariant="cost-not-modelled"
              pillLabel="EV < Diesel"
              trend={{
                value: `${result.cost_scenario_a?.cost_change_pct ?? result.cost_change_pct}%`,
                isPositive: true,
              }}
              icon={<DollarSign className="w-4 h-4 text-[#38bdf8]" />}
            />

            <MetricCard
              title="Scenario B: Green Premium"
              value={`${result.cost_scenario_b?.cost_change_pct ?? 0}%`}
              unit="Realistic Tech"
              subtext={`Baseline: ${result.cost_scenario_b?.baseline_cost ?? 0} to ${result.cost_scenario_b?.optimized_cost ?? 0}`}
              pillVariant="cost-not-modelled"
              pillLabel="EV (+25%) > Diesel"
              icon={<DollarSign className="w-4 h-4 text-[#f59e0b]" />}
            />
          </div>

          {/* Dual Cost Scenarios Comparison Box */}
          <div className="data-table-container p-4 bg-[#0d131c] border border-[#1e2736]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#1f2838]">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-[#fbbf24]" />
                <h3 className="text-xs font-semibold text-slate-100">
                  Dual Cost Sensitivity Analysis: Scenario A vs. Scenario B ("Green Premium")
                </h3>
              </div>
              <span className="text-[10px] text-amber-300 font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                Synthetic Modeling Assumptions — Not Real Financials
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 text-xs">
              {/* Scenario A */}
              <div className="p-3 rounded bg-[#111722] border border-[#1e2736] space-y-1.5">
                <div className="flex items-center justify-between">
                  <strong className="text-slate-200">Scenario A: Eco Savings (Legacy Model)</strong>
                  <span className="text-[#38bdf8] font-semibold num-tabular">
                    {result.cost_scenario_a?.cost_change_pct}% cost impact
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Assumes mass EV adoption where Electric Vans ($0.55/km) and bikes ($0.15/km) operate cheaper per km than Diesel Vans ($0.60/km).
                </p>
                <div className="text-[11px] text-slate-400 num-tabular pt-1">
                  Baseline cost: {result.cost_scenario_a?.baseline_cost?.toLocaleString()} → Optimized: {result.cost_scenario_a?.optimized_cost?.toLocaleString()} units
                </div>
              </div>

              {/* Scenario B */}
              <div className="p-3 rounded bg-[#111722] border border-[#1e2736] space-y-1.5">
                <div className="flex items-center justify-between">
                  <strong className="text-slate-200">Scenario B: Green Premium (Realistic Transition)</strong>
                  <span className="text-[#f59e0b] font-semibold num-tabular">
                    {result.cost_scenario_b?.cost_change_pct}% cost impact
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Assumes EV ($0.75/km, +25%), courier bike ($0.65/km), and drone ($1.35/km) cost more than Diesel ($0.60/km) due to charging infrastructure and courier labor.
                </p>
                <div className="text-[11px] text-slate-400 num-tabular pt-1">
                  Baseline cost: {result.cost_scenario_b?.baseline_cost?.toLocaleString()} → Optimized: {result.cost_scenario_b?.optimized_cost?.toLocaleString()} units
                </div>
              </div>
            </div>
          </div>

          {/* Sweep Trade-off Chart: Target vs Shipments Changed */}
          {result.sweep && result.sweep.length > 0 && (
            <div className="data-table-container p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">
                    Trade-off Curve: Target Emissions Reduction vs. Shipments Changed (Sweep)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluates reduction from 5% up to max feasible boundary in 1% steps. Forced changes (payload/range) stay constant at {forcedChanged}; optional changes scale with higher target.
                  </p>
                </div>
                <Pill variant="deterministic" label={`Sweep 5% to ${maxFeasible}%`} />
              </div>

              <div className="w-full h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.sweep} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#1f2838" />
                    <XAxis
                      dataKey="target"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickFormatter={(t) => `${t}%`}
                      name="Target"
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      label={{ value: "Shipments Changed", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111722",
                        borderColor: "#232e3e",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#f8fafc",
                      }}
                      formatter={(val: any, name: any) => [val, name]}
                      labelFormatter={(t) => `Reduction Target: ${t}%`}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                    <Line
                      type="monotone"
                      dataKey="number_changed"
                      name="Total Shipments Changed"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="optional_changes"
                      name="Optional Green Shifts"
                      stroke="#2dd4bf"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="forced_changes"
                      name="Forced Limits Fixes"
                      stroke="#f87171"
                      strokeWidth={1.5}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Vehicle Shifts Breakdown Chart (Horizontal Bar Chart) */}
          {shiftChartData.length > 0 && (
            <div className="data-table-container p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">
                    Fleet Vehicle Reassignments Breakdown ({totalChanged} changed, {retainedCount} retained)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Modal shifts solved by MILP: {forcedChanged} forced (payload/range repairs) + {optionalChanged} optional (emissions target)
                  </p>
                </div>
                <Pill variant="selected" label={`${totalChanged} changed, ${retainedCount} retained`} />
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
              <div>
                <h3 className="text-xs font-semibold text-slate-100">
                  Recommended Routing Assignments (First 50 Shown)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Classifies each assignment as Retained, Forced Change (limits violation), or Optional Change (green target shift)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill variant="cost-not-modelled" label="synthetic cost" />
                <Pill variant="deterministic" label="data-derived emissions" />
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
                    <th className="text-right pb-2 font-medium">Cost A (units)</th>
                    <th className="text-right pb-2 font-medium">Cost B (units)</th>
                    <th className="text-right pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2331]">
                  {result.assignments.slice(0, 50).map((a, idx) => {
                    const isShifted = a.original_vehicle !== a.recommended_vehicle;
                    const isForced = a.is_forced;
                    const isOptional = a.is_optional;

                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-[#151c27] transition-colors ${
                          isForced ? "bg-[#251214]/40" : isOptional ? "bg-[#0b1b24]/40" : ""
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
                          {(a.recommended_cost_scenario_a ?? a.recommended_cost).toFixed(2)}
                        </td>
                        <td className="py-2 text-right text-amber-200/80 num-tabular">
                          {(a.recommended_cost_scenario_b ?? a.recommended_cost).toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          {isForced ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#3b1219] text-[#fca5a5] border border-[#991b1b]">
                              Forced (Limits)
                            </span>
                          ) : isOptional ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#0b2233] text-[#38bdf8] border border-[#0284c7]">
                              Optional (Target)
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1e2736] text-slate-400">
                              Retained
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3.5 space-y-2 text-[11px] leading-relaxed">
              <div className="p-2.5 rounded border border-amber-900/60 bg-amber-950/20 text-[#fbbf24]">
                <strong>Cost Methodology & Non-Real Disclaimer:</strong> {result.note}
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
                  <strong className="text-slate-300">Maximum Feasible Reduction:</strong> {maxFeasible}% (determined via physical payload & range constraint boundaries).
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
            Select a target reduction above (e.g. 5%, 10%, 15%, 20%) to observe dynamic, target-matched vehicle reassignments.
          </p>
        </div>
      )}
    </div>
  );
}
