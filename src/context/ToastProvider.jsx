import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type, duration }]);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            {createPortal(
                <ToastContainer toasts={toasts} removeToast={removeToast} />,
                document.body
            )}
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, removeToast }) {
    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onRemove }) {
    const { message, type, duration } = toast;
    const title = {
        success: 'Success',
        error: 'Something went wrong',
        warning: 'Please check this',
        info: 'Information',
    }[type] || 'Notification';

    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, onRemove]);

    return (
        <div
            className={`toast toast-${type}`}
            role={type === 'error' ? 'alert' : 'status'}
            aria-live={type === 'error' ? 'assertive' : 'polite'}
        >
            <div className="toast-icon">
                {type === 'success' && '✓'}
                {type === 'error' && '✕'}
                {type === 'info' && 'ℹ'}
                {type === 'warning' && '⚠'}
            </div>
            <div className="toast-content">
                <div className="toast-title">{title}</div>
                <div className="toast-message">{message}</div>
            </div>
            <button type="button" className="toast-close" onClick={onRemove} aria-label="Dismiss notification">×</button>
        </div>
    );
}
