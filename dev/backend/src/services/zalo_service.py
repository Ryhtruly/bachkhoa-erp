import os
import requests

ZALO_ACCESS_TOKEN = os.getenv("ZALO_ACCESS_TOKEN", "MOCK_TOKEN")
ZALO_OA_ID = os.getenv("ZALO_OA_ID", "MOCK_OA_ID")

def send_zalo_message(phone_number: str, message: str):
    """
    Sends a message to a customer via Zalo OA.
    Mocks the output if ZALO_ACCESS_TOKEN is not configured.
    """
    if ZALO_ACCESS_TOKEN == "MOCK_TOKEN":
        print("====== MOCK ZALO MESSAGE ======")
        print(f"To Phone: {phone_number}")
        print(f"Message:\n{message}")
        print("===============================")
        return True

    # Real Zalo OA API implementation (using phone number or Zalo User ID)
    # Zalo requires knowing the user_id mapped to the phone number if not sending ZNS.
    # For now, this is a placeholder for the actual API call.
    url = "https://openapi.zalo.me/v2.0/oa/message"
    headers = {
        "access_token": ZALO_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }
    payload = {
        "recipient": {
            "user_id": phone_number  # In reality, needs Zalo User ID or phone number format for ZNS
        },
        "message": {
            "text": message
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"Failed to send Zalo message: {e}")
        return False

def remind_debt(customer_name: str, phone: str, contract_id: str, amount: float):
    """
    Format and send a polite debt reminder to a customer.
    """
    msg = (
        f"Kính gửi {customer_name},\n\n"
        f"Công ty Bách Khoa xin trân trọng thông báo: Hợp đồng số {contract_id} của quý khách "
        f"đã đến hạn thanh toán đợt tiếp theo.\n"
        f"Số tiền cần thanh toán: {amount:,} VNĐ.\n\n"
        f"Quý khách vui lòng thanh toán để chúng tôi tiếp tục tiến độ công việc.\n"
        f"Xin chân thành cảm ơn!"
    )
    return send_zalo_message(phone, msg)
