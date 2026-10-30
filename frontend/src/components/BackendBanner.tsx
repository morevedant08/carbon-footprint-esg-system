"use client";

import React from "react";
import { AlertCircle, RefreshCw, Terminal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, API_BASE_URL } from "@/lib/api";

interface BackendBannerProps {
  forcedError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export default function BackendBanner({
  forcedError,
  errorMessage,
  onRetry,
}: BackendBannerProps) {
  const {
    data: health,
    error: healthError,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["backend-health"],
    queryFn: api.checkHealth,
    refetchInterval: 12000,
    retry: 1,
  });

  const isOffline = forcedError || Boolean(healthError) || (!isLoading && !health);

  if (!isOffline) {
    return null;
  }

  const handleRetry = () => {
    refetch();
    if (onRetry) onRetry();
  };

  return (
    <div
      role="alert"
      id="backend-offline-banner"
      className="mb-6 rounded border border-[#7f1d1d] bg-[#220c0e] p-4 text-[#fecaca]"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded bg-[#450a0a] border border-[#991b1b] text-[#f87171] mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-white">
                Backend API unreachable at {API_BASE_URL}
              </h4>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#450a0a] text-[#fca5a5] border border-[#991b1b]">
                Offline
              </span>
            </div>
            <p className="mt-1 text-xs text-[#fca5a5]/90 leading-relaxed">
              {errorMessage ||
                "Live inference, MILP logistics routing, and analytical queries are paused. Real numbers are never silently substituted with cached or synthetic estimates."}
            </p>
            <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-[#fca5a5] bg-[#330e10] px-2 py-0.5 rounded border border-[#7f1d1d]">
              <Terminal className="w-3 h-3 text-[#f87171]" />
              <span>
                Start backend service: <strong>uvicorn backend.main:app --port 8000</strong>
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleRetry}
          disabled={isRefetching}
          className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#450a0a] hover:bg-[#5c0f0f] text-white border border-[#991b1b] transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3 h-3 ${isRefetching ? "animate-spin" : ""}`}
          />
          {isRefetching ? "Connecting..." : "Retry connection"}
        </button>
      </div>
    </div>
  );
}
