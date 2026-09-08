import unittest

from src.contracts.workflow_runtime import WorkflowValidationError, _validate_drive_url


class WorkflowEvidenceUrlTests(unittest.TestCase):
    def test_legacy_evidence_link_accepts_minio_http_url(self):
        url = "http://localhost:9000/wiki-files/workflow-evidence/minh-chung.pdf"

        self.assertEqual(
            _validate_drive_url(
                url,
                node_key="submit",
                checklist_name="Biên bản",
            ),
            url,
        )

    def test_legacy_evidence_link_is_optional(self):
        self.assertIsNone(_validate_drive_url(
            "",
            node_key="submit",
            checklist_name="Biên bản",
        ))

    def test_legacy_evidence_link_rejects_non_http_protocol(self):
        with self.assertRaises(WorkflowValidationError):
            _validate_drive_url(
                "file:///tmp/minh-chung.pdf",
                node_key="submit",
                checklist_name="Biên bản",
            )


if __name__ == "__main__":
    unittest.main()
