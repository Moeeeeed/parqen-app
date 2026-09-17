import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Camera, Edit3, Save, CheckCircle, AlertCircle,
  User, Mail, Phone, AtSign, Globe, Clock, Eye, EyeOff,
  ChevronDown, RefreshCw, X, Upload,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { uploadAvatar } from '../services/avatarService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', mist: '#F0FAF5', white: '#FFFFFF',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6',
};

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', label: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', label: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'GHS', label: 'Ghana Cedi', symbol: '₵', flag: '🇬🇭' },
  { code: 'NGN', label: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
  { code: 'KES', label: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
  { code: 'ZAR', label: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ', flag: '🇦🇪' },
  { code: 'SAR', label: 'Saudi Riyal', symbol: '﷼', flag: '🇸🇦' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'CA$', flag: '🇨🇦' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
  { code: 'BRL', label: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷' },
  { code: 'MXN', label: 'Mexican Peso', symbol: 'MX$', flag: '🇲🇽' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  { code: 'CNY', label: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  { code: 'TRY', label: 'Turkish Lira', symbol: '₺', flag: '🇹🇷' },
  { code: 'PKR', label: 'Pakistani Rupee', symbol: '₨', flag: '🇵🇰' },
  { code: 'EGP', label: 'Egyptian Pound', symbol: '£', flag: '🇪🇬' },
  { code: 'TZS', label: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿' },
  { code: 'UGX', label: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬' },
  { code: 'RWF', label: 'Rwandan Franc', symbol: 'Fr', flag: '🇷🇼' },
];

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'sw', label: 'Swahili', native: 'Kiswahili' },
  { code: 'ha', label: 'Hausa', native: 'Hausa' },
  { code: 'yo', label: 'Yoruba', native: 'Yorùbá' },
  { code: 'ig', label: 'Igbo', native: 'Igbo' },
  { code: 'tw', label: 'Twi (Akan)', native: 'Twi' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

const TIMEZONE_GROUPS = {
  Africa: [
    { tz: 'Africa/Accra', label: 'Accra — Ghana (GMT+0)' },
    { tz: 'Africa/Lagos', label: 'Lagos — Nigeria (GMT+1)' },
    { tz: 'Africa/Nairobi', label: 'Nairobi — Kenya (GMT+3)' },
    { tz: 'Africa/Johannesburg', label: 'Johannesburg — South Africa (GMT+2)' },
    { tz: 'Africa/Addis_Ababa', label: 'Addis Ababa — Ethiopia (GMT+3)' },
    { tz: 'Africa/Kigali', label: 'Kigali — Rwanda (GMT+2)' },
    { tz: 'Africa/Cairo', label: 'Cairo — Egypt (GMT+2)' },
    { tz: 'Africa/Dar_es_Salaam', label: 'Dar es Salaam — Tanzania (GMT+3)' },
    { tz: 'Africa/Kampala', label: 'Kampala — Uganda (GMT+3)' },
    { tz: 'Africa/Casablanca', label: 'Casablanca — Morocco (GMT+0/+1)' },
  ],
  'Asia & Middle East': [
    { tz: 'Asia/Dubai', label: 'Dubai — UAE (GMT+4)' },
    { tz: 'Asia/Riyadh', label: 'Riyadh — Saudi Arabia (GMT+3)' },
    { tz: 'Asia/Kolkata', label: 'Mumbai, Delhi — India (GMT+5:30)' },
    { tz: 'Asia/Karachi', label: 'Karachi — Pakistan (GMT+5)' },
    { tz: 'Asia/Dhaka', label: 'Dhaka — Bangladesh (GMT+6)' },
    { tz: 'Asia/Shanghai', label: 'Beijing, Shanghai — China (GMT+8)' },
    { tz: 'Asia/Tokyo', label: 'Tokyo — Japan (GMT+9)' },
    { tz: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
    { tz: 'Asia/Jakarta', label: 'Jakarta — Indonesia (GMT+7)' },
    { tz: 'Asia/Baghdad', label: 'Baghdad — Iraq (GMT+3)' },
  ],
  Europe: [
    { tz: 'Europe/London', label: 'London — UK (GMT+0/+1)' },
    { tz: 'Europe/Paris', label: 'Paris — France (GMT+1/+2)' },
    { tz: 'Europe/Berlin', label: 'Berlin — Germany (GMT+1/+2)' },
    { tz: 'Europe/Istanbul', label: 'Istanbul — Turkey (GMT+3)' },
    { tz: 'Europe/Moscow', label: 'Moscow — Russia (GMT+3)' },
  ],
  Americas: [
    { tz: 'America/New_York', label: 'New York — USA Eastern (GMT-5/-4)' },
    { tz: 'America/Chicago', label: 'Chicago — USA Central (GMT-6/-5)' },
    { tz: 'America/Los_Angeles', label: 'Los Angeles — USA Pacific (GMT-8/-7)' },
    { tz: 'America/Toronto', label: 'Toronto — Canada Eastern (GMT-5/-4)' },
    { tz: 'America/Sao_Paulo', label: 'São Paulo — Brazil (GMT-3)' },
    { tz: 'America/Mexico_City', label: 'Mexico City (GMT-6/-5)' },
  ],
  UTC: [{ tz: 'UTC', label: 'UTC — Coordinated Universal Time (GMT+0)' }],
};

const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? C.green : C.g300, transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
      }} />
    </button>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, overflow: 'hidden' }}>
      {title && (
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.g100}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: 0 }}>{title}</h3>
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ─── Inline editable field ────────────────────────────────────────────────────
function EditableField({ label, icon: Icon, value, onSave, type = 'text', disabled: fieldDisabled, formatValue }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  useEffect(() => { setDraft(value || ''); }, [value]);

  const hasChanged = draft !== (value || '');

  const handleSave = async () => {
    if (!hasChanged) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      toast.success(`${label} updated!`);
    } catch (e) {
      toast.error(e?.response?.data?.error || `Failed to update ${label}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(value || ''); setEditing(false); };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          ref={inputRef} type={type} value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          disabled={saving}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, border: `2px solid ${C.green}`,
            fontSize: 14, fontWeight: 600, color: C.g800, outline: 'none', background: '#fff',
          }}
        />
        <button onClick={handleCancel} disabled={saving}
          style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <X size={16} color={C.g500} />
        </button>
        <button onClick={handleSave} disabled={saving || !hasChanged}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none',
            background: hasChanged ? C.green : C.g200, cursor: hasChanged ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          {saving ? <RefreshCw size={14} color="#fff" className="animate-spin" /> : <CheckCircle size={16} color={hasChanged ? '#fff' : C.g400} />}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon size={16} color={C.g400} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.g400, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.g800, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formatValue ? formatValue(value) : value || '—'}
        </p>
      </div>
      {!fieldDisabled && (
        <button onClick={() => setEditing(true)}
          style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.g200}`, background: C.g50, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Edit3 size={14} color={C.g500} />
        </button>
      )}
    </div>
  );
}

// ─── Info Row (mobile plain label + value + pencil) ──────────────────────────
function InfoRow({ label, icon: Icon, value, onSave, format }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  useEffect(() => { setDraft(value || ''); }, [value]);

  const hasChanged = draft !== (value || '');

  const handleSave = async () => {
    if (!hasChanged) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      toast.success(`${label} updated!`);
    } catch (e) {
      toast.error(e?.response?.data?.error || `Failed to update ${label}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(value || ''); setEditing(false); };

  if (editing) {
    return (
      <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.g100}` }}>
        <input
          ref={inputRef} type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          disabled={saving}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10, border: `2px solid ${C.green}`,
            fontSize: 14, fontWeight: 600, color: C.g800, outline: 'none', background: '#fff', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button onClick={handleCancel} disabled={saving}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.g200}`, background: '#fff', fontSize: 12, fontWeight: 700, color: C.g600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !hasChanged}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: hasChanged ? C.green : C.g200,
              fontSize: 12, fontWeight: 700, color: hasChanged ? '#fff' : C.g400,
              cursor: hasChanged ? 'pointer' : 'default',
            }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${C.g100}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: C.g500, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: C.g800, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {format ? format(value) : value || '—'}
        </p>
      </div>
      <button onClick={() => setEditing(true)}
        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Edit3 size={16} color={C.g400} />
      </button>
    </div>
  );
}

// ─── Desktop Row (label above value in grey box + pencil icon) ────────────────
function DTRow({ label, value, onSave, formatValue, showEdit = true }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  useEffect(() => { setDraft(value || ''); }, [value]);

  const hasChanged = draft !== (value || '');

  const handleSave = async () => {
    if (!hasChanged) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      toast.success(`${label} updated!`);
    } catch (e) {
      toast.error(e?.response?.data?.error || `Failed to update ${label}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(value || ''); setEditing(false); };

  const displayValue = formatValue ? formatValue(value) : value || '—';

  if (editing) {
    return (
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: C.g500, margin: '0 0 6px' }}>{label}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef} type="text" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: `2px solid ${C.green}`,
              fontSize: 14, fontWeight: 600, color: C.g800, outline: 'none', background: '#fff', boxSizing: 'border-box',
            }}
          />
          <button onClick={handleCancel} disabled={saving}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={16} color={C.g500} />
          </button>
          <button onClick={handleSave} disabled={saving || !hasChanged}
            style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: hasChanged ? C.green : C.g200, cursor: hasChanged ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {saving ? <RefreshCw size={14} color="#fff" className="animate-spin" /> : <CheckCircle size={16} color={hasChanged ? '#fff' : C.g400} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, color: C.g500, margin: '0 0 6px' }}>{label}</p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 10,
        background: C.g50, border: `1px solid ${C.g100}`,
      }}>
        <p style={{
          flex: 1, fontSize: 14, fontWeight: 600, color: C.g800, margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        }}>
          {displayValue}
        </p>
        {showEdit && (
          <button onClick={() => setEditing(true)}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Edit3 size={15} color={C.g400} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountSettings({ user, setUser }) {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);

  // Bio
  const [bio, setBio] = useState('');
  const [bioEditing, setBioEditing] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);

  // Account info
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Preferences
  const [nameDisplay, setNameDisplay] = useState('full');
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [timezone, setTimezone] = useState('UTC');
  const [showOnline, setShowOnline] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Fetch profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const r = await axios.get(`${API_URL}/users/profile`, { headers: authH() });
        const p = r.data.user || r.data;
        setProfile(p);
        setBio(p.bio || '');
        setFullName(p.full_name || '');
        setUsername(p.username || '');
        setEmail(p.email || '');
        setPhone(p.phone || '');
        setNameDisplay(p.name_display || (p.hide_full_name ? 'hide' : 'full'));
        setCurrency(p.preferred_currency || localStorage.getItem('praqen_currency') || 'USD');
        setLanguage(p.preferred_language || localStorage.getItem('praqen_language') || 'en');
        setTimezone(p.timezone || localStorage.getItem('praqen_timezone') || 'UTC');
        setShowOnline(p.show_online !== false);
      } catch (e) {
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // Avatar upload
  const handleAvatarClick = () => fileRef.current?.click();

  const handleAvatarUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8MB'); return; }

    setAvatarPreview(URL.createObjectURL(f));
    setUploading(true);
    try {
      const url = await uploadAvatar(user.id, f);
      setProfile(p => ({ ...p, avatar_url: url }));
      if (setUser) setUser(u => ({ ...u, avatar_url: url }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.avatar_url = url;
      localStorage.setItem('user', JSON.stringify(stored));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success('Avatar updated!');
    } catch (err) {
      setAvatarPreview(null);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Save bio
  const saveBio = async () => {
    setBioSaving(true);
    try {
      await axios.put(`${API_URL}/users/profile`, { bio }, { headers: authH() });
      setProfile(p => ({ ...p, bio }));
      if (setUser) setUser(u => ({ ...u, bio }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.bio = bio;
      localStorage.setItem('user', JSON.stringify(stored));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success('Bio updated!');
      setBioEditing(false);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update bio');
    } finally {
      setBioSaving(false);
    }
  };

  // Save account info fields
  const saveField = (field, value) => async () => {
    const payload = {};
    if (field === 'full_name') payload.fullName = value;
    else if (field === 'username') payload.username = value;
    else if (field === 'phone') payload.phone = value;
    // TODO: wire email change to backend verification flow
    if (field === 'email') {
      toast.info('Email changes require re-verification. This feature will be available soon.');
      throw new Error('Not yet implemented');
    }
    const r = await axios.put(`${API_URL}/users/profile`, payload, { headers: authH() });
    const updated = r.data.user || {};
    setProfile(p => ({ ...p, ...updated }));
    if (field === 'full_name') { setFullName(value); if (setUser) setUser(u => ({ ...u, full_name: value })); }
    if (field === 'username') { setUsername(value); if (setUser) setUser(u => ({ ...u, username: value })); }
    if (field === 'phone') { setPhone(value); if (setUser) setUser(u => ({ ...u, phone: value })); }
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    Object.assign(stored, updated);
    localStorage.setItem('user', JSON.stringify(stored));
    window.dispatchEvent(new Event('userUpdated'));
  };

  // Save preferences
  const savePreferences = async () => {
    setPrefsSaving(true);
    try {
      await axios.put(`${API_URL}/users/profile`, { name_display: nameDisplay }, { headers: authH() });
      // TODO: wire show_online to backend
      await axios.put(`${API_URL}/users/preferences`, { currency, language, timezone }, { headers: authH() }).catch(() => {});
      localStorage.setItem('praqen_currency', currency);
      localStorage.setItem('praqen_language', language);
      localStorage.setItem('praqen_timezone', timezone);
      localStorage.setItem('praqen_name_display', nameDisplay);
      if (setUser) setUser(u => ({
        ...u, name_display: nameDisplay, hide_full_name: nameDisplay === 'hide',
        preferred_currency: currency, preferred_language: language, timezone,
        show_online: showOnline,
      }));
      toast.success('Preferences saved!');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save preferences');
    } finally {
      setPrefsSaving(false);
    }
  };

  const maskEmail = (e) => {
    if (!e) return '—';
    const [local, domain] = e.split('@');
    if (!domain) return e;
    return local.slice(0, 3) + '•••@' + domain;
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.mist, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: `4px solid ${C.g200}`, borderTopColor: C.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hasBioChanged = bio !== (profile?.bio || '');

  // Reusable bio card content (shared by mobile & desktop)
  const bioCardContent = (
    <>
      {bioEditing ? (
        <>
          <textarea
            value={bio} maxLength={180}
            onChange={e => setBio(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              border: `2px solid ${C.green}`, fontSize: 14, fontWeight: 600,
              color: C.g800, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: bio.length > 160 ? C.danger : C.g400 }}>Maximum 180 characters</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setBio(profile?.bio || ''); setBioEditing(false); }}
                style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${C.g200}`, background: '#fff', fontSize: 13, fontWeight: 700, color: C.g600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveBio} disabled={bioSaving || !hasBioChanged}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: hasBioChanged ? C.green : C.g200,
                  fontSize: 13, fontWeight: 700, color: hasBioChanged ? '#fff' : C.g400,
                  cursor: hasBioChanged ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {bioSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 14, color: C.g700, margin: 0, lineHeight: 1.5, flex: 1 }}>{bio || 'No bio set'}</p>
          <button onClick={() => setBioEditing(true)}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', background: C.green,
              fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}>
            <Edit3 size={13} /> Edit
          </button>
        </div>
      )}
    </>
  );

  // Reusable avatar image block (shared by mobile & desktop)
  const avatarImageBlock = (
    <div onClick={handleAvatarClick}
      style={{ width: 96, height: 96, borderRadius: 12, overflow: 'hidden',
        border: `2px solid ${C.g200}`, background: C.g100, cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
      {(avatarPreview || profile?.avatar_url) ? (
        <img src={avatarPreview || profile?.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.gold}, #FBBF24)` }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: C.forest }}>{user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>
        </div>
      )}
      {uploading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={20} color="#fff" className="animate-spin" />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.mist, paddingBottom: 40 }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>

        {/* Responsive layout styles */}
        <style>{`
          .acct-mobile-layout { display: block; }
          .acct-desktop-layout { display: none; }
          @media (min-width: 768px) and (max-width: 1023px) {
            .acct-mobile-layout { display: block; }
            .acct-desktop-layout { display: block; }
            .acct-dt-grid { display: flex; flex-direction: row; gap: 20px; align-items: flex-start; }
            .acct-dt-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
            .acct-dt-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
          }
          @media (min-width: 1024px) {
            .acct-mobile-layout { display: none; }
            .acct-desktop-layout { display: block; }
            .acct-dt-grid { display: flex; flex-direction: row; gap: 28px; align-items: flex-start; }
            .acct-dt-left { flex: 0 0 420px; max-width: 420px; display: flex; flex-direction: column; gap: 20px; }
            .acct-dt-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0 12px' }}>
          <button onClick={() => navigate(-1)}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowLeft size={18} color={C.g700} />
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.g800, margin: 0 }}>Account settings</h1>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* MOBILE LAYOUT                                                       */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <div className="acct-mobile-layout" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Avatar Card ── */}
          <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {avatarImageBlock}
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: 0 }}>Avatar</p>
                <p style={{ fontSize: 12, color: C.g500, margin: '6px 0 0', lineHeight: 1.5 }}>
                  Upload a clear photo, preferably of yourself. Please avoid explicit or inappropriate images — they will be removed immediately.
                </p>
              </div>
              <button onClick={handleAvatarClick} disabled={uploading}
                style={{
                  alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.g200}`,
                  background: '#fff', cursor: uploading ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700, color: C.g700, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload image'}
              </button>
            </div>
          </div>

          {/* ── Bio Card ── */}
          <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0 0 12px' }}>Bio</p>
            {bioCardContent}
          </div>

          {/* ── Account Information ── */}
          <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0 0 4px' }}>Account information</p>
            <div style={{ borderBottom: `1px solid ${C.g100}`, marginBottom: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Name', icon: User, value: fullName, field: 'full_name', format: null },
                { label: 'Username', icon: AtSign, value: username, field: 'username', format: null },
                { label: 'E-mail', icon: Mail, value: email, field: 'email', format: maskEmail },
                { label: 'Phone number', icon: Phone, value: phone, field: 'phone', format: null },
              ].map((item, i) => (
                <InfoRow key={item.field} {...item} onSave={saveField(item.field, item.value)} />
              ))}
            </div>
          </div>

          {/* ── Account Preferences ── */}
          <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0 0 4px' }}>Account preferences</p>
            <div style={{ borderBottom: `1px solid ${C.g100}`, marginBottom: 20 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Name display */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 10px' }}>Name display</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { value: 'initial', label: 'Show first name and last name initial', example: `${(fullName || 'User').split(' ')[0]} ${(fullName || 'User').split(' ')[1]?.charAt(0) || ''}.` },
                    { value: 'full', label: 'Show full name', example: fullName || 'User' },
                    { value: 'hide', label: 'Hide full name', example: profile?.username || 'username' },
                  ].map(opt => (
                    <label key={opt.value} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 12, border: `2px solid ${nameDisplay === opt.value ? C.green : C.g200}`,
                      background: nameDisplay === opt.value ? '#F0FFF4' : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', border: `2px solid ${nameDisplay === opt.value ? C.green : C.g300}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {nameDisplay === opt.value && <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: C.g800, margin: 0 }}>{opt.label}</p>
                        <p style={{ fontSize: 11, color: C.g400, margin: '2px 0 0' }}>e.g. "{opt.example}"</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preferred currency */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 8px' }}>Preferred currency</p>
                <div style={{ position: 'relative' }}>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      border: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600,
                      color: C.g800, background: '#fff', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
                    }}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.label} ({c.symbol})</option>
                    ))}
                  </select>
                  <ChevronDown size={16} color={C.g400} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>

              {/* Language */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 8px' }}>Language</p>
                <div style={{ position: 'relative' }}>
                  <select value={language} onChange={e => setLanguage(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      border: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600,
                      color: C.g800, background: '#fff', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
                    }}>
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}{l.native !== l.label ? ` (${l.native})` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} color={C.g400} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>

              {/* Timezone */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 8px' }}>Timezone</p>
                <div style={{ position: 'relative' }}>
                  <select value={timezone} onChange={e => setTimezone(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      border: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600,
                      color: C.g800, background: '#fff', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
                    }}>
                    {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => (
                      <optgroup key={region} label={region}>
                        {zones.map(z => (
                          <option key={z.tz} value={z.tz}>{z.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown size={16} color={C.g400} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>

              {/* Show online */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.g800, margin: 0 }}>Show online</p>
                  <p style={{ fontSize: 12, color: C.g400, margin: '2px 0 0' }}>Show your online status to other users</p>
                </div>
                <Toggle checked={showOnline} onChange={setShowOnline} />
              </div>

              {/* Save preferences */}
              <button onClick={savePreferences} disabled={prefsSaving}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                  background: C.green, cursor: prefsSaving ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: prefsSaving ? 0.7 : 1, transition: 'opacity 0.2s',
                }}>
                {prefsSaving ? <><RefreshCw size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save preferences</>}
              </button>

            </div>
          </div>

        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* DESKTOP LAYOUT (two-column, unchanged)                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <div className="acct-desktop-layout">
          <div className="acct-dt-grid">

            {/* Left column: Avatar + Account info */}
            <div className="acct-dt-left">
              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {avatarImageBlock}
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0' }}>Avatar</p>
                  <p style={{ fontSize: 12, color: C.g500, margin: 0, lineHeight: 1.5 }}>
                    Upload a clear photo, preferably of yourself. Please avoid explicit or inappropriate images — they will be removed immediately.
                  </p>
                  <button onClick={handleAvatarClick} disabled={uploading}
                    style={{
                      alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.g200}`,
                      background: '#fff', cursor: uploading ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 700, color: C.g700, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                    <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload image'}
                  </button>
                </div>
              </div>

              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0 0 4px' }}>Account information</p>
                <div style={{ borderBottom: `1px solid ${C.g100}`, marginBottom: 16 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <DTRow label="Name" value={fullName} onSave={saveField('full_name', fullName)} showEdit={false} />
                  <DTRow label="Username" value={username} onSave={saveField('username', username)} />
                  <DTRow label="E-mail" value={email} onSave={saveField('email', email)} formatValue={maskEmail} />
                  <DTRow label="Phone number" value={phone} onSave={saveField('phone', phone)} />
                </div>
              </div>
            </div>

            {/* Right column: Bio + Preferences */}
            <div className="acct-dt-right">
              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0 0 12px' }}>Bio</p>
                {bioCardContent}
              </div>

              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.g200}`, padding: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.g800, margin: '0 0 4px' }}>Account preferences</p>
                <div style={{ borderBottom: `1px solid ${C.g100}`, marginBottom: 20 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 10px' }}>Name display</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { value: 'initial', label: 'Show first name and last name initial', example: `${(fullName || 'User').split(' ')[0]} ${(fullName || 'User').split(' ')[1]?.charAt(0) || ''}.` },
                        { value: 'full', label: 'Show full name', example: fullName || 'User' },
                        { value: 'hide', label: 'Hide full name', example: profile?.username || 'username' },
                      ].map(opt => (
                        <label key={opt.value} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                          borderRadius: 12, border: `2px solid ${nameDisplay === opt.value ? C.green : C.g200}`,
                          background: nameDisplay === opt.value ? '#F0FFF4' : '#fff',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', border: `2px solid ${nameDisplay === opt.value ? C.green : C.g300}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {nameDisplay === opt.value && <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: C.g800, margin: 0 }}>{opt.label}</p>
                            <p style={{ fontSize: 11, color: C.g400, margin: '2px 0 0' }}>e.g. "{opt.example}"</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 8px' }}>Preferred currency</p>
                    <div style={{ position: 'relative' }}>
                      <select value={currency} onChange={e => setCurrency(e.target.value)}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600, color: C.g800, background: '#fff', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                        {CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.label} ({c.symbol})</option>
                        ))}
                      </select>
                      <ChevronDown size={16} color={C.g400} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 8px' }}>Language</p>
                    <div style={{ position: 'relative' }}>
                      <select value={language} onChange={e => setLanguage(e.target.value)}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600, color: C.g800, background: '#fff', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                        {LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.label}{l.native !== l.label ? ` (${l.native})` : ''}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} color={C.g400} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.g700, margin: '0 0 8px' }}>Timezone</p>
                    <div style={{ position: 'relative' }}>
                      <select value={timezone} onChange={e => setTimezone(e.target.value)}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600, color: C.g800, background: '#fff', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                        {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => (
                          <optgroup key={region} label={region}>
                            {zones.map(z => (
                              <option key={z.tz} value={z.tz}>{z.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown size={16} color={C.g400} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.g800, margin: 0 }}>Show online</p>
                      <p style={{ fontSize: 12, color: C.g400, margin: '2px 0 0' }}>Show your online status to other users</p>
                    </div>
                    <Toggle checked={showOnline} onChange={setShowOnline} />
                  </div>

                  <button onClick={savePreferences} disabled={prefsSaving}
                    style={{
                      width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                      background: C.green, cursor: prefsSaving ? 'not-allowed' : 'pointer',
                      fontSize: 14, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: prefsSaving ? 0.7 : 1, transition: 'opacity 0.2s',
                    }}>
                    {prefsSaving ? <><RefreshCw size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save preferences</>}
                  </button>

                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
