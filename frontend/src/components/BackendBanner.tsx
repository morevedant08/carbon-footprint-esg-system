"use client";

import React from "react";
import { AlertCircle, RefreshCw, Terminal, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, API_BASE_URL, IS_MISSING_API_URL } from "@/lib/api";

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
    retry: 2,
    retryDelay: 3000,
  });

  // Cold start state: when first loading or retrying
  const isWakingServer = (isLoading || isRefetching) && !health;

  // Banner shown if missing env var or truly offline
  const isOffline = forcedError || Boolean(healthError) || (!isLoading && !health);

  if (!isOffline && !isWakingServer && !IS_MISSING_API_URL) {
    return null;
  }

  const handleRetry = () => {
    refetch();
    if (onRetry) onRetry();
  };

  // 1. Missing NEXT_PUBLIC_API_URL in production/hosted environment
  if (IS_MISSING_API_URL) {
    return (
      <div
        role="alert"
        id="backend-missing-env-banner"
        className="mb-6 rounded border border-amber-700 bg-[#291804] p-4 text-amber-200"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded bg-amber-950 border border-amber-600 text-amber-400 mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-white">
                  Configuration Required: Missing NEXT_PUBLIC_API_URL
                </h4>
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-900 text-amber-200 border border-amber-600">
                  Setup Needed
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
                This hosted frontend does not have the <code>NEXT_PUBLIC_API_URL</code> environment variable set.
                Falling back to <code>{API_BASE_URL}</code> cannot reach your backend on a hosted domain.
              </p>
              <div className="mt-2 text-[11px] text-amber-100 bg-amber-950/80 px-2.5 py-1 rounded border border-amber-800">
                Please add <strong>NEXT_PUBLIC_API_URL</strong> (e.g. <code>https://your-backend.onrender.com</code>) to your hosting provider&apos;s Environment Variables (e.g., Vercel Project Settings) and redeploy.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Render free tier cold start indicator
  if (isWakingServer) {
    return (
      <div
        role="status"
        id="backend-waking-banner"
        className="mb-6 rounded border border-sky-800/80 bg-[#081b29] p-4 text-sky-200"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-sky-950 border border-sky-600 text-sky-400">
              <Clock className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-white">
                Connecting to backend...
              </h4>
              <p className="text-xs text-sky-300/90 mt-0.5">
                Waking the server, this can take up to a minute (Render free tier instances sleep after inactivity).
              </p>
            </div>
          </div>
          <RefreshCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
        </div>
      </div>
    );
  }

  // 3. Regular offline error banner
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
