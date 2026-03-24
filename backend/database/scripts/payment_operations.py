from database.utils.db_pool import get_db_connection
# """
# 支付相关的数据库操作脚本
# 类似 user_auth.py 和 data_ingestion.py 的设计模式
# """

# import os
# import psycopg2
# from psycopg2.extras import RealDictCursor, Json
# from dotenv import load_dotenv
# from datetime import datetime, timedelta
# from typing import Dict, Optional
# import stripe
# from application.services.paypal_service import PaypalService

# load_dotenv()

# # 初始化 Stripe
# stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
# STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")


# def _get_conn():
#     """获取数据库连接"""
#     return get_db_connection()


# # ============================================================================
# # 套餐查询
# # ============================================================================

# def get_available_plans() -> Dict:
#     """
#     获取所有可用套餐
    
#     Returns:
#         dict: 包含套餐列表的响应
#     """
#     conn = None
#     cursor = None
#     try:
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
        
#         cursor.execute("""
#             SELECT 
#                 plan_key,
#                 tier,
#                 billing_cycle,
#                 price_cents,
#                 currency,
#                 description,
#                 news_analysis_limit,
#                 social_analysis_limit,
#                 data_access,
#                 sentiment_analysis,
#                 api_access,
#                 priority_support
#             FROM payments.plans
#             WHERE is_active = TRUE
#             ORDER BY 
#                 CASE tier
#                     WHEN 'free' THEN 1
#                     WHEN 'basic' THEN 2
#                     WHEN 'premium' THEN 3
#                     WHEN 'enterprise' THEN 4
#                 END,
#                 price_cents
#         """)
        
#         plans = cursor.fetchall()
        
#         # 格式化响应
#         formatted_plans = []
#         for plan in plans:
#             formatted_plans.append({
#                 'plan_key': plan['plan_key'],
#                 'tier': plan['tier'],
#                 'billing_cycle': plan['billing_cycle'],
#                 'price_cents': plan['price_cents'],
#                 'currency': plan['currency'],
#                 'description': plan['description'],
#                 'features': {
#                     'news_analysis_limit': plan['news_analysis_limit'],
#                     'social_analysis_limit': plan['social_analysis_limit'],
#                     'data_access': plan['data_access'],
#                     'sentiment_analysis': plan['sentiment_analysis'],
#                     'api_access': plan['api_access'],
#                     'priority_support': plan['priority_support']
#                 }
#             })
        
#         return {
#             'success': True,
#             'count': len(formatted_plans),
#             'plans': formatted_plans
#         }
        
#     except Exception as e:
#         print(f"Error getting plans: {e}")
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()


# # ============================================================================
# # Stripe Checkout
# # ============================================================================

# def create_stripe_checkout_session(
#     user_id: int,
#     plan_key: str,
#     success_url: str,
#     cancel_url: str,
#     customer_email: Optional[str] = None
# ) -> Dict:
#     """
#     创建 Stripe Checkout 会话
    
#     Args:
#         user_id: 用户 ID
#         plan_key: 套餐标识
#         success_url: 支付成功 URL
#         cancel_url: 支付取消 URL
#         customer_email: 客户邮箱
    
#     Returns:
#         dict: 包含 checkout_url 的响应
#     """
#     conn = None
#     cursor = None
#     try:
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
        
#         # 1. 查询套餐信息
#         cursor.execute("""
#             SELECT plan_key, tier, price_cents, currency, billing_cycle
#             FROM payments.plans
#             WHERE plan_key = %s AND is_active = TRUE
#         """, (plan_key,))
        
#         plan = cursor.fetchone()
#         if not plan:
#             return {'success': False, 'message': f'Plan {plan_key} not found or inactive'}
        
#         # 2. Build line item from plan pricing to keep UI and Stripe aligned.
#         interval = None
#         if plan['billing_cycle'] == 'monthly':
#             interval = 'month'
#         elif plan['billing_cycle'] == 'yearly':
#             interval = 'year'

#         price_data = {
#             'currency': plan['currency'].lower(),
#             'unit_amount': int(plan['price_cents']),
#             'product_data': {
#                 'name': f"{plan['tier'].capitalize()} ({plan['billing_cycle']})"
#             }
#         }
#         if plan['billing_cycle'] != 'none' and interval:
#             price_data['recurring'] = {'interval': interval}

#         line_item = {'price_data': price_data, 'quantity': 1}

#         session = stripe.checkout.Session.create(
#             payment_method_types=['card'],
#             line_items=[line_item],
#             mode='subscription' if plan['billing_cycle'] != 'none' else 'payment',
#             success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}',
#             cancel_url=cancel_url,
#             client_reference_id=str(user_id),
#             customer_email=customer_email,
#             metadata={
#                 'user_id': str(user_id),
#                 'plan_key': plan_key
#             },
#             allow_promotion_codes=True,
#             billing_address_collection='auto'
#         )
        
#         return {
#             'success': True,
#             'session_id': session.id,
#             'session_url': session.url,
#             'expires_at': session.expires_at
#         }
        
#     except stripe.error.StripeError as e:
#         print(f"Stripe error: {e}")
#         return {'success': False, 'message': str(e)}
#     except Exception as e:
#         print(f"Error creating checkout session: {e}")
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()


# def create_paypal_order(
#     user_id: int,
#     plan_key: str
# ) -> Dict:
#     """
#     创建 PayPal 订单
#     """
#     conn = None
#     cursor = None
#     try:
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
        
#         # 1. 查询套餐信息
#         cursor.execute("""
#             SELECT plan_key, price_cents, currency
#             FROM payments.plans
#             WHERE plan_key = %s AND is_active = TRUE
#         """, (plan_key,))
        
#         plan = cursor.fetchone()
#         if not plan:
#             return {'success': False, 'message': f'Plan {plan_key} not found'}
            
#         # 2. 调用 PayPal Service 创建订单
#         service = PaypalService()
#         amount = f"{plan['price_cents'] / 100:.2f}"
#         currency = plan['currency'].upper()
        
#         order = service.create_order(amount, currency)
        
#         # 获取 approve 链接
#         approval_url = next((link['href'] for link in order['links'] if link['rel'] == 'approve'), None)
        
#         return {
#             'success': True,
#             'order_id': order['id'],
#             'approval_url': approval_url
#         }
        
#     except Exception as e:
#         print(f"Error creating paypal order: {e}")
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor: cursor.close()
#         if conn: conn.close()


# def capture_paypal_order(order_id: str) -> Dict:
#     """
#     捕获 PayPal 订单
#     """
#     try:
#         service = PaypalService()
#         capture = service.capture_order(order_id)
        
#         if capture['status'] == 'COMPLETED':
#             return {
#                 'success': True, 
#                 'capture_id': capture['id'], 
#                 'status': capture['status'],
#                 'payer': capture.get('payer', {})
#             }
#         else:
#             return {'success': False, 'message': 'Payment not completed', 'details': capture}
            
#     except Exception as e:
#         print(f"Error capturing paypal order: {e}")
#         return {'success': False, 'message': str(e)}


# def get_checkout_session_details(session_id: str) -> Dict:
#     """
#     获取 Checkout Session 详情
    
#     Args:
#         session_id: Stripe Session ID
    
#     Returns:
#         dict: Session 详情
#     """
#     try:
#         session = stripe.checkout.Session.retrieve(
#             session_id,
#             expand=['payment_intent', 'subscription']
#         )
        
#         return {
#             'success': True,
#             'session_id': session.id,
#             'payment_status': session.payment_status,
#             'customer_email': session.customer_details.email if session.customer_details else None,
#             'amount_total': session.amount_total,
#             'currency': session.currency
#         }
        
#     except stripe.error.StripeError as e:
#         print(f"Error retrieving session: {e}")
#         return {'success': False, 'message': str(e)}


# # ============================================================================
# # 用户订阅查询
# # ============================================================================

# def get_user_active_subscription(user_id: int) -> Dict:
#     """
#     获取用户当前有效订阅
    
#     Args:
#         user_id: 用户 ID
    
#     Returns:
#         dict: 订阅详情
#     """
#     conn = None
#     cursor = None
#     try:
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
        
#         cursor.execute("""
#             SELECT 
#                 s.subscription_id,
#                 s.plan_key,
#                 s.status,
#                 s.start_at,
#                 s.end_at,
#                 s.auto_renew,
#                 p.tier,
#                 p.billing_cycle,
#                 p.news_analysis_limit,
#                 p.social_analysis_limit,
#                 p.data_access,
#                 p.sentiment_analysis,
#                 p.api_access,
#                 p.priority_support
#             FROM payments.subscriptions s
#             JOIN payments.plans p ON s.plan_key = p.plan_key
#             WHERE s.user_id = %s
#             AND s.status = 'active'
#             AND (s.end_at IS NULL OR s.end_at > NOW())
#             ORDER BY s.start_at DESC
#             LIMIT 1
#         """, (user_id,))
        
#         subscription = cursor.fetchone()
        
#         if not subscription:
#             return {
#                 'success': True,
#                 'has_subscription': False,
#                 'plan_tier': 'free',
#                 'message': 'No active subscription'
#             }
        
#         # 计算剩余天数
#         days_remaining = None
#         if subscription['end_at']:
#             days_remaining = (subscription['end_at'] - datetime.now()).days
        
#         return {
#             'success': True,
#             'has_subscription': True,
#             'subscription_id': subscription['subscription_id'],
#             'plan_key': subscription['plan_key'],
#             'plan_tier': subscription['tier'],
#             'billing_cycle': subscription['billing_cycle'],
#             'status': subscription['status'],
#             'start_at': subscription['start_at'].isoformat(),
#             'end_at': subscription['end_at'].isoformat() if subscription['end_at'] else None,
#             'days_remaining': days_remaining,
#             'auto_renew': subscription['auto_renew'],
#             'features': {
#                 'news_analysis_limit': subscription['news_analysis_limit'],
#                 'social_analysis_limit': subscription['social_analysis_limit'],
#                 'data_access': subscription['data_access'],
#                 'sentiment_analysis': subscription['sentiment_analysis'],
#                 'api_access': subscription['api_access'],
#                 'priority_support': subscription['priority_support']
#             }
#         }
        
#     except Exception as e:
#         print(f"Error getting user subscription: {e}")
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()


# # ============================================================================
# # 交易记录查询
# # ============================================================================

# def get_user_transactions(
#     user_id: int,
#     limit: int = 10,
#     status: Optional[str] = None
# ) -> Dict:
#     """
#     获取用户交易记录
    
#     Args:
#         user_id: 用户 ID
#         limit: 返回记录数
#         status: 交易状态过滤
    
#     Returns:
#         dict: 交易记录列表
#     """
#     conn = None
#     cursor = None
#     try:
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
        
#         # ✅ 使用新表 payments.stripe_transactions
#         query = """
#             SELECT 
#                 id,
#                 user_id,
#                 plan_key,
#                 amount_cents,
#                 currency,
#                 status,
#                 payment_method_type,
#                 card_brand,
#                 card_last4,
#                 receipt_url,
#                 stripe_payment_intent_id,
#                 stripe_charge_id,
#                 paid_at,
#                 created_at
#             FROM payments.stripe_transactions
#             WHERE user_id = %s
#         """
#         params = [user_id]
        
#         if status:
#             query += " AND status = %s"
#             params.append(status)
        
#         query += " ORDER BY created_at DESC LIMIT %s"
#         params.append(limit)
        
#         cursor.execute(query, tuple(params))
#         transactions = cursor.fetchall()
        
#         # 格式化响应
#         formatted_transactions = []
#         for tx in transactions:
#             formatted_transactions.append({
#                 'transaction_id': tx['id'],  # ✅ 新表主键是 id
#                 'user_id': tx['user_id'],
#                 'plan_key': tx['plan_key'],
#                 'amount_cents': tx['amount_cents'],
#                 'currency': tx['currency'],
#                 'status': tx['status'],
#                 'payment_method': tx.get('payment_method_type'),
#                 'card_brand': tx.get('card_brand'),
#                 'card_last4': tx.get('card_last4'),
#                 'receipt_url': tx.get('receipt_url'),
#                 'stripe_payment_intent_id': tx.get('stripe_payment_intent_id'),
#                 'paid_at': tx['paid_at'].isoformat() if tx['paid_at'] else None,
#                 'created_at': tx['created_at'].isoformat()
#             })
        
#         return {
#             'success': True,
#             'count': len(formatted_transactions),
#             'transactions': formatted_transactions
#         }
        
#     except Exception as e:
#         print(f"Error getting transactions: {e}")
#         import traceback
#         traceback.print_exc()
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()

# # ============================================================================
# # 订阅限制检查
# # ============================================================================

# def check_user_subscription_limit(user_id: int, limit_type: str) -> Dict:
#     """
#     检查用户订阅功能限制
    
#     Args:
#         user_id: 用户 ID
#         limit_type: 限制类型 (news_analysis 或 social_analysis)
    
#     Returns:
#         dict: 限制检查结果
#     """
#     subscription = get_user_active_subscription(user_id)
    
#     if not subscription.get('has_subscription'):
#         return {
#             'success': True,
#             'has_limit': False,
#             'remaining': 0,
#             'limit': 0,
#             'message': 'No active subscription'
#         }
    
#     features = subscription.get('features', {})
    
#     if limit_type == 'news_analysis':
#         limit = features.get('news_analysis_limit', 0)
#     elif limit_type == 'social_analysis':
#         limit = features.get('social_analysis_limit', 0)
#     else:
#         return {'success': False, 'message': 'Invalid limit_type'}
    
#     # -1 表示无限制
#     if limit == -1:
#         return {
#             'success': True,
#             'has_limit': True,
#             'remaining': -1,
#             'limit': -1,
#             'message': 'Unlimited'
#         }
    
#     # TODO: 实际应查询用户本月使用次数
#     # 这里简化处理
#     used_count = 0  # 应从数据库查询
#     remaining = max(0, limit - used_count)
    
#     return {
#         'success': True,
#         'has_limit': remaining > 0,
#         'remaining': remaining,
#         'limit': limit,
#         'used': used_count
#     }


# # ============================================================================
# # Webhook 处理（简化版）
# # ============================================================================

# def handle_stripe_webhook(payload: bytes, signature: str) -> Dict:
#     """
#     ??? Stripe Webhook
    
#     Args:
#         payload: ????????
#         signature: Stripe ???
    
#     Returns:
#         dict: ??????
#     """
#     conn = None
#     cursor = None
#     event = None
#     try:
#         # ??????
#         event = stripe.Webhook.construct_event(
#             payload, signature, STRIPE_WEBHOOK_SECRET
#         )
        
#         print(f"Received webhook event: {event['type']}")
        
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
#         cursor.execute("""
#             INSERT INTO payments.stripe_webhook_events
#             (event_id, event_type, event_data, processed, created_at, received_at)
#             VALUES (%s, %s, %s, FALSE, NOW(), NOW())
#             ON CONFLICT (event_id) DO NOTHING
#         """, (
#             event['id'],
#             event['type'],
#             Json(event)
#         ))
#         conn.commit()
        
#         if event['type'] == 'checkout.session.completed':
#             session = event['data']['object']
#             print(f"Checkout completed: {session['id']}")
#             record_result = record_checkout_session(session['id'])
#             if record_result.get('success'):
#                 cursor.execute("""
#                     UPDATE payments.stripe_webhook_events
#                     SET processed = TRUE, processed_at = NOW(), related_transaction_id = %s
#                     WHERE event_id = %s
#                 """, (record_result.get('transaction_id'), event['id']))
#             else:
#                 cursor.execute("""
#                     UPDATE payments.stripe_webhook_events
#                     SET processed = FALSE, error_message = %s
#                     WHERE event_id = %s
#                 """, (record_result.get('message'), event['id']))
#             conn.commit()
        
#         return {'success': True, 'event_id': event['id']}
        
#     except Exception as e:
#         print(f"Webhook error: {e}")
#         try:
#             if conn and cursor and event:
#                 cursor.execute("""
#                     UPDATE payments.stripe_webhook_events
#                     SET processed = FALSE, error_message = %s
#                     WHERE event_id = %s
#                 """, (str(e), event.get('id')))
#                 conn.commit()
#         except Exception:
#             pass
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()


# def record_checkout_session(session_id: str) -> Dict:
#     """
#     Retrieve Stripe Checkout session and record transaction/subscription.
#     """
#     conn = None
#     cursor = None
#     try:
#         session = stripe.checkout.Session.retrieve(
#             session_id,
#             expand=['payment_intent', 'subscription', 'customer_details']
#         )

#         user_id = session.client_reference_id or (session.metadata or {}).get('user_id')
#         plan_key = (session.metadata or {}).get('plan_key')
#         if not user_id or not plan_key:
#             return {'success': False, 'message': 'Missing user_id or plan_key in session metadata'}

#         if session.payment_status not in ['paid', 'no_payment_required']:
#             return {'success': False, 'message': f"Payment not completed. Status: {session.payment_status}"}

#         payment_intent_id = session.payment_intent.id if hasattr(session.payment_intent, 'id') else session.payment_intent
#         amount_cents = session.amount_total or 0
#         currency = (session.currency or 'usd').upper()

#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
#         cursor.execute("""
#             SELECT duration_days
#             FROM payments.plans
#             WHERE plan_key = %s
#         """, (plan_key,))
#         plan = cursor.fetchone()

#         subscription_id = None
#         if session.subscription:
#             stripe_sub_id = session.subscription.id if hasattr(session.subscription, 'id') else session.subscription
#             start_at = datetime.now()
#             end_at = None
#             if plan and plan.get('duration_days'):
#                 end_at = start_at + timedelta(days=plan['duration_days'])

#             cursor.execute("""
#                 INSERT INTO payments.subscriptions
#                 (user_id, plan_key, status, start_at, end_at, provider, provider_ref, auto_renew)
#                 VALUES (%s, %s, 'active', %s, %s, 'stripe', %s, FALSE)
#                 ON CONFLICT (user_id)
#                 WHERE (status = 'active')
#                 DO UPDATE SET
#                     plan_key = EXCLUDED.plan_key,
#                     status = EXCLUDED.status,
#                     start_at = EXCLUDED.start_at,
#                     end_at = EXCLUDED.end_at,
#                     provider = EXCLUDED.provider,
#                     provider_ref = EXCLUDED.provider_ref,
#                     updated_at = NOW()
#                 RETURNING subscription_id
#             """, (int(user_id), plan_key, start_at, end_at, stripe_sub_id))
#             subscription_id = cursor.fetchone()['subscription_id']

#         card_brand = None
#         card_last4 = None
#         receipt_url = None
#         stripe_charge_id = None
#         if payment_intent_id:
#             try:
#                 pi = stripe.PaymentIntent.retrieve(payment_intent_id, expand=['charges'])
#                 if pi.charges and pi.charges.data:
#                     charge = pi.charges.data[0]
#                     stripe_charge_id = charge.id
#                     receipt_url = charge.receipt_url
#                     if charge.payment_method_details and charge.payment_method_details.card:
#                         card = charge.payment_method_details.card
#                         card_brand = card.brand
#                         card_last4 = card.last4
#             except Exception:
#                 pass

#         cursor.execute("""
#             INSERT INTO payments.stripe_transactions
#             (user_id, subscription_id, plan_key, stripe_payment_intent_id, stripe_charge_id,
#              amount_cents, currency, status, payment_method_type, card_brand, card_last4, receipt_url, paid_at, created_at, updated_at)
#             VALUES (%s, %s, %s, %s, %s, %s, %s, 'succeeded', 'card', %s, %s, %s, NOW(), NOW(), NOW())
#             ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
#                 status = 'succeeded',
#                 stripe_charge_id = EXCLUDED.stripe_charge_id,
#                 receipt_url = EXCLUDED.receipt_url,
#                 paid_at = NOW(),
#                 updated_at = NOW()
#             RETURNING id
#         """, (
#             int(user_id),
#             subscription_id,
#             plan_key,
#             payment_intent_id,
#             stripe_charge_id,
#             int(amount_cents),
#             currency,
#             card_brand,
#             card_last4,
#             receipt_url
#         ))

#         tx_id = cursor.fetchone()['id']
#         conn.commit()

#         return {
#             'success': True,
#             'session_id': session.id,
#             'transaction_id': tx_id,
#             'subscription_id': subscription_id,
#             'amount': amount_cents,
#             'currency': currency,
#             'plan_name': plan_key
#         }

#     except Exception as e:
#         print(f"Error recording checkout session: {e}")
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()

# # ============================================================================
# # 订阅取消
# # ============================================================================

# def cancel_user_subscription(user_id: int, cancel_at_period_end: bool = True) -> Dict:
#     """
#     取消用户订阅
    
#     Args:
#         user_id: 用户 ID
#         cancel_at_period_end: 是否在周期结束时取消
    
#     Returns:
#         dict: 取消结果
#     """
#     conn = None
#     cursor = None
#     try:
#         conn = _get_conn()
#         cursor = conn.cursor(cursor_factory=RealDictCursor)
        
#         # 查询用户当前订阅
#         cursor.execute("""
#             SELECT subscription_id, provider, provider_ref
#             FROM payments.subscriptions
#             WHERE user_id = %s AND status = 'active'
#             ORDER BY start_at DESC
#             LIMIT 1
#         """, (user_id,))
        
#         subscription = cursor.fetchone()
        
#         if not subscription:
#             return {'success': False, 'message': 'No active subscription found'}
        
#         if subscription['provider'] == 'stripe' and subscription['provider_ref']:
#             # 调用 Stripe API 取消订阅
#             stripe.Subscription.modify(
#                 subscription['provider_ref'],
#                 cancel_at_period_end=cancel_at_period_end
#             )
        
#         # 更新数据库
#         if cancel_at_period_end:
#             cursor.execute("""
#                 UPDATE payments.subscriptions
#                 SET auto_renew = FALSE, updated_at = NOW()
#                 WHERE subscription_id = %s
#             """, (subscription['subscription_id'],))
#         else:
#             cursor.execute("""
#                 UPDATE payments.subscriptions
#                 SET status = 'cancelled', updated_at = NOW()
#                 WHERE subscription_id = %s
#             """, (subscription['subscription_id'],))
        
#         conn.commit()
        
#         return {
#             'success': True,
#             'message': 'Subscription cancelled successfully',
#             'cancel_at_period_end': cancel_at_period_end
#         }
        
#     except Exception as e:
#         if conn:
#             conn.rollback()
#         print(f"Error cancelling subscription: {e}")
#         return {'success': False, 'message': str(e)}
#     finally:
#         if cursor:
#             cursor.close()
#         if conn:
#             conn.close()


"""
支付相关的数据库操作脚本
类似 user_auth.py 和 data_ingestion.py 的设计模式
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from dotenv import load_dotenv
from datetime import datetime, timedelta
from typing import Dict, Optional
try:
    import stripe
except Exception:  # pragma: no cover - allow app boot when stripe isn't installed
    stripe = None
from application.services.paypal_service import PaypalService

load_dotenv()

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

DEFAULT_COMMISSION_RATE = 0.30


def _get_conn():
    """Get database connection"""
    return get_db_connection()


# ============================================================================
# Influencer commission (CORRECT for your current DB schema: payments.*)
# ============================================================================

def record_paid_transaction_and_apply_commission(
    *,
    stripe_transaction_id: int,
    commission_rate: float = DEFAULT_COMMISSION_RATE,
) -> Dict:
    """
    Create ONE commission row per stripe transaction id (idempotent).
    Depends on payments.stripe_transactions.influencer_code being populated.
    """
    conn = None
    cur = None
    try:
        conn = _get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SET TIME ZONE 'UTC';")

        # 1) Load the transaction
        cur.execute("""
            SELECT id, user_id, influencer_code, amount_cents, status
            FROM payments.stripe_transactions
            WHERE id = %s
        """, (int(stripe_transaction_id),))
        tx = cur.fetchone()
        if not tx:
            conn.rollback()
            return {"success": False, "message": "stripe_transaction not found"}

        if tx["status"] != "succeeded":
            conn.commit()
            return {"success": True, "commission": None, "note": "Transaction not succeeded; no commission."}

        influencer_code = tx.get("influencer_code")
        if not influencer_code:
            conn.commit()
            return {"success": True, "commission": None, "note": "No influencer_code on transaction."}

        # 2) Validate code active
        cur.execute("""
            SELECT code, is_active
            FROM auth.influencer_codes
            WHERE LOWER(code) = LOWER(%s)
            LIMIT 1
        """, (influencer_code,))
        code_row = cur.fetchone()
        if not code_row or not code_row["is_active"]:
            conn.commit()
            return {"success": True, "commission": None, "note": "Influencer code inactive/invalid."}

        influencer_code = code_row["code"]  # canonical casing

        gross = int(tx["amount_cents"])
        commission_cents = int(round(gross * float(commission_rate)))

        # 3) Insert commission (idempotent by UNIQUE(stripe_transaction_id))
        cur.execute("""
            INSERT INTO payments.influencer_commissions
            (stripe_transaction_id, influencer_code, commission_rate, commission_base_cents, commission_cents, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, 'pending', NOW(), NOW())
            ON CONFLICT (stripe_transaction_id)
            DO UPDATE SET
              influencer_code = EXCLUDED.influencer_code,
              commission_rate = EXCLUDED.commission_rate,
              commission_base_cents = EXCLUDED.commission_base_cents,
              commission_cents = EXCLUDED.commission_cents,
              updated_at = NOW()
            RETURNING *
        """, (
            int(tx["id"]),
            influencer_code,
            float(commission_rate),
            gross,
            commission_cents,
        ))
        commission = cur.fetchone()

        conn.commit()
        return {"success": True, "commission": commission}

    except Exception as e:
        if conn:
            conn.rollback()
        return {"success": False, "message": str(e)}
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# ============================================================================
# Plans
# ============================================================================

def get_available_plans() -> Dict:
    """
       Get all available plans
    
    Returns:
        dict: Response containing plan list
    """
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT 
                plan_key,
                tier,
                billing_cycle,
                price_cents,
                currency,
                description,
                news_analysis_limit,
                social_analysis_limit,
                data_access,
                sentiment_analysis,
                api_access,
                priority_support
            FROM payments.plans
            WHERE is_active = TRUE
            ORDER BY 
                CASE tier
                    WHEN 'free' THEN 1
                    WHEN 'basic' THEN 2
                    WHEN 'premium' THEN 3
                    WHEN 'enterprise' THEN 4
                END,
                price_cents
        """)

        plans = cursor.fetchall()
        
         # Format response
        formatted_plans = []
        for plan in plans:
            formatted_plans.append({
                'plan_key': plan['plan_key'],
                'tier': plan['tier'],
                'billing_cycle': plan['billing_cycle'],
                'price_cents': plan['price_cents'],
                'currency': plan['currency'],
                'description': plan['description'],
                'features': {
                    'news_analysis_limit': plan['news_analysis_limit'],
                    'social_analysis_limit': plan['social_analysis_limit'],
                    'data_access': plan['data_access'],
                    'sentiment_analysis': plan['sentiment_analysis'],
                    'api_access': plan['api_access'],
                    'priority_support': plan['priority_support']
                }
            })

        return {
            'success': True,
            'count': len(formatted_plans),
            'plans': formatted_plans
        }

    except Exception as e:
        print(f"Error getting plans: {e}")
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================================
# Stripe Checkout
# ============================================================================

def create_stripe_checkout_session(
    user_id: int,
    plan_key: str,
    success_url: str,
    cancel_url: str,
    customer_email: Optional[str] = None,
    influencer_code: Optional[str] = None
) -> Dict:
    """
  Create Stripe Checkout session
    
    Args:
        user_id: User ID
        plan_key: Plan identifier
        success_url: Payment success URL
        cancel_url: Payment cancellation URL
        customer_email: Customer email
    
    Returns:
        dict: Response containing checkout_url
    """
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
       # 1. Query plan information
        cursor.execute("""
            SELECT plan_key, tier, price_cents, currency, billing_cycle
            FROM payments.plans
            WHERE plan_key = %s AND is_active = TRUE
        """, (plan_key,))

        plan = cursor.fetchone()
        if not plan:
            return {'success': False, 'message': f'Plan {plan_key} not found or inactive'}

        interval = None
        if plan['billing_cycle'] == 'monthly':
            interval = 'month'
        elif plan['billing_cycle'] == 'yearly':
            interval = 'year'

        price_data = {
            'currency': plan['currency'].lower(),
            'unit_amount': int(plan['price_cents']),
            'product_data': {'name': f"{plan['tier'].capitalize()} ({plan['billing_cycle']})"}
        }
        if plan['billing_cycle'] != 'none' and interval:
            price_data['recurring'] = {'interval': interval}

        line_item = {'price_data': price_data, 'quantity': 1}

        metadata = {
            'user_id': str(user_id),
            'plan_key': plan_key
        }
        if influencer_code:
            metadata['influencer_code'] = influencer_code

        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[line_item],
            mode='subscription' if plan['billing_cycle'] != 'none' else 'payment',
            success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=cancel_url,
            client_reference_id=str(user_id),
            customer_email=customer_email,
            metadata=metadata,
            allow_promotion_codes=True,
            billing_address_collection='auto'
        )

        return {
            'success': True,
            'session_id': session.id,
            'session_url': session.url,
            'expires_at': session.expires_at
        }

    except stripe.error.StripeError as e:
        print(f"Stripe error: {e}")
        return {'success': False, 'message': str(e)}
    except Exception as e:
        print(f"Error creating checkout session: {e}")
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def create_paypal_order(user_id: int, plan_key: str) -> Dict:
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
       # 1. Query plan information
        cursor.execute("""
            SELECT plan_key, price_cents, currency
            FROM payments.plans
            WHERE plan_key = %s AND is_active = TRUE
        """, (plan_key,))

        plan = cursor.fetchone()
        if not plan:
            return {'success': False, 'message': f'Plan {plan_key} not found'}
            
          # 2. Call PayPal Service to create order
        service = PaypalService()
        amount = f"{plan['price_cents'] / 100:.2f}"
        currency = plan['currency'].upper()

        order = service.create_order(amount, currency)
        
          # Get approval link
        approval_url = next((link['href'] for link in order['links'] if link['rel'] == 'approve'), None)

        return {'success': True, 'order_id': order['id'], 'approval_url': approval_url}

    except Exception as e:
        print(f"Error creating paypal order: {e}")
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def capture_paypal_order(order_id: str) -> Dict:
    """
     Capture PayPal order
    
    Args:
        order_id: PayPal order ID
    
    Returns:
        dict: Capture result
    """
    try:
        service = PaypalService()
        capture = service.capture_order(order_id)

        if capture['status'] == 'COMPLETED':
            return {'success': True, 'capture_id': capture['id'], 'status': capture['status'], 'payer': capture.get('payer', {})}
        return {'success': False, 'message': 'Payment not completed', 'details': capture}

    except Exception as e:
        print(f"Error capturing paypal order: {e}")
        return {'success': False, 'message': str(e)}


def get_checkout_session_details(session_id: str) -> Dict:
    """
     Get Checkout Session details
    
    Args:
        session_id: Stripe Session ID
    
    Returns:
        dict: Session details
    """
    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=['payment_intent', 'subscription'])
        return {
            'success': True,
            'session_id': session.id,
            'payment_status': session.payment_status,
            'customer_email': session.customer_details.email if session.customer_details else None,
            'amount_total': session.amount_total,
            'currency': session.currency
        }
    except stripe.error.StripeError as e:
        print(f"Error retrieving session: {e}")
        return {'success': False, 'message': str(e)}


# ============================================================================
# User Subscription Query
# ============================================================================

def get_user_active_subscription(user_id: int) -> Dict:
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT 
                s.subscription_id,
                s.plan_key,
                s.status,
                s.start_at,
                s.end_at,
                s.auto_renew,
                p.tier,
                p.billing_cycle,
                p.news_analysis_limit,
                p.social_analysis_limit,
                p.data_access,
                p.sentiment_analysis,
                p.api_access,
                p.priority_support
            FROM payments.subscriptions s
            JOIN payments.plans p ON s.plan_key = p.plan_key
            WHERE s.user_id = %s
            AND s.status = 'active'
            AND (s.end_at IS NULL OR s.end_at > NOW())
            ORDER BY s.start_at DESC
            LIMIT 1
        """, (user_id,))

        subscription = cursor.fetchone()
        if not subscription:
            return {
                'success': True,
                'has_subscription': False,
                'plan_tier': 'free',
                'message': 'No active subscription'
            }
        
        # Calculate remaining days
        days_remaining = None
        if subscription['end_at']:
            days_remaining = (subscription['end_at'] - datetime.now()).days

        return {
            'success': True,
            'has_subscription': True,
            'subscription_id': subscription['subscription_id'],
            'plan_key': subscription['plan_key'],
            'plan_tier': subscription['tier'],
            'billing_cycle': subscription['billing_cycle'],
            'status': subscription['status'],
            'start_at': subscription['start_at'].isoformat(),
            'end_at': subscription['end_at'].isoformat() if subscription['end_at'] else None,
            'days_remaining': days_remaining,
            'auto_renew': subscription['auto_renew'],
            'features': {
                'news_analysis_limit': subscription['news_analysis_limit'],
                'social_analysis_limit': subscription['social_analysis_limit'],
                'data_access': subscription['data_access'],
                'sentiment_analysis': subscription['sentiment_analysis'],
                'api_access': subscription['api_access'],
                'priority_support': subscription['priority_support']
            }
        }

    except Exception as e:
        print(f"Error getting user subscription: {e}")
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================================
# Transactions
# Transaction Record Query
# ============================================================================

def get_user_transactions(user_id: int, limit: int = 10, status: Optional[str] = None) -> Dict:
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        
        # Using new table payments.stripe_transactions
        query = """
            SELECT 
                id,
                user_id,
                plan_key,
                amount_cents,
                currency,
                status,
                payment_method_type,
                card_brand,
                card_last4,
                receipt_url,
                stripe_payment_intent_id,
                stripe_charge_id,
                paid_at,
                created_at,
                influencer_code
            FROM payments.stripe_transactions
            WHERE user_id = %s
        """
        params = [user_id]

        if status:
            query += " AND status = %s"
            params.append(status)

        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)

        cursor.execute(query, tuple(params))
        transactions = cursor.fetchall()
        
        # Format response
        formatted_transactions = []
        for tx in transactions:
            formatted_transactions.append({
                'transaction_id': tx['id'],  # New table primary key is id
                'user_id': tx['user_id'],
                'plan_key': tx['plan_key'],
                'amount_cents': tx['amount_cents'],
                'currency': tx['currency'],
                'status': tx['status'],
                'payment_method': tx.get('payment_method_type'),
                'card_brand': tx.get('card_brand'),
                'card_last4': tx.get('card_last4'),
                'receipt_url': tx.get('receipt_url'),
                'stripe_payment_intent_id': tx.get('stripe_payment_intent_id'),
                'paid_at': tx['paid_at'].isoformat() if tx['paid_at'] else None,
                'created_at': tx['created_at'].isoformat(),
                'influencer_code': tx.get('influencer_code'),
            })

        return {'success': True, 'count': len(formatted), 'transactions': formatted}

    except Exception as e:
        print(f"Error getting transactions: {e}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================================
# Webhook handling
# ============================================================================
# Subscription Limit Check
# ============================================================================

def check_user_subscription_limit(user_id: int, limit_type: str) -> Dict:
    """
    检查用户订阅功能限制
    
    Args:
        user_id: 用户 ID
        limit_type: 限制类型 (news_analysis 或 social_analysis)
    
    Returns:
        dict: 限制检查结果
    """
    subscription = get_user_active_subscription(user_id)
    
    if not subscription.get('has_subscription'):
        return {
            'success': True,
            'has_limit': False,
            'remaining': 0,
            'limit': 0,
            'message': 'No active subscription'
        }
    
    features = subscription.get('features', {})
    
    if limit_type == 'news_analysis':
        limit = features.get('news_analysis_limit', 0)
    elif limit_type == 'social_analysis':
        limit = features.get('social_analysis_limit', 0)
    else:
        return {'success': False, 'message': 'Invalid limit_type'}
    
    # -1 indicates unlimited
    if limit == -1:
        return {
            'success': True,
            'has_limit': True,
            'remaining': -1,
            'limit': -1,
            'message': 'Unlimited'
        }
    
   # TODO: Should query user's monthly usage count
    # Simplified handling here
    used_count = 0  # Should be queried from database
    remaining = max(0, limit - used_count)
    
    return {
        'success': True,
        'has_limit': remaining > 0,
        'remaining': remaining,
        'limit': limit,
        'used': used_count
    }


# ============================================================================
# Webhook Processing (Simplified Version)
# ============================================================================

def handle_stripe_webhook(payload: bytes, signature: str) -> Dict:
    conn = None
    cursor = None
    event = None
    try:
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
        # Verify signature
        event = stripe.Webhook.construct_event(
            payload, signature, STRIPE_WEBHOOK_SECRET
        )
        
        print(f"Received webhook event: {event['type']}")

        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            INSERT INTO payments.stripe_webhook_events
            (event_id, event_type, event_data, processed, created_at, received_at)
            VALUES (%s, %s, %s, FALSE, NOW(), NOW())
            ON CONFLICT (event_id) DO NOTHING
        """, (event['id'], event['type'], Json(event)))
        conn.commit()

        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            print(f"Checkout completed: {session['id']}")
            record_result = record_checkout_session(session['id'])

            if record_result.get('success'):
                cursor.execute("""
                    UPDATE payments.stripe_webhook_events
                    SET processed = TRUE, processed_at = NOW(), related_transaction_id = %s
                    WHERE event_id = %s
                """, (record_result.get('transaction_id'), event['id']))
            else:
                cursor.execute("""
                    UPDATE payments.stripe_webhook_events
                    SET processed = FALSE, error_message = %s
                    WHERE event_id = %s
                """, (record_result.get('message'), event['id']))
            conn.commit()

        return {'success': True, 'event_id': event['id']}

    except Exception as e:
        print(f"Webhook error: {e}")
        try:
            if conn and cursor and event:
                cursor.execute("""
                    UPDATE payments.stripe_webhook_events
                    SET processed = FALSE, error_message = %s
                    WHERE event_id = %s
                """, (str(e), event.get('id')))
                conn.commit()
        except Exception:
            pass
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def record_checkout_session(session_id: str) -> Dict:
    """
    Retrieve Stripe Checkout session and record transaction/subscription.
    ALSO: writes influencer_code into payments.stripe_transactions
    AND: auto-creates commission row for that transaction.
    """
    conn = None
    cursor = None
    try:
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=['payment_intent', 'subscription', 'customer_details']
        )

        user_id = session.client_reference_id or (session.metadata or {}).get('user_id')
        plan_key = (session.metadata or {}).get('plan_key')
        influencer_code = (session.metadata or {}).get('influencer_code')
        if not user_id or not plan_key:
            return {'success': False, 'message': 'Missing user_id or plan_key in session metadata'}

        if session.payment_status not in ['paid', 'no_payment_required']:
            return {'success': False, 'message': f"Payment not completed. Status: {session.payment_status}"}

        payment_intent_id = session.payment_intent.id if hasattr(session.payment_intent, 'id') else session.payment_intent
        amount_cents = session.amount_total or 0
        currency = (session.currency or 'usd').upper()

        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT duration_days
            FROM payments.plans
            WHERE plan_key = %s
        """, (plan_key,))
        plan = cursor.fetchone()

        subscription_id = None
        if session.subscription:
            stripe_sub_id = session.subscription.id if hasattr(session.subscription, 'id') else session.subscription
            start_at = datetime.now()
            end_at = None
            if plan and plan.get('duration_days'):
                end_at = start_at + timedelta(days=plan['duration_days'])

            cursor.execute("""
                INSERT INTO payments.subscriptions
                (user_id, plan_key, status, start_at, end_at, provider, provider_ref, auto_renew)
                VALUES (%s, %s, 'active', %s, %s, 'stripe', %s, FALSE)
                ON CONFLICT (user_id)
                WHERE (status = 'active')
                DO UPDATE SET
                    plan_key = EXCLUDED.plan_key,
                    status = EXCLUDED.status,
                    start_at = EXCLUDED.start_at,
                    end_at = EXCLUDED.end_at,
                    provider = EXCLUDED.provider,
                    provider_ref = EXCLUDED.provider_ref,
                    updated_at = NOW()
                RETURNING subscription_id
            """, (int(user_id), plan_key, start_at, end_at, stripe_sub_id))
            subscription_id = cursor.fetchone()['subscription_id']

        card_brand = None
        card_last4 = None
        receipt_url = None
        stripe_charge_id = None
        if payment_intent_id:
            try:
                pi = stripe.PaymentIntent.retrieve(payment_intent_id, expand=['charges'])
                if pi.charges and pi.charges.data:
                    charge = pi.charges.data[0]
                    stripe_charge_id = charge.id
                    receipt_url = charge.receipt_url
                    if charge.payment_method_details and charge.payment_method_details.card:
                        card = charge.payment_method_details.card
                        card_brand = card.brand
                        card_last4 = card.last4
            except Exception:
                pass

        # --------------------------------------------------------------------
        # FIX #1: write influencer_code into payments.stripe_transactions
        # Pull from auth.users to avoid relying on frontend payloads.
        # --------------------------------------------------------------------
        cursor.execute("""
            INSERT INTO payments.stripe_transactions
            (
              user_id, subscription_id, plan_key,
              stripe_payment_intent_id, stripe_charge_id,
              amount_cents, currency, status,
              payment_method_type, card_brand, card_last4, receipt_url,
              influencer_code,
              paid_at, created_at, updated_at
            )
            SELECT
              %s, %s, %s,
              %s, %s,
              %s, %s, 'succeeded',
              'card', %s, %s, %s,
              u.influencer_code,
              NOW(), NOW(), NOW()
            FROM auth.users u
            WHERE u.user_id = %s
            ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
                status = 'succeeded',
                stripe_charge_id = EXCLUDED.stripe_charge_id,
                receipt_url = EXCLUDED.receipt_url,
                influencer_code = EXCLUDED.influencer_code,
                paid_at = NOW(),
                updated_at = NOW()
            RETURNING id
        """, (
            int(user_id),
            subscription_id,
            plan_key,
            payment_intent_id,
            stripe_charge_id,
            int(amount_cents),
            currency,
            card_brand,
            card_last4,
            receipt_url,
            int(user_id),
        ))

        tx_id = cursor.fetchone()['id']
        conn.commit()

        # --------------------------------------------------------------------
        # FIX #2: auto-create commission (idempotent)
        # --------------------------------------------------------------------
        commission_res = record_paid_transaction_and_apply_commission(
            stripe_transaction_id=int(tx_id),
            commission_rate=DEFAULT_COMMISSION_RATE,
        )

        return {
            'success': True,
            'session_id': session.id,
            'transaction_id': tx_id,
            'subscription_id': subscription_id,
            'amount': amount_cents,
            'currency': currency,
            'plan_name': plan_key,
            'commission': commission_res.get('commission'),
        }

    except Exception as e:
        print(f"Error recording checkout session: {e}")
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================================
# Subscription Cancellation
# ============================================================================

def cancel_user_subscription(user_id: int, cancel_at_period_end: bool = True) -> Dict:
    """
      Cancel user subscription
    
    Args:
        user_id: User ID
        cancel_at_period_end: Whether to cancel at period end
    
    Returns:
        dict: Cancellation result
    """
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query user's current subscription
        cursor.execute("""
            SELECT subscription_id, provider, provider_ref
            FROM payments.subscriptions
            WHERE user_id = %s AND status = 'active'
            ORDER BY start_at DESC
            LIMIT 1
        """, (user_id,))
        subscription = cursor.fetchone()
        if not subscription:
            return {'success': False, 'message': 'No active subscription found'}

        if subscription['provider'] == 'stripe' and subscription['provider_ref']:
            # Call Stripe API to cancel subscription
            stripe.Subscription.modify(
                subscription['provider_ref'],
                cancel_at_period_end=cancel_at_period_end
            )
        
        # Update database
        if cancel_at_period_end:
            cursor.execute("""
                UPDATE payments.subscriptions
                SET auto_renew = FALSE, updated_at = NOW()
                WHERE subscription_id = %s
            """, (subscription['subscription_id'],))
        else:
            cursor.execute("""
                UPDATE payments.subscriptions
                SET status = 'cancelled', updated_at = NOW()
                WHERE subscription_id = %s
            """, (subscription['subscription_id'],))

        conn.commit()
        return {'success': True, 'message': 'Subscription cancelled successfully', 'cancel_at_period_end': cancel_at_period_end}

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error cancelling subscription: {e}")
        return {'success': False, 'message': str(e)}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
