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
import { api, getApiBaseUrl } from '../api';

// Persistent audio stream cache across calls so user is asked permission only ONCE
let globalMicStream = null;

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
    const [selectedVoice, setSelectedVoice] = useState(() => {
        try {
            return localStorage.getItem('solarflow.aiVoiceName') || 'Aoede';
        } catch (_) {
            return 'Aoede';
        }
    });
    
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
    const closeTimerRef = useRef(null);
    const fallbackRecogRef = useRef(null);
    const fallbackAudioRef = useRef(null);
    const isToolPendingRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const reconnectingRef = useRef(false);
    const liveCfgRef = useRef(null);

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

    // Internal session cleanup (does NOT close the modal, safe for Reconnect)
    const cleanupSession = useCallback(async (stopGlobalMic = false) => {
        closingRef.current = true;

        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }

        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }

        try {
            if (toneGenRef.current) {
                toneGenRef.current.stopRingTone();
            }
        } catch (e) {}

        if (fallbackRecogRef.current) {
            try {
                fallbackRecogRef.current.onend = null;
                fallbackRecogRef.current.stop();
            } catch (e) {}
            fallbackRecogRef.current = null;
        }

        if (fallbackAudioRef.current) {
            try {
                fallbackAudioRef.current.pause();
                fallbackAudioRef.current.src = '';
            } catch (e) {}
            fallbackAudioRef.current = null;
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

        if (stopGlobalMic) {
            if (micStreamRef.current) {
                try {
                    micStreamRef.current.getTracks().forEach(t => {
                        t.stop();
                        t.enabled = false;
                    });
                } catch(e) {}
                micStreamRef.current = null;
            }

            if (globalMicStream) {
                try {
                    globalMicStream.getTracks().forEach(t => {
                        t.stop();
                        t.enabled = false;
                    });
                } catch(e) {}
                globalMicStream = null;
            }
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
    }, []);

    // End call cleanup (closes the modal when user hangs up)
    const endCall = useCallback(async () => {
        closingRef.current = true;
        setCallState('ended');

        // Play phone disconnect tone & vibration
        try {
            if (toneGenRef.current) {
                toneGenRef.current.playDisconnectTone();
            }
        } catch(e) {}

        await cleanupSession(true);

        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }

        // Auto close and return to dashboard after brief disconnect feedback
        closeTimerRef.current = setTimeout(() => {
            if (onClose) onClose();
        }, 650);
    }, [cleanupSession, onClose]);

    // Handle Tool Execution (Solar Generation Units, Curtailment, Attendance, Revenue)
    const handleToolCall = async (call) => {
        console.log(`[ToolCall] Gemini invoked tool: ${call.name}`, call.args);
        isToolPendingRef.current = true;
        
        let toolLabel = `⚡ Checking ${call.name.replace(/_/g, ' ')}...`;
        if (call.name === 'get_generation_units') toolLabel = '☀️ Fetching 1-second live solar generation units...';
        else if (call.name === 'get_inverter_live_power') toolLabel = '⚡ Checking Inverter live power & average kW...';
        else if (call.name === 'get_live_plant_status') toolLabel = '🏭 Checking plant, inverters & alerts...';
        else if (call.name === 'get_employee_attendance' || call.name === 'get_employee_leave_and_attendance') toolLabel = '👥 Checking employee clock-in & leave history...';
        else if (call.name === 'get_financials_revenue') toolLabel = '💰 Calculating solar revenue @ ₹3.80/unit...';
        else if (call.name === 'compare_months') toolLabel = '📊 Comparing monthly generation...';
        
        setLastToolEvent(toolLabel);

        try {
            const currentLiveData = liveSolarData || (() => {
                try { return JSON.parse(localStorage.getItem('solarflow.cachedLiveSolar') || '{}'); } catch(e) { return {}; }
            })();

            const res = await api('voice-agent/execute-tool', {
                method: 'POST',
                body: JSON.stringify({
                    name: call.name,
                    args: {
                        ...(call.args || {}),
                        live_solar_data: currentLiveData,
                    }
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
                try {
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
                } catch (_) {}
            }
        } finally {
            isToolPendingRef.current = false;
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

            // AI Audio chunks (ignore internal modelTurn.parts[].text which contains English chain-of-thought)
            const parts = sc.modelTurn?.parts || [];
            for (const part of parts) {
                if (part.inlineData?.data) {
                    setIsAiSpeaking(true);
                    playerRef.current?.enqueue(base64ToInt16(part.inlineData.data));
                }
            }

            // User Speech Transcription (Gemini native input transcription)
            if (sc.inputTranscription?.text) {
                const userSpeech = sc.inputTranscription.text;
                handleTranscript('user', userSpeech);
            }

            // AI Output Speech Transcription (actual spoken Gujarati response)
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

    // Dedicated Microphone Capture (Worklet Node with ScriptProcessor fallback)
    const startMic = async () => {
        setMicPermissionError(null);

        // 1. Browser mediaDevices check
        if (!navigator?.mediaDevices?.getUserMedia) {
            const msg = 'Microphone access is not supported on this browser or requires localhost / HTTPS.';
            setMicPermissionError(msg);
            throw new Error(msg);
        }

        // 2. Reuse global stream or prompt once
        let stream = globalMicStream;
        if (!stream || !stream.active) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
                globalMicStream = stream;
            } catch (strictErr) {
                console.warn('[Mic] Strict constraints failed, falling back to basic { audio: true }:', strictErr);
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    globalMicStream = stream;
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
        }

        micStreamRef.current = stream;

        // If mic context is already active from an earlier connect in this call, keep it
        if (micCtxRef.current && micCtxRef.current.state !== 'closed' && workletNodeRef.current) {
            if (micCtxRef.current.state === 'suspended') {
                await micCtxRef.current.resume().catch(() => {});
            }
            return;
        }

        // 3. Dedicated 16kHz AudioContext for mic capture
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

        // 5. Load AudioWorklet module (try relative and root paths)
        let workletLoaded = false;
        if (micCtx.audioWorklet) {
            try {
                await micCtx.audioWorklet.addModule('pcm-capture-worklet.js');
                workletLoaded = true;
            } catch (wErr) {
                try {
                    await micCtx.audioWorklet.addModule('/pcm-capture-worklet.js');
                    workletLoaded = true;
                } catch (wErr2) {
                    console.warn('Could not load worklet module, using ScriptProcessorNode:', wErr2);
                }
            }
        }

        // 6. Connect processor node (Worklet Node or ScriptProcessor Node fallback)
        if (workletLoaded) {
            try {
                const workletNode = new AudioWorkletNode(micCtx, 'pcm-capture-processor');
                workletNodeRef.current = workletNode;

                workletNode.port.onmessage = (event) => {
                    if (!sessionRef.current || isMutedRef.current) return;
                    if (isAiSpeakingRef.current || isToolPendingRef.current || reconnectingRef.current) return;

                    const base64Audio = arrayBufferToBase64(event.data);
                    try {
                        sessionRef.current.sendRealtimeInput({
                            audio: {
                                data: base64Audio,
                                mimeType: 'audio/pcm;rate=16000'
                            }
                        });
                    } catch (_) {}
                };

                source.connect(workletNode);
                return;
            } catch (nodeErr) {
                console.warn('AudioWorkletNode instantiation error, falling back to ScriptProcessorNode:', nodeErr);
            }
        }

        // Fallback: ScriptProcessorNode
        const scriptNode = micCtx.createScriptProcessor(2048, 1, 1);
        workletNodeRef.current = scriptNode;

        scriptNode.onaudioprocess = (e) => {
            if (!sessionRef.current || isMutedRef.current) return;
            if (isAiSpeakingRef.current || isToolPendingRef.current || reconnectingRef.current) return;

            const channelData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
                const s = Math.max(-1, Math.min(1, channelData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            const base64Audio = arrayBufferToBase64(pcm16.buffer);
            try {
                sessionRef.current.sendRealtimeInput({
                    audio: {
                        data: base64Audio,
                        mimeType: 'audio/pcm;rate=16000'
                    }
                });
            } catch (_) {}
        };

        source.connect(scriptNode);
        scriptNode.connect(micCtx.destination);
    };

    // Speak text via backend Gemini Aoede / selected voice WAV (used in Fallback Voice Mode)
    const speakFallbackTts = useCallback(async (text, lang = 'gu') => {
        if (!text || closingRef.current) return;
        setIsAiSpeaking(true);
        try {
            const voiceParam = encodeURIComponent(selectedVoice || 'Aoede');
            const ttsUrl = `${getApiBaseUrl().base}voice-agent/tts?text=${encodeURIComponent(text)}&language=${encodeURIComponent(lang)}&voice=${voiceParam}`;
            await new Promise((resolve) => {
                const audio = new Audio(ttsUrl);
                fallbackAudioRef.current = audio;
                audio.onended = () => {
                    setIsAiSpeaking(false);
                    resolve();
                };
                audio.onerror = () => {
                    setIsAiSpeaking(false);
                    resolve();
                };
                audio.play().catch(() => {
                    setIsAiSpeaking(false);
                    resolve();
                });
            });
        } catch (_) {
            setIsAiSpeaking(false);
        }
    }, [selectedVoice]);

    // Unbreakable Fallback Voice Call Mode (Web Speech API + /api/voice-agent/chat + /api/voice-agent/tts)
    const startFallbackVoiceSession = useCallback(async (skipGreeting = false) => {
        try {
            if (toneGenRef.current) toneGenRef.current.stopRingTone();
        } catch (_) {}

        setConnectionError(null);
        setCallState('connected');
        hasConnectedRef.current = true;
        if (!skipGreeting) {
            setTranscriptHistory([{ sender: 'ai', text: defaultGreeting }]);
            await speakFallbackTts(defaultGreeting, 'gu');
        }

        const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SpeechRecognition || closingRef.current) return;

        const startListeningLoop = () => {
            if (closingRef.current) return;
            try {
                const recog = new SpeechRecognition();
                fallbackRecogRef.current = recog;
                recog.lang = 'gu-IN';
                recog.interimResults = false;
                recog.maxAlternatives = 1;

                recog.onresult = async (event) => {
                    if (closingRef.current || isMutedRef.current || isAiSpeakingRef.current) return;
                    const spoken = event.results?.[0]?.[0]?.transcript?.trim();
                    if (!spoken) return;
                    handleTranscript('user', spoken);
                    try {
                        const res = await api('voice-agent/chat', {
                            method: 'POST',
                            body: JSON.stringify({
                                message: spoken,
                                language: 'gu'
                            })
                        });
                        const reply = res?.reply || 'હું સાંભળી રહી છું, આગળ બોલો.';
                        handleTranscript('ai', reply);
                        await speakFallbackTts(reply, res?.language || 'gu');
                    } catch (err) {
                        console.warn('[Fallback Chat Error]', err);
                    }
                };

                recog.onend = () => {
                    if (!closingRef.current) {
                        setTimeout(startListeningLoop, 300);
                    }
                };

                recog.onerror = () => {
                    if (!closingRef.current) {
                        setTimeout(startListeningLoop, 800);
                    }
                };

                recog.start();
            } catch (_) {}
        };

        startListeningLoop();
    }, [defaultGreeting, handleTranscript, speakFallbackTts]);

    const connectLiveWebSocket = async (isSilentReconnect = false) => {
        if (closingRef.current || !liveCfgRef.current) return;
        const { authToken, targetModel, systemInstruction, voiceName, formattedTools } = liveCfgRef.current;

        const ai = new GoogleGenAI({
            apiKey: authToken,
            httpOptions: { apiVersion: 'v1alpha' }
        });

        const session = await ai.live.connect({
            model: targetModel,
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: systemInstruction,
                thinkingConfig: { thinkingBudget: 0 },
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voiceName || selectedVoice || 'Aoede'
                        }
                    }
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                tools: formattedTools.length > 0 ? formattedTools : undefined
            },
            callbacks: {
                onopen: () => {
                    console.log('[Gemini Live] Connected successfully.');
                    reconnectAttemptsRef.current = 0;
                    reconnectingRef.current = false;
                    try {
                        if (toneGenRef.current) toneGenRef.current.stopRingTone();
                    } catch(e) {}
                    setConnectionError(null);
                    setCallState('connected');
                },
                onmessage: (msg) => handleLiveMessage(msg),
                onerror: (e) => {
                    console.warn('[Gemini Live Socket Notice]', e);
                },
                onclose: (e) => {
                    console.log('[Gemini Live onclose]', e);
                    if (closingRef.current) return;

                    // Automatically and silently reconnect if the socket closed mid-call
                    if (reconnectAttemptsRef.current < 3) {
                        reconnectAttemptsRef.current += 1;
                        reconnectingRef.current = true;
                        sessionRef.current = null;
                        setTimeout(async () => {
                            if (closingRef.current) return;
                            try {
                                await connectLiveWebSocket(true);
                            } catch (reErr) {
                                console.warn('[Gemini Live Silent Reconnect Failed]', reErr);
                                if (!closingRef.current) {
                                    await startFallbackVoiceSession(true);
                                }
                            }
                        }, 450);
                        return;
                    }

                    // If 3 reconnect attempts failed, seamlessly continue in Fallback Voice Mode
                    startFallbackVoiceSession(hasConnectedRef.current);
                }
            }
        });

        sessionRef.current = session;
        reconnectingRef.current = false;

        if (!isSilentReconnect) {
            hasConnectedRef.current = true;
            await startMic();
            try {
                if (toneGenRef.current) {
                    toneGenRef.current.stopRingTone();
                }
            } catch(e) {}

            setCallState('connected');
            setTranscriptHistory([{ sender: 'ai', text: defaultGreeting }]);

            // Trigger initial greeting so SolarFlow AI speaks immediately when call connects
            try {
                session.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: 'નમસ્તે' }] }],
                    turnComplete: true
                });
            } catch (_) {}
        }
    };

    const startLiveSession = async (overrideVoice = null) => {
        closingRef.current = false;
        hasConnectedRef.current = false;
        isToolPendingRef.current = false;
        reconnectAttemptsRef.current = 0;
        reconnectingRef.current = false;
        setConnectionError(null);
        setMicPermissionError(null);
        setCallState('connecting');

        const activeVoice = overrideVoice || selectedVoice || 'Aoede';

        // Start Realistic Telephone Ringing Sound
        try {
            if (!toneGenRef.current) {
                toneGenRef.current = new ToneGenerator();
            }
            toneGenRef.current.startRingTone();
        } catch(e) {}

        try {
            // 1. Output Audio Player (24kHz HD PCM)
            const player = new PcmPlayer(24000);
            await player.resume();
            player.onEndedCallback = () => {
                setIsAiSpeaking(false);
            };
            playerRef.current = player;

            // 2. Fetch Token & Config from backend
            const currentLiveData = liveSolarData || (() => {
                try { return JSON.parse(localStorage.getItem('solarflow.cachedLiveSolar') || '{}'); } catch(e) { return {}; }
            })();

            const cfg = await api('voice-agent/config', {
                method: 'POST',
                body: JSON.stringify({
                    live_solar_data: currentLiveData,
                    company_id: activeCompany?.id,
                    voice_name: activeVoice
                })
            });
            const authToken = cfg?.auth_token || cfg?.apiKey;
            const systemInstruction = cfg?.system_instruction || cfg?.systemInstruction;
            const voiceName = cfg?.voice_name || activeVoice || 'Aoede';
            const liveModel = cfg?.live_model || cfg?.liveModel || 'gemini-2.5-flash-native-audio-latest';
            const rawTools = cfg?.tools || [];

            // Ensure proper camelCase functionDeclarations for @google/genai SDK
            const formattedTools = rawTools.map(t => ({
                functionDeclarations: t.functionDeclarations || t.function_declarations || []
            }));

            // If Gemini API key is not configured on server, seamlessly switch to Server Chat + Neural TTS Voice Mode
            if (!authToken || authToken === 'solarflow_ready') {
                await startFallbackVoiceSession(false);
                return;
            }

            // Use gemini-2.5-flash-native-audio-latest which supports bidiGenerateContent + tools + live audio transcription
            let targetModel = (liveModel || 'gemini-2.5-flash-native-audio-latest').replace(/^models\//, '');
            if (
                !targetModel ||
                targetModel.includes('2.0-flash-exp') ||
                targetModel.includes('gemini-3.1-flash-live-preview') ||
                targetModel.includes('gemini-3.8-live')
            ) {
                targetModel = 'gemini-2.5-flash-native-audio-latest';
            }

            liveCfgRef.current = {
                authToken,
                targetModel,
                systemInstruction,
                voiceName,
                formattedTools
            };

            // 3. Connect to Gemini Live via official SDK (with auto-reconnect protection)
            await connectLiveWebSocket(false);
        } catch (err) {
            console.error('Failed to start Live Session:', err);
            try {
                if (toneGenRef.current) {
                    toneGenRef.current.stopRingTone();
                }
            } catch(e) {}
            if (!micPermissionError) {
                await startFallbackVoiceSession(false);
                return;
            }
            setCallState('ended');
        }
    };

    useEffect(() => {
        if (isOpen) {
            startLiveSession();
        }
        return () => {
            cleanupSession(true);
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

    const cycleVoice = async () => {
        const voices = ['Aoede', 'Kore', 'Leda', 'Puck'];
        const nextIdx = (voices.indexOf(selectedVoice) + 1) % voices.length;
        const nextVoice = voices[nextIdx];
        setSelectedVoice(nextVoice);
        try {
            localStorage.setItem('solarflow.aiVoiceName', nextVoice);
        } catch (_) {}
        await cleanupSession(false);
        startLiveSession(nextVoice);
    };

    const retryCall = async () => {
        await cleanupSession(false);
        setCallDuration(0);
        setConnectionError(null);
        setMicPermissionError(null);
        startLiveSession();
    };

    const livePowerKw = Number(liveSolarData?.totals?.curr_power_kw ?? 0);
    const liveTodayKwh = Number(liveSolarData?.totals?.today_energy_kwh ?? 0);
    const liveTodayRev = Math.round(liveTodayKwh * 3.8);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/95 backdrop-blur-2xl animate-fadeIn">
            {/* Premium Call Frame Container */}
            <div className="relative w-full h-full sm:h-[852px] sm:max-w-[400px] bg-gradient-to-b from-slate-950 via-[#090d16] to-black sm:rounded-[52px] sm:border-[7px] sm:border-slate-800/90 shadow-[0_0_80px_rgba(245,158,11,0.15)] flex flex-col justify-between overflow-hidden text-white font-sans select-none sm:ring-1 sm:ring-amber-500/20">
                
                {/* Ambient Background Glow */}
                <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl" />
                <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-emerald-500/5 blur-3xl" />

                {/* Dynamic Island / Top Status Pill */}
                <div className="w-full pt-3 pb-1.5 flex flex-col items-center z-20">
                    <div className="px-4 h-7 bg-black/90 rounded-full flex items-center space-x-2.5 border border-slate-800 shadow-lg">
                        <div className={`w-2 h-2 rounded-full ${callState === 'connected' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                        <span className="text-[10px] text-amber-300 font-bold tracking-wider uppercase">
                            ⚡ Zero-Wait 12M Memory
                        </span>
                        <span className="text-[10px] text-slate-500">•</span>
                        <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                            {callState === 'connected' ? formatTime(callDuration) : 'LIVE'}
                        </span>
                    </div>
                </div>

                {/* Error Banner on Display (if any) */}
                {(micPermissionError || connectionError) && (
                    <div className="mx-5 p-3 bg-red-950/90 border border-red-500/60 rounded-2xl text-xs text-red-200 flex flex-col space-y-2 z-20 shadow-lg shadow-red-950/50">
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

                {/* Contact Profile & Visualizer Header */}
                <div className="flex flex-col items-center text-center mt-1 px-4 z-10">
                    {/* Animated Avatar with Dual Aura Ring */}
                    <div className="relative flex items-center justify-center my-2">
                        <div 
                            className={`absolute rounded-full transition-all duration-150 ${
                                isAiSpeaking 
                                    ? 'w-36 h-36 bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 opacity-45 blur-xl animate-pulse'
                                    : callState === 'connected' && !isMuted
                                    ? 'w-32 h-32 bg-emerald-500 opacity-25 blur-lg'
                                    : 'w-28 h-28 bg-slate-700 opacity-10'
                            }`}
                            style={{
                                transform: isAiSpeaking ? 'scale(1.18)' : `scale(${1 + (audioLevel / 100) * 0.5})`
                            }}
                        />

                        {/* SolarFlow Brand Sun Logo Circle */}
                        <div className={`relative w-24 h-24 rounded-full p-1 bg-gradient-to-b from-amber-500/40 via-slate-900 to-slate-950 border-2 ${isAiSpeaking ? 'border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.45)]' : 'border-amber-500/40'} shadow-2xl flex items-center justify-center`}>
                            <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-950 via-slate-900 to-yellow-950 flex items-center justify-center overflow-hidden border border-amber-500/20 shadow-inner">
                                <Sun className={`w-12 h-12 text-amber-400 filter drop-shadow transition-transform duration-700 ${isAiSpeaking ? 'animate-spin-slow scale-110' : ''}`} />
                            </div>
                        </div>
                    </div>

                    {/* Caller Name & Active User */}
                    <h2 className="text-xl font-bold tracking-tight text-white">
                        SolarFlow AI <span className="text-amber-400 font-semibold text-sm">PRO</span>
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                        Instant Solar & HR Brain • <span className="text-amber-300 font-semibold">{displayName}</span>
                    </p>

                    {/* Live Solar Quick Telemetry Strip */}
                    {liveSolarData?.totals && (
                        <div className="mt-2.5 grid grid-cols-3 gap-1.5 w-full max-w-[340px] px-1">
                            <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-1.5 px-2 flex flex-col items-center">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">Live Power</span>
                                <span className="text-xs font-extrabold text-amber-400">{livePowerKw.toFixed(1)} kW</span>
                            </div>
                            <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-1.5 px-2 flex flex-col items-center">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">Today Units</span>
                                <span className="text-xs font-extrabold text-emerald-400">{liveTodayKwh.toFixed(0)} kWh</span>
                            </div>
                            <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-1.5 px-2 flex flex-col items-center">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">Today Rev</span>
                                <span className="text-xs font-extrabold text-cyan-300">₹{liveTodayRev.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    )}

                    {/* Live Speaking Status Pill & Multi-Bar Equalizer */}
                    <div className="mt-2.5 flex items-center space-x-2">
                        {isAiSpeaking ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                                <Volume2 className="w-3.5 h-3.5 mr-1.5 animate-bounce" />
                                SolarFlow બોલી રહ્યું છે...
                            </span>
                        ) : callState === 'connecting' ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                                <Sparkles className="w-3 h-3 mr-1.5" />
                                હાઈ-સ્પીડ AI કનેક્ટ થઈ રહ્યું છે...
                            </span>
                        ) : !isMuted && callState === 'connected' ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <Mic className="w-3 h-3 mr-1.5 animate-pulse" />
                                સાંભળી રહ્યું છે (ગમે તે મહિનાના યુનિટ પૂછો)...
                            </span>
                        ) : isMuted ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                                <MicOff className="w-3 h-3 mr-1.5" />
                                માઈક મ્યૂટ છે
                            </span>
                        ) : (
                            <span className="text-xs text-red-400 font-semibold">કૉલ પૂર્ણ થયો</span>
                        )}
                    </div>

                    {/* Multi-bar Audio Waveform Equalizer */}
                    {callState === 'connected' && !isMuted && (
                        <div className="mt-2 flex items-end justify-center space-x-1 h-4">
                            {[0.45, 0.85, 1.0, 0.7, 0.95, 0.6, 0.8, 0.5].map((mult, i) => {
                                const activeHeight = isAiSpeaking
                                    ? Math.max(4, Math.min(16, Math.round(6 + ((i % 3) + 1) * 3)))
                                    : Math.max(3, Math.min(16, Math.round((audioLevel / 100) * 16 * mult)));
                                return (
                                    <span
                                        key={i}
                                        className={`w-1 rounded-full transition-all duration-75 ${
                                            isAiSpeaking ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                                        }`}
                                        style={{ height: `${activeHeight}px` }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Tool Event Notification Bar */}
                {lastToolEvent && (
                    <div className="mx-5 px-3 py-1.5 bg-indigo-950/80 border border-indigo-500/40 rounded-xl text-[11px] text-indigo-200 flex items-center space-x-2 animate-bounce">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
                        <span className="truncate">{lastToolEvent}</span>
                    </div>
                )}

                {/* Modern Chat-Bubble Live Transcript Window */}
                <div className="mx-4 my-2 p-3 bg-slate-900/75 border border-slate-800/90 rounded-2xl flex-1 overflow-y-auto space-y-2 text-xs font-sans shadow-inner max-h-[210px]">
                    {transcriptHistory.map((item, idx) => (
                        <div 
                            key={idx} 
                            className={`flex flex-col ${
                                item.sender === 'user' ? 'items-end' : 'items-start'
                            }`}
                        >
                            <div
                                className={`max-w-[90%] rounded-2xl px-3 py-2 leading-relaxed ${
                                    item.sender === 'user'
                                        ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 rounded-br-sm'
                                        : 'bg-slate-800/90 border border-slate-700/70 text-slate-100 rounded-bl-sm'
                                }`}
                            >
                                <span className="block font-bold text-[10px] uppercase tracking-wider opacity-75 mb-0.5 text-amber-300">
                                    {item.sender === 'user' ? displayName : 'SolarFlow AI'}
                                </span>
                                <span>{item.text}</span>
                            </div>
                        </div>
                    ))}
                    {currentAiText && (
                        <div className="flex items-start">
                            <div className="max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-200 animate-pulse">
                                <span className="block font-bold text-[10px] uppercase tracking-wider text-amber-300 mb-0.5">
                                    SolarFlow AI
                                </span>
                                <span>{currentAiText}</span>
                            </div>
                        </div>
                    )}
                    <div ref={transcriptEndRef} />
                </div>

                {/* In-Call Controls Grid */}
                <div className="px-7 pb-6 pt-1 z-10 flex flex-col items-center">
                    <div className="grid grid-cols-3 gap-x-7 gap-y-3 mb-4 w-full max-w-[270px]">
                        
                        {/* 1. Mute Button */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={toggleMute}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer border ${
                                    isMuted 
                                        ? 'bg-white text-black border-white shadow-lg shadow-white/20' 
                                        : 'bg-slate-800/90 text-white border-slate-700 hover:bg-slate-700'
                                    }`}
                            >
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </button>
                            <span className="text-[10px] font-medium text-slate-300 mt-1">
                                {isMuted ? 'Unmute' : 'Mute'}
                            </span>
                        </div>

                        {/* 2. Voice Selector (Aoede / Kore / Leda / Puck) */}
                        <div className="flex flex-col items-center">
                            <button
                                type="button"
                                onClick={cycleVoice}
                                title="Change AI Voice"
                                className="w-14 h-14 rounded-full bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-emerald-500/40 text-white flex items-center justify-center transition cursor-pointer"
                            >
                                <Volume2 className="w-6 h-6 text-emerald-400" />
                            </button>
                            <span className="text-[10px] font-semibold text-emerald-300 mt-1">
                                Voice: {selectedVoice}
                            </span>
                        </div>

                        {/* 3. Instant Speed Indicator */}
                        <div className="flex flex-col items-center">
                            <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/40 text-white flex items-center justify-center">
                                <Zap className="w-6 h-6 text-amber-400" />
                            </div>
                            <span className="text-[10px] font-semibold text-amber-300 mt-1">0.3s Fast</span>
                        </div>

                    </div>

                    {/* Big Red End Call Button */}
                    <div className="flex justify-center">
                        {callState !== 'ended' ? (
                            <button
                                onClick={endCall}
                                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-90 text-white flex items-center justify-center shadow-2xl shadow-red-600/50 transition cursor-pointer"
                                title="End Call"
                            >
                                <PhoneOff className="w-8 h-8" />
                            </button>
                        ) : (
                            <button
                                onClick={onClose}
                                className="px-8 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition active:scale-95 cursor-pointer border border-slate-700"
                            >
                                Close Call
                            </button>
                        )}
                    </div>
                </div>

                {/* Bottom Home Bar Indicator */}
                <div className="w-full flex justify-center pb-2 z-20">
                    <div className="w-32 h-1 bg-slate-700/70 rounded-full"></div>
                </div>

            </div>
        </div>
    );
}

