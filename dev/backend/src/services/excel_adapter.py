import os
import pandas as pd
import numpy as np

# Navigate up to the root folder (BachKhoa)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
EXCEL_PATH = os.path.join(BASE_DIR, "BACHKHOA_FULL_AUTO_2026_migrated.xlsx")

def read_sheet(sheet_name: str):
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: Excel file not found at {EXCEL_PATH}")
        return []
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name, header=2)
        # Replace NaN with None
        df = df.replace({np.nan: None})
        return df.to_dict(orient='records')
    except Exception as e:
        print(f"Error reading sheet {sheet_name}: {e}")
        return []
