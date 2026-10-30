"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import MetricCard from "@/components/MetricCard";
import BackendBanner from "@/components/BackendBanner";
import Pill from "@/components/Pill";
import {
  FileSpreadsheet,
  Download,
  FileCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building,
  FileText,
  ExternalLink,
} from "lucide-react";

export default function ReportsPage() {
  const [companyFilter, setCompanyFilter] = useState("Aarti Industries Ltd");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (company?: string) => {
      const blob = await api.generateReport(company);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const cleanName = company ? company.replace(/\s+/g, "_") : "Portfolio";
      const filename = `ESG_Report_${cleanName}_${timestamp}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return filename;
    },
    onSuccess: (filename) => {
      setDownloadSuccess(filename);
    },
  });

  const handleGenerate = (company?: string) => {
    setDownloadSuccess(null);
    mutation.mutate(company);
  };

  const sampleCompanies = [
    "Aarti Industries Ltd",
    "ENGIE",
    "DERICHEBOURG",
    "Unipres Corporation",
    "Japan Metropolitan Fund Investment",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Reports & ESG Compliance Export
            </h1>
            <Pill variant="real-disclosure" label="ReportLab PDF Engine" />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Generate audit-ready ESG PDF disclosures with cohesive styling, segment reliability tables, and data integrity audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Pill variant="deterministic" label="PDF Generator" />
          <Pill variant="selected" label="A4 Audit Format" />
        </div>
      </div>

      <BackendBanner
        forcedError={Boolean(mutation.error)}
        errorMessage={mutation.error?.message}
        onRetry={() => handleGenerate(companyFilter)}
      />

      {/* Generator Control Card */}
      <div className="card-surface p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-sky-400" />
              Configure & Compile ESG Audit PDF Report
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Exports full sector medians, model bake-off validation, segment R² tables, and an optional company spotlight
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleGenerate(companyFilter)}
            disabled={mutation.isPending}
            className="cursor-pointer px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
          >
            {mutation.isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Compiling ReportLab PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Generate & Download PDF</span>
              </>
            )}
          </button>
        </div>

        {/* Company Filter Input */}
        <div className="pt-3 border-t border-[#1f2735] space-y-3">
          <label className="block text-xs font-medium text-slate-300">
            Company Spotlight Filter (Optional)
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                placeholder="Enter company name (or leave empty for full portfolio report)"
                className="w-full pl-9 pr-3 py-2 rounded bg-[#0b0f15] border border-[#232d3f] text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
            <button
              type="button"
              onClick={() => handleGenerate(undefined)}
              disabled={mutation.isPending}
              className="cursor-pointer px-3.5 py-2 rounded bg-[#131b26] hover:bg-[#1a2535] text-slate-300 text-xs border border-[#222c3d] transition-colors"
            >
              Export Full Portfolio (No Filter)
            </button>
          </div>

          {/* Quick Select Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-400">
              Quick Spotlights:
            </span>
            {sampleCompanies.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCompanyFilter(c)}
                className={`cursor-pointer px-2.5 py-1 text-[11px] rounded border transition-colors ${
                  companyFilter === c
                    ? "bg-[#14233a] border-sky-600/70 text-sky-200 font-medium"
                    : "bg-[#0c1017] border-[#1f2735] text-slate-400 hover:text-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Success Download Banner */}
        {downloadSuccess && (
          <div className="p-3.5 rounded bg-[#0f2137] border border-sky-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-sky-200">
              <FileCheck className="w-4 h-4 text-sky-400" />
              <span>
                Report compiled successfully and downloaded: <strong>{downloadSuccess}</strong>
              </span>
            </div>
            <button
              onClick={() => handleGenerate(companyFilter)}
              className="cursor-pointer text-sky-400 hover:underline font-medium"
            >
              Download again
            </button>
          </div>
        )}
      </div>

      {/* Report Structure & Audit Preview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: What's in the Report */}
        <div className="card-surface p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            PDF Report Structure & Contents
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The ReportLab generator produces a multi-page PDF with institutional compliance sections:
          </p>

          <ul className="space-y-2.5 text-xs text-slate-300 pt-1">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">Executive Summary & Median Emissions:</strong> Log-scale bar charts comparing Scope 1, Scope 2, and Scope 3 medians across 5 sectors.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">Model Bake-Off Comparison:</strong> 5-fold cross-validation table for all 7 tested algorithms with train time and error variance.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">Held-Out Reliability by Segment:</strong> Out-of-fold R² rankings by sector, jurisdiction (France R²=0.66, Germany 0.64), and revenue quartiles.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">Company Spotlight Page:</strong> Reported Scope 1, 2, and 3 disclosures when a company filter is specified.
              </div>
            </li>
          </ul>
        </div>

        {/* Right: Regulatory Status & Disclosures */}
        <div className="card-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Mandatory ESG Disclosures & Limitations
            </h3>
            <Pill variant="synthetic-assumption" label="Dashed = Synthetic" />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Included verbatim in section 4 of every generated PDF report:
          </p>

          <div className="space-y-2.5 text-xs pt-1">
            <div className="p-2.5 rounded bg-[#0d1624] border border-sky-800/40">
              <div className="flex items-center gap-2 mb-1">
                <Pill variant="real-disclosure" label="Authentic Data Foundation" />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Disclosures sourced from NZDPU / Climate Data Utility (CDP and ADEME providers). 35 companies unit-corrected (kg vs tonne); 137 anomalies excluded.
              </p>
            </div>

            <div className="p-2.5 rounded bg-[#1a1610] border border-dashed border-amber-600/50">
              <div className="flex items-center gap-2 mb-1">
                <Pill variant="synthetic-assumption" label="Synthetic Modeling Boundaries" />
              </div>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                Logistics fleet routes and cost-per-km values are synthetic modeling assumptions, not real supplier pricing.
              </p>
            </div>

            <div className="p-2.5 rounded bg-[#111620] border border-[#1f2735]">
              <div className="flex items-center gap-2 mb-1">
                <Pill variant="moderate-reliability" label="Regulatory Compliance Status" />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                AI-predicted Scope 3 estimates are directional benchmarks (R² ≈ 0.49), not universally approved statutory compliance filings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
