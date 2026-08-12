import pytest

from fastapi import HTTPException

from src.dossiers.lifecycle import assert_dossier_mutable
from src.routes import routes_legal_submissions, routes_survey_records
from src.routes.routes_legal_submissions import LegalSubmissionUpdateSchema, update_legal_submission
from src.routes.routes_survey_records import SurveyRecordUpdateSchema, update_survey_record


@pytest.mark.parametrize("status", [None, "Đang thực hiện", "Đang chi nhánh", "Rút hồ sơ", "Trả công văn"])
def test_draft_or_rework_dossiers_remain_mutable(status):
    assert_dossier_mutable(status)


@pytest.mark.parametrize("status", ["Hoàn thành", "Nộp thành công"])
def test_terminal_dossiers_are_locked(status):
    with pytest.raises(HTTPException) as exc_info:
        assert_dossier_mutable(status)

    assert exc_info.value.status_code == 409
    assert "đã hoàn tất" in exc_info.value.detail


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar(self):
        return self.value

    def first(self):
        return self.value


class FakeDb:
    def __init__(self, current_status):
        self.current_status = current_status
        self.statements = []

    def execute(self, statement, params=None):
        query = str(statement)
        self.statements.append(query)
        if "select gov_status" in query or "select status" in query:
            return FakeResult((self.current_status,))
        return FakeResult(("record-1",))

    def commit(self):
        raise AssertionError("completed dossier must not commit an edit")


@pytest.mark.parametrize(
    ("route_module", "handler", "payload"),
    [
        (
            routes_legal_submissions,
            update_legal_submission,
            LegalSubmissionUpdateSchema(note="không được sửa"),
        ),
        (
            routes_survey_records,
            update_survey_record,
            SurveyRecordUpdateSchema(note="không được sửa"),
        ),
    ],
)
def test_route_rejects_content_change_after_completion(monkeypatch, route_module, handler, payload):
    monkeypatch.setattr(route_module, "check_user_permission", lambda *_: True)
    db = FakeDb("Hoàn thành")

    with pytest.raises(HTTPException) as exc_info:
        handler("record-1", payload, db, object())

    assert exc_info.value.status_code == 409
    assert not any("update public" in statement for statement in db.statements)
