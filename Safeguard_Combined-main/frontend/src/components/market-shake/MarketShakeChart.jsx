import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

const toDateText = (value) => new Date(value).toISOString().slice(0, 10);

const MarketShakeChart = ({ data, events, predictedNext, focusRange, activeEvent }) => {
  const hasData = Array.isArray(data) && data.length > 0;
  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No chart data available for current parameters.
      </div>
    );
  }

  const validData = data.filter((row) => Number.isFinite(row.price) && row.price > 0);
  if (validData.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Price data is non-positive, cannot render log scale.
      </div>
    );
  }

  const predictedTs = predictedNext ? new Date(predictedNext).getTime() : null;
  const dataMinTs = Math.min(...validData.map((row) => row.ts));
  const dataMaxTs = Math.max(...validData.map((row) => row.ts));
  const baseDomain = focusRange
    ? [new Date(focusRange.start).getTime(), new Date(focusRange.end).getTime()]
    : [dataMinTs, dataMaxTs];

  // Ensure prediction line is visible even when it falls outside the raw series range.
  const predictionBufferMs = 45 * 24 * 60 * 60 * 1000;
  const domain = Array.isArray(baseDomain)
    ? [
        baseDomain[0],
        predictedTs && Number.isFinite(predictedTs)
          ? Math.max(baseDomain[1], predictedTs + predictionBufferMs)
          : baseDomain[1],
      ]
    : baseDomain;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 bg-amber-500" />
          Price (log scale)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-5 rounded-sm bg-red-600/40" />
          Shake period
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 border-t-2 border-dashed border-red-500" />
          Predicted next (heuristic)
        </span>
      </div>
      <div className="h-[420px] w-full">
        <ResponsiveContainer>
          <LineChart data={validData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={domain}
              tickFormatter={toDateText}
              minTickGap={40}
            />
            <YAxis
              type="number"
              scale="log"
              domain={['auto', 'auto']}
              tickFormatter={(value) => Number(value).toLocaleString()}
            />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              labelFormatter={(label) => toDateText(label)}
            />
            <Legend />

            {events.map((event, index) => (
              <ReferenceArea
                key={`${event.start}-${event.end}-${index}`}
                x1={new Date(event.start).getTime()}
                x2={new Date(event.end).getTime()}
                fill={activeEvent === index ? '#ef4444' : '#dc2626'}
                fillOpacity={activeEvent === index ? 0.35 : 0.2}
                strokeOpacity={0}
              />
            ))}

            {predictedNext && (
              <ReferenceLine
                x={new Date(predictedNext).getTime()}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="8 6"
                label={{ value: 'Predicted Next (heuristic)', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }}
              />
            )}

            <Line
              type="monotone"
              dataKey="price"
              name="Price (log scale)"
              stroke="#f59e0b"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MarketShakeChart;
