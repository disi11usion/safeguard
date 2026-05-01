import httpx
import json
from pathlib import Path
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

COMPLIANCE_SUGGESTION = (
    "Observation only: the correlation figures above describe how these "
    "assets have moved together. No buy, sell, or reallocation action is "
    "implied."
)


class DeepSeekClient:
    def __init__(self):
        self.base_url = "https://access.vheer.com/api/Vheer"
        self.timeout = 30
        self.mock_data_dir = Path(__file__).parent.parent.parent / "_lib"
    
    async def normalize_tickers(self, text: str) -> Dict[str, Any]:
        """
        Extract and normalize stock/crypto tickers from natural language text
        """
        try:
            url = f"{self.base_url}/TickerNormalizer"
            headers = {'Content-Type': 'application/json'}
            payload = {"text": text}
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            # Extract tickers from response
            tickers = []
            if data.get("code") == 200 and "data" in data:
                ticker_data = data["data"]
                if "tickers" in ticker_data and isinstance(ticker_data["tickers"], list):
                    for ticker_info in ticker_data["tickers"]:
                        if isinstance(ticker_info, dict) and "ticker" in ticker_info:
                            tickers.append(ticker_info["ticker"])
            
            return {
                "success": True,
                "text": text,
                "tickers": tickers,
                "count": len(tickers)
            }
            
        except httpx.HTTPStatusError as e:
            logger.error(f"TickerNormalizer API error: {e.response.status_code}")
            raise
        except httpx.TimeoutException:
            logger.error("TickerNormalizer API timeout")
            raise
        except Exception as e:
            logger.error(f"TickerNormalizer error: {str(e)}")
            raise
    
    async def generate_correlation_summary(
        self, 
        correlation_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        # Try to call DeepSeek API
        try:
            return await self._call_correlation_api(correlation_data)
        except httpx.HTTPStatusError as e:
            logger.warning(
                f"DeepSeek API HTTP error: {e.response.status_code}, "
                f"falling back to mock data"
            )
        except httpx.TimeoutException:
            logger.warning("DeepSeek API timeout, falling back to mock data")
        except Exception as e:
            logger.warning(f"DeepSeek API error: {str(e)}, falling back to mock data")
        
        # Fallback to mock data
        return await self._load_mock_correlation_summary()
    
    async def _call_correlation_api(
        self, 
        correlation_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Call the actual DeepSeek CorrelationSummary API
        """
        url = f"{self.base_url}/CorrelationSummary"
        headers = {'Content-Type': 'application/json'}
        payload = {"text": correlation_data}
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        
        # Extract analysis from response
        result = {
            "success": True,
            "title": "",
            "summary": "",
            "suggestion": ""
        }
        
        if data.get("code") == 200 and "data" in data:
            analysis_data = data["data"]
            result["title"] = analysis_data.get("title", "Correlation Analysis")
            result["summary"] = analysis_data.get("summary", "")
            # Compliance override: never pass through upstream advisory phrasing.
            # Client-approved option (b), Burak 2026-04-23.
            result["suggestion"] = COMPLIANCE_SUGGESTION
        
        logger.info("Successfully generated correlation summary from DeepSeek API")
        return result
    
    async def _load_mock_correlation_summary(self) -> Dict[str, Any]:
        """
        Load correlation summary from mock data file
        """
        try:
            mock_file = self.mock_data_dir / "mock_correlation_summary.json"
            logger.info(f"Loading mock correlation summary from: {mock_file}")
            
            with open(mock_file, 'r', encoding='utf-8') as f:
                mock_data = json.load(f)
            
            result = {
                "success": True,
                "title": mock_data.get("title", "Correlation Analysis"),
                "summary": mock_data.get("summary", ""),
                # Compliance override: keep parity with the remote path.
                "suggestion": COMPLIANCE_SUGGESTION,
                "source": "mock_data"
            }
            
            logger.info("Successfully loaded mock correlation summary")
            return result
            
        except FileNotFoundError:
            logger.error(f"Mock data file not found: {mock_file}")
            raise Exception("Mock correlation summary file not found")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in mock data file: {e}")
            raise Exception("Invalid mock correlation summary data")
        except Exception as e:
            logger.error(f"Failed to load mock correlation summary: {e}")
            raise
