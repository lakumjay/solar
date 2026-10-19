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
    const PAGE_SIZE = 6;

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

        return allEntries.filter(entry => {
            if (cleanNumQ && !isNaN(cleanNumQ)) {
                if (String(entry.amount || '').includes(cleanNumQ)) return true;
                if ((entry.allocations || []).some(a => String(a.amount || '').includes(cleanNumQ))) return true;
            }
            const desc = (entry.description || '').toLowerCase();
            const notes = (entry.notes || '').toLowerCase();
            const purchaser = (entry.purchaser_name || '').toLowerCase();
            const payer = (entry.payer_company?.name || '').toLowerCase();
            const fromC = (entry.from_company?.name || '').toLowerCase();
            const toC = (entry.to_company?.name || '').toLowerCase();
            return desc.includes(rawQ) || notes.includes(rawQ) || purchaser.includes(rawQ) || payer.includes(rawQ) || fromC.includes(rawQ) || toC.includes(rawQ);
        });
    }, [allEntries, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedEntries = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filteredEntries.slice(start, start + PAGE_SIZE);
    }, [filteredEntries, safePage]);

    if (!data && !error) return <Loading/>;
    if (!data) return <Empty title="Could not load RNSK expenses" detail={error}/>;

    const summary = data.summary;
    const canManage = data.can_manage;

    return (
        <div className="expenses-page rnsk-expenses-page">
            {/* Header Metrics */}
            <div className="cards expense-summary-cards">
                <Metric icon={IndianRupee} title={currentLang === 'en' ? 'Total RNSK Pool' : 'કુલ RNSK ખર્ચ પૂલ'} value={data.gujarati_summary?.total_spent ?? 0} unit="INR" color="blue"/>
                <Metric icon={Scale} title={currentLang === 'en' ? 'Total Outstanding' : 'કુલ લેતી-દેતી બાકી'} value={summary.total_outstanding} unit="INR" color="amber"/>
                <Metric icon={CheckCircle2} title={currentLang === 'en' ? 'Open Pairs' : 'પેન્ડિંગ કંપની જોડ'} value={summary.open_pairs} unit="pairs"/>
                <Metric icon={ReceiptIndianRupee} title={currentLang === 'en' ? 'Total Transactions' : 'કુલ એન્ટ્રીઓ'} value={summary.entries} unit="entries"/>
            </div>

            {message && <div className="success" style={{marginBottom: '12px'}}>{message}</div>}
            {error && <div className="error" style={{marginBottom: '12px'}}>{error}</div>}

            {/* Dynamic Configuration Banner Alert */}
            {!data.settings.configured && (
                <div className="error" style={{marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
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

            {/* 🏢 Gujarati Company Investment & Percentage Summary Cards */}
            {data?.gujarati_summary && (
                <section className="panel" style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    marginBottom: '16px',
                    boxShadow: '0 3px 12px rgba(2, 132, 199, 0.05)'
                }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', borderBottom: '1px solid #e0f2fe', paddingBottom: '10px'}}>
                        <div>
                            <h2 style={{margin: 0, fontSize: '16px', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <Split size={18} style={{color: '#0284c7'}}/>
                                <span>{currentLang === 'en' ? 'RNSK Partner Companies & Ownership %' : 'RNSK ભાગીદાર કંપનીઓ & ટકાવારી હિસ્સો'}</span>
                            </h2>
                            <p style={{margin: '3px 0 0', fontSize: '12px', color: '#64748b'}}>
                                {currentLang === 'en' ? 'Dynamic cost sharing and settlement calculation for RNSK projects.' : 'RNSK ખર્ચા માટે નક્કી કરેલ ડાયનેમિક % મુજબ દરેક કંપનીનો હિસ્સો અને બાકી લેતી-દેતી.'}
                            </p>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            {canManage && (
                                <button type="button" className="secondary" onClick={() => setShowConfigModal(true)} style={{padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                    <Settings2 size={14}/> <span>{currentLang === 'en' ? 'Manage % Split' : 'કંપની % સેટિંગ્સ'}</span>
                                </button>
                            )}
                            <div style={{
                                background: '#e0f2fe',
                                border: '1px solid #7dd3fc',
                                borderRadius: '10px',
                                padding: '6px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end'
                            }}>
                                <span style={{fontSize: '10px', fontWeight: 700, color: '#0369a1'}}>RNSK POOL TOTAL</span>
                                <strong style={{fontSize: '17px', fontWeight: 900, color: '#0c4a6e'}}>₹{data.gujarati_summary.total_spent_formatted}</strong>
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Company Cards Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '12px',
                        marginBottom: '14px'
                    }}>
                        {(data.gujarati_summary.companies || []).map(comp => {
                            const isReceivable = comp.status_type === 'receivable';
                            const isPayable = comp.status_type === 'payable';
                            const themeBg = isReceivable ? '#f0fdf4' : isPayable ? '#fef2f2' : '#ffffff';
                            const themeBorder = isReceivable ? '#86efac' : isPayable ? '#fca5a5' : '#cbd5e1';
                            const badgeColor = isReceivable ? '#15803d' : isPayable ? '#b91c1c' : '#475569';
                            const badgeBg = isReceivable ? '#dcfce7' : isPayable ? '#fee2e2' : '#f1f5f9';

                            return (
                                <div key={comp.company_id} style={{
                                    background: themeBg,
                                    border: `1.5px solid ${themeBorder}`,
                                    borderRadius: '12px',
                                    padding: '12px 14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px'}}>
                                        <div>
                                            <b style={{fontSize: '14px', color: '#0f172a'}}>{comp.name}</b>
                                            <div style={{fontSize: '11px', color: '#0284c7', fontWeight: 700}}>
                                                {currentLang === 'en' ? 'Share: ' : 'હિસ્સો: '} {comp.percentage}%
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '10.5px',
                                            fontWeight: 800,
                                            background: badgeBg,
                                            color: badgeColor,
                                            padding: '3px 8px',
                                            borderRadius: '6px'
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
                                        border: '1px solid rgba(0,0,0,0.06)'
                                    }}>
                                        <div>
                                            <span style={{fontSize: '10px', color: '#64748b', display: 'block'}}>{currentLang === 'en' ? 'Total Paid' : 'ચૂકવેલ રકમ'}</span>
                                            <strong style={{fontSize: '13px', color: '#0f172a'}}>₹{comp.total_paid_formatted}</strong>
                                        </div>
                                        <div>
                                            <span style={{fontSize: '10px', color: '#64748b', display: 'block'}}>{currentLang === 'en' ? 'Fair Share' : 'બનતો હિસ્સો'}</span>
                                            <strong style={{fontSize: '13px', color: '#334155'}}>₹{comp.fair_share_formatted}</strong>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pending Settlements Gujarati Sentences */}
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
                            <b style={{fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                <span>📌</span> {currentLang === 'en' ? 'Pending Settlements (Who pays whom):' : 'પેન્ડિંગ ચૂકવણી વિગત (કોણે કોને કેટલા આપવાના છે):'}
                            </b>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                {data.gujarati_summary.pending_settlements.map((ps, idx) => (
                                    <div key={idx} style={{fontSize: '12px', color: '#78350f', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                        <span>👉</span>
                                        <span>{ps.sentence_gu}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Toolbar: Date Filters, Company Filter, Export PDF & Add Expense */}
            <section className="panel expense-toolbar-card">
                <div className="expense-toolbar-main">
                    <div className="date-input-group">
                        <div className="custom-date-box">
                            <span className="date-box-lbl">{currentLang === 'en' ? 'From' : 'ક્યારથી'}</span>
                            <div className="date-field-wrap">
                                <Calendar size={14} className="date-icon"/>
                                <input
                                    type="date"
                                    min={data?.min_date || '2026-08-01'}
                                    max={to || data?.max_date || today()}
                                    value={from}
                                    onChange={e => setFrom(e.target.value)}
                                    className="modern-date-input"
                                />
                            </div>
                        </div>

                        <div className="custom-date-box">
                            <span className="date-box-lbl">{currentLang === 'en' ? 'To' : 'ક્યાં સુધી'}</span>
                            <div className="date-field-wrap">
                                <Calendar size={14} className="date-icon"/>
                                <input
                                    type="date"
                                    min={from || data?.min_date || '2026-08-01'}
                                    max={data?.max_date || today()}
                                    value={to}
                                    onChange={e => setTo(e.target.value)}
                                    className="modern-date-input"
                                />
                            </div>
                        </div>

                        <div className="custom-date-box company-filter-box">
                            <span className="date-box-lbl">{currentLang === 'en' ? 'Company' : 'કંપની'}</span>
                            <select
                                value={selectedCompany}
                                onChange={e => { setSelectedCompany(e.target.value); setCurrentPage(1); }}
                                className="modern-company-select"
                            >
                                <option value="">{currentLang === 'en' ? 'All Companies' : 'બધી કંપનીઓ (All)'}</option>
                                {(data.settings.companies || []).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <button className="primary apply-filter-btn" onClick={load}>
                            {currentLang === 'en' ? 'Apply' : 'લાગુ કરો'}
                        </button>
                    </div>

                    <div className="expense-toolbar-actions">
                        <a
                            className="secondary export-btn pdf-btn"
                            href={`${getApiBaseUrl().base}rnsk-expenses/export/pdf?date_from=${from}&date_to=${to}${selectedCompany ? `&company_id=${selectedCompany}` : ''}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <FileText size={15}/>
                            <span>{currentLang === 'en' ? 'Export PDF' : 'પીડીએફ રિપોર્ટ'}</span>
                        </a>
                        {canManage && (
                            <button
                                className="primary add-exp-btn"
                                disabled={!data.settings.configured}
                                onClick={() => setExpenseForm({})}
                                style={{background: '#0284c7', borderColor: '#0284c7'}}
                            >
                                <Plus size={15}/> <span>Add RNSK Expense</span>
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Company Balances & Settlement Pairs */}
            <section className="panel">
                <div className="panel-head">
                    <div>
                        <h2>{currentLang === 'en' ? 'RNSK Company Balances & Outstanding' : 'RNSK કંપની લેતી-દેતી બાકી રકમ'}</h2>
                        <p>{currentLang === 'en' ? 'Purchases are divided automatically by dynamic %. Settle open balances directly below.' : 'ખર્ચા આપમેળે ભાગીદારી % મુજબ વહેંચાય છે. બાકી રકમ સીધી સેટલ કરો.'}</p>
                    </div>
                </div>
                {displayBalances.length ? (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>{currentLang === 'en' ? 'Companies' : 'કંપનીઓ'}</th>
                                    <th>{currentLang === 'en' ? 'Current Position' : 'વર્તમાન સ્થિતિ'}</th>
                                    <th>{currentLang === 'en' ? 'Amount' : 'રકમ'}</th>
                                    <th>{currentLang === 'en' ? 'Status' : 'સ્ટેટસ'}</th>
                                    {canManage && <th/>}
                                </tr>
                            </thead>
                            <tbody>
                                {displayBalances.map(pair => (
                                    <tr key={pair.key}>
                                        <td className="strong">{pair.first_company.name} ↔ {pair.second_company.name}</td>
                                        <td>
                                            {pair.status === 'cleared'
                                                ? <span style={{color: '#64748b'}}>No amount pending (સરભર)</span>
                                                : <span><b>{pair.debtor_company.name}</b> pays <b>{pair.creditor_company.name}</b></span>}
                                        </td>
                                        <td className="strong" style={{color: pair.status === 'cleared' ? '#64748b' : '#b91c1c'}}>
                                            ₹{number(pair.amount)}
                                        </td>
                                        <td>
                                            <span className={`status ${pair.status === 'cleared' ? 'success' : 'warning'}`}>
                                                {pair.status === 'cleared' ? 'Cleared' : 'Open'}
                                            </span>
                                        </td>
                                        {canManage && (
                                            <td style={{textAlign: 'right'}}>
                                                {pair.status !== 'cleared' && (
                                                    <button
                                                        type="button"
                                                        className="secondary"
                                                        onClick={() => setSettlement(pair)}
                                                        style={{padding: '5px 12px', fontSize: '12px', borderRadius: '6px', fontWeight: 700}}
                                                    >
                                                        Settle Balance
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
                    <Empty title="No open balance pairs" detail="All RNSK company accounts are balanced."/>
                )}
            </section>

            {/* Daily Expense Ledger */}
            <section className="panel">
                <div className="panel-head" style={{alignItems: 'center', marginBottom: '14px'}}>
                    <div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                            <h2 style={{margin: 0}}>RNSK Daily Expense Ledger</h2>
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
                        <p style={{margin: '4px 0 0'}}>Dynamic % allocations, reversals, and settlements from {shortDate(from)} to {shortDate(to)}.</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap'}}>
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
                    }}>
                        <Search size={15} style={{color: '#64748b', flexShrink: 0}}/>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={currentLang === 'en' ? 'Search description, company, amount...' : 'નામ, વિગત, કંપની, રકમ શોધો...'}
                            style={{flex: 1, border: 'none', outline: 'none', fontSize: '13px', background: 'transparent'}}
                        />
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery('')} style={{border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8'}}>
                                <X size={14}/>
                            </button>
                        )}
                    </div>
                </div>

                {/* Ledger Table */}
                {paginatedEntries.length ? (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description & Purchaser</th>
                                    <th>Payer Company</th>
                                    <th>Total Amount</th>
                                    <th>Allocations (% Split)</th>
                                    {canManage && <th/>}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedEntries.map(entry => (
                                    <tr key={`${entry.type}-${entry.id}`}>
                                        <td className="strong">{shortDate(entry.date)}</td>
                                        <td>
                                            <div style={{fontWeight: 700, color: '#0f172a'}}>{entry.description}</div>
                                            {entry.purchaser_name && (
                                                <div style={{fontSize: '11px', color: '#64748b'}}>By: {entry.purchaser_name}</div>
                                            )}
                                            {entry.notes && (
                                                <div style={{fontSize: '11px', color: '#94a3b8'}}>{entry.notes}</div>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{fontWeight: 700, color: '#0284c7'}}>
                                                {entry.payer_company?.name || (entry.from_company?.name ? `${entry.from_company?.name} → ${entry.to_company?.name}` : 'N/A')}
                                            </span>
                                            {entry.type === 'settlement' && (
                                                <span className="status success" style={{marginLeft: '6px', fontSize: '10px', padding: '1px 6px'}}>Settlement</span>
                                            )}
                                        </td>
                                        <td className="strong" style={{fontSize: '14px', color: entry.type === 'settlement' ? '#166534' : '#0f172a'}}>
                                            ₹{number(entry.amount)}
                                        </td>
                                        <td>
                                            {entry.type === 'expense' && entry.allocations ? (
                                                <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                                                    {entry.allocations.map(a => (
                                                        <div key={a.id} style={{fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#475569'}}>
                                                            <span>{a.company?.name}:</span>
                                                            <b style={{color: '#0f172a'}}>₹{number(a.amount)} ({a.percentage}%)</b>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{fontSize: '11.5px', color: '#166534'}}>
                                                    Payment Mode: {entry.payment_mode || 'Bank Transfer'}
                                                </span>
                                            )}
                                        </td>
                                        {canManage && (
                                            <td style={{textAlign: 'right'}}>
                                                <div style={{display: 'flex', gap: '6px', justifyContent: 'flex-end'}}>
                                                    {entry.type === 'expense' && entry.can_edit && (
                                                        <button type="button" className="icon-button" onClick={() => setExpenseForm(entry)} title="Edit">
                                                            <PencilLine size={14}/>
                                                        </button>
                                                    )}
                                                    {entry.type === 'expense' && entry.can_reverse && (
                                                        <button type="button" className="icon-button" onClick={() => action(entry, 'reverse')} title="Reverse">
                                                            <RotateCcw size={14}/>
                                                        </button>
                                                    )}
                                                    {entry.type === 'expense' && entry.can_cancel && (
                                                        <button type="button" className="icon-button" onClick={() => action(entry, 'cancel')} title="Cancel">
                                                            <X size={14}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty title="No RNSK expenses found" detail="No entries match your selected date range or search."/>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px'}}>
                        <button type="button" className="secondary" disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                            Previous
                        </button>
                        <span style={{fontSize: '12px', fontWeight: 700}}>Page {safePage} of {totalPages}</span>
                        <button type="button" className="secondary" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                            Next
                        </button>
                    </div>
                )}
            </section>

            {/* Modals */}
            {showConfigModal && (
                <RnskConfigModal
                    settings={data.settings}
                    onClose={() => setShowConfigModal(false)}
                    onSaved={completed}
                    currentLang={currentLang}
                />
            )}

            {expenseForm && (
                <RnskExpenseModal
                    entry={expenseForm.id ? expenseForm : null}
                    companies={data.settings.companies || []}
                    onClose={() => setExpenseForm(null)}
                    onSaved={completed}
                    currentLang={currentLang}
                />
            )}

            {settlement && (
                <RnskSettlementModal
                    pair={settlement}
                    onClose={() => setSettlement(null)}
                    onSaved={completed}
                    currentLang={currentLang}
                />
            )}
        </div>
    );
}

// ── MODAL 1: Dynamic RNSK Companies & % Split Configuration ──
function RnskConfigModal({settings, onClose, onSaved, currentLang}) {
    const [companies, setCompanies] = useState(() => {
        if (settings.companies && settings.companies.length > 0) {
            return settings.companies.map(c => ({
                id: c.id,
                name: c.name,
                percentage: String(c.expense_percentage),
                active: c.active !== false,
            }));
        }
        return [
            {id: null, name: 'Company 1', percentage: '50.00', active: true},
            {id: null, name: 'Company 2', percentage: '50.00', active: true},
        ];
    });

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const addCompany = () => {
        setCompanies(prev => [
            ...prev,
            {id: null, name: `Company ${prev.length + 1}`, percentage: '0.00', active: true}
        ]);
    };

    const removeCompany = (idx) => {
        if (companies.length <= 1) return;
        setCompanies(prev => prev.filter((_, i) => i !== idx));
    };

    const totalPct = companies.filter(c => c.active).reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);
    const isValid = Math.abs(totalPct - 100) < 0.01;

    const save = async (e) => {
        e.preventDefault();
        if (!isValid) {
            setError(`Percentages must total exactly 100%. Current sum: ${totalPct.toFixed(2)}%`);
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
            <form className="modal modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '560px'}}>
                <div className="panel-head">
                    <div>
                        <h2>{currentLang === 'en' ? 'Configure RNSK Companies & %' : 'RNSK કંપનીઓ અને % ભાગીદારી'}</h2>
                        <p>Add dynamic companies and set their % split (Must total 100%).</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{maxHeight: '65vh', overflowY: 'auto', padding: '12px 16px'}}>
                    {error && <div className="error" style={{marginBottom: '10px'}}>{error}</div>}

                    <div style={{
                        background: isValid ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${isValid ? '#86efac' : '#fca5a5'}`,
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <span style={{fontSize: '11px', color: '#64748b', fontWeight: 700}}>TOTAL ALLOCATION</span>
                            <div style={{fontSize: '18px', fontWeight: 800, color: isValid ? '#166534' : '#991b1b'}}>
                                {totalPct.toFixed(2)}%
                            </div>
                        </div>
                        <span style={{fontSize: '12px', fontWeight: 700, color: isValid ? '#15803d' : '#b91c1c'}}>
                            {isValid ? '✓ Ready to save (100%)' : '⚠️ Must total 100%'}
                        </span>
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {companies.map((comp, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '8px 10px'
                            }}>
                                <input
                                    type="text"
                                    placeholder="Company Name"
                                    value={comp.name}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setCompanies(prev => prev.map((c, i) => i === idx ? {...c, name: val} : c));
                                    }}
                                    style={{flex: 2, padding: '6px 10px', fontSize: '13px'}}
                                    required
                                />
                                <div style={{display: 'flex', alignItems: 'center', gap: '4px', flex: 1}}>
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
                                        style={{width: '75px', padding: '6px 8px', fontSize: '13px', textAlign: 'right'}}
                                        required
                                    />
                                    <span style={{fontSize: '13px', fontWeight: 700, color: '#64748b'}}>%</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeCompany(idx)}
                                    title="Remove company"
                                    style={{border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px'}}
                                >
                                    <Trash2 size={16}/>
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addCompany}
                        className="secondary"
                        style={{marginTop: '12px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '8px'}}
                    >
                        <Plus size={14}/> <span>Add Another Company</span>
                    </button>
                </div>

                <div className="modal-actions" style={{padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                    <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="primary" disabled={!isValid || busy} style={{background: '#0284c7', borderColor: '#0284c7'}}>
                        {busy ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── MODAL 2: Add / Edit RNSK Expense ──
function RnskExpenseModal({entry, companies, onClose, onSaved, currentLang}) {
    const [expenseDate, setExpenseDate] = useState(entry?.date || today());
    const [payerCompanyId, setPayerCompanyId] = useState(String(entry?.payer_company?.id || companies[0]?.id || ''));
    const [purchaserName, setPurchaserName] = useState(entry?.purchaser_name || '');
    const [description, setDescription] = useState(entry?.description || '');
    const [amount, setAmount] = useState(entry?.amount ? String(entry.amount) : '');
    const [notes, setNotes] = useState(entry?.notes || '');
    const [receipt, setReceipt] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const parsedAmount = Number(amount) || 0;

    const allocationsPreview = useMemo(() => {
        return companies.map(c => {
            const pct = Number(c.expense_percentage) || 0;
            const share = (parsedAmount * pct) / 100;
            return {
                id: c.id,
                name: c.name,
                percentage: pct,
                shareAmount: Number(share.toFixed(2))
            };
        });
    }, [companies, parsedAmount]);

    const save = async (e) => {
        e.preventDefault();
        if (parsedAmount <= 0) {
            setError('Enter a valid amount.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const fd = new FormData();
            fd.append('expense_date', expenseDate);
            fd.append('payer_company_id', payerCompanyId);
            fd.append('purchaser_name', purchaserName);
            fd.append('description', description);
            fd.append('amount', String(parsedAmount));
            if (notes) fd.append('notes', notes);
            if (receipt) fd.append('receipt', receipt);

            const url = entry?.id ? `rnsk-expenses/${entry.id}` : 'rnsk-expenses';
            await api(url, {method: 'POST', body: fd});
            await onSaved(`RNSK expense of ₹${number(parsedAmount)} saved successfully.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '540px'}}>
                <div className="panel-head">
                    <div>
                        <h2>{entry?.id ? 'Edit RNSK Expense' : 'Add RNSK Expense'}</h2>
                        <p>Expense will be automatically allocated across all {companies.length} companies.</p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{maxHeight: '65vh', overflowY: 'auto', padding: '12px 16px'}}>
                    {error && <div className="error" style={{marginBottom: '10px'}}>{error}</div>}

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                        <Field label="Expense Date">
                            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required/>
                        </Field>
                        <Field label="Paying Company">
                            <select value={payerCompanyId} onChange={e => setPayerCompanyId(e.target.value)} required>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Field>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                        <Field label="Purchaser / Responsible">
                            <input type="text" placeholder="e.g. Jayesh Patel" value={purchaserName} onChange={e => setPurchaserName(e.target.value)} required/>
                        </Field>
                        <Field label="Total Bill Amount (₹)">
                            <input type="number" step="0.01" min="1" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required/>
                        </Field>
                    </div>

                    <Field label="Description / Item Name">
                        <input type="text" placeholder="e.g. Inverter Transformer Repair / Cabling" value={description} onChange={e => setDescription(e.target.value)} required/>
                    </Field>

                    {/* Automatic Split Preview */}
                    <div style={{background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '10px 12px', margin: '12px 0'}}>
                        <span style={{fontSize: '11px', fontWeight: 800, color: '#0369a1', display: 'block', marginBottom: '6px'}}>
                            ⚡ AUTOMATIC % SPLIT PREVIEW:
                        </span>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                            {allocationsPreview.map(a => (
                                <div key={a.id} style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px'}}>
                                    <span>{a.name} ({a.percentage}%):</span>
                                    <b style={{color: '#0c4a6e'}}>₹{number(a.shareAmount)}</b>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Field label="Notes (Optional)">
                        <textarea rows="2" placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)}/>
                    </Field>

                    <Field label="Bill / Receipt Image">
                        <input type="file" accept="image/*,application/pdf" onChange={e => setReceipt(e.target.files[0])}/>
                    </Field>
                </div>

                <div className="modal-actions" style={{padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                    <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="primary" disabled={busy} style={{background: '#0284c7', borderColor: '#0284c7'}}>
                        {busy ? 'Saving...' : 'Save RNSK Expense'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── MODAL 3: Settle Balance ──
function RnskSettlementModal({pair, onClose, onSaved, currentLang}) {
    const totalOpen = Number(pair.amount) || 0;
    const [settledOn, setSettledOn] = useState(today());
    const [amount, setAmount] = useState(String(totalOpen));
    const [paymentMode, setPaymentMode] = useState('bank_transfer');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const parsedAmount = Number(amount) || 0;

    const save = async (e) => {
        e.preventDefault();
        if (parsedAmount <= 0 || parsedAmount > totalOpen) {
            setError(`Enter a valid settlement amount up to ₹${number(totalOpen)}.`);
            return;
        }
        setBusy(true);
        setError('');
        try {
            await api('rnsk-expense-settlements', {
                method: 'POST',
                body: JSON.stringify({
                    settled_on: settledOn,
                    from_company_id: pair.debtor_company.id,
                    to_company_id: pair.creditor_company.id,
                    amount: parsedAmount,
                    payment_mode: paymentMode,
                    notes,
                })
            });
            await onSaved(`Settlement of ₹${number(parsedAmount)} recorded successfully.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
                <div className="panel-head">
                    <div>
                        <h2>Record RNSK Settlement</h2>
                        <p><b>{pair.debtor_company.name}</b> pays <b>{pair.creditor_company.name}</b></p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll" style={{padding: '12px 16px'}}>
                    {error && <div className="error" style={{marginBottom: '10px'}}>{error}</div>}

                    <div style={{background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                            <span style={{fontSize: '10px', fontWeight: 700, color: '#92400e'}}>OPEN BALANCE</span>
                            <div style={{fontSize: '18px', fontWeight: 800, color: '#78350f'}}>₹{number(totalOpen)}</div>
                        </div>
                        <span className="status warning">Receivable</span>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                        <Field label="Settlement Date">
                            <input type="date" value={settledOn} onChange={e => setSettledOn(e.target.value)} required/>
                        </Field>
                        <Field label="Payment Mode">
                            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                                <option value="bank_transfer">Bank Transfer (RTGS/NEFT)</option>
                                <option value="cheque">Cheque</option>
                                <option value="cash">Cash</option>
                                <option value="upi">UPI / Online</option>
                            </select>
                        </Field>
                    </div>

                    <Field label="Settlement Amount (₹)">
                        <input type="number" step="0.01" max={totalOpen} value={amount} onChange={e => setAmount(e.target.value)} required/>
                    </Field>

                    <Field label="Reference / Notes">
                        <textarea rows="2" placeholder="e.g. UTR / Cheque No. #12345" value={notes} onChange={e => setNotes(e.target.value)}/>
                    </Field>
                </div>

                <div className="modal-actions" style={{padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                    <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="primary" disabled={busy} style={{background: '#15803d', borderColor: '#15803d'}}>
                        {busy ? 'Saving...' : 'Confirm Settlement'}
                    </button>
                </div>
            </form>
        </div>
    );
}
