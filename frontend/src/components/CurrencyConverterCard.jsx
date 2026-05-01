import React, { useMemo, useState } from 'react';

const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CNY'
];

const MOCK_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.2,
  AUD: 1.54,
  CNY: 7.17
};

const CurrencyConverterCard = () => {
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const isMock = true;

  const resultText = useMemo(() => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return '--';
    const fromRate = MOCK_RATES[fromCurrency];
    const toRate = MOCK_RATES[toCurrency];
    if (!fromRate || !toRate) return '--';
    const usdValue = numeric / fromRate;
    const converted = usdValue * toRate;
    return `${converted.toFixed(2)} ${toCurrency}`;
  }, [amount, fromCurrency, toCurrency]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[320px]">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Currency Converter</h3>
        {isMock && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            Using mock rates
          </span>
        )}
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min="0"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Result</div>
          <div className="text-lg font-semibold text-foreground">{resultText}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Mock conversion for UI demo.
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrencyConverterCard;
