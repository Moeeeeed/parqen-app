import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ThumbsUp, ThumbsDown, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PRAQEN = {
  primary: '#2D5F4F',
  secondary: '#FFD700',
  lightBg: '#f0f8f5',
  darkBg: '#1a3a2a',
};

export default function Feedback({ user }) {
  const { tradeId, userId } = useParams();
  const navigate = useNavigate();
  const [isPositive, setIsPositive] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [trade, setTrade] = useState(null);
  const [receiver, setReceiver] = useState(null);
  const [existingFeedback, setExistingFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadData();
  }, [tradeId, userId]);

  const loadData = async () => {
    try {
      // Load trade details
      const tradeRes = await axios.get(`${API_URL}/trades/${tradeId}`);
      setTrade(tradeRes.data.trade);

      // Load user to give feedback to
      const userRes = await axios.get(`${API_URL}/users/${userId}`);
      setReceiver(userRes.data.user);

      // Check if feedback already exists
      try {
        const feedbackRes = await axios.get(`${API_URL}/users/${userId}/reviews`);
        const existing = feedbackRes.data.reviews?.find(r => r.trade_id === tradeId);
        if (existing) {
          setExistingFeedback(existing);
        }
      } catch (err) {
        // No feedback exists yet
        console.log('No existing feedback');
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isPositive === null) {
      toast.error('Please select Positive or Negative');
      return;
    }

    const rating = isPositive ? 5 : 1;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/trades/${tradeId}/feedback`, {
        rating,
        comment,
        toUserId: userId,
      });

      toast.success('Feedback submitted successfully!');
      navigate('/my-trades');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error(error?.response?.data?.error || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PRAQEN.lightBg }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRAQEN.primary, borderTopColor: PRAQEN.secondary }}></div>
          <p style={{ color: PRAQEN.primary }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (existingFeedback) {
    return (
      <div className="min-h-screen py-12 px-4" style={{ backgroundColor: PRAQEN.lightBg }}>
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-8 text-center">
          <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2" style={{ color: PRAQEN.primary }}>Feedback Already Submitted</h2>
          <p className="text-gray-600 mb-4">
            You already left feedback for this user on this trade.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="flex justify-center mb-2">
              {existingFeedback.rating >= 4
                ? <span className="flex items-center gap-2 text-emerald-600 font-black text-sm"><ThumbsUp size={20} className="fill-emerald-500"/>Positive</span>
                : <span className="flex items-center gap-2 text-rose-600 font-black text-sm"><ThumbsDown size={20} className="fill-rose-500"/>Negative</span>}
            </div>
            <p className="text-gray-700">{existingFeedback.comment}</p>
          </div>
          <button
            onClick={() => navigate('/my-trades')}
            className="px-6 py-2 rounded-lg text-white font-semibold"
            style={{ backgroundColor: PRAQEN.primary }}
          >
            Back to My Trades
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: PRAQEN.lightBg }}>
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4" style={{ backgroundColor: PRAQEN.primary }}>
            <h1 className="text-2xl font-bold text-white">Leave Feedback</h1>
            <p className="text-blue-100 text-sm">Trade #{tradeId?.slice(0, 8)}</p>
          </div>

          {/* Content */}
          <div className="p-6">

            {/* User Info */}
            <div className="text-center mb-6">
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mb-2">Rate Your Trade</p>
              <h2 className="text-xl font-black mb-1" style={{ color: PRAQEN.primary }}>
                How was trading with{' '}
                <span className="text-emerald-600">{receiver?.username}</span>?
              </h2>
              <p className="text-[10px] font-black text-gray-400 uppercase">
                Trade #{tradeId?.slice(0, 8).toUpperCase()}
              </p>
            </div>

            {/* Positive / Negative Selection */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <button
                type="button"
                onClick={() => setIsPositive(true)}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                  isPositive === true
                    ? 'bg-emerald-50 border-emerald-500 shadow-md scale-[1.02]'
                    : 'bg-white border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                  isPositive === true ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  <ThumbsUp size={24} fill={isPositive === true ? 'currentColor' : 'none'} />
                </div>
                <span className={`font-black text-sm uppercase tracking-wide ${
                  isPositive === true ? 'text-emerald-700' : 'text-gray-400'
                }`}>Positive</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPositive(false)}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                  isPositive === false
                    ? 'bg-rose-50 border-rose-500 shadow-md scale-[1.02]'
                    : 'bg-white border-gray-100 hover:border-rose-200 hover:bg-rose-50/30'
                }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                  isPositive === false ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  <ThumbsDown size={24} fill={isPositive === false ? 'currentColor' : 'none'} />
                </div>
                <span className={`font-black text-sm uppercase tracking-wide ${
                  isPositive === false ? 'text-rose-700' : 'text-gray-400'
                }`}>Negative</span>
              </button>
            </div>

            {/* Sentiment label */}
            {isPositive !== null && (
              <p className={`text-center text-sm font-bold mb-4 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isPositive
                  ? <span className="inline-flex items-center gap-1.5"><ThumbsUp size={14} fill="currentColor" /> Great experience!</span>
                  : <span className="inline-flex items-center gap-1.5"><ThumbsDown size={14} fill="currentColor" /> Bad experience</span>}
              </p>
            )}

            {/* Comment */}
            <div className="mb-5">
              <label className="block text-xs font-bold mb-2" style={{ color: '#334155' }}>
                {isPositive === false ? 'Tell us what went wrong' : 'Share your experience'}{' '}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  isPositive === null
                    ? 'Select Positive or Negative first…'
                    : isPositive
                    ? 'What went well? Your review helps the community…'
                    : 'What went wrong? Help others stay safe…'
                }
                rows={4}
                disabled={isPositive === null}
                className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none text-sm resize-none transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderColor: isPositive === false ? '#FCA5A5' : isPositive === true ? '#6EE7B7' : '#E2E8F0',
                }}
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting || isPositive === null}
              className="w-full py-3.5 rounded-xl font-black text-sm transition hover:opacity-90 disabled:opacity-40"
              style={{
                backgroundColor: isPositive === false ? '#EF4444' : PRAQEN.primary,
                color: '#fff',
              }}>
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              Your feedback helps build trust in the community
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}