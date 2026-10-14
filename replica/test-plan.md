# Test Plan: SolarFlow

**Build:** `4767d971` | **Date:** 2026-10-14 | **Env:** local, seed data & production live sync

| Case ID | Flow Name | Type | Steps | Expected | Automated | Result |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **F01-H1** | Super Admin Login | Happy Path | Open `/`, fill email `managesolar@gmail.com`, password `Admin@123`, submit | Redirects to dashboard, renders `.shell` (desktop) and `.mobile-app-container` (mobile) | E2E | **PASS** |
| **F01-E1** | Inactive User Login | Edge Case | Attempt login with deactivated user credentials | Login blocked, friendly error message shown, session not established | Feature (PHPUnit) | **PASS** |
| **F01-N1** | Bad Password | Negative | Enter wrong password on login screen | Blocked with 401/422 validation, no crash, form remains responsive | Feature (PHPUnit) | **PASS** |
| **F02-H1** | Dashboard Live Telemetry | Happy Path | Navigate to `dashboard`, check live kW, kWh, inverters, weather telemetry | Telemetry cards load cleanly, auto-polls every 10s without memory leaks | E2E | **PASS** |
| **F02-E1** | Tab Visibility Change | Edge Case | Switch browser tabs away and back | Polling throttles when tab hidden, immediately fetches fresh data on focus | E2E / Unit | **PASS** |
| **F03-H1** | Daily Entry Reading Save | Happy Path | Open `entry`, verify meter reading inputs and submit | Submits payload, validates values, no console or unhandled exceptions | E2E | **PASS** |
| **F03-E1** | Units Calculation & Multiplier | Edge Case | Change meter reading with company multiplier | Units and differences recalculated instantly with 2 decimal precision | Feature (PHPUnit) | **PASS** |
| **F04-H1** | Attendance Register View | Happy Path | Navigate to `attendance`, view cards, calendar and marked employees | Renders `.attendance-admin` and `.attendance-cards`, status counts match | E2E | **PASS** |
| **F04-E1** | Selfie & Geo-location Clock-in | Edge Case | Employee punch clock-in with camera photo and GPS coordinates | Relative media URL created, location stored, breaks calculated accurately | Feature (PHPUnit) | **PASS** |
| **F05-H1** | Reports Filtering | Happy Path | Open `reports`, switch filter to Monthly, click Apply | Period filters switch cleanly, `.reports-page` updates without errors | E2E | **PASS** |
| **F05-E1** | Excel & PDF Export | Edge Case | Click Excel/PDF export buttons across date ranges | Dynamically resolves base URL, generates workbook/PDF without 404 | Feature (PHPUnit) | **PASS** |
| **F06-H1** | Payroll & Salaries Calculation | Happy Path | Navigate to `salaries`, view toolbar and salary register | Salary slip calculations render, allowances and leave deductions computed | E2E | **PASS** |
| **F06-N1** | Unauthorized Salary View | Negative | Non-admin / non-owner user attempts viewing other employees' salaries | Blocked with 403 Forbidden, salary privacy strictly enforced | Feature (PHPUnit) | **PASS** |
| **F07-H1** | Shared Expenses Ledger | Happy Path | Navigate to `expenses`, view 3-company expense cards and split ledger | Renders `.expenses-page`, summary cards show exact inter-company splits | E2E | **PASS** |
| **F07-E1** | Inter-company Settlement | Edge Case | Record partial settlement between companies | Offsetting balances update atomically, audit history preserved | Feature (PHPUnit) | **PASS** |
| **F08-H1** | Stock & Materials Management | Happy Path | View common stock items, issue and return parts | Stock movements update atomically, photo attachments handled securely | Feature (PHPUnit) | **PASS** |
| **F09-H1** | Plant Loss / Curtailment Tracking | Happy Path | Super Admin views 66KV tripping and plant loss analytics | Loss units and financial loss calculated with company isolation | Feature (PHPUnit) | **PASS** |
| **F10-H1** | AI Help Center & Auto-Coder | Happy Path | Super Admin uploads screenshot, selects diagnose or auto-code | Gemini 3.1 Flash Lite analyzes vision payload in ~2s in Gujarati | Feature & Live | **PASS** |
| **F10-E1** | Webhook Auto-Deploy | Edge Case | Trigger `/api/ai-help-center/webhook-deploy` with signature secret | Automatically pulls Git commit, clears caches, and updates cPanel | Live cPanel | **PASS** |
| **F11-H1** | Session Termination / Logout | Happy Path | Click signout (desktop) or mobile drawer logout | Session terminated, cookies cleared, redirected to login page | E2E | **PASS** |
