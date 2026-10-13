import React, { useEffect, useRef, useState } from 'react';
import {
    Bot,
    Camera,
    CheckCircle2,
    Cloud,
    Code2,
    FileCode,
    GitBranch,
    History,
    MessageSquare,
    Mic,
    RefreshCw,
    RotateCcw,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
    Wrench,
    X,
    Zap
} from 'lucide-react';
import { api } from '../api';
import { getLanguage } from '../utils/translations';

export default function AiHelpCenterPage({ user }) {
    const [currentLang, setCurrentLang] = useState(() => getLanguage());
    const [statusData, setStatusData] = useState(null);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState('diagnose'); // 'diagnose' or 'auto_code'
    const [screenshots, setScreenshots] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [actionBusy, setActionBusy] = useState('');
    const [bannerMsg, setBannerMsg] = useState(null);
    const [latestReply, setLatestReply] = useState(null);
    const [listening, setListening] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const handler = (e) => setCurrentLang(e.detail || getLanguage());
        window.addEventListener('solarflow_language_change', handler);
        return () => window.removeEventListener('solarflow_language_change', handler);
    }, []);

    const loadStatus = async () => {
        setLoadingStatus(true);
        try {
            const res = await api('ai-help-center/status');
            setStatusData(res);
        } catch (err) {
            setBannerMsg({ type: 'error', text: err.message || 'Unable to load AI Help Center status.' });
        } finally {
            setLoadingStatus(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    // Support Ctrl+V clipboard screenshot paste
    useEffect(() => {
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const newFiles = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) newFiles.push(blob);
                }
            }
            if (newFiles.length > 0) {
                addScreenshots(newFiles);
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [screenshots]);

    const compressImage = (file) => new Promise((resolve) => {
        if (!file.type.startsWith('image/')) return resolve(file);
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                const maxDim = 1200;
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const optimized = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
                        resolve(optimized);
                    } else {
                        resolve(file);
                    }
                }, 'image/jpeg', 0.82);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    const addScreenshots = async (fileList) => {
        const incoming = Array.from(fileList || []).slice(0, 6 - screenshots.length);
        if (!incoming.length) return;
        const compressed = await Promise.all(incoming.map(f => compressImage(f)));
        const nextFiles = [...screenshots, ...compressed];
        setScreenshots(nextFiles);
        const nextPreviews = nextFiles.map(f => URL.createObjectURL(f));
        setPreviews(prev => {
            prev.forEach(u => URL.revokeObjectURL(u));
            return nextPreviews;
        });
    };

    const removeScreenshot = (idx) => {
        const nextFiles = screenshots.filter((_, i) => i !== idx);
        setScreenshots(nextFiles);
        setPreviews(prev => {
            if (prev[idx]) URL.revokeObjectURL(prev[idx]);
            return prev.filter((_, i) => i !== idx);
        });
    };

    const startVoice = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('તમારા બ્રાઉઝરમાં વૉઇસ ઇનપુટ સપોર્ટ નથી.');
            return;
        }
        const recog = new SpeechRecognition();
        recog.lang = currentLang === 'en' ? 'en-IN' : 'gu-IN';
        setListening(true);
        recog.onresult = (e) => {
            const text = e.results[0][0].transcript;
            setPrompt(prev => (prev ? `${prev} ${text}` : text));
        };
        recog.onerror = () => setListening(false);
        recog.onend = () => setListening(false);
        recog.start();
    };

    const handleRunHeal = async () => {
        setActionBusy('heal');
        setBannerMsg(null);
        try {
            const res = await api('ai-help-center/heal', { method: 'POST' });
            setBannerMsg({ type: 'success', text: res.message });
            setLatestReply({
                mode: 'auto_heal',
                reply: res.message,
                modified_files: res.details?.fixes || [],
                commit_hash: null
            });
            await loadStatus();
        } catch (err) {
            setBannerMsg({ type: 'error', text: err.message });
        } finally {
            setActionBusy('');
        }
    };

    const handleGitSync = async () => {
        setActionBusy('sync');
        setBannerMsg(null);
        try {
            const res = await api('ai-help-center/git-sync', { method: 'POST' });
            setBannerMsg({ type: 'success', text: res.message });
            setLatestReply({
                mode: 'git_sync',
                reply: res.message,
                modified_files: [],
                commit_hash: res.sync?.commit
            });
            await loadStatus();
        } catch (err) {
            setBannerMsg({ type: 'error', text: err.message });
        } finally {
            setActionBusy('');
        }
    };

    const handleRollback = async () => {
        if (!window.confirm('શું તમે ખરેખર છેલ્લો Git ફેરફાર પાછો ખેંચવા (Rollback) માંગો છો?')) return;
        setActionBusy('rollback');
        setBannerMsg(null);
        try {
            const res = await api('ai-help-center/rollback', { method: 'POST' });
            setBannerMsg({ type: 'success', text: res.message });
            await loadStatus();
        } catch (err) {
            setBannerMsg({ type: 'error', text: err.message });
        } finally {
            setActionBusy('');
        }
    };

    const handleSubmit = async (e, overrideMode = null) => {
        if (e && e.preventDefault) e.preventDefault();
        const activeMode = overrideMode || mode;
        if (!prompt.trim() && screenshots.length === 0) {
            setBannerMsg({ type: 'error', text: 'કૃપા કરીને તમારો પ્રશ્ન લખો અથવા એરરનો સ્ક્રીનશોટ અપલોડ કરો.' });
            return;
        }

        setSubmitting(true);
        setBannerMsg(null);
        try {
            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('mode', activeMode);
            screenshots.forEach(file => {
                formData.append('screenshots[]', file);
            });

            const res = await api('ai-help-center/chat', {
                method: 'POST',
                body: formData
            });

            setLatestReply(res);
            if (activeMode === 'auto_code') {
                setBannerMsg({
                    type: 'success',
                    text: '✅ AI એ કોડ અપડેટ કરીને GitHub અને cPanel પર ડિપ્લોય કરી દીધો છે!'
                });
            }
            await loadStatus();
        } catch (err) {
            setBannerMsg({ type: 'error', text: err.message || 'AI Help Center request failed.' });
        } finally {
            setSubmitting(false);
        }
    };

    if (user?.role !== 'super_admin') {
        return (
            <div className="panel">
                <h2>🔒 Super Admin Access Only</h2>
                <p>આ પેજ માત્ર Super Admin માટે જ ઉપલબ્ધ છે.</p>
            </div>
        );
    }

    const gitInfo = statusData?.git || {};
    const tickets = statusData?.tickets || [];

    return (
        <div className="employee-self" style={{ display: 'grid', gap: '16px' }}>
            {/* Top Hero Banner */}
            <section
                className="panel ai-hero-banner"
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #14532d 100%)',
                    color: '#ffffff',
                    padding: '20px',
                    borderRadius: '16px',
                    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(134, 239, 172, 0.18)', border: '1px solid rgba(134, 239, 172, 0.4)', color: '#86efac', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, marginBottom: '8px' }}>
                            <Sparkles size={13} /> 24×7 CLOUD AUTO-DOCTOR & AI DEVELOPER (PC-OFF READY)
                        </div>
                        <h2 style={{ color: '#ffffff', fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0' }}>
                            🤖 Antigravity AI Help Center & Auto-Coder
                        </h2>
                        <p style={{ color: '#d1fae5', fontSize: '13px', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
                            તમારું PC બંધ હોય ત્યારે પણ અહીંથી સ્ક્રીનશોટ મૂકીને એરરનું કારણ પૂછો, જાતે કોડ ફિક્સ કરાવો, ડેટાબેઝ ઓટો-હીલ કરો અને સીધું GitHub તથા cPanel પર ઓટો-ડિપ્લોય કરો.
                        </p>
                    </div>

                    {/* Live Connection Badges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', padding: '12px 14px', borderRadius: '12px', minWidth: '250px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#cbd5e1' }}>GitHub Auto-Token:</span>
                            <b style={{ color: '#86efac' }}>✓ Active (Never Expires)</b>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#cbd5e1' }}>cPanel Webhook:</span>
                            <b style={{ color: '#86efac' }}>✓ Auto-Deploy ON</b>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#cbd5e1' }}>Active Commit:</span>
                            <b style={{ color: '#ffffff', fontFamily: 'monospace', background: 'rgba(0,0,0,0.35)', padding: '2px 6px', borderRadius: '4px' }}>
                                {gitInfo.local_commit || '...'}
                            </b>
                        </div>
                    </div>
                </div>

                {/* 1-Click Quick Automation Bar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.14)' }}>
                    <button
                        type="button"
                        disabled={Boolean(actionBusy)}
                        onClick={handleRunHeal}
                        style={{
                            background: '#16a34a',
                            color: '#ffffff',
                            border: '1px solid #4ade80',
                            padding: '9px 14px',
                            borderRadius: '10px',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                    >
                        <ShieldCheck size={16} className={actionBusy === 'heal' ? 'spin' : ''} />
                        <span>{actionBusy === 'heal' ? 'Auto-Healing Database…' : '🩺 ડેટાબેઝ & સિસ્ટમ ઓટો-ફિક્સ (Run Auto-Doctor)'}</span>
                    </button>

                    <button
                        type="button"
                        disabled={Boolean(actionBusy)}
                        onClick={handleGitSync}
                        style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            border: '1px solid #38bdf8',
                            padding: '9px 14px',
                            borderRadius: '10px',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                    >
                        <Cloud size={16} className={actionBusy === 'sync' ? 'spin' : ''} />
                        <span>{actionBusy === 'sync' ? 'Syncing GitHub → cPanel…' : '🔄 GitHub → cPanel ઓટો-પુલ & ડિપ્લોય'}</span>
                    </button>

                    <button
                        type="button"
                        disabled={Boolean(actionBusy)}
                        onClick={handleRollback}
                        style={{
                            background: 'rgba(255,255,255,0.12)',
                            color: '#fecdd3',
                            border: '1px solid rgba(251, 113, 133, 0.45)',
                            padding: '9px 14px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '12.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer'
                        }}
                    >
                        <RotateCcw size={15} className={actionBusy === 'rollback' ? 'spin' : ''} />
                        <span>⏪ Undo / Rollback Last Commit</span>
                    </button>
                </div>
            </section>

            {bannerMsg && (
                <div
                    className={bannerMsg.type === 'success' ? 'success' : 'error'}
                    style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}
                >
                    {bannerMsg.text}
                </div>
            )}

            {/* Main AI Help Center Studio Form */}
            <form className="panel" onSubmit={handleSubmit} style={{ border: '1.5px solid #bbf7d0' }}>
                <div className="panel-head" style={{ marginBottom: '14px' }}>
                    <div>
                        <h2>🛠️ AI Problem Solver & Auto-Code Studio</h2>
                        <p>એક કે વધુ સ્ક્રીનશોટ મૂકો અને ગુજરાતી/હિન્દીમાં લખો કે બોલો — AI જવાબ આપશે અને કહેશો ત્યારે જાતે કોડ કરીને Git/cPanel પર ચડાવી દેશે.</p>
                    </div>
                    <Bot size={24} style={{ color: '#16a34a' }} />
                </div>

                {/* Mode Selector Pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    <button
                        type="button"
                        onClick={() => setMode('diagnose')}
                        style={{
                            padding: '12px 14px',
                            borderRadius: '12px',
                            border: mode === 'diagnose' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                            background: mode === 'diagnose' ? '#f0f9ff' : '#f8fafc',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}
                    >
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: mode === 'diagnose' ? '#0284c7' : '#e2e8f0', color: mode === 'diagnose' ? '#fff' : '#475569', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <MessageSquare size={18} />
                        </div>
                        <div>
                            <b style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>
                                💬 પહેલા પૂછો & સમજાવો (Code Mat Karna)
                            </b>
                            <small style={{ fontSize: '11.5px', color: '#475569' }}>
                                સ્ક્રીનશોટ અને કોડ ચેક કરીને ગુજરાતીમાં કારણ અને ઉપાય બતાવશે.
                            </small>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setMode('auto_code')}
                        style={{
                            padding: '12px 14px',
                            borderRadius: '12px',
                            border: mode === 'auto_code' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                            background: mode === 'auto_code' ? '#f0fdf4' : '#f8fafc',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}
                    >
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: mode === 'auto_code' ? '#16a34a' : '#e2e8f0', color: mode === 'auto_code' ? '#fff' : '#475569', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Code2 size={18} />
                        </div>
                        <div>
                            <b style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>
                                ⚡ જાતે કોડ કરો + Git Push + cPanel Deploy
                            </b>
                            <small style={{ fontSize: '11.5px', color: '#475569' }}>
                                AI જાતે કોડ ફિક્સ કરીને GitHub અને cPanel પર લાઈવ અપડેટ કરી દેશે.
                            </small>
                        </div>
                    </button>
                </div>

                {/* Multi-Screenshot Upload Box */}
                <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                            📸 એરર કે UI ના સ્ક્રીનશોટ મૂકો (Multiple Screenshots / Ctrl+V Paste):
                        </label>
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}
                        >
                            <Camera size={14} /> + સ્ક્રીનશોટ પસંદ કરો ({screenshots.length}/6)
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => addScreenshots(e.target.files)}
                        />
                    </div>

                    {previews.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #94a3b8' }}>
                            {previews.map((src, idx) => (
                                <div key={idx} style={{ position: 'relative', width: '110px', height: '82px', borderRadius: '8px', overflow: 'hidden', border: '1.5px solid #cbd5e1', background: '#fff' }}>
                                    <img src={src} alt={`Screenshot ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button
                                        type="button"
                                        onClick={() => removeScreenshot(idx)}
                                        style={{
                                            position: 'absolute',
                                            top: '4px',
                                            right: '4px',
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '50%',
                                            background: 'rgba(220, 38, 38, 0.9)',
                                            color: '#fff',
                                            border: 'none',
                                            display: 'grid',
                                            placeItems: 'center',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: '14px',
                                border: '1.5px dashed #cbd5e1',
                                borderRadius: '10px',
                                background: '#f8fafc',
                                textAlign: 'center',
                                color: '#64748b',
                                fontSize: '12.5px',
                                cursor: 'pointer'
                            }}
                        >
                            📷 અહીં ક્લિક કરીને એક અથવા વધુ સ્ક્રીનશોટ અપલોડ કરો (અથવા સીધું Ctrl+V થી પેસ્ટ કરો)
                        </div>
                    )}
                </div>

                {/* Prompt Input + Voice Mic */}
                <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                            ✍️ તમારી સમસ્યા કે કયો સુધારો કરવો છે તે લખો:
                        </label>
                        <button
                            type="button"
                            onClick={startVoice}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: listening ? '#fee2e2' : '#f1f5f9',
                                border: listening ? '1px solid #f87171' : '1px solid #cbd5e1',
                                color: listening ? '#dc2626' : '#0284c7',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <Mic size={13} />
                            <span>{listening ? '🔴 Listening…' : '🎙️ બોલીને લખો'}</span>
                        </button>
                    </div>
                    <textarea
                        rows="4"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="દા.ત. આ સ્ક્રીનશોટમાં જે એરર દેખાય છે તે કેમ આવે છે? અથવા My Attendance પેજમાં આ સુધારો કરી દો અને Git પર પુશ કરી દો..."
                    />
                </div>

                <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {mode === 'diagnose'
                            ? '💡 હાલમાં "પહેલા પૂછો (Code Mat Karna)" મોડ સિલેક્ટ છે.'
                            : '⚡ હાલમાં "Auto-Code + Git Push + cPanel Deploy" મોડ સિલેક્ટ છે.'}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="secondary"
                            disabled={submitting}
                            onClick={(e) => handleSubmit(e, 'diagnose')}
                            style={{ fontWeight: 700 }}
                        >
                            <MessageSquare size={15} />
                            <span>{submitting && mode === 'diagnose' ? 'ચેક થાય છે…' : '💬 પહેલા જવાબ આપો (No Code)'}</span>
                        </button>
                        <button
                            type="button"
                            className="primary"
                            disabled={submitting}
                            onClick={(e) => handleSubmit(e, 'auto_code')}
                            style={{ background: '#16a34a', fontWeight: 800 }}
                        >
                            <Zap size={15} />
                            <span>{submitting && mode === 'auto_code' ? 'Coding & Deploying…' : '⚡ Auto-Code & Git Push કરો'}</span>
                        </button>
                    </div>
                </div>
            </form>

            {/* Latest AI Reply Box */}
            {latestReply && (
                <section className="panel" style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                    <div className="panel-head" style={{ marginBottom: '10px' }}>
                        <div>
                            <h2 style={{ color: '#14532d' }}>🤖 Antigravity AI નો જવાબ અને રિપોર્ટ</h2>
                            <p style={{ color: '#166534' }}>
                                {latestReply.mode === 'auto_code' ? 'કોડ અપડેટ અને ડિપ્લોયમેન્ટ પૂર્ણ' : 'ડાયગ્નોસિસ અને સોલ્યુશન પ્લાન'}
                            </p>
                        </div>
                        {latestReply.commit_hash && (
                            <span style={{ background: '#15803d', color: '#fff', padding: '4px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 800, fontFamily: 'monospace' }}>
                                Commit: {latestReply.commit_hash}
                            </span>
                        )}
                    </div>
                    <div
                        style={{
                            background: '#ffffff',
                            border: '1px solid #bbf7d0',
                            borderRadius: '12px',
                            padding: '14px 16px',
                            fontSize: '13.5px',
                            color: '#0f172a',
                            lineHeight: 1.65,
                            whiteSpace: 'pre-wrap'
                        }}
                    >
                        {latestReply.reply}
                    </div>
                </section>
            )}

            {/* History of AI Tickets & Auto-Healed Errors */}
            <section className="panel">
                <div className="panel-head" style={{ marginBottom: '12px' }}>
                    <div>
                        <h2>📜 Auto-Fixed Errors & AI Help Center History</h2>
                        <p>સિસ્ટમે જાતે સોલ્વ કરેલી એરર અને અગાઉના AI કોડ અપડેટ્સનો રેકોર્ડ</p>
                    </div>
                    <button type="button" className="secondary" onClick={loadStatus} disabled={loadingStatus}>
                        <RefreshCw size={14} className={loadingStatus ? 'spin' : ''} /> Refresh
                    </button>
                </div>

                {tickets.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    padding: '12px 14px',
                                    background: '#f8fafc'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span
                                            style={{
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                background: ticket.mode === 'auto_code' ? '#dcfce7' : ticket.mode === 'auto_heal' ? '#fef3c7' : '#dbeafe',
                                                color: ticket.mode === 'auto_code' ? '#166534' : ticket.mode === 'auto_heal' ? '#92400e' : '#1e40af'
                                            }}
                                        >
                                            {ticket.mode === 'auto_code' ? '⚡ Auto-Coded & Pushed' : ticket.mode === 'auto_heal' ? '🩺 Auto-Doctor Healed' : ticket.mode === 'git_sync' ? '🔄 Git cPanel Sync' : '💬 AI Diagnosis'}
                                        </span>
                                        <b style={{ fontSize: '13px', color: '#0f172a' }}>
                                            {ticket.prompt || 'Screenshot Analysis'}
                                        </b>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {ticket.commit_hash && (
                                            <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                #{ticket.commit_hash}
                                            </span>
                                        )}
                                        <small style={{ color: '#64748b', fontSize: '11px' }}>{ticket.created_at}</small>
                                    </div>
                                </div>

                                {ticket.screenshots?.length > 0 && (
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                        {ticket.screenshots.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noreferrer">
                                                <img src={url} alt="" style={{ width: '70px', height: '52px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {ticket.ai_reply && (
                                    <div style={{ fontSize: '12.5px', color: '#334155', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                        {ticket.ai_reply}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: '#64748b', fontSize: '13px' }}>હજુ સુધી કોઈ ટિકિટ કે એરર લોગ નથી.</p>
                )}
            </section>
        </div>
    );
}
