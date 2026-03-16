import React, { useState, useEffect } from "react";
import { signIn, signUp } from '../auth/authApi';
import { useToast } from '../context/ToastProvider';

export default function LoginView() {
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authFullName, setAuthFullName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);

  // 3D Carousel State
  const [activeFeature, setActiveFeature] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 3);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const handleNextFeature = () => setActiveFeature((prev) => (prev + 1) % 3);
  const handlePrevFeature = () => setActiveFeature((prev) => (prev - 1 + 3) % 3);

  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("remember_email");
    if (savedEmail) {
      setAuthEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Toggle FAQ accordion
  const [activeFaq, setActiveFaq] = useState(null);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    { q: "What happens at the end of my trial?", a: "Your account will be paused until you select a paid plan. No data will be lost." },
    { q: "Can I use the app with multiple clinic locations?", a: "Yes! Our Teams and Enterprise plans support multi-location management from a single dashboard." },
    { q: "What does the onboarding process look like?", a: "We provide guided setup and 1-on-1 team training to get your clinic running smoothly in under 48 hours." },
    { q: "How do I upgrade or downgrade?", a: "You can change your plan at any time from your billing dashboard. Changes are prorated automatically." },
    { q: "What payment methods do you accept?", a: "We accept all major credit cards including Visa, Mastercard, and American Express." }
  ];

  const handleSupabaseSubmit = async (event) => {
    event.preventDefault();
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        await signUp({ email: authEmail, password: authPassword, fullName: authFullName });
        addToast('Registration successful! Please verify your email to login.', 'success');
        setAuthMode('login');
        setAuthPassword('');  // Clear password for security
      } else {
        if (rememberMe) {
          localStorage.setItem("remember_email", authEmail);
        } else {
          localStorage.removeItem("remember_email");
        }
        await signIn({ email: authEmail, password: authPassword });
      }
    } catch (err) {
      setAuthError(err.message);
      addToast(err.message, 'error');
    }
  };

  const openLogin = () => {
    setAuthMode('login');
    const savedEmail = localStorage.getItem("remember_email");
    if (savedEmail) {
      setAuthEmail(savedEmail);
      setRememberMe(true);
    } else {
      setAuthEmail('');
      setRememberMe(false);
    }
    setAuthPassword('');
    setShowForm(true);
  };

  const openSignup = () => {
    setAuthMode('signup');
    setAuthEmail('');
    setAuthPassword('');
    setAuthFullName('');
    setRememberMe(false);
    setShowForm(true);
  };

  return (
    <div className="landing-fullscreen-container">

      {/* NAVBAR */}
      <nav className="landing-navbar">
        <div
          className="landing-nav-logo"
          onClick={() => window.open('https://app.snabbb.com/', '_self')}
          style={{ cursor: 'pointer' }}
        >
          <img src="/assets/Snabbb (Teal).png" alt="Snabbb Logo" />
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="landing-nav-actions">
          <button className="landing-btn-outline" onClick={openLogin}>Log In</button>
          <button className="landing-btn-primary" onClick={openSignup}>Get Started</button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <span>EXCELLENT</span>
            ⭐⭐⭐⭐⭐ 4.9/5 based on 10k+ reviews
          </div>
          <h1>Online Booking Made Simple, Your Appointments <span>Sorted.</span></h1>
          <p>
            With our simple online booking system, scheduling dental appointments has never been easier. Focus on your patients, we handle the workflow.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-btn-primary" onClick={openSignup}>Get Started</button>
            <button className="landing-btn-secondary" onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}>
              Learn More →
            </button>
          </div>
        </div>

        <div className="landing-hero-visuals">
          <div className="landing-mockup-card">
            <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=100&q=80" alt="Doctor" className="landing-mockup-avatar top-left" />
            <img src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=100&q=80" alt="Doctor" className="landing-mockup-avatar bottom-right" />

            <div className="landing-mockup-header">
              <span className="landing-mockup-badge">Confirmed</span>
              <p>You are scheduled with Dr. Sarah</p>
            </div>

            <div className="landing-mockup-body">
              <h4>Dental Checkup</h4>
              <p>30 Minute Meeting</p>
              <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>10:30am - 11:00am</p>
              <p>Tuesday, March 24, 2026</p>
            </div>

            <div className="landing-mockup-integrations">
              <div className="landing-integration-dot" style={{ color: '#ea4335' }}>G</div>
              <div className="landing-integration-dot" style={{ color: '#0061ff' }}>D</div>
              <div className="landing-integration-dot" style={{ color: '#0070f3' }}>▲</div>
              <div className="landing-integration-dot" style={{ color: '#24292e' }}>git</div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BRANDS */}
      <section className="landing-brands">
        <div className="landing-brand">Scheduled</div>
        <div className="landing-brand">Email</div>
        <div className="landing-brand">Customize</div>
        <div className="landing-brand">User Friendly</div>
        <div className="landing-brand">Affordable</div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="landing-features">
        <div className="landing-section-tag">Features</div>
        <h2>Online Appointment Booking Made Simple</h2>

        <div className="landing-features-carousel-container">
          <button className="landing-carousel-btn left" onClick={handlePrevFeature}>&#8592;</button>
          <div className="landing-features-grid">
            {[
              {
                icon: '🕒',
                title: 'Set your availability, Simple and Flexible',
                desc: 'Simply enter the available services and working hours for you and your staff so your booking page is live, ready. Add buffers, block times, or integrate multiple calendars.'
              },
              {
                icon: '🔗',
                title: 'Share your link with your Customer',
                desc: 'Share your online appointment booking page URL with your customer in emails, texts, brochures, etc. Start appointments by placing our widget on your site.'
              },
              {
                icon: '📱',
                title: 'Accept online booking hassle free 24/7',
                desc: 'Give customers the convenience to self-schedule, cancel, reschedule and book recurring appointments using our 24/7 online booking software. Send automated SMS/Emails.'
              }
            ].map((feature, index) => {
              // Calculate relative position: 0 (front), 1 (right/back), 2 (left/back)
              const offset = (index - activeFeature + 3) % 3;
              let transformStyle = '';
              let opacity = 1;
              let zIndex = 3;

              if (offset === 0) {
                // Front active
                transformStyle = 'translateZ(0px) translateY(0) rotateX(0deg)';
                opacity = 1;
                zIndex = 3;
              } else if (offset === 1) {
                // Right back path
                transformStyle = 'translateZ(-150px) translateY(-60px) rotateX(8deg)';
                opacity = 0.5;
                zIndex = 2;
              } else if (offset === 2) {
                // Left deeper back path
                transformStyle = 'translateZ(-300px) translateY(40px) rotateX(-8deg)';
                opacity = 0;
                zIndex = 1;
              }

              return (
                <div
                  key={index}
                  className={`landing-feature-card ${offset === 0 ? 'active' : ''}`}
                  style={{
                    transform: transformStyle,
                    opacity: opacity,
                    zIndex: zIndex,
                    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <div className="landing-feature-icon-wrapper" style={index === 1 ? { background: '#eff6ff', color: '#3b82f6' } : {}}>
                    {feature.icon}
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.desc}</p>
                </div>
              );
            })}
          </div>
          <button className="landing-carousel-btn right" onClick={handleNextFeature}>&#8594;</button>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="pricing" className="landing-pricing">
        <div className="landing-pricing-header">
          <h2>Your Digital Partner for Success in a Virtual World.</h2>
        </div>

        <div className="landing-pricing-grid two-cols">
          {/* Monthly Plan */}
          <div className="landing-price-card">
            <h3>Monthly</h3>
            <p className="price-desc">Pay as you go, cancel anytime.</p>
            <div className="landing-price-amount">$39<span>/ mo</span></div>
            <button className="landing-price-btn" onClick={openSignup}>Get Started</button>
            <ul className="landing-price-features">
              <li><span className="landing-check-icon">✓</span> Uncapped appointments</li>
              <li><span className="landing-check-icon">✓</span> Custom domain integration</li>
              <li><span className="landing-check-icon">✓</span> Automated SMS reminders</li>
              <li><span className="landing-check-icon">✓</span> Standard email support</li>
            </ul>
          </div>

          {/* Annual Plan (Featured) */}
          <div className="landing-price-card featured">
            <div className="landing-price-badge">Best Value - Save 50%</div>
            <h3>Annually</h3>
            <p className="price-desc">Commit for a year and save big on your clinic.</p>
            <div className="landing-price-amount">$234<span>/ yr</span></div>
            <button className="landing-price-btn" onClick={openSignup}>Get Started</button>
            <ul className="landing-price-features">
              <li><span className="landing-check-icon">✓</span> Everything in Monthly</li>
              <li><span className="landing-check-icon">✓</span> Priority 24/7 support</li>
              <li><span className="landing-check-icon">✓</span> Advanced real-time analytics</li>
              <li><span className="landing-check-icon">✓</span> Multi-location management</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="landing-faq">
        <div className="landing-faq-header">
          <div className="landing-section-tag">FAQ</div>
          <h2>Frequently Asked Questions</h2>
        </div>
        <div className="landing-faq-list">
          {faqs.map((faq, index) => (
            <div key={index} className={`landing-faq-item ${activeFaq === index ? 'active' : ''}`}>
              <div className="landing-faq-question" onClick={() => toggleFaq(index)}>
                {faq.q} <span>{activeFaq === index ? '−' : '+'}</span>
              </div>
              <div className="landing-faq-answer">
                {faq.a}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="landing-footer-cta">
        <div className="landing-cta-box">
          <h2>Easy Access for Easy Bookings.</h2>
          <p>Deliver the best booking experience today and take your clinic's workflow to the next level.</p>
          <button className="landing-btn-white" onClick={openSignup}>Get Started Now</button>
        </div>
      </section>

      {/* FOOTER DIRECTORY */}
      <footer className="landing-footer">
        <div className="landing-footer-col">
          <img src="/assets/Snabbb (White).png" alt="Snabbb Logo" style={{ height: '32px', marginBottom: '1rem' }} />
          <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '250px' }}>
            Empowering clinics worldwide with smart, easy-to-use scheduling software.
          </p>
        </div>
        <div className="landing-footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="#">Features</a></li>
            <li><a href="#">Pricing</a></li>
            <li><a href="#">Integrations</a></li>
            <li><a href="#">Changelog</a></li>
          </ul>
        </div>
        <div className="landing-footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="#">About Us</a></li>
            <li><a href="#">Careers</a></li>
            <li><a href="#">Customers</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </div>
        <div className="landing-footer-col">
          <h4>Resource</h4>
          <ul>
            <li><a href="#">Blog</a></li>
            <li><a href="#">Help Center</a></li>
            <li><a href="#">Community</a></li>
            <li><a href="#">Guides</a></li>
          </ul>
        </div>
        <div className="landing-footer-col">
          <h4>Download</h4>
          <ul>
            <li><a href="#">iOS App</a></li>
            <li><a href="#">Android App</a></li>
            <li><a href="#">Desktop App</a></li>
          </ul>
        </div>
      </footer>

      {/* MODAL OVERLAY (LOGIN / SIGNUP) */}
      {showForm && (
        <div className="landing-modal-overlay">
          <div className="landing-login-card" onClick={(e) => e.stopPropagation()}>
            <button className="landing-modal-close" onClick={() => setShowForm(false)}>×</button>
            <div className="landing-login-content">
              <div className="landing-login-header">
                <img src="/assets/Snabbb (Teal).png" alt="Snabbb Logo" className="landing-login-logo" />
                <h2>{authMode === 'login' ? 'Welcome back' : 'Create Account'}</h2>
                <p>
                  {authMode === 'login' ? 'Sign in to access your dashboard' : 'Sign up to get started today'}
                </p>
              </div>

              <form onSubmit={handleSupabaseSubmit}>
                {authMode === 'signup' && (
                  <div className="landing-form-group">
                    <label>Full Name</label>
                    <input
                      className="landing-form-input"
                      id="fullName"
                      name="fullName"
                      autoComplete="name"
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      placeholder="John Doe"
                      required
                    />
                  </div>
                )}
                <div className="landing-form-group">
                  <label>Email</label>
                  <input
                    className="landing-form-input"
                    id="email"
                    name="email"
                    autoComplete="email"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@clinic.com"
                    required
                  />
                </div>

                <div className="landing-form-group">
                  <div className="landing-form-options">
                    <label style={{ margin: 0 }}>Password</label>
                    {authMode === 'login' && (
                      <a href="#" className="landing-forgot-link" onClick={(e) => e.preventDefault()}>
                        Forgot password?
                      </a>
                    )}
                  </div>
                  <input
                    className="landing-form-input"
                    id="password"
                    name="password"
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>

                {authMode === 'login' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{ margin: 0, cursor: 'pointer', width: 'auto', height: 'auto' }}
                    />
                    <label htmlFor="rememberMe" style={{ margin: 0, fontWeight: 'normal', fontSize: '0.9rem', cursor: 'pointer', color: '#475569' }}>
                      Remember me
                    </label>
                  </div>
                )}

                {authError && <div className="landing-form-error">{authError}</div>}

                <button className="landing-submit-btn" type="submit">
                  {authMode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </form>

              {authMode === 'login' && (
                <div className="landing-sample-accounts" style={{ marginTop: '1.5rem' }}>
                  <strong>Demo Access:</strong>
                  <div>Dentist: mrbur123@gmail.com / mrbur@123</div>
                  <div>Admin: adminbur@gmail.com / bur@123</div>
                </div>
              )}

              <div className="landing-switch-mode" style={{ marginTop: '2rem' }}>
                {authMode === 'login' ? (
                  <>Don't have an account? <button type="button" onClick={openSignup}>Sign up</button></>
                ) : (
                  <>Already have an account? <button type="button" onClick={openLogin}>Log in</button></>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
