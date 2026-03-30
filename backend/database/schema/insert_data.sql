 /*
 * file: insert_data.sql
 * description: This script inserts initial data into the database.
 * It populates the metadata for data sources, risk profiles, and announcements data
 * Date: 30-06-2025
*/

-- Set the timezone to UTC for consistent timestamp handling
SET TIME ZONE 'UTC';

-- Seed influencer codes (optional)
INSERT INTO auth.influencer_codes (code, influencer_name, is_active)
VALUES
    ('Ursh-01', 'Ursh', TRUE)
ON CONFLICT (code) DO NOTHING;


-- Insert initial data into the metadata.data_sources table
-- This table contains information about various data sources used in the application.
TRUNCATE TABLE metadata.data_sources RESTART IDENTITY CASCADE;
INSERT INTO metadata.data_sources (name, type, base_url, description)
VALUES
    ( 'Binance', 'Price', 'https://api.binance.com/api/v3/', 'Binance is a global cryptocurrency exchange that provides a platform for trading various cryptocurrencies. It offers spot and futures trading, as well as a range of other services such as staking and savings.' ),
    ( 'Coingecko', 'Price', 'https://api.coingecko.com/api/v3/coins/', 'CoinGecko is a cryptocurrency data aggregator that provides real-time and historical data on cryptocurrencies, including prices, market capitalization, trading volume, and more.' ),
    ( 'Reddit', 'Social', 'https://www.reddit.com/r/cryptocurrency/top.json', 'Reddit is a social news aggregation, web content rating, and discussion website. The cryptocurrency subreddit is a popular community for discussing news, trends, and developments in the cryptocurrency space.' ),
    ( 'Telegram', 'Social', '', 'Telegram is a cloud-based instant messaging app widely used by cryptocurrency communities for news, discussions, and project updates.' ),
    ( 'Youtube', 'Social', 'https://www.youtube.com/', 'YouTube is a video-sharing platform where cryptocurrency influencers, analysts, and projects share news, analysis, and educational content.' ),
    ( 'CoinTelegraph', 'News', 'https://cointelegraph.com/rss', 'CoinTelegraph is a leading independent digital media resource covering a wide range of news on blockchain technology, crypto assets, and emerging fintech trends.' ),
    ( 'CryptoSlate', 'News', 'https://cryptoslate.com/feed/', 'CryptoSlate is a comprehensive news and data platform that delivers real-time cryptocurrency news, coin rankings, and market analysis.' ),
    ( 'Decrypt', 'News', 'https://decrypt.co/feed', 'Decrypt is a media platform providing in-depth news, original features, and educational content about cryptocurrencies, blockchain, and Web3.' ),
    ( 'The Block', 'News', 'https://www.theblock.co/rss.xml', 'The Block is a research and news brand delivering detailed reporting and analysis on digital assets, blockchain, and the crypto industry.' ),
    ( 'GNews', 'News', '', 'GNews is a news aggregation service that provides access to global news articles and headlines via API.' ),
    ( 'Mediastack', 'News', 'https://api.mediastack.com/v1/news', 'Mediastack is a real-time news API delivering news from thousands of sources worldwide in multiple languages.' ),
    ( 'NewsAPI', 'News', 'https://newsapi.org/v2/everything', 'NewsAPI is a simple HTTP REST API for searching and retrieving live articles from all over the web.' ),
    ( 'NewsData', 'News', 'https://newsdata.io/api/1/news', 'NewsData is a news API that provides access to news articles and headlines from worldwide sources in real time.' ),
    ( 'Cryptocompare', 'News', 'https://min-api.cryptocompare.com/data/v2/news', 'Cryptocompare is a comprehensive news and data platform that delivers real-time cryptocurrency news, coin rankings, and market analysis.' ),
    ( 'Cryptopanic', 'News', 'https://cryptopanic.com/api/v1/posts', 'Cryptopanic is a comprehensive news and data platform that delivers real-time cryptocurrency news, coin rankings, and market analysis.' );

-- Insert initial data into the reference.cryptocurrencies table
-- This table contains information about various cryptocurrencies. 
TRUNCATE TABLE reference.cryptocurrencies RESTART IDENTITY CASCADE;
INSERT INTO reference.cryptocurrencies (symbol_binance, symbol_coingecko, name, rank, icon_path) VALUES 
('BTCUSDT', 'bitcoin', 'Bitcoin', 1, '/icons/btc.png'),
('ETHUSDT', 'ethereum', 'Ethereum', 2, '/icons/eth.png'),
('BNBUSDT', 'binancecoin', 'Binance Coin', 3, '/icons/bnb.png'),
('SOLUSDT', 'solana', 'Solana', 4, '/icons/sol.png'),
('ADAUSDT', 'cardano', 'Cardano', 5, '/icons/ada.png'),
('DOGEUSDT', 'dogecoin', 'Dogecoin', 6, '/icons/doge.png'),
('MATICUSDT', 'polygon', 'Polygon', 7, '/icons/matic.png'),
('DOTUSDT', 'polkadot', 'Polkadot', 8, '/icons/dot.png'),
('AVAXUSDT', 'avalanche-2', 'Avalanche', 9, '/icons/avax.png'),
('LINKUSDT', 'chainlink', 'Chainlink', 10, '/icons/link.png')
ON CONFLICT (symbol_binance) DO NOTHING;

TRUNCATE TABLE reference.risk_profiles RESTART IDENTITY CASCADE;
INSERT INTO reference.risk_profiles (name, description, score_low, score_high)
VALUES
    ('Defensive', 'You prefer stability and capital protection - even if that means your returns are small. Crypto''s ups and downs can be stressful, so safety is your priority.', 1, 1.8),
    ('Conservative', 'You''re open to investing in crypto, but want to avoid surprises. You value control, consistency, and making informed decisions - even if growth is limited.', 1.81, 2.4),
    ('Moderate', 'You''re okay with some risk, especially if there''s a balance between protection and opportunity. You''re likely to do your research and stay calm in uncertain markets.', 2.41, 2.9),
    ('Balanced', 'You understand that volatility is part of crypto, and you can ride it out. You want meaningful growth, but you''re still mindful about managing risk.', 2.91, 3.4),
    ('Growth', 'You accept short-term volatility as the price of long-term gains. You''re growth-focused, curious, and able to stay calm through market noise.', 3.41, 5.0);


-- Insert initial data into the clean_data.official_announcements table
-- This table contains macroeconomic indicators for various countries and years.
TRUNCATE TABLE clean_data.official_announcements RESTART IDENTITY CASCADE;
INSERT INTO clean_data.official_announcements (
    published_year, gdp_usd, inflation_pct, lending_rate_pct, unemployment_pct, population, country, country_name
) VALUES
    (2020, 385740508436.9650268555, NULL, -7.6351742163, 11.4610000000, 45191965, 'AR', 'Argentina'),
    (2021, 486564085480.0360107422, NULL, -11.8618379621, 8.7360000000, 45312281, 'AR', 'Argentina'),
    (2022, 632790070063.1240234375, NULL, -10.2880388707, 6.8050000000, 45407904, 'AR', 'Argentina'),
    (2023, 646075277525.1250000000, NULL, -16.7714229097, 6.1390000000, 45538401, 'AR', 'Argentina'),
    (2024, NULL, NULL, NULL, 7.8760000000, NULL, 'AR', 'Argentina'),
    (2020, 434397601557.6959838867, 1.3819106335, NULL, 5.2010000000, 8916864, 'AT', 'Austria'),
    (2021, 480467037338.7830200195, 2.7666666667, NULL, 6.4590000000, 8955797, 'AT', 'Austria'),
    (2022, 471773629830.3809814453, 8.5468699319, NULL, 4.9920000000, 9041851, 'AT', 'Austria'),
    (2023, 511685203845.0009765625, 7.8141341700, NULL, 5.2640000000, 9131761, 'AT', 'Austria'),
    (2024, NULL, 2.9379157428, NULL, 5.4390000000, NULL, 'AT', 'Austria'),
    (2020, 1328414058378.3798828125, 0.8469055375, NULL, 6.4560000000, 25649248, 'AU', 'Australia'),
    (2021, 1556735770437.2600097656, 2.8639104220, NULL, 5.1160000000, 25685412, 'AU', 'Australia'),
    (2022, 1690858246994.4299316406, 6.5940967134, NULL, 3.7280000000, 26014399, 'AU', 'Australia'),
    (2023, 1728057316695.6101074219, 5.5970149254, NULL, 3.6680000000, 26658948, 'AU', 'Australia'),
    (2024, NULL, 3.1616142831, NULL, 4.0720000000, NULL, 'AU', 'Australia'),
    (2020, 529694473501.7910156250, 0.7407918122, NULL, 5.5450000000, 11538604, 'BE', 'Belgium'),
    (2021, 598494036474.4090576172, 2.4402485114, NULL, 6.2480000000, 11586195, 'BE', 'Belgium'),
    (2022, 593438820508.1729736328, 9.5975117287, NULL, 5.5700000000, 11680210, 'BE', 'Belgium'),
    (2023, 644782756682.7559814453, 4.0490107761, NULL, 5.5280000000, 11787423, 'BE', 'Belgium'),
    (2024, NULL, 3.1434913650, NULL, 5.4880000000, NULL, 'BE', 'Belgium'),
    (2020, 1476107231194.1101074219, 3.2117680380, 21.1971796871, 13.6970000000, 208660842, 'BR', 'Brazil'),
    (2021, 1670647399034.6699218750, 8.3016597559, 15.0108849661, 13.1580000000, 209550294, 'BR', 'Brazil'),
    (2022, 1951923942083.3200683594, 9.2801060896, 28.3960928277, 9.2310000000, 210306415, 'BR', 'Brazil'),
    (2023, 2173665655937.2700195312, 4.5935628228, 37.2075093317, 7.9470000000, 211140729, 'BR', 'Brazil'),
    (2024, NULL, 4.3674640765, NULL, 7.6340000000, NULL, 'BR', 'Brazil'),
    (2020, 1655684730000.1899414062, 0.7169996323, NULL, 9.6570000000, 38028638, 'CA', 'Canada'),
    (2021, 2007472181464.1499023438, 3.3951931853, NULL, 7.5270000000, 38239864, 'CA', 'Canada'),
    (2022, 2161483369422.0100097656, 6.8028011534, NULL, 5.2790000000, 38939056, 'CA', 'Canada'),
    (2023, 2142470914401.3601074219, 3.8790015979, NULL, 5.4150000000, 40097761, 'CA', 'Canada'),
    (2024, NULL, 2.3815838328, NULL, 6.4500000000, NULL, 'CA', 'Canada'),
    (2020, 741999406005.6269531250, -0.7258749333, 3.3575096186, 4.8170000000, 8638167, 'CH', 'Switzerland'),
    (2021, 813408787222.4990234375, 0.5818141685, 1.3765113733, 5.0130000000, 8704546, 'CH', 'Switzerland'),
    (2022, 818426550206.4499511719, 2.8350279864, 0.1459203677, 4.1220000000, 8777088, 'CH', 'Switzerland'),
    (2023, 884940402230.4090576172, 2.1354008802, 1.8221867374, 4.0430000000, 8888093, 'CH', 'Switzerland'),
    (2024, NULL, 1.0623404198, NULL, 4.1100000000, NULL, 'CH', 'Switzerland'),
    (2020, 14687744162801.0000000000, 2.4194218946, 3.8386012045, 5.0000000000, 1411100000, 'CN', 'China'),
    (2021, 17820459508852.1992187500, 0.9810151355, -0.1935170508, 4.5500000000, 1412360000, 'CN', 'China'),
    (2022, 17881782683707.3007812500, 1.9735755574, 2.4810760762, 4.9800000000, 1412175000, 'CN', 'China'),
    (2023, 17794783039552.0000000000, 0.2348368289, 4.9612880276, 4.6700000000, 1410710000, 'CN', 'China'),
    (2024, NULL, 0.2181289384, NULL, 4.5710000000, NULL, 'CN', 'China'),
    (2020, 3940142541354.1000976562, 0.1448779258, NULL, 3.8810000000, 83160871, 'DE', 'Germany'),
    (2021, 4348297440387.5297851562, 3.0666666667, NULL, 3.5940000000, 83196078, 'DE', 'Germany'),
    (2022, 4163596357879.3901367188, 6.8725743855, NULL, 3.1200000000, 83797985, 'DE', 'Germany'),
    (2023, 4525703903627.5302734375, 5.9464366773, NULL, 3.0680000000, 83280000, 'DE', 'Germany'),
    (2024, NULL, 2.2564981434, NULL, 3.4060000000, NULL, 'DE', 'Germany'),
    (2020, 1289783836971.2099609375, -0.3227530173, NULL, 15.5320000000, 47365655, 'ES', 'Spain'),
    (2021, 1461244901852.6899414062, 3.0931351198, NULL, 14.7810000000, 47415794, 'ES', 'Spain'),
    (2022, 1446498147749.0300292969, 8.3905763412, NULL, 12.9170000000, 47759127, 'ES', 'Spain'),
    (2023, 1620090734956.8898925781, 3.5323613349, NULL, 12.1790000000, 48347910, 'ES', 'Spain'),
    (2024, NULL, 2.7741782653, NULL, 11.3940000000, NULL, 'ES', 'Spain'),
    (2020, 2647926055110.0498046875, 0.4764988527, NULL, 8.0090000000, 67601110, 'FR', 'France'),
    (2021, 2966433692008.0898437500, 1.6423314104, NULL, 7.8740000000, 67842811, 'FR', 'France'),
    (2022, 2796302210398.8398437500, 5.2223674837, NULL, 7.3080000000, 68065015, 'FR', 'France'),
    (2023, 3051831611384.7597656250, 4.8783572651, NULL, 7.3350000000, 68287487, 'FR', 'France'),
    (2024, NULL, 1.9990494229, NULL, 7.3700000000, NULL, 'FR', 'France'),
    (2020, 2696778386607.6499023438, 0.9894867038, NULL, 4.4720000000, 67081234, 'GB', 'United Kingdom'),
    (2021, 3143323050707.2597656250, 2.5183710961, NULL, 4.8260000000, 67026292, 'GB', 'United Kingdom'),
    (2022, 3114042471144.3901367188, 7.9220488315, NULL, 3.7300000000, 67791000, 'GB', 'United Kingdom'),
    (2023, 3380854520809.5400390625, 6.7939670679, NULL, 3.9840000000, 68350000, 'GB', 'United Kingdom'),
    (2024, NULL, 3.2715729464, NULL, 4.1110000000, NULL, 'GB', 'United Kingdom'),
    (2020, 1059054842711.5500488281, 1.9209680057, 9.9859267199, 4.2550000000, 274814866, 'ID', 'Indonesia'),
    (2021, 1186509691070.9699707031, 1.5601299053, 2.7532239500, 3.8270000000, 276758053, 'ID', 'Indonesia'),
    (2022, 1319076267291.5100097656, 4.2094638340, -0.9552966101, 3.4620000000, 278830529, 'ID', 'Indonesia'),
    (2023, 1371171152331.1599121094, 3.6701314238, 7.2819552544, 3.3080000000, 281190067, 'ID', 'Indonesia'),
    (2024, NULL, NULL, NULL, 3.3000000000, NULL, 'ID', 'Indonesia'),
    (2020, 436555518400.4509887695, -0.3261836513, NULL, 5.6230000000, 4985382, 'IE', 'Ireland'),
    (2021, 531306516907.9840087891, 2.3403411345, NULL, 6.3640000000, 5033164, 'IE', 'Ireland'),
    (2022, 548570250341.9869995117, 7.8294573643, NULL, 4.5010000000, 5165700, 'IE', 'Ireland'),
    (2023, 551394889339.7779541016, 6.2994248742, NULL, 4.2880000000, 5307600, 'IE', 'Ireland'),
    (2024, NULL, 2.1134499958, NULL, 4.3690000000, NULL, 'IE', 'Ireland'),
    (2020, 411728563086.6320190430, -0.6144123585, 2.3142604999, 4.1690000000, 9215100, 'IL', 'Israel'),
    (2021, 489708278893.0529785156, 1.5102004769, 1.0096462344, 4.8120000000, 9371400, 'IL', 'Israel'),
    (2022, 525000415276.6779785156, 4.3935966591, -1.6878568465, 3.6950000000, 9557500, 'IL', 'Israel'),
    (2023, 513611100815.6909790039, 4.2253521127, NULL, 3.5960000000, 9756600, 'IL', 'Israel'),
    (2024, NULL, 3.0705261474, NULL, 3.1500000000, NULL, 'IL', 'Israel'),
    (2020, 2674851578587.2700195312, 6.6234367763, 4.1359995779, 7.8590000000, 1402617695, 'IN', 'India'),
    (2021, 3167270623260.4702148438, 5.1314074718, 0.3169451442, 6.3800000000, 1414203896, 'IN', 'India'),
    (2022, 3353470496886.3300781250, 6.6990341408, 1.7046109285, 4.8220000000, 1425423212, 'IN', 'India'),
    (2023, 3567551674623.0097656250, 5.6491431891, NULL, 4.1720000000, 1438069596, 'IN', 'India'),
    (2024, NULL, 4.9530355097, NULL, 4.2020000000, NULL, 'IN', 'India'),
    (2020, 1907481094079.2299804688, -0.1377075739, 0.7392693035, 9.1640000000, 59438851, 'IT', 'Italy'),
    (2021, 2179207773596.0900878906, 1.8737832576, 0.7331856229, 9.4970000000, 59133173, 'IT', 'Italy'),
    (2022, 2102995942720.4399414062, 8.2012899116, -1.2511629809, 8.0690000000, 59013667, 'IT', 'Italy'),
    (2023, 2300941152991.8100585938, 5.6221944220, -0.8753388748, 7.6270000000, 58993475, 'IT', 'Italy'),
    (2024, NULL, 0.9823730231, NULL, 6.7780000000, NULL, 'IT', 'Italy'),
    (2020, 5055587093501.5898437500, -0.0249958340, NULL, 2.8090000000, 126261000, 'JP', 'Japan'),
    (2021, 5034620784584.9804687500, -0.2333527794, NULL, 2.8280000000, 125681593, 'JP', 'Japan'),
    (2022, 4256410760723.7500000000, 2.4977027817, NULL, 2.6000000000, 125124989, 'JP', 'Japan'),
    (2023, 4204494802431.5498046875, 3.2681336593, NULL, 2.6000000000, 124516650, 'JP', 'Japan'),
    (2024, NULL, 2.7385368164, NULL, 2.5630000000, NULL, 'JP', 'Japan'),
    (2020, 1644312831906.1699218750, 0.5372880234, 1.2188599261, 3.9310000000, 51836239, 'KR', 'South Korea'),
    (2021, 1818432106880.0400390625, 2.4983333333, 0.1179751521, 3.6390000000, 51769539, 'KR', 'South Korea'),
    (2022, 1673916511799.7099609375, 5.0895136506, 2.9789798652, 2.8570000000, 51672569, 'KR', 'South Korea'),
    (2023, 1712792854202.3701171875, 3.5974562503, 3.0618929695, 2.6750000000, 51712619, 'KR', 'South Korea'),
    (2024, NULL, 2.3217432864, NULL, 2.6040000000, NULL, 'KR', 'South Korea'),
    (2020, 1121064767261.8798828125, 3.3968341557, 1.6458420985, 4.4400000000, 126799054, 'MX', 'Mexico'),
    (2021, 1316569466932.5900878906, 5.6892084768, 0.3863544155, 4.0190000000, 127648148, 'MX', 'Mexico'),
    (2022, 1464312692331.5800781250, 7.8962761917, 1.5793605737, 3.2560000000, 128613117, 'MX', 'Mexico'),
    (2023, 1789114434843.4599609375, 5.5279608731, 6.8272629564, 2.7650000000, 129739759, 'MX', 'Mexico'),
    (2024, NULL, 4.7222558845, NULL, 2.7110000000, NULL, 'MX', 'Mexico'),
    (2020, 432198898467.7949829102, 13.2460234277, 5.3712802111, 5.7420000000, 213996181, 'NG', 'Nigeria'),
    (2021, 440833635873.8270263672, 16.9528457222, 1.2277185301, 5.4500000000, 218529286, 'NG', 'Nigeria'),
    (2022, 477403400101.1740112305, 18.8471877843, 0.9192318953, 3.8210000000, 223150896, 'NG', 'Nigeria'),
    (2023, 363846332834.6179809570, 24.6595502031, 1.2330504874, 3.0740000000, 227882945, 'NG', 'Nigeria'),
    (2024, NULL, NULL, NULL, 2.9890000000, NULL, 'NG', 'Nigeria'),
    (2020, 932560861701.1700439453, 1.2724603779, NULL, 3.8200000000, 17441500, 'NL', 'Netherlands'),
    (2021, 1054472123449.5999755859, 2.6757200881, NULL, 4.2090000000, 17533044, 'NL', 'Netherlands'),
    (2022, 1046540797548.6400146484, 10.0012078753, NULL, 3.5260000000, 17700982, 'NL', 'Netherlands'),
    (2023, 1154361305398.0600585938, 3.8383935434, NULL, 3.5370000000, 17877117, 'NL', 'Netherlands'),
    (2024, NULL, 3.3475430422, NULL, 3.5990000000, NULL, 'NL', 'Netherlands'),
    (2020, 367633418886.6270141602, 1.2865849071, 5.3494194173, 4.4240000000, 5379475, 'NO', 'Norway'),
    (2021, 503367986030.2680053711, 3.4838805527, -14.9228767781, 4.3590000000, 5408320, 'NO', 'Norway'),
    (2022, 593726965415.6190185547, 5.7641231785, -19.4429902740, 3.2310000000, 5457127, 'NO', 'Norway'),
    (2023, 485310823603.6619873047, 5.5178498710, 17.8198050632, 3.5720000000, 5519594, 'NO', 'Norway'),
    (2024, NULL, 3.1453013443, NULL, 3.9700000000, NULL, 'NO', 'Norway'),
    (2020, 605914237903.7419433594, 3.3744697262, NULL, 3.1550000000, 37899070, 'PL', 'Poland'),
    (2021, 689170230665.3499755859, 5.0550270472, NULL, 3.2680000000, 36981559, 'PL', 'Poland'),
    (2022, 695607470875.2760009766, 14.4294507576, NULL, 2.8110000000, 36821749, 'PL', 'Poland'),
    (2023, 809200697797.0880126953, 11.5289127961, NULL, 2.7430000000, 36687353, 'PL', 'Poland'),
    (2024, NULL, 3.7842600751, NULL, 2.4720000000, NULL, 'PL', 'Poland'),
    (2020, 1493075894362.1398925781, 3.3816593724, 5.8252621206, 5.6200000000, 145245148, 'RU', 'Russia'),
    (2021, 1843392293734.3798828125, 6.6944589196, -10.2423105030, 4.7490000000, 144746762, 'RU', 'Russia'),
    (2022, 2266029240645.3398437500, NULL, -4.5033586532, 3.8670000000, 144236933, 'RU', 'Russia'),
    (2023, 2021421476035.4199218750, NULL, 4.2483846321, 3.0760000000, 143826130, 'RU', 'Russia'),
    (2024, NULL, NULL, NULL, 2.5270000000, NULL, 'RU', 'Russia'),
    (2020, 734271200000.0000000000, 3.4454582596, NULL, 7.6600000000, 31552510, 'SA', 'Saudi Arabia'),
    (2021, 874156000000.0000000000, 3.0632898894, NULL, 6.6210000000, 30784383, 'SA', 'Saudi Arabia'),
    (2022, 1108571466666.6699218750, 2.4740737193, NULL, 5.5890000000, 32175224, 'SA', 'Saudi Arabia'),
    (2023, 1067582933333.3299560547, 2.3270851836, NULL, 4.0080000000, 33264292, 'SA', 'Saudi Arabia'),
    (2024, NULL, 1.6879211238, NULL, 3.8960000000, NULL, 'SA', 'Saudi Arabia'),
    (2020, 545147614972.1409912109, 0.4973673189, NULL, 8.2910000000, 10353442, 'SE', 'Sweden'),
    (2021, 637186904843.6359863281, 2.1631973645, NULL, 8.7220000000, 10415811, 'SE', 'Sweden'),
    (2022, 579895717343.9560546875, 8.3692909887, NULL, 7.3920000000, 10486941, 'SE', 'Sweden'),
    (2023, 584960475767.3199462891, 8.5486248975, NULL, 7.6110000000, 10536632, 'SE', 'Sweden'),
    (2024, NULL, 2.8358165822, NULL, 8.5280000000, NULL, 'SE', 'Sweden'),
    (2020, 500461898480.2459716797, -0.8459371474, 4.6516900475, 1.0990000000, 71641484, 'TH', 'Thailand'),
    (2021, 506256494297.3400268555, 1.2303954132, 1.2664971567, 1.2150000000, 71727332, 'TH', 'Thailand'),
    (2022, 495645210972.7509765625, 6.0774122843, -1.5545567970, 0.9400000000, 71735329, 'TH', 'Thailand'),
    (2023, 514968699239.0050048828, 1.2280262355, 3.0286386123, 0.7330000000, 71702435, 'TH', 'Thailand'),
    (2024, NULL, NULL, NULL, 0.6930000000, NULL, 'TH', 'Thailand'),
    (2020, 720338490327.2480468750, 12.2789574463, NULL, 13.1480000000, 83384680, 'TR', 'Turkey'),
    (2021, 819865223976.1149902344, 19.5964926913, NULL, 11.9690000000, 84147318, 'TR', 'Turkey'),
    (2022, 907118434653.5050048828, 72.3088359891, NULL, 10.4650000000, 84979913, 'TR', 'Turkey'),
    (2023, 1118252964260.7700195312, 53.8594087593, NULL, 9.3880000000, 85325965, 'TR', 'Turkey'),
    (2024, NULL, 58.5064507300, NULL, 8.4490000000, NULL, 'TR', 'Turkey'),
    (2020, 21354105000000.0000000000, 1.2335843963, 2.1862818988, 8.0550000000, 331526933, 'US', 'United States'),
    (2021, 23681171000000.0000000000, 4.6978588636, -1.2585215893, 5.3490000000, 332048977, 'US', 'United States'),
    (2022, 26006893000000.0000000000, 8.0027998205, NULL, 3.6500000000, 333271411, 'US', 'United States'),
    (2023, 27720709000000.0000000000, 4.1163383837, NULL, 3.6380000000, 334914895, 'US', 'United States'),
    (2024, NULL, 2.9495252049, NULL, 4.1060000000, NULL, 'US', 'United States');

    INSERT INTO reference.economic_events(event_id, title, country, currency, category, event_date, importance, previous_value, forecast_value, actual_value, is_high_impact) VALUES
    ('US-CPI-YoY-2025-09', 'US CPI YoY', 'US', 'USD', 'Inflation', '2025-09-12', 'high', '3.7', '3.8', NULL, TRUE),
    ('US-NFP-2025-09', 'US Non-Farm Payrolls', 'US', 'USD', 'Employment', '2025-09-05', 'high', '187', '200', NULL, TRUE),
    ('US-ISM-Manufacturing-2025-09', 'US ISM Manufacturing PMI', 'US', 'USD', 'Manufacturing', '2025-09-01', 'medium', '52.0', '51.5', NULL, FALSE),
    ('EU-CPI-YoY-2025-09', 'EU CPI YoY', 'EU', 'EUR', 'Inflation', '2025-09-15', 'high', '2.1', '2.3', NULL, TRUE),
    ('EU-GDP-QoQ-2025-Q2', 'EU GDP QoQ', 'EU', 'EUR', 'GDP', '2025-08-14', 'high', '-0.1', '0.2', NULL, TRUE),
    ('UK-CPI-YoY-2025-09', 'UK CPI YoY', 'UK', 'GBP', 'Inflation', '2025-09-16', 'high', '3.4', '3.6', NULL, TRUE),
    ('UK-NFP-2025-09', 'UK Non-Farm Payrolls', 'UK', 'GBP', 'Employment', '2025-09-10', 'high', '-20', '-15', NULL, TRUE),
    ('JP-CPI-YoY-2025-08', 'Japan CPI YoY', 'JP', 'JPY', 'Inflation', '2025-08-20', 'medium', '-0.2', '-0.1', NULL, FALSE),
    ('JP-GDP-QoQ-2025-Q2', 'Japan GDP QoQ', 'JP', 'JPY', 'GDP', '2025-08-17', 'high', '-0.3', '-0.1', NULL, TRUE),
    ('CN-CPI-YoY-2025-08', 'China CPI YoY', 'CN', 'CNY', 'Inflation', '2025-08-10', 'medium', '2.5', '2.6', NULL, FALSE),
    ('CN-GDP-QoQ-2025-Q2', 'China GDP QoQ', 'CN', 'CNY', 'GDP', '2025-07-30', 'high', '1.2', '1.5', NULL, TRUE) ON CONFLICT (event_id) DO NOTHING;

    INSERT INTO clean_data.stock_market_data (time_key, ticker, name, price, change_percent, volume) VALUES
    (now(), 'AAPL', 'Apple Inc.', 175.64, 1.25, 74200000),
    (now(), 'MSFT', 'Microsoft Corporation', 299.01, -0.75, 35000000),
    (now(), 'GOOGL', 'Alphabet Inc.', 2850.12, 0.50, 1800000),
    (now(), 'AMZN', 'Amazon.com, Inc.', 3450.55, -1.10, 4200000),
    (now(), 'TSLA', 'Tesla, Inc.', 720.30, 2.00, 30000000),
    (now(), 'FB', 'Meta Platforms, Inc.', 355.20, -0.60, 15000000),
    (now(), 'NFLX', 'Netflix, Inc.', 590.45, 1.80, 8000000),
    (now(), 'NVDA', 'NVIDIA Corporation', 220.15, 3.10, 25000000),
    (now(), 'JPM', 'JPMorgan Chase & Co.', 160.75, -0.20, 12000000),
    (now(), 'V', 'Visa Inc.', 230.50, 0.90, 9000000) ON CONFLICT (time_key, ticker) DO NOTHING;

    INSERT INTO raw_data.crypto_transactions (hash, total, fee, "timestamp") VALUES
    ('0xseedtx1', 1.5, 0.0001, now()),
      -- June 1, 2021
    ('0xseedtx2', 2.0, 0.0002, now()),
    -- June 2, 2021
    ('0xseedtx3', 3.0, 0.0003, now()),
    -- June 3, 2021
    ('0xseedtx4', 4.0, 0.0004, now()),
    -- June 4, 2021
    ('0xseedtx5', 5.0, 0.0005, now()) ON CONFLICT (hash) DO NOTHING;

    INSERT INTO raw_data.crypto_tx_senders (transaction_hash, address, output_value) 
    SELECT v.tx, v.addr, v.val
    FROM(
         VALUES
        ('0xseedtx1', '0xSenderAddress1', 1.5),
        ('0xseedtx2', '0xSenderAddress2', 2.0),
        ('0xseedtx3', '0xSenderAddress3', 3.0),
        ('0xseedtx4', '0xSenderAddress4', 4.0),
        ('0xseedtx5', '0xSenderAddress5', 5.0)
    ) AS v(tx, addr, val) WHERE NOT EXISTS (SELECT 1 FROM raw_data.crypto_tx_senders s WHERE s.transaction_hash = v.tx AND address = v.addr);
   
    INSERT INTO raw_data.crypto_tx_receivers (transaction_hash, address, value) 
    SELECT v.tx, v.addr, v.val
    FROM(
        VALUES
        ('0xseedtx1', '0xReceiverAddress1', 1.4999),
        ('0xseedtx2', '0xReceiverAddress2', 1.9998),
        ('0xseedtx3', '0xReceiverAddress3', 2.9997),
        ('0xseedtx4', '0xReceiverAddress4', 3.9996),
        ('0xseedtx5', '0xReceiverAddress5', 4.9995)
    ) AS v(tx, addr, val) WHERE NOT EXISTS (SELECT 1 FROM raw_data.crypto_tx_receivers r WHERE r.transaction_hash = v.tx AND address = v.addr);
    
    INSERT INTO analytics.news_sentiment
(news_id, title, summary, source, authors, overall_sentiment_score, overall_sentiment_label, url, banner_image_url, time_published, topics, ticker_sentiment)
VALUES
    ('news-001', 'Market Hits All-Time High',
     'The stock market reached an all-time high today, driven by strong earnings reports.',
     'Financial Times', '["Jane Doe"]'::jsonb, 0.8, 'Bullish',
     'http://example.com/news-001', 'http://example.com/image1.jpg', now(),
     '["Stock Market","Earnings"]'::jsonb, '{"AAPL": 0.9, "MSFT": 0.7}'::jsonb),

    ('news-002', 'Economic Growth Slows Down',
     'Recent data indicates a slowdown in economic growth, raising concerns among investors.',
     'Bloomberg', '["John Smith"]'::jsonb, -0.6, 'Bearish',
     'http://example.com/news-002', 'http://example.com/image2.jpg', now(),
     '["Economy"]'::jsonb, '{"GDP": -0.5}'::jsonb),

    ('news-003', 'New Tech Innovations Unveiled',
     'Several tech companies unveiled new innovations at the annual tech conference.',
     'TechCrunch', '["Alice Johnson"]'::jsonb, 0.7, 'Bullish',
     'http://example.com/news-003', 'http://example.com/image3.jpg', now(),
     '["Technology"]'::jsonb, '{"GOOGL": 0.8, "AMZN": 0.6}'::jsonb),

    ('news-004', 'Regulatory Changes in Finance Sector',
     'New regulatory changes are expected to impact the finance sector significantly.',
     'Reuters', '["Bob Lee"]'::jsonb, -0.4, 'Bearish',
     'http://example.com/news-004', 'http://example.com/image4.jpg', now(),
     '["Finance"]'::jsonb, '{"JPM": -0.3}'::jsonb),

    ('news-005', 'Global Markets React to Geopolitical Tensions',
     'Geopolitical tensions have caused volatility in global markets.',
     'CNBC', '["Eve Kim"]'::jsonb, -0.7, 'Bearish',
     'http://example.com/news-005', 'http://example.com/image5.jpg', now(),
     '["Geopolitics"]'::jsonb, '{"TSLA": -0.6, "META": -0.5}'::jsonb)
ON CONFLICT (news_id) DO NOTHING;

    DELETE FROM analytics.news_sentiment_summary WHERE summary_date = CURRENT_DATE AND  period_type = 'daily';

    INSERT INTO analytics.news_sentiment_summary (summary_date, period_type, total_news_count, bullish_count, somewhat_bullish_count, neutral_count, somewhat_bearish_count, bearish_count, average_sentiment_score, dominant_sentiment, top_tickers, market_sector) VALUES
    (CURRENT_DATE, 'daily', 5, 2, 1, 0, 1, 1, 0.16, 'Bullish', '["AAPL","MSFT","GOOGL","AMZN","TSLA","META"]'::jsonb,'["Stock Market","Earnings","Economy","Technology","Finance","Geopolitics"]'::jsonb);
    INSERT INTO analytics.market_movers (ticker, name, price, change_percent, volume, market_cap, sector, industry, mover_type, reason, news_count, sentiment_score, ranking, data_date) VALUES
    ('AAPL', 'Apple Inc.', 175.64, 1.25, 74200000, 2.8e12, 'Technology', 'Consumer Electronics', 'gainer', 'Strong earnings report', 3, 0.9, 1, CURRENT_DATE),
    ('MSFT', 'Microsoft Corporation', 299.01, -0.75, 35000000, 2.5e12, 'Technology', 'Software', 'loser', 'Missed revenue expectations', 2, -0.6, 2, CURRENT_DATE),
    ('GOOGL', 'Alphabet Inc.', 2850.12, 0.50, 1800000, 1.9e12, 'Technology', 'Internet Services', 'gainer', 'New product launch', 1, 0.7, 3, CURRENT_DATE),
    ('AMZN', 'Amazon.com, Inc.', 3450.55, -1.10, 4200000, 1.7e12, 'Consumer Discretionary', 'E-Commerce', 'loser', 'Regulatory concerns', 2, -0.5, 4, CURRENT_DATE),
    ('TSLA', 'Tesla, Inc.', 720.30, 2.00, 30000000, 800e9, 'Consumer Discretionary', 'Automobiles', 'gainer', 'Positive market sentiment', 4, 0.8, 5, CURRENT_DATE) ON CONFLICT DO NOTHING;

-- Insert cryptocurrency sentiment data
-- This provides initial sentiment scores for the top cryptocurrencies
INSERT INTO analytics.finbert_coin_sentiment (crypto_id, sentiment_score, sentiment_label, created_at, last_updated_at)
SELECT 
    c.crypto_id,
    CASE c.symbol_binance
        WHEN 'BTCUSDT' THEN 0.75
        WHEN 'ETHUSDT' THEN 0.68
        WHEN 'BNBUSDT' THEN 0.55
        WHEN 'SOLUSDT' THEN 0.82
        WHEN 'ADAUSDT' THEN 0.48
        WHEN 'DOGEUSDT' THEN 0.35
        WHEN 'MATICUSDT' THEN 0.62
        WHEN 'DOTUSDT' THEN 0.58
        WHEN 'AVAXUSDT' THEN 0.71
        WHEN 'LINKUSDT' THEN 0.66
    END as sentiment_score,
    CASE c.symbol_binance
        WHEN 'BTCUSDT' THEN 'Bullish'
        WHEN 'ETHUSDT' THEN 'Bullish'
        WHEN 'BNBUSDT' THEN 'Neutral'
        WHEN 'SOLUSDT' THEN 'Very Bullish'
        WHEN 'ADAUSDT' THEN 'Neutral'
        WHEN 'DOGEUSDT' THEN 'Bearish'
        WHEN 'MATICUSDT' THEN 'Bullish'
        WHEN 'DOTUSDT' THEN 'Neutral'
        WHEN 'AVAXUSDT' THEN 'Bullish'
        WHEN 'LINKUSDT' THEN 'Bullish'
    END as sentiment_label,
    now() as created_at,
    now() as last_updated_at
FROM reference.cryptocurrencies c
WHERE c.symbol_binance IN ('BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT')
ON CONFLICT DO NOTHING;

-- Insert market-level sentiment data
INSERT INTO analytics.market_level_sentiment (sentiment_score, sentiment_label, created_at, last_updated_at)
VALUES 
    (0.64, 'Bullish', now(), now())
ON CONFLICT DO NOTHING;

-- Seed a billing plan
TRUNCATE TABLE payments.plans CASCADE;
-- Seed / Upsert plans (idempotent)
INSERT INTO payments.plans (
  plan_key, tier, billing_cycle, price_cents, currency,
  duration_days,  
  news_analysis_limit, social_analysis_limit,
  data_access,
  api_access, priority_support,

  is_visible, is_active,

  description
)
VALUES
  (
    'free', 'free', 'none', 0, 'USD',
    NULL,  -- ← duration_days
    10, 10, 'basic', FALSE, FALSE, 
    TRUE, TRUE,
    'Free plan with limited analyses'
  ),
  (
    'basic_monthly', 'basic', 'monthly', 9900, 'USD',
    30,  -- ← duration_days
    200, 200,
    'limited',
    FALSE, FALSE,
    TRUE, TRUE,
    'Basic monthly subscription'
  ),
  (
    'basic_yearly', 'basic', 'yearly',
    199900, 'USD', 
    365,  -- ← duration_days
    3000, 3000,
    'limited', 
    FALSE, TRUE,
    TRUE, TRUE,
    'Basic yearly subscription'
  )
ON CONFLICT (plan_key) DO UPDATE SET
  tier = EXCLUDED.tier,
  billing_cycle = EXCLUDED.billing_cycle,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  duration_days = EXCLUDED.duration_days,
  news_analysis_limit = EXCLUDED.news_analysis_limit,
  social_analysis_limit = EXCLUDED.social_analysis_limit,
  data_access = EXCLUDED.data_access,
  api_access = EXCLUDED.api_access,
  priority_support = EXCLUDED.priority_support,
  is_visible = EXCLUDED.is_visible,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  updated_at = now();
