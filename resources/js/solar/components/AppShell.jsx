import React, {useEffect, useState} from 'react';
import {Activity, BarChart3, Boxes, Building2, CalendarCheck2, Camera, ChevronRight, ClipboardPlus, Clock3, CloudSun, Gauge, IndianRupee, LogOut, Menu, Sun, UserCheck, Users, WalletCards, X} from 'lucide-react';
import {api} from '../api';
import MobileAppView from './MobileAppView';
import NotificationPermissionModal from './NotificationPermissionModal';
import AppSplashScreen from './AppSplashScreen';
import MilestoneCelebrationModal from './MilestoneCelebrationModal';

export default function AppShell({user, page, setPage, companies, companyId, setCompanyId, children}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [liveSolarData, setLiveSolarData] = useState(null);
    const [showSplash, setShowSplash] = useState(() => {
        try {
            return !sessionStorage.getItem('solarflow_splash_shown');
        } catch (e) {
            return true;
        }
    });

    useEffect(() => {
        const checkMobile = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
            const isSmallScreen = window.innerWidth <= 768;
            setIsMobile(isStandalone || isSmallScreen);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const fetchLiveSolar = async () => {
        try {
            const res = await api(`dashboard/live-solar?company_id=${companyId || 'all'}`);
            setLiveSolarData(res);
        } catch (e) {
            console.error('Mobile live solar fetch error', e);
        }
    };

    useEffect(() => {
        fetchLiveSolar();
        const timer = setInterval(fetchLiveSolar, 10000);
        return () => clearInterval(timer);
    }, [companyId]);

    const can = permission => user.role === 'super_admin' || user.permissions.includes(permission);
    const activeCompany = companies.find(company => String(company.id) === String(companyId));
    const navigation = [
        can('view_dashboard') && ['dashboard', 'Dashboard', Gauge],
        can('enter_readings') && ['entry', 'Daily Entry', ClipboardPlus],
        can('view_reports') && ['reports', 'Reports', BarChart3],
        ['gallery', 'Gallery', Camera],
        ['expenses', 'Expenses', IndianRupee],
        user.role === 'super_admin' && ['companies', 'Companies', Building2],
        (user.role === 'super_admin' || can('manage_company_users')) && ['users', 'Users & Access', Users],
        (user.role === 'super_admin' || can('manage_company_users')) && ['activity', 'Activity Log', Activity],
        can('view_employees') && ['employees', 'Employees', Users],
        can('view_attendance') && ['attendance', 'Attendance', UserCheck],
        can('view_attendance') && ['leave-holidays', 'Leave & Holidays', CalendarCheck2],
        can('view_attendance_reports') && ['attendance-reports', 'Attendance Reports', BarChart3],
        (user.role === 'super_admin' || user.role === 'company_admin') && ['salaries', 'Monthly Salary', WalletCards],
        ['stock', 'Stock Management', Boxes],
        user.role === 'employee' && ['my-attendance', 'My Attendance', Clock3],
        user.role === 'employee' && ['my-salary', 'My Salary', IndianRupee],
    ].filter(Boolean);
    const titles = {
        dashboard: ['Live Solar Generation & Real-Time Flow', companyId === 'all' ? 'All Companies Live Sync' : activeCompany?.name],
        entry: ['Daily reading entry', activeCompany?.name],
        reports: ['Reports', companyId === 'all' ? 'All companies combined' : activeCompany?.name],
        gallery: ['Plant Photo Gallery', 'Daily scheduled inspection records and photo log'],
        expenses: ['Shared expenses', 'Company-wise balances and settlements'],
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

    const handleFinishSplash = () => {
        try {
            sessionStorage.setItem('solarflow_splash_shown', 'true');
        } catch (e) {}
        setShowSplash(false);
    };

    return (
        <>
            {showSplash && (
                <AppSplashScreen
                    user={user}
                    activeCompany={activeCompany}
                    liveData={liveSolarData}
                    onFinish={handleFinishSplash}
                />
            )}

            <MilestoneCelebrationModal
                user={user}
                activeCompany={activeCompany}
                liveData={liveSolarData}
            />

            {/* 📱 If on Mobile Screen or Standalone APK View: Render MobileAppView */}
            {isMobile ? (
                <MobileAppView
                    user={user}
                    page={page}
                    setPage={setPage}
                    companies={companies}
                    companyId={companyId}
                    setCompanyId={setCompanyId}
                    liveData={liveSolarData}
                    fetchLiveSolar={fetchLiveSolar}
                >
                    {children({can, activeCompany})}
                </MobileAppView>
            ) : (
                /* 💻 Desktop Layout */
                <div className="shell">
                    <aside className={menuOpen ? 'open' : ''}>
                        <div className="brand"><span><Sun size={25}/></span> SolarFlow <button className="mobile-close" onClick={() => setMenuOpen(false)}><X/></button></div>
                        <div className="account">
                            <div className="account-avatar" style={{border: activeCompany?.owner_photo_url ? '2px solid #f59e0b' : 'none', overflow: 'hidden'}}>
                                {activeCompany?.owner_photo_url ? (
                                    <img src={activeCompany.owner_photo_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}}/>
                                ) : (
                                    user.company_id && activeCompany?.logo_url ? <img src={activeCompany.logo_url} alt=""/> : user.name.slice(0, 1).toUpperCase()
                                )}
                            </div>
                            <span>
                                <b>{activeCompany?.owner_name || user.name}</b>
                                <small>{activeCompany?.owner_designation || user.role.replaceAll('_', ' ')}</small>
                            </span>
                        </div>
                        <nav>{navigation.map(([key, label, Icon]) => <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => choosePage(key)}><Icon size={18}/><span>{label}</span><ChevronRight size={15}/></button>)}</nav>
                        <button className="nav signout" onClick={() => api('logout', {method: 'POST'}).then(() => window.location.reload())}><LogOut size={18}/><span>Sign out</span></button>
                    </aside>
                    {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)}/>} 
                    <main className="content">
                        <header className="topbar">
                            <button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu/></button>
                            <div><p className="eyebrow">{titles[page]?.[1]}</p><h1>{titles[page]?.[0]}</h1></div>
                            {((user.role === 'super_admin' && ['dashboard', 'reports', 'entry', 'activity'].includes(page)) || (user.role === 'employee' && page === 'entry')) && <label className="company-switch"><span>Company</span><select value={companyId} onChange={event => setCompanyId(event.target.value)}>{page !== 'entry' && <option value="all">All Companies</option>}{companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>}
                        </header>
                        {children({can, activeCompany})}
                    </main>
                    <NotificationPermissionModal />
                </div>
            )}
        </>
    );
}
