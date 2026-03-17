import React, { useEffect, useMemo, useState } from 'react';
import marketShakeService from '../../services/marketShakeService';
import MarketShakeChart from '../../components/market-shake/MarketShakeChart';
import MarketShakeEventsTable from '../../components/market-shake/MarketShakeEventsTable';

const clampInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const MarketShakePage = () => {
  const [summary, setSummary] = useState(null);
  const [scope, setScope] = useState('single');
  const [asset, setAsset] = useState('Bitcoin');
  const [topN, setTopN] = useState(5);
  const [windowSize, setWindowSize] = useState(126);
  const [mergeGap, setMergeGap] = useState(180);
  const [combinedBaseline, setCombinedBaseline] = useState('normalized');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState({ series: [], events: [], predictedNext: null, avgIntervalYears: null });
  const [activeEvent, setActiveEvent] = useState(null);
  const [focusRange, setFocusRange] = useState(null);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await marketShakeService.getSummary();
        setSummary(data);
        if (data?.defaults) {
          setScope(data.defaults.scope || 'single');
          setAsset(data.defaults.asset || 'Bitcoin');
          setTopN(data.defaults.topN || 5);
          setWindowSize(data.defaults.window || 126);
          setMergeGap(data.defaults.mergeGap || 180);
          setCombinedBaseline(data.defaults.combinedBaseline || 'normalized');
        }
      } catch (e) {
        setError(e.message || 'Failed to load summary.');
      }
    };
    loadSummary();
  }, []);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      setError('');
      setActiveEvent(null);
      setFocusRange(null);
      try {
        const data = await marketShakeService.getEvents({
          scope,
          asset,
          topN: clampInt(topN, 5),
          window: clampInt(windowSize, 126),
          mergeGap: clampInt(mergeGap, 180),
          combinedBaseline,
        });
        setResult(data);
      } catch (e) {
        setError(e.message || 'Failed to load events.');
        setResult({ series: [], events: [], predictedNext: null, avgIntervalYears: null });
      } finally {
        setLoading(false);
      }
    };
    if (summary) loadEvents();
  }, [summary, scope, asset, topN, windowSize, mergeGap, combinedBaseline]);

  const chartData = useMemo(
    () =>
      (result.series || []).map((row) => ({
        ...row,
        ts: new Date(row.date).getTime(),
      })),
    [result.series]
  );

  const onEventSelect = (index, event) => {
    setActiveEvent(index);
    const start = new Date(event.start);
    const end = new Date(event.end);
    const padMs = 120 * 24 * 60 * 60 * 1000;
    setFocusRange({
      start: new Date(start.getTime() - padMs).toISOString().slice(0, 10),
      end: new Date(end.getTime() + padMs).toISOString().slice(0, 10),
    });
  };

  const assets = summary?.assets || [];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <h1 className="text-2xl font-bold text-foreground">Market Shake Analysis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV-based historical stress detection module. No trading or execution logic is included.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <div className="mb-1 text-muted-foreground">Scope</div>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="single">Single</option>
              <option value="combined">Combined</option>
            </select>
          </label>

          {scope === 'single' ? (
            <label className="text-sm">
              <div className="mb-1 text-muted-foreground">Asset</div>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
              >
                {assets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-sm">
              <div className="mb-1 text-muted-foreground">Combined Baseline</div>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2"
                value={combinedBaseline}
                onChange={(e) => setCombinedBaseline(e.target.value)}
              >
                <option value="normalized">Normalized Index (100)</option>
                <option value="geomean">Geometric Mean</option>
              </select>
            </label>
          )}

          <label className="text-sm">
            <div className="mb-1 text-muted-foreground">Top N</div>
            <input
              type="number"
              min={1}
              max={50}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={topN}
              onChange={(e) => setTopN(clampInt(e.target.value, 5))}
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-muted-foreground">Window (days)</div>
            <input
              type="number"
              min={5}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={windowSize}
              onChange={(e) => setWindowSize(clampInt(e.target.value, 126))}
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-muted-foreground">Merge Gap (days)</div>
            <input
              type="number"
              min={0}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={mergeGap}
              onChange={(e) => setMergeGap(clampInt(e.target.value, 180))}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Avg interval: {result.avgIntervalYears != null ? `${result.avgIntervalYears} years` : 'N/A'}
          </span>
          <span className="text-muted-foreground">
            Predicted next: {result.predictedNext || 'N/A'}
          </span>
          {focusRange && (
            <button
              type="button"
              onClick={() => {
                setFocusRange(null);
                setActiveEvent(null);
              }}
              className="rounded-md border border-border px-3 py-1 hover:bg-accent/40"
            >
              Reset focus
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-amber-400">
          Forecast is a statistical heuristic based on average event spacing only. It is not financial advice.
        </p>
        {scope === 'combined' && (
          <p className="mt-1 text-xs text-muted-foreground">
            Combined mode evaluates systemic events across all configured assets; single-asset selection is not used.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading market shake analysis...
        </div>
      )}

      {!loading && (
        <>
          <MarketShakeChart
            data={chartData}
            events={result.events || []}
            predictedNext={result.predictedNext}
            focusRange={focusRange}
            activeEvent={activeEvent}
          />
          <MarketShakeEventsTable events={result.events || []} onSelectEvent={onEventSelect} activeIndex={activeEvent} />
        </>
      )}
    </div>
  );
};

export default MarketShakePage;
