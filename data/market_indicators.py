import sys
import os
import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/database/scripts')))
from backend.database.scripts.data_request import get_raw_prices
from backend.database.scripts.data_ingestion import clean_historic_prices

def calculate_rsi(series, period=14):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def process_crypto_data(df):
    df['recorded_at'] = pd.to_datetime(df['recorded_at'])
    df = df.sort_values(by=['crypto_id', 'recorded_at'])

    num_cols = ['price', 'price_open', 'price_high', 'price_low', 'volume', 'quote_asset_volume']
    df[num_cols] = df[num_cols].apply(pd.to_numeric, errors='coerce')

    dfs = []
    for crypto_id, group in df.groupby('crypto_id'):
        g = group.copy()
        
        # Price change calculations
        g['price_change_24h'] = g['price'] - g['price_open']
        g['price_change_percent_24h'] = (g['price_change_24h'] / g['price_open']) * 100

        g['price_7d_ago'] = g['price'].shift(7)
        g['price_change_percent_7d'] = ((g['price'] - g['price_7d_ago']) / g['price_7d_ago']) * 100

        # RSI and SMAs
        g['RSI_14'] = calculate_rsi(g['price'])
        g['SMA20'] = g['price'].rolling(window=20).mean()
        g['SMA50'] = g['price'].rolling(window=50).mean()

        # Volume color
        g['volume_color'] = g.apply(lambda row: 'green' if row['price'] > row['price_open'] else 'red', axis=1)

        dfs.append(g)

    full_df = pd.concat(dfs, ignore_index=True)
    return full_df

def generate_monthly_indicators(df):
    df['recorded_at'] = pd.to_datetime(df['recorded_at'])

    df['month_dt'] = df['recorded_at'].values.astype('datetime64[M]')

    monthly_df = df.groupby(['crypto_id', 'month_dt']).agg({
        'price': 'mean',
        'volume': 'mean',
        'source_id': 'first'
    }).reset_index()

    monthly_df['year'] = monthly_df['month_dt'].dt.year
    monthly_df['month'] = monthly_df['month_dt'].dt.month

    monthly_df = monthly_df.sort_values(by=['crypto_id', 'year', 'month'], ascending=[True, False, False])
    monthly_df = monthly_df[['crypto_id', 'year', 'month', 'price', 'volume', 'source_id']]

    return monthly_df


# === Main logic ===

def get_market_indicators():
    df = get_raw_prices()
    if df is not None:
        processed_df = process_crypto_data(df)
        monthly_df = generate_monthly_indicators(processed_df)
        return processed_df, monthly_df
    else:
        print('No data returned from get_raw_prices().')
        return None, None
    
def main():
    processed_df, monthly_df = get_market_indicators()
    clean_historic_prices(processed_df, monthly_df)

if __name__ == "__main__":
    main()
