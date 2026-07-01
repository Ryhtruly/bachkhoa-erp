import os
import re

files_to_check = []
for root, _, files in os.walk('src/components/finance'):
    for f in files:
        if f.endswith('.jsx'):
            files_to_check.append(os.path.join(root, f))

# ALL available icons from Thuchi.jsx originally
all_icons = {
  'Wallet', 'ChevronRight', 'Receipt', 'Banknote', 'Building2',
  'FileText', 'AlertCircle', 'ArrowDownLeft', 'ArrowUpRight',
  'Clock', 'RotateCcw', 'Users', 'Hammer', 'BarChart2', 'TrendingUp',
  'PlusCircle', 'MinusCircle', 'RefreshCw', 'DollarSign', 'X', 'Link', 'Settings', 'Check'
}

for filepath in files_to_check:
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Find all components used in JSX: <IconName
    used_components = set(re.findall(r'<([A-Z][a-zA-Z]*)', content))
    
    # Intersection with all_icons gives the icons we actually need in this file
    needed_icons = used_components.intersection(all_icons)
    
    if needed_icons:
        # Check current import
        import_match = re.search(r"import\s+\{([^}]+)\}\s+from\s+['\"]lucide-react['\"];?", content)
        if import_match:
            current_imports = set(x.strip() for x in import_match.group(1).split(','))
            current_imports = {x for x in current_imports if x} # remove empty
            
            # Combine current with needed
            combined = current_imports.union(needed_icons)
            
            if combined != current_imports:
                new_import_str = "import { " + ", ".join(combined) + " } from 'lucide-react';"
                content = content[:import_match.start()] + new_import_str + content[import_match.end():]
                with open(filepath, 'w') as f:
                    f.write(content)
                print(f"Fixed icons in {filepath}: added {needed_icons - current_imports}")
        else:
            # Add the import if it's completely missing
            new_import_str = "import { " + ", ".join(needed_icons) + " } from 'lucide-react';\n"
            content = new_import_str + content
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Added new import in {filepath}: {needed_icons}")

print("Done fixing icons.")
