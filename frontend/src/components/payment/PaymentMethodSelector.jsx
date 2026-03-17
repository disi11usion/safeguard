import React from 'react';
import AppleGooglePayButton from './AppleGooglePayButton';
import PayPalButton from './PayPalButton';

/**
Apple Pay、Google Pay、PayPal
 */
const PaymentMethodSelector = ({
  amount,
  currency,
  planKey,
  planName,
  influencerCode = null,
  onExpressPaymentSuccess,
  onExpressPaymentError,
  children,
  showExpressCheckout = true,
  forceShowExpressCheckout = false
}) => {
  console.log('🎨 PaymentMethodSelector rendered', {
    amount,
    currency,
    planKey,
    showExpressCheckout,
    forceShowExpressCheckout
  });

  return (
    <div className="space-y-6">
      {/* Express Checkout (Apple Pay / Google Pay) */}
      {showExpressCheckout && (
        <div>
          <AppleGooglePayButton
            amount={amount}
            currency={currency}
            planKey={planKey}
            planName={planName}
            influencerCode={influencerCode}
            onSuccess={onExpressPaymentSuccess}
            onError={onExpressPaymentError}
            forceShow={forceShowExpressCheckout}
          />
        </div>
      )}

      {/* PayPal  */}
      {showExpressCheckout && (
        <div>
          <PayPalButton
            planKey={planKey}
            onSuccess={onExpressPaymentSuccess}
            onError={onExpressPaymentError}
          />
        </div>
      )}

      {/*  */}
      {showExpressCheckout && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">or pay with card</span>
          </div>
        </div>
      )}

      {/* visa card */}
      {children}
    </div>
  );
};

export default PaymentMethodSelector;
