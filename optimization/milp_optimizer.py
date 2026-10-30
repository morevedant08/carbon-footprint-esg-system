"""
milp_optimizer.py

Mixed-Integer Linear Programming (MILP) optimizer for logistics/supply chain
routing. Given a batch of shipments (from the synthetic logistics dataset),
recommends which vehicle type to use for each shipment so that TOTAL COST is
minimized, subject to achieving a target percentage reduction in total carbon
emissions compared to the current ("baseline") vehicle assignment.

DATA NOTE:
    The synthetic logistics dataset (data/synthetic/logistics_emissions.csv)
    contains real distance, weight, and emissions data, but does NOT contain
    cost data (no such field exists in the source dataset). Cost-per-km
    figures below are a documented, transparent modeling assumption based on
    typical relative logistics costs (electric/eco vehicles cost more per km
    to operate than diesel at small scale, heavy trucks are cheapest per kg
    moved at scale, etc.) - NOT real company pricing. This should be stated
    explicitly in the README/paper's methodology section.

USAGE:
    pip install pulp pandas
    python optimization/milp_optimizer.py --sample_size 200 --reduction_target 0.20

OUTPUT:
    - Prints baseline vs. optimized total emissions and total cost
    - Saves the per-shipment recommended vehicle assignment to
      data/processed/optimized_routing_plan.csv
"""

import pandas as pd
import numpy as np
import argparse
import pulp
import os

DATA_PATH = "data/synthetic/logistics_emissions.csv"
OUTPUT_PATH = "data/processed/optimized_routing_plan.csv"

# ---------------------------------------------------------------------------
# Documented cost assumption tables (currency-agnostic synthetic units per km)
# 
# Scenario A ("Eco Savings", legacy table):
#   Assumes mass-scale EV & micro-mobility adoption with operating costs
#   lower than conventional diesel.
# 
# Scenario B ("Green Premium", realistic assumption):
#   Assumes EV, drone, cargo bike, and motorcycle operating costs per km
#   are higher than Diesel Van Euro 6 due to capital amortization, specialized
#   dispatch/courier handling labor, and aviation maintenance infrastructure.
# ---------------------------------------------------------------------------
COST_PER_KM_SCENARIO_A = {
    "Cargo Bicycle": 0.15,
    "Drone Delivery": 0.90,
    "Electric Van (EV)": 0.55,
    "Motorcycle (Courier)": 0.35,
    "Diesel Van (Euro 6)": 0.60,
    "Diesel Van (Euro 4)": 0.58,
    "Heavy Truck": 1.20,
}

COST_PER_KM_SCENARIO_B = {
    "Diesel Van (Euro 6)": 0.60,     # Reference baseline diesel operating cost
    "Diesel Van (Euro 4)": 0.58,     # Depreciated legacy diesel fleet
    "Heavy Truck": 1.20,             # Heavy freight transport baseline
    "Electric Van (EV)": 0.75,       # +25% green tech infrastructure & lease premium vs Euro 6
    "Cargo Bicycle": 0.65,           # +8% urban courier labor & handling premium vs Euro 6
    "Motorcycle (Courier)": 0.68,    # +13% rapid-dispatch courier handling premium vs Euro 6
    "Drone Delivery": 1.35,          # Automated aviation maintenance, battery turnover & pilot supervision
}

SCENARIO_B_ASSUMPTIONS = {
    "Electric Van (EV)": "0.75 / km (+25% capital lease & high-power charging infrastructure premium vs Diesel Euro 6)",
    "Cargo Bicycle": "0.65 / km (+8% specialized urban micro-courier handling cost vs Diesel Euro 6)",
    "Motorcycle (Courier)": "0.68 / km (+13% rapid-dispatch courier labor premium vs Diesel Euro 6)",
    "Drone Delivery": "1.35 / km (Aviation tech maintenance, battery turnover, remote operator oversight)",
    "Diesel Van (Euro 6)": "0.60 / km (Standard baseline fleet operating benchmark)",
    "Diesel Van (Euro 4)": "0.58 / km (Legacy depreciated fleet operating cost)",
    "Heavy Truck": "1.20 / km (Bulk freight / inter-city transport baseline)",
}

# Default backwards-compatible alias
COST_PER_KM = COST_PER_KM_SCENARIO_A

VEHICLE_TYPES = list(COST_PER_KM_SCENARIO_A.keys())

MAX_PAYLOAD_KG = {
    "Cargo Bicycle": 25,
    "Drone Delivery": 5,
    "Motorcycle (Courier)": 25,
    "Electric Van (EV)": 1200,
    "Diesel Van (Euro 6)": 1500,
    "Diesel Van (Euro 4)": 1500,
    "Heavy Truck": 100000,  # effectively unlimited for this dataset's range
}

MAX_RANGE_KM = {
    "Cargo Bicycle": 15,
    "Drone Delivery": 20,
    "Motorcycle (Courier)": 60,
    "Electric Van (EV)": 150,      # EV range/charging-infrastructure limit
    "Diesel Van (Euro 6)": 100000,  # effectively unlimited
    "Diesel Van (Euro 4)": 100000,
    "Heavy Truck": 100000,
}


def compute_emission_factors(df: pd.DataFrame) -> dict:
    """
    Derives an average kg-CO2e-per-km factor for each vehicle type from the
    actual dataset (real, data-driven — not assumed).
    """
    df = df.copy()
    df["emission_per_km"] = df["Carbon_Emission_kgCO2e"] / df["Distance_KM"].replace(0, np.nan)
    factors = df.groupby("Vehicle_Type")["emission_per_km"].mean().to_dict()
    return factors


def find_max_feasible_reduction(shipments: pd.DataFrame, emission_factors: dict) -> float:
    """
    Computes the maximum physically feasible reduction vs. factor-based baseline
    by assigning every shipment to its lowest-emission vehicle that satisfies
    both payload and range constraints.
    """
    baseline_factor = sum(
        shipments.loc[i, "Distance_KM"] * emission_factors.get(shipments.loc[i, "Vehicle_Type"], 0.0)
        for i in shipments.index
    )
    if baseline_factor <= 0:
        return 0.0

    min_emissions = 0.0
    for i in shipments.index:
        w = shipments.loc[i, "Package_Weight_KG"]
        d = shipments.loc[i, "Distance_KM"]
        feasible_efs = [
            emission_factors.get(v, 0.0)
            for v in VEHICLE_TYPES
            if w <= MAX_PAYLOAD_KG.get(v, 100000) and d <= MAX_RANGE_KM.get(v, 100000)
        ]
        min_ef = min(feasible_efs) if feasible_efs else emission_factors.get(shipments.loc[i, "Vehicle_Type"], 0.0)
        min_emissions += d * min_ef

    max_reduct = max(0.0, 1.0 - (min_emissions / baseline_factor))
    return float(max_reduct)


def build_and_solve_milp(
    shipments: pd.DataFrame,
    emission_factors: dict,
    reduction_target: float,
    mode: str = "minimal_disruption",
):
    """
    For each shipment, decide which vehicle type to assign.
    
    Modes:
      - 'minimal_disruption' (default): Minimizes the total number of shipments whose vehicle
        changes from baseline, breaking ties by lower synthetic cost.
      - 'cost_minimizing': Minimizes total fleet operating cost across all shipments.
      
    Constraints:
      - total_emissions <= (1 - reduction_target) * baseline_factor_emissions
      - physical payload (MAX_PAYLOAD_KG) and range (MAX_RANGE_KM) constraints per vehicle.
      
    Shipments whose initial vehicle already violates physical bounds must change regardless;
    these are classified as 'forced_changes' separately from 'optional_changes'.
    Both Scenario A (Eco Savings) and Scenario B (Green Premium) costs are calculated.
    """
    shipment_ids = shipments.index.tolist()

    # Consistent factor-based baseline: same basis as optimized emissions
    baseline_emissions = sum(
        shipments.loc[i, "Distance_KM"] * emission_factors.get(shipments.loc[i, "Vehicle_Type"], 0.0)
        for i in shipment_ids
    )
    # Recorded total from dataset kept as separate reference number
    recorded_baseline_emissions = float(shipments["Carbon_Emission_kgCO2e"].sum())

    # Pre-identify forced changes (shipments where original vehicle violates payload or range)
    forced_ids = set()
    for i in shipment_ids:
        orig_v = shipments.loc[i, "Vehicle_Type"]
        w = shipments.loc[i, "Package_Weight_KG"]
        d = shipments.loc[i, "Distance_KM"]
        if w > MAX_PAYLOAD_KG.get(orig_v, 1e9) or d > MAX_RANGE_KM.get(orig_v, 1e9):
            forced_ids.add(i)

    prob = pulp.LpProblem("Logistics_Routing_Optimization", pulp.LpMinimize)

    # Decision variables
    x = {
        (i, v): pulp.LpVariable(f"x_{i}_{v}", cat="Binary")
        for i in shipment_ids for v in VEHICLE_TYPES
    }

    # Objective Function
    if mode == "cost_minimizing":
        # Pure cost minimization across all routes
        prob += pulp.lpSum(
            x[i, v] * shipments.loc[i, "Distance_KM"] * COST_PER_KM_SCENARIO_A[v]
            for i in shipment_ids for v in VEHICLE_TYPES
        )
    else:
        # Default: Minimal disruption mode
        # Minimize vehicle changes (weight M = 1000.0) with synthetic cost as secondary tie-breaker
        M = 1000.0
        prob += pulp.lpSum(
            x[i, v] * (
                M * (0.0 if v == shipments.loc[i, "Vehicle_Type"] else 1.0)
                + shipments.loc[i, "Distance_KM"] * COST_PER_KM_SCENARIO_A[v]
            )
            for i in shipment_ids for v in VEHICLE_TYPES
        )

    # Constraint 1: each shipment must be assigned exactly one vehicle type
    for i in shipment_ids:
        prob += pulp.lpSum(x[i, v] for v in VEHICLE_TYPES) == 1

    # Constraint 2: total emissions must not exceed the reduction target on factor basis
    prob += pulp.lpSum(
        x[i, v] * shipments.loc[i, "Distance_KM"] * emission_factors.get(v, 0.0)
        for i in shipment_ids for v in VEHICLE_TYPES
    ) <= (1 - reduction_target) * baseline_emissions

    # Constraint 3: every vehicle type has a maximum payload capacity.
    for i in shipment_ids:
        weight = shipments.loc[i, "Package_Weight_KG"]
        for v in VEHICLE_TYPES:
            if weight > MAX_PAYLOAD_KG.get(v, 100000):
                prob += x[i, v] == 0

    # Constraint 4: short-range vehicles cannot be used for long-distance routes.
    for i in shipment_ids:
        distance = shipments.loc[i, "Distance_KM"]
        for v in VEHICLE_TYPES:
            if distance > MAX_RANGE_KM.get(v, 100000):
                prob += x[i, v] == 0

    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    status = pulp.LpStatus[prob.status]

    # Extract results
    assignments = []
    for i in shipment_ids:
        for v in VEHICLE_TYPES:
            if pulp.value(x[i, v]) == 1:
                orig_v = shipments.loc[i, "Vehicle_Type"]
                dist = shipments.loc[i, "Distance_KM"]
                is_changed = (v != orig_v)
                is_forced = is_changed and (i in forced_ids)
                is_optional = is_changed and (not is_forced)
                assignments.append({
                    "shipment_id": str(shipments.loc[i, "Transaction_ID"]),
                    "distance_km": float(dist),
                    "package_weight_kg": float(shipments.loc[i, "Package_Weight_KG"]),
                    "original_vehicle": orig_v,
                    "recommended_vehicle": v,
                    "recommended_emission_kg": float(dist * emission_factors.get(v, 0.0)),
                    "recommended_cost": float(dist * COST_PER_KM_SCENARIO_A[v]),
                    "recommended_cost_scenario_a": float(dist * COST_PER_KM_SCENARIO_A[v]),
                    "recommended_cost_scenario_b": float(dist * COST_PER_KM_SCENARIO_B[v]),
                    "is_changed": bool(is_changed),
                    "is_forced": bool(is_forced),
                    "is_optional": bool(is_optional),
                })
                break

    results_df = pd.DataFrame(assignments)

    # Compute dual-scenario baseline and optimized costs
    base_cost_a = sum(
        shipments.loc[i, "Distance_KM"] * COST_PER_KM_SCENARIO_A.get(shipments.loc[i, "Vehicle_Type"], 0.60)
        for i in shipment_ids
    )
    base_cost_b = sum(
        shipments.loc[i, "Distance_KM"] * COST_PER_KM_SCENARIO_B.get(shipments.loc[i, "Vehicle_Type"], 0.60)
        for i in shipment_ids
    )

    opt_cost_a = float(results_df["recommended_cost_scenario_a"].sum()) if not results_df.empty else float(base_cost_a)
    opt_cost_b = float(results_df["recommended_cost_scenario_b"].sum()) if not results_df.empty else float(base_cost_b)

    cost_change_a = opt_cost_a - base_cost_a
    cost_change_pct_a = ((cost_change_a) / base_cost_a * 100) if base_cost_a > 0 else 0.0

    cost_change_b = opt_cost_b - base_cost_b
    cost_change_pct_b = ((cost_change_b) / base_cost_b * 100) if base_cost_b > 0 else 0.0

    number_changed = int(results_df["is_changed"].sum()) if not results_df.empty else 0
    forced_count = int(results_df["is_forced"].sum()) if not results_df.empty else 0
    optional_count = int(results_df["is_optional"].sum()) if not results_df.empty else 0

    metrics = {
        "mode": mode,
        "target": reduction_target,
        "number_changed": number_changed,
        "forced_changes": forced_count,
        "optional_changes": optional_count,
        "cost_change": float(round(cost_change_a, 2)),
        "cost_scenario_a": {
            "name": "Scenario A: Eco Savings (synthetic)",
            "baseline_cost": float(round(base_cost_a, 2)),
            "optimized_cost": float(round(opt_cost_a, 2)),
            "cost_change": float(round(cost_change_a, 2)),
            "cost_change_pct": float(round(cost_change_pct_a, 1)),
        },
        "cost_scenario_b": {
            "name": "Scenario B: Green Premium (synthetic assumption)",
            "baseline_cost": float(round(base_cost_b, 2)),
            "optimized_cost": float(round(opt_cost_b, 2)),
            "cost_change": float(round(cost_change_b, 2)),
            "cost_change_pct": float(round(cost_change_pct_b, 1)),
        },
        "scenario_b_assumptions": SCENARIO_B_ASSUMPTIONS,
    }

    return results_df, baseline_emissions, status, recorded_baseline_emissions, metrics


def generate_optimization_sweep(
    shipments: pd.DataFrame,
    emission_factors: dict,
    max_feasible_red: float,
    mode: str = "minimal_disruption",
) -> list:
    """
    Computes a sweep across reduction targets from 5% up to max_feasible_reduction in 1% steps,
    evaluating reduction achieved, number of shipment vehicle changes (forced vs optional),
    and cost impact under both Scenario A and Scenario B.
    """
    max_pct = int(min(24.0, max_feasible_red * 100))
    sweep_results = []
    for t in range(5, max_pct + 1):
        target_val = t / 100.0
        res_df, base_em, status, _, metrics = build_and_solve_milp(
            shipments, emission_factors, target_val, mode=mode
        )
        if status == "Optimal":
            opt_em = float(res_df["recommended_emission_kg"].sum())
            actual_red = round((1.0 - (opt_em / base_em)) * 100, 1) if base_em > 0 else 0.0
            sweep_results.append({
                "target": round(target_val * 100, 1),
                "reduction": actual_red,
                "number_changed": metrics["number_changed"],
                "forced_changes": metrics["forced_changes"],
                "optional_changes": metrics["optional_changes"],
                "cost_change_pct_scenario_a": metrics["cost_scenario_a"]["cost_change_pct"],
                "cost_change_pct_scenario_b": metrics["cost_scenario_b"]["cost_change_pct"],
            })
    return sweep_results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample_size", type=int, default=200,
                         help="Number of shipments to optimize (MILP scales slowly with size; "
                              "start small, e.g. 200, for a demo-able runtime)")
    parser.add_argument("--reduction_target", type=float, default=0.20,
                         help="Target fractional reduction in total emissions vs baseline (0.20 = 20%%)")
    parser.add_argument("--test_targets", action="store_true",
                         help="Run evaluation at targets 10%%, 15%%, 20%%, 25%%, 30%% and print comparison table")
    args = parser.parse_args()

    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} total shipments from {DATA_PATH}")

    emission_factors = compute_emission_factors(df)
    print("\nData-derived emission factors (kg CO2e / km):")
    for v, f in emission_factors.items():
        print(f"  {v}: {f:.4f}")

    sample = df.sample(n=min(args.sample_size, len(df)), random_state=42).reset_index(drop=True)

    max_feasible_red = find_max_feasible_reduction(sample, emission_factors)

    if args.test_targets:
        targets = [0.10, 0.15, 0.20, 0.25, 0.30]
        print(f"\n=== Evaluating Targets { [f'{int(t*100)}%' for t in targets] } on {len(sample)} Shipments ===")
        print(f"Baseline Basis: emission_factor x distance")
        print(f"{'Target':<10} {'Solver Status':<16} {'Optimized kg':<16} {'Actual Reduct (Factor)':<24} {'Actual Reduct (Recorded)':<26}")
        print("-" * 92)

        for t in targets:
            res_df, base_kg, stat, rec_kg = build_and_solve_milp(sample, emission_factors, t)
            if stat == "Optimal":
                opt_kg = res_df["recommended_emission_kg"].sum()
                red_factor = (1.0 - opt_kg / base_kg) * 100
                red_rec = (1.0 - opt_kg / rec_kg) * 100
                print(f"{int(t*100)}%{'':<7} {stat:<16} {opt_kg:<16.2f} {red_factor:<24.2f}% {red_rec:<26.2f}%")
            else:
                print(f"{int(t*100)}%{'':<7} {stat:<16} {'N/A':<16} {'N/A':<24} {'N/A':<26}")

        print(f"\nMaximum Physically Feasible Reduction: {max_feasible_red*100:.1f}%")
        return

    print(f"\nOptimizing a batch of {len(sample)} shipments, "
          f"target reduction: {args.reduction_target*100:.0f}%...")

    results_df, baseline_emissions, status, recorded_emissions = build_and_solve_milp(
        sample, emission_factors, args.reduction_target
    )

    print(f"\nBaseline basis: emission_factor x distance (consistent with optimized plan)")
    print(f"Factor-based baseline emissions: {baseline_emissions:.2f} kg CO2e")
    print(f"Dataset-recorded baseline emissions (reference): {recorded_emissions:.2f} kg CO2e")
    print(f"Maximum physically feasible reduction: {max_feasible_red*100:.1f}%")
    print(f"Solver status: {status}")

    if status == "Optimal":
        optimized_emissions = results_df["recommended_emission_kg"].sum()
        optimized_cost = results_df["recommended_cost"].sum()
        baseline_cost = sum(
            sample.loc[i, "Distance_KM"] * COST_PER_KM.get(sample.loc[i, "Vehicle_Type"], 0.6)
            for i in sample.index
        )

        actual_reduction = 1 - (optimized_emissions / baseline_emissions)
        actual_reduction_rec = 1 - (optimized_emissions / recorded_emissions)

        print(f"\nOptimized total emissions: {optimized_emissions:.2f} kg CO2e")
        print(f"Actual reduction achieved (factor basis): {actual_reduction*100:.1f}%")
        print(f"Actual reduction achieved (recorded basis): {actual_reduction_rec*100:.1f}%")
        print(f"\nBaseline estimated cost: {baseline_cost:.2f}")
        print(f"Optimized cost: {optimized_cost:.2f}")
        print(f"Cost change: {((optimized_cost - baseline_cost) / baseline_cost) * 100:+.1f}%")

        print("\nVehicle assignment shift (original -> recommended):")
        shift = results_df.groupby(["original_vehicle", "recommended_vehicle"]).size()
        print(shift[shift > 0].to_string())

        os.makedirs("data/processed", exist_ok=True)
        results_df.to_csv(OUTPUT_PATH, index=False)
        print(f"\nSaved full routing plan to {OUTPUT_PATH}")
    else:
        print(f"No feasible solution found - target exceeds maximum feasible reduction ({max_feasible_red*100:.1f}%).")


if __name__ == "__main__":
    main()
