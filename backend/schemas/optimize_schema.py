"""
schemas/optimize_schema.py

Pydantic request/response models for the /optimize/logistics and /optimize/constraints endpoints.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class OptimizeRequest(BaseModel):
    sample_size: int = Field(
        200, description="Number of shipments to include in this optimization batch", example=200
    )
    reduction_target: float = Field(
        0.20,
        description="Target fractional reduction in total emissions vs. baseline (0.20 = 20%)",
        example=0.20,
    )


class ShipmentAssignment(BaseModel):
    shipment_id: str
    distance_km: float
    package_weight_kg: float
    original_vehicle: str
    recommended_vehicle: str
    recommended_emission_kg: float
    recommended_cost: float


class OptimizeConstraintsResponse(BaseModel):
    max_payload_kg: Dict[str, float]
    max_range_km: Dict[str, float]
    cost_per_km: Dict[str, float]
    vehicle_types: List[str]


class OptimizeResponse(BaseModel):
    status: str
    solver_status: str  # "Optimal" | "Infeasible"
    baseline_basis: str = "emission_factor x distance"
    baseline_emissions: float
    baseline_emissions_kg: float
    optimized_emissions: float
    optimized_emissions_kg: float
    actual_reduction: float  # Percentage (e.g. 21.3)
    actual_reduction_pct: float  # Percentage (e.g. 21.3)
    baseline_cost: float
    optimized_cost: float
    cost_change_pct: float
    max_feasible_reduction: float  # Percentage (e.g. 24.0)
    max_feasible_reduction_pct: float  # Percentage (e.g. 24.0)
    recorded_baseline_emissions_kg: Optional[float] = None
    infeasibility_reason: Optional[str] = None
    assignments: List[ShipmentAssignment]
    note: str = (
        "Baseline and optimized emissions use the same consistent basis: sum(Distance_KM * emission_factor[vehicle]). "
        "Cost figures are based on documented synthetic cost-per-km assumptions (currency-agnostic units). "
        "Emission factors are data-derived from the logistics dataset."
    )
