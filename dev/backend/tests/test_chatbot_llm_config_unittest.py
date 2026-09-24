import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core import chatbot_engine
from src.core.chatbot_engine import ask_chatbot, resolve_chatbot_llm


class ResolveChatbotLlmTest(unittest.TestCase):
    def test_only_gemini_key_configured_uses_gemini(self):
        # Trước đây: provider mặc định "deepseek" + key chatbot trống → "chưa được cấp API Key".
        provider, key, model = resolve_chatbot_llm({"gemini_api_key": "AIza-shared"})
        self.assertEqual((provider, key, model), ("gemini", "AIza-shared", "gemini-2.5-flash"))

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


class AskChatbotGeminiPayloadTest(unittest.TestCase):
    def test_gemini_request_does_not_use_retired_model(self):
        response = MagicMock(status_code=200)
        response.json.return_value = {"choices": [{"message": {"content": "Xin chào"}}]}
        client = MagicMock()
        client.post = AsyncMock(return_value=response)
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)

        with patch.object(chatbot_engine.httpx, "AsyncClient", return_value=client), \
             patch.object(chatbot_engine, "get_knowledge_base", return_value=""):
            reply, ok, _ = asyncio.run(ask_chatbot(
                history=[{"role": "user", "content": "chào"}],
                sheet_id="", service_account_json="",
                provider="gemini", api_key="AIza-x",
                wiki_context=[{"content": "Quy trình", "doc_title": "ISO", "category": "QT"}],
            ))

        self.assertEqual((reply, ok), ("Xin chào", True))
        payload = client.post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "gemini-2.5-flash")
        self.assertEqual(payload["reasoning_effort"], "low")
        self.assertGreaterEqual(payload["max_tokens"], 1024)
        self.assertIn("Quy trình", payload["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
