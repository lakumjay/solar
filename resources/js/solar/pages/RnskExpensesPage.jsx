import React, {useEffect, useMemo, useState} from 'react';
import {ArrowRight, Calendar, CheckCircle2, Clock, FileText, HandCoins, History, IndianRupee, Layers, LayoutGrid, PencilLine, Plus, ReceiptIndianRupee, RotateCcw, Scale, Search, Settings2, Sparkles, Split, Table, Trash2, X, Zap} from 'lucide-react';
import {api, getApiBaseUrl} from '../api';
import {Empty, Field, Loading, Metric} from '../components/Common';
import {monthStart, today} from '../config';
import {number, indianAmount, shortDate} from '../format';
import { getLanguage, t } from '../utils/translations';
import { compressImage } from '../utils/imageCompressor';

export default function RnskExpensesPage({currentUser}) {
    const [currentLang, setCurrentLang] = useState(getLanguage());

    useEffect(() => {
        const handleLangChange = (e) => setCurrentLang(e.detail);
        window.addEventListener('solarflow_language_change', handleLangChange);
        return () => window.removeEventListener('solarflow_language_change', handleLangChange);
    }, []);

    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [selectedCompany, setSelectedCompany] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const PAGE_SIZE = 5;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const [data, setData] = useState(null);
    const [expenseForm, setExpenseForm] = useState(null);
    const [settlement, setSettlement] = useState(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' or 'settlements'
    const [ledgerViewMode, setLedgerViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 820 ? 'cards' : 'table'));

    const load = async () => {
        try {
            const compParam = selectedCompany ? `&company_id=${selectedCompany}` : '';
            const res = await api(`rnsk-expenses?date_from=${from}&date_to=${to}${compParam}`);
            setData(res);
            if (res.min_date && from < res.min_date) {
                setFrom(res.min_date);
            }
            setError('');
        } catch (failure) {
            setError(failure.message);
        }
    };

    useEffect(() => { load(); }, [selectedCompany]);

    const completed = async (msg) => {
        setExpenseForm(null);
        setSettlement(null);
        setShowConfigModal(false);
        setMessage(msg);
        await load();
    };

    const action = async (entry, name) => {
        if (!window.confirm(`${name === 'cancel' ? 'Cancel' : 'Reverse'} this RNSK expense?`)) return;
        try {
            await api(`rnsk-expenses/${entry.id}/${name}`, {method: 'POST'});
            await completed(`RNSK Expense ${name === 'cancel' ? 'cancelled' : 'reversed'} successfully.`);
        } catch (failure) {
            setError(failure.message);
        }
    };

    const displayBalances = useMemo(() => {
        if (!data?.balances) return [];
        if (!selectedCompany) return data.balances;
        const cid = Number(selectedCompany);
        return data.balances.filter(p => p.company_ids?.includes(cid));
    }, [data?.balances, selectedCompany]);

    const allEntries = useMemo(() => {
        const list = data?.entries || [];
        if (!selectedCompany) return list;
        const cid = Number(selectedCompany);
        return list.filter(entry => {
            if (entry.type === 'settlement') {
                return Number(entry.from_company?.id) === cid || Number(entry.to_company?.id) === cid;
            }
            return Number(entry.payer_company?.id) === cid ||
                (entry.allocations || []).some(a => Number(a.company?.id) === cid && (Number(a.percentage) > 0 || Number(a.amount) > 0));
        });
    }, [data?.entries, selectedCompany]);

    const filteredEntries = useMemo(() => {
        if (!searchQuery.trim()) return allEntries;
        const rawQ = searchQuery.trim().toLowerCase();
        const cleanNumQ = rawQ.replace(/,/g, '').replace(/[₹rs\.]/gi, '').trim();
        const isNumeric = cleanNumQ.length > 0 && !isNaN(Number(cleanNumQ));

        return allEntries.filter(entry => {
            if (isNumeric) {
                const rawAmt = String(entry.amount || '');
                const roundAmt = String(Math.round(Number(entry.amount) || 0));
                if (rawAmt.includes(cleanNumQ) || roundAmt.includes(cleanNumQ)) return true;

                if ((entry.allocations || []).some(a => {
                    const aRaw = String(a.amount || '');
                    const aRound = String(Math.round(Number(a.amount) || 0));
                    return aRaw.includes(cleanNumQ) || aRound.includes(cleanNumQ);
                })) return true;
            }

            const desc = (entry.description || '').toLowerCase();
            const notes = (entry.notes || '').toLowerCase();
            const purchaser = (entry.purchaser_name || '').toLowerCase();
            const payer = (entry.payer_company?.name || '').toLowerCase();
            const fromC = (entry.from_company?.name || '').toLowerCase();
            const toC = (entry.to_company?.name || '').toLowerCase();
            const shortDateStr = shortDate(entry.date || '').toLowerCase();

            return desc.includes(rawQ) || notes.includes(rawQ) || purchaser.includes(rawQ) || payer.includes(rawQ) || fromC.includes(rawQ) || toC.includes(rawQ) || shortDateStr.includes(rawQ);
        });
    }, [allEntries, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedEntries = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filteredEntries.slice(start, start + PAGE_SIZE);
    }, [filteredEntries, safePage]);

    const groupedEntries = useMemo(() => {
        return Object.entries(
            paginatedEntries.reduce((groups, entry) => ({
                ...groups,
                [entry.date]: [...(groups[entry.date] || []), entry],
            }), {})
        );
    }, [paginatedEntries]);

    if (!data && !error) return <Loading/>;
    if (!data) return <Empty title="Could not load RNSK expenses" detail={error}/>;

    const summary = data.summary;
    const canManage = data.can_manage;
    const settlementsHistory = data.settlements_history || [];

    return (
        <div className="expenses-page rnsk-expenses-page">
            {/* Header Metrics */}
            <div className="cards expense-summary-cards">
                <Metric icon={IndianRupee} title={currentLang === 'en' ? 'Total RNSK Pool' : 'કુલ RNSK ખર્ચ પૂલ'} value={data.gujarati_summary?.total_spent ?? 0} unit="INR" color="amber"/>
                <Metric icon={Scale} title={currentLang === 'en' ? 'Total Outstanding' : 'કુલ લેતી-દેતી બાકી'} value={summary.total_outstanding} unit="INR" color="amber"/>
                <Metric icon={CheckCircle2} title={currentLang === 'en' ? 'Open Balances' : 'પેન્ડિંગ કંપની જોડ'} value={summary.open_pairs} unit="pairs"/>
                <Metric icon={ReceiptIndianRupee} title={currentLang === 'en' ? 'Period Entries' : 'કુલ એન્ટ્રીઓ'} value={summary.entries} unit="entries"/>
            </div>

            {message && <div className="success" style={{marginBottom: '14px'}}>{message}</div>}
            {error && <div className="error" style={{marginBottom: '14px'}}>{error}</div>}

            {/* Dynamic Configuration Alert Banner */}
            {!data.settings.configured && (
                <div className="error" style={{marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                    <div>
                        <b>⚠️ RNSK Companies & % Split not configured!</b>
                        <div style={{fontSize: '12px', marginTop: '2px'}}>Add partner companies and configure their % split to equal exactly 100%.</div>
                    </div>
                    {canManage && (
                        <button type="button" className="primary" onClick={() => setShowConfigModal(true)} style={{padding: '6px 14px', fontSize: '12px'}}>
                            <Settings2 size={14}/> Configure RNSK Companies Now
                        </button>
                    )}
                </div>
            )}

            {/* 🏢 Gujarati Company Investment & Percentage Summary Box (Exact match of ExpensesPage) */}
            {data?.gujarati_summary && (
                <section className="panel" style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    marginBottom: '16px',
                    boxShadow: '0 3px 12px rgba(15, 23, 42, 0.05)'
                }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px'}}>
                        <div>
                            <h2 style={{margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <Split size={17} style={{color: '#0f766e'}}/>
                                <span>{currentLang === 'en' ? 'RNSK Company Investment & Settlement Summary' : 'RNSK કંપની વાઇઝ રોકાણ & લેતી-દેતી હિસાબ (ગુજરાતી સારાંશ)'}</span>
                            </h2>
                            <p style={{margin: '3px 0 0', fontSize: '11.5px', color: '#64748b'}}>
                                {currentLang === 'en' ? 'Clear summary of dynamic partner contributions and pending receivables/payables.' : 'દરેક RNSK ભાગીદાર કંપનીએ કેટલા રૂપિયા ચૂકવ્યા અને % મુજબ કોની પાસેથી કેટલા લેવાના/આપવાના બાકી છે તેનો હિસાબ.'}
                            </p>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                            {canManage && (
                                <button type="button" className="secondary" onClick={() => setShowConfigModal(true)} style={{padding: '5px 11px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px', height: '32px'}}>
                                    <Settings2 size={13}/> <span>{currentLang === 'en' ? 'Manage Companies & %' : 'કંપની & % સેટિંગ્સ'}</span>
                                </button>
                            )}
                            <div style={{
                                background: '#ecfdf5',
                                border: '1px solid #6ee7b7',
                                borderRadius: '10px',
                                padding: '5px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end'
                            }}>
                                <span style={{fontSize: '10px', fontWeight: 700, color: '#047857'}}>RNSK POOL TOTAL</span>
                                <strong style={{fontSize: '16.5px', fontWeight: 900, color: '#065f46'}}>₹{data.gujarati_summary.total_spent_formatted}</strong>
                            </div>
                        </div>
                    </div>

                    {/* 🏢 3-Column / Responsive Company Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '12px',
                        marginBottom: '14px'
                    }}>
                        {(data.gujarati_summary.companies || []).map(comp => {
                            const isReceivable = comp.status_type === 'receivable';
                            const isPayable = comp.status_type === 'payable';
                            const themeBg = isReceivable ? '#f0fdf4' : isPayable ? '#fef2f2' : '#f8fafc';
                            const themeBorder = isReceivable ? '#86efac' : isPayable ? '#fca5a5' : '#cbd5e1';
                            const badgeColor = isReceivable ? '#15803d' : isPayable ? '#b91c1c' : '#475569';
                            const badgeBg = isReceivable ? '#dcfce7' : isPayable ? '#fee2e2' : '#e2e8f0';

                            return (
                                <div key={comp.company_id} style={{
                                    background: themeBg,
                                    border: `1.5px solid ${themeBorder}`,
                                    borderRadius: '12px',
                                    padding: '12px 14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    position: 'relative'
                                }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px'}}>
                                        <div>
                                            <b style={{fontSize: '13.5px', color: '#0f172a'}}>{comp.name}</b>
                                            <div style={{fontSize: '11px', color: '#64748b', marginTop: '2px'}}>
                                                {currentLang === 'en' ? 'Ownership Share:' : 'ભાગીદારી હિસ્સો:'} <b style={{color: '#0f766e', fontWeight: 800}}>{comp.percentage}%</b>
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '10px',
                                            fontWeight: 800,
                                            background: badgeBg,
                                            color: badgeColor,
                                            padding: '2px 7px',
                                            borderRadius: '6px',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {comp.status_text}
                                        </span>
                                    </div>

                                    <div style={{
                                        background: 'rgba(255,255,255,0.85)',
                                        borderRadius: '8px',
                                        padding: '8px 10px',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '8px',
                                        border: '1px solid rgba(0,0,0,0.05)'
                                    }}>
                                        <div>
                                            <div style={{fontSize: '10px', color: '#64748b', fontWeight: 600}}>{currentLang === 'en' ? 'Total Paid:' : 'કુલ આપ્યા:'}</div>
                                            <div style={{fontSize: '13px', fontWeight: 850, color: '#0f172a'}}>₹{comp.total_paid_formatted}</div>
                                        </div>
                                        <div>
                                            <div style={{fontSize: '10px', color: '#64748b', fontWeight: 600}}>{currentLang === 'en' ? 'Fair Share (%):' : 'ટકાવારી હિસ્સો:'}</div>
                                            <div style={{fontSize: '13px', fontWeight: 750, color: '#475569'}}>₹{comp.fair_share_formatted}</div>
                                        </div>
                                    </div>

                                    <div style={{fontSize: '11px', color: '#334155', lineHeight: '1.4', marginTop: '2px'}}>
                                        {isReceivable && (
                                            <span>🟢 <b>{comp.name}</b> {currentLang === 'en' ? 'has spent more than share. Receivable:' : 'એ વધુ ખર્ચ કર્યો હોવાથી બીજી કંપનીઓ પાસેથી'} <b>₹{Math.abs(comp.net_balance).toLocaleString('en-IN', {minimumFractionDigits: 2})} લેવાના બાકી</b> છે.</span>
                                        )}
                                        {isPayable && (
                                            <span>🔴 <b>{comp.name}</b> {currentLang === 'en' ? 'has spent less than share. Payable:' : 'એ ઓછો ખર્ચ કર્યો હોવાથી બીજી કંપનીઓને'} <b>₹{Math.abs(comp.net_balance).toLocaleString('en-IN', {minimumFractionDigits: 2})} આપવાના બાકી</b> છે.</span>
                                        )}
                                        {comp.status_type === 'settled' && (
                                            <span>⚪ {currentLang === 'en' ? 'All accounts are fully settled.' : 'બધા હિસાબો સંપૂર્ણ સરભર થયેલા છે.'}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pending Settlement Sentences */}
                    {data.gujarati_summary.pending_settlements && data.gujarati_summary.pending_settlements.length > 0 && (
                        <div style={{
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                        }}>
                            <b style={{fontSize: '11.5px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                <span>📌</span> {currentLang === 'en' ? 'Pending Settlements (Who pays whom):' : 'પેન્ડિંગ ચૂકવણી વિગત (કોણે કોને કેટલા આપવાના છે):'}
                            </b>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                {data.gujarati_summary.pending_settlements.map((ps, idx) => (
                                    <div key={idx} style={{fontSize: '11.5px', color: '#78350f', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                        <span>👉</span>
                                        <span>{ps.sentence_gu}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Modern Calendar & Filters Toolbar */}
            <section className="panel expense-toolbar-card">
                <div className="calendar-preset-bar">
                    <span className="calendar-preset-label">
                        <Calendar size={13} style={{color: '#0f766e'}}/>
                        <span>{currentLang === 'en' ? 'Date Filter' : 'ખર્ચ સમયગાળો'}:</span>
                    </span>
                    {data?.min_date && data?.max_date && (
                        <button
                            type="button"
                            className={`cal-preset-pill ${from === data.min_date && to === data.max_date ? 'active' : ''}`}
                            onClick={() => { setFrom(data.min_date); setTo(data.max_date); }}
                        >
                            <Sparkles size={11}/> {currentLang === 'en' ? 'Full Expense Period' : 'સંપૂર્ણ ખર્ચ સમય'} ({shortDate(data.min_date)} – {shortDate(data.max_date)})
                        </button>
                    )}
                    <button
                        type="button"
                        className={`cal-preset-pill ${from === monthStart() && to === today() ? 'active' : ''}`}
                        onClick={() => { setFrom(data?.min_date && monthStart() < data.min_date ? data.min_date : monthStart()); setTo(today()); }}
                    >
                        {currentLang === 'en' ? 'This Month' : 'આ મહિને'}
                    </button>
                </div>

                <div className="expense-toolbar-main">
                    <div className="date-input-group">
                        <div className="custom-date-box">
                            <span className="date-box-lbl">{currentLang === 'en' ? 'From' : 'ક્યારથી'}</span>
                            <input
                                type="date"
                                min={data?.min_date || '2026-08-01'}
                                max={to || data?.max_date || today()}
                                value={from}
                                onChange={event => setFrom(event.target.value)}
                                className="rnsk-date-input"
                            />
                        </div>

                        <div className="custom-date-box">
                            <span className="date-box-lbl">{currentLang === 'en' ? 'To' : 'ક્યાં સુધી'}</span>
                            <input
                                type="date"
                                min={from || data?.min_date || '2026-08-01'}
                                max={data?.max_date || today()}
                                value={to}
                                onChange={event => setTo(event.target.value)}
                                className="rnsk-date-input"
                            />
                        </div>

                        <div className="custom-date-box company-filter-box">
                            <span className="date-box-lbl">{currentLang === 'en' ? 'Company' : 'કંપની'}</span>
                            <select
                                value={selectedCompany}
                                onChange={event => {
                                    setSelectedCompany(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className="rnsk-company-select"
                            >
                                <option value="">{currentLang === 'en' ? 'All Companies' : 'બધી કંપનીઓ (All)'}</option>
                                {(data.settings.companies || []).map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.percentage}%)</option>
                                ))}
                            </select>
                        </div>

                        <button className="primary apply-filter-btn" onClick={load}>
                            {currentLang === 'en' ? 'Apply' : 'લાગુ કરો'}
                        </button>
                    </div>

                    <div className="expense-toolbar-actions">
                        <a className="secondary export-btn pdf-btn" href={`${getApiBaseUrl().base}rnsk-expenses/export/pdf?date_from=${from}&date_to=${to}${selectedCompany ? `&company_id=${selectedCompany}` : ''}`} target="_blank" rel="noreferrer">
                            <FileText size={14}/>
                            <span>{currentLang === 'en' ? 'PDF Report' : 'પીડીએફ'}</span>
                        </a>
                        {data.can_manage && (
                            <button className="primary add-exp-btn" disabled={!data.settings.configured} onClick={() => setExpenseForm({})}>
                                <Plus size={14}/> <span>Add RNSK Expense</span>
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Company Balances Panel */}
            <section className="panel">
                <div className="panel-head">
                    <div>
                        <h2>Company balances & Outstanding</h2>
                        <p>Purchases and dynamic % shares are netted automatically. Partial settlements reduce the open balance.</p>
                    </div>
                </div>
                {displayBalances.length ? (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Companies</th>
                                    <th>Current position</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    {data.can_manage && <th/>}
                                </tr>
                            </thead>
                            <tbody>
                                {displayBalances.map(pair => (
                                    <tr key={pair.key}>
                                        <td className="strong">{pair.first_company.name} ↔ {pair.second_company.name}</td>
                                        <td>
                                            {pair.status === 'cleared'
                                                ? (currentLang === 'en' ? 'No amount pending (Settled)' : 'No amount pending (સરભર)')
                                                : <span><b>{pair.debtor_company.name}</b> pays <b>{pair.creditor_company.name}</b></span>}
                                        </td>
                                        <td className="strong" style={{color: pair.status === 'cleared' ? '#64748b' : '#b91c1c'}}>
                                            ₹{number(pair.amount)}
                                        </td>
                                        <td>
                                            <i className={`status ${pair.status === 'cleared' ? 'on' : 'warning'}`}>
                                                {pair.status === 'cleared' ? 'Cleared' : 'Open Balance'}
                                            </i>
                                        </td>
                                        {data.can_manage && (
                                            <td>
                                                {pair.status === 'open' && (
                                                    <button className="primary" style={{padding: '5px 12px', fontSize: '12px'}} onClick={() => setSettlement(pair)}>
                                                        <HandCoins size={14}/> Settle / Pay
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty title="No company balances yet" detail="Add the first RNSK expense to start the ledger."/>
                )}
            </section>

            {/* Tabs for Daily Ledger & Settlement History */}
            <div className="segment" style={{marginBottom: '14px'}}>
                <button
                    type="button"
                    className={activeTab === 'ledger' ? 'active' : ''}
                    onClick={() => setActiveTab('ledger')}
                >
                    <ReceiptIndianRupee size={15}/> Daily expense ledger ({data.entries?.length || 0})
                </button>
                <button
                    type="button"
                    className={activeTab === 'settlements' ? 'active' : ''}
                    onClick={() => setActiveTab('settlements')}
                >
                    <History size={15}/> Settlement History & Logs ({settlementsHistory.length})
                </button>
            </div>

            {/* TAB 1: Daily Expense Ledger */}
            {activeTab === 'ledger' && (
                <section className="panel">
                    <div className="panel-head" style={{alignItems: 'center', marginBottom: '14px'}}>
                        <div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                                <h2 style={{margin: 0}}>Daily expense ledger</h2>
                                {searchQuery.trim() && (
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: filteredEntries.length > 0 ? '#e0f2fe' : '#fee2e2',
                                        color: filteredEntries.length > 0 ? '#0369a1' : '#b91c1c'
                                    }}>
                                        {filteredEntries.length} {currentLang === 'en' ? 'found' : 'પરિણામ'}
                                    </span>
                                )}
                            </div>
                            <p style={{margin: '4px 0 0'}}>Expenses, dynamic company allocations, reversals, and settlement payments from {shortDate(from)} to {shortDate(to)}.</p>
                        </div>
                    </div>

                    {/* Search & Controls Toolbar */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        marginBottom: '16px',
                        flexWrap: 'wrap'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1 1 240px',
                            minWidth: '200px',
                            background: '#ffffff',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <Search size={15} style={{color: '#64748b', flexShrink: 0}}/>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={currentLang === 'en' ? 'Search description, company, amount...' : 'નામ, વિગત, કંપની, રકમ શોધો...'}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    padding: '0 2px',
                                    margin: 0,
                                    fontSize: '12px',
                                    color: '#0f172a'
                                }}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    title="Clear search"
                                    style={{border: 'none', background: 'transparent', padding: '2px 4px', cursor: 'pointer', color: '#94a3b8', display: 'flex'}}
                                >
                                    <X size={14}/>
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            className="secondary view-toggle-btn"
                            onClick={() => setLedgerViewMode(v => v === 'cards' ? 'table' : 'cards')}
                            style={{fontSize: '11px', padding: '6px 11px', height: '34px', flexShrink: 0}}
                            title="Toggle between Card view and Table view"
                        >
                            {ledgerViewMode === 'cards' ? <Table size={14}/> : <LayoutGrid size={14}/>}
                            <span>{ledgerViewMode === 'cards' ? 'Table View' : 'Card View'}</span>
                        </button>
                    </div>

                    {groupedEntries.length ? (
                        <>
                            <div className="expense-ledger">
                                {groupedEntries.map(([date, entries]) => (
                                    <div className="expense-day" key={date}>
                                        <h3>{shortDate(date)}</h3>
                                        {ledgerViewMode === 'cards' ? (
                                            <div className="expense-cards-grid">
                                                {entries.map(entry => (
                                                    <RnskExpenseCard
                                                        entry={entry}
                                                        canManage={data.can_manage}
                                                        currentLang={currentLang}
                                                        onEdit={() => setExpenseForm(entry)}
                                                        onCancel={() => action(entry, 'cancel')}
                                                        onReverse={() => action(entry, 'reverse')}
                                                        key={`${entry.type}-${entry.id}`}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="table-wrap">
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>Entry & Purchaser</th>
                                                            <th>Dynamic Allocations (%)</th>
                                                            <th>Amount</th>
                                                            <th>Status</th>
                                                            <th/>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {entries.map(entry => (
                                                            <RnskLedgerRow
                                                                entry={entry}
                                                                canManage={data.can_manage}
                                                                currentLang={currentLang}
                                                                onEdit={() => setExpenseForm(entry)}
                                                                onCancel={() => action(entry, 'cancel')}
                                                                onReverse={() => action(entry, 'reverse')}
                                                                key={`${entry.type}-${entry.id}`}
                                                            />
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Pagination Bar */}
                            {totalPages > 1 && (
                                <div className="pagination-bar" style={{marginTop: '16px'}}>
                                    <div className="pagination-info">
                                        {currentLang === 'en'
                                            ? `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredEntries.length)} of ${filteredEntries.length} entries`
                                            : `${filteredEntries.length} માંથી ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredEntries.length)} એન્ટ્રી`}
                                    </div>
                                    <div className="pagination-pages">
                                        <button
                                            type="button"
                                            className="pagination-nav-btn"
                                            disabled={safePage <= 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        >
                                            ‹ Prev
                                        </button>
                                        {Array.from({length: totalPages}, (_, i) => i + 1).map(pageNum => (
                                            <button
                                                key={pageNum}
                                                type="button"
                                                className={`pagination-tab-btn ${safePage === pageNum ? 'active' : ''}`}
                                                onClick={() => setCurrentPage(pageNum)}
                                            >
                                                {pageNum}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            className="pagination-nav-btn"
                                            disabled={safePage >= totalPages}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        >
                                            Next ›
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{padding: '24px 16px', textAlign: 'center'}}>
                            <Empty
                                title={searchQuery ? (currentLang === 'en' ? "No matching entries found" : "કોઈ મેળ ખાતી એન્ટ્રી મળી નથી") : "No RNSK expense entries"}
                                detail={searchQuery ? (currentLang === 'en' ? `No expenses match "${searchQuery}".` : `"${searchQuery}" માટે કોઈ ખર્ચ મળ્યો નથી.`) : "No RNSK expenses or settlements recorded in this period."}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => setSearchQuery('')}
                                    style={{marginTop: '12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px'}}
                                >
                                    <RotateCcw size={13}/> {currentLang === 'en' ? 'Clear search' : 'શોધ સાફ કરો'}
                                </button>
                            )}
                        </div>
                    )}
                </section>
            )}

            {/* TAB 2: Settlement Audit History Log */}
            {activeTab === 'settlements' && (
                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Settlement History & Payment Log</h2>
                            <p>Complete record of full and partial payments between RNSK companies with date, time, and remaining balances.</p>
                        </div>
                    </div>
                    {settlementsHistory.length ? (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date & Time</th>
                                        <th>Transfer (From ➜ To)</th>
                                        <th>Settled Amount</th>
                                        <th>Type</th>
                                        <th>Remaining Balance</th>
                                        <th>Mode & Notes</th>
                                        <th>Recorded by</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {settlementsHistory.map(item => (
                                        <tr key={item.id}>
                                            <td>
                                                <b>{shortDate(item.date)}</b>
                                                <small style={{display: 'block', color: '#64748b', fontSize: '11px'}}>{item.settled_at}</small>
                                            </td>
                                            <td>
                                                <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600}}>
                                                    <span>{item.from_company?.name}</span>
                                                    <ArrowRight size={13} style={{color: '#059669'}}/>
                                                    <span style={{color: '#059669'}}>{item.to_company?.name}</span>
                                                </span>
                                            </td>
                                            <td className="strong" style={{color: '#059669'}}>
                                                ₹{number(item.amount)}
                                            </td>
                                            <td>
                                                <span className={`status ${item.settlement_type === 'full' ? 'on' : 'warning'}`}>
                                                    {item.settlement_type === 'full' ? '100% Full' : 'Partial'}
                                                </span>
                                            </td>
                                            <td>
                                                {item.remaining_balance > 0 ? (
                                                    <span style={{color: '#b91c1c', fontWeight: 600}}>₹{number(item.remaining_balance)}</span>
                                                ) : (
                                                    <span style={{color: '#059669', fontWeight: 600}}>₹0.00 (Cleared)</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{textTransform: 'capitalize', fontSize: '11.5px', color: '#334155'}}>
                                                    {item.payment_mode?.replace('_', ' ') || 'Bank Transfer'}
                                                </span>
                                                {item.notes && <small style={{display: 'block', color: '#64748b'}}>{item.notes}</small>}
                                            </td>
                                            <td>
                                                <small>{item.creator?.name || 'Admin'}</small>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <Empty title="No settlements recorded yet" detail="When companies pay outstanding balances, settlement history will appear here with full timestamps."/>
                    )}
                </section>
            )}

            {/* Modals */}
            {expenseForm && (
                <RnskExpenseModal
                    entry={expenseForm.id ? expenseForm : null}
                    companies={data.settings.companies || []}
                    currentLang={currentLang}
                    onClose={() => setExpenseForm(null)}
                    onSaved={completed}
                />
            )}

            {settlement && (
                <RnskSettlementForm
                    pair={settlement}
                    currentLang={currentLang}
                    onClose={() => setSettlement(null)}
                    onSaved={completed}
                />
            )}

            {showConfigModal && (
                <RnskCompanyConfigModal
                    existingCompanies={data.settings.companies || []}
                    currentLang={currentLang}
                    onClose={() => setShowConfigModal(false)}
                    onSaved={completed}
                />
            )}
        </div>
    );
}

// ── COMPONENT: RNSK Expense Card (Matches ExpensesPage ExpenseCard) ──
function RnskExpenseCard({entry, canManage, onEdit, onCancel, onReverse, currentLang = getLanguage()}) {
    if (entry.type === 'settlement') {
        return (
            <div className="expense-entry-card settlement">
                <div className="eec-header">
                    <div>
                        <b className="eec-title">Settlement payment</b>
                        <small className="eec-sub">{entry.from_company?.name} ➜ {entry.to_company?.name}</small>
                    </div>
                    <div className="eec-amount green">₹{number(entry.amount)}</div>
                </div>
                {entry.notes && <div className="eec-notes">{entry.notes}</div>}
                <div className="eec-footer">
                    <i className={`status ${entry.status === 'cleared' ? 'on' : 'warning'}`}>
                        {entry.status === 'cleared' ? 'Full Settlement' : 'Partial Settlement'}
                    </i>
                </div>
            </div>
        );
    }

    return (
        <div className="expense-entry-card">
            <div className="eec-header">
                <div>
                    <b className="eec-title">{entry.description}</b>
                    <small className="eec-sub">
                        {entry.purchaser_name} · <span style={{color: '#0f766e', fontWeight: 600}}>Paid by: {entry.payer_company?.name || '—'}</span>
                    </small>
                </div>
                <div className="eec-amount">₹{number(entry.amount)}</div>
            </div>

            {/* Dynamic Allocation Chips with clear % display */}
            <div className="eec-allocations-grid">
                {(entry.allocations || []).map(row => {
                    const net = row.net_effect ?? ((row.amount_paid || 0) - row.amount);
                    const netText = net > 0.001
                        ? (currentLang === 'en' ? `+₹${number(net)} Rec` : `+₹${number(net)} લેવાના`)
                        : net < -0.001
                            ? (currentLang === 'en' ? `-₹${number(Math.abs(net))} Pay` : `-₹${number(Math.abs(net))} દેવાના`)
                            : (currentLang === 'en' ? 'Settled' : 'સરભર');
                    const netColor = net > 0.001 ? '#15803d' : net < -0.001 ? '#b91c1c' : '#64748b';

                    return (
                        <div key={row.company?.id || row.company_id} className="eec-alloc-chip">
                            <span><b>{row.company?.name || row.company_name}</b> {number(row.percentage)}%</span>
                            <small style={{color: netColor, fontWeight: 700}}>₹{number(row.amount)} ({netText})</small>
                        </div>
                    );
                })}
            </div>

            {entry.notes && <div className="eec-notes">{entry.notes}</div>}

            <div className="eec-footer">
                <i className={`status ${entry.status === 'active' ? (entry.locked ? 'warning' : 'on') : entry.status === 'cancelled' ? 'danger' : ''}`}>
                    {entry.type === 'reversal' ? 'reversal' : entry.status}
                    {entry.locked && entry.status === 'active' ? ' · locked' : ''}
                </i>
                <div className="row-actions">
                    {entry.receipt_url && (
                        <a className="link" href={entry.receipt_url} target="_blank" rel="noreferrer">
                            <FileText size={14}/> Receipt
                        </a>
                    )}
                    {canManage && entry.editable && (
                        <>
                            <button className="link" onClick={onEdit}><PencilLine size={14}/> Edit</button>
                            <button className="link danger-text" onClick={onCancel}>Cancel</button>
                        </>
                    )}
                    {canManage && entry.reversible && (
                        <button className="link danger-text" onClick={onReverse}>Reverse</button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── COMPONENT: RNSK Ledger Row ──
function RnskLedgerRow({entry, canManage, onEdit, onCancel, onReverse, currentLang = getLanguage()}) {
    if (entry.type === 'settlement') {
        return (
            <tr>
                <td>
                    <b>Settlement payment</b>
                    <small>
                        {entry.from_company?.name} paid {entry.to_company?.name}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                    </small>
                </td>
                <td>
                    <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: '#059669'}}>
                        {entry.from_company?.name} ➜ {entry.to_company?.name}
                    </span>
                </td>
                <td className="strong" style={{color: '#059669'}}>₹{number(entry.amount)}</td>
                <td>
                    <i className={`status ${entry.status === 'cleared' ? 'on' : 'warning'}`}>
                        {entry.status === 'cleared' ? 'Full Settlement' : 'Partial Settlement'}
                    </i>
                </td>
                <td/>
            </tr>
        );
    }

    return (
        <tr>
            <td>
                <b>{entry.description}</b>
                <small>
                    {entry.purchaser_name} · <span style={{color: '#0f766e', fontWeight: 600}}>Paid by: {entry.payer_company?.name || '—'}</span>
                    {entry.notes ? ` · ${entry.notes}` : ''}
                </small>
            </td>
            <td>
                <div className="allocation-list">
                    {(entry.allocations || []).map(row => {
                        const net = row.net_effect ?? ((row.amount_paid || 0) - row.amount);
                        const netText = net > 0.001
                            ? (currentLang === 'en' ? `(+₹${number(net)} Receivable)` : `(+₹${number(net)} લેવાના)`)
                            : net < -0.001
                                ? (currentLang === 'en' ? `(-₹${number(Math.abs(net))} Payable)` : `(-₹${number(Math.abs(net))} દેવાના)`)
                                : (currentLang === 'en' ? '(Settled)' : '(સરભર)');
                        const netColor = net > 0.001 ? '#15803d' : net < -0.001 ? '#b91c1c' : '#64748b';

                        return (
                            <span key={row.company?.id || row.company_id}>
                                <b>{row.company?.name || row.company_name}</b> {number(row.percentage)}% · ₹{number(row.amount)}{' '}
                                <small style={{color: netColor, fontWeight: 700}}>{netText}</small>
                            </span>
                        );
                    })}
                </div>
            </td>
            <td className="strong">₹{number(entry.amount)}</td>
            <td>
                <i className={`status ${entry.status === 'active' ? (entry.locked ? 'warning' : 'on') : entry.status === 'cancelled' ? 'danger' : ''}`}>
                    {entry.type === 'reversal' ? 'reversal' : entry.status}
                    {entry.locked && entry.status === 'active' ? ' · locked' : ''}
                </i>
            </td>
            <td>
                <div className="row-actions">
                    {entry.receipt_url && (
                        <a className="link" href={entry.receipt_url} target="_blank" rel="noreferrer">
                            <FileText size={14}/> Receipt
                        </a>
                    )}
                    {canManage && entry.editable && (
                        <>
                            <button className="link" onClick={onEdit}><PencilLine size={14}/> Edit</button>
                            <button className="link danger-text" onClick={onCancel}>Cancel</button>
                        </>
                    )}
                    {canManage && entry.reversible && (
                        <button className="link danger-text" onClick={onReverse}>Reverse</button>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ── MODAL 1: Add / Edit RNSK Expense Form ──
function RnskExpenseModal({entry, companies, onClose, onSaved, currentLang}) {
    const [expenseDate, setExpenseDate] = useState(entry?.date || today());
    const [payerCompanyId, setPayerCompanyId] = useState(String(entry?.payer_company?.id || companies[0]?.id || ''));
    const [purchaserName, setPurchaserName] = useState(entry?.purchaser_name || '');
    const [description, setDescription] = useState(entry?.description || '');
    const [amount, setAmount] = useState(entry?.amount ? String(entry.amount) : '');
    const [notes, setNotes] = useState(entry?.notes || '');
    const [receipt, setReceipt] = useState(null);
    const [removeReceipt, setRemoveReceipt] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const parsedAmount = Number(amount) || 0;

    // Live preview of dynamic % split
    const allocationsPreview = useMemo(() => {
        return companies.map(c => {
            const pct = Number(c.percentage ?? c.expense_percentage) || 0;
            const share = Number(((parsedAmount * pct) / 100).toFixed(2));
            const isPayer = String(c.id) === String(payerCompanyId);
            const net = isPayer ? parsedAmount - share : -share;
            return {
                id: c.id,
                name: c.name,
                percentage: pct,
                shareAmount: share,
                isPayer,
                net
            };
        });
    }, [companies, parsedAmount, payerCompanyId]);

    const handleReceiptChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type.startsWith('image/')) {
            try {
                const compressed = await compressImage(file, {maxWidth: 1600, quality: 0.8});
                setReceipt(compressed);
            } catch (err) {
                setReceipt(file);
            }
        } else {
            setReceipt(file);
        }
        setRemoveReceipt(false);
    };

    const save = async (e) => {
        e.preventDefault();
        if (parsedAmount <= 0) {
            setError('Please enter a valid amount.');
            return;
        }
        setBusy(true);
        setError('');

        const fd = new FormData();
        fd.append('expense_date', expenseDate);
        fd.append('payer_company_id', payerCompanyId);
        fd.append('purchaser_name', purchaserName.trim());
        fd.append('description', description.trim());
        fd.append('amount', String(parsedAmount));
        if (notes.trim()) fd.append('notes', notes.trim());
        if (receipt) fd.append('receipt', receipt);
        if (removeReceipt) fd.append('remove_receipt', '1');

        try {
            const url = entry?.id ? `rnsk-expenses/${entry.id}` : 'rnsk-expenses';
            await api(url, {method: 'POST', body: fd});
            await onSaved(entry ? 'RNSK expense updated successfully.' : 'RNSK expense recorded successfully.');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const amountWord = indianAmount(parsedAmount);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal expense-modal expense-modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '540px'}}>
                <div className="mobile-modal-handle-bar"/>

                <div className="panel-head expense-sheet-head">
                    <div>
                        <h2>{entry ? 'Edit RNSK Expense' : 'Add RNSK Expense'}</h2>
                        <p>Divided dynamically according to each company's configured % share.</p>
                    </div>
                    <button type="button" className="icon-button ghost modal-close-chip" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{maxHeight: '68vh', overflowY: 'auto', padding: '14px 16px'}}>
                    {error && <div className="error" style={{marginBottom: '12px'}}>{error}</div>}

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px'}}>
                        <Field label={currentLang === 'en' ? 'Expense Date' : 'ખર્ચ તારીખ'}>
                            <input
                                type="date"
                                value={expenseDate}
                                onChange={e => setExpenseDate(e.target.value)}
                                className="rnsk-date-input"
                                required
                            />
                        </Field>

                        <Field label={currentLang === 'en' ? 'Paid by (Paying Company)' : 'ચૂકવનાર કંપની (કોણે આપ્યા)'}>
                            <select
                                value={payerCompanyId}
                                onChange={e => setPayerCompanyId(e.target.value)}
                                className="rnsk-company-select"
                                required
                            >
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.percentage}%)</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px'}}>
                        <Field label={currentLang === 'en' ? 'Purchaser Name' : 'ખર્ચ કરનાર વ્યક્તિ'}>
                            <input
                                type="text"
                                placeholder="e.g. Rahul Patel"
                                value={purchaserName}
                                onChange={e => setPurchaserName(e.target.value)}
                                required
                            />
                        </Field>

                        <Field label={currentLang === 'en' ? 'Total Amount (₹)' : 'કુલ ખર્ચ રકમ (₹)'}>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="₹ 0.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                required
                            />
                        </Field>
                    </div>

                    {parsedAmount > 0 && (
                        <div style={{fontSize: '11px', color: '#0f766e', fontWeight: 700, marginTop: '-4px', marginBottom: '10px'}}>
                            ₹ {number(parsedAmount)} · {amountWord}
                        </div>
                    )}

                    <Field label={currentLang === 'en' ? 'Expense Description' : 'ખર્ચ વિગત (Description)'}>
                        <input
                            type="text"
                            placeholder="e.g. Structure material, Transportation, Site lunch..."
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            required
                        />
                    </Field>

                    {/* Dynamic Allocation Live Preview Table */}
                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        marginTop: '10px',
                        marginBottom: '10px'
                    }}>
                        <div style={{fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between'}}>
                            <span>📊 {currentLang === 'en' ? 'Dynamic % Allocation Preview' : 'ડાયનેમિક % મુજબ ભાગલા'}</span>
                            <span style={{color: '#0f766e'}}>{companies.length} Companies (100%)</span>
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                            {allocationsPreview.map(row => (
                                <div key={row.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '11.5px',
                                    padding: '4px 6px',
                                    background: row.isPayer ? '#f0fdf4' : '#ffffff',
                                    borderRadius: '6px',
                                    border: `1px solid ${row.isPayer ? '#bbf7d0' : '#f1f5f9'}`
                                }}>
                                    <div>
                                        <b style={{color: '#0f172a'}}>{row.name}</b>
                                        <span style={{color: '#64748b', fontSize: '10.5px', marginLeft: '6px'}}>({row.percentage}%)</span>
                                        {row.isPayer && <span style={{fontSize: '9.5px', background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px', fontWeight: 700}}>PAYER</span>}
                                    </div>
                                    <div style={{textAlign: 'right'}}>
                                        <b style={{color: '#0f172a'}}>₹{number(row.shareAmount)}</b>
                                        <small style={{display: 'block', fontSize: '10px', fontWeight: 700, color: row.net > 0 ? '#15803d' : '#b91c1c'}}>
                                            {row.net > 0 ? `+₹${number(row.net)} Rec` : `-₹${number(Math.abs(row.net))} Pay`}
                                        </small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Field label={currentLang === 'en' ? 'Notes / Remarks (Optional)' : 'નોંધ (વિકલ્પિક)'}>
                        <textarea
                            rows={2}
                            placeholder="Optional notes or invoice details..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </Field>

                    <Field label={currentLang === 'en' ? 'Bill / Receipt Attachment' : 'બિલ / રસીદ ફોટો'}>
                        <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleReceiptChange}
                        />
                        {entry?.receipt_url && !removeReceipt && (
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '11.5px'}}>
                                <a href={entry.receipt_url} target="_blank" rel="noreferrer" style={{color: '#0f766e', fontWeight: 600}}>
                                    View Current Receipt
                                </a>
                                <button type="button" className="link danger-text" onClick={() => setRemoveReceipt(true)}>
                                    Remove
                                </button>
                            </div>
                        )}
                    </Field>
                </div>

                <div className="modal-sticky-footer" style={{padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', background: '#f8fafc'}}>
                    <button type="button" className="secondary" onClick={onClose} style={{height: '36px', fontSize: '12px'}}>
                        Cancel
                    </button>
                    <button type="submit" className="primary" disabled={busy || parsedAmount <= 0} style={{height: '36px', fontSize: '12px'}}>
                        {busy ? 'Saving...' : entry ? '✓ Update Expense' : '✓ Save RNSK Expense'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── MODAL 2: Record Balance Settlement (Matches SettlementForm) ──
function RnskSettlementForm({pair, onClose, onSaved, currentLang = getLanguage()}) {
    const totalOpen = Number(pair.amount) || 0;
    const [settledOn, setSettledOn] = useState(today());
    const [amount, setAmount] = useState(String(totalOpen));
    const [paymentMode, setPaymentMode] = useState('bank_transfer');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const parsedAmount = Number(amount) || 0;
    const remainingBalance = Math.max(0, Number((totalOpen - parsedAmount).toFixed(2)));
    const settlementType = remainingBalance <= 0.001 ? 'full' : 'partial';

    const handlePreset = (fraction) => {
        const val = Number((totalOpen * fraction).toFixed(2));
        setAmount(String(val));
    };

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');

        if (parsedAmount <= 0 || parsedAmount > totalOpen) {
            setError(`Please enter a valid amount between ₹0.01 and ₹${number(totalOpen)}.`);
            setBusy(false);
            return;
        }

        try {
            await api('rnsk-expense-settlements', {
                method: 'POST',
                body: JSON.stringify({
                    settled_on: settledOn,
                    amount: parsedAmount,
                    from_company_id: pair.debtor_company.id,
                    to_company_id: pair.creditor_company.id,
                    settlement_type: settlementType,
                    payment_mode: paymentMode,
                    notes,
                }),
            });
            await onSaved(`Settlement of ₹${number(parsedAmount)} recorded successfully.`);
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal modal-sheet settlement-modal" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '520px'}}>
                <div className="panel-head">
                    <div>
                        <h2>{currentLang === 'en' ? 'Record Balance Settlement' : 'ચૂકવણી / સેટલમેન્ટ નોંધો'}</h2>
                        <p>
                            <b>{pair.debtor_company.name}</b> pays <b>{pair.creditor_company.name}</b>
                        </p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{maxHeight: '68vh', overflowY: 'auto', padding: '14px 16px'}}>
                    <div className="settlement-balance" style={{background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <div>
                            <small style={{fontWeight: 700, textTransform: 'uppercase', fontSize: '10px', color: '#b45309'}}>TOTAL OPEN BALANCE</small>
                            <div style={{fontSize: '20px', fontWeight: 850, color: '#78350f'}}>₹{number(totalOpen)}</div>
                        </div>
                        <span className="status warning" style={{fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 750}}>
                            {currentLang === 'en' ? 'balance receivable' : 'બાકી લેવાના નીકળે છે'}
                        </span>
                    </div>

                    {/* Presets */}
                    <div style={{marginBottom: '12px'}}>
                        <span style={{fontSize: '11px', color: '#475569', fontWeight: 700, display: 'block', marginBottom: '6px'}}>
                            {currentLang === 'en' ? 'Quick Amount Presets:' : 'ઝડપી રકમ પસંદગી:'}
                        </span>
                        <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => handlePreset(1.0)}
                                style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    fontWeight: 750,
                                    borderRadius: '7px',
                                    background: parsedAmount === totalOpen ? '#15803d' : '#f1f5f9',
                                    color: parsedAmount === totalOpen ? '#ffffff' : '#1e293b',
                                    border: parsedAmount === totalOpen ? '1px solid #15803d' : '1px solid #cbd5e1'
                                }}
                            >
                                100% Full (₹{number(totalOpen)})
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => handlePreset(0.5)}
                                style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    borderRadius: '7px',
                                    background: parsedAmount === Number((totalOpen * 0.5).toFixed(2)) ? '#15803d' : '#f1f5f9',
                                    color: parsedAmount === Number((totalOpen * 0.5).toFixed(2)) ? '#ffffff' : '#1e293b',
                                    border: parsedAmount === Number((totalOpen * 0.5).toFixed(2)) ? '1px solid #15803d' : '1px solid #cbd5e1'
                                }}
                            >
                                50% Half
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => handlePreset(0.25)}
                                style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    borderRadius: '7px',
                                    background: parsedAmount === Number((totalOpen * 0.25).toFixed(2)) ? '#15803d' : '#f1f5f9',
                                    color: parsedAmount === Number((totalOpen * 0.25).toFixed(2)) ? '#ffffff' : '#1e293b',
                                    border: parsedAmount === Number((totalOpen * 0.25).toFixed(2)) ? '1px solid #15803d' : '1px solid #cbd5e1'
                                }}
                            >
                                25%
                            </button>
                        </div>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px'}}>
                        <Field label={currentLang === 'en' ? 'Settlement Date' : 'ચૂકવણી તારીખ'}>
                            <input
                                type="date"
                                value={settledOn}
                                onChange={e => setSettledOn(e.target.value)}
                                className="rnsk-date-input"
                                required
                            />
                        </Field>

                        <Field label={currentLang === 'en' ? 'Amount to Settle (₹)' : 'ચૂકવેલ રકમ (₹)'}>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={totalOpen}
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                required
                            />
                        </Field>
                    </div>

                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        marginBottom: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11.5px'
                    }}>
                        <span style={{color: '#64748b', fontWeight: 600}}>Remaining Balance after payment:</span>
                        <b style={{color: remainingBalance <= 0 ? '#15803d' : '#b91c1c', fontSize: '13px'}}>
                            {remainingBalance <= 0 ? '₹0.00 (Fully Cleared)' : `₹${number(remainingBalance)}`}
                        </b>
                    </div>

                    <Field label={currentLang === 'en' ? 'Payment Mode' : 'ચુકવણી માધ્યમ'}>
                        <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="rnsk-company-select">
                            <option value="bank_transfer">Bank Transfer (NEFT / RTGS / IMPS)</option>
                            <option value="upi">UPI / GPay / PhonePe</option>
                            <option value="cash">Cash (રોકડ)</option>
                            <option value="cheque">Cheque</option>
                        </select>
                    </Field>

                    <Field label={currentLang === 'en' ? 'Notes / Reference' : 'નોંધ / રેફરન્સ'}>
                        <textarea
                            rows={2}
                            placeholder="Optional transaction reference ID or notes..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </Field>

                    {error && <div className="error" style={{marginTop: '10px'}}>{error}</div>}
                </div>

                <div className="modal-sticky-footer" style={{padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', background: '#f8fafc'}}>
                    <button type="button" className="secondary" onClick={onClose} style={{height: '36px', fontSize: '12px'}}>
                        Cancel
                    </button>
                    <button type="submit" className="primary" disabled={busy || parsedAmount <= 0} style={{height: '36px', fontSize: '12px'}}>
                        {busy ? 'Recording...' : '✓ Record Settlement'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── MODAL 3: Configure RNSK Dynamic Companies & % Split ──
function RnskCompanyConfigModal({existingCompanies, currentLang, onClose, onSaved}) {
    const [companies, setCompanies] = useState(() => {
        if (existingCompanies && existingCompanies.length > 0) {
            return existingCompanies.map(c => ({
                id: c.id,
                name: c.name || '',
                percentage: c.percentage ?? c.expense_percentage ?? '',
                active: c.active !== false
            }));
        }
        return [
            {id: null, name: 'Company 1', percentage: '50', active: true},
            {id: null, name: 'Company 2', percentage: '50', active: true},
        ];
    });

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const totalPct = useMemo(() => {
        return companies
            .filter(c => c.active)
            .reduce((sum, c) => sum + (parseFloat(c.percentage) || 0), 0);
    }, [companies]);

    const isValid = Math.abs(totalPct - 100) < 0.01;

    const addCompany = () => {
        setCompanies(prev => [...prev, {id: null, name: '', percentage: '', active: true}]);
    };

    const removeCompany = (idx) => {
        if (companies.length <= 1) return;
        setCompanies(prev => prev.filter((_, i) => i !== idx));
    };

    const save = async (e) => {
        e.preventDefault();
        if (!isValid) {
            setError(`Total active percentage must equal exactly 100%. Current sum: ${totalPct.toFixed(2)}%`);
            return;
        }
        setBusy(true);
        setError('');
        try {
            await api('rnsk-expense-percentages', {
                method: 'POST',
                body: JSON.stringify({
                    companies: companies.map(c => ({
                        id: c.id,
                        name: c.name.trim(),
                        percentage: Number(c.percentage) || 0,
                        active: c.active,
                    }))
                })
            });
            await onSaved('RNSK companies and percentages saved successfully.');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '520px'}}>
                <div className="panel-head">
                    <div>
                        <h2>{currentLang === 'en' ? 'Configure RNSK Companies & %' : 'RNSK ભાગીદાર કંપનીઓ & ટકાવારી હિસ્સો'}</h2>
                        <p>Add dynamic partner companies and set their exact % split (Total must equal 100%).</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{maxHeight: '65vh', overflowY: 'auto', padding: '14px 16px'}}>
                    {error && <div className="error" style={{marginBottom: '10px'}}>{error}</div>}

                    {/* Total Percentage Status Box */}
                    <div style={{
                        background: isValid ? '#f0fdf4' : '#fef2f2',
                        border: `1.5px solid ${isValid ? '#86efac' : '#fca5a5'}`,
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <span style={{fontSize: '10.5px', color: '#64748b', fontWeight: 700}}>TOTAL ACTIVE SPLIT</span>
                            <div style={{fontSize: '18px', fontWeight: 900, color: isValid ? '#166534' : '#991b1b'}}>
                                {totalPct.toFixed(2)}%
                            </div>
                        </div>
                        <span style={{fontSize: '11.5px', fontWeight: 800, color: isValid ? '#15803d' : '#b91c1c'}}>
                            {isValid ? '✓ 100% Ready to save' : '⚠️ Must sum to 100%'}
                        </span>
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                        {companies.map((comp, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '6px 8px'
                            }}>
                                <input
                                    type="text"
                                    placeholder="Company Name (e.g. RNSK Tech)"
                                    value={comp.name}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setCompanies(prev => prev.map((c, i) => i === idx ? {...c, name: val} : c));
                                    }}
                                    style={{flex: 2, padding: '6px 8px', fontSize: '12px', minHeight: '34px'}}
                                    required
                                />
                                <div style={{display: 'flex', alignItems: 'center', gap: '4px', width: '90px'}}>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        placeholder="%"
                                        value={comp.percentage}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setCompanies(prev => prev.map((c, i) => i === idx ? {...c, percentage: val} : c));
                                        }}
                                        style={{width: '65px', padding: '6px 8px', fontSize: '12px', textAlign: 'right', minHeight: '34px'}}
                                        required
                                    />
                                    <span style={{fontSize: '12px', fontWeight: 800, color: '#64748b'}}>%</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeCompany(idx)}
                                    title="Remove company"
                                    style={{border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px'}}
                                >
                                    <Trash2 size={15}/>
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addCompany}
                        className="secondary"
                        style={{marginTop: '10px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '7px', fontSize: '11.5px'}}
                    >
                        <Plus size={13}/> <span>Add Another Company</span>
                    </button>
                </div>

                <div className="modal-sticky-footer" style={{padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', background: '#f8fafc'}}>
                    <button type="button" className="secondary" onClick={onClose} style={{height: '36px', fontSize: '12px'}}>
                        Cancel
                    </button>
                    <button type="submit" className="primary" disabled={!isValid || busy} style={{height: '36px', fontSize: '12px'}}>
                        {busy ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </form>
        </div>
    );
}
