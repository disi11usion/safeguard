import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, User, Sparkles } from 'lucide-react';

const AIChatOllama = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  // Function to get crypto data context
  const getCryptoContext = async () => {
    try {
      let context = '';
      
      // Add current date and time for context
      const now = new Date();
      const currentDateTime = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      context += `Current date and time: ${currentDateTime}\n\n`;
      
      // Fetch current prices from your API
      const pricesResponse = await fetch('http://localhost:8000/v1/prices/current?exchange=Binance');
      if (pricesResponse.ok) {
        const pricesData = await pricesResponse.json();
        
        // Format the prices data
        if (pricesData && pricesData.success && Array.isArray(pricesData.data)) {
          context += 'Current Binance crypto prices:\n';
          pricesData.data.slice(0, 5).forEach(coin => { // Show top 5 coins
            if (coin.symbol && coin.current_price) {
              const price = parseFloat(coin.current_price).toFixed(2);
              const change24h = coin.indicators?.price_change_24h || 0;
              const changeText = change24h >= 0 ? `(+${change24h.toFixed(2)}%)` : `(${change24h.toFixed(2)}%)`;
              context += `${coin.symbol}: $${price} ${changeText}\n`;
            }
          });
          context += '\n';
        }
      }
      
      // Fetch current news
      const newsResponse = await fetch('http://localhost:8000/v1/news/current');
      if (newsResponse.ok) {
        const newsData = await newsResponse.json();
        
        if (newsData && newsData.success && Array.isArray(newsData.data)) {
          context += 'Latest crypto news:\n';
          newsData.data.slice(0, 3).forEach(news => { // Show top 3 news
            if (news.title) {
              context += `• ${news.title}\n`;
            }
          });
          context += '\n';
        }
      }
      
      // Fetch current social data
      const socialResponse = await fetch('http://localhost:8000/v1/social/current');
      if (socialResponse.ok) {
        const socialData = await socialResponse.json();
        
        if (socialData && socialData.success && Array.isArray(socialData.data)) {
          context += 'Social media sentiment:\n';
          socialData.data.slice(0, 3).forEach(social => { // Show top 3 social posts
            if (social.content) {
              const content = social.content.length > 100 ? social.content.substring(0, 100) + '...' : social.content;
              context += `• ${content}\n`;
            }
          });
          context += '\n';
        }
      }
      
      return context;
    } catch (error) {
      console.log('Could not fetch crypto data:', error);
    }
    return '';
  };

  // Navigate to AI chat page
  const handleSendMessage = () => {
    const question = (inputMessage || '').trim();
    if (!question) return;
    
    try {
      window.sessionStorage.setItem('aichat_prefill', question);
      window.sessionStorage.setItem('aichat_should_auto', '1');
    } catch {}
    
    navigate(`/ai-chat?q=${encodeURIComponent(question)}`, { 
      state: { prefill: question, shouldAuto: true } 
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Suggested prompts
  const suggestedPrompts = [
    "Tell me something about BTC",
    "Analyze Bitcoin's recent performance",
    "Best investment strategies for beginners",
    "Explain crypto market indicators"
  ];

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-foreground">AI Assistant</h3>
          <span className="text-xs text-muted-foreground mt-0">Powered by advanced AI</span>
        </div>
        <Sparkles className="h-5 w-5 text-primary animate-pulse" />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-accent/5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 ring-4 ring-primary/5">
              <Bot className="h-10 w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-bold text-foreground">Welcome to AI Assistant</h4>
              <p className="text-sm text-muted-foreground max-w-md">
                Ask me anything about cryptocurrency markets, trading strategies, or financial analysis!
              </p>
            </div>

            {/* Suggested Prompts */}
            <div className="w-full max-w-md space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Try asking:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => setInputMessage(prompt)}
                    className="text-left px-4 py-3 text-sm bg-card border border-border rounded-lg hover:bg-accent hover:border-primary/50 transition-all duration-200 group"
                  >
                    <span className="text-foreground group-hover:text-primary transition-colors">
                      {prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-3 max-w-[85%] ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              <div className={`flex items-center justify-center h-8 w-8 rounded-full flex-shrink-0 ${
                message.sender === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-accent text-foreground'
              }`}>
                {message.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* Message Content */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {message.sender === 'user' ? 'You' : 'AI Assistant'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {message.timestamp}
                  </span>
                </div>
                <div className={`px-4 py-3 rounded-2xl ${
                  message.sender === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.text}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
        
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
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-background">
        <div className="flex gap-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about crypto markets, trading strategies, or any financial questions..."
            rows={3}
            className="h-16 flex-1 px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="flex items-center justify-center h-auto px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-primary/20"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
};

export default AIChatOllama; 