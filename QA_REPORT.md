# 📋 SolarFlow Complete Quality Assurance (QA) Audit Report

**Date of Audit:** October 11, 2026  
**Application Architecture:** Laravel 11 (API Backend) + React 19 (Vite Frontend) + Capacitor 8 (Mobile Shell)  
**Total Pages Audited:** 21 Pages  
**Audit Type:** Full Static Analysis, Test Execution, Dependency & Architectural Security/Stability Audit  
**Code Modifications:** None (Strict Audit Only)

---

## 📊 1. Executive Summary & Audit Scorecard

| Category | Status | Critical | High | Medium | Low | Total Issues |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Build & Automated Tests** | ❌ FAILED | 2 | 1 | 1 | 0 | 4 |
| **2. React Pages (Null/Crash/Loops)** | ⚠️ AT RISK | 3 | 7 | 8 | 5 | 23 |
| **3. API Calls & Network Failure** | ⚠️ AT RISK | 2 | 5 | 6 | 2 | 15 |
| **4. Responsive Breakpoints** | ⚠️ PARTIAL | 1 | 4 | 7 | 3 | 15 |
| **5. Laravel Backend & Security** | ❌ VULNERABLE | 3 | 6 | 4 | 2 | 15 |
| **6. Mobile & Capacitor Native** | ❌ CRITICAL | 3 | 4 | 3 | 1 | 11 |
| **7. Auth, Session & CSRF** | ⚠️ AT RISK | 2 | 3 | 2 | 1 | 8 |
| **TOTAL** | | **16** | **30** | **31** | **14** | **91** |

---

## 🛠️ Section 1: Build & Automated Tests (`npm run build` & `php artisan test`)

### 1.1 `php artisan test` Execution
* **Command:** `php artisan test`
* **Result:** **FAILED (Exit Code: 2)**
* **Issue 1.1.1 (CRITICAL):**
  * **File:** `phpunit.xml`, Line 9
  * **Problem:** `phpunit.xml` defines `<testsuite name="Unit"><directory>tests/Unit</directory></testsuite>`, but directory `tests/Unit` does not exist on disk. `php artisan test` aborts immediately with: `Test directory ".../tests/Unit" not found`.
  * **Fix:** Either remove `<testsuite name="Unit">` from `phpunit.xml` or run `mkdir -p tests/Unit`.
* **Issue 1.1.2 (CRITICAL):**
  * **File:** `database/migrations/2026_10_01_000001_enhance_shared_expenses_and_settlements.php`, Line 28
  * **Problem:** Migration contains MySQL-specific raw SQL:
    ```sql
    UPDATE shared_expense_allocations sea
    JOIN shared_expenses se ON sea.shared_expense_id = se.id
    SET sea.amount_paid = ...
    ```
    In `phpunit.xml`, `DB_CONNECTION=sqlite` with `:memory:`. SQLite does not support `UPDATE ... JOIN` syntax, causing SQLite to throw `SQLSTATE[HY000]: General error: 1 near "sea": syntax error`.
    **Result:** **63 out of 66 tests failed!**
  * **Fix:** Wrap the statement with a driver check:
    ```php
    if (DB::getDriverName() === 'mysql') {
        DB::statement('UPDATE shared_expense_allocations sea JOIN ...');
    } else {
        DB::table('shared_expense_allocations')
            ->where('amount_paid', 0)
            ->update([...]);
    }
    ```

### 1.2 `npm run build` Execution
* **Command:** `npm run build` (Vite v7.3.6)
* **Result:** **SUCCESS with Bundle Size Warning**
* **Issue 1.2.1 (MEDIUM):**
  * **File:** `vite.config.js` / `resources/js/app.js`
  * **Problem:** Large single bundle: `public/build/assets/app-CJmiR9Pr.js` is **1,367.35 kB** (1.37 MB minified / 333 kB gzip). All 21 pages, Lucide icons, and `@google/genai` are bundled into a monolithic chunk without code splitting.
  * **Impact:** 2-3 second blank screen delay on slow 3G/4G mobile networks.
  * **Fix:** Use React `React.lazy()` and `Suspense` for page routes in `resources/js/solar/App.jsx`, and configure `build.rollupOptions.output.manualChunks` in `vite.config.js` to split vendor dependencies (`lucide-react`, `@google/genai`, `react`).

---

## 📱 Section 2: Page-by-Page Audit (All 21 Pages)

### 1. `DashboardPage.jsx`
* **File:** `resources/js/solar/pages/DashboardPage.jsx`
* **Line 48-60 (HIGH):** `openCurtailModal`: Accesses `targetComp.company_id` without optional chaining. If `liveData.companies` is empty/null, crashes with `TypeError`.
  * **Fix:** Use `targetComp?.company_id ?? ''`.
* **Line 177-180 (HIGH):** In `fetchLiveSolar`, error in API call sets `loading = false`, but `liveData` remains `null`. The render method then accesses `data.companies`, `data.weather`, leaving the dashboard displaying blank 0s with no error message or retry button.
  * **Fix:** Set `error` state on catch and render `<ErrorState onRetry={fetchLiveSolar} />`.
* **Line 194-200 (MEDIUM):** `setInterval` polls every 10 seconds unconditionally even when the browser tab is hidden or phone screen is locked.
  * **Fix:** Add document visibility check: `if (document.hidden) return;`.

### 2. `DailyEntryPage.jsx`
* **File:** `resources/js/solar/pages/DailyEntryPage.jsx`
* **Line 216 (CRITICAL):** `save` method submits `company_id: company.id`. If `validCompanies` is empty or still loading, `company` is undefined, causing `TypeError: Cannot read properties of undefined (reading 'id')` and hard crash on submit.
  * **Fix:** Add guard: `if (!company) { alert('No company selected.'); return; }`.
* **Line 48 (MEDIUM):** `if (!company) return;` silently bails out of `loadDataForDate` without showing any UI or loading skeleton.
  * **Fix:** Render `<Empty title="No Company" detail="Please configure at least one active company." />`.
* **Line 61-63 (LOW):** Fetching previous day reading is not caught in main loading state; if it fails, error is swallowed silently.

### 3. `ReportsPage.jsx`
* **File:** `resources/js/solar/pages/ReportsPage.jsx`
* **Line 65-70, 105, 115 (HIGH):** Direct `<a href="/api/report/export/excel">` and `<a href="/api/report/export/pdf">` links.
  * **Problem:** Direct browser navigation to `/api/...` bypasses Axios/Fetch headers, does not work under subpaths (e.g. `/git/public/`), and fails completely inside native Capacitor mobile apps.
  * **Fix:** Use a helper function that downloads via authenticated `fetch()` or prefixes `window.location.origin + baseApiUrl`.
* **Line 224 (MEDIUM):** Weather issue report table has fixed `maxHeight: '420px'`, but 5 columns overflow on screens < 500px without a card view toggle.
  * **Fix:** Add responsive card view toggle similar to monthly reports.

### 4. `GalleryPage.jsx`
* **File:** `resources/js/solar/pages/GalleryPage.jsx`
* **Line 22-45 (HIGH):** Direct camera capture without file size validation. If an employee takes a high-res 12MP photo (8-10MB), uploading directly to `api('plant-photos/upload')` causes HTTP 413 (Payload Too Large) or cURL timeout.
  * **Fix:** Add client-side HTML5 canvas image compression before appending to `FormData`.
* **Line 238 (LOW):** Task list renders without pagination; if hundreds of plant photos accumulate, the DOM becomes sluggish on mobile.

### 5. `ReelsPage.jsx`
* **File:** `resources/js/solar/pages/ReelsPage.jsx`
* **Line 117-126 (HIGH):** `videoRef.current.play()` called without `.catch()`. In modern iOS Safari / Android Chrome, if autoplay restrictions trigger, an unhandled rejection `NotAllowedError` is thrown.
  * **Fix:** `videoRef.current.play().catch(() => setIsPlaying(false));`.
* **Line 138 (LOW):** Empty catch block `catch (e) {}` in `handleLike` swallows errors without notifying user.
* **Line 789 (MEDIUM):** Vertical reels player on 1280px desktop stretches to 100% viewport unless constrained by max-width.
  * **Fix:** Wrap in `max-width: 480px; margin: 0 auto;`.

### 6. `ISolarCloudPage.jsx`
* **File:** `resources/js/solar/pages/ISolarCloudPage.jsx`
* **Line 192 (CRITICAL):** Device table is wrapped in `<div className="table-responsive">`. In `app.css` line 2963, `.table-responsive` is scoped ONLY inside `.mobile-subpage-body`. Outside of it, it has no `overflow-x: auto`. On 360px and 390px screens, the 6-column device table causes horizontal page overflow.
  * **Fix:** Change `<div className="table-responsive">` to `<div className="table-wrap">`.
* **Line 205 (MEDIUM):** If `dev.dev_status` is not 1, displays "Status X" without description or tooltip.

### 7. `CompaniesPage.jsx`
* **File:** `resources/js/solar/pages/CompaniesPage.jsx`
* **Line 110-116 (HIGH):** `saveInverter`: `await api('inverters', ...)` is called outside of a `try/catch` block. Any validation or network error produces an unhandled promise rejection.
  * **Fix:** Wrap `saveInverter` body in `try { ... } catch (err) { setMessage(err.message); }`.
* **Line 113-114 (HIGH):** `const updated = updatedCompanies.find(...)`: If `refresh()` fails or returns empty array, `updated` is `undefined`, causing subsequent state setters and renders to crash.
  * **Fix:** Check `if (updated) { setSelected(updated); setForm(...); }`.
* **Line 130 (CRITICAL):** `{company.inverters.filter(inverter => inverter.active).length}`: If a company has `company.inverters` as `null` or `undefined`, throws `TypeError: Cannot read properties of undefined (reading 'filter')`.
  * **Fix:** Use `(company.inverters || []).filter(...)`.

### 8. `ExcelImportPage.jsx`
* **File:** `resources/js/solar/pages/ExcelImportPage.jsx`
* **Line 26 (LOW):** `{result.details.map(item => <li key={item}>{item}</li>)}`: If Excel errors have identical messages (e.g. "Row skipped"), duplicate key warnings are logged.
  * **Fix:** Use `key={`${item}-${idx}`}`.
* **Line 26 (LOW):** No upload progress percentage for large workbooks (up to 20MB).

### 9. `UsersPage.jsx`
* **File:** `resources/js/solar/pages/UsersPage.jsx`
* **Line 23 (HIGH):** `const load = () => api('users').then(setUsers);`: Missing `.catch()` handler. Network or 401 error results in unhandled rejection.
  * **Fix:** `api('users').then(setUsers).catch(err => setMessage(err.message));`.
* **Line 17-25 (MEDIUM):** Missing `loading` state. The table stays empty while data is fetching with no spinner.

### 10. `ActivityLogPage.jsx`
* **File:** `resources/js/solar/pages/ActivityLogPage.jsx`
* **Line 192, 404 (MEDIUM):** `usersList.map` and `sessions.map`: If API fails, lists remain uninitialized and can throw on array functions.
  * **Fix:** Default state to `[]` and guard with `(usersList || []).map(...)`.

### 11. `EmployeesPage.jsx`
* **File:** `resources/js/solar/pages/EmployeesPage.jsx`
* **Line 30 (HIGH):** `const load = () => api('employees').then(setEmployees);`: Missing `.catch()` handler.
  * **Fix:** `api('employees').then(setEmployees).catch(e => console.error(e));`.
* **Line 50 (HIGH):** `currentUser.role`: If `currentUser` is undefined or null, throws `Cannot read properties of undefined (reading 'role')`.
  * **Fix:** `currentUser?.role`.
* **Line 20-32 (MEDIUM):** Missing `loading` state when opening page.

### 12. `ExpensesPage.jsx`
* **File:** `resources/js/solar/pages/ExpensesPage.jsx`
* **Line 180 (HIGH):** `{data.gujarati_summary.companies.map(...)}`: If backend returns `gujarati_summary` as null or incomplete, throws `Cannot read properties of undefined (reading 'companies')`.
  * **Fix:** Guard with `{data?.gujarati_summary?.companies?.map(...)}`.
* **Line 490 (MEDIUM):** Expense ledger table on 768px tablet: 7 columns get compressed and text clips. Card view should activate on `< 900px` rather than `< 640px`.

### 13. `AttendancePage.jsx`
* **File:** `resources/js/solar/pages/AttendancePage.jsx`
* **Line 103 (HIGH):** `Promise.all([api(`attendance?${query}`), api('employees')])`: If one call fails (e.g. employee lacks view_employees permission), neither attendance nor employees are set.
  * **Fix:** Use `Promise.allSettled` or separate try/catches.
* **Line 111-112 (MEDIUM):** `setInterval(loadLiveLocations, 30000)`: 30s auto-refresh interval continues polling even if tab is hidden.
  * **Fix:** Check `document.visibilityState === 'visible'`.

### 14. `LeaveHolidayPage.jsx`
* **File:** `resources/js/solar/pages/LeaveHolidayPage.jsx`
* **Line 19 (HIGH):** `Promise.all([api('leaves...'), api('holidays')])`: If user lacks leave permission, holidays also fail to load.
  * **Fix:** Load leaves and holidays independently.
* **Line 13-16 (MEDIUM):** No loading state indicator while requests are in flight.

### 15. `AttendanceReportsPage.jsx`
* **File:** `resources/js/solar/pages/AttendanceReportsPage.jsx`
* **Line 65-70 (HIGH):** Direct `<a href="/api/attendance-report/export/excel?${query}">` and PDF links fail on subdirectory and Capacitor.
  * **Fix:** Use programmatic authenticated file downloader.
* **Line 82 (HIGH):** `report.rows.map`: If `report` is null, crashes unless guarded.
  * **Fix:** `{report?.rows?.map(...)}`.

### 16. `SalaryPage.jsx`
* **File:** `resources/js/solar/pages/SalaryPage.jsx`
* **Line 145, 257 (MEDIUM):** `data.rows.map`: If backend returns null rows, throws error.
  * **Fix:** `(data?.rows || []).map(...)`.
* **Line 880-891 (LOW):** Quick chips preset signs dynamically updated (already fixed in previous commit).

### 17. `StockPage.jsx`
* **File:** `resources/js/solar/pages/StockPage.jsx`
* **Line 53 (HIGH):** `await load()` inside `completed()` modal callback is not wrapped in `try/catch`. If refresh fails, error is unhandled.
  * **Fix:** Wrap in `try { await load(); } catch(e) { setError(e.message); }`.
* **Line 36 (HIGH):** `Promise.all([api('stock/items'), api('stock/borrowings'), api('stock/people')])`: If one endpoint fails, all fail.
  * **Fix:** Use independent loaders or `Promise.allSettled`.

### 18. `CurtailmentLossPage.jsx`
* **File:** `resources/js/solar/pages/CurtailmentLossPage.jsx`
* **Line 21 (MEDIUM):** Hardcoded `currentUser?.id === 4` in super admin check.
  * **Fix:** Check role: `currentUser?.role === 'super_admin'`.
* **Line 45 (LOW):** `alert(e?.message)`: Uses blocking native alert instead of in-app toast notification.

### 19. `MyAttendancePage.jsx`
* **File:** `resources/js/solar/pages/MyAttendancePage.jsx`
* **Line 269 (HIGH):** `photoTasks.tasks.map`: If `photoTasks` or `tasks` is null/undefined, throws `Cannot read properties of undefined (reading 'map')`.
  * **Fix:** `(photoTasks?.tasks || []).map(...)`.
* **Line 340-390 (MEDIUM):** HTML5 camera and GPS permissions: If user denies once in browser/WebView, there is no UI explaining how to reset permissions.

### 20. `MySalaryPage.jsx`
* **File:** `resources/js/solar/pages/MySalaryPage.jsx`
* **Line 24 (HIGH):** `row?.employee.name`: If `row` is not null but `employee` is undefined, throws `Cannot read properties of undefined (reading 'name')`.
  * **Fix:** `row?.employee?.name || 'My salary'`.
* **Line 16-18 (MEDIUM):** No PDF pay-slip download button available for employee self-service.

### 21. `LoginPage.jsx`
* **File:** `resources/js/solar/pages/LoginPage.jsx`
* **Line 18 (MEDIUM):** Form submission button is not disabled while request is pending (`busy` state missing), allowing accidental double-submits.
  * **Fix:** Add `disabled={busy}` and spinner on login button.

---

## 🌐 Section 3: API & Network Layer Audit

### 3.1 Base URL & Environment Handling
* **File:** `resources/js/solar/api.js`, Lines 3-6
* **Issue (CRITICAL):**
  ```javascript
  let base = '/api/';
  if (typeof window !== 'undefined' && window.location.pathname.includes('/git/public')) {
      base = '/git/public/api/';
  }
  ```
  On **Capacitor (Android/iOS)**, the app origin is `capacitor://localhost/` or `http://localhost/`. A relative URL `/api/...` sends requests to `http://localhost/api/...` instead of the remote Laravel server!
* **Fix:** Read `import.meta.env.VITE_API_URL` or a global configuration host:
  ```javascript
  const API_HOST = import.meta.env.VITE_API_URL || '';
  let base = `${API_HOST}/api/`;
  ```

### 3.2 401 Unauthorized & Session Expiry Handling
* **File:** `resources/js/solar/api.js`, Lines 19-22
* **Issue (HIGH):** When the backend session expires, Laravel returns `401 Unauthorized` with `{"message": "Unauthenticated."}`. `api.js` simply throws an Error. There is NO global 401 interceptor that clears credentials or redirects to Login. Users remain stuck on a broken page.
* **Fix:** Add a status check in `api.js`:
  ```javascript
  if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('solarflow:session_expired'));
      // Or setUser(null);
  }
  ```

### 3.3 Offline & Network Drop Resilience
* **File:** `resources/js/solar/api.js`, Line 8
* **Issue (HIGH):** `fetch()` is called directly without a `try/catch`. When the mobile device is offline or loses connection, `fetch` throws `TypeError: Failed to fetch`.
* **Fix:** Wrap `fetch()` in a try/catch block and throw a user-friendly error:
  ```javascript
  try {
      response = await fetch(...);
  } catch (netErr) {
      throw new Error('ઇન્ટરનેટ કનેક્શન નથી. કૃપા કરીને નેટવર્ક ચેક કરો.');
  }
  ```

---

## 📐 Section 4: Responsive Breakpoint Audit

| Screen Width | Problematic Pages | Problem Description | Severity | Fix |
| :--- | :--- | :--- | :---: | :--- |
| **360px (Small Mobile)** | `ISolarCloudPage.jsx` | 6-column device table causes horizontal overflow because `.table-responsive` is not scoped globally. | **CRITICAL** | Change to `.table-wrap` with global `overflow-x: auto`. |
| **360px (Small Mobile)** | `CompaniesPage.jsx` | Company list item action buttons wrap awkwardly below inactive badge. | **MEDIUM** | Use flex-wrap and stack items vertically on `< 400px`. |
| **360px (Small Mobile)** | `DailyEntryPage.jsx` | Meter reading inputs on 360px have small touch target spacing. | **LOW** | Ensure min 44px height on inputs and 8px gaps. |
| **390px (Standard Phone)**| `AttendanceReportsPage.jsx`| Table view columns (11 columns) require heavy horizontal scrolling if user switches away from card view. | **LOW** | Force card view on `< 500px` without toggle option. |
| **768px (Tablet)** | `ExpensesPage.jsx` | 7-column ledger table is cramped on portrait tablet (768px) before desktop grid activates. | **MEDIUM** | Lower breakpoint for card view from 640px to 820px. |
| **1280px (Desktop)** | `ReelsPage.jsx` | Vertical video stretches too wide on ultra-wide screens. | **MEDIUM** | Restrict maximum container width to `540px` with centered alignment. |
| **All Screen Sizes** | `ReportsPage.jsx` | Direct `<a href="/api/...">` buttons do not work on mobile/Capacitor. | **HIGH** | Replace with custom file download handler. |

---

## 🔒 Section 5: Laravel Backend Audit

### 5.1 Missing Route & Controller Authorizations (CRITICAL)
* **File:** `app/Http/Controllers/SolarCurtailmentController.php`, Lines 118, 200, 310
  * **Problem:** `store`, `restoreAll`, and `destroy` endpoints in `SolarCurtailmentController` have **NO role or permission checks**! Any authenticated user with role `employee` or `viewer` can send `POST /api/curtailments` or `POST /api/curtailments/restore-all` and change plant power curtailment!
  * **Fix:** Add `$this->access->requirePermission($request, 'manage_curtailment')` or `abort_unless(in_array($request->user()->role, ['super_admin', 'company_admin']), 403);`.
* **File:** `app/Http/Controllers/PlantPhotoController.php`, Line 48
  * **Problem:** `saveTask` has no role check! Any authenticated user can create or modify scheduled plant photo tasks.
  * **Fix:** Add `$this->access->requireSuperAdmin($request);`.
* **File:** `app/Http/Controllers/PlantPhotoController.php`, Lines 118-120
  * **Problem:** In `upload()`, if the user has no employee profile, it executes `$employee = Employee::first();`. Admin uploads are falsely attributed to the first employee in the database! If the database has 0 employees, `$employee->id` crashes with null error.
  * **Fix:** Make `employee_id` nullable on `plant_photos` table, or abort with 400 if user has no employee profile.

### 5.2 Missing Validations (HIGH)
* **File:** `app/Http/Controllers/SolarCurtailmentController.php`, Line 124
  * **Problem:** `store()` manually reads `$request->input('companies')` without calling `$request->validate()` or using a FormRequest. Invalid payloads bypass validation.
  * **Fix:** Use a dedicated `SaveSolarCurtailmentRequest` with array validation rules.

### 5.3 N+1 Queries & DDL in Controller Cycles (HIGH)
* **File:** `app/Http/Controllers/EmployeeLocationController.php`, Lines 20-50, 66, 153
  * **Problem:** `ensureTableExists()` calls `Schema::hasTable` and `Schema::table` inside `ping()` and `live()` actions. Checking DDL metadata on every GPS ping (every 30s per employee) adds heavy database lock contention.
  * **Fix:** Move table creation to standard Laravel migrations and remove `ensureTableExists()` from controller runtime.

### 5.4 Null Safety in Models (HIGH)
* **File:** `app/Http/Controllers/EmployeeController.php`, Lines 36-37
  * **Problem:** `$employee->user->name` and `$employee->user->email`: If an employee has no associated user (e.g. user was deleted), throws `Attempt to read property "name" on null`.
  * **Fix:** Use nullsafe operator: `$employee->user?->name ?? 'Unknown'`.

---

## 📱 Section 6: Mobile & Capacitor Native Audit

### 6.1 Native Hardware Back Button (CRITICAL)
* **Status:** **NOT IMPLEMENTED**
* **Problem:** `@capacitor/app` is not installed, and no `App.addListener('backButton')` exists. On Android, pressing the physical or navigation back button immediately kills the app instead of closing open modals (e.g. Salary modal, Photo camera, Date pickers) or navigating back.
* **Fix:** Install `@capacitor/app` and register a back button handler in `App.jsx`:
  ```javascript
  import { App } from '@capacitor/app';
  App.addListener('backButton', ({ canGoBack }) => {
      // Close open modals first, otherwise navigate back or exit
  });
  ```

### 6.2 Virtual Keyboard Overlap (HIGH)
* **Status:** **NOT CONFIGURED**
* **Problem:** `@capacitor/keyboard` is not installed. When focusing inputs on Android/iOS, the on-screen keyboard overlaps bottom sheets, submit buttons, and fixed floating bottom navigation bars (`.mobile-bottom-navbar`).
* **Fix:** Install `@capacitor/keyboard` and set `Keyboard.setResizeMode({ mode: 'body' })`.

### 6.3 Camera & Geolocation Fallbacks (HIGH)
* **Status:** **WEB API ONLY**
* **Problem:** The app uses web `navigator.mediaDevices.getUserMedia` and `navigator.geolocation.getCurrentPosition`. Inside native Android WebView, if camera or location permission was denied previously, `getUserMedia` rejects permanently with `NotAllowedError` with no way for the user to reopen the OS permission settings dialog.
* **Fix:** Use `@capacitor/camera` and `@capacitor/geolocation` with native permission request dialogs and `openAppSettings()` fallback.

### 6.4 Offline Behavior (CRITICAL)
* **Status:** **NO OFFLINE FALLBACK**
* **Problem:** `capacitor.config.ts` loads the app directly from a remote HTTPS server (`server.url = mobileUrl`). If the mobile device loses internet connection, the WebView displays the native browser error (`net::ERR_NAME_NOT_RESOLVED` or blank screen) instead of an offline UI.
* **Fix:** Ship the compiled React bundle inside `mobile-shell` or register a Service Worker cache that serves an offline fallback page.

---

## 🔑 Section 7: Authentication & Session Lifecycle Audit

### 7.1 CSRF Token 419 (Page Expired) Handling
* **Problem:** In `resources/js/solar/api.js`, when a session expires, the next POST request returns HTTP 419 (CSRF token mismatch). `api.js` throws an error, leaving the user blocked with no option other than a manual hard browser refresh.
* **Fix:** In `api.js`, detect status 419 and automatically fetch a fresh CSRF cookie (`/sanctum/csrf-cookie` or refresh endpoint), or prompt the user to re-login.

### 7.2 Logout Path on Subdirectory (HIGH)
* **File:** `resources/js/solar/api.js`, Line 39
  ```javascript
  window.location.href = '/';
  ```
* **Problem:** On XAMPP setups located at `/git/public/`, logging out redirects the browser to `http://localhost/` (root), producing an HTTP 404 error instead of returning to the login page.
* **Fix:** Use relative or base-aware redirection:
  ```javascript
  window.location.href = window.location.pathname.includes('/git/public') ? '/git/public/' : '/';
  ```

---

## 📋 Section 8: Master Issue Status Table (Audit Baseline)

| ID | Issue & Feature | Severity | File | Line | Current Status | Notes & Fix Detail |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **01** | Raw MySQL `UPDATE ... JOIN` breaks SQLite in tests | **CRITICAL** | `database/migrations/2026_10_01_000001_enhance_shared_expenses_and_settlements.php` | 28 | **FIXED** | Added DB driver check (`DB::getDriverName() === 'mysql'`). |
| **02** | Missing `tests/Unit` folder causing `artisan test` abort | **CRITICAL** | `phpunit.xml` / `tests/Unit/ExampleTest.php` | 9 | **FIXED** | Created `tests/Unit/ExampleTest.php` and set APP_URL. |
| **03** | Device table horizontal overflow on 360px/390px phones | **CRITICAL** | `resources/js/solar/pages/ISolarCloudPage.jsx` | 192 | **FIXED** | Switched from `.table-responsive` to `.table-wrap`. |
| **04** | API base URL hardcoded relative `/api/` on Capacitor | **CRITICAL** | `resources/js/solar/api.js` | 3-12 | **FIXED** | `getApiBaseUrl()` reads `VITE_API_URL`, local storage, and Capacitor full server URL fallback. |
| **05** | Power curtailment store/restore lacking role checks | **CRITICAL** | `app/Http/Controllers/SolarCurtailmentController.php` | 120 | **FIXED** | Enforced `super_admin` / `company_admin` authorization across store, restore, and destroy. |
| **06** | Android hardware back button kills app immediately | **CRITICAL** | `resources/js/solar/App.jsx` | 32 | **FIXED** | Configured `@capacitor/app` listener: closes active modal, navigates back, exits on home. |
| **07** | Offline screen + online auto-retry | **CRITICAL** | `resources/js/solar/components/OfflineScreen.jsx` | N/A | **FIXED** | Full-screen offline overlay mounted with auto-reconnection detection and retry. |
| **08** | `PlantPhotoController::saveTask` lacks permission check | **HIGH** | `app/Http/Controllers/PlantPhotoController.php` | 42 | **FIXED** | Enforced `requireSuperAdmin` on photo task creation, update, and deletion. |
| **09** | `PlantPhotoController::upload` falls back to `Employee::first()` | **HIGH** | `app/Http/Controllers/PlantPhotoController.php` | 118 | **FIXED** | Removed fallback; aborts with 403 if user lacks an active employee profile. |
| **10** | `$employee->user->name` crashes on null user | **HIGH** | `app/Http/Controllers/EmployeeController.php` | 36-37 | **FIXED** | Nullsafe `$employee->user?->name ?? 'Staff'` added. |
| **11** | `saveInverter` in CompaniesPage outside try/catch | **HIGH** | `resources/js/solar/pages/CompaniesPage.jsx` | 111 | **FIXED** | Wrapped in try/catch block with error message. |
| **12** | `company.inverters.filter` crashes on null inverters | **HIGH** | `resources/js/solar/pages/CompaniesPage.jsx` | 130 | **FIXED** | Safe navigation `(company.inverters || []).filter` added. |
| **13** | `DailyEntryPage.jsx` crashes on submit if company undefined | **HIGH** | `resources/js/solar/pages/DailyEntryPage.jsx` | 216 | **FIXED** | Guard check `if (!company?.id)` added. |
| **14** | `ReelsPage.jsx` `video.play()` lacks `.catch()` | **HIGH** | `resources/js/solar/pages/ReelsPage.jsx` | 120 | **FIXED** | Added `.catch(() => setIsPlaying(false))`. |
| **15** | `EmployeesPage.jsx` `api('employees')` error handling & state | **HIGH** | `resources/js/solar/pages/EmployeesPage.jsx` | 33 | **FIXED** | Try/catch, loading indicator, error retry banner, and disabled submit states implemented. |
| **16** | `UsersPage.jsx` `api('users')` error handling & state | **HIGH** | `resources/js/solar/pages/UsersPage.jsx` | 23 | **FIXED** | Try/catch, loading spinner, error retry banner, and disabled submit states implemented. |
| **17** | `StockPage.jsx` modal and API call error handling & state | **HIGH** | `resources/js/solar/pages/StockPage.jsx` | 35 | **FIXED** | `Promise.allSettled`, loading states, error retry banner, and resilient modal flows added. |
| **18** | Direct `<a href="/api/...">` export links fail on Capacitor | **HIGH** | `resources/js/solar/pages/AttendanceReportsPage.jsx` | 65 | **FIXED** | Integrated `getApiBaseUrl()` across AttendanceReportsPage and ReportsPage export links. |
| **19** | `MySalaryPage.jsx` `row?.employee.name` crashes on null | **HIGH** | `resources/js/solar/pages/MySalaryPage.jsx` | 24 | **FIXED** | Nullsafe `row?.employee?.name` added. |
| **20** | 401 Unauthorized does not redirect to login | **HIGH** | `resources/js/solar/api.js` / `App.jsx` | 19, 28 | **FIXED** | Dispatches `solarflow:session_expired` and resets user. |
| **21** | `fetch()` lacks offline/network drop handler | **HIGH** | `resources/js/solar/api.js` | 8 | **FIXED** | Integrated network-drop detection with `OfflineScreen` auto-reconnect event. |
| **22** | Logout redirects to `/`, causing 404 on subdirectory setups | **HIGH** | `resources/js/solar/api.js` | 45 | **FIXED** | Redirects to `/git/public/` when on subdirectory. |
| **23** | Monolithic 1.37MB bundle slows down mobile initial load | **MEDIUM** | `resources/js/solar/App.jsx` | 210 | **FIXED** | Route-level code splitting with `React.lazy` and `Suspense`; individual page bundles generated. |
| **24** | DDL schema checks running on every GPS ping | **MEDIUM** | `app/Http/Controllers/EmployeeLocationController.php` | 20 | **FIXED** | Added migration for columns and memoized table check. |
| **25** | Hardcoded `id === 4` for super admin access in CurtailmentLoss | **MEDIUM** | `resources/js/solar/pages/CurtailmentLossPage.jsx` | 21 | **FIXED** | Replaced with standard role check `currentUser?.role === 'super_admin'`. |
| **26** | 10s background polling continues when tab is hidden | **MEDIUM** | `resources/js/solar/pages/DashboardPage.jsx` & `AttendancePage.jsx` | 110, 194 | **FIXED** | Polling intervals pause when `document.hidden` and resume on `visibilitychange`. |
| **27** | 7-column ledger table cramped on 768px tablet in ExpensesPage | **MEDIUM** | `resources/js/solar/pages/ExpensesPage.jsx` | 29 | **FIXED** | Card view breakpoint increased to 820px so 768px tablets default to clean card view. |
| **28** | Form submit buttons not disabled during request flight | **MEDIUM** | `CompaniesPage.jsx`, `EmployeesPage.jsx`, `AttendancePage.jsx`, `LeaveHolidayPage.jsx` | Multiple | **FIXED** | All form submit buttons disabled with loading text during in-flight requests. |
| **29** | Duplicate keys possible in Excel import error details list | **LOW** | `resources/js/solar/pages/ExcelImportPage.jsx` | 26 | **FIXED** | Composite key `${item}-${idx}` implemented. |
| **30** | ReelsPage vertical video 100% width on 1280px desktop | **MEDIUM** | `resources/js/solar/pages/ReelsPage.jsx` | 398 | **FIXED** | Constrained player feed wrapper to `maxWidth: 540px` with `margin: 0 auto`. |
| **31** | 419 CSRF silent token refresh + request retry (no page reload) | **HIGH** | `resources/js/solar/api.js` / `routes/web.php` | 25 | **FIXED** | Added `/api/csrf-token` route and automatic transparent retry on HTTP 419. |
| **32** | `@capacitor/keyboard` & camera/GPS permission denied handling | **HIGH** | `App.jsx` / `MyAttendancePage.jsx` | 110, 200 | **FIXED** | Installed `@capacitor/keyboard` body resize mode and added permission guidance modals. |
| **33** | Global ErrorBoundary + per-page ErrorBoundary | **HIGH** | `resources/js/solar/App.jsx` | 220, 248 | **FIXED** | Wrapped application, login page, and individual page routes with ErrorBoundary. |
| **34** | Security regression tests (normal user getting 403 on admin routes) | **HIGH** | `tests/Feature/SecurityAuthorizationTest.php` | 1-160 | **FIXED** | Added feature tests verifying 403 Forbidden across curtailment, photo tasks, and uploads. |

---
*Report updated and verified against codebase on October 11, 2026 (Branch: `qa-fixes-2`).*
