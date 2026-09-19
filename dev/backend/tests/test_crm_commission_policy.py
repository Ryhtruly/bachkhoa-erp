import unittest
from decimal import Decimal

from src.crm.commission import (
    DEFAULT_CRM_POLICY,
    calculate_commission,
    can_claim_lead,
    normalize_policy,
    workload_score,
)


class CrmCommissionPolicyTests(unittest.TestCase):
    def test_normalize_policy_applies_safe_defaults(self):
        policy = normalize_policy({})

        self.assertEqual(policy["commission_rate_percent"], Decimal("0"))
        self.assertEqual(policy["max_workload_points"], 15)
        self.assertEqual(policy["warning_workload_ratio"], Decimal("0.8"))
        self.assertEqual(policy["stage_weights"], DEFAULT_CRM_POLICY["stage_weights"])

    def test_normalize_policy_rejects_invalid_rate_or_workload(self):
        with self.assertRaises(ValueError):
            normalize_policy({"commission_rate_percent": -1})
        with self.assertRaises(ValueError):
            normalize_policy({"commission_rate_percent": 101})
        with self.assertRaises(ValueError):
            normalize_policy({"max_workload_points": 0})

    def test_workload_score_uses_configured_stage_weights(self):
        score = workload_score(
            ["Tiếp cận", "Báo giá", "Đàm phán"],
            {"Tiếp cận": 1, "Báo giá": 2, "Đàm phán": 3},
        )

        self.assertEqual(score, 6)

    def test_claim_is_blocked_at_workload_or_open_lead_limit(self):
        policy = normalize_policy({
            "max_workload_points": 15,
            "max_open_leads": 20,
        })

        self.assertFalse(can_claim_lead(15, 3, policy))
        self.assertFalse(can_claim_lead(10, 20, policy))
        self.assertTrue(can_claim_lead(14, 19, policy))

    def test_commission_is_based_on_approved_collected_amount(self):
        self.assertEqual(
            calculate_commission(Decimal("40000000"), Decimal("15")),
            Decimal("6000000.00"),
        )


if __name__ == "__main__":
    unittest.main()
