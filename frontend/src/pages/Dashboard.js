import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaChartLine, FaStar, FaGlobe, FaChevronDown, FaLock } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import PreferenceTable from '../components/PreferenceTable';
import SentimentAnalysisNoCoin from '../components/SentimentAnalysisNoCoin';
import GeneralSentimentOverview from '../components/GeneralSentimentOverview';
import DashboardTradeComparison from '../components/DashboardTradeComparison';
import DashboardTradeChartSingle from '../components/DashboardTradeChartSingle';
import MarketSummary from '../components/MarketSummary';
import NewsSection from '../components/NewsSection';
import SocialSection from '../components/SocialSection';
import WhalesTransaction from '../components/WhalesTransaction';
import MarketShakePlaceholder from '../components/MarketShakePlaceholder';
import GovernmentSummaryWidget from '../components/GovernmentSummaryWidget';
import CurrencyConverterCard from '../components/CurrencyConverterCard';
import RiskDisclaimer from '../components/RiskDisclaimer';
import SocialSentimentOverview from '../components/SocialSentimentOverview';
import chartBg from './chartpattern1.png';
import { apiService } from '../services/api';
import CurrencyConverter from '../components/CurrencyConverter';
import marketShakeService from '../services/marketShakeService';
import { getApiBaseUrl, joinUrl } from '../services/apiBaseUrl';

const Dashboard = () => {
  const navigate = useNavigate();
  const [showLegalDisclaimer, setShowLegalDisclaimer] = useState(false);
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('user');
  const [userPreferredCoins, setUserPreferredCoins] = useState([]);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [sentimentLabel, setSentimentLabel] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [insightsTab, setInsightsTab] = useState('summary');
  const [preferenceAssets, setPreferenceAssets] = useState([]);
  const [tickerData, setTickerData] = useState([]);
  const [loadingTickerData, setLoadingTickerData] = useState(false);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [marketShakeSummary, setMarketShakeSummary] = useState(null);
  const [marketShakeIsMock, setMarketShakeIsMock] = useState(false);
  const apiBaseUrl = getApiBaseUrl();

  useEffect(() => {
    if (loading) return;

    try {
      const accepted = localStorage.getItem('disclaimerAccepted') === 'true';
      if (!accepted) setShowLegalDisclaimer(true);
    } catch (e) {
      // If localStorage fails for any reason, still show disclaimer
      setShowLegalDisclaimer(true);
    }
  }, [loading]);

  const handleAgreeDisclaimer = () => {
    try {
      localStorage.setItem('disclaimerAccepted', 'true');
    } catch (e) {}
    setShowLegalDisclaimer(false);
  };

  const handleExitDisclaimer = () => {
    // Exit means leave dashboard
    navigate('/', { replace: true });
  };


  const normalizeCoin = (c) => {
    if (!c) return null;
    return typeof c === 'string' ? { symbol: c } : c;
  };

  // Convert selectedAsset to coin format for NewsSection and SocialSection
  const normalizeAssetToCoin = (asset) => {
    if (!asset) return null;
    return {
      symbol: asset.ticker,
      name: asset.name,
      category: asset.category
    };
  };

  const effectiveCoin = normalizeAssetToCoin(selectedAsset) || normalizeCoin(selectedCoin) || (userPreferredCoins[0] ? { symbol: userPreferredCoins[0] } : null);


  // Helper functions for ticker data
  const transformToChartData = useCallback((item) => {
    return {
      date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: item.timestamp,
      price: item.close,
      open: item.open,
      high: item.high,
      low: item.low,
      volume: item.volume
    };
  }, []);

  const getDateRange = useCallback(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 1);
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  }, []);

  const formatPrice = useCallback((value) => {
    return `$${value.toFixed(2)}`;
  }, []);

  const formatVolume = useCallback((value) => {
    if (value >= 1e9) {
      return `${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
      return `${(value / 1e6).toFixed(2)}M`;
    }
    return value.toLocaleString();
  }, []);

  // Fetch ticker data when selected asset changes
  useEffect(() => {
    if (!selectedAsset) {
      setTickerData([]);
      return;
    }

    const fetchTickerData = async () => {
      try {
        setLoadingTickerData(true);
        const { start, end } = getDateRange();

        let ticker, market;

        ticker = selectedAsset.ticker;
        // Map category to API market parameter
        const category = selectedAsset.category?.toLowerCase() || 'crypto';
        market = category === 'stock' ? 'stocks' : category;

        const response = await apiService.makeRequest(
          `/historical/ticker?ticker=${ticker}&start_date=${start}&end_date=${end}&market=${market}`,
          { method: 'GET' },
          '/api'
        );

        if (response.success && response.data) {
          setTickerData(response.data.map(item => transformToChartData(item)));

        } else {
          setTickerData([]);
          setCurrentScenario(null);
        }
      } catch (err) {
        console.error('Error fetching ticker data:', err);
        setTickerData([]);
      } finally {
        setLoadingTickerData(false);
      }
    };

    fetchTickerData();
  }, [selectedAsset, getDateRange, transformToChartData, preferenceAssets]);

  useEffect(() => {
    if (user?.username) {
      apiService.getUserPreferenceAssets(user.username)
        .then(response => {
          const assets = response.assets || [];
          setPreferenceAssets(assets);
          // Set the first asset as default selected
          if (assets.length > 0 && !selectedAsset) {
            setSelectedAsset(assets[0]);
          }
        })
        .catch(error => {
          console.error('Error fetching preference assets:', error);
          setPreferenceAssets([]);
        });
    }
  }, [user]);

  const groupedAssetsByCategory = React.useMemo(() => {
    const groups = {
      crypto: [],
      stock: [],
      forex: [],
      futures: []
    };

    preferenceAssets.forEach(asset => {
      const category = asset.category?.toLowerCase();
      if (!groups[category]) return;

      let ticker = asset.ticker;
      if (category === 'forex' && ticker?.includes('/')) {
        ticker = ticker.split('/')[0].trim();
      }
      groups[category].push(ticker);
    });

    return Object.entries(groups)
      .filter(([_, tickers]) => tickers.length > 0)
      .map(([category, tickers]) => ({
        category,
        tickers,
        isCrypto: category === 'crypto',
        isForex: category === 'forex'
      }));
  }, [preferenceAssets]);

  const groupedAssetsForPriceComparison = React.useMemo(() => {
    const groups = {
      crypto: [],
      stock: [],
      forex: [],
      futures: []
    };

    preferenceAssets.forEach(asset => {
      const category = asset.category?.toLowerCase();
      if (!groups[category]) return;
      groups[category].push(asset.ticker);
    });

    return Object.entries(groups)
      .filter(([_, tickers]) => tickers.length > 0)
      .map(([category, tickers]) => ({
        category,
        tickers,
        isCrypto: category === 'crypto',
        isForex: category === 'forex'
      }));
  }, [preferenceAssets]);

  useEffect(() => {
    const selectedCoins = user?.preferences?.answers?.[10];
    if (!Array.isArray(selectedCoins)) return;

    const coinSymbols = selectedCoins
      .map((coin) => {
        if (typeof coin !== 'string') return null;
        const raw = coin.trim();
        const match = raw.match(/\(([^)]+)\)/);
        if (match?.[1]) return match[1].toLowerCase();
        if (/^[a-z0-9]+$/i.test(raw)) return raw.toLowerCase();
        const parts = raw.split(/\s+/);
        const last = parts[parts.length - 1];
        return /^[a-z0-9]+$/i.test(last) ? last.toLowerCase() : null;
      })
      .filter(Boolean);

    setUserPreferredCoins(coinSymbols);
  }, [user]);

  const refreshMarketShakeSummary = useCallback(async () => {
    try {
      const result = await marketShakeService.getSummary();
      const assets = Array.isArray(result?.assets) ? result.assets : [];
      setMarketShakeSummary({
        events_count: assets.length,
        assets_count: assets.length,
      });
      setMarketShakeIsMock(String(sessionStorage.getItem('usingMockData')) === 'true');
    } catch (err) {
      console.warn('Market shake summary unavailable:', err?.message || err);
      setMarketShakeSummary(null);
    }
  }, []);

  useEffect(() => {
    refreshMarketShakeSummary();
  }, [refreshMarketShakeSummary]);

  // Fetch sentiment label for selected coin
  useEffect(() => {
    if (!selectedCoin?.symbol) {
      setSentimentLabel(null);
      return;
    }

    apiService.getSentiment()
      .then(data => {
        const found = data.find(item => item[5]?.toLowerCase() === selectedCoin.symbol.toLowerCase());
        setSentimentLabel(found?.[2] || null);
      })
      .catch(() => setSentimentLabel(null));
  }, [selectedCoin]);

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div>Loading your dashboard...</div>
      </div>
    );
  }

  async function testCommissionPurchase() {
  const payload = {
    provider: "test",
    provider_payment_id: "test_" + Date.now(), // unique every click
    amount_cents: 1999,                        // $19.99
    currency: "USD"
  };

  const res = await fetch(joinUrl(apiBaseUrl, "/api/billing/record-purchase"), {
    method: "POST",
    credentials: "include", // IMPORTANT: sends login cookie
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  console.log("status", res.status, data);

  if (!res.ok) {
    alert(`Failed: ${res.status}\n${JSON.stringify(data, null, 2)}`);
    return;
  }
  alert(`Success!\n${JSON.stringify(data, null, 2)}`);
}


  return (
    <div className="py-12">
      {showLegalDisclaimer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-xl font-bold text-foreground mb-3">Legal Disclaimer</h2>

            <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                All content provided by Safeguard is for informational and educational purposes only.
                Nothing on this platform constitutes financial advice or investment recommendations.
              </p>
              <p>
                All investment decisions are your own responsibility. Safeguard is not liable for any losses.
              </p>
              <p>
                By continuing, you agree to these terms.
              </p>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={handleExitDisclaimer}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Exit
              </button>

              <button
                onClick={handleAgreeDisclaimer}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={testCommissionPurchase}>
        Test Purchase (Commission)
      </button>

      <div className="mx-auto w-full">
        {activeTab === 'user' ? (
          <motion.div
            key="user"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            {userPreferredCoins.length > 0 ? (
              <div className="flex gap-6">
                {/* Left Side - Main Content (80%) */}
                <div className="flex-1 flex flex-col gap-6" style={{ width: '80%' }}>
                  {/* Row 1: Price Chart */}
                  <div className="w-full">
                    {selectedAsset && tickerData.length > 0 ? (
                      <div>
                        <div className="mb-4">
                          <h2 className="text-xl font-bold text-foreground">
                            {selectedAsset.name} ({selectedAsset.ticker}) - Price & Volume
                          </h2>
                        </div>
                        <DashboardTradeChartSingle
                          tickerData={tickerData}
                          height={400}
                          formatPrice={formatPrice}
                          formatVolume={formatVolume}
                        />
                      </div>
                    ) : loadingTickerData ? (
                      <div className="bg-card border border-border rounded-xl p-6 h-[400px] flex items-center justify-center">
                        <div className="text-center">
                          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                          <p className="text-muted-foreground">Loading chart data...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-card border border-border rounded-xl p-6 h-[400px] flex items-center justify-center">
                        <p className="text-muted-foreground">Select an asset to view price chart</p>
                      </div>
                    )}
                  </div>

                  {/* Row 2: News, Social, Government */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                    {/* News */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[500px]">
                      <div className="px-4 py-3 border-b border-border bg-muted/30">
                        <h3 className="text-sm font-semibold text-foreground">News</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <NewsSection
                          coin={effectiveCoin}
                          preferredCoins={userPreferredCoins}
                          isStock={selectedAsset?.category === 'stock'}
                          isForex={selectedAsset?.category === 'forex'}
                        />
                      </div>
                      <div className="px-4 py-2 border-t border-border">
                      </div>
                    </div>

                    {/* Social */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[500px]">
                      <div className="px-4 py-3 border-b border-border bg-muted/30">
                        <h3 className="text-sm font-semibold text-foreground">Social</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <SocialSection
                          coin={effectiveCoin}
                          preferredCoins={userPreferredCoins}
                          selectedAsset={selectedAsset}
                        />
                      </div>
                    </div>

                    {/* Government Summary */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[500px]">
                      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Government</h3>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <GovernmentSummaryWidget />
                      </div>
                    </div>
                  </div>

                  {/* Row 2.5: Whales + Market Shake + Currency Converter */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {/* Whales */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[320px]">
                      <div className="px-4 py-3 border-b border-border bg-muted/30">
                        <h3 className="text-sm font-semibold text-foreground">Whales</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <WhalesTransaction coinId="btc" />
                      </div>
                    </div>
                    <MarketShakePlaceholder
                      data={marketShakeSummary}
                      isMock={marketShakeIsMock}
                      onRefresh={refreshMarketShakeSummary}
                    />
                    <CurrencyConverterCard />
                  </div>

                  {/* Disclaimer near Market Shake/Converter */}
                  <div className="w-full">
                    <RiskDisclaimer />
                  </div>

                  {/* Row 3: Trade Comparison */}
                  <div className="w-full">
                    <DashboardTradeComparison
                      assetGroups={groupedAssetsForPriceComparison}
                      preferenceAssets={preferenceAssets}
                    />
                  </div>

                  {/* Row 3.5: General News Sentiment Overview (Task 1) */}
                  <div className="w-full">
                    <GeneralSentimentOverview 
                      market={selectedAsset?.category || 'crypto'} 
                      windowHours={24} 
                    />
                  </div>

                  {/* Row 3.6: General Social Sentiment Overview (Task 2) */}
                  <div className="w-full">
                    <SocialSentimentOverview windowHours={24} />
                  </div>

                  {/* Row 4: Sentiment Analysis */}
                  <div className="w-full">
                    <SentimentAnalysisNoCoin assetGroups={groupedAssetsByCategory} />
                  </div>

                  {/* Row 5: Chart Patterns (Locked / Coming Soon) */}
                  <div className="w-full">
                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                       {/* Header */}
                      <div className="px-6 py-4 border-b border-border bg-muted/30">
                        <h2 className="text-lg font-semibold text-foreground">
                          Chart Pattern
                        </h2>
                      </div>
                      <div className="relative h-[360px] md:h-[420px]">
                        {/* Prominent blurred chart photo background */}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            backgroundImage: `url(${chartBg})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            transform: "scale(1.08)",
                            filter: "blur(10px)",
                            opacity: 0.85,
                          }}
                        />

                        {/* Overlay to keep text readable (tweak opacity if you want it more/less prominent) */}
                        <div className="absolute inset-0 bg-background/55" />

                        {/* Optional: subtle vignette for extra contrast */}
                        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/35" />

                        {/* Lock + explanation text */}
                        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 border border-border/70">
                              <FaLock className="text-muted-foreground" />
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Chart patterns
                            </span>
                          </div>

                          <p className="text-sm font-medium text-foreground">
                            Upgrade for chart pattern insights.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
                

                {/* Right Side - Preference Table Fixed (20%) */}
                <div className="flex-shrink-0" style={{ width: '25%' }}>
                  <div className="sticky top-24 flex flex-col gap-y-4">
                    <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ maxHeight: 'calc(100vh - 80px)' }}>
                      <div className="px-4 py-3 border-b border-border bg-muted/30">
                        <h3 className="text-sm font-semibold text-foreground">Your Assets Watch List</h3>
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                        <PreferenceTable onAssetSelect={setSelectedAsset} selectedAsset={selectedAsset} />
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                      <div className="px-4 py-3 border-b border-border bg-muted/30">
                        <h3 className="text-sm font-semibold text-foreground">Summary</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <MarketSummary selectedAsset={selectedAsset} />
                      </div>
                    </div>
                    <CurrencyConverter />
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-preferences">
                <div className="no-preferences-content">
                  <FaChartLine className="no-preferences-icon" />
                  <h3>No Preferred Coins Selected</h3>
                  <p>Complete the investment profile assessment to get personalized recommendations</p>
                  <button
                    className="complete-assessment-btn"
                    onClick={() => window.location.href = '/preferences'}
                  >
                    Complete Assessment
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="generic"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <PreferenceTable />
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 
