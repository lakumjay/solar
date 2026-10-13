import React, { useEffect, useState } from 'react';
import {
    Phone,
    PhoneOff,
    Zap,
    AlertTriangle,
    Clock,
    UserCheck,
    LogOut,
    Building2,
    CheckCircle,
    X,
    Wrench,
    ShieldAlert
} from 'lucide-react';
import { api } from '../api';
import { useTranslation } from '../context/LanguageContext';

const AUTO_CALL_RULES = [
    {
        key: 'inverter_shutdown',
        icon: Zap,
        iconBg: '#fef2f2',
        iconColor: '#dc2626',
        badgeGu: '⚡ પ્લાન્ટ / ઇન્વર્ટર',
        badgeEn: '⚡ Plant / Inverter',
        titleGu: 'ઇન્વર્ટર બંધ એલર્ટ કૉલ (Inverter Shutdown)',
        titleEn: 'Inverter Shutdown Alert Call',
        descGu: 'જ્યારે કોઈ કંપનીનું ઇન્વર્ટર બંધ થાય (0 kW) ત્યારે કંપનીના ઓનર અને સુપર એડમિનને જતો કૉલ. (પ્લાન્ટમાં કામ ચાલુ હોય કે જાતે બંધ કરો ત્યારે આ OFF રાખો)',
        descEn: 'Calls Company Founder & Super Admin when an inverter goes offline or drops to 0 kW. Turn OFF before manual plant work.',
        targetGu: 'કંપની ઓનર + સુપર એડમિન',
        targetEn: 'Company Owner + Super Admin'
    },
    {
        key: 'grid_66kv_tripping',
        icon: ShieldAlert,
        iconBg: '#fff7ed',
        iconColor: '#ea580c',
        badgeGu: '🚨 ૬૬KV સબસ્ટેશન',
        badgeEn: '🚨 66KV Substation',
        titleGu: '૬૬KV લાઇન ટ્રીપ ઇમરજન્સી કૉલ',
        titleEn: '66KV Substation Line Trip Call',
        descGu: 'જ્યારે ૬૬KV સબસ્ટેશન લાઇન ટ્રીપ થાય અથવા આખા પ્લાન્ટનું ઉત્પાદન ૦ kW થઈ જાય ત્યારે જતો ઇમરજન્સી કૉલ.',
        descEn: 'Emergency call when 66KV grid line trips or total plant generation drops to 0 kW.',
        targetGu: 'સુપર એડમિન',
        targetEn: 'Super Admin'
    },
    {
        key: 'employee_missing_clock_in',
        icon: UserCheck,
        iconBg: '#eff6ff',
        iconColor: '#2563eb',
        badgeGu: '⏰ સવારે ૯:૩૦+',
        badgeEn: '⏰ Morning 9:30+',
        titleGu: 'સવારની હાજરી (Clock-In) બાકી કૉલ',
        titleEn: 'Morning Missing Clock-In Call',
        descGu: 'સવારે શિફ્ટ શરૂ થયા પછી કર્મચારીએ એપમાં હાજરી (Clock-In) ન પૂરી હોય ત્યારે કર્મચારીને જતો રિમાઇન્ડર કૉલ.',
        descEn: 'Reminds employees if they have not clocked in after shift start time.',
        targetGu: 'કર્મચારી (Employee)',
        targetEn: 'Employee'
    },
    {
        key: 'attendance_pending_4pm',
        icon: Clock,
        iconBg: '#fefce8',
        iconColor: '#ca8a04',
        badgeGu: '🕓 સાંજે ૪:૦૦ PM',
        badgeEn: '🕓 4:00 PM Alert',
        titleGu: 'સાંજે ૪:૦૦ વાગ્યે હાજરી બાકી કૉલ',
        titleEn: '4:00 PM Pending Attendance Call',
        descGu: 'સાંજના ૪ વાગ્યા સુધી કોઈ કર્મચારીની હાજરી બાકી હોય ત્યારે કર્મચારી અને એડમિનને જતો કૉલ.',
        descEn: 'Calls employee and admins at 4:00 PM if daily attendance is still not marked.',
        targetGu: 'કર્મચારી + એડમિન',
        targetEn: 'Employee + Admins'
    },
    {
        key: 'employee_logout_630pm',
        icon: LogOut,
        iconBg: '#f0fdf4',
        iconColor: '#16a34a',
        badgeGu: '🕡 સાંજે ૬:૩૦ PM',
        badgeEn: '🕡 6:30 PM Reminder',
        titleGu: 'સાંજે ૬:૩૦ વાગ્યે લોગઆઉટ (Clock-Out) કૉલ',
        titleEn: '6:30 PM Logout (Clock-Out) Reminder Call',
        descGu: 'સાંજે ૬:૩૦ વાગ્યે ઘરે જતી વખતે એપમાં લોગઆઉટ કરવાનું બાકી હોય ત્યારે કર્મચારીને જતો કૉલ.',
        descEn: 'Reminds clocked-in employees at 6:30 PM to complete their daily Clock-Out.',
        targetGu: 'કર્મચારી (Employee)',
        targetEn: 'Employee'
    },
    {
        key: 'employee_logout_700pm',
        icon: AlertTriangle,
        iconBg: '#fdf2f8',
        iconColor: '#db2777',
        badgeGu: '🚨 સાંજે ૭:૦૦ PM',
        badgeEn: '🚨 7:00 PM Urgent',
        titleGu: 'સાંજે ૭:૦૦ વાગ્યે અર્જન્ટ લોગઆઉટ કૉલ',
        titleEn: '7:00 PM Urgent Logout Call (30m Later)',
        descGu: '૬:૩૦ ના રિમાઇન્ડર પછી ૩૦ મિનિટ વીતી ગઈ હોય અને હજુ લોગઆઉટ ન કર્યું હોય ત્યારે જતો અર્જન્ટ કૉલ.',
        descEn: 'Urgent follow-up call at 7:00 PM if employee still has not clocked out.',
        targetGu: 'કર્મચારી (Employee)',
        targetEn: 'Employee'
    }
];

export default function ManageAiCallsModal({ isOpen, onClose, companies = [], onSettingsUpdated }) {
    const { lang: currentLang } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState(null);
    const [savedToast, setSavedToast] = useState('');
    const [companyList, setCompanyList] = useState([]);
    const [settings, setSettings] = useState({
        master_enabled: true,
        inverter_shutdown: true,
        grid_66kv_tripping: true,
        employee_missing_clock_in: true,
        attendance_pending_4pm: true,
        employee_logout_630pm: true,
        employee_logout_700pm: true,
        muted_company_ids: [],
        maintenance_note: '',
        updated_at: null,
        updated_by: null
    });

    useEffect(() => {
        if (!isOpen) return;
        let mounted = true;
        setLoading(true);
        api('voice-agent/call-settings')
            .then(res => {
                if (!mounted) return;
                if (res?.settings) {
                    setSettings(prev => ({ ...prev, ...res.settings }));
                }
                if (Array.isArray(res?.companies) && res.companies.length > 0) {
                    setCompanyList(res.companies);
                } else if (Array.isArray(companies) && companies.length > 0) {
                    setCompanyList(companies.filter(c => String(c.id) !== 'all'));
                }
            })
            .catch(() => {
                if (Array.isArray(companies) && companies.length > 0) {
                    setCompanyList(companies.filter(c => String(c.id) !== 'all'));
                }
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const persistSettings = async (nextSettings, indicatorKey = 'save') => {
        setSettings(nextSettings);
        setSavingKey(indicatorKey);
        try {
            const res = await api('voice-agent/call-settings', {
                method: 'POST',
                body: JSON.stringify(nextSettings)
            });
            if (res?.settings) {
                setSettings(res.settings);
                if (onSettingsUpdated) onSettingsUpdated(res.settings);
            }
            setSavedToast(currentLang === 'en' ? 'Saved ✓' : 'સેટિંગ સેવ થઈ ગયું ✓');
            setTimeout(() => setSavedToast(''), 2500);
        } catch (err) {
            alert((currentLang === 'en' ? 'Failed to save: ' : 'સેવ કરવામાં ભૂલ: ') + (err?.message || 'Error'));
        } finally {
            setSavingKey(null);
        }
    };

    const handleToggleRule = (key) => {
        const nextVal = !settings[key];
        const next = {
            ...settings,
            [key]: nextVal
        };
        persistSettings(next, key);
    };

    const handleToggleMaster = () => {
        const nextMaster = !settings.master_enabled;
        const next = {
            ...settings,
            master_enabled: nextMaster
        };
        persistSettings(next, 'master_enabled');
    };

    const handleQuickPlantMaintenanceStop = () => {
        const isCurrentlyStopped = !settings.inverter_shutdown && !settings.grid_66kv_tripping;
        const next = {
            ...settings,
            master_enabled: true,
            inverter_shutdown: isCurrentlyStopped ? true : false,
            grid_66kv_tripping: isCurrentlyStopped ? true : false
        };
        persistSettings(next, 'quick_plant');
    };

    const handleToggleCompanyCall = (compId) => {
        const numericId = Number(compId);
        const currentMuted = Array.isArray(settings.muted_company_ids)
            ? settings.muted_company_ids.map(Number)
            : [];
        const isMuted = currentMuted.includes(numericId);
        const nextMuted = isMuted
            ? currentMuted.filter(id => id !== numericId)
            : [...currentMuted, numericId];

        const next = {
            ...settings,
            muted_company_ids: nextMuted
        };
        persistSettings(next, `comp_${numericId}`);
    };

    const isPlantAlertsPaused = !settings.master_enabled || (!settings.inverter_shutdown && !settings.grid_66kv_tripping);

    return (
        <div
            className="solar-modal-backdrop"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.72)',
                backdropFilter: 'blur(5px)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 150,
                padding: '12px'
            }}
        >
            <div
                className="solar-compact-modal"
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    maxWidth: '520px',
                    width: '100%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
                    border: '1.5px solid #e2e8f0',
                    overflow: 'hidden'
                }}
            >
                {/* Modal Header */}
                <div
                    style={{
                        background: settings.master_enabled
                            ? 'linear-gradient(135deg, #0f172a, #1e293b)'
                            : 'linear-gradient(135deg, #991b1b, #7f1d1d)',
                        color: '#ffffff',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                            style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '12px',
                                background: settings.master_enabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(254, 202, 202, 0.2)',
                                border: settings.master_enabled ? '1px solid #22c55e' : '1px solid #fca5a5',
                                display: 'grid',
                                placeItems: 'center',
                                color: settings.master_enabled ? '#4ade80' : '#fca5a5',
                                flexShrink: 0
                            }}
                        >
                            {settings.master_enabled ? <Phone size={19} /> : <PhoneOff size={19} />}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {currentLang === 'en' ? 'Manage Auto AI Voice Calls' : '📞 ઓટો AI એલર્ટ કૉલ મેનેજ કરો (ON / OFF)'}
                            </h3>
                            <span style={{ fontSize: '11px', color: '#cbd5e1', display: 'block', marginTop: '2px' }}>
                                {currentLang === 'en'
                                    ? 'Turn off alert calls before shutting down plant/inverters for work'
                                    : 'પ્લાન્ટ કે ઇન્વર્ટર જાતે બંધ કરો ત્યારે અહીંથી એલર્ટ કૉલ OFF કરી દો'}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.14)',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            flexShrink: 0
                        }}
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Body */}
                <div
                    style={{
                        padding: '14px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        flex: 1,
                        background: '#f8fafc'
                    }}
                >
                    {/* Save Toast Pill */}
                    {savedToast && (
                        <div
                            style={{
                                background: '#dcfce7',
                                border: '1px solid #86efac',
                                color: '#166534',
                                padding: '7px 12px',
                                borderRadius: '10px',
                                fontSize: '12px',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <CheckCircle size={15} />
                            <span>{savedToast}</span>
                        </div>
                    )}

                    {/* 1. MASTER SWITCH CARD */}
                    <div
                        style={{
                            background: settings.master_enabled ? '#f0fdf4' : '#fef2f2',
                            border: settings.master_enabled ? '1.5px solid #86efac' : '1.5px solid #fca5a5',
                            borderRadius: '14px',
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span
                                        style={{
                                            fontSize: '10px',
                                            fontWeight: 800,
                                            padding: '2px 7px',
                                            borderRadius: '6px',
                                            background: settings.master_enabled ? '#16a34a' : '#dc2626',
                                            color: '#ffffff'
                                        }}
                                    >
                                        {settings.master_enabled
                                            ? (currentLang === 'en' ? '🟢 MASTER ON' : '🟢 ચાલુ (ON)')
                                            : (currentLang === 'en' ? '🔴 ALL CALLS STOPPED' : '🔴 બધા કૉલ બંધ (OFF)')}
                                    </span>
                                    <b style={{ fontSize: '13.5px', color: '#0f172a' }}>
                                        {currentLang === 'en' ? 'All Automated AI Voice Calls' : 'બધા ઓટો AI એલર્ટ કૉલ (Master Switch)'}
                                    </b>
                                </div>
                                <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#475569', lineHeight: 1.4 }}>
                                    {settings.master_enabled
                                        ? (currentLang === 'en'
                                            ? 'Active: Selected auto voice calls below will ring normally.'
                                            : 'હાલ ઓટો કૉલ સિસ્ટમ ચાલુ છે. નીચેના લિસ્ટમાંથી જે કૉલ ON હશે તે જ વાગશે.')
                                        : (currentLang === 'en'
                                            ? 'All automatic AI calls are completely stopped. No one will receive alert calls.'
                                            : 'તમામ ઓટો AI કૉલ સંપૂર્ણપણે બંધ છે. કોઈને પણ ઓટો એલર્ટ કૉલ જશે નહીં.')}
                                </p>
                            </div>

                            {/* Master Toggle Switch */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings.master_enabled}
                                onClick={handleToggleMaster}
                                disabled={savingKey === 'master_enabled'}
                                style={{
                                    width: '56px',
                                    height: '30px',
                                    borderRadius: '999px',
                                    background: settings.master_enabled ? '#16a34a' : '#cbd5e1',
                                    border: 'none',
                                    padding: '3px',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'background 0.2s ease',
                                    flexShrink: 0
                                }}
                            >
                                <span
                                    style={{
                                        display: 'block',
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: '#ffffff',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                                        transform: settings.master_enabled ? 'translateX(26px)' : 'translateX(0px)',
                                        transition: 'transform 0.2s ease'
                                    }}
                                />
                            </button>
                        </div>

                        {/* Quick 1-Tap Plant Work / Maintenance Button */}
                        <button
                            type="button"
                            onClick={handleQuickPlantMaintenanceStop}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '10px',
                                border: isPlantAlertsPaused ? '1.5px solid #16a34a' : '1.5px solid #ea580c',
                                background: isPlantAlertsPaused ? '#dcfce7' : '#fff7ed',
                                color: isPlantAlertsPaused ? '#166534' : '#9a3412',
                                fontSize: '12px',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '7px',
                                cursor: 'pointer'
                            }}
                        >
                            <Wrench size={15} />
                            <span>
                                {isPlantAlertsPaused
                                    ? (currentLang === 'en'
                                        ? '🟢 Plant Work Done — Turn ON Inverter & 66KV Calls'
                                        : '🟢 પ્લાન્ટનું કામ પૂર્ણ — ઇન્વર્ટર અને ૬૬KV એલર્ટ કૉલ ફરી ચાલુ (ON) કરો')
                                    : (currentLang === 'en'
                                        ? '🔧 Plant Maintenance Mode — Stop Inverter & 66KV Calls'
                                        : '🔧 પ્લાન્ટમાં કામ ચાલુ છે — ઇન્વર્ટર અને ૬૬KV એલર્ટ કૉલ હમણાં બંધ (OFF) કરો')}
                            </span>
                        </button>
                    </div>

                    {/* 2. COMPANY-WISE PLANT MAINTENANCE MUTE */}
                    {companyList.length > 0 && (
                        <div
                            style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '14px',
                                padding: '12px 14px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Building2 size={16} style={{ color: '#0284c7' }} />
                                    <b style={{ fontSize: '12.5px', color: '#0f172a' }}>
                                        {currentLang === 'en'
                                            ? 'Company-Wise Inverter Alert Call (ON / OFF)'
                                            : 'કંપની મુજબ પ્લાન્ટ ઇન્વર્ટર કૉલ (ON / OFF)'}
                                    </b>
                                </div>
                                <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
                                    {currentLang === 'en' ? 'Per-Plant Control' : 'જે પ્લાન્ટમાં કામ હોય તે OFF કરો'}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {companyList.map(comp => {
                                    const cId = Number(comp.id || comp.company_id);
                                    const mutedIds = (settings.muted_company_ids || []).map(Number);
                                    const isCompanyCallOn = settings.master_enabled && settings.inverter_shutdown && !mutedIds.includes(cId);

                                    return (
                                        <div
                                            key={cId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                borderRadius: '10px',
                                                background: isCompanyCallOn ? '#f8fafc' : '#fff1f2',
                                                border: isCompanyCallOn ? '1px solid #e2e8f0' : '1px solid #fecdd3'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>🏢 {comp.name || comp.company_name}</span>
                                                    <span
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            background: isCompanyCallOn ? '#dcfce7' : '#fee2e2',
                                                            color: isCompanyCallOn ? '#15803d' : '#b91c1c',
                                                            fontWeight: 800
                                                        }}
                                                    >
                                                        {isCompanyCallOn
                                                            ? (currentLang === 'en' ? 'ON' : 'કૉલ ચાલુ')
                                                            : (currentLang === 'en' ? 'OFF (Muted)' : 'કૉલ બંધ (OFF)')}
                                                    </span>
                                                </div>
                                                {comp.owner_name && (
                                                    <small style={{ fontSize: '10.5px', color: '#64748b' }}>
                                                        {currentLang === 'en' ? 'Owner: ' : 'ઓનર: '}{comp.owner_name}
                                                    </small>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isCompanyCallOn}
                                                onClick={() => handleToggleCompanyCall(cId)}
                                                disabled={!settings.master_enabled || !settings.inverter_shutdown || savingKey === `comp_${cId}`}
                                                style={{
                                                    width: '48px',
                                                    height: '26px',
                                                    borderRadius: '999px',
                                                    background: isCompanyCallOn ? '#16a34a' : '#cbd5e1',
                                                    border: 'none',
                                                    padding: '3px',
                                                    cursor: (!settings.master_enabled || !settings.inverter_shutdown) ? 'not-allowed' : 'pointer',
                                                    opacity: (!settings.master_enabled || !settings.inverter_shutdown) ? 0.55 : 1,
                                                    position: 'relative',
                                                    transition: 'background 0.2s ease',
                                                    flexShrink: 0
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        display: 'block',
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: '#ffffff',
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                                                        transform: isCompanyCallOn ? 'translateX(22px)' : 'translateX(0px)',
                                                        transition: 'transform 0.2s ease'
                                                    }}
                                                />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 3. INDIVIDUAL AUTO CALL LIST WITH TOGGLES */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                            <b style={{ fontSize: '12.5px', color: '#334155' }}>
                                {currentLang === 'en'
                                    ? 'All Automatic AI Calls List (Individual ON / OFF)'
                                    : '📋 જેટલા પણ ઓટો AI કૉલ થાય છે તેનું લિસ્ટ (ON / OFF)'}
                            </b>
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                                {AUTO_CALL_RULES.filter(r => settings.master_enabled && settings[r.key]).length} / {AUTO_CALL_RULES.length} {currentLang === 'en' ? 'Active' : 'ચાલુ'}
                            </span>
                        </div>

                        {loading ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12.5px' }}>
                                {currentLang === 'en' ? 'Loading call settings...' : 'કૉલ સેટિંગ્સ લોડ થઈ રહી છે...'}
                            </div>
                        ) : (
                            AUTO_CALL_RULES.map(rule => {
                                const IconComp = rule.icon;
                                const isRuleOn = Boolean(settings.master_enabled && settings[rule.key]);

                                return (
                                    <div
                                        key={rule.key}
                                        style={{
                                            background: '#ffffff',
                                            border: isRuleOn ? '1.5px solid #e2e8f0' : '1.5px solid #fecaca',
                                            borderRadius: '13px',
                                            padding: '11px 13px',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            gap: '10px',
                                            opacity: settings.master_enabled ? 1 : 0.65,
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                                            <div
                                                style={{
                                                    width: '36px',
                                                    height: '36px',
                                                    borderRadius: '10px',
                                                    background: isRuleOn ? rule.iconBg : '#f1f5f9',
                                                    color: isRuleOn ? rule.iconColor : '#94a3b8',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    flexShrink: 0,
                                                    marginTop: '2px'
                                                }}
                                            >
                                                <IconComp size={18} />
                                            </div>

                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                                    <span
                                                        style={{
                                                            fontSize: '9.5px',
                                                            fontWeight: 800,
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            background: isRuleOn ? '#f1f5f9' : '#fee2e2',
                                                            color: isRuleOn ? '#334155' : '#b91c1c'
                                                        }}
                                                    >
                                                        {currentLang === 'en' ? rule.badgeEn : rule.badgeGu}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: '9.5px',
                                                            fontWeight: 700,
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            background: '#eff6ff',
                                                            color: '#1d4ed8'
                                                        }}
                                                    >
                                                        👤 {currentLang === 'en' ? rule.targetEn : rule.targetGu}
                                                    </span>
                                                </div>

                                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                                                    {currentLang === 'en' ? rule.titleEn : rule.titleGu}
                                                </div>

                                                <p style={{ margin: '4px 0 0', fontSize: '11.2px', color: '#64748b', lineHeight: 1.4 }}>
                                                    {currentLang === 'en' ? rule.descEn : rule.descGu}
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isRuleOn}
                                                onClick={() => handleToggleRule(rule.key)}
                                                disabled={!settings.master_enabled || savingKey === rule.key}
                                                style={{
                                                    width: '50px',
                                                    height: '28px',
                                                    borderRadius: '999px',
                                                    background: isRuleOn ? '#16a34a' : '#cbd5e1',
                                                    border: 'none',
                                                    padding: '3px',
                                                    cursor: !settings.master_enabled ? 'not-allowed' : 'pointer',
                                                    position: 'relative',
                                                    transition: 'background 0.2s ease'
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        display: 'block',
                                                        width: '22px',
                                                        height: '22px',
                                                        borderRadius: '50%',
                                                        background: '#ffffff',
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                                                        transform: isRuleOn ? 'translateX(22px)' : 'translateX(0px)',
                                                        transition: 'transform 0.2s ease'
                                                    }}
                                                />
                                            </button>
                                            <span
                                                style={{
                                                    fontSize: '10px',
                                                    fontWeight: 800,
                                                    color: isRuleOn ? '#16a34a' : '#dc2626'
                                                }}
                                            >
                                                {isRuleOn
                                                    ? (currentLang === 'en' ? 'ON' : 'ચાલુ (ON)')
                                                    : (currentLang === 'en' ? 'OFF' : 'બંધ (OFF)')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '10px 16px',
                        background: '#ffffff',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}
                >
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {settings.updated_by
                            ? `${currentLang === 'en' ? 'Last updated by: ' : 'છેલ્લે અપડેટ: '}${settings.updated_by}`
                            : (currentLang === 'en' ? 'Instant auto-save enabled' : 'બટન બદલતા જ ઓટોમેટિક સેવ થઈ જશે')}
                    </span>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '7px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#0f172a',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        {currentLang === 'en' ? 'Done / Close' : 'બંધ કરો (Done)'}
                    </button>
                </div>
            </div>
        </div>
    );
}
