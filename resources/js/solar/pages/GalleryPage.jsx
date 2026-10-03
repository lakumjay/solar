import React, {useEffect, useState} from 'react';
import {Calendar, Camera, ChevronLeft, ChevronRight, Clock, ExternalLink, Filter, MapPin, Plus, RefreshCw, Settings, Trash2, User, X} from 'lucide-react';
import {api} from '../api';
import {DatePicker, Empty, Loading} from '../components/Common';
import LiveBackCameraModal from '../components/LiveBackCameraModal';

export default function GalleryPage({currentUser, companyId}) {
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [selectedCompany, setSelectedCompany] = useState(companyId || '');
    const [selectedTask, setSelectedTask] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState({photos: [], tasks: [], companies: []});
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const [touchStart, setTouchStart] = useState(null);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [activeTaskForCamera, setActiveTaskForCamera] = useState(null);

    // Task Editor State (Super Admin)
    const [editingTask, setEditingTask] = useState({
        id: null,
        title: '',
        start_time: '11:00',
        end_time: '12:00',
        required_photos: 2,
        description: '',
        company_id: '',
    });
    const [taskSaving, setTaskSaving] = useState(false);
    const [taskMessage, setTaskMessage] = useState('');

    const isSuperAdmin = currentUser?.role === 'super_admin';
    const isCompanyAdmin = currentUser?.role === 'company_admin';
    const isEmployee = currentUser?.role === 'employee';
    const canDeletePhoto = isSuperAdmin || isCompanyAdmin;

    const photos = data.photos || [];
    const tasks = data.tasks || [];
    const companies = data.companies || [];
    const lightboxPhoto = lightboxIndex !== null && photos[lightboxIndex] ? photos[lightboxIndex] : null;

    const handleNextPhoto = (e) => {
        if (e) e.stopPropagation();
        if (photos.length === 0) return;
        setLightboxIndex(prev => (prev + 1) % photos.length);
    };

    const handlePrevPhoto = (e) => {
        if (e) e.stopPropagation();
        if (photos.length === 0) return;
        setLightboxIndex(prev => (prev - 1 + photos.length) % photos.length);
    };

    // Keyboard navigation (Arrow keys + Esc)
    useEffect(() => {
        if (lightboxIndex === null) return;
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') handleNextPhoto();
            if (e.key === 'ArrowLeft') handlePrevPhoto();
            if (e.key === 'Escape') setLightboxIndex(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxIndex, photos.length]);

    // Touch swipe handlers
    const onTouchStart = (e) => setTouchStart(e.targetTouches[0].clientX);
    const onTouchEnd = (e) => {
        if (!touchStart) return;
        const touchEnd = e.changedTouches[0].clientX;
        if (touchStart - touchEnd > 45) {
            handleNextPhoto();
        } else if (touchEnd - touchStart > 45) {
            handlePrevPhoto();
        }
        setTouchStart(null);
    };

    const handleDeletePhoto = async (photoId, e) => {
        if (e) e.stopPropagation();
        if (!confirm('Are you sure you want to delete this inspection photo? This action cannot be undone.')) return;
        try {
            await api(`plant-photos/${photoId}`, {method: 'DELETE'});
            setLightboxIndex(null);
            loadGallery(true);
        } catch (err) {
            alert('Could not delete photo: ' + err.message);
        }
    };

    const loadGallery = async (manual = false) => {
        if (manual) setRefreshing(true);
        try {
            const query = new URLSearchParams({
                date: date,
                company_id: selectedCompany || '',
                task_id: selectedTask || ''
            }).toString();

            const res = await api(`plant-photos/gallery?${query}`);
            setData(res);
        } catch (e) {
            console.error('Gallery load error', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadGallery();
    }, [date, selectedCompany, selectedTask]);

    const handleSaveTask = async (e) => {
        e.preventDefault();
        setTaskSaving(true);
        setTaskMessage('');
        try {
            await api('plant-photos/tasks', {
                method: 'POST',
                body: JSON.stringify(editingTask)
            });
            setTaskMessage('Task schedule saved successfully!');
            setTimeout(() => {
                setShowTaskModal(false);
                setEditingTask({id: null, title: '', start_time: '11:00', end_time: '12:00', required_photos: 2, description: '', company_id: ''});
                setTaskMessage('');
                loadGallery(true);
            }, 700);
        } catch (err) {
            setTaskMessage('Error: ' + err.message);
        } finally {
            setTaskSaving(false);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!confirm('Are you sure you want to delete this photo task?')) return;
        try {
            await api(`plant-photos/tasks/${taskId}`, {method: 'DELETE'});
            loadGallery(true);
        } catch (err) {
            alert('Could not delete task: ' + err.message);
        }
    };

    if (loading) return <Loading/>;

    return (
        <div className="gallery-page-container">
            {/* Top Header & Actions Bar */}
            <div className="panel" style={{marginBottom: '16px', padding: '14px 18px'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'}}>
                    <div>
                        <h2 style={{margin: 0, fontSize: '17px', fontWeight: 800, color: '#143a2e', display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <span>📸</span> Plant Photo Gallery & Inspection Log
                        </h2>
                        <p style={{margin: '2px 0 0', fontSize: '11.5px', color: '#64748b'}}>
                            Daily scheduled plant inspection records and photo log.
                        </p>
                    </div>

                    <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
                        {isEmployee && (
                            <button
                                type="button"
                                className="primary"
                                onClick={() => { setActiveTaskForCamera(null); setShowCameraModal(true); }}
                                style={{background: '#16a34a', color: '#ffffff'}}
                            >
                                <Camera size={14}/> Capture Plant Photo
                            </button>
                        )}

                        {isSuperAdmin && (
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => setShowTaskModal(true)}
                                style={{background: '#f1f5f9', color: '#334155'}}
                            >
                                <Settings size={14}/> Manage Photo Tasks
                            </button>
                        )}

                        <button
                            type="button"
                            className="secondary"
                            onClick={() => loadGallery(true)}
                            disabled={refreshing}
                        >
                            <RefreshCw size={13} className={refreshing ? 'spin' : ''}/> Refresh
                        </button>
                    </div>
                </div>

                {/* Filter Toolbar */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: '1px solid #f1f5f9',
                    alignItems: 'flex-end'
                }}>
                    <DatePicker label="Inspection Date" value={date} onChange={setDate}/>

                    {isSuperAdmin && (
                        <div>
                            <label style={{display: 'block', fontSize: '11px', fontWeight: 700, color: '#687c71', textTransform: 'uppercase', marginBottom: '4px'}}>
                                Company / Plant
                            </label>
                            <select
                                value={selectedCompany}
                                onChange={e => setSelectedCompany(e.target.value)}
                                style={{width: '100%', padding: '8px 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid #cfddd3'}}
                            >
                                <option value="">All Companies (Combined)</option>
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label style={{display: 'block', fontSize: '11px', fontWeight: 700, color: '#687c71', textTransform: 'uppercase', marginBottom: '4px'}}>
                            Photo Task Window
                        </label>
                        <select
                            value={selectedTask}
                            onChange={e => setSelectedTask(e.target.value)}
                            style={{width: '100%', padding: '8px 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid #cfddd3'}}
                        >
                            <option value="">All Scheduled Slots</option>
                            {tasks.map(t => (
                                <option key={t.id} value={t.id}>{t.title} ({t.start_time} - {t.end_time})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        height: '36px'
                    }}>
                        <span>Total: <b>{photos.length}</b> Photos</span>
                        <span>· 10-Day Auto Storage</span>
                    </div>
                </div>
            </div>

            {/* Photos Grid (Responsive 4-column on mobile, detailed cards on desktop) */}
            {photos.length > 0 ? (
                <div className="plant-gallery-grid">
                    {photos.map((p, idx) => (
                        <article
                            key={p.id}
                            className="plant-photo-card"
                            onClick={() => setLightboxIndex(idx)}
                            style={{cursor: 'pointer'}}
                        >
                            {/* Photo Thumbnail */}
                            <div className="photo-thumb-wrap">
                                <img
                                    src={p.photo_url}
                                    alt={p.task_title}
                                    loading="lazy"
                                />
                                <div className="photo-thumb-overlay" style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
                                    color: '#ffffff',
                                    padding: '6px 8px',
                                    fontSize: '11px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span className="photo-thumb-time" style={{fontWeight: 700}}>{p.time_formatted}</span>
                                    <span style={{fontSize: '9.5px', background: 'rgba(255,255,255,0.25)', padding: '2px 5px', borderRadius: '4px'}}>
                                        {p.company_name}
                                    </span>
                                </div>
                            </div>

                            {/* Card Content (Hidden on small mobile screens for 4-column layout) */}
                            <div className="photo-details-body" style={{padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                <b style={{fontSize: '12.5px', color: '#0f172a'}}>{p.task_title}</b>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b'}}>
                                    <User size={12}/>
                                    <span>By: {p.employee_name}</span>
                                </div>

                                {p.address && (
                                    <div style={{fontSize: '10.5px', color: '#475569', marginTop: '2px', lineHeight: 1.3}}>
                                        <MapPin size={11} style={{color: '#ef4444', display: 'inline', marginRight: '3px'}}/>
                                        {p.address}
                                    </div>
                                )}

                                {p.notes && (
                                    <p style={{margin: '4px 0 0', fontSize: '11px', color: '#059669', fontStyle: 'italic', background: '#f0fdf4', padding: '4px 6px', borderRadius: '4px'}}>
                                        "{p.notes}"
                                    </p>
                                )}

                                <div style={{marginTop: 'auto', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px'}}>
                                    <small style={{color: '#94a3b8', fontSize: '10px'}}>{p.captured_at}</small>
                                    <div style={{display: 'inline-flex', alignItems: 'center', gap: '8px'}}>
                                        {p.google_maps_url && (
                                            <a
                                                href={p.google_maps_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                    fontSize: '11px',
                                                    color: '#15803d',
                                                    fontWeight: 700,
                                                    textDecoration: 'none',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}
                                            >
                                                <MapPin size={12}/> Map <ExternalLink size={10}/>
                                            </a>
                                        )}
                                        {canDeletePhoto && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleDeletePhoto(p.id, e)}
                                                style={{
                                                    background: '#fee2e2',
                                                    color: '#b91c1c',
                                                    border: 0,
                                                    borderRadius: '4px',
                                                    padding: '3px 6px',
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    fontWeight: 600
                                                }}
                                                title="Delete photo"
                                            >
                                                <Trash2 size={11}/> Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            ) : (
                <Empty
                    title="No plant photos captured yet"
                    detail={`No inspection photos were uploaded on ${date}. Employees capture live photos during scheduled daily time slots.`}
                />
            )}

            {/* Lightbox Interactive Slideshow Carousel Modal */}
            {lightboxPhoto && (
                <div className="modal-backdrop" onClick={() => setLightboxIndex(null)}>
                    <div
                        className="modal"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '820px',
                            background: '#091512',
                            color: '#ffffff',
                            padding: 0,
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                    >
                        {/* Top Header Bar with Slide Counter & Details */}
                        <div style={{
                            padding: '10px 16px',
                            background: '#0d2820',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                <span style={{
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    padding: '3px 8px',
                                    borderRadius: '12px'
                                }}>
                                    {lightboxIndex + 1} / {photos.length}
                                </span>
                                <div>
                                    <h3 style={{margin: 0, fontSize: '13.5px', color: '#f0fdf4'}}>
                                        {lightboxPhoto.task_title}
                                    </h3>
                                    <small style={{color: '#86efac', fontSize: '11px'}}>
                                        {lightboxPhoto.company_name} · By {lightboxPhoto.employee_name} ({lightboxPhoto.time_formatted})
                                    </small>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="icon-button ghost"
                                onClick={() => setLightboxIndex(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    color: '#ffffff',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%'
                                }}
                                title="Close popup (Esc)"
                            >
                                <X size={16}/>
                            </button>
                        </div>

                        {/* Image Viewer Area with Left/Right Nav Arrows & Touch Swipe */}
                        <div
                            onTouchStart={onTouchStart}
                            onTouchEnd={onTouchEnd}
                            style={{
                                position: 'relative',
                                background: '#000000',
                                minHeight: '380px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                userSelect: 'none'
                            }}
                        >
                            {/* Previous Slide Button */}
                            {photos.length > 1 && (
                                <button
                                    type="button"
                                    className="carousel-nav-btn prev-btn"
                                    onClick={handlePrevPhoto}
                                    title="Previous Photo (Left Arrow)"
                                >
                                    <ChevronLeft size={24}/>
                                </button>
                            )}

                            {/* Main High-Res Image */}
                            <img
                                key={lightboxPhoto.id}
                                src={lightboxPhoto.photo_url}
                                alt="Plant Photo High Resolution"
                                style={{
                                    maxHeight: '68vh',
                                    maxWidth: '100%',
                                    objectFit: 'contain',
                                    animation: 'fadeIn 0.2s ease-in-out'
                                }}
                            />

                            {/* Next Slide Button */}
                            {photos.length > 1 && (
                                <button
                                    type="button"
                                    className="carousel-nav-btn next-btn"
                                    onClick={handleNextPhoto}
                                    title="Next Photo (Right Arrow)"
                                >
                                    <ChevronRight size={24}/>
                                </button>
                            )}
                        </div>

                        {/* Bottom Actions Footer Bar */}
                        <div style={{
                            padding: '12px 16px',
                            background: '#0d2820',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                            borderTop: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div>
                                <span style={{fontSize: '12px', color: '#cbd5e1'}}>
                                    📍 {lightboxPhoto.address || 'Solar Plant Site'}
                                </span>
                                {lightboxPhoto.notes && (
                                    <div style={{fontSize: '11.5px', color: '#86efac', marginTop: '2px'}}>
                                        Note: "{lightboxPhoto.notes}"
                                    </div>
                                )}
                            </div>

                            <div style={{display: 'inline-flex', alignItems: 'center', gap: '8px'}}>
                                {lightboxPhoto.google_maps_url && (
                                    <a
                                        href={lightboxPhoto.google_maps_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            background: '#16a34a',
                                            color: '#ffffff',
                                            textDecoration: 'none',
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <MapPin size={13}/> Open Google Map <ExternalLink size={12}/>
                                    </a>
                                )}
                                {canDeletePhoto && (
                                    <button
                                        type="button"
                                        onClick={(e) => handleDeletePhoto(lightboxPhoto.id, e)}
                                        style={{
                                            background: '#ef4444',
                                            color: '#ffffff',
                                            border: 0,
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Trash2 size={13}/> Delete Photo
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Super Admin Task Management Modal */}
            {showTaskModal && (
                <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
                    <div className="modal modal-sheet task-management-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '680px'}}>
                        <div className="panel-head">
                            <div>
                                <h2>Manage Daily Photo Tasks & Schedule</h2>
                                <p>Set time slots and required photo counts (e.g. 10 to 15 photos daily).</p>
                            </div>
                            <button type="button" className="icon-button ghost" onClick={() => setShowTaskModal(false)}>
                                <X size={18}/>
                            </button>
                        </div>

                        {/* Scrollable Modal Content */}
                        <div className="modal-body-scroll">
                            {/* List Existing Tasks */}
                            <div style={{marginBottom: '16px'}}>
                                <h4 style={{fontSize: '12.5px', margin: '0 0 8px', color: '#334155'}}>Current Time-Table Slots:</h4>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                    {tasks.map((t, idx) => (
                                        <div
                                            key={t.id}
                                            style={{
                                                padding: '8px 12px',
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '8px'
                                            }}
                                        >
                                            <div style={{minWidth: 0}}>
                                                <b style={{display: 'block', fontSize: '13px', color: '#0f172a'}}>{idx + 1}. {t.title}</b>
                                                <div style={{fontSize: '11px', color: '#64748b'}}>
                                                    🕒 {t.start_time} - {t.end_time} &nbsp;|&nbsp; 📸 <b>{t.required_photos}</b> Photos required
                                                </div>
                                            </div>
                                            <div style={{display: 'flex', gap: '6px', flexShrink: 0}}>
                                                <button
                                                    type="button"
                                                    className="secondary"
                                                    onClick={() => setEditingTask({
                                                        id: t.id,
                                                        title: t.title,
                                                        start_time: t.start_time.includes('AM') || t.start_time.includes('PM') ? '11:00' : t.start_time,
                                                        end_time: '12:00',
                                                        required_photos: t.required_photos,
                                                        description: t.description || '',
                                                        company_id: t.company_id || ''
                                                    })}
                                                    style={{fontSize: '11px', padding: '5px 9px'}}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteTask(t.id)}
                                                    style={{background: '#fee2e2', color: '#dc2626', border: 0, borderRadius: '6px', padding: '5px 8px', cursor: 'pointer'}}
                                                    title="Delete task"
                                                >
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add / Edit Task Form */}
                            <form id="task-slot-form" onSubmit={handleSaveTask} style={{background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
                                <h4 style={{fontSize: '13px', margin: '0 0 10px', color: '#0f172a'}}>
                                    {editingTask.id ? '✏️ Edit Photo Task Slot' : '➕ Add New Photo Task Slot'}
                                </h4>

                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                                    <div style={{gridColumn: '1 / -1'}}>
                                        <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px'}}>
                                            Task Title / Location Name
                                        </label>
                                        <input
                                            type="text"
                                            value={editingTask.title}
                                            onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                                            required
                                            style={{width: '100%'}}
                                        />
                                    </div>

                                    <div>
                                        <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px'}}>
                                            Start Time
                                        </label>
                                        <input
                                            type="time"
                                            value={editingTask.start_time}
                                            onChange={e => setEditingTask({...editingTask, start_time: e.target.value})}
                                            required
                                            style={{width: '100%'}}
                                        />
                                    </div>

                                    <div>
                                        <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px'}}>
                                            End Time
                                        </label>
                                        <input
                                            type="time"
                                            value={editingTask.end_time}
                                            onChange={e => setEditingTask({...editingTask, end_time: e.target.value})}
                                            required
                                            style={{width: '100%'}}
                                        />
                                    </div>

                                    <div>
                                        <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px'}}>
                                            Required Photos Count
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={editingTask.required_photos}
                                            onChange={e => setEditingTask({...editingTask, required_photos: parseInt(e.target.value, 10) || 1})}
                                            required
                                            style={{width: '100%'}}
                                        />
                                    </div>

                                    <div>
                                        <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px'}}>
                                            Assign to Company (Optional)
                                        </label>
                                        <select
                                            value={editingTask.company_id}
                                            onChange={e => setEditingTask({...editingTask, company_id: e.target.value})}
                                            style={{width: '100%'}}
                                        >
                                            <option value="">All Companies (Common)</option>
                                            {companies.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {taskMessage && (
                                    <div style={{
                                        fontSize: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        background: taskMessage.includes('Error') ? '#fef2f2' : '#ecfdf5',
                                        color: taskMessage.includes('Error') ? '#991b1b' : '#065f46',
                                        marginBottom: '6px'
                                    }}>
                                        {taskMessage}
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* Sticky Action Footer */}
                        <div className="modal-sticky-footer">
                            <button
                                type="button"
                                className="secondary modal-cancel-btn"
                                onClick={() => {
                                    if (editingTask.id) {
                                        setEditingTask({id: null, title: '', start_time: '11:00', end_time: '12:00', required_photos: 2, description: '', company_id: ''});
                                    } else {
                                        setShowTaskModal(false);
                                    }
                                }}
                            >
                                {editingTask.id ? 'Cancel Edit' : 'Close'}
                            </button>
                            <button
                                type="submit"
                                form="task-slot-form"
                                className="primary expense-submit-btn"
                                disabled={taskSaving}
                            >
                                {taskSaving ? 'Saving...' : (editingTask.id ? '✓ Update Task Slot' : '✓ Save Task Slot')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Employee Live Back Camera Modal */}
            {showCameraModal && (
                <LiveBackCameraModal
                    task={activeTaskForCamera}
                    companyId={selectedCompany || companyId}
                    onClose={() => setShowCameraModal(false)}
                    onUploaded={() => loadGallery(true)}
                />
            )}
        </div>
    );
}
