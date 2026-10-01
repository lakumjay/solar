import React, {useEffect, useState} from 'react';
import {X} from 'lucide-react';
import {api} from '../api';
import {PERMISSIONS} from '../config';
import {Empty, Field} from '../components/Common';

export default function UsersPage({companies, currentUser}) {
    const blank = {name: '', email: '', password: '', role: 'data_entry', company_id: companies[0]?.id || '', permissions: ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports'], active: true};
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState(null);
    const [message, setMessage] = useState('');
    const load = () => api('users').then(setUsers);

    useEffect(() => {load();}, []);

    const edit = user => setForm({...user, password: '', permissions: user.permissions || []});
    const save = async event => {
        event.preventDefault();
        try {
            await api('users', {method: 'POST', body: JSON.stringify(form)});
            setMessage('User access saved.');
            setForm(null);
            load();
        } catch (error) {
            setMessage(error.message);
        }
    };

    return <div className="management-layout"><section className="panel management-list"><div className="panel-head"><div><h2>Users</h2><p>{users.length} accounts</p></div><button className="icon-button" onClick={() => setForm({...blank})}>+</button></div>{users.map(user => <button className="list-row" onClick={() => edit(user)} key={user.id}><span className="avatar">{user.name.slice(0, 1)}</span><span><b>{user.name}</b><small>{user.email}</small></span><i className={user.active ? 'status on' : 'status'}>{user.role.replaceAll('_', ' ')}</i></button>)}</section><div>{form ? <form className="panel user-form" onSubmit={save}><div className="panel-head"><div><h2>{form.id ? 'Edit user' : 'New user'}</h2><p>Assign a role and fine-tune its permissions.</p></div><button type="button" className="icon-button ghost" onClick={() => setForm(null)}><X/></button></div><div className="form-grid two"><Field label="Full name"><input value={form.name} onChange={event => setForm({...form, name: event.target.value})} required/></Field><Field label="Email address"><input type="email" value={form.email} onChange={event => setForm({...form, email: event.target.value})} required/></Field><Field label={form.id ? 'New password (optional)' : 'Password'}><input type="password" value={form.password} onChange={event => setForm({...form, password: event.target.value})} required={!form.id}/></Field><Field label="Role"><select value={form.role} onChange={event => setForm({...form, role: event.target.value})}>{currentUser.role === 'super_admin' && <option value="super_admin">Super Admin</option>}<option value="company_admin">Company Admin</option><option value="data_entry">Data Entry</option><option value="viewer">Viewer</option></select></Field>{form.role !== 'super_admin' && <Field label="Company"><select value={form.company_id || ''} onChange={event => setForm({...form, company_id: event.target.value})}>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>}<label className="toggle"><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm({...form, active: event.target.checked})}/><span/> User active</label></div><div className="permissions"><h3>Permissions</h3>{PERMISSIONS.map(([key, label]) => <label key={key}><input type="checkbox" checked={form.permissions?.includes(key)} onChange={event => setForm({...form, permissions: event.target.checked ? [...(form.permissions || []), key] : (form.permissions || []).filter(item => item !== key)})}/><span>{label}</span></label>)}</div>{message && <div className={message.includes('saved') ? 'success' : 'error'}>{message}</div>}<div className="form-actions"><span>Inactive users cannot sign in.</span><button className="primary">Save user</button></div></form> : <Empty title="Select or add a user" detail="Create company logins and control exactly what each user can access."/>}</div></div>;
}
