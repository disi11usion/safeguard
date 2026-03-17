"""
Paypal 配置文件
"""
import os
from dotenv import load_dotenv

load_dotenv()

class PaypalConfig:
    """Paypal 配置类"""
    
    # Paypal API Credentials
    CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID')
    CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET')
    
    # 环境模式: sandbox 或 live
    MODE = os.getenv('PAYPAL_MODE', 'sandbox')
    
    @classmethod
    def validate_config(cls):
        """验证配置是否完整"""
        if not cls.CLIENT_ID:
            raise ValueError("PAYPAL_CLIENT_ID is not set")
        if not cls.CLIENT_SECRET:
            raise ValueError("PAYPAL_CLIENT_SECRET is not set")
