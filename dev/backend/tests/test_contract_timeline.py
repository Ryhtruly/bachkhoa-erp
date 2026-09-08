from datetime import datetime, timezone

from src.contracts.timeline import project_node_timeline


def test_project_node_timeline_keeps_ready_and_all_submission_attempts():
    projected = project_node_timeline(
        {
            "started_at": datetime(2026, 8, 1, 9, tzinfo=timezone.utc),
            "accepted_at": datetime(2026, 8, 3, 10, tzinfo=timezone.utc),
            "completed_at": None,
            "deadline_at": datetime(2026, 8, 4, 17, tzinfo=timezone.utc),
        },
        events=[
            {"event_type": "NODE_UNLOCKED", "to_status": "ready", "created_at": datetime(2026, 8, 1, 8, tzinfo=timezone.utc)},
        ],
        acceptances=[
            {"attempt_no": 2, "submitted_at": datetime(2026, 8, 2, 12, tzinfo=timezone.utc), "status": "accepted", "reviewed_at": datetime(2026, 8, 3, 10, tzinfo=timezone.utc), "review_note": "Đạt"},
            {"attempt_no": 1, "submitted_at": datetime(2026, 8, 1, 12, tzinfo=timezone.utc), "status": "rework_required", "reviewed_at": datetime(2026, 8, 2, 9, tzinfo=timezone.utc), "review_note": "Bổ sung"},
        ],
    )

    assert projected["ready_at"] == "2026-08-01T08:00:00+00:00"
    assert projected["completed_at"] == "2026-08-03T10:00:00+00:00"
    assert [item["attempt_no"] for item in projected["submissions"]] == [1, 2]
