import React, { useEffect, useState, useMemo } from 'react';
import { 
    Activity, Smartphone, Monitor, Tablet, Globe, Shield, 
    User, Calendar, Search, LogOut, RefreshCw, CheckCircle2, 
    AlertCircle, ArrowRight, Eye, Laptop, HardDrive
} from 'lucide-react';
import { api } from '../api';
import { Empty } from '../components/Common';
import ErrorWireCut, { ErrorBoundary } from '../components/ErrorWireCut';
import { useTranslation } from '../context/LanguageContext';

export default function ActivityLogPage({ companyId }) {
    const { t, lang } = useTranslation();
    const [activeTab, setActiveTab] = useState('history'); // 'history' | 'sessions'
    
    // History State
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    
    // Filters
    const [selectedUser, setSelectedUser] = useState('all');
    const [selectedAction, setSelectedAction] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [usersList, setUsersList] = useState([]);

    // Sessions State
    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsError, setSessionsError] = useState(null);
    const [revokingId, setRevokingId] = useState(null);
    const [revokeSuccess, setRevokeSuccess] = useState('');

    const PAGE_SIZE = 10;

    // Load available users for filter
    useEffect(() => {
        api('users').then(data => {
            if (Array.isArray(data)) setUsersList(data);
        }).catch(() => {});
    }, []);

    // Load Activity Logs
    const loadLogs = async (targetPage = page) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (companyId && companyId !== 'all') params.append('company_id', companyId);
            if (selectedUser !== 'all') params.append('user_id', selectedUser);
            if (selectedAction !== 'all') params.append('action', selectedAction);
            if (searchTerm.trim()) params.append('search', searchTerm.trim());
            params.append('per_page', PAGE_SIZE);
            params.append('page', targetPage);

            const res = await api(`activity?${params.toString()}`);
            setRows(res?.data || []);
            setLastPage(res?.last_page || 1);
            setTotalRows(res?.total || 0);
            setPage(res?.current_page || targetPage);
        } catch (err) {
            setError(err?.message || 'એક્ટિવિટી લોગ્સ લોડ કરવામાં સમસ્યા આવી.');
        } finally {
            setLoading(false);
        }
    };

    // Load Active Sessions
    const loadSessions = async () => {
        setSessionsLoading(true);
        setSessionsError(null);
        try {
            const res = await api('activity/active-sessions');
            setSessions(res?.sessions || []);
        } catch (err) {
            setSessionsError(err?.message || 'લાઈવ સેશન્સ લોડ કરવામાં સમસ્યા આવી.');
        } finally {
            setSessionsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') {
            loadLogs(1);
        } else {
            loadSessions();
        }
    }, [companyId, selectedUser, selectedAction, activeTab]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadLogs(1);
    };

    const handleRevokeSession = async (sessionId) => {
        if (!window.confirm('શું તમે ખરેખર આ ડિવાઇસમાંથી લૉગઆઉટ કરાવવા માંગો છો?')) return;
        setRevokingId(sessionId);
        setRevokeSuccess('');
        try {
            await api('activity/revoke-session', {
                method: 'POST',
                body: JSON.stringify({ session_id: sessionId })
            });
            setRevokeSuccess('સેશન સફળતાપૂર્વક રદ્દ કરવામાં આવ્યું.');
            await loadSessions();
            setTimeout(() => setRevokeSuccess(''), 3000);
        } catch (err) {
            alert(err?.message || 'સેશન રદ્દ કરવામાં નિષ્ફળ.');
        } finally {
            setRevokingId(null);
        }
    };

    const renderDeviceIcon = (deviceType, deviceName = '') => {
        const lower = (deviceName + ' ' + deviceType).toLowerCase();
        if (lower.includes('iphone') || lower.includes('android') || lower.includes('pixel') || lower.includes('samsung') || lower.includes('mobile')) {
            return <Smartphone size={16} />;
        }
        if (lower.includes('ipad') || lower.includes('tablet')) {
            return <Tablet size={16} />;
        }
        if (lower.includes('mac') || lower.includes('laptop')) {
            return <Laptop size={16} />;
        }
        return <Monitor size={16} />;
    };

    const formatActionBadge = (action) => {
        const act = (action || '').toLowerCase();
        let colorClass = 'status on';
        if (act.includes('login')) colorClass = 'status on';
        else if (act.includes('logout')) colorClass = 'status';
        else if (act.includes('delete') || act.includes('cancel') || act.includes('revoke')) colorClass = 'status danger';
        else if (act.includes('update') || act.includes('edit')) colorClass = 'status warning';
        return <span className={colorClass}>{action}</span>;
    };

    return (
        <ErrorBoundary>
            <section className="panel">
                <div className="panel-head">
                    <div>
                        <h2>{t('activitySecurityAudit', 'સિસ્ટમ એક્ટિવિટી & સિક્યોરિટી ઑડિટ')}</h2>
                        <p>{t('activitySecuritySubtitle', 'કયા સુપર એડમિન કે યુઝરે કયા ફોન/કમ્પ્યુટર અને IP પરથી શું ફેરફાર કર્યો તેની વિગતવાર હિસ્ટ્રી.')}</p>
                    </div>

                    <button 
                        type="button" 
                        className="btn-secondary-action" 
                        style={{ padding: '7px 13px', fontSize: '12px' }}
                        onClick={() => activeTab === 'history' ? loadLogs(page) : loadSessions()}
                    >
                        <RefreshCw size={14} className={loading || sessionsLoading ? 'spin' : ''} />
                        <span>{t('refresh', 'રિફ્રેશ')}</span>
                    </button>
                </div>

                {/* Main Tabs Navigation */}
                <div className="activity-toolbar">
                    <div className="activity-tab-group">
                        <button 
                            type="button" 
                            className={`activity-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                            onClick={() => setActiveTab('history')}
                        >
                            <Activity size={15} />
                            <span>{t('activityHistoryTab', 'એક્ટિવિટી હિસ્ટ્રી')} ({totalRows})</span>
                        </button>
                        <button 
                            type="button" 
                            className={`activity-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
                            onClick={() => setActiveTab('sessions')}
                        >
                            <Shield size={15} />
                            <span>{t('activeDevicesTab', 'લાઈવ લૉગિન ડિવાઇસ')} ({sessions.length})</span>
                        </button>
                    </div>

                    {/* Filters Toolbar for History Tab */}
                    {activeTab === 'history' && (
                        <div className="activity-filters-row">
                            {/* User Filter (Super Admin 1 vs Super Admin 2, etc.) */}
                            <select 
                                className="activity-filter-select"
                                value={selectedUser}
                                onChange={e => { setSelectedUser(e.target.value); setPage(1); }}
                            >
                                <option value="all">{t('allUsersFilter', 'બધા એડમિન & યુઝર્સ')}</option>
                                {usersList.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name} ({u.role === 'super_admin' ? t('superAdminBadge', 'Super Admin') : u.role})
                                    </option>
                                ))}
                            </select>

                            {/* Action Filter */}
                            <select 
                                className="activity-filter-select"
                                value={selectedAction}
                                onChange={e => { setSelectedAction(e.target.value); setPage(1); }}
                            >
                                <option value="all">{t('allActionsFilter', 'તમામ એક્શન્સ')}</option>
                                <option value="login">Login ({lang === 'en' ? 'Login' : 'લૉગિન'})</option>
                                <option value="logout">Logout ({lang === 'en' ? 'Logout' : 'લૉગઆઉટ'})</option>
                                <option value="create">Create ({lang === 'en' ? 'Created' : 'ઉમેર્યું'})</option>
                                <option value="update">Update ({lang === 'en' ? 'Updated' : 'સુધારો કર્યો'})</option>
                                <option value="delete">Delete ({lang === 'en' ? 'Deleted' : 'ડિલીટ કર્યું'})</option>
                                <option value="settle">Settle ({lang === 'en' ? 'Settlement' : 'સેટલમેન્ટ'})</option>
                            </select>

                            {/* Search Form */}
                            <form onSubmit={handleSearchSubmit} className="activity-search-box">
                                <Search size={14} />
                                <input 
                                    type="text" 
                                    className="activity-search-input" 
                                    placeholder={lang === 'en' ? 'IP, Phone model, details...' : 'IP, ફોન મોડલ, વિગત...'} 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </form>
                        </div>
                    )}
                </div>

                {/* TAB 1: ACTIVITY HISTORY */}
                {activeTab === 'history' && (
                    <div>
                        {error ? (
                            <ErrorWireCut 
                                error={error} 
                                onRetry={() => loadLogs(page)} 
                                fullScreen={false} 
                                title="એક્ટિવિટી રેકોર્ડ્સ લોડ ન થઈ શક્યા"
                            />
                        ) : loading ? (
                            <div className="app-loading inline">
                                <RefreshCw className="spin" size={20} /> લોગ્સ લોડ થઈ રહ્યા છે...
                            </div>
                        ) : rows.length === 0 ? (
                            <Empty 
                                title="કોઈ એક્ટિવિટી મળી નથી" 
                                detail="પસંદ કરેલા ફિલ્ટર મુજબ કોઈ હિસ્ટ્રી રેકોર્ડ ઉપલબ્ધ નથી."
                            />
                        ) : (
                            <div className="activity-card-list">
                                {rows.map(row => {
                                    const isSuperAdmin = row.user?.role === 'super_admin';
                                    return (
                                        <article key={row.id} className="activity-audit-card">
                                            <div className="audit-card-top">
                                                {/* User Info with Role Indicator */}
                                                <div className="audit-user-info">
                                                    <div className="audit-user-avatar" style={isSuperAdmin ? { background: '#fef3c7', color: '#b45309' } : {}}>
                                                        {row.user?.name ? row.user.name.charAt(0).toUpperCase() : 'S'}
                                                    </div>
                                                    <div className="audit-user-meta">
                                                        <b>
                                                            {row.user?.name || 'System Auto'}
                                                            {isSuperAdmin && (
                                                                <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: 5, fontWeight: 750 }}>
                                                                    SUPER ADMIN
                                                                </span>
                                                            )}
                                                        </b>
                                                        <small>
                                                            {row.company?.name || 'Global System'} · {new Date(row.created_at).toLocaleString('en-GB')}
                                                        </small>
                                                    </div>
                                                </div>

                                                {/* Device, IP & Action Badges */}
                                                <div className="audit-badges">
                                                    {/* Device Model */}
                                                    {row.device && (
                                                        <span className="device-badge-pill" title={`Platform: ${row.platform || ''} | Browser: ${row.browser || ''}`}>
                                                            {renderDeviceIcon(row.device, row.device)}
                                                            <span>{row.device}</span>
                                                        </span>
                                                    )}

                                                    {/* IP Address */}
                                                    {row.ip_address && (
                                                        <span className="ip-badge-pill" title="IP Address">
                                                            <Globe size={12} />
                                                            <span>{row.ip_address}</span>
                                                        </span>
                                                    )}

                                                    {/* Action Badge */}
                                                    {formatActionBadge(row.action)}
                                                </div>
                                            </div>

                                            {/* Description of what happened */}
                                            <div className="audit-description">
                                                {row.description}
                                            </div>

                                            {/* Value Diff (Before vs After) if recorded */}
                                            {((row.old_values && Object.keys(row.old_values).length > 0) || (row.new_values && Object.keys(row.new_values).length > 0)) && (
                                                <div className="audit-diff-box">
                                                    <span className="audit-diff-title">સુધારાની વિગત (Changes Diff):</span>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
                                                        {row.old_values && (
                                                            <div>
                                                                <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>અગાઉનું મૂલ્ય (Old):</span>
                                                                <pre style={{ margin: 0, fontSize: 11, background: '#fee2e2', padding: 6, borderRadius: 6, color: '#991b1b', overflowX: 'auto' }}>
                                                                    {JSON.stringify(row.old_values, null, 2)}
                                                                </pre>
                                                            </div>
                                                        )}
                                                        {row.new_values && (
                                                            <div>
                                                                <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>નવું મૂલ્ય (New):</span>
                                                                <pre style={{ margin: 0, fontSize: 11, background: '#dcfce7', padding: 6, borderRadius: 6, color: '#166534', overflowX: 'auto' }}>
                                                                    {JSON.stringify(row.new_values, null, 2)}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}

                                {/* Pagination Controls (5-10 per page) */}
                                {lastPage > 1 && (
                                    <div className="stock-pagination" style={{ marginTop: 14 }}>
                                        <button 
                                            type="button" 
                                            className="stock-page-btn" 
                                            disabled={page <= 1}
                                            onClick={() => loadLogs(page - 1)}
                                        >
                                            Previous
                                        </button>
                                        
                                        <div className="stock-page-numbers">
                                            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    className={`stock-page-num ${p === page ? 'active' : ''}`}
                                                    onClick={() => loadLogs(p)}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>

                                        <button 
                                            type="button" 
                                            className="stock-page-btn" 
                                            disabled={page >= lastPage}
                                            onClick={() => loadLogs(page + 1)}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: ACTIVE LOGGED-IN SESSIONS & DEVICES */}
                {activeTab === 'sessions' && (
                    <div>
                        {revokeSuccess && (
                            <div className="success" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <CheckCircle2 size={16} />
                                <span>{revokeSuccess}</span>
                            </div>
                        )}

                        {sessionsError ? (
                            <ErrorWireCut 
                                error={sessionsError} 
                                onRetry={loadSessions} 
                                fullScreen={false} 
                                title="સેશન્સ લોડ ન થઈ શક્યા"
                            />
                        ) : sessionsLoading ? (
                            <div className="app-loading inline">
                                <RefreshCw className="spin" size={20} /> એક્ટિવ સેશન્સ તપાસી રહ્યા છીએ...
                            </div>
                        ) : sessions.length === 0 ? (
                            <Empty 
                                title="કોઈ સેશન મળ્યું નથી" 
                                detail="હાલ કોઈ એક્ટિવ સેશન રેકોર્ડ ડેટાબેઝમાં નથી."
                            />
                        ) : (
                            <div>
                                <div style={{ marginBottom: 12, fontSize: 12.5, color: '#64748b' }}>
                                    નીચે હાલમાં લૉગિન થયેલા તમામ ફોન અને કમ્પ્યુટરનું લાઈવ લિસ્ટ છે. જો કોઈ અજાણ્યા ફોનમાં લૉગિન જણાય, તો તમે તેને તરત જ લૉગઆઉટ કરી શકો છો.
                                </div>

                                <div className="active-sessions-grid">
                                    {sessions.map(s => (
                                        <div key={s.id} className={`session-device-card ${s.is_current ? 'is-current' : ''}`}>
                                            <div>
                                                <div className="session-card-head">
                                                    <div className="session-device-icon">
                                                        {renderDeviceIcon(s.device_type, s.device)}
                                                    </div>

                                                    <div className="session-device-info">
                                                        <b>{s.device}</b>
                                                        <span>{s.platform} · {s.browser}</span>
                                                    </div>
                                                </div>

                                                {/* Status Badge */}
                                                <div className={`session-status-badge ${s.is_current ? 'current' : 'live'}`}>
                                                    <span className="live-pulse-dot" style={s.is_current ? {} : { background: '#0284c7' }} />
                                                    <span>{s.is_current ? 'આ ડિવાઇસ (Current)' : 'એક્ટિવ (Live)'}</span>
                                                </div>
                                            </div>

                                            {/* Session Details Table */}
                                            <div className="session-meta-row">
                                                <div className="session-meta-item">
                                                    <small>લૉગિન યુઝર:</small>
                                                    <span>{s.user_name} ({s.user_role === 'super_admin' ? 'Super Admin' : s.user_role})</span>
                                                </div>
                                                <div className="session-meta-item">
                                                    <small>IP એડ્રેસ:</small>
                                                    <span style={{ fontFamily: 'monospace' }}>{s.ip_address}</span>
                                                </div>
                                                <div className="session-meta-item" style={{ gridColumn: 'span 2' }}>
                                                    <small>છેલ્લી પ્રવૃત્તિ (Last Active):</small>
                                                    <span>{s.last_active_human} ({new Date(s.last_active_at).toLocaleString('en-GB')})</span>
                                                </div>
                                            </div>

                                            {/* Action Button: Revoke / Logout */}
                                            <div className="session-actions">
                                                {!s.is_current ? (
                                                    <button 
                                                        type="button" 
                                                        className="btn-revoke-session"
                                                        disabled={revokingId === s.id}
                                                        onClick={() => handleRevokeSession(s.id)}
                                                    >
                                                        <LogOut size={13} />
                                                        <span>{revokingId === s.id ? 'લૉગઆઉટ કરી રહ્યા છીએ...' : 'લૉગઆઉટ કરાવો (Revoke)'}</span>
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                                                        ✓ તમે હાલ આ ડિવાઇસ વાપરી રહ્યા છો
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </ErrorBoundary>
    );
}
