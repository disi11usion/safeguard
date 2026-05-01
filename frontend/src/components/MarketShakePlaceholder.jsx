import React from 'react';
import { Link } from 'react-router-dom';

const MarketShakePlaceholder = ({ data = null, isMock = false, onRefresh = null }) => {
  const hasData = data && typeof data === 'object';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[320px]">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Market Shake</h3>
        {isMock && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            Mock
          </span>
        )}
      </div>
      <div className="flex-1 p-4 flex flex-col justify-center items-center text-center">
        <p className="text-sm text-foreground font-medium">
          Surface volatility spikes and sudden market moves.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Jump to the full page for event timeline and detailed analysis.
        </p>
        {hasData ? (
          <p className="text-xs text-muted-foreground mt-2">
            Current events: {data?.events_count ?? 0} | Assets tracked: {data?.assets_count ?? 0}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            No summary data yet. Click refresh to load a placeholder snapshot.
          </p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Link
            to="/market-shake"
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/40 transition"
          >
            Open Market Shake
          </Link>
          {typeof onRefresh === 'function' && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/40 transition"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketShakePlaceholder;
