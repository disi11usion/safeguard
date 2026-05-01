import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ComposedChart,
} from 'recharts';
import { apiService } from '../../services/api';
import SymbolsSelector from '../../components/SymbolsSelector';
import NewsSection from '../../components/NewsSection';
import SentimentAnalysisNoCoin from '../../components/SentimentAnalysisNoCoin';
import Correlation from '../../components/ResearchHub/Correlation';
import DashboardTradeChartSingle from '../../components/DashboardTradeChartSingle';

const TickerAnalyze = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const symbol = searchParams.get('symbol');
    const name = searchParams.get('name');
    const market = searchParams.get('market') || 'stocks'; // Default to stocks if not specified

    const [tickerData, setTickerData] = useState([]);
    const [multiTickerData, setMultiTickerData] = useState({}); // For multiple tickers comparison
    const [selectedSymbols, setSelectedSymbols] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateRange, setDateRange] = useState('1M'); // 1M, 3M, 6M, 1Y
    const [viewMode, setViewMode] = useState('single'); // 'single' or 'multi'

    useEffect(() => {
        if (symbol && viewMode === 'single') {
            fetchTickerData();
        }
    }, [symbol, market, dateRange, viewMode]);

    useEffect(() => {
        if (viewMode === 'multi' && selectedSymbols.length > 0) {
            fetchMultipleTickers(selectedSymbols);
        }
    }, [market, dateRange, viewMode]);

    const getDateRange = useCallback(() => {
        const endDate = new Date();
        const startDate = new Date();

        switch (dateRange) {
            case '1M':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
            case '3M':
                startDate.setMonth(endDate.getMonth() - 3);
                break;
            case '6M':
                startDate.setMonth(endDate.getMonth() - 6);
                break;
            case '1Y':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(endDate.getMonth() - 1);
        }

        return {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
        };
    }, [dateRange]);

    // Helper function to transform API data to chart format
    const transformToChartData = useCallback((item, includeOHLV = true) => {
        const baseData = {
            date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            timestamp: item.timestamp,
            price: item.close,
        };
        
        if (includeOHLV) {
            return { ...baseData, open: item.open, high: item.high, low: item.low, volume: item.volume };
        }
        return baseData;
    }, []);

    const fetchTickerData = useCallback(async () => {
        if (!symbol) return;

        try {
            setLoading(true);
            setError(null);
            const { start, end } = getDateRange();

            const response = await apiService.makeRequest(
                `/historical/ticker?ticker=${symbol}&start_date=${start}&end_date=${end}&market=${market}`,
                { method: 'GET' },
                '/api'
            );

            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch data');
            }

            setTickerData(response.data.map(item => transformToChartData(item)));
        } catch (err) {
            console.error('Error fetching ticker data:', err);
            setError(err.message || 'Failed to fetch ticker data');
        } finally {
            setLoading(false);
        }
    }, [symbol, market, getDateRange, transformToChartData]);

    const fetchMultipleTickers = useCallback(async (symbols) => {
        if (!symbols || symbols.length === 0) return;

        try {
            setLoading(true);
            setError(null);
            const { start, end } = getDateRange();

            // Fetch data for all selected symbols in parallel
            const responses = await Promise.all(
                symbols.map(sym =>
                    apiService.makeRequest(
                        `/historical/ticker?ticker=${sym}&start_date=${start}&end_date=${end}&market=${market}`,
                        { method: 'GET' },
                        '/api'
                    ).catch(err => {
                        console.error(`Error fetching ${sym}:`, err);
                        return null;
                    })
                )
            );

            // Transform responses to combined data
            const combinedData = {};
            responses.forEach((response, index) => {
                if (response?.success && response.data) {
                    combinedData[symbols[index]] = response.data.map(item => transformToChartData(item, false));
                }
            });

            setMultiTickerData(combinedData);
        } catch (err) {
            console.error('Error fetching multiple tickers:', err);
            setError(err.message || 'Failed to fetch ticker data');
        } finally {
            setLoading(false);
        }
    }, [market, getDateRange, transformToChartData]);

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

    const handleMultiSelectApply = useCallback((symbols, items) => {
        setSelectedSymbols(symbols);
        setViewMode('multi');
        fetchMultipleTickers(symbols);
    }, [fetchMultipleTickers]);

    const handleSingleSelect = useCallback((newSymbol, item) => {
        setViewMode('single');
        setSelectedSymbols([]);
        navigate(`/analysis/ticker?symbol=${newSymbol}&name=${encodeURIComponent(item.name || newSymbol)}&market=${market}`);
    }, [navigate, market]);

    const handleToggleMode = useCallback(() => {
        if (viewMode === 'single') {
            setViewMode('multi');
            setSelectedSymbols(symbol ? [symbol] : []);
        } else {
            setViewMode('single');
            setSelectedSymbols([]);
        }
    }, [viewMode, symbol]);

    // Prepare data for multi-ticker comparison chart
    const multiTickerChartData = useMemo(() => {
        if (Object.keys(multiTickerData).length === 0) return [];

        // Get all unique dates
        const allDates = new Set();
        Object.values(multiTickerData).forEach(data => {
            data.forEach(item => allDates.add(item.date));
        });

        // Sort dates by timestamp
        const sortedDates = Array.from(allDates).sort((a, b) => {
            return new Date(a) - new Date(b);
        });

        // Combine data for each date
        return sortedDates.map(date => {
            const dataPoint = { date };
            Object.keys(multiTickerData).forEach(symbol => {
                const item = multiTickerData[symbol].find(d => d.date === date);
                if (item) {
                    dataPoint[symbol] = item.price;
                }
            });
            return dataPoint;
        });
    }, [multiTickerData]);

    const calculateStats = useMemo(() => {
        if (tickerData.length === 0) return null;

        const prices = tickerData.map((d) => d.price);
        const currentPrice = prices[prices.length - 1];
        const startPrice = prices[0];
        const change = currentPrice - startPrice;
        const changePercent = ((change / startPrice) * 100).toFixed(2);
        const high = Math.max(...prices);
        const low = Math.min(...prices);

        return { currentPrice, change, changePercent, high, low };
    }, [tickerData]);

    // Calculate stats for multiple tickers
    const calculateMultiStats = useMemo(() => {
        if (Object.keys(multiTickerData).length === 0) return {};

        const stats = {};
        Object.keys(multiTickerData).forEach(symbol => {
            const data = multiTickerData[symbol];
            if (data.length === 0) return;

            const prices = data.map(d => d.price);
            const currentPrice = prices[prices.length - 1];
            const startPrice = prices[0];
            const change = currentPrice - startPrice;
            const changePercent = ((change / startPrice) * 100).toFixed(2);
            const high = Math.max(...prices);
            const low = Math.min(...prices);

            stats[symbol] = {
                currentPrice,
                change,
                changePercent,
                high,
                low,
            };
        });

        return stats;
    }, [multiTickerData]);

    // Helper function to get market-specific labels
    const getMarketLabel = useCallback((plural = false) => {
        const labels = {
            crypto: plural ? 'Cryptos' : 'crypto',
            forex: plural ? 'Pairs' : 'pair',
            stocks: plural ? 'Stocks' : 'stock'
        };
        return labels[market] || labels.stocks;
    }, [market]);

    const CHART_COLORS = useMemo(() => [
        'hsl(var(--primary))',
        '#10b981',
        '#f59e0b',
        '#ef4444',
        '#8b5cf6',
        '#ec4899',
        '#06b6d4',
        '#84cc16',
    ], []);

    // Custom Tooltip for multi-mode chart
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-card border border-border p-4 rounded-lg shadow-lg">
                    <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
                    {payload.map((entry, index) => (
                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {entry.name === 'Volume' ? formatVolume(entry.value) : formatPrice(entry.value)}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const stats = calculateStats;

    if (!symbol) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-foreground mb-4">No Stock Selected</h2>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                    <ArrowLeft className="h-5 w-5" />
                    <span>Back</span>
                </button>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className='flex gap-x-4 items-center'>
                            <h1 className="text-xl font-bold text-foreground">
                                {viewMode === 'multi'
                                    ? `Comparing ${selectedSymbols.length} ${getMarketLabel(true)}`
                                    : name || symbol}
                            </h1>
                            <p className="text-base text-muted-foreground">
                                {viewMode === 'multi' ? selectedSymbols.join(', ') : symbol}
                            </p>
                        </div>
                        <div className='flex gap-x-2'>{/* Symbol Selector */}
                            <div className="w-64">
                                <SymbolsSelector
                                    marketType={market}
                                    value={viewMode === 'single' ? symbol : selectedSymbols}
                                    multiSelect={viewMode === 'multi'}
                                    onValueChange={handleSingleSelect}
                                    onApply={handleMultiSelectApply}
                                    placeholder={viewMode === 'multi' ? `Select ${market}...` : `Switch ${getMarketLabel()}...`}
                                />
                            </div>

                            {/* Toggle View Mode Button */}
                            <button
                                onClick={handleToggleMode}
                                className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium"
                            >
                                {viewMode === 'single' ? 'Compare Mode' : 'Single Mode'}
                            </button>
                        </div>

                    </div>
                </div>
            </motion.div>

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                    <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground">Loading {market} data...</p>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="text-center py-12">
                    <p className="text-red-500 mb-4">Error: {error}</p>
                    <button
                        onClick={fetchTickerData}
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Stats Cards - Single Mode */}
            {!loading && !error && viewMode === 'single' && stats && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
                >
                    <div className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3 mb-2">
                            <DollarSign className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Current Price</span>
                        </div>
                        <p className="text-base font-bold text-foreground">
                            {formatPrice(stats.currentPrice)}
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3 mb-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Change</span>
                        </div>
                        <p className={`text-base font-bold ${stats.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {stats.change >= 0 ? '+' : ''}
                            {formatPrice(stats.change)} ({stats.changePercent}%)
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3 mb-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Period High</span>
                        </div>
                        <p className="text-base font-bold text-foreground">
                            {formatPrice(stats.high)}
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3 mb-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Period Low</span>
                        </div>
                        <p className="text-base font-bold text-foreground">
                            {formatPrice(stats.low)}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Stats Cards - Multi Mode */}
            {!loading && !error && viewMode === 'multi' && Object.keys(calculateMultiStats).length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <div className="grid grid-cols-1 gap-4">
                        {selectedSymbols.map((sym, index) => {
                            const stat = calculateMultiStats[sym];
                            if (!stat) return null;

                            return (
                                <div
                                    key={sym}
                                    className="bg-card border rounded-xl px-6 py-4"
                                    style={{ borderColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full gap-4">
                                        {/* Stock Symbol - Left Side (50% on desktop) */}
                                        <div className="flex items-center gap-2 md:w-1/2">
                                            <div
                                                className="w-3 h-3 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                            />
                                            <h3 className="text-base font-bold text-foreground">{sym}</h3>
                                        </div>

                                        {/* Stats Grid - Right Side (50% on desktop) */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:w-1/2">
                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">Current</span>
                                                </div>
                                                <p className="text-sm font-bold text-foreground">
                                                    {formatPrice(stat.currentPrice)}
                                                </p>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">Change</span>
                                                </div>
                                                <p className={`text-sm font-bold ${stat.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {stat.change >= 0 ? '+' : ''}
                                                    {formatPrice(stat.change)} ({stat.changePercent}%)
                                                </p>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">High</span>
                                                </div>
                                                <p className="text-sm font-bold text-foreground">
                                                    {formatPrice(stat.high)}
                                                </p>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-xs text-muted-foreground">Low</span>
                                                </div>
                                                <p className="text-sm font-bold text-foreground">
                                                    {formatPrice(stat.low)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
            <div className='inline-flex justify-between w-full items-center mb-6'>
                <h2 className="text-lg font-bold text-foreground">Price History & Trading Volume</h2>
                {/* Date Range Selector */}
                <div className="flex gap-2">
                    {['1M', '3M', '6M', '1Y'].map((range) => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`p-2 text-xs rounded-lg font-medium transition-colors ${dateRange === range
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>
            {/* Price Chart - Single Mode: Price + Volume Combined */}
            {!loading && !error && viewMode === 'single' && tickerData.length > 0 && (
                <div className="mb-8">
                    <DashboardTradeChartSingle
                        tickerData={tickerData}
                        height={500}
                        formatPrice={formatPrice}
                        formatVolume={formatVolume}
                    />
                </div>
            )}

            {/* Price Chart - Multi Mode: Multiple Tickers Comparison */}
            {!loading && !error && viewMode === 'multi' && Object.keys(multiTickerData).length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card border border-border rounded-xl px-4 py-3 mb-8"
                >
                    <h2 className="text-xl font-bold text-foreground mb-6">
                        Price Comparison - {selectedSymbols.join(', ')}
                    </h2>
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={multiTickerChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="date"
                                stroke="hsl(var(--muted-foreground))"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                style={{ fontSize: '12px' }}
                                tickFormatter={(value) => `$${value.toFixed(0)}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            {selectedSymbols.map((sym, index) => (
                                <Line
                                    key={sym}
                                    type="monotone"
                                    dataKey={sym}
                                    name={sym}
                                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </motion.div>
            )}

            {/* Correlation Section */}
            {viewMode === 'single' && symbol && tickerData.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8"
                >
                    <Correlation
                        symbols={[symbol]}
                        stockData={{
                            [symbol]: tickerData.map(d => ({
                                t: d.timestamp,
                                o: d.open,
                                h: d.high,
                                l: d.low,
                                c: d.price,
                                v: d.volume
                            }))
                        }}
                        dateRange={getDateRange()}
                    />
                </motion.div>
            )}

            {viewMode === 'multi' && selectedSymbols.length > 1 && Object.keys(multiTickerData).length > 1 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8"
                >
                    <Correlation
                        symbols={selectedSymbols}
                        stockData={Object.fromEntries(
                            Object.entries(multiTickerData).map(([sym, data]) => [
                                sym,
                                data.map(d => ({
                                    t: d.timestamp,
                                    c: d.price,
                                    o: d.price, // In multi mode, we only have price
                                    h: d.price,
                                    l: d.price,
                                    v: 0
                                }))
                            ])
                        )}
                        dateRange={getDateRange()}
                    />
                </motion.div>
            )}

            
            {/* Sentiment Analysis Section */}
            {viewMode === 'single' && symbol && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-8"
                >
                    <SentimentAnalysisNoCoin 
                        assetGroups={[{
                            category: market,
                            tickers: [symbol.replace(/^[XC]:/, '')],
                            isCrypto: market === 'crypto',
                            isForex: market === 'forex'
                        }]}
                    />
                </motion.div>
            )}

            {viewMode === 'multi' && selectedSymbols.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-8"
                >
                    <SentimentAnalysisNoCoin 
                        assetGroups={[{
                            category: market,
                            tickers: selectedSymbols.map(sym => sym.replace(/^[XC]:/, '')),
                            isCrypto: market === 'crypto',
                            isForex: market === 'forex'
                        }]}
                    />
                </motion.div>
            )}

            {/* News Section */}
            {viewMode === 'single' && symbol && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8"
                >
                    <NewsSection
                        coin={{ symbol: symbol.replace(/^[XC]:/, ''), name: name }}
                        preferredCoins={[]}
                        isStock={market === 'stocks'}
                        isForex={market === 'forex'}
                    />
                </motion.div>
            )}

            {viewMode === 'multi' && selectedSymbols.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8"
                >
                    <NewsSection
                        coin={null}
                        preferredCoins={selectedSymbols.map(sym => sym.replace(/^[XC]:/, ''))}
                        isStock={market === 'stocks'}
                        isForex={market === 'forex'}
                    />
                </motion.div>
            )}
        </div>
    );
};

export default TickerAnalyze;
