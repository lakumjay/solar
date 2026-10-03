import React, {useEffect, useMemo, useState} from 'react';
import {ArrowRight, CheckCircle2, Clock, FileSpreadsheet, FileText, HandCoins, History, IndianRupee, Layers, PencilLine, Plus, ReceiptIndianRupee, Scale, Sparkles, Split, X, Zap} from 'lucide-react';
import {api} from '../api';
import {Empty, Field, Loading, Metric} from '../components/Common';
import {monthStart, today} from '../config';
import {number, indianAmount, shortDate} from '../format';

export default function ExpensesPage({currentUser}) {
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [data, setData] = useState(null);
    const [expenseForm, setExpenseForm] = useState(null);
    const [settlement, setSettlement] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' or 'settlements'

    const load = async () => {
        try {
            setData(await api(`expenses?date_from=${from}&date_to=${to}`));
            setError('');
        } catch (failure) {
            setError(failure.message);
        }
    };

    useEffect(() => { load(); }, []);

    const completed = async success => {
        setExpenseForm(null);
        setSettlement(null);
        setMessage(success);
        await load();
    };

    const action = async (entry, name) => {
        if (!window.confirm(`${name === 'cancel' ? 'Cancel' : 'Reverse'} this expense?`)) return;
        try {
            await api(`expenses/${entry.id}/${name}`, {method: 'POST'});
            await completed(`Expense ${name === 'cancel' ? 'cancelled' : 'reversed'} successfully.`);
        } catch (failure) {
            setError(failure.message);
        }
    };

    const groupedEntries = useMemo(() => {
        return Object.entries(
            (data?.entries || []).reduce((groups, entry) => ({
                ...groups,
                [entry.date]: [...(groups[entry.date] || []), entry],
            }), {})
        );
    }, [data]);

    if (!data && !error) return <Loading/>;
    if (!data) return <Empty title="Could not load expenses" detail={error}/>;

    const summary = data.summary;
    const settlementsHistory = data.settlements_history || [];

    return (
        <div className="expenses-page">
            {currentUser.role === 'super_admin' ? (
                <div className="cards expense-summary-cards">
                    <Metric icon={IndianRupee} title="Total outstanding" value={summary.total_outstanding} unit="INR" color="amber"/>
                    <Metric icon={Scale} title="Open balances" value={summary.open_pairs} unit="company pairs"/>
                    <Metric icon={CheckCircle2} title="Cleared balances" value={summary.cleared_pairs} unit="company pairs"/>
                    <Metric icon={ReceiptIndianRupee} title="Period entries" value={summary.entries} unit="ledger entries"/>
                </div>
            ) : (
                <div className="cards expense-summary-cards">
                    <Metric icon={HandCoins} title="You need to pay" value={summary.payable} unit="INR" color="amber"/>
                    <Metric icon={IndianRupee} title="You will receive" value={summary.receivable} unit="INR"/>
                    <Metric icon={Scale} title="Net balance" value={summary.net} unit="INR"/>
                    <Metric icon={ReceiptIndianRupee} title="Open balances" value={summary.open_pairs} unit="company pairs"/>
                </div>
            )}

            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}
            {!data.settings.configured && (
                <div className="error">
                    Shared expense percentages are not configured. Set the active-company total to 100% in Company Configuration.
                </div>
            )}

            {/* Toolbar */}
            <section className="panel expense-toolbar">
                <div>
                    <label>
                        <span>From</span>
                        <input type="date" max={today()} value={from} onChange={event => setFrom(event.target.value)}/>
                    </label>
                    <label>
                        <span>To</span>
                        <input type="date" max={today()} value={to} onChange={event => setTo(event.target.value)}/>
                    </label>
                    <button className="secondary" onClick={load}>Apply</button>
                </div>
                <div className="expense-toolbar-actions">
                    <a className="secondary" href={`/api/expenses/export/excel?date_from=${from}&date_to=${to}`}>
                        <FileSpreadsheet size={16}/>
                        {currentUser.role === 'super_admin' ? 'Export all expenses' : 'Export my expenses'}
                    </a>
                    {data.can_manage && (
                        <button className="primary" disabled={!data.settings.configured} onClick={() => setExpenseForm({})}>
                            <Plus size={16}/> Add shared expense
                        </button>
                    )}
                </div>
            </section>

            {/* Company Balances Panel */}
            <section className="panel">
                <div className="panel-head">
                    <div>
                        <h2>Company balances & Outstanding</h2>
                        <p>Purchases and multi-payer splits are netted automatically. Partial settlements reduce the open balance.</p>
                    </div>
                </div>
                {data.balances.length ? (
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
                                {data.balances.map(pair => (
                                    <tr key={pair.key}>
                                        <td className="strong">{pair.first_company.name} ↔ {pair.second_company.name}</td>
                                        <td>
                                            {pair.status === 'cleared'
                                                ? 'No amount pending (સરભર)'
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
                    <Empty title="No company balances yet" detail="Add the first shared expense to start the ledger."/>
                )}
            </section>

            {/* Tabs for Daily Ledger & Settlement Audit History */}
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
                    <div className="panel-head">
                        <div>
                            <h2>Daily expense ledger</h2>
                            <p>Expenses, multi-payer allocations, reversals, and settlement payments from {shortDate(from)} to {shortDate(to)}.</p>
                        </div>
                    </div>
                    {groupedEntries.length ? (
                        <div className="expense-ledger">
                            {groupedEntries.map(([date, entries]) => (
                                <div className="expense-day" key={date}>
                                    <h3>{shortDate(date)}</h3>
                                    <div className="table-wrap">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Entry & Scope</th>
                                                    <th>Company split & Payer(s)</th>
                                                    <th>Amount</th>
                                                    <th>Status</th>
                                                    <th/>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {entries.map(entry => (
                                                    <LedgerRow
                                                        entry={entry}
                                                        canManage={data.can_manage}
                                                        onEdit={() => setExpenseForm(entry)}
                                                        onCancel={() => action(entry, 'cancel')}
                                                        onReverse={() => action(entry, 'reverse')}
                                                        key={`${entry.type}-${entry.id}`}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty title="No expense entries" detail="No expenses or settlements were recorded in this date range."/>
                    )}
                </section>
            )}

            {/* TAB 2: Settlement Audit History Log */}
            {activeTab === 'settlements' && (
                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Settlement History & Payment Log</h2>
                            <p>Complete record of full and partial payments between companies with date, time, and remaining balances.</p>
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
                <ExpenseForm
                    entry={expenseForm.id ? expenseForm : null}
                    settings={data.settings}
                    onClose={() => setExpenseForm(null)}
                    onSaved={completed}
                />
            )}

            {settlement && (
                <SettlementForm
                    pair={settlement}
                    onClose={() => setSettlement(null)}
                    onSaved={completed}
                />
            )}
        </div>
    );
}

function LedgerRow({entry, canManage, onEdit, onCancel, onReverse}) {
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

    const scopeBadge = entry.allocation_scope === 'single'
        ? '1 Company (100% Direct)'
        : entry.allocation_scope === 'two'
            ? '2 Companies Split'
            : 'All Companies (3-Way Master)';

    return (
        <tr>
            <td>
                <b>{entry.description}</b>
                <small>
                    {entry.purchaser_name} · <span style={{color: '#0284c7', fontWeight: 600}}>{scopeBadge}</span>
                    {entry.notes ? ` · ${entry.notes}` : ''}
                </small>
            </td>
            <td>
                <div className="allocation-list">
                    {/* Payers summary */}
                    {entry.payers && entry.payers.length > 0 && (
                        <div style={{fontSize: '11px', color: '#0f766e', fontWeight: 700, marginBottom: '3px'}}>
                            Paid by: {entry.payers.map(p => `${p.company_name} (₹${number(p.amount_paid)})`).join(', ')}
                        </div>
                    )}
                    {/* Allocations breakdown */}
                    {entry.allocations?.map(row => {
                        const net = row.net_effect ?? ((row.amount_paid || 0) - row.amount);
                        const netText = net > 0.001
                            ? `(+₹${number(net)} લેવાના)`
                            : net < -0.001
                                ? `(-₹${number(Math.abs(net))} દેવાના)`
                                : '(સરભર)';
                        const netColor = net > 0.001 ? '#15803d' : net < -0.001 ? '#b91c1c' : '#64748b';

                        return (
                            <span key={row.company.id}>
                                <b>{row.company.name}</b> {number(row.percentage)}% · ખર્ચ: ₹{number(row.amount)}{' '}
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

function ExpenseForm({entry, settings, onClose, onSaved}) {
    const companies = settings.companies || [];

    // Form fields
    const [expenseDate, setExpenseDate] = useState(entry?.date || today());
    const [purchaserName, setPurchaserName] = useState(entry?.purchaser_name || '');
    const [description, setDescription] = useState(entry?.description || '');
    const [amount, setAmount] = useState(entry ? String(Math.abs(entry.amount)) : '');
    const [notes, setNotes] = useState(entry?.notes || '');
    const [receipt, setReceipt] = useState(null);
    const [removeReceipt, setRemoveReceipt] = useState(false);

    // Step state: 1=Info, 2=Beneficiary, 3=Payer, 4=Preview/Confirm
    const [step, setStep] = useState(1);
    const TOTAL_STEPS = entry ? 3 : 4; // Edit mode has 3 steps (no confirm step shown differently)

    // 1. Allocation Scope
    const initialScope = entry?.allocation_scope || 'all';
    const [allocationScope, setAllocationScope] = useState(initialScope);
    const [selectedBeneficiaries, setSelectedBeneficiaries] = useState(() => {
        if (entry?.allocations) {
            return entry.allocations.filter(a => Number(a.percentage) > 0 || Number(a.amount) > 0).map(a => a.company.id);
        }
        return companies.map(c => c.id);
    });
    const [singleBeneficiaryId, setSingleBeneficiaryId] = useState(() => {
        if (entry?.allocations) {
            const single = entry.allocations.find(a => Number(a.percentage) >= 99.9 || Number(a.amount) >= Math.abs(entry.amount));
            if (single) return String(single.company.id);
        }
        return String(companies[0]?.id || '');
    });

    // 2. Paying Company Mode
    const [payerMode, setPayerMode] = useState(() => {
        if (entry?.payers && entry.payers.length > 1) return 'multiple';
        return 'single';
    });
    const [singlePayerId, setSinglePayerId] = useState(String(entry?.payer_company?.id || companies[0]?.id || ''));
    const [payerAmounts, setPayerAmounts] = useState(() => {
        const init = {};
        companies.forEach(c => {
            const existing = entry?.payers?.find(p => p.company_id === c.id);
            init[c.id] = existing ? String(existing.amount_paid) : '';
        });
        return init;
    });
    const [selectedPayers, setSelectedPayers] = useState(() => {
        if (entry?.payers && entry.payers.length > 0) {
            return entry.payers.map(p => p.company_id);
        }
        return [companies[0]?.id].filter(Boolean);
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
            if (prev.length >= 2) return [prev[1], cid];
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

    const previewAllocations = useMemo(() => {
        if (allocationScope === 'single') {
            const targetId = Number(singleBeneficiaryId);
            return companies.map(c => ({
                id: c.id, name: c.name,
                percentage: c.id === targetId ? 100 : 0,
                shareAmount: c.id === targetId ? parsedAmount : 0,
            }));
        }
        if (allocationScope === 'two') {
            const activeSel = companies.filter(c => selectedBeneficiaries.includes(c.id));
            const sumMaster = activeSel.reduce((s, c) => s + (Number(c.percentage) || 0), 0);
            return companies.map(c => {
                if (!selectedBeneficiaries.includes(c.id)) return {id: c.id, name: c.name, percentage: 0, shareAmount: 0};
                const pct = sumMaster > 0 ? ((Number(c.percentage) || 0) / sumMaster) * 100 : 50;
                return {id: c.id, name: c.name, percentage: Number(pct.toFixed(2)), shareAmount: Number((parsedAmount * (pct / 100)).toFixed(2))};
            });
        }
        return companies.map(c => {
            const pct = Number(c.percentage) || 0;
            return {id: c.id, name: c.name, percentage: pct, shareAmount: Number((parsedAmount * (pct / 100)).toFixed(2))};
        });
    }, [allocationScope, selectedBeneficiaries, singleBeneficiaryId, companies, parsedAmount]);

    const previewPaidMap = useMemo(() => {
        const map = {};
        if (payerMode === 'single') {
            const pid = Number(singlePayerId);
            companies.forEach(c => { map[c.id] = c.id === pid ? parsedAmount : 0; });
        } else {
            companies.forEach(c => {
                map[c.id] = selectedPayers.includes(c.id) ? Number(payerAmounts[c.id]) || 0 : 0;
            });
        }
        return map;
    }, [payerMode, singlePayerId, payerAmounts, selectedPayers, companies, parsedAmount]);

    const totalPaidSum = Object.values(previewPaidMap).reduce((s, v) => s + v, 0);
    const paidDiff = Number((parsedAmount - totalPaidSum).toFixed(2));
    const isPaidValid = Math.abs(paidDiff) <= 0.01;

    // Step validation
    const step1Valid = expenseDate && purchaserName.trim() && description.trim() && parsedAmount > 0;
    const step3Valid = payerMode === 'single' ? true : isPaidValid;

    const scopeLabel = allocationScope === 'single' ? '૧ કંપની (100% Direct)'
        : allocationScope === 'two' ? '૨ કંપનીઓ (2 Companies)'
        : 'ત્રણેય કંપનીઓ (All 3 Master %)';

    const payerLabel = payerMode === 'single'
        ? companies.find(c => String(c.id) === String(singlePayerId))?.name || '—'
        : `${selectedPayers.length} કંપનીઓ`;

    const save = async event => {
        event.preventDefault();
        if (!isPaidValid && payerMode === 'multiple') {
            setError(`Total paid (₹${number(totalPaidSum)}) ≠ Total amount (₹${number(parsedAmount)})`);
            return;
        }
        setBusy(true);
        setError('');

        const payload = new FormData();
        payload.append('expense_date', expenseDate);
        payload.append('purchaser_name', purchaserName);
        payload.append('description', description);
        payload.append('amount', String(parsedAmount));
        payload.append('notes', notes);
        payload.append('allocation_scope', allocationScope);

        if (allocationScope === 'single') {
            payload.append('beneficiary_company_ids[]', singleBeneficiaryId);
        } else if (allocationScope === 'two') {
            selectedBeneficiaries.forEach(id => payload.append('beneficiary_company_ids[]', String(id)));
        } else {
            companies.forEach(c => payload.append('beneficiary_company_ids[]', String(c.id)));
        }

        if (payerMode === 'single') {
            payload.append('payer_company_id', singlePayerId);
        } else {
            selectedPayers.forEach((cid, index) => {
                payload.append(`payers[${index}][company_id]`, String(cid));
                payload.append(`payers[${index}][amount_paid]`, String(previewPaidMap[cid] || 0));
            });
        }

        if (receipt) payload.append('receipt', receipt);
        if (removeReceipt) payload.append('remove_receipt', '1');

        try {
            await api(entry ? `expenses/${entry.id}` : 'expenses', {method: 'POST', body: payload});
            await onSaved(entry ? 'Expense updated successfully.' : 'Shared expense added successfully.');
        } catch (failure) {
            setError(failure.message);
            setStep(1);
        } finally {
            setBusy(false);
        }
    };

    const amountWord = indianAmount(parsedAmount);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <form className="modal expense-modal expense-modal-sheet" onSubmit={save} onClick={e => e.stopPropagation()}>
                <div className="mobile-modal-handle-bar"/>

                {/* Header */}
                <div className="panel-head expense-sheet-head">
                    <div>
                        <h2>{entry ? 'Edit Shared Expense' : 'Add Shared Expense (શેર્ડ ખર્ચ)'}</h2>
                        <p>કંપનીઓ વચ્ચે ભાગીદારી ખર્ચ અને ચૂકવણીની સરળ એન્ટ્રી</p>
                    </div>
                    <button type="button" className="icon-button ghost modal-close-chip" onClick={onClose}><X size={18}/></button>
                </div>

                {/* Step Progress Bar */}
                <div className="expense-step-progress">
                    {['માહિતી', 'ખર્ચ કોનો?', 'ચૂકવ્યા?', 'Confirm'].map((label, i) => (
                        <div key={i} className={`step-prog-item ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
                            <div className="step-prog-circle">{step > i + 1 ? '✓' : i + 1}</div>
                            <span>{label}</span>
                        </div>
                    ))}
                </div>

                <div className="expense-form-body-scroll">

                    {/* ── STEP 1: Basic Info ── */}
                    {step === 1 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">1</span>
                                <b>ખર્ચની મૂળ માહિતી</b>
                            </div>

                            <Field label="Expense Date (ખર્ચની તારીખ)">
                                <input type="date" max={today()} value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required/>
                            </Field>

                            <Field label="Total Amount (કુલ રકમ ₹)">
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="highlight-amount-input"
                                    required
                                />
                                {amountWord && (
                                    <div className="amount-gujarati-word">
                                        ₹ {Number(parsedAmount).toLocaleString('en-IN')} · <b>{amountWord}</b>
                                    </div>
                                )}
                            </Field>

                            <Field label="Purchased By (ખર્ચ કરનારનું નામ)">
                                <input value={purchaserName} maxLength="150" onChange={e => setPurchaserName(e.target.value)} required/>
                            </Field>

                            <Field label="Description (ખર્ચની વિગત)">
                                <input value={description} maxLength="255" onChange={e => setDescription(e.target.value)} required/>
                            </Field>

                            <Field label="Notes (નોંધ / Remarks)">
                                <input value={notes} onChange={e => setNotes(e.target.value)}/>
                            </Field>

                            <Field label="Receipt upload (બિલની રસીદ)">
                                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setReceipt(e.target.files?.[0] || null)}/>
                            </Field>

                            {entry?.receipt_url && (
                                <label className="toggle" style={{marginTop: '4px'}}>
                                    <input type="checkbox" checked={removeReceipt} onChange={e => setRemoveReceipt(e.target.checked)}/>
                                    <span/> Remove existing receipt
                                </label>
                            )}
                        </div>
                    )}

                    {/* ── STEP 2: Beneficiary Scope ── */}
                    {step === 2 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">2</span>
                                <b>ખર્ચ કોના માટે થયો છે? (Beneficiary Scope)</b>
                            </div>

                            <div className="scope-pills-row">
                                <label className={`scope-pill-btn ${allocationScope === 'all' ? 'active' : ''}`}>
                                    <input type="radio" name="alloc_scope" checked={allocationScope === 'all'} onChange={() => setAllocationScope('all')}/>
                                    <span>ત્રણેય કંપનીઓ (All 3 Master %)</span>
                                </label>
                                <label className={`scope-pill-btn ${allocationScope === 'two' ? 'active' : ''}`}>
                                    <input type="radio" name="alloc_scope" checked={allocationScope === 'two'} onChange={() => setAllocationScope('two')}/>
                                    <span>૨ કંપનીઓ (2 Companies)</span>
                                </label>
                                <label className={`scope-pill-btn ${allocationScope === 'single' ? 'active' : ''}`}>
                                    <input type="radio" name="alloc_scope" checked={allocationScope === 'single'} onChange={() => setAllocationScope('single')}/>
                                    <span>૧ કંપની (100% Direct)</span>
                                </label>
                            </div>

                            {allocationScope === 'two' && (
                                <div className="scope-sub-panel">
                                    <span className="sub-panel-label">કોઈપણ ૨ કંપની પસંદ કરો:</span>
                                    <div className="companies-chips-list">
                                        {companies.map(c => (
                                            <label key={c.id} className={`company-check-chip ${selectedBeneficiaries.includes(c.id) ? 'checked' : ''}`}>
                                                <input type="checkbox" checked={selectedBeneficiaries.includes(c.id)} onChange={() => toggleBeneficiary(c.id)}/>
                                                <span>{c.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {allocationScope === 'single' && (
                                <div className="scope-sub-panel">
                                    <span className="sub-panel-label">કઈ કંપનીનો પોતાનો ખર્ચ છે?</span>
                                    <select value={singleBeneficiaryId} onChange={e => setSingleBeneficiaryId(e.target.value)} className="clean-select-box">
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Live share preview */}
                            <div className="wizard-alloc-preview">
                                {previewAllocations.filter(r => r.shareAmount > 0).map(r => (
                                    <div key={r.id} className="wizard-alloc-row">
                                        <span>{r.name}</span>
                                        <span>{number(r.percentage)}% · <b>₹{number(r.shareAmount)}</b></span>
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
                                <b>પૈસા કોણે ચૂકવ્યા? (Who Paid the Bill?)</b>
                            </div>

                            <div className="payer-mode-switch-group">
                                <label className={`payer-mode-pill ${payerMode === 'single' ? 'active' : ''}`}>
                                    <input type="radio" name="payer_mode" checked={payerMode === 'single'} onChange={() => setPayerMode('single')}/>
                                    <span>૧ કંપનીએ</span>
                                </label>
                                <label className={`payer-mode-pill ${payerMode === 'multiple' ? 'active' : ''}`}>
                                    <input type="radio" name="payer_mode" checked={payerMode === 'multiple'} onChange={() => setPayerMode('multiple')}/>
                                    <span>બે કે વધુ કંપનીઓએ</span>
                                </label>
                            </div>

                            {payerMode === 'single' ? (
                                <div className="single-payer-wrap">
                                    <span className="sub-panel-label">ચૂકવનાર કંપની:</span>
                                    <select value={singlePayerId} onChange={e => setSinglePayerId(e.target.value)} className="clean-select-box">
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name} (૧૦૦% = ₹{number(parsedAmount)})</option>)}
                                    </select>
                                </div>
                            ) : (
                                <div className="multiple-payers-wrap">
                                    <div className="split-action-header">
                                        <span className="sub-panel-label">દરેક કંપનીએ ચૂકવેલ રકમ દાખલ કરો:</span>
                                        <button type="button" onClick={handleSplitEqually} className="quick-split-pill-btn" title="Divide equally">
                                            <Split size={13}/> <span>⚡ Split Equally</span>
                                        </button>
                                    </div>
                                    <div className="payers-grid-cards">
                                        {companies.map(c => {
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
                                        <span>કુલ ચૂકવેલ: <b>₹{number(totalPaidSum)}</b> / ₹{number(parsedAmount)}</span>
                                        <span>
                                            {isPaidValid ? '✓ રકમ પરફેક્ટ મેચ છે'
                                                : paidDiff > 0 ? `બાકી ₹${number(paidDiff)} ચૂકવવાના છે`
                                                : `₹${number(Math.abs(paidDiff))} વધારે લખાયા છે`}
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
                                <b>Confirm & Submit — સઘળી વિગત ચકાસો</b>
                            </div>

                            {/* Summary card */}
                            <div className="confirm-summary-card">
                                <div className="confirm-summary-row"><span>📅 તારીખ</span><b>{expenseDate}</b></div>
                                <div className="confirm-summary-row highlight-row">
                                    <span>💰 કુલ રકમ</span>
                                    <div>
                                        <b style={{fontSize: '18px', color: '#15803d'}}>₹{Number(parsedAmount).toLocaleString('en-IN')}</b>
                                        {amountWord && <small style={{color: '#16a34a', display: 'block'}}>{amountWord}</small>}
                                    </div>
                                </div>
                                <div className="confirm-summary-row"><span>👤 ખર્ચ કરનાર</span><b>{purchaserName}</b></div>
                                <div className="confirm-summary-row"><span>📝 વિગત</span><b>{description}</b></div>
                                <div className="confirm-summary-row"><span>🏢 ખર્ચ Scope</span><b>{scopeLabel}</b></div>
                                <div className="confirm-summary-row"><span>💳 ચૂકવ્યા</span><b>{payerLabel}</b></div>
                            </div>

                            {/* Live allocation preview */}
                            <div className="wizard-step-title" style={{marginTop: '10px'}}>
                                <span style={{fontSize: '12px', fontWeight: 700, color: '#64748b'}}>📊 Company-wise હિસ્સો:</span>
                            </div>
                            <div className="preview-alloc-cards-list">
                                {previewAllocations.map(row => {
                                    const paid = previewPaidMap[row.id] || 0;
                                    const share = row.shareAmount || 0;
                                    const net = Number((paid - share).toFixed(2));
                                    const netText = net > 0.001 ? `+₹${number(net)} (લેવાના)` : net < -0.001 ? `-₹${number(Math.abs(net))} (દેવાના)` : '₹0.00 (સરભર)';
                                    const netClass = net > 0.001 ? 'net-receivable' : net < -0.001 ? 'net-payable' : 'net-even';
                                    return (
                                        <div key={row.id} className="preview-alloc-row-card">
                                            <div className="alloc-comp-name">
                                                <b>{row.name}</b>
                                                <small>({number(row.percentage)}%)</small>
                                            </div>
                                            <div className="alloc-amounts-col">
                                                <span>ચૂકવ્યા: <b>₹{number(paid)}</b></span>
                                                <span>હિસ્સો: <b>₹{number(share)}</b></span>
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
                            રદ કરો
                        </button>
                    )}

                    <div className="step-dots">
                        {[1,2,3,4].map(s => (
                            <span key={s} className={`step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}/>
                        ))}
                    </div>

                    {step < 4 ? (
                        <button
                            type="button"
                            className="primary expense-submit-btn"
                            disabled={step === 1 && !step1Valid}
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
                            {busy ? 'સેવ થઈ રહ્યું છે...' : entry ? '✓ Update Expense' : '✓ ખર્ચ સેવ કરો'}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}

function SettlementForm({pair, onClose, onSaved}) {
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

    // Preset Chip Click
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
            await api('expense-settlements', {
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
            <form className="modal modal-sheet settlement-modal" onSubmit={save} onClick={e => e.stopPropagation()} style={{maxWidth: '540px'}}>
                <div className="panel-head">
                    <div>
                        <h2>Record balance settlement (ચૂકવણી / સેટલમેન્ટ)</h2>
                        <p>
                            <b>{pair.debtor_company.name}</b> pays <b>{pair.creditor_company.name}</b>
                        </p>
                    </div>
                    <button type="button" className="icon-button ghost" onClick={onClose}><X size={18}/></button>
                </div>

                <div className="modal-body-scroll">
                    <div className="settlement-balance" style={{background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                            <small style={{fontWeight: 700, textTransform: 'uppercase', fontSize: '10px', color: '#b45309'}}>TOTAL OPEN BALANCE</small>
                            <div style={{fontSize: '22px', fontWeight: 850, color: '#78350f', letterSpacing: '-0.02em'}}>₹{number(totalOpen)}</div>
                        </div>
                        <span className="status warning" style={{fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 750}}>
                            બાકી લેવાના નીકળે છે
                        </span>
                    </div>

                    {/* Quick Presets (100% Full, 50% Half, 25%) */}
                    <div style={{marginTop: '2px'}}>
                        <span style={{fontSize: '11.5px', color: '#475569', fontWeight: 700, display: 'block', marginBottom: '6px'}}>
                            ઝડપી રકમ પસંદગી (Quick Amount Presets):
                        </span>
                        <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => handlePreset(1.0)}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    borderRadius: '8px',
                                    background: parsedAmount === totalOpen ? '#15803d' : '#f1f5f9',
                                    color: parsedAmount === totalOpen ? '#ffffff' : '#1e293b',
                                    border: parsedAmount === totalOpen ? '1px solid #15803d' : '1px solid #e2e8f0',
                                    cursor: 'pointer'
                                }}
                            >
                                ૧૦૦% Full (₹{number(totalOpen)})
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => handlePreset(0.5)}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    cursor: 'pointer'
                                }}
                            >
                                ૫૦% Half (₹{number(totalOpen / 2)})
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => handlePreset(0.25)}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    cursor: 'pointer'
                                }}
                            >
                                ૨૫% (₹{number(totalOpen / 4)})
                            </button>
                        </div>
                    </div>

                    <div className="form-grid two">
                        <Field label="Payment date (ચૂકવણી તારીખ)">
                            <input type="date" max={today()} value={settledOn} onChange={e => setSettledOn(e.target.value)} required/>
                        </Field>
                        <Field label="Amount to settle (ચૂકવવાની રકમ ₹)">
                            <input
                                type="number"
                                min="0.01"
                                max={totalOpen}
                                step="0.01"
                                inputMode="decimal"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                style={{fontSize: '15px', fontWeight: 800, color: '#0f172a'}}
                                required
                            />
                        </Field>
                    </div>

                    <div className="form-grid two">
                        <Field label="Payment mode (ચૂકવણી પદ્ધતિ)">
                            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                                <option value="bank_transfer">Bank Transfer / NEFT / RTGS</option>
                                <option value="cash">Cash (રોકડ)</option>
                                <option value="upi">UPI / GPay / PhonePe</option>
                                <option value="cheque">Cheque</option>
                                <option value="other">Other</option>
                            </select>
                        </Field>
                        <Field label="Settlement status (સેટલમેન્ટ સ્થિતિ)">
                            <input
                                type="text"
                                value={settlementType === 'full' ? '૧૦૦% Full Settlement (ખાતું ક્લિયર)' : `Partial (બાકી ₹${number(remainingBalance)})`}
                                disabled
                                style={{fontWeight: 750, color: settlementType === 'full' ? '#15803d' : '#b45309'}}
                            />
                        </Field>
                    </div>

                    <Field label="Reference / Notes (વિગત / UTR ટ્રાન્ઝેક્શન નંબર)">
                        <textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)}/>
                    </Field>

                    {/* Remaining Balance Indicator */}
                    <div style={{background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px'}}>
                        <span style={{color: '#64748b', fontWeight: 600}}>ચૂકવણી બાદ બાકી રહેતું બેલેન્સ:</span>
                        <b style={{fontSize: '14px', color: remainingBalance > 0 ? '#b91c1c' : '#15803d', fontWeight: 800}}>
                            {remainingBalance > 0 ? `₹${number(remainingBalance)}` : '₹0.00 (સંપૂર્ણ ક્લિયર)'}
                        </b>
                    </div>

                    {error && <div className="error">{error}</div>}
                </div>

                <div className="modal-sticky-footer">
                    <button type="button" className="secondary modal-cancel-btn" onClick={onClose}>
                        Cancel (રદ કરો)
                    </button>
                    <button className="primary expense-submit-btn" disabled={busy}>
                        {busy ? 'સેવ થઈ રહ્યું છે...' : `✓ Record ${settlementType === 'full' ? 'Full' : 'Partial'} Payment`}
                    </button>
                </div>
            </form>
        </div>
    );
}
