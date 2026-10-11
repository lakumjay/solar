import React, {useEffect, useMemo, useState} from 'react';
import {Eye, EyeOff, IndianRupee, Search, UserRound, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field} from '../components/Common';
import {getLanguage} from '../utils/translations';

const DAYS = [['0', 'Sun (રવિ)'], ['1', 'Mon (સોમ)'], ['2', 'Tue (મંગળ)'], ['3', 'Wed (બુધ)'], ['4', 'Thu (ગુરુ)'], ['5', 'Fri (શુક્ર)'], ['6', 'Sat (શનિ)']];
const emptyEmployee = {name: '', email: '', password: '', employee_code: '', mobile: '', designation: '', department: '', joining_date: '', active: true, manager_attendance_only: false, shift_start: '09:00', shift_end: '18:00', working_minutes: 480, half_day_minutes: 240, grace_minutes: 15, weekly_offs: []};

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function EmployeesPage({can, currentUser}) {
    const [employees, setEmployees] = useState([]);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [salarySaving, setSalarySaving] = useState(false);
    const [salaryRates, setSalaryRates] = useState([]);
    const [salaryForm, setSalaryForm] = useState({effective_month: currentMonth(), monthly_salary: ''});
    const [salaryMessage, setSalaryMessage] = useState('');
    const [currentLang, setCurrentLang] = useState(() => getLanguage());

    useEffect(() => {
        const handler = (e) => setCurrentLang(e.detail || getLanguage());
        window.addEventListener('solarflow_language_change', handler);
        return () => window.removeEventListener('solarflow_language_change', handler);
    }, []);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await api('employees');
            setEmployees(data || []);
        } catch (err) {
            setError(err.message || 'Failed to load employees.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const filteredEmployees = useMemo(() => {
        if (!search.trim()) return employees;
        const q = search.toLowerCase();
        return (employees || []).filter(e => 
            (e.name || '').toLowerCase().includes(q) ||
            (e.employee_code || '').toLowerCase().includes(q) ||
            (e.mobile || '').includes(q) ||
            (e.designation || '').toLowerCase().includes(q)
        );
    }, [employees, search]);

    const edit = employee => {
        setPhoto(null);
        setShowPassword(false);
        setForm({...employee, password: '', shift_start: employee.shift_start?.slice(0, 5), shift_end: employee.shift_end?.slice(0, 5), weekly_offs: employee.weekly_offs ?? []});
        setSalaryMessage('');
        setSalaryForm({effective_month: currentMonth(), monthly_salary: ''});
        if (['super_admin', 'company_admin'].includes(currentUser?.role)) api(`employees/${employee.id}/salary-rates`).then(setSalaryRates).catch(error => setSalaryMessage(error.message));
    };
    const saveSalary = async () => {
        setSalaryMessage('');
        setSalarySaving(true);
        try {
            await api(`employees/${form.id}/salary-rates`, {method: 'POST', body: JSON.stringify(salaryForm)});
            setSalaryRates(await api(`employees/${form.id}/salary-rates`));
            setSalaryMessage(currentLang === 'en' ? 'Monthly salary saved successfully.' : 'માસિક પગાર સફળતાપૂર્વક સેવ થયો.');
        } catch (error) { setSalaryMessage(error.message); }
        finally { setSalarySaving(false); }
    };
    const save = async event => {
        event.preventDefault();
        setMessage('');
        if (form.mobile && form.mobile.replace(/\D/g, '').length !== 10) {
            setMessage(currentLang === 'en' ? 'Mobile number must be exactly 10 digits.' : 'મોબાઈલ નંબર બરાબર ૧૦ આંકડાનો હોવો જરૂરી છે.');
            return;
        }
        const body = new FormData();
        Object.entries(form).forEach(([key, value]) => {
            if (['user', 'profile_photo_url', 'weekly_offs', 'created_at', 'updated_at', 'profile_photo_path'].includes(key) || value === null || value === '') return;
            body.append(key, ['active', 'manager_attendance_only'].includes(key) ? (value ? '1' : '0') : value);
        });
        (form.weekly_offs || []).forEach(day => body.append('weekly_offs[]', day));
        if (photo) body.append('profile_photo', photo);
        setSaving(true);
        try {
            await api('employees', {method: 'POST', body});
            setMessage(currentLang === 'en' ? 'Employee saved successfully.' : 'કર્મચારી સફળતાપૂર્વક સેવ થયો.');
            setForm(null);
            await load();
        } catch (error) { setMessage(error.message); }
        finally { setSaving(false); }
    };

    return <div className="management-layout employee-management">
        <section className="panel management-list">
            <div className="panel-head">
                <div>
                    <h2>{currentLang === 'en' ? 'Common employees' : 'કર્મચારીઓ (Employees)'}</h2>
                    <p>{employees.length} {currentLang === 'en' ? 'employees across the system' : 'કુલ સિસ્ટમ કર્મચારીઓ'}</p>
                </div>
                {can('manage_employees') && <button className="icon-button" onClick={() => {setForm({...emptyEmployee}); setPhoto(null); setSalaryRates([]);}} title={currentLang === 'en' ? 'Add Employee' : 'નવો કર્મચારી ઉમેરો'}>+</button>}
            </div>
            <div style={{padding: '0 12px 10px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px'}}>
                    <Search size={14} style={{color: '#64748b'}}/>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={currentLang === 'en' ? 'Search employee by name, code or mobile…' : 'નામ, કોડ કે મોબાઇલથી સર્ચ કરો…'}
                        style={{border: 0, outline: 'none', background: 'transparent', width: '100%', fontSize: '12px'}}
                    />
                    {search && <button type="button" onClick={() => setSearch('')} style={{border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8'}}>✕</button>}
                </div>
            </div>
            {error && (
                <div style={{margin: '0 12px 12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    <span>{error}</span>
                    <button type="button" onClick={load} style={{background: '#dc2626', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px'}}>
                        Retry
                    </button>
                </div>
            )}
            {loading ? (
                <div style={{padding: '30px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px'}}>
                    <div className="animate-spin" style={{display: 'inline-block', marginBottom: '8px'}}>⏳</div>
                    <div>{currentLang === 'en' ? 'Loading employees…' : 'કર્મચારીઓ લોડ થઈ રહ્યા છે...'}</div>
                </div>
            ) : filteredEmployees.length === 0 ? (
                <div style={{padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px'}}>
                    {currentLang === 'en' ? 'No employees found.' : 'કોઈ કર્મચારી મળ્યા નથી.'}
                </div>
            ) : (
                filteredEmployees.map(employee => <button className="list-row" onClick={() => edit(employee)} key={employee.id}><span className="avatar employee-avatar">{employee.profile_photo_url ? <img src={employee.profile_photo_url} alt=""/> : employee.name.slice(0, 1)}</span><span><b>{employee.name}</b><small>{employee.employee_code} · {employee.manager_attendance_only ? (currentLang === 'en' ? 'Manager attendance' : 'મેનેજર હાજરી') : employee.designation || (currentLang === 'en' ? 'Employee' : 'સ્ટાફ')}</small></span><i className={employee.active ? 'status on' : 'status'}>{employee.active ? (currentLang === 'en' ? 'Active' : 'સક્રિય') : (currentLang === 'en' ? 'Inactive' : 'નિષ્ક્રિય')}</i></button>)
            )}
        </section>
        <div>{form ? <form className="panel employee-form" onSubmit={save}><div className="panel-head"><div><h2>{form.id ? (currentLang === 'en' ? 'Employee details' : 'કર્મચારી વિગત') : (currentLang === 'en' ? 'Add employee' : 'નવો કર્મચારી')}</h2><p>{currentLang === 'en' ? 'One common employee account for attendance and leave.' : 'હાજરી અને રજા માટે કર્મચારીનું ખાતું.'}</p></div><button type="button" className="icon-button ghost" onClick={() => setForm(null)}><X/></button></div>
            <label className="employee-photo"><span>{photo ? <img src={URL.createObjectURL(photo)} alt=""/> : form.profile_photo_url ? <img src={form.profile_photo_url} alt=""/> : <UserRound/>}</span><div><b>{currentLang === 'en' ? 'Profile photo' : 'પ્રોફાઇલ ફોટો'}</b><small>{currentLang === 'en' ? 'Optional · JPG or PNG up to 5 MB' : 'ઓપ્શનલ · JPG અથવા PNG 5 MB સુધી'}</small></div>{can('manage_employees') && <input type="file" accept="image/*" onChange={event => setPhoto(event.target.files[0] || null)}/>}</label>
            <div className="form-grid two"><Field label={currentLang === 'en' ? 'Full name' : 'પૂરું નામ'}><input value={form.name} onChange={event => setForm({...form, name: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={currentLang === 'en' ? 'Employee code' : 'કર્મચારી કોડ (Code)'}><input value={form.employee_code} onChange={event => setForm({...form, employee_code: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={currentLang === 'en' ? 'Login email' : 'લૉગિન ઈમેલ'}><input type="email" value={form.email} onChange={event => setForm({...form, email: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={form.id ? (currentLang === 'en' ? 'New password (optional)' : 'નવો પાસવર્ડ (ઓપ્શનલ)') : (currentLang === 'en' ? 'Password' : 'પાસવર્ડ')}><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => setForm({...form, password: event.target.value})} disabled={!can('manage_employees')} required={!form.id}/><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></Field><Field label={currentLang === 'en' ? 'Mobile (10 digits)' : 'મોબાઈલ (૧૦ આંકડા)'}><input type="tel" maxLength={10} value={form.mobile || ''} placeholder="9876543210" onChange={event => setForm({...form, mobile: event.target.value.replace(/\D/g, '')})} disabled={!can('manage_employees')}/></Field><Field label={currentLang === 'en' ? 'Joining date' : 'જોડાવાની તારીખ'}><input type="date" value={form.joining_date || ''} onChange={event => setForm({...form, joining_date: event.target.value})} disabled={!can('manage_employees')}/></Field><Field label={currentLang === 'en' ? 'Designation' : 'હોદ્દો (Designation)'}><input value={form.designation || ''} onChange={event => setForm({...form, designation: event.target.value})} disabled={!can('manage_employees')}/></Field><Field label={currentLang === 'en' ? 'Department' : 'વિભાગ (Department)'}><input value={form.department || ''} onChange={event => setForm({...form, department: event.target.value})} disabled={!can('manage_employees')}/></Field></div>
            <h3 className="section-title">{currentLang === 'en' ? 'Shift configuration' : 'શિફ્ટ સેટિંગ્સ (Shift configuration)'}</h3><div className="form-grid"><Field label={currentLang === 'en' ? 'Shift starts' : 'શિફ્ટ શરૂ સમય'}><input type="time" value={form.shift_start} onChange={event => setForm({...form, shift_start: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={currentLang === 'en' ? 'Shift ends' : 'શિફ્ટ પૂરો સમય'}><input type="time" value={form.shift_end} onChange={event => setForm({...form, shift_end: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={currentLang === 'en' ? 'Full-day minutes' : 'ફુલ-ડે મિનિટ'}><input type="number" value={form.working_minutes} onChange={event => setForm({...form, working_minutes: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={currentLang === 'en' ? 'Half-day minutes' : 'હાફ-ડે મિનિટ'}><input type="number" value={form.half_day_minutes} onChange={event => setForm({...form, half_day_minutes: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={currentLang === 'en' ? 'Late grace minutes' : 'લેટ ગ્રેસ મિનિટ'}><input type="number" value={form.grace_minutes} onChange={event => setForm({...form, grace_minutes: event.target.value})} disabled={!can('manage_employees')} required/></Field><label className="toggle"><input type="checkbox" checked={Boolean(form.active)} onChange={event => {
                if (form.id && !event.target.checked && !window.confirm(currentLang === 'en' ? 'Are you sure you want to deactivate this employee? They will not be able to log in.' : 'શું તમે ખરેખર આ કર્મચારીને નિષ્ક્રિય (Inactive) કરવા માંગો છો? તેઓ લોગિન નહીં કરી શકે.')) return;
                setForm({...form, active: event.target.checked});
            }} disabled={!can('manage_employees')}/><span/> {currentLang === 'en' ? 'Employee active' : 'કર્મચારી સક્રિય (Active)'}</label><label className="toggle"><input type="checkbox" checked={Boolean(form.manager_attendance_only)} onChange={event => setForm({...form, manager_attendance_only: event.target.checked})} disabled={!can('manage_employees')}/><span/> {currentLang === 'en' ? 'Manager records attendance' : 'મેનેજર હાજરી પૂરે (Manager only)'}</label></div>
            {form.manager_attendance_only && <div className="info-banner"><b>{currentLang === 'en' ? 'Self attendance will be disabled.' : 'સેલ્ફ એટેન્ડન્સ બંધ રહેશે.'}</b> {currentLang === 'en' ? 'An authorized manager or admin must add this employee’s completed attendance.' : 'મેનેજર અથવા એડમિન દ્વારા હાજરી પૂરવામાં આવશે.'}</div>}
            <div className="weekday-picker"><b>{currentLang === 'en' ? 'Weekly offs' : 'સાપ્તાહિક રજા (Weekly offs)'}</b><small>{currentLang === 'en' ? 'Select only off days. Leave every day unselected when the employee works all seven days.' : 'માત્ર રજાના દિવસો પસંદ કરો. જો સાતેય દિવસ કામ હોય તો ખાલી રાખો.'}</small><div>{DAYS.map(([value, label]) => <label key={value}><input type="checkbox" checked={(form.weekly_offs || []).map(String).includes(value)} disabled={!can('manage_employees')} onChange={event => setForm({...form, weekly_offs: event.target.checked ? [...(form.weekly_offs || []), Number(value)] : (form.weekly_offs || []).filter(day => String(day) !== value)})}/><span>{label}</span></label>)}</div></div>
            {['super_admin', 'company_admin'].includes(currentUser.role) && form.id && <section className="employee-salary-config"><div><span className="company-icon"><IndianRupee/></span><span><b>{currentLang === 'en' ? 'Monthly salary' : 'માસિક પગાર (Monthly salary)'}</b><small>{currentLang === 'en' ? 'Confidential · effective-dated salary history' : 'ગુપ્ત · માસિક પગાર દર'}</small></span></div><div className="form-grid two"><Field label={currentLang === 'en' ? 'Effective month' : 'કયા મહિનાથી અમલી'}><input type="month" max={currentMonth()} value={salaryForm.effective_month} onChange={event => setSalaryForm({...salaryForm, effective_month: event.target.value})}/></Field><Field label={currentLang === 'en' ? 'Full monthly salary (₹)' : 'પૂરો માસિક પગાર (₹)'}><input type="number" min="0.01" step="0.01" value={salaryForm.monthly_salary} onChange={event => setSalaryForm({...salaryForm, monthly_salary: event.target.value})}/></Field></div><button type="button" className="secondary" disabled={!salaryForm.monthly_salary || salarySaving} onClick={saveSalary}>{salarySaving ? (currentLang === 'en' ? 'Saving…' : 'સેવ થઈ રહ્યું છે…') : (currentLang === 'en' ? 'Save salary rate' : 'પગાર રેટ સેવ કરો')}</button>{salaryRates.length > 0 && <div className="salary-rate-history">{salaryRates.map(rate => <span key={rate.id}><b>₹{Number(rate.monthly_salary).toLocaleString('en-IN', {minimumFractionDigits: 2})}</b><small>From {rate.effective_month} · {rate.created_by || 'Super admin'}</small></span>)}</div>}{salaryMessage && <div className={salaryMessage.includes('successfully') ? 'success' : 'error'}>{salaryMessage}</div>}</section>}
            {message && <div className={message.includes('successfully') ? 'success' : 'error'}>{message}</div>}{can('manage_employees') && <div className="form-actions"><span>{currentLang === 'en' ? 'Employee login is separate from company login.' : 'કર્મચારી લોગિન કંપની લોગિનથી અલગ છે.'}</span><button className="primary" disabled={saving}>{saving ? (currentLang === 'en' ? 'Saving employee…' : 'સેવ થઈ રહ્યું છે…') : (currentLang === 'en' ? 'Save employee' : 'કર્મચારી સેવ કરો')}</button></div>}
        </form> : <Empty title={currentLang === 'en' ? 'Select or add an employee' : 'કર્મચારી પસંદ કરો અથવા નવો ઉમેરો'} detail={currentLang === 'en' ? 'Employees are common to all companies and have their own attendance login.' : 'કર્મચારીઓ તમામ કંપનીઓ માટે કોમન છે અને પોતાનું લોગિન ધરાવે છે.'}/>}</div>
    </div>;
}
