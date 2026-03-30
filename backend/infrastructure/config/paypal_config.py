"""
PayPal configuration file
"""
import os
from dotenv import load_dotenv

load_dotenv()

class PaypalConfig:
    """PayPal API configuration."""
    
    # Paypal API Credentials
    CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID')
    CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET')
    
    # Environment mode: sandbox or live
    MODE = os.getenv('PAYPAL_MODE', 'sandbox')
    
    @classmethod
    def validate_config(cls):
        """Validate that all required credentials are configured."""
        if not cls.CLIENT_ID:
            raise ValueError("PAYPAL_CLIENT_ID is not set")
        if not cls.CLIENT_SECRET:
            raise ValueError("PAYPAL_CLIENT_SECRET is not set")
