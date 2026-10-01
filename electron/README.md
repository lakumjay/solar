# SolarFlow desktop runtime

The Electron shell starts Laravel locally and loads the same React application used by the web version.

- Development uses the `php` executable available on the machine.
- Production packaging looks for `php/php.exe` on Windows and `php/bin/php` on macOS/Linux inside Electron resources.
- Set `SOLARFLOW_PHP` to an explicit PHP executable when testing a custom runtime.
- The writable SQLite database and Laravel storage live in Electron's per-user application-data directory.
- The current local macOS package can fall back to the system `php` executable. Public releases must include a matching PHP runtime in the package resources so end users do not need PHP installed.

Expected bundled runtime paths:

- macOS/Linux: `php/bin/php`
- Windows: `php/php.exe`

Build commands:

- `npm run desktop:start`
- `npm run desktop:pack`
- `npm run desktop:build`

Build installers separately on each target operating system, then code-sign/notarize them using that platform's release certificates.
