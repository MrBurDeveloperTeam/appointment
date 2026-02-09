import Modal from './Modal';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  const confirmClass = `btn btn-${confirmVariant}`;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="confirm-text">{description}</p>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={confirmClass} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
