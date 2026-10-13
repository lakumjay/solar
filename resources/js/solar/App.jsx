import React, {useEffect, useState, lazy, Suspense} from 'react';
import {Sun} from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import {api} from './api';
import AppShell from './components/AppShell';
import { ErrorBoundary } from './components/ErrorWireCut';
import { LanguageProvider } from './context/LanguageContext';
import OfflineScreen from './components/OfflineScreen';

const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const AttendanceReportsPage = lazy(() => import('./pages/AttendanceReportsPage'));
const CompaniesPage = lazy(() => import('./pages/CompaniesPage'));
const DailyEntryPage = lazy(() => import('./pages/DailyEntryPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExcelImportPage = lazy(() => import('./pages/ExcelImportPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const LeaveHolidayPage = lazy(() => import('./pages/LeaveHolidayPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const MyAttendancePage = lazy(() => import('./pages/MyAttendancePage'));
const MySalaryPage = lazy(() => import('./pages/MySalaryPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SalaryPage = lazy(() => import('./pages/SalaryPage'));
const StockPage = lazy(() => import('./pages/StockPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ISolarCloudPage = lazy(() => import('./pages/ISolarCloudPage'));
const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const ReelsPage = lazy(() => import('./pages/ReelsPage'));
const CurtailmentLossPage = lazy(() => import('./pages/CurtailmentLossPage'));
const AiHelpCenterPage = lazy(() => import('./pages/AiHelpCenterPage'));

const PageLoader = () => (
    <div className="app-loading" style={{minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#16a34a', fontWeight: 600}}>
        <Sun className="spin" size={22}/> Loading…
    </div>
);

function AppContent() {
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

    // Handle 401 Unauthorized / Session Expiry smoothly
    useEffect(() => {
        const handleSessionExpired = () => {
            setUser(null);
        };
        window.addEventListener('solarflow:session_expired', handleSessionExpired);
        return () => window.removeEventListener('solarflow:session_expired', handleSessionExpired);
    }, []);

    // Configure native keyboard behavior to prevent overlapping inputs
    useEffect(() => {
        try {
            Keyboard.setResizeMode({ mode: 'body' }).catch(() => {});
            Keyboard.setScroll({ isDisabled: false }).catch(() => {});
        } catch (_) {}
    }, []);

    // Auto-retry when internet connection returns
    useEffect(() => {
        const handleReconnected = () => {
            api('me').then(async current => {
                if (current) {
                    setUser(current);
                    await loadCompanies(current, page);
                }
            }).catch(() => {});
        };
        window.addEventListener('solarflow:reconnected', handleReconnected);
        return () => window.removeEventListener('solarflow:reconnected', handleReconnected);
    }, [page]);

    // Android Back Button via @capacitor/app & web popstate (modal close -> previous page -> exit on home)
    useEffect(() => {
        const handleBackAction = () => {
            // 1. Check if any modal is currently visible
            const openModalCloseBtn = document.querySelector('.modal-close, .modal-close-btn, [data-modal-close], button[aria-label="Close"], .btn-close');
            const openModalBackdrop = document.querySelector('.modal, .modal-backdrop, [role="dialog"], .wire-cut-error-container');
            if (openModalCloseBtn || openModalBackdrop) {
                window.dispatchEvent(new CustomEvent('solarflow:close_active_modal'));
                if (openModalCloseBtn) {
                    openModalCloseBtn.click();
                    return true;
                }
            }

            // 2. If not on dashboard, return to dashboard
            if (page !== 'dashboard') {
                setPage('dashboard');
                return true;
            }

            return false;
        };

        const handlePopState = () => {
            handleBackAction();
        };
        window.addEventListener('popstate', handlePopState);

        let capListener = null;
        try {
            capListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
                const handled = handleBackAction();
                if (!handled) {
                    CapacitorApp.exitApp();
                }
            });
        } catch (_) {}

        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (capListener?.then) {
                capListener.then(l => l?.remove?.()).catch(() => {});
            } else if (capListener?.remove) {
                capListener.remove();
            }
        };
    }, [page]);

    // Service Worker push notification audio chime listener
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            const handleSwMessage = (e) => {
                if (e.data?.type === 'PUSH_NOTIFICATION_RECEIVED') {
                    try {
                        const soundPrefix = window.location.pathname.includes('/git/public') ? '/git/public' : '';
                        const audio = new Audio(`${soundPrefix}/sounds/alert.wav`);
                        audio.play().catch(() => {});
                    } catch (_) {}
                }
            };
            navigator.serviceWorker.addEventListener('message', handleSwMessage);
            return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
        }
    }, []);

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

    // Automatic Frontend Error Reporter & Database Auto-Healer Trigger
    useEffect(() => {
        if (!user) return;
        const reportRuntimeError = (msg, sourceComp = 'window') => {
            if (!msg || typeof msg !== 'string') return;
            api('ai-help-center/auto-report', {
                method: 'POST',
                body: JSON.stringify({ message: msg.slice(0, 500), component: sourceComp })
            }).catch(() => {});
        };
        const onErr = (event) => {
            if (event?.message) reportRuntimeError(event.message, event?.filename || 'window.onerror');
        };
        const onRej = (event) => {
            const msg = event?.reason?.message || String(event?.reason || '');
            if (msg && msg.includes('SQLSTATE')) reportRuntimeError(msg, 'api.sql');
        };
        window.addEventListener('error', onErr);
        window.addEventListener('unhandledrejection', onRej);
        return () => {
            window.removeEventListener('error', onErr);
            window.removeEventListener('unhandledrejection', onRej);
        };
    }, [user?.id]);

    if (user === undefined) return <div className="app-loading"><Sun className="spin"/> Loading SolarFlow…</div>;
    if (!user) return (
        <ErrorBoundary>
            <Suspense fallback={<PageLoader/>}>
                <LoginPage onLogin={async current => {const preferredPage = window.localStorage.getItem(`solarflow.activePage.${current.id}`) || 'dashboard'; setUser(current); setPage(preferredPage); await loadCompanies(current, preferredPage);}}/>
            </Suspense>
        </ErrorBoundary>
    );

    return <AppShell user={user} page={page} setPage={setPage} companies={companies} companyId={companyId} setCompanyId={setCompanyId}>
        {({can, activeCompany}) => (
            <ErrorBoundary key={page} fullScreen={false}>
                <Suspense fallback={<PageLoader/>}>
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
                    {page === 'curtailment-loss' && <CurtailmentLossPage companyId={companyId} companies={companies} currentUser={user}/>}
                    {page === 'ai-help-center' && user.role === 'super_admin' && <AiHelpCenterPage user={user}/>}
                    {page === 'my-attendance' && <MyAttendancePage companyId={companyId}/>}
                    {page === 'my-salary' && <MySalaryPage/>}
                </Suspense>
            </ErrorBoundary>
        )}
    </AppShell>;
}

export default function App() {
    return (
        <ErrorBoundary>
            <LanguageProvider>
                <OfflineScreen />
                <AppContent />
            </LanguageProvider>
        </ErrorBoundary>
    );
}
