import React, {useEffect, useRef, useState} from 'react';
import {Camera, CheckCircle2, Clock3, Coffee, LogIn, LogOut, MapPin, RefreshCw, Send, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field} from '../components/Common';

const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatTime = value => new Date(value).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
const location = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(position => resolve({latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy}), () => reject(new Error('Location permission is required. Enable precise location in device settings and retry.')), {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
});

function SelfieModal({mode, onClose, onDone}) {
    const isTimeIn = mode === 'time-in';
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [photo, setPhoto] = useState(null);
    const [preview, setPreview] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [cameraKey, setCameraKey] = useState(0);
    useEffect(() => {
        let alive = true;
        setError('');
        navigator.mediaDevices?.getUserMedia({video: {facingMode: 'user'}, audio: false}).then(stream => {
            if (!alive) return stream.getTracks().forEach(track => track.stop());
            streamRef.current = stream;
            if (videoRef.current) {videoRef.current.srcObject = stream; videoRef.current.play();}
        }).catch(() => setError('Camera permission is required. Allow camera access in browser or app settings, then retry.'));
        return () => { alive = false; streamRef.current?.getTracks().forEach(track => track.stop()); };
    }, [cameraKey]);
    const capture = () => {
        const video = videoRef.current;
        if (!video?.videoWidth) return setError('Camera is not ready yet.');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob(blob => {setPhoto(blob); setPreview(URL.createObjectURL(blob)); streamRef.current?.getTracks().forEach(track => track.stop());}, 'image/jpeg', .86);
    };
    const submit = async () => {
        if (!photo) return setError('Capture and confirm your selfie first.');
        setBusy(true); setError(isTimeIn ? 'Getting precise location…' : '');
        try {
            const body = new FormData();
            body.append('selfie', photo, isTimeIn ? 'time-in-selfie.jpg' : 'break-out-selfie.jpg');
            if (isTimeIn) {
                const coordinates = await location();
                Object.entries(coordinates).forEach(([key, value]) => body.append(key, value));
            }
            await api(isTimeIn ? 'attendance/clock-in' : 'attendance/break-out', {method: 'POST', body});
            await onDone();
        } catch (failure) { setError(failure.message); setBusy(false); }
    };
    return <div className="modal-backdrop"><div className="modal camera-modal"><div className="panel-head"><div><h2>{isTimeIn ? 'Time In verification' : 'Break Out verification'}</h2><p>{isTimeIn ? 'Front-camera selfie and live GPS are compulsory.' : 'Capture a fresh front-camera selfie before returning to work.'}</p></div><button className="icon-button ghost" onClick={onClose}><X/></button></div>
        <div className="camera-frame">{preview ? <img src={preview} alt="Captured selfie"/> : <video ref={videoRef} playsInline muted/>}<span><Camera size={18}/> Keep your full face inside the frame</span></div>
        {error && <div className={error.includes('Getting') ? 'info-banner' : 'error'}>{error}</div>}
        <div className="camera-actions">{preview ? <button className="secondary" onClick={() => {URL.revokeObjectURL(preview); setPhoto(null); setPreview(''); setCameraKey(value => value + 1);}}><RefreshCw size={16}/> Retake</button> : <button className="secondary" onClick={capture}><Camera size={16}/> Capture selfie</button>}<button className="primary" disabled={!photo || busy} onClick={submit}>{isTimeIn ? <MapPin size={16}/> : <Camera size={16}/>} {isTimeIn ? 'Confirm location & time in' : 'Confirm selfie & break out'}</button></div>
    </div></div>;
}

export default function MyAttendancePage() {
    const [today, setToday] = useState(null);
    const [history, setHistory] = useState([]);
    const [leaves, setLeaves] = useState([]);
    const [timeInOpen, setTimeInOpen] = useState(false);
    const [breakOutOpen, setBreakOutOpen] = useState(false);
    const [clockOutForm, setClockOutForm] = useState({work_done: '', learned: ''});
    const [leaveForm, setLeaveForm] = useState({date_from: localDate(), date_to: localDate(), day_part: 'full_day', reason: ''});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const load = async () => {
        const [day, attendance, leaveRows] = await Promise.all([api('attendance/today'), api('attendance/mine'), api('leaves/mine')]);
        setToday(day); setHistory(attendance); setLeaves(leaveRows);
    };
    useEffect(() => { load().catch(error => setMessage(error.message)); }, []);

    const clockOut = async event => {
        event.preventDefault(); setBusy(true); setMessage('Getting precise location…');
        try {
            const coordinates = await location();
            await api('attendance/clock-out', {method: 'POST', body: JSON.stringify({...clockOutForm, ...coordinates})});
            setMessage('Time Out completed successfully.'); setClockOutForm({work_done: '', learned: ''}); await load();
        } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    };
    const requestLeave = async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        try { await api('leaves', {method: 'POST', body: JSON.stringify(leaveForm)}); setMessage('Leave request submitted.'); setLeaveForm({...leaveForm, reason: ''}); await load(); }
        catch (error) { setMessage(error.message); } finally { setBusy(false); }
    };
    const startBreak = async () => {
        setBusy(true); setMessage('');
        try {
            await api('attendance/break-in', {method: 'POST'});
            setMessage('Break started successfully.');
            await load();
        } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    };
    const dayNote = today?.holiday ? `${today.holiday.name} · ${today.holiday.type.replaceAll('_', ' ')}` : today?.leave ? `Approved ${today.leave.day_part.replaceAll('_', ' ')} leave` : today?.weekly_off ? 'Today is your weekly off' : 'Regular working day';
    const activeBreak = today?.record?.breaks?.find(item => !item.ended_at);
    const breakMinutes = Number(today?.record?.break_minutes || 0);

    if (!today) return <div className="panel">{message || 'Loading attendance…'}</div>;
    return <div className="employee-self"><section className="attendance-hero panel"><div><p className="eyebrow">{new Date(`${today.date}T00:00:00`).toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'})}</p><h2>Hello, {today.employee.user.name}</h2><p className="day-note">{dayNote}</p></div><div className={`attendance-state ${today.record?.clock_out_at ? 'complete' : today.record ? 'working' : ''}`}>{today.record?.clock_out_at ? <CheckCircle2/> : <Clock3/>}<span><small>Today’s status</small><b>{today.record?.clock_out_at ? today.record.status.replaceAll('_', ' ') : today.record ? 'Timed in' : today.holiday?.type === 'full_day' ? 'Holiday' : today.leave?.day_part === 'full_day' ? 'On leave' : today.manager_attendance_only ? 'Awaiting manager' : 'Not started'}</b></span></div></section>
        {message && <div className={message.includes('successfully') || message.includes('submitted') || message.includes('Welcome') ? 'success' : message.includes('Getting') ? 'info-banner' : 'error'}>{message}</div>}
        {today.manager_attendance_only && <div className="info-banner"><b>Your attendance is recorded by an authorized manager.</b> Self Time In, breaks and Time Out are disabled for your account.</div>}
        {!today.manager_attendance_only && !today.record && <section className="panel clock-card"><div className="clock-icon"><LogIn/></div><div><h2>Ready to start?</h2><p>Your Time In is recorded by the server. A selfie and precise location are required.</p></div><button className="primary" disabled={!today.can_clock_in} onClick={() => setTimeInOpen(true)}>Time In</button></section>}
        {!today.manager_attendance_only && today.record && !today.record.clock_out_at && <section className={`panel break-card ${activeBreak ? 'active' : ''}`}><div className="clock-icon"><Coffee/></div><div><h2>{activeBreak ? 'Break in progress' : 'Need a break?'}</h2><p>{activeBreak ? `Started at ${formatTime(activeBreak.started_at)}. A fresh selfie is required when you break out.` : `${(breakMinutes / 60).toFixed(2)} break hours recorded today. You can take multiple breaks.`}</p></div><button className={activeBreak ? 'primary' : 'secondary'} disabled={busy} onClick={() => activeBreak ? setBreakOutOpen(true) : startBreak()}>{activeBreak ? 'Break out' : 'Break in'}</button></section>}
        {!today.manager_attendance_only && today.record && !today.record.clock_out_at && <form className="panel clockout-card" onSubmit={clockOut}><div className="panel-head"><div><h2>Complete your day</h2><p>Timed in at {formatTime(today.record.clock_in_at)}. Location is compulsory at final Time Out.</p></div><LogOut/></div>{activeBreak && <div className="info-banner">Break out before completing your day.</div>}<Field label="What did you do today?"><textarea value={clockOutForm.work_done} onChange={event => setClockOutForm({...clockOutForm, work_done: event.target.value})} rows="4" required/></Field><Field label="What did you learn today?"><textarea value={clockOutForm.learned} onChange={event => setClockOutForm({...clockOutForm, learned: event.target.value})} rows="4" required/></Field><div className="form-actions"><span>No photo is taken at final Time Out.</span><button className="primary" disabled={busy || Boolean(activeBreak)}><MapPin size={16}/> Final Time Out</button></div></form>}
        {today.record?.clock_out_at && <section className="panel completed-day"><CheckCircle2/><div><h2>Attendance complete</h2><p>{formatTime(today.record.clock_in_at)} – {formatTime(today.record.clock_out_at)} · {(today.record.work_minutes / 60).toFixed(2)} work hours · {(breakMinutes / 60).toFixed(2)} break hours</p></div></section>}
        <div className="self-grid"><form className="panel" onSubmit={requestLeave}><div className="panel-head"><div><h2>Request leave</h2><p>Any authorized company manager can review it.</p></div><Send/></div><div className="form-grid two"><Field label="Day type"><select value={leaveForm.day_part} onChange={event => setLeaveForm({...leaveForm, day_part: event.target.value})}><option value="full_day">Full day</option><option value="first_half">First half</option><option value="second_half">Second half</option></select></Field><Field label="From"><input type="date" value={leaveForm.date_from} onChange={event => setLeaveForm({...leaveForm, date_from: event.target.value})} required/></Field><Field label="To"><input type="date" value={leaveForm.date_to} onChange={event => setLeaveForm({...leaveForm, date_to: event.target.value})} required/></Field></div><Field label="Reason"><textarea value={leaveForm.reason} onChange={event => setLeaveForm({...leaveForm, reason: event.target.value})} rows="3" required/></Field><div className="form-actions"><button className="primary" disabled={busy}>Submit request</button></div></form>
            <section className="panel"><div className="panel-head"><div><h2>Recent leave requests</h2><p>Your latest approval status</p></div></div>{leaves.length ? <div className="simple-list">{leaves.slice(0, 8).map(leave => <div key={leave.id}><span><b>Leave request</b><small>{leave.date_from} to {leave.date_to} · {leave.day_part.replaceAll('_', ' ')}</small></span><i className={`status ${leave.status === 'approved' ? 'on' : leave.status === 'rejected' ? 'danger' : ''}`}>{leave.status}</i></div>)}</div> : <Empty title="No leave requests" detail="Submitted requests and decisions will appear here."/>}</section></div>
        <section className="panel"><div className="panel-head"><div><h2>Recent attendance</h2><p>Your last 45 records</p></div></div>{history.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Status</th><th>Work hours</th><th>Break hours</th><th>Entry source</th></tr></thead><tbody>{history.map(row => <tr key={row.id}><td className="strong">{row.attendance_date}</td><td>{formatTime(row.clock_in_at)}</td><td>{row.clock_out_at ? formatTime(row.clock_out_at) : 'Missing'}</td><td>{row.status.replaceAll('_', ' ')}</td><td>{(row.work_minutes / 60).toFixed(2)}</td><td>{(Number(row.break_minutes) / 60).toFixed(2)}</td><td>{row.entry_source === 'manager' ? <span className="manual-entry-detail"><i className="status warning">Manager entered</i><small>{row.recorded_by?.name || 'Authorized user'} · {row.entry_reason}</small></span> : 'Employee'}</td></tr>)}</tbody></table></div> : <Empty title="No attendance yet" detail={today.manager_attendance_only ? 'An authorized manager will add your completed attendance.' : 'Your first Time In will create a record.'}/>}</section>
        {timeInOpen && <SelfieModal mode="time-in" onClose={() => setTimeInOpen(false)} onDone={async () => {setTimeInOpen(false); setMessage('Time In completed successfully.'); await load();}}/>}
        {breakOutOpen && <SelfieModal mode="break-out" onClose={() => setBreakOutOpen(false)} onDone={async () => {setBreakOutOpen(false); setMessage('Welcome back. Break completed successfully.'); await load();}}/>}
    </div>;
}
