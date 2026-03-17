import requests
import base64
from infrastructure.config.paypal_config import PaypalConfig

class PaypalService:
    def __init__(self):
        self.client_id = PaypalConfig.CLIENT_ID
        self.client_secret = PaypalConfig.CLIENT_SECRET
        self.base_url = "https://api-m.sandbox.paypal.com" if PaypalConfig.MODE == "sandbox" else "https://api-m.paypal.com"

    def _get_access_token(self):
        """获取 PayPal Access Token"""
        url = f"{self.base_url}/v1/oauth2/token"
        headers = {
            "Accept": "application/json",
            "Accept-Language": "en_US"
        }
        data = {
            "grant_type": "client_credentials"
        }
        
        try:
            response = requests.post(
                url, 
                auth=(self.client_id, self.client_secret), 
                headers=headers, 
                data=data
            )
            response.raise_for_status()
            return response.json()["access_token"]
        except Exception as e:
            print(f"Failed to get PayPal access token: {str(e)}")
            raise e

    def create_order(self, amount: str, currency: str = "USD"):
        """创建 PayPal 订单"""
        access_token = self._get_access_token()
        url = f"{self.base_url}/v2/checkout/orders"
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        
        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "amount": {
                        "currency_code": currency,
                        "value": amount
                    }
                }
            ]
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Failed to create PayPal order: {str(e)}")
            raise e

    def capture_order(self, order_id: str):
        """捕获/完成 PayPal 订单"""
        access_token = self._get_access_token()
        url = f"{self.base_url}/v2/checkout/orders/{order_id}/capture"
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        
        try:
            response = requests.post(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Failed to capture PayPal order: {str(e)}")
            raise e
