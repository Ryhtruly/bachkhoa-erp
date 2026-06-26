import os
import re

src_dir = r"d:\Downloads\cty\BachKhoa\dev\backend\src"
scripts_dir = r"d:\Downloads\cty\BachKhoa\dev\backend\scripts"

replacements = [
    (r'from db\.', 'from src.db.'),
    (r'import db\.', 'import src.db.'),
    (r'from routes\.', 'from src.routes.'),
    (r'import routes\.', 'import src.routes.'),
    (r'from core\.', 'from src.core.'),
    (r'import core\.', 'import src.core.'),
    (r'from services\.', 'from src.services.'),
    (r'import services\.', 'import src.services.'),
]

for root_dir in [src_dir, scripts_dir]:
    for dirpath, _, filenames in os.walk(root_dir):
        for f in filenames:
            if f.endswith('.py'):
                path = os.path.join(dirpath, f)
                with open(path, 'r', encoding='utf-8') as file:
                    content = file.read()
                
                new_content = content
                for pattern, repl in replacements:
                    new_content = re.sub(pattern, repl, new_content)
                
                if new_content != content:
                    with open(path, 'w', encoding='utf-8') as file:
                        file.write(new_content)
                    print(f"Fixed {path}")
