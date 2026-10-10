import React, {useEffect, useState} from 'react';
import {CalendarClock, CircleDollarSign, Download, Eye, IndianRupee, LayoutGrid, PencilLine, Plus, ReceiptIndianRupee, Table, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field, Loading, Metric} from '../components/Common';
import {number, shortDate} from '../format';
import {getLanguage} from '../utils/translations';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const rupees = value => `₹${number(value)}`;

export default function SalaryPage() {
    const [month, setMonth] = useState(currentMonth());
    const [data, setData] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [rateForm, setRateForm] = useState(null);
    const [adjustmentForm, setAdjustmentForm] = useState(null);
    const [correctionForm, setCorrectionForm] = useState(null);
    const [waiveForm, setWaiveForm] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));

    const load = async () => {
        try {
            setData(await api(`salaries?month=${month}`));
            setError('');
        } catch (failure) {
            setError(failure.message);
            setData(null);
        }
    };
    useEffect(() => { load(); }, [month]);

    const selected = data?.rows.find(row => row.employee.id === selectedId);
    const complete = async text => {
        setMessage(text);
        setRateForm(null);
        setAdjustmentForm(null);
        setCorrectionForm(null);
        setWaiveForm(null);
        await load();
    };

    if (!data && !error) return <Loading/>;

    return (
        <div className="salary-page">
            <section className="panel salary-toolbar">
                <div>
                    <p className="eyebrow">Confidential payroll</p>
                    <h2>Monthly salary calculation</h2>
                    <p>Only approved leave reduces salary. Attendance hours and absence are shown for reference.</p>
                </div>
                <div>
                    <label>
                        <span>Salary month</span>
                        <input
                            type="month"
                            max={currentMonth()}
                            value={month}
                            onChange={event => { setMonth(event.target.value); setSelectedId(null); }}
                        />
                    </label>
                    <a className="secondary" href={`/api/salaries/export/excel?month=${month}`}>
                        <Download size={16}/> Export Excel
                    </a>
                </div>
            </section>

            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}

            {data && (
                <>
                    <div className="salary-period-note">
                        <CalendarClock size={17}/>
                        <span>
                            <b>{data.period_status === 'provisional' ? 'Provisional calculation' : 'Final calculation'}</b>
                            {data.period_status === 'provisional'
                                ? 'The current month can change when leave is approved or adjustments are added.'
                                : 'This completed-month calculation uses the applicable salary rate and approved leave.'}
                        </span>
                    </div>

                    <div className="cards salary-summary-cards">
                        <Metric icon={IndianRupee} title="Base salary" value={data.totals.base_salary} unit="INR"/>
                        <Metric icon={CircleDollarSign} title="Prorated gross" value={data.totals.prorated_gross} unit="INR"/>
                        <Metric icon={ReceiptIndianRupee} title="Leave deduction" value={data.totals.leave_deduction} unit="INR" color="amber"/>
                        <Metric icon={Plus} title="Extra Work / Additions" value={data.totals.additions} unit="INR" color="emerald"/>
                        <Metric icon={IndianRupee} title="Final payable" value={data.totals.final_payable} unit="INR"/>
                    </div>

                    {data.totals.unconfigured_employees > 0 && (
                        <div className="warning-banner">
                            <b>{data.totals.unconfigured_employees} employee salary {data.totals.unconfigured_employees === 1 ? 'is' : 'are'} not configured.</b>
                            <span>Set an effective monthly salary before adding adjustments or including the employee in payable totals.</span>
                        </div>
                    )}

                    <section className="panel">
                        <div className="panel-head" style={{alignItems: 'center'}}>
                            <div>
                                <h2>Employee salary summary</h2>
                                <p>{data.from} to {data.to}</p>
                            </div>
                            <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                <button
                                    type="button"
                                    className="secondary view-toggle-btn"
                                    onClick={() => setViewMode(v => v === 'cards' ? 'table' : 'cards')}
                                    title="Toggle between Card view and Table view"
                                >
                                    {viewMode === 'cards' ? <Table size={15}/> : <LayoutGrid size={15}/>}
                                    <span>{viewMode === 'cards' ? 'Table View' : 'Card View'}</span>
                                </button>
                            </div>
                        </div>

                        {viewMode === 'cards' ? (
                            /* 📱 Mobile-First Responsive Employee Salary Cards (No horizontal scroll!) */
                            <div className="salary-cards-grid">
                                {data.rows.map(row => (
                                    <div key={row.employee.id} className="salary-emp-card">
                                        <div className="salary-emp-card-header">
                                            <div className="salary-emp-card-identity">
                                                <b className="salary-emp-name">{row.employee.name}</b>
                                                <span className="salary-emp-code">
                                                    {row.employee.employee_code}
                                                    {!row.employee.active && <span className="inactive-tag"> · Inactive</span>}
                                                </span>
                                            </div>
                                            <div className="salary-emp-payable-badge">
                                                <small>Final Payable</small>
                                                <b>{rupees(row.final_payable)}</b>
                                            </div>
                                        </div>

                                        <div className="salary-emp-base-row">
                                            <span>Base Rate: <b>{row.configured ? rupees(row.monthly_salary) : 'Not configured'}</b></span>
                                            {row.configured && <small>Effective {row.rate.effective_month}</small>}
                                        </div>

                                        <div className="salary-emp-chips-grid">
                                            <div className="salary-chip">
                                                <small>Work Days / Units</small>
                                                <b>{number(row.eligible_units)} / {number(row.scheduled_units)}</b>
                                            </div>
                                            <div className="salary-chip">
                                                <small>Attendance</small>
                                                <b>P {number(row.attendance.present)} · A {number(row.attendance.absent)}</b>
                                            </div>
                                            <div className="salary-chip">
                                                <small>Leave ({row.attendance.approved_leave} app)</small>
                                                <b>{number(row.leave_units)} units</b>
                                            </div>
                                            <div className="salary-chip">
                                                <small>Prorated Gross</small>
                                                <b>{rupees(row.prorated_gross)}</b>
                                            </div>
                                            <div className="salary-chip danger">
                                                <small>Leave Cut</small>
                                                <b>− {rupees(row.leave_deduction)}</b>
                                            </div>
                                            <div className="salary-chip positive">
                                                <small>Extra Work (+)</small>
                                                <b>+ {rupees(row.additions)}</b>
                                            </div>
                                        </div>

                                        <div className="salary-emp-card-actions">
                                            <button
                                                type="button"
                                                className="salary-action-btn details"
                                                onClick={() => setSelectedId(row.employee.id)}
                                            >
                                                <Eye size={13}/>
                                                <span>Details</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="salary-action-btn edit-salary"
                                                onClick={() => setRateForm({
                                                    employee: row.employee,
                                                    effective_month: month,
                                                    monthly_salary: row.configured ? row.monthly_salary : ''
                                                })}
                                            >
                                                <PencilLine size={13}/>
                                                <span>Salary Rate</span>
                                            </button>
                                            {row.configured && (
                                                <button
                                                    type="button"
                                                    className="salary-action-btn add-extra"
                                                    onClick={() => setAdjustmentForm({
                                                        employee: row.employee,
                                                        salary_month: month,
                                                        type: 'addition',
                                                        work_date: new Date().toISOString().slice(0, 10),
                                                        amount: '',
                                                        reason: '',
                                                        company_id: '',
                                                        add_to_shared_expenses: false
                                                    })}
                                                >
                                                    <Plus size={13}/>
                                                    <span>+ Extra Work</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* 💻 Desktop Table View */
                            <div className="table-wrap">
                                <table className="salary-table">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Monthly salary</th>
                                            <th>Work units</th>
                                            <th>Attendance</th>
                                            <th>Leave</th>
                                            <th>Prorated gross</th>
                                            <th>Leave deduction</th>
                                            <th>Extra / Adjustments</th>
                                            <th>Final payable</th>
                                            <th/>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.map(row => (
                                            <tr key={row.employee.id}>
                                                <td>
                                                    <b>{row.employee.name}</b>
                                                    <small>{row.employee.employee_code}{!row.employee.active ? ' · Inactive' : ''}</small>
                                                </td>
                                                <td>
                                                    {row.configured ? (
                                                        <>
                                                            <b>{rupees(row.monthly_salary)}</b>
                                                            <small>From {row.rate.effective_month}</small>
                                                        </>
                                                    ) : (
                                                        <i className="status warning">Not configured</i>
                                                    )}
                                                </td>
                                                <td>{number(row.eligible_units)} / {number(row.scheduled_units)}</td>
                                                <td>
                                                    <span className="salary-mini-stats">
                                                        P {number(row.attendance.present)} · A {number(row.attendance.absent)}
                                                        <small>Half {row.attendance.half_days} · Short {row.attendance.short_days}</small>
                                                    </span>
                                                </td>
                                                <td>
                                                    {number(row.leave_units)} unit
                                                    <small>{number(row.attendance.approved_leave)} approved</small>
                                                </td>
                                                <td>{rupees(row.prorated_gross)}</td>
                                                <td className="danger-text">− {rupees(row.leave_deduction)}</td>
                                                <td>
                                                    <span className="salary-mini-stats positive">
                                                        + {rupees(row.additions)}
                                                        <small className="danger-text">− {rupees(row.deductions)}</small>
                                                    </span>
                                                </td>
                                                <td><strong>{rupees(row.final_payable)}</strong></td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button className="link" onClick={() => setSelectedId(row.employee.id)}>Details</button>
                                                        <button className="link" onClick={() => setRateForm({
                                                            employee: row.employee,
                                                            effective_month: month,
                                                            monthly_salary: row.configured ? row.monthly_salary : ''
                                                        })}>
                                                            <PencilLine size={14}/> Salary
                                                        </button>
                                                        {row.configured && (
                                                            <button className="link" onClick={() => setAdjustmentForm({
                                                                employee: row.employee,
                                                                salary_month: month,
                                                                type: 'addition',
                                                                work_date: new Date().toISOString().slice(0, 10),
                                                                amount: '',
                                                                reason: '',
                                                                company_id: '',
                                                                add_to_shared_expenses: false
                                                            })}>
                                                                <Plus size={14}/> + Extra / Adjust
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {selected && (
                        <SalaryDetails
                            row={selected}
                            onClose={() => setSelectedId(null)}
                            onCorrect={adjustment => setCorrectionForm({
                                adjustment,
                                employee: selected.employee,
                                replace: true,
                                correction_reason: '',
                                replacement_type: adjustment.type,
                                replacement_amount: adjustment.amount,
                                replacement_reason: ''
                            })}
                            onWaiveBreak={breakItem => setWaiveForm({
                                breakItem,
                                employee: selected.employee,
                                admin_waived: !!breakItem.admin_waived,
                                deduction_amount: breakItem.deduction_amount,
                                waive_reason: breakItem.waive_reason || ''
                            })}
                        />
                    )}
                </>
            )}

            {rateForm && <RateForm form={rateForm} setForm={setRateForm} onClose={() => setRateForm(null)} onSaved={complete}/>}
            {adjustmentForm && <AdjustmentForm form={adjustmentForm} setForm={setAdjustmentForm} onClose={() => setAdjustmentForm(null)} onSaved={complete}/>}
            {correctionForm && <CorrectionForm form={correctionForm} setForm={setCorrectionForm} onClose={() => setCorrectionForm(null)} onSaved={complete}/>}
            {waiveForm && <WaiveBreakModal form={waiveForm} setForm={setWaiveForm} onClose={() => setWaiveForm(null)} onSaved={complete}/>}
        </div>
    );
}

function SalaryDetails({row, onClose, onCorrect, onWaiveBreak}) {
    const urgentBreaks = (row.days || []).flatMap(day =>
        (day.breaks || [])
            .filter(b => b.break_type === 'urgent_out')
            .map(b => ({...b, date: day.date}))
    );

    return (
        <section className="panel salary-details">
            <div className="panel-head">
                <div>
                    <h2>{row.employee.name} · Calculation details</h2>
                    <p style={{fontSize: '12.5px', lineHeight: '1.4'}}>
                        Base Prorated (₹{number(row.prorated_gross)}) + Extra (+₹{number(row.additions)}) − Leave (−₹{number(row.leave_deduction)})
                        {row.attendance?.urgent_out_deduction > 0 ? ` − Urgent Out (−₹${number(row.attendance.urgent_out_deduction)})` : ''} = Final (₹{number(row.final_payable)})
                    </p>
                </div>
                <button className="icon-button ghost" onClick={onClose}><X/></button>
            </div>

            <div className="salary-breakdown">
                <span><small>Monthly base salary</small><b>{rupees(row.monthly_salary)}</b></span>
                <span><small>Daily rate</small><b>{rupees(row.daily_rate)}</b></span>
                <span><small>Extra work / Additions</small><b style={{color: '#059669'}}>+ {rupees(row.additions)}</b></span>
                <span><small>Leave deduction</small><b style={{color: '#b91c1c'}}>− {rupees(row.leave_deduction)}</b></span>
                {row.attendance?.urgent_out_deduction > 0 && (
                    <span><small>Urgent Out કપાત</small><b style={{color: '#dc2626'}}>− {rupees(row.attendance.urgent_out_deduction)}</b></span>
                )}
                <span><small>Final payable</small><b style={{fontSize: '1.2rem', color: '#1e293b'}}>{rupees(row.final_payable)}</b></span>
            </div>

            {urgentBreaks.length > 0 && (
                <>
                    <h3 className="section-title" style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c'}}>
                        <span>🚨 Urgent Out (અર્જન્ટ બહાર) રિકોર્ડ અને કપાત ({urgentBreaks.length})</span>
                    </h3>
                    <p style={{fontSize: '12.5px', color: '#64748b', marginTop: '-8px', marginBottom: '12px'}}>
                        કર્મચારી પ્લાન્ટ પરથી અર્જન્ટ બહાર ગયેલ સમયની કપાત. જો કારણ વાજબી હોય તો સુપર એડમિન અહીંથી કપાત રકમ બદલી અથવા ₹0 માફ કરી શકે છે.
                    </p>

                    {/* 📱 Mobile Responsive Cards for Urgent Breaks */}
                    <div className="urgent-breaks-cards">
                        {urgentBreaks.map(item => (
                            <div key={item.id} className="urgent-break-card">
                                <div className="ub-card-top">
                                    <div>
                                        <b style={{fontSize: '13px'}}>{shortDate(item.date)}</b>
                                        <small style={{display: 'block', color: '#64748b', marginTop: '2px'}}>
                                            {item.started_at || '—'} થી {item.ended_at || 'ચાલુ'} ({item.duration_minutes ? `${item.duration_minutes} મિનિટ` : '—'})
                                        </small>
                                    </div>
                                    <div>
                                        {item.admin_waived ? (
                                            <span style={{background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700}}>
                                                માફ કરેલ (₹0)
                                            </span>
                                        ) : (
                                            <b className="ub-deduction-amount">− ₹{number(item.deduction_amount)}</b>
                                        )}
                                    </div>
                                </div>

                                {item.out_reason && (
                                    <div className="ub-reason">
                                        <b>કારણ:</b> {item.out_reason}
                                    </div>
                                )}

                                <div className="ub-card-footer">
                                    <div className="ub-selfie-links">
                                        {item.out_selfie_url && (
                                            <a href={item.out_selfie_url} target="_blank" rel="noreferrer" className="link" style={{fontSize: '12px'}}>
                                                📸 બહાર સેલ્ફી
                                            </a>
                                        )}
                                        {item.return_selfie_url && (
                                            <a href={item.return_selfie_url} target="_blank" rel="noreferrer" className="link" style={{fontSize: '12px'}}>
                                                📸 પરત સેલ્ફી
                                            </a>
                                        )}
                                        {!item.out_selfie_url && !item.return_selfie_url && <span style={{color: '#94a3b8'}}>સેલ્ફી નથી</span>}
                                    </div>
                                    <button
                                        type="button"
                                        className="secondary ub-edit-btn"
                                        onClick={() => onWaiveBreak(item)}
                                    >
                                        ✏️ {item.admin_waived ? 'કપાત બદલો' : 'માફ કરો / બદલો'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <h3 className="section-title">Extra work & Manual adjustment history</h3>
            {row.adjustments.length ? (
                <div className="salary-adjustment-list">
                    {row.adjustments.map(item => (
                        <div className={item.cancelled ? 'cancelled' : ''} key={item.id}>
                            <span className={`salary-adjustment-icon ${item.type}`}>
                                {item.type === 'addition' ? '+' : '−'}
                            </span>
                            <span style={{flex: 1}}>
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap'}}>
                                    <b>{item.type === 'addition' ? 'Extra Work Addition' : 'Deduction'} · {rupees(item.amount)}</b>
                                    {item.work_date && (
                                        <span style={{fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600}}>
                                            Work Date: {shortDate(item.work_date)}
                                        </span>
                                    )}
                                </div>
                                <small style={{display: 'block', marginTop: '3px', color: '#475569'}}>
                                    {item.reason}
                                    {item.company && ` · Company: ${item.company.name}`}
                                    {item.add_to_shared_expenses && ` · (Shared Expense added)`}
                                    {` · By ${item.created_by || 'Super admin'} on ${shortDate(item.created_at)}`}
                                </small>
                                {item.cancelled && <em>Cancelled by {item.cancelled_by || item.canceller || 'Super admin'} · {item.cancellation_reason}</em>}
                            </span>
                            {!item.cancelled && (
                                <button className="link" onClick={() => onCorrect(item)}>Correct / cancel</button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="info-banner">No manual salary adjustments or extra work recorded for this month.</div>
            )}

            <h3 className="section-title">Daily attendance and leave</h3>
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Urgent Out</th>
                            <th>Scheduled</th>
                            <th>Leave deduction</th>
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
                                <td>
                                    {day.urgent_out_count > 0 ? (
                                        <span style={{background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600}}>
                                            🚨 {day.urgent_out_count} વાર ({rupees(day.urgent_deduction)})
                                        </span>
                                    ) : '—'}
                                </td>
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
    );
}

function RateForm({form, setForm, onClose, onSaved}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api(`employees/${form.employee.id}/salary-rates`, {method: 'POST', body: JSON.stringify(form)});
            await onSaved('Monthly salary rate saved successfully.');
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal compact-salary-modal" onSubmit={save} style={{maxWidth: '460px'}}>
                <div className="panel-head" style={{marginBottom: '12px'}}>
                    <div>
                        <h2 style={{fontSize: '15px'}}>Set monthly salary</h2>
                        <p style={{fontSize: '11.5px'}}>{form.employee.name} · changes apply from effective month.</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={16}/></button>
                </div>
                <div className="form-grid two" style={{gap: '10px', marginBottom: '10px'}}>
                    <Field label="Effective month">
                        <input
                            type="month"
                            max={currentMonth()}
                            value={form.effective_month}
                            onChange={event => setForm({...form, effective_month: event.target.value})}
                            required
                        />
                    </Field>
                    <Field label="Full monthly salary">
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="₹0.00"
                            value={form.monthly_salary}
                            onChange={event => setForm({...form, monthly_salary: event.target.value})}
                            required
                        />
                    </Field>
                </div>
                {error && <div className="error">{error}</div>}
                <div className="form-actions" style={{marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontSize: '11px', color: '#64748b'}}>Previous months unchanged.</span>
                    <button className="primary" disabled={busy}>
                        {busy ? 'Saving…' : 'Save salary'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function AdjustmentForm({form, setForm, onClose, onSaved}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [companies, setCompanies] = useState([]);

    useEffect(() => {
        api('companies').then(res => setCompanies(res.filter(c => c.active))).catch(() => {});
    }, []);

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api('salary-adjustments', {method: 'POST', body: JSON.stringify(form)});
            await onSaved('Extra work / salary addition recorded successfully.');
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal compact-salary-modal" onSubmit={save} style={{maxWidth: '480px'}}>
                <div className="panel-head" style={{marginBottom: '12px'}}>
                    <div>
                        <h2 style={{fontSize: '15px'}}>Add salary adjustment / Extra work</h2>
                        <p style={{fontSize: '11.5px'}}>{form.employee.name} · {form.salary_month}</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={16}/></button>
                </div>

                <div className="form-grid two" style={{gap: '10px', marginBottom: '8px'}}>
                    <Field label="Adjustment type">
                        <select value={form.type} onChange={event => setForm({...form, type: event.target.value})}>
                            <option value="addition">Extra Work / Addition (+)</option>
                            <option value="deduction">Deduction (−)</option>
                        </select>
                    </Field>
                    <Field label="Work Date">
                        <input
                            type="date"
                            value={form.work_date || ''}
                            onChange={event => setForm({...form, work_date: event.target.value})}
                        />
                    </Field>
                </div>

                <div className="form-grid two" style={{gap: '10px', marginBottom: '8px'}}>
                    <Field label="Amount (₹)">
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="₹0.00"
                            value={form.amount}
                            onChange={event => setForm({...form, amount: event.target.value})}
                            required
                        />
                    </Field>
                    <Field label="Company (Optional)">
                        <select
                            value={form.company_id || ''}
                            onChange={event => setForm({...form, company_id: event.target.value ? Number(event.target.value) : ''})}
                        >
                            <option value="">All / None (Company neutral)</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <Field label="Work details / Reason">
                    <textarea
                        rows="2"
                        maxLength="1000"
                        placeholder="Explain the extra work performed or reason for addition..."
                        value={form.reason}
                        onChange={event => setForm({...form, reason: event.target.value})}
                        required
                    />
                </Field>

                {form.type === 'addition' && (
                    <label
                        className="toggle"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            margin: '10px 0 4px',
                            cursor: 'pointer',
                            padding: 0
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={!!form.add_to_shared_expenses}
                            onChange={event => setForm({...form, add_to_shared_expenses: event.target.checked})}
                        />
                        <span/>
                        <span style={{fontSize: '12px', fontWeight: 600, color: '#1e293b'}}>
                            {getLanguage() === 'en' ? 'Add to Company Shared Expenses' : 'કંપની ખર્ચમાં ઉમેરો (Add to Company Shared Expenses)'}
                        </span>
                    </label>
                )}

                {error && <div className="error">{error}</div>}

                <div className="form-actions" style={{marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontSize: '11px', color: '#64748b'}}>Visible to employee.</span>
                    <button className="primary" disabled={busy}>
                        {busy ? 'Saving…' : 'Record addition'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function CorrectionForm({form, setForm, onClose, onSaved}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        const body = {
            correction_reason: form.correction_reason,
            ...(form.replace ? {
                replacement_type: form.replacement_type,
                replacement_amount: form.replacement_amount,
                replacement_reason: form.replacement_reason
            } : {})
        };
        try {
            await api(`salary-adjustments/${form.adjustment.id}/cancel`, {method: 'POST', body: JSON.stringify(body)});
            await onSaved(form.replace ? 'Salary adjustment replaced successfully.' : 'Salary adjustment cancelled successfully.');
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal compact-salary-modal" onSubmit={save} style={{maxWidth: '500px'}}>
                <div className="panel-head" style={{marginBottom: '12px'}}>
                    <div>
                        <h2 style={{fontSize: '15px'}}>Correct salary adjustment</h2>
                        <p style={{fontSize: '11.5px'}}>The original entry remains visible in the audit history.</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={16}/></button>
                </div>

                <Field label="Cancellation reason">
                    <textarea
                        rows="2"
                        value={form.correction_reason}
                        onChange={event => setForm({...form, correction_reason: event.target.value})}
                        required
                    />
                </Field>

                <label className="toggle salary-replace-toggle" style={{margin: '10px 0', padding: 0}}>
                    <input
                        type="checkbox"
                        checked={form.replace}
                        onChange={event => setForm({...form, replace: event.target.checked})}
                    />
                    <span/>
                    <span style={{fontSize: '12px', fontWeight: 600, color: '#1e293b', marginLeft: '8px'}}>
                        Create a corrected replacement
                    </span>
                </label>

                {form.replace && (
                    <>
                        <div className="form-grid two" style={{gap: '10px', marginBottom: '8px'}}>
                            <Field label="Replacement type">
                                <select
                                    value={form.replacement_type}
                                    onChange={event => setForm({...form, replacement_type: event.target.value})}
                                >
                                    <option value="addition">Addition</option>
                                    <option value="deduction">Deduction</option>
                                </select>
                            </Field>
                            <Field label="Replacement amount">
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={form.replacement_amount}
                                    onChange={event => setForm({...form, replacement_amount: event.target.value})}
                                    required
                                />
                            </Field>
                        </div>
                        <Field label="Replacement reason">
                            <textarea
                                rows="2"
                                value={form.replacement_reason}
                                onChange={event => setForm({...form, replacement_reason: event.target.value})}
                                required
                            />
                        </Field>
                    </>
                )}

                {error && <div className="error">{error}</div>}

                <div className="form-actions" style={{marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontSize: '11px', color: '#64748b'}}>Cancelled entries never affect payable totals.</span>
                    <button className="primary" disabled={busy}>
                        {busy ? 'Saving…' : form.replace ? 'Cancel and replace' : 'Cancel adjustment'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function WaiveBreakModal({form, setForm, onClose, onSaved}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState(form.admin_waived ? 'waive' : (form.deduction_amount > 0 ? 'custom' : 'waive'));

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        const isWaive = mode === 'waive';
        const payload = {
            admin_waived: isWaive,
            deduction_amount: isWaive ? 0 : Number(form.deduction_amount),
            waive_reason: form.waive_reason || (isWaive ? 'Super Admin waived urgent departure deduction' : 'Super Admin adjusted deduction'),
        };
        try {
            await api(`attendance/breaks/${form.breakItem.id}/waive`, {method: 'POST', body: JSON.stringify(payload)});
            await onSaved(isWaive ? 'કપાત સંપૂર્ણપણે માફ કરવામાં આવી છે.' : 'કપાત રકમ સફળતાપૂર્વક અપડેટ થઈ ગઈ.');
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal compact-salary-modal" onSubmit={save} style={{maxWidth: '480px'}}>
                <div className="panel-head" style={{marginBottom: '12px'}}>
                    <div>
                        <h2 style={{fontSize: '15px'}}>🚨 Urgent Out કપાત એડિટ / માફ કરો</h2>
                        <p style={{fontSize: '11.5px'}}>
                            {form.employee.name} · {shortDate(form.breakItem.date)} ({form.breakItem.started_at} થી {form.breakItem.ended_at || 'ચાલુ'})
                        </p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={16}/></button>
                </div>

                <div style={{background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px'}}>
                    <div><b>બહાર જવાનું કારણ:</b> {form.breakItem.out_reason || 'નથી લખ્યું'}</div>
                    <div style={{marginTop: '3px'}}>
                        <b>સમય ગાળો:</b> {form.breakItem.duration_minutes} મિનિટ | <b>મૂળ કપાત રકમ:</b> ₹{number(form.breakItem.deduction_amount)}
                    </div>
                    <div style={{display: 'flex', gap: '14px', marginTop: '8px'}}>
                        {form.breakItem.out_selfie_url && (
                            <a href={form.breakItem.out_selfie_url} target="_blank" rel="noreferrer" style={{color: '#2563eb', fontWeight: 600}}>
                                📸 બહાર જતી વખતનો સેલ્ફી જુઓ
                            </a>
                        )}
                        {form.breakItem.return_selfie_url && (
                            <a href={form.breakItem.return_selfie_url} target="_blank" rel="noreferrer" style={{color: '#2563eb', fontWeight: 600}}>
                                📸 પરત આવ્યા વખતનો સેલ્ફી જુઓ
                            </a>
                        )}
                    </div>
                </div>

                <Field label="કપાત પ્રકાર">
                    <div style={{display: 'flex', gap: '16px', margin: '4px 0'}}>
                        <label style={{display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12.5px'}}>
                            <input
                                type="radio"
                                name="waive_mode"
                                checked={mode === 'waive'}
                                onChange={() => { setMode('waive'); setForm({...form, deduction_amount: 0}); }}
                            />
                            <span>સંપૂર્ણ માફ કરો (₹0 કપાત)</span>
                        </label>
                        <label style={{display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12.5px'}}>
                            <input
                                type="radio"
                                name="waive_mode"
                                checked={mode === 'custom'}
                                onChange={() => setMode('custom')}
                            />
                            <span>કસ્ટમ રકમ કપાત</span>
                        </label>
                    </div>
                </Field>

                {mode === 'custom' && (
                    <Field label="કપાત રકમ (₹)">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.deduction_amount}
                            onChange={e => setForm({...form, deduction_amount: e.target.value})}
                            required
                        />
                    </Field>
                )}

                <Field label="એડમિન રીમાર્ક / માફ કરવાનું કારણ">
                    <textarea
                        rows="2"
                        placeholder="ઉદા. અંગત મહત્વનું કામ હોવાથી કપાત માફ કરેલ..."
                        value={form.waive_reason}
                        onChange={e => setForm({...form, waive_reason: e.target.value})}
                        required
                    />
                </Field>

                {error && <div className="error">{error}</div>}

                <div className="form-actions" style={{marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <button type="button" className="secondary" onClick={onClose}>રદ કરો</button>
                    <button className="primary" disabled={busy}>
                        {busy ? 'સેવ થાય છે…' : mode === 'waive' ? 'કપાત માફ કરો (₹0)' : 'કપાત રકમ સેવ કરો'}
                    </button>
                </div>
            </form>
        </div>
    );
}
