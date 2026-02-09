import { useState } from 'react';
import Modal from './Modal';
import { format } from 'date-fns';

export default function CreditModal({ onClose, credits, history, onRedeem, loading }) {
    const [code, setCode] = useState('');
    const [activeTab, setActiveTab] = useState('topup'); // 'topup' | 'history'

    const handleRedeem = (e) => {
        e.preventDefault();
        if (!code.trim() || loading) return;
        onRedeem(code);
        setCode('');
    };

    return (
        <Modal title="Manage Credits" onClose={onClose}>
            <div className="modal-body" style={{ minHeight: '300px' }}>

                {/* Balance Header */}
                <div style={{
                    textAlign: 'center',
                    padding: '24px 0',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    marginBottom: '24px'
                }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>CURRENT BALANCE</div>
                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                        {credits}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>available credits</div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('topup')}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'topup' ? '2px solid var(--primary-color)' : '2px solid transparent',
                            color: activeTab === 'topup' ? 'var(--primary-color)' : 'var(--text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Top Up
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'history' ? '2px solid var(--primary-color)' : '2px solid transparent',
                            color: activeTab === 'history' ? 'var(--primary-color)' : 'var(--text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        History
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'topup' && (
                    <div>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Enter a voucher code to add credits to your account.
                        </p>
                        <form onSubmit={handleRedeem} style={{ display: 'flex', gap: '8px' }}>
                            <input
                                className="form-input"
                                placeholder="Enter code (try DEMO10)"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                disabled={loading}
                                style={{ flex: 1 }}
                            />
                            <button type="submit" className="btn btn-primary" disabled={!code.trim() || loading}>
                                {loading ? 'Redeeming...' : 'Redeem'}
                            </button>
                        </form>
                        <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Need more credits?</h4>
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                                Contact support or your administrator to purchase credit bundles.
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {history && history.length > 0 ? (
                            history.map((item, index) => (
                                <div key={index} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{item.description}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {item.date ? format(new Date(item.date), 'MMM d, yyyy HH:mm') : 'Unknown date'}
                                        </div>
                                    </div>
                                    <div style={{
                                        fontWeight: 600,
                                        color: item.amount > 0 ? 'var(--success-color, #10B981)' : 'var(--danger-color, #EF4444)'
                                    }}>
                                        {item.amount > 0 ? '+' : ''}{item.amount}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state">No transaction history</div>
                        )}
                    </div>
                )}
            </div>
            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>
                    Close
                </button>
            </div>
        </Modal>
    );
}
