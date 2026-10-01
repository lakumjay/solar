import React, {useEffect, useMemo, useState} from 'react';
import {Download, FileText} from 'lucide-react';
import {api} from '../api';
import {Empty} from '../components/Common';

const currentMonth = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export default function AttendanceReportsPage() {
    const [month, setMonth] = useState(currentMonth());
    const [employeeId, setEmployeeId] = useState('');
    const [employees, setEmployees] = useState([]);
    const [report, setReport] = useState(null);
    const [message, setMessage] = useState('');
    const query = useMemo(() => `month=${month}${employeeId ? `&employee_id=${employeeId}` : ''}`, [month, employeeId]);
    const load = async () => {
        try { const [data, people] = await Promise.all([api(`attendance-report?${query}`), api('employees')]); setReport(data); setEmployees(people); setMessage(''); }
        catch (error) { setMessage(error.message); }
    };
    useEffect(() => { load(); }, [query]);

    return <div className="attendance-report"><section className="panel report-header"><div><h2>Monthly employee summary</h2><p>Working days, leave, attendance exceptions, hours and corrections.</p></div><div className="report-controls"><label><span>Month</span><input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label><label><span>Employee</span><select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">All employees</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.name}</option>)}</select></label><div className="export-actions"><a className="secondary" href={`/api/attendance-report/export/excel?${query}`}><Download size={15}/> Excel</a><a className="secondary" href={`/api/attendance-report/export/pdf?${query}`}><FileText size={15}/> PDF</a></div></div></section>
        {message && <div className="error">{message}</div>}
        <section className="panel">{report?.rows?.length ? <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Present</th><th>Half</th><th>Short</th><th>Absent</th><th>Leave</th><th>Holiday</th><th>Weekly Off</th><th>Late</th><th>Early</th><th>Missing Time Out</th><th>Corrections</th><th>Work Hours</th><th>Break Hours</th><th>OT Hours</th></tr></thead><tbody>{report.rows.map(item => <tr key={item.employee.id}><td><b>{item.employee.user.name}</b><small>{item.employee.employee_code}</small></td><td>{item.summary.present}</td><td>{item.summary.half_days}</td><td>{item.summary.short_days}</td><td>{item.summary.absent}</td><td>{Number(item.summary.leave).toFixed(2)}</td><td>{Number(item.summary.holidays).toFixed(2)}</td><td>{item.summary.weekly_offs}</td><td>{item.summary.late}</td><td>{item.summary.early_out}</td><td>{item.summary.missing_clock_out}</td><td>{item.summary.manual_corrections}</td><td>{(item.summary.work_minutes / 60).toFixed(2)}</td><td>{(item.summary.break_minutes / 60).toFixed(2)}</td><td>{(item.summary.overtime_minutes / 60).toFixed(2)}</td></tr>)}</tbody></table></div> : <Empty title="No employees in this report" detail="Add an active employee or choose another filter."/>}</section>
        {report?.rows?.length === 1 && <section className="panel"><div className="panel-head"><div><h2>Daily details</h2><p>Work, break, entry source and learning details remain attached to each day.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Time In</th><th>Time Out</th><th>Work Hours</th><th>Break Hours</th><th>Entry Source</th><th>Work done</th><th>Learned</th></tr></thead><tbody>{report.rows[0].days.map(day => <tr key={day.date}><td className="strong">{day.date}</td><td>{day.status.replaceAll('_', ' ')}</td><td>{day.clock_in || '—'}</td><td>{day.clock_out || '—'}</td><td>{(day.work_minutes / 60).toFixed(2)}</td><td>{(day.break_minutes / 60).toFixed(2)}</td><td>{day.entry_source === 'manager' ? <span className="manual-entry-detail"><i className="status warning">Manager entered</i><small>{day.recorded_by || 'Authorized user'} · {day.entry_reason}</small></span> : day.entry_source ? 'Employee' : '—'}</td><td className="notes-cell">{day.work_done || '—'}</td><td className="notes-cell">{day.learned || '—'}</td></tr>)}</tbody></table></div></section>}
    </div>;
}
