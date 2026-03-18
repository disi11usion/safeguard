import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# A robust loader that handles different column names and separators
def load_asset(file_path, date_col='Date', val_col='Close', sep=','):
    try:
        df = pd.read_csv(file_path, sep=sep).dropna(subset=[date_col])
        # Standardize dates and handle timezones
        df['Date'] = pd.to_datetime(df[date_col], errors='coerce', utc=True).dt.tz_localize(None)
        df = df.dropna(subset=['Date', val_col])
        df = df.rename(columns={val_col: 'Price'})
        df['Price'] = pd.to_numeric(df['Price'], errors='coerce')
        df = df.dropna(subset=['Price'])
        return df.sort_values('Date').set_index('Date')['Price']
    except Exception as e:
        print(f"Could not load {file_path}: {e}")
        return pd.Series(dtype='float64')

# Event detection logic: Finds the top N most severe price "shakes"
def get_major_events(series_df, columns, n=5):
    if isinstance(columns, list):
        rolling = series_df[columns].pct_change(periods=126) # 6-month window
        mask = (rolling < 0).all(axis=1) # All assets must be dropping
        sev_series = rolling.mean(axis=1)
    else:
        rolling = series_df.pct_change(periods=126)
        mask = rolling < 0
        sev_series = rolling
        
    if not mask.any(): return pd.DataFrame()

    events = (mask != mask.shift()).cumsum()
    groups = sev_series[mask].groupby(events[mask])
    
    event_list = []
    for _, g in groups:
        event_list.append({'start': g.index[0], 'end': g.index[-1], 'sev': g.min()})
    
    if not event_list: return pd.DataFrame()
    
    # Merge events closer than 180 days to avoid overlapping highlights
    edf = pd.DataFrame(event_list).sort_values('start')
    distinct = []
    curr = edf.iloc[0].to_dict()
    for i in range(1, len(edf)):
        nxt = edf.iloc[i]
        if (nxt['start'] - curr['end']).days < 180:
            curr['end'] = max(curr['end'], nxt['end'])
            curr['sev'] = min(curr['sev'], nxt['sev'])
        else:
            distinct.append(curr)
            curr = nxt.to_dict()
    distinct.append(curr)
    
    return pd.DataFrame(distinct).nsmallest(n, 'sev').sort_values('start')

def calculate_prediction(events_df):
    if events_df is None or len(events_df) < 2:
        return None, None
    intervals = events_df['start'].diff().dropna().dt.days
    avg_interval_days = intervals.mean()
    last_shake_start = events_df['start'].iloc[-1]
    predicted_next = last_shake_start + pd.Timedelta(days=avg_interval_days)
    return avg_interval_days / 365.25, predicted_next

# Updated Configuration based on your actual data formats
assets_config = {
    'Gold':      {'file': 'data/gold.csv',      'date': 'Date',     'val': 'Close', 'sep': ','},
    'Nasdaq':    {'file': 'data/Nasdaq.csv',    'date': 'Date',     'val': 'Close', 'sep': ','},
    'S&P 500':   {'file': 'data/S&P500.csv',   'date': 'Date',     'val': 'Close', 'sep': ','},
    'Crude Oil': {'file': 'data/crude_oil.csv', 'date': 'Date',     'val': 'Close', 'sep': ','},
    'Bitcoin':   {'file': 'data/bitcoin.csv',   'date': 'Date', 'val': 'Close', 'sep': ','}
}

# 1. Load data
data_series = {name: load_asset(cfg['file'], cfg['date'], cfg['val'], cfg['sep']) 
               for name, cfg in assets_config.items()}

# 2. Shared Dataframe for Combined Analysis
df_shared = pd.DataFrame(data_series).sort_index().ffill().dropna()

# --- Combined Analysis ---
combined_top = get_major_events(df_shared, list(assets_config.keys()), 5)
avg_int_comb, pred_next_comb = calculate_prediction(combined_top)

plt.figure(figsize=(14, 8))
for col in df_shared.columns:
    plt.plot(df_shared.index, 100 * df_shared[col] / df_shared[col].iloc[0], label=col, alpha=0.5)

# Add Red Highlighted Areas for Combined Shakes
if not combined_top.empty:
    for _, row in combined_top.iterrows():
        plt.axvspan(row['start'], row['end'], color='red', alpha=0.25)
    if pred_next_comb:
        plt.axvline(pred_next_comb, color='darkred', linestyle='--', label=f'Predicted Next Shake (~{pred_next_comb.year})')
print(pred_next_comb)

plt.yscale('log')
plt.title(f"Top 5 Combined Mega Shakes (5 Assets) - Log Scale")
plt.ylabel("Normalized Price (Log Scale)")
plt.legend()
plt.savefig('graphs/top_5_combined_log_highlighted.png')

# --- Individual Analysis ---
for name in assets_config.keys():
    s = data_series[name]
    top_n = get_major_events(s, name, 5)
    avg_int, pred_next = calculate_prediction(top_n)
    
    plt.figure(figsize=(12, 6))
    plt.plot(s.index, s, label=f"{name} Price", color='tab:blue')
    
    # Add Red Highlighted Areas for Individual Shakes
    if not top_n.empty:
        for _, row in top_n.iterrows():
            plt.axvspan(row['start'], row['end'], color='red', alpha=0.2)
        if pred_next:
            plt.axvline(pred_next, color='darkred', linestyle='--', label=f'Predicted Next (~{pred_next.year})')
    
    plt.yscale('log')
    plt.title(f"{name}: Top 5 Severe Shakes (Log Scale)")
    plt.ylabel("Price (Log Scale)")
    plt.legend()
    plt.savefig(f"graphs/top_5_{name.replace(' ', '_').lower()}_log_highlighted.png")
    plt.close()
