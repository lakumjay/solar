# SolarFlow

SolarFlow is a company-wise solar generation and cumulative meter-reading system. The web application uses React and Laravel; an Electron shell packages the same application for desktop use.

## Included modules

- Super-admin and company-specific login with strict company data isolation
- Role and permission management for company admins, data-entry users and viewers
- Dynamic company onboarding with required logo, login email and password
- Dynamic active inverter lists per company
- Daily inverter generation entry
- Four cumulative meter readings per company
- Separate company multipliers for Plant Import, Plant Export, 66kV Sub Import and 66kV Sub Export
- Automatic unit calculation: `(current reading - previous reading) × company multiplier`
- Consistent two-decimal entry, storage and display for readings, generation, multipliers and calculated totals
- Automatic forward recalculation after an older reading or multiplier is edited
- Daily, Monday-to-Sunday weekly and monthly reports
- Company reports and super-admin combined totals
- Date-range filtering, Excel export and PDF export
- Legacy Excel workbook import with formula-unit recalculation
- Activity audit log
- Electron desktop runtime and packaging configuration

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
```

See [docs/SCOPE_AND_TEST_REPORT.md](docs/SCOPE_AND_TEST_REPORT.md) for the module-by-module completion and test report.

## Desktop

```bash
npm run desktop:start
npm run desktop:pack
npm run desktop:build
```

`desktop:pack` creates an unpacked application for local testing. `desktop:build` creates platform installers. A distributable Windows, macOS or Linux release must bundle a matching PHP runtime and should be code-signed on each target platform. See [electron/README.md](electron/README.md).
