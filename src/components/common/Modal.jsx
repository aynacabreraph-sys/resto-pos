import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const modalStack = [];

export default function Modal({ title, onClose, children, footer, large }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  useEffect(() => {
    const stackId = Symbol('modal');
    const previouslyFocused = document.activeElement;
    modalStack.push(stackId);
    const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])];
    requestAnimationFrame(() => (focusable()[0] || dialogRef.current)?.focus());
    const onKeyDown = event => {
      if (modalStack.at(-1) !== stackId) return;
      if (event.key === 'Escape' && onClose) { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = focusable(); if (!nodes.length) { event.preventDefault(); return; }
        const first = nodes[0]; const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); const index = modalStack.indexOf(stackId); if (index >= 0) modalStack.splice(index, 1); previouslyFocused?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div ref={dialogRef} tabIndex={-1} className={`modal ${large ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          {onClose && <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
