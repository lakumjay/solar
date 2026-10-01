import React, {useEffect, useState} from 'react';
import {Activity, BarChart3, Bell, Boxes, Building2, CalendarCheck2, ChevronRight, ClipboardPlus, Clock3, Gauge, IndianRupee, LogOut, Menu, Sun, UserCheck, Users, WalletCards, X} from 'lucide-react';
import {api} from '../api';

export default function AppShell({user, page, setPage, companies, companyId, setCompanyId, children}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const can = permission => user.role === 'super_admin' || user.permissions.includes(permission);
    const activeCompany = companies.find(company => String(company.id) === String(companyId));
    const navigation = [
        can('view_dashboard') && ['dashboard', 'Dashboard', Gauge],
        can('enter_readings') && ['entry', 'Daily Entry', ClipboardPlus],
        can('view_reports') && ['reports', 'Reports', BarChart3],
        user.role === 'super_admin' && ['companies', 'Companies', Building2],
        // Temporarily hidden from the sidebar; keep the Excel Import module available for later.
        // user.role === 'super_admin' && ['import', 'Excel Import', Upload],
        (user.role === 'super_admin' || can('manage_company_users')) && ['users', 'Users & Access', Users],
        (user.role === 'super_admin' || can('manage_company_users')) && ['activity', 'Activity Log', Activity],
        can('view_employees') && ['employees', 'Employees', Users],
        can('view_attendance') && ['attendance', 'Attendance', UserCheck],
        can('view_attendance') && ['leave-holidays', 'Leave & Holidays', CalendarCheck2],
        can('view_attendance_reports') && ['attendance-reports', 'Attendance Reports', BarChart3],
        user.role === 'super_admin' && ['salaries', 'Monthly Salary', WalletCards],
        can('view_stock') && ['stock', 'Stock Management', Boxes],
        can('view_expenses') && ['expenses', 'Expenses', IndianRupee],
        user.role === 'employee' && ['my-attendance', 'My Attendance', Clock3],
        user.role === 'employee' && ['my-salary', 'My Salary', IndianRupee],
    ].filter(Boolean);
    const titles = {
        dashboard: ['Operations overview', companyId === 'all' ? 'Combined view of all companies' : activeCompany?.name],
        entry: ['Daily reading entry', activeCompany?.name],
        reports: ['Reports', companyId === 'all' ? 'All companies combined' : activeCompany?.name],
        companies: ['Company configuration', 'Multipliers and inverters'],
        users: ['Users & access', 'Roles and custom permissions'],
        activity: ['Activity log', 'Track important changes'],
        import: ['Excel data import', 'Import legacy daily readings'],
        employees: ['Common employees', 'Shared across all companies'],
        attendance: ['Employee attendance', 'Common daily attendance register'],
        'leave-holidays': ['Leave & holidays', 'Common approvals and calendar'],
        'attendance-reports': ['Attendance reports', 'Monthly attendance and work summary'],
        salaries: ['Monthly salary', 'Confidential payroll calculation and adjustments'],
        stock: ['Stock management', 'Common inventory and borrowing register'],
        expenses: ['Shared expenses', 'Company-wise balances and settlements'],
        'my-attendance': ['My attendance', 'Time in, time out and leave'],
        'my-salary': ['My salary', 'Private salary statements and attendance details'],
    };
    const navigationKey = navigation.map(([key]) => key).join('|');

    useEffect(() => {
        if (navigation.some(([key]) => key === page)) return;
        const fallback = user.role === 'employee'
            ? navigation.find(([key]) => key === 'my-attendance')
            : navigation[0];
        if (fallback) setPage(fallback[0]);
    }, [navigationKey, page, setPage, user.role]);

    const choosePage = key => {
        if (key === 'entry' && companyId === 'all' && companies[0]) setCompanyId(String(companies[0].id));
        setPage(key);
        setMenuOpen(false);
    };

    return <div className="shell">
        <aside className={menuOpen ? 'open' : ''}>
            <div className="brand"><span><Sun size={25}/></span> SolarFlow <button className="mobile-close" onClick={() => setMenuOpen(false)}><X/></button></div>
            <div className="account"><div className="account-avatar">{user.company_id && activeCompany?.logo_url ? <img src={activeCompany.logo_url} alt=""/> : user.name.slice(0, 1).toUpperCase()}</div><span><b>{user.name}</b><small>{user.role.replaceAll('_', ' ')}</small></span></div>
            <nav>{navigation.map(([key, label, Icon]) => <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => choosePage(key)}><Icon size={18}/><span>{label}</span><ChevronRight size={15}/></button>)}</nav>
            <button className="nav signout" onClick={() => api('logout', {method: 'POST'}).then(() => window.location.reload())}><LogOut size={18}/><span>Sign out</span></button>
        </aside>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)}/>} 
        <main className="content">
            <header className="topbar">
                <button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu/></button>
                <div><p className="eyebrow">{titles[page]?.[1]}</p><h1>{titles[page]?.[0]}</h1></div>
                <div className="topbar-actions" style={{display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto'}}>
                    {((user.role === 'super_admin' && ['dashboard', 'reports', 'entry', 'activity'].includes(page)) || (user.role === 'employee' && page === 'entry')) && <label className="company-switch"><span>Company</span><select value={companyId} onChange={event => setCompanyId(event.target.value)}>{page !== 'entry' && <option value="all">All Companies</option>}{companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>}
                    <button 
                        type="button"
                        className="button secondary"
                        style={{padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', cursor: 'pointer'}}
                        onClick={async () => {
                            if (!('Notification' in window)) return alert('Desktop notifications not supported in this browser.');
                            if (Notification.permission !== 'granted') {
                                const { subscribeToPushNotifications } = await import('../notifications');
                                const res = await subscribeToPushNotifications();
                                alert(res.message);
                            } else {
                                const { sendTestNotification } = await import('../notifications');
                                const res = await sendTestNotification();
                                if (res.success) alert('🔔 Push notification sent to your screen!');
                                else alert(res.message || 'Notification test completed.');
                            }
                        }}
                        title="Enable or Test Push Notifications"
                    >
                        <Bell size={16}/> <span>Alerts</span>
                    </button>
                </div>
            </header>
            {children({can, activeCompany})}
        </main>
    </div>;
}
