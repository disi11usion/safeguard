"""
# file: user_preference.py
# description: This script provides functions for managing user preferences,
# including setting, updating, and retrieving preferences.
# Date: 26-06-2025
"""

import os
import re
import json
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json
from typing import Any, Dict, Optional, Iterable
from .user_auth import get_user_id_from_token

# Load environment variables from .env file
load_dotenv()
from database.db_pool import get_conn, release_conn

def _open_conn():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SET TIME ZONE 'UTC';")
    conn.commit()
    return conn

# Function to update user preferences based on risk score and selected choices
def update_user_preference(access_token, selected_preference):
    conn = None
    cursor = None
    try:
        conn = _open_conn()
        cursor = conn.cursor()

        user_id = get_user_id_from_token(access_token)

        data = json.loads(selected_preference)

        risk_score = None
        try:
            scores = data.get("scores") or {}
            avg_score = scores.get("avgScore")
            if avg_score is not None and str(avg_score).strip() != "":
                risk_score = float(avg_score)
        except Exception:
            risk_score = None

        if risk_score is None:
            # Compatibility: newer frontend payloads may not send `scores.avgScore`.
            # Derive a coarse score from primary profile / answers[9].
            profile_hint = (
                data.get("primaryRiskProfile")
                or (data.get("answers") or {}).get("9")
                or ""
            )
            profile_hint = str(profile_hint).lower()
            if "low" in profile_hint or "defensive" in profile_hint:
                risk_score = 1.5
            elif "conservative" in profile_hint:
                risk_score = 2.1
            elif "moderate" in profile_hint:
                risk_score = 2.7
            elif "balanced" in profile_hint:
                risk_score = 3.1
            elif "high" in profile_hint or "growth" in profile_hint:
                risk_score = 4.0
            else:
                risk_score = 3.0

        # Clamp to known ranges to avoid lookup failures.
        try:
            risk_score = float(risk_score)
        except Exception as e:
            raise ValueError("Risk score is missing or invalid in the selected preferences.") from e
        risk_score = max(1.0, min(5.0, risk_score))
        

        # Get the risk profile ID based on the risk score
        print("Fetching risk profile ID based on risk score...")
        cursor.execute("""
                       SELECT profile_id FROM reference.risk_profiles 
                       WHERE %s between score_low AND score_high
                       """, (risk_score,))
        
        row = cursor.fetchone()
        if not row:
            cursor.execute(
                "SELECT profile_id FROM reference.risk_profiles WHERE name = 'Balanced' LIMIT 1"
            )
            row = cursor.fetchone()
        if not row:
            raise ValueError("No risk profiles configured in reference.risk_profiles.")
        profile_id = row[0]  # type: ignore
        assessed_at = data.get("completedAt", None)

        # Insert an entry to the user_questionnaire_results table
        print("Inserting user questionnaire result...")
        cursor.execute("""
                       INSERT INTO auth.user_questionnaire_results 
                       (user_id, risk_score, profile_id, selected_choices, assessed_at)
                       VALUES (%s, %s, %s, %s, %s)
                       RETURNING user_result_id
                       """, (user_id, risk_score, profile_id, selected_preference, assessed_at))
        
        user_result_id = cursor.fetchone()[0] # type: ignore

        # Check if the user already has a risk profile entry
        print("Checking if user risk profile already exists...")
        cursor.execute("""
                       SELECT user_id from auth.user_risk_profiles
                        WHERE user_id = %s
                        """, (user_id,))

        existing_user = cursor.fetchone()

        # If the user already has a risk profile, update it; otherwise, insert a new one
        print("Updating or inserting user risk profile...")
        if existing_user:
            cursor.execute("""
                           UPDATE auth.user_risk_profiles
                           SET risk_score = %s,
                           profile_id = %s,
                           result_id = %s,
                           last_updated_at = NOW()
                           WHERE user_id = %s
                           """, (risk_score, profile_id, user_result_id, user_id))
        else:
            cursor.execute("""
                           INSERT INTO auth.user_risk_profiles (user_id, risk_score, profile_id, result_id)
                           VALUES (%s, %s, %s, %s)
                           """, (user_id, risk_score, profile_id, user_result_id))
        
        # Update user asset preferences (supports crypto, stocks, forex, futures)
        # Uses extended reference.cryptocurrencies table with category column
        # Format from frontend: ["Bitcoin (BTC) - Crypto", "Apple Inc. (AAPL) - Stock", ...]
        selected_assets_raw = data["answers"].get("10", [])
        print("Selected assets:", selected_assets_raw)

        if selected_assets_raw:
            # Parse asset selections - extract ticker and name from format "Name (TICKER) - Category"
            # Also support legacy format "Name (TICKER)" for backward compatibility
            selected_tickers = []
            selected_names = []
            for asset_str in selected_assets_raw:
                if isinstance(asset_str, str):
                    # Extract ticker from parenthesis: "Bitcoin (BTC) - Crypto" -> "BTC"
                    ticker_match = re.search(r'\(([^)]+)\)', asset_str)
                    if ticker_match:
                        # Get the LAST ticker if multiple parentheses exist
                        # "Alphabet Inc. (Google) (GOOGL) - Stock" -> "GOOGL"
                        all_tickers = re.findall(r'\(([^)]+)\)', asset_str)
                        ticker = all_tickers[-1].strip().upper()
                        selected_tickers.append(ticker)
                    
                    # Also extract name before the first parenthesis as fallback
                    # "Bitcoin (BTC) - Crypto" -> "BITCOIN"
                    name_part = asset_str.split("(")[0].strip().upper()
                    selected_names.append(name_part)
            
            print("Parsed asset tickers:", selected_tickers)
            print("Parsed asset names (fallback):", selected_names)
            
            # Validate assets against extended cryptocurrencies table
            # Priority 1: Match by ticker (more reliable for stocks with complex names)
            # Priority 2: Match by name (for assets without clear ticker)
            print("Validating selected assets...")
            cursor.execute("""
                           SELECT crypto_id, name, symbol_binance, category 
                           FROM reference.cryptocurrencies 
                           WHERE (UPPER(symbol_binance) = ANY(%s) OR UPPER(name) = ANY(%s)) 
                           AND is_active = TRUE
                           """, (selected_tickers, selected_names,))
            valid_assets = cursor.fetchall()
            
            if not valid_assets:
                raise ValueError("No valid assets found in the selected preferences.")
            
            valid_crypto_ids = [asset[0] for asset in valid_assets]
            print(f"Found {len(valid_crypto_ids)} valid assets:", 
                  [(asset[1], asset[2], asset[3]) for asset in valid_assets])
            
            # Check if the user already has coin preferences (reuse existing table)
            print("Checking if user coin preferences already exist...")
            cursor.execute("""
                           SELECT crypto_id FROM auth.user_coin_preferences
                           WHERE user_id = %s
                           AND is_active = TRUE
                           """, (user_id,))
            
            existing_prefs = cursor.fetchall()
            existing_crypto_ids = [pref[0] for pref in existing_prefs]
            
            if not existing_prefs:
                print("No existing preferences found for user, inserting new ones...")
                # Insert all valid assets
                for crypto_id in valid_crypto_ids:
                    print(f"Inserting new preference for user {user_id} and crypto_id {crypto_id}...")
                    cursor.execute("""
                                   INSERT INTO auth.user_coin_preferences (user_id, crypto_id)
                                   VALUES (%s, %s)
                                   ON CONFLICT (user_id, crypto_id) 
                                   DO UPDATE SET is_active = TRUE, last_updated_at = NOW()
                                   """, (user_id, crypto_id))
            else:
                print("Existing preferences found for user, updating...")
                # Reactivate assets that are selected again
                prefs_to_reactivate = set(valid_crypto_ids) & set(existing_crypto_ids)
                if prefs_to_reactivate:
                    print(f"Reactivating preferences {prefs_to_reactivate} for user {user_id}...")
                    cursor.execute("""
                                UPDATE auth.user_coin_preferences
                                SET is_active = TRUE, last_updated_at = NOW()
                                WHERE user_id = %s AND crypto_id = ANY(%s)
                                """, (user_id, list(prefs_to_reactivate)))
                
                # Insert new assets that are not already in the user's preferences
                prefs_to_add = set(valid_crypto_ids) - set(existing_crypto_ids)
                for crypto_id in prefs_to_add:
                    print(f"Inserting new preference for user {user_id} and crypto_id {crypto_id}...")
                    cursor.execute("""
                                INSERT INTO auth.user_coin_preferences (user_id, crypto_id)
                                VALUES (%s, %s)
                                ON CONFLICT (user_id, crypto_id) 
                                DO UPDATE SET is_active = TRUE, last_updated_at = NOW()
                                """, (user_id, crypto_id))
                
                # Deactivate assets that are no longer selected
                prefs_to_deactivate = set(existing_crypto_ids) - set(valid_crypto_ids)
                if prefs_to_deactivate:
                    print(f"Deactivating preferences {prefs_to_deactivate} for user {user_id}...")
                    cursor.execute("""
                                UPDATE auth.user_coin_preferences
                                SET is_active = FALSE, last_updated_at = NOW()
                                WHERE user_id = %s AND crypto_id = ANY(%s)
                                """, (user_id, list(prefs_to_deactivate)))
        
        conn.commit()
        print("User preferences updated successfully.")
        
        return {"success": True, "message": "User preferences updated successfully."}

    except Exception as e:
        print(f"Error during updating user preference: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_conn(conn)


# Function to retrieve user preferences based on user's JWT token
def get_user_preferences(access_token):
    conn = None
    cursor = None
    try:
        conn = _open_conn()
        cursor = conn.cursor()

        user_id = get_user_id_from_token(access_token)

        # Set the timezone to UTC
        print("Setting timezone to UTC...")
        cursor.execute("SET TIME ZONE 'UTC';")

        cursor.execute("""
            SELECT selected_choices
            FROM auth.user_questionnaire_results qr,
            auth.user_risk_profiles urp
            WHERE qr.user_id = urp.user_id
            AND qr.user_result_id = urp.result_id
            AND qr.profile_id = urp.profile_id
            AND qr.user_id = %s
            ORDER BY qr.created_at DESC
            LIMIT 1""", (user_id,))
        
        preferences = cursor.fetchone()
        if not preferences:
            print("No user preferences found.")
            return {"success": False, "message": "No user preferences found."}
        pref = preferences[0]
        if isinstance(pref, str):
            try:
                pref = json.loads(pref)
            except Exception:
                return {"success": False, "message": "Invalid preference JSON stored."}
        print("User preferences retrieved successfully.")
        return {"success": True, "message":"User preferences found.", "preferences": preferences[0]}

                    
    except Exception as e:
        print(f"Error during retrieving user preferences: {e}")
        return {"success": False, "message": str(e)} 
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_conn(conn)   

_ALLOWED_DASHBOARD_KEYS = {
    "default_exchange",
    "default_timeframe",
    "theme",
    "layout",
    "widgets_order",
    "filters"
}
def set_dashboard_preference(access_token:str, prefs: Dict[str, Any]) -> Dict[str, Any]:
    conn = None
    cursor = None
    try:
        conn =_open_conn()
        cursor = conn.cursor()
        user_id = get_user_id_from_token(access_token)
        clean_prefs = {k: v for k, v in (prefs or {}).items() if k in _ALLOWED_DASHBOARD_KEYS}
        if not clean_prefs:
            return {"success": False, "message": "No valid dashboard preference fields provided."}
        cursor.execute(
            """
            SELECT preferences
            FROM auth.user_dashboard_preferences
            WHERE user_id = %s
            """,
            (user_id,)
        )
        row = cursor.fetchone()

        if row:
            current = row[0] or {}
            if not isinstance(current, dict):
                current = {}
            current.update(clean_prefs)

            cursor.execute(
                """
                UPDATE auth.user_dashboard_preferences
                SET preferences = %s, last_updated_at = NOW()
                WHERE user_id = %s
                """,
                (Json(current), user_id),
            )
        else:
            cursor.execute(
                """
                INSERT INTO auth.user_dashboard_preferences (user_id, preferences)
                VALUES (%s, %s)
                """,
                (user_id, Json(clean_prefs)),
            )
        conn.commit()
        return {"success": True, "message": "Dashboard preferences saved."}
    except Exception as e:
        if conn:
            conn.rollback()
        print(F"Error saving dashboard preferences: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: release_conn(conn)

def get_dashboard_preferences(access_token: str) -> Dict[str, Any]:
    conn = None
    cursor = None
    try:
        conn = _open_conn()
        cursor = conn.cursor()
        user_id = get_user_id_from_token(access_token)
        cursor.execute(
            """
            SELECT preferences
            FROM auth.user_dashboard_preferences
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        if row:
            return {"success": True,  "preferences": row[0] or {}}
        else:
            return {"success": False, "preferences": {}}
    except Exception as e:
        print(f"Error fetching dashboard preferences: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: release_conn(conn)
_ALLOWED_COMPONENT_KEYS: Iterable[str] = (
    "price_trend",
    "volume_heatmap",
    "rsi",
    "moving_average",
    "news_sentiment"
)
_ALLOWED_COMPONENT_SETTING_KEYS = {
    "visible",
    "position",
    "span",
    "indicators",
    "params",
    "filters"
}

def set_component_preferences(access_token:str, component_key:str, settings:Dict[str, Any]) -> Dict[str, Any]:
    conn = None
    cursor = None
    try:
        if component_key not in _ALLOWED_COMPONENT_KEYS:
            return {"success": False, "message": f"Unkown component_key '{component_key}'."}
        clean_settings = {k: v for k,v in (settings or {}).items() if k in _ALLOWED_COMPONENT_SETTING_KEYS}
        if not clean_settings:
            return {"success": False, "message": "No vaild component setting fields provided."}
        conn = _open_conn()
        cursor = conn.cursor()

        user_id = get_user_id_from_token(access_token)

        cursor.execute(
            """
            SELECT settings
            FROM auth.user_component_preferences
            WHERE user_id = %s AND component_key = %s
            """,
            (user_id, component_key),
        )
        row = cursor.fetchone()

        if row:
            current = row[0] or {}
            if not isinstance(current, dict):
                current = {}
            current.update(clean_settings)

            cursor.execute(
                """
                UPDATE auth.user_component_preferences
                SET settings = %s
                WHERE user_id = %s AND component_key = %s
                """,
                (Json(current), user_id, component_key),
            )
        else:
            cursor.execute(
                """
                INSERT INTO auth.user_component_preferences (user_id, component_key, settings)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, component_key) DO UPDATE SET settings = EXCLUDED.settings
                """,
                (user_id, component_key, Json(clean_settings)),
            )
        conn.commit()
        return {"success": True, "message": "Component preferences saved."}
    except Exception as e:
        if conn: conn.rollback()
        print(f"Error saving component preferences: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_conn(conn)
def get_component_preferences(access_token:str, component_key:Optional[str]=None) -> Dict[str, Any]:
    conn = None
    cursor = None
    try:
        conn = _open_conn()
        cursor = conn.cursor()
        user_id = get_user_id_from_token(access_token)

        if component_key:
            cursor.execute(
                """
                SELECT settings
                FROM auth.user_component_preferences
                WHERE user_id = %s AND component_key = %s
                """,
                (user_id, component_key),
            )
            row = cursor.fetchone()
            if row:
                return {"success": True, "settings": row[0] or {}}
            else:
                return {"success": True, "settings": {}}
        else:
            cursor.execute(
                """
                SELECT component_key, settings
                FROM auth.user_component_preferences
                WHERE user_id = %s
                """,
                (user_id,),
            )
            rows = cursor.fetchall() or {}
            res = {rk: st or {} for rk, st in rows}
            return {"success": True, "settings":res}
    except Exception as e:
        print(f"Error fetching component preferences: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: release_conn(conn)
