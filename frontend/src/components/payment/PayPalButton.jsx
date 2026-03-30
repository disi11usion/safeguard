import React, { useEffect, useRef, useState } from 'react';
import { paymentService } from '../../services/paymentService';

const PayPalButton = ({ 
  planKey, 
  onSuccess, 
  onError,
  disabled = false 
}) => {
  const paypalRef = useRef(null);
  const buttonsRef = useRef(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    
    if (!clientId) {
      console.error('VITE_PAYPAL_CLIENT_ID is not defined');
      return;
    }

    if (window.paypal) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    script.async = true;

    script.onload = () => {
      console.log('PayPal SDK loaded');
      setSdkReady(true);
    };

    script.onerror = () => {
      console.error('Failed to load PayPal SDK');
      onError?.('Failed to load PayPal');
    };

    document.body.appendChild(script);

    return () => {
      // no-op
    };
  }, [onError]);

  useEffect(() => {
    if (!sdkReady || !window.paypal || !paypalRef.current) return;

    if (buttonsRef.current) {
      try {
        buttonsRef.current.close();
      } catch (e) {
        console.warn('PayPal buttons close failed:', e);
      }
      buttonsRef.current = null;
    }

    paypalRef.current.innerHTML = '';

    const buttons = window.paypal.Buttons({
      style: {
        layout: 'horizontal',
        color: 'gold',
        shape: 'rect',
        label: 'paypal',
        height: 48
      },

      createOrder: async () => {
        try {
          setLoading(true);
          console.log('Creating PayPal order...');
          const result = await paymentService.createPaypalOrder(planKey);
          
          if (result.success && result.order_id) {
            console.log('PayPal order created:', result.order_id);
            return result.order_id;
          }
          throw new Error(result.message || 'Failed to create order');
        } catch (error) {
          console.error('PayPal createOrder error:', error);
          onError?.(error.message || 'Failed to create PayPal order');
          throw error;
        } finally {
          setLoading(false);
        }
      },

      onApprove: async (data) => {
        try {
          setLoading(true);
          console.log('Capturing PayPal order:', data.orderID);
          const result = await paymentService.capturePaypalOrder(data.orderID);
          
          if (result.success) {
            console.log('PayPal payment captured:', result);
            onSuccess?.(result.capture_id);
            return;
          }
          throw new Error(result.message || 'Payment capture failed');
        } catch (error) {
          console.error('PayPal capture error:', error);
          onError?.(error.message || 'Failed to complete payment');
        } finally {
          setLoading(false);
        }
      },

      onCancel: () => {
        console.log('PayPal payment cancelled');
      },

      onError: (err) => {
        console.error('PayPal error:', err);
        onError?.('PayPal encountered an error');
      }
    });

    buttons.render(paypalRef.current);
    buttonsRef.current = buttons;

    return () => {
      if (buttonsRef.current) {
        try {
          buttonsRef.current.close();
        } catch (e) {
          console.warn('PayPal buttons close failed:', e);
        }
        buttonsRef.current = null;
      }
    };

  }, [sdkReady, planKey, onSuccess, onError]);

  if (!import.meta.env.VITE_PAYPAL_CLIENT_ID) {
    return null;
  }

  return (
    <div className="w-full">
      {loading && (
        <div className="flex items-center justify-center py-3">
          <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mr-2" />
          <span className="text-gray-600 text-sm">Processing...</span>
        </div>
      )}
      <div 
        ref={paypalRef} 
        className={`${loading ? 'opacity-50 pointer-events-none' : ''} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      />
    </div>
  );
};

export default PayPalButton;
