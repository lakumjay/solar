# solar-meter-flow
jay lakum project for the solar meter reading and flow and also calculation all the things company wise report generation etc.
# SolarFlow

SolarFlow is a company-wise solar generation, cumulative meter-reading and common employee-attendance system. The application uses React and Laravel and includes Android/iOS Capacitor WebView projects for mobile deployment.

## Included modules

- Super-admin and company-specific login with strict company data isolation
- Role and permission management for company admins, data-entry users and viewers
- Dynamic company onboarding with required logo, login email and password
- One configurable active Daily SS reference company; Sunrise Green Energy is selected by default
- Dynamic active inverter lists per company
- Daily inverter generation entry
- Four cumulative meter readings per company
- Separate company multipliers for Plant Import, Plant Export, 66kV Sub Import and 66kV Sub Export
- Automatic unit calculation: `(current reading - previous reading) × company multiplier`
- Consistent two-decimal entry, storage and display for readings, generation, multipliers and calculated totals
- Automatic forward recalculation after an older reading or multiplier is edited
- Daily, Monday-to-Sunday weekly and monthly reports
- Company reports and super-admin combined totals
- Combined 66kV Sub Import totals use only the Daily SS reference company, with zero-and-warning behavior for missing reference dates
- Common Daily SS Excel report for every authorized company login
- Date-range filtering, Excel export and PDF export
- Legacy Excel workbook import with formula-unit recalculation
- Activity audit log
- Common employee login, shift, optional weekly offs, holiday, generic leave and attendance management
- Mobile Time In with compulsory selfie/GPS, unlimited Break In/Break Out sessions, compulsory Break Out return selfie, and final Time Out with GPS and daily notes
- Employee create-only daily reading entry across every active company; existing readings cannot be edited or deleted by employees
- Monthly attendance reports with Excel and PDF export
- Common stock inventory with item images, decimal quantity, unit price, total valuation and low-stock status; employees can also manage, issue and receive stock
- Stock borrowing register with opposite-party details, giver/receiver tracking, partial returns and full return history
- Shared-expense ledger with company percentages, net balances, settlements and role-scoped Excel export
- Seven-day login session and refresh-safe active-module navigation
- Android and iOS WebView projects with native camera/location permissions

## Initial data

Running the seeder creates:

- Sunrise Green Energy with 2 inverters
- Rajeshwari Solar with 4 inverters
- Nilkanth Green Energy with 4 inverters

Initial accounts all use the password `password`:

- `admin@solar.local`
- `sunrise@solar.local`
- `rajeshwari@solar.local`
- `nilkanth@solar.local`

Change these passwords before a production deployment.

## Local web setup

```bash
composer install
npm install
php artisan migrate --seed
npm run build
php artisan serve
```

The project supports SQLite and MySQL through the normal Laravel `.env` database settings.

For frontend development, run `npm run dev` in a second terminal.

## Verification

```bash
php artisan test
npm run build
npm audit
```

See [docs/SCOPE_AND_TEST_REPORT.md](docs/SCOPE_AND_TEST_REPORT.md) for the module-by-module completion and test report.

## Mobile WebView

```bash
SOLARFLOW_MOBILE_URL=https://your-domain.example npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

The production URL must use HTTPS. Plain HTTP is accepted only for local emulator testing when `SOLARFLOW_ALLOW_HTTP=1` is explicitly set. Android production builds reject cleartext traffic, and both native projects declare camera and precise-location permissions.

Copy `.env.production.example` to the production server's `.env`, replace all example values, set `FORCE_HTTPS=true`, and use the same single canonical HTTPS URL for `APP_URL` and `SOLARFLOW_MOBILE_URL`. The application redirects alternate hosts to that URL so the mobile browser keeps one login cookie. The SSL certificate must cover the canonical domain and any alternate domain a user might open. After changing production environment values, run `php artisan optimize:clear` followed by `php artisan config:cache` so the session lifetime and secure-cookie settings take effect.

## Deployment data still supplied by the owner

No employee, holiday or stock business records are added by the seeders. Enter real employees through **Common employees**, real holidays through **Leave & holidays**, and opening inventory through **Stock Management**. Employee setup requires name, unique code, login email/password, shift, full-day/half-day minutes and grace minutes. Weekly offs are optional; leaving every day unselected means the employee can work all seven days. Holiday setup requires name, date and full/first-half/second-half type.

Desktop packaging scripts remain in the repository but are not part of the current deployment scope.
