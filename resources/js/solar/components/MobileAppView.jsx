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
    Film,
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
    TrendingDown,
    TrendingUp,
    User,
    UserCheck,
    Users,
    Volume2,
    WalletCards,
    Wind,
    Thermometer,
    Droplets,
    X,
    Zap,
    Camera,
    Power,
    History,
    Sliders,
    ShieldAlert,
    Check
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
    const [showCurtailModal, setShowCurtailModal] = useState(false);
    const [showCurtailHistory, setShowCurtailHistory] = useState(false);
    const [curtailConfigs, setCurtailConfigs] = useState({});
    const [selectedCurtailCompIds, setSelectedCurtailCompIds] = useState([]);
    const [curtailActiveTabId, setCurtailActiveTabId] = useState('');
    const [isMultiCompanyMode, setIsMultiCompanyMode] = useState(false);
    const [curtailExpandedInvs, setCurtailExpandedInvs] = useState({});
    const [curtailSaving, setCurtailSaving] = useState(false);
    const [curtailMessage, setCurtailMessage] = useState('');
    const [historyList, setHistoryList] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [inlineCustomPct, setInlineCustomPct] = useState({});

    const getMasterCompanies = () => {
        const allComps = (companies || []).filter(c => String(c.id) !== 'all');
        if (allComps.length > 0) {
            return allComps.map(baseComp => {
                const liveComp = (liveData?.companies || []).find(lc => String(lc.company_id || lc.id) === String(baseComp.id));
                return {
                    ...baseComp,
                    company_id: baseComp.id,
                    name: baseComp.name || liveComp?.company_name || liveComp?.name,
                    inverters: (liveComp?.inverters && liveComp.inverters.length > 0)
                        ? liveComp.inverters
                        : (baseComp.inverters && baseComp.inverters.length > 0)
                            ? baseComp.inverters
                            : [
                                { id: 1, name: 'Inverter 1' },
                                { id: 2, name: 'Inverter 2' },
                                { id: 3, name: 'Inverter 3' },
                                { id: 4, name: 'Inverter 4' },
                            ]
                };
            });
        }
        return (liveData?.companies || []).map(c => ({
            ...c,
            company_id: c.company_id || c.id,
            name: c.company_name || c.name,
            inverters: (c.inverters && c.inverters.length > 0) ? c.inverters : [
                { id: 1, name: 'Inverter 1' },
                { id: 2, name: 'Inverter 2' },
                { id: 3, name: 'Inverter 3' },
                { id: 4, name: 'Inverter 4' },
            ]
        }));
    };

    const openCurtailModal = (targetCompany = null, initialPct = 20) => {
        const availableComps = getMasterCompanies();

        const configs = {};
        const chosenCompId = targetCompany
            ? String(targetCompany.company_id || targetCompany.id)
            : String(availableComps[0]?.company_id || availableComps[0]?.id || '');

        availableComps.forEach(comp => {
            const cId = String(comp.company_id || comp.id);
            const inverters = (comp.inverters && comp.inverters.length > 0)
                ? comp.inverters
                : [
                    { id: 1, name: 'Inverter 1' },
                    { id: 2, name: 'Inverter 2' },
                    { id: 3, name: 'Inverter 3' },
                    { id: 4, name: 'Inverter 4' },
                ];
            
            // Check if active curtailment already exists for this company
            const activeCurt = activeCurtailments.find(a => String(a.company_id) === cId);
            const pct = activeCurt ? activeCurt.percentage : initialPct;
            
            // Inverter IDs: active or all by default
            const activeInvIds = activeCurt && activeCurt.inverter_ids && activeCurt.inverter_ids.length > 0
                ? activeCurt.inverter_ids.map(Number)
                : inverters.map(i => i.id);

            // PV strings map per inverter: { [invId]: ['PV 10', 'PV 15'] }
            const pvMap = {};
            inverters.forEach(inv => {
                if (activeCurt && activeCurt.pv_strings) {
                    if (activeCurt.pv_strings[inv.id]) {
                        pvMap[inv.id] = [...activeCurt.pv_strings[inv.id]];
                    } else if (activeCurt.pv_strings[String(inv.id)]) {
                        pvMap[inv.id] = [...activeCurt.pv_strings[String(inv.id)]];
                    } else if (Array.isArray(activeCurt.pv_strings)) {
                        pvMap[inv.id] = [...activeCurt.pv_strings];
                    } else {
                        pvMap[inv.id] = [];
                    }
                } else {
                    pvMap[inv.id] = [];
                }
            });

            configs[cId] = {
                company_id: cId,
                name: comp.name || comp.company_name,
                percentage: pct,
                inverter_ids: activeInvIds,
                pv_strings: pvMap,
                notes: activeCurt?.notes || 'PGVCL Curtailment Order',
                inverters: inverters,
            };
        });

        setCurtailConfigs(configs);
        setSelectedCurtailCompIds([chosenCompId]);
        setCurtailActiveTabId(chosenCompId);
        setIsMultiCompanyMode(false);
        setCurtailMessage('');
        setShowCurtailModal(true);
    };

    const handleSaveCurtailment = async (e) => {
        if (e) e.preventDefault();
        setCurtailSaving(true);
        setCurtailMessage('');

        try {
            if (isMultiCompanyMode && selectedCurtailCompIds.length > 1) {
                // Multi-company payload
                const companiesPayload = selectedCurtailCompIds.map(cId => {
                    const cfg = curtailConfigs[cId];
                    return {
                        company_id: Number(cId),
                        percentage: Number(cfg.percentage),
                        inverter_ids: cfg.inverter_ids,
                        pv_strings: cfg.pv_strings,
                        notes: cfg.notes || 'PGVCL Curtailment Order',
                    };
                });

                const res = await api('curtailments', {
                    method: 'POST',
                    body: JSON.stringify({ companies: companiesPayload }),
                });
                setCurtailMessage(res.message || 'મલ્ટિ-કંપની કર્ટલમેન્ટ સફળતાપૂર્વક સેટ થઈ ગયું છે.');
            } else {
                // Single company payload
                const activeCId = selectedCurtailCompIds[0] || curtailActiveTabId;
                const cfg = curtailConfigs[activeCId];
                if (!cfg) throw new Error('કંપની પસંદ કરવામાં આવી નથી.');

                const res = await api('curtailments', {
                    method: 'POST',
                    body: JSON.stringify({
                        company_id: Number(activeCId),
                        percentage: Number(cfg.percentage),
                        inverter_ids: cfg.inverter_ids,
                        pv_strings: cfg.pv_strings,
                        notes: cfg.notes || 'PGVCL Curtailment Order',
                    }),
                });
                setCurtailMessage(res.message || 'કર્ટલમેન્ટ સફળતાપૂર્વક સેટ થઈ ગયું છે.');
            }

            setTimeout(() => {
                setShowCurtailModal(false);
                setCurtailMessage('');
                if (fetchLiveSolar) fetchLiveSolar(true);
            }, 600);
        } catch (err) {
            setCurtailMessage(err.message || 'કર્ટલમેન્ટ સેટ કરવામાં ભૂલ આવી.');
        } finally {
            setCurtailSaving(false);
        }
    };

    const updateActiveCurtailConfig = (field, value) => {
        setCurtailConfigs(prev => ({
            ...prev,
            [curtailActiveTabId]: {
                ...prev[curtailActiveTabId],
                [field]: value,
            }
        }));
    };

    const toggleCompanySelection = (cId) => {
        setSelectedCurtailCompIds(prev => {
            const exists = prev.includes(cId);
            let updated;
            if (exists) {
                if (prev.length <= 1) return prev; // Keep at least one
                updated = prev.filter(id => id !== cId);
            } else {
                updated = [...prev, cId];
            }
            if (!updated.includes(curtailActiveTabId)) {
                setCurtailActiveTabId(updated[0]);
            }
            return updated;
        });
    };

    const toggleCurtailInverterAccordion = (invId) => {
        setCurtailExpandedInvs(prev => ({
            ...prev,
            [invId]: !prev[invId]
        }));
    };

    const toggleInverterSelection = (invId) => {
        const curCfg = curtailConfigs[curtailActiveTabId];
        if (!curCfg) return;
        const exists = curCfg.inverter_ids.includes(invId);
        const newIds = exists
            ? curCfg.inverter_ids.filter(id => id !== invId)
            : [...curCfg.inverter_ids, invId];
        updateActiveCurtailConfig('inverter_ids', newIds);
    };

    const toggleAllInverters = (selectAll) => {
        const curCfg = curtailConfigs[curtailActiveTabId];
        if (!curCfg) return;
        const allInvIds = (curCfg.inverters || []).map(i => i.id);
        updateActiveCurtailConfig('inverter_ids', selectAll ? allInvIds : []);
    };

    const togglePvString = (invId, stringLabel) => {
        const curCfg = curtailConfigs[curtailActiveTabId];
        if (!curCfg) return;
        const currentStrings = curCfg.pv_strings[invId] || [];
        const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();
        const exists = currentStrings.some(s => norm(s) === norm(stringLabel));
        const newStrings = exists
            ? currentStrings.filter(s => norm(s) !== norm(stringLabel))
            : [...currentStrings, stringLabel];
        
        updateActiveCurtailConfig('pv_strings', {
            ...curCfg.pv_strings,
            [invId]: newStrings,
        });
    };

    const toggleAllPvsForInverter = (invId, selectAll) => {
        const curCfg = curtailConfigs[curtailActiveTabId];
        if (!curCfg) return;
        let newStrings = [];
        if (selectAll) {
            for (let s = 1; s <= 16; s++) newStrings.push('PV ' + s);
        } else {
            newStrings = [];
        }
        updateActiveCurtailConfig('pv_strings', {
            ...curCfg.pv_strings,
            [invId]: newStrings,
        });
    };

    const handleQuickStepChange = async (targetCompanyId, newPercentage) => {
        try {
            await api('curtailments', {
                method: 'POST',
                body: JSON.stringify({
                    company_id: targetCompanyId,
                    percentage: newPercentage,
                }),
            });
            if (fetchLiveSolar) fetchLiveSolar(true);
        } catch (err) {
            alert('Step update failed: ' + (err.message || 'Error'));
        }
    };

    const handleRestoreAll = async (targetCompanyId = null) => {
        const confirmMsg = targetCompanyId
            ? 'શું તમે આ કંપની માટે PGVCL કર્ટલમેન્ટ પૂર્ણ કરી ૧૦૦% ફુલ પાવર ચાલુ કરવા માંગો છો?'
            : 'શું તમે તમામ પ્લાન્ટ માટે PGVCL કર્ટલમેન્ટ પૂર્ણ કરી ૧૦૦% ફુલ પાવર ચાલુ કરવા માંગો છો?';
        if (!confirm(confirmMsg)) return;
        try {
            await api('curtailments/restore-all', {
                method: 'POST',
                body: JSON.stringify({ company_id: targetCompanyId || 'all' }),
            });
            if (fetchLiveSolar) fetchLiveSolar(true);
            if (showCurtailHistory) fetchCurtailmentHistory();
        } catch (err) {
            alert('Restore failed: ' + (err.message || 'Error'));
        }
    };

    const fetchCurtailmentHistory = async () => {
        setHistoryLoading(true);
        setShowCurtailHistory(true);
        try {
            const res = await api('curtailments');
            setHistoryList(res.history_curtailments || []);
        } catch (err) {
            console.error('Failed to load history', err);
        } finally {
            setHistoryLoading(false);
        }
    };

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

    const canSwitchCompanies = isSuperAdmin || !user.company_id;
    const isCombined = (isSuperAdmin || !user.company_id) && companyId === 'all';
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
    const curtailmentSystem = data.curtailment_system || { is_any_active: false, active_list: [] };
    const activeCurtailments = curtailmentSystem.active_list || [];

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
                            user?.name ? user.name.slice(0, 1).toUpperCase() : <User size={16}/>
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

                            {/* 🌤️ Cloud vs Technical Fault AI Pill in Mobile (Hidden when plant is normal/stable) */}
                            {data?.smart_insights?.cloud_vs_fault && data.smart_insights.cloud_vs_fault.type !== 'normal' && (
                                <span className={`cloud-fault-ai-pill ${data.smart_insights.cloud_vs_fault.theme}`} style={{fontSize: '10.5px', padding: '2px 8px'}}>
                                    {data.smart_insights.cloud_vs_fault.badge}
                                </span>
                            )}

                            <div className="timestamp-pill">
                                <Calendar size={12} style={{color: '#475569'}}/>
                                <span>{currentTime}</span>
                            </div>
                        </div>
                    </div>

                    {/* ⚡ PGVCL Solar Curtailment Mobile Control Box & Master Restore Switch */}
                    <div style={{
                        margin: '0 12px 10px 12px',
                        background: curtailmentSystem.is_any_active ? '#fff7ed' : '#ffffff',
                        border: curtailmentSystem.is_any_active ? '1.5px solid #f97316' : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        boxShadow: curtailmentSystem.is_any_active ? '0 3px 12px rgba(249, 115, 22, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <div style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '8px',
                                    background: curtailmentSystem.is_any_active ? '#ffedd5' : '#e0f2fe',
                                    color: curtailmentSystem.is_any_active ? '#ea580c' : '#0284c7',
                                    display: 'grid',
                                    placeItems: 'center',
                                    flexShrink: 0
                                }}>
                                    <Power size={16}/>
                                </div>
                                <div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                        <b style={{fontSize: '12px', color: curtailmentSystem.is_any_active ? '#9a3412' : '#0f172a'}}>
                                            {curtailmentSystem.is_any_active ? '⚡ PGVCL કર્ટલમેન્ટ ચાલુ છે' : '⚡ PGVCL: ૧૦૦% ફુલ પાવર'}
                                        </b>
                                        {curtailmentSystem.is_any_active && (
                                            <span style={{
                                                background: '#ea580c',
                                                color: '#ffffff',
                                                fontSize: '10px',
                                                fontWeight: 800,
                                                padding: '1px 6px',
                                                borderRadius: '8px'
                                            }}>
                                                {curtailmentSystem.active_count} પ્લાન્ટ
                                            </span>
                                        )}
                                    </div>
                                    <span style={{fontSize: '10.5px', color: curtailmentSystem.is_any_active ? '#c2410c' : '#64748b', display: 'block'}}>
                                        {curtailmentSystem.is_any_active
                                            ? 'PGVCL ઓર્ડર મુજબ ઉત્પાદન ઘટાડેલું છે.'
                                            : 'બધા પ્લાન્ટ ૧૦૦% ક્ષમતાથી ચાલુ છે.'}
                                    </span>
                                </div>
                            </div>

                            <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                {curtailmentSystem.is_any_active ? (
                                    <button
                                        type="button"
                                        onClick={() => handleRestoreAll('all')}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            background: '#16a34a',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Zap size={12}/>
                                        ૧૦૦% ફુલ પાવર
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => openCurtailModal(null, 20)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            background: '#f97316',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '5px 9px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Sliders size={12}/>
                                        ઘટાડો સેટ કરો
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={fetchCurtailmentHistory}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        background: '#ffffff',
                                        color: '#475569',
                                        border: '1px solid #cbd5e1',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '10.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <History size={11}/>
                                    ઇતિહાસ
                                </button>
                            </div>
                        </div>

                        {/* Active Curtailments List on Mobile */}
                        {curtailmentSystem.is_any_active && (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px'}}>
                                {activeCurtailments.map((curt, cIdx) => (
                                    <div key={cIdx} style={{
                                        background: '#ffffff',
                                        border: '1px solid #fed7aa',
                                        borderRadius: '8px',
                                        padding: '8px 10px'
                                    }}>
                                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '4px'}}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                                <span style={{
                                                    background: '#ea580c',
                                                    color: '#fff',
                                                    fontWeight: 800,
                                                    fontSize: '10px',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {curt.percentage}%
                                                </span>
                                                <b style={{fontSize: '11.5px', color: '#0f172a'}}>🏢 {curt.company_name}</b>
                                            </div>
                                            <span style={{
                                                background: '#fef2f2',
                                                color: '#dc2626',
                                                fontSize: '10.5px',
                                                fontWeight: 800,
                                                padding: '1px 5px',
                                                borderRadius: '4px'
                                            }}>
                                                -{curt.lost_kwh} kWh (~₹{curt.lost_revenue_rs})
                                            </span>
                                        </div>

                                        {/* Inverter & PV String Details on Card */}
                                        <div style={{marginTop: '6px', background: '#fff7ed', borderRadius: '6px', padding: '6px 8px', border: '1px dashed #fed7aa', fontSize: '11px'}}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', flexWrap: 'wrap'}}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap'}}>
                                                    <span style={{color: '#9a3412', fontWeight: 700}}>🔌 બંધ ઇન્વર્ટર:</span>
                                                    <b style={{color: '#1e293b'}}>{curt.inverter_names && curt.inverter_names.length > 0 ? curt.inverter_names.join(', ') : 'તમામ ઇન્વર્ટર'}</b>
                                                </div>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const targetComp = getMasterCompanies().find(c => String(c.company_id || c.id) === String(curt.company_id));
                                                            openCurtailModal(targetComp, curt.percentage);
                                                        }}
                                                        style={{
                                                            background: '#ffedd5',
                                                            color: '#9a3412',
                                                            border: '1px solid #fdba74',
                                                            borderRadius: '4px',
                                                            padding: '2px 7px',
                                                            fontSize: '10px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✏️ બદલો
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRestoreAll(curt.company_id)}
                                                        style={{
                                                            background: '#dcfce7',
                                                            color: '#15803d',
                                                            border: '1px solid #86efac',
                                                            borderRadius: '4px',
                                                            padding: '2px 7px',
                                                            fontSize: '10px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer'
                                                        }}
                                                        title="આ કંપની માટે પાવર કટ બંધ કરી ૧૦૦% ફુલ પાવર ચાલુ કરો"
                                                    >
                                                        🟢 ૧૦૦% Restore
                                                    </button>
                                                </div>
                                            </div>

                                            {/* If specific PV strings */}
                                            {(() => {
                                                let pvChips = [];
                                                if (curt.pv_strings) {
                                                    if (Array.isArray(curt.pv_strings)) {
                                                        pvChips = curt.pv_strings;
                                                    } else if (typeof curt.pv_strings === 'object') {
                                                        Object.entries(curt.pv_strings).forEach(([invId, pvs]) => {
                                                            if (Array.isArray(pvs)) {
                                                                pvs.forEach(p => {
                                                                    if (!pvChips.includes(p)) pvChips.push(p);
                                                                });
                                                            }
                                                        });
                                                    }
                                                }
                                                if (pvChips.length > 0) {
                                                    return (
                                                        <div style={{display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '4px'}}>
                                                            <span style={{color: '#c2410c', fontWeight: 700}}>⚡ બંધ PV:</span>
                                                            {pvChips.map((pv, pIdx) => (
                                                                <span key={pIdx} style={{background: '#ea580c', color: '#fff', fontSize: '9.5px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px'}}>
                                                                    {pv}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div style={{marginTop: '2px', fontSize: '10px', color: '#7c2d12', fontWeight: 600}}>
                                                        (પસંદ કરેલ ઇન્વર્ટરના તમામ PV સ્ટ્રિંગ્સ પર લાગુ)
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Step Control Buttons on Mobile */}
                                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #fed7aa'}}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap'}}>
                                                {[40, 20, 10].map(pct => {
                                                    const isCurrent = curt.percentage === pct;
                                                    return (
                                                        <button
                                                            key={pct}
                                                            type="button"
                                                            onClick={() => !isCurrent && handleQuickStepChange(curt.company_id, pct)}
                                                            style={{
                                                                background: isCurrent ? '#ea580c' : '#f1f5f9',
                                                                color: isCurrent ? '#ffffff' : '#334155',
                                                                border: isCurrent ? '1px solid #ea580c' : '1px solid #cbd5e1',
                                                                borderRadius: '4px',
                                                                padding: '2px 5px',
                                                                fontSize: '10px',
                                                                fontWeight: isCurrent ? 800 : 600,
                                                                cursor: isCurrent ? 'default' : 'pointer'
                                                            }}
                                                        >
                                                            {pct}%
                                                        </button>
                                                    );
                                                })}

                                                {/* Inline Custom % Input for Mobile */}
                                                <div style={{display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#f8fafc', padding: '1px 3px', borderRadius: '4px', border: '1px solid #cbd5e1'}}>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="100"
                                                        placeholder="22"
                                                        value={inlineCustomPct[curt.company_id] !== undefined ? inlineCustomPct[curt.company_id] : ''}
                                                        onChange={e => setInlineCustomPct({...inlineCustomPct, [curt.company_id]: e.target.value})}
                                                        style={{width: '38px', padding: '1px 2px', fontSize: '10px', borderRadius: '3px', border: '1px solid #cbd5e1', fontWeight: 700, textAlign: 'center'}}
                                                    />
                                                    <span style={{fontSize: '9.5px', fontWeight: 700, color: '#64748b'}}>%</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const val = parseInt(inlineCustomPct[curt.company_id]);
                                                            if (val >= 1 && val <= 100) {
                                                                handleQuickStepChange(curt.company_id, val);
                                                            } else {
                                                                alert('ટકાવારી ૧ થી ૧૦૦ વચ્ચે લખો (દા.ત. 22).');
                                                            }
                                                        }}
                                                        style={{fontSize: '9.5px', padding: '1px 5px', borderRadius: '3px', border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, cursor: 'pointer'}}
                                                    >
                                                        ➔
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleRestoreAll(curt.company_id)}
                                                style={{
                                                    background: '#15803d',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '2px 7px',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ૧૦૦% Restore
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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

                        {/* Dual Row for EOD & Solar Irradiance & Heat Loss */}
                        <div className="mob-pred-duo-grid">
                            <div className="mob-pred-mini-card">
                                <div className="mob-pred-mini-left">
                                    <div className="mob-pred-icon-box purple">
                                        <TrendingUp size={15}/>
                                    </div>
                                    <div className="mob-pred-titles">
                                        <small className="mob-pred-kicker">EOD ESTIMATE (BELL-CURVE)</small>
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

                            {/* Heat Loss Card in Mobile */}
                            {predictions.heat_loss_pct !== undefined && (
                                <div className="mob-pred-mini-card mob-pred-full-width">
                                    <div className="mob-pred-mini-left">
                                        <div className="mob-pred-icon-box red" style={{background: '#fee2e2', color: '#dc2626'}}>
                                            <Thermometer size={15}/>
                                        </div>
                                        <div className="mob-pred-titles">
                                            <small className="mob-pred-kicker">HEAT EFFICIENCY LOSS</small>
                                            <strong className="mob-pred-heading">Cell Temp: ~{weather.heat_loss?.cell_temp_c || 50}°C</strong>
                                        </div>
                                    </div>
                                    <div className="mob-pred-val-badge" style={{color: '#dc2626'}}>
                                        <span className="mob-pred-num">-{predictions.heat_loss_pct}%</span>
                                        <span className="mob-pred-unit">({predictions.heat_loss_kw || 0} kW)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 📊 Hourly Generation Forecast Timeline (Horizon Bar for Mobile) */}
                        {predictions.hourly_forecast && predictions.hourly_forecast.length > 0 && (
                            <div className="hourly-forecast-strip" style={{marginTop: '10px'}}>
                                <div className="hourly-forecast-head">
                                    <div className="hourly-forecast-title">
                                        <Sparkles size={13} style={{color: '#0284c7'}}/>
                                        <b>કલાકવાર ઉત્પાદન અંદાજ (Hourly Forecast)</b>
                                    </div>
                                    <span className="hourly-forecast-sub">સાંજ સુધી</span>
                                </div>
                                <div className="hourly-forecast-pills-row">
                                    {predictions.hourly_forecast.map((hf, hIdx) => (
                                        <div key={hIdx} className={`hourly-pred-card ${hf.status === 'current' ? 'is-current' : ''}`}>
                                            <span className="hourly-card-time">{hf.hour}</span>
                                            <b className="hourly-card-kwh">{hf.kwh} <small>kWh</small></b>
                                            <span className="hourly-card-rad">☀️ {hf.irradiance} W/m²</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 4. GUJARATI CLEANING & SMART DIAGNOSTIC ALERTS SECTION */}
                    <section className="cleaning-alert-section" style={{margin: '12px 0'}}>
                        <div className="cleaning-section-header">
                            <div className="cleaning-head-left">
                                <h3>
                                    <span style={{color: (data?.smart_insights?.cloud_vs_fault?.type === 'night_standby') ? '#0284c7' : '#d97706'}}>
                                        {(data?.smart_insights?.cloud_vs_fault?.type === 'night_standby') ? '🌙' : '⚠️'}
                                    </span>
                                    {(data?.smart_insights?.cloud_vs_fault?.type === 'night_standby')
                                        ? 'પ્લાન્ટ સ્માર્ટ સ્ટેટસ (રાત્રિ સ્લીપ મોડ)'
                                        : 'પ્લાન્ટ સ્માર્ટ ડાયગ્નોસ્ટિક & સફાઈ એલર્ટ'}
                                    {!(data?.smart_insights?.cloud_vs_fault?.type === 'night_standby') && ((cleaningAlerts.length > 0) || (data?.smart_insights?.underperforming_inverters?.length > 0) || data?.smart_insights?.grid_downtime?.is_down) && (
                                        <span className="cleaning-head-badge">
                                            🔴 {(cleaningAlerts.length || 0) + (data?.smart_insights?.underperforming_inverters?.length || 0) + (data?.smart_insights?.grid_downtime?.is_down ? 1 : 0)} ચેતવણી
                                        </span>
                                    )}
                                </h3>
                                <p className="cleaning-head-subtitle">
                                    {(data?.smart_insights?.cloud_vs_fault?.type === 'night_standby')
                                        ? 'સૂર્યાસ્ત બાદ પ્લાન્ટ બંધ છે. આવતીકાલે સવારે સૂર્યોદય સાથે લાઈવ AI ડાયગ્નોસ્ટિક્સ સક્રિય થશે.'
                                        : 'નબળા ઇન્વર્ટર, પાવર લોસ, ગ્રીડ ટ્રીપિંગ અને ધૂળનું ઓટોમેટિક AI નિદાન'}
                                </p>
                            </div>
                        </div>

                        {/* 📉 Grid Downtime & Revenue Loss Alert Banner in Mobile */}
                        {data?.smart_insights?.grid_downtime && data.smart_insights.grid_downtime.is_down && (
                            <div className="grid-downtime-alert-banner" style={{marginBottom: '8px'}}>
                                <div className="grid-downtime-head">
                                    <span className="grid-downtime-tag">
                                        <Activity size={13}/> 🚨 ગ્રીડ ટ્રીપિંગ ({data.smart_insights.grid_downtime.downtime_minutes} મિનિટ)
                                    </span>
                                    <span className="grid-downtime-loss-val">
                                        -{data.smart_insights.grid_downtime.lost_units_kwh} kWh (₹{data.smart_insights.grid_downtime.lost_revenue_rs})
                                    </span>
                                </div>
                                <p className="grid-downtime-msg">{data.smart_insights.grid_downtime.message}</p>
                            </div>
                        )}

                        {/* 🚨 Severe High Wind Storm Damage Warning Alert Banner */}
                        {weather.storm_alert && weather.storm_alert.active && (
                            <div className="weather-storm-banner" style={{marginBottom: '8px'}}>
                                <div className="weather-storm-head">
                                    <span className="weather-storm-tag">
                                        <Wind size={13}/> 🚨 તેજ પવન એલર્ટ (Wind Storm)
                                    </span>
                                    <span className="weather-storm-speed">
                                        {weather.storm_alert.wind_speed} (ઝાટકા: {weather.storm_alert.wind_gusts})
                                    </span>
                                </div>
                                <p className="weather-storm-msg">
                                    {weather.storm_alert.message}
                                </p>
                            </div>
                        )}

                        {/* 🔍 Inverter Underperformance Alert Cards in Mobile */}
                        {data?.smart_insights?.underperforming_inverters && data.smart_insights.underperforming_inverters.length > 0 && (
                            <div className="underperf-inverters-list" style={{marginBottom: '8px'}}>
                                {data.smart_insights.underperforming_inverters.map((uInv, uIdx) => (
                                    <div key={uIdx} className="underperf-inverter-card">
                                        <div className="underperf-card-head">
                                            <div className="underperf-title">
                                                <TrendingDown size={14} style={{color: '#dc2626'}}/>
                                                <b>{uInv.title}</b>
                                            </div>
                                            <span className="underperf-loss-chip">
                                                -{uInv.diff_kwh} kWh (₹{uInv.loss_rs})
                                            </span>
                                        </div>
                                        <div className="underperf-stats-row">
                                            <span>જનરેશન: <b>{uInv.today_kwh}</b></span>
                                            <span>એવરેજ: <b>{uInv.benchmark_kwh}</b></span>
                                            <span>ઓછું: <b style={{color: '#dc2626'}}>-{uInv.diff_pct}%</b></span>
                                        </div>
                                        <p className="underperf-advice">💡 {uInv.advice}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ⚠️ Serious Problem Alerts Group: Red Inverter Underperformance + Yellow PV Cleaning Alerts stacked together */}
                        {cleaningAlerts.length > 0 ? (
                            <div className="cleaning-alert-list-stacked" style={{marginBottom: '8px'}}>
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
                        ) : null}

                        {/* 🚿 Smart Plate Washing Advice Banner in Mobile */}
                        {cleaningSystem.washing_advice && (
                            <div className={`smart-washing-banner ${cleaningSystem.washing_advice.theme}`} style={{marginBottom: '8px'}}>
                                <div className="smart-washing-left">
                                    <span className="smart-washing-badge">{cleaningSystem.washing_advice.badge}</span>
                                    <div className="smart-washing-text">
                                        <b>{cleaningSystem.washing_advice.title}:</b> <span>{cleaningSystem.washing_advice.message}</span>
                                    </div>
                                </div>
                                <Droplets size={18} className="smart-washing-icon"/>
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

                        {cleaningAlerts.length === 0 && (!data?.smart_insights?.underperforming_inverters || data.smart_insights.underperforming_inverters.length === 0) && (
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
            {page !== 'reels' && (
                <nav className="mobile-bottom-navbar">
                    <button
                        type="button"
                        className={`bnav-item ${page === 'dashboard' ? 'active' : ''}`}
                        onClick={() => {
                            playNavClickSound();
                            setPage('dashboard');
                        }}
                    >
                        <Zap size={19}/>
                        <span>Live Solar</span>
                    </button>

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
            )}

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
                                    user?.name ? user.name.slice(0, 1).toUpperCase() : 'U'
                                )}
                            </div>
                            <div className="drawer-user-info">
                                <h4>
                                    {user?.name || 'Super Admin'}
                                    <small style={{fontSize: '11px', color: '#f59e0b', marginLeft: '6px', fontWeight: 800}}>👑 VIP</small>
                                </h4>
                                <p>
                                    <span style={{background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, fontSize: '10.5px'}}>
                                        {user?.role === 'super_admin' ? 'Super Admin' : (user?.role?.replace('_', ' ') || 'User')}
                                    </span>
                                    {activeCompany?.owner_name && (
                                        <span style={{marginLeft: '6px', color: '#64748b', fontSize: '11px'}}>
                                            · ઓનર: {activeCompany.owner_name}
                                        </span>
                                    )}
                                </p>
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

                            <button
                                type="button"
                                className="dmenu-item"
                                onClick={() => { setPage('reels'); setMoreMenuOpen(false); }}
                                style={{background: '#f0fdf4', border: '1px solid #86efac'}}
                            >
                                <Film size={18} style={{color: '#16a34a'}}/>
                                <span style={{color: '#166534', fontWeight: 700}}>🎬 Reels Hub</span>
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
                            {(isSuperAdmin || !user.company_id) && (
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

            {/* ⚡ PGVCL Curtailment Setup Modal for Mobile */}
            {showCurtailModal && (() => {
                const availableComps = getMasterCompanies();
                const activeCfg = curtailConfigs[curtailActiveTabId] || Object.values(curtailConfigs)[0];

                return (
                    <div className="solar-modal-backdrop" onClick={() => setShowCurtailModal(false)}>
                        <div className="solar-compact-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '480px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
                            {/* Modal Header */}
                            <div className="solar-modal-head" style={{background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <div>
                                    <h3 style={{display: 'flex', alignItems: 'center', gap: '6px', color: '#9a3412', fontSize: '14px', margin: 0, fontWeight: 800}}>
                                        <Sliders size={16} style={{color: '#ea580c'}}/>
                                        PGVCL પાવર ઘટાડો સેટ કરો (Curtailment)
                                    </h3>
                                    <span style={{fontSize: '11px', color: '#7c2d12', marginTop: '2px', display: 'block'}}>
                                        ઇન્વર્ટર અને PV સ્ટ્રિંગ લેવલ સિલેક્શન
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="icon-button ghost"
                                    onClick={() => setShowCurtailModal(false)}
                                    style={{background: 'transparent', border: 'none', cursor: 'pointer'}}
                                >
                                    <X size={18}/>
                                </button>
                            </div>

                            <form onSubmit={handleSaveCurtailment} style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'}}>
                                <div className="solar-modal-body" style={{padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1}}>
                                    {/* PGVCL Hint Banner */}
                                    <div style={{
                                        background: '#fffbeb',
                                        border: '1px solid #fef3c7',
                                        borderRadius: '7px',
                                        padding: '7px 10px',
                                        fontSize: '11px',
                                        color: '#92400e',
                                        lineHeight: '1.4'
                                    }}>
                                        💡 <b>PGVCL નિયમ:</b> જે PV સ્ટ્રિંગ અથવા ઇન્વર્ટર બંધ કરશો, તેના પર ધૂળ/કચરાની ચેતવણી (Dust Alert) આપોઆપ બંધ થઈ જશે.
                                    </div>

                                    {/* 1. Company Mode Switch (Single vs Multi) */}
                                    <div style={{background: '#f8fafc', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px'}}>
                                            <span style={{fontSize: '11.5px', fontWeight: 800, color: '#334155'}}>
                                                🏢 કંપની પસંદગી:
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextMode = !isMultiCompanyMode;
                                                    setIsMultiCompanyMode(nextMode);
                                                    if (nextMode) {
                                                        const compIds = availableComps.map(c => String(c.company_id || c.id));
                                                        setSelectedCurtailCompIds(compIds);
                                                    } else {
                                                        setSelectedCurtailCompIds([curtailActiveTabId]);
                                                    }
                                                }}
                                                style={{
                                                    fontSize: '10.5px',
                                                    padding: '3px 8px',
                                                    borderRadius: '5px',
                                                    border: isMultiCompanyMode ? '1.5px solid #ea580c' : '1px solid #cbd5e1',
                                                    background: isMultiCompanyMode ? '#ffedd5' : '#ffffff',
                                                    color: isMultiCompanyMode ? '#c2410c' : '#64748b',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {isMultiCompanyMode ? '✅ બહુવિધ કંપનીઓ (Multi)' : '➕ બહુવિધ કંપનીઓ પસંદ કરો'}
                                            </button>
                                        </div>

                                        {isMultiCompanyMode ? (
                                            <div>
                                                <div style={{fontSize: '10.5px', color: '#64748b', marginBottom: '6px'}}>
                                                    બધી કે પસંદગીની કંપનીઓ ટીક કરો:
                                                </div>
                                                <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px'}}>
                                                    {availableComps.map(c => {
                                                        const cId = String(c.company_id || c.id);
                                                        const isChecked = selectedCurtailCompIds.includes(cId);
                                                        return (
                                                            <button
                                                                key={cId}
                                                                type="button"
                                                                onClick={() => toggleCompanySelection(cId)}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '6px',
                                                                    border: isChecked ? '1.5px solid #ea580c' : '1px solid #cbd5e1',
                                                                    background: isChecked ? '#fff7ed' : '#ffffff',
                                                                    color: isChecked ? '#9a3412' : '#475569',
                                                                    fontSize: '11px',
                                                                    fontWeight: isChecked ? 700 : 500,
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <span>{isChecked ? '☑️' : '⬜'}</span>
                                                                <span>{c.name || c.company_name}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Selected company tabs */}
                                                <div style={{display: 'flex', alignItems: 'center', gap: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '6px'}}>
                                                    <span style={{fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap'}}>સેટિંગ્સ:</span>
                                                    <div style={{display: 'flex', gap: '4px', overflowX: 'auto'}}>
                                                        {selectedCurtailCompIds.map(cId => {
                                                            const cfg = curtailConfigs[cId];
                                                            const isTabActive = cId === curtailActiveTabId;
                                                            return (
                                                                <button
                                                                    key={cId}
                                                                    type="button"
                                                                    onClick={() => setCurtailActiveTabId(cId)}
                                                                    style={{
                                                                        padding: '3px 7px',
                                                                        borderRadius: '5px',
                                                                        border: isTabActive ? '2px solid #ea580c' : '1px solid #cbd5e1',
                                                                        background: isTabActive ? '#ea580c' : '#ffffff',
                                                                        color: isTabActive ? '#ffffff' : '#334155',
                                                                        fontWeight: 700,
                                                                        fontSize: '10.5px',
                                                                        cursor: 'pointer',
                                                                        whiteSpace: 'nowrap'
                                                                    }}
                                                                >
                                                                    {cfg?.name || 'Company'} ({cfg?.percentage || 20}%)
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Single company dropdown / picker */
                                            <select
                                                value={curtailActiveTabId}
                                                onChange={e => {
                                                    const cId = e.target.value;
                                                    setCurtailActiveTabId(cId);
                                                    setSelectedCurtailCompIds([cId]);
                                                }}
                                                style={{width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, color: '#1e293b'}}
                                            >
                                                {availableComps.map(c => (
                                                    <option key={c.company_id || c.id} value={String(c.company_id || c.id)}>
                                                        {c.name || c.company_name}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    {/* Individual Company Restore (Turn Off Curtailment for this Company) */}
                                    {activeCfg && activeCurtailments.some(a => String(a.company_id) === String(activeCfg.company_id)) && (
                                        <div style={{
                                            background: '#f0fdf4',
                                            border: '1px solid #86efac',
                                            borderRadius: '7px',
                                            padding: '7px 10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '6px'
                                        }}>
                                            <div>
                                                <span style={{fontSize: '11px', fontWeight: 800, color: '#15803d', display: 'block'}}>
                                                    ⚡ {activeCfg.name} માં પાવર કટ ચાલુ છે
                                                </span>
                                                <span style={{fontSize: '9.5px', color: '#166534'}}>
                                                    માત્ર આ એક જ કંપની માટે પાવર કટ બંધ કરવો છે?
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    await handleRestoreAll(activeCfg.company_id);
                                                    setShowCurtailModal(false);
                                                }}
                                                style={{
                                                    background: '#15803d',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '5px',
                                                    padding: '5px 9px',
                                                    fontSize: '10.5px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                🟢 ૧૦૦% Restore (ચાલુ કરો)
                                            </button>
                                        </div>
                                    )}

                                    {/* 2. Percentage (%) selection for activeCfg */}
                                    {activeCfg && (
                                        <div style={{background: '#ffffff', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px'}}>
                                                <label style={{fontSize: '11.5px', fontWeight: 700, color: '#334155'}}>
                                                    {activeCfg.name} - પાવર કટ (%):
                                                </label>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '3px'}}>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="100"
                                                        value={activeCfg.percentage}
                                                        onChange={e => {
                                                            const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 0));
                                                            updateActiveCurtailConfig('percentage', val);
                                                        }}
                                                        style={{
                                                            width: '52px',
                                                            padding: '3px 4px',
                                                            borderRadius: '5px',
                                                            border: '2px solid #ea580c',
                                                            fontSize: '13px',
                                                            fontWeight: 800,
                                                            color: '#9a3412',
                                                            textAlign: 'center'
                                                        }}
                                                    />
                                                    <span style={{fontSize: '12px', fontWeight: 800, color: '#ea580c'}}>%</span>
                                                </div>
                                            </div>

                                            {/* Presets - sleek compact 5 columns */}
                                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px'}}>
                                                {[80, 50, 40, 30, 25, 22, 20, 15, 10, 5].map(pct => {
                                                    const isSel = Number(activeCfg.percentage) === pct;
                                                    return (
                                                        <button
                                                            key={pct}
                                                            type="button"
                                                            onClick={() => updateActiveCurtailConfig('percentage', pct)}
                                                            style={{
                                                                padding: '4px 2px',
                                                                borderRadius: '4px',
                                                                border: isSel ? '2px solid #ea580c' : '1px solid #e2e8f0',
                                                                background: isSel ? '#ffedd5' : '#f8fafc',
                                                                color: isSel ? '#9a3412' : '#475569',
                                                                fontWeight: 800,
                                                                fontSize: '10.5px',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {pct}%
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. Inverter & PV String level selection for activeCfg */}
                                    {activeCfg && (
                                        <div style={{background: '#ffffff', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px'}}>
                                                <div>
                                                    <span style={{fontSize: '11.5px', fontWeight: 800, color: '#1e293b', display: 'block'}}>
                                                        ઇન્વર્ટર અને PV સ્ટ્રિંગ્સ કંટ્રોલ
                                                    </span>
                                                    <span style={{fontSize: '10px', color: '#64748b'}}>
                                                        કુલ {(activeCfg.inverters || []).length} ઇન્વર્ટર | {(activeCfg.inverter_ids || []).length} સિલેક્ટ
                                                    </span>
                                                </div>
                                                <div style={{display: 'flex', gap: '4px'}}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAllInverters(true)}
                                                        style={{fontSize: '9.5px', padding: '2px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#334155'}}
                                                    >
                                                        બધા પસંદ
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAllInverters(false)}
                                                        style={{fontSize: '9.5px', padding: '2px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#334155'}}
                                                    >
                                                        બધા રદ
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Inverters List */}
                                            <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                                                {(activeCfg.inverters || []).map((inv, iIdx) => {
                                                    const invId = inv.id || (iIdx + 1);
                                                    const isInvChecked = (activeCfg.inverter_ids || []).includes(invId);
                                                    const isAccordionOpen = curtailExpandedInvs[invId] === true;
                                                    const curStrings = (activeCfg.pv_strings && activeCfg.pv_strings[invId]) || [];
                                                    const pvCount = curStrings.length;

                                                    return (
                                                        <div
                                                            key={invId}
                                                            style={{
                                                                borderRadius: '6px',
                                                                border: isInvChecked ? '1.5px solid #fdba74' : '1px solid #e2e8f0',
                                                                background: isInvChecked ? '#fffaf5' : '#fafafa',
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {/* Inverter Row Header */}
                                                            <div style={{padding: '6px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px'}}>
                                                                <label style={{display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', flex: 1}}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isInvChecked}
                                                                        onChange={() => toggleInverterSelection(invId)}
                                                                        style={{cursor: 'pointer', width: '15px', height: '15px'}}
                                                                    />
                                                                    <div style={{display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap'}}>
                                                                        <span style={{fontSize: '11.5px', fontWeight: 700, color: '#1e293b'}}>
                                                                            {inv.name || `Inverter ${iIdx + 1}`}
                                                                        </span>
                                                                        {pvCount > 0 ? (
                                                                            <span style={{
                                                                                fontSize: '9.5px',
                                                                                background: '#ffedd5',
                                                                                color: '#c2410c',
                                                                                padding: '1px 5px',
                                                                                borderRadius: '3px',
                                                                                fontWeight: 700
                                                                            }}>
                                                                                {pvCount} PV કટ
                                                                            </span>
                                                                        ) : isInvChecked ? (
                                                                            <span style={{fontSize: '9.5px', color: '#16a34a', fontWeight: 600}}>
                                                                                (બધા PV ચાલુ)
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                </label>

                                                                {/* Toggle PV accordion */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleCurtailInverterAccordion(invId)}
                                                                    style={{
                                                                        background: isAccordionOpen ? '#fff7ed' : '#ffffff',
                                                                        border: isAccordionOpen ? '1px solid #fdba74' : '1px solid #cbd5e1',
                                                                        borderRadius: '4px',
                                                                        padding: '2px 7px',
                                                                        fontSize: '10px',
                                                                        color: isAccordionOpen ? '#c2410c' : '#475569',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    <span>PV સ્ટ્રિંગ્સ</span>
                                                                    {isAccordionOpen ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                                                </button>
                                                            </div>

                                                            {/* PV Strings Accordion Body - Ultra Compact Mini Grid Pills */}
                                                            {isAccordionOpen && (
                                                                <div style={{
                                                                    padding: '6px 8px 8px 8px',
                                                                    background: '#ffffff',
                                                                    borderTop: '1px dashed #fed7aa'
                                                                }}>
                                                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px'}}>
                                                                        <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#64748b'}}>
                                                                            <span>PV કંટ્રોલ:</span>
                                                                            <span style={{display: 'inline-flex', alignItems: 'center', gap: '2px'}}>
                                                                                <span style={{color: '#16a34a', fontSize: '9px'}}>●</span> ચાલુ
                                                                            </span>
                                                                            <span style={{display: 'inline-flex', alignItems: 'center', gap: '2px'}}>
                                                                                <span style={{color: '#ea580c', fontSize: '9px'}}>●</span> કટ
                                                                            </span>
                                                                        </div>
                                                                        <div style={{display: 'flex', gap: '3px'}}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleAllPvsForInverter(invId, true)}
                                                                                style={{fontSize: '9px', padding: '1px 5px', borderRadius: '3px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#334155'}}
                                                                            >
                                                                                બધા કટ
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleAllPvsForInverter(invId, false)}
                                                                                style={{fontSize: '9px', padding: '1px 5px', borderRadius: '3px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#334155'}}
                                                                            >
                                                                                બધા ચાલુ
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* 16 PV String Mini Grid Pills (Compact ~27px height) */}
                                                                    <div style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: 'repeat(4, 1fr)',
                                                                        gap: '4px'
                                                                    }}>
                                                                        {Array.from({length: 16}, (_, sIdx) => {
                                                                            const stringLabel = `PV ${sIdx + 1}`;
                                                                            const norm = (s) => String(s).replace(/\s+/g, '').toUpperCase();
                                                                            const isSelected = curStrings.some(s => norm(s) === norm(stringLabel));

                                                                            return (
                                                                                <button
                                                                                    key={stringLabel}
                                                                                    type="button"
                                                                                    onClick={() => togglePvString(invId, stringLabel)}
                                                                                    style={{
                                                                                        height: '27px',
                                                                                        padding: '2px 4px',
                                                                                        borderRadius: '5px',
                                                                                        border: isSelected ? '1.5px solid #ea580c' : '1px solid #e2e8f0',
                                                                                        background: isSelected ? '#ffedd5' : '#f8fafc',
                                                                                        color: isSelected ? '#9a3412' : '#334155',
                                                                                        fontSize: '11px',
                                                                                        fontWeight: isSelected ? 800 : 600,
                                                                                        cursor: 'pointer',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        gap: '4px'
                                                                                    }}
                                                                                    title={isSelected ? `${stringLabel} પાવર કટ (બંધ)` : `${stringLabel} સામાન્ય (ચાલુ)`}
                                                                                >
                                                                                    <span style={{
                                                                                        display: 'inline-block',
                                                                                        width: '6px',
                                                                                        height: '6px',
                                                                                        borderRadius: '50%',
                                                                                        background: isSelected ? '#ea580c' : '#22c55e'
                                                                                    }}/>
                                                                                    <span>{stringLabel}</span>
                                                                                </button>
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
                                    )}

                                    {/* 4. Notes input */}
                                    {activeCfg && (
                                        <div className="solar-field-group">
                                            <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px'}}>
                                                નોંધ (Notes / Reason):
                                            </label>
                                            <input
                                                type="text"
                                                value={activeCfg.notes || ''}
                                                onChange={e => updateActiveCurtailConfig('notes', e.target.value)}
                                                placeholder="દા.ત. PGVCL Grid Curtailment Order"
                                                style={{width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px'}}
                                            />
                                        </div>
                                    )}

                                    {curtailMessage && (
                                        <div style={{
                                            padding: '8px',
                                            borderRadius: '6px',
                                            background: curtailMessage.includes('ભૂલ') ? '#fef2f2' : '#f0fdf4',
                                            color: curtailMessage.includes('ભૂલ') ? '#b91c1c' : '#15803d',
                                            fontSize: '11.5px',
                                            fontWeight: 600
                                        }}>
                                            {curtailMessage}
                                        </div>
                                    )}
                                </div>

                                {/* Modal Footer */}
                                <div className="solar-modal-foot" style={{padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                                    <button
                                        type="button"
                                        onClick={() => setShowCurtailModal(false)}
                                        style={{padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '12px', cursor: 'pointer'}}
                                    >
                                        રદ કરો (Cancel)
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={curtailSaving}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: '#ea580c',
                                            color: '#ffffff',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {curtailSaving ? 'લાગુ થઈ રહ્યું છે...' : `⚡ ${isMultiCompanyMode && selectedCurtailCompIds.length > 1 ? `બધી (${selectedCurtailCompIds.length}) કંપનીઓ માટે સેટ કરો` : 'PGVCL ઘટાડો સેટ કરો'}`}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* 📜 PGVCL Curtailment History Modal for Mobile with Histogram & PV Strings */}
            {showCurtailHistory && (() => {
                const totalLostKwh = historyList.reduce((acc, h) => acc + (parseFloat(h.lost_kwh) || 0), 0);
                const totalLostRs = historyList.reduce((acc, h) => acc + (parseFloat(h.lost_revenue_rs) || 0), 0);

                return (
                    <div className="solar-modal-backdrop" onClick={() => setShowCurtailHistory(false)}>
                        <div className="solar-compact-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '520px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
                            {/* Modal Header */}
                            <div className="solar-modal-head" style={{background: '#f0f9ff', borderBottom: '1px solid #bae6fd', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <div>
                                    <h3 style={{display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontSize: '14px', margin: 0, fontWeight: 800}}>
                                        <History size={16} style={{color: '#0284c7'}}/>
                                        PGVCL કર્ટલમેન્ટ ઇતિહાસ & લોસ હિસાબ
                                    </h3>
                                    <span style={{fontSize: '10.5px', color: '#0284c7', display: 'block', marginTop: '2px'}}>
                                        ઇન્વર્ટર, PV સ્ટ્રિંગ્સ અને ટાઇમલાઇન હિસ્ટોગ્રામ
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="icon-button ghost"
                                    onClick={() => setShowCurtailHistory(false)}
                                    style={{background: 'transparent', border: 'none', cursor: 'pointer'}}
                                >
                                    <X size={18}/>
                                </button>
                            </div>

                            <div className="solar-modal-body" style={{padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1}}>
                                {/* Total Lost Energy & Revenue Summary Cards */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '8px',
                                    marginBottom: '4px'
                                }}>
                                    <div style={{background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', padding: '8px 10px'}}>
                                        <span style={{fontSize: '10.5px', color: '#991b1b', fontWeight: 600, display: 'block'}}>
                                            કુલ યુનિટ્સ લોસ:
                                        </span>
                                        <span style={{fontSize: '15px', fontWeight: 800, color: '#dc2626'}}>
                                            -{totalLostKwh.toFixed(1)} <small style={{fontSize: '11px'}}>kWh</small>
                                        </span>
                                    </div>
                                    <div style={{background: '#fff1f2', border: '1px solid #ffe4e6', borderRadius: '7px', padding: '8px 10px'}}>
                                        <span style={{fontSize: '10.5px', color: '#9f1239', fontWeight: 600, display: 'block'}}>
                                            કુલ અંદાજિત નુકસાન:
                                        </span>
                                        <span style={{fontSize: '15px', fontWeight: 800, color: '#be123c'}}>
                                            -₹{totalLostRs.toFixed(2)}
                                        </span>
                                    </div>
                                </div>

                                {historyLoading ? (
                                    <div style={{padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px'}}>
                                        ઇતિહાસ લોડ થઈ રહ્યો છે...
                                    </div>
                                ) : historyList.length === 0 ? (
                                    <div style={{padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px'}}>
                                        અત્યાર સુધી કોઈ પાછલો કર્ટલમેન્ટ રેકોર્ડ નથી.
                                    </div>
                                ) : (
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                                        {historyList.map((hItem, hIdx) => {
                                            const pct = Number(hItem.percentage) || 20;
                                            const barColor = pct > 50 ? '#dc2626' : pct > 25 ? '#ea580c' : '#f59e0b';

                                            // Extract PV strings from hItem.pv_strings
                                            let flatPvList = [];
                                            if (hItem.pv_strings) {
                                                if (Array.isArray(hItem.pv_strings)) {
                                                    flatPvList = hItem.pv_strings;
                                                } else if (typeof hItem.pv_strings === 'object') {
                                                    Object.entries(hItem.pv_strings).forEach(([invId, pvs]) => {
                                                        if (Array.isArray(pvs)) {
                                                            pvs.forEach(p => flatPvList.push(p));
                                                        }
                                                    });
                                                }
                                            }

                                            return (
                                                <div key={hIdx} style={{
                                                    background: '#ffffff',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '8px',
                                                    padding: '10px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '7px'
                                                }}>
                                                    {/* Row 1: Company + Date + Status */}
                                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px'}}>
                                                        <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                                            <b style={{fontSize: '12.5px', color: '#0f172a'}}>🏢 {hItem.company_name}</b>
                                                            {hItem.is_active ? (
                                                                <span style={{fontSize: '9.5px', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: '3px', fontWeight: 800}}>
                                                                    🔴 ચાલુ છે
                                                                </span>
                                                            ) : (
                                                                <span style={{fontSize: '9.5px', background: '#f0fdf4', color: '#16a34a', padding: '1px 5px', borderRadius: '3px', fontWeight: 700}}>
                                                                    ✅ પૂર્ણ
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{fontSize: '10.5px', color: '#64748b', fontWeight: 600}}>
                                                            {hItem.date}
                                                        </span>
                                                    </div>

                                                    {/* Row 2: Visual Histogram Bar */}
                                                    <div>
                                                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '3px'}}>
                                                            <span style={{color: '#475569', fontWeight: 700}}>
                                                                કર્ટલમેન્ટ ઘટાડો: <b style={{color: barColor}}>{pct}%</b>
                                                            </span>
                                                            <span style={{color: '#64748b', fontSize: '10px'}}>
                                                                {hItem.duration_human}
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            width: '100%',
                                                            height: '10px',
                                                            background: '#f1f5f9',
                                                            borderRadius: '5px',
                                                            overflow: 'hidden',
                                                            position: 'relative'
                                                        }}>
                                                            <div style={{
                                                                width: `${Math.min(100, Math.max(5, pct))}%`,
                                                                height: '100%',
                                                                background: barColor,
                                                                borderRadius: '5px',
                                                                transition: 'width 0.3s ease'
                                                            }}/>
                                                        </div>
                                                    </div>

                                                    {/* Row 3: Timestamps */}
                                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: '#64748b'}}>
                                                        <span>⏰ શરૂ: <b>{hItem.started_at_human}</b></span>
                                                        <span>🏁 પૂરું: <b>{hItem.ended_at_human}</b></span>
                                                    </div>

                                                    {/* Row 4: Inverters & PV Strings Shut Down */}
                                                    {((hItem.inverter_names && hItem.inverter_names.length > 0) || flatPvList.length > 0) && (
                                                        <div style={{
                                                            background: '#f8fafc',
                                                            padding: '6px 8px',
                                                            borderRadius: '5px',
                                                            fontSize: '10.5px',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '4px'
                                                        }}>
                                                            {hItem.inverter_names && hItem.inverter_names.length > 0 && (
                                                                <div style={{display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap'}}>
                                                                    <span style={{color: '#64748b', fontWeight: 600}}>ઇન્વર્ટર:</span>
                                                                    {hItem.inverter_names.map((inm, inIdx) => (
                                                                        <span key={inIdx} style={{background: '#e2e8f0', color: '#334155', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 700}}>
                                                                            {inm}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {flatPvList.length > 0 && (
                                                                <div style={{display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap'}}>
                                                                    <span style={{color: '#ea580c', fontWeight: 600}}>બંધ PV:</span>
                                                                    {flatPvList.map((pv, pIdx) => (
                                                                        <span key={pIdx} style={{background: '#ffedd5', color: '#c2410c', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 800}}>
                                                                            {pv}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Row 5: Energy & Financial Loss */}
                                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', fontSize: '10.5px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0'}}>
                                                        <span style={{color: '#64748b'}}>
                                                            {hItem.notes ? `💬 ${hItem.notes}` : 'PGVCL Curtailment'}
                                                        </span>
                                                        <div style={{display: 'flex', gap: '4px'}}>
                                                            <span style={{background: '#fef2f2', color: '#dc2626', padding: '1px 5px', borderRadius: '3px', fontWeight: 800}}>
                                                                -{hItem.lost_kwh} kWh
                                                            </span>
                                                            <span style={{background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: '3px', fontWeight: 800}}>
                                                                -₹{hItem.lost_revenue_rs}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="solar-modal-foot" style={{padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end'}}>
                                <button
                                    type="button"
                                    onClick={() => setShowCurtailHistory(false)}
                                    style={{fontSize: '11.5px', padding: '5px 12px', borderRadius: '5px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer'}}
                                >
                                    બંધ કરો (Close)
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 🔔 Mandatory Notification Permission Prompt Modal */}
            <NotificationPermissionModal />
        </div>
    );
}


