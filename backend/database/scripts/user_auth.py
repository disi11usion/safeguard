
from database.utils.db_pool import get_db_connection
"""
#  file: user_auth.py
# description: This script provides functions for user authentication,
# including signup, login, and update functionalities.
# Date: 26-06-2025
"""

import os
import psycopg2
from dotenv import load_dotenv
import bcrypt
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request

# Load environment variables from .env file
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# DEV TEST FLAG:
# When enabled, all existing users are promoted to admin and newly created users default to admin.
# Set FORCE_ALL_USERS_ADMIN_DEV=false to disable this behavior.
FORCE_ALL_USERS_ADMIN_DEV = os.getenv("FORCE_ALL_USERS_ADMIN_DEV", "false").lower() == "true"

# Comma-separated usernames/emails that should always have admin role.
# Example: ADMIN_USERS_ALLOWLIST=alice,admin@example.com,bob
ADMIN_USERS_ALLOWLIST = os.getenv("ADMIN_USERS_ALLOWLIST", "")


def _parse_admin_allowlist() -> set[str]:
    return {item.strip().lower() for item in ADMIN_USERS_ALLOWLIST.split(",") if item.strip()}


def _is_allowlisted_admin(username: Optional[str], email: Optional[str]) -> bool:
    allowed = _parse_admin_allowlist()
    if not allowed:
        return False
    username_norm = str(username or "").strip().lower()
    email_norm = str(email or "").strip().lower()
    return (username_norm in allowed) or (email_norm in allowed)


def _apply_admin_role_policy(conn) -> None:
    """
    Apply admin role policy:
    1) optional dev flag: promote all users to admin
    2) allowlist: ensure listed usernames/emails are admin
    """
    with conn.cursor() as cur:
        if FORCE_ALL_USERS_ADMIN_DEV:
            cur.execute(
                """
                UPDATE auth.users
                SET role = 'admin'
                WHERE role IS DISTINCT FROM 'admin'
                """
            )

        allowlist = list(_parse_admin_allowlist())
        if allowlist:
            cur.execute(
                """
                UPDATE auth.users
                SET role = 'admin'
                WHERE role IS DISTINCT FROM 'admin'
                  AND (
                    LOWER(username) = ANY(%s)
                    OR LOWER(email) = ANY(%s)
                  )
                """,
                (allowlist, allowlist),
            )


def _normalize_code(code):
    if not code:
        return None
    code = str(code).strip()
    return code if code else None


def _is_valid_influencer_code(conn, code: str) -> bool:
    """
    DB-backed validation via auth.influencer_codes (source of truth).
    Fallback env var INFLUENCER_CODES=Ursh-01,Alex-02
    Validation is case-insensitive.
    """
    code_norm = code.strip()
    if not code_norm:
        return False

    # 1) DB-backed validation
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM auth.influencer_codes
                WHERE LOWER(code) = LOWER(%s)
                  AND is_active = TRUE
                LIMIT 1;
                """,
                (code_norm,),
            )
            if cur.fetchone():
                return True
    except Exception:
        pass

    # 2) Env var fallback
    codes_env = os.getenv("INFLUENCER_CODES", "")
    if not codes_env.strip():
        return False
    allowed = {c.strip().lower() for c in codes_env.split(",") if c.strip()}
    return code_norm.lower() in allowed


def _record_referral_attribution(conn, user_id: int, code: str) -> None:
    """
    If marketing tables are present (they are) this function will:
      - upsert marketing.influencers row for the code (if missing)
      - upsert marketing.referral_attribution for the user

    NOTE:
    Your DB's "source of truth" for codes is auth.influencer_codes.
    marketing.* is currently empty, so we keep it in sync here to avoid
    backend code that expects marketing.* breaking later.

    If you do NOT want to maintain marketing.* at all, you can safely
    remove calls to this function.
    """
    code_norm = code.strip()
    if not code_norm:
        return

    with conn.cursor() as cur:
        # Ensure the code exists + active in auth
        cur.execute(
            """
            SELECT influencer_name, is_active
            FROM auth.influencer_codes
            WHERE LOWER(code) = LOWER(%s)
            LIMIT 1
            """,
            (code_norm,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("Invalid influencer code.")
        influencer_name, is_active = row[0], row[1]
        if is_active is False:
            raise ValueError("Invalid influencer code.")

        # Upsert into marketing.influencers (keeps marketing schema usable)
        # marketing.influencers requires: name, referral_code, status, created_at
        cur.execute(
            """
            INSERT INTO marketing.influencers (name, referral_code, status)
            VALUES (%s, %s, 'active')
            ON CONFLICT (referral_code) DO UPDATE
              SET name = EXCLUDED.name,
                  status = 'active'
            RETURNING id
            """,
            (influencer_name or code_norm, code_norm),
        )
        influencer_id = cur.fetchone()[0]

        # Upsert referral attribution for the user
        # referral_attribution PK is user_id, so use ON CONFLICT (user_id)
        cur.execute(
            """
            INSERT INTO marketing.referral_attribution (user_id, influencer_id, referral_code, attributed_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (user_id) DO UPDATE
              SET influencer_id = EXCLUDED.influencer_id,
                  referral_code = EXCLUDED.referral_code,
                  attributed_at = EXCLUDED.attributed_at
            """,
            (user_id, influencer_id, code_norm),
        )


def get_access_token_from_request(request: Request) -> str:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header:
        parts = auth_header.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            return parts[1].strip()

    token = request.cookies.get("access_token")
    if token:
        return token

    raise HTTPException(status_code=401, detail="No access token found")


def create_access_token(data, expires_delta=None):
    """
    Create JWT access token for user.
    """
    if not SECRET_KEY:
        raise ValueError("SECRET_KEY not found in environment variables")

    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now() + expires_delta
    else:
        expire = datetime.now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def user_signup(full_name, username, email, password, influencer_code: Optional[str] = None):
    """
    Signup:
      - creates auth.users row
      - validates influencer_code against auth.influencer_codes
      - (optional) writes marketing.referral_attribution + marketing.influencers to keep marketing schema usable
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        print("Setting timezone to UTC...")
        cursor.execute("SET TIME ZONE 'UTC';")

        # Apply admin role policy before creating users.
        _apply_admin_role_policy(conn)

        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        cursor.execute(
            """
            SELECT 1
            FROM auth.users
            WHERE username = %s OR email = %s
            """,
            (username, email),
        )
        if cursor.fetchone():
            return {"success": False, "message": "Username or email already exists."}

        code = _normalize_code(influencer_code)
        user_type = "normal"
        db_code = None

        if code:
            if not _is_valid_influencer_code(conn, code):
                return {"success": False, "message": "Invalid influencer code."}
            user_type = "special"
            db_code = code

        # Create user
        cursor.execute(
            """
            INSERT INTO auth.users (
                full_name,
                username,
                email,
                hashed_password,
                last_login_at,
                role,
                user_type,
                influencer_code
            )
            VALUES (%s, %s, %s, %s, NOW(), %s, %s, %s)
            RETURNING user_id
            """,
            (
                full_name,
                username,
                email,
                hashed_password,
                "admin" if (FORCE_ALL_USERS_ADMIN_DEV or _is_allowlisted_admin(username, email)) else "user",
                user_type,
                db_code,
            ),
        )
        user_id = cursor.fetchone()[0]  # type: ignore

        # Optional: keep marketing schema in sync (attribution + influencer row)
        if db_code:
            _record_referral_attribution(conn, user_id, db_code)

        conn.commit()

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user_id), "email": email, "username": username},
            expires_delta=access_token_expires,
        )

        return {
            "success": True,
            "message": "User signed up successfully.",
            "user_id": user_id,
            "access_token": access_token,
        }

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error during user signup: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def user_login(email, password, influencer_code=None):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        print("Setting timezone to UTC...")
        cursor.execute("SET TIME ZONE 'UTC';")

        _apply_admin_role_policy(conn)
        conn.commit()

        cursor.execute(
            """
            SELECT
                user_id,
                hashed_password,
                is_active,
                username
            FROM auth.users
            WHERE email = %s
            """,
            (email,),
        )
        result = cursor.fetchone()

        if result is None:
            return {"success": False, "message": "Invalid Email id."}

        user_id = result[0]
        hashed_password = result[1]
        is_active = result[2]
        username = result[3]

        if not is_active:
            return {"success": False, "message": "User account is inactive."}

        if not bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8")):
            return {"success": False, "message": "Incorrect password."}

        code = _normalize_code(influencer_code)
        if code:
            if not _is_valid_influencer_code(conn, code):
                return {"success": False, "message": "Invalid influencer code."}

            cursor.execute(
                """
                UPDATE auth.users
                SET user_type = 'special',
                    influencer_code = %s,
                    last_login_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = %s
                """,
                (code, user_id),
            )

            # Optional: keep marketing attribution updated
            _record_referral_attribution(conn, user_id, code)
        else:
            cursor.execute(
                """
                UPDATE auth.users
                SET last_login_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = %s
                """,
                (user_id,),
            )

        conn.commit()

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user_id), "email": email, "username": username},
            expires_delta=access_token_expires,
        )

        return {
            "success": True,
            "message": "Login successful.",
            "user_id": user_id,
            "access_token": access_token,
        }

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error during user login: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def verify_token(token):
    if not os.getenv("SECRET_KEY"):
        print("SECRET_KEY is not set in environment variables.")
        return None
    if not SECRET_KEY:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_user_id_from_token(access_token):
    payload = verify_token(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token payload.")

    return user_id


def user_update(access_token, full_name=None, username=None, email=None, password=None):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user_id = get_user_id_from_token(access_token)
        cursor.execute("SET TIME ZONE 'UTC';")

        fields = []
        values = []

        if full_name is not None:
            fields.append("full_name = %s")
            values.append(full_name)
        if username is not None:
            fields.append("username = %s")
            values.append(username)
        if email is not None:
            fields.append("email = %s")
            values.append(email)
        if password is not None:
            hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            fields.append("hashed_password = %s")
            values.append(hashed_password)

        if not fields:
            return {"success": False, "message": "No fields provided for update."}

        # Your DB columns elsewhere use updated_at, not last_updated_at.
        fields.append("updated_at = NOW()")

        values.append(user_id)

        update_query = f"""
            UPDATE auth.users
            SET {', '.join(fields)}
            WHERE user_id = %s
        """

        cursor.execute(update_query, tuple(values))
        conn.commit()

        return {"success": True, "message": "User updated successfully.", "user_id": user_id}

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error during user update: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_user_details(access_token):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user_id = get_user_id_from_token(access_token)

        cursor.execute(
            """
            SELECT
                user_id,
                full_name,
                username,
                email,
                last_login_at,
                is_active,
                role,
                user_type,
                influencer_code
            FROM auth.users
            WHERE user_id = %s
            """,
            (user_id,),
        )

        user_details = cursor.fetchone()

        if user_details:
            user_dict = {
                "user_id": user_details[0],
                "full_name": user_details[1],
                "username": user_details[2],
                "email": user_details[3],
                "last_login_at": user_details[4],
                "is_active": user_details[5],
                "role": user_details[6],
                "user_type": user_details[7],
                "influencer_code": user_details[8],
            }
            return {"success": True, "user": user_dict}

        allow_virtual = os.getenv("ALLOW_VIRTUAL_USERS", "false").lower() == "true"
        if allow_virtual:
            payload = verify_token(access_token)
            if not payload:
                raise HTTPException(status_code=401, detail="Invalid or expired token")
            raw_user_id = payload.get("sub")
            try:
                user_id_int = int(raw_user_id)
            except Exception:
                user_id_int = 0
            email_claim = payload.get("email") or ""
            username_claim = payload.get("username") or (email_claim.split("@")[0] if email_claim else "user")
            user_dict = {
                "user_id": user_id_int,
                "full_name": email_claim or username_claim,
                "username": username_claim,
                "email": email_claim,
                "last_login_at": None,
                "is_active": True,
                "role": "user",
                "user_type": "normal",
                "influencer_code": None,
            }
            return {"success": True, "user": user_dict}

        raise HTTPException(status_code=404, detail="User not found")

    except Exception as e:
        print(f"Error during fetching user details: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                user_id,
                full_name,
                username,
                email,
                last_login_at,
                is_active,
                role,
                user_type,
                influencer_code
            FROM auth.users
            WHERE email = %s
            """,
            (email,),
        )

        user_details = cursor.fetchone()
        if not user_details:
            return None

        return {
            "user_id": user_details[0],
            "full_name": user_details[1],
            "username": user_details[2],
            "email": user_details[3],
            "last_login_at": user_details[4],
            "is_active": user_details[5],
            "role": user_details[6],
            "user_type": user_details[7],
            "influencer_code": user_details[8],
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_current_user_from_cookie(request: Request) -> dict:
    token = get_access_token_from_request(request)

    user_details_result = get_user_details(token)
    if not user_details_result["success"]:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user_details_result["user"]


def get_current_user_id_from_cookie(request: Request) -> str:
    token = get_access_token_from_request(request)
    return get_user_id_from_token(token)
