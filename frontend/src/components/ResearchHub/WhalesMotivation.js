import React, { useEffect, useRef, useState } from 'react';
import { createChart, AreaSeries, CrosshairMode } from 'lightweight-charts';
import { apiService } from '../../services/api';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Activity, ChevronDown, Check, Fish, Copy, ArrowRight, ArrowRightLeft, ExternalLink } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useTheme } from '../theme-provider';

const getDateRange = (interval) => {
    const endDate = new Date();
    let startDate = new Date();
    switch (interval) {
        case '1D': startDate.setDate(endDate.getDate() - 1); break;
        case '1W': startDate.setDate(endDate.getDate() - 7); break;
        case '1M': startDate.setMonth(endDate.getMonth() - 1); break;
        case '1Y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        default: startDate.setDate(endDate.getDate() - 1);
    }
    const toYYYYMMDD = (date) => date.toISOString().split('T')[0];
    return { startDate: toYYYYMMDD(startDate), endDate: toYYYYMMDD(endDate) };
};

const formatNumber = (num, options = {}) => {
    if (num === null || num === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', minimumFractionDigits: 2, ...options,
    }).format(num);
};

const formatPercentage = (num) => {
    if (num === null || num === undefined) return 'N/A';
    return `${num.toFixed(2)}%`;
};

const highPriceCoinIds = ['btc'];

const getChartOptions = (theme, activeInterval) => {
    const isDark = theme === 'dark';
    const options = {
        layout: {
            background: { type: 'solid', color: isDark ? '#131722' : '#FFFFFF' },
            textColor: isDark ? '#D9D9D9' : '#18181B',
        },
        grid: {
            vertLines: { color: isDark ? '#2B2B43' : '#E4E4E7' },
            horzLines: { color: isDark ? '#2B2B43' : '#E4E4E7' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        leftPriceScale: { visible: true, borderVisible: false },
        rightPriceScale: { visible: true, borderVisible: false },
        timeScale: {
            borderVisible: false,
        },
        handleScale: false,
        height: 300,
    };

    switch (activeInterval) {
        case '1D':
            options.timeScale.tickMarkFormatter = (time) => {
                const date = new Date(time * 1000);
                return date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false, 
                });
            };
            break;
            
        case '1W':
        case '1M':
            options.timeScale.tickMarkFormatter = (time) => {
                const date = new Date(time * 1000);
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                });
            };
            break;
        case '1Y':
            options.timeScale.tickMarkFormatter = (time) => {
                const date = new Date(time * 1000);
                return date.toLocaleDateString('en-US', {
                    year: '2-digit',
                    month: 'short', 
                });
            };
            break;
        default:
            break;
    }

    return options;
};

function getColorForCoin(coinId, index) {
    const baseColors = [
        { line: '#f7931a', top: 'rgba(247, 147, 26, 0.4)', bottom: 'rgba(247, 147, 26, 0)' },
        { line: '#627eea', top: 'rgba(98, 126, 234, 0.4)', bottom: 'rgba(98, 126, 234, 0)' },
        { line: '#9945FF', top: 'rgba(153, 69, 255, 0.4)', bottom: 'rgba(153, 69, 255, 0)' },
        { line: '#C2A633', top: 'rgba(194, 166, 51, 0.4)', bottom: 'rgba(194, 166, 51, 0)' },
        { line: '#ffffff', top: 'rgba(255, 255, 255, 0.4)', bottom: 'rgba(255, 255, 255, 0)' }
    ];

    if (index < baseColors.length) return baseColors[index];

    const hue = Math.abs(hashCode(coinId)) % 360;
    const line = `hsl(${hue}, 70%, 55%)`;
    const top = `hsla(${hue}, 70%, 55%, 0.4)`;
    const bottom = `hsla(${hue}, 70%, 55%, 0)`;

    return { line, top, bottom };
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
};

const shortenAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};


export default function WhalesMotivation({ 
    coinIds, 
    names,
    chartData,
    isChartLoading,
    chartError,
    activeInterval,
    onIntervalChange 
}) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);

    const [seriesMap, setSeriesMap] = useState({});
    const [visibleCoins, setVisibleCoins] = useState(coinIds);
    const [activeCoinId, setActiveCoinId] = useState(coinIds[0]);
    const [summaryData, setSummaryData] = useState(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState(null);

    const [whaleTransactions, setWhaleTransactions] = useState([]);
    const [isWhaleLoading, setIsWhaleLoading] = useState(true);
    const [whaleError, setWhaleError] = useState(null);

    const [tooltipInfo, setTooltipInfo] = useState({
        visible: false, content: {}, time: '', x: 0, chartWidth: 0,
    });
    const dropdownOptions = coinIds.map((id, index) => ({ id, name: names[index] || id }));

    const { theme } = useTheme();

    // Handle coin visibility toggle
    const handleCoinToggle = (coinId) => {
        const isSelected = visibleCoins.includes(coinId);
        let newVisibleCoins;
        
        if (isSelected) {
            // Prevent deselecting the last coin
            if (visibleCoins.length > 1) {
                newVisibleCoins = visibleCoins.filter(id => id !== coinId);
            } else {
                return;
            }
        } else {
            newVisibleCoins = [...visibleCoins, coinId];
        }
        
        setVisibleCoins(newVisibleCoins);
    };

    const visibleCoinsRef = useRef(visibleCoins);
    useEffect(() => {
        visibleCoinsRef.current = visibleCoins;
    }, [visibleCoins]);

    useEffect(() => {
        if (!containerRef.current) return;

        const initialChartOptions = getChartOptions(theme, activeInterval);
        const chartInstance = createChart(containerRef.current, initialChartOptions);
        chartRef.current = chartInstance;

        const handleCrosshairMove = (param) => {

            if (!param || !param.time || !param.point || !param.seriesData) {
                setTooltipInfo(prev => ({ ...prev, visible: false }));
                return;
            }

            const content = {};
            let hasData = false;

            param.seriesData.forEach((data, series) => {
                if (!data || data.value == null) {
                    return;
                }

                const coinId = series.coinId;

                if (!coinId || !visibleCoinsRef.current.includes(coinId)) {
                    return;
                }

                const coinIndex = coinIds.indexOf(coinId);
                const coinName = names[coinIndex] || coinId;

                content[coinId] = {
                    price: formatNumber(data.value),
                    name: coinName
                };
                hasData = true;
            });

            if (!hasData) {
                setTooltipInfo(prev => ({ ...prev, visible: false }));
                return;
            }

            setTooltipInfo({
                visible: true,
                content,
                time: new Date(param.time * 1000).toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true,
                }),
                x: param.point.x,
                chartWidth: containerRef.current.clientWidth,
            });
        };
        chartInstance.subscribeCrosshairMove(handleCrosshairMove);

        const resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            if (chartRef.current) {
                chartRef.current.resize(width, height);
            }
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            if (chartRef.current) {
                chartRef.current.unsubscribeCrosshairMove(handleCrosshairMove);
                chartRef.current.remove();
            }
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (chartRef.current) {
            const newChartOptions = getChartOptions(theme, activeInterval);
            chartRef.current.applyOptions(newChartOptions);
        }
    }, [theme, activeInterval]);

    useEffect(() => {
        if (!chartRef.current || coinIds.length === 0) return;
        const chart = chartRef.current;
        const newSeriesMap = {};
        coinIds.forEach((coinId, idx) => {
            const colors = getColorForCoin(coinId, idx);
            const isPrimaryCoin = highPriceCoinIds.includes(coinId.toLowerCase());
            const initialIsVisible = visibleCoins.includes(coinId);

            const series = seriesMap[coinId] || chart.addSeries(AreaSeries, {
                lineColor: colors.line,
                topColor: colors.top,
                bottomColor: colors.bottom,
                lineWidth: 2,
                priceScaleId: isPrimaryCoin ? 'right' : 'left',
                visible: initialIsVisible,
            });
            series.coinId = coinId;

            series.applyOptions({
                lineColor: colors.line,
                topColor: colors.top,
                bottomColor: colors.bottom,
                priceScaleId: isPrimaryCoin ? 'right' : 'left',
            });

            newSeriesMap[coinId] = series;
        });

        Object.keys(seriesMap).forEach(oldCoinId => {
            if (!newSeriesMap[oldCoinId]) {
                chart.removeSeries(seriesMap[oldCoinId]);
            }
        });
        setSeriesMap(newSeriesMap);
    }, [chartRef.current, coinIds, names]);

    useEffect(() => {
        if (Object.keys(seriesMap).length === 0 || !chartData || Object.keys(chartData).length === 0) return;
        Object.entries(seriesMap).forEach(([coinId, series]) => {
            const data = chartData[coinId];
            if (data) {
                series.setData(data);
            }
        });
        if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
        }
    }, [chartData, seriesMap]);

    useEffect(() => {
        seriesMap && Object.entries(seriesMap).forEach(([coinId, series]) => {
            const isVisible = visibleCoins.includes(coinId);
            series.applyOptions({ visible: isVisible });
        });
    }, [visibleCoins, seriesMap]);

    useEffect(() => {
        Object.entries(seriesMap).forEach(([coinId, series]) => {
            const isActive = coinId === activeCoinId;
            series.applyOptions({ lineWidth: isActive ? 3 : 2 });
        });
    }, [activeCoinId, seriesMap]);


    // This useEffect for summary data remains
    useEffect(() => {
        if (!activeCoinId) return;
        const fetchSummaryData = async () => {
            setIsSummaryLoading(true); setSummaryError(null);
            try {
                const { startDate, endDate } = getDateRange('1M');
                const summaryResponse = await apiService.getCryptoSummary(activeCoinId.toLowerCase(), startDate, endDate);
                setSummaryData(summaryResponse);
            } catch (err) {
                setSummaryError('Failed to load summary. Please try again.');
            } finally { setIsSummaryLoading(false); }
        };
        fetchSummaryData();
    }, [activeCoinId]);

    // Render summary section with improved UI/UX

    useEffect(() => {
        if (!activeCoinId) return;
        const fetchWhaleData = async () => {
            setIsWhaleLoading(true);
            setWhaleError(null);
            try {
                const response = await apiService.getWhaleTransactions(activeCoinId.toLowerCase());
                if (response.success) {
                    setWhaleTransactions(response.transactions);
                } else {
                    setWhaleError('Failed to fetch whale data.');
                }
            } catch (err) {
                console.error("Whale data fetch error:", err);
                setWhaleError('An error occurred while fetching whale transactions.');
            } finally {
                setIsWhaleLoading(false);
            }
        };
        fetchWhaleData();
    }, [activeCoinId]);

    const renderSummary = () => {
        if (isSummaryLoading) {
            return (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-card/30 rounded-lg border border-border/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                    <p className="text-sm text-muted-foreground">Loading {activeCoinId.toUpperCase()} Summary...</p>
                </div>
            );
        }

        if (summaryError) {
            return (
                <div className="flex items-center justify-center py-12 bg-destructive/10 rounded-lg border border-destructive/50">
                    <p className="text-sm text-destructive">{summaryError}</p>
                </div>
            );
        }

        if (!summaryData) {
            return (
                <div className="flex items-center justify-center py-12 bg-card/30 rounded-lg border border-border/50">
                    <p className="text-sm text-muted-foreground">No summary data available for a 30-day period.</p>
                </div>
            );
        }

        const SummaryItem = ({ icon: Icon, label, value, valueColor = 'text-foreground' }) => (
            <div className="group bg-card/50 rounded-lg p-4 border border-border/50 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                </div>
                <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
            </div>
        );

        const changeValue = summaryData.change_period;
        const isPositive = changeValue >= 0;

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3 pb-3 border-b border-border/50">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground capitalize">
                        {names[coinIds.indexOf(activeCoinId)] || activeCoinId} Summary
                    </h3>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        30 Days
                    </span>
                </div>

                {/* Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SummaryItem
                        icon={DollarSign}
                        label="Current Price"
                        value={formatNumber(summaryData.price)}
                    />
                    <SummaryItem
                        icon={TrendingUp}
                        label="30d High"
                        value={formatNumber(summaryData.high_period)}
                        valueColor="text-green-500"
                    />
                    <SummaryItem
                        icon={TrendingDown}
                        label="30d Low"
                        value={formatNumber(summaryData.low_period)}
                        valueColor="text-red-500"
                    />
                    <SummaryItem
                        icon={isPositive ? TrendingUp : TrendingDown}
                        label="30d Change"
                        value={formatPercentage(changeValue)}
                        valueColor={isPositive ? 'text-green-500' : 'text-red-500'}
                    />
                    <SummaryItem
                        icon={BarChart3}
                        label="30d Volume"
                        value={formatNumber(summaryData.volume_total, { notation: 'compact' })}
                    />
                    <SummaryItem
                        icon={Activity}
                        label="RSI"
                        value={summaryData.RSI ? summaryData.RSI.toFixed(2) : 'N/A'}
                        valueColor={
                            summaryData.RSI
                                ? summaryData.RSI > 70
                                    ? 'text-red-500'
                                    : summaryData.RSI < 30
                                        ? 'text-green-500'
                                        : 'text-yellow-500'
                                : 'text-muted-foreground'
                        }
                    />
                </div>
            </div>
        );
    };

    const renderWhaleTransactions = () => {
        if (isWhaleLoading) {
            return (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-card/30 rounded-lg border border-border/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                    <p className="text-sm text-muted-foreground">Loading Whale Transactions...</p>
                </div>
            );
        }

        if (whaleError) {
            return (
                <div className="flex items-center justify-center py-12 bg-destructive/10 rounded-lg border border-destructive/50">
                    <p className="text-sm text-destructive">{whaleError}</p>
                </div>
            );
        }

        if (!whaleTransactions || whaleTransactions.length === 0) {
            return (
                <div className="flex items-center justify-center py-12 bg-card/30 rounded-lg border border-border/50">
                    <p className="text-sm text-muted-foreground">No recent whale transactions found.</p>
                </div>
            );
        }

        // Transaction Item sub-component for better readability
        const TransactionItem = ({ tx }) => {
            const sender = tx.senders[0]?.[0];
            const receiver = tx.receivers[0]?.[0];
            const explorerUrl = `https://www.blockchain.com/btc/tx/${tx.hash}`; // Example for BTC

            return (
                <li className="flex items-center justify-between gap-4 py-3 px-2 border-b border-border/50 last:border-b-0 hover:bg-muted/30 rounded-md transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 p-2 bg-blue-500/10 rounded-full">
                           <ArrowRightLeft className="h-5 w-5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-foreground text-md">
                                {tx.total.toFixed(4)} {tx.blockchain}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                                <span className="font-mono">{shortenAddress(sender)}</span>
                                <ArrowRight className="h-3 w-3 flex-shrink-0" />
                                <span className="font-mono">{shortenAddress(receiver)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                         <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimeAgo(tx.timestamp)}
                        </span>
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </div>
                </li>
            );
        };
        
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-border/50">
                    <Fish className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">
                        Recent Whale Transactions
                    </h3>
                </div>
                <ul className="space-y-1 max-h-96 overflow-y-auto pr-2">
                    {whaleTransactions.map(tx => <TransactionItem key={tx.hash} tx={tx} />)}
                </ul>
            </div>
        );
    };

    const getTooltipStyle = () => ({
        position: 'absolute', top: '15px', zIndex: 1000,
        ...(tooltipInfo.x > tooltipInfo.chartWidth / 2
            ? { right: `${tooltipInfo.chartWidth - tooltipInfo.x + 15}px` }
            : { left: `${tooltipInfo.x + 15}px` })
    });

    return (
        <div className="space-y-6">
            {/* Chart Header Controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Coin Selector Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-card/50 text-foreground hover:bg-card border border-border/50 transition-all">
                            <BarChart3 className="h-4 w-4" />
                            <span>
                                {visibleCoins.length} Coin{visibleCoins.length > 1 ? 's' : ''} Selected
                            </span>
                            <ChevronDown className="h-4 w-4 ml-1 opacity-50" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Select Coins to Display</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {dropdownOptions.map(({ id, name }) => (
                            <DropdownMenuCheckboxItem
                                key={id}
                                checked={visibleCoins.includes(id)}
                                onCheckedChange={() => handleCoinToggle(id)}
                                disabled={visibleCoins.includes(id) && visibleCoins.length === 1}
                                className="cursor-pointer"
                            >
                                <span className="flex items-center gap-2">
                                    {visibleCoins.includes(id) && <Check className="h-3 w-3" />}
                                    <span>{name}</span>
                                </span>
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Time Interval Buttons */}
                <div className="flex gap-2">
                    {['1D', '1W', '1M', '1Y'].map((interval) => (
                        <button
                            key={interval}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeInterval === interval
                                    ? 'bg-primary text-primary-foreground shadow-md'
                                    : 'bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground border border-border/50'
                                }`}
                            onClick={() => onIntervalChange(interval)}
                        >
                            {interval}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart Container */}
            <div className="relative w-full h-[300px] rounded-lg overflow-hidden border border-border/50">
                <div ref={containerRef} className="w-full h-full absolute" />

                {/* Loading/Error Overlay */}
                {(isChartLoading || chartError) && (
                    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 rounded-lg backdrop-blur-sm ${chartError
                            ? 'bg-destructive/10'
                            : 'bg-background/85'
                        }`}>
                        {chartError ? (
                            <div className="flex flex-col items-center gap-2 max-w-[80%] text-center">
                                <div className="flex items-center justify-center h-10 w-10 rounded-full border-2 border-destructive">
                                    <span className="text-destructive text-xl font-bold">!</span>
                                </div>
                                <span className="text-sm text-destructive font-semibold">{chartError}</span>
                            </div>
                        ) : (
                            <>
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                                <span className="text-sm text-muted-foreground">Loading Chart Data...</span>
                            </>
                        )}
                    </div>
                )}

                {/* Custom Tooltip */}
                {tooltipInfo.visible && (
                    <div
                        className="absolute z-[1000] bg-card/95 backdrop-blur-md border border-border/50 rounded-lg p-3 shadow-lg min-w-[240px] pointer-events-none"
                        style={getTooltipStyle()}
                    >
                        <div className="flex justify-between items-center pb-2 border-b border-border/30 mb-2">
                            <span className="text-xs text-muted-foreground">Time:</span>
                            <strong className="text-xs text-foreground">{tooltipInfo.time}</strong>
                        </div>

                        {Object.entries(tooltipInfo.content).map(([id, data]) => {
                            const coinIndex = coinIds.indexOf(id);
                            const colors = getColorForCoin(id, coinIndex);
                            return (
                                <div className="flex justify-between items-center py-1" key={id}>
                                    <span className="text-xs" style={{ color: colors.line }}>{data.name}:</span>
                                    <strong className="text-xs text-foreground font-semibold">{data.price}</strong>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Separator */}
            <div className="h-px bg-border/50" />

            {/* Coin Selector */}
            <div className="flex flex-wrap gap-2">
                {coinIds.map((id) => {
                    const index = coinIds.indexOf(id);
                    return (
                        <button
                            key={id}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${id === activeCoinId
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                                    : 'bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground border border-border/50'
                                }`}
                            onClick={() => setActiveCoinId(id)}
                        >
                            {names[index] || id}
                        </button>
                    );
                })}
            </div>

            {/* Summary Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>{renderSummary()}</div>
                <div>{renderWhaleTransactions()}</div>
            </div>
        </div>
    );
}
