import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTimesCircle, FaArrowLeft, FaRedo, FaQuestionCircle } from 'react-icons/fa';
import { motion } from 'framer-motion';

const PaymentCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-red-500 to-orange-600 p-8 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <FaTimesCircle className="text-white text-7xl mx-auto mb-4 drop-shadow-lg" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Payment Cancelled
          </h1>
          <p className="text-red-100">
            No charges were made
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-gray-600 text-center mb-6">
            Your payment was not completed. Don't worry, you haven't been charged anything.
          </p>

          {/* Info Box */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-6"
          >
            <div className="flex items-start gap-3">
              <FaQuestionCircle className="text-yellow-600 text-xl flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800 mb-1">
                  What happened?
                </p>
                <p className="text-sm text-yellow-700">
                  You cancelled the payment process or closed the payment window. 
                  Your selection is still saved if you'd like to try again.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Reasons List */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              Common reasons for cancellation:
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Changed your mind about the plan
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Want to compare other options
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Accidentally clicked the wrong button
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Need to check payment details
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/pricing')}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <FaRedo />
              Try Again
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/dashboard')}
              className="w-full border-2 border-gray-300 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <FaArrowLeft />
              Back to Dashboard
            </motion.button>
          </div>

          {/* Support Section */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-xs text-blue-800 mb-2">
              <strong>Need help?</strong>
            </p>
            <p className="text-xs text-blue-700">
              Contact our support team at{' '}
              <a 
                href="mailto:support@safeguard.com" 
                className="font-semibold underline hover:text-blue-900"
              >
                support@safeguard.com
              </a>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PaymentCancel;