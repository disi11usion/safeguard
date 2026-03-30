import axios from 'axios';
import { getApiBaseUrl } from './apiBaseUrl';

// Use VITE_API_BASE when set; otherwise use same-origin (works with Cloudflare/ngrok tunnels via Vite proxy)
const API_BASE_URL = getApiBaseUrl();

console.log('🔗 API Base URL:', API_BASE_URL);

// ✅ 修改：支持 cryptoai_access_token
const getAuthToken = () => {
  return localStorage.getItem('cryptoai_access_token') || 
         localStorage.getItem('access_token') || 
         sessionStorage.getItem('cryptoai_access_token') ||
         sessionStorage.getItem('access_token');
};

// 配置 axios 实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 自动添加 token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔑 Token found:', token.substring(0, 30) + '...');
    } else {
      console.warn('⚠️  No token found in storage');
    }
    console.log('📤 API Request:', config.method.toUpperCase(), config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 处理错误
apiClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('❌ API Error:', error.response?.status, error.config?.url, error.response?.data);
    
    if (error.response?.status === 401) {
      console.warn('🔒 Unauthorized - clearing tokens and redirecting to login');
      localStorage.removeItem('access_token');
      localStorage.removeItem('cryptoai_access_token');
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('cryptoai_access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const paymentService = {
  /**
   * 创建 Payment Intent（✅ 新增：支持 Apple Pay / Google Pay）
   */
  async createPaymentIntent(planKey, currency = 'usd', influencerCode = null) {
    try {
      console.log('💳 Creating payment intent for:', planKey);
      const response = await apiClient.post('/v1/stripe/create-payment-intent', {
        plan_key: planKey,
        currency: currency.toLowerCase(),
        influencer_code: influencerCode,
      });
      console.log('✅ Payment Intent Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Create payment intent error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * 确认支付（✅ 现有方法，无需修改）
   */
  async confirmPayment(paymentIntentId) {
    try {
      console.log('✅ Confirming payment:', paymentIntentId);
      const response = await apiClient.post('/v1/stripe/confirm-payment', {
        payment_intent_id: paymentIntentId,
      });
      console.log('✅ Payment Confirmation Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Confirm payment error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * 创建 Checkout Session（✅ 新增：传统卡支付）
   */
  async createCheckoutSession(planKey, successUrl, cancelUrl, influencerCode = null) {
    try {
      console.log('🛒 Creating checkout session for:', planKey);
      const response = await apiClient.post('/v1/stripe/create-checkout-session', {
        plan_key: planKey,
        currency: 'USD',
        success_url: successUrl,
        cancel_url: cancelUrl,
        influencer_code: influencerCode,
      });
      console.log('✅ Checkout Session Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Create checkout session error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * 创建 PayPal 订单
   */
  async createPaypalOrder(planKey) {
    try {
      console.log('💰 Creating PayPal order for:', planKey);
      const response = await apiClient.post('/v1/paypal/create-order', {
        plan_key: planKey,
      });
      console.log('✅ PayPal Order Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Create PayPal order error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * 捕获 PayPal 订单
   */
  async capturePaypalOrder(orderId) {
    try {
      console.log('💰 Capturing PayPal order:', orderId);
      const response = await apiClient.post('/v1/paypal/capture-order', {
        order_id: orderId,
      });
      console.log('✅ PayPal Capture Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Capture PayPal order error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * 获取用户订阅信息
   */
  async getUserSubscription(username) {
    try {
      const response = await apiClient.get(`/v1/users/${username}/subscription`);
      return response.data;
    } catch (error) {
      console.error('❌ Get subscription error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * 获取交易历史
   */
  async getTransactions(username, limit = 10) {
    try {
      const response = await apiClient.get(`/v1/users/${username}/transactions`, {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      console.error('❌ Get transactions error:', error.response?.data || error.message);
      throw error;
    }
  },
};

export default paymentService;
