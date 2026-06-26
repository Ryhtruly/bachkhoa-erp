# Module 03: Production & HR Automation Workflow (Generic)

## Overview
This module focuses on Fulfillment (Delivering the service/product) and Human Resources (Tracking attendance and calculating performance-based salary).

## Workflow 1: Project/Task Assignment (NV11)
- **Trigger:** A new `Contract` is signed (from the CRM Module).
- **Action:**
  1. AI automatically creates a new project in the `Projects_Tasks` table.
  2. Assigns sub-tasks to relevant departments based on the `Service_Type`.
  3. Sets deadlines automatically based on service SLAs.
  4. **Notification:** Alerts assigned staff via Telegram/Zalo.

## Workflow 2: Automated Attendance & Time Tracking (NV19)
- **Input:** Face recognition camera API (e.g., Hanet) or check-in software.
- **Action:**
  1. Receives webhook of employee check-in/out.
  2. Logs time into the `Attendance` sheet.
  3. Flags "Late" or "Absent" employees and auto-messages them for explanation.

## Workflow 3: KPI & Payroll Calculation (NV12, NV13)
- **Trigger:** Month-end (Scheduled Cron Job).
- **Action:**
  1. AI scans the `Projects_Tasks` table for all tasks marked `Completed` within the month.
  2. Matches tasks to the `Employees` table.
  3. Calculates Base Salary + KPI Bonus (e.g., 3P Salary mechanism) based on task difficulty or revenue generated.
  4. Generates the final `Payroll_Report` PDF/Sheet.
  5. **Notification:** Sends individual salary slips to employees via private message.
