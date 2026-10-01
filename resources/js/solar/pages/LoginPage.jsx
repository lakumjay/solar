import React, {useState} from 'react';
import {ArrowRight, BarChart3, Building2, Eye, EyeOff, LockKeyhole, Mail, RefreshCw, ShieldCheck, Sparkles, Sun, Zap} from 'lucide-react';
import {api} from '../api';

const FEATURES = [
    [BarChart3, 'Live meter intelligence', 'Turn daily readings into clear operational insight.'],
    [Building2, 'One connected workspace', 'Manage companies, people and reports together.'],
    [ShieldCheck, 'Role-based access', 'Keep every user focused on the right information.'],
];

export default function LoginPage({onLogin}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await onLogin(await api('login', {method: 'POST', body: JSON.stringify({email, password})}));
        } catch (exception) {
            setError(exception.message || 'Login failed. Please check your credentials.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="login">
            {/* Desktop Hero Visual Section */}
            <section className="login-hero">
                <div className="login-glow login-glow-one"/>
                <div className="login-glow login-glow-two"/>
                
                <div className="login-brand">
                    <span><Sun size={22}/></span>
                    <b>SolarFlow</b>
                </div>

                <div className="login-hero-content">
                    <div className="login-kicker">
                        <Sparkles size={14}/> Solar operations, refined
                    </div>
                    <h1>
                        Powerful clarity<br/>for every <em>watt.</em>
                    </h1>
                    <p>
                        One calm, connected workspace for readings, performance, people and the decisions that keep your solar operations moving.
                    </p>
                    <div className="login-feature-list">
                        {FEATURES.map(([Icon, title, detail]) => (
                            <div key={title}>
                                <span><Icon size={18}/></span>
                                <div>
                                    <b>{title}</b>
                                    <small>{detail}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="login-orbit" aria-hidden="true">
                    <div className="orbit-ring orbit-ring-one"/>
                    <div className="orbit-ring orbit-ring-two"/>
                    <span><Sun size={28}/></span>
                    <i/>
                    <b/>
                </div>

                <div className="login-hero-footer">
                    <span><Zap size={14}/> Built for modern solar teams</span>
                    <small>Secure · Precise · Always connected</small>
                </div>
            </section>

            {/* Login Form Side */}
            <section className="login-side">
                <div className="login-mobile-brand">
                    <span><Sun size={22}/></span>
                    <b>SolarFlow</b>
                </div>

                <form className="login-card" onSubmit={submit}>
                    <div className="login-card-top">
                        <div className="login-mark">
                            <Sun size={24}/>
                        </div>
                        <span>
                            <ShieldCheck size={14}/> Secure Portal
                        </span>
                    </div>

                    <div className="login-heading">
                        <p>Welcome back</p>
                        <h2>Sign in to SolarFlow</h2>
                        <small>Enter your authorized account credentials to continue.</small>
                    </div>

                    <div className="login-field-group">
                        <label className="login-field-label" htmlFor="login-email">
                            Email address
                        </label>
                        <div className="login-input-wrap">
                            <Mail size={18} className="login-input-icon"/>
                            <input
                                id="login-email"
                                type="email"
                                value={email}
                                onChange={event => setEmail(event.target.value)}
                                placeholder="name@company.com"
                                autoComplete="username"
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="login-field-group">
                        <label className="login-field-label" htmlFor="login-password">
                            Password
                        </label>
                        <div className="login-input-wrap">
                            <LockKeyhole size={18} className="login-input-icon"/>
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                className="login-eye-btn"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowPassword(prev => !prev);
                                }}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="error login-error" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="login-submit" disabled={busy}>
                        {busy ? (
                            <>
                                <RefreshCw size={18} className="spin"/>
                                <span>Signing in securely…</span>
                            </>
                        ) : (
                            <>
                                <span>Sign in securely</span>
                                <ArrowRight size={18}/>
                            </>
                        )}
                    </button>

                    <div className="login-assurance">
                        <ShieldCheck size={14}/>
                        <span>Your session and account access are securely protected.</span>
                    </div>
                </form>

                <p className="login-copyright">
                    © {new Date().getFullYear()} SolarFlow. Solar operations, beautifully organized.
                </p>
            </section>
        </main>
    );
}
