import { useEffect, useState } from 'react';
import { signIn } from '../../auth/authApi';
import { useToast } from '../../context/ToastProvider';
import AuthShell, { AuthLogo } from './AuthShell';

export default function LoginPage() {
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    const savedEmail = localStorage.getItem('remember_email');
    if (savedEmail) setEmail(savedEmail);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      if (rememberMe) localStorage.setItem('remember_email', email.trim());
      else localStorage.removeItem('remember_email');
      await signIn({ email: email.trim(), password });
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell centered>
    <header className="auth-header"><AuthLogo /><h1>Welcome Back</h1></header>
    <form onSubmit={handleSubmit} className="auth-form">
      <div className="auth-field"><label htmlFor="login-email" className="auth-label">Email</label><input id="login-email" className="auth-input auth-input-plain" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>
      <div className="auth-field"><div className="auth-label-row"><label htmlFor="login-password" className="auth-label">Password</label><button type="button" onClick={() => addToast('Password reset is not implemented yet.', 'info')}>Forgot Password?</button></div><input id="login-password" className="auth-input auth-input-plain" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></div>
      <label className="auth-checkbox"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
      <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Logging in…' : 'Log in'}</button>
    </form>
    <p className="auth-switch"><a href="/register">Don't have an account? Sign Up</a></p>
  </AuthShell>;
}
