import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Calendar from 'react-calendar';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import './Calendar.css'; 
import { Newspaper, MessageSquare, ChevronDown, Check, Loader2, ExternalLink, Clock, ChevronUp } from 'lucide-react';

const EventDetailsCard = ({ event, isRelated }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { type, headline, title, source, date, url, content, score, num_comments, author } = event;
    const isNews = type === 'news';

    const getRelativeTime = (isoDate) => {
        if (!isoDate) return '';
        const now = new Date();
        const postDate = new Date(isoDate);
        const diffMs = now - postDate;
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        return `${diffDay}d ago`;
    };

    const getFirstWords = (text, wordCount = 20) => {
        if (!text) return '';
        const words = text.split(' ');
        if (words.length <= wordCount) return text;
        return words.slice(0, wordCount).join(' ') + '...';
    };
    
    const wordCount = content?.split(' ').length || 0;
    const shouldTruncate = wordCount > 20;

    return (
        <div className="p-4 mb-3 border rounded-lg border-border bg-card hover:bg-accent/50 transition-colors">
            <div className="flex flex-wrap items-start gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isNews ? 
                        <Newspaper className="h-4 w-4 text-teal-400 flex-shrink-0" /> : 
                        <MessageSquare className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    }
                    <span className="text-sm font-semibold text-primary truncate" title={source}>
                        {source}
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {getRelativeTime(date)}
                    </span>
                    {isRelated && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-green-500/20 text-green-500">
                            Relevant
                        </span>
                    )}
                </div>
            </div>
            {!isNews && (score !== undefined || num_comments !== undefined) && (
                <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
                    {score !== undefined && <span>↑ {score}</span>}
                    {num_comments !== undefined && <span>{num_comments} comments</span>}
                    {author && <span>by u/{author}</span>}
                </div>
            )}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-base font-medium text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                {headline || title}
                <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {content && (
                <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {isExpanded || !shouldTruncate
                        ? content
                        : getFirstWords(content, 20)}
                    
                    {shouldTruncate && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="inline-flex items-center gap-1 ml-2 text-primary hover:text-primary/80 font-medium transition-colors text-xs"
                        >
                            {isExpanded ? "Show less" : "Read more"}
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const FilterDropdown = ({ filters, setFilters }) => {
    const [isOpen, setIsOpen] = useState(false);
    const toggleOption = (option) => setFilters(prev => ({ ...prev, [option]: !prev[option] }));
  
    return (
      <div className="relative">
        <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border bg-card hover:bg-accent">
          <span>Filter Events</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-md shadow-lg z-10">
            <div onClick={() => toggleOption('news')} className="flex items-center justify-between px-4 py-2 text-sm cursor-pointer hover:bg-accent">
              <span>News</span>
              {filters.news && <Check className="h-4 w-4 text-primary" />}
            </div>
            <div onClick={() => toggleOption('social')} className="flex items-center justify-between px-4 py-2 text-sm cursor-pointer hover:bg-accent">
              <span>Social</span>
              {filters.social && <Check className="h-4 w-4 text-primary" />}
            </div>
          </div>
        )}
      </div>
    );
};

const getLocalDateString = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function CalendarPage() {
    const { user } = useAuth();
    const [preferenceAssets, setPreferenceAssets] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [filters, setFilters] = useState({ news: true, social: true });
    
    useEffect(() => { 
        if (user?.username) { 
            apiService.getUserPreferenceAssets(user.username)
                .then(res => setPreferenceAssets(res.assets || []))
                .catch(console.error); 
        } 
    }, [user]);
    
    const normalizeTickerForNews = (ticker, market) => {
        if (!ticker) return [];
        const upper = ticker.toUpperCase();

        if (market === 'crypto') {
            return [upper];
        }

        if (market === 'forex') {
            if (upper.includes('/')) {
                const parts = upper.split('/');
                return parts.filter(Boolean);
            }
            
            return [upper];
        }
        return [upper];
    };

    const isRelatedToPreferences = useCallback((item, assets) => { 
        if (!assets || assets.length === 0) return false; 
        const textToSearch = `${item.headline || item.title || ''} ${item.content || ''} ${item.source || ''}`.toLowerCase(); 
        return assets.some(asset => { 
            const terms = []; 
            if (asset.ticker) terms.push(asset.ticker.toLowerCase()); 
            if (asset.name) terms.push(asset.name.toLowerCase()); 
            if (terms.length === 0) return false; 
            const regex = new RegExp(`\\b(${terms.join('|')})\\b`, 'i'); 
            return regex.test(textToSearch); 
        }); 
    }, []);
    
    useEffect(() => {
        if (preferenceAssets.length === 0) { 
            setLoading(false); 
            setEvents([]); 
            return; 
        }
        const fetchAndFilterEvents = async () => {
            setLoading(true);
            try {
                const tickersByMarket = preferenceAssets.reduce((acc, asset) => { 
                    const market = asset.category || 'crypto'; 
                    if (!acc[market]) acc[market] = [];
                    const normalizedTickers = normalizeTickerForNews(asset.ticker, market);
                    acc[market].push(...normalizedTickers); 
                    return acc; 
                }, {});
                // Distinct tickers per market
                Object.keys(tickersByMarket).forEach((marketKey) => { 
                    tickersByMarket[marketKey] = Array.from(new Set(tickersByMarket[marketKey]));
                });
                const newsPromises = Object.entries(tickersByMarket).map(([market, tickers]) => 
                    apiService.makeRequest(`/news/sentiment?tickers=${tickers.join(',')}&limit=100&sort=LATEST&market=${market}`, { method: 'GET' }, '/api')
                );
                const newsResults = await Promise.all(newsPromises);
                const allNews = newsResults.flatMap(res => {if(!res || !res.success || !Array.isArray(res.items)) return []; return res.items;});
                const newsData = allNews.map(item => ({ 
                    type: 'news', 
                    id: `news-${item.url}`, 
                    headline: item.title, 
                    source: item.source, 
                    date: new Date(item.time_published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')), 
                    url: item.url,
                    content: item.summary
                }));

                const subreddits = ['CryptoCurrency', 'stocks', 'Forex', 'wallstreetbets'];
                const socialPromises = subreddits.map(sub => apiService.getSocialRedditData(sub, 'hot', 50, 'month'));
                const socialResults = await Promise.all(socialPromises);
                const allPosts = socialResults.flatMap(res => { if(!res || !res.success) return []; return res.posts || res.data ||[];});
                const socialData = allPosts.map(p => ({ 
                    type: 'social', 
                    id: `social-${p.id}`, 
                    title: p.title, 
                    content: p.selftext, 
                    source: `r/${p.subreddit}`, 
                    date: new Date(p.created_utc * 1000), 
                    url: p.permalink
                    ? (p.permalink.startsWith("http")
                        ? p.permalink
                        : `https://reddit.com${p.permalink}`)
                    : null,
                    score: p.score, 
                    num_comments: p.num_comments, 
                    author: p.author 
                }));
                
                const combined = [...newsData, ...socialData];
                const unique = Array.from(new Map(combined.map(e => [e.id, e])).values());
                const relevantEvents = unique.filter(event => isRelatedToPreferences(event, preferenceAssets));
                
                setEvents(relevantEvents);

            } catch (error) { 
                console.error("Failed to fetch events:", error); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchAndFilterEvents();
    }, [preferenceAssets, isRelatedToPreferences]);

    const eventsByDate = useMemo(() => { 
        const grouped = {}; 
        events.filter(e => (filters.news && e.type === 'news') || (filters.social && e.type === 'social'))
            .forEach(event => { 
                if (isNaN(event.date.getTime())) return; 
                const eventDate = getLocalDateString(event.date); 
                if (!grouped[eventDate]) {
                    grouped[eventDate] = [];
                } 
                grouped[eventDate].push(event); 
            }); 
        return grouped; 
    }, [events, filters]);

    const tileContent = ({ date, view }) => {
        if (view === 'month') {
            const dateString = getLocalDateString(date); 
            const dayEvents = eventsByDate[dateString];

            if (!dayEvents || dayEvents.length === 0) return null;

            const firstNews = dayEvents.find(e => e.type === 'news');
            const firstSocial = dayEvents.find(e => e.type === 'social');
            const eventsToShow = [];
            if (firstNews) eventsToShow.push(firstNews);
            if (firstSocial) eventsToShow.push(firstSocial);
            const remainingCount = dayEvents.length - eventsToShow.length;

            return (
                <div className="event-list">
                    {eventsToShow.map(event => (
                        <div key={event.id} className={`event-item ${event.type === 'news' ? 'bg-teal-600/80' : 'bg-purple-600/80'}`}>
                           {event.type === 'news' ? 
                                <Newspaper className="h-3 w-3 flex-shrink-0" /> : 
                                <MessageSquare className="h-3 w-3 flex-shrink-0" />
                           }
                           <span className="truncate">{event.headline || event.title}</span>
                        </div>
                    ))}
                    {remainingCount > 0 && (
                        <div className="event-indicator">
                            + {remainingCount} more
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    const selectedDateEvents = eventsByDate[getLocalDateString(selectedDate)] || [];

    return (
        <motion.div
            className="max-w-[1350px] mx-auto w-full px-4 pt-12"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Events Calendar</h1>
                    <p className="text-muted-foreground mt-1">
                        Displaying news and social discussions relevant to your preferred assets.
                    </p>
                </div>
                <FilterDropdown filters={filters} setFilters={setFilters} />
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-96">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-4 text-muted-foreground">Fetching relevant events...</span>
                </div>
            ) : preferenceAssets.length === 0 ? (
                <div className="text-center py-16 bg-card border border-border rounded-lg">
                    <h3 className="text-lg font-semibold text-foreground">No Preferences Found</h3>
                    <p className="text-muted-foreground mt-2">Please set your preferred assets in your profile to see relevant events.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <Calendar
                            onChange={setSelectedDate}
                            value={selectedDate}
                            tileContent={tileContent}
                            className="text-foreground"
                            locale="en-US"
                        />
                    </div>
                    <div className="lg-col-span-1">
                        <h2 className="text-xl font-bold text-foreground mb-4">
                            Events for {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                        </h2>
                        <div className="max-h-[600px] overflow-y-auto pr-2">
                            {selectedDateEvents.length > 0 ? (
                                selectedDateEvents.map(event => 
                                    <EventDetailsCard 
                                        key={event.id} 
                                        event={event}
                                    />
                                )
                            ) : (
                <p className="text-muted-foreground">No relevant events for this day.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
