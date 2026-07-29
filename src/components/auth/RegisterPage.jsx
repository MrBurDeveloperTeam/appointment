import { useState } from 'react';
import { Building2, BriefcaseBusiness, ChevronDown, Globe2, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { signUp } from '../../auth/authApi';
import { useToast } from '../../context/ToastProvider';
import { COUNTRIES, DENTAL_POSITIONS } from '../../constants/signupOptions';
import AuthShell, { AuthField, AuthLogo } from './AuthShell';
import DOBPicker from './DOBPicker';

const icon = (Icon) => <Icon className="auth-field-icon" />;

export default function RegisterPage() {
  const { addToast } = useToast();
  const [accountType, setAccountType] = useState('individual');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [position, setPosition] = useState('');
  const [customPosition, setCustomPosition] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const company = accountType === 'company';

  async function handleSubmit(event) {
    event.preventDefault();
    const effectivePosition = position === 'OTHER' ? customPosition.trim() : position;
    if (password !== confirmPassword) return addToast('Passwords do not match.', 'error');
    if (!name.trim() || !email.trim() || !phone.trim() || !dob || !effectivePosition || !country) return addToast('Please complete all required fields.', 'error');
    if (company && !companyName.trim()) return addToast('Please enter your company name.', 'error');
    if (!agreedToTerms) return addToast('You must agree to the Terms of Service, Privacy Policy and Disclaimer.', 'error');

    setLoading(true);
    try {
      const result = await signUp({ email, password, fullName: name, accountType, companyName, phone, position: effectivePosition, dob, country, agreedToTerms });
      addToast(result?.session ? 'Your account has been created.' : 'Sign up successful. Please check your email to confirm your account.', 'success');
      window.location.assign(result?.session ? '/' : '/login');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Registration failed.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell>
    <header className="auth-header"><AuthLogo /><h1>Create Account</h1><p>Build your dental skills and advance your clinical career.</p></header>
    <p className="auth-label">Account Type</p>
    <div className="auth-account-types"><button type="button" onClick={() => setAccountType('individual')} className={!company ? 'active' : ''}><User size={16} />Individual</button><button type="button" onClick={() => setAccountType('company')} className={company ? 'active' : ''}><Building2 size={16} />Company</button></div>
    <form onSubmit={handleSubmit} className="auth-form">
      {company && <AuthField label="Company Name" icon={icon(Building2)}><input className="auth-input" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="e.g. DENTA TECH" required /></AuthField>}
      {company && <AuthField label="Company Email" icon={icon(Mail)}><input type="email" className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="e.g. hello@denta.tech" required /></AuthField>}
      <AuthField label={company ? 'Name' : 'Your Name'} icon={icon(User)}><input className="auth-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={company ? 'Contact Name' : 'e.g. Nour AYACHE'} required autoComplete="name" /></AuthField>
      {!company && <AuthField label="Your Email" icon={icon(Mail)} help="This will be your login email."><input type="email" className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="e.g. nur@email.com" required autoComplete="email" /></AuthField>}
      <AuthField label={company ? 'Phone' : 'Phone (WhatsApp)'} icon={icon(Phone)}><input type="tel" className="auth-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. +60123456789" required autoComplete="tel" /></AuthField>
      <div className="auth-field"><label className="auth-label">Date of Birth</label><DOBPicker value={dob} onChange={setDob} />{company && <p className="auth-help">Date of birth of the company representative.</p>}</div>
      <AuthField label="Job Position" icon={icon(BriefcaseBusiness)}><span className="auth-select-wrap"><select className="auth-input" value={position} onChange={(event) => setPosition(event.target.value)} required><option value="">-- Select Position --</option>{DENTAL_POSITIONS.map((item) => <option key={item}>{item}</option>)}<option value="OTHER">Other</option></select><ChevronDown className="auth-chevron" /></span></AuthField>
      {position === 'OTHER' && <AuthField label="Specify Position" icon={icon(BriefcaseBusiness)}><input className="auth-input" value={customPosition} onChange={(event) => setCustomPosition(event.target.value)} placeholder="e.g. Clinic Manager" required /></AuthField>}
      <AuthField label="Country" icon={icon(Globe2)}><span className="auth-select-wrap"><select className="auth-input" value={country} onChange={(event) => setCountry(event.target.value)} required><option value="">-- Select Country --</option>{COUNTRIES.map(([code, countryName]) => <option key={code} value={code}>{countryName}</option>)}</select><ChevronDown className="auth-chevron" /></span></AuthField>
      <AuthField label="Password" icon={icon(ShieldCheck)}><input type="password" className="auth-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" /></AuthField>
      <AuthField label="Confirm Password" icon={icon(ShieldCheck)}><input type="password" className="auth-input" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" /></AuthField>
      <label className="auth-terms"><input type="checkbox" checked={agreedToTerms} onChange={(event) => setAgreedToTerms(event.target.checked)} required /><span>I agree to the <a href="https://app.snabbb.com/terms" target="_blank" rel="noreferrer">Terms of Service</a>, <a href="https://app.snabbb.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a href="https://app.snabbb.com/disclaimer" target="_blank" rel="noreferrer">Disclaimer</a>.</span></label>
      <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Signing up…' : 'Sign up'}</button>
    </form>
    <p className="auth-switch">Already have an account? <a href="/login">Log in</a></p>
  </AuthShell>;
}
