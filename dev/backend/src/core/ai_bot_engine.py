import os
import time

def parse_zalo_message(text: str) -> dict:
    """
    Giả lập AI phân tích tin nhắn Zalo, bóc tách Tên, SĐT, Nhu cầu.
    (Không gọi API thật để tránh phát sinh chi phí).
    """
    print(f"[AI Bot] Đang phân tích tin nhắn: {text}")
    time.sleep(1) # Giả lập độ trễ
    
    # Giả lập kết quả dựa trên từ khóa đơn giản
    text_lower = text.lower()
    
    intent = "khac"
    requirements = text
    if "báo giá" in text_lower:
        intent = "hoi_bao_gia"
    elif "đo đạc" in text_lower:
        intent = "yeu_cau_do_ve"
        
    return {
        "intent": intent,
        "customer_name": "Khách Test",
        "phone": "0987654321",
        "requirements": requirements,
        "reply_message": "Bách Khoa đã nhận được yêu cầu của bạn. Chuyên viên sẽ liên hệ lại ngay ạ."
    }
