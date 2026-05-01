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
import goldenPriceData from './golden_price.json';

const FuturesAnalyze = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const symbol = searchParams.get('symbol');
    const name = searchParams.get('name');

    const [futuresData, setFuturesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateRange, setDateRange] = useState('1M');

    useEffect(() => {
        if (symbol) {
            fetchFuturesData();
        }
    }, [symbol, dateRange]);

    const getDateRange = useCallback(() => {
        const endDate = new Date();
        const startDate = new Date();

        switch (dateRange) {
            case '1W':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '1M':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
            case '3M':
                startDate.setMonth(endDate.getMonth() - 3);
                break;
            case '6M':
                startDate.setMonth(endDate.getMonth() - 6);
                break;
            default:
                startDate.setMonth(endDate.getMonth() - 1);
        }

        // Format: YYYY-MM-DD HH:MM:SS
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };

        return {
            start: formatDate(startDate),
            end: formatDate(endDate),
        };
    }, [dateRange]);

    const fetchFuturesData = useCallback(async () => {
        if (!symbol) return;

        try {
            setLoading(true);
            setError(null);
            const { start, end } = getDateRange();
            
            // Load data from local JSON file
            console.log('📁 Loading data from golden_price.json');
            const data = goldenPriceData;

            // ****** use mock data because of API limitation ***** //
            // const apiKey = '8a82cd15d2e44e7ab5b1caa1106fe23f';
            // // Use outputsize=5000 to limit data points (default is 30)
            // const url = `https://api.twelvedata.com/time_series?apikey=${apiKey}&symbol=${symbol}&interval=1day&start_date=${start}&end_date=${end}&outputsize=5000`;

            // console.log('📡 Fetching futures data:', { symbol, start, end });

            // const response = await fetch(url);
            // if (!response.ok) {
            //     throw new Error(`HTTP error! status: ${response.status}`);
            // }
            
            // const data = await response.json();

            if (data.status === 'error') {
                throw new Error(data.message || 'API returned an error');
            }

            if (!data.values || data.values.length === 0) {
                throw new Error('No data available for this futures contract');
            }

            console.log('🔍 Raw API data sample:', data.values.slice(0, 2));

            const transformedData = data.values.reverse().map((item) => {
                // Parse datetime - handle both "YYYY-MM-DD" and "YYYY-MM-DD HH:MM:SS" formats
                const dateObj = new Date(item.datetime);
                
                // Check if datetime includes time (has space) or just date
                const hasTime = item.datetime.includes(' ') || item.datetime.includes('T');
                
                const dateFormatted = hasTime 
                    ? dateObj.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    : dateObj.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });

                return {
                    date: dateFormatted,
                    timestamp: dateObj.getTime(),
                    price: parseFloat(item.close),
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                };
            });

            console.log('✅ Data loaded successfully:', transformedData.length, 'points');
            console.log('📊 Transformed data sample:', transformedData.slice(0, 3));
            console.log('📊 Price range:', {
                min: Math.min(...transformedData.map(d => d.price)),
                max: Math.max(...transformedData.map(d => d.price))
            });
            
            setFuturesData(transformedData);
        } catch (err) {
            console.error('❌ Error fetching futures data:', err);
            setError(err.message || 'Failed to fetch futures data');
        } finally {
            setLoading(false);
        }
    }, [symbol, getDateRange]);

    const formatPrice = useCallback((value) => {
        return `$${value.toFixed(2)}`;
    }, []);

    // Sample data for chart rendering to improve performance
    const chartData = useMemo(() => {
        if (futuresData.length === 0) return [];
        
        // If data points > 1000, sample every nth point
        const maxPoints = 1000;
        if (futuresData.length <= maxPoints) {
            return futuresData;
        }
        
        const step = Math.ceil(futuresData.length / maxPoints);
        return futuresData.filter((_, index) => index % step === 0);
    }, [futuresData]);

    const calculateStats = useMemo(() => {
        if (futuresData.length === 0) return null;

        const prices = futuresData.map((d) => d.price);
        const currentPrice = prices[prices.length - 1];
        const startPrice = prices[0];
        const change = currentPrice - startPrice;
        const changePercent = ((change / startPrice) * 100).toFixed(2);
        const high = Math.max(...prices);
        const low = Math.min(...prices);

        return { currentPrice, change, changePercent, high, low };
    }, [futuresData]);
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-card border border-border p-4 rounded-lg shadow-lg">
                    <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
                    {payload.map((entry, index) => (
                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {formatPrice(entry.value)}
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
                    <h2 className="text-2xl font-bold text-foreground mb-4">No Futures Contract Selected</h2>
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
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{name || symbol}</h1>
                        <p className="text-sm text-muted-foreground mt-1">{symbol}</p>
                    </div>
                </div>
            </motion.div>

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                    <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground">Loading futures data...</p>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="text-center py-12">
                    <p className="text-red-500 mb-4">Error: {error}</p>
                    <button
                        onClick={fetchFuturesData}
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Stats Cards */}
            {!loading && !error && stats && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
                >
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <DollarSign className="h-5 w-5 text-primary" />
                            <span className="text-sm text-muted-foreground">Current Price</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {formatPrice(stats.currentPrice)}
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            <span className="text-sm text-muted-foreground">Change</span>
                        </div>
                        <p className={`text-2xl font-bold ${stats.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {stats.change >= 0 ? '+' : ''}
                            {formatPrice(stats.change)} ({stats.changePercent}%)
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            <span className="text-sm text-muted-foreground">Period High</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {formatPrice(stats.high)}
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            <span className="text-sm text-muted-foreground">Period Low</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {formatPrice(stats.low)}
                        </p>
                    </div>
                </motion.div>
            )}

            <div className='inline-flex justify-between w-full items-center mb-6'>
                <h2 className="text-lg font-bold text-foreground">Price History (Daily)</h2>
                {/* Date Range Selector */}
                <div className="flex gap-2">
                    {['1W', '1M', '3M', '6M'].map((range) => (
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

            {/* Price Chart */}
            {!loading && !error && chartData.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card border border-border rounded-xl p-6 mb-8"
                >
                    <ResponsiveContainer width="100%" height={500}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="date"
                                stroke="hsl(var(--muted-foreground))"
                                style={{ fontSize: '12px' }}
                                interval="preserveStartEnd"
                                minTickGap={50}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                style={{ fontSize: '12px' }}
                                tickFormatter={(value) => `$${value.toFixed(2)}`}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="price"
                                name="Price"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                fill="url(#colorPrice)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>
            )}

            {/* Sentiment Analysis Section */}
            {symbol && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <SentimentAnalysisNoCoin symbol={symbol} isForex={false} />
                </motion.div>
            )}

            {/* Correlation Section */}
            {symbol && futuresData.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8"
                >
                    <Correlation
                        symbols={[symbol]}
                        stockData={{
                            [symbol]: futuresData.map(d => ({
                                t: d.timestamp,
                                o: d.open,
                                h: d.high,
                                l: d.low,
                                c: d.price,
                                v: 0
                            }))
                        }}
                        dateRange={getDateRange()}
                    />
                </motion.div>
            )}

            {/* News Section */}
            {symbol && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8"
                >
                    <NewsSection
                        coin={{ symbol: symbol, name: name }}
                        preferredCoins={[]}
                        isForex={false}
                    />
                </motion.div>
            )}
        </div>
    );
};

export default FuturesAnalyze;

