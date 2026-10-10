import React, { useEffect, useState } from 'react';
import { 
    ZapOff, Zap, AlertTriangle, Clock, TrendingDown, IndianRupee, 
    RefreshCw, Filter, Building2, Calendar, FileText, CheckCircle2 
} from 'lucide-react';
import { api } from '../api';
import { Empty } from '../components/Common';
import ErrorWireCut, { ErrorBoundary } from '../components/ErrorWireCut';
import { useTranslation } from '../context/LanguageContext';

export default function CurtailmentLossPage({ companyId, companies = [] }) {
    const { t, lang } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState(companyId || 'all');
    const [selectedMonth, setSelectedMonth] = useState('all');

    const loadAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (selectedCompany && selectedCompany !== 'all') params.append('company_id', selectedCompany);
            if (selectedMonth && selectedMonth !== 'all') params.append('month', selectedMonth);

            const res = await api(`curtailments/loss-analytics?${params.toString()}`);
            setData(res);
        } catch (err) {
            setError(err?.message || '૬૬KV પાવર કટ અને નુકસાન ડેટા લોડ કરવામાં નિષ્ફળ.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, [selectedCompany, selectedMonth]);

    const summary = data?.summary || {
        total_incidents: 0,
        total_duration_minutes: 0,
        total_duration_human: '0 મિનિટ',
        total_lost_kwh: 0,
        total_lost_revenue_rs: 0,
        is_currently_tripped: false,
        unit_rate: 3.80
    };

    const companyBreakdown = data?.company_breakdown || [];
    const incidents = data?.incidents || [];

    return (
        <ErrorBoundary>
            <section className="panel">
                <div className="panel-head">
                    <div>
                        <h2>{t('gridPowerTripTitle', '૬૬KV સબસ્ટેશન પાવર કટ & નુકસાન એનાલિટિક્સ')}</h2>
                        <p>{t('gridPowerTripSubtitle', 'બપોરે પાવર બંધ રહેવાથી કઈ કંપનીને કેટલા યુનિટ્સ અને રૂપિયાનું નુકસાન થયું તેનો હિસાબ.')}</p>
                    </div>

                    <button 
                        type="button" 
                        className="btn-secondary-action" 
                        style={{ padding: '7px 13px', fontSize: '12px' }}
                        onClick={loadAnalytics}
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        <span>{t('refresh', 'રિફ્રેશ')}</span>
                    </button>
                </div>

                {/* Filter Toolbar */}
                <div className="activity-toolbar" style={{ marginBottom: 16 }}>
                    <div className="activity-filters-row">
                        {/* Company Filter */}
                        <select 
                            className="activity-filter-select"
                            value={selectedCompany}
                            onChange={e => setSelectedCompany(e.target.value)}
                        >
                            <option value="all">{t('allCompanies', 'બધી કંપનીઓ (Combined)')}</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        {/* Month Filter */}
                        <select 
                            className="activity-filter-select"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                        >
                            <option value="all">{lang === 'en' ? 'All Months' : 'બધા મહિના'}</option>
                            <option value="2026-10">{lang === 'en' ? 'October 2026' : 'ઓક્ટોબર ૨૦૨૬'}</option>
                            <option value="2026-09">{lang === 'en' ? 'September 2026' : 'સપ્ટેમ્બર ૨૦૨૬'}</option>
                            <option value="2026-08">{lang === 'en' ? 'August 2026' : 'ઓગસ્ટ ૨૦૨૬'}</option>
                        </select>
                    </div>

                    {/* Live Outage Alert / Normal Banner */}
                    <div>
                        {summary.is_currently_tripped ? (
                            <span className="wire-cut-badge" style={{ animation: 'sparkFlicker 0.8s infinite alternate' }}>
                                <AlertTriangle size={15} />
                                <span>{t('gridStatusTripped', '🚨 ૬૬KV ગ્રીડ લાઇન ટ્રીપ / પાવર બંધ છે!')}</span>
                            </span>
                        ) : (
                            <span className="status on" style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle2 size={14} />
                                <span>{t('gridStatusNormal', 'ગ્રીડ પાવર સામાન્ય (Normal 100%)')}</span>
                            </span>
                        )}
                    </div>
                </div>

                {error ? (
                    <ErrorWireCut 
                        error={error} 
                        onRetry={loadAnalytics} 
                        fullScreen={false} 
                        title="૬૬KV ડેટા લોડ થઈ શક્યો નથી"
                    />
                ) : loading ? (
                    <div className="app-loading inline">
                        <RefreshCw className="spin" size={20} /> ગ્રીડ ટ્રીપ અને નુકસાન ડેટા લોડ થઈ રહ્યો છે...
                    </div>
                ) : (
                    <div>
                        {/* Top 4 KPI Metrics */}
                        <div className="cards" style={{ marginBottom: 20 }}>
                            <div className="metric">
                                <div className="metric-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                                    <ZapOff size={18} />
                                </div>
                                <span>{t('totalPowerCutsCount', 'પાવર કટ કુલ વખત')}</span>
                                <strong>{summary.total_incidents} <small>{t('outageTimes', 'વખત')}</small></strong>
                                <small>{lang === 'en' ? 'Outage Events' : 'ગ્રીડ ટ્રીપિંગ સંખ્યા'}</small>
                            </div>

                            <div className="metric">
                                <div className="metric-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                                    <Clock size={18} />
                                </div>
                                <span>{t('totalPowerCutDuration', 'કુલ બંધ સમય')}</span>
                                <strong>{summary.total_duration_human}</strong>
                                <small>{lang === 'en' ? 'Total Offline Hours' : 'કુલ જનરેશન બંધ રહ્યું'}</small>
                            </div>

                            <div className="metric">
                                <div className="metric-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                    <TrendingDown size={18} />
                                </div>
                                <span>{t('totalLostUnitsKwh', 'કુલ યુનિટ નુકસાન')}</span>
                                <strong>{summary.total_lost_kwh} <small>kWh</small></strong>
                                <small>{lang === 'en' ? 'Lost Solar Units' : 'સૂર્યપ્રકાશમાં ગુમાવેલ યુનિટ્સ'}</small>
                            </div>

                            <div className="metric amber">
                                <div className="metric-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                                    <IndianRupee size={18} />
                                </div>
                                <span>{t('totalFinancialLossRs', 'કુલ આર્થિક નુકસાન')}</span>
                                <strong style={{ color: '#b45309' }}>₹{Number(summary.total_lost_revenue_rs).toLocaleString('en-IN')}</strong>
                                <small>@ ₹{summary.unit_rate} / {lang === 'en' ? 'unit PPA rate' : 'યુનિટ PPA ભાવ'}</small>
                            </div>
                        </div>

                        {/* Company-wise Loss Breakdown */}
                        <div style={{ marginBottom: 24 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 750, color: '#0f172a', marginBottom: 12 }}>
                                {t('companyWiseLossBreakdown', 'કંપની વાઇઝ નુકસાન વિગત (Company Breakdown)')}
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                                {companyBreakdown.map(cb => (
                                    <div key={cb.company_id} className="session-device-card" style={{ padding: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                                                    <Building2 size={17} />
                                                </div>
                                                <b style={{ fontSize: 14, color: '#0f172a' }}>{cb.company_name}</b>
                                            </div>
                                            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>
                                                {cb.capacity_kw} kW
                                            </span>
                                        </div>

                                        <div className="session-meta-row" style={{ marginTop: 8 }}>
                                            <div className="session-meta-item">
                                                <small>{lang === 'en' ? 'Outages' : 'ટ્રીપ સંખ્યા'}:</small>
                                                <span>{cb.incidents_count} {lang === 'en' ? 'times' : 'વખત'}</span>
                                            </div>
                                            <div className="session-meta-item">
                                                <small>{lang === 'en' ? 'Duration' : 'બંધ સમય'}:</small>
                                                <span>{cb.duration_human}</span>
                                            </div>
                                            <div className="session-meta-item">
                                                <small>{lang === 'en' ? 'Lost Units' : 'નુકસાન યુનિટ્સ'}:</small>
                                                <span style={{ color: '#2563eb' }}>{cb.lost_kwh} kWh</span>
                                            </div>
                                            <div className="session-meta-item">
                                                <small>{lang === 'en' ? 'Revenue Loss' : 'આર્થિક નુકસાન'}:</small>
                                                <span style={{ color: '#dc2626' }}>₹{Number(cb.lost_revenue_rs).toLocaleString('en-IN')}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Incident History Table */}
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 750, color: '#0f172a', marginBottom: 12 }}>
                                {t('outageIncidentHistory', 'પાવર કટ ઇતિહાસ & લોગ્સ (Incident History)')}
                            </h3>

                            {incidents.length === 0 ? (
                                <Empty 
                                    title={lang === 'en' ? 'No Power Cut Incidents' : 'કોઈ પાવર કટ નોંધાયેલ નથી'} 
                                    detail={lang === 'en' ? 'All plants have had uninterrupted grid connection.' : 'પસંદ કરેલા સમયગાળામાં ગ્રીડ પાવર સંપૂર્ણ ચાલુ રહ્યો છે.'}
                                />
                            ) : (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>{lang === 'en' ? 'Company' : 'કંપની'}</th>
                                                <th>{t('startedAt', 'શરૂઆત સમય')}</th>
                                                <th>{t('endedAt', 'પાવર આવ્યો')}</th>
                                                <th>{t('outageDuration', 'બંધ રહ્યો')}</th>
                                                <th>{t('lostUnits', 'નુકસાન યુનિટ્સ')}</th>
                                                <th>{t('lostAmount', 'આર્થિક નુકસાન')}</th>
                                                <th>{t('reasonNotes', 'કારણ / નોંધ')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {incidents.map(inc => (
                                                <tr key={inc.id}>
                                                    <td>
                                                        <b>{inc.company_name}</b>
                                                        {inc.is_active && (
                                                            <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 4, fontWeight: 750 }}>
                                                                LIVE OFF
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>{inc.started_at}</td>
                                                    <td>{inc.ended_at}</td>
                                                    <td>
                                                        <span className="status warning">{inc.duration_human}</span>
                                                    </td>
                                                    <td style={{ fontWeight: 700, color: '#1d4ed8' }}>
                                                        {inc.lost_kwh} kWh
                                                    </td>
                                                    <td style={{ fontWeight: 750, color: '#b91c1c' }}>
                                                        ₹{Number(inc.lost_revenue_rs).toLocaleString('en-IN')}
                                                    </td>
                                                    <td style={{ fontSize: 12, color: '#64748b' }}>
                                                        {inc.notes}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </ErrorBoundary>
    );
}
