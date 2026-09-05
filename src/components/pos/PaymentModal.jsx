import React, { useEffect, useRef, useState } from 'react';
import { Banknote, Camera, Landmark, ShoppingBag, Smartphone } from 'lucide-react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatters';
import { calcChange } from '../../utils/calculations';
import { isValidCashTender, requiresPaymentEvidence } from '../../utils/payments';

const methods = [['Cash', Banknote], ['GCash', Smartphone], ['Bank Transfer', Landmark], ['Foodpanda', ShoppingBag]];

export default function PaymentModal({ total, onConfirm, onClose, isProcessing = false }) {
  const [method, setMethod] = useState('Cash');
  const [cashReceived, setCashReceived] = useState('');
  const [cashReview, setCashReview] = useState(false);
  const [evidencePhoto, setEvidencePhoto] = useState('');
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const due = Number(total || 0);
  const tendered = Number(cashReceived);
  const validCash = isValidCashTender(cashReceived, due);
  const evidenceRequired = requiresPaymentEvidence(method);

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => () => stream?.getTracks().forEach(track => track.stop()), [stream]);

  function stopCamera() { stream?.getTracks().forEach(track => track.stop()); setStream(null); }
  function close() { stopCamera(); if (!isProcessing) onClose(); }
  function changeMethod(nextMethod) {
    stopCamera(); setMethod(nextMethod); setCashReceived(''); setCashReview(false); setEvidencePhoto(''); setError('');
  }
  function reviewCash(event) {
    event?.preventDefault();
    if (!validCash) return setError(cashReceived === '' ? 'Enter the cash received.' : 'Cash received must cover the amount due.');
    setError(''); setCashReview(true);
  }
  async function startCamera() {
    try {
      stopCamera();
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } });
      setStream(media); setError('');
    } catch { setError(`Camera access is required for ${method}. Allow camera permission in browser settings, connect a camera, then retry.`); }
  }
  function captureEvidence() {
    const canvas = canvasRef.current;
    if (!canvas || !videoRef.current) return;
    canvas.width = 640; canvas.height = 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, 640, 480);
    setEvidencePhoto(canvas.toDataURL('image/jpeg', 0.72)); stopCamera(); setError('');
  }
  function submitElectronic() {
    if (evidenceRequired && !evidencePhoto) return setError(`Capture the ${method} receipt before completing payment.`);
    onConfirm({ method, cashReceived: null, amount: due, paymentEvidencePhoto: evidencePhoto || null, paymentEvidenceRequired: evidenceRequired });
  }

  if (cashReview) return <Modal title="Confirm Cash Payment" onClose={() => !isProcessing && setCashReview(false)} footer={<><button className="btn btn-secondary btn-lg" disabled={isProcessing} onClick={() => setCashReview(false)}>Go Back</button><button className="btn btn-primary btn-lg" disabled={isProcessing} onClick={() => onConfirm({ method: 'Cash', cashReceived: tendered, amount: due, paymentEvidencePhoto: null, paymentEvidenceRequired: false })}>{isProcessing ? 'Processing…' : 'YES — CONFIRM PAYMENT'}</button></>}>
    <div className="cash-confirmation"><small>IS THIS CASH AMOUNT CORRECT?</small><strong>{formatCurrency(tendered)}</strong><div><span>Amount Due</span><b>{formatCurrency(due)}</b></div><div className="cash-change"><span>CHANGE TO CUSTOMER</span><b>{formatCurrency(calcChange(tendered, due))}</b></div></div>
  </Modal>;

  return <Modal title="Payment" onClose={close} footer={method === 'Cash'
    ? <button className="btn btn-primary btn-lg w-full" disabled={isProcessing} onClick={reviewCash}>Review Cash</button>
    : <button className="btn btn-primary btn-lg w-full" disabled={isProcessing || (evidenceRequired && !evidencePhoto)} onClick={submitElectronic}>{isProcessing ? 'Processing…' : 'Complete Payment'}</button>}>
    <div className="payment-methods">{methods.map(([id, Icon]) => <button key={id} className={`payment-method ${method === id ? 'selected' : ''}`} onClick={() => changeMethod(id)}><Icon size={24}/><span>{id}</span></button>)}</div>
    <div className="payment-due"><small>Amount Due</small><strong>{formatCurrency(due)}</strong></div>
    {method === 'Cash' && <form onSubmit={reviewCash}><input className="form-input payment-cash-input" type="number" min={due} step="0.01" inputMode="decimal" value={cashReceived} onChange={event => { setCashReceived(event.target.value); setError(''); }} placeholder="Enter cash received" autoFocus/>{validCash && <div className="alert-banner alert-success"><span>Expected change: <strong>{formatCurrency(calcChange(tendered, due))}</strong></span></div>}</form>}
    {evidenceRequired && <div className="payment-evidence"><div className="alert-banner alert-info mb-16"><span>A photo of the {method} receipt is required.</span></div>{!stream ? <button className="btn btn-secondary w-full mb-16" onClick={startCamera}><Camera size={16}/> {evidencePhoto ? 'Retake Receipt Photo' : 'Capture Receipt Photo'}</button> : <div className="camera-capture"><video ref={videoRef} autoPlay playsInline muted/><button className="btn btn-primary" onClick={captureEvidence}><Camera size={16}/> Capture</button></div>}<canvas ref={canvasRef} style={{ display: 'none' }}/>{evidencePhoto && <img className="discount-photo-preview" src={evidencePhoto} alt={`${method} receipt evidence`}/>}</div>}
    {error && <p className="text-danger text-sm">{error}</p>}
  </Modal>;
}
