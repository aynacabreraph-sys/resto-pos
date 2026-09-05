import React, { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';

export default function DiscountModal({ authorizations, onChange, maxCount, onClose }) {
  const [form, setForm] = useState({ type: 'PWD', idNumber: '', photo: '' });
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null); const canvasRef = useRef(null);
  async function startCamera() {
    try { const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } }); setStream(media); setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = media; }, 50); }
    catch { setError('Camera access is required. Allow camera permission in browser settings, connect a camera, then retry.'); }
  }
  function stop() { stream?.getTracks().forEach(track => track.stop()); setStream(null); }
  function capture() { const canvas = canvasRef.current; canvas.width = 640; canvas.height = 480; canvas.getContext('2d').drawImage(videoRef.current, 0, 0, 640, 480); setForm(current => ({ ...current, photo: canvas.toDataURL('image/jpeg', .72) })); stop(); }
  function add() {
    const idNumber = form.idNumber.trim();
    if (!idNumber || !form.photo) return setError('Enter the ID number and capture its photo.');
    if (authorizations.some(row => row.idNumber.toLowerCase() === idNumber.toLowerCase())) return setError('That ID number is already added.');
    if (authorizations.length >= maxCount) return setError('There are no more item units available to discount.');
    onChange([...authorizations, { ...form, idNumber }]); setForm({ type: 'PWD', idNumber: '', photo: '' }); setError('');
  }
  function close() { stop(); onClose(); }
  return <Modal title="PWD / Senior Discount (20%)" large onClose={close} footer={<button className="btn btn-primary" onClick={close}>Done</button>}>
    <div className="alert-banner alert-info mb-16"><span>Each verified ID discounts one highest-priced item. Effective reduction: 17.86%.</span></div>
    <div className="form-row"><select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>PWD</option><option>Senior</option></select><input className="form-input" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} placeholder="ID number"/></div>
    {!stream ? <button className="btn btn-secondary w-full mb-16" onClick={startCamera}><Camera size={16}/> {form.photo ? 'Retake ID Photo' : 'Capture ID Photo'}</button> : <div className="camera-capture"><video ref={videoRef} autoPlay playsInline muted/><button className="btn btn-primary" onClick={capture}><Camera size={16}/> Capture</button></div>}
    <canvas ref={canvasRef} style={{ display: 'none' }}/>{form.photo && <img className="discount-photo-preview" src={form.photo} alt="Captured ID"/>}
    {error && <p className="text-danger text-sm">{error}</p>}<button className="btn btn-primary w-full mb-16" onClick={add} disabled={authorizations.length >= maxCount}>Add Verified ID</button>
    <div className="discount-id-list">{authorizations.map((row, index) => <div key={`${row.idNumber}-${index}`}><span><strong>{row.type}</strong> · {row.idNumber}</span><button className="btn btn-ghost btn-icon" onClick={() => onChange(authorizations.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>)}</div>
  </Modal>;
}
