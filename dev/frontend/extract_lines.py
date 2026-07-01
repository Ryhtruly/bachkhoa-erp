import sys

def extract_lines(start, end, func_name, out_path, imports):
    with open('src/pages/Thuchi.jsx', 'r') as f:
        lines = f.readlines()
        
    extracted = lines[start-1:end]
    
    # replace "function func_name" with "export default function func_name"
    if "export default" not in extracted[0]:
        extracted[0] = extracted[0].replace(f"function {func_name}", f"export default function {func_name}")
        
    with open(out_path, 'w') as f:
        f.write(imports + "\n\n")
        f.writelines(extracted)

imports_modal = """import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Modal, FormRow, FormGrid } from '../../components/ui';
import { fmt, parseNum, CATEGORY_AUTO_MAPPING } from '../utils';
import { ExcelGridTable } from '../SharedFinanceUI';
import { API } from '../financeConstants';
import { AlertCircle, PlusCircle, MinusCircle, Check } from 'lucide-react';"""

imports_screen = """import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../components/ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';
"""

extract_lines(191, 411, 'CashflowModal', 'src/components/finance/modals/CashflowModal.jsx', imports_modal)
extract_lines(415, 523, 'CashflowDetailModal', 'src/components/finance/modals/CashflowDetailModal.jsx', imports_modal)
extract_lines(731, 944, 'CashflowScreen', 'src/components/finance/screens/CashflowScreen.jsx', imports_screen)
extract_lines(1534, 1657, 'AnalyticsScreen', 'src/components/finance/screens/AnalyticsScreen.jsx', imports_screen)

print("Extraction completed!")
