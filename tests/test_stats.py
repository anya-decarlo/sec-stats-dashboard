import math
import unittest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stats


class TestStats(unittest.TestCase):
    def test_describe(self):
        d = stats.describe([1, 2, 3, 4, 5])
        self.assertEqual(d["n"], 5)
        self.assertEqual(d["mean"], 3)
        self.assertEqual(d["median"], 3)
        self.assertEqual(d["min"], 1)
        self.assertEqual(d["max"], 5)

    def test_ols_perfect_fit(self):
        fit = stats.ols([0, 1, 2, 3], [1, 3, 5, 7])  # y = 2x + 1
        self.assertAlmostEqual(fit["slope"], 2)
        self.assertAlmostEqual(fit["intercept"], 1)
        self.assertAlmostEqual(fit["r2"], 1.0)

    def test_ols_residuals_sum_zero(self):
        fit = stats.ols([0, 1, 2, 3, 4], [3, 1, 4, 1, 5])
        self.assertAlmostEqual(sum(fit["residuals"]), 0, places=8)

    def test_iqr_fences_flag_extreme(self):
        xs = [10, 11, 12, 13, 14, 15, 16, 100]
        lo, hi = stats.iqr_fences(xs)
        self.assertGreater(hi, 16)   # fence above normal range
        self.assertGreater(100, hi)  # but below the extreme point -> flagged

    def test_z_scores(self):
        zs = stats.z_scores([1, 2, 3, 4, 5])
        self.assertAlmostEqual(sum(zs), 0, places=8)
        self.assertAlmostEqual(zs[-1], -zs[0])

    def test_cagr(self):
        self.assertAlmostEqual(stats.cagr(100, 121, 2), 10.0)
        self.assertIsNone(stats.cagr(-1, 100, 2))

    def test_histogram_counts_total(self):
        h = stats.histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bins=5)
        self.assertEqual(sum(h["counts"]), 10)
        self.assertEqual(len(h["edges"]), 6)


if __name__ == "__main__":
    unittest.main()
