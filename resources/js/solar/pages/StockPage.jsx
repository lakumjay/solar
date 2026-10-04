import React, {useEffect, useMemo, useState} from 'react';
import {Boxes, HandCoins, History, IndianRupee, Package, PackageCheck, PackagePlus, PencilLine, Plus, Search, TriangleAlert} from 'lucide-react';
import {api} from '../api';
import {Empty, Loading, Metric} from '../components/Common';
import {AddStockModal, BorrowingDetailModal, BorrowStockModal, ReturnStockModal, StockItemDetailModal, StockItemModal, StockPhotoModal} from '../components/StockModals';
import {number, shortDate} from '../format';

export default function StockPage({can, currentUser}) {
    const [inventory, setInventory] = useState(null);
    const [borrowings, setBorrowings] = useState([]);
    const [people, setPeople] = useState([]);
    const [search, setSearch] = useState('');
    const [borrowFilter, setBorrowFilter] = useState('open');
    const [itemForm, setItemForm] = useState(null);
    const [addStock, setAddStock] = useState(null);
    const [giveStock, setGiveStock] = useState(null);
    const [returnStock, setReturnStock] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [itemDetails, setItemDetails] = useState(null);
    const [details, setDetails] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const load = async () => {
        const [stock, borrowingRows, peopleRows] = await Promise.all([api('stock/items'), api('stock/borrowings'), api('stock/people')]);
        setInventory(stock); setBorrowings(borrowingRows); setPeople(peopleRows); setError('');
    };
    useEffect(() => { load().catch(failure => setError(failure.message)); }, []);
    const completed = async success => {
        setItemForm(null); setAddStock(null); setGiveStock(null); setReturnStock(null); setMessage(success); await load();
    };

    const filteredItems = useMemo(() => (inventory?.items || []).filter(item => item.name.toLowerCase().includes(search.toLowerCase())), [inventory, search]);
    const filteredBorrowings = useMemo(() => borrowings.filter(row => borrowFilter === 'all' || (borrowFilter === 'open' ? row.status !== 'returned' : row.status === 'returned')).filter(row => `${row.item.name} ${row.borrower_name} ${row.given_by?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [borrowings, borrowFilter, search]);

    if (error && !inventory) return <Empty title="Could not load stock" detail={error}/>;
    if (!inventory) return (
        <div className="stock-page" style={{padding: '12px'}}>
            <div className="cards stock-cards">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="skeleton-shimmer" style={{height: '90px', borderRadius: '14px', marginBottom: '12px'}}/>
                ))}
            </div>
            <div className="skeleton-shimmer" style={{height: '240px', borderRadius: '20px', marginTop: '16px'}}/>
        </div>
    );
    const summary = inventory.summary;

    return <div className="stock-page">
        <div className="cards stock-cards">
            <Metric icon={Boxes} title="Stock Items" value={summary.total_items} unit="active items"/>
            <Metric icon={Package} title="Total Quantity" value={summary.total_quantity}/>
            <Metric icon={PackageCheck} title="Available Quantity" value={summary.available_quantity}/>
            <Metric icon={HandCoins} title="Borrowed Quantity" value={summary.borrowed_quantity} color="amber"/>
            <Metric icon={IndianRupee} title="Total Stock Value" value={summary.total_value} unit="INR"/>
            <Metric icon={TriangleAlert} title="Low Stock" value={summary.low_stock_items} unit="items" color="amber"/>
        </div>
        {message && <div className="success" style={{borderRadius: '12px', fontWeight: 600}}>{message}</div>}
        {error && <div className="error" style={{borderRadius: '12px', fontWeight: 600}}>{error}</div>}
        
        <section className="panel solar-glass-card" style={{borderRadius: '20px', padding: '16px 20px'}}>
            <div className="stock-toolbar" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'}}>
                <div style={{flex: 1, minWidth: '220px'}}>
                    <div className="search-input-wrap">
                        <Search size={18}/>
                        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="આઇટમ અથવા વ્યક્તિ શોધો (Search stock or borrower)..."/>
                    </div>
                </div>
                <div className="stock-toolbar-actions" style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                    {can('issue_stock') && <button className="btn-secondary-glass" onClick={() => setGiveStock({})}><HandCoins size={16}/> Give stock</button>}
                    {can('manage_stock') && <button className="btn-primary-glow" onClick={() => setItemForm({new: true})}><Plus size={16}/> Add item</button>}
                </div>
            </div>
        </section>

        <section className="panel solar-glass-card" style={{borderRadius: '20px', padding: '20px'}}>
            <div className="panel-head" style={{marginBottom: '16px'}}>
                <div>
                    <h2 style={{color: '#14211A', fontSize: '18px', fontWeight: '700'}}>Stock items</h2>
                    <p style={{color: '#4B5C52', fontSize: '13px', margin: '4px 0 0'}}>Common inventory shared across all companies.</p>
                </div>
            </div>
            {filteredItems.length ? (
                <div className="table-wrap table-scroll-hint">
                    <table className="stock-table">
                        <thead>
                            <tr>
                                <th>Image</th>
                                <th>Stock name</th>
                                <th>Unit price</th>
                                <th>Total quantity</th>
                                <th>Available</th>
                                <th>Borrowed</th>
                                <th>Total price</th>
                                <th>Status</th>
                                <th/>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <button className="photo-preview-button" onClick={() => setPhoto({url: item.image_url, name: item.name})}>
                                            <img className="stock-thumb" src={item.image_url} alt={item.name} style={{borderRadius: '10px'}}/>
                                        </button>
                                    </td>
                                    <td><b>{item.name}</b>{item.notes && <small style={{display: 'block', color: '#64748B'}}>{item.notes}</small>}</td>
                                    <td style={{fontFamily: 'var(--font-mono)'}}>₹{number(item.unit_price)}</td>
                                    <td style={{fontFamily: 'var(--font-mono)'}}>{number(item.total_quantity)}</td>
                                    <td className={item.is_low_stock ? 'danger-text strong' : 'strong'} style={{fontFamily: 'var(--font-mono)'}}>{number(item.available_quantity)}</td>
                                    <td style={{fontFamily: 'var(--font-mono)'}}>{number(item.borrowed_quantity)}</td>
                                    <td style={{fontFamily: 'var(--font-mono)'}}>₹{number(item.total_value)}</td>
                                    <td><i className={`status ${item.active ? item.is_low_stock ? 'warning' : 'on' : ''}`}>{item.active ? item.is_low_stock ? 'Low stock' : 'Active' : 'Inactive'}</i></td>
                                    <td>
                                        <div className="row-actions">
                                            <button className="link" onClick={() => setItemDetails(item)}><History size={14}/> History</button>
                                            {can('issue_stock') && item.active && item.available_quantity > 0 && <button className="link" onClick={() => setGiveStock(item)}><HandCoins size={14}/> Give</button>}
                                            {can('manage_stock') && <>
                                                <button className="link" onClick={() => setAddStock(item)}><PackagePlus size={14}/> Add</button>
                                                <button className="link" onClick={() => setItemForm(item)}><PencilLine size={14}/> Edit</button>
                                            </>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Empty title="No stock items" detail="Add the first stock item or change your search."/>
            )}
        </section>

        <section className="panel solar-glass-card" style={{borderRadius: '20px', padding: '20px'}}>
            <div className="panel-head borrowing-head" style={{marginBottom: '16px'}}>
                <div>
                    <h2 style={{color: '#14211A', fontSize: '18px', fontWeight: '700'}}>Borrowing register</h2>
                    <p style={{color: '#4B5C52', fontSize: '13px', margin: '4px 0 0'}}>Issued, partially returned and completed stock history.</p>
                </div>
                <select className="compact-select" value={borrowFilter} onChange={event => setBorrowFilter(event.target.value)} style={{borderRadius: '10px', fontWeight: 600}}>
                    <option value="open">Open returns</option>
                    <option value="returned">Fully returned</option>
                    <option value="all">All records</option>
                </select>
            </div>
            {filteredBorrowings.length ? (
                <div className="table-wrap table-scroll-hint">
                    <table className="stock-table">
                        <thead>
                            <tr>
                                <th>Stock / borrower</th>
                                <th>Given</th>
                                <th>Returned</th>
                                <th>Pending</th>
                                <th>Given by</th>
                                <th>Borrow date</th>
                                <th>Expected return</th>
                                <th>Status</th>
                                <th/>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBorrowings.map(row => (
                                <tr key={row.id}>
                                    <td><b>{row.item.name}</b><small style={{display: 'block', color: '#64748B'}}>{row.borrower_name}{row.borrower_mobile ? ` · ${row.borrower_mobile}` : ''}</small></td>
                                    <td style={{fontFamily: 'var(--font-mono)'}}>{number(row.quantity)}</td>
                                    <td style={{fontFamily: 'var(--font-mono)'}}>{number(row.returned_quantity)}</td>
                                    <td className="strong" style={{fontFamily: 'var(--font-mono)'}}>{number(row.pending_quantity)}</td>
                                    <td>{row.given_by?.name || '—'}</td>
                                    <td>{shortDate(row.borrowed_on)}</td>
                                    <td>{shortDate(row.expected_return_date)}</td>
                                    <td><i className={`status ${row.status === 'returned' ? 'on' : row.status === 'partially_returned' ? 'warning' : ''}`}>{row.status.replaceAll('_', ' ')}</i></td>
                                    <td>
                                        <div className="row-actions">
                                            <button className="link" onClick={() => setDetails(row)}>View</button>
                                            {can('return_stock') && row.status !== 'returned' && <button className="link" onClick={() => setReturnStock(row)}><PackageCheck size={14}/> Return</button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Empty title="No borrowing records" detail={borrowFilter === 'open' ? 'There are no pending stock returns.' : 'No records match this filter.'}/>
            )}
        </section>

        {itemForm && <StockItemModal item={itemForm.new ? null : itemForm} onClose={() => setItemForm(null)} onSaved={completed}/>} 
        {addStock && <AddStockModal item={addStock} onClose={() => setAddStock(null)} onSaved={completed}/>} 
        {giveStock && <BorrowStockModal items={inventory.items} people={people} currentUser={currentUser} selectedItem={giveStock.id ? giveStock : null} onClose={() => setGiveStock(null)} onSaved={completed}/>} 
        {returnStock && <ReturnStockModal borrowing={returnStock} people={people} currentUser={currentUser} onClose={() => setReturnStock(null)} onSaved={completed}/>} 
        {photo && <StockPhotoModal photo={photo} onClose={() => setPhoto(null)}/>} 
        {itemDetails && <StockItemDetailModal item={itemDetails} onClose={() => setItemDetails(null)}/>} 
        {details && <BorrowingDetailModal borrowing={details} onClose={() => setDetails(null)}/>} 
    </div>;
}
