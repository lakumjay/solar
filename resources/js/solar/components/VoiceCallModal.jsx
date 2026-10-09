import React, { useEffect, useRef, useState } from 'react';
import { 
    Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Sparkles, 
    Grid, MessageSquare, Info, Radio, Send, X, Check, HelpCircle
} from 'lucide-react';
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
    const [showKeypad, setShowKeypad] = useState(false);
    const [showPrompts, setShowPrompts] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [textInput, setTextInput] = useState('');

    const tonePlayerRef = useRef(null);
    const pcmPlayerRef = useRef(null);
    const micStreamRef = useRef(null);
    const durationTimerRef = useRef(null);
    const recognitionRef = useRef(null);
    const isMutedRef = useRef(isMuted);
    const isConnectedRef = useRef(false);
    const femaleVoiceRef = useRef(null);

    useEffect(() => {
        isMutedRef.current = isMuted;
    }, [isMuted]);

    // Preload & Lock Female Voices (Priya / Neha / Indian Female)
    useEffect(() => {
        const initVoices = () => {
            if (!('speechSynthesis' in window)) return;
            const voices = window.speechSynthesis.getVoices();
            if (!voices || voices.length === 0) return;

            const lang = getLanguage();
            const femaleKeywords = ['priya', 'neha', 'kavya', 'swara', 'heera', 'lekha', 'veena', 'zira', 'kalpana', 'geeta', 'shruti', 'female'];
            const maleKeywords = ['male', 'david', 'ravi', 'prabhat', 'george', 'mark', 'rishi', 'madhav'];

            // Exclude male voices
            const femaleCandidates = voices.filter(v => {
                const name = v.name.toLowerCase();
                return !maleKeywords.some(m => name.includes(m));
            });

            // Find best Indian female voice
            let selected = null;
            if (lang === 'gu') {
                selected = femaleCandidates.find(v => (v.lang.startsWith('gu') || v.lang.startsWith('hi')) && femaleKeywords.some(k => v.name.toLowerCase().includes(k)))
                    || femaleCandidates.find(v => v.lang.startsWith('gu') || v.lang.startsWith('hi'));
            } else {
                selected = femaleCandidates.find(v => v.lang.includes('IN') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)))
                    || femaleCandidates.find(v => v.lang.startsWith('en') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
            }

            if (!selected) {
                selected = femaleCandidates.find(v => v.lang.includes('IN')) || femaleCandidates[0] || voices[0];
            }

            femaleVoiceRef.current = selected;
        };

        initVoices();
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = initVoices;
        }
    }, []);

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
        setShowKeypad(false);
        setShowPrompts(false);
        setShowInfo(false);
        setTextInput('');
        isConnectedRef.current = false;

        // Initialize audio tones
        tonePlayerRef.current = new CallTonePlayer();
        try {
            tonePlayerRef.current.startRinging();
        } catch (_) {}

        pcmPlayerRef.current = new PcmPlayer(24000);

        try {
            // Check API config
            const config = await api('voice-agent/config');
            if (!config || !config.apiKey) {
                throw new Error('Gemini API Key is not configured on the server. Please check .env file.');
            }

            // Request microphone access
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
                console.warn('Microphone access unavailable or denied:', micErr);
            }

            // Stop ringing & play connected chime
            if (tonePlayerRef.current) {
                tonePlayerRef.current.playConnectedTone();
            }

            try {
                pcmPlayerRef.current.init();
            } catch (_) {}

            setCallStatus('connected');
            isConnectedRef.current = true;

            // Start timer
            durationTimerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);

            // Setup voice recognition
            setupVoiceRecognition();

            // Initial AI Greeting in Sweet Female Tone
            const lang = getLanguage();
            const welcomeText = lang === 'gu'
                ? `નમસ્તે ${user?.name || 'સર'}, હું SolarFlow AI આસિસ્ટન્ટ છું. આજે હું તમારી શું મદદ કરી શકું? તમે આજના સોલાર યુનિટ્સ, તારીખવાર જનરેશન, હિસાબ કે કર્મચારીઓ વિશે પૂછી શકો છો.`
                : `Hello ${user?.name || 'Sir'}, I am SolarFlow AI Assistant. How can I assist you today? You can ask about today's solar units, date-wise generation, revenue, or employee details.`;

            speakAiResponse(welcomeText);
            setTranscript([{ role: 'ai', text: welcomeText }]);

        } catch (err) {
            console.error('Call connection error:', err);
            if (tonePlayerRef.current) tonePlayerRef.current.stop();
            setCallStatus('error');
            setErrorMessage(err.message || 'કૉલ કનેક્ટ થઈ શક્યો નથી.');
        }
    };

    const setupVoiceRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition API not supported on this browser.');
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = getLanguage() === 'gu' ? 'gu-IN' : 'en-IN';

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

                if (finalTranscript) {
                    const textToSend = finalTranscript.trim();
                    if (textToSend) {
                        setCurrentUserSpeech(textToSend);
                        handleUserSpokenMessage(textToSend);
                    }
                }
            };

            recognition.onerror = (e) => {
                if (e.error !== 'no-speech') {
                    console.warn('Speech recognition status:', e.error);
                }
            };

            recognition.onend = () => {
                // Auto restart recognition if still connected
                if (isConnectedRef.current && recognitionRef.current) {
                    try {
                        recognitionRef.current.start();
                    } catch (_) {}
                }
            };

            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.warn('Speech recognition init failed:', e);
        }
    };

    const handleUserSpokenMessage = async (text) => {
        const cleanText = text.trim();
        if (!cleanText) return;

        setTranscript(prev => [...prev, { role: 'user', text: cleanText }]);
        setCurrentUserSpeech('');
        setCallStatus('speaking');

        try {
            const currentHistory = transcript.slice(-6);

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
                ? 'સોરી, માહિતી લાવવામાં તકલીફ થઈ છે. કૃપા કરીને ફરી પૂછશો.'
                : 'Sorry, could not process that request. Please ask again.';
            speakAiResponse(fallbackErr);
        }
    };

    // Strictly Fixed Female Voice (Priya / Neha Style)
    const speakAiResponse = (text) => {
        setCurrentAiSpeech(text);
        setCallStatus('speaking');

        if ('speechSynthesis' in window && isSpeakerOn) {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            const lang = getLanguage();
            utterance.lang = lang === 'gu' ? 'gu-IN' : 'en-IN';
            
            // Sweet, clear Indian Female tone
            utterance.pitch = 1.15;
            utterance.rate = 0.98;

            if (femaleVoiceRef.current) {
                utterance.voice = femaleVoiceRef.current;
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
        setShowKeypad(false);
        handleUserSpokenMessage(msg);
    };

    const handleAskQuickPrompt = (promptText) => {
        setShowPrompts(false);
        handleUserSpokenMessage(promptText);
    };

    const toggleMute = () => {
        setIsMuted(prev => !prev);
        if (micStreamRef.current) {
            micStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = isMuted;
            });
        }
    };

    const toggleSpeaker = () => {
        setIsSpeakerOn(prev => !prev);
        if (isSpeakerOn && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
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
        }, 400);
    };

    if (!isOpen) return null;

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        /* Full Screen iPhone Calling Screen */
        <div className="fixed inset-0 z-[99999] w-screen h-screen bg-[#07080b] text-white flex flex-col justify-between overflow-hidden select-none animate-fadeIn">
            {/* Ambient iOS Glow Backdrop */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-[280px] h-[280px] bg-indigo-500/10 rounded-full blur-[90px] pointer-events-none" />

            {/* TOP BAR / CALLER HEADER */}
            <div className="pt-12 sm:pt-16 pb-4 px-6 text-center z-10 flex flex-col items-center">
                {/* Audio Type Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-neutral-300 text-[11px] font-medium tracking-wide mb-3">
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>solarflow audio • HD</span>
                </div>

                {/* Caller Name */}
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white drop-shadow-md">
                    SolarFlow
                </h1>

                {/* Subtitle / Call Duration */}
                <div className="mt-1.5 text-sm sm:text-base font-normal tracking-wide text-neutral-400">
                    {callStatus === 'dialing' && (
                        <span className="text-neutral-300 animate-pulse">
                            {t('calling')}
                        </span>
                    )}
                    {(callStatus === 'connected' || callStatus === 'speaking' || callStatus === 'listening') && (
                        <span className="text-neutral-300 font-mono tracking-wider">
                            {formatTime(callDuration)}
                        </span>
                    )}
                    {callStatus === 'error' && (
                        <span className="text-red-400">
                            {errorMessage || t('callFailed')}
                        </span>
                    )}
                    {callStatus === 'ended' && (
                        <span className="text-neutral-400">
                            {t('callEnded')}
                        </span>
                    )}
                </div>

                {/* Sweet Tone Female Persona & Creator Tag */}
                <p className="text-[11px] text-neutral-500 mt-1">
                    {t('assistantTitle')} • {t('createdBy')}
                </p>
            </div>

            {/* CENTER AREA: SIRI-STYLE VOICE ORB & LIVE CAPTIONS */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 z-10 relative">
                {/* Animated Voice Orb (iPhone Siri Style) */}
                <div className="relative flex items-center justify-center my-auto">
                    {/* Concentric Breathing Glow Rings */}
                    {callStatus === 'speaking' && (
                        <>
                            <div className="absolute w-44 h-44 rounded-full border border-purple-400/40 animate-ping" style={{ animationDuration: '2.5s' }} />
                            <div className="absolute w-56 h-56 rounded-full bg-gradient-to-r from-purple-500/15 via-emerald-500/15 to-indigo-500/15 blur-xl animate-pulse" />
                        </>
                    )}
                    {callStatus === 'listening' && (
                        <>
                            <div className="absolute w-40 h-40 rounded-full border border-cyan-400/40 animate-pulse" />
                            <div className="absolute w-48 h-48 rounded-full bg-cyan-500/10 blur-lg animate-pulse" />
                        </>
                    )}
                    {callStatus === 'dialing' && (
                        <div className="absolute w-36 h-36 rounded-full border border-amber-400/30 animate-spin" style={{ animationDuration: '4s' }} />
                    )}

                    {/* Central Glowing Orb */}
                    <div className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
                        callStatus === 'speaking'
                            ? 'bg-gradient-to-tr from-purple-600 via-indigo-500 to-pink-500 shadow-purple-500/40 scale-105'
                            : callStatus === 'listening'
                            ? 'bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-500 shadow-cyan-500/40 scale-102'
                            : 'bg-gradient-to-tr from-slate-700 via-neutral-800 to-slate-900 shadow-emerald-500/20'
                    }`}>
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/20">
                            <Sparkles className={`w-10 h-10 transition-transform duration-300 ${
                                callStatus === 'speaking' ? 'text-amber-300 scale-110 animate-spin' :
                                callStatus === 'listening' ? 'text-cyan-300 scale-105' : 'text-neutral-400'
                            }`} style={{ animationDuration: '6s' }} />
                        </div>
                    </div>
                </div>

                {/* Real-Time Live Speech Subtitle Card (iOS Glassmorphism) */}
                <div className="w-full max-w-sm mt-4 min-h-[85px] max-h-[130px] overflow-y-auto px-4 py-3 rounded-2xl bg-white/8 backdrop-blur-xl border border-white/10 text-center text-xs sm:text-sm leading-relaxed shadow-lg">
                    {currentAiSpeech ? (
                        <p className="text-purple-200 font-normal animate-fadeIn">
                            <span className="font-semibold text-purple-300">SolarFlow: </span>
                            "{currentAiSpeech}"
                        </p>
                    ) : currentUserSpeech ? (
                        <p className="text-cyan-200 font-normal animate-fadeIn">
                            <span className="font-semibold text-cyan-300">{user?.name || 'You'}: </span>
                            "{currentUserSpeech}"
                        </p>
                    ) : (
                        <p className="text-neutral-400 italic flex items-center justify-center h-full">
                            {callStatus === 'dialing' 
                                ? t('callStatusDialing') 
                                : (getLanguage() === 'gu' ? 'તમે પૂછી શકો છો: "આજના યુનિટ્સ કેટલા?" અથવા નીચે Keypad થી લખો' : 'Speak anytime or tap Keypad to type...')}
                        </p>
                    )}
                </div>
            </div>

            {/* KEYPAD MODAL / DRAWER (iOS Frosted Glass Style) */}
            {showKeypad && (
                <div className="absolute inset-x-0 bottom-0 z-50 bg-[#16171d]/95 backdrop-blur-2xl border-t border-white/15 p-5 rounded-t-3xl shadow-2xl animate-slideUp">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-emerald-400" />
                            {t('keypad')}
                        </span>
                        <button 
                            onClick={() => setShowKeypad(false)}
                            className="p-1 rounded-full bg-white/10 text-neutral-400 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <form onSubmit={handleSendText} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder={t('typeQuestionPlaceholder')}
                            autoFocus
                            className="flex-1 bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-400"
                        />
                        <button
                            type="submit"
                            disabled={!textInput.trim()}
                            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl cursor-pointer"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            )}

            {/* QUICK PROMPTS DRAWER */}
            {showPrompts && (
                <div className="absolute inset-x-0 bottom-0 z-50 bg-[#16171d]/95 backdrop-blur-2xl border-t border-white/15 p-5 rounded-t-3xl shadow-2xl animate-slideUp">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                            <HelpCircle className="w-4 h-4 text-emerald-400" />
                            {t('quickQuestions')}
                        </span>
                        <button 
                            onClick={() => setShowPrompts(false)}
                            className="p-1 rounded-full bg-white/10 text-neutral-400 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            t('qTodayUnits'),
                            t('qCurtailment'),
                            t('qAttendance'),
                            t('qRevenue'),
                        ].map((prompt, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleAskQuickPrompt(prompt)}
                                className="text-left p-3 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-xs text-neutral-200 transition-colors"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* PLANT INFO DRAWER */}
            {showInfo && (
                <div className="absolute inset-x-0 bottom-0 z-50 bg-[#16171d]/95 backdrop-blur-2xl border-t border-white/15 p-5 rounded-t-3xl shadow-2xl animate-slideUp">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                            <Info className="w-4 h-4 text-cyan-400" />
                            {t('plantInfo')}
                        </span>
                        <button 
                            onClick={() => setShowInfo(false)}
                            className="p-1 rounded-full bg-white/10 text-neutral-400 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-2 text-xs text-neutral-300">
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>User</span>
                            <span className="font-semibold text-white">{user?.name} ({user?.role})</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>Company</span>
                            <span className="font-semibold text-white">{user?.company?.name || 'All Companies'}</span>
                        </div>
                        <div className="flex justify-between p-2 rounded-lg bg-white/5">
                            <span>Voice Engine</span>
                            <span className="font-semibold text-emerald-400">Priya / Neha (Indian Female)</span>
                        </div>
                    </div>
                </div>
            )}

            {/* BOTTOM SECTION: AUTHENTIC iOS 6-BUTTON GRID & RED END CALL BUTTON */}
            <div className="pb-10 pt-4 px-8 z-10 flex flex-col items-center">
                {/* 6-Button Grid (2 rows of 3 buttons) */}
                <div className="grid grid-cols-3 gap-x-8 gap-y-5 sm:gap-x-12 sm:gap-y-6 max-w-xs mb-8">
                    {/* 1. Mute */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={toggleMute}
                            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isMuted
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            {isMuted ? <MicOff className="w-6 h-6 sm:w-7 sm:h-7" /> : <Mic className="w-6 h-6 sm:w-7 sm:h-7" />}
                        </button>
                        <span className="text-[11px] sm:text-xs text-neutral-300 capitalize">{t('mute')}</span>
                    </div>

                    {/* 2. Keypad */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={() => {
                                setShowKeypad(!showKeypad);
                                setShowPrompts(false);
                                setShowInfo(false);
                            }}
                            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                showKeypad
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            <Grid className="w-6 h-6 sm:w-7 sm:h-7" />
                        </button>
                        <span className="text-[11px] sm:text-xs text-neutral-300 capitalize">{t('keypad')}</span>
                    </div>

                    {/* 3. Speaker / Audio */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={toggleSpeaker}
                            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isSpeakerOn
                                    ? 'bg-white text-black shadow-lg'
                                    : 'bg-white/12 text-neutral-400 hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            {isSpeakerOn ? <Volume2 className="w-6 h-6 sm:w-7 sm:h-7" /> : <VolumeX className="w-6 h-6 sm:w-7 sm:h-7" />}
                        </button>
                        <span className="text-[11px] sm:text-xs text-neutral-300 capitalize">{t('speaker')}</span>
                    </div>

                    {/* 4. Quick Prompts */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={() => {
                                setShowPrompts(!showPrompts);
                                setShowKeypad(false);
                                setShowInfo(false);
                            }}
                            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                showPrompts
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            <HelpCircle className="w-6 h-6 sm:w-7 sm:h-7" />
                        </button>
                        <span className="text-[11px] sm:text-xs text-neutral-300 capitalize">{t('prompts')}</span>
                    </div>

                    {/* 5. Audio Wave / Visualizer */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={() => {
                                // Toggle subtitle or wave state
                            }}
                            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-white/12 text-white hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
                        >
                            <Radio className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400" />
                        </button>
                        <span className="text-[11px] sm:text-xs text-neutral-300 capitalize">{t('visualizer')}</span>
                    </div>

                    {/* 6. Plant Info */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={() => {
                                setShowInfo(!showInfo);
                                setShowKeypad(false);
                                setShowPrompts(false);
                            }}
                            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                showInfo
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            <Info className="w-6 h-6 sm:w-7 sm:h-7" />
                        </button>
                        <span className="text-[11px] sm:text-xs text-neutral-300 capitalize">{t('info')}</span>
                    </div>
                </div>

                {/* Big Red Circular End Call Button (Classic iOS Hangup) */}
                <button
                    onClick={endCall}
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-[#eb4e3d] hover:bg-[#ff5544] active:bg-[#c93b2c] flex items-center justify-center text-white shadow-2xl shadow-red-600/40 transition-transform active:scale-90 cursor-pointer"
                    title={t('callEnd')}
                >
                    <PhoneOff className="w-8 h-8 sm:w-9 sm:h-9" />
                </button>
            </div>
        </div>
    );
}
