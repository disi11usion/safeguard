import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiService } from '../services/api';
import Correlation from './ResearchHub/Correlation';

const CustomCandlestick = (props) => {
    const { x, y, width, height, payload, dataKey } = props;
    const sym = dataKey; // e.g. "BTC"
    const open = payload[`${sym}_open`];
    const close = payload[`${sym}_close`];
    const bounds = payload[sym]; // [low, high]

    // Safety check just in case we miss data
    if (open === undefined || close === undefined || !bounds) return null;

    const low = bounds[0];
    const high = bounds[1];

    const range = Math.max(high - low, 0.000001);
    const ratio = height / range;

    const computeY = (val) => y + (high - val) * ratio;

    const yOpen = computeY(open);
    const yClose = computeY(close);

    // Candlesticks are green if close >= open, else red
    const isGrowing = close >= open;
    const color = isGrowing ? '#22c55e' : '#ef4444';

    const barTop = Math.min(yOpen, yClose);
    const barBottom = Math.max(yOpen, yClose);
    const bodyHeight = Math.max(barBottom - barTop, 2);
    const halfWidth = width / 2;

    return (
        <g stroke={color} fill={color} strokeWidth="1.5">
            {/* The wick: line from high to low. X is center of bar, Y span is full height. */}
            <line x1={x + halfWidth} y1={y} x2={x + halfWidth} y2={y + height} />
            {/* The body */}
            <rect x={x + width * 0.15} y={barTop} width={width * 0.7} height={bodyHeight} />
        </g>
    );
};

export default function DashboardTradeComparison({ assetGroups = [], preferenceAssets = [] }) {
    const [multiTickerData, setMultiTickerData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [dateRange, setDateRange] = useState('1M');

    useEffect(() => {
        if (assetGroups.length > 0 && !selectedCategory) {
            setSelectedCategory(assetGroups[0].category);
        }
    }, [assetGroups, selectedCategory]);

    const currentGroup = useMemo(() => {
        return assetGroups.find(g => g.category === selectedCategory) || null;
    }, [assetGroups, selectedCategory]);

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

    const fetchMultipleTickers = useCallback(async () => {
        if (!currentGroup || currentGroup.tickers.length === 0) return;

        try {
            setLoading(true);
            setError(null);

            const { start, end } = getDateRange();
            const market = currentGroup.category === 'crypto' ? 'crypto'
                : currentGroup.category === 'forex' ? 'forex'
                    : 'stocks';

            const promises = currentGroup.tickers.map(async (ticker, index) => {
                try {
                    let requestTicker = ticker;
                    let requestMarket = market;

                    const response = await apiService.makeRequest(
                        `/historical/ticker?ticker=${requestTicker}&start_date=${start}&end_date=${end}&market=${requestMarket}`,
                        { method: 'GET' },
                        '/api'
                    );
                    if (response.success && response.data && Array.isArray(response.data)) {
                        return {
                            ticker,
                            data: response.data.map(item => ({
                                date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                timestamp: item.timestamp,
                                price: item.close,
                                open: item.open,
                                high: item.high,
                                low: item.low,
                                volume: item.volume,
                            }))
                        };
                    }
                    return { ticker, data: [] };
                } catch (err) {
                    console.error(`Error fetching ${ticker}:`, err);
                    return { ticker, data: [] };
                }
            });

            const results = await Promise.all(promises);
            const dataMap = {};
            results.forEach(({ ticker, data }) => {
                if (data.length > 0) {
                    dataMap[ticker] = data;
                }
            });

            setMultiTickerData(dataMap);
        } catch (err) {
            console.error('Error fetching multiple tickers:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [currentGroup, getDateRange]);

    useEffect(() => {
        if (currentGroup && currentGroup.tickers.length > 0) {
            fetchMultipleTickers();
        }
    }, [currentGroup, fetchMultipleTickers]);

    const multiTickerChartData = useMemo(() => {
        if (Object.keys(multiTickerData).length === 0) return [];

        const allDates = new Set();
        Object.values(multiTickerData).forEach(data => {
            data.forEach(item => allDates.add(item.date));
        });

        const sortedDates = Array.from(allDates).sort((a, b) => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            return dateA - dateB;
        });

        return sortedDates.map(date => {
            const dataPoint = { date };
            Object.entries(multiTickerData).forEach(([ticker, data]) => {
                const item = data.find(d => d.date === date);
                if (item) {
                    dataPoint[ticker] = [item.low, item.high];
                    dataPoint[`${ticker}_open`] = item.open;
                    dataPoint[`${ticker}_close`] = item.price;
                }
            });
            return dataPoint;
        });
    }, [multiTickerData]);

    const calculateMultiStats = useMemo(() => {
        const stats = {};
        Object.entries(multiTickerData).forEach(([ticker, data]) => {
            if (data.length === 0) return;

            const prices = data.map(d => d.price);
            const currentPrice = prices[prices.length - 1];
            const startPrice = prices[0];
            const change = currentPrice - startPrice;
            const changePercent = ((change / startPrice) * 100).toFixed(2);

            stats[ticker] = {
                currentPrice,
                change,
                changePercent,
                high: Math.max(...prices),
                low: Math.min(...prices),
            };
        });
        return stats;
    }, [multiTickerData]);

    const formatPrice = (value) => `$${value.toFixed(2)}`;

    const CHART_COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null;

        return (
            <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
                {payload.map((entry, index) => {
                    const price = entry.payload[`${entry.name}_close`];
                    return (
                        <div key={index} className="flex items-center gap-2 text-xs mb-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="font-medium text-foreground">{entry.name}:</span>
                            <span className="font-bold text-foreground">{price !== undefined ? formatPrice(price) : 'N/A'}</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    if (!currentGroup || currentGroup.tickers.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl p-6 mb-6">
                <h3 className="text-xl font-bold text-foreground mb-4">Price Comparison</h3>
                <div className="flex flex-col items-center justify-center text-center py-12">
                    <p className="text-muted-foreground text-lg font-medium mb-2">No Assets Available</p>
                    <p className="text-muted-foreground text-sm max-w-md">
                        Add assets to your watchlist to compare their price trends
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-foreground mb-4">
                    Price Comparison - {currentGroup.tickers.join(', ')}
                </h3>

                <div className="flex items-center gap-2">
                    {assetGroups.length > 1 && (
                        <select
                            value={selectedCategory || ''}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="p-1 bg-secondary border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            {assetGroups.map((group) => (
                                <option key={group.category} value={group.category}>
                                    {group.category.charAt(0).toUpperCase() + group.category.slice(1)} ({group.tickers.length})
                                </option>
                            ))}
                        </select>
                    )}

                    <div className="flex gap-1">
                        {['1M', '3M', '6M', '1Y'].map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors ${dateRange === range
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {error && !loading && (
                <div className="text-center py-12">
                    <p className="text-red-500">Error: {error}</p>
                </div>
            )}

            {!loading && !error && Object.keys(calculateMultiStats).length > 0 && (
                <>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6"
                    >
                        <div className="flex flex-row flex-wrap gap-4 mb-4">
                            {currentGroup.tickers.map((sym, index) => {
                                const stat = calculateMultiStats[sym];
                                if (!stat) return null;

                                return (
                                    <div
                                        key={sym}
                                        className="bg-secondary/50 border border-border rounded-lg p-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-foreground">{sym}</span>
                                            <div className="inline-flex items-center gap-x-2 text-xs">
                                                <span className="text-muted-foreground">Change:</span>
                                                <span className={`text-xs font-bold ${stat.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {stat.change >= 0 ? '+' : ''}
                                                    {formatPrice(stat.change)} ({stat.changePercent}%)
                                                </span>
                                            </div>
                                        </div>

                                        <div className="w-full inline-flex items-center justify-between gap-x-2">
                                            <div className="inline-flex items-center gap-x-1 text-xs">
                                                <span className="text-muted-foreground">Current:</span>
                                                <span className="font-medium text-foreground">
                                                    {formatPrice(stat.currentPrice)}
                                                </span>
                                            </div>
                                            <div className="inline-flex items-center gap-x-2 text-xs">
                                                <span className="text-muted-foreground">High:</span>
                                                <span className="font-medium text-foreground">
                                                    {formatPrice(stat.high)}
                                                </span>
                                            </div>
                                            <div className="inline-flex items-center gap-x-2 text-xs">
                                                <span className="text-muted-foreground">Low:</span>
                                                <span className="font-medium text-foreground">
                                                    {formatPrice(stat.low)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                    <ResponsiveContainer width="100%" height={400}>
                        <ComposedChart data={multiTickerChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="date"
                                stroke="hsl(var(--muted-foreground))"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                stroke="hsl(var(--muted-foreground))"
                                style={{ fontSize: '12px' }}
                                tickFormatter={(value) => `$${value.toFixed(0)}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            {currentGroup.tickers.map((sym, index) => (
                                <Bar
                                    key={sym}
                                    dataKey={sym}
                                    name={sym}
                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                    shape={<CustomCandlestick />}
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>

                    <h3 className="text-xl font-bold text-foreground my-6">
                        Correlation Analysis - {currentGroup.tickers.join(', ')}
                    </h3>

                    <Correlation
                        symbols={currentGroup.tickers}
                        stockData={Object.fromEntries(
                            Object.entries(multiTickerData).map(([ticker, data]) => [
                                ticker,
                                data.map(d => ({
                                    t: d.timestamp,
                                    o: d.open,
                                    h: d.high,
                                    l: d.low,
                                    c: d.price,    // price -> c (close)
                                    v: d.volume
                                }))
                            ])
                        )}
                        dateRange={getDateRange()}
                    />
                </>
            )
            }
        </div >
    );
}
