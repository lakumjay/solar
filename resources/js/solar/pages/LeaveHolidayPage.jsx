import React, {useEffect, useState} from 'react';
import {CalendarCheck2, Check, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field} from '../components/Common';

const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const blankHoliday = () => ({name: '', holiday_date: localDate(), type: 'full_day', active: true});

export default function LeaveHolidayPage({can}) {
    const [leaves, setLeaves] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [status, setStatus] = useState('pending');
    const [holiday, setHoliday] = useState(blankHoliday());
    const [message, setMessage] = useState('');
    const [savingHoliday, setSavingHoliday] = useState(false);
    const [reviewingId, setReviewingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [leaveRes, holidayRes] = await Promise.allSettled([
                api(`leaves${status ? `?status=${status}` : ''}`),
                api('holidays')
            ]);
            if (leaveRes.status === 'fulfilled') setLeaves(leaveRes.value || []);
            else console.error('Failed to load leaves:', leaveRes.reason);
            if (holidayRes.status === 'fulfilled') setHolidays(holidayRes.value || []);
            else console.error('Failed to load holidays:', holidayRes.reason);
        } catch (err) {
            setError(err.message || 'Failed to load data.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, [status]);
    const review = async (leave, decision) => {
        const remarks = window.prompt(`${decision === 'approved' ? 'Approval' : 'Rejection'} remarks (optional):`) ?? null;
        if (remarks === null) return;
        setReviewingId(leave.id);
        try {
            await api(`leaves/${leave.id}/review`, {method: 'POST', body: JSON.stringify({status: decision, remarks})});
            setMessage(`Leave ${decision}.`);
            await load();
        } catch (error) { setMessage(error.message); }
        finally { setReviewingId(null); }
    };
    const saveHoliday = async event => {
        event.preventDefault();
        setSavingHoliday(true);
        try {
            await api('holidays', {method: 'POST', body: JSON.stringify(holiday)});
            setMessage(holiday.id ? 'Holiday updated.' : 'Holiday saved.');
            setHoliday(blankHoliday());
            await load();
        } catch (error) { setMessage(error.message); }
        finally { setSavingHoliday(false); }
    };

    return <div className="leave-layout">
        <section className="panel">
            <div className="panel-head"><div><h2>Leave approvals</h2><p>Common queue for employees across every company.</p></div><select className="compact-select" value={status} onChange={event => setStatus(event.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="">All</option></select></div>
            {message && <div className={message.includes('saved') || message.includes('updated') || message.includes('approved') || message.includes('rejected') ? 'success' : 'error'}>{message}</div>}
            {leaves.length ? <div className="leave-cards">{leaves.map(leave => <article key={leave.id}>
                <div className="leave-person"><span className="avatar">{leave.employee.user.name.slice(0, 1)}</span><span><b>{leave.employee.user.name}</b><small>{leave.employee.employee_code} · {leave.employee.designation || 'Employee'}</small></span><i className={`status ${leave.status === 'approved' ? 'on' : leave.status === 'rejected' ? 'danger' : 'warning'}`}>{leave.status}</i></div>
                <div className="leave-meta"><span><small>Dates</small><b>{leave.date_from} – {leave.date_to}</b></span><span><small>Day type</small><b>{leave.day_part.replaceAll('_', ' ')}</b></span></div>
                <p>{leave.reason}</p>
                {leave.reviewer && <small className="reviewed-by">Reviewed by {leave.reviewer.name}{leave.review_remarks ? ` · ${leave.review_remarks}` : ''}</small>}
                {leave.status === 'pending' && can('approve_leaves') && <div className="review-actions"><button className="secondary danger-button" disabled={reviewingId === leave.id} onClick={() => review(leave, 'rejected')}><X size={15}/> Reject</button><button className="primary" disabled={reviewingId === leave.id} onClick={() => review(leave, 'approved')}><Check size={15}/> Approve</button></div>}
            </article>)}</div> : (
                <Empty title="No leave requests" detail={`There are no ${status || ''} leave requests.`}/>
            )}
        </section>
        <section className="panel">
            <div className="panel-head"><div><h2>Common holiday calendar</h2><p>Full-day and half-day holidays apply to everyone.</p></div><CalendarCheck2/></div>
            {can('manage_attendance_settings') && <form className="holiday-form" onSubmit={saveHoliday}>
                <Field label="Holiday name"><input value={holiday.name} onChange={event => setHoliday({...holiday, name: event.target.value})} required/></Field>
                <div className="form-grid two"><Field label="Date"><input type="date" value={holiday.holiday_date} onChange={event => setHoliday({...holiday, holiday_date: event.target.value})} required/></Field><Field label="Holiday type"><select value={holiday.type} onChange={event => setHoliday({...holiday, type: event.target.value})}><option value="full_day">Full day</option><option value="first_half">First half</option><option value="second_half">Second half</option></select></Field></div>
                <div className="holiday-actions"><label className="toggle"><input type="checkbox" checked={Boolean(holiday.active)} onChange={event => setHoliday({...holiday, active: event.target.checked})}/><span/> Holiday active</label>{holiday.id && <button type="button" className="secondary" onClick={() => setHoliday(blankHoliday())}>Cancel edit</button>}<button className="primary" disabled={savingHoliday}>{savingHoliday ? 'Saving…' : (holiday.id ? 'Update holiday' : 'Add holiday')}</button></div>
            </form>}
            <div className="simple-list holiday-list">{holidays.map(item => <button type="button" key={item.id} onClick={() => can('manage_attendance_settings') && setHoliday({id: item.id, name: item.name, holiday_date: item.holiday_date, type: item.type, active: item.active})}><span><b>{item.name}</b><small>{item.holiday_date} · {item.type.replaceAll('_', ' ')}</small></span><i className={item.active ? 'status on' : 'status'}>{item.active ? 'Active' : 'Inactive'}</i></button>)}</div>
        </section>
    </div>;
}
