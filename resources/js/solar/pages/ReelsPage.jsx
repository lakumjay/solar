import React, {useEffect, useRef, useState} from 'react';
import {
    Camera,
    ChevronDown,
    ChevronUp,
    Download,
    Film,
    Heart,
    LayoutGrid,
    MessageCircle,
    Play,
    Pause,
    Plus,
    RefreshCw,
    Share2,
    Trash2,
    Upload,
    Volume2,
    VolumeX,
    X,
    Check,
    Eye,
    Video,
    Sparkles
} from 'lucide-react';
import {api} from '../api';
import {Empty, Loading} from '../components/Common';

export default function ReelsPage({currentUser, companyId}) {
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [viewMode, setViewMode] = useState('feed'); // 'feed' | 'grid'
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState(companyId === 'all' ? '' : (companyId || ''));
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Direct Upload Modal State
    const [videoFile, setVideoFile] = useState(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
    const [reelTitle, setReelTitle] = useState('');
    const [reelCaption, setReelCaption] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatusText, setUploadStatusText] = useState('');
    const [thumbnailDataUrl, setThumbnailDataUrl] = useState('');

    const videoRef = useRef(null);
    const uploadVideoRef = useRef(null);
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const isCompanyAdmin = currentUser?.role === 'company_admin';
    const isEmployee = currentUser?.role === 'employee';
    const canCreate = isSuperAdmin || isCompanyAdmin || isEmployee;

    const loadReels = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const query = selectedCompany ? `?company_id=${selectedCompany}` : '';
            const res = await api(`plant-reels${query}`);
            setReels(res.reels || []);
        } catch (e) {
            console.error('Reels load error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadReels();
    }, [selectedCompany]);

    // Handle Active Reel Video Playback & Auto-pause Previous Video
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.muted = isMuted;
            if (isPlaying) {
                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.log('Autoplay prevented or paused:', err);
                    });
                }
            } else {
                videoRef.current.pause();
            }
        }
    }, [activeIndex, reels.length, isPlaying]);

    // Keep mute state in sync
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    const activeReel = reels[activeIndex] || null;

    const handleNextReel = () => {
        if (activeIndex < reels.length - 1) {
            setActiveIndex(prev => prev + 1);
            setIsPlaying(true);
        }
    };

    const handlePrevReel = () => {
        if (activeIndex > 0) {
            setActiveIndex(prev => prev - 1);
            setIsPlaying(true);
        }
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    };

    const toggleMute = (e) => {
        if (e) e.stopPropagation();
        setIsMuted(prev => !prev);
    };

    const handleLike = async (reelId, e) => {
        if (e) e.stopPropagation();
        try {
            const res = await api(`plant-reels/${reelId}/like`, {method: 'POST'});
            setReels(prev => prev.map(r => r.id === reelId ? {...r, likes_count: res.likes_count, isLiked: true} : r));
        } catch (e) {}
    };

    const handleDelete = async (reelId, e) => {
        if (e) e.stopPropagation();
        if (!confirm('Are you sure you want to delete this Reel? This action cannot be undone.')) return;
        try {
            await api(`plant-reels/${reelId}`, {method: 'DELETE'});
            loadReels(true);
            if (activeIndex >= reels.length - 1) {
                setActiveIndex(Math.max(0, reels.length - 2));
            }
        } catch (err) {
            alert('Failed to delete reel: ' + err.message);
        }
    };

    const handleShare = async (reel, e) => {
        if (e) e.stopPropagation();
        const shareData = {
            title: reel.title,
            text: `${reel.title} - Solar Plant Reel by ${reel.author_name} #${reel.company_name?.replace(/\\s+/g, '') || 'Solar'} #SolarFlow`,
            url: window.location.href,
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err) {}
        } else {
            navigator.clipboard?.writeText(window.location.href);
            alert('Reel link copied! You can paste and share it directly on Instagram / WhatsApp.');
        }
    };

    // Direct Video File Selection
    const handleVideoSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('video/')) {
            alert('Please select a valid video file (MP4, WebM, MOV).');
            return;
        }

        // Limit size to 150MB
        if (file.size > 150 * 1024 * 1024) {
            alert('Video file size must be under 150MB.');
            return;
        }

        setVideoFile(file);
        const objectUrl = URL.createObjectURL(file);
        setVideoPreviewUrl(objectUrl);

        // Auto extract default title if empty
        if (!reelTitle) {
            const cleanName = file.name.replace(/\\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            setReelTitle(cleanName);
        }

        // Auto generate thumbnail from first frame
        const tempVideo = document.createElement('video');
        tempVideo.src = objectUrl;
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        tempVideo.currentTime = 0.5;
        tempVideo.onloadeddata = () => {
            tempVideo.currentTime = Math.min(1.0, tempVideo.duration / 2 || 0.5);
        };
        tempVideo.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 480;
                canvas.height = 854;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                setThumbnailDataUrl(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) {
                console.warn('Thumbnail generation error', e);
            }
        };
    };

    const handleClearVideo = () => {
        setVideoFile(null);
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
            setVideoPreviewUrl('');
        }
        setThumbnailDataUrl('');
    };

    // Direct Video Upload to Server
    const handleDirectUpload = async () => {
        if (!videoFile) {
            alert('Please select a video file to upload.');
            return;
        }

        setIsUploading(true);
        setUploadProgress(15);
        setUploadStatusText('Preparing video file for upload...');

        try {
            const fd = new FormData();
            fd.append('video', videoFile, videoFile.name);
            if (thumbnailDataUrl) {
                fd.append('thumbnail', thumbnailDataUrl);
            }
            fd.append('title', reelTitle || 'Solar Plant Daily Reel');
            fd.append('caption', reelCaption || '');
            fd.append('company_id', selectedCompany || '');

            setUploadProgress(40);
            setUploadStatusText('Uploading full video with original audio...');

            const uploadRes = await fetch('/api/plant-reels', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                    'Accept': 'application/json'
                },
                body: fd
            });

            if (!uploadRes.ok) {
                const errJson = await uploadRes.json().catch(() => ({}));
                throw new Error(errJson.error || 'Failed to upload Reel');
            }

            setUploadProgress(100);
            setUploadStatusText('Reel uploaded successfully! 🎉');

            setTimeout(() => {
                setIsUploading(false);
                setShowCreateModal(false);
                handleClearVideo();
                setReelTitle('');
                setReelCaption('');
                loadReels(true);
            }, 600);

        } catch (err) {
            console.error('Reel upload error:', err);
            alert('Reel upload failed: ' + err.message);
            setIsUploading(false);
        }
    };

    if (loading) return <Loading/>;

    return (
        <div className="reels-page-container">
            {/* Top Toolbar */}
            <div className="panel" style={{marginBottom: '16px', padding: '14px 18px'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'}}>
                    <div>
                        <h2 style={{margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <span>🎬</span> Solar Reels
                        </h2>
                        <p style={{margin: '2px 0 0', fontSize: '11.5px', color: '#64748b'}}>
                            Instagram-style field reels with direct video upload and instant full audio playback.
                        </p>
                    </div>

                    <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
                        <div style={{display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px'}}>
                            <button
                                type="button"
                                onClick={() => setViewMode('feed')}
                                style={{
                                    border: 0,
                                    background: viewMode === 'feed' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'feed' ? '#0f172a' : '#64748b',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: viewMode === 'feed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <Film size={14}/> Feed
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                style={{
                                    border: 0,
                                    background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'grid' ? '#0f172a' : '#64748b',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <LayoutGrid size={14}/> Grid
                            </button>
                        </div>

                        {canCreate && (
                            <button
                                type="button"
                                className="primary"
                                onClick={() => setShowCreateModal(true)}
                                style={{
                                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 14px',
                                    borderRadius: '8px'
                                }}
                            >
                                <Plus size={16}/> Upload Reel
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => loadReels(true)}
                            className="secondary icon-only"
                            title="Refresh Reels"
                            style={{padding: '7px 10px'}}
                        >
                            <RefreshCw size={14} className={refreshing ? 'spin' : ''}/>
                        </button>
                    </div>
                </div>
            </div>

            {/* Empty State */}
            {reels.length === 0 ? (
                <div className="panel" style={{padding: '50px 20px', textAlign: 'center'}}>
                    <Empty message="No Reels published yet. Upload your plant inspection or team video to get started!"/>
                    {canCreate && (
                        <button
                            type="button"
                            className="primary"
                            onClick={() => setShowCreateModal(true)}
                            style={{marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px'}}
                        >
                            <Plus size={16}/> Upload First Reel
                        </button>
                    )}
                </div>
            ) : viewMode === 'feed' ? (
                /* ================= FEED VIEW (VERTICAL REELS PLAYER) ================= */
                <div className="reel-feed-wrapper" style={{display: 'flex', justifyContent: 'center', position: 'relative'}}>
                    <div className="reel-vertical-container" style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '430px',
                        height: '76vh',
                        minHeight: '520px',
                        maxHeight: '820px',
                        background: '#000000',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 20px 35px -10px rgba(0,0,0,0.5)',
                        userSelect: 'none'
                    }}>
                        {/* Video Element with HTTP Range Streaming */}
                        <video
                            ref={videoRef}
                            src={activeReel?.video_url}
                            poster={activeReel?.thumbnail_url || undefined}
                            loop
                            playsInline
                            webkit-playsinline="true"
                            muted={isMuted}
                            onClick={togglePlay}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                cursor: 'pointer',
                                display: 'block'
                            }}
                        />

                        {/* Top Gradient Overlay */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '90px',
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
                            pointerEvents: 'none',
                            zIndex: 2,
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '14px 16px',
                            alignItems: 'flex-start'
                        }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <span style={{
                                    background: 'rgba(22, 163, 74, 0.9)',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    letterSpacing: '0.4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    <Sparkles size={12}/> REELS
                                </span>
                                <span style={{color: '#ffffff', fontSize: '11.5px', fontWeight: 600, opacity: 0.9}}>
                                    {activeIndex + 1} / {reels.length}
                                </span>
                            </div>

                            {/* Sound Toggle Button */}
                            <button
                                type="button"
                                onClick={toggleMute}
                                style={{
                                    background: 'rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    display: 'grid',
                                    placeItems: 'center',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    pointerEvents: 'auto'
                                }}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                            </button>
                        </div>

                        {/* Play / Pause Center Icon Overlay */}
                        {!isPlaying && (
                            <div
                                onClick={togglePlay}
                                style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: '64px',
                                    height: '64px',
                                    borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    zIndex: 3,
                                    boxShadow: '0 0 20px rgba(0,0,0,0.6)'
                                }}
                            >
                                <Play size={32} style={{marginLeft: '4px'}}/>
                            </div>
                        )}

                        {/* Right Sidebar Action Icons (Like, Share, Download, Delete) */}
                        <div style={{
                            position: 'absolute',
                            right: '12px',
                            bottom: '80px',
                            zIndex: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            {/* Like Button */}
                            <button
                                type="button"
                                onClick={(e) => handleLike(activeReel.id, e)}
                                style={{
                                    background: 'transparent',
                                    border: 0,
                                    color: activeReel?.isLiked ? '#ef4444' : '#ffffff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: 0
                                }}
                            >
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.45)',
                                    backdropFilter: 'blur(4px)',
                                    display: 'grid',
                                    placeItems: 'center'
                                }}>
                                    <Heart size={22} fill={activeReel?.isLiked ? '#ef4444' : 'none'}/>
                                </div>
                                <span style={{fontSize: '11px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)'}}>
                                    {activeReel?.likes_count || 0}
                                </span>
                            </button>

                            {/* Share Button */}
                            <button
                                type="button"
                                onClick={(e) => handleShare(activeReel, e)}
                                style={{
                                    background: 'transparent',
                                    border: 0,
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: 0
                                }}
                                title="Share to WhatsApp / Instagram"
                            >
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.45)',
                                    backdropFilter: 'blur(4px)',
                                    display: 'grid',
                                    placeItems: 'center'
                                }}>
                                    <Share2 size={20}/>
                                </div>
                                <span style={{fontSize: '11px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)'}}>
                                    Share
                                </span>
                            </button>

                            {/* Download Button */}
                            <a
                                href={activeReel?.video_url}
                                download={`solar_reel_${activeReel?.id}.mp4`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{
                                    background: 'transparent',
                                    border: 0,
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '3px',
                                    textDecoration: 'none'
                                }}
                                title="Download MP4 Video"
                            >
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.45)',
                                    backdropFilter: 'blur(4px)',
                                    display: 'grid',
                                    placeItems: 'center'
                                }}>
                                    <Download size={20}/>
                                </div>
                                <span style={{fontSize: '11px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)'}}>
                                    Save
                                </span>
                            </a>

                            {/* Delete Button (Super Admin or Author) */}
                            {(isSuperAdmin || activeReel?.user_id === currentUser?.id) && (
                                <button
                                    type="button"
                                    onClick={(e) => handleDelete(activeReel.id, e)}
                                    style={{
                                        background: 'transparent',
                                        border: 0,
                                        color: '#f87171',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '3px',
                                        padding: 0
                                    }}
                                    title="Delete Reel"
                                >
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '50%',
                                        background: 'rgba(239, 68, 68, 0.25)',
                                        backdropFilter: 'blur(4px)',
                                        display: 'grid',
                                        placeItems: 'center'
                                    }}>
                                        <Trash2 size={19}/>
                                    </div>
                                    <span style={{fontSize: '10.5px', fontWeight: 700, color: '#fca5a5', textShadow: '0 1px 3px rgba(0,0,0,0.8)'}}>
                                        Delete
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Bottom Information Overlay (Title, Author, Caption) */}
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            padding: '30px 16px 16px',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 60%, transparent 100%)',
                            zIndex: 3,
                            color: '#ffffff',
                            pointerEvents: 'auto'
                        }}>
                            {/* Author Info & Verified Badge */}
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: '#16a34a',
                                    display: 'grid',
                                    placeItems: 'center',
                                    color: '#ffffff',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                    border: '1.5px solid #ffffff'
                                }}>
                                    {activeReel?.author_name?.charAt(0) || 'S'}
                                </div>
                                <div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                        <b style={{fontSize: '13px', color: '#ffffff'}}>{activeReel?.author_name || 'Solar Team'}</b>
                                        <span style={{
                                            background: '#38bdf8',
                                            color: '#ffffff',
                                            fontSize: '9px',
                                            fontWeight: 800,
                                            padding: '1px 4px',
                                            borderRadius: '4px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px'
                                        }}>
                                            <Check size={8}/> Verified
                                        </span>
                                    </div>
                                    <small style={{fontSize: '10.5px', color: '#cbd5e1', opacity: 0.9}}>
                                        {activeReel?.company_name} · {activeReel?.created_at_human}
                                    </small>
                                </div>
                            </div>

                            {/* Reel Title */}
                            <h3 style={{margin: '0 0 4px', fontSize: '14px', fontWeight: 800, color: '#f8fafc', lineHeight: 1.3}}>
                                {activeReel?.title}
                            </h3>

                            {/* Caption if present */}
                            {activeReel?.caption && (
                                <p style={{margin: 0, fontSize: '11.5px', color: '#e2e8f0', opacity: 0.9, lineHeight: 1.4}}>
                                    {activeReel.caption}
                                </p>
                            )}
                        </div>

                        {/* Up / Down Navigation Floating Controls */}
                        <div style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            {activeIndex > 0 && (
                                <button
                                    type="button"
                                    onClick={handlePrevReel}
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.55)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#ffffff',
                                        display: 'grid',
                                        placeItems: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                                    }}
                                    title="Previous Reel"
                                >
                                    <ChevronUp size={20}/>
                                </button>
                            )}

                            {activeIndex < reels.length - 1 && (
                                <button
                                    type="button"
                                    onClick={handleNextReel}
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.55)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#ffffff',
                                        display: 'grid',
                                        placeItems: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                                    }}
                                    title="Next Reel"
                                >
                                    <ChevronDown size={20}/>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* ================= GRID VIEW (ALL REELS THUMBNAILS) ================= */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '12px'
                }}>
                    {reels.map((reel, idx) => (
                        <div
                            key={reel.id}
                            onClick={() => {
                                setActiveIndex(idx);
                                setViewMode('feed');
                                setIsPlaying(true);
                            }}
                            style={{
                                position: 'relative',
                                aspectRatio: '9/16',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                background: '#0f172a',
                                cursor: 'pointer',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                            }}
                        >
                            {reel.thumbnail_url ? (
                                <img
                                    src={reel.thumbnail_url}
                                    alt={reel.title}
                                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                />
                            ) : (
                                <video
                                    src={reel.video_url}
                                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                    muted
                                />
                            )}

                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '10px',
                                color: '#ffffff'
                            }}>
                                <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                                    <span style={{
                                        background: 'rgba(0,0,0,0.6)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                    }}>
                                        <Eye size={10}/> {reel.views_count || 0}
                                    </span>
                                </div>

                                <div>
                                    <b style={{fontSize: '12px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                        {reel.title}
                                    </b>
                                    <small style={{fontSize: '10px', color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                        <span>{reel.author_name}</span>
                                        <span>❤️ {reel.likes_count || 0}</span>
                                    </small>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ================= DIRECT VIDEO UPLOAD MODAL ================= */}
            {showCreateModal && (
                <div className="reel-studio-backdrop">
                    <div className="reel-studio-container" style={{maxWidth: '520px'}}>
                        {/* Header */}
                        <div className="reel-studio-header">
                            <div>
                                <h3 style={{margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                    <Video size={18} style={{color: '#16a34a'}}/> Upload Reel Video
                                </h3>
                                <p style={{margin: '2px 0 0', fontSize: '11px', color: '#64748b'}}>
                                    Select your video from mobile or computer with full original audio & music.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !isUploading && setShowCreateModal(false)}
                                style={{border: 0, background: '#f1f5f9', borderRadius: '50%', width: '30px', height: '30px', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#475569'}}
                                disabled={isUploading}
                            >
                                <X size={16}/>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="reel-studio-body" style={{padding: '16px'}}>
                            {/* Video File Picker / Preview Box */}
                            <div style={{marginBottom: '16px'}}>
                                <label style={{display: 'block', fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '6px'}}>
                                    Select Video Clip (MP4 / WebM / MOV)
                                </label>

                                {!videoFile ? (
                                    <label htmlFor="direct-video-input" style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '2px dashed #16a34a',
                                        background: '#f0fdf4',
                                        borderRadius: '12px',
                                        padding: '36px 20px',
                                        cursor: 'pointer',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{
                                            width: '50px',
                                            height: '50px',
                                            borderRadius: '50%',
                                            background: '#dcfce7',
                                            color: '#16a34a',
                                            display: 'grid',
                                            placeItems: 'center',
                                            marginBottom: '10px'
                                        }}>
                                            <Upload size={24}/>
                                        </div>
                                        <b style={{fontSize: '14px', color: '#0f172a', marginBottom: '4px'}}>
                                            Tap to select / record Video
                                        </b>
                                        <span style={{fontSize: '11.5px', color: '#64748b'}}>
                                            Supports MP4, MOV, WebM with your songs & real audio
                                        </span>
                                        <input
                                            type="file"
                                            accept="video/*"
                                            id="direct-video-input"
                                            onChange={handleVideoSelect}
                                            style={{display: 'none'}}
                                            disabled={isUploading}
                                        />
                                    </label>
                                ) : (
                                    <div style={{
                                        border: '1.5px solid #cbd5e1',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        background: '#0f172a',
                                        position: 'relative'
                                    }}>
                                        {/* Video Preview */}
                                        <video
                                            ref={uploadVideoRef}
                                            src={videoPreviewUrl}
                                            controls
                                            playsInline
                                            style={{
                                                width: '100%',
                                                maxHeight: '260px',
                                                objectFit: 'contain',
                                                display: 'block',
                                                background: '#000'
                                            }}
                                        />

                                        {/* Video Info Bar */}
                                        <div style={{
                                            padding: '8px 12px',
                                            background: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div style={{minWidth: 0, paddingRight: '8px'}}>
                                                <b style={{fontSize: '12px', color: '#0f172a', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                                    {videoFile.name}
                                                </b>
                                                <small style={{fontSize: '10.5px', color: '#64748b'}}>
                                                    Size: {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                                                </small>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleClearVideo}
                                                style={{
                                                    background: '#fee2e2',
                                                    color: '#ef4444',
                                                    border: '1px solid #fca5a5',
                                                    borderRadius: '6px',
                                                    padding: '4px 8px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    flexShrink: 0
                                                }}
                                                disabled={isUploading}
                                            >
                                                <X size={12}/> Change Video
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Title & Caption */}
                            <div style={{marginBottom: '14px'}}>
                                <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px'}}>
                                    Reel Title / Subject (Required)
                                </label>
                                <input
                                    type="text"
                                    value={reelTitle}
                                    onChange={e => setReelTitle(e.target.value)}
                                    placeholder="દા.ત. સાળંગપુર પ્લાન્ટ ડેઇલી રીલ અથવા ઇન્સ્પેક્શન વાઇબ"
                                    disabled={isUploading}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        fontSize: '13px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{marginBottom: '14px'}}>
                                <label style={{display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px'}}>
                                    Caption / Hashtags (Optional)
                                </label>
                                <textarea
                                    value={reelCaption}
                                    onChange={e => setReelCaption(e.target.value)}
                                    placeholder="#SolarEnergy #CleanPower #SolarPlantReel"
                                    rows={2}
                                    disabled={isUploading}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Upload Progress Bar */}
                            {isUploading && (
                                <div style={{background: '#ecfdf5', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#166534', marginBottom: '6px'}}>
                                        <span>{uploadStatusText}</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div style={{height: '6px', background: '#bbf7d0', borderRadius: '3px', overflow: 'hidden'}}>
                                        <div style={{height: '100%', width: `${uploadProgress}%`, background: '#16a34a', transition: 'width 0.3s ease'}}/>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sticky Modal Footer */}
                        <div className="reel-studio-footer">
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => !isUploading && setShowCreateModal(false)}
                                disabled={isUploading}
                                style={{padding: '9px 16px', borderRadius: '8px'}}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="primary"
                                onClick={handleDirectUpload}
                                disabled={isUploading || !videoFile}
                                style={{
                                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                                    color: '#ffffff',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    padding: '9px 20px',
                                    borderRadius: '8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: (isUploading || !videoFile) ? 'not-allowed' : 'pointer',
                                    opacity: (isUploading || !videoFile) ? 0.6 : 1
                                }}
                            >
                                {isUploading ? (
                                    <>
                                        <RefreshCw size={14} className="spin"/> Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={15}/> Publish Reel
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
