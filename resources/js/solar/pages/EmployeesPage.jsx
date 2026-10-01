import React, {useEffect, useState} from 'react';
import {Eye, EyeOff, IndianRupee, UserRound, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field} from '../components/Common';

const DAYS = [['0', 'Sun'], ['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat']];
const emptyEmployee = {name: '', email: '', password: '', employee_code: '', mobile: '', designation: '', department: '', joining_date: '', active: true, manager_attendance_only: false, shift_start: '09:00', shift_end: '18:00', working_minutes: 480, half_day_minutes: 240, grace_minutes: 15, weekly_offs: []};

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function EmployeesPage({can, currentUser}) {
    const [employees, setEmployees] = useState([]);
    const [form, setForm] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');
    const [salaryRates, setSalaryRates] = useState([]);
    const [salaryForm, setSalaryForm] = useState({effective_month: currentMonth(), monthly_salary: ''});
    const [salaryMessage, setSalaryMessage] = useState('');
    const load = () => api('employees').then(setEmployees);
    useEffect(() => { load(); }, []);

    const edit = employee => {
        setPhoto(null);
        setShowPassword(false);
        setForm({...employee, password: '', shift_start: employee.shift_start?.slice(0, 5), shift_end: employee.shift_end?.slice(0, 5), weekly_offs: employee.weekly_offs ?? []});
        setSalaryMessage('');
        setSalaryForm({effective_month: currentMonth(), monthly_salary: ''});
        if (currentUser.role === 'super_admin') api(`employees/${employee.id}/salary-rates`).then(setSalaryRates).catch(error => setSalaryMessage(error.message));
    };
    const saveSalary = async () => {
        setSalaryMessage('');
        try {
            await api(`employees/${form.id}/salary-rates`, {method: 'POST', body: JSON.stringify(salaryForm)});
            setSalaryRates(await api(`employees/${form.id}/salary-rates`));
            setSalaryMessage('Monthly salary saved successfully.');
        } catch (error) { setSalaryMessage(error.message); }
    };
    const save = async event => {
        event.preventDefault();
        setMessage('');
        const body = new FormData();
        Object.entries(form).forEach(([key, value]) => {
            if (['user', 'profile_photo_url', 'weekly_offs', 'created_at', 'updated_at', 'profile_photo_path'].includes(key) || value === null || value === '') return;
            body.append(key, ['active', 'manager_attendance_only'].includes(key) ? (value ? '1' : '0') : value);
        });
        (form.weekly_offs || []).forEach(day => body.append('weekly_offs[]', day));
        if (photo) body.append('profile_photo', photo);
        try {
            await api('employees', {method: 'POST', body});
            setMessage('Employee saved successfully.');
            setForm(null);
            await load();
        } catch (error) { setMessage(error.message); }
    };

    return <div className="management-layout employee-management">
        <section className="panel management-list"><div className="panel-head"><div><h2>Common employees</h2><p>{employees.length} employees across the system</p></div>{can('manage_employees') && <button className="icon-button" onClick={() => {setForm({...emptyEmployee}); setPhoto(null); setSalaryRates([]);}}>+</button>}</div>
            {employees.map(employee => <button className="list-row" onClick={() => edit(employee)} key={employee.id}><span className="avatar employee-avatar">{employee.profile_photo_url ? <img src={employee.profile_photo_url} alt=""/> : employee.name.slice(0, 1)}</span><span><b>{employee.name}</b><small>{employee.employee_code} · {employee.manager_attendance_only ? 'Manager attendance' : employee.designation || 'Employee'}</small></span><i className={employee.active ? 'status on' : 'status'}>{employee.active ? 'Active' : 'Inactive'}</i></button>)}
        </section>
        <div>{form ? <form className="panel employee-form" onSubmit={save}><div className="panel-head"><div><h2>{form.id ? 'Employee details' : 'Add employee'}</h2><p>One common employee account for attendance and leave.</p></div><button type="button" className="icon-button ghost" onClick={() => setForm(null)}><X/></button></div>
            <label className="employee-photo"><span>{photo ? <img src={URL.createObjectURL(photo)} alt=""/> : form.profile_photo_url ? <img src={form.profile_photo_url} alt=""/> : <UserRound/>}</span><div><b>Profile photo</b><small>Optional · JPG or PNG up to 5 MB</small></div>{can('manage_employees') && <input type="file" accept="image/*" onChange={event => setPhoto(event.target.files[0] || null)}/>}</label>
            <div className="form-grid two"><Field label="Full name"><input value={form.name} onChange={event => setForm({...form, name: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label="Employee code"><input value={form.employee_code} onChange={event => setForm({...form, employee_code: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label="Login email"><input type="email" value={form.email} onChange={event => setForm({...form, email: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label={form.id ? 'New password (optional)' : 'Password'}><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => setForm({...form, password: event.target.value})} disabled={!can('manage_employees')} required={!form.id}/><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></Field><Field label="Mobile"><input value={form.mobile || ''} onChange={event => setForm({...form, mobile: event.target.value})} disabled={!can('manage_employees')}/></Field><Field label="Joining date"><input type="date" value={form.joining_date || ''} onChange={event => setForm({...form, joining_date: event.target.value})} disabled={!can('manage_employees')}/></Field><Field label="Designation"><input value={form.designation || ''} onChange={event => setForm({...form, designation: event.target.value})} disabled={!can('manage_employees')}/></Field><Field label="Department"><input value={form.department || ''} onChange={event => setForm({...form, department: event.target.value})} disabled={!can('manage_employees')}/></Field></div>
            <h3 className="section-title">Shift configuration</h3><div className="form-grid"><Field label="Shift starts"><input type="time" value={form.shift_start} onChange={event => setForm({...form, shift_start: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label="Shift ends"><input type="time" value={form.shift_end} onChange={event => setForm({...form, shift_end: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label="Full-day minutes"><input type="number" value={form.working_minutes} onChange={event => setForm({...form, working_minutes: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label="Half-day minutes"><input type="number" value={form.half_day_minutes} onChange={event => setForm({...form, half_day_minutes: event.target.value})} disabled={!can('manage_employees')} required/></Field><Field label="Late grace minutes"><input type="number" value={form.grace_minutes} onChange={event => setForm({...form, grace_minutes: event.target.value})} disabled={!can('manage_employees')} required/></Field><label className="toggle"><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm({...form, active: event.target.checked})} disabled={!can('manage_employees')}/><span/> Employee active</label><label className="toggle"><input type="checkbox" checked={Boolean(form.manager_attendance_only)} onChange={event => setForm({...form, manager_attendance_only: event.target.checked})} disabled={!can('manage_employees')}/><span/> Manager records attendance</label></div>
            {form.manager_attendance_only && <div className="info-banner"><b>Self attendance will be disabled.</b> An authorized manager or admin must add this employee’s completed attendance.</div>}
            <div className="weekday-picker"><b>Weekly offs</b><small>Select only off days. Leave every day unselected when the employee works all seven days.</small><div>{DAYS.map(([value, label]) => <label key={value}><input type="checkbox" checked={(form.weekly_offs || []).map(String).includes(value)} disabled={!can('manage_employees')} onChange={event => setForm({...form, weekly_offs: event.target.checked ? [...(form.weekly_offs || []), Number(value)] : (form.weekly_offs || []).filter(day => String(day) !== value)})}/><span>{label}</span></label>)}</div></div>
            {currentUser.role === 'super_admin' && form.id && <section className="employee-salary-config"><div><span className="company-icon"><IndianRupee/></span><span><b>Monthly salary</b><small>Confidential · effective-dated salary history</small></span></div><div className="form-grid two"><Field label="Effective month"><input type="month" max={currentMonth()} value={salaryForm.effective_month} onChange={event => setSalaryForm({...salaryForm, effective_month: event.target.value})}/></Field><Field label="Full monthly salary"><input type="number" min="0.01" step="0.01" value={salaryForm.monthly_salary} onChange={event => setSalaryForm({...salaryForm, monthly_salary: event.target.value})} placeholder="Enter INR amount"/></Field></div><button type="button" className="secondary" disabled={!salaryForm.monthly_salary} onClick={saveSalary}>Save salary rate</button>{salaryRates.length > 0 && <div className="salary-rate-history">{salaryRates.map(rate => <span key={rate.id}><b>₹{Number(rate.monthly_salary).toLocaleString('en-IN', {minimumFractionDigits: 2})}</b><small>From {rate.effective_month} · {rate.created_by || 'Super admin'}</small></span>)}</div>}{salaryMessage && <div className={salaryMessage.includes('successfully') ? 'success' : 'error'}>{salaryMessage}</div>}</section>}
            {message && <div className={message.includes('successfully') ? 'success' : 'error'}>{message}</div>}{can('manage_employees') && <div className="form-actions"><span>Employee login is separate from company login.</span><button className="primary">Save employee</button></div>}
        </form> : <Empty title="Select or add an employee" detail="Employees are common to all companies and have their own attendance login."/>}</div>
    </div>;
}
