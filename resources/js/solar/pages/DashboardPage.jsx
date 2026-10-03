import React, {useEffect, useRef, useState} from 'react';
import {Activity, AlertTriangle, Bell, CheckCircle, ChevronDown, ChevronUp, Cloud, CloudLightning, CloudRain, Crosshair, DollarSign, Droplets, Factory, Home, MapPin, RefreshCw, ShieldAlert, Sparkles, Sun, Thermometer, TrendingDown, TrendingUp, Wind, X, Zap} from 'lucide-react';
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

            {/* 1. FIRST: Top Dashboard Notifications & Smart Diagnostic Center */}
            <section className="cleaning-alert-section">
                <div className="cleaning-section-header">
                    <div className="cleaning-head-left">
                        <h3>
                            <span style={{color: '#d97706'}}>⚠️</span>
                            પ્લાન્ટ સ્માર્ટ ડાયગ્નોસ્ટિક & સફાઈ એલર્ટ
                            {(cleaningAlerts.length > 0 || underperformingInverters.length > 0 || gridDowntime?.is_down) && (
                                <span className="cleaning-head-badge">
                                    🔴 {cleaningAlerts.length + underperformingInverters.length + (gridDowntime?.is_down ? 1 : 0)} ચેતવણી
                                </span>
                            )}
                        </h3>
                        <p className="cleaning-head-subtitle">
                            નબળા ઇન્વર્ટર, પાવર લોસ, ગ્રીડ ટ્રીપિંગ અને ધૂળનું ઓટોમેટિક AI નિદાન
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
                                background: alert.type === 'winter_dew' ? '#f0f9ff' : alert.type === 'zero_current' ? '#fef2f2' : '#fffbeb',
                                border: alert.type === 'winter_dew' ? '1.5px solid #38bdf8' : alert.type === 'zero_current' ? '1.5px solid #ef4444' : '1.5px solid #f59e0b',
                                borderRadius: '12px',
                                padding: '14px 16px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '6px'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        <span style={{
                                            background: alert.type === 'winter_dew' ? '#0284c7' : alert.type === 'zero_current' ? '#dc2626' : '#d97706',
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
        </div>
    );
}
