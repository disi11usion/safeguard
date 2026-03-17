import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { FaArrowLeft, FaCheck, FaCreditCard, FaLock, FaShieldAlt } from 'react-icons/fa';
import PaymentMethodSelector from '../components/payment/PaymentMethodSelector';
import { paymentService } from '../services/paymentService';
import { getApiBaseUrl, joinUrl } from '../services/apiBaseUrl';

// Load Stripe.js (CDN)
const loadStripeFromCDN = () => {
  return new Promise((resolve, reject) => {
    if (window.Stripe) {
      console.log('Stripe already loaded');
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;

    script.onload = () => {
      const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!key) {
        console.error('VITE_STRIPE_PUBLISHABLE_KEY is not defined');
        reject(new Error('Stripe key not configured'));
        return;
      }
      console.log('Stripe loaded from CDN with key:', key.substring(0, 20) + '...');
      resolve(true);
    };

    script.onerror = () => {
      console.error('Failed to load Stripe.js from CDN');
      reject(new Error('Failed to load Stripe'));
    };

    document.head.appendChild(script);
  });
};

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, billingCycle: initialBillingCycle, influencerCode } = location.state || {};

  const [selectedBilling, setSelectedBilling] = useState(initialBillingCycle || 'monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    loadStripeFromCDN()
      .then(() => {
        console.log('Stripe loaded successfully');
        setStripeLoaded(true);
        setStripeLoading(false);
      })
      .catch((err) => {
        console.error('Stripe loading error:', err);
        setError('Failed to initialize payment system');
        setStripeLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!plan) {
      setRedirecting(true);
      navigate('/pricing', { replace: true });
    }
  }, [plan, navigate]);

  const initialPlanDetails = {
    basic: {
      name: 'Basic',
      plan_key_monthly: 'basic_monthly',
      plan_key_yearly: 'basic_yearly',
      monthlyPrice: 1999,
      yearlyPrice: 14900,
      features: [
        'Unlimited News Analysis',
        'Unlimited Social Media Analyses',
        'Real-time Price Updates',
        'Priority Email Support',
        'Custom Watchlists',
        'Price Alerts'
      ]
    },
    premium: {
      name: 'Premium',
      plan_key_monthly: 'premium_monthly',
      plan_key_yearly: 'premium_yearly',
      monthlyPrice: 4999,
      yearlyPrice: 37500,
      features: [
        'All Basic features included',
        'Advanced analysis modules',
        'Higher usage limits',
        'Priority support',
        'Advanced analytics',
        'API access',
        'Custom integrations'
      ]
    },
    enterprise: {
      name: 'Enterprise',
      plan_key_monthly: 'enterprise_monthly',
      plan_key_yearly: null,
      monthlyPrice: 2500,
      yearlyPrice: null,
      features: [
        'Multi-user access',
        'Custom pricing and reporting',
        'Dedicated account manager',
        'SLA guarantee',
        'On-premise deployment option',
        'SSO & advanced security',
        'Priority 24/7 support'
      ]
    }
  };

  const [planDetails, setPlanDetails] = useState(initialPlanDetails);
  const currentPlan = planDetails[plan] || planDetails.basic;
  const hasYearly = currentPlan.yearlyPrice !== null && currentPlan.yearlyPrice !== undefined;
  const isYearly = selectedBilling === 'yearly' && hasYearly;
  const planKey = isYearly ? currentPlan.plan_key_yearly : currentPlan.plan_key_monthly;
  const priceInCents = isYearly ? currentPlan.yearlyPrice : currentPlan.monthlyPrice;
  const priceDisplay = (priceInCents / 100).toFixed(2);
  const monthlySavings = isYearly 
    ? ((currentPlan.monthlyPrice * 12 - currentPlan.yearlyPrice) / 100).toFixed(2) 
    : null;

  useEffect(() => {
    if (!hasYearly && selectedBilling === 'yearly') {
      setSelectedBilling('monthly');
    }
  }, [hasYearly, selectedBilling]);

  useEffect(() => {
    let cancelled = false;
    const loadPlans = async () => {
      try {
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(joinUrl(apiBaseUrl, '/v1/plans'));
        if (!response.ok) throw new Error('Failed to load plans');
        const data = await response.json();
        if (!data?.success || !Array.isArray(data.plans)) {
          throw new Error('Invalid plans response');
        }

        const nextDetails = { ...initialPlanDetails };
        data.plans.forEach((planItem) => {
          const tier = planItem.tier;
          if (!nextDetails[tier]) return;
          if (planItem.billing_cycle === 'monthly') {
            nextDetails[tier] = {
              ...nextDetails[tier],
              plan_key_monthly: planItem.plan_key,
              monthlyPrice: planItem.price_cents
            };
          }
          if (planItem.billing_cycle === 'yearly') {
            nextDetails[tier] = {
              ...nextDetails[tier],
              plan_key_yearly: planItem.plan_key,
              yearlyPrice: planItem.price_cents
            };
          }
        });

        if (!cancelled) setPlanDetails(nextDetails);
      } catch (err) {
        console.error('Failed to load plan pricing:', err);
      }
    };

    loadPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExpressPaymentSuccess = (paymentIntentId) => {
    console.log('Express payment succeeded:', paymentIntentId);
    navigate('/payment/success', {
      state: { 
        paymentIntentId,
        plan: currentPlan.name,
        billingCycle: selectedBilling
      }
    });
  };

  const handleExpressPaymentError = (errorMessage) => {
    console.error('Express payment failed:', errorMessage);
    setError(errorMessage);
    setTimeout(() => setError(null), 3000);
  };

  const handleCardPayment = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Starting card payment for:', planKey);

      const data = await paymentService.createCheckoutSession(
        planKey,
        `${window.location.origin}/payment/success`,
        `${window.location.origin}/payment/cancel`,
        influencerCode
      );

      if (data.success && data.session_url) {
        console.log('Redirecting to Stripe Checkout:', data.session_url);
        window.location.href = data.session_url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  if (redirecting) return null;

  if (stripeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading payment system...</p>
        </div>
      </div>
    );
  }

  if (!stripeLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Payment System Error</h3>
          <p className="text-red-600 text-sm mb-4">
            {error || 'Unable to load payment system.'}
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Return to Pricing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left: Plan Info */}
      <div className="w-full md:w-[45%] bg-gradient-to-br from-[#0f0f23] via-[#1a1a2e] to-[#16213e] p-8 md:p-12">
        <Link 
          to="/pricing" 
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <FaArrowLeft />
          <span>Return to Pricing</span>
        </Link>

        <motion.div 
          className="mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl text-gray-400 mb-2">Subscribe to SafeGuard</h1>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-5xl font-bold text-white">${priceDisplay}</span>
            <span className="text-gray-400 text-xl">/{isYearly ? 'year' : 'month'}</span>
          </div>
          {monthlySavings && (
            <p className="text-green-400 text-sm">
              Save ${monthlySavings} compared to monthly billing
            </p>
          )}
        </motion.div>

        <motion.div 
          className="mt-8 bg-white/5 border border-white/10 rounded-xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <FaShieldAlt className="text-blue-400" />
            {currentPlan.name} Plan Includes
          </h3>
          <ul className="space-y-3">
            {currentPlan.features.map((feature, index) => (
              <motion.li 
                key={index}
                className="flex items-start gap-3 text-gray-300 text-sm"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.3 + index * 0.1 }}
              >
                <FaCheck className="text-green-400 mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedBilling('monthly')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                !isYearly
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setSelectedBilling('yearly')}
              disabled={!hasYearly}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                isYearly
                  ? 'bg-blue-600 text-white'
                  : hasYearly
                    ? 'text-gray-400 hover:text-white'
                    : 'text-gray-600 cursor-not-allowed'
              }`}
            >
              Yearly
              {monthlySavings && (
                <span className="block text-xs text-green-400 mt-1">Save ${monthlySavings}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Payment */}
      <div className="w-full md:w-[55%] bg-white p-8 md:p-12 flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose payment method</h2>
          <p className="text-gray-600 mb-8">Select how you'd like to pay</p>

          {error && (
            <motion.div 
              className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-red-600 text-sm">{error}</p>
            </motion.div>
          )}

          <PaymentMethodSelector
            amount={priceInCents}
            currency="USD"
            planKey={planKey}
            planName={`${currentPlan.name} - ${isYearly ? 'Yearly' : 'Monthly'}`}
            influencerCode={influencerCode}
            onExpressPaymentSuccess={handleExpressPaymentSuccess}
            onExpressPaymentError={handleExpressPaymentError}
            showExpressCheckout={true}
          >
            <button
              onClick={handleCardPayment}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold text-center hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <FaCreditCard />
                  <span>Pay with Card</span>
                </>
              )}
            </button>
          </PaymentMethodSelector>

          <div className="mt-8 flex items-center justify-center gap-2 text-gray-500 text-sm">
            <FaLock />
            <span>Secure payment powered by Stripe</span>
          </div>

          <p className="mt-4 text-xs text-gray-500 text-center">
            By completing your purchase, you agree to our Terms of Service and Privacy Policy.
            Your subscription will auto-renew unless you cancel.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
