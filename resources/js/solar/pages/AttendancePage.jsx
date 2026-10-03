import React, {useEffect, useMemo, useState} from 'react';
import {ClockAlert, ExternalLink, MapPin, Navigation, PencilLine, Plus, Radio, RefreshCw, Search, Smartphone, User, X} from 'lucide-react';
import {api} from '../api';
import {DatePicker, Empty, Field} from '../components/Common';

const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const localDateTime = (value, date, fallback = '18:00') => {
    if (!value) return `${date}T${fallback}`;
    const parsed = new Date(value);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
};
const displayTime = value => value ? new Date(value).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : 'Missing';

export default function AttendancePage({canCorrect, canRecord}) {
    const [employees, setEmployees] = useState([]);
    const [rows, setRows] = useState([]);
    const [date, setDate] = useState(localDate());
    const [employeeId, setEmployeeId] = useState('');
    const [search, setSearch] = useState('');
    const [correction, setCorrection] = useState(null);
    const [manual, setManual] = useState(null);
    const [selfiePreview, setSelfiePreview] = useState(null);
    const [message, setMessage] = useState('');

    // 📍 Real-Time Live Employee Locations
    const [liveLocations, setLiveLocations] = useState([]);
    const [liveCount, setLiveCount] = useState(0);
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [selectedMapEmployee, setSelectedMapEmployee] = useState(null);
    const [mapMode, setMapMode] = useState('satellite'); // 'satellite' | 'roadmap'
    const [zoomLevel, setZoomLevel] = useState(20); // 20 is ultra close-up satellite level

    const loadLiveLocations = async () => {
        try {
            setLoadingLocations(true);
            const data = await api('employee-locations/live');
            setLiveLocations(data.employees || []);
            setLiveCount(data.live_count || 0);
        } catch (e) {
            console.warn('Live location error', e);
        } finally {
            setLoadingLocations(false);
        }
    };

    const displayLocations = useMemo(() => {
        if (liveLocations && liveLocations.length > 0) {
            return liveLocations;
        }
        if (employees && employees.length > 0) {
            return employees.map(emp => {
                const row = rows.find(r => String(r.employee_id) === String(emp.id) || String(r.employee?.id) === String(emp.id));
                const lat = row && row.clock_in_latitude && Number(row.clock_in_latitude) !== 0 ? Number(row.clock_in_latitude) : null;
                const lng = row && row.clock_in_longitude && Number(row.clock_in_longitude) !== 0 ? Number(row.clock_in_longitude) : null;
                return {
                    employee_id: emp.id,
                    name: emp.name || emp.user?.name || 'Employee',
                    employee_code: emp.employee_code,
                    designation: emp.designation || 'Field Officer',
                    company_name: 'SolarFlow Shared',
                    company_id: null,
                    avatar_url: emp.profile_photo_url || null,
                    is_live: Boolean(row && !row.clock_out_at && lat),
                    last_seen: row ? 'Time In પરથી સિંક' : 'GPS પિંગની રાહ જુએ છે',
                    status: row ? (row.clock_out_at ? 'Shift Ended' : 'Working') : 'Not Checked In',
                    latitude: lat,
                    longitude: lng,
                    accuracy: row?.clock_in_accuracy || 15,
                    map_url: lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null,
                };
            });
        }
        return [];
    }, [liveLocations, employees, rows]);

    const activeLiveCount = useMemo(() => {
        return displayLocations.filter(e => e.is_live).length;
    }, [displayLocations]);

    const load = async () => {
        const query = new URLSearchParams({date});
        if (employeeId) query.set('employee_id', employeeId);
        const [attendance, people] = await Promise.all([api(`attendance?${query}`), api('employees')]);
        setRows(attendance);
        setEmployees(people);
    };

    useEffect(() => {
        load().catch(error => setMessage(error.message));
        loadLiveLocations();
        const locInterval = setInterval(loadLiveLocations, 30000); // 30s auto-refresh
        return () => clearInterval(locInterval);
    }, [date, employeeId]);
    const filtered = useMemo(() => rows.filter(row => `${row.employee.user.name} ${row.employee.employee_code}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
    const openCorrection = row => setCorrection({
        id: row.id,
        employee: row.employee.user.name,
        attendance_date: row.attendance_date,
        clock_out_at: localDateTime(row.clock_out_at, row.attendance_date, row.employee.shift_end?.slice(0, 5) || '18:00'),
        work_done: row.work_done || '',
        learned: row.learned || '',
        correction_reason: '',
        had_clock_out: Boolean(row.clock_out_at),
    });
    const saveCorrection = async event => {
        event.preventDefault();
        setMessage('');
        try {
            await api(`attendance/${correction.id}/correct`, {method: 'POST', body: JSON.stringify(correction)});
            setCorrection(null);
            setMessage('Attendance correction saved with audit history.');
            await load();
        } catch (error) { setMessage(error.message); }
    };
    const eligibleEmployees = employees.filter(employee => employee.active && employee.manager_attendance_only);
    const openManual = () => {
        const employee = eligibleEmployees.find(item => String(item.id) === String(employeeId)) || eligibleEmployees[0];
        if (!employee) return setMessage('Mark an active employee as “Manager records attendance” first.');
        const attendanceDate = date > localDate() ? localDate() : date;
        setManual({
            employee_id: String(employee.id),
            attendance_date: attendanceDate,
            clock_in_at: `${attendanceDate}T${employee.shift_start?.slice(0, 5) || '09:00'}`,
            clock_out_at: `${attendanceDate}T${employee.shift_end?.slice(0, 5) || '18:00'}`,
            break_minutes: 0,
            work_done: '',
            learned: '',
            entry_reason: '',
        });
        setMessage('');
    };
    const changeManualEmployee = value => {
        const employee = eligibleEmployees.find(item => String(item.id) === String(value));
        setManual(current => ({...current, employee_id: value, clock_in_at: `${current.attendance_date}T${employee?.shift_start?.slice(0, 5) || '09:00'}`, clock_out_at: `${current.attendance_date}T${employee?.shift_end?.slice(0, 5) || '18:00'}`}));
    };
    const changeManualDate = value => setManual(current => ({...current, attendance_date: value, clock_in_at: `${value}T${current.clock_in_at.slice(11, 16)}`, clock_out_at: `${value}T${current.clock_out_at.slice(11, 16)}`}));
    const saveManual = async event => {
        event.preventDefault();
        setMessage('');
        try {
            await api('attendance/manual', {method: 'POST', body: JSON.stringify({...manual, employee_id: Number(manual.employee_id), break_minutes: Number(manual.break_minutes)})});
            setManual(null);
            setMessage('Manager-entered attendance saved with audit history.');
            await load();
        } catch (error) { setMessage(error.message); }
    };
    const totals = {
        present: rows.filter(row => row.clock_out_at && row.status === 'present').length,
        open: rows.filter(row => !row.clock_out_at).length,
        late: rows.filter(row => row.is_late).length,
        corrected: rows.filter(row => row.manual_correction).length,
    };

    return <div className="attendance-admin">
        <div className="cards attendance-cards">
            <article className="metric"><span>Completed present</span><strong>{totals.present}</strong><small>selected date</small></article>
            <article className="metric amber"><span>Missing Time Out</span><strong>{totals.open}</strong><small>needs attention</small></article>
            <article className="metric"><span>Late arrivals</span><strong>{totals.late}</strong><small>after grace period</small></article>
            <article className="metric"><span>Manual corrections</span><strong>{totals.corrected}</strong><small>audited records</small></article>
        </div>
        {message && <div className={message.includes('saved') || message.includes('dispatched') || message.includes('delivered') ? 'success' : 'error'}>{message}</div>}

        {/* 📡 Live Employee GPS Field Tracker & Map Box */}
        <section className="panel" style={{marginBottom: '24px', border: '1px solid #cbe4d7', background: 'linear-gradient(to bottom, #ffffff, #f9fdfa)', padding: '16px'}}>
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
                    <div>
                        <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                            <h2 style={{display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '16px', fontWeight: 800, color: '#123e30'}}>
                                <Navigation size={18} style={{color: '#22c55e', flexShrink: 0}}/>
                                કર્મચારી લાઈવ લોકેશન ટ્રેકર
                            </h2>
                            <span className="status on" style={{padding: '3px 8px', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap'}}>
                                🟢 {activeLiveCount} Live Online
                            </span>
                        </div>
                        <p style={{margin: '4px 0 0', fontSize: '11.5px', color: '#627c70'}}>
                            એમ્પ્લોયીનો ફોન/PWA ઓપન અથવા મિનિમાઇઝ હોય ત્યારે રીઅલ-ટાઇમ GPS (Syncs every 30s)
                        </p>
                    </div>
                    <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => setMapMode(current => current === 'satellite' ? 'roadmap' : 'satellite')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                fontSize: '12px',
                                borderRadius: '10px',
                                fontWeight: 700,
                                background: mapMode === 'satellite' ? '#0f172a' : '#f8fafc',
                                color: mapMode === 'satellite' ? '#38bdf8' : '#334155',
                                border: mapMode === 'satellite' ? '1.5px solid #38bdf8' : '1px solid #cbd5e1'
                            }}
                            title="સેટેલાઇટ / સામાન્ય મેપ મોડ બદલો"
                        >
                            {mapMode === 'satellite' ? '🛰️ સેટેલાઇટ મોડ (ON)' : '🗺️ રોડમેપ મોડ'}
                        </button>
                        <button
                            type="button"
                            className="secondary"
                            onClick={loadLiveLocations}
                            disabled={loadingLocations}
                            style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 14px', fontSize: '12px', borderRadius: '10px', fontWeight: 600}}
                            title="Refresh Live GPS coordinates"
                        >
                            <RefreshCw size={14} className={loadingLocations ? 'spin' : ''}/> રીફ્રેશ લોકેશન
                        </button>
                    </div>
                </div>
            </div>

            {displayLocations.length > 0 ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '14px',
                    marginTop: '12px'
                }}>
                    {displayLocations.map(emp => (
                        <div
                            key={emp.employee_id}
                            style={{
                                background: '#ffffff',
                                border: emp.is_live ? '1.5px solid #86efac' : '1px solid #e2ece5',
                                borderRadius: '14px',
                                padding: '14px 16px',
                                boxShadow: emp.is_live ? '0 4px 14px rgba(34, 197, 94, 0.12)' : '0 2px 6px rgba(0,0,0,0.03)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}
                        >
                            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '12px',
                                    background: emp.is_live ? '#dcfce7' : '#f1f5f9',
                                    color: emp.is_live ? '#15803d' : '#64748b',
                                    display: 'grid',
                                    placeItems: 'center',
                                    fontWeight: 800,
                                    fontSize: '14px',
                                    overflow: 'hidden',
                                    flexShrink: 0
                                }}>
                                    {emp.avatar_url ? (
                                        <img src={emp.avatar_url} alt={emp.name} style={{width: '100%', height: '100%', objectFit: 'cover'}}/>
                                    ) : (
                                        <span>{emp.name.slice(0, 2).toUpperCase()}</span>
                                    )}
                                </div>
                                <div style={{flex: 1, minWidth: 0}}>
                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px'}}>
                                        <b style={{fontSize: '13px', color: '#133e31', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                            {emp.name}
                                        </b>
                                        {emp.is_live ? (
                                            <span className="status on" style={{fontSize: '10px', padding: '2px 7px'}}>
                                                🟢 Live ({emp.last_seen})
                                            </span>
                                        ) : emp.latitude ? (
                                            <span className="status warning" style={{fontSize: '10px', padding: '2px 7px'}}>
                                                🟡 {emp.last_seen}
                                            </span>
                                        ) : (
                                            <span className="status" style={{fontSize: '10px', padding: '2px 7px'}}>
                                                ⚪ Offline
                                            </span>
                                        )}
                                    </div>
                                    <small style={{display: 'block', color: '#687e74', fontSize: '11px', marginTop: '2px'}}>
                                        {emp.employee_code} · {emp.designation} · <span style={{color: '#0d9488'}}>{emp.company_name}</span>
                                    </small>
                                </div>
                            </div>

                            {/* 🏍️ Movement / Activity Status Badge */}
                            <div style={{
                                background: emp.movement === 'bike' ? '#fef3c7' : emp.movement === 'walking' ? '#e0f2fe' : '#f8faf9',
                                borderRadius: '10px',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                border: emp.movement === 'bike' ? '1px solid #fde68a' : emp.movement === 'walking' ? '1px solid #bae6fd' : '1px solid #e2ece5'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                    <span style={{fontSize: '15px'}}>{emp.movement_icon || (emp.movement === 'bike' ? '🏍️' : emp.movement === 'walking' ? '🚶' : '📍')}</span>
                                    <b style={{color: emp.movement === 'bike' ? '#b45309' : emp.movement === 'walking' ? '#0369a1' : '#1e293b'}}>
                                        {emp.movement_label || (emp.movement === 'bike' ? 'બાઇક પર ગતિમાં' : emp.movement === 'walking' ? 'ચાલી રહ્યો છે' : 'સ્થિર છે (સાઇટ પર)')}
                                    </b>
                                </div>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                    {emp.speed ? (
                                        <span style={{fontWeight: 800, fontSize: '10.5px', color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: '6px'}}>
                                            ⚡ {Math.round(emp.speed)} km/h
                                        </span>
                                    ) : null}
                                    <span style={{color: emp.status === 'Working' ? '#16a34a' : emp.status === 'Shift Ended' ? '#0284c7' : '#eab308', fontWeight: 700}}>
                                        {emp.status}
                                    </span>
                                </div>
                            </div>

                            {emp.latitude && emp.longitude ? (
                                <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px'}}>
                                    {/* 🗺️ Default Embedded Small Interactive Map */}
                                    <div style={{
                                        position: 'relative',
                                        width: '100%',
                                        height: '220px',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        border: '1px solid #cbd5e1',
                                        background: '#f1f5f9',
                                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
                                        touchAction: 'auto'
                                    }}>
                                        <iframe
                                            title={`Live Map for ${emp.name}`}
                                            width="100%"
                                            height="100%"
                                            frameBorder="0"
                                            allowFullScreen
                                            src={`https://maps.google.com/maps?q=${emp.latitude},${emp.longitude}${mapMode === 'satellite' ? '&t=k' : ''}&hl=gu&z=${zoomLevel}&output=embed`}
                                            style={{border: 0, width: '100%', height: '100%', touchAction: 'auto'}}
                                            loading="lazy"
                                        />

                                        {/* 🔍 Touch-friendly Large Zoom Controls on Map */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '5px',
                                            zIndex: 5
                                        }}>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel(z => Math.min(21, z + 1))}
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid #cbd5e1',
                                                    color: '#0f172a',
                                                    fontWeight: 900,
                                                    fontSize: '18px',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                                                }}
                                                title="Zoom In (નજીક લાવો)"
                                            >
                                                +
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel(z => Math.max(14, z - 1))}
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid #cbd5e1',
                                                    color: '#0f172a',
                                                    fontWeight: 900,
                                                    fontSize: '18px',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                                                }}
                                                title="Zoom Out (દૂર કરો)"
                                            >
                                                -
                                            </button>
                                        </div>

                                        {/* 📍 Bottom Map Status Tag */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '6px',
                                            left: '8px',
                                            background: 'rgba(15, 23, 42, 0.88)',
                                            color: '#ffffff',
                                            padding: '3px 8px',
                                            borderRadius: '6px',
                                            fontSize: '10px',
                                            pointerEvents: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}>
                                            <span>{emp.movement_icon || '📍'}</span>
                                            <b style={{color: '#38bdf8'}}>{emp.movement === 'bike' ? 'Bike Moving' : emp.movement === 'walking' ? 'Walking' : 'Stationary'}</b>
                                            <span>· Zoom: {zoomLevel}x</span>
                                        </div>
                                    </div>

                                    {/* 🔘 Mobile Quick Zoom Presets */}
                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px'}}>
                                        <span style={{fontSize: '11px', color: '#64748b', fontWeight: 600}}>ઝૂમ લેવલ:</span>
                                        <div style={{display: 'flex', gap: '4px'}}>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel(21)}
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: '10px',
                                                    borderRadius: '6px',
                                                    fontWeight: zoomLevel === 21 ? 800 : 600,
                                                    background: zoomLevel === 21 ? '#0284c7' : '#f1f5f9',
                                                    color: zoomLevel === 21 ? '#ffffff' : '#334155',
                                                    border: zoomLevel === 21 ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🔍 21x (અલ્ટ્રા નજીક)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel(19)}
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: '10px',
                                                    borderRadius: '6px',
                                                    fontWeight: zoomLevel === 19 ? 800 : 600,
                                                    background: zoomLevel === 19 ? '#0284c7' : '#f1f5f9',
                                                    color: zoomLevel === 19 ? '#ffffff' : '#334155',
                                                    border: zoomLevel === 19 ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🏠 19x (નજીક)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel(16)}
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: '10px',
                                                    borderRadius: '6px',
                                                    fontWeight: zoomLevel === 16 ? 800 : 600,
                                                    background: zoomLevel === 16 ? '#0284c7' : '#f1f5f9',
                                                    color: zoomLevel === 16 ? '#ffffff' : '#334155',
                                                    border: zoomLevel === 16 ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🗺️ 16x (એરિયા)
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{display: 'flex', gap: '8px'}}>
                                        <button
                                            type="button"
                                            className="secondary"
                                            onClick={() => setSelectedMapEmployee(emp)}
                                            style={{
                                                flex: 1,
                                                padding: '7px 10px',
                                                fontSize: '11.5px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px',
                                                borderRadius: '8px'
                                            }}
                                        >
                                            <MapPin size={13}/> મોટો મેપ જુઓ
                                        </button>
                                        <a
                                            href={emp.map_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="primary"
                                            style={{
                                                flex: 1,
                                                padding: '7px 10px',
                                                fontSize: '11.5px',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px',
                                                borderRadius: '8px'
                                            }}
                                            title="Open in Google Maps App"
                                        >
                                            <ExternalLink size={13}/> Maps App માં જુઓ
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    fontSize: '11.5px',
                                    color: '#64748b',
                                    background: '#f8fafc',
                                    borderRadius: '10px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    border: '1px dashed #cbd5e1'
                                }}>
                                    📍 એમ્પ્લોયીનું લાઈવ GPS પિંગ મળતા જ અહીં લાઈવ મેપ આપોઆપ ખુલી જશે.
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px'}}>
                    હાલ કોઈ કર્મચારી લાઈવ ટ્રેકિંગ માટે ઉપલબ્ધ નથી.
                </div>
            )}
        </section>

        <section className="panel">
            <div className="panel-head attendance-list-head"><div><h2>Daily attendance</h2><p>Employee and audited manager-entered records.</p></div>{canRecord && <button type="button" className="primary" onClick={openManual}><Plus size={16}/> Add attendance</button>}</div>
            <div className="attendance-toolbar">
                <DatePicker label="Attendance date" value={date} onChange={setDate}/>
                <label><span>Employee</span><select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">All employees</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.name}</option>)}</select></label>
                <label className="search-box"><span>Search</span><div><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or code"/></div></label>
            </div>
            {filtered.length ? <div className="table-wrap"><table className="attendance-table">
                <thead><tr><th>Employee</th><th>Time In Selfie</th><th>Break Return</th><th>Time In</th><th>Time Out</th><th>Work Hours</th><th>Break Hours</th><th>Status</th><th>Location</th><th>Notes</th>{canCorrect && <th/>}</tr></thead>
                <tbody>{filtered.map(row => <tr key={row.id}>
                    <td><b>{row.employee.user.name}</b><small>{row.employee.employee_code}</small>{row.entry_source === 'manager' && <i className="status warning">Manager entered</i>}</td>
                    <td>{row.selfie_url ? <button type="button" className="photo-preview-button" onClick={() => setSelfiePreview({url: row.selfie_url, employee: row.employee.user.name, date: row.attendance_date})}><img className="selfie-thumb" src={row.selfie_url} alt={`${row.employee.user.name} Time In selfie`}/></button> : <small>Not provided — manager entry</small>}</td>
                    <td><span className="break-selfies">{row.breaks.filter(item => item.return_selfie_url).map((item, index) => <a key={item.id} href={item.return_selfie_url} target="_blank" rel="noreferrer"><img className="selfie-thumb" src={item.return_selfie_url} alt={`Break return ${index + 1}`}/></a>)}{!row.breaks.some(item => item.return_selfie_url) && '—'}</span></td>
                    <td>{displayTime(row.clock_in_at)}{row.is_late && <small className="danger-text">Late</small>}</td>
                    <td>{displayTime(row.clock_out_at)}</td><td>{(row.work_minutes / 60).toFixed(2)}</td><td>{(Number(row.break_minutes) / 60).toFixed(2)}</td>
                    <td><i className={`status ${row.status === 'present' ? 'on' : row.status === 'open' ? 'warning' : ''}`}>{row.status.replaceAll('_', ' ')}</i></td>
                    <td>{row.clock_in_latitude !== null && row.clock_in_longitude !== null ? <a className="map-link" href={`https://maps.google.com/?q=${row.clock_in_latitude},${row.clock_in_longitude}`} target="_blank" rel="noreferrer"><MapPin size={14}/> Map</a> : <small>Not provided — manager entry</small>}</td>
                    <td><span className="note-preview" title={`${row.work_done || ''}\n${row.learned || ''}${row.entry_reason ? `\nReason: ${row.entry_reason}` : ''}`}>{row.work_done || '—'}{row.entry_source === 'manager' && <small>By {row.recorded_by?.name || 'authorized user'} · {row.entry_reason}</small>}</span></td>
                    {canCorrect && <td><button className="link" onClick={() => openCorrection(row)}><PencilLine size={15}/> Correct</button></td>}
                </tr>)}</tbody>
            </table></div> : <Empty title="No attendance records" detail="No employee timed in for the selected date and filters."/>}
        </section>
        {manual && <div className="modal-backdrop" onClick={() => setManual(null)}>
            <form className="modal modal-sheet manual-attendance-modal" onSubmit={saveManual} onClick={e => e.stopPropagation()} style={{maxWidth: '620px'}}>
                <div className="panel-head">
                    <div>
                        <h2>કર્મચારી હાજરી ઉમેરો (Add Attendance)</h2>
                        <p>સેલ્ફી અથવા GPS વગર અધિકૃત મેનેજર દ્વારા હાજરી એન્ટ્રી</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={() => setManual(null)}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll">
                    <div className="audit-warning">
                        <ClockAlert/>
                        <span>
                            <b>⚠️ આ એક્શન ઓડિટ લોગમાં કાયમી રેકોર્ડ થશે</b>
                            <small>તમારું નામ, એન્ટ્રી સમય અને દર્શાવેલ કારણ ડેટાબેઝમાં સેવ થશે.</small>
                        </span>
                    </div>

                    <div className="form-grid two">
                        <Field label="કર્મચારી પસંદ કરો (Select Employee)">
                            <select value={manual.employee_id} onChange={event => changeManualEmployee(event.target.value)} required>
                                {eligibleEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.name}</option>)}
                            </select>
                        </Field>
                        <Field label="હાજરી તારીખ (Attendance Date)">
                            <input type="date" max={localDate()} value={manual.attendance_date} onChange={event => changeManualDate(event.target.value)} required/>
                        </Field>
                        <Field label="આવવાનો સમય (Time In)">
                            <input type="datetime-local" value={manual.clock_in_at} onChange={event => setManual({...manual, clock_in_at: event.target.value})} required/>
                        </Field>
                        <Field label="જવાનો સમય (Time Out)">
                            <input type="datetime-local" value={manual.clock_out_at} onChange={event => setManual({...manual, clock_out_at: event.target.value})} required/>
                        </Field>
                        <Field label="કુલ બ્રેક / રિસેસ મિનિટ (Break Minutes)">
                            <input type="number" min="0" max="1439" value={manual.break_minutes} onChange={event => setManual({...manual, break_minutes: event.target.value})} required/>
                        </Field>
                    </div>

                    <Field label="કર્મચારીએ આજે શું કામ કર્યું? (What did the employee do?)">
                        <textarea
                            value={manual.work_done}
                            onChange={event => setManual({...manual, work_done: event.target.value})}
                            rows="3"
                            required
                        />
                    </Field>

                    <Field label="કર્મચારીએ આજે નવું શું શીખ્યું? (What did the employee learn?)">
                        <textarea
                            value={manual.learned}
                            onChange={event => setManual({...manual, learned: event.target.value})}
                            rows="3"
                            required
                        />
                    </Field>

                    <Field label="મેનેજર દ્વારા હાજરી પૂરવાનું કારણ (Why is manager entering?)">
                        <textarea
                            value={manual.entry_reason}
                            onChange={event => setManual({...manual, entry_reason: event.target.value})}
                            rows="2"
                            required
                        />
                    </Field>
                </div>

                <div className="modal-sticky-footer">
                    <button type="button" className="secondary modal-cancel-btn" onClick={() => setManual(null)}>
                        રદ કરો (Cancel)
                    </button>
                    <button type="submit" className="primary expense-submit-btn">
                        ✓ Save Attendance (હાજરી સેવ કરો)
                    </button>
                </div>
            </form>
        </div>}

        {correction && <div className="modal-backdrop" onClick={() => setCorrection(null)}>
            <form className="modal modal-sheet correction-modal" onSubmit={saveCorrection} onClick={e => e.stopPropagation()} style={{maxWidth: '580px'}}>
                <div className="panel-head">
                    <div>
                        <h2>{correction.had_clock_out ? 'હાજરી સુધારો (Correct Attendance)' : 'બાકી Time Out પૂર્ણ કરો (Complete Time Out)'}</h2>
                        <p>{correction.employee} · {correction.attendance_date}</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={() => setCorrection(null)}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll">
                    <div className="audit-warning">
                        <ClockAlert/>
                        <span>
                            <b>⚠️ આ સુધારો ઓડિટ લોગમાં રેકોર્ડ થશે</b>
                            <small>જૂનો સમય, નવો સમય અને સુધારાનું કારણ કાયમી સેવ થશે.</small>
                        </span>
                    </div>

                    <Field label="જવાનો સમય (Time Out)">
                        <input type="datetime-local" value={correction.clock_out_at} onChange={event => setCorrection({...correction, clock_out_at: event.target.value})} required/>
                    </Field>

                    <Field label="કર્મચારીએ આજે શું કામ કર્યું? (Work Done)">
                        <textarea value={correction.work_done} onChange={event => setCorrection({...correction, work_done: event.target.value})} rows="3" required/>
                    </Field>

                    <Field label="કર્મચારીએ આજે નવું શું શીખ્યું? (What Learned)">
                        <textarea value={correction.learned} onChange={event => setCorrection({...correction, learned: event.target.value})} rows="3" required/>
                    </Field>

                    <Field label="સુધારાનું કારણ (Correction Reason)">
                        <textarea value={correction.correction_reason} onChange={event => setCorrection({...correction, correction_reason: event.target.value})} rows="2" required/>
                    </Field>
                </div>

                <div className="modal-sticky-footer">
                    <button type="button" className="secondary modal-cancel-btn" onClick={() => setCorrection(null)}>
                        રદ કરો (Cancel)
                    </button>
                    <button type="submit" className="primary expense-submit-btn">
                        ✓ Save Audited Correction (સેવ કરો)
                    </button>
                </div>
            </form>
        </div>}
        {selfiePreview && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelfiePreview(null)}><div className="modal attendance-photo-modal" role="dialog" aria-modal="true" aria-labelledby="time-in-selfie-title"><div className="panel-head"><div><h2 id="time-in-selfie-title">Time In selfie</h2><p>{selfiePreview.employee} · {selfiePreview.date}</p></div><button type="button" className="icon-button ghost" onClick={() => setSelfiePreview(null)} aria-label="Close photo preview"><X/></button></div><img className="attendance-photo-preview" src={selfiePreview.url} alt={`${selfiePreview.employee} Time In selfie`}/></div></div>}

        {/* 🗺️ Live Google Maps Interactive View Modal */}
        {selectedMapEmployee && (
            <div className="modal-backdrop" onClick={() => setSelectedMapEmployee(null)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: '720px', padding: 0, overflow: 'hidden', borderRadius: '18px'}}>
                    <div style={{
                        padding: '14px 18px',
                        background: '#0d382d',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <h3 style={{margin: 0, fontSize: '15px', fontWeight: 800, color: '#f0fdf4'}}>
                                📍 {selectedMapEmployee.name} ({selectedMapEmployee.employee_code}) · લાઈવ લોકેશન
                            </h3>
                            <p style={{margin: '3px 0 0', fontSize: '11px', color: '#86efac'}}>
                                {selectedMapEmployee.designation} · {selectedMapEmployee.company_name} · {selectedMapEmployee.last_seen}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="icon-button ghost"
                            onClick={() => setSelectedMapEmployee(null)}
                            style={{background: 'rgba(255,255,255,0.15)', color: '#ffffff'}}
                        >
                            <X size={16}/>
                        </button>
                    </div>

                    <div style={{position: 'relative', width: '100%', height: '440px', background: '#e2e8f0', touchAction: 'auto'}}>
                        <iframe
                            title={`Map for ${selectedMapEmployee.name}`}
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            allowFullScreen
                            src={`https://maps.google.com/maps?q=${selectedMapEmployee.latitude},${selectedMapEmployee.longitude}${mapMode === 'satellite' ? '&t=k' : ''}&hl=gu&z=${zoomLevel}&output=embed`}
                            style={{border: 0, width: '100%', height: '100%', touchAction: 'auto'}}
                        />

                        {/* 🔍 Quick Zoom Controls in Modal */}
                        <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '14px',
                            display: 'flex',
                            gap: '5px',
                            zIndex: 10
                        }}>
                            <button
                                type="button"
                                onClick={() => setZoomLevel(z => Math.min(21, z + 1))}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.95)',
                                    border: '1px solid #cbd5e1',
                                    color: '#0f172a',
                                    fontWeight: 900,
                                    fontSize: '18px',
                                    display: 'grid',
                                    placeItems: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                                }}
                                title="Zoom In (નજીક લાવો)"
                            >
                                +
                            </button>
                            <button
                                type="button"
                                onClick={() => setZoomLevel(z => Math.max(14, z - 1))}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.95)',
                                    border: '1px solid #cbd5e1',
                                    color: '#0f172a',
                                    fontWeight: 900,
                                    fontSize: '18px',
                                    display: 'grid',
                                    placeItems: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                                }}
                                title="Zoom Out (દૂર કરો)"
                            >
                                -
                            </button>
                        </div>
                    </div>

                    <div style={{
                        padding: '12px 18px',
                        background: '#f8faf9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #e2ece5'
                    }}>
                        <div style={{fontSize: '11px', color: '#475569'}}>
                            <b>GPS:</b> {selectedMapEmployee.latitude?.toFixed(6)}, {selectedMapEmployee.longitude?.toFixed(6)}
                            {selectedMapEmployee.accuracy && <span> (±{Math.round(selectedMapEmployee.accuracy)}m)</span>}
                        </div>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <a
                                href={selectedMapEmployee.map_url}
                                target="_blank"
                                rel="noreferrer"
                                className="primary"
                                style={{textDecoration: 'none', padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'}}
                            >
                                <ExternalLink size={14}/> Open in Google Maps App
                            </a>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => setSelectedMapEmployee(null)}
                                style={{padding: '8px 14px', fontSize: '12px'}}
                            >
                                બંધ કરો (Close)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>;
}
