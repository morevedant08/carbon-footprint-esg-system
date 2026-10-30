/**
 * frontend/src/lib/types.ts
 *
 * TypeScript types matching backend schemas and honest disclosure structures.
 */

export interface SegmentReliability {
  sector: string;
  sector_r2: number;
  jurisdiction: string;
  jurisdiction_r2: number;
  revenue_quartile: string;
  revenue_quartile_r2?: number | null;
  composite_r2: number;
  historical_samples: number;
  reliability_tier: string;
}

export interface Scope3PredictionRequest {
  company_name: string;
  scope_1: number;
  scope_2: number;
  sics_sector: string;
  jurisdiction: string;
  revenue?: number | null;
  employees?: number | null;
  market_cap?: number | null;
  ebitda?: number | null;
}

export interface Scope3PredictionResponse {
  company_name: string;
  predicted_scope3_tco2e: number;
  ci_lower_tco2e: number;
  ci_upper_tco2e: number;
  confidence_interval_level: string;
  used_real_financials: boolean;
  segment_reliability: SegmentReliability;
  reliability_tier: "high" | "medium" | "low" | string;
  reliability_note: string;
  no_better_than_average?: boolean;
  no_better_than_average_note?: string | null;
  extrapolation_warning: boolean;
  extrapolation_note?: string | null;
  missing_financials_warning?: boolean;
  missing_financials_note?: string | null;
  has_financials_zero_r2?: number;
  has_financials_zero_mae?: number;
  interval_method?: string;
  note: string;
}

export interface BatchScope3PredictionResponse {
  total_companies: number;
  total_predicted_scope3_tco2e: number;
  average_segment_r2: number;
  predictions: Scope3PredictionResponse[];
  sector_summary: Record<string, { count: number; total_scope3: number; avg_r2: number }>;
}

export interface SectorItem {
  sector: string;
  company_count: number;
  pct_of_dataset: number;
  scope_1_median: number;
  scope_2_median: number;
  scope_3_median: number;
  scope_1_mean: number;
  scope_2_mean: number;
  scope_3_mean: number;
  scope3_to_scope12_ratio: number;
  sample_companies: string[];
}

export interface SectorBreakdownResponse {
  total_companies: number;
  total_sectors: number;
  sectors: SectorItem[];
  note: string;
}

export interface JurisdictionItem {
  jurisdiction: string;
  company_count: number;
  pct_of_dataset: number;
  scope_1_median: number;
  scope_2_median: number;
  scope_3_median: number;
  total_scope3: number;
}

export interface JurisdictionBreakdownResponse {
  total_jurisdictions: number;
  jurisdictions: JurisdictionItem[];
  top_10: JurisdictionItem[];
  other_jurisdictions_count: number;
}

export interface ModelComparisonItem {
  model_name: string;
  test_r2: number;
  test_mae: number;
  cv_r2_mean: number;
  cv_r2_std: number;
  train_time_sec: number;
  is_selected: boolean;
  badge: "selected" | "baseline" | "tested";
}

export interface OldModelComparisonItem {
  model_name: string;
  test_r2?: number | null;
  test_mae?: number | null;
  cv_r2_mean: number;
  cv_r2_std: number;
}

export interface ModelComparisonResponse {
  models: ModelComparisonItem[];
  selected_model: string;
  old_models?: OldModelComparisonItem[];
  data_fix_note?: string;
  selection_rationale: string;
  key_finding: string;
}

export interface SegmentReliabilityRecord {
  segment_type: string;
  segment: string;
  r2: number;
  n_companies: number;
}

export interface CogemValidationRecord {
  company_name: string;
  ticker_used?: string;
  sics_sector: string;
  financial_currency?: string | null;
  revenue_usd?: number | null;
  revenue?: number | null;
  cogem_actual_scope3: number;
  our_predicted_scope3: number;
  ci_lower_80?: number;
  ci_upper_80?: number;
  in_reliability_range?: boolean;
  times_off: number;
  error_sign?: string;
  pct_error: number;
  headline_included?: boolean;
  in_training_set?: boolean;
  notes?: string;
}

export interface ValidationResponse {
  records: CogemValidationRecord[];
  independent_companies?: CogemValidationRecord[];
  overlap_companies?: CogemValidationRecord[];
  total_companies: number;
  headline_companies_count: number;
  overlap_companies_count?: number;
  excluded_companies_count: number;
  headline_metrics: {
    median_times_off: number;
    mean_times_off: number;
    pct_within_2x: number;
    pct_within_3x: number;
    under_predicted_count: number;
    under_predicted_pct: number;
    in_reliability_range_count: number;
    in_reliability_range_pct: number;
  };
  overlap_note?: string;
  limitation_note: string;
  headline_exclusion_note: string;
}

export interface ReliabilityResponse {
  reliability_records: SegmentReliabilityRecord[];
  by_segment_type: Record<string, { segment: string; r2: number; n_companies: number }[]>;
  cogem_validation: CogemValidationRecord[];
  evaluation_methodology: string;
}

export interface CoverageStatsResponse {
  scope3_categories: {
    calculated_count: number;
    total_count: number;
    calculated_categories: { name: string; status: string; method: string }[];
    uncalculated_categories: string[];
    callout: string;
  };
  dataset_integrity: {
    training_companies_retained: number;
    original_disclosures_collected: number;
    anomalies_flagged: number;
    kg_vs_tonne_corrected: number;
    excluded_companies: number;
    exclusion_policy: string;
  };
  authenticity_delineation: {
    corporate_emissions_data: {
      type: string;
      source: string;
      financial_enrichment: string;
      is_synthetic: boolean;
    };
    logistics_optimizer_routes: {
      type: string;
      purpose: string;
      is_synthetic: boolean;
    };
    logistics_cost_model: {
      type: string;
      note: string;
      is_synthetic: boolean;
    };
  };
}

export interface ShipmentAssignment {
  shipment_id: string;
  distance_km: number;
  package_weight_kg: number;
  original_vehicle: string;
  recommended_vehicle: string;
  recommended_emission_kg: number;
  recommended_cost: number;
  recommended_cost_scenario_a?: number;
  recommended_cost_scenario_b?: number;
  is_changed?: boolean;
  is_forced?: boolean;
  is_optional?: boolean;
}

export interface OptimizeRequest {
  sample_size: number;
  reduction_target: number;
  mode?: "minimal_disruption" | "cost_minimizing" | string;
  include_sweep?: boolean;
}

export interface OptimizeConstraintsResponse {
  max_payload_kg: Record<string, number>;
  max_range_km: Record<string, number>;
  cost_per_km: Record<string, number>;
  cost_per_km_scenario_a?: Record<string, number>;
  cost_per_km_scenario_b?: Record<string, number>;
  scenario_b_assumptions?: Record<string, string>;
  vehicle_types: string[];
}

export interface CostScenarioDetail {
  name: string;
  baseline_cost: number;
  optimized_cost: number;
  cost_change: number;
  cost_change_pct: number;
}

export interface OptimizationSweepPoint {
  target: number;
  reduction: number;
  number_changed: number;
  forced_changes: number;
  optional_changes: number;
  cost_change_pct_scenario_a: number;
  cost_change_pct_scenario_b: number;
}

export interface OptimizeResponse {
  status: "Optimal" | "Infeasible" | string;
  solver_status?: "Optimal" | "Infeasible" | string;
  mode?: "minimal_disruption" | "cost_minimizing" | string;
  target?: number;
  baseline_emissions_kg: number;
  optimized_emissions_kg: number;
  actual_reduction_pct: number;
  actual_reduction?: number;
  number_changed?: number;
  forced_changes?: number;
  optional_changes?: number;
  baseline_emissions?: number;
  optimized_emissions?: number;
  baseline_cost: number;
  optimized_cost: number;
  cost_change?: number;
  cost_change_pct: number;
  cost_scenario_a?: CostScenarioDetail;
  cost_scenario_b?: CostScenarioDetail;
  scenario_b_assumptions?: Record<string, string>;
  baseline_basis?: string;
  max_feasible_reduction?: number;
  max_feasible_reduction_pct?: number | null;
  baseline_emissions_factor_kg?: number;
  baseline_emissions_recorded_kg?: number;
  infeasibility_reason?: string | null;
  assignments: ShipmentAssignment[];
  sweep?: OptimizationSweepPoint[];
  note: string;
}
