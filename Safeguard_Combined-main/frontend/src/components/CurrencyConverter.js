import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_FROM = "USD";
const DEFAULT_TO = "AUD";

// Free ECB-based API (no key)
const API_BASE = "https://api.frankfurter.app";

export default function CurrencyConverter() {
  const [currencies, setCurrencies] = useState({});
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState(null);
  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [error, setError] = useState(null);

  // Load currency list once
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoadingCurrencies(true);
        setError(null);
        const res = await fetch(`${API_BASE}/currencies`);
        if (!res.ok) throw new Error("Failed to load currencies");
        const data = await res.json();
        if (!cancelled) setCurrencies(data);
      } catch (e) {
        if (!cancelled) setError("Could not load currencies.");
      } finally {
        if (!cancelled) setLoadingCurrencies(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const currencyOptions = useMemo(() => {
    return Object.entries(currencies)
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [currencies]);

  // Fetch conversion on input change (small debounce)
  useEffect(() => {
    if (!from || !to) return;

    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setResult(null);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setLoadingQuote(true);
        setError(null);

        if (from === to) {
          if (!cancelled) setResult(parsed);
          return;
        }

        const url = `${API_BASE}/latest?amount=${encodeURIComponent(parsed)}&from=${encodeURIComponent(
          from
        )}&to=${encodeURIComponent(to)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch conversion");
        const data = await res.json();

        const converted = data?.rates?.[to];
        if (!cancelled) setResult(typeof converted === "number" ? converted : null);
      } catch (e) {
        if (!cancelled) setError("Could not fetch conversion rate.");
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [from, to, amount]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Currency Converter</h3>
      </div>

      <div className="p-4 space-y-3">
        {loadingCurrencies ? (
          <p className="text-sm text-muted-foreground">Loading currencies…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Amount</label>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 100"
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground mb-1">Result</div>
              {loadingQuote ? (
                <div className="text-sm text-muted-foreground">Converting…</div>
              ) : result == null ? (
                <div className="text-sm text-muted-foreground">—</div>
              ) : (
                <div className="text-lg font-semibold text-foreground">
                  {result.toLocaleString(undefined, { maximumFractionDigits: 6 })} {to}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <p className="text-[11px] text-muted-foreground">
              Rates provided for informational purposes only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
