import React, {useEffect, useRef, useState} from 'react';
import {Camera, CheckCircle, Crosshair, MapPin, RefreshCw, SwitchCamera, X} from 'lucide-react';
import {api} from '../api';

export default function LiveBackCameraModal({task, companyId, onClose, onUploaded}) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [gps, setGps] = useState({latitude: null, longitude: null, accuracy: null, status: 'Locating GPS...'});
    const [notes, setNotes] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [facingMode, setFacingMode] = useState('environment'); // Default: Back Camera

    // Start Live Back Camera
    const startCamera = async (mode = 'environment') => {
        try {
            setError('');
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    facingMode: {ideal: mode},
                    width: {ideal: 1280},
                    height: {ideal: 720}
                },
                audio: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err) {
            console.warn('Camera error:', err);
            setError('Camera access error: ' + (err.message || 'Please grant camera permission in browser.'));
        }
    };

    // Silent GPS Coordinate fetcher (No UI exposure to employee)
    const detectGps = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGps({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    status: 'Ready'
                });
            },
            () => {},
            {enableHighAccuracy: true, timeout: 12000, maximumAge: 0}
        );
    };

    useEffect(() => {
        startCamera(facingMode);
        detectGps();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [facingMode]);

    // Snap Photo onto Canvas with Date/Time Stamp (No visible GPS text)
    const takePhoto = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');

        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Overlay Clean Digital Timestamp Watermark
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, canvas.height - 40, canvas.width, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        const nowStr = new Date().toLocaleString('en-IN');
        ctx.fillText(`⚡ Plant Inspection · ${nowStr}`, 16, canvas.height - 15);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);

        // Stop video stream to save battery
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        startCamera(facingMode);
    };

    const handleUpload = async () => {
        if (!capturedImage) return;
        setUploading(true);
        setError('');

        try {
            const payload = {
                photo: capturedImage,
                task_id: task?.id || null,
                company_id: task?.company_id || (companyId && companyId !== 'all' ? companyId : undefined),
                latitude: gps.latitude,
                longitude: gps.longitude,
                notes: notes || null
            };

            await api('plant-photos/upload', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (onUploaded) onUploaded();
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to upload plant photo.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal camera-modal" onClick={e => e.stopPropagation()} style={{padding: 0, overflow: 'hidden', background: '#091512'}}>
                {/* Header */}
                <div style={{
                    padding: '12px 16px',
                    background: '#0d2820',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}>
                    <div>
                        <h3 style={{margin: 0, fontSize: '14px', fontWeight: 800, color: '#f0fdf4'}}>
                            📷 Plant Inspection Photo
                        </h3>
                        <p style={{margin: '2px 0 0', fontSize: '11px', color: '#86efac'}}>
                            {task ? `Task: ${task.title} (${task.start_time} - ${task.end_time})` : 'Daily Plant Inspection'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            border: 0,
                            borderRadius: '50%',
                            width: '30px',
                            height: '30px',
                            color: '#ffffff',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={16}/>
                    </button>
                </div>

                {/* Camera View / Preview */}
                <div style={{position: 'relative', background: '#000000', minHeight: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    {!capturedImage ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{width: '100%', maxHeight: '420px', objectFit: 'cover'}}
                        />
                    ) : (
                        <img
                            src={capturedImage}
                            alt="Captured plant preview"
                            style={{width: '100%', maxHeight: '420px', objectFit: 'contain'}}
                        />
                    )}

                    {/* Camera Switch button in corner if not captured */}
                    {!capturedImage && (
                        <button
                            type="button"
                            onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
                            style={{
                                position: 'absolute',
                                top: '12px',
                                right: '12px',
                                background: 'rgba(0,0,0,0.6)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                color: '#fff',
                                borderRadius: '20px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Flip Camera"
                        >
                            <SwitchCamera size={13}/> <span>Switch</span>
                        </button>
                    )}
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{background: '#fef2f2', color: '#991b1b', padding: '8px 14px', fontSize: '11.5px', borderLeft: '4px solid #ef4444'}}>
                        {error}
                    </div>
                )}

                {/* Footer Actions */}
                <div style={{padding: '14px 16px', background: '#0d2820', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {capturedImage && (
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Add note (e.g. Table 4 string washed, inverter OK)..."
                            style={{
                                width: '100%',
                                background: '#133e32',
                                border: '1px solid #236551',
                                color: '#ffffff',
                                fontSize: '12.5px',
                                padding: '8px 12px',
                                borderRadius: '8px'
                            }}
                        />
                    )}

                    <div style={{display: 'flex', gap: '10px', justifyContent: 'center'}}>
                        {!capturedImage ? (
                            <button
                                type="button"
                                onClick={takePhoto}
                                style={{
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    border: 0,
                                    borderRadius: '50px',
                                    padding: '12px 28px',
                                    fontSize: '13.5px',
                                    fontWeight: 800,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 16px rgba(22, 163, 74, 0.4)',
                                    cursor: 'pointer'
                                }}
                            >
                                <Camera size={18}/>
                                <span>Capture Live Photo</span>
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={retakePhoto}
                                    disabled={uploading}
                                    style={{
                                        flex: 1,
                                        background: '#1f4e41',
                                        color: '#e2e8f0',
                                        border: 0,
                                        borderRadius: '8px',
                                        padding: '10px',
                                        fontSize: '12.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Retake
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    style={{
                                        flex: 2,
                                        background: '#16a34a',
                                        color: '#ffffff',
                                        border: 0,
                                        borderRadius: '8px',
                                        padding: '10px',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {uploading ? <RefreshCw size={15} className="spin"/> : <CheckCircle size={15}/>}
                                    <span>{uploading ? 'Saving...' : 'Upload & Save Photo'}</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
