import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../App';
import { CheckCircle, AlertCircle, AlertTriangle, Shield } from 'lucide-react';
import { toast } from 'react-toastify';

export default function EscrowVerification({ trade, user, onVerified }) {
  const [verifying, setVerifying] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [codeWorks, setCodeWorks] = useState(null);

  const handleVerify = async (verified) => {
    if (!verificationNotes.trim()) {
      toast.error('Please add verification notes');
      return;
    }

    setVerifying(true);
    try {
      await axios.post(`${API_URL}/trades/${trade.id}/verify-code`, {
        verified,
        notes: verificationNotes,
      });

      if (verified) {
        toast.success('✓ Code verified! Please confirm receipt.');
      } else {
        toast.error('Code marked as invalid. Dispute will be created.');
      }

      onVerified(verified);
    } catch (error) {
      console.error('Error verifying code:', error);
      toast.error('Failed to verify code');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={28} className="text-blue-600" />
        <h3 className="text-2xl font-bold text-slate-900">Escrow Verification</h3>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-blue-900 text-sm">
          <strong>How it works:</strong> PRAQEN holds the Bitcoin in escrow until you verify the gift card code works correctly. Only after verification will the Bitcoin be released to the seller.
        </p>
      </div>

      {/* Verification Status */}
      <div className="mb-6 pb-6 border-b border-gray-200">
        <h4 className="font-semibold text-slate-900 mb-4">Escrow Status</h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle size={24} className="text-green-600" />
            <div>
              <p className="font-medium text-slate-900">Bitcoin Locked</p>
              <p className="text-sm text-gray-600">{parseFloat(trade.amount_btc).toFixed(8)} BTC in secure escrow</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle size={24} className="text-green-600" />
            <div>
              <p className="font-medium text-slate-900">Gift Card Code Sent</p>
              <p className="text-sm text-gray-600">Seller has provided the code (encrypted)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="text-yellow-600" />
            <div>
              <p className="font-medium text-slate-900">Awaiting Your Verification</p>
              <p className="text-sm text-gray-600">Test the code and confirm it works</p>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Form */}
      <div className="mb-6">
        <h4 className="font-semibold text-slate-900 mb-4">Verify the Code</h4>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600 mb-2">
            <strong>Gift Card Code:</strong> (You should have received this in chat)
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Test the code on the official {trade.listings?.gift_card_brand} website to ensure it's valid and has the correct balance.
          </p>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="codeWorks"
                value="yes"
                checked={codeWorks === 'yes'}
                onChange={() => setCodeWorks('yes')}
                className="w-4 h-4"
              />
              <span className="text-gray-700">✓ Code works! Balance is correct</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="codeWorks"
                value="no"
                checked={codeWorks === 'no'}
                onChange={() => setCodeWorks('no')}
                className="w-4 h-4"
              />
              <span className="text-gray-700">✗ Code doesn't work or balance is wrong</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Verification Notes (Required)
          </label>
          <textarea
            value={verificationNotes}
            onChange={(e) => setVerificationNotes(e.target.value)}
            placeholder="Example: 'Tested on Amazon website, balance confirmed as $100. Code activated successfully.'"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => handleVerify(true)}
          disabled={verifying || codeWorks !== 'yes' || !verificationNotes.trim()}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
        >
          <CheckCircle size={20} />
          {verifying ? 'Verifying...' : 'Code is Valid - Release Bitcoin'}
        </button>

        <button
          onClick={() => handleVerify(false)}
          disabled={verifying || codeWorks !== 'no' || !verificationNotes.trim()}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
        >
          <AlertCircle size={20} />
          {verifying ? 'Reporting...' : 'Code Invalid - Open Dispute'}
        </button>
      </div>

      {/* Warning */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <AlertTriangle size={16} className="inline-block text-yellow-600 mr-1.5 align-text-bottom" /> <strong>Important:</strong> Only click "Release Bitcoin" after thoroughly testing the code. Once released, it cannot be reversed. If the code doesn't work, open a dispute immediately.
        </p>
      </div>
    </div>
  );
}