export default function AuthShell({ children }) {
  return <div className="auth-page"><main className="auth-card">{children}</main></div>;
}

export function AuthLogo() {
  return <a href="https://app.snabbb.com/" className="auth-logo" title="Go to Snabbb Home"><img src="/assets/Snabbb (Teal).png" alt="Snabbb" /></a>;
}

export function AuthField({ label, icon, help, children }) {
  return <div className="auth-field"><label className="auth-label">{label}</label><div className="auth-control">{icon}{children}</div>{help && <p className="auth-help">{help}</p>}</div>;
}
