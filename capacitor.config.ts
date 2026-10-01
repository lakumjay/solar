import type {CapacitorConfig} from '@capacitor/cli';

const mobileUrl = process.env.SOLARFLOW_MOBILE_URL?.trim();
const allowHttp = process.env.SOLARFLOW_ALLOW_HTTP === '1';

if (mobileUrl && !mobileUrl.startsWith('https://') && !allowHttp) {
    throw new Error('SOLARFLOW_MOBILE_URL must use HTTPS. Set SOLARFLOW_ALLOW_HTTP=1 only for local emulator testing.');
}

const config: CapacitorConfig = {
    appId: 'com.solarflow.mobile',
    appName: 'SolarFlow',
    webDir: 'mobile-shell',
    server: mobileUrl ? {
        url: mobileUrl,
        cleartext: allowHttp,
    } : undefined,
    android: {
        allowMixedContent: false,
    },
    ios: {
        contentInset: 'automatic',
    },
};

export default config;
