import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

const TradeDisplay = ({
  usdAmount = 100,
  sellerRate = 85221,
  paymentMethod = 'mtn',
  localCurrency: initialLocalCurrency,
  exchangeRate: initialExchangeRate,
  showBreakdown = true
}) => {
  const [localCurrency, setLocalCurrency] = useState(initialLocalCurrency || 'GHS');
  const [exchangeRate, setExchangeRate] = useState(initialExchangeRate || 11.09);

  // Calculate BTC amount based on seller's rate
  const btcAmount = usdAmount / sellerRate;
  const fee = btcAmount * 0.005;
  const btcAfterFee = btcAmount - fee;

  // Format local currency
  const formatLocal = (usdValue) => {
    const localAmount = usdValue * exchangeRate;
    return `${getCurrencySymbol(localCurrency)}${localAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  };

  // Get currency symbol
  const getCurrencySymbol = (currency) => {
    const symbols = {
      GHS: '₵',
      NGN: '₦',
      KES: 'KSh',
      ZAR: 'R',
      UGX: 'USh',
      TZS: 'TSh',
      USD: '$',
      GBP: '£',
      EUR: '€',
      XAF: 'CFA',
      XOF: 'CFA'
    };
    return symbols[currency] || '$';
  };

  useEffect(() => {
    const detectCurrency = async () => {
      try {
        // Check payment method first
        if (paymentMethod === 'mtn' || paymentMethod === 'vodafone' || paymentMethod === 'airteltigo') {
          setLocalCurrency('GHS');
          setExchangeRate(11.09);
          return;
        }

        // Otherwise detect from IP
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();

        const forexRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const forexData = await forexRes.json();

        setLocalCurrency(data.currency || 'USD');
        setExchangeRate(forexData.rates[data.currency] || 1);
      } catch (error) {
        console.error('Currency detection failed:', error);
      }
    };

    if (!initialLocalCurrency || !initialExchangeRate) {
      detectCurrency();
    }
  }, [paymentMethod, initialLocalCurrency, initialExchangeRate]);

  return (
    <div className="space-y-4">
      {/* You Pay Section */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">You Pay:</span>
          <div className="text-right">
            <div className="text-xl font-bold">${usdAmount} USD</div>
            <div className="text-sm text-gray-500">(≈ {formatLocal(usdAmount)})</div>
          </div>
        </div>
      </div>

      {/* You Receive Section */}
      <div className="bg-green-50 p-4 rounded-xl border border-green-200">
        <div className="text-center">
          <span className="text-green-700 font-bold text-lg">You will receive:</span>
          <div className="text-2xl font-bold text-green-700 mt-2">₿ {btcAfterFee.toFixed(8)} BTC</div>
          <div className="text-sm text-green-600 font-semibold">
            (≈ ${(usdAmount * 0.995).toFixed(2)} USD / {formatLocal(usdAmount * 0.995)})
          </div>
        </div>
      </div>

      {/* Rate Info */}
      <div className="flex justify-between text-sm text-gray-600">
        <span>Rate per BTC:</span>
        <span>{formatLocal(sellerRate)} (+5%)</span>
      </div>

      {/* Escrow Breakdown */}
      {showBreakdown && (
        <div className="border-t pt-3 mt-3">
          <h4 className="font-semibold mb-2 text-sm flex items-center gap-1.5"><Lock size={13} /> Escrow Breakdown</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>You send (BTC):</span>
              <span>₿ {btcAmount.toFixed(8)}</span>
            </div>
            <div className="flex justify-between">
              <span>Platform fee (0.5%):</span>
              <span>₿ {fee.toFixed(8)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
              <span>Total locked:</span>
              <span>₿ {btcAmount.toFixed(8)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeDisplay;