import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Send, MessageCircle, Copy, Paperclip, X } from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = { green:'#2D6A4F', danger:'#EF4444', g400:'#94A3B8', g200:'#E2E8F0' };

const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fmtBtc = (n, d = 8) => parseFloat(n || 0).toFixed(d);

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per image

export default function TradeChat({ user }) {
  const { id } = useParams();
  const [trade, setTrade] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Multi-image upload state ──────────────────────────────────────────
  const [selectedImages, setSelectedImages] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [imgSrc, setImgSrc] = useState(null); // full-screen modal

  useEffect(() => {
    loadTrade();
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => previewUrls.forEach(u => URL.revokeObjectURL(u));
  }, []);

  const loadTrade = async () => {
    try {
      const r = await axios.get(`${API_URL}/trades/${id}`, { headers: authH() });
      setTrade(r.data.trade || r.data);
    } catch (error) {
      console.error('Failed to load trade:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await axios.get(`${API_URL}/messages/${id}`, { headers: authH() });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: id, message: newMessage }, { headers: authH() });
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await loadMessages();
    } catch (error) {
      const serverError = error?.response?.data?.error || error?.response?.data?.message;
      toast.error(serverError || 'Failed to send message');
    }
  };

  // ── Image selection & validation ──────────────────────────────────────
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (files.length > MAX_IMAGES) {
      toast.error('You can only send up to 5 images at a time.');
      e.target.value = '';
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" is not a supported image format.`);
        e.target.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds the 5 MB size limit.`);
        e.target.value = '';
        return;
      }
    }

    const urls = files.map(f => URL.createObjectURL(f));
    // Clean up any previous previews
    previewUrls.forEach(u => URL.revokeObjectURL(u));
    setSelectedImages(files);
    setPreviewUrls(urls);
    e.target.value = '';
  };

  const removeImage = (index) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const clearPreviews = () => {
    previewUrls.forEach(u => URL.revokeObjectURL(u));
    setSelectedImages([]);
    setPreviewUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload all selected images ────────────────────────────────────────
  const uploadImages = async () => {
    if (!selectedImages.length) return;
    setUploading(true);
    const originalPreviews = [...previewUrls];
    try {
      for (const file of selectedImages) {
        const b64 = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(rd.result);
          rd.onerror = rej;
          rd.readAsDataURL(file);
        });
        // Keep existing upload flow: POST to upload-image then send as message
        await axios.post(`${API_URL}/trades/${id}/upload-image`, { image: b64, type: 'payment' }, { headers: authH() });
        await axios.post(`${API_URL}/messages`, { tradeId: id, message: b64 }, { headers: authH() });
      }
      toast.success(`Sent ${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''}!`);
      // Cleanup previews BEFORE loading messages so the strip disappears immediately
      originalPreviews.forEach(u => URL.revokeObjectURL(u));
      setSelectedImages([]);
      setPreviewUrls([]);
      await loadMessages();
    } catch {
      toast.error('Failed to upload image(s)');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="text-center py-10">Loading chat...</div>;

  const isBuyer = trade && user && trade.buyer_id === user.id;
  const isSeller = trade && user && trade.seller_id === user.id;
  const payMethod = trade?.payment_method || trade?.pay_method || 'the agreed method';
  const cur = trade?.local_currency || trade?.currency || 'USD';
  const fiatAmt = parseFloat(trade?.amount_local || trade?.amount_usd || 0);
  const btcAmt = parseFloat(trade?.amount_btc || 0);
  const otherName = isBuyer ? trade?.seller_name : trade?.buyer_name;

  // ── Image message detector ────────────────────────────────────────────
  const isImgMsg = (text) => typeof text === 'string' && text.startsWith('data:image/');

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* ── TOP BAR ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm"
            style={{ backgroundColor: C.green }}>
            {(otherName || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 truncate">{otherName || 'Counterparty'}</h3>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block flex-shrink-0" title="Online" />
            </div>
            {trade && (
              <p className="text-xs font-black uppercase tracking-wide mt-0.5"
                style={{ color: isSeller ? C.danger : C.green }}>
                {isBuyer
                  ? `BUYING ${fmtBtc(btcAmt)} BTC  ·  ${fiatAmt.toFixed(2)} ${cur}  ·  ${payMethod}`
                  : isSeller
                    ? `SELLING ${fmtBtc(btcAmt)} BTC  ·  ${fiatAmt.toFixed(2)} ${cur}  ·  ${payMethod}`
                    : `${fmtBtc(btcAmt)} BTC  ·  ${fiatAmt.toFixed(2)} ${cur}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── DISPUTE BANNER ──────────────────────────────────────────── */}
      {trade?.status === 'DISPUTED' && (
        <div className="flex-shrink-0 py-3 px-5 text-center text-white"
          style={{ background: 'linear-gradient(135deg,#4C1D95,#7C3AED)' }}>
          <p className="font-bold text-sm">Dispute Under Review</p>
          <p className="text-xs text-white/70 mt-0.5">PRAQEN Moderator reviewing within 24h</p>
        </div>
      )}

      {/* ── MESSAGES AREA ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: '#F9FAFB', minHeight: 0 }}>
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            const text = msg.message_text || '';
            const isImage = isImgMsg(text);

            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative max-w-xs rounded-2xl shadow-md ${isImage ? 'overflow-hidden p-0' : 'px-3.5 py-2.5'}`}
                  style={isImage ? {} : { background: isOwn ? C.green : '#334155', color: '#fff', paddingRight: 32 }}>

                  {/* ── IMAGE MESSAGE ── */}
                  {isImage ? (
                    <div>
                      {/* Hidden image — not rendered until user clicks to view full size */}
                      <button type="button" onClick={() => setImgSrc(text)}
                        className="block w-full text-left cursor-pointer hover:opacity-90 transition"
                        style={{ width: 280 }}>
                        <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-5"
                          style={{ background: isOwn ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.08)' }}>
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{ background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.12)' }}>
                            <span style={{ fontSize: 18, lineHeight: 1 }}>📷</span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            Image attached — tap to view
                          </span>
                        </div>
                      </button>
                      {/* Timestamp below image placeholder */}
                      <div className="px-3 pb-2 pt-1"
                        style={{ background: isOwn ? C.green : '#334155' }}>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
                          {new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* ── TEXT MESSAGE ── */
                    <>
                      <p className="text-xs font-black mb-1" style={{ opacity: 0.85 }}>
                        {isOwn ? 'You' : (otherName || 'User')}
                      </p>
                      <p className="text-sm break-words">{text}</p>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(text); toast.success('Copied!'); }}
                        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center"
                        title="Copy message">
                        <Copy size={13} style={{ color: 'rgba(255,255,255,0.7)' }} />
                      </button>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
                        {new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── IMAGE PREVIEW STRIP ─────────────────────────────────────── */}
      {previewUrls.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-[#F9FAFB] border-t border-[#E5E7EB]">
          {/* Thumbnail row */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {previewUrls.map((url, i) => (
              <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border"
                style={{ borderColor: C.g200 }}>
                <img src={url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition"
                  style={{ fontSize: 11 }}>
                  <X size={11} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
          {/* Action row */}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs font-semibold" style={{ color: C.g400 }}>
              {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={clearPreviews}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border transition hover:bg-gray-50"
                style={{ borderColor: C.g200, color: C.g500 }}>
                Cancel
              </button>
              <button type="button" onClick={uploadImages} disabled={uploading}
                className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition disabled:opacity-50"
                style={{ backgroundColor: uploading ? C.g400 : C.green }}>
                {uploading ? 'Uploading…' : `Send ${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INPUT COMPOSER ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-[#F9FAFB]">
        <form onSubmit={sendMessage}
          className="flex items-center gap-3 p-1.5 pl-3 pr-1.5 bg-white border border-[#E5E7EB] rounded-[24px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-[#E5E7EB] bg-white hover:bg-gray-50 flex-shrink-0 transition disabled:opacity-40"
            style={{ outline: 'none' }}>
            <Paperclip size={16} style={{ color: C.green }} />
          </button>
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
            }}
            placeholder="Write a message..."
            rows={1}
            className="flex-1 min-w-0 px-2 py-2 font-medium bg-transparent border-0 focus:outline-none focus:ring-0 resize-none text-slate-800 placeholder-slate-400"
            style={{ fontSize: 15, maxHeight: 120, overflowY: 'auto', lineHeight: 1.4 }}
          />
          <button type="submit" disabled={!newMessage.trim()}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition disabled:opacity-100 disabled:cursor-not-allowed shadow-sm"
            style={{
              backgroundColor: !newMessage.trim() ? '#F1F5F9' : C.green,
              color: !newMessage.trim() ? '#94A3B8' : '#ffffff'
            }}>
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* ── FULL-IMAGE MODAL ────────────────────────────────────────── */}
      {imgSrc && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImgSrc(null)}>
          <img src={imgSrc} alt="Full size" className="max-w-full max-h-screen object-contain rounded-xl" />
          <button onClick={() => setImgSrc(null)}
            className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition z-10">
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
