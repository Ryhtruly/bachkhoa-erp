# Module 04: Finance & CEO Dashboard Workflow (Generic)

## Overview
This module controls cash flow, monitors debt, and aggregates all business data into a high-level dashboard for the Executive Team.

## Workflow 1: Income/Expense Tracking (NV15)
- **Trigger:** Accounting staff inputs a payment receipt or expense voucher.
- **Action:**
  1. AI logs the transaction into `Cashflow_Transactions`.
  2. Links the transaction to the relevant `Contract_ID` or `Project_ID`.

## Workflow 2: Automated Debt Collection (NV10, NV06)
- **Trigger:** Scheduled daily check against the `Receivables` table.
- **Action:**
  1. AI identifies contracts where `Due_Date` is approaching (e.g., 3 days left) or overdue.
  2. Automatically sends a polite reminder message to the Customer via Zalo OA or Email.
  3. Logs the "Reminder Sent" event to prevent spamming.

## Workflow 3: CEO Dashboard & Management Reporting (NV07, NV17)
- **Trigger:** Real-time updates AND Scheduled Weekly/Monthly summaries.
- **Action:**
  1. Aggregates data from CRM (Total Sales), Production (Completed Projects), and Finance (Net Cashflow).
  2. Updates a centralized Dashboard interface (Web App or Google Data Studio).
  3. Generates a text summary (e.g., "Revenue this week: $X, 3 Overdue Debts, 5 New Contracts").
  4. **Notification:** Pushes the summary directly to the CEO's Telegram or WhatsApp every Friday at 5:00 PM.
