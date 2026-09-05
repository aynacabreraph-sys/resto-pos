import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Users, Camera } from 'lucide-react';
import db from '../db/database';
import Modal from '../components/common/Modal';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/common/Toast';
import { formatCurrency } from '../utils/formatters';
import { writeAudit } from '../utils/audit';

const emptyForm = { name: '', pin: '', role: 'cashier', hourlyRate: 0, profileImage: '' };

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // 'new' or staff ID
  const [form, setForm] = useState(emptyForm);
  const [showPin, setShowPin] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [stream, setStream] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const { currentStaff } = useAuthStore();
  const toast = useToast();

  useEffect(() => { load(); }, []);
  
  async function load() {
    const allStaff = await db.staff.toArray();
    const roleOrder = { owner: 1, manager: 2, cashier: 3, staff: 4 };
    allStaff.sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
    setStaff(allStaff);
  }

  function openNew() {
    setForm(emptyForm);
    setShowPin(false);
    setEditing('new');
  }

  function openEdit(s) {
    setForm({ ...s, pin: '' });
    setShowPin(false);
    setEditing(s.id);
  }

  async function save() {
    if (!form.name || !form.role || (editing === 'new' && !form.pin)) {
      toast('Please fill all required fields', 'error');
      return;
    }
    
    if (form.pin && !/^\d{6}$/.test(form.pin)) {
      toast('A new PIN must be exactly 6 digits', 'error');
      return;
    }
    if (Number(form.hourlyRate || 0) < 0) {
      toast('Hourly rate cannot be negative', 'error');
      return;
    }

    const data = { 
      name: form.name, 
      role: form.role,
      hourlyRate: Number(form.hourlyRate || 0),
      profileImage: form.profileImage
    };

    try {
      if (editing === 'new') {
        const id = await db.rpc('save_staff_record', { p_id: null, p_name: data.name, p_role: data.role, p_hourly_rate: data.hourlyRate, p_profile_image: data.profileImage || null, p_pin: form.pin });
        await writeAudit({ action: 'CREATE', entityType: 'staff', entity: data.name, entityId: id, staff: currentStaff, afterState: data });
        toast('Staff member added successfully');
      } else {
        const before = await db.staff.get(editing);
        await db.rpc('save_staff_record', { p_id: editing, p_name: data.name, p_role: data.role, p_hourly_rate: data.hourlyRate, p_profile_image: data.profileImage || null, p_pin: form.pin || null });
        await writeAudit({ action: 'UPDATE', entityType: 'staff', entity: data.name, entityId: editing, staff: currentStaff, beforeState: before, afterState: data });
        toast('Staff member updated successfully');
        
        // If the owner edits themselves, maybe update authStore?
        if (currentStaff.id === editing) {
          useAuthStore.getState().login(await db.staff.get(editing));
        }
      }
      
      setEditing(null);
      load();
    } catch (error) {
      toast(error?.message || 'Could not save staff member.', 'error');
    }
  }

  async function remove(id) {
    // Prevent owner from deleting themselves to avoid locking out the system
    if (id === currentStaff.id) {
      toast('You cannot delete your own account', 'error');
      return;
    }

    if (!deleting) { setDeleting(staff.find(person => person.id === id)); return; }
    await db.staff.delete(id);
    setDeleting(null);
    toast('Staff member removed', 'info');
    load();
  }

  async function startCapture() {
    setCapturing(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } });
      setStream(s);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch { toast('Camera access denied', 'error'); setCapturing(false); }
  }

  function stopCapture() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null); setCapturing(false);
  }

  function takePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 320; canvas.height = 240;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, 320, 240);
    const photo = canvas.toDataURL('image/jpeg', 0.7);
    setForm({ ...form, profileImage: photo });
    stopCapture();
  }

  const filtered = staff.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Staff Management</h2>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Staff</button>
      </div>

      <div className="toolbar">
        <div className="search-bar">
          <Search size={16} />
          <input placeholder="Search name or role..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Hourly Rate</th>
              <th>PIN</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.profileImage ? (
                      <img src={s.profileImage} alt="profile" style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover' }} />
                    ) : (
                      <div className="staff-avatar" style={{ width: 32, height: 32, fontSize: '0.9rem' }}>{s.name.charAt(0)}</div>
                    )}
                    {s.name}
                    {s.id === currentStaff.id && <span className="badge badge-neutral" style={{ marginLeft: 8 }}>You</span>}
                  </div>
                </td>
                <td>
                  <span className={`badge ${s.role === 'owner' ? 'badge-danger' : s.role === 'manager' ? 'badge-primary' : 'badge-neutral'}`} style={{ textTransform: 'capitalize' }}>
                    {s.role}
                  </span>
                </td>
                <td style={{ fontWeight: 500 }}>{formatCurrency(s.hourlyRate || 0)}/hr</td>
                <td style={{ fontFamily: 'monospace', letterSpacing: s.hasPin ? 2 : 0 }}>{s.hasPin ? '••••••' : 'No PIN'}</td>
                <td>
                  <div className="flex gap-8">
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(s)} title="Edit">
                      <Edit2 size={14} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(s.id)} title="Delete" disabled={s.id === currentStaff.id}>
                      <Trash2 size={14} color={s.id === currentStaff.id ? "var(--text-muted)" : "var(--danger)"} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted" style={{ padding: 24 }}>No staff found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <Modal title={editing === 'new' ? 'Add Staff Member' : 'Edit Staff Member'} onClose={() => setEditing(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>
        }>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'var(--bg-secondary)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.profileImage ? <img src={form.profileImage} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Users size={32} color="var(--text-muted)" />}
            </div>
            <button className="btn btn-secondary" onClick={startCapture}><Camera size={16} /> Take Photo</button>
            {form.profileImage && <button className="btn btn-ghost" onClick={() => setForm({...form, profileImage: ''})}>Remove</button>}
          </div>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              className="form-input" 
              placeholder="e.g. Maria Santos"
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})} 
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Role</label>
              <select 
                className="form-select" 
                value={form.role} 
                onChange={e => setForm({...form, role: e.target.value})}
                style={{ textTransform: 'capitalize' }}
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
                <option value="staff">Staff (Time Tracking Only)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">6-Digit PIN</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  className="form-input" 
                  type={showPin ? "text" : "password"}
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={form.pin} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, ''); // only allow digits
                    setForm({...form, pin: val});
                  }} 
                  style={{ fontFamily: 'monospace', letterSpacing: 2 }}
                />
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowPin(!showPin)}
                  style={{ width: 80 }}
                >
                  {showPin ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Hourly Rate (₱)</label>
            <input 
              className="form-input" 
              type="number"
              placeholder="e.g. 150"
              value={form.hourlyRate} 
              onChange={e => setForm({...form, hourlyRate: e.target.value})} 
            />
          </div>
          
          {editing === currentStaff.id && (
            <p className="text-sm text-muted" style={{ marginTop: 16 }}>
              Note: You are editing your own account. If you change your PIN, make sure to remember it for your next login!
            </p>
          )}
        </Modal>
      )}

      {deleting && <Modal title="Delete Staff Member" onClose={() => setDeleting(null)} footer={<><button className="btn btn-secondary" onClick={() => setDeleting(null)}>Cancel</button><button className="btn btn-danger" onClick={() => remove(deleting.id)}>Delete</button></>}><p>Delete <strong>{deleting.name}</strong>? Their historical records will remain.</p></Modal>}

      {capturing && (
        <Modal title="Capture Profile Photo" onClose={stopCapture} footer={
          <><button className="btn btn-secondary" onClick={stopCapture}>Cancel</button><button className="btn btn-primary" onClick={takePhoto}><Camera size={16} /> Capture</button></>
        }>
          <div className="webcam-container">
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 'var(--radius)' }} />
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <p className="text-center text-muted text-sm">Position face in the camera and click Capture</p>
        </Modal>
      )}
    </div>
  );
}
