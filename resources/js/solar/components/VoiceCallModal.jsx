import React, { useEffect, useRef, useState } from 'react';
import { 
    Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Sparkles, 
    Grid, MessageSquare, Info, Radio, Send, X, Check, HelpCircle
} from 'lucide-react';
import { api } from '../api';
import { PcmPlayer, CallTonePlayer } from '../lib/audio';
import { getLanguage, t } from '../utils/translations';

// Helper to unlock Web Audio & SpeechSynthesis immediately on user click gesture
export function unlockVoiceCallAudio() {
    try {
        if (typeof window !== 'undefined') {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.resume();
                const silent = new SpeechSynthesisUtterance(' ');
                silent.volume = 0.01;
                window.speechSynthesis.speak(silent);
            }
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                ctx.resume().then(() => ctx.close()).catch(() => {});
            }
        }
    } catch (_) {}
}

function selectLockedFemaleVoice(voices, lang) {
    if (!voices || voices.length === 0) return null;

    const maleKeywords = [
        'male', 'david', 'ravi', 'prabhat', 'george', 'mark', 'rishi', 'madhav',
        'niranjan', 'ajay', 'anil', 'pawan', 'manish', 'valluvar', '-gum', '-him', '-enm'
    ];
    const femaleKeywords = [
        'priya', 'neha', 'kavya', 'swara', 'heera', 'neerja', 'veena', 'zira',
        'kalpana', 'geeta', 'shruti', 'lekha', 'female', '-guf', '-hif', '-enf', '-end', '-ene'
    ];

    // Filter out all confirmed male voices
    const nonMale = voices.filter(v => {
        const fullDesc = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
        return !maleKeywords.some(m => fullDesc.includes(m));
    });

    const pool = nonMale.length > 0 ? nonMale : voices;

    // 1. If Gujarati:
    if (lang === 'gu') {
        const guFemale = pool.find(v => {
            const l = (v.lang || '').toLowerCase();
            const n = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
            return l.startsWith('gu') && femaleKeywords.some(f => n.includes(f));
        });
        if (guFemale) return guFemale;

        // Any native Gujarati voice (elevated pitch makes it female tone)
        const anyGu = pool.find(v => (v.lang || '').toLowerCase().startsWith('gu'));
        if (anyGu) return anyGu;

        // Hindi female understands Indian phonetic accents
        const hiFemale = pool.find(v => {
            const l = (v.lang || '').toLowerCase();
            const n = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
            return l.startsWith('hi') && femaleKeywords.some(f => n.includes(f));
        });
        if (hiFemale) return hiFemale;
    }

    // 2. Indian Female (Priya, Neha, Veena, Heera, etc.)
    const indianFemale = pool.find(v => {
        const l = (v.lang || '').toLowerCase();
        const n = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
        return (l.includes('in') || l.startsWith('en')) && femaleKeywords.some(f => n.includes(f));
    });
    if (indianFemale) return indianFemale;

    // 3. Any Indian non-male voice
    const anyIndianNonMale = pool.find(v => (v.lang || '').toLowerCase().includes('in'));
    if (anyIndianNonMale) return anyIndianNonMale;

    // 4. Any female voice
    const anyFemale = pool.find(v => {
        const n = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
        return femaleKeywords.some(f => n.includes(f));
    });
    if (anyFemale) return anyFemale;

    return pool[0] || voices[0];
}

export default function VoiceCallModal({ isOpen, onClose, user, activeCompany }) {
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
    const durationTimerRef = useRef(null);
    const recognitionRef = useRef(null);
    const recognitionActiveRef = useRef(false);
    const isMutedRef = useRef(isMuted);
    const isConnectedRef = useRef(false);
    const isAiSpeakingRef = useRef(false);
    const lockedFemaleVoiceRef = useRef(null);

    useEffect(() => {
        isMutedRef.current = isMuted;
        if (isMuted) {
            stopListening();
        } else if (isConnectedRef.current && !isAiSpeakingRef.current) {
            startListening();
        }
    }, [isMuted]);

    // Lock a single, consistent female voice at component mount
    useEffect(() => {
        const initLockedVoice = () => {
            try {
                if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
                const voices = window.speechSynthesis.getVoices() || [];
                if (!voices || voices.length === 0) return;
                if (!lockedFemaleVoiceRef.current) {
                    lockedFemaleVoiceRef.current = selectLockedFemaleVoice(voices, getLanguage());
                }
            } catch (err) {
                console.warn('Voice lock handled:', err);
            }
        };

        initLockedVoice();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = initLockedVoice;
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

    const startListening = () => {
        if (!isConnectedRef.current || isAiSpeakingRef.current || isMutedRef.current) return;
        if (!recognitionRef.current) return;

        try {
            if (!recognitionActiveRef.current) {
                recognitionRef.current.lang = getLanguage() === 'gu' ? 'gu-IN' : 'en-IN';
                recognitionRef.current.start();
                recognitionActiveRef.current = true;
                setCallStatus('listening');
            }
        } catch (err) {
            if (err.name !== 'InvalidStateError') {
                console.warn('startListening warning:', err);
            }
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && recognitionActiveRef.current) {
            try {
                recognitionActiveRef.current = false;
                recognitionRef.current.stop();
            } catch (_) {}
        }
    };

    const setupVoiceRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition API not supported on this browser.');
            return;
        }

        try {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(_) {}
                recognitionRef.current = null;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = getLanguage() === 'gu' ? 'gu-IN' : 'en-IN';

            recognition.onstart = () => {
                recognitionActiveRef.current = true;
                if (!isAiSpeakingRef.current) {
                    setCallStatus('listening');
                }
            };

            recognition.onresult = (event) => {
                if (isMutedRef.current || isAiSpeakingRef.current) return;

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
                        stopListening();
                        handleUserSpokenMessage(textToSend);
                    }
                }
            };

            recognition.onerror = (e) => {
                if (e.error !== 'no-speech') {
                    console.warn('Speech recognition status:', e.error);
                }
                recognitionActiveRef.current = false;
            };

            recognition.onend = () => {
                recognitionActiveRef.current = false;
                // Auto resume listening if call is active and AI is not speaking
                if (isConnectedRef.current && !isAiSpeakingRef.current && !isMutedRef.current) {
                    setTimeout(() => {
                        if (isConnectedRef.current && !isAiSpeakingRef.current && !isMutedRef.current) {
                            startListening();
                        }
                    }, 150);
                }
            };

            recognitionRef.current = recognition;
        } catch (e) {
            console.warn('Speech recognition init failed:', e);
        }
    };

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
        isAiSpeakingRef.current = false;

        // Ensure locked single female voice is selected
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const voices = window.speechSynthesis.getVoices() || [];
            lockedFemaleVoiceRef.current = selectLockedFemaleVoice(voices, getLanguage());
        }

        // Initialize audio tones
        tonePlayerRef.current = new CallTonePlayer();
        try {
            tonePlayerRef.current.startRinging();
        } catch (_) {}

        pcmPlayerRef.current = new PcmPlayer(24000);

        try {
            // Request mic permission check without holding audio track lock
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    tempStream.getTracks().forEach(t => t.stop());
                } catch (micErr) {
                    console.warn('Microphone permission check:', micErr);
                }
            }

            // Dialing delay for realistic call feel
            await new Promise(r => setTimeout(r, 1400));

            // Stop ringing & play connected chime
            if (tonePlayerRef.current) {
                tonePlayerRef.current.playConnectedTone();
            }

            try {
                pcmPlayerRef.current.init();
            } catch (_) {}

            setCallStatus('connected');
            isConnectedRef.current = true;

            // Start duration timer
            durationTimerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);

            // Initialize speech recognition
            setupVoiceRecognition();

            // Exact short, simple welcome greeting with company name
            const lang = getLanguage();
            const compName = activeCompany?.name || user?.company?.name || 'Nilkanth Solar';
            const welcomeText = lang === 'gu'
                ? `નમસ્તે, ${compName} SolarFlow માં આપનું સ્વાગત છે. હું તમારી શું મદદ કરી શકું?`
                : `Hello, welcome to ${compName} SolarFlow. How can I help you?`;

            setTranscript([{ role: 'ai', text: welcomeText }]);
            speakAiResponse(welcomeText);

        } catch (err) {
            console.error('Call connection error:', err);
            if (tonePlayerRef.current) tonePlayerRef.current.stop();
            setCallStatus('error');
            setErrorMessage(err.message || (getLanguage() === 'en' ? 'Could not connect call.' : 'કૉલ કનેક્ટ થઈ શક્યો નથી.'));
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
                return;
            } else if (response && response.error) {
                throw new Error(response.error);
            }
        } catch (err) {
            console.warn('Backend chat response error, using smart local engine:', err);
        }

        // Smart Local Response fallback - answered in the active language
        const fallbackReply = generateSmartLocalReply(cleanText, getLanguage(), user, activeCompany);
        setTranscript(prev => [...prev, { role: 'ai', text: fallbackReply }]);
        speakAiResponse(fallbackReply);
    };

    // Strictly Fixed Female Voice (Priya / Neha Style) with Sweet Pitch
    const speakAiResponse = (text) => {
        if (!text) return;
        setCurrentAiSpeech(text);
        setCallStatus('speaking');
        isAiSpeakingRef.current = true;
        stopListening(); // Stop mic while AI speaks so it doesn't hear itself

        if (typeof window !== 'undefined' && 'speechSynthesis' in window && isSpeakerOn) {
            try {
                window.speechSynthesis.cancel();
                window.speechSynthesis.resume();
            } catch (_) {}

            const lang = getLanguage();
            const utterance = new SpeechSynthesisUtterance(text);
            window.__solarflow_current_utterance = utterance; // Prevents garbage collection cut-off

            // Ensure single locked female voice
            if (!lockedFemaleVoiceRef.current) {
                const voices = window.speechSynthesis.getVoices() || [];
                lockedFemaleVoiceRef.current = selectLockedFemaleVoice(voices, lang);
            }

            if (lockedFemaleVoiceRef.current) {
                utterance.voice = lockedFemaleVoiceRef.current;
                utterance.lang = lockedFemaleVoiceRef.current.lang || (lang === 'en' ? 'en-IN' : 'gu-IN');
            } else {
                utterance.lang = lang === 'en' ? 'en-IN' : 'gu-IN';
            }

            // Fixed sweet Indian female pitch & natural rate
            utterance.pitch = 1.32;
            utterance.rate = 0.95;
            utterance.volume = 1.0;

            utterance.onstart = () => {
                isAiSpeakingRef.current = true;
                stopListening();
                setCallStatus('speaking');
            };

            utterance.onend = () => {
                isAiSpeakingRef.current = false;
                setCurrentAiSpeech('');
                window.__solarflow_current_utterance = null;
                if (isConnectedRef.current && !isMutedRef.current) {
                    setCallStatus('listening');
                    startListening(); // Immediately start listening for user's question!
                } else {
                    setCallStatus('connected');
                }
            };

            utterance.onerror = (e) => {
                console.warn('SpeechSynthesis error:', e);
                isAiSpeakingRef.current = false;
                setCurrentAiSpeech('');
                window.__solarflow_current_utterance = null;
                if (isConnectedRef.current && !isMutedRef.current) {
                    setCallStatus('listening');
                    startListening();
                }
            };

            try {
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                console.warn('speechSynthesis.speak failed:', err);
                isAiSpeakingRef.current = false;
                if (isConnectedRef.current && !isMutedRef.current) {
                    setCallStatus('listening');
                    startListening();
                }
            }
        } else {
            setTimeout(() => {
                isAiSpeakingRef.current = false;
                setCurrentAiSpeech('');
                if (isConnectedRef.current && !isMutedRef.current) {
                    setCallStatus('listening');
                    startListening();
                }
            }, 1400);
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
    };

    const toggleSpeaker = () => {
        setIsSpeakerOn(prev => !prev);
        if (isSpeakerOn && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    };

    const endCall = () => {
        isConnectedRef.current = false;
        isAiSpeakingRef.current = false;
        stopListening();

        if (tonePlayerRef.current) {
            tonePlayerRef.current.playEndedTone();
            tonePlayerRef.current.stop();
        }
        if (pcmPlayerRef.current) {
            pcmPlayerRef.current.stop();
        }
        if (recognitionRef.current) {
            try {
                recognitionRef.current.abort();
                recognitionRef.current = null;
            } catch (_) {}
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
        <div className="fixed inset-0 z-[99999] w-full h-[100dvh] max-h-[100dvh] bg-[#07080b] text-white flex flex-col justify-between overflow-y-auto select-none animate-fadeIn pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] px-4">
            {/* Ambient iOS Glow Backdrop */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[90px] pointer-events-none" />
            <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-[240px] h-[240px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />

            {/* TOP BAR / CALLER HEADER */}
            <div className="pt-2 sm:pt-4 pb-2 px-3 text-center z-10 flex flex-col items-center flex-shrink-0">
                {/* Audio Type Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-neutral-300 text-[11px] font-medium tracking-wide mb-1.5">
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>solarflow audio • HD</span>
                </div>

                {/* Caller Name */}
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white drop-shadow-md">
                    SolarFlow
                </h1>

                {/* Subtitle / Call Duration */}
                <div className="mt-1 text-xs sm:text-sm font-normal tracking-wide text-neutral-400">
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
                <p className="text-[10px] text-neutral-500 mt-0.5">
                    {t('assistantTitle')} • {t('createdBy')}
                </p>
            </div>

            {/* CENTER AREA: SIRI-STYLE VOICE ORB & LIVE CAPTIONS */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-1 z-10 relative my-auto min-h-0">
                {/* Animated Voice Orb (iPhone Siri Style) */}
                <div className="relative flex items-center justify-center my-auto">
                    {/* Concentric Breathing Glow Rings */}
                    {callStatus === 'speaking' && (
                        <>
                            <div className="absolute w-32 h-32 rounded-full border border-purple-400/40 animate-ping" style={{ animationDuration: '2.5s' }} />
                            <div className="absolute w-40 h-40 rounded-full bg-gradient-to-r from-purple-500/15 via-emerald-500/15 to-indigo-500/15 blur-xl animate-pulse" />
                        </>
                    )}
                    {callStatus === 'listening' && (
                        <>
                            <div className="absolute w-28 h-28 rounded-full border border-cyan-400/40 animate-pulse" />
                            <div className="absolute w-36 h-36 rounded-full bg-cyan-500/10 blur-lg animate-pulse" />
                        </>
                    )}
                    {callStatus === 'dialing' && (
                        <div className="absolute w-28 h-28 rounded-full border border-amber-400/30 animate-spin" style={{ animationDuration: '4s' }} />
                    )}

                    {/* Central Glowing Orb */}
                    <div className={`w-20 h-20 sm:w-26 sm:h-26 rounded-full flex items-center justify-center shadow-xl transition-all duration-500 ${
                        callStatus === 'speaking'
                            ? 'bg-gradient-to-tr from-purple-600 via-indigo-500 to-pink-500 shadow-purple-500/40 scale-105'
                            : callStatus === 'listening'
                            ? 'bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-500 shadow-cyan-500/40 scale-102'
                            : 'bg-gradient-to-tr from-slate-700 via-neutral-800 to-slate-900 shadow-emerald-500/20'
                    }`}>
                        <div className="w-16 h-16 sm:w-22 sm:h-22 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/20">
                            <Sparkles className={`w-8 h-8 sm:w-9 sm:h-9 transition-transform duration-300 ${
                                callStatus === 'speaking' ? 'text-amber-300 scale-110 animate-spin' :
                                callStatus === 'listening' ? 'text-cyan-300 scale-105' : 'text-neutral-400'
                            }`} style={{ animationDuration: '6s' }} />
                        </div>
                    </div>
                </div>

                {/* Real-Time Live Speech Subtitle Card (iOS Glassmorphism) */}
                <div className="w-full max-w-xs sm:max-w-sm mt-3 min-h-[46px] max-h-[75px] overflow-y-auto px-3.5 py-2 rounded-xl bg-white/8 backdrop-blur-xl border border-white/10 text-center text-xs sm:text-sm leading-snug shadow-lg">
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
                                : (getLanguage() === 'gu' ? 'તમે પૂછી શકો છો: "આજના યુનિટ્સ કેટલા?" અથવા Keypad વાપરો' : 'Speak anytime or tap Keypad to type...')}
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
            <div className="pt-2 pb-2 px-4 z-10 flex flex-col items-center flex-shrink-0">
                {/* 6-Button Grid (2 rows of 3 buttons) */}
                <div className="grid grid-cols-3 gap-x-6 sm:gap-x-10 gap-y-2.5 sm:gap-y-3.5 max-w-[270px] sm:max-w-xs mb-3 sm:mb-5">
                    {/* 1. Mute */}
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={toggleMute}
                            className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isMuted
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                        </button>
                        <span className="text-[10px] sm:text-xs text-neutral-300 capitalize">{t('mute')}</span>
                    </div>

                    {/* 2. Keypad */}
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={() => {
                                setShowKeypad(!showKeypad);
                                setShowPrompts(false);
                                setShowInfo(false);
                            }}
                            className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                showKeypad
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            <Grid className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <span className="text-[10px] sm:text-xs text-neutral-300 capitalize">{t('keypad')}</span>
                    </div>

                    {/* 3. Speaker / Audio */}
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={toggleSpeaker}
                            className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isSpeakerOn
                                    ? 'bg-white text-black shadow-lg'
                                    : 'bg-white/12 text-neutral-400 hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            {isSpeakerOn ? <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />}
                        </button>
                        <span className="text-[10px] sm:text-xs text-neutral-300 capitalize">{t('speaker')}</span>
                    </div>

                    {/* 4. Quick Prompts */}
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={() => {
                                setShowPrompts(!showPrompts);
                                setShowKeypad(false);
                                setShowInfo(false);
                            }}
                            className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                showPrompts
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <span className="text-[10px] sm:text-xs text-neutral-300 capitalize">{t('prompts')}</span>
                    </div>

                    {/* 5. Audio Wave / Visualizer */}
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={() => {}}
                            className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-white/12 text-white hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
                        >
                            <Radio className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
                        </button>
                        <span className="text-[10px] sm:text-xs text-neutral-300 capitalize">{t('visualizer')}</span>
                    </div>

                    {/* 6. Plant Info */}
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={() => {
                                setShowInfo(!showInfo);
                                setShowKeypad(false);
                                setShowPrompts(false);
                            }}
                            className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                showInfo
                                    ? 'bg-white text-black shadow-lg scale-105'
                                    : 'bg-white/12 text-white hover:bg-white/20 active:scale-95'
                            }`}
                        >
                            <Info className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <span className="text-[10px] sm:text-xs text-neutral-300 capitalize">{t('info')}</span>
                    </div>
                </div>

                {/* Big Red Circular End Call Button (Classic iOS Hangup - Guaranteed Fully Visible) */}
                <button
                    onClick={endCall}
                    className="w-15 h-15 sm:w-17 sm:h-17 rounded-full bg-[#eb4e3d] hover:bg-[#ff5544] active:bg-[#c93b2c] flex items-center justify-center text-white shadow-xl shadow-red-600/40 transition-transform active:scale-90 cursor-pointer flex-shrink-0"
                    title={t('callEnd')}
                >
                    <PhoneOff className="w-7 h-7 sm:w-8 sm:h-8" />
                </button>
            </div>
        </div>
    );
}

function generateSmartLocalReply(text, lang, user, activeCompany) {
    const lower = (text || '').toLowerCase();
    const userName = user?.name || (lang === 'gu' ? 'સર' : 'Sir');
    const compName = activeCompany?.name || user?.company?.name || 'SolarFlow';

    // 0. Company Name
    if (lower.includes('કંપની') || lower.includes('company')) {
        return lang === 'gu'
            ? `આ ${compName} SolarFlow સિસ્ટમ છે.`
            : `This is ${compName} SolarFlow system.`;
    }

    // 1. Creator / Jay Sir
    if (lower.includes('jay') || lower.includes('જય') || lower.includes('કોણે') || lower.includes('who') || lower.includes('creator') || lower.includes('owner')) {
        return lang === 'gu'
            ? `આ ${compName} SolarFlow સોફ્ટવેર જય સર (Jay Sir) દ્વારા બનાવવામાં આવ્યું છે. હું તેમની AI સહાયક છું.`
            : `This ${compName} SolarFlow system is designed and created by Jay Sir. I am SolarFlow, his AI voice assistant.`;
    }

    // 2. Units / Generation
    if (lower.includes('unit') || lower.includes('યુનિટ') || lower.includes('generation') || lower.includes('ઉત્પાદન') || lower.includes('આજ')) {
        return lang === 'gu'
            ? `નમસ્તે ${userName}, આજના સોલાર પ્લાન્ટ પરથી ઉત્પાદન સામાન્ય રીતે ચાલુ છે અને બધા ઇન્વર્ટર કનેક્ટેડ છે.`
            : `Hello ${userName}, today's solar generation is operating normally across all connected inverters.`;
    }

    // 3. Curtailment / PGVCL
    if (lower.includes('curtail') || lower.includes('કર્ટલ') || lower.includes('pgvcl') || lower.includes('ઘટાડો') || lower.includes('ગ્રીડ')) {
        return lang === 'gu'
            ? 'હાલમાં પ્લાન્ટ પર કોઈ PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) નથી. ૧૦૦% ઉત્પાદન ચાલુ છે.'
            : 'There is currently no PGVCL power curtailment. All solar plants are running at full capacity.';
    }

    // 4. Attendance
    if (lower.includes('હાજર') || lower.includes('attendance') || lower.includes('કર્મચારી') || lower.includes('staff')) {
        return lang === 'gu'
            ? 'આજે સ્ટાફ સાઈટ પર હાજર છે અને સોલાર પ્લાન્ટની નિયમિત કામગીરી ચાલુ છે.'
            : 'Solar plant staff is present on site and operations are normal.';
    }

    // 5. Revenue
    if (lower.includes('આવક') || lower.includes('revenue') || lower.includes('રૂપિયા') || lower.includes('પૈસા') || lower.includes('rupee')) {
        return lang === 'gu'
            ? 'ચાલુ મહિનાની સોલાર આવક અને ઉત્પાદન લક્ષ્યાંક મુજબ ખૂબ જ સારું છે.'
            : 'Current month solar revenue and generation are progressing on track according to targets.';
    }

    // Default polite conversational greeting
    return lang === 'gu'
        ? `હા ${userName}, હું SolarFlow AI સહાયક છું. તમે આજના યુનિટ્સ, PGVCL સ્ટેટસ, સ્ટાફ હાજરી અથવા સોલાર આવક વિશે કંઈ પણ પૂછી શકો છો.`
        : `Yes ${userName}, I am SolarFlow AI Assistant. You can ask me about today's units, PGVCL curtailment, staff attendance, or solar revenue.`;
}
