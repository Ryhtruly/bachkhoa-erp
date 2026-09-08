from src.contracts import read_model


class FakeRedis:
    def __init__(self, value):
        self.value = value

    def get(self, _key):
        return self.value


def test_contract_read_model_returns_redis_source_on_valid_cached_payload(monkeypatch):
    monkeypatch.setattr(read_model, "_get_redis_client", lambda: FakeRedis('{"rows":[{"contract_id":"001/BK-2026"}]}'))

    rows, source = read_model.get_contract_read_model(object())

    assert rows == [{"contract_id": "001/BK-2026"}]
    assert source == "redis"


def test_contract_read_model_labels_invalid_cache_as_db_fallback(monkeypatch):
    monkeypatch.setattr(read_model, "_get_redis_client", lambda: FakeRedis("not-json"))
    monkeypatch.setattr(read_model, "refresh_contract_read_model", lambda _db: [{"contract_id": "002/BK-2026"}])

    rows, source = read_model.get_contract_read_model(object())

    assert rows == [{"contract_id": "002/BK-2026"}]
    assert source == "db-fallback"
