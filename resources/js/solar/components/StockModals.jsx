import React, {useEffect, useMemo, useState} from 'react';
import {Camera, PackagePlus, RotateCcw, X} from 'lucide-react';
import {api} from '../api';
import {fixedTwo, number, shortDate} from '../format';
import {DatePicker, Field} from './Common';

const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function ModalHead({title, detail, onClose}) {
    return <div className="panel-head"><div><h2>{title}</h2><p>{detail}</p></div><button type="button" className="icon-button ghost" onClick={onClose} aria-label="Close"><X/></button></div>;
}

export function StockItemModal({item, onClose, onSaved}) {
    const [form, setForm] = useState(item ? {...item} : {name: '', unit_price: '', opening_quantity: '', low_stock_threshold: '0.00', notes: '', active: true});
    const [imageFile, setImageFile] = useState(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const preview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : item?.image_url, [imageFile, item]);
    useEffect(() => () => { if (imageFile && preview) URL.revokeObjectURL(preview); }, [imageFile, preview]);

    const save = async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        const body = new FormData();
        if (item?.id) body.append('id', item.id);
        body.append('name', form.name);
        body.append('unit_price', fixedTwo(form.unit_price));
        if (!item?.id) body.append('opening_quantity', fixedTwo(form.opening_quantity));
        body.append('low_stock_threshold', fixedTwo(form.low_stock_threshold));
        body.append('active', form.active ? '1' : '0');
        if (form.notes) body.append('notes', form.notes);
        if (imageFile) body.append('image', imageFile);
        try {
            await api('stock/items', {method: 'POST', body});
            await onSaved('Stock item saved successfully.');
        } catch (error) { setMessage(error.message); setBusy(false); }
    };

    return <div className="modal-backdrop"><form className="modal stock-form-modal" onSubmit={save}>
        <ModalHead title={item ? 'Edit stock item' : 'Add stock item'} detail="Stock is common across all companies." onClose={onClose}/>
        <label className="stock-image-upload"><span>{preview ? <img src={preview} alt="Stock preview"/> : <Camera/>}</span><div><b>Item image</b><small>{item ? 'Select a file only when replacing the image.' : 'Required · JPG, PNG or WebP up to 5 MB'}</small></div><input type="file" accept="image/jpeg,image/png,image/webp" required={!item} onChange={event => setImageFile(event.target.files[0] || null)}/></label>
        <div className="form-grid two"><Field label="Stock name"><input value={form.name} onChange={event => setForm({...form, name: event.target.value})} maxLength="150" required/></Field><Field label="Unit price"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.unit_price} onChange={event => setForm({...form, unit_price: event.target.value})} onBlur={event => setForm(current => ({...current, unit_price: fixedTwo(event.target.value)}))} required/></Field>{!item && <Field label="Opening quantity"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.opening_quantity} onChange={event => setForm({...form, opening_quantity: event.target.value})} onBlur={event => setForm(current => ({...current, opening_quantity: fixedTwo(event.target.value)}))} required/></Field>}<Field label="Low-stock alert at"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.low_stock_threshold} onChange={event => setForm({...form, low_stock_threshold: event.target.value})} onBlur={event => setForm(current => ({...current, low_stock_threshold: fixedTwo(event.target.value)}))} required/></Field></div>
        <Field label="Notes"><textarea value={form.notes || ''} onChange={event => setForm({...form, notes: event.target.value})} rows="3"/></Field>
        <label className="toggle"><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm({...form, active: event.target.checked})}/><span/> Item active</label>
        {message && <div className="error">{message}</div>}
        <div className="form-actions"><span>{item ? `Owned quantity: ${number(item.total_quantity)}` : 'Opening quantity creates the first stock movement.'}</span><button className="primary" disabled={busy}>Save item</button></div>
    </form></div>;
}

export function AddStockModal({item, onClose, onSaved}) {
    const [form, setForm] = useState({quantity: '', unit_price: fixedTwo(item.unit_price), notes: ''});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const save = async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            await api(`stock/items/${item.id}/add`, {method: 'POST', body: JSON.stringify({...form, quantity: fixedTwo(form.quantity), unit_price: fixedTwo(form.unit_price)})});
            await onSaved('Stock quantity added successfully.');
        } catch (error) { setMessage(error.message); setBusy(false); }
    };

    return <div className="modal-backdrop"><form className="modal compact-stock-modal" onSubmit={save}><ModalHead title="Add stock quantity" detail={`${item.name} · Current quantity ${number(item.total_quantity)}`} onClose={onClose}/><div className="form-grid two"><Field label="Add quantity"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.quantity} onChange={event => setForm({...form, quantity: event.target.value})} required/></Field><Field label="Current unit price"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.unit_price} onChange={event => setForm({...form, unit_price: event.target.value})} required/></Field></div><Field label="Purchase note"><textarea rows="3" value={form.notes} onChange={event => setForm({...form, notes: event.target.value})}/></Field>{message && <div className="error">{message}</div>}<div className="form-actions"><button className="primary" disabled={busy}><PackagePlus size={16}/> Add quantity</button></div></form></div>;
}

export function BorrowStockModal({items, people, currentUser, selectedItem, onClose, onSaved}) {
    const availableItems = items.filter(item => item.active && item.available_quantity > 0);
    const defaultPerson = people.some(person => person.id === currentUser.id) ? currentUser.id : people[0]?.id || '';
    const [form, setForm] = useState({stock_item_id: selectedItem?.id || availableItems[0]?.id || '', borrower_name: '', borrower_mobile: '', quantity: '', borrowed_on: localDate(), expected_return_date: '', given_by_user_id: defaultPerson, notes: ''});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const item = items.find(row => String(row.id) === String(form.stock_item_id));
    const save = async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            await api('stock/borrowings', {method: 'POST', body: JSON.stringify({...form, quantity: fixedTwo(form.quantity), expected_return_date: form.expected_return_date || null})});
            await onSaved('Stock issued successfully.');
        } catch (error) { setMessage(error.message); setBusy(false); }
    };

    return <div className="modal-backdrop"><form className="modal stock-form-modal" onSubmit={save}><ModalHead title="Give stock to borrower" detail="Available quantity will reduce until the stock is returned." onClose={onClose}/>{availableItems.length ? <><div className="form-grid two"><Field label="Stock item"><select value={form.stock_item_id} onChange={event => setForm({...form, stock_item_id: event.target.value})}>{availableItems.map(row => <option value={row.id} key={row.id}>{row.name} · {number(row.available_quantity)} available</option>)}</select></Field><Field label="Borrow quantity"><input type="number" min="0.01" max={item?.available_quantity} step="0.01" inputMode="decimal" value={form.quantity} onChange={event => setForm({...form, quantity: event.target.value})} required/></Field><Field label="Opposite party / borrower"><input value={form.borrower_name} onChange={event => setForm({...form, borrower_name: event.target.value})} required/></Field><Field label="Borrower mobile"><input type="tel" value={form.borrower_mobile} onChange={event => setForm({...form, borrower_mobile: event.target.value})}/></Field></div><div className="form-grid two stock-date-grid"><DatePicker label="Borrow date" value={form.borrowed_on} onChange={value => setForm({...form, borrowed_on: value})}/><Field label="Expected return (optional)"><input type="date" value={form.expected_return_date} onChange={event => setForm({...form, expected_return_date: event.target.value})}/></Field><Field label="Given by"><select value={form.given_by_user_id} onChange={event => setForm({...form, given_by_user_id: event.target.value})}>{people.map(person => <option value={person.id} key={person.id}>{person.name} · {(person.employee_code || person.role).replaceAll('_', ' ')}</option>)}</select></Field></div><Field label="Notes"><textarea rows="3" value={form.notes} onChange={event => setForm({...form, notes: event.target.value})}/></Field></> : <div className="info-banner">No active stock item currently has available quantity.</div>}{message && <div className="error">{message}</div>}<div className="form-actions"><span>{item ? `${number(item.available_quantity)} available` : 'Add stock before issuing.'}</span><button className="primary" disabled={busy || !availableItems.length}>Give stock</button></div></form></div>;
}

export function ReturnStockModal({borrowing, people, currentUser, onClose, onSaved}) {
    const defaultPerson = people.some(person => person.id === currentUser.id) ? currentUser.id : people[0]?.id || '';
    const [form, setForm] = useState({quantity: fixedTwo(borrowing.pending_quantity), returned_on: localDate(), received_by_user_id: defaultPerson, notes: ''});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const save = async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            await api(`stock/borrowings/${borrowing.id}/returns`, {method: 'POST', body: JSON.stringify({...form, quantity: fixedTwo(form.quantity)})});
            await onSaved('Returned stock received successfully.');
        } catch (error) { setMessage(error.message); setBusy(false); }
    };

    return <div className="modal-backdrop"><form className="modal compact-stock-modal" onSubmit={save}><ModalHead title="Receive returned stock" detail={`${borrowing.item.name} · ${number(borrowing.pending_quantity)} pending from ${borrowing.borrower_name}`} onClose={onClose}/><div className="form-grid two"><Field label="Returned quantity"><input type="number" min="0.01" max={borrowing.pending_quantity} step="0.01" inputMode="decimal" value={form.quantity} onChange={event => setForm({...form, quantity: event.target.value})} required/></Field><DatePicker label="Return date" value={form.returned_on} onChange={value => setForm({...form, returned_on: value})}/><Field label="Received by"><select value={form.received_by_user_id} onChange={event => setForm({...form, received_by_user_id: event.target.value})}>{people.map(person => <option value={person.id} key={person.id}>{person.name} · {(person.employee_code || person.role).replaceAll('_', ' ')}</option>)}</select></Field></div><Field label="Return note"><textarea rows="3" value={form.notes} onChange={event => setForm({...form, notes: event.target.value})}/></Field>{message && <div className="error">{message}</div>}<div className="form-actions"><button className="primary" disabled={busy}><RotateCcw size={16}/> Receive stock</button></div></form></div>;
}

export function StockPhotoModal({photo, onClose}) {
    return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal stock-photo-modal" role="dialog" aria-modal="true"><ModalHead title={photo.name} detail="Stock item image" onClose={onClose}/><img src={photo.url} alt={photo.name}/></div></div>;
}

export function StockItemDetailModal({item, onClose}) {
    const movementLabel = type => type === 'opening' ? 'Opening stock' : type === 'stock_in' ? 'Stock added' : type.replaceAll('_', ' ');

    return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal stock-history-modal" role="dialog" aria-modal="true"><ModalHead title={`${item.name} history`} detail="Opening stock and every later stock addition." onClose={onClose}/><div className="stock-detail-grid"><span><small>Total quantity</small><b>{number(item.total_quantity)}</b></span><span><small>Available</small><b>{number(item.available_quantity)}</b></span><span><small>Borrowed</small><b>{number(item.borrowed_quantity)}</b></span><span><small>Unit price</small><b>₹{number(item.unit_price)}</b></span><span><small>Total value</small><b>₹{number(item.total_value)}</b></span><span><small>Status</small><b>{item.active ? item.is_low_stock ? 'Low stock' : 'Active' : 'Inactive'}</b></span></div>{item.notes && <div className="info-banner">{item.notes}</div>}<h3 className="section-title">Stock movement history</h3>{item.movements?.length ? <div className="stock-return-history stock-movement-history">{item.movements.map(row => <div key={row.id}><span><b>{movementLabel(row.type)} · {number(row.quantity)}</b><small>{shortDate(row.created_at)} · by {row.creator?.name || 'Unknown'}</small></span><p>₹{number(row.unit_price)} each{row.notes ? ` · ${row.notes}` : ''}</p></div>)}</div> : <div className="info-banner">No stock movement has been recorded yet.</div>}</div></div>;
}

export function BorrowingDetailModal({borrowing, onClose}) {
    return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal stock-history-modal"><ModalHead title="Borrowing details" detail={`${borrowing.item.name} · ${borrowing.borrower_name}`} onClose={onClose}/><div className="stock-detail-grid"><span><small>Given quantity</small><b>{number(borrowing.quantity)}</b></span><span><small>Returned</small><b>{number(borrowing.returned_quantity)}</b></span><span><small>Pending</small><b>{number(borrowing.pending_quantity)}</b></span><span><small>Given by</small><b>{borrowing.given_by?.name || '—'}</b></span><span><small>Borrow date</small><b>{shortDate(borrowing.borrowed_on)}</b></span><span><small>Expected return</small><b>{shortDate(borrowing.expected_return_date)}</b></span></div>{borrowing.notes && <div className="info-banner">{borrowing.notes}</div>}<h3 className="section-title">Return history</h3>{borrowing.returns.length ? <div className="stock-return-history">{borrowing.returns.map(row => <div key={row.id}><span><b>{number(row.quantity)} returned</b><small>{shortDate(row.returned_on)} · received by {row.received_by?.name || 'Unknown'}</small></span><p>{row.notes || 'No note'}</p></div>)}</div> : <div className="info-banner">No quantity has been returned yet.</div>}</div></div>;
}
