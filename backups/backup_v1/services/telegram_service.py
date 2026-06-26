import os
import requests

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "MOCK_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "MOCK_CHAT_ID")

def send_telegram_message(message: str):
    """
    Sends a message to the configured Telegram chat.
    If TELEGRAM_BOT_TOKEN is 'MOCK_TOKEN', it just prints to console for testing.
    """
    if TELEGRAM_BOT_TOKEN == "MOCK_TOKEN":
        print("====== MOCK TELEGRAM MESSAGE ======")
        print(f"To: {TELEGRAM_CHAT_ID}")
        print(f"Message:\n{message}")
        print("===================================")
        return True

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"Failed to send Telegram message: {e}")
        return False

def notify_new_contract(contract_data: dict):
    """
    Format and send a message when a new contract is created.
    """
    msg = (
        f"🎉 *CÓ HỢP ĐỒNG MỚI* 🎉\n"
        f"Mã HĐ: `{contract_data.get('Mã hợp đồng', 'N/A')}`\n"
        f"Khách hàng: *{contract_data.get('Tên khách hàng', 'N/A')}*\n"
        f"Dịch vụ: {contract_data.get('Dịch vụ', 'N/A')}\n"
        f"Giá trị: {contract_data.get('Giá trị hợp đồng', 0):,} VNĐ\n"
        f"Sale phụ trách: {contract_data.get('Sale / nguồn', 'N/A')}"
    )
    return send_telegram_message(msg)

def notify_daily_report(report_data: dict):
    """
    Format and send daily CEO dashboard report.
    """
    msg = (
        f"📊 *BÁO CÁO CUỐI NGÀY* 📊\n"
        f"- Đang xử lý: {report_data.get('in_progress')} hồ sơ\n"
        f"- Đã xong: {report_data.get('completed')} hồ sơ\n"
        f"⚠️ Trễ hạn: {report_data.get('overdue')} hồ sơ\n\n"
        f"💰 Tổng doanh số: {report_data.get('total_contract_value', 0):,} VNĐ\n"
        f"💵 Đã thu: {report_data.get('total_collected', 0):,} VNĐ\n"
        f"❗️ Công nợ: {report_data.get('total_debt', 0):,} VNĐ"
    )
    return send_telegram_message(msg)
