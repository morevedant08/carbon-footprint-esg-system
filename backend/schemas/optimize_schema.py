"""
schemas/optimize_schema.py

Pydantic request/response models for the /optimize/logistics and /optimize/constraints endpoints.
Supports both 'minimal_disruption' and 'cost_minimizing' optimization modes,
dual cost scenarios (Scenario A vs. Scenario B Green Premium), and parameter sweeps.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any


class OptimizeRequest(BaseModel):
    sample_size: int = Field(
        200, description="Number of shipments to include in this optimization batch", example=200
    )
    reduction_target: float = Field(
        0.20,
        description="Target fractional reduction in total emissions vs. baseline (0.20 = 20%)",
        example=0.20,
    )
    mode: str = Field(
        "minimal_disruption",
        description="Optimization objective: 'minimal_disruption' (minimize vehicle changes) or 'cost_minimizing'",
        example="minimal_disruption",
    )
    include_sweep: bool = Field(
        False,
        description="Whether to include a 1% step target-vs-changes sweep up to max feasible reduction",
        example=False,
    )


class ShipmentAssignment(BaseModel):
    shipment_id: str
    distance_km: float
    package_weight_kg: float
    original_vehicle: str
    recommended_vehicle: str
    recommended_emission_kg: float
    recommended_cost: float
    recommended_cost_scenario_a: Optional[float] = None
    recommended_cost_scenario_b: Optional[float] = None
    is_changed: Optional[bool] = False
    is_forced: Optional[bool] = False
    is_optional: Optional[bool] = False


class OptimizeConstraintsResponse(BaseModel):
    max_payload_kg: Dict[str, float]
    max_range_km: Dict[str, float]
    cost_per_km: Dict[str, float]
    cost_per_km_scenario_a: Dict[str, float]
    cost_per_km_scenario_b: Dict[str, float]
    scenario_b_assumptions: Dict[str, str]
    vehicle_types: List[str]


class OptimizeResponse(BaseModel):
    status: str
    solver_status: str  # "Optimal" | "Infeasible"
    mode: str = "minimal_disruption"
    target: float = 0.20
    baseline_basis: str = "emission_factor x distance"
    baseline_emissions: float
    baseline_emissions_kg: float
    optimized_emissions: float
    optimized_emissions_kg: float
    actual_reduction: float  # Percentage (e.g. 21.3)
    actual_reduction_pct: float  # Percentage (e.g. 21.3)
    number_changed: int = 0
    forced_changes: int = 0
    optional_changes: int = 0
    baseline_cost: float
    optimized_cost: float
    cost_change: float = 0.0
    cost_change_pct: float
    cost_scenario_a: Optional[Dict[str, Any]] = None
    cost_scenario_b: Optional[Dict[str, Any]] = None
    scenario_b_assumptions: Optional[Dict[str, str]] = None
    max_feasible_reduction: float  # Percentage (e.g. 24.0)
    max_feasible_reduction_pct: float  # Percentage (e.g. 24.0)
    recorded_baseline_emissions_kg: Optional[float] = None
    infeasibility_reason: Optional[str] = None
    assignments: List[ShipmentAssignment]
    sweep: Optional[List[Dict[str, Any]]] = None
    note: str = (
        "Baseline and optimized emissions use the same consistent basis: sum(Distance_KM * emission_factor[vehicle]). "
        "Cost figures are based on documented synthetic cost-per-km assumptions (currency-agnostic units) "
        "and must never be presented as real financial savings. Emission factors are data-derived from the logistics dataset."
    )
