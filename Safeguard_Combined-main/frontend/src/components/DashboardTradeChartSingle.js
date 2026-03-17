import React from 'react';
import { motion } from 'framer-motion';
import {
    ComposedChart,
    Area,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

const CustomCandlestick = (props) => {
    const { x, y, width, height, payload } = props;
    const { open, price, high, low } = payload;
    const close = price;
    
    const range = Math.max(high - low, 0.000001);
    const ratio = height / range;

    const computeY = (val) => y + (high - val) * ratio;

    const yOpen = computeY(open);
    const yClose = computeY(close);
    
    const isGrowing = close >= open;
    const color = isGrowing ? '#22c55e' : '#ef4444'; 
    
    const barTop = Math.min(yOpen, yClose);
    const barBottom = Math.max(yOpen, yClose);
    const bodyHeight = Math.max(barBottom - barTop, 2); 
    const halfWidth = width / 2;

    return (
        <g stroke={color} fill={color} strokeWidth="1.5">
            <line x1={x + halfWidth} y1={y} x2={x + halfWidth} y2={y + height} />
            <rect x={x + width * 0.15} y={barTop} width={width * 0.7} height={bodyHeight} />
        </g>
    );
};

/**
 * DashboardTradeChartSingle - Reusable component for displaying price and volume data
 * @param {Array} tickerData - Array of ticker data objects with { date, price, volume, timestamp, open, high, low }
 * @param {number} height - Chart height in pixels (default: 500)
 * @param {boolean} showTitle - Whether to show the chart title (default: false)
 * @param {string} title - Chart title text
 * @param {Function} formatPrice - Custom price formatter function
 * @param {Function} formatVolume - Custom volume formatter function
 */
const DashboardTradeChartSingle = ({
    tickerData = [],
    height = 500,
    showTitle = false,
    title = 'Price History & Trading Volume',
    formatPrice,
    formatVolume,
}) => {
    // Default price formatter
    const defaultFormatPrice = (value) => `$${value.toFixed(2)}`;

    // Default volume formatter
    const defaultFormatVolume = (value) => {
        if (value >= 1e9) {
            return `${(value / 1e9).toFixed(2)}B`;
        } else if (value >= 1e6) {
            return `${(value / 1e6).toFixed(2)}M`;
        }
        return value.toLocaleString();
    };

    const priceFormatter = formatPrice || defaultFormatPrice;
    const volumeFormatter = formatVolume || defaultFormatVolume;

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-card border border-border p-4 rounded-lg shadow-lg">
                    <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
                    {payload.map((entry, index) => {
                        const isVolume = entry.name === 'Volume';
                        const displayValue = isVolume ? volumeFormatter(entry.value) : priceFormatter(entry.payload.price);
                        const displayColor = isVolume ? entry.color : (entry.payload.price >= entry.payload.open ? '#22c55e' : '#ef4444');
                        return (
                            <p key={index} className="text-sm" style={{ color: displayColor }}>
                                {entry.name}: {displayValue}
                            </p>
                        );
                    })}
                </div>
            );
        }
        return null;
    };

    const chartData = tickerData.map(d => ({
        ...d,
        candleBounds: [d.low, d.high]
    }));

    if (!tickerData || tickerData.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-center text-muted-foreground">No data available</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
        >
            {showTitle && (
                <h2 className="text-lg font-bold text-foreground mb-4">{title}</h2>
            )}

            <ResponsiveContainer width="100%" height={height}>
                <ComposedChart data={chartData}>
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                        xAxisId={0}
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        style={{ fontSize: '12px' }}
                    />
                    <XAxis dataKey="date" xAxisId={1} hide />
                    <YAxis
                        yAxisId="left"
                        domain={['auto', 'auto']}
                        stroke="hsl(var(--muted-foreground))"
                        style={{ fontSize: '12px' }}
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="hsl(var(--muted-foreground))"
                        style={{ fontSize: '12px' }}
                        tickFormatter={volumeFormatter}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                        xAxisId={0}
                        yAxisId="left"
                        dataKey="candleBounds"
                        name="Price"
                        shape={<CustomCandlestick />}
                    />
                    <Bar
                        xAxisId={1}
                        yAxisId="right"
                        dataKey="volume"
                        name="Volume"
                        fill="hsl(var(--primary))"
                        opacity={0.3}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </motion.div>
    );
};

export default DashboardTradeChartSingle;
