export function getApiBaseUrl() {
    let apiHost = '';
    if (typeof window !== 'undefined') {
        const isCapacitor = !!(
            window.Capacitor?.isNativePlatform?.() ||
            window.location.protocol === 'capacitor:'
        );

        if (window.SOLARFLOW_API_URL) {
            apiHost = window.SOLARFLOW_API_URL.replace(/\/$/, '');
        } else if (import.meta.env?.VITE_API_URL) {
            apiHost = import.meta.env.VITE_API_URL.replace(/\/$/, '');
        } else if (isCapacitor) {
            apiHost = (localStorage.getItem('solarflow_api_host') || import.meta.env?.VITE_SERVER_URL || 'https://solar.example.com').replace(/\/$/, '');
        }
    }
    let base = `${apiHost}/api/`;
    if (typeof window !== 'undefined' && window.location.pathname.includes('/git/public')) {
        base = `${apiHost}/git/public/api/`;
    }
    return { apiHost, base };
}

export function resolveMediaUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
        return url;
    }
    const { base } = getApiBaseUrl();
    if (url.startsWith('/api/')) {
        return `${base}${url.slice(5)}`;
    }
    if (url.startsWith('api/')) {
        return `${base}${url.slice(4)}`;
    }
    return url;
}

export async function refreshCsrfToken() {
    const { apiHost, base } = getApiBaseUrl();
    try {
        const res = await fetch(`${base}csrf-token`, {
            credentials: apiHost ? 'include' : 'same-origin',
            headers: { Accept: 'application/json' },
        });
        if (res.ok) {
            const data = await res.json();
            if (data?.csrf_token) {
                let meta = document.querySelector('meta[name="csrf-token"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.setAttribute('name', 'csrf-token');
                    document.head.appendChild(meta);
                }
                meta.setAttribute('content', data.csrf_token);
                return data.csrf_token;
            }
        }
    } catch (_) {}
    return null;
}

export async function api(path, options = {}, isRetry = false) {
    const isFormData = options.body instanceof FormData;
    const { apiHost, base } = getApiBaseUrl();
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    let response;
    try {
        response = await fetch(`${base}${cleanPath}`, {
            credentials: apiHost ? 'include' : 'same-origin',
            headers: {
                ...(isFormData ? {} : {'Content-Type': 'application/json'}),
                Accept: 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
                ...(options.headers || {}),
            },
            ...options,
        });
    } catch (networkError) {
        throw new Error('ઇન્ટરનેટ કનેક્શન નથી અથવા સર્વર બંધ છે. કૃપા કરીને નેટવર્ક ચેક કરો.');
    }

    if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('solarflow:session_expired'));
    }
    if (response.status === 419) {
        if (!isRetry) {
            // Silently refresh CSRF token and retry original request without reloading page
            const newToken = await refreshCsrfToken();
            if (newToken) {
                return api(path, {
                    ...options,
                    headers: {
                        ...(options.headers || {}),
                        'X-CSRF-TOKEN': newToken,
                    },
                }, true);
            }
        }
        throw new Error('સેશન એક્સપાયર થઈ ગયું છે. કૃપા કરીને પેજ રિફ્રેશ કરો.');
    }

    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

    if (!response.ok) {
        const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new Error(validation || payload?.message || 'Something went wrong.');
    }

    if (payload?.csrf_token) {
        document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', payload.csrf_token);
    }

    return payload;
}

export async function logout() {
    try {
        await api('logout', {method: 'POST'});
    } catch (e) {}
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (e) {}
    const redirectPath = (typeof window !== 'undefined' && window.location.pathname.includes('/git/public'))
        ? '/git/public/'
        : '/';
    window.location.href = redirectPath;
}

export function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function syncPushSubscription() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }
    if (Notification.permission !== 'granted') {
        return false;
    }
    try {
        const { publicKey } = await api('push-notifications/public-key');
        if (!publicKey) return false;

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            const convertedVapidKey = urlBase64ToUint8Array(publicKey);
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
        }
        if (sub) {
            await api('push-notifications/subscribe', {
                method: 'POST',
                body: JSON.stringify(sub.toJSON())
            });
            return true;
        }
    } catch (err) {
        console.warn('Push subscription sync error:', err);
    }
    return false;
}

