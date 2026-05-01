import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, User, AlertCircle, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import DashboardTradeChartSingle from '../components/DashboardTradeChartSingle';
import { apiService } from '../services/api';

const AIChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const location = useLocation();
  const hasConsumedDraftRef = useRef(false);
  const messagesEndRef = useRef(null);

  // Helper function to transform API data to chart format
  const transformToChartData = useCallback((item) => {
    return {
      date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: item.timestamp,
      price: item.close,
      open: item.open,
      high: item.high,
      low: item.low,
      volume: item.volume
    };
  }, []);

  // Helper function to get date range (default 1 month)
  const getDateRange = useCallback(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 1);

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  }, []);

  // Fetch ticker data for a single ticker
  const fetchTickerData = useCallback(async (symbol, market = 'crypto') => {
    try {
      const { start, end } = getDateRange();
      const response = await apiService.makeRequest(
        `/historical/ticker?ticker=${symbol}&start_date=${start}&end_date=${end}&market=${market}`,
        { method: 'GET' },
        '/api'
      );

      if (!response.success) {
        console.error(`Failed to fetch data for ${symbol}`);
        return null;
      }

      return {
        symbol,
        data: response.data.map(item => transformToChartData(item))
      };
    } catch (err) {
      console.error(`Error fetching ticker data for ${symbol}:`, err);
      return null;
    }
  }, [getDateRange, transformToChartData]);

  // Format price for display
  const formatPrice = useCallback((value) => {
    return `$${value.toFixed(2)}`;
  }, []);

  // Format volume for display
  const formatVolume = useCallback((value) => {
    if (value >= 1e9) {
      return `${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
      return `${(value / 1e6).toFixed(2)}M`;
    }
    return value.toLocaleString();
  }, []);

  const sendMessage = async (textArg) => {
    const text = (typeof textArg === 'string' ? textArg : inputMessage).trim();
    if (!text) return;

    const userMessage = {
      id: Date.now(),
      text,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const symbolResponse = await apiService.getSearchSymbols(text);
      
      // Check if count > 0 (has financial symbols)
      const hasFinancialSymbols = symbolResponse.success && symbolResponse.count > 0;
      
      let tickerDataList = [];
      if (hasFinancialSymbols && symbolResponse.tickers && symbolResponse.tickers.length > 0) {
        // Extract symbols from tickers (e.g., "BTC-USD" -> "BTC")
        const symbols = symbolResponse.tickers.map(t => t.split('-')[0].toUpperCase());
        
        const fetchPromises = symbols.map(symbol => fetchTickerData(symbol, 'crypto'));
        const results = await Promise.all(fetchPromises);
        tickerDataList = results.filter(result => result !== null && result.data.length > 0);
        if (tickerDataList.length > 0) {
          const chartMessage = {
            id: `${Date.now()}-charts`,
            sender: 'ai',
            type: 'charts',
            tickerDataList: tickerDataList,
            timestamp: new Date().toLocaleTimeString()
          };
          setMessages(prev => [...prev, chartMessage]);
        }
      }

      // Build context from fetched ticker data
      let cryptoContext = '';
      if (tickerDataList.length > 0) {
        const now = new Date();
        const currentDateTime = now.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        });
        cryptoContext += `Current date and time: ${currentDateTime}\n\n`;
        cryptoContext += 'Ticker data analysis:\n';
        
        tickerDataList.forEach(({ symbol, data }) => {
          if (data.length > 0) {
            const latestData = data[data.length - 1];
            const oldestData = data[0];
            const priceChange = latestData.price - oldestData.price;
            const priceChangePercent = ((priceChange / oldestData.price) * 100).toFixed(2);
            
            cryptoContext += `${symbol}: Current price $${latestData.price.toFixed(2)}, `;
            cryptoContext += `Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)} (${priceChangePercent}%) over the last month\n`;
          }
        });
        cryptoContext += '\n';
      }
      
      const enhancedPrompt = cryptoContext
        ? `${cryptoContext}\n\nUser question: ${userMessage.text}`
        : userMessage.text;

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'tinyllama',
          prompt: enhancedPrompt,
          system: "You are a risk-analysis assistant for the Safeguard portfolio platform. Your role is strictly descriptive and analytical. Always respond in the same language the user uses. When context data is provided (current prices, news headlines, social sentiment), treat it as real-time and reason from it; use the current date and time provided in the context when discussing what is happening 'now' or 'recently'. You MUST follow these rules in every response: (1) Never provide buy, sell, hold, allocation, rebalancing, or any portfolio-adjustment recommendations. (2) Only describe observed risk patterns, signal relationships, historical correlations, scenario impacts, and data-driven interpretations. (3) Use neutral, analytical language; avoid directive phrasing such as 'you should', 'consider buying/selling', 'increase your allocation', 'shift from X to Y', 'add more of', or 'reduce your exposure to'. (4) Do not imply any course of action the user should take — describe scenario outcomes, not what to do about them. (5) Do not fabricate specific numbers; if data is missing, reason from general principles and clearly state your assumptions. For financial topics, you may cover: price and trend description, market structure, correlation and concentration analysis, news impact interpretation, scenario impacts on portfolios, and risk signal explanations. You may not cover: what to buy, sell, or hold, or how to adjust positions. If the user asks for investment advice directly, reply that you only provide observational risk descriptions and refer them to the data or scenario outputs. For questions unrelated to financial markets, answer normally.",
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 500
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (data?.response) {
        const aiMessage = {
          id: Date.now() + 1,
          text: data.response,
          sender: 'ai',
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error('No response from AI');
      }
    } catch (error) {
      let errorText = error.message;
      if (error.message.includes('Failed to fetch')) {
        errorText = 'Cannot connect to Ollama. Please make sure Ollama is running on your machine.';
      }
      const errorMessage = {
        id: Date.now() + 1,
        text: `Error: ${errorText}`,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize with prefilled question from navigation
  useEffect(() => {
    if (hasConsumedDraftRef.current) return;

    const stateDraft = (location?.state?.draft ?? location?.state?.prefill ?? '').toString();
    const stateShould = Boolean(
      typeof location?.state?.shouldAuto !== 'undefined'
        ? location.state.shouldAuto
        : (stateDraft.trim().length > 0)
    );

    let urlQ = '';
    try {
      const sp = new URLSearchParams(window.location.search);
      urlQ = sp.get('q') || '';
    } catch { }

    let ssQ = '';
    let ssAuto = false;
    try {
      ssQ = window.sessionStorage.getItem('aichat_prefill') || '';
      ssAuto = window.sessionStorage.getItem('aichat_should_auto') === '1';
    } catch { }

    const prefill = (stateDraft || urlQ || ssQ).toString();
    const shouldAuto = stateDraft
      ? stateShould
      : (urlQ ? (urlQ.trim().length > 0) : ssAuto);

    if (prefill) {
      try {
        window.sessionStorage.removeItem('aichat_prefill');
        window.sessionStorage.removeItem('aichat_should_auto');
      } catch { }
    }

    hasConsumedDraftRef.current = true;

    if (prefill) setInputMessage(prefill);
    if (shouldAuto && prefill.trim()) {
      setInputMessage('');
      sendMessage(prefill);
    }
  }, [location]);

  // Handle Enter key to send message
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const current = (inputMessage || '').trim();
      if (!current) return;
      setInputMessage('');
      sendMessage(current);
    }
  };

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  return (
    <div className="flex w-full flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="w-full mx-auto px-6 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="max-w-7xl w-full mx-auto flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">AI Assistant</h1>
            <span className="text-xs text-muted-foreground">Powered by Ollama TinyLlama</span>
          </div>
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
        </div>
      </div>

      {/* Messages Container */}
      <div className="w-full mx-auto flex-1 overflow-y-auto px-4 py-6 space-y-4 scroll-smooth">
        <div className='max-w-7xl mx-auto'>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 ring-4 ring-primary/5">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Welcome to AI Assistant</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ask me anything about cryptocurrency markets, trading strategies, or financial analysis!
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`${message.sender === 'user' ? 'flex gap-3 justify-end' : 'w-full mx-auto'}`}
            >
              <div className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                {message.type !== 'charts' && (
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full flex-shrink-0 ${message.sender === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-foreground'
                    }`}>
                    {message.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                )}

                {/* Message Content */}
                {message.type === 'charts' ? (
                  <div className="w-full mb-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent text-foreground flex-shrink-0">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">AI Assistant</span>
                        <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {message.tickerDataList && message.tickerDataList.map((tickerData, index) => (
                        <div key={`${tickerData.symbol}-${index}`}>
                          <h3 className="text-sm font-semibold text-foreground mb-2 ml-2">
                            {tickerData.symbol} - Price & Volume
                          </h3>
                          <DashboardTradeChartSingle
                            tickerData={tickerData.data}
                            height={300}
                            formatPrice={formatPrice}
                            formatVolume={formatVolume}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 min-w-0 max-w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {message.sender === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {message.timestamp}
                      </span>
                    </div>
                    <div className={`px-4 py-3 rounded-2xl break-words ${message.isError
                      ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                      : message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-foreground'
                      }`}>
                      {message.isError && (
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span className="text-xs font-semibold">Error</span>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.text}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading State */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent text-foreground flex-shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-foreground">AI Assistant</span>
                <div className="px-4 py-3 bg-card border border-border rounded-2xl">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="flex gap-2 max-w-7xl mx-auto">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about crypto markets, trading strategies, or any financial questions..."
            rows={3}
            className="flex-1 px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none h-16"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputMessage.trim() || isLoading}
            className="flex items-center justify-center h-auto px-6 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 disabled:hover:shadow-none"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
};

export default AIChatPage;