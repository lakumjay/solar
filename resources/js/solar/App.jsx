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

export default function App() {
    const [user, setUser] = useState(undefined);
    const [page, setPage] = useState('dashboard');
    const [companies, setCompanies] = useState([]);
    const [companyId, setCompanyId] = useState('all');

    const loadCompanies = async (currentUser, preferredPage = page) => {
        if (currentUser.role === 'employee') {
            const rows = await api('companies');
            setCompanies(rows);
            setCompanyId(rows[0] ? String(rows[0].id) : 'all');
            setPage(['entry', 'stock', 'my-attendance', 'my-salary'].includes(preferredPage) ? preferredPage : 'my-attendance');
            return rows;
        }
        const rows = await api('companies');
        setCompanies(rows);
        if (currentUser.role !== 'super_admin') setCompanyId(String(currentUser.company_id));
        if (preferredPage === 'dashboard' && currentUser.role !== 'super_admin' && !currentUser.permissions.includes('view_dashboard')) {
            if (currentUser.permissions.includes('view_employees')) setPage('employees');
            else if (currentUser.permissions.includes('view_attendance')) setPage('attendance');
            else if (currentUser.permissions.includes('view_stock')) setPage('stock');
            else if (currentUser.permissions.includes('view_expenses')) setPage('expenses');
        }

        return rows;
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

    if (user === undefined) return <div className="app-loading"><Sun className="spin"/> Loading SolarFlow…</div>;
    if (!user) return <LoginPage onLogin={async current => {const preferredPage = window.localStorage.getItem(`solarflow.activePage.${current.id}`) || 'dashboard'; setUser(current); setPage(preferredPage); await loadCompanies(current, preferredPage);}}/>;

    return <AppShell user={user} page={page} setPage={setPage} companies={companies} companyId={companyId} setCompanyId={setCompanyId}>
        {({can, activeCompany}) => <>
            {page === 'dashboard' && <DashboardPage companyId={companyId}/>}
            {page === 'entry' && <DailyEntryPage company={activeCompany} canEdit={user.role !== 'employee' && can('edit_readings')}/>}
            {page === 'reports' && <ReportsPage companyId={companyId} companies={companies}/>}
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
            {page === 'my-attendance' && <MyAttendancePage/>}
            {page === 'my-salary' && <MySalaryPage/>}
        </>}
    </AppShell>;
}
