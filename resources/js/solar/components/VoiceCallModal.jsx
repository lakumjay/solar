import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    PhoneOff, 
    Mic, 
    MicOff, 
    Volume2, 
    Sparkles, 
    AlertCircle,
    Sun,
    Radio,
    Zap,
    Lock
} from 'lucide-react';
import { GoogleGenAI, Modality } from '@google/genai';
import { PcmPlayer, ToneGenerator, arrayBufferToBase64, base64ToInt16 } from '../lib/audio';
import { api } from '../api';

// Inline Web Audio Worklet code - In-memory Blob (eliminates all 404 / path routing errors)
const PCM_WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(2048);
        this.offset = 0;
    }
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (!channel) return true;
        for (let i = 0; i < channel.length; i++) {
            this.buffer[this.offset++] = channel[i];
            if (this.offset === this.buffer.length) {
                const pcm = new Int16Array(this.buffer.length);
                for (let j = 0; j < this.buffer.length; j++) {
                    const s = Math.max(-1, Math.min(1, this.buffer[j]));
                    pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                this.port.postMessage(pcm.buffer, [pcm.buffer]);
                this.offset = 0;
            }
        }
        return true;
    }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

// Helper to unlock Web Audio immediately on user click gesture
export function unlockVoiceCallAudio() {
    try {
        if (typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                ctx.resume().then(() => ctx.close()).catch(() => {});
            }
        }
    } catch (_) {}
}

export default function VoiceCallModal({ isOpen, onClose, user, activeCompany, liveSolarData }) {
    if (!isOpen) return null;

    const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'superadmin' || user?.name === 'Super Admin';
    const displayName = isSuperAdmin
        ? 'સુપર એડમિન'
        : (activeCompany?.owner_name || user?.company?.owner_name || activeCompany?.name || user?.name || 'યુઝર');

    const defaultGreeting = isSuperAdmin
        ? 'નમસ્તે સુપર એડમિન! હું SolarFlow બોલું છું, કહો આજે સોલાર પ્લાન્ટનું શું કામ છે?'
        : `નમસ્તે ${displayName}! હું SolarFlow બોલું છું, કહો આજે સોલાર પ્લાન્ટનું શું કામ છે?`;

    const [callState, setCallState] = useState('connecting'); // connecting, connected, ended
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [micPermissionError, setMicPermissionError] = useState(null);
    const [connectionError, setConnectionError] = useState(null);
    
    // Live User and AI speech transcriptions
    const [transcriptHistory, setTranscriptHistory] = useState([
        { sender: 'ai', text: defaultGreeting }
    ]);
    const [currentAiText, setCurrentAiText] = useState('');
    const [lastToolEvent, setLastToolEvent] = useState(null);

    // Refs
    const sessionRef = useRef(null);
    const playerRef = useRef(null);
    const toneGenRef = useRef(null);
    const micCtxRef = useRef(null);
    const micStreamRef = useRef(null);
    const workletNodeRef = useRef(null);
    const micSourceRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);
    const isMutedRef = useRef(false);
    const isAiSpeakingRef = useRef(false);
    const closingRef = useRef(false);
    const transcriptEndRef = useRef(null);
    const wakeLockRef = useRef(null);
    const heartbeatRef = useRef(null);
    const hasConnectedRef = useRef(false);
    const preloadedAudioRef = useRef(null);

    // Sync states to refs
    useEffect(() => {
        isMutedRef.current = isMuted;
    }, [isMuted]);

    useEffect(() => {
        isAiSpeakingRef.current = isAiSpeaking;
    }, [isAiSpeaking]);

    // Screen Wake Lock
    useEffect(() => {
        const acquireWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLockRef.current = await navigator.wakeLock.request('screen');
                } catch(e) {}
            }
        };
        acquireWakeLock();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                acquireWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
        };
    }, []);

    // Call Duration Timer
    useEffect(() => {
        let timer = null;
        if (callState === 'connected') {
            timer = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [callState]);

    // Auto-scroll Transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptHistory, currentAiText, lastToolEvent]);

    const handleTranscript = useCallback((sender, text) => {
        setTranscriptHistory(prev => {
            const last = prev[prev.length - 1];
            if (last && last.sender === sender) {
                return [...prev.slice(0, -1), { ...last, text: last.text + text }];
            }
            return [...prev, { sender, text }];
        });
    }, []);

    // End call cleanup
    const endCall = useCallback(async () => {
        closingRef.current = true;
        setCallState('ended');

        // Play phone disconnect tone & vibration
        try {
            if (toneGenRef.current) {
                toneGenRef.current.playDisconnectTone();
            }
        } catch(e) {}

        // Auto close and return to dashboard after brief disconnect feedback
        setTimeout(() => {
            if (onClose) onClose();
        }, 850);

        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }

        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }

        try {
            sessionRef.current?.close();
        } catch (e) {}
        sessionRef.current = null;

        if (workletNodeRef.current) {
            try {
                workletNodeRef.current.disconnect();
            } catch(e) {}
            workletNodeRef.current = null;
        }

        if (micSourceRef.current) {
            try {
                micSourceRef.current.disconnect();
            } catch(e) {}
            micSourceRef.current = null;
        }

        if (micStreamRef.current) {
            try {
                micStreamRef.current.getTracks().forEach(t => {
                    t.stop();
                    t.enabled = false;
                });
            } catch(e) {}
            micStreamRef.current = null;
        }

        if (micCtxRef.current && micCtxRef.current.state !== 'closed') {
            await micCtxRef.current.close().catch(() => {});
        }
        micCtxRef.current = null;

        if (playerRef.current) {
            playerRef.current.close();
            playerRef.current = null;
        }

        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }

        setIsAiSpeaking(false);
    }, [onClose]);

    // Handle Tool Execution (Solar Generation Units, Curtailment, Attendance, Revenue)
    const handleToolCall = async (call) => {
        console.log(`[ToolCall] Gemini invoked tool: ${call.name}`, call.args);
        
        let toolLabel = `⚡ Checking ${call.name.replace(/_/g, ' ')}...`;
        if (call.name === 'get_generation_units') toolLabel = '☀️ Fetching 1-second live solar generation units...';
        else if (call.name === 'get_inverter_live_power') toolLabel = '⚡ Checking Inverter live power & average kW...';
        else if (call.name === 'get_live_plant_status') toolLabel = '🏭 Checking plant, inverters & alerts...';
        else if (call.name === 'get_employee_attendance' || call.name === 'get_employee_leave_and_attendance') toolLabel = '👥 Checking employee clock-in & leave history...';
        else if (call.name === 'get_financials_revenue') toolLabel = '💰 Calculating solar revenue @ ₹3.80/unit...';
        else if (call.name === 'compare_months') toolLabel = '📊 Comparing monthly generation...';
        
        setLastToolEvent(toolLabel);

        try {
            const res = await api('voice-agent/execute-tool', {
                method: 'POST',
                body: JSON.stringify({
                    name: call.name,
                    args: call.args || {}
                })
            });

            const resultData = res?.data || res;
            console.log('[Tool Result]', resultData);
            setLastToolEvent(`✅ ${call.name.replace(/_/g, ' ')} loaded`);

            if (sessionRef.current) {
                sessionRef.current.sendToolResponse({
                    functionResponses: [{
                        id: call.id,
                        name: call.name,
                        response: {
                            output: {
                                status: "success",
                                data: resultData
                            }
                        }
                    }]
                });
            }
        } catch (err) {
            console.error('[Tool Execution Error]', err);
            setLastToolEvent(`⚠️ Note: ${err.message || 'Data query note'}`);
            if (sessionRef.current) {
                sessionRef.current.sendToolResponse({
                    functionResponses: [{
                        id: call.id,
                        name: call.name,
                        response: {
                            output: {
                                status: "error",
                                message: err.message || "Failed to fetch solar data."
                            }
                        }
                    }]
                });
            }
        }
    };

    // Message handler for Gemini Live events
    const handleLiveMessage = useCallback((msg) => {
        const sc = msg.serverContent;
        if (sc) {
            // User interrupted AI speech
            if (sc.interrupted) {
                console.log('[Gemini Live] Interruption detected. Cutting AI playback.');
                playerRef.current?.interrupt();
                setIsAiSpeaking(false);
                setCurrentAiText('');
            }

            // AI Audio chunks
            const parts = sc.modelTurn?.parts || [];
            for (const part of parts) {
                if (part.inlineData?.data) {
                    setIsAiSpeaking(true);
                    playerRef.current?.enqueue(base64ToInt16(part.inlineData.data));
                }
                if (part.text) {
                    setCurrentAiText(prev => prev + part.text);
                }
            }

            // User Speech Transcription (Gemini native input transcription)
            if (sc.inputTranscription?.text) {
                const userSpeech = sc.inputTranscription.text;
                handleTranscript('user', userSpeech);
            }

            // AI Output Speech Transcription
            if (sc.outputTranscription?.text) {
                handleTranscript('ai', sc.outputTranscription.text);
            }

            // Turn complete
            if (sc.turnComplete) {
                setCurrentAiText('');
            }
        }

        // Handle tool calls
        if (msg.toolCall?.functionCalls) {
            for (const call of msg.toolCall.functionCalls) {
                handleToolCall(call);
            }
        }
    }, [handleTranscript]);

    // Resilient Microphone Capture (Blob Worklet + ScriptProcessor Fallback)
    const startMic = async () => {
        setMicPermissionError(null);

        // 1. Browser check
        if (!navigator?.mediaDevices?.getUserMedia) {
            const msg = 'Microphone access is not supported on this browser or requires localhost / HTTPS.';
            setMicPermissionError(msg);
            throw new Error(msg);
        }

        // 2. Obtain stream with graceful constraint fallback
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
        } catch (strictErr) {
            console.warn('[Mic] Strict constraints failed, falling back to basic { audio: true }:', strictErr);
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (basicErr) {
                console.error('[Mic Permission Denied/Error]', basicErr);
                let msg = 'Microphone permission denied. Please click the lock 🔒 icon next to URL to allow microphone.';
                if (basicErr.name === 'NotAllowedError' || basicErr.name === 'PermissionDeniedError') {
                    msg = 'માઇક્રોફોનની પરવાનગી નથી મળી. કૃપા કરીને બ્રાઉઝરના URL પાસે 🔒 (Lock) આઈકોન પર ક્લિક કરી Microphone "Allow" કરો.';
                } else if (basicErr.name === 'NotFoundError' || basicErr.name === 'DevicesNotFoundError') {
                    msg = 'તમારા કમ્પ્યુટર અથવા ફોનમાં કોઈ માઇક્રોફોન મળ્યો નથી.';
                } else if (basicErr.name === 'NotReadableError') {
                    msg = 'માઇક્રોફોન હાલમાં બીજી એપ્લિકેશન દ્વારા વપરાશમાં છે.';
                }
                setMicPermissionError(msg);
                throw basicErr;
            }
        }

        micStreamRef.current = stream;

        // 3. 16kHz Dedicated AudioContext
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const micCtx = new AudioCtx({ sampleRate: 16000 });
        micCtxRef.current = micCtx;

        if (micCtx.state === 'suspended') {
            await micCtx.resume().catch(() => {});
        }

        const source = micCtx.createMediaStreamSource(stream);
        micSourceRef.current = source;

        // 4. Analyser for visualizer
        const analyser = micCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round(avg * 2)));
            animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();

        // 5. Load AudioWorklet via in-memory Blob URL (zero network latency, zero 404s!)
        let workletLoaded = false;
        if (micCtx.audioWorklet) {
            try {
                const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                await micCtx.audioWorklet.addModule(blobUrl);
                URL.revokeObjectURL(blobUrl);
                workletLoaded = true;
            } catch (blobErr) {
                console.warn('[Blob Worklet failed, trying path candidates]:', blobErr);
                const candidates = ['/git/public/pcm-capture-worklet.js', '/pcm-capture-worklet.js', 'pcm-capture-worklet.js'];
                for (const p of candidates) {
                    try {
                        await micCtx.audioWorklet.addModule(p);
                        workletLoaded = true;
                        break;
                    } catch (_) {}
                }
            }
        }

        // 6. Connect processor node (Worklet Node or ScriptProcessor Node fallback)
        if (workletLoaded) {
            const workletNode = new AudioWorkletNode(micCtx, 'pcm-capture-processor');
            workletNodeRef.current = workletNode;

            workletNode.port.onmessage = (event) => {
                if (!sessionRef.current || isMutedRef.current || isAiSpeakingRef.current) return;
                const base64Audio = arrayBufferToBase64(event.data);
                sessionRef.current.sendRealtimeInput({
                    audio: {
                        data: base64Audio,
                        mimeType: 'audio/pcm;rate=16000'
                    }
                });
            };

            source.connect(workletNode);
        } else {
            console.log('[Mic] Initializing ScriptProcessorNode universal fallback');
            const scriptNode = micCtx.createScriptProcessor(2048, 1, 1);
            workletNodeRef.current = scriptNode;

            scriptNode.onaudioprocess = (e) => {
                if (!sessionRef.current || isMutedRef.current || isAiSpeakingRef.current) return;
                const channelData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(channelData.length);
                for (let i = 0; i < channelData.length; i++) {
                    const s = Math.max(-1, Math.min(1, channelData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                const base64Audio = arrayBufferToBase64(pcm16.buffer);
                sessionRef.current.sendRealtimeInput({
                    audio: {
                        data: base64Audio,
                        mimeType: 'audio/pcm;rate=16000'
                    }
                });
            };

            source.connect(scriptNode);
            scriptNode.connect(micCtx.destination);
        }
    };

    const startLiveSession = async () => {
        closingRef.current = false;
        hasConnectedRef.current = false;
        setConnectionError(null);
        setMicPermissionError(null);
        setCallState('connecting');

        // Start Realistic Telephone Ringing Sound
        try {
            if (!toneGenRef.current) {
                toneGenRef.current = new ToneGenerator();
            }
            toneGenRef.current.startRingTone();
        } catch(e) {}

        // 🚀 Preload Welcome Spoken Audio while phone is ringing so it plays instantly (0ms delay) on pickup
        try {
            const cleanGreeting = defaultGreeting.replace(/[*#_`]/g, '');
            const preloadAudio = new Audio(`/api/voice-agent/tts?text=${encodeURIComponent(cleanGreeting)}&language=gu`);
            preloadAudio.preload = 'auto';
            preloadAudio.load();
            preloadedAudioRef.current = preloadAudio;
        } catch(e) {}

        try {
            // 1. Output Audio Player (24kHz HD PCM)
            const player = new PcmPlayer(24000);
            await player.resume();
            player.onEndedCallback = () => {
                setIsAiSpeaking(false);
            };
            playerRef.current = player;

            // 2. Request and start Microphone
            await startMic();

            // 3. Fetch Token & Config from backend
            const currentLiveData = liveSolarData || (() => {
                try { return JSON.parse(localStorage.getItem('solarflow.cachedLiveSolar') || '{}'); } catch(e) { return {}; }
            })();

            const cfg = await api('voice-agent/config', {
                method: 'POST',
                body: JSON.stringify({
                    live_solar_data: currentLiveData,
                    company_id: activeCompany?.id
                })
            });
            const authToken = cfg?.auth_token || cfg?.apiKey;
            const systemInstruction = cfg?.system_instruction || cfg?.systemInstruction;
            const voiceName = cfg?.voice_name || 'Aoede';
            const liveModel = cfg?.live_model || cfg?.liveModel || 'gemini-3.1-flash-live-preview';
            const tools = cfg?.tools || [];

            if (!authToken || authToken === 'solarflow_ready') {
                throw new Error('Gemini API key is not configured in .env file.');
            }

            let targetModel = (liveModel || 'gemini-3.1-flash-live-preview').replace(/^models\//, '');
            if (!targetModel || targetModel.includes('gemini-3.8-live') || targetModel.includes('gemini-2.0-flash-exp')) {
                targetModel = 'gemini-3.1-flash-live-preview';
            }

            // 4. Connect to Gemini Live via official SDK
            const ai = new GoogleGenAI({
                apiKey: authToken,
                httpOptions: { apiVersion: 'v1alpha' }
            });

            const session = await ai.live.connect({
                model: targetModel,
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: systemInstruction,
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceName || 'Aoede'
                            }
                        }
                    },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    tools: tools.length > 0 ? tools : undefined
                },
                callbacks: {
                    onopen: () => {
                        console.log('[Gemini Live] Connected successfully.');
                        try {
                            if (toneGenRef.current) toneGenRef.current.stopRingTone();
                        } catch(e) {}
                        setCallState('connected');
                        
                        // 🎙️ Play preloaded spoken greeting instantly (0ms delay!)
                        try {
                            if (preloadedAudioRef.current) {
                                preloadedAudioRef.current.play().catch(e => console.log('Preloaded audio play note:', e));
                            }
                        } catch(e) {}
                    },
                    onmessage: (msg) => handleLiveMessage(msg),
                    onerror: (e) => {
                        console.error('[Gemini Live Error]', e);
                        setConnectionError(e?.message || 'Connection issue detected.');
                    },
                    onclose: (e) => {
                        console.log('[Gemini Live onclose]', e);
                        if (!closingRef.current) {
                            try {
                                if (toneGenRef.current) toneGenRef.current.stopRingTone();
                            } catch(err) {}
                            setConnectionError('Call ended. Tap Reconnect to call again.');
                            setCallState('ended');
                        }
                    }
                }
            });

            sessionRef.current = session;
            hasConnectedRef.current = true;

            // Stop Ring tone
            try {
                if (toneGenRef.current) {
                    toneGenRef.current.stopRingTone();
                }
            } catch(e) {}

            setCallState('connected');
            setTranscriptHistory([{ sender: 'ai', text: defaultGreeting }]);

            // Fallback play if not played in onopen
            try {
                if (preloadedAudioRef.current && preloadedAudioRef.current.paused) {
                    preloadedAudioRef.current.play().catch(() => {});
                }
            } catch(e) {}
        } catch (err) {
            console.error('Failed to start Live Session:', err);
            try {
                if (toneGenRef.current) {
                    toneGenRef.current.stopRingTone();
                }
            } catch(e) {}
            if (!micPermissionError) {
                setConnectionError(err.message || 'Failed to start voice session.');
            }
            setCallState('ended');
        }
    };

    useEffect(() => {
        if (isOpen) {
            startLiveSession();
        }
        return () => {
            endCall();
        };
    }, [isOpen]);

    const formatTime = (sec) => {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const retryCall = () => {
        endCall();
        setTimeout(() => {
            startLiveSession();
        }, 400);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/95 backdrop-blur-2xl animate-fadeIn">
            {/* iPhone Frame Container */}
            <div className="relative w-full h-full sm:h-[844px] sm:max-w-[390px] bg-gradient-to-b from-slate-900 via-neutral-950 to-black sm:rounded-[54px] sm:border-[8px] sm:border-neutral-800 shadow-2xl flex flex-col justify-between overflow-hidden text-white font-sans select-none sm:ring-1 sm:ring-neutral-700">
                
                {/* Dynamic Island / Top Notch Bar */}
                <div className="w-full pt-3 pb-2 flex flex-col items-center z-20">
                    <div className="w-36 h-6 bg-black rounded-full flex items-center justify-between px-3 border border-neutral-800/80 shadow-md">
                        <div className={`w-2 h-2 rounded-full ${callState === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                        <span className="text-[10px] text-neutral-400 font-medium tracking-tight">Gemini Live VAD</span>
                        <div className="w-2.5 h-2.5 rounded-full border border-neutral-600 flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-neutral-400"></div>
                        </div>
                    </div>
                </div>

                {/* Error Banner on Display (if any) */}
                {(micPermissionError || connectionError) && (
                    <div className="mx-5 p-3.5 bg-red-950/90 border border-red-500/60 rounded-2xl text-xs text-red-200 flex flex-col space-y-2 z-20 shadow-lg shadow-red-950/50">
                        <div className="flex items-start space-x-2">
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <span className="text-[11px] leading-relaxed flex-1">{micPermissionError || connectionError}</span>
                        </div>
                        <div className="flex justify-end pt-1">
                            <button 
                                onClick={retryCall} 
                                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow flex items-center space-x-1"
                            >
                                <Mic className="w-3.5 h-3.5" />
                                <span>{micPermissionError ? 'Allow Mic & Retry' : 'Reconnect'}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Contact Profile Header */}
                <div className="flex flex-col items-center text-center mt-2 px-4 z-10">
                    {/* Animated Avatar with Pulsing Waves */}
                    <div className="relative flex items-center justify-center my-3">
                        <div 
                            className={`absolute rounded-full transition-all duration-150 ${
                                isAiSpeaking 
                                    ? 'w-40 h-40 bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-500 opacity-40 blur-xl animate-pulse'
                                    : callState === 'connected' && !isMuted
                                    ? 'w-36 h-36 bg-amber-500 opacity-25 blur-lg'
                                    : 'w-32 h-32 bg-neutral-700 opacity-10'
                            }`}
                            style={{
                                transform: isAiSpeaking ? 'scale(1.2)' : `scale(${1 + (audioLevel / 100) * 0.6})`
                            }}
                        />

                        {/* SolarFlow Brand Sun Logo Circle */}
                        <div className={`relative w-28 h-28 rounded-full p-1 bg-gradient-to-b from-amber-500/30 to-neutral-900 border-2 ${isAiSpeaking ? 'border-amber-400 shadow-lg shadow-amber-500/40' : 'border-amber-500/40'} shadow-2xl flex items-center justify-center`}>
                            <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-950 via-neutral-900 to-yellow-950 flex items-center justify-center overflow-hidden border border-amber-500/20 shadow-inner">
                                <Sun className={`w-14 h-14 text-amber-400 filter drop-shadow transition-transform duration-700 ${isAiSpeaking ? 'animate-spin-slow scale-110' : ''}`} />
                            </div>
                        </div>
                    </div>

                    {/* Caller Name */}
                    <h2 className="text-2xl font-semibold tracking-tight text-white mt-1">
                        SolarFlow AI
                    </h2>
                    <p className="text-xs text-neutral-400 mt-0.5">
                        Solar Assistant • <span className="text-amber-400 font-medium">{displayName}</span>
                    </p>

                    {/* Call Status / Timer */}
                    <p className="text-sm font-medium mt-1">
                        {callState === 'connecting' ? (
                            <span className="text-amber-400 animate-pulse font-medium">Connecting SolarFlow AI...</span>
                        ) : callState === 'connected' ? (
                            <span className="text-neutral-300 font-mono tracking-wider">{formatTime(callDuration)}</span>
                        ) : (
                            <span className="text-red-400">Call Ended</span>
                        )}
                    </p>

                    {/* Live Speaking Status Pill & Mic Level Meter */}
                    <div className="mt-2 flex flex-col items-center space-y-1">
                        <div>
                            {isAiSpeaking ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    <Volume2 className="w-3 h-3 mr-1.5 animate-bounce" />
                                    SolarFlow Speaking (Aoede)...
                                </span>
                            ) : !isMuted && callState === 'connected' ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                    <Mic className="w-3 h-3 mr-1.5 animate-pulse" />
                                    Listening (Live VAD)...
                                </span>
                            ) : isMuted ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-neutral-800 text-neutral-400">
                                    <MicOff className="w-3 h-3 mr-1.5" />
                                    Muted
                                </span>
                            ) : null}
                        </div>

                        {/* On-Screen Mic Level Bar */}
                        {!isMuted && callState === 'connected' && (
                            <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden flex items-center px-0.5">
                                <div 
                                    className="h-1 bg-emerald-400 rounded-full transition-all duration-75"
                                    style={{ width: `${Math.max(5, audioLevel)}%` }}
                                ></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tool Event Notification Bar */}
                {lastToolEvent && (
                    <div className="mx-6 px-3 py-2 bg-indigo-950/70 border border-indigo-500/40 rounded-xl text-[11px] text-indigo-200 flex items-center space-x-2 animate-bounce">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
                        <span className="truncate">{lastToolEvent}</span>
                    </div>
                )}

                {/* Live Transcript Window */}
                <div className="mx-6 my-2 p-3.5 bg-neutral-900/80 border border-neutral-800 rounded-2xl flex-1 overflow-y-auto space-y-2 text-xs font-sans shadow-inner max-h-[175px]">
                    {transcriptHistory.map((item, idx) => (
                        <div 
                            key={idx} 
                            className={`flex space-x-1.5 leading-relaxed ${
                                item.sender === 'user' ? 'text-emerald-400' : 'text-neutral-300'
                            }`}
                        >
                            <span className="font-semibold text-[11px] uppercase tracking-wider opacity-75 shrink-0">
                                {item.sender === 'user' ? `${displayName}:` : 'SolarFlow:'}
                            </span>
                            <span>{item.text}</span>
                        </div>
                    ))}
                    {currentAiText && (
                        <div className="text-pink-300 flex items-center space-x-1 animate-pulse">
                            <span>{currentAiText}</span>
                        </div>
                    )}
                    <div ref={transcriptEndRef} />
                </div>

                {/* In-Call Controls Grid */}
                <div className="px-8 pb-8 pt-1 z-10 flex flex-col items-center">
                    <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-5 w-full max-w-[280px]">
                        
                        {/* 1. Mute Button */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={toggleMute}
                                className={`w-16 h-16 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer ${
                                    isMuted 
                                        ? 'bg-white text-black shadow-lg shadow-white/20' 
                                        : 'bg-neutral-800/90 text-white hover:bg-neutral-700/90'
                                    }`}
                            >
                                {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                            </button>
                            <span className="text-[11px] font-medium text-neutral-300 mt-1.5">
                                {isMuted ? 'Unmute' : 'Mute'}
                            </span>
                        </div>

                        {/* 2. Speaker Indicator */}
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-neutral-800/90 text-white flex items-center justify-center">
                                <Volume2 className="w-7 h-7 text-emerald-400" />
                            </div>
                            <span className="text-[11px] font-medium text-neutral-300 mt-1.5">HD Audio</span>
                        </div>

                        {/* 3. Status Indicator */}
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-neutral-800/90 text-white flex items-center justify-center">
                                <Zap className="w-7 h-7 text-amber-300" />
                            </div>
                            <span className="text-[11px] font-medium text-neutral-300 mt-1.5">Live VAD</span>
                        </div>

                    </div>

                    {/* Big Red End Call Button */}
                    <div className="flex justify-center mt-1">
                        {callState !== 'ended' ? (
                            <button
                                onClick={endCall}
                                className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 active:scale-90 text-white flex items-center justify-center shadow-2xl shadow-red-600/50 transition cursor-pointer"
                                title="End Call"
                            >
                                <PhoneOff className="w-9 h-9" />
                            </button>
                        ) : (
                            <button
                                onClick={onClose}
                                className="px-8 py-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-semibold transition active:scale-95 cursor-pointer border border-neutral-700"
                            >
                                Close Call
                            </button>
                        )}
                    </div>
                </div>

                {/* iPhone Bottom Home Bar Indicator */}
                <div className="w-full flex justify-center pb-2 z-20">
                    <div className="w-32 h-1 bg-neutral-600/60 rounded-full"></div>
                </div>

            </div>
        </div>
    );
}
