import React, {useState} from 'react';
import {Activity, BarChart3, Building2, ChevronRight, ClipboardPlus, Gauge, LogOut, Menu, Sun, Upload, Users, X} from 'lucide-react';
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
    ].filter(Boolean);
    const titles = {
        dashboard: ['Operations overview', companyId === 'all' ? 'Combined view of all companies' : activeCompany?.name],
        entry: ['Daily reading entry', activeCompany?.name],
        reports: ['Reports', companyId === 'all' ? 'All companies combined' : activeCompany?.name],
        companies: ['Company configuration', 'Multipliers and inverters'],
        users: ['Users & access', 'Roles and custom permissions'],
        activity: ['Activity log', 'Track important changes'],
        import: ['Excel data import', 'Import legacy daily readings'],
    };

    const choosePage = key => {
        if (key === 'entry' && companyId === 'all' && companies[0]) setCompanyId(String(companies[0].id));
        setPage(key);
        setMenuOpen(false);
    };

    return <div className="shell">
        <aside className={menuOpen ? 'open' : ''}>
            <div className="brand"><span><Sun size={25}/></span> SolarFlow <button className="mobile-close" onClick={() => setMenuOpen(false)}><X/></button></div>
            <div className="account"><div className="account-avatar">{user.role !== 'super_admin' && activeCompany?.logo_url ? <img src={activeCompany.logo_url} alt=""/> : user.name.slice(0, 1).toUpperCase()}</div><span><b>{user.name}</b><small>{user.role.replaceAll('_', ' ')}</small></span></div>
            <nav>{navigation.map(([key, label, Icon]) => <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => choosePage(key)}><Icon size={18}/><span>{label}</span><ChevronRight size={15}/></button>)}</nav>
            <button className="nav signout" onClick={() => api('logout', {method: 'POST'}).then(() => window.location.reload())}><LogOut size={18}/><span>Sign out</span></button>
        </aside>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)}/>} 
        <main className="content">
            <header className="topbar">
                <button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu/></button>
                <div><p className="eyebrow">{titles[page]?.[1]}</p><h1>{titles[page]?.[0]}</h1></div>
                {user.role === 'super_admin' && ['dashboard', 'reports', 'entry', 'activity'].includes(page) && <label className="company-switch"><span>Company</span><select value={companyId} onChange={event => setCompanyId(event.target.value)}>{page !== 'entry' && <option value="all">All Companies</option>}{companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>}
            </header>
            {children({can, activeCompany})}
        </main>
    </div>;
}
