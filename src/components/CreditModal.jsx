import React from 'react';
import Modal from './Modal';

export default function CreditModal({ onClose, subscriptionEnd, disableClose = false }) {
    const handleSubscribe = (plan) => {
        alert(`Redirecting to checkout for ${plan} plan...`);
        if (!disableClose) {
            onClose();
        }
    };

    const endDateText = subscriptionEnd ? new Date(subscriptionEnd).toLocaleDateString() : 'Active / Free';

    return (
        <Modal
            title={disableClose ? "Subscription Expired" : "Choose Your Subscription Plan"}
            onClose={onClose}
            disableClose={disableClose}
        >
            <div className="modal-body" style={{ minHeight: '300px', padding: '1.5rem', background: '#f8fafc' }}>
                <div className="landing-pricing-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold', margin: 0 }}>
                        {disableClose
                            ? "Please renew your subscription to continue using the clinic app."
                            : "Upgrade your clinic's workflow today."}
                    </h2>
                    <div style={{
                        background: '#fee2e2',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        color: '#991b1b',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        border: '1px solid #fca5a5'
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        Subscription status: <span style={{ color: '#ef4444' }}>{endDateText}</span>
                    </div>
                </div>

                <div className="landing-pricing-grid two-cols" style={{ gap: '1rem' }}>
                    {/* Monthly Plan */}
                    <div className="landing-price-card" style={{ transform: 'none', background: '#fff', padding: '1.5rem', animation: 'none', opacity: 1, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Monthly</h3>
                        <p className="price-desc" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Pay as you go, cancel anytime.</p>
                        <div className="landing-price-amount" style={{ fontSize: '2rem', marginBottom: '1rem' }}>$39<span style={{ fontSize: '0.9rem' }}>/ mo</span></div>
                        <button className="landing-price-btn" style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }} onClick={() => handleSubscribe('Monthly')}>Subscribe Monthly</button>
                        <ul className="landing-price-features" style={{ fontSize: '0.8rem', marginTop: '1rem', gap: '0.5rem' }}>
                            <li><span className="landing-check-icon">✓</span> Uncapped appointments</li>
                            <li><span className="landing-check-icon">✓</span> Custom domain integration</li>
                            <li><span className="landing-check-icon">✓</span> Automated SMS reminders</li>
                            <li><span className="landing-check-icon">✓</span> Standard email support</li>
                        </ul>
                    </div>

                    {/* Annual Plan (Featured) */}
                    <div className="landing-price-card featured" style={{ transform: 'none', padding: '1.5rem', animation: 'none', opacity: 1 }}>
                        <div className="landing-price-badge" style={{ fontSize: '0.7rem', padding: '0.2rem 0.8rem', top: '-10px' }}>Best Value - Save 50%</div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Annually</h3>
                        <p className="price-desc" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Commit for a year and save big.</p>
                        <div className="landing-price-amount" style={{ fontSize: '2rem', marginBottom: '1rem' }}>$234<span style={{ fontSize: '0.9rem' }}>/ yr</span></div>
                        <button className="landing-price-btn" style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }} onClick={() => handleSubscribe('Annual')}>Subscribe Annually</button>
                        <ul className="landing-price-features" style={{ fontSize: '0.8rem', marginTop: '1rem', gap: '0.5rem' }}>
                            <li><span className="landing-check-icon">✓</span> Everything in Monthly</li>
                            <li><span className="landing-check-icon">✓</span> Priority 24/7 support</li>
                            <li><span className="landing-check-icon">✓</span> Advanced real-time analytics</li>
                            <li><span className="landing-check-icon">✓</span> Multi-location management</li>
                        </ul>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
