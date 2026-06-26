# Module 02: CRM & Sales Automation Workflow (Generic)

## Overview
This module handles the lifecycle of a Customer from the first touchpoint (Lead) to a signed Contract (Won). The goal is to ensure ZERO leads are dropped and pricing is quoted consistently and automatically.

## Workflow 1: Lead Capture & Auto-Reply (NV16, NV08)
- **Input Channels:** Facebook Messenger, Zalo OA, Website Form, Telegram Bot, Call Center.
- **Action:** 
  1. AI analyzes the incoming text/voice to extract: `Customer Name`, `Phone`, `Service Required`.
  2. Creates a new record in `Leads_Pipeline` with Status = `New`.
  3. Sends an immediate auto-reply acknowledging receipt and setting expectations.

## Workflow 2: Automated Quoting (NV01, NV02)
- **Trigger:** Sales Rep or Customer inputs basic parameters (e.g., Area size, Service type, Location).
- **Action:**
  1. AI queries the internal `Pricing_Table`.
  2. Calculates the final price.
  3. Populates a Google Docs / Word Template to generate a PDF Quote.
  4. Emails or messages the PDF directly to the Customer.
  5. Updates Lead Status to `Negotiation`.

## Workflow 3: Contract Generation & Closing (NV03, NV04, NV05)
- **Trigger:** Customer agrees to the quote.
- **Action:**
  1. AI fetches business details (can use external API like Tax ID lookup if applicable).
  2. Auto-fills the `Contract_Template.docx`.
  3. Creates a new record in the `Contracts` table.
  4. Changes Lead Status to `Won`.
  5. **Notification:** Sends a "Deal Won" alert to the CEO's Telegram group.
