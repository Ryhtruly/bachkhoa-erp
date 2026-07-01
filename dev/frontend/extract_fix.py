import re
import os

with open('src/pages/Thuchi.jsx', 'r') as f:
    content = f.read()

def extract_func(name):
    pattern = r"function\s+" + name + r"\b\s*\("
    match = re.search(pattern, content)
    if not match:
        print(f"Not found: {name}")
        return None
    start = match.start()
    
    first_brace_idx = content.find('{', start)
    if first_brace_idx == -1:
        return None
        
    brace_count = 0
    in_str = False
    str_char = ''
    i = first_brace_idx
    while i < len(content):
        c = content[i]
        if not in_str and c in ("'", '"', "`"):
            in_str = True
            str_char = c
        elif in_str and c == str_char and content[i-1] != '\\':
            in_str = False
        elif not in_str:
            if c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    return content[start:i+1]
        i += 1
    return None

def write_component(name, path, imports):
    code = extract_func(name)
    if code:
        # Check if the function starts with export default, if not add it
        full_code = imports + "\n\n" + "export default " + code + "\n"
        with open(path, 'w') as f:
            f.write(full_code)
        print(f"Extracted {name} to {path}")

imports_modal = """import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Modal, FormRow, FormGrid } from '../../components/ui';
import { fmt, parseNum, CATEGORY_AUTO_MAPPING } from '../utils';
import { ExcelGridTable } from '../SharedFinanceUI';
import { API } from '../financeConstants';
import { AlertCircle } from 'lucide-react';"""

imports_screen = """import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../components/ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';
"""

write_component('CashflowModal', 'src/components/finance/modals/CashflowModal.jsx', imports_modal)
write_component('CashflowDetailModal', 'src/components/finance/modals/CashflowDetailModal.jsx', imports_modal)
write_component('CashflowScreen', 'src/components/finance/screens/CashflowScreen.jsx', imports_screen)
write_component('AnalyticsScreen', 'src/components/finance/screens/AnalyticsScreen.jsx', imports_screen)

