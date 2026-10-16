import React, {useEffect, useRef, useState} from 'react';
import {AlertTriangle, Camera, CheckCircle2, Clock, Clock3, Coffee, ExternalLink, Lock, LogIn, LogOut, MapPin, RefreshCw, Send, Sparkles, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field} from '../components/Common';
import LiveBackCameraModal from '../components/LiveBackCameraModal';
import {getLanguage} from '../utils/translations';

const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatTime = value => new Date(value).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
const location = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(
        position => resolve({latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy}),
        error => {
            if (error?.code === 1) {
                reject(new Error('GPS / લોકેશન પરમિશન બ્લોક કરેલી છે. કૃપા કરીને ફોન/બ્રાઉઝર સેટિંગ્સમાં જઈ લોકેશન Allow કરો અને ફરી પ્રયાસ કરો.'));
            } else if (error?.code === 2) {
                reject(new Error('GPS સિગ્નલ નથી મળી રહ્યું. કૃપા કરીને ખુલ્લી જગ્યામાં આવો અને ફોનમાં Location ચાલુ કરો.'));
            } else if (error?.code === 3) {
                reject(new Error('લોકેશન મેળવવામાં સમય સમાપ્ત થઈ ગયો. ફરીથી પ્રયાસ કરો.'));
            } else {
                reject(new Error('Location permission is required. Enable precise location in device settings and retry.'));
            }
        },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 0}
    );
});

function SelfieModal({mode, onClose, onDone}) {
    const isTimeIn = mode === 'time-in';
    const isUrgentOut = mode === 'urgent-out';
    const isBreakOut = mode === 'break-out';
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [photo, setPhoto] = useState(null);
    const [preview, setPreview] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [cameraKey, setCameraKey] = useState(0);
    const [outReason, setOutReason] = useState('');

    useEffect(() => {
        let alive = true;
        setError('');
        navigator.mediaDevices?.getUserMedia({video: {facingMode: 'user'}, audio: false}).then(stream => {
            if (!alive) return stream.getTracks().forEach(track => track.stop());
            streamRef.current = stream;
            if (videoRef.current) {videoRef.current.srcObject = stream; videoRef.current.play();}
        }).catch(err => {
            if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
                setError('કેમેરા પરમિશન નકારી દેવામાં આવી છે. કૃપા કરીને સેટિંગ્સમાં જઈને Camera access Allow કરો અને Retry બટન દબાવો.');
            } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
                setError('કોઈ કેમેરા ડિવાઇસ મળ્યું નથી. કૃપા કરીને ફ્રન્ટ કેમેરા ચેક કરો.');
            } else {
                setError('Camera permission is required. Allow camera access in browser or app settings, then retry.');
            }
        });
        return () => { alive = false; streamRef.current?.getTracks().forEach(track => track.stop()); };
    }, [cameraKey]);

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    const capture = () => {
        const video = videoRef.current;
        if (!video?.videoWidth) return setError('Camera is not ready yet.');
        const maxDim = 1280;
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(video, 0, 0, width, height);
        canvas.toBlob(blob => {
            if (!blob) return setError('કેમેરામાંથી ફોટો કેપ્ચર થઈ શક્યો નથી. ફરી પ્રયાસ કરો.');
            setPhoto(blob);
            setPreview(URL.createObjectURL(blob));
            streamRef.current?.getTracks().forEach(track => track.stop());
        }, 'image/jpeg', 0.84);
    };

    const submit = async () => {
        if (!photo) return setError('Capture and confirm your selfie first.');
        if (isUrgentOut && !outReason.trim()) return setError('અર્જન્ટ બહાર જવાનું કારણ લખવું જરૂરી છે.');
        setBusy(true); setError(isTimeIn ? 'Getting precise location…' : '');
        try {
            const body = new FormData();
            body.append('selfie', photo, isTimeIn ? 'time-in-selfie.jpg' : isUrgentOut ? 'urgent-out-selfie.jpg' : 'break-out-selfie.jpg');
            if (isTimeIn) {
                const coordinates = await location();
                Object.entries(coordinates).forEach(([key, value]) => body.append(key, value));
            }
            if (isUrgentOut) {
                body.append('break_type', 'urgent_out');
                body.append('out_reason', outReason.trim());
            }
            const endpoint = isTimeIn ? 'attendance/clock-in' : isUrgentOut ? 'attendance/break-in' : 'attendance/break-out';
            await api(endpoint, {method: 'POST', body});
            await onDone();
        } catch (failure) {
            const rawMsg = failure?.message || 'Error';
            setError(rawMsg.includes('SQLSTATE') ? 'સર્વર અપડેટ થઈ રહ્યું છે. કૃપા કરીને પેજ રિફ્રેશ કરીને ફરી પ્રયાસ કરો.' : rawMsg);
        } finally {
            setBusy(false);
        }
    };

    return <div className="modal-backdrop"><div className="modal camera-modal"><div className="panel-head"><div><h2>{isTimeIn ? 'Time In verification' : isUrgentOut ? '🚨 Urgent Out Verification (અર્જન્ટ બહાર)' : 'Break Out verification (પાછા ફર્યા)'}</h2><p>{isTimeIn ? 'Front-camera selfie is required to verify your attendance.' : isUrgentOut ? 'અર્જન્ટ કામ માટે બહાર જતી વખતે લાઈવ સેલ્ફી અને કારણ સબમિટ કરો.' : 'Capture a fresh front-camera selfie before returning to work.'}</p></div><button className="icon-button ghost" onClick={onClose}><X/></button></div>
        {isUrgentOut && (
            <div style={{padding: '0 16px 12px'}}>
                <label style={{display: 'block', fontSize: '12px', fontWeight: 700, color: '#b91c1c', marginBottom: '4px'}}>
                    ⚠️ બહાર જવાનું કારણ (Reason):
                </label>
                <input
                    type="text"
                    value={outReason}
                    onChange={e => setOutReason(e.target.value)}
                    placeholder="દા.ત. દવા લેવા જવાનું છે, બેંક કામ છે, ઘરકામ..."
                    style={{width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1.5px solid #f87171'}}
                    required
                />
            </div>
        )}
        <div className="camera-frame">{preview ? <img src={preview} alt="Captured selfie"/> : <video ref={videoRef} playsInline autoPlay muted/>}<span><Camera size={16}/> Keep your face inside the frame</span></div>
        {error && <div className={error.includes('Getting') ? 'info-banner' : 'error'}>{error}</div>}
        <div className="camera-actions">{preview ? <button className="secondary" onClick={() => {URL.revokeObjectURL(preview); setPhoto(null); setPreview(''); setCameraKey(value => value + 1);}}><RefreshCw size={16}/> Retake</button> : <button className="secondary" onClick={capture}><Camera size={16}/> Capture Selfie</button>}<button className="primary" disabled={!photo || busy || (isUrgentOut && !outReason.trim())} onClick={submit}>{isTimeIn ? <MapPin size={16}/> : isUrgentOut ? '🚨 Confirm Urgent Out' : <Camera size={16}/>} {isTimeIn ? 'Confirm & Time In' : isUrgentOut ? '' : 'Confirm & Return'}</button></div>
    </div></div>;
}

export default function MyAttendancePage({companyId}) {
    const [today, setToday] = useState(null);
    const [history, setHistory] = useState([]);
    const [leaves, setLeaves] = useState([]);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [photoTasks, setPhotoTasks] = useState(null);
    const [timeInOpen, setTimeInOpen] = useState(false);
    const [breakOutOpen, setBreakOutOpen] = useState(false);
    const [urgentOutOpen, setUrgentOutOpen] = useState(false);
    const [cameraModalOpen, setCameraModalOpen] = useState(false);
    const [selectedTaskForPhoto, setSelectedTaskForPhoto] = useState(null);
    const [clockOutForm, setClockOutForm] = useState({work_done: '', learned: ''});
    const [prevClockOutForm, setPrevClockOutForm] = useState({work_done: '', learned: ''});
    const [leaveForm, setLeaveForm] = useState({date_from: localDate(), date_to: localDate(), day_part: 'full_day', reason: '', leave_type_id: ''});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [listeningField, setListeningField] = useState(null);
    const [currentLang, setCurrentLang] = useState(() => getLanguage());

    useEffect(() => {
        const handler = (e) => setCurrentLang(e.detail || getLanguage());
        window.addEventListener('solarflow_language_change', handler);
        return () => window.removeEventListener('solarflow_language_change', handler);
    }, []);

    const load = async () => {
        try {
            const [day, attendance, leaveRows, tasksData, types] = await Promise.all([
                api('attendance/today'),
                api('attendance/mine'),
                api('leaves/mine'),
                api('plant-photos/tasks').catch(() => null),
                api('leave-types').catch(() => [])
            ]);
            setToday(day);
            setHistory(attendance);
            setLeaves(leaveRows);
            if (tasksData) setPhotoTasks(tasksData);
            if (types?.length) setLeaveTypes(types);
        } catch (error) {
            setMessage(error.message);
        }
    };

    useEffect(() => { load(); }, []);

    const clockOut = async event => {
        event.preventDefault();
        const confirmMsg = currentLang === 'en'
            ? 'Are you sure you want to submit your final Time Out and complete your day? Once submitted, attendance is locked for today.'
            : 'શું તમે ખરેખર આજનો દિવસ પૂર્ણ (Final Time Out) કરવા માંગો છો? એકવાર Time Out કર્યા પછી આજે ફરી Time In કરી શકાશે નહીં.';
        if (!window.confirm(confirmMsg)) {
            return;
        }
        setBusy(true);
        setMessage('Submitting work report…');
        try {
            const coordinates = await location();
            await api('attendance/clock-out', {method: 'POST', body: JSON.stringify({...clockOutForm, ...coordinates})});
            setMessage('Time Out completed successfully.');
            setClockOutForm({work_done: '', learned: ''});
            await load();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    };

    const submitPreviousClockOut = async event => {
        event.preventDefault();
        if (!prevClockOutForm.work_done.trim()) {
            alert(currentLang === 'en' ? 'Please describe what work was done yesterday.' : 'ગઈકાલે શું કામ કર્યું હતું તે વિગત લખવી જરૂરી છે.');
            return;
        }
        setBusy(true);
        setMessage('Submitting yesterday\'s work summary…');
        try {
            const coordinates = await location().catch(() => ({}));
            await api('attendance/clock-out', {
                method: 'POST',
                body: JSON.stringify({
                    record_id: today.unclosed_previous_record?.id,
                    attendance_date: today.unclosed_previous_record?.attendance_date,
                    work_done: prevClockOutForm.work_done,
                    learned: prevClockOutForm.learned,
                    ...coordinates
                })
            });
            setMessage(currentLang === 'en' ? 'Yesterday\'s Time Out completed successfully! Today\'s Time In is now unlocked.' : 'ગઈકાલનું Time Out સફળતાપૂર્વક પૂર્ણ થયું! હવે તમે આજનું Time In કરી શકો છો.');
            setPrevClockOutForm({work_done: '', learned: ''});
            await load();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    };

    const requestLeave = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await api('leaves', {method: 'POST', body: JSON.stringify(leaveForm)});
            setMessage('Leave request submitted successfully.');
            setLeaveForm({...leaveForm, reason: ''});
            await load();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    };

    const startBreak = async () => {
        setBusy(true);
        setMessage('');
        try {
            await api('attendance/break-in', {
                method: 'POST',
                body: JSON.stringify({break_type: 'regular'}),
            });
            setMessage('Break started successfully.');
            await load();
        } catch (error) {
            const rawMsg = error?.message || '';
            setMessage(rawMsg.includes('SQLSTATE') ? 'Unable to start break right now. Please try again.' : (rawMsg || 'Unable to start break.'));
        } finally {
            setBusy(false);
        }
    };

    const startVoiceInput = (field) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return alert('તમારા બ્રાઉઝરમાં વૉઇસ રેકોર્ડિંગ સપોર્ટ નથી.');
        const recog = new SpeechRecognition();
        recog.lang = currentLang === 'gu' ? 'gu-IN' : 'hi-IN';
        setListeningField(field);
        recog.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            if (field.startsWith('prev_')) {
                const sub = field.replace('prev_', '');
                setPrevClockOutForm(prev => ({...prev, [sub]: (prev[sub] ? prev[sub] + ' ' : '') + transcript}));
            } else {
                setClockOutForm(prev => ({...prev, [field]: (prev[field] ? prev[field] + ' ' : '') + transcript}));
            }
        };
        recog.onerror = () => setListeningField(null);
        recog.onend = () => setListeningField(null);
        recog.start();
    };

    const dayNote = today?.holiday ? `${today.holiday.name} · ${today.holiday.type.replaceAll('_', ' ')}` : today?.leave ? `Approved ${today.leave.day_part.replaceAll('_', ' ')} leave` : today?.weekly_off ? 'Today is your weekly off' : 'Regular working day';
    const activeBreak = today?.record?.breaks?.find(item => !item.ended_at);
    const breakMinutes = Number(today?.record?.break_minutes || 0);

    if (!today) return <div className="panel">{message || 'Loading attendance…'}</div>;

    const isTimeOutUnlocked = today?.can_clock_out;
    const isClockedInWaiting = today?.is_clocked_in_waiting;

    // Calculate live elapsed work time today
    const elapsedMinutesToday = today?.record?.clock_in_at
        ? Math.max(0, Math.floor(((today.record.clock_out_at ? new Date(today.record.clock_out_at) : new Date()) - new Date(today.record.clock_in_at)) / 60000) - breakMinutes)
        : 0;
    const elapsedHoursFormatted = `${Math.floor(elapsedMinutesToday / 60)}h ${elapsedMinutesToday % 60}m`;

    // Calculate KPI summary metrics from history
    const currentMonthPrefix = localDate().slice(0, 7);
    const totalPresentDays = history.length;
    const fullDaysCount = history.filter(r => r.status === 'full_day').length;
    const halfDaysCount = history.filter(r => r.status === 'half_day').length;
    const thisMonthCount = history.filter(r => String(r.attendance_date || '').startsWith(currentMonthPrefix)).length;
    const totalWorkHours = history.reduce((sum, r) => sum + (Number(r.work_minutes || 0) / 60), 0);
    const avgDailyHours = totalPresentDays > 0 ? (totalWorkHours / totalPresentDays) : 0;
    const totalBreakHours = history.reduce((sum, r) => sum + (Number(r.break_minutes || 0) / 60), 0);
    const totalUrgentOuts = history.reduce((sum, r) => sum + ((r.breaks || []).filter(b => b.break_type === 'urgent_out').length), 0);

    const formatNiceDate = (dateStr) => {
        if (!dateStr) return { main: '-', day: '' };
        try {
            const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
            const main = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const day = d.toLocaleDateString(currentLang === 'en' ? 'en-US' : 'gu-IN', { weekday: 'short' });
            return { main, day };
        } catch (e) {
            return { main: dateStr, day: '' };
        }
    };

    const getStatusBadge = (row) => {
        if (!row.clock_out_at) {
            const isRowToday = String(row.attendance_date).slice(0, 10) === localDate();
            if (isRowToday) {
                return <span className="att-status-pill working">🟢 {currentLang === 'en' ? 'Working Now' : 'હાલમાં ચાલુ'}</span>;
            }
            return <span className="att-status-pill missing">⚠️ {currentLang === 'en' ? 'Out Missing' : 'Time-Out બાકી'}</span>;
        }
        if (row.status === 'full_day') {
            return <span className="att-status-pill full_day">✓ {currentLang === 'en' ? 'Full Day' : 'આખો દિવસ (Full Day)'}</span>;
        }
        if (row.status === 'half_day') {
            return <span className="att-status-pill half_day">◐ {currentLang === 'en' ? 'Half Day' : 'અડધો દિવસ (Half Day)'}</span>;
        }
        return <span className="att-status-pill working">{String(row.status || '').replaceAll('_', ' ')}</span>;
    };

    return (
        <div className="employee-self">
            {/* Top Attendance Status Hero */}
            <section className="attendance-hero panel" style={{flexWrap: 'wrap', gap: '14px'}}>
                <div>
                    <p className="eyebrow">{new Date(`${today.date}T00:00:00`).toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'})}</p>
                    <h2>Hello, {today.employee.user.name}</h2>
                    <p className="day-note">{dayNote}</p>
                    {today.record?.clock_in_at && (
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px'}}>
                            <span style={{background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)', padding: '4px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, color: '#ffffff'}}>
                                🕒 Time In: {formatTime(today.record.clock_in_at)}
                            </span>
                            <span style={{background: 'rgba(134,239,172,0.22)', border: '1px solid rgba(134,239,172,0.45)', padding: '4px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, color: '#ecfdf5'}}>
                                ⏱️ {currentLang === 'en' ? 'Work Time:' : 'કામનો સમય:'} {elapsedHoursFormatted}
                            </span>
                        </div>
                    )}
                </div>
                <div className={`attendance-state ${today.record?.clock_out_at ? 'complete' : today.record ? 'working' : ''}`}>
                    {today.record?.clock_out_at ? <CheckCircle2/> : <Clock3/>}
                    <span>
                        <small>Today’s status</small>
                        <b>
                            {today.record?.status === 'absent'
                                ? (currentLang === 'en' ? 'Absent' : 'ગેરહાજર (Absent)')
                                : today.record?.clock_out_at
                                    ? today.record.status.replaceAll('_', ' ')
                                    : today.record
                                        ? (today.record.status === 'half_day' ? (currentLang === 'en' ? 'Half Day' : 'અડધો દિવસ (Half Day)') : 'Timed in')
                                        : today.holiday?.type === 'full_day'
                                            ? 'Holiday'
                                            : today.leave?.day_part === 'full_day'
                                                ? 'On leave'
                                                : today.manager_attendance_only
                                                    ? 'Awaiting manager'
                                                    : 'Not started'}
                        </b>
                    </span>
                </div>
            </section>

            {message && (
                <div className={message.includes('successfully') || message.includes('submitted') || message.includes('Welcome') ? 'success' : message.includes('Getting') ? 'info-banner' : 'error'}>
                    {message}
                </div>
            )}

            {/* 📸 Plant Photo Tasks Widget for Employees */}
            {photoTasks && (
                <section className="panel" style={{background: '#f0fdf4', border: '1px solid #bbf7d0'}}>
                    <div className="panel-head" style={{marginBottom: '8px'}}>
                        <div>
                            <h2 style={{color: '#14532d', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                <span>📸</span> Today's Plant Photo Inspection Tasks
                            </h2>
                            <p style={{color: '#166534'}}>
                                Scheduled plant inspection and maintenance photos.
                            </p>
                        </div>
                        <span style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            fontSize: '12px',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: '12px',
                            border: '1px solid #86efac'
                        }}>
                            {photoTasks.total_captured} / {photoTasks.total_required} Photos Done
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{background: '#dcfce7', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px'}}>
                        <div style={{background: '#16a34a', height: '100%', width: `${photoTasks.completion_pct}%`, transition: 'width 0.3s'}}/>
                    </div>

                    {/* Scheduled Slots */}
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '12px'}}>
                        {(photoTasks?.tasks || []).map((task) => {
                            const isCurrent = task.is_current_window;
                            const isDone = task.is_completed;

                            return (
                                <div
                                    key={task.id}
                                    style={{
                                        background: isCurrent ? '#ffffff' : (isDone ? '#f8fafc' : '#ffffff'),
                                        border: isCurrent ? '2px solid #16a34a' : (isDone ? '1px solid #86efac' : '1px solid #e2e8f0'),
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px'
                                    }}
                                >
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <b style={{fontSize: '12px', color: '#0f172a'}}>{task.title}</b>
                                        {isDone ? (
                                            <span style={{fontSize: '10px', background: '#dcfce7', color: '#166534', fontWeight: 700, padding: '2px 6px', borderRadius: '4px'}}>
                                                ✓ Done ({task.captured_count}/{task.required_photos})
                                            </span>
                                        ) : isCurrent ? (
                                            <span style={{fontSize: '10px', background: '#fef3c7', color: '#92400e', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', animation: 'pulse 1.5s infinite'}}>
                                                🔴 Active Now
                                            </span>
                                        ) : (
                                            <span style={{fontSize: '10px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, padding: '2px 6px', borderRadius: '4px'}}>
                                                {task.captured_count}/{task.required_photos}
                                            </span>
                                        )}
                                    </div>
                                    <small style={{color: '#64748b', fontSize: '11px'}}>
                                        🕒 {task.start_time} - {task.end_time} &nbsp;|&nbsp; Requires {task.required_photos} Photos
                                    </small>
                                    <button
                                        type="button"
                                        className="secondary"
                                        onClick={() => { setSelectedTaskForPhoto(task); setCameraModalOpen(true); }}
                                        style={{
                                            marginTop: '4px',
                                            fontSize: '11px',
                                            padding: '4px 8px',
                                            background: isCurrent ? '#16a34a' : '#f1f5f9',
                                            color: isCurrent ? '#ffffff' : '#334155',
                                            border: 0,
                                            fontWeight: 700
                                        }}
                                    >
                                        <Camera size={12}/> {isDone ? 'Add More Photo' : 'Capture Photo'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Attendance Actions */}
            {today.manager_attendance_only && (
                <div className="info-banner">
                    <b>Your attendance is recorded by an authorized manager.</b> Self Time In, breaks and Time Out are disabled for your account.
                </div>
            )}

            {/* ⚠️ Forgotten Previous Day Logout Card (Must complete before today's Time In unlocks) */}
            {!today.manager_attendance_only && today.has_unclosed_previous_day && today.unclosed_previous_record && (
                <section className="panel" style={{
                    background: '#fffbeb',
                    border: '2px solid #f59e0b',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.15)',
                    marginBottom: '16px'
                }}>
                    <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px'}}>
                        <div style={{background: '#fef3c7', color: '#b45309', padding: '10px', borderRadius: '10px', fontSize: '24px'}}>
                            ⚠️
                        </div>
                        <div style={{flex: 1}}>
                            <h2 style={{margin: 0, color: '#92400e', fontSize: '16px', fontWeight: 800}}>
                                {currentLang === 'en' ? 'Previous Day Logout Pending!' : 'ગઈકાલનું Time Out (Logout) બાકી રહી ગયેલ છે!'}
                            </h2>
                            <p style={{margin: '4px 0 0', color: '#b45309', fontSize: '13px', lineHeight: '1.45'}}>
                                {currentLang === 'en'
                                    ? `You forgot to Time Out on ${today.unclosed_previous_record.attendance_date} (In: ${today.unclosed_previous_record.clock_in_formatted}). Please fill yesterday's work summary first. Once submitted, today's Time In will unlock.`
                                    : `તમે તારીખ ${today.unclosed_previous_record.attendance_date} (${today.unclosed_previous_record.clock_in_formatted}) ના રોજ પ્લાન્ટ પરથી છૂટતી વખતે Time Out કરવાનું ભૂલી ગયા હતા. કૃપા કરીને પહેલા ગઈકાલના કામની વિગત ભરીને Time Out પૂર્ણ કરો, ત્યારબાદ આજનું નવું Time In ખુલશે.`}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={submitPreviousClockOut} style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                                <label style={{fontSize: '12.5px', fontWeight: 700, color: '#78350f'}}>
                                    📝 {currentLang === 'en' ? 'Yesterday\'s Work Done:' : 'ગઈકાલે શું કામ કર્યું હતું? (Work Summary):'}
                                </label>
                                <button
                                    type="button"
                                    className="voice-input-btn"
                                    onClick={() => startVoiceInput('prev_work_done')}
                                    style={{fontSize: '11px', padding: '2px 8px'}}
                                >
                                    🎤 {listeningField === 'prev_work_done' ? 'Listening…' : 'Speak / બોલો'}
                                </button>
                            </div>
                            <textarea
                                rows="3"
                                value={prevClockOutForm.work_done}
                                onChange={e => setPrevClockOutForm(p => ({...p, work_done: e.target.value}))}
                                placeholder={currentLang === 'en' ? 'Describe solar cleaning, inverter checks, maintenance...' : 'સોલાર પ્લેટ સફાઈ, ઇન્વર્ટર ચેકિંગ, વાયરીંગ કામ...'}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #fcd34d',
                                    fontSize: '13px',
                                    background: '#ffffff'
                                }}
                                required
                            />
                        </div>

                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                                <label style={{fontSize: '12.5px', fontWeight: 700, color: '#78350f'}}>
                                    💡 {currentLang === 'en' ? 'What was learned yesterday?' : 'ગઈકાલે નવું શું શીખવા મળ્યું? (Learnings):'}
                                </label>
                                <button
                                    type="button"
                                    className="voice-input-btn"
                                    onClick={() => startVoiceInput('prev_learned')}
                                    style={{fontSize: '11px', padding: '2px 8px'}}
                                >
                                    🎤 {listeningField === 'prev_learned' ? 'Listening…' : 'Speak / બોલો'}
                                </button>
                            </div>
                            <textarea
                                rows="2"
                                value={prevClockOutForm.learned}
                                onChange={e => setPrevClockOutForm(p => ({...p, learned: e.target.value}))}
                                placeholder={currentLang === 'en' ? 'What new skill or observation did you learn?' : 'દા.ત. નવી ટેકનિક, ફોલ્ટ પકડવાની રીત, સેફ્ટી નિયમ...'}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #fcd34d',
                                    fontSize: '13px',
                                    background: '#ffffff'
                                }}
                            />
                        </div>

                        <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '4px'}}>
                            <button
                                type="submit"
                                disabled={busy || !prevClockOutForm.work_done.trim()}
                                style={{
                                    background: '#d97706',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                    fontWeight: 700,
                                    fontSize: '13.5px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <LogOut size={16}/>
                                <span>{currentLang === 'en' ? 'Submit Yesterday\'s Time Out & Unlock Today' : 'ગઈકાલનું Time Out પૂર્ણ કરો અને આજનું શરૂ કરો'}</span>
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* ❌ Marked Absent by Super Admin Notice */}
            {!today.manager_attendance_only && today.record?.status === 'absent' && (
                <section className="panel" style={{
                    background: '#fef2f2',
                    border: '2px solid #ef4444',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)',
                    marginBottom: '16px'
                }}>
                    <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
                        <div style={{background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '10px', fontSize: '24px'}}>
                            ❌
                        </div>
                        <div>
                            <h2 style={{margin: 0, color: '#991b1b', fontSize: '16px', fontWeight: 800}}>
                                {currentLang === 'en' ? 'Marked Absent by Super Admin' : 'સુપર એડમિન દ્વારા ગેરહાજર (Absent) માર્ક કરવામાં આવેલ છે'}
                            </h2>
                            <p style={{margin: '6px 0 0', color: '#b91c1c', fontSize: '13.5px', lineHeight: '1.45'}}>
                                {currentLang === 'en'
                                    ? `Reason: ${today.record.correction_reason || 'Employee was not present at the solar plant.'}`
                                    : `કારણ: ${today.record.correction_reason || 'કર્મચારી સોલાર પ્લાન્ટ પર હાજર ન હોવાથી ગેરહાજર માર્ક કરેલ છે.'}`}
                            </p>
                            <small style={{display: 'block', marginTop: '6px', color: '#7f1d1d', fontSize: '11.5px'}}>
                                {currentLang === 'en' ? 'Today\'s shift is closed as Absent.' : 'આજના દિવસ માટે હાજરી ગેરહાજર તરીકે બંધ થયેલ છે.'}
                            </small>
                        </div>
                    </div>
                </section>
            )}

            {!today.manager_attendance_only && !today.record && (
                <section className="panel clock-card">
                    <div className="clock-icon"><LogIn/></div>
                    <div>
                        <h2>Ready to start your day?</h2>
                        <p>
                            {today.has_unclosed_previous_day
                                ? (currentLang === 'en' ? '⚠️ Complete yesterday\'s pending Time Out above to unlock.' : '⚠️ ગઈકાલનું બાકી Time Out ઉપર ભરો એટલે Time In ખુલશે.')
                                : 'Your Time In is recorded with a front-camera selfie.'}
                        </p>
                    </div>
                    <button className="primary" disabled={!today.can_clock_in} onClick={() => setTimeInOpen(true)}>
                        Time In
                    </button>
                </section>
            )}

            {/* Break & Urgent Out Card */}
            {!today.manager_attendance_only && today.record && today.record.status !== 'absent' && !today.record.clock_out_at && (
                <section className={`panel break-card ${activeBreak ? 'active' : ''}`} style={{
                    borderColor: activeBreak?.break_type === 'urgent_out' ? '#f87171' : undefined,
                    background: activeBreak?.break_type === 'urgent_out' ? '#fff5f5' : undefined,
                }}>
                    <div className="clock-icon" style={{
                        background: activeBreak?.break_type === 'urgent_out' ? '#fee2e2' : undefined,
                        color: activeBreak?.break_type === 'urgent_out' ? '#dc2626' : undefined,
                    }}>
                        {activeBreak?.break_type === 'urgent_out' ? <LogOut size={20}/> : <Coffee/>}
                    </div>
                    <div style={{flex: 1}}>
                        <h2>
                            {activeBreak
                                ? (activeBreak.break_type === 'urgent_out' ? '🚨 અર્જન્ટ બહાર ગયેલ છે (Urgent Out)' : 'Break in progress')
                                : 'Break or Urgent Out? (બ્રેક અથવા અર્જન્ટ બહાર)'}
                        </h2>
                        <p>
                            {activeBreak
                                ? (activeBreak.break_type === 'urgent_out'
                                    ? `બહાર જવાનું કારણ: "${activeBreak.out_reason || 'અર્જન્ટ કામ'}" · શરૂ સમય: ${formatTime(activeBreak.started_at)}. પ્લાન્ટ પર પાછા ફરો ત્યારે સેલ્ફી સાથે Return કરો.`
                                    : `Started at ${formatTime(activeBreak.started_at)}. A fresh selfie is required when you break out.`)
                                : `${(breakMinutes / 60).toFixed(2)} break hours recorded today. અર્જન્ટ બહાર જવું હોય તો સેલ્ફી અને કારણ સાથે Urgent Out કરો.`
                            }
                        </p>
                    </div>
                    <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
                        {activeBreak ? (
                            <button
                                className="primary"
                                disabled={busy}
                                onClick={() => setBreakOutOpen(true)}
                                style={{
                                    background: activeBreak.break_type === 'urgent_out' ? '#dc2626' : undefined,
                                    borderColor: activeBreak.break_type === 'urgent_out' ? '#b91c1c' : undefined,
                                }}
                            >
                                <Camera size={15}/> {activeBreak.break_type === 'urgent_out' ? '📸 પાછા ફર્યા (Return & Selfie)' : 'Break out (Return)'}
                            </button>
                        ) : (
                            <>
                                <button className="secondary" disabled={busy} onClick={() => startBreak()}>
                                    ☕ Regular Break
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setUrgentOutOpen(true)}
                                    style={{
                                        background: '#dc2626',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '9px 14px',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    🚨 Urgent Out (અર્જન્ટ બહાર)
                                </button>
                            </>
                        )}
                    </div>
                </section>
            )}

            {/* Clock Out / Complete Day Form with Time Lock rules */}
            {!today.manager_attendance_only && today.record && today.record.status !== 'absent' && !today.record.clock_out_at && (
                <form className="panel clockout-card" onSubmit={clockOut}>
                    <div className="panel-head" style={{marginBottom: '12px'}}>
                        <div>
                            <h2>Complete your day (Final Time Out)</h2>
                            <p>Timed in at {formatTime(today.record.clock_in_at)}. Please provide your daily work summary.</p>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                            <span className="att-time-badge in">🕒 In: {formatTime(today.record.clock_in_at)}</span>
                            <span className="att-time-badge out">⏱️ {elapsedHoursFormatted}</span>
                            <LogOut style={{color: '#16a34a'}}/>
                        </div>
                    </div>

                    {/* Time Out Rule Notice Banner */}
                    {isClockedInWaiting ? (
                        <div style={{
                            background: '#fef3c7',
                            border: '1px solid #fde68a',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            marginBottom: '14px',
                            color: '#92400e',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <Lock size={16} style={{color: '#d97706', flexShrink: 0}}/>
                            <span>
                                <b>{currentLang === 'en' ? 'Time-Out Notice:' : 'ટાઈમ-આઉટ સૂચના:'}</b> {currentLang === 'en' ? 'Minimum 30 minutes of work is required after Time-In before Time-Out can be submitted.' : 'Time-In કર્યાના ઓછામાં ઓછા ૩૦ મિનિટ પછી Time-Out નું બટન સક્રિય થશે.'}
                            </span>
                        </div>
                    ) : (
                        <div style={{
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            marginBottom: '14px',
                            color: '#065f46',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <CheckCircle2 size={16} style={{color: '#16a34a', flexShrink: 0}}/>
                            <span>
                                <b>{currentLang === 'en' ? 'Time-Out Ready:' : 'ટાઈમ-આઉટ કરી શકો છો:'}</b> {currentLang === 'en' ? 'Fill in your daily work summary below and confirm Time-Out.' : 'આજે કરેલા કામની વિગત ભરીને Time Out કરી શકો છો.'}
                            </span>
                        </div>
                    )}

                    {activeBreak && (
                        <div style={{
                            background: '#fff1f2',
                            border: '1.5px solid #fda4af',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            marginBottom: '14px',
                            color: '#9f1239',
                            fontSize: '12.5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <span>
                                <b>⚠️ {currentLang === 'en' ? 'Active Break in Progress:' : 'હાલમાં તમારો બ્રેક ચાલુ છે:'}</b>{' '}
                                {currentLang === 'en'
                                    ? 'Please complete your break with a return selfie before submitting Final Time Out.'
                                    : 'Final Time Out કરતા પહેલાં સેલ્ફી લઈને બ્રેક પૂર્ણ (Break Out / Return) કરવો જરૂરી છે.'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setBreakOutOpen(true)}
                                style={{
                                    background: '#e11d48',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 12px',
                                    borderRadius: '7px',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                <Camera size={14}/> {currentLang === 'en' ? 'End Break & Return' : '📸 અહીંથી બ્રેક પૂરો કરો'}
                            </button>
                        </div>
                    )}

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px'}}>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <label style={{fontSize: '13px', fontWeight: 800, color: '#1e293b'}}>
                                    🛠️ {currentLang === 'en' ? 'What did you do today?' : 'What did you do today? (આજે શું કામ કર્યું?)'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => startVoiceInput('work_done')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: listeningField === 'work_done' ? '#fee2e2' : '#f1f5f9',
                                        border: listeningField === 'work_done' ? '1px solid #f87171' : '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        color: listeningField === 'work_done' ? '#dc2626' : '#0284c7',
                                        cursor: 'pointer'
                                    }}
                                    title="બોલીને લખવા માટે માઇક દબાવો"
                                >
                                    {listeningField === 'work_done' ? '🔴 Listening…' : `🎙️ ${currentLang === 'en' ? 'Speak' : 'બોલીને લખો'}`}
                                </button>
                            </div>
                            <textarea
                                value={clockOutForm.work_done}
                                onChange={event => setClockOutForm({...clockOutForm, work_done: event.target.value})}
                                rows="4"
                                placeholder={currentLang === 'en' ? 'Describe the work performed today (e.g. cleaned panels, checked inverters, grass cutting)...' : 'આજે પ્લાન્ટ પર કરેલું કામ લખો અથવા માઇકથી બોલો (દા.ત. પેનલ સફાઈ, ઇન્વર્ટર ચેકિંગ)...'}
                                required
                            />
                        </div>

                        <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <label style={{fontSize: '13px', fontWeight: 800, color: '#1e293b'}}>
                                    💡 {currentLang === 'en' ? 'What did you learn or observe today?' : 'What did you learn today? (આજે નવું શું શીખ્યા / નોંધ્યું?)'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => startVoiceInput('learned')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: listeningField === 'learned' ? '#fee2e2' : '#f1f5f9',
                                        border: listeningField === 'learned' ? '1px solid #f87171' : '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        color: listeningField === 'learned' ? '#dc2626' : '#0284c7',
                                        cursor: 'pointer'
                                    }}
                                    title="બોલીને લખવા માટે માઇક દબાવો"
                                >
                                    {listeningField === 'learned' ? '🔴 Listening…' : `🎙️ ${currentLang === 'en' ? 'Speak' : 'બોલીને લખો'}`}
                                </button>
                            </div>
                            <textarea
                                value={clockOutForm.learned}
                                onChange={event => setClockOutForm({...clockOutForm, learned: event.target.value})}
                                rows="4"
                                placeholder={currentLang === 'en' ? 'What new skills, observations, or issues did you encounter today...' : 'આજે કોઈ નવી ટેકનિક, નિરીક્ષણ કે સમસ્યા ધ્યાનમાં આવી હોય તે લખો...'}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-actions" style={{borderTop: '1px solid #e2e8f0', paddingTop: '12px'}}>
                        <span style={{fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px'}}>
                            📍 {currentLang === 'en' ? 'GPS location is verified at Time Out (no selfie required).' : 'Final Time Out વખતે માત્ર GPS લોકેશન લેવાશે (ફોટો જરૂરી નથી).'}
                        </span>
                        <button className="primary" disabled={busy || Boolean(activeBreak) || !isTimeOutUnlocked} title="Confirm Time Out" style={{padding: '10px 20px', fontSize: '14px'}}>
                            <MapPin size={16}/> Final Time Out
                        </button>
                    </div>
                </form>
            )}

            {today.record?.clock_out_at && (
                <section className="panel completed-day">
                    <CheckCircle2/>
                    <div>
                        <h2>Attendance complete for today</h2>
                        <p>{formatTime(today.record.clock_in_at)} – {formatTime(today.record.clock_out_at)} · {(today.record.work_minutes / 60).toFixed(2)} work hours · {(breakMinutes / 60).toFixed(2)} break hours</p>
                    </div>
                </section>
            )}

            {/* Leave Request and Recent Leaves */}
            <div className="self-grid">
                <form className="panel" onSubmit={requestLeave}>
                    <div className="panel-head">
                        <div>
                            <h2>{currentLang === 'en' ? 'Request Leave' : 'Request leave (રજાની અરજી)'}</h2>
                            <p>Half-day or full-day leave approval by manager.</p>
                        </div>
                        <Send/>
                    </div>
                    <div className="form-grid two">
                        <Field label={currentLang === 'en' ? 'Leave type' : 'રજાનો પ્રકાર (Leave Type)'}>
                            <select value={leaveForm.leave_type_id} onChange={event => setLeaveForm({...leaveForm, leave_type_id: event.target.value})}>
                                <option value="">{currentLang === 'en' ? 'General Leave (Default)' : 'જનરલ રજા (General Leave)'}</option>
                                {leaveTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} {t.paid ? '(Paid)' : '(Unpaid)'}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Day type">
                            <select value={leaveForm.day_part} onChange={event => setLeaveForm({...leaveForm, day_part: event.target.value})}>
                                <option value="full_day">Full day</option>
                                <option value="first_half">First half (Morning)</option>
                                <option value="second_half">Second half (Afternoon)</option>
                            </select>
                        </Field>
                        <Field label="From">
                            <input type="date" value={leaveForm.date_from} onChange={event => setLeaveForm({...leaveForm, date_from: event.target.value})} required/>
                        </Field>
                        <Field label="To">
                            <input type="date" value={leaveForm.date_to} onChange={event => setLeaveForm({...leaveForm, date_to: event.target.value})} required/>
                        </Field>
                    </div>
                    <Field label="Reason">
                        <textarea value={leaveForm.reason} onChange={event => setLeaveForm({...leaveForm, reason: event.target.value})} rows="3" placeholder="State reason for leave..." required/>
                    </Field>
                    <div className="form-actions">
                        <button className="primary" disabled={busy}>Submit leave request</button>
                    </div>
                </form>

                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Recent leave requests</h2>
                            <p>Your latest approval status</p>
                        </div>
                    </div>
                    {leaves.length ? (
                        <div className="simple-list">
                            {leaves.slice(0, 8).map(leave => {
                                const daysDiff = Math.max(1, Math.round((new Date(leave.date_to) - new Date(leave.date_from)) / 86400000) + 1);
                                return (
                                    <div key={leave.id} style={{padding: '12px 4px'}}>
                                        <span>
                                            <b style={{fontSize: '13px', color: '#0f172a'}}>
                                                📅 {leave.date_from === leave.date_to ? leave.date_from : `${leave.date_from} → ${leave.date_to}`}
                                                <span style={{marginLeft: '6px', fontSize: '11px', color: '#15803d', background: '#f0fdf4', padding: '2px 6px', borderRadius: '6px'}}>
                                                    {leave.day_part === 'full_day' ? `${daysDiff} Day${daysDiff > 1 ? 's' : ''}` : leave.day_part.replaceAll('_', ' ')}
                                                </span>
                                            </b>
                                            {leave.reason && <small style={{color: '#475569', fontSize: '11.5px'}}>“{leave.reason}”</small>}
                                        </span>
                                        <i className={`status ${leave.status === 'approved' ? 'on' : leave.status === 'rejected' ? 'danger' : 'warning'}`} style={{textTransform: 'capitalize', fontWeight: 700}}>
                                            {leave.status}
                                        </i>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <Empty title="No leave requests" detail="Submitted requests and decisions will appear here."/>
                    )}
                </section>
            </div>

            {/* Recent Attendance Records (Enhanced with Summary KPIs + Desktop Table + Mobile Cards) */}
            <section className="panel">
                <div className="panel-head" style={{marginBottom: '14px'}}>
                    <div>
                        <h2>{currentLang === 'en' ? 'Recent Attendance & Work History' : 'હાજરી અને કામનો રેકોર્ડ (Recent Attendance)'}</h2>
                        <p>{currentLang === 'en' ? 'Your last 45 attendance records, work hours, and daily summaries' : 'તમારા છેલ્લા ૪૫ દિવસની હાજરી, કામના કલાકો અને બ્રેકની સંપૂર્ણ વિગત'}</p>
                    </div>
                    <span style={{background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 800}}>
                        📋 {history.length} Records
                    </span>
                </div>

                {/* 4 KPI Summary Cards */}
                {history.length > 0 && (
                    <div className="att-kpi-grid">
                        <div className="att-kpi-card">
                            <div className="att-kpi-icon" style={{background: '#dcfce7', color: '#15803d'}}>
                                <CheckCircle2 size={20}/>
                            </div>
                            <div className="att-kpi-info">
                                <small>{currentLang === 'en' ? 'Total Present' : 'કુલ હાજર દિવસ'}</small>
                                <strong>{totalPresentDays} Days</strong>
                                <span>{fullDaysCount} Full · {halfDaysCount} Half Day</span>
                            </div>
                        </div>

                        <div className="att-kpi-card">
                            <div className="att-kpi-icon" style={{background: '#dbeafe', color: '#1d4ed8'}}>
                                <Clock size={20}/>
                            </div>
                            <div className="att-kpi-info">
                                <small>{currentLang === 'en' ? 'Total Work Hours' : 'કુલ કામના કલાકો'}</small>
                                <strong>{totalWorkHours.toFixed(1)} hrs</strong>
                                <span>Avg {avgDailyHours.toFixed(1)} hrs / day</span>
                            </div>
                        </div>

                        <div className="att-kpi-card">
                            <div className="att-kpi-icon" style={{background: '#fef3c7', color: '#b45309'}}>
                                <Sparkles size={20}/>
                            </div>
                            <div className="att-kpi-info">
                                <small>{currentLang === 'en' ? 'This Month' : 'આ મહિનાની હાજરી'}</small>
                                <strong>{thisMonthCount} Days</strong>
                                <span>{new Date().toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</span>
                            </div>
                        </div>

                        <div className="att-kpi-card">
                            <div className="att-kpi-icon" style={{background: totalUrgentOuts > 0 ? '#fee2e2' : '#f1f5f9', color: totalUrgentOuts > 0 ? '#dc2626' : '#475569'}}>
                                <Coffee size={20}/>
                            </div>
                            <div className="att-kpi-info">
                                <small>{currentLang === 'en' ? 'Breaks & Urgent Out' : 'બ્રેક અને અર્જન્ટ બહાર'}</small>
                                <strong>{totalBreakHours.toFixed(1)} hrs</strong>
                                <span>{totalUrgentOuts > 0 ? `${totalUrgentOuts} Urgent Out` : 'Regular breaks'}</span>
                            </div>
                        </div>
                    </div>
                )}

                {history.length ? (
                    <>
                        {/* Desktop Table View */}
                        <div className="table-wrap att-desktop-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>{currentLang === 'en' ? 'Date & Day' : 'તારીખ અને વાર'}</th>
                                        <th>{currentLang === 'en' ? 'Time In' : 'આવવાનો સમય'}</th>
                                        <th>{currentLang === 'en' ? 'Time Out' : 'જવાનો સમય'}</th>
                                        <th>{currentLang === 'en' ? 'Status' : 'સ્ટેટસ'}</th>
                                        <th>{currentLang === 'en' ? 'Work Hours' : 'કામના કલાકો'}</th>
                                        <th>{currentLang === 'en' ? 'Breaks' : 'બ્રેક વિગત'}</th>
                                        <th>{currentLang === 'en' ? 'Work Summary' : 'આજનું કામ / નોંધ'}</th>
                                        <th>{currentLang === 'en' ? 'Source' : 'એન્ટ્રી'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(row => {
                                        const { main: dateMain, day: dayName } = formatNiceDate(row.attendance_date);
                                        const urgentBreaks = (row.breaks || []).filter(b => b.break_type === 'urgent_out');
                                        const workHrs = (Number(row.work_minutes || 0) / 60).toFixed(2);
                                        const breakHrs = (Number(row.break_minutes || 0) / 60).toFixed(2);

                                        return (
                                            <tr key={row.id}>
                                                <td>
                                                    <div style={{display: 'flex', flexDirection: 'column'}}>
                                                        <b style={{color: '#0f172a', fontSize: '13px'}}>{dateMain}</b>
                                                        <small style={{color: '#64748b', fontSize: '11px', fontWeight: 600}}>{dayName}</small>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="att-time-badge in">
                                                        🟢 {formatTime(row.clock_in_at)}
                                                    </span>
                                                </td>
                                                <td>
                                                    {row.clock_out_at ? (
                                                        <span className="att-time-badge out">
                                                            🔵 {formatTime(row.clock_out_at)}
                                                        </span>
                                                    ) : (
                                                        <span className="att-time-badge missing">
                                                            {String(row.attendance_date).slice(0, 10) === localDate() ? '⏳ Working…' : '⚠️ Missing'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>{getStatusBadge(row)}</td>
                                                <td>
                                                    <b style={{color: '#0f172a', fontSize: '13px'}}>{workHrs} hrs</b>
                                                    <small style={{display: 'block', color: '#64748b', fontSize: '10.5px'}}>{row.work_minutes || 0} mins</small>
                                                </td>
                                                <td>
                                                    <span style={{fontWeight: 700, color: '#334155', fontSize: '12.5px'}}>{breakHrs} hrs</span>
                                                    {urgentBreaks.length > 0 && (
                                                        <small style={{display: 'block', color: '#dc2626', fontSize: '10.5px', fontWeight: 700}}>
                                                            🚨 {urgentBreaks.length} Urgent Out {urgentBreaks[0]?.out_reason ? `(${urgentBreaks[0].out_reason})` : ''}
                                                        </small>
                                                    )}
                                                </td>
                                                <td style={{maxWidth: '240px', whiteSpace: 'normal'}}>
                                                    {row.work_done ? (
                                                        <div style={{fontSize: '12px', color: '#1e293b', lineHeight: 1.35}}>
                                                            <span>{row.work_done}</span>
                                                            {row.learned && (
                                                                <small style={{display: 'block', color: '#64748b', marginTop: '2px'}}>
                                                                    💡 {row.learned}
                                                                </small>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{color: '#94a3b8', fontSize: '11.5px'}}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {row.entry_source === 'manager' ? (
                                                        <span className="manual-entry-detail">
                                                            <i className="status warning">Manager</i>
                                                            <small>{row.recorded_by?.name || 'Admin'}</small>
                                                        </span>
                                                    ) : (
                                                        <span style={{fontSize: '11.5px', fontWeight: 700, color: '#15803d', background: '#f0fdf4', padding: '3px 8px', borderRadius: '6px'}}>
                                                            🤳 Self
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Responsive Card View */}
                        <div className="att-mobile-list">
                            {history.map(row => {
                                const { main: dateMain, day: dayName } = formatNiceDate(row.attendance_date);
                                const urgentBreaks = (row.breaks || []).filter(b => b.break_type === 'urgent_out');
                                const workHrs = (Number(row.work_minutes || 0) / 60).toFixed(2);
                                const breakHrs = (Number(row.break_minutes || 0) / 60).toFixed(2);

                                return (
                                    <div
                                        key={row.id}
                                        style={{
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            padding: '12px 14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)'
                                        }}
                                    >
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px'}}>
                                            <div>
                                                <b style={{fontSize: '14px', color: '#0f172a'}}>{dateMain}</b>
                                                <span style={{marginLeft: '6px', fontSize: '11.5px', color: '#64748b', fontWeight: 600}}>({dayName})</span>
                                            </div>
                                            {getStatusBadge(row)}
                                        </div>

                                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center'}}>
                                            <span className="att-time-badge in">🟢 In: {formatTime(row.clock_in_at)}</span>
                                            {row.clock_out_at ? (
                                                <span className="att-time-badge out">🔵 Out: {formatTime(row.clock_out_at)}</span>
                                            ) : (
                                                <span className="att-time-badge missing">
                                                    {String(row.attendance_date).slice(0, 10) === localDate() ? '⏳ Working Now' : '⚠️ Out Missing'}
                                                </span>
                                            )}
                                            <span style={{marginLeft: 'auto', fontSize: '12px', fontWeight: 800, color: '#0f172a', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px'}}>
                                                ⏱️ {workHrs} hrs
                                            </span>
                                        </div>

                                        {(Number(row.break_minutes) > 0 || urgentBreaks.length > 0) && (
                                            <div style={{fontSize: '11.5px', color: '#475569', display: 'flex', justifyContent: 'space-between', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px'}}>
                                                <span>☕ Break: <b>{breakHrs} hrs</b></span>
                                                {urgentBreaks.length > 0 && (
                                                    <span style={{color: '#dc2626', fontWeight: 700}}>
                                                        🚨 Urgent Out: {urgentBreaks[0]?.out_reason || 'Yes'}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {row.work_done && (
                                            <div style={{fontSize: '12px', color: '#334155', background: '#f0fdf4', border: '1px solid #dcfce7', padding: '8px 10px', borderRadius: '8px', lineHeight: 1.4}}>
                                                <div><b>🛠️ Work:</b> {row.work_done}</div>
                                                {row.learned && <div style={{marginTop: '3px', color: '#166534'}}><b>💡 Note:</b> {row.learned}</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <Empty title="No attendance yet" detail={today.manager_attendance_only ? 'An authorized manager will add your completed attendance.' : 'Your first Time In will create a record.'}/>
                )}
            </section>

            {/* Camera Modals */}
            {timeInOpen && (
                <SelfieModal mode="time-in" onClose={() => setTimeInOpen(false)} onDone={async () => { setTimeInOpen(false); setMessage('Time In completed successfully.'); await load(); }}/>
            )}

            {breakOutOpen && (
                <SelfieModal mode="break-out" onClose={() => setBreakOutOpen(false)} onDone={async () => { setBreakOutOpen(false); setMessage('Welcome back. Break completed successfully.'); await load(); }}/>
            )}

            {urgentOutOpen && (
                <SelfieModal mode="urgent-out" onClose={() => setUrgentOutOpen(false)} onDone={async () => { setUrgentOutOpen(false); setMessage('Urgent out recorded with selfie and reason.'); await load(); }}/>
            )}

            {cameraModalOpen && (
                <LiveBackCameraModal
                    task={selectedTaskForPhoto}
                    companyId={companyId}
                    onClose={() => setCameraModalOpen(false)}
                    onUploaded={async () => {
                        setMessage('Plant photo uploaded successfully.');
                        await load();
                    }}
                />
            )}
        </div>
    );
}
