import React, {useEffect, useRef, useState} from 'react';
import {Activity, AlertCircle, AlertTriangle, Bell, Check, CheckCircle, ChevronDown, ChevronUp, Clock, Cloud, CloudLightning, CloudRain, Crosshair, DollarSign, Droplets, Factory, FileText, History, Home, MapPin, Power, RefreshCw, RotateCcw, ShieldAlert, Sliders, Sparkles, Sun, Thermometer, Trash2, TrendingDown, TrendingUp, Wind, X, Zap} from 'lucide-react';
import {api} from '../api';
import {Loading} from '../components/Common';
import ISolarCloudVisualizer from '../components/ISolarCloudVisualizer';

export default function DashboardPage({companyId, currentUser}) {
    const [liveData, setLiveData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState('');
    const [expandedInverters, setExpandedInverters] = useState({});
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [locForm, setLocForm] = useState({plant_location: '', latitude: '', longitude: ''});
    const [locSaving, setLocSaving] = useState(false);
    const [locMessage, setLocMessage] = useState('');
    const [notifStatus, setNotifStatus] = useState('default');
    const showModalRef = useRef(false);
    const timerRef = useRef(null);

    showModalRef.current = showLocationModal;
    const isEmployee = currentUser?.role === 'employee';

    // PGVCL Curtailment Management State
    const [showCurtailModal, setShowCurtailModal] = useState(false);
    const [showCurtailHistory, setShowCurtailHistory] = useState(false);
    const [curtailForm, setCurtailForm] = useState({
        company_id: '',
        percentage: 20,
        inverter_ids: [],
        pv_strings: [],
        notes: 'PGVCL Order'
    });
    const [curtailSaving, setCurtailSaving] = useState(false);
    const [curtailMessage, setCurtailMessage] = useState('');
    const [historyList, setHistoryList] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [inlineCustomPct, setInlineCustomPct] = useState({});

    const openCurtailModal = (company = null, initialPct = 20) => {
        const targetComp = company || (liveData?.companies && liveData.companies[0]);
        const allInvs = targetComp?.inverters || [];
        const invIds = allInvs.map(i => i.id);
        const allStrings = [];
        for (let s = 1; s <= 16; s++) allStrings.push('PV' + s);

        setCurtailForm({
            company_id: targetComp ? targetComp.company_id : (liveData?.companies?.[0]?.company_id || ''),
            percentage: initialPct,
            inverter_ids: invIds,
            pv_strings: allStrings,
            notes: 'PGVCL Curtailment Order'
        });
        setCurtailMessage('');
        setShowCurtailModal(true);
    };

    const handleSaveCurtailment = async (e) => {
        if (e) e.preventDefault();
        setCurtailSaving(true);
        setCurtailMessage('');
        try {
            const res = await api('curtailments', {
                method: 'POST',
                body: JSON.stringify(curtailForm),
            });
            setCurtailMessage(res.message || 'કર્ટલમેન્ટ સફળતાપૂર્વક સેટ થઈ ગયું છે.');
            setTimeout(() => {
                setShowCurtailModal(false);
                setCurtailMessage('');
                fetchLiveSolar(true);
            }, 600);
        } catch (err) {
            setCurtailMessage(err.message || 'કર્ટલમેન્ટ સેટ કરવામાં ભૂલ આવી.');
        } finally {
            setCurtailSaving(false);
        }
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
            fetchLiveSolar(true);
        } catch (err) {
            alert('Step update failed: ' + (err.message || 'Error'));
        }
    };

    const handleRestoreAll = async (targetCompanyId = null) => {
        const confirmMsg = targetCompanyId
            ? 'શું તમે આ કંપની માટે PGVCL કર્ટલમેન્ટ પૂર્ણ કરી ૧૦૦% ફુલ પાવર ચાલુ કરવા માંગો છો?'
            : 'શું તમે તમામ પ્લાન્ટ માટે PGVCL કર્ટલમેન્ટ પૂર્ણ કરી ૧૦૦% ફુલ પાવર ચાલુ કરવા માંગો છો?';
        if (!confirm(confirmMsg)) {
            return;
        }
        try {
            const res = await api('curtailments/restore-all', {
                method: 'POST',
                body: JSON.stringify({ company_id: targetCompanyId || 'all' }),
            });
            fetchLiveSolar(true);
            if (showCurtailHistory) {
                fetchCurtailmentHistory();
            }
        } catch (err) {
            alert('Restore failed: ' + (err.message || 'Error'));
        }
    };

    const [cleaningFanLoading, setCleaningFanLoading] = useState(false);

    const handleFanCleaned = async () => {
        if (!confirm('શું તમે ઇન્વર્ટર કૂલિંગ ફેન અને જાળીની ધૂળ (Dust) બ્લોઅરથી સાફ કરી લીધી છે? આનાથી ૧૦ દિવસનું નવું સાઇકલ શરૂ થશે.')) {
            return;
        }
        setCleaningFanLoading(true);
        try {
            await api('inverters/maintenance/fan-cleaned', {
                method: 'POST',
                body: JSON.stringify({ notes: 'કૂલિંગ ફેન અને જાળી બ્લોઅરથી સાફ કરવામાં આવી.' })
            });
            await fetchLiveSolar(true);
        } catch (err) {
            alert('Error: ' + (err.message || 'Failed'));
        } finally {
            setCleaningFanLoading(false);
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

    const fetchLiveSolar = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const result = await api(`dashboard/live-solar?company_id=${companyId || 'all'}`);
            setLiveData(result);
            setLastUpdated(result.last_updated || new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true}));
            
            // Only initialize locForm if modal is NOT currently open
            if (!showModalRef.current && result.plant_location) {
                setLocForm(prev => {
                    if (!prev.plant_location) {
                        return {
                            plant_location: result.plant_location || '',
                            latitude: result.latitude || '',
                            longitude: result.longitude || '',
                        };
                    }
                    return prev;
                });
            }
        } catch (error) {
            console.error('Failed to load live solar data', error);
        } finally {
            setLoading(false);
            if (isManual) setRefreshing(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchLiveSolar();

        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotifStatus(Notification.permission);
        }

        // 10-second background polling without page reload
        timerRef.current = setInterval(() => {
            fetchLiveSolar();
        }, 10000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [companyId]);

    const toggleInverterPv = (invId) => {
        setExpandedInverters(prev => ({
            ...prev,
            [invId]: !prev[invId]
        }));
    };

    const openLocationModal = () => {
        setLocForm({
            plant_location: data.plant_location || 'Sarva, Botad',
            latitude: data.latitude || 22.1704,
            longitude: data.longitude || 71.6684,
        });
        setLocMessage('');
        setShowLocationModal(true);
    };

    const selectCityPreset = (city, lat, lon) => {
        setLocForm({
            plant_location: city,
            latitude: lat,
            longitude: lon,
        });
    };

    const handleSaveLocation = async (e) => {
        e.preventDefault();
        setLocSaving(true);
        setLocMessage('');
        try {
            await api('dashboard/plant-location', {
                method: 'POST',
                body: JSON.stringify(locForm),
            });
            setLocMessage('Location saved successfully for all 3 plants!');
            setTimeout(() => {
                setShowLocationModal(false);
                setLocMessage('');
                fetchLiveSolar(true);
            }, 800);
        } catch (err) {
            setLocMessage(err.message || 'Failed to save location.');
        } finally {
            setLocSaving(false);
        }
    };

    const detectGpsLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocForm(prev => ({
                    ...prev,
                    latitude: Number(pos.coords.latitude.toFixed(6)),
                    longitude: Number(pos.coords.longitude.toFixed(6)),
                }));
            },
            (err) => {
                alert('Could not get GPS location: ' + err.message);
            },
            {enableHighAccuracy: true, timeout: 10000}
        );
    };

    const playAlertChime = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.09);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch (e) {}
    };

    const handleEnableNotification = async () => {
        if (!('Notification' in window)) {
            alert('This browser does not support desktop notifications.');
            return;
        }
        const perm = await Notification.requestPermission();
        setNotifStatus(perm);
        if (perm === 'granted') {
            triggerNativePush('SolarFlow Alert System', 'મોબાઈલ / વેબ નોટિફિકેશન સફળતાપૂર્વક ચાલુ થઈ ગયું છે!');
        }
    };

    const triggerNativePush = async (title, bodyText) => {
        playAlertChime();
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }

        if ('Notification' in window && Notification.permission === 'granted') {
            const options = {
                body: bodyText,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                vibrate: [300, 100, 300],
                tag: 'solarflow-alert-' + Date.now(),
                renotify: true,
                data: { url: '/' }
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
                    console.warn('Direct Notification fallback', nErr);
                }
            }
        }
    };

    if (loading && !liveData) return <Loading/>;

    const data = liveData || {};
    const companies = data.companies || [];
    const weather = data.weather || {};
    const predictions = data.predictions || {};
    const cleaningSystem = data.cleaning_system || {alerts: []};
    const cleaningAlerts = cleaningSystem.alerts || [];
    const rainAlert = weather.rain_alert;

    const renderWeatherIcon = () => {
        const type = weather.type || 'sunny';
        if (type === 'storm') {
            return <CloudLightning size={17} className="weather-storm-icon" style={{color: '#9333ea'}}/>;
        }
        if (type === 'rain') {
            return <CloudRain size={17} className="weather-rain-icon" style={{color: '#2563eb'}}/>;
        }
        if (type === 'cloudy') {
            return <Cloud size={17} style={{color: '#64748b'}}/>;
        }
        return <Sun size={17} className="weather-sun-icon" style={{color: '#ea580c'}}/>;
    };

    const weatherTypeClass = `weather-${weather.type || 'sunny'}`;

    const smartInsights = data.smart_insights || {};
    const underperformingInverters = smartInsights.underperforming_inverters || [];
    const cloudVsFault = smartInsights.cloud_vs_fault;
    const gridDowntime = smartInsights.grid_downtime;
    const cleaningRoi = smartInsights.cleaning_roi;
    const curtailmentSystem = data.curtailment_system || { is_any_active: false, active_list: [] };
    const activeCurtailments = curtailmentSystem.active_list || [];
    const systemAlerts = data.system_alerts || {};
    const gridOutageAlert = systemAlerts.grid_outage;
    const curtailmentReminders = systemAlerts.curtailment_reminders || [];
    const dailyReadingStatus = systemAlerts.daily_reading_status;
    const pastReadingMissing = systemAlerts.past_reading_missing;
    const fanCleaningStatus = systemAlerts.fan_cleaning;
    const overheatAlerts = systemAlerts.overheat_alerts || [];

    return (
        <div className="live-solar-container">
            {/* Top Compact Meta Bar */}
            <div className="solar-dashboard-header">
                <div className="solar-header-meta">
                    <span className="live-pulse-wrapper">
                        <span className="live-pulse-dot" style={{width: '8px', height: '8px'}}/>
                        <span>Auto-updates 10s · <b>{lastUpdated}</b></span>
                    </span>

                    {/* 🌤️ Cloud vs Technical Fault AI Badge */}
                    {cloudVsFault && (
                        <span className={`cloud-fault-ai-pill ${cloudVsFault.theme}`} title={cloudVsFault.message}>
                            {cloudVsFault.badge}
                        </span>
                    )}

                    <button
                        type="button"
                        className="plant-loc-badge-btn"
                        onClick={openLocationModal}
                        title="Set common location for all 3 plants"
                    >
                        <MapPin size={12} style={{color: '#ef4444'}}/>
                        <span>{data.plant_location || 'Sarva, Botad'}</span>
                    </button>
                </div>

                <div className="solar-header-actions">
                    {/* Revenue Badge (Hidden for regular employees) */}
                    {!isEmployee && (
                        <div className="revenue-card-badge" title="Total Revenue @ ₹3.80/Unit">
                            <span>₹ {data.total_revenue_rs || '0.00'}</span>
                            <span className="rate-sub">₹3.80 / Unit</span>
                        </div>
                    )}

                    <button
                        type="button"
                        className="btn-refresh-live"
                        onClick={() => fetchLiveSolar(true)}
                        disabled={refreshing}
                        title="Refresh Live Data"
                    >
                        <RefreshCw size={13} className={refreshing ? 'spin' : ''}/>
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ⚡ PGVCL Solar Curtailment Control Box & Master 100% Full Power Toggle */}
            <section style={{
                marginBottom: '14px',
                background: curtailmentSystem.is_any_active ? '#fff7ed' : '#f8fafc',
                border: curtailmentSystem.is_any_active ? '1.5px solid #f97316' : '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '12px 14px',
                boxShadow: curtailmentSystem.is_any_active ? '0 4px 14px rgba(249, 115, 22, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
            }}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '9px', minWidth: '220px'}}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '9px',
                            background: curtailmentSystem.is_any_active ? '#ffedd5' : '#e0f2fe',
                            color: curtailmentSystem.is_any_active ? '#ea580c' : '#0284c7',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0
                        }}>
                            <Power size={18}/>
                        </div>
                        <div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                                <b style={{fontSize: '13px', color: curtailmentSystem.is_any_active ? '#9a3412' : '#0f172a'}}>
                                    {curtailmentSystem.is_any_active ? '⚡ PGVCL પાવર કર્ટલમેન્ટ ચાલુ છે (Curtailment Active)' : '⚡ PGVCL પાવર: ૧૦૦% ફુલ મોડ ચાલુ છે'}
                                </b>
                                {curtailmentSystem.is_any_active && (
                                    <span style={{
                                        background: '#ea580c',
                                        color: '#ffffff',
                                        fontSize: '10.5px',
                                        fontWeight: 800,
                                        padding: '1px 7px',
                                        borderRadius: '10px'
                                    }}>
                                        {curtailmentSystem.active_count} કંપની કર્ટલમેન્ટ
                                    </span>
                                )}
                            </div>
                            <span style={{fontSize: '11px', color: curtailmentSystem.is_any_active ? '#c2410c' : '#64748b', display: 'block'}}>
                                {curtailmentSystem.is_any_active
                                    ? 'PGVCL ઓર્ડર મુજબ ઉત્પાદન ઘટાડેલું છે. આ સ્ટ્રિંગ્સ માટે ખોટા સફાઈ એલર્ટ આપમેળે બંધ છે.'
                                    : 'બધા પ્લાન્ટ પૂર્ણ ૧૦૦% ક્ષમતાથી ઉત્પાદન આપી રહ્યા છે.'}
                            </span>
                        </div>
                    </div>

                    <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                        {curtailmentSystem.is_any_active ? (
                            <button
                                type="button"
                                onClick={() => handleRestoreAll('all')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '7px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                                }}
                            >
                                <Zap size={13}/>
                                ⚡ ૧૦૦% ફુલ પાવર શરૂ કરો (Master Restore)
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => openCurtailModal(null, 20)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    background: '#f97316',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '6px 11px',
                                    borderRadius: '7px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <Sliders size={13}/>
                                ➕ PGVCL કર્ટલમેન્ટ સેટ કરો
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={fetchCurtailmentHistory}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#ffffff',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                padding: '5px 10px',
                                borderRadius: '7px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <History size={12}/>
                            ઇતિહાસ & નુકસાન
                        </button>
                    </div>
                </div>

                {/* Active Curtailment Cards Grid */}
                {curtailmentSystem.is_any_active && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px'}}>
                        {activeCurtailments.map((curt, cIdx) => (
                            <div key={cIdx} style={{
                                background: '#ffffff',
                                border: '1px solid #fed7aa',
                                borderRadius: '9px',
                                padding: '10px 12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap'}}>
                                        <span style={{
                                            background: '#ea580c',
                                            color: '#fff',
                                            fontWeight: 800,
                                            fontSize: '11px',
                                            padding: '2px 7px',
                                            borderRadius: '5px'
                                        }}>
                                            {curt.percentage}% કર્ટલમેન્ટ
                                        </span>
                                        <b style={{fontSize: '12.5px', color: '#0f172a'}}>🏢 {curt.company_name}</b>
                                        <span style={{fontSize: '10.5px', color: '#64748b'}}>({curt.started_at_human} થી ચાલુ)</span>
                                    </div>

                                    <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                                        <span style={{
                                            background: '#fef2f2',
                                            color: '#dc2626',
                                            border: '1px solid #fca5a5',
                                            padding: '2px 7px',
                                            borderRadius: '5px',
                                            fontSize: '11px',
                                            fontWeight: 800
                                        }}>
                                            -{curt.lost_kwh} kWh (~₹{curt.lost_revenue_rs} નુકસાન)
                                        </span>
                                        <span style={{
                                            background: '#f8fafc',
                                            color: '#475569',
                                            border: '1px solid #e2e8f0',
                                            padding: '2px 6px',
                                            borderRadius: '5px',
                                            fontSize: '10.5px',
                                            fontWeight: 600
                                        }}>
                                            ⏱️ {curt.duration_human}
                                        </span>
                                    </div>
                                </div>

                                {/* Step History Timeline Trail */}
                                {curt.step_history && curt.step_history.length > 1 && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        flexWrap: 'wrap',
                                        fontSize: '10.5px',
                                        color: '#64748b',
                                        margin: '5px 0',
                                        padding: '4px 7px',
                                        background: '#fff7ed',
                                        borderRadius: '5px'
                                    }}>
                                        <Clock size={11} style={{color: '#ea580c'}}/>
                                        <b>સ્ટેપ ટાઇમલાઇન:</b>
                                        {curt.step_history.map((st, sIdx) => (
                                            <span key={sIdx} style={{display: 'inline-flex', alignItems: 'center', gap: '3px'}}>
                                                <span style={{fontWeight: 700, color: '#c2410c'}}>{st.changed_at_human} ({st.to_percentage}%)</span>
                                                {sIdx < curt.step_history.length - 1 && <span>➔</span>}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Quick Step Selector Chips + Actions Bar */}
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #fed7aa'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap'}}>
                                        <span style={{fontSize: '10.5px', fontWeight: 700, color: '#475569'}}>સ્ટેપ બદલો:</span>
                                        {[10, 20, 40, 80].map(pct => (
                                            <button
                                                key={pct}
                                                type="button"
                                                onClick={() => handleQuickStepChange(curt.company_id, pct)}
                                                style={{
                                                    fontSize: '10.5px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    border: curt.percentage === pct ? '1.5px solid #ea580c' : '1px solid #cbd5e1',
                                                    background: curt.percentage === pct ? '#ffedd5' : '#ffffff',
                                                    color: curt.percentage === pct ? '#c2410c' : '#334155',
                                                    fontWeight: curt.percentage === pct ? 800 : 500,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {pct}%
                                            </button>
                                        ))}

                                        {/* Direct Custom % Input Box */}
                                        <div style={{display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f8fafc', padding: '1px 4px', borderRadius: '5px', border: '1px solid #cbd5e1'}}>
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                placeholder="દા.ત. 22"
                                                value={inlineCustomPct[curt.company_id] !== undefined ? inlineCustomPct[curt.company_id] : ''}
                                                onChange={e => setInlineCustomPct({...inlineCustomPct, [curt.company_id]: e.target.value})}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        const val = parseInt(inlineCustomPct[curt.company_id]);
                                                        if (val >= 1 && val <= 100) {
                                                            handleQuickStepChange(curt.company_id, val);
                                                        }
                                                    }
                                                }}
                                                style={{width: '52px', padding: '2px 4px', fontSize: '11px', borderRadius: '3px', border: '1px solid #cbd5e1', fontWeight: 700, textAlign: 'center'}}
                                                title="પોતાની કસ્ટમ ટકાવારી લખો (જેમ કે 22%)"
                                            />
                                            <span style={{fontSize: '10.5px', fontWeight: 700, color: '#64748b'}}>%</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const val = parseInt(inlineCustomPct[curt.company_id]);
                                                    if (val >= 1 && val <= 100) {
                                                        handleQuickStepChange(curt.company_id, val);
                                                    } else {
                                                        alert('કૃપા કરી ૧ થી ૧૦૦ વચ્ચે ટકાવારી લખો (દા.ત. 22).');
                                                    }
                                                }}
                                                style={{
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '3px',
                                                    border: 'none',
                                                    background: '#ea580c',
                                                    color: '#ffffff',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                બદલો
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => openCurtailModal(companies.find(c => c.company_id === curt.company_id), curt.percentage)}
                                            style={{
                                                fontSize: '10.5px',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                border: '1px solid #cbd5e1',
                                                background: '#ffffff',
                                                color: '#334155',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ⚙️ સંપૂર્ણ સેટિંગ
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleRestoreAll(curt.company_id)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            color: '#16a34a',
                                            background: '#f0fdf4',
                                            border: '1px solid #86efac',
                                            padding: '3px 8px',
                                            borderRadius: '5px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Check size={11}/>
                                        આ કંપની Restore કરો (100% ON)
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* 1. FIRST: Top Dashboard Notifications & Smart Diagnostic Center */}
            <section className="cleaning-alert-section">
                <div className="cleaning-section-header">
                    <div className="cleaning-head-left">
                        <h3>
                            <span style={{color: (smartInsights.cloud_vs_fault?.type === 'night_standby') ? '#0284c7' : '#d97706'}}>
                                {(smartInsights.cloud_vs_fault?.type === 'night_standby') ? '🌙' : '⚠️'}
                            </span>
                            {(smartInsights.cloud_vs_fault?.type === 'night_standby')
                                ? 'પ્લાન્ટ સ્માર્ટ સ્ટેટસ (રાત્રિ સ્લીપ મોડ - પ્લાન્ટ બંધ છે)'
                                : 'પ્લાન્ટ સ્માર્ટ ડાયગ્નોસ્ટિક & સફાઈ એલર્ટ'}
                            {!(smartInsights.cloud_vs_fault?.type === 'night_standby') && (cleaningAlerts.length > 0 || underperformingInverters.length > 0 || gridDowntime?.is_down) && (
                                <span className="cleaning-head-badge">
                                    🔴 {cleaningAlerts.length + underperformingInverters.length + (gridDowntime?.is_down ? 1 : 0)} ચેતવણી
                                </span>
                            )}
                        </h3>
                        <p className="cleaning-head-subtitle">
                            {(smartInsights.cloud_vs_fault?.type === 'night_standby')
                                ? 'સૂર્યાસ્ત બાદ ઉત્પાદન બંધ છે. આવતીકાલે સવારે સૂર્યોદય સાથે ઓટોમેટિક AI ડાયગ્નોસ્ટિક્સ સક્રિય થશે.'
                                : 'નબળા ઇન્વર્ટર, પાવર લોસ, ગ્રીડ ટ્રીપિંગ અને ધૂળનું ઓટોમેટિક AI નિદાન'}
                        </p>
                    </div>

                    <div className="cleaning-head-actions">
                        <button
                            type="button"
                            className="btn-notif-toggle"
                            onClick={handleEnableNotification}
                            title="Enable Mobile/Desktop Push Notification"
                        >
                            <Bell size={13}/>
                            {notifStatus === 'granted' ? 'નોટિફિકેશન સક્રિય છે' : 'મોબાઈલ નોટિફિકેશન ચાલુ કરો'}
                        </button>
                    </div>
                </div>

                {/* ⏰ Daily Reading Status (Confirmation when saved OR Reminder / Missing Meter Alert) */}
                {dailyReadingStatus && dailyReadingStatus.active && (
                    <div style={{
                        marginBottom: '12px',
                        background: dailyReadingStatus.status === 'completed'
                            ? '#f0fdf4'
                            : dailyReadingStatus.status === 'meter_missing'
                                ? '#fffbeb'
                                : dailyReadingStatus.status === 'due_now'
                                    ? '#f0f9ff'
                                    : '#fef2f2',
                        border: dailyReadingStatus.status === 'completed'
                            ? '1.5px solid #22c55e'
                            : dailyReadingStatus.status === 'meter_missing'
                                ? '1.5px solid #f59e0b'
                                : dailyReadingStatus.status === 'due_now'
                                    ? '1.5px solid #38bdf8'
                                    : '1.5px solid #ef4444',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: dailyReadingStatus.status === 'completed'
                                    ? '#dcfce7'
                                    : dailyReadingStatus.status === 'meter_missing'
                                        ? '#fef3c7'
                                        : dailyReadingStatus.status === 'due_now'
                                            ? '#e0f2fe'
                                            : '#fee2e2',
                                color: dailyReadingStatus.status === 'completed'
                                    ? '#16a34a'
                                    : dailyReadingStatus.status === 'meter_missing'
                                        ? '#d97706'
                                        : dailyReadingStatus.status === 'due_now'
                                            ? '#0284c7'
                                            : '#dc2626',
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0
                            }}>
                                {dailyReadingStatus.status === 'completed' ? (
                                    <CheckCircle size={20}/>
                                ) : dailyReadingStatus.status === 'meter_missing' ? (
                                    <AlertTriangle size={20}/>
                                ) : (
                                    <Clock size={20}/>
                                )}
                            </div>
                            <div>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap'}}>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        background: dailyReadingStatus.status === 'completed'
                                            ? '#16a34a'
                                            : dailyReadingStatus.status === 'meter_missing'
                                                ? '#d97706'
                                                : dailyReadingStatus.status === 'due_now'
                                                    ? '#0284c7'
                                                    : '#dc2626',
                                        color: '#ffffff',
                                        padding: '2px 7px',
                                        borderRadius: '4px'
                                    }}>
                                        {dailyReadingStatus.badge}
                                    </span>
                                    <b style={{
                                        fontSize: '13px',
                                        color: dailyReadingStatus.status === 'completed'
                                            ? '#15803d'
                                            : dailyReadingStatus.status === 'meter_missing'
                                                ? '#92400e'
                                                : dailyReadingStatus.status === 'due_now'
                                                    ? '#0369a1'
                                                    : '#991b1b',
                                        display: 'inline'
                                    }}>
                                        {dailyReadingStatus.title}
                                    </b>
                                </div>
                                <span style={{
                                    fontSize: '11.5px',
                                    color: dailyReadingStatus.status === 'completed'
                                        ? '#166534'
                                        : dailyReadingStatus.status === 'meter_missing'
                                            ? '#b45309'
                                            : dailyReadingStatus.status === 'due_now'
                                                ? '#075985'
                                                : '#b91c1c'
                                }}>
                                    {dailyReadingStatus.message}
                                </span>
                            </div>
                        </div>

                        {dailyReadingStatus.status === 'completed' ? (
                            <span style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700
                            }}>
                                કમ્પ્લીટ સેવ ✅
                            </span>
                        ) : (
                            <a
                                href="/readings"
                                style={{
                                    background: dailyReadingStatus.status === 'meter_missing'
                                        ? '#ea580c'
                                        : dailyReadingStatus.status === 'due_now'
                                            ? '#0284c7'
                                            : '#dc2626',
                                    color: '#ffffff',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                {dailyReadingStatus.status === 'meter_missing'
                                    ? '➕ મીટર રીડિંગ ભરો'
                                    : dailyReadingStatus.status === 'due_now'
                                        ? '➕ રીડિંગ ભરો'
                                        : '➕ ડેઇલી એન્ટ્રી ભરો'}
                            </a>
                        )}
                    </div>
                )}

                {/* 🚨 Past Days Missing Reading Alert (Shows exact missing dates) */}
                {pastReadingMissing && pastReadingMissing.active && (
                    <div style={{
                        marginBottom: '12px',
                        background: '#fef2f2',
                        border: '1.5px solid #ef4444',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                <div style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    display: 'grid',
                                    placeItems: 'center',
                                    flexShrink: 0
                                }}>
                                    <AlertTriangle size={20}/>
                                </div>
                                <div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px'}}>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            background: '#dc2626',
                                            color: '#ffffff',
                                            padding: '2px 7px',
                                            borderRadius: '4px'
                                        }}>
                                            {pastReadingMissing.badge}
                                        </span>
                                        <b style={{fontSize: '13px', color: '#991b1b'}}>
                                            {pastReadingMissing.title}
                                        </b>
                                    </div>
                                    <span style={{fontSize: '11.5px', color: '#b91c1c'}}>
                                        નીચેની તારીખનું ડેઇલી રીડિંગ સિસ્ટમમાં મળ્યું નથી (ભરવાનું બાકી છે):
                                    </span>
                                </div>
                            </div>
                            <a
                                href="/readings"
                                style={{
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                ➕ બાકી રીડિંગ ભરો
                            </a>
                        </div>

                        {/* List of Missing Past Dates with Company Details */}
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', paddingLeft: '48px'}}>
                            {pastReadingMissing.missing_dates?.map((mDate, dIdx) => (
                                <span key={dIdx} style={{
                                    background: '#ffffff',
                                    border: '1px solid #fca5a5',
                                    color: '#991b1b',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 700
                                }}>
                                    📅 <b>{mDate.date_formatted}</b>: {mDate.companies_label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 🔔 Prolonged Curtailment Reminder Cards */}
                {curtailmentReminders && curtailmentReminders.length > 0 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px'}}>
                        {curtailmentReminders.map((cRem, rIdx) => (
                            <div key={rIdx} style={{
                                background: '#fff7ed',
                                border: '1.5px solid #ea580c',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                    <div style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: '#ffedd5',
                                        color: '#ea580c',
                                        display: 'grid',
                                        placeItems: 'center',
                                        flexShrink: 0
                                    }}>
                                        <AlertTriangle size={20}/>
                                    </div>
                                    <div>
                                        <b style={{fontSize: '13px', color: '#9a3412', display: 'block'}}>
                                            🔔 {cRem.title} ({cRem.company_name})
                                        </b>
                                        <span style={{fontSize: '11.5px', color: '#c2410c'}}>
                                            {cRem.message}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRestoreAll(cRem.company_id)}
                                    style={{
                                        background: '#ea580c',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    🟢 ૧૦૦% પાવર કરો (Restore)
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* 💨 10-Day Routine Inverter Fan & Filter Dust Cleaning Cycle Card */}
                {fanCleaningStatus && (
                    <div style={{
                        marginBottom: '12px',
                        background: fanCleaningStatus.is_overdue ? '#fef2f2' : fanCleaningStatus.is_approaching ? '#fffbeb' : '#f0fdf4',
                        border: fanCleaningStatus.is_overdue ? '1.5px solid #ef4444' : fanCleaningStatus.is_approaching ? '1.5px solid #f59e0b' : '1px solid #86efac',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px', minWidth: '240px'}}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: fanCleaningStatus.is_overdue ? '#fee2e2' : fanCleaningStatus.is_approaching ? '#fef3c7' : '#dcfce7',
                                color: fanCleaningStatus.is_overdue ? '#dc2626' : fanCleaningStatus.is_approaching ? '#d97706' : '#16a34a',
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0
                            }}>
                                <Wind size={20}/>
                            </div>
                            <div>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap'}}>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        background: fanCleaningStatus.is_overdue ? '#dc2626' : fanCleaningStatus.is_approaching ? '#d97706' : '#16a34a',
                                        color: '#ffffff',
                                        padding: '2px 7px',
                                        borderRadius: '4px'
                                    }}>
                                        {fanCleaningStatus.badge}
                                    </span>
                                    <b style={{fontSize: '13px', color: fanCleaningStatus.is_overdue ? '#991b1b' : fanCleaningStatus.is_approaching ? '#92400e' : '#166534'}}>
                                        {fanCleaningStatus.title}
                                    </b>
                                </div>
                                <span style={{fontSize: '11.5px', color: fanCleaningStatus.is_overdue ? '#b91c1c' : fanCleaningStatus.is_approaching ? '#b45309' : '#15803d'}}>
                                    {fanCleaningStatus.message} (છેલ્લી સફાઈ: <b>{fanCleaningStatus.last_cleaned_at}</b>)
                                </span>
                            </div>
                        </div>
                        <div>
                            <button
                                type="button"
                                disabled={cleaningFanLoading}
                                onClick={handleFanCleaned}
                                style={{
                                    background: fanCleaningStatus.is_overdue ? '#dc2626' : '#16a34a',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: cleaningFanLoading ? 'wait' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <Check size={14}/>
                                {cleaningFanLoading ? 'નોંધાઈ રહ્યું છે...' : '✅ ફેન સાફ થઈ ગયો (Done)'}
                            </button>
                        </div>
                    </div>
                )}

                {/* 🔌 PGVCL / DISCOM Grid Outage & Power Loss Tracker Card */}
                {gridDowntime && (
                    <div style={{
                        marginBottom: '12px',
                        background: gridDowntime.is_down ? '#fef2f2' : '#f0fdf4',
                        border: gridDowntime.is_down ? '1.5px solid #ef4444' : '1px solid #86efac',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px', minWidth: '240px'}}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: gridDowntime.is_down ? '#fee2e2' : '#dcfce7',
                                color: gridDowntime.is_down ? '#dc2626' : '#16a34a',
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0
                            }}>
                                <Zap size={20}/>
                            </div>
                            <div>
                                <b style={{fontSize: '13px', color: gridDowntime.is_down ? '#991b1b' : '#166534', display: 'block'}}>
                                    {gridDowntime.title || (gridDowntime.is_down ? '🚨 PGVCL લાઈટ કપાત ચાલુ છે' : '⚡ PGVCL ગ્રીડ પાવર સામાન્ય છે')}
                                </b>
                                <span style={{fontSize: '11.5px', color: gridDowntime.is_down ? '#b91c1c' : '#15803d'}}>
                                    {gridDowntime.message}
                                </span>
                            </div>
                        </div>

                        {gridDowntime.is_down && (
                            <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                <span style={{background: '#dc2626', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px'}}>
                                    -{gridDowntime.lost_units_kwh} kWh
                                </span>
                                <span style={{background: '#991b1b', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px'}}>
                                    -₹{gridDowntime.lost_revenue_rs}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* 🚨 Severe High Wind Storm Damage Warning Alert Banner */}
                {weather.storm_alert && weather.storm_alert.active && (
                    <div className="weather-storm-banner" style={{marginBottom: '10px'}}>
                        <div className="weather-storm-head">
                            <span className="weather-storm-tag">
                                <Wind size={13}/> 🚨 તેજ પવન & વાવાઝોડું એલર્ટ (Wind Damage Warning)
                            </span>
                            <span className="weather-storm-speed">
                                ઝડપ: {weather.storm_alert.wind_speed} (ઝાટકા: {weather.storm_alert.wind_gusts})
                            </span>
                        </div>
                        <p className="weather-storm-msg">
                            {weather.storm_alert.message}
                        </p>
                    </div>
                )}

                {/* 🔍 Inverter Underperformance Alert Cards */}
                {underperformingInverters.length > 0 && (
                    <div className="underperf-inverters-list" style={{marginBottom: '10px'}}>
                        {underperformingInverters.map((uInv, uIdx) => (
                            <div key={uIdx} className="underperf-inverter-card">
                                <div className="underperf-card-head">
                                    <div className="underperf-title">
                                        <TrendingDown size={15} style={{color: '#dc2626'}}/>
                                        <b>{uInv.title}</b>
                                    </div>
                                    <span className="underperf-loss-chip">
                                        -{uInv.diff_kwh} kWh (₹{uInv.loss_rs} લોસ)
                                    </span>
                                </div>
                                <div className="underperf-stats-row">
                                    <span>આજનું જનરેશન: <b>{uInv.today_kwh} kWh</b></span>
                                    <span>સામાન્ય એવરેજ: <b>{uInv.benchmark_kwh} kWh</b></span>
                                    <span>ઓછું: <b style={{color: '#dc2626'}}>-{uInv.diff_pct}%</b></span>
                                </div>
                                <p className="underperf-advice">💡 <b>સલાહ:</b> {uInv.advice}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* 🌧️ Advance Rain Forecast & Start/Stop Time Banner */}
                {rainAlert && rainAlert.active && (
                    <div className="rain-advance-banner" style={{
                        marginBottom: '10px',
                        background: rainAlert.status === 'raining_now' ? '#eff6ff' : '#f0f9ff',
                        border: rainAlert.status === 'raining_now' ? '1px solid #60a5fa' : '1px solid #bae6fd',
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                            <span className="rain-pill" style={{
                                background: rainAlert.status === 'raining_now' ? '#2563eb' : '#0284c7'
                            }}>
                                {rainAlert.status === 'raining_now' ? 'વરસાદ ચાલુ છે' : 'વરસાદની આગાહી'}
                            </span>
                            <CloudRain size={18} className="weather-rain-icon" style={{color: '#1d4ed8'}}/>
                            <span style={{fontSize: '12.5px', color: '#1e3a8a', fontWeight: 600}}>
                                <b>{rainAlert.title}:</b> {rainAlert.message}
                            </span>
                        </div>
                        <div style={{display: 'flex', gap: '14px', fontSize: '11.5px', color: '#1e40af', fontWeight: 700, marginTop: '4px', paddingLeft: '26px'}}>
                            <span>શરૂઆત: <b>{rainAlert.start_time}</b></span>
                            <span>રોકાવાનો અંદાજ (Stop Time): <b>{rainAlert.stop_time}</b></span>
                            <span>શક્યતા: <b>{rainAlert.probability}%</b></span>
                        </div>
                    </div>
                )}

                {/* 🚿 Smart Seasonal / Dew / Soiling / Zero Current Notices */}
                {cleaningAlerts.length > 0 ? (
                    <div className="cleaning-alert-list-stacked" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {cleaningAlerts.map((alert, idx) => (
                            <div key={idx} style={{
                                background: alert.type === 'winter_dew' ? '#f0f9ff' : alert.type === 'zero_current' ? '#fef2f2' : alert.type === 'inverter_overheat' ? '#fff1f2' : '#fffbeb',
                                border: alert.type === 'winter_dew' ? '1.5px solid #38bdf8' : alert.type === 'zero_current' ? '1.5px solid #ef4444' : alert.type === 'inverter_overheat' ? '1.5px solid #f43f5e' : '1.5px solid #f59e0b',
                                borderRadius: '12px',
                                padding: '14px 16px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '6px'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        <span style={{
                                            background: alert.type === 'winter_dew' ? '#0284c7' : alert.type === 'zero_current' ? '#dc2626' : alert.type === 'inverter_overheat' ? '#e11d48' : '#d97706',
                                            color: '#ffffff',
                                            fontWeight: 800,
                                            fontSize: '11px',
                                            padding: '3px 8px',
                                            borderRadius: '6px'
                                        }}>
                                            {alert.badge || '⚠️ લાઈવ નોટિસ'}
                                        </span>
                                        <b style={{fontSize: '13px', color: '#0f172a'}}>🏢 {alert.company_name}</b>
                                    </div>
                                    {alert.inverter_name && (
                                        <span style={{fontSize: '12px', color: '#475569', fontWeight: 700}}>
                                            ⚡ {alert.inverter_name} {alert.string_label ? `· 🛑 ${alert.string_label}` : ''}
                                        </span>
                                    )}
                                </div>
                                
                                <p style={{margin: '0 0 8px', fontSize: '13px', color: '#1e293b', lineHeight: 1.5, fontWeight: 600}}>
                                    "{alert.message || alert.title}"
                                </p>

                                {alert.type === 'inverter_overheat' && (
                                    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', marginTop: '4px'}}>
                                        <span style={{background: '#ffe4e6', color: '#be123c', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fecdd3', fontWeight: 700}}>
                                            🌡️ અંદાજિત હીટ: {alert.temp_c}°C
                                        </span>
                                        <span style={{background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fde68a', fontWeight: 700}}>
                                            ⚡ લોડ: {alert.load_pct}% ({alert.live_kw} kW)
                                        </span>
                                        <span style={{background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fca5a5', fontWeight: 700}}>
                                            ⚠️ સાઇટ ચેકલિસ્ટ: કૂલિંગ ફેન અને ફિલ્ટર જાળી બ્લોઅરથી સાફ કરો
                                        </span>
                                    </div>
                                )}

                                {alert.healthy_avg > 0 && alert.worst_current !== undefined && (
                                    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px'}}>
                                        <span style={{background: '#ecfdf5', color: '#166534', padding: '3px 8px', borderRadius: '4px', border: '1px solid #86efac', fontWeight: 700}}>
                                            સામાન્ય કરંટ: {alert.healthy_avg} Amps
                                        </span>
                                        <span style={{background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fca5a5', fontWeight: 700}}>
                                            {alert.string_label || 'ખામીવાળો'} કરંટ: {alert.worst_current} Amps ({alert.drop_pct || 50}% પાવર ડ્રોપ)
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="cleaning-ok-banner">
                        <CheckCircle size={18} style={{color: '#16a34a'}}/>
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

            {/* 2. SECOND: Live Solar Generation & Real-Time Flow */}
            
            {/* Generation Predictions Row (Upcoming 1 Hour & Accurate EOD Total & Irradiance & Heat Loss) */}
            <div className="prediction-chips-row">
                <div className="prediction-chip prediction-chip-full">
                    <div className="prediction-chip-header">
                        <div className="prediction-chip-left">
                            <div className="prediction-chip-icon">
                                <Zap size={15}/>
                            </div>
                            <div className="prediction-chip-text">
                                <small>1-HOUR FORECAST ({predictions.time_window || 'Next 60m'})</small>
                                <b>Upcoming Generation · {predictions.date || 'Today'}</b>
                            </div>
                        </div>
                        <div className="prediction-chip-val">
                            {predictions.next_1h_kwh || '0.00'} <span>kWh</span>
                        </div>
                    </div>

                    {/* Company-wise 1-Hour Unit Breakdown */}
                    {predictions.companies && predictions.companies.length > 0 && (
                        <div className="prediction-companies-breakdown">
                            {predictions.companies.map(cp => (
                                <span key={cp.company_id} className="pred-company-pill">
                                    <span>{cp.company_name.replace(' Green Energy', '').replace(' Solar', '')}:</span>
                                    <b>{cp.next_1h_kwh} kWh</b>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="prediction-chip">
                    <div className="prediction-chip-left">
                        <div className="prediction-chip-icon eod">
                            <TrendingUp size={15}/>
                        </div>
                        <div className="prediction-chip-text">
                            <small>EOD ESTIMATE (ACCURATE BELL-CURVE)</small>
                            <b>Sunset ({predictions.eod_target_time ? predictions.eod_target_time.replace(' (Sunset)', '') : '06:30 PM'})</b>
                        </div>
                    </div>
                    <div className="prediction-chip-val">
                        {predictions.eod_units_kwh || '0.00'} <span>kWh</span>
                    </div>
                </div>

                <div className="prediction-chip">
                    <div className="prediction-chip-left">
                        <div className="prediction-chip-icon" style={{background: '#fef3c7', color: '#d97706'}}>
                            <Sun size={15}/>
                        </div>
                        <div className="prediction-chip-text">
                            <small>IRRADIANCE</small>
                            <b>Solar Intensity</b>
                        </div>
                    </div>
                    <div className="prediction-chip-val">
                        {predictions.irradiance_w_m2 !== undefined && predictions.irradiance_w_m2 !== null ? predictions.irradiance_w_m2 : 0} <span>W/m²</span>
                    </div>
                </div>

                {/* 🌡️ Temperature & Heat Loss Prediction Chip */}
                {predictions.heat_loss_pct !== undefined && (
                    <div className="prediction-chip">
                        <div className="prediction-chip-left">
                            <div className="prediction-chip-icon" style={{background: '#fee2e2', color: '#dc2626'}}>
                                <Thermometer size={15}/>
                            </div>
                            <div className="prediction-chip-text">
                                <small>HEAT EFFICIENCY LOSS</small>
                                <b>Cell Temp: ~{weather.heat_loss?.cell_temp_c || 50}°C</b>
                            </div>
                        </div>
                        <div className="prediction-chip-val" style={{color: '#dc2626'}}>
                            -{predictions.heat_loss_pct}% <span>({predictions.heat_loss_kw || 0} kW)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 📊 Hourly Generation Forecast Timeline (Horizon Bar for Today's Remaining Sun Hours) */}
            {predictions.hourly_forecast && predictions.hourly_forecast.length > 0 && (
                <div className="hourly-forecast-strip">
                    <div className="hourly-forecast-head">
                        <div className="hourly-forecast-title">
                            <Sparkles size={14} style={{color: '#0284c7'}}/>
                            <b>કલાકવાર ઉત્પાદન અંદાજ (Hourly Generation Forecast)</b>
                        </div>
                        <span className="hourly-forecast-sub">સૂર્યાસ્ત સુધીનું અનુમાન</span>
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


            {/* Main iSolarCloud Real-Time Flow Visualizer Card (3D Isometric Animation matching official app) */}
            <ISolarCloudVisualizer data={data} weather={weather} isEmployee={isEmployee} />

            {/* Bottom Company-Wise Inverter Status Cards with PV String View */}
            <div className="company-inverter-grid">
                {companies.map(comp => (
                    <article key={comp.company_id} className="company-live-card">
                        <div className="company-live-card-header">
                            <div>
                                <h3>{comp.company_name}</h3>
                                <span className="company-online-pill">
                                    {comp.online_count} / {comp.total_count} Inverters Online
                                </span>
                            </div>
                            <div className="company-header-totals">
                                <div className="total-kwh">{comp.total_today_kwh} kWh</div>
                                <div className="total-kw">{comp.total_live_kw} kW Live</div>
                                {!isEmployee && comp.today_revenue_rs && (
                                    <div className="company-revenue-pill">₹ {comp.today_revenue_rs}</div>
                                )}
                            </div>
                        </div>

                        <div className="inverter-status-list">
                            {comp.inverters?.map(inv => {
                                const isExpanded = expandedInverters[inv.id];
                                const hasAlert = (inv.cleaning_alerts && inv.cleaning_alerts.length > 0);

                                return (
                                    <div key={inv.id} className="inverter-status-row">
                                        <div className="inverter-status-row-main">
                                            <div className="inverter-info-left">
                                                <span className={`inverter-status-dot ${inv.online ? '' : 'offline'}`}/>
                                                <div className="inverter-name-sn">
                                                    <b>
                                                        {inv.name}
                                                        {hasAlert && <span style={{color: '#dc2626', marginLeft: '5px', fontSize: '11px'}}>⚠️ સફાઈ</span>}
                                                        {inv.estimated_temp_c !== null && inv.estimated_temp_c !== undefined && (
                                                            <span style={{
                                                                color: inv.estimated_temp_c >= 64 ? '#dc2626' : '#d97706',
                                                                marginLeft: '6px',
                                                                fontSize: '11px',
                                                                fontWeight: 700
                                                            }}>
                                                                🌡️ {inv.estimated_temp_c}°C
                                                            </span>
                                                        )}
                                                    </b>
                                                    <small>SN: {inv.serial_number}</small>
                                                </div>
                                            </div>
                                            <div className="inverter-power-right">
                                                <div>
                                                    <div className="inv-kwh">{inv.today_kwh} kWh</div>
                                                    <div className="inv-kw">{inv.live_kw} kW</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="pv-toggle-btn"
                                                    onClick={() => toggleInverterPv(inv.id)}
                                                    title="View PV String currents"
                                                >
                                                    PV {isExpanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expandable PV String 1 to 16 Live Current Matrix */}
                                        {isExpanded && inv.pv_strings && (
                                            <div className="pv-strings-container">
                                                <div className="pv-strings-header">
                                                    <span>PV String Live Currents (A)</span>
                                                    <span>Point IDs: 70 - 85</span>
                                                </div>
                                                <div className="pv-strings-grid">
                                                    {inv.pv_strings.map(pv => {
                                                        const isCrit = pv.status === 'critical_cleaning';
                                                        const isConn = pv.is_connected;
                                                        const cellClass = isCrit ? 'critical' : (isConn ? 'connected' : 'offline');

                                                        return (
                                                            <div key={pv.string_num} className={`pv-string-cell ${cellClass}`}>
                                                                <span className="pv-lbl">
                                                                    {pv.string_label}
                                                                    {isCrit && ' ⚠️'}
                                                                </span>
                                                                <span className="pv-val">
                                                                    {pv.current_a.toFixed(2)} A
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
                    </article>
                ))}
            </div>

            {/* Plant Location Setting Modal */}
            {showLocationModal && (
                <div className="solar-modal-backdrop" onClick={() => setShowLocationModal(false)}>
                    <div className="solar-compact-modal" onClick={e => e.stopPropagation()}>
                        <div className="solar-modal-head">
                            <h3>
                                <MapPin size={18} style={{color: '#ef4444'}}/>
                                Common Plant Location (3 Plants)
                            </h3>
                            <button
                                type="button"
                                className="icon-button ghost"
                                onClick={() => setShowLocationModal(false)}
                            >
                                <X size={18}/>
                            </button>
                        </div>
                        <form onSubmit={handleSaveLocation}>
                            <div className="solar-modal-body">
                                <p style={{fontSize: '12px', color: '#64748b', margin: 0}}>
                                    All 3 companies (Sunrise, Rajeshwari, Nilkanth) are located at this location. Updating here will set the live weather, predictions, and irradiance for all 3 plants.
                                </p>
                                
                                <div>
                                    <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px'}}>
                                        City / Plant Location Name
                                    </label>
                                    <input
                                        type="text"
                                        value={locForm.plant_location}
                                        onChange={e => setLocForm({...locForm, plant_location: e.target.value})}
                                        required
                                        style={{width: '100%'}}
                                    />
                                </div>

                                {/* Quick Presets for Gujarat Cities */}
                                <div>
                                    <label style={{display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px'}}>
                                        Quick Select Location:
                                    </label>
                                    <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                        <button
                                            type="button"
                                            className="secondary"
                                            style={{fontSize: '11px', padding: '3px 8px'}}
                                            onClick={() => selectCityPreset('Sarva, Botad', 22.1704, 71.6684)}
                                        >
                                            Sarva, Botad
                                        </button>
                                        <button
                                            type="button"
                                            className="secondary"
                                            style={{fontSize: '11px', padding: '3px 8px'}}
                                            onClick={() => selectCityPreset('Botad, Gujarat', 22.1704, 71.6684)}
                                        >
                                            Botad
                                        </button>
                                        <button
                                            type="button"
                                            className="secondary"
                                            style={{fontSize: '11px', padding: '3px 8px'}}
                                            onClick={() => selectCityPreset('Rajkot, Gujarat', 22.3039, 70.8022)}
                                        >
                                            Rajkot
                                        </button>
                                        <button
                                            type="button"
                                            className="secondary"
                                            style={{fontSize: '11px', padding: '3px 8px'}}
                                            onClick={() => selectCityPreset('Ahmedabad, Gujarat', 23.0225, 72.5714)}
                                        >
                                            Ahmedabad
                                        </button>
                                    </div>
                                </div>

                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                                    <div>
                                        <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px'}}>
                                            Latitude
                                        </label>
                                        <input
                                            type="number"
                                            step="0.000001"
                                            value={locForm.latitude}
                                            onChange={e => setLocForm({...locForm, latitude: e.target.value})}
                                            required
                                            style={{width: '100%'}}
                                        />
                                    </div>
                                    <div>
                                        <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px'}}>
                                            Longitude
                                        </label>
                                        <input
                                            type="number"
                                            step="0.000001"
                                            value={locForm.longitude}
                                            onChange={e => setLocForm({...locForm, longitude: e.target.value})}
                                            required
                                            style={{width: '100%'}}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={detectGpsLocation}
                                    style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', justifyContent: 'center'}}
                                >
                                    <Crosshair size={14}/>
                                    Auto-Detect My Current GPS Location
                                </button>

                                {locMessage && (
                                    <div style={{
                                        fontSize: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        background: locMessage.includes('successfully') ? '#ecfdf5' : '#fef2f2',
                                        color: locMessage.includes('successfully') ? '#065f46' : '#991b1b',
                                        border: locMessage.includes('successfully') ? '1px solid #a7f3d0' : '1px solid #fecaca',
                                    }}>
                                        {locMessage}
                                    </div>
                                )}
                            </div>
                            <div className="solar-modal-foot">
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => setShowLocationModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary"
                                    disabled={locSaving}
                                >
                                    {locSaving ? 'Saving...' : 'Save Location'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ⚡ PGVCL Curtailment Setup / Step-Update Modal */}
            {showCurtailModal && (
                <div className="solar-modal-backdrop" onClick={() => setShowCurtailModal(false)}>
                    <div className="solar-compact-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '480px'}}>
                        <div className="solar-modal-head" style={{background: '#fff7ed', borderBottom: '1px solid #fed7aa'}}>
                            <h3 style={{color: '#9a3412', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <Power size={18} style={{color: '#ea580c'}}/>
                                PGVCL પાવર કર્ટલમેન્ટ સેટિંગ
                            </h3>
                            <button
                                type="button"
                                className="icon-button ghost"
                                onClick={() => setShowCurtailModal(false)}
                            >
                                <X size={18}/>
                            </button>
                        </div>
                        <form onSubmit={handleSaveCurtailment}>
                            <div className="solar-modal-body" style={{padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
                                <div>
                                    <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px'}}>
                                        કંપની / પ્લાન્ટ પસંદ કરો
                                    </label>
                                    <select
                                        value={curtailForm.company_id}
                                        onChange={e => {
                                            const cId = e.target.value;
                                            const comp = companies.find(c => String(c.company_id) === String(cId));
                                            const allInvs = comp?.inverters?.map(i => i.id) || [];
                                            setCurtailForm(prev => ({
                                                ...prev,
                                                company_id: cId,
                                                inverter_ids: allInvs,
                                            }));
                                        }}
                                        required
                                        style={{width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px'}}
                                    >
                                        <option value="">-- કંપની પસંદ કરો --</option>
                                        {companies.map(c => (
                                            <option key={c.company_id} value={c.company_id}>
                                                {c.company_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Curtailment Percentage Selection */}
                                <div>
                                    <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px'}}>
                                        કેટલા ટકા (%) કર્ટલમેન્ટ કરવું છે?
                                    </label>
                                    <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px'}}>
                                        {[80, 50, 40, 30, 25, 22, 20, 15, 10, 5].map(pct => (
                                            <button
                                                key={pct}
                                                type="button"
                                                onClick={() => setCurtailForm({...curtailForm, percentage: pct})}
                                                style={{
                                                    fontSize: '12px',
                                                    padding: '5px 12px',
                                                    borderRadius: '6px',
                                                    border: Number(curtailForm.percentage) === pct ? '2px solid #ea580c' : '1px solid #cbd5e1',
                                                    background: Number(curtailForm.percentage) === pct ? '#ffedd5' : '#ffffff',
                                                    color: Number(curtailForm.percentage) === pct ? '#c2410c' : '#334155',
                                                    fontWeight: Number(curtailForm.percentage) === pct ? 800 : 500,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {pct}%
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={curtailForm.percentage}
                                            onChange={e => setCurtailForm({...curtailForm, percentage: Math.min(100, Math.max(1, parseInt(e.target.value) || 0))})}
                                            required
                                            style={{width: '90px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700}}
                                        />
                                        <span style={{fontSize: '13px', fontWeight: 700, color: '#475569'}}>% ક્ષમતા બંધ રાખવી</span>
                                    </div>
                                </div>

                                {/* String / Inverter Checkbox Selection */}
                                <div>
                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px'}}>
                                        <label style={{fontSize: '12px', fontWeight: 700, color: '#334155', margin: 0}}>
                                            કઈ PV સ્ટ્રિંગ્સ બંધ રાખવી છે?
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (curtailForm.pv_strings?.length === 16) {
                                                    setCurtailForm({...curtailForm, pv_strings: []});
                                                } else {
                                                    const all = [];
                                                    for (let s = 1; s <= 16; s++) all.push('PV' + s);
                                                    setCurtailForm({...curtailForm, pv_strings: all});
                                                }
                                            }}
                                            style={{fontSize: '11px', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0}}
                                        >
                                            {curtailForm.pv_strings?.length === 16 ? 'બધી અનચેક કરો' : 'બધી પસંદ કરો (All 16)'}
                                        </button>
                                    </div>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(4, 1fr)',
                                        gap: '6px',
                                        background: '#f8fafc',
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        maxHeight: '120px',
                                        overflowY: 'auto'
                                    }}>
                                        {Array.from({length: 16}, (_, i) => 'PV' + (i + 1)).map(pvTag => {
                                            const isChecked = curtailForm.pv_strings?.includes(pvTag);
                                            return (
                                                <label
                                                    key={pvTag}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: isChecked ? '#ea580c' : '#64748b',
                                                        cursor: 'pointer',
                                                        background: isChecked ? '#fff7ed' : '#ffffff',
                                                        padding: '4px 6px',
                                                        borderRadius: '5px',
                                                        border: isChecked ? '1px solid #fdba74' : '1px solid #e2e8f0'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={e => {
                                                            const checked = e.target.checked;
                                                            setCurtailForm(prev => {
                                                                const current = prev.pv_strings || [];
                                                                const next = checked ? [...current, pvTag] : current.filter(t => t !== pvTag);
                                                                return {...prev, pv_strings: next};
                                                            });
                                                        }}
                                                    />
                                                    {pvTag}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Notes / Reason */}
                                <div>
                                    <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px'}}>
                                        કારણ / PGVCL ઓર્ડર વિગત
                                    </label>
                                    <input
                                        type="text"
                                        value={curtailForm.notes}
                                        onChange={e => setCurtailForm({...curtailForm, notes: e.target.value})}
                                        placeholder="દા.ત. PGVCL Order - High Grid Power / Substation Call"
                                        style={{width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px'}}
                                    />
                                </div>

                                {curtailMessage && (
                                    <div style={{
                                        fontSize: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        background: curtailMessage.includes('સફળતાપૂર્વક') ? '#ecfdf5' : '#fef2f2',
                                        color: curtailMessage.includes('સફળતાપૂર્વક') ? '#065f46' : '#991b1b',
                                        border: curtailMessage.includes('સફળતાપૂર્વક') ? '1px solid #a7f3d0' : '1px solid #fecaca',
                                    }}>
                                        {curtailMessage}
                                    </div>
                                )}
                            </div>

                            <div className="solar-modal-foot" style={{padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => setShowCurtailModal(false)}
                                    style={{fontSize: '12px', padding: '6px 12px'}}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary"
                                    disabled={curtailSaving || !curtailForm.company_id}
                                    style={{
                                        background: '#ea580c',
                                        borderColor: '#ea580c',
                                        fontSize: '12px',
                                        padding: '6px 14px',
                                        fontWeight: 700
                                    }}
                                >
                                    {curtailSaving ? 'લાગુ થઈ રહ્યું છે...' : '⚡ PGVCL કર્ટલમેન્ટ લાગુ કરો'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 📜 PGVCL Curtailment History & Cumulative Loss Modal */}
            {showCurtailHistory && (
                <div className="solar-modal-backdrop" onClick={() => setShowCurtailHistory(false)}>
                    <div className="solar-compact-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '680px'}}>
                        <div className="solar-modal-head" style={{background: '#f8fafc', borderBottom: '1px solid #e2e8f0'}}>
                            <h3 style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a'}}>
                                <History size={18} style={{color: '#0284c7'}}/>
                                PGVCL કર્ટલમેન્ટ & પાવર લોસ હિસાબ (History Logs)
                            </h3>
                            <button
                                type="button"
                                className="icon-button ghost"
                                onClick={() => setShowCurtailHistory(false)}
                            >
                                <X size={18}/>
                            </button>
                        </div>

                        <div className="solar-modal-body" style={{padding: '14px', maxHeight: '65vh', overflowY: 'auto'}}>
                            {historyLoading ? (
                                <div style={{padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px'}}>
                                    ઇતિહાસ લોડ થઈ રહ્યો છે...
                                </div>
                            ) : historyList.length === 0 ? (
                                <div style={{padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px'}}>
                                    અત્યાર સુધી કોઈ પાછલો કર્ટલમેન્ટ રેકોર્ડ નથી.
                                </div>
                            ) : (
                                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                    {historyList.map((hItem, hIdx) => (
                                        <div key={hIdx} style={{
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '10px 12px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '4px'}}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                                    <span style={{
                                                        background: '#e0f2fe',
                                                        color: '#0369a1',
                                                        fontWeight: 800,
                                                        fontSize: '11px',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        {hItem.percentage}%
                                                    </span>
                                                    <b style={{fontSize: '12.5px', color: '#0f172a'}}>🏢 {hItem.company_name}</b>
                                                </div>
                                                <span style={{fontSize: '11px', color: '#64748b', fontWeight: 600}}>
                                                    📅 {hItem.date} ({hItem.started_at_human} થી {hItem.ended_at_human})
                                                </span>
                                            </div>

                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '11.5px', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #f1f5f9'}}>
                                                <div style={{display: 'flex', gap: '10px', color: '#475569'}}>
                                                    <span>સમયગાળો: <b>{hItem.duration_human}</b></span>
                                                    <span>યુઝર: <b>{hItem.user_name}</b></span>
                                                </div>
                                                <div style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
                                                    <span style={{background: '#fef2f2', color: '#dc2626', padding: '2px 7px', borderRadius: '4px', fontWeight: 800}}>
                                                        -{hItem.lost_kwh} kWh
                                                    </span>
                                                    <span style={{background: '#fee2e2', color: '#991b1b', padding: '2px 7px', borderRadius: '4px', fontWeight: 800}}>
                                                        -₹{hItem.lost_revenue_rs}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="solar-modal-foot" style={{padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end'}}>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => setShowCurtailHistory(false)}
                                style={{fontSize: '12px', padding: '5px 12px'}}
                            >
                                બંધ કરો (Close)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
