# SolarFlow scope and verification report

## Scope status

| Module | Implemented behavior | Status |
|---|---|---|
| Authentication | Separate Super Admin and company-user login, inactive user/company blocking, secure session regeneration and seven-day idle session | Complete |
| Company isolation | Company users can only read/write their assigned company; URL/query manipulation cannot expose another company | Complete |
| Companies | Super Admin can create/update dynamic companies with a required logo, unique login email and password; company and primary admin are saved together; exactly one active company is the configurable Daily SS reference | Complete |
| Inverters | Dynamic active inverter list per company; Sunrise starts with 2, Rajeshwari and Nilkanth with 4 | Complete |
| Multipliers | Four separate company-profile multipliers: Plant Import, Plant Export, 66kV Sub Import and 66kV Sub Export | Complete |
| Daily entry | Manual daily inverter generation plus four cumulative meter readings; employees can create entries for every active company but cannot edit/delete | Complete |
| Unit calculation | `(current reading - previous reading) × matching company multiplier` | Complete |
| Decimal precision | Readings, inverter generation, multipliers, units and report totals use two decimal places | Complete |
| Historical edits | Editing an old reading or multiplier recalculates that company's later unit values | Complete |
| Reports | Daily, Monday-to-Sunday weekly, monthly and custom date-range reports; Daily SS is a common reference-company report for every authorized login | Complete |
| Totals | Period totals, company-wise totals, inverter-wise totals and Super Admin-only combined grand totals; combined 66kV Sub Import uses the reference company only | Complete |
| Search/filter | Company and date-range filtering | Complete |
| Dashboard daily snapshot | Shows the previous calendar day's date and values because readings are entered after the day closes; monthly totals remain current-month totals | Complete |
| Excel import | Reads company sheets, inverter values and raw readings; ignores legacy unit formulas and recalculates units | Complete |
| Exports | Excel workbook and landscape PDF report downloads with Daily SS reference/missing-date metadata | Complete |
| Users and permissions | Super Admin roles/permissions plus company-admin management limited to its own company | Complete |
| Audit log | Company, inverter, user, reading and import events | Complete |
| Common employees | One global employee master shared by every company, with employee login, profile, shift, grace period, optional weekly offs and common stock management access | Complete |
| Employee Time In | Manual Time In with compulsory front-camera selfie and precise GPS; blocked when permissions are denied | Complete |
| Employee breaks | Unlimited server-timed Break In/Break Out sessions; a fresh return selfie is compulsory on every Break Out; break hours are shown separately and deducted from work hours | Complete |
| Employee Time Out | Final Time Out uses GPS plus compulsory daily work and learning notes; no final Time Out photo | Complete |
| Holidays and leave | Common full/half-day holidays, generic employee leave requests and approval by any authorized company owner/manager | Complete |
| Attendance correction | Forgotten Time Out correction by Super Admin or company admin only, with reason and immutable before/after audit entry | Complete |
| Attendance reporting | Monthly common summary, employee daily details, working/leave/absence/exception totals, Excel and PDF exports | Complete |
| Common stock inventory | Global stock items with secure images, decimal unit price/quantity, automatic total value, item-wise opening/stock-in history, active status and low-stock alert | Complete |
| Stock borrowing and returns | Opposite-party issue register, selectable employee/admin/manager giver and receiver, available-stock enforcement, unlimited partial returns and complete return history | Complete |
| Stock access control | Separate view, manage, issue and return permissions; Super Admin, Company Admin, Manager and Employee access | Complete |
| Shared expenses | Company-percentage allocation, payer/purchaser details, receipts, pair balances, partial/full settlements, cancellation and reversal audit | Complete |
| Expense export | Date-filtered Excel; Super Admin receives every expense/allocation/balance, while company login receives only its scoped ledger/share/balance | Complete |
| Responsive navigation | Smartphone sidebar has an independently scrollable module area, fixed sign-out access and visible Stock/Expenses links | Complete |
| Refresh navigation | Each user's active authorized module is restored after browser refresh instead of returning to Dashboard | Complete |
| Web security | Optional forced HTTPS redirect, HSTS and camera/location permissions policy | Complete |
| Android WebView | Capacitor project, camera/location permissions, cleartext blocking and debug APK build verification | Complete |
| iOS WebView | Capacitor/Xcode project plus camera/location usage descriptions | Project complete; device build requires full Xcode |
| Desktop | Existing Electron code retained, but desktop installers are outside the current requested scope | Deferred by owner |

## Architecture

### Laravel backend

- Controllers are separated by API module: authentication, companies, inverters, users, dashboard, readings, solar reports, imports, activity, employees, attendance, leave, holidays, attendance reports, stock items and stock borrowing.
- Form Request classes own input validation.
- Services own access rules, activity logging, solar calculations/reporting, attendance rules/reporting, concurrency-safe stock calculations and Excel exports.
- Models own relationships and casting.
- Company onboarding runs in one database transaction and company logos are served through a company-authorized endpoint.
- Company reference switching is transactional: selecting a replacement clears the previous reference, and the current reference cannot be unset or deactivated without a replacement.
- Combined solar report calculations replace only 66kV Sub Import with the reference company's daily values; all other combined metrics remain summed and company-wise/single-company calculations remain unchanged.
- `SuperAdminSeeder`, `SolarCompanySeeder` and `AttendanceSeeder` are registered through `DatabaseSeeder` and are safe to run repeatedly.
- Employee and attendance data is intentionally global/common; all existing solar readings and reports remain company-isolated.

### React frontend

- `App.jsx` only coordinates authentication, company selection and page routing.
- Every module has its own page component.
- Shared shell, fields, metrics, tables, loading and empty-state components are reusable.
- API, formatting, permissions and meter definitions are separated from presentation components.
- The company editor supports logo preview, login credential management and responsive single-column fallback without horizontal overflow.
- The company editor identifies and changes the Daily SS reference company; report screens identify the reference and list missing dates without using another company as fallback.
- The employee experience is mobile-first and includes camera preview, capture/retake, GPS enforcement, day status, unlimited breaks with Break Out return selfies, final Time Out notes, generic leave requests and create-only all-company daily entry.
- The administration experience includes common employee management, live attendance, audited correction, leave approval, holiday management, stock/borrowing management and monthly exports.
- The selected authorized module is remembered per user across browser refreshes; inaccessible saved modules automatically fall back to an allowed module.

### Mobile and HTTPS

- The Capacitor wrapper uses `SOLARFLOW_MOBILE_URL` so the same responsive web application is loaded in Android and iOS.
- Production native sync rejects any non-HTTPS URL. A separate `SOLARFLOW_ALLOW_HTTP=1` escape hatch exists only for local emulator testing.
- Android requests internet, front-camera and precise/coarse-location access and blocks production cleartext traffic.
- iOS includes camera and location usage descriptions.
- Laravel can force HTTPS with `FORCE_HTTPS=true`, trusts only explicitly configured proxies and adds HSTS/security headers.

## Initial seed data

- Super Admin: `admin@solar.local`
- Sunrise Green Energy admin: `sunrise@solar.local`
- Rajeshwari Solar admin: `rajeshwari@solar.local`
- Nilkanth Green Energy admin: `nilkanth@solar.local`
- Default development password: `password`

Seed credentials can be overridden with `SOLARFLOW_ADMIN_EMAIL`, `SOLARFLOW_ADMIN_PASSWORD` and `SOLARFLOW_COMPANY_PASSWORD`.

## Automated verification

The feature suite covers:

- company isolation for companies, dashboard and reports;
- Super Admin-only combined totals;
- inactive-company login blocking;
- cross-company user-management protection;
- role permission enforcement;
- dynamic company/inverter creation;
- required logo and company-admin credential creation, credential login and password preservation on blank edits;
- authenticated logo access and cross-company logo denial;
- all four multiplier calculations;
- two-decimal validation, formatting and Excel-import rounding;
- forward recalculation after historical edits;
- Monday-to-Sunday weekly grouping;
- company and inverter report totals;
- reference-only 66kV Sub Import values across daily, weekly, monthly and grand totals while preserving company-wise and single-company totals;
- atomic Daily SS reference replacement plus rejection of unset/deactivation without a replacement;
- zero contribution and visible missing-date metadata when the reference company's entry is absent;
- common Daily SS access for Super Admin and company login;
- reference metadata and values in combined Excel, PDF and Daily SS Excel exports;
- Excel/PDF export responses;
- legacy Excel import and unit recalculation;
- repeatable complete database seeding;
- regenerated CSRF token after login.
- global employee creation with a company-independent login;
- compulsory selfie/location validation and Time In/Time Out calculation;
- unlimited non-overlapping breaks, compulsory Break Out return selfies and net work-time calculation;
- empty weekly-off selection meaning all seven days are working days;
- employee all-company reading creation plus server-side edit/delete denial;
- generic leave requests without annual/sick/unpaid leave-type choices;
- full-day holiday blocking and half-day status;
- cross-company manager leave approval;
- owner/admin-only missing Time Out correction and adjustment audit;
- monthly attendance summary plus Excel/PDF exports.
- common cross-company stock visibility and role permission enforcement;
- required secure item images, opening stock and stock-in movement history;
- available-quantity enforcement when issuing stock;
- partial and full stock returns with giver/receiver and return-history tracking;
- employee stock item creation, quantity management, issuing and return receiving;
- shared-expense allocation, balance netting, settlement, edit/cancel/reversal and receipt authorization;
- Super Admin all-company expense export and company-scoped expense export with verified workbook contents;
- seven-day session lifetime configuration;
- forced HTTPS redirects and mobile security headers;
- Android/iOS camera and location permission declarations plus secure mobile URL enforcement.

Current result: **49 tests passed, 431 assertions passed**.

Run verification with:

```bash
php artisan test
npm run build
npm audit
```

## Deployment inputs still required

Application development is complete for the requested web and attendance scope. The following are real business/deployment inputs and are not safely inventable in code:

- the actual employee list, temporary passwords, shifts, grace periods and weekly offs;
- the actual holiday names, dates and full/half-day status;
- the actual stock item names, images, opening quantities, unit prices and low-stock thresholds;
- the production domain, server access and SSL certificate/provider.

Employee and holiday business data is not invented by the seeders. After the owner supplies those values, they can be entered from the existing administration screens. The mobile projects are ready to point at the final HTTPS URL. The Android debug build is verified locally. The iOS project and permissions are validated, but an iOS simulator/device archive cannot be produced on this Mac until full Xcode is installed.
