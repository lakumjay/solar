import React, {useEffect, useState} from 'react';
import {Sun} from 'lucide-react';
import {api} from './api';
import AppShell from './components/AppShell';
import ActivityLogPage from './pages/ActivityLogPage';
import AttendancePage from './pages/AttendancePage';
import AttendanceReportsPage from './pages/AttendanceReportsPage';
import CompaniesPage from './pages/CompaniesPage';
import DailyEntryPage from './pages/DailyEntryPage';
import DashboardPage from './pages/DashboardPage';
import ExcelImportPage from './pages/ExcelImportPage';
import EmployeesPage from './pages/EmployeesPage';
import ExpensesPage from './pages/ExpensesPage';
import LeaveHolidayPage from './pages/LeaveHolidayPage';
import LoginPage from './pages/LoginPage';
import MyAttendancePage from './pages/MyAttendancePage';
import MySalaryPage from './pages/MySalaryPage';
import ReportsPage from './pages/ReportsPage';
import SalaryPage from './pages/SalaryPage';
import StockPage from './pages/StockPage';
import UsersPage from './pages/UsersPage';
import ISolarCloudPage from './pages/ISolarCloudPage';
import GalleryPage from './pages/GalleryPage';
import ReelsPage from './pages/ReelsPage';

export default function App() {
    const [user, setUser] = useState(undefined);
    const [page, setPage] = useState('dashboard');
    const [companies, setCompanies] = useState([]);
    const [companyId, setCompanyId] = useState('all');

    const loadCompanies = async (currentUser, preferredPage = page) => {
        try {
            const rows = await api('companies');
            setCompanies(rows);
            if (currentUser.role === 'employee') {
                if (currentUser.company_id) {
                    setCompanyId(String(currentUser.company_id));
                } else {
                    setCompanyId(prev => (prev && prev !== 'all' && rows.some(r => String(r.id) === String(prev)) ? prev : 'all'));
                }
                setPage(['dashboard', 'entry', 'stock', 'gallery', 'reels', 'my-attendance', 'my-salary'].includes(preferredPage) ? preferredPage : 'dashboard');
                return rows;
            }
            if (currentUser.role !== 'super_admin') setCompanyId(String(currentUser.company_id));
            const userPerms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
            if (preferredPage === 'dashboard' && currentUser.role !== 'super_admin' && !userPerms.includes('view_dashboard')) {
                if (userPerms.includes('view_employees')) setPage('employees');
                else if (userPerms.includes('view_attendance')) setPage('attendance');
                else if (userPerms.includes('view_stock')) setPage('stock');
                else if (userPerms.includes('view_expenses')) setPage('expenses');
            }

            return rows;
        } catch (e) {
            return [];
        }
    };

    useEffect(() => {
        api('me').then(async current => {
            if (!current) return setUser(null);
            const preferredPage = window.localStorage.getItem(`solarflow.activePage.${current.id}`) || 'dashboard';
            setUser(current);
            setPage(preferredPage);
            await loadCompanies(current, preferredPage);
        }).catch(() => setUser(null));
    }, []);

    useEffect(() => {
        if (user?.id) window.localStorage.setItem(`solarflow.activePage.${user.id}`, page);
    }, [page, user?.id]);

    // Global keyboard typing sound for app-like feel
    useEffect(() => {
        let audioCtx = null;
        const playClick = () => {
            try {
                if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    audioCtx = new AudioContextClass();
                }
                if (!audioCtx) return;
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.03);
                gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.04);
            } catch (_) {}
        };
        const handler = (e) => {
            try {
                if (e.target && e.target.matches && e.target.matches('input, textarea, select')) {
                    playClick();
                }
            } catch (_) {}
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    if (user === undefined) return <div className="app-loading"><Sun className="spin"/> Loading SolarFlow…</div>;
    if (!user) return <LoginPage onLogin={async current => {const preferredPage = window.localStorage.getItem(`solarflow.activePage.${current.id}`) || 'dashboard'; setUser(current); setPage(preferredPage); await loadCompanies(current, preferredPage);}}/>;

    return <AppShell user={user} page={page} setPage={setPage} companies={companies} companyId={companyId} setCompanyId={setCompanyId}>
        {({can, activeCompany}) => <>
            {page === 'dashboard' && <DashboardPage companyId={companyId} currentUser={user}/>}
            {page === 'entry' && <DailyEntryPage company={activeCompany} companies={companies} companyId={companyId} setCompanyId={setCompanyId} user={user} canEdit={can('edit_readings')}/>}
            {page === 'reports' && <ReportsPage companyId={companyId} companies={companies}/>}
            {page === 'gallery' && <GalleryPage companyId={companyId} currentUser={user}/>}
            {page === 'reels' && <ReelsPage companyId={companyId} currentUser={user}/>}
            {page === 'isolarcloud' && <ISolarCloudPage company={activeCompany} companies={companies} user={user}/>}
            {page === 'companies' && <CompaniesPage companies={companies} refresh={() => loadCompanies(user)}/>}
            {page === 'import' && <ExcelImportPage/>}
            {page === 'users' && <UsersPage companies={companies} currentUser={user}/>}
            {page === 'activity' && <ActivityLogPage companyId={companyId}/>}
            {page === 'employees' && <EmployeesPage can={can} currentUser={user}/>}
            {page === 'expenses' && <ExpensesPage currentUser={user}/>}
            {page === 'attendance' && <AttendancePage canCorrect={['super_admin', 'company_admin'].includes(user.role)} canRecord={can('record_employee_attendance')}/>}
            {page === 'leave-holidays' && <LeaveHolidayPage can={can}/>}
            {page === 'attendance-reports' && <AttendanceReportsPage/>}
            {page === 'salaries' && <SalaryPage/>}
            {page === 'stock' && <StockPage can={can} currentUser={user}/>}
            {page === 'my-attendance' && <MyAttendancePage companyId={companyId}/>}
            {page === 'my-salary' && <MySalaryPage/>}
        </>}
    </AppShell>;
}
