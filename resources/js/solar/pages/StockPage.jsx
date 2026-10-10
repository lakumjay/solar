import React, {useEffect, useMemo, useState} from 'react';
import {Boxes, HandCoins, History, IndianRupee, LayoutGrid, Package, PackageCheck, PackagePlus, PencilLine, Plus, Search, Table, TriangleAlert} from 'lucide-react';
import {api} from '../api';
import {Empty, Loading, Metric} from '../components/Common';
import {AddStockModal, BorrowingDetailModal, BorrowStockModal, ReturnStockModal, StockItemDetailModal, StockItemModal, StockPhotoModal} from '../components/StockModals';
import {number, shortDate} from '../format';
import {useTranslation} from '../context/LanguageContext';

export default function StockPage({can, currentUser}) {
    const { t, lang } = useTranslation();
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

    // Table / Card view modes
    const [stockViewMode, setStockViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));
    const [borrowViewMode, setBorrowViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));

    // 5-entry pagination states
    const PAGE_SIZE = 5;
    const [itemsPage, setItemsPage] = useState(1);
    const [borrowingsPage, setBorrowingsPage] = useState(1);

    const load = async () => {
        const [stock, borrowingRows, peopleRows] = await Promise.all([api('stock/items'), api('stock/borrowings'), api('stock/people')]);
        setInventory(stock);
        setBorrowings(borrowingRows);
        setPeople(peopleRows);
        setError('');
    };

    useEffect(() => {
        load().catch(failure => setError(failure.message));
    }, []);

    const completed = async success => {
        setItemForm(null);
        setAddStock(null);
        setGiveStock(null);
        setReturnStock(null);
        setMessage(success);
        await load();
    };

    // Filter items
    const filteredItems = useMemo(() => {
        return (inventory?.items || []).filter(item =>
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            (item.notes && item.notes.toLowerCase().includes(search.toLowerCase()))
        );
    }, [inventory, search]);

    // Paginate items (5 per page)
    const itemsTotalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    const safeItemsPage = Math.min(Math.max(1, itemsPage), itemsTotalPages);
    const paginatedItems = useMemo(() => {
        const start = (safeItemsPage - 1) * PAGE_SIZE;
        return filteredItems.slice(start, start + PAGE_SIZE);
    }, [filteredItems, safeItemsPage]);

    // Filter borrowings
    const filteredBorrowings = useMemo(() => {
        return borrowings
            .filter(row => borrowFilter === 'all' || (borrowFilter === 'open' ? row.status !== 'returned' : row.status === 'returned'))
            .filter(row => `${row.item?.name || ''} ${row.borrower_name || ''} ${row.given_by?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
    }, [borrowings, borrowFilter, search]);

    // Paginate borrowings (5 per page)
    const borrowingsTotalPages = Math.max(1, Math.ceil(filteredBorrowings.length / PAGE_SIZE));
    const safeBorrowingsPage = Math.min(Math.max(1, borrowingsPage), borrowingsTotalPages);
    const paginatedBorrowings = useMemo(() => {
        const start = (safeBorrowingsPage - 1) * PAGE_SIZE;
        return filteredBorrowings.slice(start, start + PAGE_SIZE);
    }, [filteredBorrowings, safeBorrowingsPage]);

    if (error && !inventory) return <Empty title="Could not load stock" detail={error}/>;
    if (!inventory) return <Loading/>;
    const summary = inventory.summary;

    return (
        <div className="stock-page">
            {/* Compact Metric Boxes - 4 columns on desktop / compact on mobile */}
            <div className="cards stock-cards compact-stock-grid">
                <Metric icon={Boxes} title={t('totalStockItems', 'Stock Items')} value={summary.total_items} unit={lang === 'en' ? 'active items' : 'આઇટમ્સ'}/>
                <Metric icon={Package} title={lang === 'en' ? 'Total Quantity' : 'કુલ જથ્થો'} value={summary.total_quantity} unit={lang === 'en' ? 'units' : 'નંગ'}/>
                <Metric icon={PackageCheck} title={t('availableQty', 'Available')} value={summary.available_quantity} unit={lang === 'en' ? 'units' : 'નંગ'}/>
                <Metric icon={HandCoins} title={t('activeBorrowings', 'Borrowed')} value={summary.borrowed_quantity} unit={lang === 'en' ? 'units' : 'નંગ'} color="amber"/>
                <Metric icon={IndianRupee} title={lang === 'en' ? 'Stock Value' : 'સ્ટોક વેલ્યુ'} value={summary.total_value} unit="INR"/>
                <Metric icon={TriangleAlert} title={t('lowStockItems', 'Low Stock')} value={summary.low_stock_items} unit={lang === 'en' ? 'items' : 'આઇટમ્સ'} color="amber"/>
            </div>

            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}

            {/* Toolbar */}
            <section className="panel">
                <div className="stock-toolbar">
                    <label className="search-box">
                        <span>{lang === 'en' ? 'Search stock or borrower' : 'સામાન અથવા લેનારનું નામ શોધો'}</span>
                        <div>
                            <Search size={16}/>
                            <input
                                value={search}
                                onChange={event => {
                                    setSearch(event.target.value);
                                    setItemsPage(1);
                                    setBorrowingsPage(1);
                                }}
                                placeholder={lang === 'en' ? 'Name, borrower or giver' : 'આઇટમ, લેનાર કે આપનારનું નામ...'}
                            />
                        </div>
                    </label>
                    <div className="stock-toolbar-actions">
                        {can('issue_stock') && (
                            <button className="secondary" onClick={() => setGiveStock({})}>
                                <HandCoins size={16}/> {t('giveStockBtn', 'Give stock')}
                            </button>
                        )}
                        {can('manage_stock') && (
                            <button className="primary" onClick={() => setItemForm({new: true})}>
                                <Plus size={16}/> {t('addStockItemBtn', 'Add item')}
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* SECTION 1: Stock Items */}
            <section className="panel">
                <div className="panel-head" style={{alignItems: 'center'}}>
                    <div>
                        <h2>{t('stockItemsTab', 'Stock items')} ({filteredItems.length})</h2>
                        <p>{t('stockInventorySubtitle', 'Common inventory shared across all partner companies.')}</p>
                    </div>
                    <button
                        type="button"
                        className="secondary view-toggle-btn"
                        onClick={() => setStockViewMode(v => v === 'cards' ? 'table' : 'cards')}
                        style={{fontSize: '11px', padding: '5px 10px'}}
                        title="Toggle Card or Table View"
                    >
                        {stockViewMode === 'cards' ? <Table size={14}/> : <LayoutGrid size={14}/>}
                        <span>{stockViewMode === 'cards' ? t('tableView', 'Table View') : t('cardView', 'Card View')}</span>
                    </button>
                </div>

                {filteredItems.length ? (
                    <>
                        {stockViewMode === 'cards' ? (
                            <div className="stock-cards-grid">
                                {paginatedItems.map(item => (
                                    <div className="stock-item-card" key={item.id}>
                                        <div className="sic-header">
                                            <button
                                                type="button"
                                                className="sic-photo-btn"
                                                onClick={() => setPhoto({url: item.image_url, name: item.name})}
                                            >
                                                <img src={item.image_url} alt={item.name} loading="lazy"/>
                                            </button>
                                            <div className="sic-title-wrap">
                                                <b className="sic-name">{item.name}</b>
                                                {item.notes && <small className="sic-notes">{item.notes}</small>}
                                                <div className="sic-price">₹{number(item.unit_price)} <small>/ unit</small></div>
                                            </div>
                                        </div>

                                        <div className="sic-stats-grid">
                                            <div className="sic-stat">
                                                <small>Available</small>
                                                <b className={item.is_low_stock ? 'danger-text' : 'green-text'}>
                                                    {number(item.available_quantity)}
                                                </b>
                                            </div>
                                            <div className="sic-stat">
                                                <small>Borrowed</small>
                                                <b>{number(item.borrowed_quantity)}</b>
                                            </div>
                                            <div className="sic-stat">
                                                <small>Total Qty</small>
                                                <b>{number(item.total_quantity)}</b>
                                            </div>
                                            <div className="sic-stat">
                                                <small>Total Value</small>
                                                <b>₹{number(item.total_value)}</b>
                                            </div>
                                        </div>

                                        <div className="sic-footer">
                                            <i className={`status ${item.active ? item.is_low_stock ? 'warning' : 'on' : ''}`}>
                                                {item.active ? item.is_low_stock ? 'Low stock' : 'Active' : 'Inactive'}
                                            </i>
                                            <div className="row-actions">
                                                <button className="link" onClick={() => setItemDetails(item)}>
                                                    <History size={13}/> History
                                                </button>
                                                {can('issue_stock') && item.active && item.available_quantity > 0 && (
                                                    <button className="link" onClick={() => setGiveStock(item)}>
                                                        <HandCoins size={13}/> Give
                                                    </button>
                                                )}
                                                {can('manage_stock') && (
                                                    <>
                                                        <button className="link" onClick={() => setAddStock(item)}>
                                                            <PackagePlus size={13}/> Add
                                                        </button>
                                                        <button className="link" onClick={() => setItemForm(item)}>
                                                            <PencilLine size={13}/> Edit
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="table-wrap">
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
                                        {paginatedItems.map(item => (
                                            <tr key={item.id}>
                                                <td>
                                                    <button className="photo-preview-button" onClick={() => setPhoto({url: item.image_url, name: item.name})}>
                                                        <img className="stock-thumb" src={item.image_url} alt={item.name} loading="lazy"/>
                                                    </button>
                                                </td>
                                                <td>
                                                    <b>{item.name}</b>
                                                    {item.notes && <small>{item.notes}</small>}
                                                </td>
                                                <td>₹{number(item.unit_price)}</td>
                                                <td>{number(item.total_quantity)}</td>
                                                <td className={item.is_low_stock ? 'danger-text strong' : 'strong'}>
                                                    {number(item.available_quantity)}
                                                </td>
                                                <td>{number(item.borrowed_quantity)}</td>
                                                <td>₹{number(item.total_value)}</td>
                                                <td>
                                                    <i className={`status ${item.active ? item.is_low_stock ? 'warning' : 'on' : ''}`}>
                                                        {item.active ? item.is_low_stock ? 'Low stock' : 'Active' : 'Inactive'}
                                                    </i>
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button className="link" onClick={() => setItemDetails(item)}>
                                                            <History size={14}/> History
                                                        </button>
                                                        {can('issue_stock') && item.active && item.available_quantity > 0 && (
                                                            <button className="link" onClick={() => setGiveStock(item)}>
                                                                <HandCoins size={14}/> Give
                                                            </button>
                                                        )}
                                                        {can('manage_stock') && (
                                                            <>
                                                                <button className="link" onClick={() => setAddStock(item)}>
                                                                    <PackagePlus size={14}/> Add stock
                                                                </button>
                                                                <button className="link" onClick={() => setItemForm(item)}>
                                                                    <PencilLine size={14}/> Edit
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination for Stock Items (Threshold: 5) */}
                        {itemsTotalPages > 1 && (
                            <div className="expense-pagination-bar">
                                <div className="pagination-info">
                                    Showing {(safeItemsPage - 1) * PAGE_SIZE + 1}–{Math.min(safeItemsPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length} items
                                </div>
                                <div className="pagination-pages">
                                    <button
                                        type="button"
                                        className="pagination-nav-btn"
                                        disabled={safeItemsPage <= 1}
                                        onClick={() => setItemsPage(p => Math.max(1, p - 1))}
                                    >
                                        ‹ Prev
                                    </button>
                                    {Array.from({length: itemsTotalPages}, (_, i) => i + 1).map(pageNum => (
                                        <button
                                            key={pageNum}
                                            type="button"
                                            className={`pagination-tab-btn ${safeItemsPage === pageNum ? 'active' : ''}`}
                                            onClick={() => setItemsPage(pageNum)}
                                        >
                                            {pageNum}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="pagination-nav-btn"
                                        disabled={safeItemsPage >= itemsTotalPages}
                                        onClick={() => setItemsPage(p => Math.min(itemsTotalPages, p + 1))}
                                    >
                                        Next ›
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <Empty title="No stock items" detail="Add the first stock item or change your search."/>
                )}
            </section>

            {/* SECTION 2: Borrowing Register */}
            <section className="panel">
                <div className="panel-head borrowing-head" style={{alignItems: 'center'}}>
                    <div>
                        <h2>Borrowing register ({filteredBorrowings.length})</h2>
                        <p>Issued, partially returned and completed stock history.</p>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <select
                            className="compact-select"
                            value={borrowFilter}
                            onChange={event => {
                                setBorrowFilter(event.target.value);
                                setBorrowingsPage(1);
                            }}
                        >
                            <option value="open">Open returns</option>
                            <option value="returned">Fully returned</option>
                            <option value="all">All records</option>
                        </select>
                        <button
                            type="button"
                            className="secondary view-toggle-btn"
                            onClick={() => setBorrowViewMode(v => v === 'cards' ? 'table' : 'cards')}
                            style={{fontSize: '11px', padding: '5px 10px'}}
                            title="Toggle Card or Table View"
                        >
                            {borrowViewMode === 'cards' ? <Table size={14}/> : <LayoutGrid size={14}/>}
                            <span>{borrowViewMode === 'cards' ? 'Table View' : 'Card View'}</span>
                        </button>
                    </div>
                </div>

                {filteredBorrowings.length ? (
                    <>
                        {borrowViewMode === 'cards' ? (
                            <div className="stock-cards-grid">
                                {paginatedBorrowings.map(row => (
                                    <div className="stock-borrow-card" key={row.id}>
                                        <div className="sbc-header">
                                            <div>
                                                <b className="sbc-item">{row.item?.name}</b>
                                                <div className="sbc-borrower">
                                                    <b>{row.borrower_name}</b>
                                                    {row.borrower_mobile && <small> · {row.borrower_mobile}</small>}
                                                </div>
                                            </div>
                                            <i className={`status ${row.status === 'returned' ? 'on' : row.status === 'partially_returned' ? 'warning' : ''}`}>
                                                {row.status?.replaceAll('_', ' ')}
                                            </i>
                                        </div>

                                        <div className="sbc-stats-row">
                                            <div className="sbc-stat">
                                                <small>Given</small>
                                                <b>{number(row.quantity)}</b>
                                            </div>
                                            <div className="sbc-stat">
                                                <small>Returned</small>
                                                <b>{number(row.returned_quantity)}</b>
                                            </div>
                                            <div className="sbc-stat">
                                                <small>Pending</small>
                                                <b className={row.pending_quantity > 0 ? 'danger-text' : 'green-text'}>
                                                    {number(row.pending_quantity)}
                                                </b>
                                            </div>
                                        </div>

                                        <div className="sbc-dates">
                                            <span>Issued: <b>{shortDate(row.borrowed_on)}</b></span>
                                            {row.expected_return_date && <span>Return by: <b>{shortDate(row.expected_return_date)}</b></span>}
                                            {row.given_by?.name && <span>By: <b>{row.given_by.name}</b></span>}
                                        </div>

                                        <div className="sbc-footer">
                                            <button className="link" onClick={() => setDetails(row)}>
                                                View Details
                                            </button>
                                            {can('return_stock') && row.status !== 'returned' && (
                                                <button className="primary" style={{padding: '5px 12px', fontSize: '12px'}} onClick={() => setReturnStock(row)}>
                                                    <PackageCheck size={14}/> Return Stock
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="table-wrap">
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
                                        {paginatedBorrowings.map(row => (
                                            <tr key={row.id}>
                                                <td>
                                                    <b>{row.item?.name}</b>
                                                    <small>{row.borrower_name}{row.borrower_mobile ? ` · ${row.borrower_mobile}` : ''}</small>
                                                </td>
                                                <td>{number(row.quantity)}</td>
                                                <td>{number(row.returned_quantity)}</td>
                                                <td className="strong">{number(row.pending_quantity)}</td>
                                                <td>{row.given_by?.name || '—'}</td>
                                                <td>{shortDate(row.borrowed_on)}</td>
                                                <td>{shortDate(row.expected_return_date)}</td>
                                                <td>
                                                    <i className={`status ${row.status === 'returned' ? 'on' : row.status === 'partially_returned' ? 'warning' : ''}`}>
                                                        {row.status?.replaceAll('_', ' ')}
                                                    </i>
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button className="link" onClick={() => setDetails(row)}>View</button>
                                                        {can('return_stock') && row.status !== 'returned' && (
                                                            <button className="link" onClick={() => setReturnStock(row)}>
                                                                <PackageCheck size={14}/> Return
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination for Borrowings (Threshold: 5) */}
                        {borrowingsTotalPages > 1 && (
                            <div className="expense-pagination-bar">
                                <div className="pagination-info">
                                    Showing {(safeBorrowingsPage - 1) * PAGE_SIZE + 1}–{Math.min(safeBorrowingsPage * PAGE_SIZE, filteredBorrowings.length)} of {filteredBorrowings.length} records
                                </div>
                                <div className="pagination-pages">
                                    <button
                                        type="button"
                                        className="pagination-nav-btn"
                                        disabled={safeBorrowingsPage <= 1}
                                        onClick={() => setBorrowingsPage(p => Math.max(1, p - 1))}
                                    >
                                        ‹ Prev
                                    </button>
                                    {Array.from({length: borrowingsTotalPages}, (_, i) => i + 1).map(pageNum => (
                                        <button
                                            key={pageNum}
                                            type="button"
                                            className={`pagination-tab-btn ${safeBorrowingsPage === pageNum ? 'active' : ''}`}
                                            onClick={() => setBorrowingsPage(pageNum)}
                                        >
                                            {pageNum}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="pagination-nav-btn"
                                        disabled={safeBorrowingsPage >= borrowingsTotalPages}
                                        onClick={() => setBorrowingsPage(p => Math.min(borrowingsTotalPages, p + 1))}
                                    >
                                        Next ›
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <Empty title="No borrowing records" detail={borrowFilter === 'open' ? 'There are no pending stock returns.' : 'No records match this filter.'}/>
                )}
            </section>

            {/* Modals */}
            {itemForm && <StockItemModal item={itemForm.new ? null : itemForm} onClose={() => setItemForm(null)} onSaved={completed}/>}
            {addStock && <AddStockModal item={addStock} onClose={() => setAddStock(null)} onSaved={completed}/>}
            {giveStock && <BorrowStockModal items={inventory.items} people={people} currentUser={currentUser} selectedItem={giveStock.id ? giveStock : null} onClose={() => setGiveStock(null)} onSaved={completed}/>}
            {returnStock && <ReturnStockModal borrowing={returnStock} people={people} currentUser={currentUser} onClose={() => setReturnStock(null)} onSaved={completed}/>}
            {photo && <StockPhotoModal photo={photo} onClose={() => setPhoto(null)}/>}
            {itemDetails && <StockItemDetailModal item={itemDetails} onClose={() => setItemDetails(null)}/>}
            {details && <BorrowingDetailModal borrowing={details} onClose={() => setDetails(null)}/>}
        </div>
    );
}
