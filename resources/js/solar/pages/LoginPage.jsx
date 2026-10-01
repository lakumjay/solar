import React, {useState} from 'react';
import {Sun} from 'lucide-react';
import {api} from '../api';

export default function LoginPage({onLogin}) {
    const [email, setEmail] = useState('admin@solar.local');
    const [password, setPassword] = useState('password');
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
        <section className="login-hero"><div className="brand"><span><Sun/></span> SolarFlow</div><div><p className="eyebrow light">SOLAR OPERATIONS</p><h1>Every reading.<br/>One clear view.</h1><p>Monitor generation, calculate meter units and review every company from one secure workspace.</p></div><small>Built for daily solar plant operations</small></section>
        <section className="login-side"><form onSubmit={submit}><div className="login-mark"><Sun/></div><h2>Welcome back</h2><p>Sign in to continue to your workspace.</p><label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoFocus/></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required/></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><div className="demo"><b>Initial Super Admin</b><span>admin@solar.local / password</span></div></form></section>
    </main>;
}
