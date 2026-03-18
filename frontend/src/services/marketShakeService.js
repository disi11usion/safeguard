import { getApiBaseUrl, joinUrl } from './apiBaseUrl';

const API_BASE_URL = getApiBaseUrl();

const request = async (path) => {
  const url = joinUrl(API_BASE_URL, path);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.detail || JSON.stringify(body);
    } catch {
      const text = await response.text();
      detail = text || detail;
    }
    throw new Error(detail);
  }

  return response.json();
};

export const marketShakeService = {
  getSummary() {
    return request('/api/market-shake/summary');
  },

  getEvents({
    scope = 'single',
    asset = 'Bitcoin',
    topN = 5,
    window = 126,
    mergeGap = 180,
    combinedBaseline = 'normalized',
  }) {
    const query = {
      scope,
      topN: String(topN),
      window: String(window),
      mergeGap: String(mergeGap),
    };
    if (scope === 'single') {
      query.asset = asset;
    } else {
      query.combinedBaseline = combinedBaseline;
    }
    const params = new URLSearchParams(query);
    return request(`/api/market-shake/events?${params.toString()}`);
  },
};

export default marketShakeService;



