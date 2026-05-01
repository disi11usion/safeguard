import { getApiBaseUrl, joinUrl } from './apiBaseUrl';

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async makeRequest(endpoint, options = {}, type = '/v1') {
    const normalizedBase = (this.baseURL || '').replace(/\/+$/, '');
    const normalizedType = type
      ? (type.startsWith('/') ? type : `/${type}`)
      : '';
    const effectiveType =
      normalizedType && normalizedBase.endsWith(normalizedType)
        ? ''
        : normalizedType;

    const url = joinUrl(this.baseURL, `${effectiveType}${endpoint}`);

    console.log(`[API Service] Requesting from ${url}`);
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for JWT token
    };

    const config = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let errorText = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (typeof errorData === 'object') {
            errorText += `\n${JSON.stringify(errorData, null, 2)}`;
          } else {
            errorText += `\n${errorData}`;
          }
        } catch {
          const text = await response.text();
          errorText += `\n${text}`;
        }
        throw new Error(errorText);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  async register(userData) {
    const response = await this.makeRequest('/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: userData.name,
        username: userData.username,
        email: userData.email,
        password: userData.password,
        influencer_code: userData.influencerCode || null,
      }),
    });

    // Handle the new response structure
    return {
      success: response.success,
      message: response.message,
      access_token: response.access_token,
      user: response.user,
    };
  }

  async login(credentials) {
    const response = await this.makeRequest('/login', {
      method: 'POST',
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        influencer_code: credentials.influencerCode || null,
      }),
    });

    // Handle the new response structure
    return {
      success: response.success,
      message: response.message,
      access_token: response.access_token,
      user: response.user,
    };
  }

  async sendOtp(email) {
    return this.makeRequest('/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyOtp(email, code) {
    return this.makeRequest('/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  async exchangeOtp(idpToken) {
    return this.makeRequest('/otp/exchange', {
      method: 'POST',
      body: JSON.stringify({ idp_token: idpToken }),
    });
  }

  async sendSignupOtp(email) {
    return this.makeRequest('/otp/send-signup', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifySignupOtp(email, code) {
    return this.makeRequest('/otp/verify-signup', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  async logout(token) {
    return this.makeRequest('/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async getCurrentUser(username, token) {
    return this.makeRequest(`/users/${username}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async getUserPreferences(username, token) {
    return this.makeRequest(`/users/${username}/preference`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async updateUserPreferences(username, preferences, token) {
    return this.makeRequest(`/users/${username}/preference`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(preferences),
    });
  }

  // Get user's selected preference assets (crypto, stocks, forex, futures)
  async getUserPreferenceAssets(username, token = null) {
    const storedToken =
      token ||
      localStorage.getItem('cryptoai_access_token') ||
      localStorage.getItem('access_token');

    const headers = {};
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    return this.makeRequest(
      `/users/${username}/preference-assets`,
      {
        method: 'GET',
        headers,
      },
      '/v1'
    );
  }

  // Get market summary with technical indicators
  async getMarketSummaryWithIndicators(ticker, market, days = 12) {
    const endpoint = `/market-summary/technical-indicators?ticker=${encodeURIComponent(ticker)}&market=${market}&days=${days}`;
    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }

  // Method to make authenticated requests with token
  async authenticatedRequest(endpoint, options = {}, token) {
    const authOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    };
    return this.makeRequest(endpoint, authOptions);
  }

  // Fetch preference list from database (supports crypto, stocks, forex, futures)
  async getPreferenceList(category = null) {
    const endpoint = category 
      ? `/preference_list?category=${category}` 
      : '/preference_list';

    const response = await this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');

    console.log(`[API Service] Response of PreferenceList:`, response);
    return response;
  }

  // Fetch top 50 coins from /whale/crypto_top_50 endpoint (legacy)
  async getTopCoins(start = 1, limit = 50, convert = 'AUD') {
    let endpoint = `/whale/crypto_top_50?start=${start}&limit=${limit}&convert=${convert}`;

    const response = await this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');

    console.log(`[API Service] Response of TopCoins:`, response);

    if (response.count > 0 && Array.isArray(response.coins)) {
      console.log("[API Service] Received top coins data:", response.coins);
      const transformedCoins = response.coins.map(coin => ({
        id: coin.symbol.toLowerCase(),
        symbol: coin.symbol.toLowerCase(),
        name: coin.name,
        current_price: coin.price,
        price_history: {
          '7d': [
            { price: coin.price / (1 + (coin.percent_change_7d / 100)) * 1.05 },
            { price: coin.price / (1 + (coin.percent_change_7d / 100)) * 1.03 },
            { price: coin.price / (1 + (coin.percent_change_7d / 100)) * 1.01 },
            { price: coin.price / (1 + (coin.percent_change_7d / 100)) },
            { price: coin.price / (1 + (coin.percent_change_7d / 100)) * 1.005 },
            { price: coin.price / (1 + (coin.percent_change_7d / 100)) * 1.015 },
            { price: coin.price },
          ]
        },
        market_cap: coin.market_cap,
        rank: coin.rank,
        indicators: {
          price_change_24h: coin.percent_change_24h, 
          price_change_7d: coin.percent_change_7d,
          volume: coin.volume_24h,
        },
      }));
      return transformedCoins
        .filter(coin => typeof coin.rank === 'number')
        .sort((a, b) => a.rank - b.rank);
    }
    return [];
  }

  async getCryptoSummary(coinId = 'btc', startDate, endDate, vsCurrency = 'usd') {

    const header = 'X:'
    const params = new URLSearchParams({
      coin: coinId,
      vs_currency : vsCurrency,
      multiplier: 1,
      timespan: 'day',
      start_date: startDate,
      end_date: endDate,
    });

    let endpoint = `/whale/crypto_summary?${params.toString()}`;

    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }

  async getCryptoPriceHistory(coinId = 'btc', interval = '1d', vsCurrency = 'usd',) {

    const params = new URLSearchParams({
      coin_id: `${coinId}`,
      period: interval,
      vs_currency: vsCurrency,
    });

    let endpoint = `/whale/crypto_price_history?${params.toString()}`;

    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }

  async getRawPriceHistory(coinId = 'btc', vsCurrency = 'usd',) {

    const params = new URLSearchParams({
      coin: `${coinId}`,
      currency: vsCurrency,
    });

    let endpoint = `/whale/crypto_dashboard?${params.toString()}`;

    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }

  async getWhaleTransactions(symbol = 'btc') {
    let endpoint = `/whale/${symbol}`;

    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }

  async getSearchSymbols(input) {
    let endpoint = `/deepseek/tickernormalizer`;

    return this.makeRequest(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: input
      }),
    }, '/api');
  }

  // Fetch current social posts
  async getCurrentSocial() {
    return this.makeRequest('/social/current', {
      method: 'GET',
    });
  }

  // Fetch current news posts
  async getCurrentNews() {
    return this.makeRequest('/news/current', {
      method: 'GET',
    });
  }

  // Fetch sentiment data from /sentiment endpoint
  async getSentiment() {
    const response = await this.makeRequest('/sentiment', {
      method: 'GET',
    });
    // If the response has a coin_sentiment property that is an array, return it
    if (response && Array.isArray(response.coin_sentiment)) {
      return response.coin_sentiment;
    }
    // If the response is an array, return it directly
    if (Array.isArray(response)) {
      return response;
    }
    // If the response has a data property that is an array, return it
    if (response && Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  }

  // Fetch forecast data from /forecast endpoint
  async getForecast() {
    const response = await this.makeRequest('/forecast', {
      method: 'GET',
    });
    if (response && response.success && Array.isArray(response.forecast)) {
      return response.forecast;
    }
    return [];
  }

  // Fetch comprehensive market data (stocks, forex, futures)
  async getComprehensiveMarketData(market = 'stocks') {
    const params = new URLSearchParams({
      market: market,
    });

    let endpoint = `/comprehensive/top_list?${params.toString()}`;

    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }

  // Fetch social reddit posts
  async getSocialRedditData(subreddit = 'CryptoCurrency', sort = 'hot', limit = 25, timeframe = 'day'){
    const params = new URLSearchParams({
      sort: sort,
      limit: limit,
      timeframe: timeframe,
    });

    let endpoint = `/reddit/subreddit/${subreddit}?${params.toString()}`;

    return this.makeRequest(endpoint, {
      method: 'GET',
    }, '/api');
  }
  async chatLanding(messages) {
    // 1. Normalize messages
    // Ideally ensure [{role: 'user', content: '...'}, ...]
    const normalizedMessages = Array.isArray(messages)
      ? messages
          .filter((m) => m && typeof m.content === 'string')
          .map((m) => ({
            role: m.role || 'user',
            content: m.content,
          }))
      : [{ role: 'user', content: String(messages || '') }];

    // 2. Prepare payload
    // If your backend expects simple { messages: [...] }, adjust accordingly.
    // Based on typical OpenAI-like structure or your custom backend:
    const body = {
      model: 'gpt-3.5-turbo', // or whatever model your backend defaults to
      messages: normalizedMessages,
      max_tokens: 250,
      temperature: 0.7,
    };

    // 3. Send request to backend landing chat flow endpoint
    return this.makeRequest(
      '/ai/landing-chat',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      '/api'
    );
  }

  // ─────────────────────────────────────────────
  // Stress Engine — Historical Crisis Replay & Proxy
  // ─────────────────────────────────────────────

  async listStressModules() {
    return this.makeRequest('/stress/modules', { method: 'GET' }, '/api');
  }

  async listStressScenarios(moduleId) {
    return this.makeRequest(`/stress/${encodeURIComponent(moduleId)}/scenarios`, { method: 'GET' }, '/api');
  }

  async applyStress(portfolio, module, scenarioId) {
    return this.makeRequest(
      '/stress/apply',
      {
        method: 'POST',
        body: JSON.stringify({ portfolio, module, scenario_id: scenarioId }),
      },
      '/api'
    );
  }

  async applyAllStress(portfolio, module) {
    return this.makeRequest(
      '/stress/apply_all',
      {
        method: 'POST',
        body: JSON.stringify({ portfolio, module }),
      },
      '/api'
    );
  }

  async runReverseStress(portfolio, thresholdPct) {
    return this.makeRequest(
      '/stress/reverse',
      {
        method: 'POST',
        body: JSON.stringify({ portfolio, threshold_pct: thresholdPct }),
      },
      '/api'
    );
  }

  // ───────────── Live Price ─────────────

  async getLatestPrice(symbol, category = 'stock') {
    const params = new URLSearchParams({ symbol, category });
    return this.makeRequest(`/price/latest?${params.toString()}`, { method: 'GET' }, '/api');
  }

  async searchSymbols(q, category = 'stock', limit = 8) {
    const params = new URLSearchParams({ q, category, limit: String(limit) });
    return this.makeRequest(`/symbols/search?${params.toString()}`, { method: 'GET' }, '/api');
  }

  async getPortfolioCorrelation(portfolio, windowDays = 180) {
    return this.makeRequest(
      '/portfolio/correlation',
      {
        method: 'POST',
        body: JSON.stringify({ portfolio, window_days: windowDays }),
      },
      '/api'
    );
  }

  // ───────────── Portfolio Assets (per-user CRUD) ─────────────

  async listPortfolioAssets() {
    return this.makeRequest('/portfolio/assets', { method: 'GET' }, '/api');
  }

  async addPortfolioAsset(asset) {
    return this.makeRequest('/portfolio/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asset),
    }, '/api');
  }

  async updatePortfolioAsset(assetId, asset) {
    return this.makeRequest(`/portfolio/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asset),
    }, '/api');
  }

  async deletePortfolioAsset(assetId) {
    return this.makeRequest(`/portfolio/assets/${assetId}`, {
      method: 'DELETE',
    }, '/api');
  }

}


export const apiService = new ApiService();
