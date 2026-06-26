# Module 01: Database Schema & Architecture Context

## Overview
This document defines the generic data structure required to run the OpenClaw ERP Agent. Regardless of the underlying technology (Google Sheets, SQL, Airtable, or local Excel), the Agent MUST establish and maintain the following interconnected tables/sheets to ensure data consistency across all 20 workflows.

## 1. CRM & Sales Data (Master Leads & Contracts)
- **Table: Leads_Pipeline**
  - Columns: `Lead_ID`, `Customer_Name`, `Phone`, `Source (Zalo/Web/Call)`, `Requirements`, `Status (New/Qualified/Negotiation/Won/Lost)`, `Assigned_To`.
  - Trigger: A new lead from any source must create a row here.
- **Table: Contracts**
  - Columns: `Contract_ID`, `Lead_ID`, `Customer_Name`, `Service_Type`, `Total_Value`, `Date_Signed`, `File_Link`.
  - Trigger: When a Lead status changes to "Won", a Contract is generated and logged here.

## 2. Production & Operations Data
- **Table: Projects_Tasks**
  - Columns: `Project_ID`, `Contract_ID`, `Task_Name`, `Assignee`, `Deadline`, `Status (Pending/In Progress/Completed/Overdue)`, `Completion_Date`.
  - Trigger: Generated automatically when a new Contract is signed.

## 3. Finance & Accounting Data
- **Table: Cashflow_Transactions**
  - Columns: `Transaction_ID`, `Project_ID`, `Type (Inflow/Outflow)`, `Amount`, `Date`, `Category`, `Payer_Payee`, `Payment_Method`.
- **Table: Receivables (Công Nợ)**
  - Columns: `Debt_ID`, `Contract_ID`, `Customer_Name`, `Total_Amount`, `Paid_Amount`, `Remaining_Amount`, `Due_Date`.
  - Trigger: Auto-calculates based on Contracts and Cashflow_Transactions.

## 4. HR & Payroll Data
- **Table: Employees**
  - Columns: `Employee_ID`, `Name`, `Department`, `Base_Salary`.
- **Table: KPI_Payroll**
  - Columns: `Employee_ID`, `Month`, `Tasks_Completed`, `KPI_Score`, `Bonus`, `Total_Salary`.
  - Trigger: Auto-calculated at month-end by joining Employees with Projects_Tasks (Status = Completed).

## Implementation Instruction for AI:
When initiating a new project, verify if these tables exist. If missing, CREATE them or map them to the client's existing schema. All data operations MUST utilize `Contract_ID` or `Project_ID` as the primary key connecting CRM -> Production -> Finance.
