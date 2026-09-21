import { useEffect } from 'react';

export default function Modal({ title, onClose, disableClose = false, className = '', children }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (disableClose) return;
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, disableClose]);

  return (
    <div className={`modal-overlay active ${className ? `${className}-overlay` : ''}`.trim()} role="presentation">
      <div className={`modal modal-lg ${className}`.trim()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {!disableClose && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              x
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
