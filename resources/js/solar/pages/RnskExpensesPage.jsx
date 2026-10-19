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

// ── MODAL 1: Add / Edit RNSK Expense Form (4-Step Wizard Matching ExpenseForm) ──
function RnskExpenseModal({entry, companies, onClose, onSaved, currentLang}) {
    const activeCompanies = useMemo(() => {
        return (companies || [])
            .filter(c => c.active !== false)
            .map(c => ({
                id: c.id,
                name: c.name,
                percentage: Number(c.percentage ?? c.expense_percentage ?? 0),
            }));
    }, [companies]);

    const [step, setStep] = useState(1);
    const [expenseDate, setExpenseDate] = useState(entry?.date || today());
    const [purchaserName, setPurchaserName] = useState(entry?.purchaser_name || '');
    const [description, setDescription] = useState(entry?.description || '');
    const [amount, setAmount] = useState(entry?.amount ? String(entry.amount) : '');
    const [notes, setNotes] = useState(entry?.notes || '');
    const [receipt, setReceipt] = useState(null);
    const [removeReceipt, setRemoveReceipt] = useState(false);

    // Beneficiary scope: 'all' | 'two' (specific) | 'single'
    const [allocationScope, setAllocationScope] = useState(() => {
        if (entry?.allocation_scope) return entry.allocation_scope;
        if (entry?.allocations?.length === 1) return 'single';
        if (entry?.allocations && entry.allocations.length < activeCompanies.length) return 'two';
        return 'all';
    });

    const [selectedBeneficiaries, setSelectedBeneficiaries] = useState(() => {
        if (entry?.allocations && entry.allocations.length > 0) {
            return entry.allocations.map(a => a.company?.id || a.company_id);
        }
        return activeCompanies.slice(0, 2).map(c => c.id);
    });

    const [singleBeneficiaryId, setSingleBeneficiaryId] = useState(() => {
        if (entry?.allocations?.length === 1) {
            return String(entry.allocations[0].company?.id || entry.allocations[0].company_id);
        }
        return String(activeCompanies[0]?.id || '');
    });

    // Payer mode: 'single' | 'multiple'
    const [payerMode, setPayerMode] = useState(() => {
        return (entry?.payers && entry.payers.length > 1) ? 'multiple' : 'single';
    });

    const [singlePayerId, setSinglePayerId] = useState(() => {
        return String(entry?.payer_company?.id || activeCompanies[0]?.id || '');
    });

    const [payerAmounts, setPayerAmounts] = useState(() => {
        const init = {};
        activeCompanies.forEach(c => {
            const existing = entry?.payers?.find(p => (p.company_id || p.company?.id) === c.id);
            init[c.id] = existing ? String(existing.amount_paid) : '';
        });
        return init;
    });

    const [selectedPayers, setSelectedPayers] = useState(() => {
        if (entry?.payers && entry.payers.length > 0) {
            return entry.payers.map(p => p.company_id || p.company?.id);
        }
        return [activeCompanies[0]?.id].filter(Boolean);
    });

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const parsedAmount = Number(amount) || 0;

    const toggleBeneficiary = (cid) => {
        setSelectedBeneficiaries(prev => {
            if (prev.includes(cid)) {
                if (prev.length <= 1) return prev;
                return prev.filter(id => id !== cid);
            }
            return [...prev, cid];
        });
    };

    const togglePayer = (cid) => {
        setSelectedPayers(prev => {
            if (prev.includes(cid)) {
                if (prev.length <= 1) return prev;
                return prev.filter(id => id !== cid);
            }
            return [...prev, cid];
        });
    };

    const handleSplitEqually = () => {
        if (!selectedPayers.length || parsedAmount <= 0) return;
        const count = selectedPayers.length;
        const splitVal = Number((parsedAmount / count).toFixed(2));
        setPayerAmounts(prev => {
            const next = {...prev};
            let runningSum = 0;
            selectedPayers.forEach((cid, idx) => {
                if (idx === count - 1) {
                    next[cid] = String(Number((parsedAmount - runningSum).toFixed(2)));
                } else {
                    next[cid] = String(splitVal);
                    runningSum += splitVal;
                }
            });
            return next;
        });
    };

    // Live preview of dynamic % split
    const previewAllocations = useMemo(() => {
        if (allocationScope === 'single') {
            const targetId = Number(singleBeneficiaryId);
            return activeCompanies.map(c => ({
                id: c.id,
                name: c.name,
                percentage: c.id === targetId ? 100 : 0,
                shareAmount: c.id === targetId ? parsedAmount : 0,
            }));
        }
        if (allocationScope === 'two') {
            const activeSel = activeCompanies.filter(c => selectedBeneficiaries.includes(c.id));
            const sumMaster = activeSel.reduce((s, c) => s + (Number(c.percentage) || 0), 0);
            return activeCompanies.map(c => {
                if (!activeSel.some(a => a.id === c.id)) {
                    return {id: c.id, name: c.name, percentage: 0, shareAmount: 0};
                }
                const pct = sumMaster > 0 ? ((Number(c.percentage) || 0) / sumMaster) * 100 : (100 / (activeSel.length || 1));
                const share = Number(((parsedAmount * pct) / 100).toFixed(2));
                return {id: c.id, name: c.name, percentage: Number(pct.toFixed(2)), shareAmount: share};
            });
        }
        // 'all'
        return activeCompanies.map(c => {
            const pct = Number(c.percentage) || 0;
            const share = Number(((parsedAmount * pct) / 100).toFixed(2));
            return {id: c.id, name: c.name, percentage: pct, shareAmount: share};
        });
    }, [allocationScope, selectedBeneficiaries, singleBeneficiaryId, activeCompanies, parsedAmount]);

    const previewPaidMap = useMemo(() => {
        const map = {};
        if (payerMode === 'single') {
            const pid = Number(singlePayerId);
            activeCompanies.forEach(c => { map[c.id] = c.id === pid ? parsedAmount : 0; });
        } else {
            activeCompanies.forEach(c => {
                map[c.id] = selectedPayers.includes(c.id) ? Number(payerAmounts[c.id]) || 0 : 0;
            });
        }
        return map;
    }, [payerMode, singlePayerId, payerAmounts, selectedPayers, activeCompanies, parsedAmount]);

    const totalPaidSum = Object.values(previewPaidMap).reduce((s, v) => s + v, 0);
    const paidDiff = Number((parsedAmount - totalPaidSum).toFixed(2));
    const isPaidValid = Math.abs(paidDiff) <= 0.01;

    // Step validations
    const step1Valid = expenseDate && purchaserName.trim() && description.trim() && parsedAmount > 0;
    const step2Valid = allocationScope === 'single' ? Boolean(singleBeneficiaryId) : allocationScope === 'two' ? selectedBeneficiaries.length >= 2 : true;
    const step3Valid = payerMode === 'single' ? Boolean(singlePayerId) : isPaidValid;

    const scopeLabel = allocationScope === 'single'
        ? (currentLang === 'en' ? '1 Company (100% Direct)' : '૧ કંપની (100% Direct)')
        : allocationScope === 'two'
            ? (currentLang === 'en' ? `${selectedBeneficiaries.length} Companies Selected` : `${selectedBeneficiaries.length} પસંદ કરેલ કંપનીઓ`)
            : (currentLang === 'en' ? `All ${activeCompanies.length} Companies (Master %)` : `બધી ${activeCompanies.length} કંપનીઓ (ડાયનેમિક %)`);

    const payerLabel = payerMode === 'single'
        ? activeCompanies.find(c => String(c.id) === String(singlePayerId))?.name || '—'
        : (currentLang === 'en' ? `${selectedPayers.length} Companies Split` : `${selectedPayers.length} કંપનીઓ વચ્ચે ચૂકવણી`);

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
        if (!isPaidValid && payerMode === 'multiple') {
            setError(`Total paid (₹${number(totalPaidSum)}) ≠ Total amount (₹${number(parsedAmount)})`);
            return;
        }
        setBusy(true);
        setError('');

        const fd = new FormData();
        fd.append('expense_date', expenseDate);
        fd.append('purchaser_name', purchaserName.trim());
        fd.append('description', description.trim());
        fd.append('amount', String(parsedAmount));
        if (notes.trim()) fd.append('notes', notes.trim());
        fd.append('allocation_scope', allocationScope);

        if (allocationScope === 'single') {
            fd.append('beneficiary_company_ids[]', singleBeneficiaryId);
        } else if (allocationScope === 'two') {
            selectedBeneficiaries.forEach(id => fd.append('beneficiary_company_ids[]', String(id)));
        } else {
            activeCompanies.forEach(c => fd.append('beneficiary_company_ids[]', String(c.id)));
        }

        if (payerMode === 'single') {
            fd.append('payer_company_id', singlePayerId);
        } else {
            fd.append('payer_company_id', String(selectedPayers[0] || singlePayerId));
            selectedPayers.forEach((cid, index) => {
                fd.append(`payers[${index}][company_id]`, String(cid));
                fd.append(`payers[${index}][amount_paid]`, String(previewPaidMap[cid] || 0));
            });
        }

        if (receipt) fd.append('receipt', receipt);
        if (removeReceipt) fd.append('remove_receipt', '1');

        try {
            const url = entry?.id ? `rnsk-expenses/${entry.id}` : 'rnsk-expenses';
            await api(url, {method: 'POST', body: fd});
            await onSaved(entry ? 'RNSK expense updated successfully.' : 'RNSK expense recorded successfully.');
        } catch (err) {
            setError(err.message);
            setStep(1);
        } finally {
            setBusy(false);
        }
    };

    const amountWord = indianAmount(parsedAmount);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal expense-modal expense-modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '560px'}}>
                <div className="mobile-modal-handle-bar"/>

                {/* Header */}
                <div className="panel-head expense-sheet-head">
                    <div>
                        <h2>{entry ? (currentLang === 'en' ? 'Edit RNSK Expense' : 'RNSK ખર્ચમાં ફેરફાર કરો') : (currentLang === 'en' ? 'Add RNSK Expense' : 'નવો RNSK ખર્ચ ઉમેરો')}</h2>
                        <p>{currentLang === 'en' ? 'Dynamic company allocations & multi-payer settlement wizard' : 'ડાયનેમિક કંપની હિસ્સા અને ચૂકવણીનું સરળ 4-Step વિઝાર્ડ'}</p>
                    </div>
                    <button type="button" className="icon-button ghost modal-close-chip" onClick={onClose}><X size={18}/></button>
                </div>

                {/* Step Progress Bar */}
                <div className="expense-step-progress">
                    {(currentLang === 'en' ? ['Info', 'Beneficiary', 'Paid By', 'Confirm'] : ['માહિતી', 'ખર્ચ કોનો?', 'ચૂકવ્યા?', 'ખાતરી']).map((label, i) => (
                        <div key={i} className={`step-prog-item ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
                            <div className="step-prog-circle">{step > i + 1 ? '✓' : i + 1}</div>
                            <span>{label}</span>
                        </div>
                    ))}
                </div>

                <div className="expense-form-body-scroll modal-body-scroll" style={{maxHeight: '66vh', overflowY: 'auto', padding: '14px 16px'}}>

                    {/* ── STEP 1: Basic Info ── */}
                    {step === 1 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">1</span>
                                <b>{currentLang === 'en' ? 'Basic Expense Details' : 'ખર્ચની મૂળ વિગતો'}</b>
                            </div>

                            <Field label={currentLang === 'en' ? 'Expense Date' : 'ખર્ચની તારીખ (Expense Date)'}>
                                <input type="date" max={today()} value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="rnsk-date-input" required/>
                            </Field>

                            <Field label={currentLang === 'en' ? 'Total Amount (₹)' : 'કુલ ખર્ચ રકમ (Total Amount ₹)'}>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    inputMode="decimal"
                                    placeholder="₹ 0.00"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="highlight-amount-input"
                                    required
                                />
                                {amountWord && (
                                    <div className="amount-gujarati-word">
                                        ₹ {number(parsedAmount)} · <b>{amountWord}</b>
                                    </div>
                                )}
                            </Field>

                            <Field label={currentLang === 'en' ? 'Purchased By' : 'ખર્ચ કરનાર વ્યક્તિ (Purchased By)'}>
                                <input
                                    type="text"
                                    placeholder="e.g. Rahul Patel / Jayeshbhai"
                                    value={purchaserName}
                                    maxLength="150"
                                    onChange={e => setPurchaserName(e.target.value)}
                                    required
                                />
                            </Field>

                            <Field label={currentLang === 'en' ? 'Expense Description' : 'ખર્ચ વિગત (Description)'}>
                                <input
                                    type="text"
                                    placeholder="e.g. Structure material, Cable wire, Site breakfast..."
                                    value={description}
                                    maxLength="255"
                                    onChange={e => setDescription(e.target.value)}
                                    required
                                />
                            </Field>

                            <Field label={currentLang === 'en' ? 'Notes / Remarks (Optional)' : 'નોંધ / રીમાર્કસ (વિકલ્પિક)'}>
                                <input
                                    type="text"
                                    placeholder="e.g. Bill #402, paid via UPI reference..."
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </Field>

                            <Field label={currentLang === 'en' ? 'Receipt / Bill Upload' : 'બિલ / રસીદ અપલોડ'}>
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleReceiptChange}
                                />
                            </Field>

                            {entry?.receipt_url && (
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px'}}>
                                    <a href={entry.receipt_url} target="_blank" rel="noreferrer" style={{color: '#0f766e', fontSize: '11.5px', fontWeight: 700}}>
                                        📄 View Existing Receipt
                                    </a>
                                    <label className="toggle" style={{fontSize: '11px', margin: 0}}>
                                        <input type="checkbox" checked={removeReceipt} onChange={e => setRemoveReceipt(e.target.checked)}/>
                                        <span/> Remove receipt
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 2: Beneficiary Scope ── */}
                    {step === 2 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">2</span>
                                <b>{currentLang === 'en' ? 'Beneficiary Scope' : 'આ ખર્ચ કોના માટે થયો છે?'}</b>
                            </div>

                            <div className="scope-pills-row">
                                <label className={`scope-pill-btn ${allocationScope === 'all' ? 'active' : ''}`}>
                                    <input type="radio" name="rnsk_alloc_scope" checked={allocationScope === 'all'} onChange={() => setAllocationScope('all')}/>
                                    <span>{currentLang === 'en' ? `All ${activeCompanies.length} Companies (Master %)` : `બધી કંપનીઓ (${activeCompanies.length} Master %)`}</span>
                                </label>
                                <label className={`scope-pill-btn ${allocationScope === 'two' ? 'active' : ''}`}>
                                    <input type="radio" name="rnsk_alloc_scope" checked={allocationScope === 'two'} onChange={() => {
                                        setAllocationScope('two');
                                        setSelectedBeneficiaries(prev => (prev.length >= 2 ? prev : activeCompanies.slice(0, 2).map(c => c.id)));
                                    }}/>
                                    <span>{currentLang === 'en' ? 'Select Specific Companies' : 'પસંદ કરેલ કંપનીઓ'}</span>
                                </label>
                                <label className={`scope-pill-btn ${allocationScope === 'single' ? 'active' : ''}`}>
                                    <input type="radio" name="rnsk_alloc_scope" checked={allocationScope === 'single'} onChange={() => setAllocationScope('single')}/>
                                    <span>{currentLang === 'en' ? '1 Company (100% Direct)' : '૧ કંપની (100% Direct)'}</span>
                                </label>
                            </div>

                            {allocationScope === 'two' && (
                                <div className="scope-sub-panel" style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px', padding: '10px'}}>
                                    <span className="sub-panel-label" style={{fontSize: '11.5px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px'}}>
                                        {currentLang === 'en' ? 'Select which companies share this expense (minimum 2):' : 'ખર્ચ વહેંચવા માટે કંપનીઓ પસંદ કરો (ઓછામાં ઓછી ૨):'}
                                    </span>
                                    <div className="companies-chips-list" style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                                        {activeCompanies.map(c => (
                                            <label key={c.id} className={`company-check-chip ${selectedBeneficiaries.includes(c.id) ? 'checked' : ''}`}>
                                                <input type="checkbox" checked={selectedBeneficiaries.includes(c.id)} onChange={() => toggleBeneficiary(c.id)}/>
                                                <span>{c.name} ({c.percentage}%)</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {allocationScope === 'single' && (
                                <div className="scope-sub-panel" style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px', padding: '10px'}}>
                                    <span className="sub-panel-label" style={{fontSize: '11.5px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px'}}>
                                        {currentLang === 'en' ? 'Which company incurred this expense directly?' : 'કઈ કંપનીનો ૧૦૦% ડાયરેક્ટ ખર્ચ છે?'}
                                    </span>
                                    <select value={singleBeneficiaryId} onChange={e => setSingleBeneficiaryId(e.target.value)} className="rnsk-company-select">
                                        {activeCompanies.map(c => <option key={c.id} value={c.id}>{c.name} (100% = ₹{number(parsedAmount)})</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Live share preview */}
                            <div className="wizard-alloc-preview">
                                <div style={{fontSize: '11px', fontWeight: 800, color: '#0f766e', marginBottom: '4px'}}>
                                    📊 {currentLang === 'en' ? 'Live Dynamic Allocation Share' : 'હિસ્સા મુજબ ભાગલા:'}
                                </div>
                                {previewAllocations.filter(r => r.shareAmount > 0).map(r => (
                                    <div key={r.id} className="wizard-alloc-row">
                                        <b style={{color: '#0f172a'}}>{r.name}</b>
                                        <span>{number(r.percentage)}% · <b style={{color: '#0f766e'}}>₹{number(r.shareAmount)}</b></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── STEP 3: Payer ── */}
                    {step === 3 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge green-badge">3</span>
                                <b>{currentLang === 'en' ? 'Who Paid the Bill?' : 'પૈસા કોણે ચૂકવ્યા? (Who Paid the Bill?)'}</b>
                            </div>

                            <div className="payer-mode-switch-group">
                                <label className={`payer-mode-pill ${payerMode === 'single' ? 'active' : ''}`}>
                                    <input type="radio" name="rnsk_payer_mode" checked={payerMode === 'single'} onChange={() => setPayerMode('single')}/>
                                    <span>{currentLang === 'en' ? '1 Company' : '૧ કંપનીએ પૂરા આપ્યા'}</span>
                                </label>
                                <label className={`payer-mode-pill ${payerMode === 'multiple' ? 'active' : ''}`}>
                                    <input type="radio" name="rnsk_payer_mode" checked={payerMode === 'multiple'} onChange={() => setPayerMode('multiple')}/>
                                    <span>{currentLang === 'en' ? 'Two or more companies' : 'બે કે વધુ કંપનીઓએ વહેંચીને'}</span>
                                </label>
                            </div>

                            {payerMode === 'single' ? (
                                <div className="single-payer-wrap" style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px', padding: '10px'}}>
                                    <span className="sub-panel-label" style={{fontSize: '11.5px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px'}}>
                                        {currentLang === 'en' ? 'Paying Company (ચૂકવનાર કંપની):' : 'ચૂકવનાર કંપની:'}
                                    </span>
                                    <select value={singlePayerId} onChange={e => setSinglePayerId(e.target.value)} className="rnsk-company-select">
                                        {activeCompanies.map(c => <option key={c.id} value={c.id}>{c.name} (100% = ₹{number(parsedAmount)})</option>)}
                                    </select>
                                </div>
                            ) : (
                                <div className="multiple-payers-wrap">
                                    <div className="split-action-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                        <span className="sub-panel-label" style={{fontSize: '11.5px', fontWeight: 700, color: '#334155'}}>
                                            {currentLang === 'en' ? 'Enter amount paid by each company:' : 'દરેક કંપનીએ ચૂકવેલ રકમ દાખલ કરો:'}
                                        </span>
                                        <button type="button" onClick={handleSplitEqually} className="quick-split-pill-btn" title="Divide equally">
                                            <Split size={13}/> <span>⚡ Split Equally</span>
                                        </button>
                                    </div>

                                    <div className="payers-grid-cards">
                                        {activeCompanies.map(c => {
                                            const isChecked = selectedPayers.includes(c.id);
                                            return (
                                                <div key={c.id} className={`payer-input-row-card ${isChecked ? 'active-payer' : ''}`}>
                                                    <label className="payer-chk-label">
                                                        <input type="checkbox" checked={isChecked} onChange={() => togglePayer(c.id)}/>
                                                        <span className="payer-name-text">{c.name}</span>
                                                    </label>
                                                    {isChecked && (
                                                        <div className="payer-amount-input-wrap">
                                                            <span>₹</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={payerAmounts[c.id] ?? ''}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setPayerAmounts(prev => ({...prev, [c.id]: val}));
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className={`split-validation-status-bar ${isPaidValid ? 'valid-status' : 'invalid-status'}`}>
                                        <span>{currentLang === 'en' ? 'Total Paid: ' : 'કુલ ચૂકવેલ: '}<b>₹{number(totalPaidSum)}</b> / ₹{number(parsedAmount)}</span>
                                        <span>
                                            {isPaidValid
                                                ? (currentLang === 'en' ? '✓ Amounts match perfectly' : '✓ રકમ પરફેક્ટ મેચ છે')
                                                : paidDiff > 0
                                                    ? (currentLang === 'en' ? `Pending ₹${number(paidDiff)} payable` : `બાકી ₹${number(paidDiff)} ચૂકવવાના છે`)
                                                    : (currentLang === 'en' ? `₹${number(Math.abs(paidDiff))} excess entered` : `₹${number(Math.abs(paidDiff))} વધારે લખાયા છે`)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 4: Confirm Preview ── */}
                    {step === 4 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <Sparkles size={15} style={{color: '#d97706'}}/>
                                <b>{currentLang === 'en' ? 'Confirm & Submit — Review Details' : 'ખાતરી કરો અને સેવ કરો'}</b>
                            </div>

                            {/* Summary card */}
                            <div className="confirm-summary-card">
                                <div className="confirm-summary-row"><span>{currentLang === 'en' ? '📅 Date' : '📅 તારીખ'}</span><b>{expenseDate}</b></div>
                                <div className="confirm-summary-row highlight-row">
                                    <span>{currentLang === 'en' ? '💰 Total Amount' : '💰 કુલ રકમ'}</span>
                                    <div>
                                        <b style={{fontSize: '17px', color: '#15803d'}}>₹{number(parsedAmount)}</b>
                                        {amountWord && <small style={{color: '#16a34a', display: 'block'}}>{amountWord}</small>}
                                    </div>
                                </div>
                                <div className="confirm-summary-row"><span>{currentLang === 'en' ? '👤 Purchaser' : '👤 ખર્ચ કરનાર'}</span><b>{purchaserName}</b></div>
                                <div className="confirm-summary-row"><span>{currentLang === 'en' ? '📝 Description' : '📝 ખર્ચ વિગત'}</span><b>{description}</b></div>
                                <div className="confirm-summary-row"><span>{currentLang === 'en' ? '🏢 Scope' : '🏢 ભાગીદારી Scope'}</span><b>{scopeLabel}</b></div>
                                <div className="confirm-summary-row"><span>{currentLang === 'en' ? '💳 Paid By' : '💳 ચૂકવનાર'}</span><b>{payerLabel}</b></div>
                            </div>

                            {/* Live allocation preview */}
                            <div className="wizard-step-title" style={{marginTop: '10px'}}>
                                <span style={{fontSize: '12px', fontWeight: 700, color: '#64748b'}}>{currentLang === 'en' ? '📊 Company-wise Share & Net Balance:' : '📊 કંપની મુજબ હિસ્સો & લેતી-દેતી:'}</span>
                            </div>
                            <div className="preview-alloc-cards-list">
                                {previewAllocations.filter(row => row.shareAmount > 0 || (previewPaidMap[row.id] || 0) > 0).map(row => {
                                    const paid = previewPaidMap[row.id] || 0;
                                    const share = row.shareAmount || 0;
                                    const net = Number((paid - share).toFixed(2));
                                    const netText = net > 0.001
                                        ? (currentLang === 'en' ? `+₹${number(net)} (Receivable)` : `+₹${number(net)} (લેવાના)`)
                                        : net < -0.001
                                            ? (currentLang === 'en' ? `-₹${number(Math.abs(net))} (Payable)` : `-₹${number(Math.abs(net))} (દેવાના)`)
                                            : (currentLang === 'en' ? '₹0.00 (Settled)' : '₹0.00 (સરભર)');
                                    const netClass = net > 0.001 ? 'net-receivable' : net < -0.001 ? 'net-payable' : 'net-even';
                                    return (
                                        <div key={row.id} className="preview-alloc-row-card">
                                            <div className="alloc-comp-name">
                                                <b>{row.name}</b>
                                                <small>({number(row.percentage)}%)</small>
                                            </div>
                                            <div className="alloc-amounts-col">
                                                <span>{currentLang === 'en' ? 'Paid: ' : 'ચૂકવ્યા: '}<b>₹{number(paid)}</b></span>
                                                <span>{currentLang === 'en' ? 'Share: ' : 'હિસ્સો: '}<b>₹{number(share)}</b></span>
                                            </div>
                                            <span className={`net-status-badge ${netClass}`}>{netText}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {error && <div className="error" style={{marginTop: '8px'}}>{error}</div>}
                        </div>
                    )}

                    {error && step !== 4 && <div className="error" style={{marginTop: '8px'}}>{error}</div>}
                </div>

                {/* Sticky Footer Navigation */}
                <div className="modal-sticky-footer expense-wizard-footer">
                    {step > 1 ? (
                        <button type="button" className="secondary modal-cancel-btn" onClick={() => setStep(s => s - 1)}>
                            ← Back
                        </button>
                    ) : (
                        <button type="button" className="secondary modal-cancel-btn" onClick={onClose}>
                            {currentLang === 'en' ? 'Cancel' : 'રદ કરો'}
                        </button>
                    )}

                    <div className="step-dots">
                        {[1, 2, 3, 4].map(s => (
                            <span key={s} className={`step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}/>
                        ))}
                    </div>

                    {step < 4 ? (
                        <button
                            type="button"
                            className="primary expense-submit-btn"
                            disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid) || (step === 3 && !step3Valid)}
                            onClick={() => setStep(s => s + 1)}
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="primary expense-submit-btn"
                            disabled={busy || (payerMode === 'multiple' && !isPaidValid)}
                        >
                            {busy ? (currentLang === 'en' ? 'Saving...' : 'સેવ થઈ રહ્યું છે...') : entry ? '✓ Update Expense' : (currentLang === 'en' ? '✓ Save RNSK Expense' : '✓ RNSK ખર્ચ સેવ કરો')}
                        </button>
                    )}
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

// ── MODAL 3: Configure RNSK Dynamic Companies & % Split (Elevated SaaS Design) ──
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
        return Number(companies
            .filter(c => c.active)
            .reduce((sum, c) => sum + (parseFloat(c.percentage) || 0), 0)
            .toFixed(2));
    }, [companies]);

    const activeCount = useMemo(() => companies.filter(c => c.active).length, [companies]);
    const isValid = Math.abs(totalPct - 100) < 0.01 && activeCount > 0;
    const diffTo100 = Number((100 - totalPct).toFixed(2));

    const addCompany = () => {
        setCompanies(prev => [...prev, {id: null, name: '', percentage: '', active: true}]);
    };

    const removeCompany = (idx) => {
        if (companies.length <= 1) return;
        setCompanies(prev => prev.filter((_, i) => i !== idx));
    };

    const toggleActive = (idx) => {
        setCompanies(prev => prev.map((c, i) => i === idx ? {...c, active: !c.active} : c));
    };

    // 1-Click: Divide 100% equally among all active companies
    const handleEqualizeAll = () => {
        const activeIndices = [];
        companies.forEach((c, i) => { if (c.active) activeIndices.push(i); });
        if (!activeIndices.length) return;
        const count = activeIndices.length;
        const each = Number((100 / count).toFixed(2));
        let running = 0;
        setCompanies(prev => {
            return prev.map((c, i) => {
                if (!c.active) return c;
                const idxInActive = activeIndices.indexOf(i);
                if (idxInActive === count - 1) {
                    return { ...c, percentage: String(Number((100 - running).toFixed(2))) };
                }
                running += each;
                return { ...c, percentage: String(each) };
            });
        });
    };

    // 1-Click: Add remainder to the last active company
    const handleFillRemaining = () => {
        if (diffTo100 <= 0) return;
        const lastActiveIndex = [...companies].map((c, i) => ({...c, origIdx: i})).reverse().find(c => c.active)?.origIdx;
        if (lastActiveIndex === undefined) return;
        setCompanies(prev => prev.map((c, i) => {
            if (i === lastActiveIndex) {
                const cur = parseFloat(c.percentage) || 0;
                return {...c, percentage: String(Number((cur + diffTo100).toFixed(2)))};
            }
            return c;
        }));
    };

    const save = async (e) => {
        e.preventDefault();
        if (!isValid) {
            setError(`Total active percentage must equal exactly 100%. Current sum: ${totalPct.toFixed(2)}%`);
            return;
        }
        const hasEmptyNames = companies.some(c => !c.name.trim());
        if (hasEmptyNames) {
            setError(currentLang === 'en' ? 'Please provide names for all partner companies.' : 'કૃપા કરીને બધી ભાગીદાર કંપનીઓના નામ દાખલ કરો.');
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
            await onSaved(currentLang === 'en' ? 'RNSK companies and percentages saved successfully.' : 'RNSK કંપનીઓ અને ટકાવારી હિસ્સો સફળતાપૂર્વક સેવ થયો.');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal modal-sheet rnsk-config-modal" onSubmit={save} onClick={e => e.stopPropagation()}>
                <div className="mobile-modal-handle-bar"/>

                <div className="panel-head">
                    <div>
                        <h2>{currentLang === 'en' ? '🏢 Configure RNSK Partner Companies' : '🏢 RNSK ભાગીદાર કંપનીઓ & ટકાવારી હિસ્સો'}</h2>
                        <p>{currentLang === 'en' ? 'Set dynamic partner companies & exact allocation % (Total must equal 100.00%).' : 'ભાગીદાર કંપનીઓ ઉમેરો અને દરેકનો ખર્ચ હિસ્સો % સેટ કરો (કુલ સરવાળો ૧૦૦.૦૦% હોવો ફરજિયાત છે).'}</p>
                    </div>
                    <button type="button" className="icon-button ghost modal-close-chip" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{maxHeight: '66vh', overflowY: 'auto', padding: '14px 16px'}}>
                    {error && <div className="error" style={{marginBottom: '12px'}}>{error}</div>}

                    {/* ── Allocation Meter Card ── */}
                    <div className="rnsk-meter-box">
                        <div className="rnsk-meter-header">
                            <div>
                                <span className="rnsk-meter-label">{currentLang === 'en' ? 'Active Allocation Total' : 'કુલ સક્રિય ભાગલા %'}</span>
                                <div className="rnsk-meter-val">{totalPct.toFixed(2)}% <span style={{fontSize: '13px', color: '#64748b', fontWeight: 600}}>/ 100.00%</span></div>
                            </div>
                            <span className={`rnsk-meter-badge ${isValid ? 'valid' : diffTo100 > 0 ? 'remaining' : 'excess'}`}>
                                {isValid
                                    ? (currentLang === 'en' ? '✓ 100.00% Perfect' : '✓ પરફેક્ટ ૧૦૦% તૈયાર')
                                    : diffTo100 > 0
                                        ? (currentLang === 'en' ? `⚠️ ${diffTo100.toFixed(2)}% Remaining` : `⚠️ ${diffTo100.toFixed(2)}% બાકી છે`)
                                        : (currentLang === 'en' ? `⚠️ ${Math.abs(diffTo100).toFixed(2)}% Excess` : `⚠️ ${Math.abs(diffTo100).toFixed(2)}% વધારે છે`)}
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="rnsk-meter-track">
                            <div
                                className="rnsk-meter-fill"
                                style={{
                                    width: `${Math.min(100, Math.max(0, totalPct))}%`,
                                    background: isValid ? '#10b981' : diffTo100 > 0 ? '#f59e0b' : '#ef4444'
                                }}
                            />
                        </div>

                        {/* 1-Click Quick Helpers */}
                        <div className="rnsk-quick-helpers">
                            <span style={{fontSize: '11px', fontWeight: 700, color: '#64748b', marginRight: '2px'}}>
                                {currentLang === 'en' ? 'Quick Tools:' : 'ઝડપી સાધનો:'}
                            </span>
                            <button
                                type="button"
                                className="rnsk-helper-btn"
                                onClick={handleEqualizeAll}
                                title="Divide 100% equally among all active companies"
                            >
                                <Zap size={12} style={{color: '#0f766e'}}/>
                                <span>{currentLang === 'en' ? '⚡ Split Equally (બધાને સરખા %)' : '⚡ બધાને સરખા % (Equalize)'}</span>
                            </button>
                            {diffTo100 > 0 && (
                                <button
                                    type="button"
                                    className="rnsk-helper-btn"
                                    onClick={handleFillRemaining}
                                    title={`Add remaining ${diffTo100.toFixed(2)}% to last company`}
                                >
                                    <Sparkles size={12} style={{color: '#d97706'}}/>
                                    <span>+{diffTo100.toFixed(2)}% {currentLang === 'en' ? 'Fill Remainder' : 'બાકીના ઉમેરો'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Dynamic Companies List ── */}
                    <div style={{fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '6px', display: 'flex', justifyContent: 'space-between'}}>
                        <span>{currentLang === 'en' ? `Partner Companies (${companies.length}):` : `ભાગીદાર કંપનીઓ (${companies.length}):`}</span>
                        <span style={{color: '#0f766e'}}>{activeCount} Active</span>
                    </div>

                    <div className="rnsk-companies-stack">
                        {companies.map((comp, idx) => (
                            <div key={idx} className={`rnsk-company-card-item ${!comp.active ? 'inactive' : ''}`}>
                                <div className="rnsk-comp-num-badge">
                                    {String(idx + 1).padStart(2, '0')}
                                </div>

                                <input
                                    type="text"
                                    className="rnsk-comp-name-input"
                                    placeholder={currentLang === 'en' ? 'Company Name (e.g. Solar Tech LLP)' : 'કંપનીનું નામ (દા.ત. સોલાર ટેક)'}
                                    value={comp.name}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setCompanies(prev => prev.map((c, i) => i === idx ? {...c, name: val} : c));
                                    }}
                                    required
                                />

                                <div className="rnsk-comp-pct-wrap">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        placeholder="0.00"
                                        className="rnsk-comp-pct-input"
                                        value={comp.percentage}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setCompanies(prev => prev.map((c, i) => i === idx ? {...c, percentage: val} : c));
                                        }}
                                        required
                                    />
                                    <span className="rnsk-comp-pct-symbol">%</span>
                                </div>

                                <button
                                    type="button"
                                    className={`rnsk-comp-active-pill ${comp.active ? 'active' : 'inactive'}`}
                                    onClick={() => toggleActive(idx)}
                                    title={comp.active ? 'Click to deactivate' : 'Click to activate'}
                                >
                                    {comp.active ? (currentLang === 'en' ? 'Active' : 'સક્રિય') : (currentLang === 'en' ? 'Inactive' : 'નિષ્ક્રિય')}
                                </button>

                                <button
                                    type="button"
                                    className="rnsk-comp-del-btn"
                                    onClick={() => removeCompany(idx)}
                                    disabled={companies.length <= 1}
                                    title="Remove company"
                                >
                                    <Trash2 size={15}/>
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add Another Company Button */}
                    <button
                        type="button"
                        onClick={addCompany}
                        className="rnsk-add-comp-btn"
                    >
                        <Plus size={14}/> <span>{currentLang === 'en' ? '+ Add Another Partner Company' : '+ નવી ભાગીદાર કંપની ઉમેરો'}</span>
                    </button>

                    <div style={{
                        marginTop: '12px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: '#64748b',
                        lineHeight: 1.4
                    }}>
                        💡 <b>{currentLang === 'en' ? 'How it works: ' : 'માહિતી: '}</b>
                        {currentLang === 'en'
                            ? 'Every expense added in RNSK will automatically be divided among these companies according to their % weight. Balances & settlements are tracked dynamically.'
                            : 'RNSK માં નોંધાતો દરેક ખર્ચ આપમેળે આ સેટ કરેલ % મુજબ કંપનીઓ વચ્ચે વહેંચાશે. કુલ સરવાળો ૧૦૦.૦૦% રહેવો જરૂરી છે.'}
                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="modal-sticky-footer" style={{padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', background: '#f8fafc'}}>
                    <button type="button" className="secondary" onClick={onClose} style={{height: '36px', fontSize: '12px'}}>
                        {currentLang === 'en' ? 'Cancel' : 'રદ કરો'}
                    </button>
                    <button
                        type="submit"
                        className="primary"
                        disabled={!isValid || busy}
                        style={{height: '36px', fontSize: '12px'}}
                    >
                        {busy ? (currentLang === 'en' ? 'Saving...' : 'સેવ થઈ રહ્યું છે...') : (currentLang === 'en' ? '✓ Save Configuration' : '✓ સેવ કરો')}
                    </button>
                </div>
            </form>
        </div>
    );
}
