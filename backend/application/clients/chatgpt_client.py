import os
import aiohttp
from typing import Dict, Any, Optional, List
from pydantic import BaseModel


COMPLIANCE_SYSTEM_PROMPT = (
    "You are a risk-analysis assistant for the Safeguard portfolio platform. Your role is "
    "strictly descriptive and analytical. You MUST follow these rules in every response:\n"
    "1. Never provide buy, sell, hold, allocation, rebalancing, or any portfolio-adjustment "
    "recommendations.\n"
    "2. Only describe observed risk patterns, signal relationships, scenario impacts, and "
    "data-driven interpretations.\n"
    "3. Use neutral, analytical language. Avoid directive phrasing such as 'you should', "
    "'consider buying/selling', 'increase your allocation', 'shift from X to Y', 'add more of', "
    "or 'reduce your exposure to'.\n"
    "4. Do not imply any course of action or protective step the user should take. Describe "
    "scenario outcomes, not what to do about them.\n"
    "5. If the user asks for investment advice directly, reply that you only provide "
    "observational risk descriptions and refer them to the data and scenario outputs.\n"
    "You may describe: what risk signals indicate, how assets moved together historically, "
    "what a stress scenario implies for portfolio value, and which factor drives the largest "
    "modeled swings. You may not describe: what to buy/sell/hold, how to rebalance, or which "
    "allocation is 'better'."
)


def _prepend_system_prompt(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Prepend the compliance system prompt when the caller has not already supplied one.
    If a system message is already present, leave the messages untouched — the caller's
    intent takes precedence for internal prompts that already encode compliance rules.
    """
    if any((m.get("role") if isinstance(m, dict) else None) == "system" for m in messages):
        return list(messages)
    return [{"role": "system", "content": COMPLIANCE_SYSTEM_PROMPT}, *messages]


class ChatGPTRequest(BaseModel):
    query: str
    model: str = "gpt-3.5-turbo"
    max_tokens: Optional[int] = None
    temperature: float = 0.7
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "query": "Generate a research report on Bitcoin market trends and future predictions",
                    "model": "gpt-3.5-turbo",
                    "max_tokens": 2000,
                    "temperature": 0.7
                }
            ]
        }
    }


class ChatMessage(BaseModel):
    role: str = "user"  # Default to "user", can be "user", "assistant", or "system"
    content: str


class ChatMessagesRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-3.5-turbo"
    max_tokens: Optional[int] = None
    temperature: float = 0.7
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": "What is Apple's current stock price?"
                        }
                    ],
                    "model": "gpt-3.5-turbo",
                    "max_tokens": 1000,
                    "temperature": 0.7
                }
            ]
        }
    }


class ChatGPTClient:
    DEFAULT_BASE_URL = "https://api.openai.com/v1/"

    def __init__(self):
        self.api_key = os.getenv("CHATGPT_API_KEY")
        self.base_url = (os.getenv("CHATGPT_BASE_URL") or self.DEFAULT_BASE_URL).strip()
        
        if not self.api_key:
            # You might want to log a warning instead of raising error if you want the app to start without key 
            # raise ValueError("CHATGPT_API_KEY environment variable not set")
            print("Warning: CHATGPT_API_KEY environment variable not set")
        
        # Ensure base_url ends with /
        if not self.base_url.endswith('/'):
            self.base_url += '/'
    
    def _connection_error(self, e: Exception) -> Dict[str, Any]:
        """Helper to format connection errors."""
        return {
            "success": False,
            "error": f"Connection error: {str(e)}",
            "content": None
        }

    async def generate_report(
        self, 
        query: str, 
        model: str = "gpt-3.5-turbo",
        max_tokens: Optional[int] = None,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        try:
            messages = _prepend_system_prompt([
                {
                    "role": "user",
                    "content": query
                }
            ])

            # Prepare request parameters
            request_data = {
                "model": model,
                "messages": messages,
                "temperature": temperature
            }
            
            if max_tokens:
                request_data["max_tokens"] = max_tokens
            
            # Make API request using aiohttp
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.base_url}chat/completions"          
            timeout = aiohttp.ClientTimeout(total=45)        
            
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=request_data, headers=headers) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {
                            "success": False,
                            "error": f"API request failed with status {response.status}: {error_text}",
                            "content": None
                        }
                    
                    data = await response.json()
                    
                    # Extract response
                    if "choices" in data and len(data["choices"]) > 0:
                        response_content = data["choices"][0]["message"]["content"]
                        
                        return {
                            "success": True,
                            "content": response_content,
                            "model": model,
                            "usage": data.get("usage"),
                            "finish_reason": data["choices"][0].get("finish_reason")
                        }
                    else:
                        return {
                            "success": False,
                            "error": "No response from API",
                            "content": None
                        }

        except aiohttp.ClientConnectorError as e:
            return self._connection_error(e)
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "content": None
            }
    
    async def chat_with_context(
        self,
        messages: list,
        model: str = "gpt-3.5-turbo",
        max_tokens: Optional[int] = None,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        try:
            request_data = {
                "model": model,
                "messages": _prepend_system_prompt(messages),
                "temperature": temperature
            }

            if max_tokens:
                request_data["max_tokens"] = max_tokens

            # Make API request using aiohttp
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            url = f"{self.base_url}chat/completions"
            timeout = aiohttp.ClientTimeout(total=45)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=request_data, headers=headers) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {
                            "success": False,
                            "error": f"API request failed with status {response.status}: {error_text}",
                            "content": None
                        }
                    
                    data = await response.json()
                    
                    # Extract response
                    if "choices" in data and len(data["choices"]) > 0:
                        response_content = data["choices"][0]["message"]["content"]
                        
                        return {
                            "success": True,
                            "content": response_content,
                            "model": model,
                            "usage": data.get("usage"),
                            "finish_reason": data["choices"][0].get("finish_reason")
                        }
                    else:
                        return {
                            "success": False,
                            "error": "No response from API",
                            "content": None
                        }

        except aiohttp.ClientConnectorError as e:            
            return self._connection_error(e)     
        except Exception as e:          
            return {                
                "success": False,
                "error": str(e),
                "content": None
            }