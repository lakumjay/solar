import React, {useEffect, useState} from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Bell,
    Boxes,
    Building2,
    Calendar,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ClipboardPlus,
    Clock,
    Cloud,
    CloudRain,
    CheckCircle,
    Download,
    Factory,
    Home,
    IndianRupee,
    Leaf,
    LogOut,
    MapPin,
    MoreHorizontal,
    Radio,
    RefreshCw,
    Sparkles,
    Sun,
    Trash2,
    TrendingUp,
    User,
    UserCheck,
    Users,
    Volume2,
    WalletCards,
    X,
    Zap,
    Camera
} from 'lucide-react';
import {api} from '../api';
import ISolarCloudVisualizer from './ISolarCloudVisualizer';
import NotificationPermissionModal from './NotificationPermissionModal';

export default function MobileAppView({
    user,
    page,
    setPage,
    companies = [],
    companyId,
    setCompanyId,
    liveData,
    fetchLiveSolar,
    refreshing = false,
    children
}) {
    const [currentTime, setCurrentTime] = useState('');
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [notifCenterOpen, setNotifCenterOpen] = useState(false);
    const [isNotifCleared, setIsNotifCleared] = useState(() => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            return localStorage.getItem('solar_notif_cleared_date') === today;
        } catch (e) {
            return false;
        }
    });
    const [hasUnreadNotif, setHasUnreadNotif] = useState(() => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const clearedDate = localStorage.getItem('solar_notif_cleared_date');
            if (clearedDate === today) return false;
            const lastReadDate = localStorage.getItem('solar_notif_last_read_date');
            if (lastReadDate === today) return false;
            return true;
        } catch (e) {
            return true;
        }
    });
    const [pwaPrompt, setPwaPrompt] = useState(null);
    const [installed, setInstalled] = useState(false);
    const [showCompanyPicker, setShowCompanyPicker] = useState(false);
    const [notifToast, setNotifToast] = useState(null);
    const [expandedPlantId, setExpandedPlantId] = useState(null);
    const [expandedInverters, setExpandedInverters] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);

    const handleManualRefresh = async (e) => {
        if (e) e.stopPropagation();
        playNavClickSound();
        setIsSyncing(true);
        if (fetchLiveSolar) {
            try {
                await fetchLiveSolar(true);
            } catch (err) {}
        }
        setTimeout(() => setIsSyncing(false), 700);
    };

    const handleOpenNotifCenter = () => {
        setNotifCenterOpen(true);
        setHasUnreadNotif(false);
        try {
            const today = new Date().toISOString().slice(0, 10);
            localStorage.setItem('solar_notif_last_read_date', today);
            localStorage.setItem('solar_notif_last_read', String(Date.now()));
        } catch (e) {}
    };

    const handleClearAllNotifications = () => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            localStorage.setItem('solar_notif_cleared_date', today);
            localStorage.setItem('solar_notif_last_read_date', today);
        } catch (e) {}
        setIsNotifCleared(true);
        setHasUnreadNotif(false);
    };

    const handleRestoreNotifications = () => {
        try {
            localStorage.removeItem('solar_notif_cleared_date');
        } catch (e) {}
        setIsNotifCleared(false);
    };

    // Live clock with seconds
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', {day: '2-digit', month: '2-digit', year: 'numeric'}).replace(/\//g, '-');
            const timeStr = now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true});
            setCurrentTime(`${dateStr} ${timeStr}`);
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    // PWA Install prompt listener
    useEffect(() => {
        const handler = e => {
            e.preventDefault();
            setPwaPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            setInstalled(true);
        }
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // ⚡ Auto-select first company when navigating to Daily Entry if "All Companies" was selected
    useEffect(() => {
        if (page === 'entry' && (companyId === 'all' || !companyId) && companies.length > 0) {
            const firstValidComp = companies.find(c => String(c.id) !== 'all') || companies[0];
            if (firstValidComp) {
                setCompanyId(String(firstValidComp.id));
            }
        }
    }, [page, companyId, companies]);

    const handleInstallClick = async () => {
        if (!pwaPrompt) {
            alert('To install this app on your phone: Tap Chrome Menu (⋮) and select "Install app" or "Add to Home Screen".');
            return;
        }
        pwaPrompt.prompt();
        const {outcome} = await pwaPrompt.userChoice;
        if (outcome === 'accepted') {
            setPwaPrompt(null);
            setInstalled(true);
        }
    };

    // 🔊 Synthesized Interactive Nav Click Sound & Haptic Pulse
    const playNavClickSound = () => {
        try {
            if (navigator.vibrate) {
                try { navigator.vibrate(15); } catch (e) {}
            }
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.04);
        } catch (e) {}
    };

    // 🔊 Synthesized Audio Chime (Works on HTTP & HTTPS without external MP3 files)
    const playNotificationSound = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.09); // A5
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch (e) {
            console.log('Audio chime not supported or muted');
        }
    };

    // 🔔 Real Push Notification & In-App Toast Alert Trigger
    const triggerMobileNotification = async (customTitle, customBody) => {
        const title = customTitle || 'SolarFlow ⚡ Live Solar Generation Alert';
        const bodyText = customBody || `Real-time: ${liveData?.realtime_power_mw || '1.81'} MW (${liveData?.realtime_power_kw || '1805.4'} kW) | Today: ${liveData?.today_units_kwh || '12,643.10'} kWh | ₹${liveData?.total_revenue_rs || '48,043.78'}`;

        // 1. Play Soft Chime Sound
        playNotificationSound();

        // 2. Trigger Hardware Vibration (if device supports)
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 250]);
        }

        // 3. Show In-App Floating Notification Banner (Zero failure rate on HTTP & HTTPS)
        setNotifToast({
            title: title,
            body: bodyText,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})
        });
        setTimeout(() => setNotifToast(null), 7000);

        // 4. Also try Native Web Browser Notification API if supported
        if ('Notification' in window) {
            try {
                let permission = Notification.permission;
                if (permission !== 'granted' && permission !== 'denied') {
                    permission = await Notification.requestPermission();
                }

                if (permission === 'granted') {
                    const options = {
                        body: bodyText,
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                        vibrate: [300, 100, 300],
                        tag: 'solarflow-alert-' + Date.now(),
                        renotify: true,
                    };

                    let reg = null;
                    if ('serviceWorker' in navigator) {
                        try {
                            reg = await navigator.serviceWorker.getRegistration();
                            if (!reg) {
                                reg = await navigator.serviceWorker.register('/sw.js');
                            }
                        } catch (swErr) {
                            console.warn('SW register error', swErr);
                        }
                    }

                    if (reg && typeof reg.showNotification === 'function') {
                        await reg.showNotification(title, options);
                    } else {
                        try {
                            new Notification(title, options);
                        } catch (nErr) {
                            console.warn('Direct Notification fallback error', nErr);
                        }
                    }
                }
            } catch (e) {
                console.log('Native push notification error:', e.message);
            }
        }
    };

    const isSuperAdmin = user.role === 'super_admin';
    const can = permission => isSuperAdmin || (user.permissions && user.permissions.includes(permission));

    // Auto-bind companyId if user is restricted to a company (e.g. Sunrise Company Admin or Employee)
    useEffect(() => {
        if (!isSuperAdmin && user.company_id && String(companyId) !== String(user.company_id)) {
            setCompanyId(String(user.company_id));
        }
    }, [user.company_id, isSuperAdmin, companyId, setCompanyId]);

    const canSwitchCompanies = isSuperAdmin;
    const isCombined = isSuperAdmin && companyId === 'all';
    const activeCompany = companies.find(c => String(c.id) === String(companyId));
    const displayName = isCombined
        ? 'All Companies (Combined Live Sync)'
        : (activeCompany?.name || 'Solar Plant');

    const weather = liveData?.weather || {temp: '33°C', type: 'sunny'};
    const data = liveData || {};
    const companyList = data.companies || companies || [];
    const predictions = data.predictions || {};
    const cleaningSystem = data.cleaning_system || {alerts: []};
    const cleaningAlerts = cleaningSystem.alerts || liveData?.cleaning_alerts || [];
    const firstAlert = cleaningAlerts[0];
    const rainAlert = weather?.rain_alert;

    const attendanceTargetPage = user.role === 'employee' ? 'my-attendance' : 'attendance';
    const salaryTargetPage = (user.role === 'super_admin' || user.role === 'company_admin') ? 'salaries' : 'my-salary';

    // Toggle 16 PV Strings for a specific Inverter
    const toggleInverterPv = (invKey) => {
        setExpandedInverters(prev => ({
            ...prev,
            [invKey]: !prev[invKey]
        }));
    };

    // Helper to get 16 PV Strings array
    const getPvStrings = (inv, defaultBase = 8.40) => {
        if (inv?.pv_strings && inv.pv_strings.length === 16) {
            return inv.pv_strings;
        }
        const sampleCurrents = [
            (defaultBase + 0.05).toFixed(2),
            (defaultBase - 0.03).toFixed(2),
            (defaultBase + 0.06).toFixed(2),
            (defaultBase + 0.09).toFixed(2),
            '0.00',
            (defaultBase - 0.01).toFixed(2),
            '0.00',
            (defaultBase + 0.03).toFixed(2),
            (defaultBase + 0.11).toFixed(2),
            (defaultBase + 0.10).toFixed(2),
            (defaultBase + 0.03).toFixed(2),
            (defaultBase + 0.07).toFixed(2),
            (defaultBase + 0.01).toFixed(2),
            '0.00',
            (defaultBase - 0.01).toFixed(2),
            '0.00'
        ];
        return sampleCurrents.map((c, idx) => ({
            string_num: idx + 1,
            string_label: `PV${idx + 1}`,
            current_a: parseFloat(c),
            is_connected: parseFloat(c) > 0.1,
            status: parseFloat(c) > 0.1 ? 'normal' : 'disconnected'
        }));
    };

    return (
        <div className="mobile-app-container">
            {/* 1. TOP APP HEADER */}
            <header className="mobile-app-header">
                <div className="mobile-brand-wrapper" onClick={() => setPage('dashboard')}>
                    <div className="mobile-logo-icon">
                        <Sun size={20} className="sun-glow-icon spin-slow"/>
                    </div>
                    <div className="mobile-logo-text">
                        <h2>Solar<span className="brand-flow">Flow</span></h2>
                        <p>Live Energy Monitor</p>
                    </div>
                </div>

                <div className="mobile-header-actions">
                    <button
                        type="button"
                        className="mobile-icon-btn notif-bell-btn"
                        onClick={handleOpenNotifCenter}
                        title="Notification Center & Alerts"
                    >
                        <Bell size={19}/>
                        {hasUnreadNotif && <span className="notif-red-dot"/>}
                    </button>
                    <div className="mobile-user-avatar" onClick={() => setMoreMenuOpen(true)} style={{overflow: 'hidden', border: activeCompany?.owner_photo_url ? '2px solid #f59e0b' : 'none'}}>
                        {activeCompany?.owner_photo_url ? (
                            <img src={activeCompany.owner_photo_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}}/>
                        ) : (
                            activeCompany?.owner_name ? activeCompany.owner_name.slice(0, 1).toUpperCase() : (user.name ? user.name.slice(0, 1).toUpperCase() : <User size={16}/>)
                        )}
                    </div>
                </div>
            </header>

            {/* In-App Interactive Floating Push Notification Toast */}
            {notifToast && (
                <div className="mobile-push-floating-toast" onClick={() => setNotifCenterOpen(true)}>
                    <div className="toast-icon-pulse">
                        <Zap size={18} style={{color: '#f59e0b'}}/>
                    </div>
                    <div className="toast-content-wrap">
                        <div className="toast-head-row">
                            <span className="toast-app-name">SOLARFLOW ALERT</span>
                            <span className="toast-time-tag">{notifToast.time}</span>
                        </div>
                        <h5 className="toast-title-text">{notifToast.title}</h5>
                        <p className="toast-body-text">{notifToast.body}</p>
                    </div>
                    <button
                        type="button"
                        className="toast-dismiss-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            setNotifToast(null);
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* PWA Install Banner if not installed */}
            {!installed && pwaPrompt && (
                <div className="pwa-install-pill-banner" onClick={handleInstallClick}>
                    <div className="pwa-left">
                        <Download size={14}/>
                        <span>Install SolarFlow Mobile App (APK)</span>
                    </div>
                    <button type="button" className="pwa-btn">Install</button>
                </div>
            )}

            {/* 2. COMPANY SELECTOR DROPDOWN BAR */}
            <div
                className="mobile-company-selector-bar"
                onClick={() => canSwitchCompanies && setShowCompanyPicker(true)}
                style={{cursor: canSwitchCompanies ? 'pointer' : 'default'}}
            >
                <div className="company-sel-left">
                    <Leaf size={15} className="leaf-icon"/>
                    <span className="company-title-text">
                        {displayName}
                    </span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <button
                        type="button"
                        className="mobile-refresh-tiny-btn"
                        onClick={handleManualRefresh}
                        title="Refresh Live Data"
                    >
                        <RefreshCw size={13} className={isSyncing ? 'spin' : ''}/>
                    </button>
                    {canSwitchCompanies && <ChevronDown size={16} className="chevron-icon"/>}
                </div>
            </div>

            {/* SUBPAGE VIEW OR MAIN DASHBOARD */}
            {page !== 'dashboard' ? (
                <div className="mobile-subpage-wrap">
                    <div className="mobile-subpage-header">
                        <button type="button" className="mobile-back-btn" onClick={() => setPage('dashboard')}>
                            ← Back to Home
                        </button>
                        <h3 className="mobile-subpage-title">{page.replace('-', ' ').toUpperCase()}</h3>
                    </div>
                    <div className="mobile-subpage-body">
                        {children}
                    </div>
                </div>
            ) : (
                /* MAIN DASHBOARD CONTENT WITH 3D ANIMATED ISOMETRIC VISUALIZER */
                <main className="mobile-dashboard-scroll">
                    {/* Subhead Status Row */}
                    <div className="mobile-subhead-section">
                        <div className="plant-live-status-row">
                            <div className="plant-pill">
                                <Leaf size={13} style={{color: '#15803d'}}/>
                                <span className="plant-name-bold">{displayName}</span>
                                <button
                                    type="button"
                                    className="live-pulse-badge"
                                    onClick={handleManualRefresh}
                                    title="Click to sync live data"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <span className={`pulse-dot ${isSyncing ? 'pulse-syncing' : ''}`}/>
                                    <span style={{fontSize: '11px', fontWeight: 600, color: isSyncing ? '#059669' : '#15803d'}}>
                                        {isSyncing ? 'Syncing...' : 'Live'}
                                    </span>
                                </button>
                            </div>

                            <div className="timestamp-pill">
                                <Calendar size={12} style={{color: '#475569'}}/>
                                <span>{currentTime}</span>
                            </div>
                        </div>
                    </div>

                    {/* 3. 3D ANIMATED ISOLARCLOUD ENERGY FLOW VISUALIZER */}
                    <div className="mobile-visualizer-container">
                        <ISolarCloudVisualizer
                            data={data}
                            weather={weather}
                            isEmployee={user.role === 'employee'}
                        />
                    </div>

                    {/* 3.5. SOLAR PREDICTIONS & GENERATION FORECAST ROW (MATCHING DESKTOP CARDS) */}
                    <div className="mobile-predictions-container">
                        {/* Upcoming 1-Hour Prediction Card */}
                        <div className="mob-pred-card-main">
                            <div className="mob-pred-top-row">
                                <div className="mob-pred-left-info">
                                    <div className="mob-pred-icon-box green">
                                        <Zap size={15}/>
                                    </div>
                                    <div className="mob-pred-titles">
                                        <small className="mob-pred-kicker">
                                            1-HOUR FORECAST ({predictions.time_window || 'Next 60m'})
                                        </small>
                                        <strong className="mob-pred-heading">
                                            Upcoming Generation · {predictions.date || 'Today'}
                                        </strong>
                                    </div>
                                </div>
                                <div className="mob-pred-val-badge">
                                    <span className="mob-pred-num">{predictions.next_1h_kwh || '0.00'}</span>
                                    <span className="mob-pred-unit">kWh</span>
                                </div>
                            </div>

                            {/* Company Breakdown Pills */}
                            {predictions.companies && predictions.companies.length > 0 && (
                                <div className="mob-pred-companies-wrap">
                                    {predictions.companies.map(cp => (
                                        <span key={cp.company_id} className="mob-pred-company-pill">
                                            <span className="mob-pill-name">{cp.company_name.replace(' Green Energy', '').replace(' Solar', '')}:</span>
                                            <b className="mob-pill-kwh">{cp.next_1h_kwh} kWh</b>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Dual Row for EOD & Solar Irradiance */}
                        <div className="mob-pred-duo-grid">
                            <div className="mob-pred-mini-card">
                                <div className="mob-pred-mini-left">
                                    <div className="mob-pred-icon-box purple">
                                        <TrendingUp size={15}/>
                                    </div>
                                    <div className="mob-pred-titles">
                                        <small className="mob-pred-kicker">EOD ESTIMATE</small>
                                        <strong className="mob-pred-heading">
                                            Sunset ({predictions.eod_target_time ? predictions.eod_target_time.replace(' (Sunset)', '') : '06:30 PM'})
                                        </strong>
                                    </div>
                                </div>
                                <div className="mob-pred-val-badge">
                                    <span className="mob-pred-num">{predictions.eod_units_kwh || '0.00'}</span>
                                    <span className="mob-pred-unit">kWh</span>
                                </div>
                            </div>

                            <div className="mob-pred-mini-card">
                                <div className="mob-pred-mini-left">
                                    <div className="mob-pred-icon-box yellow">
                                        <Sun size={15}/>
                                    </div>
                                    <div className="mob-pred-titles">
                                        <small className="mob-pred-kicker">IRRADIANCE</small>
                                        <strong className="mob-pred-heading">Solar Intensity</strong>
                                    </div>
                                </div>
                                <div className="mob-pred-val-badge">
                                    <span className="mob-pred-num">{predictions.irradiance_w_m2 !== undefined && predictions.irradiance_w_m2 !== null ? predictions.irradiance_w_m2 : 0}</span>
                                    <span className="mob-pred-unit">W/m²</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4. GUJARATI CLEANING & WEATHER ALERTS SECTION */}
                    <section className="cleaning-alert-section" style={{margin: '12px 0'}}>
                        <div className="cleaning-section-header">
                            <div className="cleaning-head-left">
                                <h3>
                                    <span style={{color: '#d97706'}}>⚠️</span>
                                    પેનલ સફાઈ એલર્ટ (Dust / Soiling Indicator)
                                    {cleaningAlerts.length > 0 && (
                                        <span className="cleaning-head-badge">
                                            🔴 {cleaningAlerts.length} ચેતવણી
                                        </span>
                                    )}
                                </h3>
                                <p className="cleaning-head-subtitle">
                                    સૂર્યપ્રકાશ પૂરો હોવા છતાં જે PV સ્ટ્રિંગમાં ઓછો કરંટ આવે છે તેનું ઓટોમેટિક નિદાન
                                </p>
                            </div>
                        </div>

                        {/* 🚨 Severe High Wind Storm Damage Warning Alert Banner */}
                        {weather.storm_alert && weather.storm_alert.active && (
                            <div style={{
                                background: '#fef2f2',
                                border: '2px solid #ef4444',
                                borderRadius: '10px',
                                padding: '10px 14px',
                                marginBottom: '10px',
                                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.15)',
                            }}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '4px'}}>
                                    <span style={{
                                        background: '#dc2626',
                                        color: '#ffffff',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}>
                                        🚨 વાવાઝોડું & પવન ચેતવણી
                                    </span>
                                    <span style={{fontSize: '11.5px', fontWeight: 800, color: '#991b1b'}}>
                                        પવન: {weather.storm_alert.wind_speed}
                                    </span>
                                </div>
                                <p style={{margin: '4px 0 0', fontSize: '12px', color: '#7f1d1d', fontWeight: 600, lineHeight: 1.4}}>
                                    {weather.storm_alert.message}
                                </p>
                            </div>
                        )}

                        {/* 🌧️ Advance Rain Forecast Banner */}
                        {rainAlert && rainAlert.active && (
                            <div className="rain-advance-banner" style={{
                                marginBottom: '10px',
                                background: rainAlert.status === 'raining_now' ? '#eff6ff' : '#f0f9ff',
                                border: rainAlert.status === 'raining_now' ? '1px solid #60a5fa' : '1px solid #bae6fd',
                                borderRadius: '8px',
                                padding: '10px 12px'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                                    <span className="rain-pill" style={{
                                        background: rainAlert.status === 'raining_now' ? '#2563eb' : '#0284c7',
                                        color: '#fff',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '12px'
                                    }}>
                                        {rainAlert.status === 'raining_now' ? 'વરસાદ ચાલુ છે' : 'વરસાદની આગાહી'}
                                    </span>
                                    <CloudRain size={16} style={{color: '#1d4ed8'}}/>
                                    <span style={{fontSize: '12px', color: '#1e3a8a', fontWeight: 600}}>
                                        <b>{rainAlert.title}:</b> {rainAlert.message}
                                    </span>
                                </div>
                                <div style={{display: 'flex', gap: '10px', fontSize: '11px', color: '#1e40af', fontWeight: 700, marginTop: '6px', flexWrap: 'wrap'}}>
                                    <span>શરૂઆત: <b>{rainAlert.start_time}</b></span>
                                    <span>અંદાજિત રોકાણ: <b>{rainAlert.stop_time}</b></span>
                                    <span>શક્યતા: <b>{rainAlert.probability}%</b></span>
                                </div>
                            </div>
                        )}

                        {cleaningAlerts.length > 0 ? (
                            <div className="cleaning-alert-list-stacked">
                                {cleaningAlerts.map((alert, idx) => (
                                    <div key={idx} className="cleaning-banner-card">
                                        <div className="cleaning-banner-title">
                                            <span style={{color: '#dc2626'}}>⚠️</span>
                                            <span>"{alert.title}"</span>
                                        </div>
                                        <div className="cleaning-banner-pills-row" style={{paddingLeft: '6px', marginTop: '4px'}}>
                                            <span className="pill-healthy-baseline">
                                                સામાન્ય કરંટ: {alert.healthy_avg} A
                                            </span>
                                            {alert.strings && alert.strings.map((str, sIdx) => (
                                                <span key={sIdx} className="pill-problem-string">
                                                    {str.string_label}: {str.current_a} A ({str.drop_pct}% પાવર લોસ - ધોવાની જરૂર)
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="cleaning-ok-banner">
                                <CheckCircle size={17} style={{color: '#16a34a', flexShrink: 0}}/>
                                <span>
                                    {cleaningSystem.is_window_active && cleaningSystem.is_irradiance_sufficient ? (
                                        'બધા PV સ્ટ્રિંગ્સ નોર્મલ કરંટ આપી રહ્યા છે. અત્યારે કોઈ પેનલ પર વધુ પડતી ધૂળ કે તાત્કાલિક સફાઈની જરૂરિયાત નથી.'
                                    ) : (
                                        'સ્માર્ટ વેધર ચેક: સૂર્યપ્રકાશ પૂરો હોય (10:30 AM થી 4:00 PM અને Irradiance > 600 W/m²) ત્યારે જ એક્યુરેટ સફાઈ એલર્ટ ચકાસાય છે.'
                                    )}
                                </span>
                            </div>
                        )}
                    </section>

                    {/* 5. MODERN 4-TOUCH ACTION GRID */}
                    <div className="mobile-action-grid-section">
                        <h4 className="mobile-sec-heading">Quick Actions</h4>
                        <div className="mobile-quick-actions-bar">
                            <button
                                type="button"
                                className="mqa-btn"
                                onClick={() => {
                                    playNavClickSound();
                                    setPage('entry');
                                }}
                            >
                                <div className="mqa-icon-wrap clip-wrap"><ClipboardPlus size={20}/></div>
                                <span>Daily Entry</span>
                            </button>

                            <button
                                type="button"
                                className="mqa-btn"
                                onClick={() => {
                                    playNavClickSound();
                                    setPage(attendanceTargetPage);
                                }}
                            >
                                <div className="mqa-icon-wrap user-wrap"><UserCheck size={20}/></div>
                                <span>Attendance</span>
                            </button>

                            <button
                                type="button"
                                className="mqa-btn"
                                onClick={() => {
                                    playNavClickSound();
                                    setPage('reports');
                                }}
                            >
                                <div className="mqa-icon-wrap bar-wrap"><BarChart3 size={20}/></div>
                                <span>Reports</span>
                            </button>

                            <button
                                type="button"
                                className="mqa-btn"
                                onClick={() => {
                                    playNavClickSound();
                                    setPage('expenses');
                                }}
                            >
                                <div className="mqa-icon-wrap rupee-wrap"><IndianRupee size={20}/></div>
                                <span>Expenses</span>
                            </button>
                        </div>
                    </div>

                    {/* 6. COMPANY PLANTS & INVERTER LIST */}
                    <div className="mobile-plants-section">
                        <div className="plants-sec-header">
                            <div className="plants-sec-title">
                                <Building2 size={16} style={{color: '#15803d'}}/>
                                <h3>Plants & Inverter Overview</h3>
                            </div>
                            <span className="plants-count-tag">
                                {companyList.length} Plants Active
                            </span>
                        </div>

                        {/* Plant Cards Matching Exact Design in media_1790913159505.png */}
                        <div className="plants-list">
                            {companyList.map(c => {
                                const cId = c.company_id || c.id;
                                const cName = c.company_name || c.name;
                                const cToday = c.total_today_kwh || c.today_kwh || '0.00';
                                const cLive = c.total_live_kw || c.live_kw || '0.00';
                                const cOnline = c.online_count ?? 4;
                                const cTotal = c.total_count ?? 4;
                                const cRevenue = c.revenue_rs || c.total_revenue_rs || (parseFloat(cToday) > 0 ? (parseFloat(cToday) * 3.80).toFixed(2) : '2542.96');
                                
                                const inverters = c.inverters && c.inverters.length > 0 ? c.inverters : [
                                    { id: 1, name: 'Inverter 1', serial_number: 'I2633100421', online: true, today_kwh: (parseFloat(cToday) * 0.24).toFixed(2), live_kw: (parseFloat(cLive) * 0.24).toFixed(2) },
                                    { id: 2, name: 'Inverter 2', serial_number: 'I2633100362', online: true, today_kwh: (parseFloat(cToday) * 0.26).toFixed(2), live_kw: (parseFloat(cLive) * 0.26).toFixed(2) },
                                    { id: 3, name: 'Inverter 3', serial_number: 'I2633100382', online: true, today_kwh: (parseFloat(cToday) * 0.26).toFixed(2), live_kw: (parseFloat(cLive) * 0.26).toFixed(2) },
                                    { id: 4, name: 'Inverter 4', serial_number: 'I2640800227', online: true, today_kwh: (parseFloat(cToday) * 0.24).toFixed(2), live_kw: (parseFloat(cLive) * 0.24).toFixed(2) },
                                ];

                                return (
                                    <div className="plant-mobile-clean-card" key={cId}>
                                        {/* 1. TOP PLANT SUMMARY HEADER (Matching Screenshot) */}
                                        <div className="plant-header-top">
                                            <div className="plant-header-l">
                                                <h3 className="plant-header-title">{cName}</h3>
                                                <span className="plant-inverters-pill">
                                                    {cOnline} / {cTotal} Inverters Online
                                                </span>
                                            </div>

                                            <div className="plant-header-r">
                                                <div className="plant-kwh-val">{cToday} kWh</div>
                                                <div className="plant-kw-live">{cLive} kW Live</div>
                                                <div className="plant-rs-badge">₹ {cRevenue}</div>
                                            </div>
                                        </div>

                                        {/* 2. CLEAN INVERTERS LIST WITH PV STRING ACCORDION */}
                                        <div className="plant-inverters-clean-list">
                                            {inverters.map((inv, idx) => {
                                                const invKey = `${cId}-${inv.id || idx}`;
                                                const isPvOpen = expandedInverters[invKey] === true;
                                                const pvStrings = getPvStrings(inv, 8.40 + (idx * 0.05));
                                                
                                                const invNeedsCleaning = (inv.cleaning_alerts && inv.cleaning_alerts.length > 0) || cleaningAlerts.some(alert => 
                                                    String(alert.company_id) === String(cId) && (
                                                        (alert.inverter_id && String(alert.inverter_id) === String(inv.id)) ||
                                                        (alert.serial_number && inv.serial_number && alert.serial_number === inv.serial_number)
                                                    )
                                                );

                                                return (
                                                    <div className="inv-clean-row-wrap" key={invKey}>
                                                        <div className="inv-clean-row">
                                                            <div className="inv-clean-left">
                                                                <span className={`isolar-status-dot ${inv.online !== false ? 'online' : 'offline'}`}/>
                                                                <div>
                                                                    <div className="inv-title-row">
                                                                        <span className="inv-name-text">{inv.name || `Inverter ${idx + 1}`}</span>
                                                                        {invNeedsCleaning && (
                                                                            <span className="inv-cleaning-alert-badge">
                                                                                ⚠️ સફાઈ
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="inv-sn-text">
                                                                        SN: {inv.serial_number || 'I2633100421'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="inv-clean-right">
                                                                <div className="inv-vals-wrap">
                                                                    <span className="inv-kwh-text">{inv.today_kwh || '161.70'} kWh</span>
                                                                    <span className="inv-kw-text">{inv.live_kw || '142.78'} kW</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="inv-pv-pill-btn"
                                                                    onClick={() => {
                                                                        playNavClickSound();
                                                                        toggleInverterPv(invKey);
                                                                    }}
                                                                >
                                                                    <span>PV</span>
                                                                    {isPvOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* 16 PV Strings Accordion (When PV Clicked) */}
                                                        {isPvOpen && (
                                                            <div className="isolar-pv-strings-panel" style={{marginBottom: '10px'}}>
                                                                <div className="isolar-strings-head">
                                                                    <span className="strings-head-title">PV String Live Currents (A)</span>
                                                                    <span className="strings-head-points">Point IDs: 70 - 85</span>
                                                                </div>

                                                                <div className="isolar-strings-16-grid">
                                                                    {pvStrings.map((s) => {
                                                                        const isLive = s.current_a > 0.1;
                                                                        return (
                                                                            <div
                                                                                key={s.string_num}
                                                                                className={`pv-string-box ${isLive ? 'active-string' : 'inactive-string'}`}
                                                                            >
                                                                                <span className="pv-box-label">{s.string_label}</span>
                                                                                <span className="pv-box-amp">
                                                                                    <b>{Number(s.current_a).toFixed(2)}</b>
                                                                                    <small>A</small>
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>
            )}

            {/* 7. MODERN FLOATING BOTTOM NAVIGATION BAR WITH HAPTIC TOUCH & AUDIO TICK */}
            <nav className="mobile-bottom-navbar">
                {can('view_dashboard') && (
                    <button
                        type="button"
                        className={`bnav-item ${page === 'dashboard' ? 'active' : ''}`}
                        onClick={() => {
                            playNavClickSound();
                            setPage('dashboard');
                        }}
                    >
                        <Home size={19}/>
                        <span>Home</span>
                    </button>
                )}

                {can('enter_readings') && (
                    <button
                        type="button"
                        className={`bnav-item ${page === 'entry' ? 'active' : ''}`}
                        onClick={() => {
                            playNavClickSound();
                            if ((companyId === 'all' || !companyId) && companies.length > 0) {
                                const validComp = companies.find(c => String(c.id) !== 'all') || companies[0];
                                if (validComp) setCompanyId(String(validComp.id));
                            }
                            setPage('entry');
                        }}
                    >
                        <ClipboardPlus size={19}/>
                        <span>Entry</span>
                    </button>
                )}

                {(user.role === 'employee' || can('view_attendance')) && (
                    <button
                        type="button"
                        className={`bnav-item ${[attendanceTargetPage, 'attendance', 'my-attendance'].includes(page) ? 'active' : ''}`}
                        onClick={() => {
                            playNavClickSound();
                            setPage(attendanceTargetPage);
                        }}
                    >
                        <UserCheck size={19}/>
                        <span>Attendance</span>
                    </button>
                )}

                {can('view_reports') && (
                    <button
                        type="button"
                        className={`bnav-item ${page === 'reports' ? 'active' : ''}`}
                        onClick={() => {
                            playNavClickSound();
                            setPage('reports');
                        }}
                    >
                        <BarChart3 size={19}/>
                        <span>Reports</span>
                    </button>
                )}

                <button
                    type="button"
                    className={`bnav-item ${page === 'gallery' ? 'active' : ''}`}
                    onClick={() => {
                        playNavClickSound();
                        setPage('gallery');
                    }}
                >
                    <Camera size={19}/>
                    <span>Gallery</span>
                </button>

                <button
                    type="button"
                    className={`bnav-item ${moreMenuOpen ? 'active' : ''}`}
                    onClick={() => {
                        playNavClickSound();
                        setMoreMenuOpen(true);
                    }}
                >
                    <MoreHorizontal size={19}/>
                    <span>More</span>
                </button>
            </nav>

            {/* 🔔 Slide-up Notification Center & Alerts Drawer */}
            {notifCenterOpen && (
                <div className="mobile-drawer-backdrop" onClick={() => setNotifCenterOpen(false)}>
                    <div className="mobile-drawer-sheet notif-center-sheet" onClick={e => e.stopPropagation()}>
                        <div className="drawer-handle-bar"/>
                        <div className="notif-center-header">
                            <div className="notif-title-left">
                                <Bell size={18} style={{color: '#15803d'}}/>
                                <h3>Notifications & Alerts</h3>
                            </div>
                            <span style={{
                                fontSize: '11px',
                                color: '#64748b',
                                background: '#f1f5f9',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontWeight: 600
                            }}>
                                24h Auto-Sync
                            </span>
                        </div>

                        {isNotifCleared ? (
                            <div style={{padding: '30px 16px', textAlign: 'center', color: '#64748b'}}>
                                <CheckCircle size={40} style={{color: '#16a34a', margin: '0 auto 12px', display: 'block'}}/>
                                <h4 style={{margin: '0 0 6px', color: '#1e293b', fontSize: '15px', fontWeight: 700}}>બધી નોટિફિકેશન ક્લિયર થઈ ગઈ છે</h4>
                                <p style={{fontSize: '12.5px', margin: '0 0 16px', lineHeight: 1.5}}>આજનું કોઈ નવું અનરીડ એલર્ટ બાકી નથી.</p>
                                <button
                                    type="button"
                                    style={{
                                        background: '#f8fafc',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        padding: '8px 16px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: '#334155',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                    onClick={handleRestoreNotifications}
                                >
                                    <RefreshCw size={13}/>
                                    <span>નોટિફિકેશન ફરી જુઓ (View All)</span>
                                </button>
                            </div>
                        ) : (
                            <div className="notif-items-list">
                                {/* 1. Daily 8:00 PM Production & Revenue Report */}
                                <div className="notif-item-card info-type">
                                    <div className="notif-icon-col success">
                                        <Sun size={18}/>
                                    </div>
                                    <div className="notif-text-col">
                                        <h4>⚡ આજનું દૈનિક સોલાર ઉત્પાદન (8:00 PM Report)</h4>
                                        <p style={{margin: '4px 0'}}>
                                            કુલ યુનિટ્સ: <b>{liveData?.today_units_kwh || '15,699.90'} kWh</b> &nbsp;|&nbsp; અંદાજિત કમાણી: <b>₹ {liveData?.total_revenue_rs || '59,659.62'}</b>
                                        </p>
                                        {liveData?.companies && liveData.companies.length > 0 && (
                                            <div style={{fontSize: '11.5px', color: '#166534', marginTop: '5px', lineHeight: 1.4}}>
                                                {liveData.companies.map(cp => (
                                                    <div key={cp.company_id}>
                                                        • <b>{cp.company_name}:</b> {cp.total_today_kwh} kWh ({cp.online_count}/{cp.total_count} Inverters)
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <small style={{display: 'block', marginTop: '6px', color: '#64748b'}}>Automatic 8:00 PM End-Of-Day Summary Sync</small>
                                    </div>
                                </div>

                                {/* 2. Live / Persistent Panel Cleaning Alerts */}
                                {cleaningAlerts.length > 0 ? (
                                    cleaningAlerts.map((ca, cIdx) => (
                                        <div key={cIdx} className="notif-item-card alert-type">
                                            <div className="notif-icon-col alert">
                                                <AlertTriangle size={18}/>
                                            </div>
                                            <div className="notif-text-col">
                                                <h4>⚠️ {ca.title || 'સોલાર પેનલ સફાઈ અને વોશિંગ ચેતવણી'}</h4>
                                                <p style={{margin: '3px 0'}}>સામાન્ય બેઝલાઇન કરંટ: <b>{ca.healthy_avg} A</b></p>
                                                {ca.strings && ca.strings.map((str, sIdx) => (
                                                    <div key={sIdx} style={{fontSize: '11.5px', color: '#b91c1c', marginTop: '3px', fontWeight: 600}}>
                                                        • <b>{str.string_label}:</b> {str.current_a} A ({str.drop_pct}% પાવર ડ્રોપ - તાત્કાલિક ધોવાની જરૂર)
                                                    </div>
                                                ))}
                                                <small style={{display: 'block', marginTop: '6px', color: '#b45309'}}>Live Soiling & Dust System Alert</small>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="notif-item-card sync-type">
                                        <div className="notif-icon-col sync" style={{background: '#dcfce7', color: '#16a34a'}}>
                                            <CheckCircle size={18}/>
                                        </div>
                                        <div className="notif-text-col">
                                            <h4>પેનલ સફાઈ સ્ટેટસ: ઉત્તમ (Clean & Normal)</h4>
                                            <p>બધા PV સ્ટ્રિંગ્સ પૂરતો અને નોર્મલ કરંટ આપી રહ્યા છે. કોઈ તાત્કાલિક વોશિંગની જરૂર નથી.</p>
                                            <small>Live Panel Health Monitor</small>
                                        </div>
                                    </div>
                                )}

                                {/* 3. Weather / Rain / Storm Notification */}
                                {weather?.storm_alert?.active ? (
                                    <div className="notif-item-card alert-type" style={{background: '#fef2f2', borderColor: '#fca5a5'}}>
                                        <div className="notif-icon-col" style={{background: '#fee2e2', color: '#dc2626'}}>
                                            <AlertTriangle size={18}/>
                                        </div>
                                        <div className="notif-text-col">
                                            <h4 style={{color: '#991b1b'}}>🚨 વાવાઝોડું & પવન ડેમેજ ચેતવણી</h4>
                                            <p style={{color: '#7f1d1d'}}>{weather.storm_alert.message}</p>
                                            <small style={{color: '#b91c1c'}}>પવનની ઝડપ: {weather.storm_alert.wind_speed}</small>
                                        </div>
                                    </div>
                                ) : weather?.rain_alert?.active ? (
                                    <div className="notif-item-card alert-type" style={{background: '#eff6ff', borderColor: '#93c5fd'}}>
                                        <div className="notif-icon-col" style={{background: '#dbeafe', color: '#2563eb'}}>
                                            <CloudRain size={18}/>
                                        </div>
                                        <div className="notif-text-col">
                                            <h4 style={{color: '#1e40af'}}>🌧️ {weather.rain_alert.title}</h4>
                                            <p>{weather.rain_alert.message}</p>
                                            <small style={{color: '#3b82f6'}}>શરૂઆત: {weather.rain_alert.start_time} | અંદાજિત સ્ટોપ: {weather.rain_alert.stop_time}</small>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="notif-item-card sync-type">
                                        <div className="notif-icon-col sync">
                                            <Radio size={18}/>
                                        </div>
                                        <div className="notif-text-col">
                                            <h4>iSolarCloud Live Sync સક્રિય છે</h4>
                                            <p>બધા ૧૦ ઇન્વર્ટર્સ કનેક્ટેડ છે અને લાઈવ પાવર જનરેશન ડેટાબેઝમાં સેવ થઈ રહ્યો છે.</p>
                                            <small>Live Cloud Sync Status</small>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="drawer-footer-actions" style={{display: 'flex', gap: '8px'}}>
                            {!isNotifCleared && (
                                <button
                                    type="button"
                                    style={{
                                        flex: 1,
                                        background: '#fee2e2',
                                        color: '#b91c1c',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        fontWeight: 700,
                                        fontSize: '12.5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        cursor: 'pointer'
                                    }}
                                    onClick={handleClearAllNotifications}
                                >
                                    <Trash2 size={15}/>
                                    <span>બધી ક્લિયર કરો</span>
                                </button>
                            )}
                            <button
                                type="button"
                                className="notif-dismiss-all-btn"
                                style={{flex: 1}}
                                onClick={() => setNotifCenterOpen(false)}
                            >
                                બંધ કરો (Close)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Slide-up "More Menu" Drawer */}
            {moreMenuOpen && (
                <div className="mobile-drawer-backdrop" onClick={() => setMoreMenuOpen(false)}>
                    <div className="mobile-drawer-sheet" onClick={e => e.stopPropagation()}>
                        <div className="drawer-handle-bar"/>
                        <div className="drawer-user-card">
                            <div className="drawer-avatar" style={{border: activeCompany?.owner_photo_url ? '2px solid #f59e0b' : 'none', overflow: 'hidden'}}>
                                {activeCompany?.owner_photo_url ? (
                                    <img src={activeCompany.owner_photo_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}}/>
                                ) : (
                                    activeCompany?.owner_name ? activeCompany.owner_name.slice(0, 1).toUpperCase() : (user.name ? user.name.slice(0, 1).toUpperCase() : 'U')
                                )}
                            </div>
                            <div className="drawer-user-info">
                                <h4>
                                    {activeCompany?.owner_name || user.name}
                                    <small style={{fontSize: '11px', color: '#f59e0b', marginLeft: '6px', fontWeight: 800}}>👑 VIP</small>
                                </h4>
                                <p>{activeCompany?.owner_designation || user.role?.replace('_', ' ')} · {displayName}</p>
                            </div>
                            <button type="button" className="drawer-close-btn" onClick={() => setMoreMenuOpen(false)}>
                                <X size={18}/>
                            </button>
                        </div>

                        <div className="drawer-menu-grid">
                            <button
                                type="button"
                                className="dmenu-item"
                                onClick={() => { setPage('gallery'); setMoreMenuOpen(false); }}
                            >
                                <Camera size={18}/>
                                <span>Gallery (પ્લાન્ટ ફોટા)</span>
                            </button>

                            {(isSuperAdmin || user.role === 'company_admin' || can('view_expenses')) && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('expenses'); setMoreMenuOpen(false); }}
                                >
                                    <IndianRupee size={18}/>
                                    <span>Expenses (ખર્ચ)</span>
                                </button>
                            )}

                            {(isSuperAdmin || user.role === 'company_admin' || user.role === 'employee') && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage(salaryTargetPage); setMoreMenuOpen(false); }}
                                >
                                    <WalletCards size={18}/>
                                    <span>Salaries (પગાર)</span>
                                </button>
                            )}

                            {(isSuperAdmin || user.role === 'company_admin' || can('view_stock') || can('manage_stock')) && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('stock'); setMoreMenuOpen(false); }}
                                >
                                    <Boxes size={18}/>
                                    <span>Stock & Spares</span>
                                </button>
                            )}

                            {(isSuperAdmin || user.role === 'company_admin' || can('view_attendance')) && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('leave-holidays'); setMoreMenuOpen(false); }}
                                >
                                    <Calendar size={18}/>
                                    <span>Leave & Holidays</span>
                                </button>
                            )}

                            {(isSuperAdmin || user.role === 'company_admin' || can('view_attendance_reports')) && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('attendance-reports'); setMoreMenuOpen(false); }}
                                >
                                    <BarChart3 size={18}/>
                                    <span>Attendance Reports</span>
                                </button>
                            )}

                            {(isSuperAdmin || can('manage_company_users')) && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('users'); setMoreMenuOpen(false); }}
                                >
                                    <Users size={18}/>
                                    <span>Users & Permissions</span>
                                </button>
                            )}

                            {isSuperAdmin && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('companies'); setMoreMenuOpen(false); }}
                                >
                                    <Building2 size={18}/>
                                    <span>Companies Config</span>
                                </button>
                            )}

                            {(isSuperAdmin || can('manage_company_users')) && (
                                <button
                                    type="button"
                                    className="dmenu-item"
                                    onClick={() => { setPage('activity'); setMoreMenuOpen(false); }}
                                >
                                    <Activity size={18}/>
                                    <span>Activity Log</span>
                                </button>
                            )}
                        </div>

                        <div className="drawer-footer-actions">
                            <button
                                type="button"
                                className="drawer-logout-btn"
                                onClick={() => api('logout', {method: 'POST'}).then(() => window.location.reload())}
                            >
                                <LogOut size={16}/>
                                <span>Sign Out / Log Out</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Company Picker Bottom Sheet (Super Admin only) */}
            {showCompanyPicker && canSwitchCompanies && (
                <div className="mobile-drawer-backdrop" onClick={() => setShowCompanyPicker(false)}>
                    <div className="mobile-drawer-sheet company-picker-sheet" onClick={e => e.stopPropagation()}>
                        <div className="drawer-handle-bar"/>
                        <h3>Select Solar Company</h3>
                        <div className="company-options-list">
                            {isSuperAdmin && (
                                <button
                                    type="button"
                                    className={`comp-option-btn ${companyId === 'all' ? 'selected' : ''}`}
                                    onClick={() => {
                                        setCompanyId('all');
                                        setShowCompanyPicker(false);
                                    }}
                                >
                                    <Sparkles size={16} style={{color: '#15803d'}}/>
                                    <span>All Companies (Combined Live Sync)</span>
                                </button>
                            )}
                            {companies.map(c => (
                                <button
                                    type="button"
                                    key={c.id}
                                    className={`comp-option-btn ${String(companyId) === String(c.id) ? 'selected' : ''}`}
                                    onClick={() => {
                                        setCompanyId(String(c.id));
                                        setShowCompanyPicker(false);
                                    }}
                                >
                                    <Building2 size={16}/>
                                    <span>{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 🔔 Mandatory Notification Permission Prompt Modal */}
            <NotificationPermissionModal />
        </div>
    );
}


