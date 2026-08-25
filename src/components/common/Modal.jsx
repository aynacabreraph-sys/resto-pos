import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, footer, large }) {
  const titleId = useId();
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${large ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
