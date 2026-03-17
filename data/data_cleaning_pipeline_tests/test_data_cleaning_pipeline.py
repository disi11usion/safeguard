"""
Unit tests for data_cleaning_pipeline.py
Covers news + social cleaning functions and utility helpers end-to-end.
"""

import sys
from pathlib import Path
import unittest
import json
import pandas as pd

# Import the cleaning functions
sys.path.append(str(Path(__file__).resolve().parents[1]))

from data_cleaning_pipeline import (
    # base
    sanitize_text,

    # news
    emojis_emoticons_cleaning_news,
    contractions_adjusment_news,
    white_space_removal_news,
    url_news_removal,
    html_tag_news_removal,
    final_news_formatting,
    news_data_cleaning,

    # social
    emojis_emoticons_cleaning_social,
    contractions_adjustment_social,
    white_space_removal_social,
    clean_comments_column,
    url_removal_social,
    html_tag_removal_social,
    final_formatting_social,
    social_data_cleaning,

    # utils
    extract_metadata_from_filename
)

class TestDataCleaningPipeline(unittest.TestCase):

    def setUp(self):
        # Sample datasets
        self.sample_news_data = pd.DataFrame({
            'title': [
                "Bitcoin crashes 😱 overnight!",
                "Crypto market won't stop growing!",
                "   Ethereum 2.0 Launch 🚀   ",
                "Binance expands <b>boldly</b>!",
                "Breaking: Circle's IPO 🚨 delayed again...",
                "Why Solana’s surge isn’t sustainable — experts say",
                "FTX collapse — what it means for users",
                "😬 SEC delays decision on BTC ETF",
                "“Crypto” isn’t just a fad, it’s a revolution",
                "Robinhood & Coinbase to delist some tokens",
                "New NFT scam hits Discord servers 😡",
                "Huge gains: Dogecoin soars 50% 📈",
                "Chainalysis says hacks down 70% 📉",
                "El Salvador's 🇸🇻 Bitcoin strategy explained",
                "‘Altcoins’ are showing strength in new market",
                "Coinbase <i>surges</i> as volume increases",
                "Market “sentiment” shifts on latest ETF news",
                "Crypto.com sees record user growth 📊",
                "Stablecoin depeg explained at https://stablecoin.org",
                "Crypto traders react to <u>regulatory</u> crackdown"
            ],
            'news': [
                "Bitcoin dropped 15% overnight due to market panic.",
                "Analysts say the crypto market won't stop growing in 2025.",
                "Ethereum 2.0 officially launched — visit https://ethereum.org for details.",
                "Binance moves boldly into new Asian markets.",
                "Circle delays IPO after SEC feedback — see https://circle.com for details.",
                "Experts believe Solana’s surge is temporary despite optimism.",
                "FTX users worry about asset recovery after exchange collapse.",
                "SEC says they will delay BTC ETF decisions for another month.",
                "Crypto isn’t just a fad — it’s the next big tech wave.",
                "Robinhood and Coinbase to delist tokens facing SEC scrutiny.",
                "Scammers targeted NFT traders via Discord, stealing funds.",
                "Dogecoin spiked 50% after Elon Musk tweet.",
                "Chainalysis reports hacking activity is down year-over-year.",
                "Bitcoin bond plan in El Salvador continues despite criticism.",
                "Altcoins like Cardano and Polygon gain investor interest.",
                "Coinbase shares rise as users return to the platform.",
                "Investors say market “sentiment” has turned bullish.",
                "Crypto.com reached 80 million users globally.",
                "Stablecoins depeg under pressure — more at https://stablecoin.org",
                "Regulations spark fear in crypto community across the world."
            ],
            'url': [f'url{i}' for i in range(1, 21)],
            'news_id': list(range(1, 21)),
            'coins': ['BTC']*20,
            'crypto_ids': ['bitcoin']*20
        })

        self.sample_social_data = pd.DataFrame({
            'title': [
                "LIVE BITCOIN TRADING 😎 Crypto and Market Analysis!",
                "SOL Price 🚀 | Solana Technical Analysis Today!",
                "8 July Live Market - Gold & Crypto 📉 Crash",
                "Ethereum Update <b>LIVE</b> Streaming 🔴",
                "Bitcoin Pump Incoming!!! <i>Check now</i>",
                "Crypto Crash 😱 | What to do?",
                "Should You Buy XRP? 🤔 Full Analysis Inside",
                "Top 3 Altcoins To Buy Now 💰💸",
                "Altcoins Are Exploding 💥 What’s Next?",
                "Ethereum Breakout Soon: Watch Levels 📊",
                "Why Is Crypto Falling Today? 🧐",
                "Bitcoin Will Explode In 2025 🔥🔥",
                "Pump Coming? Here’s What to Know 😈",
                "Major Market Correction Alert ⚠️",
                "Passive Income With Crypto 😍 in 2025!",
                "Bitcoin Surging 🚀 Explained!",
                "Ethereum ETF Coming Soon? 👀",
                "Be Ready, Investors! 📈🧠",
                "Buy Bitcoin Now or Wait? 🤷",
                "Top Coins for July 🌕🌟"
            ],
            'author': [
                "AlexCrypto", "SolanaGuru", "TradeAlert", "EthNews", "CryptoDaily",
                "CoinAlerts", "XRPChannel", "AltcoinBuzz", "BoomCrypto", "ETHWatch",
                "CryptoTalks", "BTCInsider", "PumpTime", "MarketEye", "PassiveGains",
                "RocketBTC", "ETFInsider", "InvestNews", "HodlNow", "MoonList"
            ],
            'content': [
                "Join us for daily updates 😊 and news on BTC. Visit https://btcnews.com <i>now</i>!",
                "Solana rising fast! Check https://solprice.io for details.",
                "Market dip incoming. Full story at <b>https://crashnews.com</b>.",
                "Live updates on ETH market! Join our Discord 🚀",
                "Bitcoin is ready to explode 😤 Visit <i>https://pump.info</i>",
                "Crash alert!!! 😱 Charts show danger at https://alert.crypto",
                "Why XRP is pumping 💥 full breakdown here: https://xrpnow.com",
                "Top altcoins listed at <b>https://alts.io</b>. Don’t miss out!",
                "Charts are 🔥 and signals show momentum. Info at <i>https://gainz.net</i>",
                "ETH breakout pattern confirmed 🚀 More at https://ethwatch.org",
                "Big red candle today 😭! Read more <b>https://fall.crypto</b>",
                "2025 will be massive for BTC 🚀💣 Learn more at pumpfuture.org",
                "Insiders say pump coming soon. Link: https://pumpcenter.io",
                "Corrective phase ahead! More at correction.buzz <i>read now</i>",
                "Crypto income strategies in 2025 💵 full article <b>here</b>.",
                "Explanation for surge here: https://btcboom.com 🔥",
                "Ethereum ETF approval could change everything! Read <i>https://etfcrypto.com</i>",
                "Critical signals at https://investoralert.org 💡",
                "Wait or buy? 🤔 Details at decision.crypto.org",
                "Top coins listed for July at <i>https://moonshots.com</i>"
            ],
            'comments': [
                '[{"comment": "Great vid 😎!"}, {"comment": "Loved it!"}]',
                '[{"comment": "Thanks for covering SOL 🚀"}, {"comment": "To the moon!"}]',
                '[{"comment": "Helpful update!"}, {"comment": "Crash incoming 😱"}]',
                '[{"comment": "Streaming now?"}, {"comment": "Link please!"}]',
                '[{"comment": "Nice analysis"}, {"comment": "What’s the entry price?"}]',
                '[{"comment": "This scared me 😨"}, {"comment": "Sell now?"}]',
                '[{"comment": "HODL!!"}, {"comment": "XRP FTW 💪"}]',
                '[{"comment": "Altcoins booming!"}, {"comment": "Which one to buy?"}]',
                '[{"comment": "Timing is key!"}, {"comment": "Alt signals strong!"}]',
                '[{"comment": "Great call!"}, {"comment": "Watched it live 📺"}]',
                '[{"comment": "Is it too late to buy?"}, {"comment": "Red day 🟥"}]',
                '[{"comment": "I hope this is true!"}, {"comment": "2025 will be lit 🔥"}]',
                '[{"comment": "Where did you hear this?"}, {"comment": "Show sources please"}]',
                '[{"comment": "Corrections are normal"}, {"comment": "Brace yourself!"}]',
                '[{"comment": "Passive gains yes!!"}, {"comment": "How much per month?"}]',
                '[{"comment": "Amazing growth"}, {"comment": "LFG!! 🚀"}]',
                '[{"comment": "ETF confirmed?"}, {"comment": "Good news 👏"}]',
                '[{"comment": "Thanks for the alert"}, {"comment": "More updates pls"}]',
                '[{"comment": "Holding till next year"}, {"comment": "Buy dip?"}]',
                '[{"comment": "Add SHIB too!"}, {"comment": "Awesome picks!"}]'
            ]
        })

    # Helpers
    def _assert_has_no_emoji(self, text: str):
        banned = ["😱", "🚀", "📈", "📉", "🇸🇻", "😬", "📊", "😡", "🔥", "💥", "😍", "🧠", "🌕", "🌟", "😭", "👀", "🤔", "💣"]
        for b in banned:
            self.assertNotIn(b, text)

    # Tests
    def test_sanitize_text(self):
        cases = [
            ("It's a test", "It's a test"),
            ("Price: 10 → 20", "Price: 10  20"),
            ("• Bitcoin • Ethereum", " Bitcoin  Ethereum"),
            ("Crypto &amp; blockchain", "Crypto & blockchain"),
        ]
        for inp, exp in cases:
            self.assertEqual(sanitize_text(inp), exp)
        print("Text sanitization working successfully!")

    def test_news_emojis_removed(self):
        out = emojis_emoticons_cleaning_news(self.sample_news_data.copy())
        self._assert_has_no_emoji(out["title"].iloc[0])
        self._assert_has_no_emoji(out["title"].iloc[11])
        print("Emoji cleaning (news) working successfully!")

    def test_news_whitespace_normalized(self):
        out = white_space_removal_news(self.sample_news_data.copy())
        self.assertEqual(out["title"].iloc[2], "Ethereum 2.0 Launch 🚀")
        print("Whitespace normalization (news) working successfully!")

    def test_news_url_removed(self):
        out = url_news_removal(self.sample_news_data.copy())
        self.assertNotIn("https://ethereum.org", out["news"].iloc[2])
        self.assertNotIn("https://circle.com", out["news"].iloc[4])
        self.assertNotIn("https://stablecoin.org", out["title"].iloc[18])
        print("URL removal (news) working successfully!")

    def test_news_html_stripped_and_entities_handled(self):
        out = html_tag_news_removal(self.sample_news_data.copy())
        out = white_space_removal_news(out)
        out = final_news_formatting(out)
        self.assertEqual(out["title"].iloc[3], "Binance expands boldly !")
        self.assertIn("&", out["title"].iloc[9])
        self.assertIn("El Salvador's", out["title"].iloc[13])
        print("HTML stripping + entities handling (news) working successfully!")

    def test_news_pipeline_core_expectations(self):
        out = news_data_cleaning(self.sample_news_data.copy())
        self.assertEqual(len(out), len(self.sample_news_data))
        self._assert_has_no_emoji(out["title"].iloc[0])
        self.assertNotIn("<b>", out["title"].iloc[3])
        self.assertNotIn("https://ethereum.org", out["news"].iloc[2])

        out2 = news_data_cleaning(out.copy())

        QUOTES = ['“', '”', '"', '‘', '’']
        def _norm_series(s):
            def _norm(x: str) -> str:
                x = " ".join(x.split())
                for q in QUOTES:
                    x = x.replace(q, "")
                return x
            return s.astype(str).map(_norm)

        pd.testing.assert_series_equal(_norm_series(out["title"]),
                                       _norm_series(out2["title"]),
                                       check_names=False)
        pd.testing.assert_series_equal(_norm_series(out["news"]),
                                       _norm_series(out2["news"]),
                                       check_names=False)
        print("News cleaning pipeline (core + soft idempotency) working successfully!")

    def test_social_emojis_removed(self):
        out = emojis_emoticons_cleaning_social(self.sample_social_data.copy())
        self._assert_has_no_emoji(out["title"].iloc[0])
        self._assert_has_no_emoji(out["content"].iloc[10])
        print("Emoji cleaning (social) working successfully!")

    def test_social_whitespace_normalized(self):
        messy = self.sample_social_data.copy()
        messy.loc[0, "title"] = "  LIVE   BITCOIN   TRADING   "
        out = white_space_removal_social(messy)
        self.assertEqual(out["title"].iloc[0], "LIVE BITCOIN TRADING")
        print("Whitespace normalization (social) working successfully!")

    def test_social_urls_removed(self):
        out = url_removal_social(self.sample_social_data.copy())
        self.assertNotIn("https://btcnews.com", out["content"].iloc[0])
        self.assertNotIn("https://solprice.io", out["content"].iloc[1])
        self.assertNotIn("https://moonshots.com", out["content"].iloc[19])
        print("URL removal (social) working successfully!")

    def test_social_html_stripped_entities(self):
        out = html_tag_removal_social(self.sample_social_data.copy())
        out = white_space_removal_social(out)
        out = final_formatting_social(out)
        self.assertTrue(out["title"].iloc[3].startswith("Ethereum Update LIVE Streaming"))
        self.assertIn("Check now", out["title"].iloc[4])
        print("HTML stripping + entities handling (social) working successfully!")

    def test_clean_comments_json_valid(self):
        out = clean_comments_column(self.sample_social_data.copy())
        sample = out["comments"].iloc[0]
        parsed = json.loads(sample)
        self.assertIsInstance(parsed, list)
        self.assertIn("comment", parsed[0])
        print("Comments JSON cleaning working successfully!")

    def test_social_pipeline_core_expectations(self):
        out = social_data_cleaning(self.sample_social_data.copy())
        self.assertEqual(len(out), len(self.sample_social_data))
        self._assert_has_no_emoji(out["title"].iloc[1])
        self.assertNotIn("<b>", out["content"].iloc[2])

        out2 = social_data_cleaning(out.copy())

        def _norm_series(s):
            return s.astype(str).map(lambda x: " ".join(x.split()))
        pd.testing.assert_series_equal(_norm_series(out["title"]),
                                       _norm_series(out2["title"]),
                                       check_names=False)
        pd.testing.assert_series_equal(_norm_series(out["content"]),
                                       _norm_series(out2["content"]),
                                       check_names=False)
        print("Social cleaning pipeline (core + soft idempotency) working successfully!")

    def test_extract_metadata_from_filename(self):
        cases = [
            ("news_123_550e8400-e29b-41d4-a716-446655440000.csv", ("news", 123, "550e8400-e29b-41d4-a716-446655440000")),
            ("reddit_456_6ba7b810-9dad-11d1-80b4-00c04fd430c8.csv", ("reddit", 456, "6ba7b810-9dad-11d1-80b4-00c04fd430c8")),
        ]
        for fn, (src, sid, jid) in cases:
            source, source_id, job_id = extract_metadata_from_filename(fn)
            self.assertEqual(source, src)
            self.assertEqual(source_id, sid)
            self.assertEqual(str(job_id), jid)
        print("Filename metadata extraction working successfully!")

    def test_extract_metadata_from_filename_invalid(self):
        for fn in ["invalid.csv", "news_123.csv", "news_source_id.csv"]:
            with self.subTest(fn=fn):
                with self.assertRaises(ValueError):
                    extract_metadata_from_filename(fn)
        print("Invalid filename error handling working successfully!")

    def test_news_pipeline_missing_required_columns(self):
        with self.assertRaises(KeyError):
            news_data_cleaning(pd.DataFrame())
        print("News pipeline required-columns check working successfully!")

    def test_social_pipeline_missing_required_columns(self):
        with self.assertRaises(KeyError):
            social_data_cleaning(pd.DataFrame())
        print("Social pipeline required-columns check working successfully!")

if __name__ == "__main__":
    print("\n============================================================")
    print("Starting Data Cleaning Test Script")
    print("============================================================")
    unittest.main(verbosity=0)  # Only our prints
    print("\nAll tests passed successfully!")
    print("\n============================================================")
    print("Data Cleaning Test Script executed Successfully!")
    print("============================================================\n")
