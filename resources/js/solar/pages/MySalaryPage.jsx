import React, {useEffect, useState} from 'react';
import {CalendarClock, CircleDollarSign, IndianRupee, PlusCircle, ReceiptIndianRupee, ShieldCheck} from 'lucide-react';
import {api} from '../api';
import {Empty, Loading, Metric} from '../components/Common';
import {number, shortDate} from '../format';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const rupees = value => `₹${number(value)}`;

export default function MySalaryPage() {
    const [month, setMonth] = useState(currentMonth());
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {setData(null); api(`my-salary?month=${month}`).then(result => {setData(result); setError('');}).catch(failure => setError(failure.message));}, [month]);
    if (!data && !error) return <Loading/>;
    const row = data?.statement;

    return (
        <div className="my-salary-page">
            <section className="panel my-salary-hero">
                <div>
                    <p className="eyebrow">Private salary statement</p>
                    <h2>{row?.employee.name || 'My salary'}</h2>
                    <p>Only you and the super admin can view these salary details.</p>
                </div>
                <label>
                    <span>Salary month</span>
                    <input type="month" max={currentMonth()} value={month} onChange={event => setMonth(event.target.value)}/>
                </label>
            </section>
            {error && <div className="error">{error}</div>}
            {data && !row?.configured ? (
                <Empty title="Salary is not configured" detail="Your monthly salary has not yet been configured for this period. Please contact the super admin."/>
            ) : row && (
                <>
                    <div className="salary-period-note">
                        <CalendarClock size={17}/>
                        <span>
                            <b>{data.period_status === 'provisional' ? 'Provisional salary' : 'Final calculation'}</b>
                            {data.period_status === 'provisional' ? 'This amount can change if leave is approved or extra work addition is recorded.' : `Calculated for ${data.from} to ${data.to}.`}
                        </span>
                    </div>

                    <div className="cards my-salary-cards">
                        <Metric icon={IndianRupee} title="Monthly salary" value={row.monthly_salary} unit="INR"/>
                        <Metric icon={CircleDollarSign} title="Prorated gross" value={row.prorated_gross} unit="INR"/>
                        <Metric icon={PlusCircle} title="Extra work (+)" value={row.additions} unit="INR" color="emerald"/>
                        <Metric icon={ReceiptIndianRupee} title="Leave deduction" value={row.leave_deduction} unit="INR" color="amber"/>
                        <Metric icon={ShieldCheck} title="Final payable" value={row.final_payable} unit="INR"/>
                    </div>

                    <section className="panel">
                        <div className="panel-head">
                            <div>
                                <h2>Salary calculation breakdown</h2>
                                <p>Monthly Base Salary + Extra Work Additions − Leave Deductions = Final Payable</p>
                            </div>
                        </div>
                        <div className="salary-statement-lines">
                            <span><small>Full monthly base salary</small><b>{rupees(row.monthly_salary)}</b></span>
                            <span><small>Joining-date proration</small><b>{number(row.eligible_units)} of {number(row.scheduled_units)} work units</b></span>
                            <span><small>Prorated gross salary</small><b>{rupees(row.prorated_gross)}</b></span>
                            {row.additions > 0 && (
                                <span style={{color: '#059669', background: 'rgba(16, 185, 129, 0.08)'}}>
                                    <small>+ Extra work / additions ({row.adjustments.filter(a => a.type === 'addition' && !a.cancelled).length} entries)</small>
                                    <b>+ {rupees(row.additions)}</b>
                                </span>
                            )}
                            <span className="deduction">
                                <small>Approved leave deduction ({number(row.leave_units)} units)</small>
                                <b>− {rupees(row.leave_deduction)}</b>
                            </span>
                            {row.deductions > 0 && (
                                <span className="deduction">
                                    <small>Manual deductions</small>
                                    <b>− {rupees(row.deductions)}</b>
                                </span>
                            )}
                            <strong style={{background: 'rgba(37, 99, 235, 0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(37, 99, 235, 0.2)'}}>
                                <span>Final payable salary</span>
                                <b style={{fontSize: '1.25rem', color: '#1e40af'}}>{rupees(row.final_payable)}</b>
                            </strong>
                        </div>
                    </section>

                    <section className="panel">
                        <div className="panel-head">
                            <div>
                                <h2>Extra work & Salary additions ({row.adjustments?.length || 0})</h2>
                                <p>Date-wise extra work, additions, and reasons recorded by super admin.</p>
                            </div>
                        </div>
                        {row.adjustments.length ? (
                            <div className="salary-adjustment-list">
                                {row.adjustments.map(item => (
                                    <div className={item.cancelled ? 'cancelled' : ''} key={item.id}>
                                        <span className={`salary-adjustment-icon ${item.type}`}>{item.type === 'addition' ? '+' : '−'}</span>
                                        <span style={{flex: 1}}>
                                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap'}}>
                                                <b>{item.type === 'addition' ? 'Extra Work Addition' : 'Deduction'} · {rupees(item.amount)}</b>
                                                {item.work_date && (
                                                    <span style={{fontSize: '11.5px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600}}>
                                                        Work Date: {shortDate(item.work_date)}
                                                    </span>
                                                )}
                                            </div>
                                            <small style={{display: 'block', marginTop: '3px', color: '#334155'}}>
                                                <b>Reason:</b> {item.reason}
                                                {item.company && ` · Company: ${item.company.name}`}
                                                {` · Recorded on ${shortDate(item.created_at)}`}
                                            </small>
                                            {item.cancelled && <em>Cancelled · {item.cancellation_reason}</em>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="info-banner">No extra work or manual adjustments were recorded for this month.</div>
                        )}
                    </section>

                    <section className="panel">
                        <div className="panel-head">
                            <div>
                                <h2>Attendance summary</h2>
                                <p>Attendance is shown for transparency. Only approved leave reduces your salary.</p>
                            </div>
                        </div>
                        <div className="salary-attendance-grid">
                            <span><small>Present</small><b>{number(row.attendance.present)}</b></span>
                            <span><small>Absent</small><b>{number(row.attendance.absent)}</b></span>
                            <span><small>Half days</small><b>{row.attendance.half_days}</b></span>
                            <span><small>Short days</small><b>{row.attendance.short_days}</b></span>
                            <span><small>Approved leave</small><b>{number(row.attendance.approved_leave)}</b></span>
                            <span><small>Holidays</small><b>{number(row.attendance.holidays)}</b></span>
                            <span><small>Weekly offs</small><b>{row.attendance.weekly_offs}</b></span>
                            <span><small>Deductible leave</small><b>{number(row.leave_units)}</b></span>
                        </div>
                        <div className="info-banner"><b>Important:</b> Absence, late arrival, short days, work hours, breaks, and overtime do not reduce this salary calculation.</div>
                    </section>

                    <section className="panel">
                        <div className="panel-head">
                            <div>
                                <h2>Daily attendance details</h2>
                                <p>Attendance, calendar status, and deductible approved leave.</p>
                            </div>
                        </div>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Scheduled</th>
                                        <th>Approved leave</th>
                                        <th>Time In</th>
                                        <th>Time Out</th>
                                        <th>Calendar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {row.days.map(day => (
                                        <tr key={day.date}>
                                            <td className="strong">{shortDate(day.date)}</td>
                                            <td>{day.status.replaceAll('_', ' ')}</td>
                                            <td>{number(day.scheduled_units)}</td>
                                            <td>{day.leave_units ? `${number(day.leave_units)} unit` : '—'}</td>
                                            <td>{day.clock_in || '—'}</td>
                                            <td>{day.clock_out || '—'}</td>
                                            <td>{day.holiday || (day.weekly_off ? 'Weekly off' : 'Working day')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
