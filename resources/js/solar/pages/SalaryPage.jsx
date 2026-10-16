import React, {useEffect, useState} from 'react';
import {
    Building2,
    Calendar,
    CalendarClock,
    Check,
    CircleDollarSign,
    Download,
    Eye,
    FileText,
    IndianRupee,
    LayoutGrid,
    MinusCircle,
    PencilLine,
    Plus,
    PlusCircle,
    ReceiptIndianRupee,
    Sparkles,
    Table,
    TrendingDown,
    TrendingUp,
    User,
    Wallet,
    X
} from 'lucide-react';
import {api, getApiBaseUrl} from '../api';
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
                    <a className="secondary" href={`${getApiBaseUrl().base}salaries/export/excel?month=${month}`}>
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
                        <Metric icon={ReceiptIndianRupee} title="Attendance & Leave Cut (કપાત)" value={data.totals.total_attendance_deduction ?? data.totals.leave_deduction} unit="INR" color="amber"/>
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
                                                <small>Attendance / Leave Cut</small>
                                                <b>− {rupees(row.total_attendance_deduction ?? row.leave_deduction)}</b>
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
                                                        employee_id: row.employee.id,
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
                                            <th>Leave / Absent</th>
                                            <th>Prorated gross</th>
                                            <th>Attendance Cut</th>
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
                                                    <small>{number(row.attendance.approved_leave)} app / {number(row.absent_days || 0)} abs</small>
                                                </td>
                                                <td>{rupees(row.prorated_gross)}</td>
                                                <td className="danger-text">− {rupees(row.total_attendance_deduction ?? row.leave_deduction)}</td>
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
                                                                employee_id: row.employee.id,
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
    const [dailyViewMode, setDailyViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));
    const [selfiePreview, setSelfiePreview] = useState(null);
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
                        Base Prorated (₹{number(row.prorated_gross)}) + Extra (+₹{number(row.additions)}) − Attendance & Leave Cut (−₹{number(row.total_attendance_deduction ?? row.leave_deduction)})
                        {row.attendance?.urgent_out_deduction > 0 ? ` − Urgent Out (−₹${number(row.attendance.urgent_out_deduction)})` : ''} = Final (₹{number(row.final_payable)})
                    </p>
                </div>
                <button className="icon-button ghost" onClick={onClose}><X/></button>
            </div>

            <div className="salary-breakdown">
                <span><small>Monthly base salary</small><b>{rupees(row.monthly_salary)}</b></span>
                <span><small>Daily rate</small><b>{rupees(row.daily_rate)}</b></span>
                <span><small>Extra work / Additions</small><b style={{color: '#059669'}}>+ {rupees(row.additions)}</b></span>
                {row.absent_deduction > 0 && (
                    <span><small>Absent કપાત ({number(row.absent_days)} દિવસ)</small><b style={{color: '#dc2626'}}>− {rupees(row.absent_deduction)}</b></span>
                )}
                {row.half_day_deduction > 0 && (
                    <span><small>Half Day કપાત ({number(row.half_days_count)} વાર)</small><b style={{color: '#d97706'}}>− {rupees(row.half_day_deduction)}</b></span>
                )}
                {row.leave_deduction > 0 && (
                    <span><small>Approved Leave કપાત</small><b style={{color: '#b91c1c'}}>− {rupees(row.leave_deduction)}</b></span>
                )}
                <span><small>કુલ કપાત (Total Cut)</small><b style={{color: '#b91c1c'}}>− {rupees(row.total_attendance_deduction ?? row.leave_deduction)}</b></span>
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
                                            <button
                                                type="button"
                                                className="link"
                                                style={{fontSize: '12px', background: 'transparent', border: 0, padding: 0, cursor: 'pointer'}}
                                                onClick={() => setSelfiePreview({
                                                    url: item.out_selfie_url,
                                                    employee: row.employee.name,
                                                    date: item.date,
                                                    title: 'Urgent Out Selfie (બહાર સેલ્ફી)'
                                                })}
                                            >
                                                📸 બહાર સેલ્ફી
                                            </button>
                                        )}
                                        {item.return_selfie_url && (
                                            <button
                                                type="button"
                                                className="link"
                                                style={{fontSize: '12px', background: 'transparent', border: 0, padding: 0, cursor: 'pointer'}}
                                                onClick={() => setSelfiePreview({
                                                    url: item.return_selfie_url,
                                                    employee: row.employee.name,
                                                    date: item.date,
                                                    title: 'Urgent Out Return Selfie (પરત સેલ્ફી)'
                                                })}
                                            >
                                                📸 પરત સેલ્ફી
                                            </button>
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

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '20px 0 10px', flexWrap: 'wrap'}}>
                <h3 className="section-title" style={{margin: 0}}>Daily attendance and leave</h3>
                <button
                    type="button"
                    className="secondary view-toggle-btn"
                    onClick={() => setDailyViewMode(v => v === 'cards' ? 'table' : 'cards')}
                    style={{fontSize: '11px', padding: '5px 10px'}}
                    title="Toggle between Card view and Table view"
                >
                    {dailyViewMode === 'cards' ? <Table size={14}/> : <LayoutGrid size={14}/>}
                    <span>{dailyViewMode === 'cards' ? 'Table View' : 'Card View'}</span>
                </button>
            </div>

            {dailyViewMode === 'cards' ? (
                <div className="salary-daily-cards-grid">
                    {row.days.map(day => (
                        <div key={day.date} className="salary-daily-card">
                            <div className="sd-card-top">
                                <div>
                                    <b className="sd-date">{shortDate(day.date)}</b>
                                    <small className="sd-sub">{day.holiday || (day.weekly_off ? 'Weekly off' : 'Working day')}</small>
                                </div>
                                <span className={`status ${day.status === 'present' ? 'on' : (day.status === 'absent' ? 'off' : 'warning')}`} style={{fontSize: '10.5px', padding: '2px 8px'}}>
                                    {day.status.replaceAll('_', ' ')}
                                </span>
                            </div>
                            <div className="sd-times-grid">
                                <div className="sd-chip">
                                    <small>Time In</small>
                                    <b>{day.clock_in || '—'}</b>
                                </div>
                                <div className="sd-chip">
                                    <small>Time Out</small>
                                    <b>{day.clock_out || '—'}</b>
                                </div>
                                <div className="sd-chip">
                                    <small>Scheduled</small>
                                    <b>{number(day.scheduled_units)} unit</b>
                                </div>
                                {day.urgent_out_count > 0 && (
                                    <div className="sd-chip danger">
                                        <small>Urgent Out</small>
                                        <b>{day.urgent_out_count} વાર ({rupees(day.urgent_deduction)})</b>
                                    </div>
                                )}
                                {day.absent_units > 0 && (
                                    <div className="sd-chip danger">
                                        <small>Absent Cut</small>
                                        <b>− {number(day.absent_units)} unit (ગેરહાજર)</b>
                                    </div>
                                )}
                                {day.half_day_cut_units > 0 && (
                                    <div className="sd-chip danger">
                                        <small>Half Day Cut</small>
                                        <b>− {number(day.half_day_cut_units)} unit (અડધો દિવસ)</b>
                                    </div>
                                )}
                                {day.leave_units > 0 && (
                                    <div className="sd-chip danger">
                                        <small>Leave Cut</small>
                                        <b>− {number(day.leave_units)} unit (રજા)</b>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Urgent Out</th>
                                <th>Scheduled</th>
                                <th>Absent / Leave Cut</th>
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
                                    <td>
                                        {day.absent_units > 0 ? (
                                            <span style={{color: '#dc2626', fontWeight: 700}}>− {number(day.absent_units)} unit (ગેરહાજર)</span>
                                        ) : (day.half_day_cut_units > 0 ? (
                                            <span style={{color: '#d97706', fontWeight: 700}}>− {number(day.half_day_cut_units)} unit (અડધો દિવસ)</span>
                                        ) : (day.leave_units > 0 ? (
                                            <span style={{color: '#b91c1c', fontWeight: 700}}>− {number(day.leave_units)} unit (રજા)</span>
                                        ) : '—'))}
                                    </td>
                                    <td>{day.clock_in || '—'}</td>
                                    <td>{day.clock_out || '—'}</td>
                                    <td>{day.holiday || (day.weekly_off ? 'Weekly off' : 'Working day')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selfiePreview && (
                <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelfiePreview(null)}>
                    <div className="modal attendance-photo-modal" role="dialog">
                        <div className="panel-head">
                            <div>
                                <h2>{selfiePreview.title || 'Selfie Preview'}</h2>
                                <p>{selfiePreview.employee} · {selfiePreview.date}</p>
                            </div>
                            <button type="button" className="icon-button ghost" onClick={() => setSelfiePreview(null)}>
                                <X size={18}/>
                            </button>
                        </div>
                        <img className="attendance-photo-preview" src={selfiePreview.url} alt={`${selfiePreview.employee} selfie`}/>
                    </div>
                </div>
            )}
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

    const parsedSalary = parseFloat(form.monthly_salary) || 0;

    return (
        <div className="modal-backdrop">
            <form className="modal modern-salary-modal" onSubmit={save} style={{maxWidth: '470px'}}>
                <div className="modern-modal-header">
                    <div className="modern-modal-header-left">
                        <div className="modern-modal-icon-badge salary">
                            <Wallet size={20}/>
                        </div>
                        <div>
                            <h2 className="modern-modal-title">
                                {getLanguage() === 'gu' ? 'માસિક ફિક્સ પગાર સેટ કરો' : 'Set Monthly Salary'}
                            </h2>
                            <div className="modern-modal-subpills">
                                <span className="modern-modal-pill employee-pill">
                                    <User size={12}/> {form.employee.name}
                                </span>
                                <span className="modern-modal-pill">
                                    <Calendar size={12}/> {form.effective_month || currentMonth()}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="modern-modal-close-btn" onClick={onClose} title="Close">
                        <X size={16}/>
                    </button>
                </div>

                <div className="form-grid two salary-modal-grid" style={{gap: '10px', marginBottom: '10px'}}>
                    <Field label={getLanguage() === 'gu' ? 'ક્યારથી લાગુ (Effective month)' : 'Effective month'}>
                        <input
                            type="month"
                            max={currentMonth()}
                            value={form.effective_month}
                            onChange={event => setForm({...form, effective_month: event.target.value})}
                            required
                        />
                    </Field>
                    <div className="modern-input-field" style={{marginBottom: 0}}>
                        <label className="modern-input-label">
                            <span>{getLanguage() === 'gu' ? 'માસિક પગાર (Monthly Salary)' : 'Full monthly salary'}</span>
                        </label>
                        <div className="modern-currency-wrapper">
                            <span className="modern-currency-prefix">₹</span>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0.00"
                                className="modern-currency-input"
                                value={form.monthly_salary}
                                onChange={event => setForm({...form, monthly_salary: event.target.value})}
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="quick-amount-chips" style={{marginBottom: '10px'}}>
                    <span style={{fontSize: '9.5px', color: '#94a3b8', marginRight: '1px'}}>ઝડપી રકમ:</span>
                    {[8000, 10000, 12000, 15000, 20000, 25000].map(amt => (
                        <button
                            key={amt}
                            type="button"
                            className="quick-amount-chip"
                            onClick={() => setForm({...form, monthly_salary: amt.toString()})}
                        >
                            ₹{amt.toLocaleString('en-IN')}
                        </button>
                    ))}
                </div>

                <div style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: '#64748b', margin: '6px 0 10px'}}>
                    <Eye size={12}/>
                    <span>{getLanguage() === 'gu' ? 'અગાઉના મહિનાના પગારમાં કોઈ ફેરફાર નહીં થાય.' : 'Previous months remain unchanged. Applied from this month onwards.'}</span>
                </div>

                {error && <div className="error">{error}</div>}

                <div className="modern-modal-footer">
                    <button type="button" className="btn-secondary-ghost" onClick={onClose}>
                        {getLanguage() === 'gu' ? 'રદ કરો' : 'Cancel'}
                    </button>
                    <button type="submit" className="btn-submit-action addition" disabled={busy || !parsedSalary}>
                        {busy ? (getLanguage() === 'gu' ? 'સેવ થાય છે…' : 'Saving…') : (
                            <>
                                <Check size={14}/>
                                <span>{parsedSalary > 0 ? (getLanguage() === 'gu' ? `પગાર સેવ (₹${parsedSalary.toLocaleString('en-IN')})` : `Save salary (₹${parsedSalary.toLocaleString('en-IN')})`) : (getLanguage() === 'gu' ? 'પગાર સેવ કરો' : 'Save salary')}</span>
                            </>
                        )}
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

    const isAddition = form.type === 'addition';
    const parsedAmount = parseFloat(form.amount) || 0;

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api('salary-adjustments', {
                method: 'POST',
                body: JSON.stringify({
                    employee_id: form.employee_id || form.employee?.id,
                    salary_month: form.salary_month,
                    type: form.type,
                    amount: parsedAmount,
                    reason: form.reason?.trim() || '',
                    work_date: form.work_date || null,
                    company_id: form.company_id ? Number(form.company_id) : null,
                    add_to_shared_expenses: isAddition ? !!form.add_to_shared_expenses : false
                })
            });
            await onSaved(isAddition
                ? (getLanguage() === 'gu' ? 'વધારાનું કામ / પગાર એડિશન સફળતાપૂર્વક ઉમેરાઈ ગયું.' : 'Extra work / salary addition recorded successfully.')
                : (getLanguage() === 'gu' ? 'પગાર કપાત સફળતાપૂર્વક રેકોર્ડ થઈ ગઈ.' : 'Salary deduction recorded successfully.')
            );
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal modern-salary-modal" onSubmit={save}>
                {/* Modern Header */}
                <div className="modern-modal-header">
                    <div className="modern-modal-header-left">
                        <div className={`modern-modal-icon-badge ${form.type}`}>
                            {isAddition ? <Sparkles size={20}/> : <TrendingDown size={20}/>}
                        </div>
                        <div>
                            <h2 className="modern-modal-title">
                                {getLanguage() === 'gu'
                                    ? (isAddition ? 'વધારાનું કામ / પગાર એડિશન' : 'પગાર કપાત / ડિડક્શન')
                                    : (isAddition ? 'Add Extra Work / Salary Addition' : 'Add Salary Deduction')}
                            </h2>
                            <div className="modern-modal-subpills">
                                <span className="modern-modal-pill employee-pill">
                                    <User size={12}/> {form.employee.name}
                                </span>
                                <span className="modern-modal-pill">
                                    <Calendar size={12}/> {form.salary_month}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="modern-modal-close-btn" onClick={onClose} title="Close">
                        <X size={16}/>
                    </button>
                </div>

                {/* Segmented Adjustment Type Selector */}
                <div className="adjustment-type-grid">
                    <div
                        className={`adjustment-type-card addition ${isAddition ? 'active' : ''}`}
                        onClick={() => setForm({...form, type: 'addition'})}
                        role="button"
                        tabIndex={0}
                    >
                        <div className="card-icon-wrap">
                            <PlusCircle size={18}/>
                        </div>
                        <div className="card-text-wrap">
                            <div className="card-title">
                                {getLanguage() === 'gu' ? '➕ વધારાનું કામ (Addition)' : '➕ Extra Work / Addition'}
                            </div>
                            <div className="card-sub">
                                {getLanguage() === 'gu' ? 'પગારમાં રકમ ઉમેરાશે (+)' : 'Adds to payout (+)'}
                            </div>
                        </div>
                        {isAddition && <Check size={16} style={{color: '#059669', flexShrink: 0}}/>}
                    </div>

                    <div
                        className={`adjustment-type-card deduction ${!isAddition ? 'active' : ''}`}
                        onClick={() => setForm({...form, type: 'deduction', add_to_shared_expenses: false})}
                        role="button"
                        tabIndex={0}
                    >
                        <div className="card-icon-wrap">
                            <MinusCircle size={18}/>
                        </div>
                        <div className="card-text-wrap">
                            <div className="card-title">
                                {getLanguage() === 'gu' ? '➖ કપાત (Deduction)' : '➖ Deduction / Penalty'}
                            </div>
                            <div className="card-sub">
                                {getLanguage() === 'gu' ? 'પગારમાંથી કપાશે (−)' : 'Subtracts from payout (−)'}
                            </div>
                        </div>
                        {!isAddition && <Check size={16} style={{color: '#e11d48', flexShrink: 0}}/>}
                    </div>
                </div>

                {/* Currency Amount Field with Quick Presets */}
                <div className="modern-input-field">
                    <label className="modern-input-label">
                        <span>{getLanguage() === 'gu' ? 'રકમ (Amount)' : 'Amount'}</span>
                    </label>
                    <div className="modern-currency-wrapper">
                        <span className="modern-currency-prefix">₹</span>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            className="modern-currency-input"
                            value={form.amount}
                            onChange={event => setForm({...form, amount: event.target.value})}
                            required
                        />
                    </div>
                    <div className="quick-amount-chips">
                        <span style={{fontSize: '9.5px', color: '#94a3b8', marginRight: '1px'}}>ઝડપી રકમ:</span>
                        {[200, 500, 1000, 2000, 5000].map(amt => (
                            <button
                                key={amt}
                                type="button"
                                className="quick-amount-chip"
                                onClick={() => setForm({...form, amount: amt.toString()})}
                            >
                                {isAddition ? '+' : '−'}₹{amt.toLocaleString('en-IN')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Work Date & Company Allocation Grid */}
                <div className="form-grid two salary-modal-grid" style={{gap: '10px', marginBottom: '10px'}}>
                    <Field label={getLanguage() === 'gu' ? 'કામની તારીખ (Work Date)' : 'Work Date'}>
                        <input
                            type="date"
                            value={form.work_date || ''}
                            onChange={event => setForm({...form, work_date: event.target.value})}
                        />
                    </Field>
                    <Field label={getLanguage() === 'gu' ? 'કંપની (Company Allocation)' : 'Company (Optional)'}>
                        <select
                            value={form.company_id || ''}
                            onChange={event => setForm({...form, company_id: event.target.value ? Number(event.target.value) : ''})}
                        >
                            <option value="">{getLanguage() === 'gu' ? '🌐 તમામ / ન્યુટ્રલ (Company neutral)' : 'All / None (Company neutral)'}</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                {/* Work Details / Reason */}
                <Field label={getLanguage() === 'gu' ? 'કામની વિગત અથવા કારણ (Reason / Details)' : 'Work details / Reason'}>
                    <textarea
                        rows="2"
                        maxLength="1000"
                        placeholder={isAddition
                            ? (getLanguage() === 'gu' ? 'દા.ત. રવિવારે સોલાર પેનલ સફાઈ, ઇન્વર્ટર સર્વિસિંગ, ઓવરટાઇમ કામગીરી...' : 'Explain the extra work performed (e.g. Extra panel cleaning on Sunday, inverter servicing)...')
                            : (getLanguage() === 'gu' ? 'દા.ત. અગાઉ આપેલ એડવાન્સ પગાર કપાત, મોડું આવવાનો દંડ...' : 'Explain reason for deduction (e.g. Advance salary recovery, late penalty)...')
                        }
                        value={form.reason}
                        onChange={event => setForm({...form, reason: event.target.value})}
                        required
                    />
                </Field>

                {/* Company Shared Expenses Switch Card (Bulletproof layout) */}
                {isAddition && (
                    <div
                        className={`modern-switch-card ${form.add_to_shared_expenses ? 'checked' : ''}`}
                        onClick={() => setForm({...form, add_to_shared_expenses: !form.add_to_shared_expenses})}
                        role="button"
                        tabIndex={0}
                    >
                        <div className="switch-card-left">
                            <div className="switch-card-icon">
                                <ReceiptIndianRupee size={15}/>
                            </div>
                            <div className="switch-card-text">
                                <div className="switch-card-title">
                                    {getLanguage() === 'gu' ? 'કંપની શેરિંગ ખર્ચમાં ઉમેરો (Shared Expense)' : 'Add to Company Shared Expenses'}
                                </div>
                                <div className="switch-card-desc">
                                    {getLanguage() === 'gu' ? 'આ રકમ પાર્ટનર્સ વચ્ચેના કંપની ખર્ચ લિસ્ટમાં પણ રેકોર્ડ થશે.' : 'Record this payout in shared expenses for partner cost-splitting.'}
                                </div>
                            </div>
                        </div>
                        <div className="modern-switch-wrapper" onClick={e => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                id="shared_expense_toggle"
                                className="modern-switch-input"
                                checked={!!form.add_to_shared_expenses}
                                onChange={event => setForm({...form, add_to_shared_expenses: event.target.checked})}
                            />
                            <label htmlFor="shared_expense_toggle" className="modern-switch-slider"/>
                        </div>
                    </div>
                )}

                {/* Impact Preview & Notice */}
                {parsedAmount > 0 ? (
                    <div className={`salary-impact-bar ${form.type}`}>
                        <span>
                            {isAddition
                                ? `💡 +₹${parsedAmount.toLocaleString('en-IN')} will be added to ${form.employee.name}'s salary`
                                : `⚠️ −₹${parsedAmount.toLocaleString('en-IN')} will be deducted from ${form.employee.name}'s salary`}
                        </span>
                        <span style={{opacity: 0.85, fontSize: '10px'}}>
                            {getLanguage() === 'gu' ? '👁️ સ્લિપ પર દેખાશે' : '👁️ Visible on slip'}
                        </span>
                    </div>
                ) : (
                    <div style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: '#64748b', margin: '6px 0 10px'}}>
                        <Eye size={12}/>
                        <span>{getLanguage() === 'gu' ? 'કર્મચારીને તેના સેલ્ફ-સર્વિસ પોર્ટલ અને પગાર સ્લિપમાં વિગત દેખાશે.' : 'Visible to employee on self-service portal and pay slip.'}</span>
                    </div>
                )}

                {error && <div className="error">{error}</div>}

                {/* Footer Actions */}
                <div className="modern-modal-footer">
                    <button type="button" className="btn-secondary-ghost" onClick={onClose}>
                        {getLanguage() === 'gu' ? 'રદ કરો' : 'Cancel'}
                    </button>
                    <button
                        type="submit"
                        className={`btn-submit-action ${form.type}`}
                        disabled={busy || !parsedAmount || !form.reason?.trim()}
                    >
                        {busy ? (
                            <span>{getLanguage() === 'gu' ? 'સેવ થાય છે…' : 'Saving…'}</span>
                        ) : isAddition ? (
                            <>
                                <PlusCircle size={14}/>
                                <span>
                                    {parsedAmount > 0
                                        ? (getLanguage() === 'gu' ? `એડિશન સેવ (+₹${parsedAmount.toLocaleString('en-IN')})` : `Record addition (+₹${parsedAmount.toLocaleString('en-IN')})`)
                                        : (getLanguage() === 'gu' ? 'એડિશન સેવ કરો' : 'Record addition')
                                    }
                                </span>
                            </>
                        ) : (
                            <>
                                <MinusCircle size={14}/>
                                <span>
                                    {parsedAmount > 0
                                        ? (getLanguage() === 'gu' ? `કપાત સેવ (−₹${parsedAmount.toLocaleString('en-IN')})` : `Record deduction (−₹${parsedAmount.toLocaleString('en-IN')})`)
                                        : (getLanguage() === 'gu' ? 'કપાત સેવ કરો' : 'Record deduction')
                                    }
                                </span>
                            </>
                        )}
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
            <form className="modal modern-salary-modal" onSubmit={save} style={{maxWidth: '500px'}}>
                <div className="modern-modal-header">
                    <div className="modern-modal-header-left">
                        <div className="modern-modal-icon-badge deduction">
                            <PencilLine size={16}/>
                        </div>
                        <div>
                            <h2 className="modern-modal-title">
                                {getLanguage() === 'gu' ? 'પગાર એડજસ્ટમેન્ટ સુધારો / રદ કરો' : 'Correct Salary Adjustment'}
                            </h2>
                            <div className="modern-modal-subpills">
                                <span className="modern-modal-pill">
                                    મૂળ રકમ: ₹{number(form.adjustment?.amount)} ({form.adjustment?.type === 'addition' ? '+' : '−'})
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="modern-modal-close-btn" onClick={onClose} title="Close">
                        <X size={16}/>
                    </button>
                </div>

                <Field label={getLanguage() === 'gu' ? 'રદ કરવાનું કારણ (Cancellation reason)' : 'Cancellation reason'}>
                    <textarea
                        rows="2"
                        placeholder="Explain reason for cancelling or replacing this entry..."
                        value={form.correction_reason}
                        onChange={event => setForm({...form, correction_reason: event.target.value})}
                        required
                    />
                </Field>

                <div
                    className={`modern-switch-card ${form.replace ? 'checked' : ''}`}
                    onClick={() => setForm({...form, replace: !form.replace})}
                    role="button"
                    tabIndex={0}
                >
                    <div className="switch-card-left">
                        <div className="switch-card-icon">
                            <Sparkles size={15}/>
                        </div>
                        <div className="switch-card-text">
                            <div className="switch-card-title">
                                {getLanguage() === 'gu' ? 'નવા સાચા એડજસ્ટમેન્ટથી બદલો' : 'Create a corrected replacement'}
                            </div>
                            <div className="switch-card-desc">
                                {getLanguage() === 'gu' ? 'જૂની એન્ટ્રી કેન્સલ થશે અને નવી સુધારેલી એન્ટ્રી ઉમેરાશે.' : 'Cancels this entry and automatically records a new corrected one.'}
                            </div>
                        </div>
                    </div>
                    <div className="modern-switch-wrapper" onClick={e => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            id="replace_toggle"
                            className="modern-switch-input"
                            checked={!!form.replace}
                            onChange={event => setForm({...form, replace: event.target.checked})}
                        />
                        <label htmlFor="replace_toggle" className="modern-switch-slider"/>
                    </div>
                </div>

                {form.replace && (
                    <>
                        <div className="form-grid two salary-modal-grid" style={{gap: '10px', marginBottom: '10px'}}>
                            <Field label={getLanguage() === 'gu' ? 'નવો પ્રકાર (Type)' : 'Replacement type'}>
                                <select
                                    value={form.replacement_type}
                                    onChange={event => setForm({...form, replacement_type: event.target.value})}
                                >
                                    <option value="addition">➕ Addition (+)</option>
                                    <option value="deduction">➖ Deduction (−)</option>
                                </select>
                            </Field>
                            <div className="modern-input-field" style={{marginBottom: 0}}>
                                <label className="modern-input-label">
                                    <span>{getLanguage() === 'gu' ? 'નવી રકમ' : 'Replacement amount'}</span>
                                </label>
                                <div className="modern-currency-wrapper">
                                    <span className="modern-currency-prefix">₹</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        className="modern-currency-input"
                                        value={form.replacement_amount}
                                        onChange={event => setForm({...form, replacement_amount: event.target.value})}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                        <Field label={getLanguage() === 'gu' ? 'નવું કારણ / વિગત' : 'Replacement reason'}>
                            <textarea
                                rows="2"
                                placeholder="Explain details for replacement..."
                                value={form.replacement_reason}
                                onChange={event => setForm({...form, replacement_reason: event.target.value})}
                                required
                            />
                        </Field>
                    </>
                )}

                {error && <div className="error">{error}</div>}

                <div className="modern-modal-footer">
                    <button type="button" className="btn-secondary-ghost" onClick={onClose}>
                        {getLanguage() === 'gu' ? 'રદ કરો' : 'Cancel'}
                    </button>
                    <button type="submit" className="btn-submit-action deduction" disabled={busy || !form.correction_reason?.trim()}>
                        {busy ? (getLanguage() === 'gu' ? 'સેવ થાય છે…' : 'Saving…') : form.replace ? (getLanguage() === 'gu' ? 'બદલો અને સેવ કરો' : 'Cancel and replace') : (getLanguage() === 'gu' ? 'એડજસ્ટમેન્ટ રદ કરો' : 'Cancel adjustment')}
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
            <form className="modal modern-salary-modal" onSubmit={save} style={{maxWidth: '500px'}}>
                <div className="modern-modal-header">
                    <div className="modern-modal-header-left">
                        <div className="modern-modal-icon-badge deduction" style={{background: '#fef2f2', color: '#dc2626'}}>
                            🚨
                        </div>
                        <div>
                            <h2 className="modern-modal-title">
                                Urgent Out કપાત એડિટ / માફ કરો
                            </h2>
                            <div className="modern-modal-subpills">
                                <span className="modern-modal-pill employee-pill">
                                    <User size={12}/> {form.employee.name}
                                </span>
                                <span className="modern-modal-pill">
                                    <Calendar size={12}/> {shortDate(form.breakItem.date)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="modern-modal-close-btn" onClick={onClose} title="Close">
                        <X size={16}/>
                    </button>
                </div>

                <div style={{background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px', fontSize: '12px'}}>
                    <div><b>બહાર જવાનું કારણ:</b> {form.breakItem.out_reason || 'નથી લખ્યું'}</div>
                    <div style={{marginTop: '4px', color: '#475569'}}>
                        <b>સમય ગાળો:</b> {form.breakItem.duration_minutes} મિનિટ | <b>મૂળ કપાત રકમ:</b> <b style={{color: '#dc2626'}}>₹{number(form.breakItem.deduction_amount)}</b>
                    </div>
                    <div style={{display: 'flex', gap: '14px', marginTop: '8px'}}>
                        {form.breakItem.out_selfie_url && (
                            <a href={form.breakItem.out_selfie_url} target="_blank" rel="noreferrer" style={{color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                                📸 બહાર જતી વખતનો સેલ્ફી જુઓ
                            </a>
                        )}
                        {form.breakItem.return_selfie_url && (
                            <a href={form.breakItem.return_selfie_url} target="_blank" rel="noreferrer" style={{color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                                📸 પરત આવ્યા વખતનો સેલ્ફી જુઓ
                            </a>
                        )}
                    </div>
                </div>

                <Field label="કપાત પ્રકાર">
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '4px 0 10px'}}>
                        <div
                            className={`adjustment-type-card addition ${mode === 'waive' ? 'active' : ''}`}
                            onClick={() => { setMode('waive'); setForm({...form, deduction_amount: 0}); }}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="card-text-wrap">
                                <div className="card-title">સંપૂર્ણ માફ કરો</div>
                                <div className="card-sub">₹0 કપાત (Zero penalty)</div>
                            </div>
                            {mode === 'waive' && <Check size={16} style={{color: '#059669'}}/>}
                        </div>

                        <div
                            className={`adjustment-type-card deduction ${mode === 'custom' ? 'active' : ''}`}
                            onClick={() => setMode('custom')}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="card-text-wrap">
                                <div className="card-title">કસ્ટમ રકમ કપાત</div>
                                <div className="card-sub">રકમ જાતે નક્કી કરો</div>
                            </div>
                            {mode === 'custom' && <Check size={16} style={{color: '#dc2626'}}/>}
                        </div>
                    </div>
                </Field>

                {mode === 'custom' && (
                    <div className="modern-input-field">
                        <label className="modern-input-label">
                            <span>નવી કપાત રકમ (₹)</span>
                        </label>
                        <div className="modern-currency-wrapper">
                            <span className="modern-currency-prefix">₹</span>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="modern-currency-input"
                                value={form.deduction_amount}
                                onChange={e => setForm({...form, deduction_amount: e.target.value})}
                                required
                            />
                        </div>
                    </div>
                )}

                <Field label="એડમિન રીમાર્ક / માફ કરવાનું કારણ">
                    <textarea
                        rows="2"
                        placeholder="ઉદા. અંગત મહત્વનું કામ હોવાથી કપાત માફ કરેલ..."
                        value={form.waive_reason}
                        onChange={e => setForm({...form, waive_reason: e.target.value})}
                        required
                        style={{borderRadius: '10px'}}
                    />
                </Field>

                {error && <div className="error">{error}</div>}

                <div className="modern-modal-footer">
                    <button type="button" className="btn-secondary-ghost" onClick={onClose}>
                        રદ કરો
                    </button>
                    <button type="submit" className="btn-submit-action addition" disabled={busy}>
                        {busy ? 'સેવ થાય છે…' : mode === 'waive' ? 'કપાત માફ કરો (₹0)' : 'કપાત રકમ સેવ કરો'}
                    </button>
                </div>
            </form>
        </div>
    );
}
