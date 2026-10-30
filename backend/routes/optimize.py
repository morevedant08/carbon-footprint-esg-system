"""
routes/optimize.py

Wraps the MILP logistics optimizer (optimization/milp_optimizer.py) as:
- GET /optimize/constraints (dynamic vehicle payload, range, and cost tables)
- POST /optimize/logistics (solves MILP routing under physical constraints)
Handles both Optimal and Infeasible states honestly with zero hardcoded values.
"""

from fastapi import APIRouter, HTTPException
import pandas as pd
import sys
import os

# Allow importing the optimization/ package from the project root
sys.path.append(os.getcwd())

from optimization.milp_optimizer import (
    compute_emission_factors,
    build_and_solve_milp,
    find_max_feasible_reduction,
    generate_optimization_sweep,
    COST_PER_KM_SCENARIO_A,
    COST_PER_KM_SCENARIO_B,
    SCENARIO_B_ASSUMPTIONS,
    COST_PER_KM,
    MAX_PAYLOAD_KG,
    MAX_RANGE_KM,
    VEHICLE_TYPES,
    DATA_PATH,
)
from backend.schemas.optimize_schema import (
    OptimizeRequest,
    OptimizeResponse,
    OptimizeConstraintsResponse,
    ShipmentAssignment,
)

router = APIRouter()


@router.get("/optimize/constraints", response_model=OptimizeConstraintsResponse)
def get_optimize_constraints():
    """
    Returns physical payload, operating range, and dual-scenario cost-per-km constraints
    from optimization/milp_optimizer.py so frontend explanation components do not hardcode values.
    """
    return OptimizeConstraintsResponse(
        max_payload_kg={k: float(v) for k, v in MAX_PAYLOAD_KG.items()},
        max_range_km={k: float(v) for k, v in MAX_RANGE_KM.items()},
        cost_per_km={k: float(v) for k, v in COST_PER_KM_SCENARIO_A.items()},
        cost_per_km_scenario_a={k: float(v) for k, v in COST_PER_KM_SCENARIO_A.items()},
        cost_per_km_scenario_b={k: float(v) for k, v in COST_PER_KM_SCENARIO_B.items()},
        scenario_b_assumptions=SCENARIO_B_ASSUMPTIONS,
        vehicle_types=VEHICLE_TYPES,
    )


@router.post("/optimize/logistics", response_model=OptimizeResponse)
def optimize_logistics(req: OptimizeRequest):
    if not os.path.exists(DATA_PATH):
        raise HTTPException(
            status_code=503,
            detail=f"Logistics dataset not found at {DATA_PATH}.",
        )

    df = pd.read_csv(DATA_PATH)
    emission_factors = compute_emission_factors(df)

    sample = df.sample(n=min(req.sample_size, len(df)), random_state=42).reset_index(drop=True)

    # Compute maximum physically feasible reduction for this sample batch
    max_feasible_red = find_max_feasible_reduction(sample, emission_factors)
    max_feasible_pct = round(max_feasible_red * 100, 1)

    mode = req.mode if req.mode in ["minimal_disruption", "cost_minimizing"] else "minimal_disruption"

    results_df, baseline_emissions, status, recorded_baseline, metrics = build_and_solve_milp(
        sample, emission_factors, req.reduction_target, mode=mode
    )

    baseline_cost = metrics["cost_scenario_a"]["baseline_cost"]

    # When the reduction target is too high (e.g., > max_feasible_pct), MILP constraints cannot be satisfied.
    # We return the Infeasible status honestly rather than hiding it or treating it as a crash.
    if status != "Optimal":
        infeasibility_reason = (
            f"Target reduction of {req.reduction_target * 100:.0f}% exceeds maximum physically feasible "
            f"reduction ({max_feasible_pct}%) for this shipment sample under payload and range constraints."
        )
        return OptimizeResponse(
            status=status,
            solver_status=status,
            mode=mode,
            target=req.reduction_target,
            baseline_basis="emission_factor x distance",
            baseline_emissions=round(float(baseline_emissions), 2),
            baseline_emissions_kg=round(float(baseline_emissions), 2),
            optimized_emissions=round(float(baseline_emissions), 2),
            optimized_emissions_kg=round(float(baseline_emissions), 2),
            actual_reduction=0.0,
            actual_reduction_pct=0.0,
            number_changed=0,
            forced_changes=0,
            optional_changes=0,
            baseline_cost=round(float(baseline_cost), 2),
            optimized_cost=round(float(baseline_cost), 2),
            cost_change=0.0,
            cost_change_pct=0.0,
            cost_scenario_a=metrics["cost_scenario_a"],
            cost_scenario_b=metrics["cost_scenario_b"],
            scenario_b_assumptions=metrics["scenario_b_assumptions"],
            max_feasible_reduction=max_feasible_pct,
            max_feasible_reduction_pct=max_feasible_pct,
            recorded_baseline_emissions_kg=round(float(recorded_baseline), 2),
            infeasibility_reason=infeasibility_reason,
            assignments=[],
            sweep=None,
            note=(
                f"Target reduction of {req.reduction_target * 100:.0f}% is mathematically INFEASIBLE under "
                f"physical vehicle payload (MAX_PAYLOAD_KG) and range (MAX_RANGE_KM) constraints. "
                f"Try a lower target (maximum feasible reduction is {max_feasible_pct}%)."
            ),
        )

    optimized_emissions = float(results_df["recommended_emission_kg"].sum())
    optimized_cost = metrics["cost_scenario_a"]["optimized_cost"]
    actual_reduction_ratio = 1.0 - (optimized_emissions / baseline_emissions) if baseline_emissions > 0 else 0.0
    actual_reduction_pct = round(float(actual_reduction_ratio) * 100, 1)

    assignments = [
        ShipmentAssignment(**row) for row in results_df.to_dict(orient="records")
    ]

    # Generate 1% target sweep for trade-off chart if requested or standard sample
    sweep_data = None
    if req.include_sweep or req.sample_size == 200:
        try:
            sweep_data = generate_optimization_sweep(
                sample, emission_factors, max_feasible_red, mode=mode
            )
        except Exception:
            sweep_data = None

    return OptimizeResponse(
        status=status,
        solver_status=status,
        mode=mode,
        target=req.reduction_target,
        baseline_basis="emission_factor x distance",
        baseline_emissions=round(float(baseline_emissions), 2),
        baseline_emissions_kg=round(float(baseline_emissions), 2),
        optimized_emissions=round(float(optimized_emissions), 2),
        optimized_emissions_kg=round(float(optimized_emissions), 2),
        actual_reduction=actual_reduction_pct,
        actual_reduction_pct=actual_reduction_pct,
        number_changed=metrics["number_changed"],
        forced_changes=metrics["forced_changes"],
        optional_changes=metrics["optional_changes"],
        baseline_cost=round(float(baseline_cost), 2),
        optimized_cost=round(float(optimized_cost), 2),
        cost_change=metrics["cost_change"],
        cost_change_pct=metrics["cost_scenario_a"]["cost_change_pct"],
        cost_scenario_a=metrics["cost_scenario_a"],
        cost_scenario_b=metrics["cost_scenario_b"],
        scenario_b_assumptions=metrics["scenario_b_assumptions"],
        max_feasible_reduction=max_feasible_pct,
        max_feasible_reduction_pct=max_feasible_pct,
        recorded_baseline_emissions_kg=round(float(recorded_baseline), 2),
        infeasibility_reason=None,
        assignments=assignments,
        sweep=sweep_data,
    )
