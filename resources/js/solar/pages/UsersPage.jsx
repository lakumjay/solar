import React, {useEffect, useState} from 'react';
import {X, Search, UserCheck, Shield, CheckSquare, Square, RotateCcw} from 'lucide-react';
import {api} from '../api';
import {PERMISSIONS} from '../config';
import {Empty, Field} from '../components/Common';

export default function UsersPage({companies, currentUser}) {
    const blank = {
        name: '',
        email: '',
        password: '',
        role: 'data_entry',
        company_id: companies[0]?.id || '',
        permissions: ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'view_expenses'],
        active: true
    };
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState(null);
    const [message, setMessage] = useState('');
    const [filterTab, setFilterTab] = useState('all'); // 'all', 'staff', 'employees'
    const [searchQuery, setSearchQuery] = useState('');

    const load = () => api('users').then(setUsers);
    useEffect(() => { load(); }, []);

    const rolePermissions = role => ({
        company_admin: PERMISSIONS.map(([key]) => key),
        manager: ['view_employees', 'view_attendance', 'approve_leaves', 'view_attendance_reports', 'record_employee_attendance', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock', 'view_expenses'],
        data_entry: ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'view_expenses'],
        viewer: ['view_dashboard', 'view_reports', 'view_expenses'],
        employee: ['clock_attendance', 'enter_readings', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock'],
        super_admin: [],
    })[role] || [];

    const save = async event => {
        event.preventDefault();
        try {
            await api('users', {method: 'POST', body: JSON.stringify(form)});
            setMessage('User access saved successfully.');
            setForm(null);
            load();
        } catch (error) {
            setMessage(error.message);
        }
    };

    // Filter users based on tab and search
    const filteredUsers = users.filter(user => {
        const isEmployee = user.role === 'employee';
        if (filterTab === 'staff' && isEmployee) return false;
        if (filterTab === 'employees' && !isEmployee) return false;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const nameMatch = user.name?.toLowerCase().includes(query);
            const emailMatch = user.email?.toLowerCase().includes(query);
            const codeMatch = user.employee_code?.toLowerCase().includes(query);
            const roleMatch = user.role?.toLowerCase().includes(query);
            return nameMatch || emailMatch || codeMatch || roleMatch;
        }
        return true;
    });

    const employeeCount = users.filter(u => u.role === 'employee').length;
    const staffCount = users.length - employeeCount;

    return (
        <div className="management-layout">
            <section className="panel management-list">
                <div className="panel-head">
                    <div>
                        <h2>Users & Access</h2>
                        <p>{users.length} total accounts ({staffCount} Admins/Staff · {employeeCount} Employees)</p>
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        onClick={() => setForm({...blank})}
                        title="Add New User"
                    >
                        +
                    </button>
                </div>

                {/* Filter Tabs & Search Bar */}
                <div style={{padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid #e2e8f0'}}>
                    <div style={{display: 'flex', gap: '6px', background: '#f1f5f9', padding: '3px', borderRadius: '8px'}}>
                        <button
                            type="button"
                            onClick={() => setFilterTab('all')}
                            style={{
                                flex: 1,
                                padding: '5px 8px',
                                border: 0,
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: filterTab === 'all' ? 700 : 500,
                                background: filterTab === 'all' ? '#ffffff' : 'transparent',
                                color: filterTab === 'all' ? '#0f172a' : '#64748b',
                                cursor: 'pointer',
                                boxShadow: filterTab === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            All ({users.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('staff')}
                            style={{
                                flex: 1,
                                padding: '5px 8px',
                                border: 0,
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: filterTab === 'staff' ? 700 : 500,
                                background: filterTab === 'staff' ? '#ffffff' : 'transparent',
                                color: filterTab === 'staff' ? '#0f172a' : '#64748b',
                                cursor: 'pointer',
                                boxShadow: filterTab === 'staff' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Staff ({staffCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('employees')}
                            style={{
                                flex: 1,
                                padding: '5px 8px',
                                border: 0,
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: filterTab === 'employees' ? 700 : 500,
                                background: filterTab === 'employees' ? '#ffffff' : 'transparent',
                                color: filterTab === 'employees' ? '#059669' : '#64748b',
                                cursor: 'pointer',
                                boxShadow: filterTab === 'employees' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Employees ({employeeCount})
                        </button>
                    </div>

                    <div style={{position: 'relative'}}>
                        <input
                            type="text"
                            placeholder="Search by name, email, role or code..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 10px 6px 30px',
                                fontSize: '12px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                        <Search size={14} style={{position: 'absolute', left: '10px', top: '9px', color: '#94a3b8'}}/>
                    </div>
                </div>

                {/* Users & Employees List */}
                <div style={{maxHeight: 'calc(100vh - 230px)', overflowY: 'auto'}}>
                    {filteredUsers.length === 0 ? (
                        <div style={{padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px'}}>
                            No accounts match your filter.
                        </div>
                    ) : (
                        filteredUsers.map(user => {
                            const isEmp = user.role === 'employee';
                            const isSelected = form?.id === user.id;
                            return (
                                <button
                                    type="button"
                                    className={`list-row ${isSelected ? 'selected' : ''}`}
                                    onClick={() => setForm({
                                        ...user,
                                        password: '',
                                        permissions: user.permissions || []
                                    })}
                                    key={user.id}
                                    style={{
                                        borderLeft: isEmp ? '3px solid #10b981' : '3px solid #3b82f6',
                                        background: isSelected ? '#f0fdf4' : undefined
                                    }}
                                >
                                    <span className="avatar" style={{background: isEmp ? '#10b981' : '#3b82f6'}}>
                                        {user.name.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span>
                                        <b>{user.name}</b>
                                        <small style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                            <span>{user.email}</span>
                                            {user.employee_code && (
                                                <span style={{color: '#059669', fontWeight: 600}}>
                                                    · {user.employee_code}
                                                </span>
                                            )}
                                        </small>
                                    </span>
                                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px'}}>
                                        <i className={`status ${isEmp ? 'on' : user.active ? 'on' : ''}`} style={isEmp ? {background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0'} : undefined}>
                                            {user.role.replaceAll('_', ' ')}
                                        </i>
                                        {!user.active && <small style={{color: '#ef4444', fontSize: '10px'}}>Inactive</small>}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </section>

            <div>
                {form ? (
                    <form className="panel user-form" onSubmit={save}>
                        <div className="panel-head">
                            <div>
                                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                    <h2>{form.id ? 'Edit User / Employee' : 'New User'}</h2>
                                    {form.role === 'employee' && (
                                        <span style={{background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px'}}>
                                            Employee Account
                                        </span>
                                    )}
                                </div>
                                <p>Assign a role and fine-tune individual permissions for this account.</p>
                            </div>
                            <button type="button" className="icon-button ghost" onClick={() => setForm(null)}>
                                <X/>
                            </button>
                        </div>

                        {form.role === 'employee' && (
                            <div style={{margin: '0 0 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <Shield size={16} style={{color: '#16a34a', flexShrink: 0}}/>
                                <span>
                                    <b>Employee Access Control:</b> You can grant dashboard, reports, daily readings, stock, or attendance access to this employee using the checkboxes below.
                                </span>
                            </div>
                        )}

                        <div className="form-grid two">
                            <Field label="Full name">
                                <input
                                    value={form.name}
                                    onChange={event => setForm({...form, name: event.target.value})}
                                    required
                                />
                            </Field>

                            <Field label="Email address">
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={event => setForm({...form, email: event.target.value})}
                                    required
                                />
                            </Field>

                            <Field label={form.id ? 'New password (optional)' : 'Password'}>
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={event => setForm({...form, password: event.target.value})}
                                    required={!form.id}
                                    placeholder={form.id ? 'Leave blank to keep current' : ''}
                                />
                            </Field>

                            <Field label="Role">
                                <select
                                    value={form.role}
                                    onChange={event => {
                                        const newRole = event.target.value;
                                        setForm({
                                            ...form,
                                            role: newRole,
                                            permissions: rolePermissions(newRole)
                                        });
                                    }}
                                >
                                    {currentUser.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                                    <option value="company_admin">Company Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="data_entry">Data Entry</option>
                                    <option value="viewer">Viewer</option>
                                    <option value="employee">Employee</option>
                                </select>
                            </Field>

                            {form.role !== 'super_admin' && (
                                <Field label={form.role === 'employee' ? 'Company (Optional for Employee)' : 'Company'}>
                                    <select
                                        value={form.company_id || ''}
                                        onChange={event => setForm({...form, company_id: event.target.value || null})}
                                        required={form.role !== 'employee'}
                                    >
                                        {form.role === 'employee' && <option value="">All / Shared Companies</option>}
                                        {companies.map(company => (
                                            <option key={company.id} value={company.id}>
                                                {company.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={Boolean(form.active)}
                                    onChange={event => setForm({...form, active: event.target.checked})}
                                />
                                <span/> User active
                            </label>
                        </div>

                        {/* Permissions Section with Quick Action Presets */}
                        <div className="permissions">
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px'}}>
                                <h3 style={{margin: 0}}>Permissions ({form.permissions?.length || 0} active)</h3>
                                <div style={{display: 'flex', gap: '6px'}}>
                                    <button
                                        type="button"
                                        style={{background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#334155', cursor: 'pointer'}}
                                        onClick={() => setForm({...form, permissions: PERMISSIONS.map(([key]) => key)})}
                                    >
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        style={{background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#059669', cursor: 'pointer'}}
                                        onClick={() => setForm({...form, permissions: rolePermissions(form.role)})}
                                    >
                                        Role Default
                                    </button>
                                    <button
                                        type="button"
                                        style={{background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#64748b', cursor: 'pointer'}}
                                        onClick={() => setForm({...form, permissions: []})}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px'}}>
                                {PERMISSIONS.map(([key, label]) => {
                                    const isChecked = form.permissions?.includes(key);
                                    return (
                                        <label
                                            key={key}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '6px 10px',
                                                borderRadius: '8px',
                                                background: isChecked ? '#f0fdf4' : '#f8fafc',
                                                border: isChecked ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={event => setForm({
                                                    ...form,
                                                    permissions: event.target.checked
                                                        ? [...(form.permissions || []), key]
                                                        : (form.permissions || []).filter(item => item !== key)
                                                })}
                                            />
                                            <span style={{color: isChecked ? '#166534' : '#475569', fontWeight: isChecked ? 600 : 400}}>
                                                {label}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {message && (
                            <div className={message.includes('success') || message.includes('saved') ? 'success' : 'error'} style={{marginTop: '14px'}}>
                                {message}
                            </div>
                        )}

                        <div className="form-actions">
                            <span>Inactive users cannot sign in.</span>
                            <button className="primary" type="submit">
                                Save Access
                            </button>
                        </div>
                    </form>
                ) : (
                    <Empty
                        title="Select or add a user / employee"
                        detail="Manage admin, staff, and employee accounts, and configure permissions directly."
                    />
                )}
            </div>
        </div>
    );
}
