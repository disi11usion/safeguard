import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { FaCheckCircle, FaArrowRight, FaReceipt } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { getApiBaseUrl, joinUrl } from '../services/apiBaseUrl';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const stateIntentId = location.state?.paymentIntentId || null;

    if (stateIntentId) {
      setPaymentIntentId(stateIntentId);
      setLoading(false);
      return;
    }

    if (sessionId) {
      verifyPaymentSession(sessionId);
    } else {
      setLoading(false);
    }
  }, [searchParams, location.state]);

  const verifyPaymentSession = async (sessionId) => {


    try {
      const token = localStorage.getItem('cryptoai_access_token') || 
                    localStorage.getItem('access_token');

      if (!token) {
        console.warn('No auth token found');
        setLoading(false);
        return;
      }

      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(joinUrl(apiBaseUrl, `/v1/stripe/verify-session/${sessionId}`), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
  const data = await response.json();
  setSessionData(data);


console.log("🟣 FULL SESSION DATA FROM BACKEND:", data);
console.log("🟣 INFLUENCER CODE FIELD:", data.influencer_code);

  // ===== COMMISSION TRIGGER =====
  await fetch(joinUrl(apiBaseUrl, "/api/billing/record-purchase"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      provider: "stripe",
      provider_payment_id: data.transaction_id,
      amount_cents: data.amount || 1999,
      currency: "USD"
    })
  });
}
      
      else {
        console.error('Failed to verify session:', response.status);
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasDetails = Boolean(sessionData || paymentIntentId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12">
            <div className="w-16 h-16 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600 font-medium">Verifying your payment...</p>
            <p className="text-gray-400 text-sm mt-2">Please wait a moment</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              >
                <FaCheckCircle className="text-white text-7xl mx-auto mb-4 drop-shadow-lg" />
              </motion.div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Payment Successful!
              </h1>
              <p className="text-green-100">
                Your subscription is now active
              </p>
            </div>

            <div className="p-8">
              <p className="text-gray-600 text-center mb-6">
                Thank you for your purchase! Your subscription has been activated successfully.
              </p>

              {hasDetails && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-gray-50 rounded-xl p-6 mb-6 border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <FaReceipt className="text-gray-400" />
                    <h3 className="font-semibold text-gray-700">Order Details</h3>
                  </div>
                  <div className="space-y-3">
                    {sessionData?.plan_name && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Plan:</span>
                        <span className="font-semibold text-gray-900">
                          {sessionData.plan_name}
                        </span>
                      </div>
                    )}
                    {sessionData?.amount && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Amount:</span>
                        <span className="font-semibold text-gray-900">
                          ${(sessionData.amount / 100).toFixed(2)} USD
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-semibold text-gray-900">
                        {new Date().toLocaleDateString()}
                      </span>
                    </div>
                    {paymentIntentId && (
                      <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                        <span className="text-gray-600">Payment Intent:</span>
                        <span className="font-mono text-xs text-gray-900">
                          {String(paymentIntentId).substring(0, 20)}...
                        </span>
                      </div>
                    )}
                    {sessionData?.subscription_id && (
                      <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                        <span className="text-gray-600">Subscription ID:</span>
                        <span className="font-mono text-xs text-gray-900">
                          {String(sessionData.subscription_id).substring(0, 20)}...
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  Go to Dashboard
                  <FaArrowRight />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/pricing')}
                  className="w-full border-2 border-gray-300 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                >
                  View Other Plans
                </motion.button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800 text-center">
                  ?? A confirmation email has been sent to your registered email address.
                </p>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default PaymentSuccess;
