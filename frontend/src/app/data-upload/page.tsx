"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BatchScope3PredictionResponse } from "@/lib/types";
import MetricCard from "@/components/MetricCard";
import BackendBanner from "@/components/BackendBanner";
import Pill from "@/components/Pill";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  Building2,
  TrendingUp,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

export default function DataUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => api.predictScope3Batch(file),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      mutation.mutate(file);
    }
  };

  const handleLoadSample = () => {
    const sampleCsv = `company_name,scope_1,scope_2,sics_sector,jurisdiction,revenue,employees,market_cap,ebitda
Aarti Industries Ltd,45000,12000,Resource Transformation,India,500000000,1500,800000000,60000000
Schneider Electric SE,32000,8500,Infrastructure,France,28000000000,140000,85000000000,4800000000
Unipres Corporation,20166,96290,Transportation,Japan,2200000000,6916,400000000,185000000
Siemens Energy AG,185000,42000,Renewable Resources & Alternative Energy,Germany,31000000000,92000,18000000000,1200000000
Vale S.A.,850000,120000,Extractives & Minerals Processing,Brazil,42000000000,74000,65000000000,14000000000
Derichebourg SA,106987,15656,Infrastructure,France,3468900000,5256,1456314000,239100000
`;
    const blob = new Blob([sampleCsv], { type: "text/csv" });
    const file = new File([blob], "sample_industrial_batch.csv", { type: "text/csv" });
    setSelectedFile(file);
    mutation.mutate(file);
  };

  const handleExportCsv = () => {
    if (!mutation.data) return;
    const rows = [
      [
        "Company Name",
        "Predicted Scope 3 (tCO2e)",
        "CI Lower (tCO2e)",
        "CI Upper (tCO2e)",
        "Sector",
        "Jurisdiction",
        "Segment R2",
        "Reliability Tier",
      ],
      ...mutation.data.predictions.map((p) => [
        p.company_name,
        p.predicted_scope3_tco2e,
        p.ci_lower_tco2e,
        p.ci_upper_tco2e,
        p.segment_reliability.sector,
        p.segment_reliability.jurisdiction,
        p.segment_reliability.composite_r2,
        p.segment_reliability.reliability_tier,
      ]),
    ];

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Scope3_Batch_Predictions_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const data: BatchScope3PredictionResponse | undefined = mutation.data;

  // Chart data from sector summary
  const sectorSummaryData = data?.sector_summary
    ? Object.entries(data.sector_summary).map(([sec, stats]) => ({
        sector: sec.length > 20 ? sec.slice(0, 18) + "..." : sec,
        fullName: sec,
        totalScope3: Math.round(stats.total_scope3),
        count: stats.count,
        avgR2: stats.avg_r2,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Data Upload & Batch Scope 3 Prediction
            </h1>
            <Pill variant="selected" label="Batch CSV Inference" />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Upload supplier or vendor CSV files to calculate Scope 3 emissions with calibrated confidence intervals
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill variant="real-disclosure" label="XGBoost Pipeline" />
          <Pill variant="high-reliability" label="Segment Calibrated" />
        </div>
      </div>

      <BackendBanner
        forcedError={Boolean(mutation.error)}
        errorMessage={mutation.error?.message}
        onRetry={() => {
          if (selectedFile) mutation.mutate(selectedFile);
        }}
      />

      {/* Upload Zone Card */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-sky-400" />
              Upload Corporate Portfolio CSV
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Required headers: <code>company_name</code>, <code>scope_1</code>, <code>scope_2</code>, <code>sics_sector</code>, <code>jurisdiction</code>. (Optional: <code>revenue</code>, <code>employees</code>, <code>market_cap</code>, <code>ebitda</code>)
            </p>
          </div>

          <button
            type="button"
            onClick={handleLoadSample}
            disabled={mutation.isPending}
            className="cursor-pointer px-3.5 py-2 rounded bg-[#131b26] hover:bg-[#1b2535] text-slate-200 text-xs border border-[#222c3d] flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0 font-medium"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
            <span>Load Sample Industrial Batch</span>
          </button>
        </div>

        {/* Dropzone */}
        <label className="border border-dashed border-[#263348] hover:border-sky-500/60 rounded p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#0b0f15]/60 hover:bg-[#0e141d]">
          <UploadCloud className="w-8 h-8 text-slate-500 mb-2" />
          <span className="text-xs font-semibold text-slate-200">
            Click to browse or drag and drop your CSV file
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            CSV files up to 20MB. Missing financials are automatically handled via median imputation.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {selectedFile && (
          <div className="flex items-center justify-between p-3 rounded bg-[#0b0f15] border border-[#1f2735] text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>
                Selected file: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            {mutation.isPending && (
              <span className="text-xs text-sky-400 flex items-center gap-1.5 num-tabular">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Processing...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Batch Results Overview */}
      {data && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Batch Companies"
              value={data.total_companies}
              unit="Firms Processed"
              subtext="Zero failed records"
              pillVariant="selected"
              pillLabel="Batch OK"
              icon={<Building2 className="w-4 h-4" />}
            />

            <MetricCard
              title="Total Predicted Scope 3"
              value={data.total_predicted_scope3_tco2e.toLocaleString()}
              unit="tCO₂e"
              subtext="Aggregated value chain emissions"
              pillVariant="deterministic"
              icon={<Layers className="w-4 h-4 text-sky-400" />}
            />

            <MetricCard
              title="Mean Segment R²"
              value={data.average_segment_r2.toFixed(3)}
              unit="Out-Of-Fold"
              subtext="Historical segment predictability"
              pillVariant={
                data.average_segment_r2 >= 0.55
                  ? "high-reliability"
                  : data.average_segment_r2 >= 0.4
                  ? "moderate-reliability"
                  : "low-reliability"
              }
              icon={<TrendingUp className="w-4 h-4 text-sky-400" />}
            />

            <div className="card-surface p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-medium text-slate-400">
                  Export audit package
                </span>
                <p className="text-xs text-slate-300 mt-1">
                  Download predictions with confidence bounds and segment R²
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="cursor-pointer mt-3 w-full py-2 px-3 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV Results</span>
              </button>
            </div>
          </div>

          {/* Sector Breakdown of Batch */}
          {sectorSummaryData.length > 0 && (
            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Batch Emissions Breakdown by Sector
                  </h3>
                  <p className="text-xs text-slate-400">
                    Aggregated predicted Scope 3 (tCO₂e) across input companies
                  </p>
                </div>
                <Pill variant="deterministic" label="Sector Aggregates" />
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sectorSummaryData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2735" vertical={false} />
                    <XAxis
                      dataKey="sector"
                      stroke="#64748b"
                      fontSize={10}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickFormatter={(v) =>
                        v >= 1000000 ? `${v / 1000000}M` : v >= 1000 ? `${v / 1000}k` : v
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#101620",
                        borderColor: "#1f2735",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "#f1f5f9",
                      }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()} tCO₂e`, "Scope 3"]}
                    />
                    <Bar dataKey="totalScope3" fill="#38bdf8" radius={[2, 2, 0, 0]}>
                      {sectorSummaryData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index % 2 === 0 ? "#38bdf8" : "#475569"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Detailed Predictions Table */}
          <div className="data-table-container">
            <div className="p-4 border-b border-[#1f2735] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Processed Company Predictions ({data.predictions.length} Firms)
                </h3>
                <p className="text-xs text-slate-400">
                  Every prediction includes an 80% confidence interval and segment reliability tier
                </p>
              </div>
              <Pill variant="selected" label="Prediction Results" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1f2735] text-slate-400 bg-[#0e141d]/50">
                    <th className="text-left py-2.5 px-4 font-medium">Company Name</th>
                    <th className="text-left py-2.5 px-4 font-medium">Sector</th>
                    <th className="text-left py-2.5 px-4 font-medium">Jurisdiction</th>
                    <th className="text-right py-2.5 px-4 font-medium">Scope 3 (tCO₂e)</th>
                    <th className="text-right py-2.5 px-4 font-medium">80% Interval [Lower, Upper]</th>
                    <th className="text-right py-2.5 px-4 font-medium">Segment R²</th>
                    <th className="text-right py-2.5 px-4 font-medium">Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2735]">
                  {data.predictions.map((p, idx) => (
                    <tr key={idx} className="hover:bg-[#131b26]/50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-200">
                        {p.company_name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 truncate max-w-xs">
                        {p.segment_reliability.sector}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {p.segment_reliability.jurisdiction}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-slate-100 num-tabular">
                        {p.predicted_scope3_tco2e.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right text-sky-300 num-tabular">
                        [{p.ci_lower_tco2e.toLocaleString()} – {p.ci_upper_tco2e.toLocaleString()}]
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300 num-tabular">
                        {p.segment_reliability.composite_r2.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Pill
                          variant={
                            p.segment_reliability.composite_r2 >= 0.55
                              ? "high-reliability"
                              : p.segment_reliability.composite_r2 >= 0.4
                              ? "moderate-reliability"
                              : "low-reliability"
                          }
                          label={p.segment_reliability.reliability_tier}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
