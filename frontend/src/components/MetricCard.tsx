"use client";

import React from "react";
import Pill, { PillVariant } from "./Pill";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  pillVariant?: PillVariant;
  pillLabel?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  className?: string;
}

export default function MetricCard({
  title,
  value,
  unit,
  subtext,
  pillVariant,
  pillLabel,
  icon,
  trend,
  className = "",
}: MetricCardProps) {
  return (
    <div
      className={`metric-tile p-4 flex flex-col justify-between transition-colors ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <span className="text-xs font-medium text-slate-400">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {pillVariant && <Pill variant={pillVariant} label={pillLabel} />}
          {icon && <div className="text-slate-500">{icon}</div>}
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight text-slate-100 num-tabular">
            {value}
          </span>
          {unit && (
            <span className="text-xs font-normal text-slate-400">{unit}</span>
          )}
        </div>

        {(subtext || trend) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
            {trend && (
              <span
                className={`font-medium ${
                  trend.isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {trend.value}
              </span>
            )}
            {subtext && <span className="line-clamp-1">{subtext}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
