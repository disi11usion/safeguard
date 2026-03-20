"""
FastAPI Router for Crypto Analytics Platform

This module contains all the API routes for the crypto analytics platform including:
- User authentication (register, login, logout)
- User management (profile, preferences)
- Data endpoints (prices, news, social)
- AI model endpoints (sentiment analysis, forecasting)

All routes are organized by tags for better API documentation.
"""

from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    Response,
    Request,
    Query,
    Header,
    Body,
)
from database.scripts import user_auth, user_preference, data_request  # type: ignore
from application.services import otp_service
from . import models
from dotenv import load_dotenv  # type: ignore
import os
from typing import Optional, Dict, Any
import json
import hashlib
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from database.utils.db_pool import get_db_connection

from jose import jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

try:
    import stripe
except Exception:  # pragma: no cover
    stripe = None

import bcrypt

# Initialize the API router
router = APIRouter()

load_dotenv()

def _get_db_conn():
    return get_db_connection()


@router.post("/disclaimer/accept", tags=["Legal"])
async def accept_disclaimer(payload: models.DisclaimerAcceptRequest, request: Request):
    """
    Append-only logging of disclaimer acceptance.
    Logged before account creation; user_id may be null.
    """
    try:
        disclaimer_hash = hashlib.sha256(payload.disclaimer_text.encode("utf-8")).hexdigest()

        # best effort IP extraction
        ip = request.headers.get("x-forwarded-for") or request.client.host

        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO public.disclaimer_acceptances
              (session_id, disclaimer_version, disclaimer_hash, country, accepted, accepted_at, ip_address, user_id)
            VALUES
              (%s, %s, %s, %s, TRUE, NOW(), %s, NULL)
            """,
            (payload.session_id, payload.disclaimer_version, disclaimer_hash, payload.country, ip),
        )
        conn.commit()
        cur.close()
        conn.close()

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


security = HTTPBearer(auto_error=False)
if stripe:
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def _ensure_admin(current_user: dict) -> None:
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT role
            FROM auth.users
            WHERE user_id = %s
            """,
            (current_user.get("user_id"),),
        )
        row = cursor.fetchone()
        if not row or row.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def _get_table_columns(conn, schema: str, table: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            (schema, table),
        )
        return {row[0] for row in cur.fetchall()}


# OTP IdP token settings
OTP_IDP_SECRET = os.getenv("OTP_IDP_SECRET", os.getenv("SECRET_KEY", ""))
OTP_IDP_ISSUER = os.getenv("OTP_IDP_ISSUER", "safeguard-otp")
OTP_IDP_AUDIENCE = os.getenv("OTP_IDP_AUDIENCE", "safeguard-app")


async def get_current_user_from_bearer(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    From Bearer Token get user.
    """
    try:
        token: Optional[str] = None
        if credentials and credentials.credentials:
            token = credentials.credentials
        if not token:
            token = user_auth.get_access_token_from_request(request)

        payload = jwt.decode(
            token,
            os.getenv("SECRET_KEY"),
            algorithms=[os.getenv("ALGORITHM", "HS256")],
        )

        user_id = int(payload.get("sub"))
        username = payload.get("username")
        email = payload.get("email")

        return {"user_id": user_id, "username": username, "email": email}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")


@router.get("/health", tags=["Server Health"])
def health_check():
    return {"message": "server is running!"}


@router.post("/register", tags=["Users"])
async def register(user_data: models.UserRegisterRequest, response: Response):
    try:
        print(f"Received registration data: {user_data}")
        request_email = user_data.email

        if not otp_service.is_verified(user_data.email):
            raise HTTPException(
                status_code=400,
                detail="Email not verified. Please verify OTP before registering.",
            )

        result = user_auth.user_signup(
            full_name=user_data.full_name,
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            influencer_code=user_data.influencer_code,
        )

        if result["success"]:
            response.set_cookie(
                key="access_token",
                value=result["access_token"],
                httponly=True,
                secure=False,
                samesite="lax",
                max_age=1800,
            )

            user_details_result = user_auth.get_user_details(result["access_token"])

            if user_details_result["success"]:
                u = user_details_result["user"]
                user_response = models.UserResponse(
                    user_id=u["user_id"],
                    username=u["username"],
                    email=u["email"],
                    full_name=u.get("full_name") or u.get("username") or "",
                    is_active=u["is_active"],
                    user_type=u.get("user_type", "normal"),
                    influencer_code=u.get("influencer_code"),
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to get user details after registration",
                )

            otp_service.clear_verified(request_email)
            return {
                "success": True,
                "message": result["message"],
                "access_token": result["access_token"],
                "user": user_response,
            }

        raise HTTPException(status_code=400, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login", tags=["Users"])
async def login(user_data: models.UserLoginRequest, response: Response):
    print(f"Login attempt for email: {user_data.email}")
    try:
        result = user_auth.user_login(
            email=user_data.email,
            password=user_data.password,
            influencer_code=user_data.influencer_code,
        )

        print(f"Login result: {result}")

        if result["success"]:
            response.set_cookie(
                key="access_token",
                value=result["access_token"],
                httponly=True,
                secure=False,
                samesite="lax",
                max_age=1800,
            )

            user_details_result = user_auth.get_user_details(result["access_token"])
            if user_details_result["success"]:
                u = user_details_result["user"]
                user_response = models.UserResponse(
                    user_id=u["user_id"],
                    username=u["username"],
                    email=u["email"],
                    full_name=u.get("full_name") or u.get("username") or "",
                    is_active=u["is_active"],
                    user_type=u.get("user_type", "normal"),
                    influencer_code=u.get("influencer_code"),
                )
                return {
                    "success": True,
                    "message": result["message"],
                    "access_token": result["access_token"],
                    "user": user_response,
                }

            raise HTTPException(status_code=500, detail="Failed to get user details after login")

        print(f"Login failed: {result['message']}")
        raise HTTPException(status_code=401, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp/send", tags=["Users"])
async def send_otp(request_data: models.OtpSendRequest):
    try:
        user = user_auth.get_user_by_email(request_data.email)
        if not user:
            raise HTTPException(status_code=404, detail="Email not registered")

        result = otp_service.send_otp(request_data.email)
        if result.get("error") == "smtp_unavailable":
            raise HTTPException(
                status_code=503,
                detail="Email delivery unavailable (SMTP blocked). Use Password Login or enable OTP_DEV_MODE.",
            )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to send OTP"))
        if result.get("dev_otp"):
            return {"ok": True, "message": result.get("message", "OTP generated (dev mode)."), "dev_otp": result.get("dev_otp")}
        return {"success": True, "message": result.get("message", "OTP sent")}
    except HTTPException:
        raise
    except Exception as e:
        print(f"OTP send error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp/send-signup", tags=["Users"])
async def send_signup_otp(request_data: models.OtpSendRequest):
    try:
        user = user_auth.get_user_by_email(request_data.email)
        if user:
            raise HTTPException(status_code=409, detail="Email already registered")

        result = otp_service.send_otp(request_data.email)
        if result.get("error") == "smtp_unavailable":
            raise HTTPException(
                status_code=503,
                detail="Email delivery unavailable (SMTP blocked). Use Password Login or enable OTP_DEV_MODE.",
            )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to send OTP"))
        if result.get("dev_otp"):
            return {"ok": True, "message": result.get("message", "OTP generated (dev mode)."), "dev_otp": result.get("dev_otp")}
        return {"success": True, "message": result.get("message", "OTP sent")}
    except HTTPException:
        raise
    except Exception as e:
        print(f"OTP send signup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp/verify-signup", tags=["Users"])
async def verify_signup_otp(request_data: models.OtpVerifyRequest):
    try:
        result = otp_service.verify_otp(request_data.email, request_data.code)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Invalid code"))
        otp_service.mark_verified(request_data.email)
        return {"success": True, "message": "Email verified"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"OTP verify signup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp/verify", tags=["Users"])
async def verify_otp(request_data: models.OtpVerifyRequest):
    try:
        result = otp_service.verify_otp(request_data.email, request_data.code)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Invalid code"))

        email = request_data.email
        user = user_auth.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Email not registered")

        username = user.get("username") or (email.split("@")[0] if email else "user")
        user_id = user.get("user_id")

        payload = {
            "sub": str(user_id),
            "email": email,
            "username": username,
            "iss": OTP_IDP_ISSUER,
            "aud": OTP_IDP_AUDIENCE,
        }

        idp_token = jwt.encode(payload, OTP_IDP_SECRET, algorithm=os.getenv("ALGORITHM", "HS256"))
        return {"success": True, "message": "OTP verified", "idp_token": idp_token}

    except HTTPException:
        raise
    except Exception as e:
        print(f"OTP verify error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp/exchange", tags=["Users"], response_model=models.OtpExchangeResponse)
async def exchange_otp_token(request_data: models.OtpExchangeRequest, response: Response):
    try:
        payload = jwt.decode(
            request_data.idp_token,
            OTP_IDP_SECRET,
            algorithms=[os.getenv("ALGORITHM", "HS256")],
            audience=OTP_IDP_AUDIENCE,
            issuer=OTP_IDP_ISSUER,
        )

        email = payload.get("email")
        user = user_auth.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Email not registered")

        username = user.get("username")
        user_id = user.get("user_id")

        access_token = user_auth.create_access_token(
            data={"sub": str(user_id), "email": email, "username": username}
        )

        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=1800,
        )

        user_response = models.UserResponse(
            user_id=int(user_id),
            username=username,
            email=email,
            full_name=user.get("full_name") or user.get("username") or "",
            is_active=user.get("is_active", True),
        )

        return {
            "success": True,
            "message": "OTP login successful.",
            "access_token": access_token,
            "user": user_response,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"OTP exchange error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout", tags=["Users"], response_model=models.LogoutResponse)
async def logout(response: Response):
    try:
        response.delete_cookie(
            key="access_token",
            httponly=True,
            secure=False,
            samesite="lax",
        )
        return models.LogoutResponse(success=True, message="Logout successful")
    except Exception as e:
        print(f"Logout error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}", tags=["Users"], response_model=models.UserResponse)
async def get_current_user(
    username: str, current_user: dict = Depends(user_auth.get_current_user_from_cookie)
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        return models.UserResponse(
            user_id=current_user["user_id"],
            username=current_user["username"],
            email=current_user["email"],
            full_name=current_user.get("full_name") or current_user.get("username") or "",
            is_active=current_user["is_active"],
            user_type=current_user.get("user_type", "normal"),
            influencer_code=current_user.get("influencer_code"),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{username}/preference", tags=["Users"], response_model=models.UserPreferenceResponse)
async def update_user_preference(
    username: str,
    preference_data: models.UserPreferenceRequest,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        selected_preference = json.dumps(preference_data.dict())
        access_token = user_auth.get_access_token_from_request(request)

        result = user_preference.update_user_preference(access_token, selected_preference)

        if result["success"]:
            return models.UserPreferenceResponse(success=True, message=result["message"])
        raise HTTPException(status_code=400, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Update user preference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}/preference", tags=["Users"], response_model=models.UserPreferenceGetResponse)
async def get_user_preference(
    username: str,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        access_token = user_auth.get_access_token_from_request(request)
        result = user_preference.get_user_preferences(access_token)

        if result["success"]:
            prefs = result.get("preferences")
            if isinstance(prefs, str):
                try:
                    prefs = json.loads(prefs)
                except Exception:
                    prefs = {}
            return models.UserPreferenceGetResponse(
                success=True,
                message=result["message"],
                preferences=result.get("preferences"),
            )

        raise HTTPException(status_code=404, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Get user preference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}/preference-assets", tags=["Users"])
async def get_user_preference_assets(
    username: str,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        access_token = user_auth.get_access_token_from_request(request)
        user_id = user_auth.get_user_id_from_token(access_token)

        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT
                c.crypto_id,
                c.name,
                c.symbol_binance as ticker,
                c.category,
                ucp.created_at as selected_at
            FROM auth.user_coin_preferences ucp
            JOIN reference.cryptocurrencies c ON ucp.crypto_id = c.crypto_id
            WHERE ucp.user_id = %s
              AND ucp.is_active = TRUE
              AND c.is_active = TRUE
            ORDER BY c.category, c.name
        """

        cursor.execute(query, (user_id,))
        assets = cursor.fetchall()

        cursor.close()
        conn.close()

        return {"success": True, "count": len(assets), "assets": assets}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Get user preference assets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{username}/dashboard-preference", tags=["Users"], response_model=models.DashboardPreferenceResponse)
async def upsert_dashboard_preference(
    username: str,
    pref: models.DashboardPreferenceRequest,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        access_token = user_auth.get_access_token_from_request(request)

        result = user_preference.upsert_dashboard_preference(
            access_token=access_token,
            default_exchange=pref.default_exchange.value,
            default_timeframe=pref.default_timeframe,
            layout=None if pref.layout is None else json.dumps(pref.layout),
        )
        if result["success"]:
            return models.DashboardPreferenceResponse(success=True, message=result["message"])
        raise HTTPException(status_code=400, detail=result["message"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}/dashboard-preference", tags=["Users"], response_model=models.DashboardPreferenceGetResponse)
async def get_dashboard_preference(
    username: str,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        access_token = user_auth.get_access_token_from_request(request)

        result = user_preference.get_dashboard_preference(access_token)
        if not result["success"]:
            raise HTTPException(status_code=404, detail=result["message"])

        payload = result.get("preference") or {}
        return models.DashboardPreferenceGetResponse(
            success=True,
            message="Dashboard preference loaded",
            default_exchange=(models.Exchange(payload["default_exchange"]) if payload.get("default_exchange") else None),
            default_timeframe=payload.get("default_timeframe"),
            layout=payload.get("layout"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{username}/component-preferences", tags=["Users"], response_model=models.ComponentPreferenceResponse)
async def upsert_component_preferences(
    username: str,
    pref_req: models.ComponentPreferenceUpsertRequest,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        access_token = request.cookies.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="No access token found")

        items = [i.dict() for i in pref_req.items]
        result = user_preference.upsert_component_preferences(access_token=access_token, items=items)
        if result["success"]:
            return models.ComponentPreferenceResponse(success=True, message=result["message"])
        raise HTTPException(status_code=400, detail=result["message"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}/component-preferences", tags=["Users"], response_model=models.ComponentPreferenceGetResponse)
async def get_component_preferences(
    username: str,
    current_user: dict = Depends(user_auth.get_current_user_from_cookie),
    request: Request = None,
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        access_token = request.cookies.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="No access token found")

        result = user_preference.get_component_preferences(access_token)
        if not result["success"]:
            raise HTTPException(status_code=404, detail=result["message"])

        items = result.get("items", [])
        return models.ComponentPreferenceGetResponse(
            success=True,
            message="Component preferences loaded",
            items=[models.ComponentPreferenceItem(**i) for i in items],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prices/current", tags=["Current Data"])
def get_current_prices(
    exchange: models.Exchange = Query(models.Exchange.binance, description="Which exchange to pull prices from"),
):
    try:
        result = data_request.get_curr_prices(exchange=exchange.value)
        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])
    except Exception as e:
        print(f"Error in /prices/current endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/news/current", tags=["Current Data"])
def get_current_news(
    last_day: bool = Query(True, description="Return up to the last 24 hours of news instead of the last hour"),
):
    try:
        result = data_request.get_curr_news(last_day=last_day)
        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /news/current endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/social/current", tags=["Current Data"])
def get_current_social():
    try:
        result = data_request.get_curr_social()
        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])
    except Exception as e:
        print(f"Error in /social/current endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sentiment", tags=["AI Models"])
def get_sentiment():
    try:
        result = data_request.get_sentiment()
        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])
    except Exception as e:
        print(f"Error in /sentiment endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast", tags=["AI Models"])
async def get_forecast(
    user_id: dict = Depends(user_auth.get_current_user_id_from_cookie),
):
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: user_id not found")

    try:
        result = data_request.get_forecast(user_id)
        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])
    except Exception as e:
        print(f"Error in /forecast endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Stripe payment related routes
# ============================================================================

from database.scripts import payment_operations  # type: ignore


@router.get("/plans", tags=["Payments"])
async def get_plans():
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                plan_id, plan_key, tier, billing_cycle,
                price_cents, currency, description,
                news_analysis_limit, social_analysis_limit,
                data_access, sentiment_analysis,
                api_access, priority_support, duration_days,
                stripe_price_id, stripe_product_id,
                is_active, created_at, updated_at
            FROM payments.plans
            WHERE is_active = TRUE
            ORDER BY price_cents;
            """
        )

        plans = cursor.fetchall()
        cursor.close()
        conn.close()

        if not plans:
            return {"success": False, "plans": [], "message": "No plans available"}

        plans_list = []
        for plan in plans:
            plans_list.append(
                {
                    "plan_id": plan["plan_id"],
                    "plan_key": plan["plan_key"],
                    "tier": plan["tier"],
                    "billing_cycle": plan["billing_cycle"],
                    "price_cents": plan["price_cents"],
                    "currency": plan["currency"],
                    "description": plan["description"],
                    "news_analysis_limit": plan["news_analysis_limit"],
                    "social_analysis_limit": plan["social_analysis_limit"],
                    "data_access": plan["data_access"],
                    "sentiment_analysis": plan["sentiment_analysis"],
                    "api_access": plan["api_access"],
                    "priority_support": plan["priority_support"],
                    "duration_days": plan["duration_days"],
                    "stripe_price_id": plan["stripe_price_id"],
                    "stripe_product_id": plan["stripe_product_id"],
                    "is_active": plan["is_active"],
                    "created_at": plan["created_at"].isoformat() if plan["created_at"] else None,
                    "updated_at": plan["updated_at"].isoformat() if plan["updated_at"] else None,
                }
            )

        return {"success": True, "plans": plans_list}

    except Exception as e:
        print(f"Error getting plans: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/create-checkout-session", tags=["Payments"])
async def create_checkout_session(
    request_data: models.CreateCheckoutSessionRequest,
    authorization: str = Header(None),
):
    try:
        if not authorization:
            raise HTTPException(status_code=401, detail="No access token found")
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header format")

        token = authorization.replace("Bearer ", "").strip()

        try:
            payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM", "HS256")])
            user_id = int(payload.get("sub"))
            user_email = payload.get("email")
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.JWTError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

        result = payment_operations.create_stripe_checkout_session(
            user_id=user_id,
            plan_key=request_data.plan_key,
            success_url=request_data.success_url,
            cancel_url=request_data.cancel_url,
            customer_email=user_email,
            influencer_code=request_data.influencer_code,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to create checkout session"))

        return {"success": True, "session_id": result.get("session_id"), "session_url": result.get("session_url")}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in create_checkout_session: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stripe/checkout-session/{session_id}", tags=["Payments"])
async def get_checkout_session(
    session_id: str,
    current_user: dict = Depends(get_current_user_from_bearer),
):
    try:
        result = payment_operations.get_checkout_session_details(session_id)
        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])
    except Exception as e:
        print(f"Error in /stripe/checkout-session endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stripe/verify-session/{session_id}", tags=["Payments"])
async def verify_checkout_session(
    session_id: str,
    current_user: dict = Depends(get_current_user_from_bearer),
):
    try:
        result = payment_operations.record_checkout_session(session_id)
        if result.get("success"):
            return result
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to verify session"))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /stripe/verify-session endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}/subscription", tags=["Payments"])
async def get_user_subscription(
    username: str,
    current_user: dict = Depends(get_current_user_from_bearer),
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        user_id = current_user["user_id"]
        result = payment_operations.get_user_active_subscription(user_id)
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /users/{username}/subscription endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}/transactions", tags=["Payments"])
async def get_user_transactions(
    username: str,
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        user_id = current_user["user_id"]
        result = payment_operations.get_user_transactions(user_id=user_id, limit=limit, status=status)

        if result["success"]:
            return result
        raise HTTPException(status_code=404, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /users/{username}/transactions endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{username}/subscription/cancel", tags=["Payments"])
async def cancel_user_subscription(
    username: str,
    cancel_request: models.CancelSubscriptionRequest,
    current_user: dict = Depends(get_current_user_from_bearer),
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        user_id = current_user["user_id"]
        result = payment_operations.cancel_user_subscription(
            user_id=user_id,
            cancel_at_period_end=cancel_request.cancel_at_period_end,
        )

        if result["success"]:
            return result
        raise HTTPException(status_code=400, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in cancel subscription endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/webhook", tags=["Payments"])
async def stripe_webhook(request: Request):
    try:
        payload = await request.body()
        signature = request.headers.get("stripe-signature")

        if not signature:
            raise HTTPException(status_code=400, detail="Missing stripe-signature header")

        result = payment_operations.handle_stripe_webhook(payload=payload, signature=signature)
        return {"received": True, "event_id": result.get("event_id")}

    except Exception as e:
        print(f"Webhook error: {e}")
        return {"received": False, "error": str(e)}


@router.get("/users/{username}/check-subscription-limit", tags=["Payments"])
async def check_subscription_limit(
    username: str,
    limit_type: str = Query(..., description="限制类型"),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    try:
        if current_user["username"] != username:
            raise HTTPException(status_code=403, detail="Forbidden: username mismatch")

        user_id = current_user["user_id"]
        result = payment_operations.check_user_subscription_limit(user_id=user_id, limit_type=limit_type)
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in check-subscription-limit endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stripe/create-payment-intent", tags=["Payments"])
async def create_payment_intent(
    request_data: models.CreatePaymentIntentRequest,
    authorization: str = Header(None),
):
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization")

        token = authorization.replace("Bearer ", "").strip()

        try:
            payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM", "HS256")])
            user_id = int(payload.get("sub"))
            username = payload.get("username")
            user_email = payload.get("email")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT plan_key, tier, billing_cycle, price_cents, currency, duration_days
            FROM payments.plans
            WHERE plan_key = %s AND is_active = TRUE
            """,
            (request_data.plan_key,),
        )

        plan = cursor.fetchone()
        if not plan:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail=f"Plan not found: {request_data.plan_key}")

        metadata = {
            "user_id": user_id,
            "username": username,
            "plan_key": request_data.plan_key,
            "tier": plan["tier"],
            "billing_cycle": plan["billing_cycle"],
        }
        if request_data.influencer_code:
            metadata["influencer_code"] = request_data.influencer_code

        payment_intent = stripe.PaymentIntent.create(
            amount=plan["price_cents"],
            currency=request_data.currency.lower(),
            automatic_payment_methods={"enabled": True},
            metadata=metadata,
            description=f"{plan['tier']} - {plan['billing_cycle']} subscription",
        )

        cursor.execute(
            """
            INSERT INTO payments.stripe_transactions
              (user_id, plan_key, amount_cents, currency,
               stripe_payment_intent_id, status, payment_method_type, influencer_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                user_id,
                request_data.plan_key,
                plan["price_cents"],
                request_data.currency.lower(),
                payment_intent.id,
                "created",
                None,
                request_data.influencer_code,
            ),
        )

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "success": True,
            "client_secret": payment_intent.client_secret,
            "payment_intent_id": payment_intent.id,
            "amount": plan["price_cents"],
            "currency": request_data.currency,
            "plan_key": request_data.plan_key,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in create_payment_intent: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/confirm-payment", tags=["Payments"])
async def confirm_payment(
    request_data: models.ConfirmPaymentRequest,
    authorization: str = Header(None),
):
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization")

        token = authorization.replace("Bearer ", "").strip()

        try:
            payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM", "HS256")])
            user_id = int(payload.get("sub"))
            username = payload.get("username")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

        payment_intent = stripe.PaymentIntent.retrieve(
            request_data.payment_intent_id,
            expand=["payment_method"],
        )

        if payment_intent.status != "succeeded":
            raise HTTPException(status_code=400, detail=f"Payment not completed. Status: {payment_intent.status}")

        payment_method_type = "card"
        card_brand = None
        card_last4 = None

        if payment_intent.payment_method:
            pm = payment_intent.payment_method
            payment_method_type = pm.type

            if pm.type == "card" and hasattr(pm, "card"):
                card_brand = pm.card.brand
                card_last4 = pm.card.last4

            if pm.type == "card" and hasattr(pm.card, "wallet"):
                wallet_type = pm.card.wallet.type if pm.card.wallet else None
                if wallet_type == "apple_pay":
                    payment_method_type = "apple_pay"
                elif wallet_type == "google_pay":
                    payment_method_type = "google_pay"
                if pm.card.wallet and hasattr(pm.card.wallet, "dynamic_last4"):
                    card_last4 = pm.card.wallet.dynamic_last4

        plan_key = payment_intent.metadata.get("plan_key")
        if not plan_key:
            raise HTTPException(status_code=400, detail="Missing plan_key in payment metadata")

        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            UPDATE payments.stripe_transactions
            SET status = 'succeeded',
                stripe_charge_id = %s,
                payment_method_type = %s,
                card_brand = %s,
                card_last4 = %s,
                paid_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE stripe_payment_intent_id = %s
            RETURNING id, plan_key, amount_cents, currency
            """,
            (
                payment_intent.latest_charge,
                payment_method_type,
                card_brand,
                card_last4,
                request_data.payment_intent_id,
            ),
        )

        transaction = cursor.fetchone()
        if not transaction:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Transaction not found")

        cursor.execute(
            """
            SELECT tier, billing_cycle, duration_days
            FROM payments.plans
            WHERE plan_key = %s
            """,
            (transaction["plan_key"],),
        )
        plan = cursor.fetchone()

        start_date = datetime.now()
        end_date = start_date + timedelta(days=plan["duration_days"])

        cursor.execute(
            """
            INSERT INTO payments.subscriptions
              (user_id, plan_key, status, start_at, end_at,
               provider, provider_ref, auto_renew)
            VALUES (%s, %s, 'active', %s, %s, 'stripe', %s, FALSE)
            ON CONFLICT (user_id) WHERE status = 'active'
            DO UPDATE SET
                plan_key = EXCLUDED.plan_key,
                start_at = EXCLUDED.start_at,
                end_at = EXCLUDED.end_at,
                provider_ref = EXCLUDED.provider_ref,
                updated_at = CURRENT_TIMESTAMP
            RETURNING subscription_id
            """,
            (
                user_id,
                transaction["plan_key"],
                start_date,
                end_date,
                request_data.payment_intent_id,
            ),
        )

        subscription = cursor.fetchone()

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "success": True,
            "message": "Payment confirmed and subscription activated",
            "payment_intent_id": payment_intent.id,
            "subscription_id": subscription["subscription_id"],
            "payment_method": {"type": payment_method_type, "card_brand": card_brand, "card_last4": card_last4},
            "plan": {"tier": plan["tier"], "billing_cycle": plan["billing_cycle"], "end_date": end_date.isoformat()},
            "transaction": {"id": transaction["id"], "amount": transaction["amount_cents"], "currency": transaction["currency"]},
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in confirm_payment: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/payment-methods-stats", tags=["Payments"])
async def get_payment_methods_stats(current_user: dict = Depends(get_current_user_from_bearer)):
    _ensure_admin(current_user)
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                COALESCE(payment_method_type, 'unknown') AS payment_method,
                COUNT(*) AS transaction_count,
                SUM(amount_cents) / 100.0 AS total_revenue_usd,
                COUNT(CASE WHEN status = 'succeeded' THEN 1 END) AS successful_count,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_count,
                ROUND(
                    100.0 * COUNT(CASE WHEN status = 'succeeded' THEN 1 END) / COUNT(*),
                    2
                ) AS success_rate
            FROM payments.stripe_transactions
            GROUP BY payment_method_type
            ORDER BY total_revenue_usd DESC
            """
        )

        stats = cursor.fetchall()
        cursor.close()
        conn.close()

        return {"success": True, "stats": stats}

    except Exception as e:
        print(f"Error getting payment methods stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================================================
# Admin: Users, Influencers, Revenue  (MARKETING REMOVED)
# Influencers Source of Truth: auth.influencer_codes
# Usage/Revenue Source: payments.stripe_transactions
# ==========================================================================

@router.get("/admin/users", tags=["Admin"])
async def admin_list_users(
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    _ensure_admin(current_user)
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Prefer a query that includes referral columns if they exist.
        # If the auth.users table doesn't have these columns, we fall back.
        try:
            if search:
                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.username,
                        u.email,
                        u.full_name,
                        u.is_active,
                        u.role,
                        u.user_type,
                        u.influencer_code,
                        u.created_at,
                        u.last_login_at,
                        u.referral_code_used,
                        u.referred_at,
                        ic.influencer_name AS referred_influencer_name
                    FROM auth.users u
                    LEFT JOIN auth.influencer_codes ic
                      ON LOWER(ic.code) = LOWER(u.referral_code_used)
                    WHERE u.username ILIKE %s OR u.email ILIKE %s OR u.full_name ILIKE %s
                    ORDER BY u.created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (f"%{search}%", f"%{search}%", f"%{search}%", limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.username,
                        u.email,
                        u.full_name,
                        u.is_active,
                        u.role,
                        u.user_type,
                        u.influencer_code,
                        u.created_at,
                        u.last_login_at,
                        u.referral_code_used,
                        u.referred_at,
                        ic.influencer_name AS referred_influencer_name
                    FROM auth.users u
                    LEFT JOIN auth.influencer_codes ic
                      ON LOWER(ic.code) = LOWER(u.referral_code_used)
                    ORDER BY u.created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            if search:
                cursor.execute(
                    """
                    SELECT user_id, username, email, full_name, is_active, role, user_type, influencer_code, created_at, last_login_at
                    FROM auth.users
                    WHERE username ILIKE %s OR email ILIKE %s OR full_name ILIKE %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (f"%{search}%", f"%{search}%", f"%{search}%", limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT user_id, username, email, full_name, is_active, role, user_type, influencer_code, created_at, last_login_at
                    FROM auth.users
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )

        users = cursor.fetchall()
        return {"success": True, "users": users}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.post("/admin/users", tags=["Admin"])
async def admin_create_user(
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    _ensure_admin(current_user)

    username = str(payload.get("username") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    raw_password = str(payload.get("password") or "").strip()
    full_name = str(payload.get("full_name") or "").strip()
    role = str(payload.get("role") or "user").strip().lower()
    user_type = str(payload.get("user_type") or "normal").strip().lower()
    influencer_code = payload.get("influencer_code")

    if not username or not email or not raw_password or not full_name:
        raise HTTPException(status_code=400, detail="username, email, password and full_name are required")
    if role not in {"user", "admin"}:
        raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
    if user_type not in {"normal", "special"}:
        raise HTTPException(status_code=400, detail="user_type must be 'normal' or 'special'")

    normalized_code = None
    if influencer_code is not None and str(influencer_code).strip() != "":
        normalized_code = str(influencer_code).strip().upper()
        user_type = "special"

    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        columns = _get_table_columns(conn, "auth", "users")

        if normalized_code:
            cursor.execute(
                """
                SELECT 1
                FROM auth.influencer_codes
                WHERE LOWER(code) = LOWER(%s) AND is_active = TRUE
                LIMIT 1
                """,
                (normalized_code,),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=400, detail="Invalid influencer_code")

        hashed_password = bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        insert_data: Dict[str, Any] = {
            "username": username,
            "email": email,
            "hashed_password": hashed_password,
        }
        if "full_name" in columns:
            insert_data["full_name"] = full_name
        if "role" in columns:
            insert_data["role"] = role
        if "user_type" in columns:
            insert_data["user_type"] = user_type
        if "influencer_code" in columns:
            insert_data["influencer_code"] = normalized_code
        if "created_at" in columns:
            insert_data["created_at"] = datetime.utcnow()
        if "updated_at" in columns:
            insert_data["updated_at"] = datetime.utcnow()

        col_names = list(insert_data.keys())
        placeholders = ", ".join(["%s"] * len(col_names))
        cursor.execute(
            f"""
            INSERT INTO auth.users ({", ".join(col_names)})
            VALUES ({placeholders})
            RETURNING user_id
            """,
            [insert_data[k] for k in col_names],
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create user")
        user_id = int(row["user_id"])

        return_cols = [
            c
            for c in [
                "user_id",
                "username",
                "email",
                "full_name",
                "is_active",
                "role",
                "user_type",
                "influencer_code",
                "created_at",
            ]
            if c in columns or c == "user_id"
        ]
        cursor.execute(
            f"""
            SELECT {", ".join(return_cols)}
            FROM auth.users
            WHERE user_id = %s
            """,
            (user_id,),
        )
        created_user = cursor.fetchone()
        conn.commit()
        return {"success": True, "user": created_user}

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Username or email already exists")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/admin/users/{user_id}", tags=["Admin"])
async def admin_update_user(
    user_id: int,
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    _ensure_admin(current_user)

    if not payload:
        raise HTTPException(status_code=400, detail="No update fields provided")

    if int(current_user.get("user_id", 0)) == user_id and "role" in payload:
        next_role = str(payload.get("role") or "").strip().lower()
        if next_role != "admin":
            raise HTTPException(status_code=400, detail="Cannot downgrade your own admin role")

    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        columns = _get_table_columns(conn, "auth", "users")

        updates: Dict[str, Any] = {}
        if "username" in payload and "username" in columns:
            updates["username"] = str(payload["username"]).strip()
        if "email" in payload and "email" in columns:
            updates["email"] = str(payload["email"]).strip().lower()
        if "full_name" in payload and "full_name" in columns:
            updates["full_name"] = payload["full_name"]
        if "is_active" in payload and "is_active" in columns:
            updates["is_active"] = bool(payload["is_active"])
        if "role" in payload and "role" in columns:
            role_val = str(payload["role"]).strip().lower()
            if role_val not in {"user", "admin"}:
                raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
            updates["role"] = role_val
        if "user_type" in payload and "user_type" in columns:
            user_type_val = str(payload["user_type"]).strip().lower()
            if user_type_val not in {"normal", "special"}:
                raise HTTPException(status_code=400, detail="user_type must be 'normal' or 'special'")
            updates["user_type"] = user_type_val
        if "influencer_code" in payload and "influencer_code" in columns:
            code = payload.get("influencer_code")
            normalized_code = None
            if code is not None and str(code).strip() != "":
                normalized_code = str(code).strip().upper()
                cursor.execute(
                    """
                    SELECT 1
                    FROM auth.influencer_codes
                    WHERE LOWER(code) = LOWER(%s) AND is_active = TRUE
                    LIMIT 1
                    """,
                    (normalized_code,),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=400, detail="Invalid influencer_code")
            updates["influencer_code"] = normalized_code
        if "new_password" in payload and "hashed_password" in columns:
            new_password = str(payload["new_password"] or "").strip()
            if new_password:
                updates["hashed_password"] = bcrypt.hashpw(
                    new_password.encode("utf-8"), bcrypt.gensalt()
                ).decode("utf-8")

        if "updated_at" in columns:
            updates["updated_at"] = datetime.utcnow()

        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        set_parts = [f"{k} = %s" for k in updates.keys()]
        values = list(updates.values())
        values.append(user_id)
        cursor.execute(
            f"""
            UPDATE auth.users
            SET {", ".join(set_parts)}
            WHERE user_id = %s
            """,
            values,
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")

        return_cols = [
            c
            for c in [
                "user_id",
                "username",
                "email",
                "full_name",
                "is_active",
                "role",
                "user_type",
                "influencer_code",
                "created_at",
                "updated_at",
            ]
            if c in columns or c == "user_id"
        ]
        cursor.execute(
            f"""
            SELECT {", ".join(return_cols)}
            FROM auth.users
            WHERE user_id = %s
            """,
            (user_id,),
        )
        user_row = cursor.fetchone()
        conn.commit()
        return {"success": True, "user": user_row}

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Username or email already exists")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/admin/users/{user_id}", tags=["Admin"])
async def admin_delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user_from_bearer),
):
    _ensure_admin(current_user)
    if int(current_user.get("user_id", 0)) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM auth.users WHERE user_id = %s", (user_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        conn.commit()
        return {"success": True}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/influencers", tags=["Admin"])
async def admin_list_influencers(
    commission_threshold_cents: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    """
    Influencer list is built from auth.influencer_codes.
    Usage and revenue are derived from payments.stripe_transactions (status='succeeded').
    """
    _ensure_admin(current_user)
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                ic.code AS code,
                ic.influencer_name AS name,
                ic.is_active,
                ic.created_at,
                ic.updated_at,
                COALESCE(COUNT(t.id) FILTER (WHERE t.status = 'succeeded'), 0) AS usage_count,
                COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status = 'succeeded'), 0) AS total_revenue_cents
            FROM auth.influencer_codes ic
            LEFT JOIN payments.stripe_transactions t
              ON LOWER(t.influencer_code) = LOWER(ic.code)
            GROUP BY ic.code, ic.influencer_name, ic.is_active, ic.created_at, ic.updated_at
            ORDER BY ic.created_at DESC
            """
        )

        influencers = cursor.fetchall()
        for item in influencers:
            total = int(item.get("total_revenue_cents") or 0)
            eligible = max(total - commission_threshold_cents, 0)
            item["eligible_revenue_cents"] = eligible
            item["commission_cents"] = int(round(eligible * 0.30))
        return {"success": True, "influencers": influencers}

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admin/influencers", tags=["Admin"])
async def admin_create_influencer(
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    """
    Create influencer code in auth.influencer_codes.
    Accepts legacy keys: name/referral_code/status
    """
    _ensure_admin(current_user)

    # legacy keys supported:
    raw_code = payload.get("referral_code") or payload.get("code")
    raw_name = payload.get("name") or payload.get("influencer_name")
    raw_status = payload.get("status")

    if not raw_code or not raw_name:
        raise HTTPException(status_code=400, detail="name and referral_code are required")

    code = str(raw_code).strip().upper()
    influencer_name = str(raw_name).strip()

    is_active = True
    if raw_status is not None:
        is_active = str(raw_status).lower() == "active"

    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            INSERT INTO auth.influencer_codes (code, influencer_name, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT (code) DO UPDATE
              SET influencer_name = EXCLUDED.influencer_name,
                  is_active = EXCLUDED.is_active,
                  updated_at = NOW()
            RETURNING code
            """,
            (code, influencer_name, is_active),
        )
        row = cursor.fetchone()
        conn.commit()
        return {"success": True, "code": row["code"] if row else code}

    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Influencer code already exists")

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/admin/influencers/{influencer_code}", tags=["Admin"])
async def admin_update_influencer(
    influencer_code: str,
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    """
    Update influencer in auth.influencer_codes.
    Supports legacy keys: name/referral_code/status
    """
    _ensure_admin(current_user)

    updates = {}
    if payload.get("name") is not None:
        updates["influencer_name"] = payload.get("name")
    if payload.get("influencer_name") is not None:
        updates["influencer_name"] = payload.get("influencer_name")

    # Allow changing the code too (legacy: referral_code)
    new_code = payload.get("referral_code") or payload.get("code")

    if payload.get("status") is not None:
        updates["is_active"] = str(payload.get("status")).lower() == "active"
    if payload.get("is_active") is not None:
        updates["is_active"] = bool(payload.get("is_active"))

    if not updates and not new_code:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor()

        if updates:
            set_parts = [f"{k} = %s" for k in updates.keys()]
            values = list(updates.values())
            values.append(influencer_code)
            cursor.execute(
                f"""
                UPDATE auth.influencer_codes
                SET {", ".join(set_parts)}, updated_at = NOW()
                WHERE LOWER(code) = LOWER(%s)
                """,
                values,
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Influencer code not found")

        if new_code:
            cursor.execute(
                """
                UPDATE auth.influencer_codes
                SET code = %s, updated_at = NOW()
                WHERE LOWER(code) = LOWER(%s)
                """,
                (str(new_code).strip().upper(), influencer_code),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Influencer code not found")

        conn.commit()
        return {"success": True}

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/admin/influencers/{influencer_code}", tags=["Admin"])
async def admin_delete_influencer(
    influencer_code: str,
    current_user: dict = Depends(get_current_user_from_bearer),
):
    _ensure_admin(current_user)
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            DELETE FROM auth.influencer_codes
            WHERE LOWER(code) = LOWER(%s)
            """,
            (influencer_code,),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Influencer code not found")
        conn.commit()
        return {"success": True, "deleted": True}
    except psycopg2.errors.ForeignKeyViolation:
        if conn:
            conn.rollback()
        if cursor:
            cursor.execute(
                """
                UPDATE auth.influencer_codes
                SET is_active = FALSE, updated_at = NOW()
                WHERE LOWER(code) = LOWER(%s)
                """,
                (influencer_code,),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Influencer code not found")
            conn.commit()
            return {
                "success": True,
                "deleted": False,
                "deactivated": True,
                "message": "Influencer code is referenced by users and was deactivated instead.",
            }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/influencer-codes", tags=["Admin"])
async def admin_list_influencer_codes(current_user: dict = Depends(get_current_user_from_bearer)):
    """
    Backward-compatible endpoint for admin UI.
    Lists influencer codes from auth.influencer_codes with usage derived from stripe_transactions.
    """
    _ensure_admin(current_user)
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT
                ic.code,
                ic.influencer_name,
                ic.is_active,
                ic.created_at,
                ic.updated_at,
                COALESCE(COUNT(t.id) FILTER (WHERE t.status = 'succeeded'), 0) AS usage_count,
                COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status = 'succeeded'), 0) AS total_revenue_cents
            FROM auth.influencer_codes ic
            LEFT JOIN payments.stripe_transactions t
              ON LOWER(t.influencer_code) = LOWER(ic.code)
            GROUP BY ic.code, ic.influencer_name, ic.is_active, ic.created_at, ic.updated_at
            ORDER BY ic.created_at DESC
            """
        )
        codes = cursor.fetchall()
        return {"success": True, "codes": codes}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/influencer-codes/analytics", tags=["Admin"])
async def admin_influencer_codes_analytics(
    range_days: int = Query(30, ge=1, le=365, alias="range"),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    """
    Analytics built from:
    - auth.influencer_codes (active codes)
    - payments.stripe_transactions (usage + revenue timeseries)
    """
    _ensure_admin(current_user)
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute(
            """
            SELECT COUNT(*)::int AS active_codes
            FROM auth.influencer_codes
            WHERE is_active = TRUE
            """
        )
        active_codes = int(cursor.fetchone()["active_codes"])

        cursor.execute(
            """
            SELECT COUNT(*)::int AS total_uses
            FROM payments.stripe_transactions
            WHERE status = 'succeeded'
              AND influencer_code IS NOT NULL
              AND influencer_code <> ''
            """
        )
        total_uses = int(cursor.fetchone()["total_uses"])

        # Daily usage timeseries from stripe_transactions.created_at (since referrals table removed)
        cursor.execute(
            """
            SELECT
              DATE_TRUNC('day', created_at) AS day,
              COUNT(*)::int AS usage
            FROM payments.stripe_transactions
            WHERE created_at >= NOW() - (%s || ' days')::interval
              AND status = 'succeeded'
              AND influencer_code IS NOT NULL
              AND influencer_code <> ''
            GROUP BY day
            ORDER BY day
            """,
            (range_days,),
        )
        raw_series = cursor.fetchall()
        series_map = {row["day"].date().isoformat(): int(row["usage"]) for row in raw_series}

        today = datetime.utcnow().date()
        timeseries = []
        for i in range(range_days - 1, -1, -1):
            day = (today - timedelta(days=i)).isoformat()
            usage = series_map.get(day, 0)
            timeseries.append(
                {"date": day, "usage": usage, "revenue_cents": 0, "commission_cents": 0}
            )

        # Top codes by usage
        cursor.execute(
            """
            SELECT
              t.influencer_code AS code,
              ic.influencer_name,
              COUNT(*)::int AS usage_count
            FROM payments.stripe_transactions t
            LEFT JOIN auth.influencer_codes ic
              ON LOWER(ic.code) = LOWER(t.influencer_code)
            WHERE t.status = 'succeeded'
              AND t.influencer_code IS NOT NULL
              AND t.influencer_code <> ''
            GROUP BY t.influencer_code, ic.influencer_name
            ORDER BY usage_count DESC
            LIMIT 10
            """
        )
        top_codes = []
        for row in cursor.fetchall():
            top_codes.append(
                {
                    "code": row["code"],
                    "influencer_name": row.get("influencer_name") or row["code"],
                    "usage_count": int(row["usage_count"] or 0),
                    "revenue_cents": 0,
                    "commission_cents": 0,
                }
            )

        return {
            "kpis": {
                "active_codes": active_codes,
                "total_uses": total_uses,
                "estimated_commission_cents": 0,
            },
            "timeseries": timeseries,
            "top_codes": top_codes,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/revenue-report", tags=["Admin"])
async def admin_revenue_report(
    range_days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    _ensure_admin(current_user)
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        tx_columns = _get_table_columns(conn, "payments", "stripe_transactions")
        tx_pk_col = "id" if "id" in tx_columns else ("transaction_id" if "transaction_id" in tx_columns else None)
        if not tx_pk_col:
            raise HTTPException(
                status_code=500,
                detail="payments.stripe_transactions is missing primary key column (id/transaction_id)",
            )
        if "created_at" not in tx_columns:
            raise HTTPException(
                status_code=500,
                detail="payments.stripe_transactions is missing required column created_at",
            )

        start_dt = None
        end_exclusive = None
        if date_from:
            start_dt = datetime.strptime(date_from, "%Y-%m-%d")
        if date_to:
            end_exclusive = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)

        if start_dt and end_exclusive and start_dt >= end_exclusive:
            raise HTTPException(status_code=400, detail="date_from must be <= date_to")

        where_sql = []
        where_params: list[Any] = []
        if start_dt:
            where_sql.append("created_at >= %s")
            where_params.append(start_dt)
        if end_exclusive:
            where_sql.append("created_at < %s")
            where_params.append(end_exclusive)
        if not where_sql:
            where_sql.append("created_at >= NOW() - (%s || ' days')::interval")
            where_params.append(range_days)
        where_clause = " AND ".join(where_sql)
        where_clause_t = where_clause.replace("created_at", "t.created_at")

        cursor.execute(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE status = 'succeeded') AS successful_transactions,
                COALESCE(SUM(amount_cents) FILTER (WHERE status = 'succeeded'), 0) AS total_revenue_cents
            FROM payments.stripe_transactions
            WHERE {where_clause}
            """
            ,
            tuple(where_params),
        )
        summary = cursor.fetchone()

        cursor.execute(
            f"""
            SELECT plan_key, COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS revenue_cents
            FROM payments.stripe_transactions
            WHERE status = 'succeeded'
              AND {where_clause}
            GROUP BY plan_key
            ORDER BY revenue_cents DESC
            """
            ,
            tuple(where_params),
        )
        by_plan = cursor.fetchall()

        cursor.execute(
            f"""
            SELECT
              DATE_TRUNC('day', created_at)::date AS day,
              COUNT(*)::int AS transactions,
              COALESCE(SUM(amount_cents), 0)::bigint AS revenue_cents
            FROM payments.stripe_transactions
            WHERE status = 'succeeded'
              AND {where_clause}
            GROUP BY day
            ORDER BY day ASC
            """
            ,
            tuple(where_params),
        )
        daily = cursor.fetchall()
        daily_rows = []
        for row in daily:
            daily_rows.append(
                {
                    "date": row["day"].isoformat() if row.get("day") else None,
                    "transactions": int(row.get("transactions") or 0),
                    "revenue_cents": int(row.get("revenue_cents") or 0),
                }
            )

        cursor.execute(
            f"""
            SELECT
              t.{tx_pk_col} AS transaction_id,
              t.user_id,
              u.username,
              u.email,
              t.influencer_code,
              t.plan_key,
              t.amount_cents,
              t.currency,
              t.status,
              t.payment_method_type,
              t.stripe_payment_intent_id,
              t.created_at,
              t.paid_at
            FROM payments.stripe_transactions t
            LEFT JOIN auth.users u ON u.user_id = t.user_id
            WHERE t.status = 'succeeded'
              AND {where_clause_t}
            ORDER BY t.created_at DESC
            """
            ,
            tuple(where_params),
        )
        transactions = cursor.fetchall()
        tx_rows = []
        daily_details: Dict[str, Any] = {}
        for tx in transactions:
            row = {
                "transaction_id": tx.get("transaction_id"),
                "user_id": tx.get("user_id"),
                "username": tx.get("username"),
                "email": tx.get("email"),
                "influencer_code": tx.get("influencer_code"),
                "plan_key": tx.get("plan_key"),
                "amount_cents": int(tx.get("amount_cents") or 0),
                "currency": tx.get("currency"),
                "status": tx.get("status"),
                "payment_method_type": tx.get("payment_method_type"),
                "stripe_payment_intent_id": tx.get("stripe_payment_intent_id"),
                "created_at": tx.get("created_at").isoformat() if tx.get("created_at") else None,
                "paid_at": tx.get("paid_at").isoformat() if tx.get("paid_at") else None,
            }
            tx_rows.append(row)
            date_key = (tx.get("created_at").date().isoformat() if tx.get("created_at") else None)
            if date_key:
                daily_details.setdefault(date_key, []).append(row)

        return {
            "success": True,
            "range_days": range_days,
            "date_from": date_from,
            "date_to": date_to,
            "summary": summary,
            "by_plan": by_plan,
            "daily": daily_rows,
            "transactions": tx_rows,
            "daily_details": daily_details,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admin/revenue", tags=["Admin"])
async def admin_revenue(
    range_days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user_from_bearer),
):
    return await admin_revenue_report(
        range_days=range_days,
        date_from=date_from,
        date_to=date_to,
        current_user=current_user,
    )


@router.get("/influencers/validate", tags=["Influencers"])
async def validate_influencer_code(code: str = Query(..., min_length=1)):
    """
    Validate influencer code against auth.influencer_codes.
    """
    conn = None
    cursor = None
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT code, influencer_name, is_active, created_at, updated_at
            FROM auth.influencer_codes
            WHERE LOWER(code) = LOWER(%s)
            LIMIT 1
            """,
            (code.strip(),),
        )
        row = cursor.fetchone()
        if not row or not bool(row.get("is_active")):
            return {"success": True, "valid": False}
        return {"success": True, "valid": True, "influencer": row}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
