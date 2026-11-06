"""
tests/test_optimizer.py

Verifies MILP logistics optimizer behavior under physical constraints:
- 10% and 20% reduction targets are Optimal
- 25% reduction target is Infeasible (exceeds max physical limit of 24.0%)
- Actual reduction achieved is >= target on factor basis
- Verified for both 'minimal_disruption' (API default) and 'cost_minimizing' modes
"""

import unittest
import pandas as pd
from optimization.milp_optimizer import (
    compute_emission_factors,
    build_and_solve_milp,
    DATA_PATH,
)


class TestOptimizer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.df = pd.read_csv(DATA_PATH)
        cls.sample = cls.df.sample(n=200, random_state=42).reset_index(drop=True)
        cls.emission_factors = compute_emission_factors(cls.df)

    def _test_mode(self, mode: str):
        # Target 10%: must be Optimal and achieve >= 10% reduction
        res_10, base_10, status_10, _, met_10 = build_and_solve_milp(
            self.sample, self.emission_factors, 0.10, mode=mode
        )
        self.assertEqual(status_10, "Optimal", f"Target 10% in mode {mode} failed with status {status_10}")
        opt_10 = res_10["recommended_emission_kg"].sum()
        red_10 = (base_10 - opt_10) / base_10
        self.assertGreaterEqual(red_10, 0.10 - 1e-4, f"Actual reduction {red_10:.4f} is less than target 0.10")

        # Target 20%: must be Optimal and achieve >= 20% reduction
        res_20, base_20, status_20, _, met_20 = build_and_solve_milp(
            self.sample, self.emission_factors, 0.20, mode=mode
        )
        self.assertEqual(status_20, "Optimal", f"Target 20% in mode {mode} failed with status {status_20}")
        opt_20 = res_20["recommended_emission_kg"].sum()
        red_20 = (base_20 - opt_20) / base_20
        self.assertGreaterEqual(red_20, 0.20 - 1e-4, f"Actual reduction {red_20:.4f} is less than target 0.20")

        # Target 25%: must be Infeasible under physical payload and range limits
        res_25, base_25, status_25, _, met_25 = build_and_solve_milp(
            self.sample, self.emission_factors, 0.25, mode=mode
        )
        self.assertEqual(status_25, "Infeasible", f"Target 25% in mode {mode} was expected to be Infeasible but got {status_25}")

    def test_minimal_disruption_mode(self):
        self._test_mode("minimal_disruption")

    def test_cost_minimizing_mode(self):
        self._test_mode("cost_minimizing")


if __name__ == "__main__":
    unittest.main()
