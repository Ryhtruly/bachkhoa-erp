import time

def analyze_planning_document(file_name: str) -> dict:
    """
    Mocks an AI Vision/OCR model that extracts VN2000 coordinates
    from a planning map or red book (Sổ hồng), and cross-references
    it with the planning database.
    """
    print(f"[AI Vision] Analyzing {file_name}...")
    time.sleep(2) # Simulate processing time
    
    mock_result = {
        "file_name": file_name,
        "extracted_coordinates": "X: 593845.23, Y: 1193842.11",
        "planning_status": "Đất ở tại đô thị (ODT) 100%",
        "warnings": "Lộ giới 5m phía trước nhà.",
        "ai_confidence": 0.95
    }
    
    print("[AI Vision] Analysis complete.")
    return mock_result
