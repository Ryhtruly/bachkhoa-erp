import os
import re

files_to_check = []
for root, _, files in os.walk('src/components/finance'):
    for f in files:
        if f.endswith('.jsx'):
            files_to_check.append(os.path.join(root, f))

# components available in `../../ui` (just some common ones)
known_ui = {'DataTable', 'Badge', 'Modal', 'FormRow', 'FormGrid', 'FilterBar', 'SubTabs', 'Dropdown'}

for filepath in files_to_check:
    with open(filepath, 'r') as f:
        content = f.read()
    
    # components used in JSX
    used_components = set(re.findall(r'<([A-Z][a-zA-Z]*)', content))
    
    # remove html tags just in case
    used_components = {c for c in used_components if c[0].isupper()}
    
    # get all imports
    imported = set()
    for match in re.finditer(r"import\s+(?:{[^}]+}|[A-Za-z_]+)\s+from\s+['\"][^'\"]+['\"]", content):
        import_stmt = match.group(0)
        # extract words
        words = re.findall(r'[A-Za-z_][A-Za-z0-9_]*', import_stmt)
        # remove 'import', 'from'
        words = [w for w in words if w not in ('import', 'from', 'as')]
        imported.update(words)
        
    missing = used_components - imported
    # filter out React context/fragments
    missing = missing - {'React', 'Fragment'}
    
    if missing:
        print(f"Missing in {filepath}: {missing}")

