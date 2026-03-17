"""
Pydantic Models for Crypto Analytics Platform API

This module defines all the Pydantic models used for request/response validation
in the FastAPI routes. These models ensure type safety, data validation, and
proper API documentation through OpenAPI schema generation.

The models are organized into categories:
- User Authentication Models (registration, login, logout)
- User Profile Models (user data, preferences)
- Data Request Models (exchange selection)
- Response Models (success/failure responses)
"""

from pydantic import BaseModel, EmailStr, ConfigDict  # type: ignore
from typing import Optional, Dict, Any, List
from pydantic import Field
from enum import Enum


class UserRegisterRequest(BaseModel):
    """
    Request model for user registration.

    This model validates the data required to create a new user account.
    All fields are required and validated according to their types.

    Attributes:
        full_name (str): User's full name (first and last name)
        username (str): Unique username for the account
        email (EmailStr): Valid email address (automatically validated by Pydantic)
        password (str): User's password (should be hashed on the backend)
    """

    model_config = ConfigDict(populate_by_name=True)

    full_name: str
    username: str
    email: EmailStr
    password: str
    influencer_code: Optional[str] = Field(default=None, alias="influencerCode")

class DisclaimerAcceptRequest(BaseModel):
    session_id: str
    disclaimer_version: str
    country: Optional[str] = "GLOBAL"
    disclaimer_text: str  # frontend sends exact text so backend can hash

class UserLoginRequest(BaseModel):
    """
    Request model for user login authentication.

    This model validates the credentials provided during login.
    Email validation ensures proper email format.

    Attributes:
        email (EmailStr): User's registered email address
        password (str): User's password for authentication
    """

    email: EmailStr
    password: str
    influencer_code: Optional[str] = None


class OtpSendRequest(BaseModel):
    """
    Request model for sending OTP to an email.
    """
    email: EmailStr


class OtpVerifyRequest(BaseModel):
    """
    Request model for verifying OTP and issuing an IdP token.
    """
    email: EmailStr
    code: str


class OtpExchangeRequest(BaseModel):
    """
    Request model for exchanging IdP token for app JWT.
    """
    idp_token: str




class UserLogoutRequest(BaseModel):
    """
    Request model for user logout (currently unused).

    This model was designed for token-based logout but the current
    implementation uses cookie-based authentication instead.

    Attributes:
        token (str): JWT token to invalidate (deprecated)
    """

    token: str


class UserResponse(BaseModel):
    """
    Response model for user profile data.

    This model represents the user information returned after successful
    authentication. Sensitive data like passwords are excluded.

    Attributes:
        user_id (int): Unique database identifier for the user
        username (str): User's unique username
        email (str): User's email address
        full_name (str): User's full name
        is_active (bool): Whether the user account is active/enabled
    """

    user_id: int
    username: str
    email: str
    full_name: str
    is_active: bool
    user_type: str = "normal"
    influencer_code: Optional[str] = None


class OtpExchangeResponse(BaseModel):
    """
    Response model for OTP login exchange.
    """
    success: bool
    message: str
    access_token: str
    user: UserResponse


class Exchange(str, Enum):
    """
    Enumeration of supported cryptocurrency exchanges.

    This enum defines the available exchanges for fetching cryptocurrency
    price data. Used as a query parameter in price endpoints.

    Values:
        binance: Binance exchange (default)
        coingecko: CoinGecko API
    """

    binance = "Binance"
    coingecko = "Coingecko"


class LogoutResponse(BaseModel):
    """
    Response model for logout confirmation.

    This model provides a standardized response format for logout operations,
    indicating success/failure and providing a message.

    Attributes:
        success (bool): Whether the logout operation was successful
        message (str): Human-readable message about the logout result
    """

    success: bool
    message: str

class GenericResonse(BaseModel):
    """
    Simple success/ failure envelope with message    
    """
    success: bool
    message: str

class UserPreferenceRequest(BaseModel):
    """
    Request model for updating user preferences.

    This model captures the user's responses to the risk assessment questionnaire
    and stores their investment preferences. Used to personalize AI forecasts.

    Attributes:
        answers (Dict[str, Any]): Raw questionnaire responses with question IDs as keys
        scores (Dict[str, Any]): Calculated risk scores for different categories
        completed (bool): Whether the questionnaire was fully completed
        completedAt (str): Timestamp when the questionnaire was completed
    """

    model_config = ConfigDict(extra="allow")

    answers: Dict[str, Any]
    scores: Dict[str, Any] = Field(default_factory=dict)
    completed: bool
    completedAt: str

    # Compatibility fields used by the frontend payload
    primaryRiskProfile: Optional[str] = None
    riskAwareness: Optional[Dict[str, Any]] = None


class UserPreferenceResponse(BaseModel):
    """
    Response model for preference update confirmation.

    This model provides feedback when user preferences are successfully
    updated or when errors occur during the update process.

    Attributes:
        success (bool): Whether the preference update was successful
        message (str): Human-readable message about the update result
    """

    success: bool
    message: str


class UserPreferenceGetResponse(BaseModel):
    """
    Response model for retrieving user preferences.

    This model returns the user's stored preferences along with status
    information. Preferences are optional as users may not have completed
    the questionnaire yet.

    Attributes:
        success (bool): Whether the preference retrieval was successful
        message (str): Human-readable message about the retrieval result
        preferences (Optional[Dict[str, Any]]): User's stored preferences if available
    """

    success: bool
    message: str
    preferences: Optional[Dict[str, Any]] = None

class DashboardPreferenceRequest(BaseModel):
    """
    Request model to upsert a user's dashboard-level preferences.
    Mirrors columns in auth.user_dashboard_preferences

    Attributes:
        default_exchange(Exchange): default exchange to use
        default_timeframe (Optional[str]): e.g. '1h', '24h', '7d', '30d'
        layout (Optional[Dict[str, Any]]): JSON layout config (grid positions, sizes, etc.)
    """
    default_exchange: Exchange
    default_timeframe: Optional[str] = None
    layout: Optional[Dict[str, Any]] = None

class DashboardPreferenceResponse(BaseModel):
    """
    Response model after upserting dashboard preferences.
    """
    success: bool
    message: str

class DashboardPreferenceGetResponse(BaseModel):
    """
    Response model for fetching current dashboard preferences.
    """
    success: bool
    message: str
    default_exchange: Optional[Exchange] = None
    default_timeframe: Optional[str] = None
    layout: Optional[Dict[str, Any]] = None

class ComponentPreferenceItem(BaseModel):
    """
    One component preference row corresponding to auth.user_component_preferences.

    Attributes:
        component_key (str): unique key for the UI component (e.g., 'price_chart_btc')
        is_visible (bool): whether the component is shown
        display_order (int): ordering index (lower first)
        params (Optional[Dict[str, Any]]): component-specific configuration
    """
    component_key: str
    is_visible: bool = True
    display_order: int
    params: Optional[Dict[str, Any]] = None


class ComponentPreferenceUpsertRequest(BaseModel):
    """
    Request to upsert a batch of component preferences for the user.
    """
    items: List[ComponentPreferenceItem]


class ComponentPreferenceResponse(BaseModel):
    """
    Response model after upserting component preferences.
    """
    success: bool
    message: str


class ComponentPreferenceGetResponse(BaseModel):
    """
    Response model when fetching component preferences for a user.
    """
    success: bool
    message: str
    items: List[ComponentPreferenceItem] = []





# ============================================================================
# Stripe 支付相关模型（在文件末尾添加）
# ============================================================================

class PlanResponse(BaseModel):
    """
   Plan response model
    
    Used to return available plan list to frontend.
    
    Attributes:
        plan_key (str): Unique plan identifier
        tier (str): Plan tier (free, basic, premium, enterprise)
        billing_cycle (str): Billing cycle (none, monthly, yearly)
        price_cents (int): Price in cents
        currency (str): Currency code (USD, EUR, etc.)
        description (Optional[str]): Plan description
        features (Dict[str, Any]): Feature list
    """
    plan_key: str
    tier: str
    billing_cycle: str
    price_cents: int
    currency: str
    description: Optional[str] = None
    features: Dict[str, Any]


class CreateCheckoutSessionRequest(BaseModel):
    """
    Create Stripe Checkout session request
    
    Frontend calls this model to create payment session.
    
    Attributes:
        plan_key (str): Plan identifier to purchase
        success_url (str): Redirect URL after successful payment
        cancel_url (str): Redirect URL after payment cancellation
        customer_email (Optional[str]): Customer email (optional)
    """
    plan_key: str
    success_url: str
    cancel_url: str
    customer_email: Optional[str] = None
    influencer_code: Optional[str] = None


class CreateCheckoutSessionResponse(BaseModel):
    """
    Create Stripe Checkout session response
    
    Returned to frontend for redirecting to Stripe payment page.
    
    Attributes:
        session_id (str): Stripe Session ID
        checkout_url (str): Stripe Checkout page URL
        expires_at (int): Session expiration timestamp
    """
    session_id: str
    checkout_url: str
    expires_at: int


class StripeTransactionResponse(BaseModel):
    """
    Stripe transaction record response
    
    Returns transaction details to frontend.
    
    Attributes:
        id (int): Transaction ID
        user_id (int): User ID
        plan_key (str): Plan identifier
        amount_cents (int): Amount in cents
        currency (str): Currency code
        status (str): Transaction status
        payment_method_type (Optional[str]): Payment method type
        card_last4 (Optional[str]): Last 4 digits of card
        receipt_url (Optional[str]): Receipt URL
        paid_at (Optional[str]): Payment timestamp
        created_at (str): Creation timestamp
    """
    id: int
    user_id: int
    plan_key: str
    amount_cents: int
    currency: str
    status: str
    payment_method_type: Optional[str] = None
    card_last4: Optional[str] = None
    receipt_url: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: str


class SubscriptionResponse(BaseModel):
    """
    Subscription response model
    
    Returns user's current subscription details.
    
    Attributes:
        subscription_id (int): Subscription ID
        user_id (int): User ID
        plan_key (str): Plan identifier
        status (str): Subscription status (active, expired, cancelled)
        start_at (str): Start timestamp
        end_at (Optional[str]): End timestamp
        auto_renew (bool): Whether auto-renewal is enabled
        days_remaining (Optional[int]): Days remaining
    """
    subscription_id: int
    user_id: int
    plan_key: str
    status: str
    start_at: str
    end_at: Optional[str] = None
    auto_renew: bool
    days_remaining: Optional[int] = None


class UserSubscriptionDetailResponse(BaseModel):
    """
   User subscription detailed information response
    
    Contains complete subscription and plan information.
    
    Attributes:
        has_subscription (bool): Whether user has a subscription
        plan_tier (str): Plan tier level
        plan_key (Optional[str]): Plan identifier
        billing_cycle (Optional[str]): Billing cycle
        status (Optional[str]): Subscription status
        start_at (Optional[str]): Start timestamp
        end_at (Optional[str]): End timestamp
        days_remaining (Optional[int]): Days remaining
        auto_renew (Optional[bool]): Whether auto-renewal is enabled
        features (Optional[Dict[str, Any]]): Feature list
    """
    has_subscription: bool
    plan_tier: str
    plan_key: Optional[str] = None
    billing_cycle: Optional[str] = None
    status: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    days_remaining: Optional[int] = None
    auto_renew: Optional[bool] = None
    features: Optional[Dict[str, Any]] = None


class CancelSubscriptionRequest(BaseModel):
    """
    Cancel subscription request
    
    Attributes:
        cancel_at_period_end (bool): Whether to cancel at period end (default True)
    """
    cancel_at_period_end: bool = True



# ============================================================================
# Payment Intent request/response models
# ============================================================================

class CreatePaymentIntentRequest(BaseModel):
    """Create Payment Intent request."""
    plan_key: str
    currency: str = "usd"
    influencer_code: Optional[str] = None

class ConfirmPaymentRequest(BaseModel):
    """Confirm payment request."""
    payment_intent_id: str
