/**
 * frontend/src/lib/api.ts
 *
 * Dedicated API client for backend communication.
 * Preserves clean error propagation for TanStack Query.
 */

import {
  CoverageStatsResponse,
  JurisdictionBreakdownResponse,
  ModelComparisonResponse,
  OptimizeConstraintsResponse,
  OptimizeRequest,
  OptimizeResponse,
  ReliabilityResponse,
  Scope3PredictionRequest,
  Scope3PredictionResponse,
  BatchScope3PredictionResponse,
  SectorBreakdownResponse,
  ValidationResponse,
} from "./types";

const rawBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://127.0.0.1:8000");

export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, "");

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = `Error ${response.status}: ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.detail) detail = parsed.detail;
    } catch {
      if (errorText) detail = errorText;
    }
    throw new Error(detail);
  }

  return response.json();
}

export const api = {
  checkHealth: async (): Promise<{ status: string }> => {
    return fetchJson<{ status: string }>("/health");
  },

  getSectorBreakdown: async (): Promise<SectorBreakdownResponse> => {
    return fetchJson<SectorBreakdownResponse>("/analytics/sector-breakdown");
  },

  getJurisdictionBreakdown: async (): Promise<JurisdictionBreakdownResponse> => {
    return fetchJson<JurisdictionBreakdownResponse>("/analytics/jurisdiction-breakdown");
  },

  getModelComparison: async (): Promise<ModelComparisonResponse> => {
    return fetchJson<ModelComparisonResponse>("/analytics/model-comparison");
  },

  getReliabilityBySegment: async (): Promise<ReliabilityResponse> => {
    return fetchJson<ReliabilityResponse>("/analytics/reliability-by-segment");
  },

  getCoverageStats: async (): Promise<CoverageStatsResponse> => {
    return fetchJson<CoverageStatsResponse>("/data/coverage-stats");
  },

  getValidationResults: async (): Promise<ValidationResponse> => {
    return fetchJson<ValidationResponse>("/analytics/validation");
  },

  predictScope3: async (req: Scope3PredictionRequest): Promise<Scope3PredictionResponse> => {
    return fetchJson<Scope3PredictionResponse>("/predict/scope3", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  predictScope3Batch: async (file: File): Promise<BatchScope3PredictionResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const url = `${API_BASE_URL}/predict/scope3/batch`;
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let detail = `Batch prediction failed (${response.status})`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.detail) detail = parsed.detail;
      } catch {
        if (errorText) detail = errorText;
      }
      throw new Error(detail);
    }

    return response.json();
  },

  getOptimizeConstraints: async (): Promise<OptimizeConstraintsResponse> => {
    return fetchJson<OptimizeConstraintsResponse>("/optimize/constraints");
  },

  optimizeLogistics: async (req: OptimizeRequest): Promise<OptimizeResponse> => {
    return fetchJson<OptimizeResponse>("/optimize/logistics", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  generateReportUrl: (companyName?: string): string => {
    const url = new URL(`${API_BASE_URL}/reports/generate`);
    return url.toString();
  },

  generateReport: async (companyName?: string): Promise<Blob> => {
    const url = `${API_BASE_URL}/reports/generate`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName || null }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Report generation failed: ${errorText || response.statusText}`);
    }

    return response.blob();
  },
};
