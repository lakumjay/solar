import React, { useState, useEffect, useRef } from 'react';
import { 
    Phone, PhoneOff, PhoneCall, Volume2, VolumeX, AlertTriangle, 
    Zap, Radio, Activity, Sparkles, ExternalLink, RefreshCw, X 
} from 'lucide-react';
import { GoogleGenAI, Modality } from '@google/genai';
import { PcmPlayer, base64ToInt16 } from '../lib/audio';
import { api, getApiBaseUrl } from '../api';

/**
 * EmergencyIncomingCallModal
 * Realistic iPhone / Android In-App Emergency Phone Call Interface
 * Uses the exact selected Gemini natural human voice (Aoede / selected voice) — zero robotic voice.
 */
export default function EmergencyIncomingCallModal({ 
    isOpen, 
    onClose, 
    callData, 
    autoAnswer = false,
    onNavigateLossAnalytics 
}) {
    if (!isOpen) return null;

    const selectedVoice = (() => {
        try {
            return localStorage.getItem('solarflow.aiVoiceName') || callData?.voice_name || 'Aoede';
        } catch (_) {
            return callData?.voice_name || 'Aoede';
        }
    })();

    const callerName = callData?.caller_name || '⚡ SolarFlow AI Emergency Dispatch';
    const callerNumber = callData?.caller_number || '+91 1800-SOLAR-AI';
    const alertTitle = callData?.alert_title || '🚨 ૬૬KV લાઇન ટ્રીપ / ઇન્વર્ટર બંધ એલર્ટ';
    const plantName = callData?.plant_name || 'ઓલ સોલાર પ્લાન્ટ્સ (All Plants)';
    const engineerPhone = callData?.engineer_phone || '+919909900066';
    const speechText = callData?.speech_text || 'નમસ્તે સુપર એડમિન! સોલાર પ્લાન્ટ પર ઇમરજન્સી એલર્ટ છે. ૬૬KV સબસ્ટેશન લાઇન ટ્રીપ થઈ ગઈ છે અથવા ઇન્વર્ટર બંધ છે. કુલ ઉત્પાદન ૦ kW થઈ ગયું છે. કૃપા કરીને તાત્કાલિક સાઇટ ટીમ અથવા ઇજનેરનો સંપર્ક કરો અને ગ્રીડ ચેક કરો.';

    const [callState, setCallState] = useState(autoAnswer ? 'connected' : 'incoming'); // incoming, connected, ended
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [speechAudioPlaying, setSpeechAudioPlaying] = useState(false);
    const [voiceLogoutStatus, setVoiceLogoutStatus] = useState(null); // null | 'processing' | 'done'
    const [activeDisplaySpeech, setActiveDisplaySpeech] = useState(speechText);
    const [heardUserText, setHeardUserText] = useState('');

    // Audio & Vibration refs
    const ringAudioRef = useRef(null);
    const speechAudioRef = useRef(null);
    const preloadedAudioRef = useRef(null);
    const pcmPlayerRef = useRef(null);
    const liveSessionRef = useRef(null);
    const liveReadyRef = useRef(false);
    const speechRecogRef = useRef(null);
    const logoutTriggeredRef = useRef(false);
    const ringOscillatorCtxRef = useRef(null);
    const vibrateTimerRef = useRef(null);
    const durationTimerRef = useRef(null);
    const wakeLockRef = useRef(null);

    // Stop all ringing sounds and vibrations
    const stopRingtone = () => {
        try {
            if (ringAudioRef.current) {
                ringAudioRef.current.pause();
                ringAudioRef.current.currentTime = 0;
            }
        } catch (_) {}

        try {
            if (ringOscillatorCtxRef.current) {
                ringOscillatorCtxRef.current.close().catch(() => {});
                ringOscillatorCtxRef.current = null;
            }
        } catch (_) {}

        if (vibrateTimerRef.current) {
            clearInterval(vibrateTimerRef.current);
            vibrateTimerRef.current = null;
        }

        try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(0);
            }
        } catch (_) {}
    };

    // Synthesize phone ringing tones
    const startRingtone = () => {
        try {
            const audio = new Audio('/sounds/alert.wav');
            audio.loop = true;
            audio.volume = 1.0;
            audio.play().catch(() => {
                playSyntheticRing();
            });
            ringAudioRef.current = audio;
        } catch (_) {
            playSyntheticRing();
        }

        const triggerVibration = () => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([1000, 400, 1000, 400, 1000]);
            }
        };
        triggerVibration();
        vibrateTimerRef.current = setInterval(triggerVibration, 3200);
    };

    // Web Audio dual-frequency ring tone (440Hz + 480Hz classic phone cadence)
    const playSyntheticRing = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            ringOscillatorCtxRef.current = ctx;

            const ringBurst = () => {
                if (!ringOscillatorCtxRef.current || ringOscillatorCtxRef.current.state === 'closed') return;
                const now = ctx.currentTime;
                
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc1.frequency.value = 440;
                osc2.type = 'sine';
                osc2.frequency.value = 480;

                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 1.8);
                osc2.stop(now + 1.8);
            };

            ringBurst();
            const ringInt = setInterval(() => {
                if (!ringOscillatorCtxRef.current || ringOscillatorCtxRef.current.state === 'closed') {
                    clearInterval(ringInt);
                    return;
                }
                ringBurst();
            }, 3000);
        } catch (_) {}
    };

    // Request Screen Wake Lock & pre-connect Gemini Live Selected Voice (Aoede) while ringing
    useEffect(() => {
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').then(lock => {
                wakeLockRef.current = lock;
            }).catch(() => {});
        }

        let cancelled = false;
        const initGeminiVoice = async () => {
            try {
                const player = new PcmPlayer(24000);
                player.onEndedCallback = () => {
                    setIsAiSpeaking(false);
                    setSpeechAudioPlaying(false);
                };
                pcmPlayerRef.current = player;

                const cfg = await api('voice-agent/config', {
                    method: 'POST',
                    body: JSON.stringify({ voice_name: selectedVoice })
                });
                if (cancelled) return;

                const authToken = cfg?.auth_token || cfg?.apiKey;
                const voiceToUse = cfg?.voice_name || selectedVoice || 'Aoede';
                if (!authToken || authToken === 'solarflow_ready') return;

                const ai = new GoogleGenAI({
                    apiKey: authToken,
                    httpOptions: { apiVersion: 'v1alpha' }
                });

                const session = await ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-latest',
                    config: {
                        responseModalities: [Modality.AUDIO],
                        systemInstruction: `તમે SolarFlow AI છો. તમારો અવાજ કુદરતી અને મીઠો સ્ત્રીનો અવાજ (${voiceToUse}) છે. યુઝર તમને જે ગુજરાતી એલર્ટ સંદેશ આપે, તે સંદેશ કોઈ પણ ફેરફાર વગર શબ્દશઃ સ્પષ્ટ અને કુદરતી ગુજરાતી અવાજમાં બોલી સંભળાવો.`,
                        thinkingConfig: { thinkingBudget: 0 },
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: voiceToUse
                                }
                            }
                        }
                    },
                    callbacks: {
                        onopen: () => {
                            if (!cancelled) {
                                liveReadyRef.current = true;
                            }
                        },
                        onmessage: (msg) => {
                            const parts = msg?.serverContent?.modelTurn?.parts || [];
                            for (const part of parts) {
                                if (part.inlineData?.data && pcmPlayerRef.current) {
                                    setIsAiSpeaking(true);
                                    setSpeechAudioPlaying(true);
                                    pcmPlayerRef.current.enqueue(base64ToInt16(part.inlineData.data));
                                }
                            }
                        },
                        onerror: () => {},
                        onclose: () => {
                            liveReadyRef.current = false;
                        }
                    }
                });

                if (!cancelled) {
                    liveSessionRef.current = session;
                } else {
                    try { session.close(); } catch (_) {}
                }
            } catch (_) {}
        };

        initGeminiVoice();

        return () => {
            cancelled = true;
            liveReadyRef.current = false;
            try {
                if (liveSessionRef.current) {
                    liveSessionRef.current.close();
                    liveSessionRef.current = null;
                }
            } catch (_) {}
            try {
                if (pcmPlayerRef.current) {
                    pcmPlayerRef.current.close();
                    pcmPlayerRef.current = null;
                }
            } catch (_) {}
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
            }
        };
    }, [selectedVoice]);

    const faultType = callData?.fault_type || 'grid_66kv_tripping';
    const isAttendanceCall = ['employee_missing_clock_in', 'attendance_pending_4pm', 'employee_logout_630pm', 'employee_logout_700pm'].includes(faultType);
    const isLogoutCall = ['employee_logout_630pm', 'employee_logout_700pm'].includes(faultType);

    // Execute Voice Logout ("હા AI, મારું લોગઆઉટ કરી દે") directly from the active call
    const executeVoiceLogout = async () => {
        if (logoutTriggeredRef.current) return;
        logoutTriggeredRef.current = true;
        setVoiceLogoutStatus('processing');

        try {
            const res = await api('voice-agent/voice-action', {
                method: 'POST',
                body: JSON.stringify({ action: 'logout' })
            });
            const replySpeech = res?.speech || 'હા, તમારું આજનું લોગઆઉટ સફળતાપૂર્વક થઈ ગયું છે. શુભ રાત્રિ!';
            setVoiceLogoutStatus('done');
            setActiveDisplaySpeech(replySpeech);
            await playAiSpeech(replySpeech);

            setTimeout(() => {
                handleEndCall();
            }, 4800);
        } catch (err) {
            logoutTriggeredRef.current = false;
            setVoiceLogoutStatus(null);
        }
    };

    // Listen for spoken voice command ("હા AI, મારું લોગઆઉટ કરી દે" / "લોગઆઉટ કરો") during connected call
    useEffect(() => {
        if (callState !== 'connected') return;
        const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SpeechRecognition) return;

        let active = true;
        const startRecog = () => {
            if (!active || logoutTriggeredRef.current) return;
            try {
                const recog = new SpeechRecognition();
                speechRecogRef.current = recog;
                recog.lang = 'gu-IN';
                recog.interimResults = true;
                recog.maxAlternatives = 2;

                recog.onresult = (event) => {
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = (event.results[i]?.[0]?.transcript || '').trim();
                        if (!transcript) continue;
                        setHeardUserText(transcript);
                        const lower = transcript.toLowerCase();
                        if (
                            lower.includes('લોગઆઉટ') ||
                            lower.includes('લોગ આઉટ') ||
                            lower.includes('logout') ||
                            lower.includes('log out') ||
                            lower.includes('clock out') ||
                            lower.includes('ક્લોક આઉટ') ||
                            (isLogoutCall && (lower.includes('હા') || lower.includes('કરી દે') || lower.includes('કરી દો') || lower.includes('yes') || lower.includes('ok')))
                        ) {
                            executeVoiceLogout();
                            return;
                        }
                    }
                };

                recog.onend = () => {
                    if (active && !logoutTriggeredRef.current) {
                        setTimeout(startRecog, 350);
                    }
                };

                recog.onerror = () => {
                    if (active && !logoutTriggeredRef.current) {
                        setTimeout(startRecog, 800);
                    }
                };

                recog.start();
            } catch (_) {}
        };

        startRecog();

        return () => {
            active = false;
            try {
                if (speechRecogRef.current) {
                    speechRecogRef.current.stop();
                    speechRecogRef.current = null;
                }
            } catch (_) {}
        };
    }, [callState, isLogoutCall]);

    // Handle Incoming Ringing State + Auto-Answer so AI speaks out loud automatically
    useEffect(() => {
        // Preload backend Gemini Aoede WAV audio immediately so playback has zero buffering delay
        try {
            if (speechText && typeof speechText === 'string' && speechText.trim().length > 0) {
                const preloadUrl = `${getApiBaseUrl().base}voice-agent/tts?text=${encodeURIComponent(speechText.trim())}&language=gu&voice=${encodeURIComponent(selectedVoice)}`;
                const preloadAudio = new Audio(preloadUrl);
                preloadAudio.preload = 'auto';
                preloadAudio.load();
                preloadedAudioRef.current = preloadAudio;
            }
        } catch (_) {}

        let autoAnswerTimer = null;
        if (callState === 'incoming') {
            startRingtone();
            // Automatically connect after 2.2 seconds of ringing so AI speaks the Gujarati voice alert out loud
            autoAnswerTimer = setTimeout(() => {
                stopRingtone();
                setCallState('connected');
            }, 2200);
        } else {
            stopRingtone();
        }
        return () => {
            if (autoAnswerTimer) clearTimeout(autoAnswerTimer);
            stopRingtone();
        };
    }, [callState, speechText, selectedVoice]);

    // Handle Connected Call: Timer and AI Voice Speech
    useEffect(() => {
        if (callState === 'connected') {
            stopRingtone();

            // Start duration timer
            durationTimerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);

            // Play AI Speech in Gujarati out loud immediately using selected Gemini voice (Aoede)
            playAiSpeech(speechText);
        } else {
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current);
                durationTimerRef.current = null;
            }
        }

        return () => {
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current);
            }
            stopAiSpeech();
        };
    }, [callState, speechText]);

    // Play Voice via Selected Gemini Live Voice (Aoede) or Backend Gemini Aoede WAV (NEVER robotic browser speechSynthesis)
    const playAiSpeech = async (text) => {
        if (!text) return;
        stopAiSpeech();
        setIsAiSpeaking(true);
        setSpeechAudioPlaying(true);

        // 1. If Gemini Live (Aoede) WebSocket is ready, speak directly through 24kHz HD PcmPlayer
        if (liveSessionRef.current && liveReadyRef.current && pcmPlayerRef.current) {
            try {
                await pcmPlayerRef.current.resume();
                liveSessionRef.current.sendClientContent({
                    turns: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    text: `આ એલર્ટ સંદેશ શબ્દશઃ ગુજરાતીમાં બોલો: "${text}"`
                                }
                            ]
                        }
                    ],
                    turnComplete: true
                });
                return;
            } catch (_) {}
        }

        // 2. Otherwise play Backend Gemini Aoede 24kHz WAV Audio
        const ttsUrl = `${getApiBaseUrl().base}voice-agent/tts?text=${encodeURIComponent(text)}&language=gu&voice=${encodeURIComponent(selectedVoice)}`;
        const audio = preloadedAudioRef.current || new Audio(ttsUrl);
        preloadedAudioRef.current = null;
        audio.volume = 1.0;
        speechAudioRef.current = audio;

        audio.onended = () => {
            setIsAiSpeaking(false);
            setSpeechAudioPlaying(false);
        };

        audio.onerror = () => {
            setIsAiSpeaking(false);
            setSpeechAudioPlaying(false);
        };

        audio.play().catch(() => {
            setIsAiSpeaking(false);
            setSpeechAudioPlaying(false);
        });
    };

    const stopAiSpeech = () => {
        try {
            if (pcmPlayerRef.current) {
                pcmPlayerRef.current.interrupt();
            }
        } catch (_) {}
        try {
            if (speechAudioRef.current) {
                speechAudioRef.current.pause();
                speechAudioRef.current.currentTime = 0;
                speechAudioRef.current = null;
            }
        } catch (_) {}
        setIsAiSpeaking(false);
        setSpeechAudioPlaying(false);
    };

    // Answer call button
    const handleAcceptCall = () => {
        stopRingtone();
        setCallState('connected');
        playAiSpeech(speechText);
    };

    // Decline / End call
    const handleEndCall = () => {
        stopRingtone();
        stopAiSpeech();
        try {
            if (speechRecogRef.current) {
                speechRecogRef.current.stop();
                speechRecogRef.current = null;
            }
        } catch (_) {}
        setCallState('ended');

        // Dismiss active emergency state in backend
        try {
            api('voice-agent/dismiss-emergency', { method: 'POST' }).catch(() => {});
        } catch (_) {}

        setTimeout(() => {
            onClose();
        }, 500);
    };

    const formatTimer = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Unlock iOS/Android AudioContext on first touch / tap and ensure speech plays out loud
    const unlockAudioOnGesture = () => {
        try {
            if (pcmPlayerRef.current) {
                pcmPlayerRef.current.resume().catch(() => {});
            }
            if (callState === 'incoming') {
                stopRingtone();
                setCallState('connected');
                playAiSpeech(speechText);
            } else if (callState === 'connected' && !speechAudioPlaying) {
                playAiSpeech(speechText);
            }
        } catch (_) {}
    };

    return (
        <div 
            onClick={unlockAudioOnGesture}
            onTouchStart={unlockAudioOnGesture}
            style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'radial-gradient(circle at 50% 25%, #1e1b4b 0%, #0b0f19 80%, #030712 100%)',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '40px 24px 50px 24px',
            userSelect: 'none',
            overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            {/* Top Close Dismiss Icon (subtle top right) */}
            <button
                type="button"
                className="close-call-btn"
                aria-label="Close Call"
                title="કૉલ બંધ કરો (Close Call)"
                onClick={handleEndCall}
                style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(255, 255, 255, 0.18)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '50%',
                    width: '38px',
                    height: '38px',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35)'
                }}
            >
                <X size={18} />
            </button>

            {/* Header / Caller Info Section */}
            <div style={{ textAlign: 'center', width: '100%', maxWidth: '360px', marginTop: '20px' }}>
                {/* Emergency Badge */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    padding: '6px 14px',
                    borderRadius: '30px',
                    color: '#fca5a5',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    marginBottom: '16px',
                    boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)'
                }}>
                    <Radio size={14} className="animate-pulse" style={{ color: '#ef4444' }} />
                    <span>AI EMERGENCY VOICE DISPATCH</span>
                </div>

                {/* Caller Title */}
                <h1 style={{
                    fontSize: '26px',
                    fontWeight: 800,
                    margin: '0 0 6px 0',
                    color: '#ffffff',
                    letterSpacing: '-0.3px',
                    textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)'
                }}>
                    {callerName}
                </h1>

                {/* Caller Number & Subtitle */}
                <p style={{
                    fontSize: '15px',
                    color: '#94a3b8',
                    margin: '0 0 12px 0',
                    fontWeight: 500
                }}>
                    {callerNumber} • {plantName}
                </p>

                {/* Call Status Caption */}
                {callState === 'incoming' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#38bdf8',
                        fontSize: '14px',
                        fontWeight: 600,
                        animation: 'pulse 1.5s infinite'
                    }}>
                        <PhoneCall size={16} />
                        <span>ઇનકમિંગ કૉલ આવી રહ્યો છે...</span>
                    </div>
                )}

                {callState === 'connected' && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(34, 197, 94, 0.15)',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                        padding: '4px 14px',
                        borderRadius: '20px',
                        color: '#4ade80',
                        fontSize: '14px',
                        fontWeight: 700
                    }}>
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            boxShadow: '0 0 8px #22c55e'
                        }} />
                        <span>કૉલ ચાલુ છે • {formatTimer(callDuration)}</span>
                    </div>
                )}
            </div>

            {/* Center Visualizer Section */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                maxWidth: '380px',
                my: 'auto'
            }}>
                {/* Big Glowing Ringing / Speaking Avatar */}
                <div style={{ position: 'relative', margin: '24px 0' }}>
                    {/* Outer animated ripple rings when incoming or speaking */}
                    {(callState === 'incoming' || isAiSpeaking) && (
                        <>
                            <div style={{
                                position: 'absolute',
                                inset: '-25px',
                                borderRadius: '50%',
                                border: callState === 'incoming' ? '2px solid rgba(239, 68, 68, 0.4)' : '2px solid rgba(56, 189, 248, 0.4)',
                                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
                            }} />
                            <div style={{
                                position: 'absolute',
                                inset: '-12px',
                                borderRadius: '50%',
                                border: callState === 'incoming' ? '2px solid rgba(239, 68, 68, 0.6)' : '2px solid rgba(56, 189, 248, 0.6)',
                                animation: 'pulse 1.5s infinite'
                            }} />
                        </>
                    )}

                    <div style={{
                        width: '130px',
                        height: '130px',
                        borderRadius: '50%',
                        background: callState === 'incoming'
                            ? 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)'
                            : 'linear-gradient(135deg, #0284c7 0%, #1e40af 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: callState === 'incoming'
                            ? '0 0 45px rgba(239, 68, 68, 0.6)'
                            : '0 0 45px rgba(2, 132, 199, 0.6)',
                        border: '3px solid rgba(255, 255, 255, 0.4)',
                        position: 'relative'
                    }}>
                        {callState === 'incoming' ? (
                            <Zap size={60} color="#ffffff" className="animate-bounce" />
                        ) : (
                            <Sparkles size={58} color="#ffffff" className={isAiSpeaking ? 'animate-pulse' : ''} />
                        )}
                    </div>
                </div>

                {/* Connected Mode: Voice Waveform Equalizer Bars */}
                {callState === 'connected' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        height: '42px',
                        margin: '12px 0 16px 0'
                    }}>
                        {[16, 28, 38, 24, 42, 34, 18, 40, 26, 36, 20, 32].map((height, i) => (
                            <div
                                key={i}
                                style={{
                                    width: '4px',
                                    height: isAiSpeaking ? `${height}px` : '8px',
                                    background: isAiSpeaking
                                        ? 'linear-gradient(to top, #38bdf8, #818cf8)'
                                        : 'rgba(148, 163, 184, 0.4)',
                                    borderRadius: '4px',
                                    transition: 'height 0.15s ease-in-out',
                                    animation: isAiSpeaking ? `pulse 0.7s infinite alternate ${i * 0.08}s` : 'none'
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* AI Speech Transcript Card (when connected) */}
                {callState === 'connected' && (
                    <div style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: voiceLogoutStatus === 'done'
                            ? '1.5px solid rgba(34, 197, 94, 0.65)'
                            : '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '16px',
                        padding: '16px 18px',
                        width: '100%',
                        textAlign: 'left',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '10px'
                        }}>
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: voiceLogoutStatus === 'done' ? '#4ade80' : '#38bdf8',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Volume2 size={15} />
                                <span>
                                    {voiceLogoutStatus === 'done'
                                        ? '✅ કૉલ પરથી લોગઆઉટ પૂર્ણ!'
                                        : isAiSpeaking
                                        ? `AI (${selectedVoice}) ગુજરાતીમાં બોલી રહ્યું છે...`
                                        : 'AI સંદેશ પૂર્ણ — તમે બોલી શકો છો'}
                                </span>
                            </span>

                            {/* Replay voice button */}
                            <button
                                type="button"
                                onClick={() => playAiSpeech(activeDisplaySpeech)}
                                style={{
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    border: '1px solid rgba(56, 189, 248, 0.4)',
                                    borderRadius: '12px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#38bdf8',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <RefreshCw size={12} className={isAiSpeaking ? 'spin' : ''} />
                                <span>ફરીથી સાંભળો</span>
                            </button>
                        </div>

                        <p style={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: 1.6,
                            color: '#f8fafc',
                            fontWeight: 500
                        }}>
                            "{activeDisplaySpeech}"
                        </p>

                        {heardUserText && (
                            <div style={{
                                marginTop: '10px',
                                padding: '6px 10px',
                                borderRadius: '10px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                fontSize: '12px',
                                color: '#6ee7b7',
                                fontWeight: 600
                            }}>
                                🗣️ તમે બોલ્યા: "{heardUserText}"
                            </div>
                        )}

                        {isLogoutCall && voiceLogoutStatus !== 'done' && (
                            <div style={{
                                marginTop: '10px',
                                padding: '8px 12px',
                                borderRadius: '12px',
                                background: 'rgba(245, 158, 11, 0.14)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                fontSize: '12px',
                                color: '#fde68a',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                flexWrap: 'wrap'
                            }}>
                                <span>🎙️ કૉલ પર બોલો: <strong>"હા AI, મારું લોગઆઉટ કરી દે"</strong></span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Actions Section */}
            <div style={{ width: '100%', maxWidth: '360px', marginTop: '20px' }}>
                {/* 1. INCOMING STATE: iPhone / Android Green Accept & Red Decline Buttons */}
                {callState === 'incoming' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-around',
                        width: '100%',
                        padding: '0 10px'
                    }}>
                        {/* Decline Button */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={handleEndCall}
                                style={{
                                    width: '72px',
                                    height: '72px',
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    border: 'none',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)',
                                    transition: 'transform 0.1s'
                                }}
                            >
                                <PhoneOff size={32} />
                            </button>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f87171' }}>
                                કાપો (Decline)
                            </span>
                        </div>

                        {/* Accept Button (Pulsing) */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={handleAcceptCall}
                                style={{
                                    width: '74px',
                                    height: '74px',
                                    borderRadius: '50%',
                                    background: '#22c55e',
                                    border: 'none',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 0 25px rgba(34, 197, 94, 0.7)',
                                    animation: 'pulse 1.5s infinite',
                                    transition: 'transform 0.1s'
                                }}
                            >
                                <Phone size={34} />
                            </button>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>
                                ઉપાડો (Accept)
                            </span>
                        </div>
                    </div>
                )}

                {/* 2. CONNECTED STATE: Quick Actions + End Call Button */}
                {callState === 'connected' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Instant Voice Logout Button when on a Logout / Attendance Call */}
                        {(isLogoutCall || isAttendanceCall) && voiceLogoutStatus !== 'done' && (
                            <button
                                type="button"
                                onClick={executeVoiceLogout}
                                disabled={voiceLogoutStatus === 'processing'}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    border: '1px solid rgba(110, 231, 183, 0.6)',
                                    borderRadius: '14px',
                                    padding: '13px 16px',
                                    color: '#ffffff',
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.45)'
                                }}
                            >
                                <Sparkles size={17} />
                                <span>
                                    {voiceLogoutStatus === 'processing'
                                        ? 'લોગઆઉટ થઈ રહ્યું છે...'
                                        : '🗣️ "હા AI, મારું લોગઆઉટ કરી દે" (કૉલ પરથી જ લોગઆઉટ)'}
                                </span>
                            </button>
                        )}

                        {/* Action Row */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {/* Call Site Engineer */}
                            <a
                                href={`tel:${engineerPhone}`}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'rgba(255, 255, 255, 0.12)',
                                    border: '1px solid rgba(255, 255, 255, 0.25)',
                                    borderRadius: '14px',
                                    padding: '12px 14px',
                                    color: '#ffffff',
                                    textDecoration: 'none',
                                    fontSize: '13px',
                                    fontWeight: 700
                                }}
                            >
                                <Phone size={15} style={{ color: '#4ade80' }} />
                                <span>ઇજનેરને કૉલ કરો</span>
                            </a>

                            {/* Context-Aware Action Button (Attendance/Logout vs Loss Analytics) */}
                            <button
                                type="button"
                                onClick={() => {
                                    handleEndCall();
                                    if (typeof onNavigateLossAnalytics === 'function') {
                                        onNavigateLossAnalytics(isAttendanceCall ? 'my-attendance' : 'curtailment-loss');
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: isAttendanceCall ? 'rgba(34, 197, 94, 0.22)' : 'rgba(239, 68, 68, 0.2)',
                                    border: isAttendanceCall ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid rgba(239, 68, 68, 0.4)',
                                    borderRadius: '14px',
                                    padding: '12px 14px',
                                    color: isAttendanceCall ? '#86efac' : '#fca5a5',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <Zap size={15} />
                                <span>{isAttendanceCall ? 'હાજરી / લોગઆઉટ ખોલો' : 'લોસ એનાલિટિક્સ'}</span>
                            </button>
                        </div>

                        {/* End Call Button */}
                        <button
                            type="button"
                            onClick={handleEndCall}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                background: '#ef4444',
                                border: 'none',
                                borderRadius: '16px',
                                padding: '16px',
                                color: '#ffffff',
                                fontSize: '16px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)'
                            }}
                        >
                            <PhoneOff size={22} />
                            <span>કૉલ કટ કરો (End Call)</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
