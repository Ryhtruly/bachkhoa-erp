import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core import chatbot_engine
from src.core.chatbot_engine import (
    DEFAULT_CHAT_MODELS,
    ask_chatbot,
    resolve_chatbot_llm,
    suggested_replacement_model,
)


class ResolveChatbotLlmTest(unittest.TestCase):
    def test_only_gemini_key_configured_uses_gemini(self):
        # Trước đây: provider mặc định "deepseek" + key chatbot trống → "chưa được cấp API Key".
        provider, key, model = resolve_chatbot_llm({"gemini_api_key": "AIza-shared"})
        self.assertEqual((provider, key, model), ("gemini", "AIza-shared", DEFAULT_CHAT_MODELS["gemini"]))

    def test_env_gemini_key_is_used_when_setting_missing(self):
        provider, key, _ = resolve_chatbot_llm({}, env_gemini_key="AIza-env")
        self.assertEqual((provider, key), ("gemini", "AIza-env"))

    def test_provider_is_normalized(self):
        provider, key, _ = resolve_chatbot_llm({"chatbot_llm_provider": " Gemini ", "gemini_api_key": "AIza-x"})
        self.assertEqual((provider, key), ("gemini", "AIza-x"))

    def test_deepseek_keeps_its_own_key(self):
        provider, key, model = resolve_chatbot_llm(
            {"chatbot_llm_provider": "deepseek", "chatbot_llm_api_key": "sk-ds", "gemini_api_key": "AIza-x"}
        )
        self.assertEqual((provider, key, model), ("deepseek", "sk-ds", "deepseek-chat"))

    def test_blank_provider_with_non_gemini_key_stays_deepseek(self):
        provider, key, _ = resolve_chatbot_llm({"chatbot_llm_api_key": "sk-ds"})
        self.assertEqual((provider, key), ("deepseek", "sk-ds"))

    def test_blank_provider_with_gemini_shaped_chatbot_key(self):
        provider, key, _ = resolve_chatbot_llm({"chatbot_llm_api_key": "AIza-own"})
        self.assertEqual((provider, key), ("gemini", "AIza-own"))

    def test_model_override(self):
        _, _, model = resolve_chatbot_llm({"gemini_api_key": "AIza-x", "chatbot_llm_model": " gemini-3-flash "})
        self.assertEqual(model, "gemini-3-flash")


RETIRED_MODEL_ERROR = (
    '[{"error": {"code": 404, "message": "This model models/gemini-2.5-flash is no longer '
    'available to new users. Please update your code to use models/gemini-3.8-flash for the '
    'latest features and improvements.", "status": "NOT_FOUND"}}]'
)


def _ok_response(text="Xin chào"):
    response = MagicMock(status_code=200)
    response.json.return_value = {"choices": [{"message": {"content": text}}]}
    return response


def _run_chat(responses, model=None):
    client = MagicMock()
    client.post = AsyncMock(side_effect=responses)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    with patch.object(chatbot_engine.httpx, "AsyncClient", return_value=client), \
         patch.object(chatbot_engine, "get_knowledge_base", return_value=""):
        result = asyncio.run(ask_chatbot(
            history=[{"role": "user", "content": "chào"}],
            sheet_id="", service_account_json="",
            provider="gemini", api_key="AIza-x", model=model,
            wiki_context=[{"content": "Quy trình", "doc_title": "ISO", "category": "QT"}],
        ))
    return result, client


class AskChatbotGeminiPayloadTest(unittest.TestCase):
    def test_suggested_replacement_model_is_parsed(self):
        self.assertEqual(suggested_replacement_model(RETIRED_MODEL_ERROR), "gemini-3.8-flash")
        self.assertIsNone(suggested_replacement_model('{"error": {"code": 404}}'))

    def test_retired_model_retries_with_googles_suggestion(self):
        retired = MagicMock(status_code=404, text=RETIRED_MODEL_ERROR)
        (reply, ok, _), client = _run_chat([retired, _ok_response()], model="gemini-2.5-flash")

        self.assertEqual((reply, ok), ("Xin chào", True))
        models = [call.kwargs["json"]["model"] for call in client.post.call_args_list]
        self.assertEqual(models, ["gemini-2.5-flash", "gemini-3.8-flash"])

    def test_unknown_model_without_suggestion_points_to_settings(self):
        missing = MagicMock(status_code=404, text='{"error": {"code": 404, "status": "NOT_FOUND"}}')
        (reply, ok, reason), client = _run_chat([missing], model="gemini-typo")

        self.assertFalse(ok)
        self.assertEqual(reason, "Model Not Found")
        self.assertIn("gemini-typo", reply)
        self.assertIn("Model Chatbot", reply)
        self.assertEqual(client.post.call_count, 1)

    def test_gemini_request_does_not_use_retired_model(self):
        (reply, ok, _), client = _run_chat([_ok_response()])

        self.assertEqual((reply, ok), ("Xin chào", True))
        payload = client.post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], DEFAULT_CHAT_MODELS["gemini"])
        self.assertEqual(payload["reasoning_effort"], "low")
        self.assertGreaterEqual(payload["max_tokens"], 1024)
        self.assertIn("Quy trình", payload["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
