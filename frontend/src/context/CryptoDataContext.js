import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';

function calculateSMA(prices, period) {
    const result = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        result.push(null);
        continue;
      }
      const window = prices.slice(i - period + 1, i + 1);
      const avg = window.reduce((a, b) => a + b, 0) / period;
      result.push(avg);
    }
    return result;
}

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return Array(prices.length).fill(null);
  
    const changes = prices.slice(1).map((p, i) => p - prices[i]);
    const gains = changes.map(c => (c > 0 ? c : 0));
    const losses = changes.map(c => (c < 0 ? -c : 0));
  
    const rsi = [];
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
    for (let i = period; i < prices.length - 1; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
    return Array(period).fill(null).concat(rsi);
}

const processYearlyHistory = (historyData) => {
    if (!historyData || historyData.length === 0) {
      return { price_history: {}, raw_history: [] };
    }

    const processedDaily = historyData.map((point) => {
      let volume_color = 'hsl(var(--primary))'; 
      if (point.c > point.o) volume_color = 'green';
      if (point.c < point.o) volume_color = 'red'; 
      return {
        price: point.c,
        volume: point.v,
        label: new Date(point.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        volume_color,

        t: point.t,
        o: point.o,
        h: point.h,
        l: point.l,
        c: point.c,
        v: point.v,
      };
    });

    const price_history = {
      '1y': processedDaily,
      '6m': processedDaily.slice(-180), 
      '3m': processedDaily.slice(-90),
      '1m': processedDaily.slice(-30),
      '14d': processedDaily.slice(-14),
      '7d': processedDaily.slice(-7),
    };

    const raw_history = processedDaily;
    return { price_history, raw_history };
};

const CryptoDataContext = createContext();

export const useCryptoData = () => useContext(CryptoDataContext);

export const CryptoDataProvider = ({ children }) => {
  const [cryptoData, setCryptoData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchCryptoData = useCallback(async () => {
    const preferredCoins = user?.preferences?.answers?.[10]?.map(c => {
      const match = c.match(/\((.+)\)$/);
      return match ? match[1].toLowerCase() : null;
    }).filter(Boolean) || [];

    try {
      const coins = await apiService.getTopCoins();
      let processedData = coins.map((coin) => ({
        id: coin.symbol.toLowerCase(),
        symbol: coin.symbol.toLowerCase(),
        name: coin.name,
        current_price: coin.current_price,
        price_history: coin.price_history,
        market_cap: coin.market_cap,
        rank: coin.rank,
        indicators: coin.indicators,
      }));

      processedData = processedData.slice(0, 50);

      if (preferredCoins.length > 0) {

        for (const preferredCoin of preferredCoins) {
          try {
            const { data: historyPrice } = await apiService.getRawPriceHistory(preferredCoin);
            if (historyPrice) {
                const { price_history, raw_history } = processYearlyHistory(historyPrice);
                const prices = (price_history['1y'] || []).map(p => p.price);
                const sma20 = calculateSMA(prices, 20);
                const sma50 = calculateSMA(prices, 50);
                const rsi = calculateRSI(prices, 14);

                processedData = processedData.map((coin) =>
                    coin.symbol.toLowerCase() === preferredCoin.toLowerCase()
                      ? {
                        ...coin,
                        price_history: price_history,
                        raw_history: raw_history,
                        indicators: {
                          ...(coin.indicators || {}),
                          sma_20: sma20.at(-1),
                          sma_50: sma50.at(-1),
                          rsi: rsi.at(-1),
                        },
                      }
                      : coin
                  );
              }
          } catch (err) {
            console.error(`Error fetching history for ${preferredCoin}:`, err);
          }
        }
        processedData = processedData.map((item, index) => ({ ...item, rank: index + 1 }));
      }
      
      console.log("[CryptoData Context] Data updated:", processedData);
      setCryptoData(processedData);
      setLoading(false);
      setError(null);
    } catch (error) {
      console.error('Error fetching crypto data from context:', error);
      setError(error);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
      fetchCryptoData();
      const interval = setInterval(fetchCryptoData, 60000);
      return () => clearInterval(interval);
  }, [user, fetchCryptoData]);

  const fetchDetailedCoinData = useCallback(async (coinSymbol) => {
    console.log(`[CryptoData Context] Fetching detailed data for ${coinSymbol}...`);
    try {
      const existingCoin = cryptoData.find(c => c.symbol === coinSymbol && c.raw_history);
      if (existingCoin) {
        console.log(`[CryptoData Context] Data for ${coinSymbol} already exists.`);
        return existingCoin;
      }
      const { data: historyPrice } = await apiService.getRawPriceHistory(coinSymbol);
      if (!historyPrice || !Array.isArray(historyPrice)) {
        throw new Error("Invalid history data received from API");
      }
      const { price_history, raw_history } = processYearlyHistory(historyPrice);
      
      let updatedCoinData = null;
      setCryptoData(prevData =>
        prevData.map(coin => {
          if (coin.symbol.toLowerCase() === coinSymbol.toLowerCase()) {
            updatedCoinData = {
              ...coin,
              price_history,
              raw_history,
            };
            return updatedCoinData;
          }
          return coin;
        })
      );
      if (updatedCoinData) {
        return updatedCoinData;
      }

      throw new Error(`Coin ${coinSymbol} not found in the current context data.`);
    } catch (error) {
      console.error(`[CryptoData Context] Failed to fetch detailed data for ${coinSymbol}:`, error);
      throw error;
    }
  }, [cryptoData]);
  
  const value = { cryptoData, loading, error, fetchDetailedCoinData };

  return (
    <CryptoDataContext.Provider value={value}>
      {children}
    </CryptoDataContext.Provider>
  );
};
