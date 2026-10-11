import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function OfflineScreen({ onRetry }) {
    const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    const [retrying, setRetrying] = useState(false);
    const [justReconnected, setJustReconnected] = useState(false);

    useEffect(() => {
        const handleOffline = () => {
            setIsOffline(true);
            setJustReconnected(false);
        };

        const handleOnline = () => {
            setIsOffline(false);
            setJustReconnected(true);
            setTimeout(() => setJustReconnected(false), 3000);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('solarflow:reconnected'));
            }
            if (onRetry) {
                onRetry();
            }
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, [onRetry]);

    const handleManualRetry = async () => {
        setRetrying(true);
        if (navigator.onLine) {
            setIsOffline(false);
            setJustReconnected(true);
            setTimeout(() => setJustReconnected(false), 3000);
            if (onRetry) {
                await onRetry();
            } else if (typeof window !== 'undefined') {
                window.location.reload();
            }
        } else {
            setTimeout(() => setRetrying(false), 800);
        }
    };

    if (justReconnected) {
        return (
            <div style={{
                position: 'fixed',
                top: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 99999,
                background: '#16a34a',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '9999px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 600
            }}>
                <CheckCircle2 size={18} />
                <span>ઇન્ટરનેટ પુનઃ કનેક્ટ થઈ ગયું છે! ડેટા લોડ થઈ રહ્યો છે...</span>
            </div>
        );
    }

    if (!isOffline) {
        return null;
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99998,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            color: '#fff'
        }}>
            <div style={{
                maxWidth: '420px',
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '16px',
                padding: '32px 24px',
                textAlign: 'center',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 16px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444'
                }}>
                    <WifiOff size={32} />
                </div>

                <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#f8fafc' }}>
                    ઇન્ટરનેટ કનેક્શન નથી
                </h3>
                <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '6px' }}>
                    No Internet Connection Available
                </p>
                <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '24px', lineHeight: 1.5 }}>
                    કૃપા કરીને તમારું Wi-Fi અથવા મોબાઇલ ડેટા કનેક્શન તપાસો. જેમ જ ઇન્ટરનેટ શરૂ થશે, એપ આપમેળે ડેટા ફરીથી લોડ કરશે.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={handleManualRetry}
                        disabled={retrying}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '15px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            border: 'none',
                            cursor: retrying ? 'not-allowed' : 'pointer',
                            opacity: retrying ? 0.7 : 1
                        }}
                    >
                        <RefreshCw size={18} className={retrying ? 'animate-spin' : ''} />
                        <span>{retrying ? 'તપાસી રહ્યા છીએ...' : 'ફરી પ્રયાસ કરો (Retry)'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
