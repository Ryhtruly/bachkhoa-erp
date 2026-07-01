import subprocess

content = subprocess.check_output(['git', 'show', 'HEAD:dev/frontend/src/pages/Thuchi.jsx']).decode('utf-8')

search_str = "function CashflowDetailModal({ open, transactionId, onClose, onSuccess }) {"
start_idx = content.find(search_str)
if start_idx == -1:
    print("Not found")
    exit(1)

# Start brace counting exactly from the '{' at the end of search_str
start_brace_idx = start_idx + len(search_str) - 1

brace_count = 0
end_idx = -1

for i in range(start_brace_idx, len(content)):
    if content[i] == '{':
        brace_count += 1
    elif content[i] == '}':
        brace_count -= 1
        if brace_count == 0:
            end_idx = i + 1
            break

if end_idx != -1:
    func_content = content[start_idx:end_idx]
    imports = """import React, { useState, useEffect } from 'react';
import { Modal, FormRow, FormGrid, Dropdown } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { AlertCircle, Link } from 'lucide-react';
import { API } from '../financeConstants';
import { parseAmt, docSoTiengViet } from '../utils';

"""
    with open('src/components/finance/modals/CashflowDetailModal.jsx', 'w') as f:
        f.write(imports + func_content + "\n\nexport default CashflowDetailModal;\n")
    print("Extracted successfully")
else:
    print("Could not find end of function")
