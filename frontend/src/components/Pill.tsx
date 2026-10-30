"use client";

import React from "react";
import {
  Check,
  AlertCircle,
  Database,
  Layers,
  XCircle,
  Shield,
  Activity,
} from "lucide-react";

export type PillVariant =
  | "deterministic"
  | "selected"
  | "cost-not-modelled"
  | "real-disclosure"
  | "synthetic"
  | "infeasible"
  | "high-reliability"
  | "moderate-reliability"
  | "low-reliability"
  | "baseline"
  | "tested";

interface PillProps {
  variant: PillVariant | string;
  label?: string;
  className?: string;
}

export default function Pill({ variant, label, className = "" }: PillProps) {
  const norm = variant.toLowerCase().replace(/_/g, "-");

  let text = label;
  let styleClasses = "bg-slate-800 text-slate-300 border border-slate-700";
  let icon = <Layers className="w-3 h-3 text-slate-400" />;

  switch (norm) {
    case "real-disclosure":
    case "real data":
    case "real-data":
      text = text || "reported disclosure";
      // Solid steel-cyan encoding for real NZDPU/CDP corporate filings
      styleClasses = "bg-[#0b2233] text-[#38bdf8] border border-[#0284c7]/80";
      icon = <Database className="w-3 h-3 text-[#38bdf8]" />;
      break;

    case "synthetic":
    case "synthetic data":
    case "synthetic-data":
    case "cost-not-modelled":
    case "cost not modelled":
      text = text || (norm.includes("cost") ? "cost not modelled" : "synthetic assumption");
      // Distinct dashed border and ochre encoding for synthetic logistics/cost modeling
      styleClasses = "bg-[#241708] text-[#fbbf24] border border-dashed border-[#d97706]/90";
      icon = <AlertCircle className="w-3 h-3 text-[#f59e0b]" />;
      break;

    case "selected":
      text = text || "selected model";
      styleClasses = "bg-[#0a2722] text-[#2dd4bf] border border-[#0d9488]/80";
      icon = <Check className="w-3 h-3 text-[#2dd4bf]" />;
      break;

    case "infeasible":
      text = text || "target infeasible";
      styleClasses = "bg-[#330c0c] text-[#fca5a5] border border-[#991b1b]";
      icon = <XCircle className="w-3 h-3 text-[#f87171]" />;
      break;

    case "high-reliability":
    case "high reliability":
      text = text || "high reliability";
      styleClasses = "bg-[#0a2320] text-[#2dd4bf] border border-[#14b8a6]/60";
      icon = <Shield className="w-3 h-3 text-[#2dd4bf]" />;
      break;

    case "moderate-reliability":
    case "moderate reliability":
      text = text || "moderate reliability";
      styleClasses = "bg-[#18202c] text-[#94a3b8] border border-[#334155]";
      icon = <Activity className="w-3 h-3 text-[#94a3b8]" />;
      break;

    case "low-reliability":
    case "low reliability":
    case "low reliability (high uncertainty)":
      text = text || "low reliability";
      styleClasses = "bg-[#291417] text-[#fca5a5] border border-[#f87171]/50";
      icon = <AlertCircle className="w-3 h-3 text-[#f87171]" />;
      break;

    case "deterministic":
      text = text || "deterministic factor";
      styleClasses = "bg-[#101b2c] text-[#93c5fd] border border-[#1d4ed8]/60";
      icon = <Layers className="w-3 h-3 text-[#60a5fa]" />;
      break;

    case "baseline":
      text = text || "baseline";
      styleClasses = "bg-[#131922] text-[#94a3b8] border border-[#232e3d]";
      icon = <Layers className="w-3 h-3 text-slate-500" />;
      break;

    case "tested":
      text = text || "evaluated";
      styleClasses = "bg-[#131922] text-[#94a3b8] border border-[#232e3d]";
      icon = <Layers className="w-3 h-3 text-slate-500" />;
      break;

    default:
      text = text || variant;
      styleClasses = "bg-[#131922] text-[#94a3b8] border border-[#232e3d]";
      icon = <Layers className="w-3 h-3 text-slate-500" />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded ${styleClasses} ${className}`}
    >
      {icon}
      <span>{text}</span>
    </span>
  );
}
