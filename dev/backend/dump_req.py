import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd

xlsx = pd.ExcelFile('d:/Downloads/cty/BachKhoa/tai_lieu/yeu_cau_nghiep_vu/Yêu cầu.xlsx')
df = pd.read_excel(xlsx, sheet_name=xlsx.sheet_names[0])
# Find column with tasks. Let's assume it's column 3 (index 3)
for index, row in df.iterrows():
    # Only print rows that look like tasks (maybe column 2 or 3 is not null)
    vals = [str(x) for x in row.values if pd.notnull(x)]
    if len(vals) > 0:
        print(f"Row {index}: {' | '.join(vals)}")
