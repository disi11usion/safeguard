import logging
import json
from typing import Dict, Any


def setup_logging():
    """Configure logging for the application"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('api_logs.log'),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger(__name__)


def get_logger(name: str):
    """Get a logger instance for a specific module"""
    return logging.getLogger(name)


def log_request(logger: logging.Logger, endpoint: str, params: Dict[str, Any]):
    """Log API request parameters"""
    logger.info(f"📥 REQUEST - {endpoint}")
    logger.info(f"Parameters: {json.dumps(params, indent=2, default=str)}")


def log_response(logger: logging.Logger, endpoint: str, response: Any, success: bool = True):
    """Log API response"""
    status = "SUCCESS" if success else "ERROR"
    logger.info(f"RESPONSE - {endpoint} - {status}")
    
    # Log response summary (not full data to avoid huge logs)
    if isinstance(response, dict):
        summary = {
            "success": response.get("success", success),
            "data_size": len(str(response)),
        }
        # Add specific fields based on response type
        if "count" in response:
            summary["count"] = response["count"]
        if "symbols" in response:
            summary["symbols"] = response["symbols"]
        if "error" in response:
            summary["error"] = response["error"]
        logger.info(f"Response Summary: {json.dumps(summary, indent=2)}")
    else:
        logger.info(f"Response Type: {type(response).__name__}")


def log_error(logger: logging.Logger, endpoint: str, error: Exception):
    """Log API error"""
    logger.error(f"ERROR - {endpoint}")
    logger.error(f"Error Type: {type(error).__name__}")
    logger.error(f"Error Message: {str(error)}")
    logger.exception("Full traceback:")