import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaCheck, FaTimes, FaBitcoin, FaCrown, FaRocket, FaBuilding, FaTag, FaInfoCircle } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getApiBaseUrl, joinUrl } from '../services/apiBaseUrl';

const Pricing = () => {
  const [planType, setPlanType] = useState('personal'); // 'personal' or 'business'
  const [influencerCode, setInfluencerCode] = useState('');
  const [codeValidated, setCodeValidated] = useState(null);
  const [codeMessage, setCodeMessage] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth(); // 获取当前登录用户

  const validateInfluencerCode = async (code) => {
    if (!code.trim()) {
      setCodeValidated(null);
      setCodeMessage('');
      return;
    }
    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(joinUrl(apiBaseUrl, `/v1/influencers/validate?code=${encodeURIComponent(code)}`));
      if (!response.ok) throw new Error('Failed to validate code');
      const data = await response.json();
      if (data?.valid) {
        setCodeValidated(true);
        setCodeMessage('Valid code! You\'ll receive special perks and discounts.');
      } else {
        setCodeValidated(false);
        setCodeMessage('Invalid influencer code. Please check and try again.');
      }
    } catch (error) {
      setCodeValidated(false);
      setCodeMessage('Unable to validate influencer code right now.');
    }
  };

  const formatPriceFromCents = (cents) => {
    if (cents === null || cents === undefined) return null;
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatYearlyPriceFromCents = (cents) => {
    if (cents === null || cents === undefined) return null;
    const dollars = cents / 100;
    const whole = Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2);
    return `$${whole}`;
  };

  // Personal Plans: Free & Basic
  const personalPlans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'forever',
      yearlyPrice: null,
      description: 'Perfect for getting started',
      icon: <FaBitcoin />,
      features: [
        '5 News analyses',
        '5 Social media analyses',
        'Unlimited data access',
        'Limited psychological analysis',
        'Email support'
      ],
      buttonText: 'Your current plan',
      buttonVariant: 'secondary',
      isCurrentPlan: true,
      disabled: false
    },
    {
      id: 'basic',
      name: 'Basic',
      price: '$19.99',
      period: 'USD / month',
      yearlyPrice: '$149',
      yearlyPeriod: '/ year',
      description: 'Maximize your productivity',
      icon: <FaRocket />,
      features: [
        'Unlimited News Analysis',
        'Unlimited Social media analyses',
        'Full Basic feature set',
        'Real-time price updates',
        'Priority email support',
        'Custom watchlists',
        'Price alerts'
      ],
      buttonText: 'Get Basic',
      buttonVariant: 'primary',
      isCurrentPlan: false,
      disabled: false
    }
  ];

  // Business Plans: Premium & Enterprise
  const businessPlans = [
    {
      id: 'premium',
      name: 'Premium',
      price: '$49.99',
      period: 'USD / month',
      yearlyPrice: '$375',
      yearlyPeriod: '/ year',
      description: 'Advanced features for power users',
      icon: <FaCrown />,
      features: [
        'All Basic features included',
        'Advanced analysis modules',
        'Higher usage limits',
        'Priority support',
        'Advanced analytics',
        'API access',
        'Custom integrations'
      ],
      buttonText: 'Get Premium',
      buttonVariant: 'primary',
      isCurrentPlan: false,
      disabled: false
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: '$25',
      period: 'USD / month per user',
      yearlyPrice: null,
      description: 'Get more done with AI for teams',
      icon: <FaBuilding />,
      features: [
        'Multi-user access',
        'Custom pricing and reporting',
        'Dedicated account manager',
        'SLA guarantee',
        'On-premise deployment option',
        'SSO & advanced security',
        'Priority 24/7 support'
      ],
      buttonText: 'Contact Sales',
      buttonVariant: 'primary',
      isCurrentPlan: false,
      disabled: false,
      recommended: true
    }
  ];

  const [planDetails, setPlanDetails] = useState({
    personal: personalPlans,
    business: businessPlans
  });

  const currentPlans = planType === 'personal' ? planDetails.personal : planDetails.business;

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

        const updates = {
          personal: [...personalPlans],
          business: [...businessPlans]
        };

        const planMap = data.plans.reduce((acc, plan) => {
          acc[plan.plan_key] = plan;
          return acc;
        }, {});

        const applyPricing = (plans) =>
          plans.map((plan) => {
            if (plan.id === 'free') return plan;

            const monthlyKey = `${plan.id}_monthly`;
            const yearlyKey = `${plan.id}_yearly`;
            const monthlyPlan = planMap[monthlyKey];
            const yearlyPlan = planMap[yearlyKey];

            return {
              ...plan,
              price: monthlyPlan ? formatPriceFromCents(monthlyPlan.price_cents) : plan.price,
              yearlyPrice: yearlyPlan ? formatYearlyPriceFromCents(yearlyPlan.price_cents) : plan.yearlyPrice
            };
          });

        updates.personal = applyPricing(updates.personal);
        updates.business = applyPricing(updates.business);

        if (!cancelled) setPlanDetails(updates);
      } catch (err) {
        console.error('Failed to load plan pricing:', err);
      }
    };

    loadPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlanSelect = (planId) => {
    console.log('handlePlanSelect called with:', planId);
    console.log('Current user:', user);
    
    if (planId === 'free') {
      // Free 套餐：未登录去注册，已登录去 dashboard
      if (user) {
        navigate('/dashboard');
      } else {
        navigate('/signup');
      }
    } else if (planId === 'basic' || planId === 'premium') {
      // Basic 套餐：未登录去注册（带套餐信息），已登录直接去 Checkout
      console.log('Paid plan selected, user is:', user ? 'logged in' : 'not logged in');
      if (user) {
        console.log('Navigating to checkout...');
        navigate('/checkout', { 
          state: { 
            plan: planId, 
            billingCycle: 'monthly',
            influencerCode: influencerCode 
          } 
        });
      } else {
        // 未登录，先去注册，注册后再跳转
        navigate('/signup', { 
          state: { 
            plan: planId, 
            redirectToCheckout: true,
            influencerCode: influencerCode 
          } 
        });
      }
    } else if (planId === 'enterprise') {
      window.location.href = 'mailto:sales@safeguard.com?subject=Enterprise Plan Inquiry';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] via-[#1a1a2e] to-[#16213e] py-20 px-4 text-white">
      <div className="container mx-auto max-w-5xl">
        {/* Header Section */}
        <motion.div 
          className="text-center mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-5 bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">
            Upgrade Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Select the perfect plan for your cryptocurrency tracking needs
          </p>
        </motion.div>

        {/* Personal / Business Toggle */}
        <motion.div 
          className="flex justify-center items-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="bg-white/10 rounded-full p-1 flex">
            <button
              onClick={() => setPlanType('personal')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                planType === 'personal' 
                  ? 'bg-white text-gray-900' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Personal
            </button>
            <button
              onClick={() => setPlanType('business')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                planType === 'business' 
                  ? 'bg-white text-gray-900' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Business
            </button>
          </div>
        </motion.div>



        {/* Pricing Cards - 2 columns like the reference */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          key={planType}
        >
          {currentPlans.map((plan, index) => (
            <motion.div
              key={plan.id}
              className={`relative bg-white/5 border rounded-2xl p-8 backdrop-blur-sm transition-all overflow-hidden ${
                plan.disabled 
                  ? 'opacity-70 border-white/10' 
                  : plan.recommended 
                    ? 'border-[#667eea] border-2' 
                    : 'border-white/10 hover:border-white/20'
              }`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
              whileHover={!plan.disabled ? { y: -5 } : {}}
            >
              {/* Recommended Badge */}
              {plan.recommended && (
                <div className="absolute top-4 right-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-3 py-1 rounded-full text-xs font-semibold">
                  RECOMMENDED
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                
                {/* Price Display */}
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                  {plan.yearlyPrice && (
                    <>
                      <span className="text-gray-500 mx-2">|</span>
                      <span className="text-2xl font-bold text-green-400">{plan.yearlyPrice}</span>
                      <span className="text-gray-400 text-sm">{plan.yearlyPeriod}</span>
                    </>
                  )}
                </div>
                
                <p className="text-muted-foreground">{plan.description}</p>
              </div>

              {/* Button */}
              <motion.button
                className={`w-full py-3 px-6 mb-8 font-semibold rounded-xl transition-all ${
                  plan.isCurrentPlan
                    ? 'bg-transparent border border-white/20 text-gray-400 cursor-default'
                    : plan.disabled
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : plan.recommended || plan.buttonVariant === 'primary'
                        ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:from-[#5a6fd8] hover:to-[#6a4190] hover:shadow-lg hover:shadow-[#667eea]/30'
                        : 'bg-white/10 text-white border border-white/20 hover:bg-white/15'
                }`}
                onClick={() => !plan.disabled && !plan.isCurrentPlan && handlePlanSelect(plan.id)}
                whileHover={!plan.disabled && !plan.isCurrentPlan ? { scale: 1.02 } : {}}
                whileTap={!plan.disabled && !plan.isCurrentPlan ? { scale: 0.98 } : {}}
                disabled={plan.disabled || plan.isCurrentPlan}
              >
                {plan.buttonText}
              </motion.button>

              {/* Features List */}
              <ul className="space-y-3">
                {plan.features.map((feature, featureIndex) => (
                  <motion.li
                    key={featureIndex}
                    className="flex items-start text-gray-300 text-sm"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + featureIndex * 0.05 }}
                  >
                    <FaCheck className={`mr-3 flex-shrink-0 mt-0.5 ${plan.disabled ? 'text-gray-500' : 'text-green-400'}`} />
                    <span className={plan.disabled ? 'text-gray-500' : ''}>{feature}</span>
                  </motion.li>
                ))}
              </ul>

              {/* Footer Links */}
              {!plan.disabled && (
                <div className="mt-6 pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500">
                    {plan.id === 'enterprise' ? (
                      'Unlimited subject to usage guidelines.'
                    ) : (
                      'Limits may apply.'
                    )}
                    {' '}
                    <span className="text-[#667eea] cursor-pointer hover:underline">Learn more</span>
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* Influencer Program Info */}
        <motion.div 
          className="max-w-4xl mx-auto mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="bg-gradient-to-r from-[#667eea]/10 to-[#764ba2]/10 border border-[#667eea]/30 rounded-2xl p-8">
            <h3 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
              <FaTag className="text-[#667eea]" />
              Influencer Program
            </h3>
            <p className="text-muted-foreground mb-4">
              Are you a crypto influencer? Join our partner program and earn <span className="text-[#667eea] font-semibold">30% commission</span> on every subscription made with your unique code.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <FaCheck className="text-green-400" />
                Unique influencer code assigned to you
              </li>
              <li className="flex items-center gap-2">
                <FaCheck className="text-green-400" />
                30% revenue share on all referrals
              </li>
              <li className="flex items-center gap-2">
                <FaCheck className="text-green-400" />
                Real-time commission tracking dashboard
              </li>
              <li className="flex items-center gap-2">
                <FaCheck className="text-green-400" />
                Monthly payouts via your preferred method
              </li>
            </ul>
            <motion.button
              className="mt-6 px-6 py-3 bg-transparent border-2 border-[#667eea] text-[#667eea] font-semibold rounded-xl hover:bg-[#667eea]/10 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = 'mailto:partners@safeguard.com?subject=Influencer Program Inquiry'}
            >
              Apply to Become an Influencer Partner
            </motion.button>
          </div>

          {/* Influencer Code Input - Below Influencer Program */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm mt-6">
            <div className="flex items-center gap-2 mb-3">
              <FaTag className="text-[#667eea]" />
              <span className="text-white font-semibold">Have an Influencer Code?</span>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Enter code (e.g., URSH-01)"
                  value={influencerCode}
                  onChange={(e) => {
                    setInfluencerCode(e.target.value.toUpperCase());
                    setCodeValidated(null);
                    setCodeMessage('');
                  }}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                    codeValidated === true 
                      ? 'border-green-500 focus:ring-green-500/50' 
                      : codeValidated === false 
                        ? 'border-red-500 focus:ring-red-500/50' 
                        : 'border-white/20 focus:ring-[#667eea]/50'
                  }`}
                />
                {codeValidated === true && (
                  <FaCheck className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
                )}
                {codeValidated === false && (
                  <FaTimes className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" />
                )}
              </div>
              <motion.button
                onClick={() => validateInfluencerCode(influencerCode)}
                className="px-6 py-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white font-semibold rounded-xl hover:from-[#5a6fd8] hover:to-[#6a4190] transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Apply
              </motion.button>
            </div>
            {codeMessage && (
              <motion.p 
                className={`mt-2 text-sm flex items-center gap-1 ${codeValidated ? 'text-green-400' : 'text-red-400'}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <FaInfoCircle />
                {codeMessage}
              </motion.p>
            )}
            <p className="mt-3 text-xs text-gray-400">
              Enter an influencer code to receive special discounts and perks on your subscription.
            </p>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div 
          className="max-w-5xl mx-auto mt-24"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <h2 className="text-center text-4xl font-bold mb-12 text-white">
            Frequently Asked Questions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm transition-all hover:bg-white/8 hover:-translate-y-1">
              <h4 className="text-lg font-semibold mb-3 text-white">Can I change my plan anytime?</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm transition-all hover:bg-white/8 hover:-translate-y-1">
              <h4 className="text-lg font-semibold mb-3 text-white">Is there a free trial?</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Yes, all paid plans come with a 7-day free trial. No credit card required to start.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm transition-all hover:bg-white/8 hover:-translate-y-1">
              <h4 className="text-lg font-semibold mb-3 text-white">How do influencer codes work?</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Enter a valid influencer code during signup or checkout to receive special discounts. The influencer earns a 30% commission on your subscription.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm transition-all hover:bg-white/8 hover:-translate-y-1">
              <h4 className="text-lg font-semibold mb-3 text-white">What payment methods do you accept?</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We accept all major credit cards, PayPal, and cryptocurrency payments.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Pricing; 
