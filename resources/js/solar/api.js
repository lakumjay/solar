export async function api(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`/api/${path}`, {
        credentials: 'same-origin',
        headers: {
            ...(isFormData ? {} : {'Content-Type': 'application/json'}),
            Accept: 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
        },
        ...options,
    });
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

