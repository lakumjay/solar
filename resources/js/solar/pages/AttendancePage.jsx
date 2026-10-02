import React, {useEffect, useMemo, useState} from 'react';
import {ClockAlert, MapPin, PencilLine, Plus, Search, X} from 'lucide-react';
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
    const load = async () => {
        const query = new URLSearchParams({date});
        if (employeeId) query.set('employee_id', employeeId);
        const [attendance, people] = await Promise.all([api(`attendance?${query}`), api('employees')]);
        setRows(attendance);
        setEmployees(people);
    };
    useEffect(() => { load().catch(error => setMessage(error.message)); }, [date, employeeId]);
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
        {message && <div className={message.includes('saved') ? 'success' : 'error'}>{message}</div>}
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
                            placeholder="દા.ત. સોલાર પેનલ સાફ કરી, ઇન્વર્ટર 3 ચેક કર્યું, અર્થિંગ વેરિફિકેશન કર્યું..."
                            required
                        />
                    </Field>

                    <Field label="કર્મચારીએ આજે નવું શું શીખ્યું? (What did the employee learn?)">
                        <textarea
                            value={manual.learned}
                            onChange={event => setManual({...manual, learned: event.target.value})}
                            rows="3"
                            placeholder="દા.ત. DC ફ્યુઝ ટેસ્ટિંગ, SCADA મોનિટરિંગ ટૂલ શીખ્યા..."
                            required
                        />
                    </Field>

                    <Field label="મેનેજર દ્વારા હાજરી પૂરવાનું કારણ (Why is manager entering?)">
                        <textarea
                            value={manual.entry_reason}
                            onChange={event => setManual({...manual, entry_reason: event.target.value})}
                            rows="2"
                            placeholder="દા.ત. સ્માર્ટફોન બેટરી ડાઉન હતી / સાઇટ પર ઇન્ટરનેટ નેટવર્ક ન હતું..."
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
                        <textarea value={correction.correction_reason} onChange={event => setCorrection({...correction, correction_reason: event.target.value})} rows="2" placeholder="દા.ત. કર્મચારી સાંજે પંચ આઉટ કરવાનું ભૂલી ગયેલ..." required/>
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
    </div>;
}
