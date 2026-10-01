import React, {useEffect, useState} from 'react';
import {Sun} from 'lucide-react';
import {api} from './api';
import AppShell from './components/AppShell';
import ActivityLogPage from './pages/ActivityLogPage';
import CompaniesPage from './pages/CompaniesPage';
import DailyEntryPage from './pages/DailyEntryPage';
import DashboardPage from './pages/DashboardPage';
import ExcelImportPage from './pages/ExcelImportPage';
import LoginPage from './pages/LoginPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';

export default function App() {
    const [user, setUser] = useState(undefined);
    const [page, setPage] = useState('dashboard');
    const [companies, setCompanies] = useState([]);
    const [companyId, setCompanyId] = useState('all');

    const loadCompanies = async currentUser => {
        const rows = await api('companies');
        setCompanies(rows);
        if (currentUser.role !== 'super_admin') setCompanyId(String(currentUser.company_id));

        return rows;
    };

    useEffect(() => {
        api('me').then(async current => {
            if (!current) return setUser(null);
            setUser(current);
            await loadCompanies(current);
        }).catch(() => setUser(null));
    }, []);

    if (user === undefined) return <div className="app-loading"><Sun className="spin"/> Loading SolarFlow…</div>;
    if (!user) return <LoginPage onLogin={async current => {setUser(current); await loadCompanies(current);}}/>;

    return <AppShell user={user} page={page} setPage={setPage} companies={companies} companyId={companyId} setCompanyId={setCompanyId}>
        {({can, activeCompany}) => <>
            {page === 'dashboard' && <DashboardPage companyId={companyId}/>} 
            {page === 'entry' && <DailyEntryPage company={activeCompany} canEdit={can('edit_readings')}/>} 
            {page === 'reports' && <ReportsPage companyId={companyId}/>} 
            {page === 'companies' && <CompaniesPage companies={companies} refresh={() => loadCompanies(user)}/>} 
            {page === 'import' && <ExcelImportPage/>}
            {page === 'users' && <UsersPage companies={companies} currentUser={user}/>} 
            {page === 'activity' && <ActivityLogPage companyId={companyId}/>} 
        </>}
    </AppShell>;
}
