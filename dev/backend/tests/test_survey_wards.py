from src.routes.routes_survey_records import list_provinces


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, rows):
        self.rows = rows
        self.statement = None

    def execute(self, statement):
        self.statement = str(statement)
        return FakeResult(self.rows)


def test_list_provinces_returns_active_locations_in_name_order():
    db = FakeSession([
        {"code": "01", "name": "Hà Nội"},
        {"code": "79", "name": "TP. Hồ Chí Minh"},
    ])

    result = list_provinces(db=db, user=None)

    assert result == {
        "status": "success",
        "data": [
            {"code": "01", "name": "Hà Nội"},
            {"code": "79", "name": "TP. Hồ Chí Minh"},
        ],
    }
    assert "distinct province_code as code, province_name as name" in db.statement.lower()
    assert "where is_active" in db.statement.lower()
    assert "order by province_name" in db.statement.lower()
