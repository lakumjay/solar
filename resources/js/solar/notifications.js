import { api } from './api';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('This browser does not support desktop notifications.');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

export async function subscribeToPushNotifications() {
    try {
        const granted = await requestNotificationPermission();
        if (!granted) {
            return { success: false, message: 'Notification permission denied.' };
        }

        // Register or get service worker
        if (!('serviceWorker' in navigator)) {
            // Fallback for native notification without SW
            new Notification('☀️ SolarFlow Notifications Enabled', {
                body: 'You will receive real-time alerts for solar power, attendance, and expenses.',
                icon: '/icons/icon-192.png'
            });
            return { success: true, message: 'Browser notifications enabled!' };
        }

        const registration = await navigator.serviceWorker.ready;
        
        // Fetch VAPID public key
        const { publicKey } = await api('notifications/vapid-key');
        
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription && publicKey) {
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
            } catch (subErr) {
                console.warn('Push manager subscription warning, fallback to direct notification:', subErr);
            }
        }

        if (subscription) {
            await api('notifications/subscribe', {
                method: 'POST',
                body: JSON.stringify(subscription)
            });
        }

        // Show welcome notification
        if (registration.showNotification) {
            registration.showNotification('☀️ SolarFlow Alerts Activated', {
                body: 'Real-time push notifications are now active on this device.',
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                vibrate: [200, 100, 200]
            });
        } else {
            new Notification('☀️ SolarFlow Alerts Activated', {
                body: 'Real-time push notifications are now active on this device.',
                icon: '/icons/icon-192.png'
            });
        }

        return { success: true, message: 'Push notifications registered & active!' };
    } catch (err) {
        console.error('Error subscribing to push notifications:', err);
        return { success: false, message: err.message || 'Failed to subscribe to push notifications.' };
    }
}

export async function sendTestNotification() {
    try {
        const res = await api('notifications/test', {
            method: 'POST',
            body: JSON.stringify({
                title: '⚡ SolarFlow Live Status',
                body: 'All inverters are generating normally. Solar auto-switch is active!'
            })
        });

        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            if (registration.showNotification) {
                registration.showNotification(res.notification.title, {
                    body: res.notification.body,
                    icon: res.notification.icon,
                    badge: res.notification.badge,
                    vibrate: [100, 50, 100]
                });
                return { success: true, message: 'Test notification sent!' };
            }
        }

        if (Notification.permission === 'granted') {
            new Notification(res.notification.title, {
                body: res.notification.body,
                icon: res.notification.icon
            });
            return { success: true, message: 'Test notification sent!' };
        }

        return { success: true, message: 'Test notification triggered on server!' };
    } catch (err) {
        return { success: false, message: err.message };
    }
}
