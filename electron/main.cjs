const {app, BrowserWindow, dialog, session, shell} = require('electron');
const {spawn, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 18765;
let backend = null;

function phpBinary() {
    if (process.env.SOLARFLOW_PHP) return process.env.SOLARFLOW_PHP;
    const bundled = process.platform === 'win32'
        ? path.join(process.resourcesPath, 'php', 'php.exe')
        : path.join(process.resourcesPath, 'php', 'bin', 'php');
    return fs.existsSync(bundled) ? bundled : 'php';
}

function ensureDirectory(directory) {
    fs.mkdirSync(directory, {recursive: true});
}

function prepareRuntime() {
    const laravel = app.isPackaged ? path.join(process.resourcesPath, 'laravel') : path.resolve(__dirname, '..');
    const data = path.join(app.getPath('userData'), 'runtime');
    const storage = path.join(data, 'storage');
    const database = path.join(data, 'database.sqlite');
    ['framework/cache/data', 'framework/sessions', 'framework/views', 'logs'].forEach(folder => ensureDirectory(path.join(storage, folder)));
    if (!fs.existsSync(database)) fs.copyFileSync(path.join(laravel, 'database', 'database.sqlite'), database);
    const environment = {
        ...process.env,
        APP_NAME: 'SolarFlow', APP_ENV: 'production', APP_DEBUG: 'false', APP_URL: `http://127.0.0.1:${PORT}`,
        APP_KEY: 'base64:YQX7klchbg5Iki9fylUYpl5GfPTe7lt7J+f0wb3vbF4=', APP_TIMEZONE: 'Asia/Kolkata', APP_STORAGE_PATH: storage,
        DB_CONNECTION: 'sqlite', DB_DATABASE: database, CACHE_STORE: 'database', SESSION_DRIVER: 'database', QUEUE_CONNECTION: 'database',
    };
    return {laravel, environment};
}

async function waitForBackend(url, attempts = 80) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try { const response = await fetch(url); if (response.ok) return; } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('The local SolarFlow server did not start.');
}

async function createWindow() {
    const {laravel, environment} = prepareRuntime();
    const php = phpBinary();
    const migration = spawnSync(php, ['artisan', 'migrate', '--force'], {cwd: laravel, env: environment, encoding: 'utf8'});
    if (migration.status !== 0) throw new Error(migration.stderr || migration.stdout || 'Database migration failed.');
    const publicPath = path.join(laravel, 'public');
    const router = path.join(laravel, 'vendor', 'laravel', 'framework', 'src', 'Illuminate', 'Foundation', 'resources', 'server.php');
    backend = spawn(php, ['-S', `127.0.0.1:${PORT}`, router], {cwd: publicPath, env: environment, stdio: ['ignore', 'pipe', 'pipe']});
    await waitForBackend(`http://127.0.0.1:${PORT}/up`);
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        return requestingOrigin.startsWith(`http://127.0.0.1:${PORT}`) && ['media', 'geolocation'].includes(permission);
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        const trusted = details.requestingUrl?.startsWith(`http://127.0.0.1:${PORT}`);
        callback(Boolean(trusted && ['media', 'geolocation'].includes(permission)));
    });
    const window = new BrowserWindow({
        width: 1440, height: 900, minWidth: 980, minHeight: 680, backgroundColor: '#f4f7f2',
        title: 'SolarFlow', webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true},
    });
    window.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return {action: 'deny'}; });
    await window.loadURL(`http://127.0.0.1:${PORT}`);
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else app.whenReady().then(createWindow).catch(error => {dialog.showErrorBox('SolarFlow could not start', error.message); app.quit();});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {if (backend && !backend.killed) backend.kill();});
