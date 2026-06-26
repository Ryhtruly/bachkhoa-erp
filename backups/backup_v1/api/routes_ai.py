from fastapi import APIRouter, HTTPException, UploadFile, File
from src.core import ai_vision_engine

router = APIRouter(prefix="/api/ai", tags=["AI Quy Hoạch"])

@router.post("/analyze-planning")
async def analyze_planning(file: UploadFile = File(...)):
    """
    Upload a planning document (PDF/Image) for AI analysis (VN2000 extraction).
    """
    try:
        # In reality, save the file to a temp folder and pass to AI
        result = ai_vision_engine.analyze_planning_document(file.filename)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
