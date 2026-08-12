from typing import Mapping, Sequence


def _iso(value):
    return value.isoformat() if value and hasattr(value, "isoformat") else value


def project_node_timeline(
    node: Mapping[str, object],
    *,
    events: Sequence[Mapping[str, object]],
    acceptances: Sequence[Mapping[str, object]],
) -> dict:
    """Project authoritative node history without inventing missing milestones."""
    ready_events = [
        event for event in events
        if event.get("event_type") in {"NODE_MATERIALIZED", "NODE_UNLOCKED"}
        and event.get("to_status") == "ready"
        and event.get("created_at")
    ]
    ready_at = min((event["created_at"] for event in ready_events), default=None)
    submissions = [
        {
            "attempt_no": acceptance.get("attempt_no"),
            "submitted_at": _iso(acceptance.get("submitted_at")),
            "decision": acceptance.get("status"),
            "decided_at": _iso(acceptance.get("reviewed_at")),
            "reason": acceptance.get("review_note"),
        }
        for acceptance in sorted(
            acceptances,
            key=lambda item: (item.get("attempt_no") or 0, item.get("submitted_at") or ""),
        )
    ]
    return {
        "ready_at": _iso(ready_at),
        "started_at": _iso(node.get("started_at")),
        "submissions": submissions,
        "completed_at": _iso(node.get("completed_at") or node.get("accepted_at")),
        "deadline_at": _iso(node.get("deadline_at")),
    }
