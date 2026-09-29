import React, { useState } from "react";
import CatMascot from "./CatMascot";
import MolarAIFloat from "./MolarAIFloat";
import { SNABBB_SIGNUP_URL } from "../constants/authLinks";

export default function LoginView() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  const goToAuth = (path) => {
    window.location.assign(path);
  };

  const features = [
    {
      icon: "01",
      title: "Set your availability",
      description:
        "Enter services, working hours, buffers, blocked times, and calendar availability for your staff.",
    },
    {
      icon: "02",
      title: "Share your booking link",
      description:
        "Share your online appointment booking page through emails, texts, brochures, or your website.",
    },
    {
      icon: "03",
      title: "Accept bookings 24/7",
      description:
        "Let customers self-schedule, cancel, reschedule, and book recurring appointments at any time.",
    },
  ];

  const faqs = [
    {
      question: "What happens at the end of my trial?",
      answer:
        "Your account will be paused until you select a paid plan. No data will be lost.",
    },
    {
      question: "Can I use the app with multiple clinic locations?",
      answer:
        "Yes. Teams and Enterprise plans support multiple clinic locations.",
    },
    {
      question: "What does the onboarding process look like?",
      answer:
        "We provide guided setup and team training to help your clinic get started.",
    },
    {
      question: "How do I upgrade or downgrade?",
      answer:
        "You can change your plan at any time from your billing dashboard.",
    },
  ];

  return (
    <div className="appointment-landing">
      <nav className="appointment-nav">
        <a className="appointment-brand" href="/" aria-label="Snabbb Appointment">
          <img src="/assets/Snabbb (Teal).png" alt="Snabbb" />
          <span>Appointment</span>
        </a>

        <div className={`appointment-nav-links ${menuOpen ? "is-open" : ""}`}>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            Features
          </a>

          <a href="#pricing" onClick={() => setMenuOpen(false)}>
            Pricing
          </a>

          <a href="#faq" onClick={() => setMenuOpen(false)}>
            FAQ
          </a>

          <div className="appointment-mobile-actions">
            <button
              className="appointment-login"
              onClick={() => goToAuth("/login")}
            >
              Log In
            </button>

            <a
              className="appointment-mobile-signup"
              href={SNABBB_SIGNUP_URL}
            >
              Sign Up
            </a>
          </div>
        </div>

        <div className="appointment-nav-actions">
          <button
            className="appointment-login"
            onClick={() => goToAuth("/login")}
          >
            Log In
          </button>

          <a className="appointment-nav-cta" href={SNABBB_SIGNUP_URL}>
            Sign Up
          </a>
        </div>

        <button
          className="appointment-menu-button"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          ☰
        </button>
      </nav>

      <main>
        <section className="appointment-hero">
          <div className="appointment-hero-copy">
            <div className="appointment-eyebrow">
              <span className="appointment-live-dot" />
              APPOINTMENT MANAGEMENT
            </div>

            <h1>
              Online booking made simple, your appointments{" "}
              <em>sorted.</em>
            </h1>

            <p>
              With our simple online booking system, scheduling dental
              appointments has never been easier. Focus on your patients; we
              handle the workflow.
            </p>

            <div className="appointment-hero-actions">
              <a
                className="appointment-primary-button"
                href={SNABBB_SIGNUP_URL}
              >
                Get Started
              </a>

              <a className="appointment-secondary-button" href="#features">
                Learn More
              </a>
            </div>

            <div className="appointment-trust-row">
              <span>✓ Easy scheduling</span>
              <span>✓ Automated reminders</span>
              <span>✓ 24/7 online booking</span>
            </div>
          </div>

          <div className="appointment-hero-preview">
            <div className="appointment-preview-glow" />

            <div className="appointment-preview-card">
              <img
                className="appointment-avatar appointment-avatar-top"
                src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=100&q=80"
                alt="Doctor"
              />

              <img
                className="appointment-avatar appointment-avatar-bottom"
                src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=100&q=80"
                alt="Doctor"
              />

              <span className="appointment-confirmed">Confirmed</span>

              <p className="appointment-preview-subtitle">
                You are scheduled with Dr. Sarah
              </p>

              <div className="appointment-preview-body">
                <h3>Dental Checkup</h3>
                <p>30 Minute Meeting</p>
                <strong>10:30am - 11:00am</strong>
                <p>Tuesday, March 24, 2026</p>
              </div>

              <div className="appointment-preview-dots">
                <span>G</span>
                <span>D</span>
                <span>▲</span>
                <span>git</span>
              </div>
            </div>
          </div>
        </section>

        <section className="appointment-stat-strip">
          <div>
            <strong>24/7</strong>
            <span>Online booking</span>
          </div>

          <div>
            <strong>10k+</strong>
            <span>Reviews</span>
          </div>

          <div>
            <strong>30 sec</strong>
            <span>To book an appointment</span>
          </div>

          <div>
            <strong>100%</strong>
            <span>Clinic focused</span>
          </div>
        </section>

        <section
          id="features"
          className="appointment-section appointment-features"
        >
          <div className="appointment-section-heading">
            <span className="appointment-section-label">Features</span>

            <h2>Online appointment booking made simple.</h2>

            <p>
              Everything your clinic needs to organize appointments and give
              patients a smoother booking experience.
            </p>
          </div>

          <div className="appointment-feature-grid">
            {features.map((feature) => (
              <article
                className="appointment-feature-card"
                key={feature.title}
              >
                <div className="appointment-feature-icon">
                  {feature.icon}
                </div>

                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* <section
          id="pricing"
          className="appointment-section appointment-pricing"
        >
          <div className="appointment-section-heading">
            <span className="appointment-section-label">Pricing</span>

            <h2>Choose the plan that fits your clinic.</h2>

            <p>
              Start managing your appointments with a simple and transparent
              subscription.
            </p>
          </div>

          <div className="appointment-pricing-grid">
            <article className="appointment-price-card">
              <h3>Monthly</h3>
              <p>Pay as you go, cancel anytime.</p>

              <div className="appointment-price">
                $39<span>/ month</span>
              </div>

              <a href={SNABBB_SIGNUP_URL}>Get Started</a>

              <ul>
                <li>✓ Uncapped appointments</li>
                <li>✓ Custom domain integration</li>
                <li>✓ Automated SMS reminders</li>
                <li>✓ Standard email support</li>
              </ul>
            </article>

            <article className="appointment-price-card appointment-price-featured">
              <div className="appointment-price-badge">
                Best Value - Save 50%
              </div>

              <h3>Annually</h3>
              <p>Commit for a year and save big.</p>

              <div className="appointment-price">
                $234<span>/ year</span>
              </div>

              <a href={SNABBB_SIGNUP_URL}>Get Started</a>

              <ul>
                <li>✓ Everything in Monthly</li>
                <li>✓ Priority 24/7 support</li>
                <li>✓ Advanced real-time analytics</li>
                <li>✓ Multi-location management</li>
              </ul>
            </article>
          </div>
        </section> */}

        <section id="faq" className="appointment-section appointment-faq">
          <div className="appointment-section-heading">
            <span className="appointment-section-label">FAQ</span>

            <h2>Frequently asked questions.</h2>

            <p>
              Find answers to common questions about appointment scheduling.
            </p>
          </div>

          <div className="appointment-faq-list">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;

              return (
                <div
                  className={`appointment-faq-item ${
                    isOpen ? "open" : ""
                  }`}
                  key={faq.question}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setActiveFaq(isOpen ? null : index)
                    }
                  >
                    {faq.question}
                    <span>{isOpen ? "−" : "+"}</span>
                  </button>

                  {isOpen && (
                    <div className="appointment-faq-answer">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="appointment-final-cta">
          <div>
            <span className="appointment-section-label">GET STARTED</span>

            <h2>Easy access for easy bookings.</h2>

            <p>
              Deliver a better booking experience and take your clinic’s
              workflow to the next level.
            </p>
          </div>

          <a
            className="appointment-primary-button appointment-light-button"
            href={SNABBB_SIGNUP_URL}
          >
            Get Started Now
          </a>
        </section>
      </main>

      <footer className="appointment-footer">
        <p>
          © 2026 Snabbb Appointment. Smart scheduling for modern clinics.
        </p>

        <div className="appointment-footer-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
      </footer>

      <CatMascot disabled={true} />
      <MolarAIFloat disabled={true} />
    </div>
  );
}