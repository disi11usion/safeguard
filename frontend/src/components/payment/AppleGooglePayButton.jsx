import React, { useState, useEffect } from 'react';
import { FaApple } from 'react-icons/fa';
import { SiGooglepay } from 'react-icons/si';
import { paymentService } from '../../services/paymentService';


const AppleGooglePayButton = ({
  amount,
  currency = 'usd',
  planKey,
  planName,
  influencerCode = null,
  onSuccess,
  onError,
  disabled = false,
  forceShow = false
}) => {
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [canMakePayment, setCanMakePayment] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReallySupported, setIsReallySupported] = useState(false); 

  useEffect(() => {
    console.log('🔍 AppleGooglePayButton useEffect', {
      hasStripe: !!window.Stripe,
      amount,
      disabled,
      forceShow
    });

    if (!window.Stripe || !amount || disabled) {
      console.warn('⚠️  Stripe not ready or amount missing');
      return;
    }

    try {
      const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      const stripe = window.Stripe(stripeKey);
      
      console.log('🍎 Creating Payment Request');

      const pr = stripe.paymentRequest({
        country: 'US',
        currency: currency.toLowerCase(),
        total: {
          label: planName || 'SafeGuard Subscription',
          amount: amount,
        },
        requestPayerName: true,
        requestPayerEmail: true,
      });

      pr.canMakePayment().then((result) => {
        console.log('✅ canMakePayment result:', result);

        const supportsExpress = !!(result && (result.applePay || result.googlePay));
        if (supportsExpress) {
          console.log('🎉 Device supports payment:', {
            applePay: result.applePay,
            googlePay: result.googlePay
          });
          setCanMakePayment(result);
          setPaymentRequest(pr);
          setIsReallySupported(true);
        } else if (forceShow) {
          
          console.log('🧪 Force show mode: displaying buttons for testing');
          setCanMakePayment({
            applePay: true,
            googlePay: true,
          });
          setPaymentRequest(null);
          setIsReallySupported(false); 
        } else {
          console.warn('❌ Apple Pay / Google Pay not available on this domain/device');
          setCanMakePayment(null);
          setPaymentRequest(null);
          setIsReallySupported(false);
        }
      }).catch((err) => {
        console.error('❌ Error checking payment support:', err);
        if (forceShow) {
          console.log('🧪 Force show mode: displaying buttons despite error');
          setCanMakePayment({
            applePay: true,
            googlePay: true,
          });
          setPaymentRequest(null);
          setIsReallySupported(false);
        } else {
          setCanMakePayment(null);
        }
      });

     
      if (pr) {
        pr.on('paymentmethod', async (ev) => {
          try {
            setIsProcessing(true);
            console.log('💳 Payment method received:', ev.paymentMethod.id);

            const paymentIntentData = await paymentService.createPaymentIntent(planKey, currency, influencerCode);

            if (!paymentIntentData.success || !paymentIntentData.client_secret) {
              throw new Error(paymentIntentData.error || 'Failed to create payment intent');
            }

            console.log('✅ Payment Intent created:', paymentIntentData.payment_intent_id);

            const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
              paymentIntentData.client_secret,
              {
                payment_method: ev.paymentMethod.id,
              },
              { handleActions: false }
            );

            if (confirmError) {
              console.error('❌ Payment confirmation failed:', confirmError.message);
              ev.complete('fail');
              if (onError) onError(confirmError.message);
              setIsProcessing(false);
            } else {
              console.log('✅ Payment confirmed:', paymentIntent.id);
              ev.complete('success');

              const confirmData = await paymentService.confirmPayment(paymentIntent.id);

              if (confirmData.success) {
                console.log('✅ Payment verification successful');
                if (onSuccess) onSuccess(paymentIntent.id);
              } else {
                throw new Error(confirmData.error || 'Payment confirmation failed');
              }
            }
          } catch (error) {
            console.error('❌ Payment error:', error);
            ev.complete('fail');
            if (onError) onError(error.message || 'Payment failed');
            setIsProcessing(false);
          }
        });
      }

      return () => {
        if (pr) {
          pr.off('paymentmethod');
        }
      };
    } catch (error) {
      console.error('❌ Error initializing payment request:', error);
    }
  }, [amount, currency, planKey, planName, influencerCode, onSuccess, onError, disabled, forceShow]);

  if (!canMakePayment) {
    console.log('🚫 Not rendering payment buttons');
    return null;
  }

  const isApplePay = canMakePayment?.applePay;
  const isGooglePay = canMakePayment?.googlePay;

  console.log('✅ Rendering payment buttons:', { 
    isApplePay, 
    isGooglePay, 
    isReallySupported 
  });


  const handlePaymentClick = (method) => {
  if (!isReallySupported) {
    const message = `
🧪 Test Mode Notification

${method} is not available on this device.

To test ${method} in a real environment:
${method === 'Apple Pay' ? 
  '• Use an iPhone, iPad, or Mac with Safari' : 
  '• Use an Android device with Chrome\n• Add a payment card to Google Pay'
}
• Ensure you're on an HTTPS connection

This button is displayed for UI testing purposes only.
    `.trim();
    
    alert(message);
    console.log(`🧪 Test mode: ${method} button clicked (not supported on this device)`);
    return;
  }
  
  if (!paymentRequest) {
    console.error('❌ Payment request not initialized');
    if (onError) onError('Payment system not ready');
    return;
  }

  console.log(`🍎 ${method} button clicked - showing payment sheet`);
 
  paymentRequest.show();
};

  return (
    <div className="space-y-3">
      {/* Apple Pay buttom */}
      {isApplePay && (
        <button
          type="button"
          onClick={() => handlePaymentClick('Apple Pay')}
          disabled={disabled || isProcessing}
          className={`w-full py-4 bg-black text-white rounded-xl font-semibold text-center hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            !isReallySupported ? 'opacity-75' : ''
          }`}
          title={!isReallySupported ? 'Test mode - not available on this device' : ''}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <FaApple className="text-2xl" />
              <span>Pay with Apple Pay</span>
              {!isReallySupported && <span className="text-xs ml-2">(Test Mode)</span>}
            </>
          )}
        </button>
      )}

      {/* Google Pay buttom */}
      {isGooglePay && (
        <button
          type="button"
          onClick={() => handlePaymentClick('Google Pay')}
          disabled={disabled || isProcessing}
          className={`w-full py-4 bg-white border-2 border-gray-300 text-gray-900 rounded-xl font-semibold text-center hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            !isReallySupported ? 'opacity-75' : ''
          }`}
          title={!isReallySupported ? 'Test mode - not available on this device' : ''}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <SiGooglepay className="text-2xl text-blue-600" />
              <span>Pay with Google Pay</span>
              {!isReallySupported && <span className="text-xs ml-2">(Test Mode)</span>}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default AppleGooglePayButton;
