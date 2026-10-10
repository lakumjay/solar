import React, {useEffect, useMemo, useState} from 'react';
import {Download, FileText, LayoutGrid, Table} from 'lucide-react';
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
    const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));

    const query = useMemo(() => `month=${month}${employeeId ? `&employee_id=${employeeId}` : ''}`, [month, employeeId]);
    const load = async () => {
        try {
            const [data, people] = await Promise.all([api(`attendance-report?${query}`), api('employees')]);
            setReport(data);
            setEmployees(people);
            setMessage('');
        } catch (error) {
            setMessage(error.message);
        }
    };
    useEffect(() => { load(); }, [query]);

    return (
        <div className="attendance-report">
            <section className="panel report-header">
                <div>
                    <h2>Monthly employee summary</h2>
                    <p>Working days, leave, attendance exceptions, hours and corrections.</p>
                </div>
                <div className="report-controls">
                    <label>
                        <span>Month</span>
                        <input type="month" value={month} onChange={event => setMonth(event.target.value)}/>
                    </label>
                    <label>
                        <span>Employee</span>
                        <select value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
                            <option value="">All employees</option>
                            {employees.map(employee => (
                                <option key={employee.id} value={employee.id}>
                                    {employee.employee_code} · {employee.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="export-actions">
                        <button
                            type="button"
                            className="secondary view-toggle-btn"
                            onClick={() => setViewMode(v => v === 'cards' ? 'table' : 'cards')}
                            title="Toggle between Card view and Table view"
                        >
                            {viewMode === 'cards' ? <Table size={15}/> : <LayoutGrid size={15}/>}
                            <span>{viewMode === 'cards' ? 'Table' : 'Cards'}</span>
                        </button>
                        <a className="secondary" href={`/api/attendance-report/export/excel?${query}`}>
                            <Download size={15}/> Excel
                        </a>
                        <a className="secondary" href={`/api/attendance-report/export/pdf?${query}`}>
                            <FileText size={15}/> PDF
                        </a>
                    </div>
                </div>
            </section>

            {message && <div className="error">{message}</div>}

            <section className="panel">
                {report?.rows?.length ? (
                    viewMode === 'cards' ? (
                        /* 📱 Mobile-First Responsive Cards */
                        <div className="att-report-cards-grid">
                            {report.rows.map(item => {
                                const totalRecorded = item.summary.present + item.summary.absent + item.summary.half_days + item.summary.short_days + Number(item.summary.leave || 0);
                                return (
                                    <div key={item.employee.id} className="att-report-card">
                                        <div className="att-card-head">
                                            <div>
                                                <b className="att-card-name">{item.employee.user.name}</b>
                                                <div className="att-card-code">{item.employee.employee_code} · {item.employee.designation || 'Staff'}</div>
                                            </div>
                                            <span className="att-card-pbadge">
                                                {item.summary.present} P / {totalRecorded > 0 ? `${totalRecorded} Days` : 'Month'}
                                            </span>
                                        </div>

                                        <div className="att-stats-grid">
                                            <div className="att-stat-box green">
                                                <small>Present</small>
                                                <b>{item.summary.present}</b>
                                            </div>
                                            <div className="att-stat-box red">
                                                <small>Absent</small>
                                                <b>{item.summary.absent}</b>
                                            </div>
                                            <div className="att-stat-box amber">
                                                <small>Half/Short</small>
                                                <b>{item.summary.half_days + item.summary.short_days}</b>
                                            </div>
                                            <div className="att-stat-box blue">
                                                <small>Leave</small>
                                                <b>{Number(item.summary.leave).toFixed(1)}</b>
                                            </div>
                                            <div className="att-stat-box slate">
                                                <small>Work Hours</small>
                                                <b>{(item.summary.work_minutes / 60).toFixed(1)}h</b>
                                            </div>
                                            <div className="att-stat-box purple">
                                                <small>OT Hours</small>
                                                <b>{(item.summary.overtime_minutes / 60).toFixed(1)}h</b>
                                            </div>
                                        </div>

                                        {(item.summary.late > 0 || item.summary.early_out > 0 || item.summary.missing_clock_out > 0 || item.summary.manual_corrections > 0) && (
                                            <div className="att-exceptions-row">
                                                {item.summary.late > 0 && <span className="exc-tag late">Late: {item.summary.late}</span>}
                                                {item.summary.early_out > 0 && <span className="exc-tag early">Early: {item.summary.early_out}</span>}
                                                {item.summary.missing_clock_out > 0 && <span className="exc-tag missing">No Time-Out: {item.summary.missing_clock_out}</span>}
                                                {item.summary.manual_corrections > 0 && <span className="exc-tag corrected">Edited: {item.summary.manual_corrections}</span>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* 💻 Full Data Table View */
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Present</th>
                                        <th>Half</th>
                                        <th>Short</th>
                                        <th>Absent</th>
                                        <th>Leave</th>
                                        <th>Holiday</th>
                                        <th>Weekly Off</th>
                                        <th>Late</th>
                                        <th>Early</th>
                                        <th>Missing Time Out</th>
                                        <th>Corrections</th>
                                        <th>Work Hours</th>
                                        <th>Break Hours</th>
                                        <th>OT Hours</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.rows.map(item => (
                                        <tr key={item.employee.id}>
                                            <td>
                                                <b>{item.employee.user.name}</b>
                                                <small>{item.employee.employee_code}</small>
                                            </td>
                                            <td>{item.summary.present}</td>
                                            <td>{item.summary.half_days}</td>
                                            <td>{item.summary.short_days}</td>
                                            <td>{item.summary.absent}</td>
                                            <td>{Number(item.summary.leave).toFixed(2)}</td>
                                            <td>{Number(item.summary.holidays).toFixed(2)}</td>
                                            <td>{item.summary.weekly_offs}</td>
                                            <td>{item.summary.late}</td>
                                            <td>{item.summary.early_out}</td>
                                            <td>{item.summary.missing_clock_out}</td>
                                            <td>{item.summary.manual_corrections}</td>
                                            <td>{(item.summary.work_minutes / 60).toFixed(2)}</td>
                                            <td>{(item.summary.break_minutes / 60).toFixed(2)}</td>
                                            <td>{(item.summary.overtime_minutes / 60).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    <Empty title="No employees in this report" detail="Add an active employee or choose another filter."/>
                )}
            </section>

            {report?.rows?.length === 1 && (
                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Daily details</h2>
                            <p>Work, break, entry source and learning details remain attached to each day.</p>
                        </div>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Time In</th>
                                    <th>Time Out</th>
                                    <th>Work Hours</th>
                                    <th>Break Hours</th>
                                    <th>Entry Source</th>
                                    <th>Work done</th>
                                    <th>Learned</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.rows[0].days.map(day => (
                                    <tr key={day.date}>
                                        <td className="strong">{day.date}</td>
                                        <td>{day.status.replaceAll('_', ' ')}</td>
                                        <td>{day.clock_in || '—'}</td>
                                        <td>{day.clock_out || '—'}</td>
                                        <td>{(day.work_minutes / 60).toFixed(2)}</td>
                                        <td>{(day.break_minutes / 60).toFixed(2)}</td>
                                        <td>
                                            {day.entry_source === 'manager' ? (
                                                <span className="manual-entry-detail">
                                                    <i className="status warning">Manager entered</i>
                                                    <small>{day.recorded_by || 'Authorized user'} · {day.entry_reason}</small>
                                                </span>
                                            ) : day.entry_source ? 'Employee' : '—'}
                                        </td>
                                        <td className="notes-cell">{day.work_done || '—'}</td>
                                        <td className="notes-cell">{day.learned || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
