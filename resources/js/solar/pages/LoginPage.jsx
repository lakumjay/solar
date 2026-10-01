import React, {useState} from 'react';
import {ArrowRight, BarChart3, Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, Sun, Zap} from 'lucide-react';
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
            setError(exception.message);
        } finally {
            setBusy(false);
        }
    };

    return <main className="login">
        <section className="login-hero">
            <div className="login-glow login-glow-one"/><div className="login-glow login-glow-two"/>
            <div className="login-brand"><span><Sun/></span><b>SolarFlow</b></div>
            <div className="login-hero-content">
                <div className="login-kicker"><Sparkles size={14}/> Solar operations, refined</div>
                <h1>Powerful clarity<br/>for every <em>watt.</em></h1>
                <p>One calm, connected workspace for readings, performance, people and the decisions that keep your solar operations moving.</p>
                <div className="login-feature-list">{FEATURES.map(([Icon, title, detail]) => <div key={title}><span><Icon/></span><div><b>{title}</b><small>{detail}</small></div></div>)}</div>
            </div>
            <div className="login-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring-one"/><div className="orbit-ring orbit-ring-two"/><span><Sun/></span><i/><b/></div>
            <div className="login-hero-footer"><span><Zap size={14}/> Built for modern solar teams</span><small>Secure · Precise · Always connected</small></div>
        </section>

        <section className="login-side">
            <div className="login-mobile-brand"><span><Sun/></span><b>SolarFlow</b></div>
            <form className="login-card" onSubmit={submit}>
                <div className="login-card-top"><div className="login-mark"><Sun/></div><span><ShieldCheck size={14}/> Secure workspace</span></div>
                <div className="login-heading"><p>Welcome back</p><h2>Sign in to SolarFlow</h2><small>Enter your authorized account details to continue.</small></div>

                <label className="login-field"><span>Email address</span><div><Mail size={18}/><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="username" required autoFocus/></div></label>
                <label className="login-field"><span>Password</span><div><LockKeyhole size={18}/><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>

                {error && <div className="error login-error" role="alert" aria-live="polite">{error}</div>}
                <button className="login-submit" disabled={busy}><span>{busy ? 'Signing in…' : 'Sign in securely'}</span><ArrowRight size={18}/></button>
                <div className="login-assurance"><ShieldCheck size={15}/><span>Your session and account access are securely protected.</span></div>
            </form>
            <p className="login-copyright">© {new Date().getFullYear()} SolarFlow. Solar operations, beautifully organized.</p>
        </section>
    </main>;
}
