import os
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import aiohttp
import base64
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class RedditAPIClient:
    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        user_agent: Optional[str] = None,
    ):
        load_dotenv()
        self.client_id = client_id or os.getenv("REDDIT_CLIENT_ID", "VY8wXNrHOp2r2vZg6-u2Lw")
        self.client_secret = client_secret or os.getenv("REDDIT_CLIENT_SECRET", "qe-L92Ytu3Ljw2iNQaI5GOhHgyTFnA")
        self.user_agent = user_agent or os.getenv("REDDIT_USER_AGENT", "9900web by u/Final_Big2764")

        if not self.client_id or not self.client_secret:
            raise ValueError("Reddit API credentials are required.")

        self.base_url = "https://www.reddit.com"
        self.oauth_url = "https://oauth.reddit.com"
        self.access_token: Optional[str] = None
        self.token_expires: Optional[datetime] = None

        print(f"Reddit API client initialized with Client ID: {self.client_id[:8]}...")

    async def _get_access_token(self) -> str:
        if self.access_token and self.token_expires and datetime.now() < self.token_expires:
            return self.access_token

        # client_credentials
        auth_b64 = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode("ascii")).decode("ascii")
        headers = {
            "User-Agent": self.user_agent,
            "Authorization": f"Basic {auth_b64}",
        }
        data = {"grant_type": "client_credentials", "scope": "read"}

        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.base_url}/api/v1/access_token", headers=headers, data=data) as resp:
                print(f"Authentication response status: {resp.status}")
                token_data = await resp.json()
                if resp.status != 200 or "access_token" not in token_data:
                    raise Exception(f"Failed to get access token: HTTP {resp.status}, {token_data}")

                self.access_token = token_data["access_token"]
                expires_in = token_data.get("expires_in", 3600)
                self.token_expires = datetime.now() + timedelta(seconds=expires_in - 300)
                print("Successfully obtained access token")
                return self.access_token

    async def _make_authenticated_request(self, endpoint: str, params: Dict = None) -> Dict[str, Any]:
        try:
            access_token = await self._get_access_token()
        except Exception as e:
            return {"error": f"auth_failed: {e}", "message": "Request failed"}

        headers = {
            "User-Agent": self.user_agent,
            "Authorization": f"Bearer {access_token}",
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.oauth_url}/{endpoint}", headers=headers, params=params or {}) as response:
                print(f"API request to {endpoint}: HTTP {response.status}")
                if response.status == 200:
                    return await response.json()
                text = await response.text()
                print(f"API request failed: HTTP {response.status}, {text}")
                return {"error": f"HTTP {response.status}", "message": text}

    # -------------------- Posts of a subreddit --------------------
    async def get_subreddit_posts(
        self,
        subreddit: str,
        sort: str = "hot",
        limit: int = 25,
        timeframe: str = "day",
    ) -> Dict[str, Any]:
        """
        Fetch posts from a subreddit.
        sort: hot/new/top/rising, timeframe used when sort=top (hour/day/week/month/year/all)
        """
        print(f"Fetching {limit} {sort} posts from r/{subreddit}...")
        endpoint = f"r/{subreddit}/{sort}"
        params = {"limit": limit, "t": timeframe}

        data = await self._make_authenticated_request(endpoint, params)
        if "error" in data:
            return {"success": False, "error": data["error"], "message": data.get("message", "Unknown error"), "posts": []}

        posts: List[Dict[str, Any]] = []
        if isinstance(data, dict) and data.get("data", {}).get("children"):
            for child in data["data"]["children"]:
                p = child.get("data", {})
                posts.append(
                    {
                        "id": p.get("id"),
                        "title": p.get("title"),
                        "content": p.get("selftext", ""),
                        "author": p.get("author"),
                        "subreddit": p.get("subreddit"),
                        "created_utc": p.get("created_utc"),
                        "score": p.get("score", 0),
                        "upvote_ratio": p.get("upvote_ratio", 0),
                        "num_comments": p.get("num_comments", 0),
                        "url": p.get("url"),
                        "permalink": f"https://reddit.com{p.get('permalink')}" if p.get("permalink") else None,
                        "is_self": p.get("is_self", False),
                        "over_18": p.get("over_18", False),
                        "spoiler": p.get("spoiler", False),
                        "stickied": p.get("stickied", False),
                    }
                )

        print(f"Successfully fetched {len(posts)} posts from r/{subreddit}")
        first_permalink = posts[0]["permalink"] if posts and posts[0].get("permalink") else None
        return {
            "success": True,
            "function": "GET_SUBREDDIT_POSTS",
            "subreddit": subreddit,
            "sort": sort,
            "timeframe": timeframe,
            "count": len(posts),
            "first_permalink": first_permalink,
            "posts": posts,
        }

    # -------------------- Comments of a post --------------------
    async def get_post_comments(
        self,
        subreddit: str,
        post_id: str,
        limit: int = 100,
        depth: int = 1,
        sort: str = "top",
    ) -> Dict[str, Any]:
        print(f"Fetching comments for post {post_id} from r/{subreddit}...")
        endpoint = f"r/{subreddit}/comments/{post_id}"
        params = {"limit": limit, "depth": depth, "sort": sort, "threaded": "true"}

        data = await self._make_authenticated_request(endpoint, params)
        if "error" in data:
            return {"success": False, "error": data["error"], "message": data.get("message", "Unknown error"), "comments": []}

        comments: List[Dict[str, Any]] = []

        def parse_comment(node: Dict[str, Any], level: int = 0) -> Optional[Dict[str, Any]]:
            if node.get("kind") != "t1":
                return None
            c = node.get("data", {})
            item = {
                "id": c.get("id"),
                "author": c.get("author", "[deleted]"),
                "body": c.get("body", ""),
                "score": c.get("score", 0),
                "created_utc": c.get("created_utc"),
                "permalink": c.get("permalink"),
                "depth": level,
                "replies": [],
            }
            replies = c.get("replies")
            if isinstance(replies, dict) and replies.get("data", {}).get("children"):
                for r in replies["data"]["children"]:
                    parsed = parse_comment(r, level + 1)
                    if parsed:
                        item["replies"].append(parsed)
            return item

    
        if isinstance(data, list) and len(data) > 1:
            for child in data[1].get("data", {}).get("children", []):
                parsed = parse_comment(child, 0)
                if parsed:
                    comments.append(parsed)

        print(f"Successfully fetched {len(comments)} comments for post {post_id}")
        return {
            "success": True,
            "function": "GET_POST_COMMENTS",
            "subreddit": subreddit,
            "post_id": post_id,
            "sort": sort,
            "count": len(comments),
            "comments": comments,
        }

    # -------------------- Search posts --------------------
    async def search_posts(
        self,
        query: str,
        subreddit: str = "all",
        sort: str = "relevance",
        limit: int = 25,
        timeframe: str = "all",
        search_type: str = "link",
    ) -> Dict[str, Any]:
        print(f"Searching for '{query}' in r/{subreddit}...")
        endpoint = "search"
        params = {"q": query, "subreddit": subreddit, "sort": sort, "limit": limit, "t": timeframe, "type": search_type}

        data = await self._make_authenticated_request(endpoint, params)
        if "error" in data:
            return {"success": False, "error": data["error"], "message": data.get("message", "Unknown error"), "posts": []}

        posts: List[Dict[str, Any]] = []
        if isinstance(data, dict) and data.get("data", {}).get("children"):
            for child in data["data"]["children"]:
                p = child.get("data", {})
                posts.append(
                    {
                        "id": p.get("id"),
                        "title": p.get("title"),
                        "content": p.get("selftext", ""),
                        "author": p.get("author"),
                        "subreddit": p.get("subreddit"),
                        "created_utc": p.get("created_utc"),
                        "score": p.get("score", 0),
                        "num_comments": p.get("num_comments", 0),
                        "url": p.get("url"),
                        "permalink": f"https://reddit.com{p.get('permalink')}" if p.get("permalink") else None,
                        "is_self": p.get("is_self", False),
                        "over_18": p.get("over_18", False),
                    }
                )

        print(f"Search found {len(posts)} posts for '{query}' in r/{subreddit}")
        first_permalink = posts[0]["permalink"] if posts and posts[0].get("permalink") else None
        return {
            "success": True,
            "function": "SEARCH_POSTS",
            "query": query,
            "subreddit": subreddit,
            "sort": sort,
            "timeframe": timeframe,
            "count": len(posts),
            "first_permalink": first_permalink,
            "posts": posts,
        }

    # -------------------- Popular subreddits --------------------
    async def get_popular_subreddits(self, limit: int = 25) -> Dict[str, Any]:
        print(f"Fetching {limit} popular subreddits...")
        endpoint = "subreddits/popular"
        params = {"limit": limit}

        data = await self._make_authenticated_request(endpoint, params)
        if "error" in data:
            return {"success": False, "error": data["error"], "message": data.get("message", "Unknown error"), "subreddits": []}

        subreddits: List[Dict[str, Any]] = []
        if isinstance(data, dict) and data.get("data", {}).get("children"):
            for child in data["data"]["children"]:
                s = child.get("data", {})
                subreddits.append(
                    {
                        "display_name": s.get("display_name"),
                        "title": s.get("title"),
                        "description": s.get("public_description", ""),
                        "subscribers": s.get("subscribers", 0),
                        "created_utc": s.get("created_utc"),
                        "over18": s.get("over18", False),
                        "url": f"https://reddit.com/r/{s.get('display_name')}" if s.get("display_name") else None,
                    }
                )

        print(f"Successfully fetched {len(subreddits)} popular subreddits")
        return {
            "success": True,
            "function": "GET_POPULAR_SUBREDDITS",
            "count": len(subreddits),
            "subreddits": subreddits,
        }

    # -------------------- (optional) Multi-fetch helper --------------------
    async def get_multiple_posts(
        self,
        subreddits: Optional[List[str]] = None,
        keywords: Optional[List[str]] = None,
        posts_per_subreddit: int = 10,
        comments_per_post: int = 20,
    ) -> Dict[str, Any]:
        subreddits = subreddits or [
            "CryptoCurrency", "bitcoin", "ethereum", "CryptoMarkets", "CryptoCurrencyTrading", "BitcoinMarkets",
            "solana", "CryptoMoonShots", "CryptoTechnology", "Stock", "Gold", "Forex", "ETH", "BTC",
        ]
        keywords = keywords or [
            "Bitcoin", "Ethereum", "Solana", "crypto market", "crypto", "BTC", "ETH", "SOL",
            "Market", "Trading", "Investment", "Price", "Forex", "Gold", "AAPL", "stock","2z","A","XRP","USDC",
        ]

        print(f"Fetching multiple posts from {len(subreddits)} subreddits...")
        all_posts_data = []

        for sub in subreddits:
            for kw in keywords:
                search_result = await self.search_posts(query=kw, subreddit=sub, limit=posts_per_subreddit, sort="new")
                if not search_result.get("success"):
                    continue
                for post in search_result.get("posts", []):
                    all_posts_data.append(post)

        return {"success": True, "function": "GET_MULTIPLE_POSTS", "count": len(all_posts_data), "posts": all_posts_data}
