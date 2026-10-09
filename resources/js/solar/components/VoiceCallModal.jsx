import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Sparkles, Bot, Send, Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { PcmPlayer, CallTonePlayer } from '../lib/audio';
import { getLanguage, t } from '../utils/translations';

export default function VoiceCallModal({ isOpen, onClose, user }) {
    const [callStatus, setCallStatus] = useState('dialing'); // dialing, connected, speaking, listening, ended, error
    const [errorMessage, setErrorMessage] = useState('');
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [callDuration, setCallDuration] = useState(0);
    const [transcript, setTranscript] = useState([]);
    const [currentAiSpeech, setCurrentAiSpeech] = useState('');
    const [currentUserSpeech, setCurrentUserSpeech] = useState('');
    const [textInput, setTextInput] = useState('');
    const [hasVoiceSupport, setHasVoiceSupport] = useState(true);

    const tonePlayerRef = useRef(null);
    const pcmPlayerRef = useRef(null);
    const micStreamRef = useRef(null);
    const durationTimerRef = useRef(null);
    const recognitionRef = useRef(null);
    const isMutedRef = useRef(isMuted);
    const isConnectedRef = useRef(false);
    const configRef = useRef(null);

    useEffect(() => {
        isMutedRef.current = isMuted;
    }, [isMuted]);

    useEffect(() => {
        if (isOpen) {
            startCall();
        } else {
            endCall();
        }
        return () => {
            endCall();
        };
    }, [isOpen]);

    const startCall = async () => {
        setCallStatus('dialing');
        setErrorMessage('');
        setCallDuration(0);
        setTranscript([]);
        setCurrentAiSpeech('');
        setCurrentUserSpeech('');
        setTextInput('');
        isConnectedRef.current = false;

        // Initialize audio tones
        tonePlayerRef.current = new CallTonePlayer();
        try {
            tonePlayerRef.current.startRinging();
        } catch (_) {}

        pcmPlayerRef.current = new PcmPlayer(24000);

        try {
            // Fetch configuration & check API key
            const config = await api('voice-agent/config');
            if (!config || !config.apiKey) {
                throw new Error('Gemini API Key is not configured on the server. Check .env file.');
            }
            configRef.current = config;

            // Request microphone access (gracefully handle if user denies or browser blocks)
            let stream = null;
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            channelCount: 1,
                            sampleRate: 16000,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        }
                    });
                    micStreamRef.current = stream;
                }
            } catch (micErr) {
                console.warn('Microphone access not granted or unavailable:', micErr);
            }

            // Stop ringing tone and play connected chime
            if (tonePlayerRef.current) {
                tonePlayerRef.current.playConnectedTone();
            }

            try {
                pcmPlayerRef.current.init();
            } catch (_) {}

            setCallStatus('connected');
            isConnectedRef.current = true;

            // Start call duration timer
            durationTimerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);

            // Setup speech recognition for real-time human to AI voice conversation
            setupVoiceRecognition(config);

            // Initial AI Greeting
            const lang = getLanguage();
            const welcomeText = lang === 'gu'
                ? `નમસ્તે ${user?.name || 'સર'}, હું SolarFlow AI આસિસ્ટન્ટ છું. આજે હું તમારી શું મદદ કરી શકું? તમે સોલાર યુનિટ્સ, તારીખ મુજબ જનરેશન, હિસાબ કે કર્મચારીઓ વિશે પૂછી શકો છો.`
                : `Hello ${user?.name || 'Sir'}, I am SolarFlow AI Assistant. How can I help you today? You can ask about solar generation, date-wise units, revenue, or employee details.`;

            speakAiResponse(welcomeText);
            setTranscript([{ role: 'ai', text: welcomeText }]);

        } catch (err) {
            console.error('Call connection error:', err);
            if (tonePlayerRef.current) tonePlayerRef.current.stop();
            setCallStatus('error');
            setErrorMessage(err.message || 'કનેક્શન એરર આવી છે.');
        }
    };

    const setupVoiceRecognition = (config) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition API not supported on this browser.');
            setHasVoiceSupport(false);
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = getLanguage() === 'gu' ? 'gu-IN' : 'en-US';

            recognition.onresult = (event) => {
                if (isMutedRef.current) return;

                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (interimTranscript) {
                    setCurrentUserSpeech(interimTranscript);
                    setCallStatus('listening');
                }

                if (finalTranscript.trim()) {
                    const userQuery = finalTranscript.trim();
                    setCurrentUserSpeech(userQuery);
                    handleUserSpokenMessage(userQuery, config);
                }
            };

            recognition.onerror = (e) => {
                if (e.error !== 'no-speech' && e.error !== 'aborted') {
                    console.warn('Speech recognition event:', e.error);
                }
            };

            recognition.onend = () => {
                if (isConnectedRef.current && recognitionRef.current) {
                    try {
                        recognitionRef.current.start();
                    } catch (_) {}
                }
            };

            recognition.start();
            recognitionRef.current = recognition;
        } catch (recErr) {
            console.warn('Recognition init error:', recErr);
        }
    };

    const handleUserSpokenMessage = async (queryText) => {
        if (!queryText || !queryText.trim()) return;

        const cleanText = queryText.trim();
        setTranscript(prev => [...prev, { role: 'user', text: cleanText }]);
        setCurrentUserSpeech('');
        setCallStatus('speaking');

        try {
            const currentHistory = transcript.slice(-6).map(t => ({
                role: t.role === 'user' ? 'user' : 'model',
                text: t.text
            }));

            const response = await api('voice-agent/chat', {
                method: 'POST',
                body: JSON.stringify({
                    message: cleanText,
                    history: currentHistory,
                    language: getLanguage(),
                })
            });

            if (response && response.reply) {
                const aiReply = response.reply;
                setTranscript(prev => [...prev, { role: 'ai', text: aiReply }]);
                speakAiResponse(aiReply);
            } else if (response && response.error) {
                throw new Error(response.error);
            }
        } catch (err) {
            console.error('Error getting AI reply:', err);
            const fallbackErr = getLanguage() === 'gu'
                ? 'સોરી, સર્વર અથવા જેમિની API પરથી માહિતી લાવવામાં તકલીફ થઈ છે.'
                : 'Sorry, could not process that request with server.';
            speakAiResponse(fallbackErr);
        }
    };

    const speakAiResponse = (text) => {
        setCurrentAiSpeech(text);
        setCallStatus('speaking');

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            const lang = getLanguage();
            utterance.lang = lang === 'gu' ? 'gu-IN' : 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.05;

            // Pick a good voice
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => (lang === 'gu' ? v.lang.includes('gu') || v.lang.includes('hi') : v.lang.includes('en-IN') || v.lang.includes('en-US')));
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            utterance.onend = () => {
                setCallStatus('connected');
                setCurrentAiSpeech('');
            };

            utterance.onerror = () => {
                setCallStatus('connected');
                setCurrentAiSpeech('');
            };

            window.speechSynthesis.speak(utterance);
        } else {
            setTimeout(() => {
                setCallStatus('connected');
                setCurrentAiSpeech('');
            }, 3000);
        }
    };

    const handleSendText = (e) => {
        e?.preventDefault();
        if (!textInput.trim()) return;
        const msg = textInput.trim();
        setTextInput('');
        handleUserSpokenMessage(msg);
    };

    const toggleMute = () => {
        setIsMuted(prev => !prev);
        if (micStreamRef.current) {
            micStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = isMuted; // toggle
            });
        }
    };

    const endCall = () => {
        isConnectedRef.current = false;
        if (tonePlayerRef.current) {
            tonePlayerRef.current.playEndedTone();
            tonePlayerRef.current.stop();
        }
        if (pcmPlayerRef.current) {
            pcmPlayerRef.current.stop();
        }
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            } catch (_) {}
        }
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (durationTimerRef.current) {
            clearInterval(durationTimerRef.current);
            durationTimerRef.current = null;
        }
        setCallStatus('ended');
        setTimeout(() => {
            onClose();
        }, 500);
    };

    if (!isOpen) return null;

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/70 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col min-h-[580px] max-h-[92vh]">
                {/* Glowing Aura Background */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-60 h-60 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                {/* Top Header */}
                <div className="p-5 text-center z-10 border-b border-slate-800/60">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-xs font-semibold tracking-wide mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
                        <span>SolarFlow AI Voice Assistant</span>
                    </div>

                    <h3 className="text-xl font-bold tracking-tight text-slate-100 flex items-center justify-center gap-2">
                        SolarFlow Live
                    </h3>
                    <p className="text-[11px] text-slate-400">Created by Jay Sir</p>

                    <div className="mt-2 text-xs font-medium">
                        {callStatus === 'dialing' && (
                            <span className="text-amber-400 animate-pulse flex items-center justify-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 animate-bounce" /> {t('callStatusDialing')}
                            </span>
                        )}
                        {callStatus === 'connected' && (
                            <span className="text-emerald-400 flex items-center justify-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                {formatTime(callDuration)} • {t('callStatusConnected')}
                            </span>
                        )}
                        {callStatus === 'listening' && (
                            <span className="text-blue-400 flex items-center justify-center gap-1.5">
                                <Mic className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                                {formatTime(callDuration)} • {t('callStatusListening')}
                            </span>
                        )}
                        {callStatus === 'speaking' && (
                            <span className="text-purple-300 flex items-center justify-center gap-1.5">
                                <Volume2 className="w-3.5 h-3.5 text-purple-400 animate-bounce" />
                                {formatTime(callDuration)} • {t('callStatusSpeaking')}
                            </span>
                        )}
                        {callStatus === 'error' && (
                            <span className="text-rose-400 flex items-center justify-center gap-1.5">
                                <AlertCircle className="w-4 h-4" /> {errorMessage || 'Call failed'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Center Visualizer & Live Avatar */}
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-2 z-10 overflow-hidden">
                    <div className="relative flex items-center justify-center my-3">
                        {/* Animated Voice Waves */}
                        {callStatus === 'speaking' && (
                            <>
                                <div className="absolute w-36 h-36 rounded-full border-2 border-purple-500/40 animate-ping" style={{ animationDuration: '2s' }} />
                                <div className="absolute w-44 h-44 rounded-full border border-purple-400/20 animate-pulse" />
                            </>
                        )}
                        {callStatus === 'listening' && (
                            <div className="absolute w-32 h-32 rounded-full border-2 border-blue-500/40 animate-pulse" />
                        )}
                        {callStatus === 'dialing' && (
                            <div className="absolute w-32 h-32 rounded-full border border-amber-400/30 animate-spin" style={{ animationDuration: '3s' }} />
                        )}

                        <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl border-2 transition-all duration-300 ${
                            callStatus === 'speaking'
                                ? 'bg-gradient-to-br from-purple-600 to-indigo-700 border-purple-300 scale-105 shadow-purple-500/30'
                                : callStatus === 'listening'
                                ? 'bg-gradient-to-br from-blue-600 to-cyan-700 border-blue-300 scale-100 shadow-blue-500/30'
                                : 'bg-gradient-to-br from-emerald-600 to-teal-800 border-emerald-400/40 shadow-emerald-500/20'
                        }`}>
                            <Bot className="w-12 h-12 text-white drop-shadow-md" />
                        </div>
                    </div>

                    {/* Real-Time Live Speech Subtitle */}
                    <div className="w-full min-h-[90px] max-h-[140px] overflow-y-auto px-4 py-2.5 rounded-2xl bg-slate-800/85 border border-slate-700/60 backdrop-blur-sm text-center text-xs leading-relaxed">
                        {currentAiSpeech ? (
                            <p className="text-purple-200 font-normal animate-fadeIn">
                                <span className="font-bold text-purple-400">SolarFlow: </span>
                                "{currentAiSpeech}"
                            </p>
                        ) : currentUserSpeech ? (
                            <p className="text-blue-200 font-normal animate-fadeIn">
                                <span className="font-bold text-blue-400">{user?.name || 'You'}: </span>
                                "{currentUserSpeech}"
                            </p>
                        ) : (
                            <p className="text-slate-400 italic flex items-center justify-center h-full">
                                {callStatus === 'dialing' ? 'કનેક્ટ થઈ રહ્યું છે...' : 'તમે કંઈ પણ બોલી શકો છો... દા.ત. "૧૯ તારીખે કેટલા યુનિટ આવ્યા?"'}
                            </p>
                        )}
                    </div>

                    {/* Quick Text Input for Mobile Devices without Mic Permission */}
                    <form onSubmit={handleSendText} className="w-full mt-3 flex items-center gap-1.5">
                        <input
                            type="text"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder="અથવા અહીં લખીને પૂછો (Type question)..."
                            className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            type="submit"
                            disabled={!textInput.trim()}
                            className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl cursor-pointer"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </form>
                </div>

                {/* Bottom Call Controls */}
                <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 z-10">
                    <div className="flex items-center justify-center gap-6">
                        {/* Mute Button */}
                        <button
                            onClick={toggleMute}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                isMuted
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-lg'
                                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                            }`}
                            title={isMuted ? t('unmute') : t('mute')}
                        >
                            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </button>

                        {/* End Call Button (Big Red) */}
                        <button
                            onClick={endCall}
                            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-all cursor-pointer border-2 border-red-400/50"
                            title={t('callEnd')}
                        >
                            <PhoneOff className="w-7 h-7" />
                        </button>

                        {/* Speaker Toggle */}
                        <button
                            onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                isSpeakerOn
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                            title={t('speaker')}
                        >
                            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                        </button>
                    </div>

                    <div className="text-center mt-3">
                        <span className="text-[10px] text-slate-500">
                            SolarFlow AI Engine • Connected to Live Database
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
