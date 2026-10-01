import React, {useEffect, useRef, useState} from 'react';
import {Camera, CheckCircle, Crosshair, MapPin, RefreshCw, SwitchCamera, X} from 'lucide-react';
import {api} from '../api';

export default function LiveBackCameraModal({task, onClose, onUploaded}) {
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

    // Auto-detect GPS
    const detectGps = () => {
        if (!navigator.geolocation) {
            setGps({latitude: null, longitude: null, accuracy: null, status: 'GPS not supported on this device'});
            return;
        }

        setGps(prev => ({...prev, status: 'Fetching live GPS...'}));
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGps({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    status: `Lat: ${pos.coords.latitude.toFixed(5)}, Lon: ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)}m)`
                });
            },
            (err) => {
                setGps({latitude: null, longitude: null, accuracy: null, status: 'GPS Warning: ' + err.message});
            },
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

    // Snap Photo onto Canvas with Date/Time + GPS Stamp
    const takePhoto = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');

        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Overlay Clean Digital Watermark (Date/Time & GPS)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, canvas.height - 48, canvas.width, 48);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        const nowStr = new Date().toLocaleString('en-IN');
        const locStr = gps.latitude ? `GPS: ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : 'Solar Plant Location';
        ctx.fillText(`⚡ SolarFlow Plant Check · ${nowStr} · ${locStr}`, 16, canvas.height - 18);

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
                            📷 Live Plant Photo Capture (Back Camera)
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

                    {/* Live GPS Watermark Pill on Bottom Left */}
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        right: '10px',
                        background: 'rgba(0,0,0,0.72)',
                        backdropFilter: 'blur(6px)',
                        color: '#f8fafc',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                    }}>
                        <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
                            <MapPin size={13} style={{color: '#4ade80'}}/>
                            <span>{gps.status}</span>
                        </span>
                        {!capturedImage && (
                            <button
                                type="button"
                                onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
                                style={{background: 'rgba(255,255,255,0.2)', border: 0, color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', cursor: 'pointer'}}
                                title="Flip Camera"
                            >
                                <SwitchCamera size={12}/>
                            </button>
                        )}
                    </div>
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
                                    <span>{uploading ? 'Saving...' : 'Upload & Save (10-Day Retention)'}</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
