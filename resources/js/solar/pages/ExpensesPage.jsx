import React, {useEffect, useMemo, useState} from 'react';
import {CheckCircle2, FileSpreadsheet, FileText, HandCoins, IndianRupee, PencilLine, Plus, ReceiptIndianRupee, Scale, X} from 'lucide-react';
import {api} from '../api';
import {Empty, Field, Loading, Metric} from '../components/Common';
import {monthStart, today} from '../config';
import {number, shortDate} from '../format';

export default function ExpensesPage({currentUser}) {
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [data, setData] = useState(null);
    const [expenseForm, setExpenseForm] = useState(null);
    const [settlement, setSettlement] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const load = async () => {
        try { setData(await api(`expenses?date_from=${from}&date_to=${to}`)); setError(''); }
        catch (failure) { setError(failure.message); }
    };
    useEffect(() => { load(); }, []);
    const completed = async success => { setExpenseForm(null); setSettlement(null); setMessage(success); await load(); };
    const action = async (entry, name) => {
        if (!window.confirm(`${name === 'cancel' ? 'Cancel' : 'Reverse'} this expense?`)) return;
        try { await api(`expenses/${entry.id}/${name}`, {method: 'POST'}); await completed(`Expense ${name === 'cancel' ? 'cancelled' : 'reversed'} successfully.`); }
        catch (failure) { setError(failure.message); }
    };
    const groupedEntries = useMemo(() => Object.entries((data?.entries || []).reduce((groups, entry) => ({...groups, [entry.date]: [...(groups[entry.date] || []), entry]}), {})), [data]);

    if (!data && !error) return <Loading/>;
    if (!data) return <Empty title="Could not load expenses" detail={error}/>;
    const summary = data.summary;

    return <div className="expenses-page">
        {currentUser.role === 'super_admin' ? <div className="cards expense-summary-cards"><Metric icon={IndianRupee} title="Total outstanding" value={summary.total_outstanding} unit="INR" color="amber"/><Metric icon={Scale} title="Open balances" value={summary.open_pairs} unit="company pairs"/><Metric icon={CheckCircle2} title="Cleared balances" value={summary.cleared_pairs} unit="company pairs"/><Metric icon={ReceiptIndianRupee} title="Period entries" value={summary.entries} unit="ledger entries"/></div> : <div className="cards expense-summary-cards"><Metric icon={HandCoins} title="You need to pay" value={summary.payable} unit="INR" color="amber"/><Metric icon={IndianRupee} title="You will receive" value={summary.receivable} unit="INR"/><Metric icon={Scale} title="Net balance" value={summary.net} unit="INR"/><Metric icon={ReceiptIndianRupee} title="Open balances" value={summary.open_pairs} unit="company pairs"/></div>}
        {message && <div className="success">{message}</div>}{error && <div className="error">{error}</div>}
        {!data.settings.configured && <div className="error">Shared expense percentages are not configured. Set the active-company total to 100% in Company Configuration.</div>}
        <section className="panel expense-toolbar"><div><label><span>From</span><input type="date" max={today()} value={from} onChange={event => setFrom(event.target.value)}/></label><label><span>To</span><input type="date" max={today()} value={to} onChange={event => setTo(event.target.value)}/></label><button className="secondary" onClick={load}>Apply</button></div><div className="expense-toolbar-actions"><a className="secondary" href={`/api/expenses/export/excel?date_from=${from}&date_to=${to}`}><FileSpreadsheet size={16}/>{currentUser.role === 'super_admin' ? 'Export all expenses' : 'Export my expenses'}</a>{data.can_manage && <button className="primary" disabled={!data.settings.configured} onClick={() => setExpenseForm({})}><Plus size={16}/> Add expense</button>}</div></section>

        <section className="panel"><div className="panel-head"><div><h2>Company balances</h2><p>Opposite purchases are netted automatically. Settlement payments reduce the remaining pair balance.</p></div></div>{data.balances.length ? <div className="table-wrap"><table><thead><tr><th>Companies</th><th>Current position</th><th>Amount</th><th>Status</th>{data.can_manage && <th/>}</tr></thead><tbody>{data.balances.map(pair => <tr key={pair.key}><td className="strong">{pair.first_company.name} ↔ {pair.second_company.name}</td><td>{pair.status === 'cleared' ? 'No amount pending' : `${pair.debtor_company.name} pays ${pair.creditor_company.name}`}</td><td>₹{number(pair.amount)}</td><td><i className={`status ${pair.status === 'cleared' ? 'on' : 'warning'}`}>{pair.status}</i></td>{data.can_manage && <td>{pair.status === 'open' && <button className="link" onClick={() => setSettlement(pair)}><HandCoins size={14}/> Settle</button>}</td>}</tr>)}</tbody></table></div> : <Empty title="No company balances yet" detail="Add the first shared expense to start the ledger."/>}</section>

        <section className="panel"><div className="panel-head"><div><h2>Daily expense ledger</h2><p>Expenses, reversals, and settlement payments from {shortDate(from)} to {shortDate(to)}.</p></div></div>{groupedEntries.length ? <div className="expense-ledger">{groupedEntries.map(([date, entries]) => <div className="expense-day" key={date}><h3>{shortDate(date)}</h3><div className="table-wrap"><table><thead><tr><th>Entry</th><th>Company split / payment</th><th>Amount</th><th>Status</th><th/></tr></thead><tbody>{entries.map(entry => <LedgerRow entry={entry} canManage={data.can_manage} onEdit={() => setExpenseForm(entry)} onCancel={() => action(entry, 'cancel')} onReverse={() => action(entry, 'reverse')} key={`${entry.type}-${entry.id}`}/>)}</tbody></table></div></div>)}</div> : <Empty title="No expense entries" detail="No expenses or settlements were recorded in this date range."/>}</section>

        {expenseForm && <ExpenseForm entry={expenseForm.id ? expenseForm : null} settings={data.settings} onClose={() => setExpenseForm(null)} onSaved={completed}/>} 
        {settlement && <SettlementForm pair={settlement} onClose={() => setSettlement(null)} onSaved={completed}/>} 
    </div>;
}

function LedgerRow({entry, canManage, onEdit, onCancel, onReverse}) {
    if (entry.type === 'settlement') return <tr><td><b>Settlement payment</b><small>{entry.from_company.name} paid {entry.to_company.name}{entry.notes ? ` · ${entry.notes}` : ''}</small></td><td>{entry.from_company.name} → {entry.to_company.name}</td><td>₹{number(entry.amount)}</td><td><i className={`status ${entry.status === 'cleared' ? 'on' : 'warning'}`}>{entry.status}</i></td><td/></tr>;

    return <tr><td><b>{entry.description}</b><small>{entry.purchaser_name} · {entry.payer_company.name}{entry.notes ? ` · ${entry.notes}` : ''}</small></td><td><div className="allocation-list">{entry.allocations.map(row => <span key={row.company.id}><b>{row.company.name}</b> {number(row.percentage)}% · ₹{number(row.amount)} {row.is_payer ? '(covered)' : ''}</span>)}</div></td><td>₹{number(entry.amount)}</td><td><i className={`status ${entry.status === 'active' ? entry.locked ? 'warning' : 'on' : entry.status === 'cancelled' ? 'danger' : ''}`}>{entry.type === 'reversal' ? 'reversal' : entry.status}{entry.locked && entry.status === 'active' ? ' · locked' : ''}</i></td><td><div className="row-actions">{entry.receipt_url && <a className="link" href={entry.receipt_url} target="_blank" rel="noreferrer"><FileText size={14}/> Receipt</a>}{canManage && entry.editable && <><button className="link" onClick={onEdit}><PencilLine size={14}/> Edit</button><button className="link danger-text" onClick={onCancel}>Cancel</button></>}{canManage && entry.reversible && <button className="link danger-text" onClick={onReverse}>Reverse</button>}</div></td></tr>;
}

function ExpenseForm({entry, settings, onClose, onSaved}) {
    const percentages = entry ? entry.allocations.map(row => ({id: row.company.id, name: row.company.name, percentage: row.percentage})) : settings.companies;
    const [form, setForm] = useState({expense_date: entry?.date || today(), payer_company_id: String(entry?.payer_company.id || settings.companies[0]?.id || ''), purchaser_name: entry?.purchaser_name || '', description: entry?.description || '', amount: entry ? Math.abs(entry.amount) : '', notes: entry?.notes || '', remove_receipt: false});
    const [receipt, setReceipt] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const amount = Number(form.amount || 0);
    const preview = percentages.filter(row => Number(row.percentage) > 0).map(row => ({...row, amount: amount * Number(row.percentage) / 100}));
    const save = async event => {
        event.preventDefault(); setBusy(true); setError('');
        const payload = new FormData(); Object.entries(form).forEach(([key, value]) => payload.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value)); if (receipt) payload.append('receipt', receipt);
        try { await api(entry ? `expenses/${entry.id}` : 'expenses', {method: 'POST', body: payload}); await onSaved(entry ? 'Expense updated successfully.' : 'Expense added successfully.'); }
        catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
    };

    return <div className="modal-backdrop"><form className="modal expense-modal" onSubmit={save}><div className="panel-head"><div><h2>{entry ? 'Edit expense' : 'Add shared expense'}</h2><p>The saved split is calculated securely from company percentages.</p></div><button type="button" className="icon-button ghost" onClick={onClose}><X/></button></div><div className="form-grid two"><Field label="Expense date"><input type="date" max={today()} value={form.expense_date} onChange={event => setForm({...form, expense_date: event.target.value})} required/></Field><Field label="Paying company"><select value={form.payer_company_id} onChange={event => setForm({...form, payer_company_id: event.target.value})}>{settings.companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></Field><Field label="Purchased by"><input value={form.purchaser_name} maxLength="150" onChange={event => setForm({...form, purchaser_name: event.target.value})} placeholder="e.g. Jay" required/></Field><Field label="Total amount"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={event => setForm({...form, amount: event.target.value})} required/></Field><Field label="Description"><input value={form.description} maxLength="255" onChange={event => setForm({...form, description: event.target.value})} placeholder="What was purchased?" required/></Field><Field label="Receipt (optional)"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setReceipt(event.target.files?.[0] || null)}/></Field></div><Field label="Notes (optional)"><textarea rows="3" value={form.notes} onChange={event => setForm({...form, notes: event.target.value})}/></Field>{entry?.receipt_url && <label className="toggle"><input type="checkbox" checked={form.remove_receipt} onChange={event => setForm({...form, remove_receipt: event.target.checked})}/><span/> Remove existing receipt</label>}<div className="expense-preview"><h3>Allocation preview</h3>{preview.map(row => <span key={row.id}><b>{row.name}</b><small>{number(row.percentage)}%</small><strong>₹{number(row.amount)}</strong>{String(row.id) === String(form.payer_company_id) && <i>Covered by payer</i>}</span>)}</div>{error && <div className="error">{error}</div>}<div className="form-actions"><span>Amounts are finalized server-side with paise rounding.</span><button className="primary" disabled={busy}>{busy ? 'Saving…' : entry ? 'Update expense' : 'Save expense'}</button></div></form></div>;
}

function SettlementForm({pair, onClose, onSaved}) {
    const [form, setForm] = useState({settled_on: today(), amount: pair.amount, notes: ''});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async event => {
        event.preventDefault(); setBusy(true); setError('');
        try { await api('expense-settlements', {method: 'POST', body: JSON.stringify({...form, from_company_id: pair.debtor_company.id, to_company_id: pair.creditor_company.id})}); await onSaved('Settlement recorded successfully.'); }
        catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
    };
    return <div className="modal-backdrop"><form className="modal settlement-modal" onSubmit={save}><div className="panel-head"><div><h2>Record settlement</h2><p>{pair.debtor_company.name} pays {pair.creditor_company.name}</p></div><button type="button" className="icon-button ghost" onClick={onClose}><X/></button></div><div className="settlement-balance"><small>Open balance</small><strong>₹{number(pair.amount)}</strong></div><div className="form-grid two"><Field label="Payment date"><input type="date" max={today()} value={form.settled_on} onChange={event => setForm({...form, settled_on: event.target.value})} required/></Field><Field label="Amount paid"><input type="number" min="0.01" max={pair.amount} step="0.01" inputMode="decimal" value={form.amount} onChange={event => setForm({...form, amount: event.target.value})} required/></Field></div><Field label="Reference / notes (optional)"><textarea rows="3" value={form.notes} onChange={event => setForm({...form, notes: event.target.value})}/></Field>{error && <div className="error">{error}</div>}<div className="form-actions"><span>Partial payments keep the remaining balance open.</span><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button></div></form></div>;
}
