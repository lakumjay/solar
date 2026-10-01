# SolarFlow scope and verification report

## Scope status

| Module | Implemented behavior | Status |
|---|---|---|
| Authentication | Separate Super Admin and company-user login, inactive user/company blocking, secure session regeneration | Complete |
| Company isolation | Company users can only read/write their assigned company; URL/query manipulation cannot expose another company | Complete |
| Companies | Super Admin can create/update dynamic companies with a required logo, unique login email and password; company and primary admin are saved together | Complete |
| Inverters | Dynamic active inverter list per company; Sunrise starts with 2, Rajeshwari and Nilkanth with 4 | Complete |
| Multipliers | Four separate company-profile multipliers: Plant Import, Plant Export, 66kV Sub Import and 66kV Sub Export | Complete |
| Daily entry | Manual daily inverter generation plus four cumulative meter readings | Complete |
| Unit calculation | `(current reading - previous reading) × matching company multiplier` | Complete |
| Decimal precision | Readings, inverter generation, multipliers, units and report totals use two decimal places | Complete |
| Historical edits | Editing an old reading or multiplier recalculates that company's later unit values | Complete |
| Reports | Daily, Monday-to-Sunday weekly, monthly and custom date-range reports | Complete |
| Totals | Period totals, company-wise totals, inverter-wise totals and Super Admin-only combined grand totals | Complete |
| Search/filter | Company and date-range filtering | Complete |
| Excel import | Reads company sheets, inverter values and raw readings; ignores legacy unit formulas and recalculates units | Complete |
| Exports | Excel workbook and landscape PDF report downloads | Complete |
| Users and permissions | Super Admin roles/permissions plus company-admin management limited to its own company | Complete |
| Audit log | Company, inverter, user, reading and import events | Complete |
| Desktop | Electron wrapper, per-user SQLite/storage, migration startup and macOS package smoke test | Development-ready |

## Architecture

### Laravel backend

- Controllers are separated by API module: authentication, companies, inverters, users, dashboard, readings, reports, imports and activity.
- Form Request classes own input validation.
- Services own access rules, activity logging, calculations, reporting, Excel import and Excel export.
- Models own relationships and casting.
- Company onboarding runs in one database transaction and company logos are served through a company-authorized endpoint.
- `SuperAdminSeeder` and `SolarCompanySeeder` are registered through `DatabaseSeeder` and are safe to run repeatedly.

### React frontend

- `App.jsx` only coordinates authentication, company selection and page routing.
- Every module has its own page component.
- Shared shell, fields, metrics, tables, loading and empty-state components are reusable.
- API, formatting, permissions and meter definitions are separated from presentation components.
- The company editor supports logo preview, login credential management and responsive single-column fallback without horizontal overflow.

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
- Excel/PDF export responses;
- legacy Excel import and unit recalculation;
- repeatable complete database seeding;
- regenerated CSRF token after login.

Run verification with:

```bash
php artisan test
npm run build
```

## Deployment-only work

The web application scope is complete. Public desktop releases still require a bundled PHP runtime for each target operating system, an application icon, and platform code-signing/notarization certificates. These are packaging/distribution tasks rather than missing business modules.
