import React, {useState, useEffect} from 'react';
import {Bell, CheckCircle, ShieldAlert, Sparkles, X} from 'lucide-react';
import {syncPushSubscription} from '../api';
import {getLanguage} from '../utils/translations';

export default function NotificationPermissionModal() {
    const [showModal, setShowModal] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState('default');
    const [requesting, setRequesting] = useState(false);
    const [currentLang, setCurrentLang] = useState(() => getLanguage());

    useEffect(() => {
        const handler = (e) => setCurrentLang(e.detail || getLanguage());
        window.addEventListener('solarflow_language_change', handler);
        return () => window.removeEventListener('solarflow_language_change', handler);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return;
        }

        const currentPerm = Notification.permission;
        setPermissionStatus(currentPerm);

        // If already granted, ensure Web Push subscription is registered in backend
        if (currentPerm === 'granted') {
            syncPushSubscription();
        } else {
            const hasDismissed = sessionStorage.getItem('solar_notif_dismissed_session');
            if (!hasDismissed) {
                setShowModal(true);
            }
        }
    }, []);

    const handleRequestPermission = async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            alert(currentLang === 'en' ? 'Notifications are not supported in this browser.' : 'આ બ્રાઉઝરમાં નોટિફિકેશન સપોર્ટ નથી.');
            return;
        }

        setRequesting(true);
        try {
            const result = await Notification.requestPermission();
            setPermissionStatus(result);
            if (result === 'granted') {
                setShowModal(false);
                // Register push subscription with backend
                await syncPushSubscription();

                // Trigger quick confirmation test notification
                try {
                    const options = {
                        body: currentLang === 'en' ? 'Solar plant alerts and daily generation reports are now active.' : 'સોલાર પ્લાન્ટ એલર્ટ્સ અને રોજના ઉત્પાદન રિપોર્ટ સક્રિય થઈ ગયા છે.',
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                    };
                    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                        const reg = await navigator.serviceWorker.ready;
                        reg.showNotification('⚡ SolarFlow Notifications Active', options);
                    } else {
                        new Notification('⚡ SolarFlow Notifications Active', options);
                    }
                } catch (e) {
                    console.log('Confirmation notification error', e);
                }
            } else if (result === 'denied') {
                alert(currentLang === 'en' ? 'Notifications are blocked. Please allow notifications for SolarFlow in your browser settings.' : 'નોટિફિકેશન બ્લોક થયેલું છે. કૃપા કરીને Chrome સેટિંગ્સમાંથી SolarFlow માટે Notification Allow કરો.');
            }
        } catch (error) {
            console.error('Permission request failed', error);
        } finally {
            setRequesting(false);
        }
    };

    const handleDismiss = () => {
        sessionStorage.setItem('solar_notif_dismissed_session', 'true');
        setShowModal(false);
    };

    if (!showModal || permissionStatus === 'granted') {
        return null;
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                maxWidth: '420px',
                width: '100%',
                padding: '24px 20px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                textAlign: 'center',
                position: 'relative',
                animation: 'popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <button
                    type="button"
                    onClick={handleDismiss}
                    style={{
                        position: 'absolute',
                        top: '14px',
                        right: '14px',
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '50%',
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#64748b',
                        cursor: 'pointer'
                    }}
                    title="Close"
                >
                    <X size={16} />
                </button>

                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: '#dcfce7',
                    color: '#15803d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    boxShadow: '0 8px 20px rgba(22, 163, 74, 0.25)'
                }}>
                    <Bell size={32} className="animate-bounce" />
                </div>

                <h3 style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#0f172a',
                    margin: '0 0 8px',
                    lineHeight: 1.3
                }}>
                    {currentLang === 'en' ? '🔔 Enable Plant Notifications' : '🔔 નોટિફિકેશન ચાલુ કરવું ફરજિયાત છે'}
                </h3>

                <p style={{
                    fontSize: '13px',
                    color: '#475569',
                    lineHeight: 1.5,
                    margin: '0 0 18px',
                    fontWeight: 500
                }}>
                    {currentLang === 'en'
                        ? <>Enable notifications to receive critical plant alerts, cleaning reminders, and <b>daily 8:00 PM generation (units + revenue)</b> reports.</>
                        : <>સોલાર પ્લાન્ટના મહત્વપૂર્ણ એલર્ટ્સ, પેનલ સફાઈ ચેતવણી અને <b>રોજના રાત્રે 8:00 PM ના દૈનિક ઉત્પાદન (યુનિટ્સ + કમાણી)</b> નો રિપોર્ટ મેળવવા માટે નોટિફિકેશન મંજૂર કરો.</>}
                </p>

                <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginBottom: '20px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: '#334155'
                }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#16a34a', marginBottom: '4px'}}>
                        <CheckCircle size={14} />
                        <span>{currentLang === 'en' ? 'Daily 8:00 PM automatic generation report' : 'રોજ 8:00 PM ઓટોમેટિક યુનિટ્સ રિપોર્ટ'}</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#0284c7', marginBottom: '4px'}}>
                        <CheckCircle size={14} />
                        <span>{currentLang === 'en' ? 'Live rain and storm weather alerts' : 'લાઈવ વરસાદ અને વાવાઝોડું એલર્ટ'}</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#d97706'}}>
                        <CheckCircle size={14} />
                        <span>{currentLang === 'en' ? 'Panel dust & inverter fan cleaning reminders' : 'પેનલ ધૂળ અને સફાઈ ચેતવણી'}</span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleRequestPermission}
                    disabled={requesting}
                    style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #16a34a, #15803d)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '13px 18px',
                        fontSize: '14px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 6px 18px rgba(22, 163, 74, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'transform 0.15s ease'
                    }}
                >
                    <Bell size={17} />
                    <span>{requesting ? (currentLang === 'en' ? 'Requesting permission...' : 'પરમિશન મંગાઈ રહી છે...') : (currentLang === 'en' ? 'Allow Notifications' : 'નોટિફિકેશન ચાલુ કરો (Allow Notification)')}</span>
                </button>
            </div>
        </div>
    );
}
