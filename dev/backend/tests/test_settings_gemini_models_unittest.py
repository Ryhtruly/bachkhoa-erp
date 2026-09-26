import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from src.routes import routes_settings
from src.routes.routes_settings import ModelListRequest, list_gemini_models


def _db_with(settings):
    db = MagicMock()
    db.query.return_value.all.return_value = [MagicMock(key=k, value=v) for k, v in settings.items()]
    return db


def _google_client(status_code=200, models=()):
    response = MagicMock(status_code=status_code)
    response.json.return_value = {"models": list(models)}
    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    return client


def _model(name, methods=("generateContent",)):
    return {"name": f"models/{name}", "displayName": name.upper(), "supportedGenerationMethods": list(methods)}


class ListGeminiModelsTest(unittest.TestCase):
    def _call(self, stored, form=None, client=None):
        with patch.object(routes_settings.httpx, "AsyncClient", return_value=client or _google_client()), \
             patch.dict(routes_settings.os.environ, {"GEMINI_API_KEY": ""}):
            return asyncio.run(list_gemini_models(ModelListRequest(settings=form or {}), db=_db_with(stored), user=None))

    def test_lists_chat_models_newest_first_with_flash_before_pro(self):
        client = _google_client(models=[
            _model("gemini-2.5-flash"),
            _model("gemini-3.8-pro"),
            _model("gemini-3.8-flash"),
            _model("gemini-embedding-001", methods=("embedContent",)),
            _model("imagen-4", methods=("predict",)),
        ])
        result = self._call({"gemini_api_key": "AIza-stored"}, client=client)

        self.assertEqual([m["id"] for m in result["models"]], ["gemini-3.8-flash", "gemini-3.8-pro", "gemini-2.5-flash"])
        self.assertEqual(client.get.call_args.kwargs["headers"], {"x-goog-api-key": "AIza-stored"})

    def test_uses_unsaved_key_from_form_but_keeps_stored_key_behind_mask(self):
        client = _google_client()
        self._call({"gemini_api_key": "AIza-stored"}, form={"gemini_api_key": "AIza-typed"}, client=client)
        self.assertEqual(client.get.call_args.kwargs["headers"], {"x-goog-api-key": "AIza-typed"})

        client = _google_client()
        self._call({"gemini_api_key": "AIza-stored"}, form={"gemini_api_key": "********"}, client=client)
        self.assertEqual(client.get.call_args.kwargs["headers"], {"x-goog-api-key": "AIza-stored"})

    def test_missing_key_and_google_errors_are_reported(self):
        with self.assertRaises(HTTPException) as missing:
            self._call({})
        self.assertEqual(missing.exception.status_code, 400)

        with self.assertRaises(HTTPException) as rejected:
            self._call({"gemini_api_key": "AIza-bad"}, client=_google_client(status_code=400))
        self.assertEqual(rejected.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
