import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

import { 
  FaBitcoin, FaRobot, FaShieldAlt, FaChartLine, FaBrain, FaBell, FaSearch, FaArrowRight,
  FaTwitter, FaGithub, FaLinkedin, FaDiscord, FaHeart, FaGlobe,FaLightbulb
} from 'react-icons/fa';

// Picture Resource - 图片资源
import sendBtn from '../picture/send_btn.png';
// 请确保图片已保存在此路径
import logoShield from '../picture/logo_shield.png'; 

/* --------------------------------------------------------------------------
 * 🌌 DeepSpaceBackground Component (Canvas 2D)
 * -------------------------------------------------------------------------- */
const DeepSpaceBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    let animationFrameId;

    const STAR_COUNT = 2500;
    const DRIFT_SPEED_X = 0.05;
    const DRIFT_SPEED_Y = 0.02;

    let width, height;
    const stars = [];
    let glowSprite;

    const createGlowSprite = () => {
      const size = 10;
      const sCanvas = document.createElement('canvas');
      sCanvas.width = size;
      sCanvas.height = size;
      const sCtx = sCanvas.getContext('2d');
      const grad = sCtx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(200, 220, 255, 0.4)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, size, size);
      return sCanvas;
    };

    const initStars = () => {
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        const z = Math.random();
        const size = (0.2 + z * 1.5);
        const alpha = 0.1 + z * 0.7;
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: z + 0.1,
          size,
          alpha,
          twinkle: Math.random() > 0.9 ? Math.random() * Math.PI : 0,
          twinkleSpeed: 0.02 + Math.random() * 0.05
        });
      }
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      initStars();
    };

    const render = () => {
      // 1. Clear & Base Gradient
      const baseGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
      baseGrad.addColorStop(0, '#0a0e1f'); 
      baseGrad.addColorStop(0.6, '#02040a'); 
      baseGrad.addColorStop(1, '#000000'); 
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Horizontal Milky Way Band
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(width / 2, height / 2);
      ctx.scale(3, 0.4);
      const bandGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.4);
      bandGrad.addColorStop(0, 'rgba(30, 58, 138, 0.08)');
      bandGrad.addColorStop(0.5, 'rgba(76, 29, 149, 0.03)');
      bandGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bandGrad;
      ctx.beginPath();
      ctx.arc(0, 0, width * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Stars
      ctx.globalCompositeOperation = 'lighter';
      stars.forEach(star => {
        star.x -= DRIFT_SPEED_X * star.z;
        star.y -= DRIFT_SPEED_Y * star.z;
        if (star.x < 0) star.x += width;
        if (star.y < 0) star.y += height;

        let alpha = star.alpha;
        if (star.twinkle > 0) {
          star.twinkle += star.twinkleSpeed;
          alpha *= (0.7 + 0.3 * Math.sin(star.twinkle));
        }

        if (star.size < 1.0) {
          ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
          ctx.fillRect(star.x, star.y, star.size, star.size);
        } else {
          if (!glowSprite) glowSprite = createGlowSprite();
          const drawSize = star.size * 4;
          ctx.globalAlpha = alpha;
          ctx.drawImage(glowSprite, star.x - drawSize/2, star.y - drawSize/2, drawSize, drawSize);
          ctx.globalAlpha = 1.0;
        }
      });

      // 4. Central Atmospheric Glow
      ctx.globalCompositeOperation = 'screen';
      const centerGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, height * 0.8);
      centerGlow.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
      centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, width, height);

      // 5. Vignette
      ctx.globalCompositeOperation = 'source-over';
      const vignette = ctx.createRadialGradient(width/2, height/2, height * 0.4, width/2, height/2, width * 0.9);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      
      animationFrameId = requestAnimationFrame(render);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none bg-[#010103] z-0">
       <canvas ref={canvasRef} className="block w-full h-full" />
       <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] mix-blend-overlay"></div>
    </div>
  );
};

/* ----------------------------------------
 * Integrated Footer Component
 * -------------------------------------- */
const IntegratedFooter = () => {
    const currentYear = new Date().getFullYear();
    const [collapsedSections, setCollapsedSections] = useState({
        quickLinks: false,
        resources: false,
        support: false,
        social: false
    });

    const toggleSection = (section) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    return (
        <footer className="relative z-10 w-full border-t border-white/10 bg-black/20 backdrop-blur-sm mt-auto">
            <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
                    {/* Brand Section */}
                    <motion.div className="space-y-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
                        <div className="flex items-start gap-3">
                             {/* Footer Logo: also scaled to remove whitespace */}
                             <div className="w-28 h-28 flex items-center justify-center mt-1 flex-shrink-0">
                                <img src={logoShield} alt="Logo" className="w-full h-full object-contain" />
                             </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">Safe Guard</h3>
                                <p className="text-sm text-white/60 leading-relaxed">
                                    Your intelligent crypto companion for informed investment decisions
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2 pt-4">
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <FaShieldAlt className="text-blue-500" /> <span>Secure & Reliable</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <FaChartLine className="text-blue-500" /> <span>Real-time Data</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <FaGlobe className="text-blue-500" /> <span>Global Coverage</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Quick Links */}
                    <motion.div className="space-y-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} viewport={{ once: true }}>
                        <h4 onClick={() => toggleSection('quickLinks')} className="text-base font-semibold text-white/90 cursor-pointer md:cursor-default">
                            Quick Links
                        </h4>
                        <ul className={`space-y-2 ${collapsedSections.quickLinks ? 'hidden md:block' : 'block'}`}>
                            {['Home', 'Dashboard', 'Preferences', 'Login', 'Sign Up'].map((item) => (
                                <li key={item}>
                                    <Link to={item === 'Home' ? '/' : `/${item.toLowerCase().replace(' ', '')}`} className="text-sm text-white/50 hover:text-blue-400 transition-colors">
                                        {item}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Resources */}
                    <motion.div className="space-y-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} viewport={{ once: true }}>
                        <h4 onClick={() => toggleSection('resources')} className="text-base font-semibold text-white/90 cursor-pointer md:cursor-default">
                            Resources
                        </h4>
                        <ul className={`space-y-2 ${collapsedSections.resources ? 'hidden md:block' : 'block'}`}>
                            {[
                                { name: 'Binance API', url: 'https://binance.com' },
                                { name: 'Market Data', url: 'https://coinmarketcap.com' },
                                { name: 'Crypto News', url: 'https://cryptonews.com' },
                                { name: 'Bitcoin', url: 'https://bitcoin.org' },
                                { name: 'Ethereum', url: 'https://ethereum.org' }
                            ].map((item) => (
                                <li key={item.name}>
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-white/50 hover:text-blue-400 transition-colors">
                                        {item.name}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Support */}
                    <motion.div className="space-y-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }} viewport={{ once: true }}>
                        <h4 onClick={() => toggleSection('support')} className="text-base font-semibold text-white/90 cursor-pointer md:cursor-default">
                            Support
                        </h4>
                        <ul className={`space-y-2 ${collapsedSections.support ? 'hidden md:block' : 'block'}`}>
                            {['Help Center', 'Contact Us', 'Privacy Policy', 'Terms of Service', 'FAQ'].map((item) => (
                                <li key={item}>
                                    <a href={`#${item.toLowerCase().replace(' ', '')}`} className="text-sm text-white/50 hover:text-blue-400 transition-colors">
                                        {item}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* Social Media */}
                    <motion.div className="col-span-1 md:col-span-2 lg:col-span-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }} viewport={{ once: true }}>
                        <div className={`flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6 ${collapsedSections.social ? 'hidden md:flex' : 'flex'}`}>
                            <div className="flex flex-col gap-3">
                                <h4 onClick={() => toggleSection('social')} className="text-base font-semibold text-white/90 cursor-pointer md:cursor-default">
                                    Connect With Us
                                </h4>
                                <div className='flex gap-4'>
                                    {[
                                        { Icon: FaTwitter, url: 'https://twitter.com' },
                                        { Icon: FaGithub, url: 'https://github.com' },
                                        { Icon: FaLinkedin, url: 'https://linkedin.com' },
                                        { Icon: FaDiscord, url: 'https://discord.com' }
                                    ].map(({ Icon, url }, idx) => (
                                        <motion.a key={idx} href={url} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} 
                                            className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                                            <Icon className="text-lg" />
                                        </motion.a>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 lg:max-w-md w-full">
                                <h4 className="text-base font-semibold text-white/90">Stay Updated</h4>
                                <p className="text-sm text-white/50">Get the latest crypto insights delivered to your inbox</p>
                                <div className="flex gap-2">
                                    <input type="email" placeholder="Enter your email" className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder:text-white/30" />
                                    <button className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors whitespace-nowrap shadow-lg shadow-blue-900/40">
                                        Subscribe
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Bottom Section */}
                <motion.div className="mt-12 pt-8 border-t border-white/10" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }} viewport={{ once: true }}>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-sm text-white/40 text-center md:text-left">
                            <p className="flex items-center gap-1 justify-center md:justify-start">
                                © {currentYear} Safe Guard. Made with <FaHeart className="text-red-500" /> for the crypto community.
                            </p>
                        </div>
                        <div className="flex flex-wrap justify-center md:justify-end gap-4 text-sm text-white/40">
                            <span className="flex items-center gap-1">🚀 50+ Cryptocurrencies</span>
                            <span className="flex items-center gap-1">⚡ Real-time Updates</span>
                            <span className="flex items-center gap-1">🔒 Secure & Private</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </footer>
    );
}

/* ----------------------------------------
 * Message Bubble & Cards
 * -------------------------------------- */
function MessageBubble({ role, text, children }) {
  const isUser = role === 'user';
  const hasText = Boolean(text && String(text).trim().length > 0);
  const isCardOnly = !isUser && !hasText && Boolean(children);

  const bubbleBaseUser =
    'w-full max-w-[90%] md:w-[500px] md:max-w-[500px] md:min-w-[500px] px-6 py-4 rounded-[26px] text-base leading-relaxed whitespace-pre-wrap break-words shadow-[0_18px_45px_rgba(5,8,20,0.55)] transition-all duration-300';
  const bubbleBaseAI =
    'w-full max-w-[90%] md:w-[800px] md:max-w-[800px] md:min-w-[800px] px-6 py-4 rounded-[26px] text-base leading-relaxed whitespace-pre-wrap break-words shadow-[0_18px_45px_rgba(5,8,20,0.55)] transition-all duration-300';

  const bubbleStyles = isUser
    ? 'bg-white/[0.06] text-gray-100 border border-white/[0.10] backdrop-blur'
    : 'bg-gradient-to-br from-[#2d4a9e] via-[#1e2a5e] to-[#0f1629] text-white border border-[#3c6aff]/30 whitespace-pre-wrap break-words';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
    <div className={`flex items-start gap-3 max-w-[900px] ${isUser ? 'flex-row-reverse' : ''}`}>
    {!isUser && (
        // 修改：移除了背景色、边框、阴影和圆角设置
        // 既然没有了圆框裁剪，我们可以稍微减小 scale，或者保留 overflow-hidden 以防图片太大
        <div className="w-12 h-12 min-w-[48px] flex items-center justify-center relative overflow-hidden">
          <img 
            src={logoShield} 
            alt="AI" 
            // 仍然保留适当放大以去除原图留白，但因为没有边框，稍微调大一点容器(w-12)看起来更舒服
            className="w-full h-full object-contain scale-[2.0]" 
          />
        </div>
      )}

        <div
          className={`self-start ${
            isCardOnly
              ? `${bubbleBaseAI} bg-transparent border-0 shadow-none p-0 whitespace-pre-wrap break-words`
              : isUser
                  ? bubbleBaseUser
                  : bubbleBaseAI
          } ${isCardOnly ? '' : bubbleStyles}`}
        >
          {hasText ? text : null}
          {children}
        </div>
      </div>
    </div>
  );
}

function SentimentCard({ card }) {
  const symbol = card?.symbol || card?.asset || '';
  const latest = typeof card?.latest === 'number' ? card.latest : Number(card?.latest || 0);
  const average = typeof card?.average === 'number' ? card.average : Number(card?.average || 0);
  const articles = typeof card?.articles === 'number' ? card.articles : Number(card?.articles || 0);

  const labelRaw = (card?.label || 'neutral').toString().toLowerCase();
  const labelDisplay =
    card?.latest_text?.match(/\(([^)]+)\)/)?.[1] ||
    (labelRaw ? labelRaw[0].toUpperCase() + labelRaw.slice(1) : 'Neutral');

  const latestText = card?.latest_text || `${latest.toFixed(3)} (${labelDisplay})`;
  const averageText = card?.average_text || average.toFixed(3);
  const articlesText = card?.articles_text || String(articles);

  const labelColor =
    labelRaw === 'positive'
      ? 'text-green-400'
      : labelRaw === 'negative'
        ? 'text-red-400'
        : 'text-yellow-400';

  const trendIcon = (card?.trend_icon || 'flat').toString().toLowerCase();
  const trendGlyph = trendIcon === 'up' ? '↗' : trendIcon === 'down' ? '↘' : '→';
  const trendColor =
    trendIcon === 'up' ? 'text-green-400' : trendIcon === 'down' ? 'text-red-400' : 'text-white/55';

  return (
    <div className="w-full rounded-[28px] bg-gradient-to-br from-[#2d4a9e] via-[#1e2a5e] to-[#0f1629] px-8 py-7 shadow-[0_26px_70px_rgba(5,8,20,0.60)]">
      <div className="flex items-center justify-between gap-4">
        <div className="text-white font-semibold text-xl tracking-wide">{symbol}</div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-white/60">Latest:</span>
          <span className={`font-semibold ${labelColor}`}>{latestText}</span>
          <span className={`font-semibold ${trendColor}`}>{trendGlyph}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-white/60">Average:</span>
          <span className="text-white font-medium">{averageText}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/60">Articles:</span>
          <span className="text-white font-medium">{articlesText}</span>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------
 * Main Component
 * -------------------------------------- */
export default function LandingChat_new() {
  const navigate = useNavigate();
  //  Fetch user info to determine if we need to prompt login or redirect to dashboard in certain cases
  const { user } = useAuth();
  const handleGoToDashboard = () => {
    if (!user) {
      navigate('/dashboard');
      return;
    }
    if (user.role === 'admin') {
      navigate('/admin');
      return;
    }
    if (user.user_type === 'special') {
      navigate('/government'); 
    } else {
      navigate('/dashboard');
    }
  };

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insight, setInsight] = useState(null);
  const scrollRef = useRef(null);
  
  // eslint-disable-next-line no-unused-vars
  const [selectedAsset, setSelectedAsset] = useState(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, insight]);

  const extractSymbol = (assetName) => {
    const assetMap = {
      Gold: 'GOLD',
      Bitcoin: 'BTC',
      Ethereum: 'ETH',
      'US Stocks': 'SPY',
      Indices: 'VIX',
    };
    return assetMap[assetName] || assetName.toUpperCase();
  };

  const getAssetCategory = (assetName) => {
    const categoryMap = {
      Gold: 'commodity',
      Bitcoin: 'crypto',
      Ethereum: 'crypto',
      'US Stocks': 'stock',
      Indices: 'index',
    };
    return categoryMap[assetName] || 'crypto';
  };

  const panelStyle = useMemo(
    () => ({
      
      minHeight: 600,
    }),
    []
  );

  /* ----------------------------------------
   * Core send logic
   * -------------------------------------- */
  const sendMessage = async (text) => {
    const content = text.trim();
    if (!content) return;

    const userMsg = { role: 'user', text: content };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);

    const isContinueCommand = content.toLowerCase() === 'continue';
    if (!isContinueCommand) {
      setInsight(null);
    }
    
    let botMessages = [];

    try {
      const backendMessages = nextMessages.map((m) => ({
        role: m.role,
        content: m.text || '',
      }));
      
      let response;

      if (typeof apiService.chatLanding === 'function') {
          response = await apiService.chatLanding(backendMessages);
      } else {
          console.warn('[LandingChat] apiService.chatLanding missing, trying direct fetch...');
          const res = await fetch('/api/ai/landing-chat', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: backendMessages })
          });
          response = await res.json();
      }

      if (response && response.success === false) {
        let errorMessage = response.error || 'Service temporarily unavailable.';
        let userFriendlyText = "I encountered an error connecting to the service.";

        if (errorMessage.includes("401")) {
             userFriendlyText = "Configuration Error: The AI service API Key is missing or invalid. Please check the backend configuration.";
        } else if (errorMessage.includes("connection")) {
             userFriendlyText = "I'm having trouble connecting to the application server.";
        } else {
             userFriendlyText = `Error: ${errorMessage}`;
        }
        
        botMessages.push({
          role: 'assistant',
          text: userFriendlyText,
          chips: [{ label: 'Retry', icon: '↻', action: 'retry' }] 
        });

        setMessages((prev) => [...prev, ...botMessages]);
        setLoading(false);
        return; 
      }

      const isResponse2 = response?.type === 'response2_asset_overview';
      const isResponse3 = response?.type === 'response3_transition_to_news';

      if (isResponse2) {
        const assetName = response.asset;
        setInsight({
          asset: assetName,
          social_card: response.social_card,
          social_explanation: response.social_explanation,
        });
        setSelectedAsset({
          symbol: extractSymbol(assetName),
          name: assetName,
          category: getAssetCategory(assetName),
        });
        if (response.social_card) {
          botMessages.push({
            role: 'assistant',
            text: '',
            social_card: response.social_card,
          });
        }
        if (response.social_explanation) {
          botMessages.push({
            role: 'assistant',
            text: response.social_explanation,
          });
        }
      }

      if (isResponse3) {
        setInsight(null);
        if (response.asset) {
          const assetName = response.asset;
          setSelectedAsset({
            symbol: extractSymbol(assetName),
            name: assetName,
            category: getAssetCategory(assetName),
          });
        }
      }

      if (response?.type === 'response4_navigate_dashboard' || response?.type === 'response4_navigate_login') {
        const navPath = response?.path || '/';
        setTimeout(() => {
          navigate(navPath);
        }, 1500);
      }
      if (response?.type === 'response4_1_navigate_dashboard') {
        const navPath = response?.path || '/dashboard';
        setTimeout(() => {
          navigate(navPath);
        }, 1500);
      }
      if (response?.type === 'response4_1_navigate_ai_chat') {
        const navPath = response?.path || '/ai-chat';
        setTimeout(() => {
          navigate(navPath);
        }, 1500);
      }

      if (response?.reply) {
        const msgPayload = {
          role: 'assistant',
          text: response.reply,
        };
        if (response?.chips) {
          msgPayload.chips = response.chips.map((c) => ({
            label: c.label,
            icon: c.icon || '',
            action: c.action,
            path: c.path,
            asset: c.asset,
          }));
        }
        botMessages.push(msgPayload);
      }
      else if (response?.content) {
         botMessages.push({
            role: 'assistant',
            text: response.content
         });
      }

      if (Array.isArray(response.news)) {
        const topNews = response.news.slice(0, 3);
        if (topNews.length) {
          botMessages.push({
            role: 'assistant',
            text: 'Latest news:',
            newsItems: topNews,
          });
        } else if (response.news_message) {
          botMessages.push({
            role: 'assistant',
            text: response.news_message,
          });
        }
      }

      if (response?.type === 'response1_1_select_asset' && response?.assets) {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg) {
          lastMsg.chips = response.assets.map((a) => ({
            label: a.label || a.key,
            icon: a.icon || '',
          }));
        } else {
          botMessages.push({
            role: 'assistant',
            text: '',
            chips: response.assets.map((a) => ({
              label: a.label || a.key,
              icon: a.icon || '',
            })),
          });
        }
      }

      if (isResponse2) {
        botMessages.push({
          role: 'assistant',
          text: 'Would you like to continue?',
          chips: [{ label: 'Continue', icon: '→' }],
        });
      }

      if (isResponse3) {
        botMessages.push({
          role: 'assistant',
          text: "Feel free to review the headlines above. Click Continue when you're ready to proceed.",
          chips: [{ label: 'Continue', icon: '→' }],
        });
      }

      if (response?.type === 'waiting_user_confirmation') {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg) {
          lastMsg.chips = lastMsg.chips || [];
          lastMsg.chips.push({ label: 'Continue', icon: '→' });
        }
      }

      if (response?.type === 'response4_ask_login' && response?.actions) {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg) {
          lastMsg.chips = response.actions.map((a) => ({
            label: a.label,
            icon: a.icon || '',
            action: a.action,
            path: a.path,
          }));
          lastMsg.actions = null;
        }
      }

      if (response?.type === 'response4_1_other_features' && response?.features) {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg) {
          lastMsg.chips = response.features.map((f) => ({
            label: f.label,
            icon: f.icon || '',
            action: f.action,
            path: f.path,
          }));
        }
      }

      if (response?.type === 'response4_1_restart' && response?.assets) {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg) {
          lastMsg.chips = response.assets.map((a) => ({
            label: a.label || a.key,
            icon: a.icon || '',
          }));
        }
      }

      const isNewResponse4 =
        response?.type === 'response4_ask_login' ||
        response?.type === 'response4_1_other_features' ||
        response?.type === 'response4_1_restart';
      if (response?.cta && !isResponse2 && response?.type !== 'waiting_user_confirmation' && !isNewResponse4) {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg && !lastMsg.chips) {
          lastMsg.chips = [
            { label: 'Yes', icon: '✓' },
            { label: 'No', icon: '✗' },
          ];
        }
      }

      if (response?.actions?.length && !isNewResponse4) {
        const lastMsg = botMessages[botMessages.length - 1];
        if (lastMsg && !lastMsg.actions) {
          lastMsg.actions = response.actions;
        }
      }

      if (botMessages.length === 0) {
        botMessages.push({
          role: 'assistant',
          text: response?.content || response?.message || 'I processed that, but have no response to show.',
        });
      }

      setMessages((prev) => [...prev, ...botMessages]);
    } catch (e) {
      console.error('[LandingChat] Error:', e);
      let errorText = 'I am unable to reach the server at the moment.';
      
      if (e.message?.includes('fetch') || e.message?.includes('network')) {
          errorText = 'Connection failed. Please check your internet or try again later.';
      }
      
      setError(errorText);
      
      if (botMessages.length === 0) {
          setMessages(prev => [...prev, {
              role: 'assistant',
              text: `⚠️ ${errorText}`
          }]);
      }
      
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------
   * Form handlers
   * -------------------------------------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSend) sendMessage(input);
  };

  const handleSuggestion = (term, action, path, assetFromChip) => {
    if (action === 'continue_asset') {
      const msg = `continue ${assetFromChip || ''}`.trim();
      sendMessage(msg);
      return;
    }

    if (action === 'navigate' && path) {
      navigate(path);
      return;
    }

    if (term === 'Continue') {
      sendMessage('continue');
      return;
    }
    if (term === 'Create Profile') {
      sendMessage('yes');
      return;
    }
    if (term === 'Not Now') {
      sendMessage('no');
      return;
    }

    if (term === 'Yes, Log In') {
      navigate('/login');
      return;
    }
    if (term === 'No, Thanks') {
      sendMessage('no');
      return;
    }
    if (term === 'Maybe Later') {
      sendMessage('no');
      return;
    }

    if (term === 'Go to Homepage' || term === 'Go to Dashboard') {
      navigate('/');
      return;
    }
    if (term === 'View Calendar') {
      navigate('/calendar');
      return;
    }
    if (term === 'Ask about another asset') {
      sendMessage('another asset');
      return;
    }
    if (term === 'Try AI Chat') {
      navigate('/ai-chat');
      return;
    }
    sendMessage(term);
  };

  /* ----------------------------------------
   * Render
   * -------------------------------------- */
  return (
    // Use normal document flow + dvh sizing to avoid overlap with global fixed Navbar on resize.
    <div className="relative w-full min-h-[100dvh] bg-[#02040a] font-sans selection:bg-blue-500/30 overflow-x-hidden flex flex-col pt-24 md:pt-28">
      
      <DeepSpaceBackground />

      {/* flex-grow 确保内容区域撑开，将 Footer 推到底部 */}
      <div className={`relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-10 flex-col flex-1 ${
        messages.length === 0 
          ? 'flex items-center justify-center py-12 md:py-16 min-h-[calc(100dvh-14rem)]' // 首页状态：垂直居中
          : 'flex justify-start pb-8' // 聊天状态：从顶部开始
      }`}>
        {/* -------------- Persistent "Go to Dashboard" button -------------- */}
         <div className="absolute top-6 right-4 lg:right-0 z-50">
        <button
          onClick={handleGoToDashboard}
          className="px-5 py-2.5 bg-[#0f152e] hover:bg-[#1a2142] border border-blue-500/30 text-white rounded-xl text-sm font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] flex items-center gap-2 border border-blue-400/30 backdrop-blur-md"
        >
          Go to Dashboard <FaArrowRight className="text-xs" />
        </button>
      </div>

        {/* -------------- Empty state (web) -------------- */}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center w-full max-w-4xl mx-auto text-center">
            
            {/* Logo + Brand */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:pr-40 md:-mb-24">
               <img 
                 src={logoShield} 
                 alt="Safeguard Logo" 
                 className="h-96 w-96 object-contain filter drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" 
               />
               <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-wide leading-tight text-center md:text-left md:-ml-20">
                 Safeguard AI
               </h2>
            </div>
            

            {/* Main title */}
            <div className="mb-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight">
                Before you buy — <span className="text-blue-500">check risk.</span>
              </h1>
            </div>

            {/* Subheading */}
            <p className="text-white/60 text-lg mb-10">
                Safeguard helps you understand market risk in seconds.
            </p>

            {/* Search bar */}
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-2xl relative mb-8 group"
            >
              <div className="relative flex items-center w-full rounded-2xl border border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-[#0a0f26]/60 backdrop-blur-md px-2 py-2 transition-all">
                 <div className="pl-4 text-white/50">
                    <FaSearch className="text-lg" />
                 </div>
                 <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Is Bitcoin risky right now?"
                  className="flex-1 outline-none text-white placeholder:text-white/30 text-lg bg-transparent px-4 h-12"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    !canSend ? 'bg-blue-600/50 text-white/30 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/40'
                  }`}
                >
                  {loading ? (
                    <div className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FaArrowRight />
                  )}
                </button>
              </div>
            </form>
            {/* 修复：确保 z-index 层级够高，且背景不透明，能在深色背景上看到 */}
            <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 mt-4">
              {[
                { 
                  icon: <FaChartLine />, 
                  title: "Risk Scoring", 
                  desc: "Instantly see the risk level of any investment." 
                },
                { 
                  icon: <FaShieldAlt />, 
                  title: "Signal Intelligence", 
                  desc: "Analyze market trends and detect anomalies." 
                },
                { 
                  icon: <FaLightbulb />, 
                  title: "AI Explanation", 
                  desc: "Understand language insights." 
                },
                { 
                  icon: <FaBell />, 
                  title: "Alerts & Warnings", 
                  desc: "Receive real-time alerts." 
                }
              ].map((item, idx) => (
                <div 
                  key={idx}
                  className="flex flex-col items-start p-5 rounded-xl border border-blue-500/30 bg-[#0f152e] hover:bg-[#1a2142] transition-colors duration-300 text-left min-h-[120px]"
                >
                  <div className="mb-3 text-blue-400 text-xl">
                    {item.icon}
                  </div>
                  <h3 className="text-white font-semibold text-base mb-2">{item.title}</h3>
                  <p className="text-white/60 text-xs leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Suggestion Chips */}
            <div className="flex flex-wrap justify-center gap-3 mb-14">
              {[
                'Is BTC risky today?', 
                'Why did ETH drop?', 
                'Should I enter now?'
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 bg-[#0f152e] text-white/70 hover:bg-[#1a2142] hover:text-white transition-all text-sm font-medium hover:border-blue-500/30"
                >
                  {q}
                </button>
              ))}
            </div>

            <p className="text-white/40 text-sm max-w-lg mx-auto mt-8">
              We don't provide buy/sell advice. We help you understand risk.
            </p>

          </div>
        ) : (
          /* -------------- Chat state (web) -------------- */
          <div className="w-full flex flex-col h-[calc(100dvh-14rem)] min-h-[460px]">
          <div className="w-full h-full"> 
            <div
              // 确保这里也是 flex flex-col h-full
              className="w-full h-full rounded-[30px] border border-white/10 bg-white/[0.06] backdrop-blur shadow-[0_28px_80px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col"
              style={panelStyle}
            >
                {/* Chat header */}
                <div className="px-6 py-5 border-b border-white/10 flex items-center gap-0">
                <button 
                    onClick={() => setMessages([])} 
                    className="mr-2 text-white/50 hover:text-white transition-colors"
                  >
                    ← Back
                  </button>
                  
                  {/* 修改：使用 h-24 限制高度，但内部图片放大 2.5倍 (scale-[2.5]) 以消除留白 */}
                  {/* -ml-4 和 -mr-4 是负边距，用来拉近左右文字的距离，因为留白被放大了 */}
                  <div className="h-24 w-24 flex items-center justify-center relative -ml-2 -mr-2">
                     <img 
                        src={logoShield} 
                        alt="Logo" 
                        // object-contain 保证完整显示，scale-110 微调大小去除边缘空白
                        className="h-full w-full object-contain scale-110" 
                     />
                  </div>
                  
                  <div className="pl-0">
                    <div className="text-white font-semibold text-lg leading-tight">Safeguard AI</div>
                    <div className="text-white/55 text-sm">Market Analyst</div>
                  </div>
                </div>

                {/* Messages */}
                <div className="px-6 py-6 flex-1 min-h-0">
                  <div
                    ref={scrollRef}
                    className="h-full overflow-y-auto pr-2"
                    style={{ scrollbarGutter: 'stable' }}
                  >
                    {messages.map((msg, idx) => (
                      <MessageBubble key={`${msg.role}-${idx}`} role={msg.role} text={msg.text}>
                        {msg.social_card && (
                          <div className="mt-1">
                            <SentimentCard card={msg.social_card} />
                          </div>
                        )}
                        {Array.isArray(msg.newsItems) && msg.newsItems.length > 0 && (
                          <ul className="mt-3 space-y-2 text-sm">
                            {msg.newsItems.slice(0, 3).map((item, i) => {
                              const title =
                                typeof item === 'string' ? item : item?.title || item?.headline || 'Untitled';
                              const url = typeof item === 'string' ? null : item?.url;
                              const source = typeof item === 'string' ? null : item?.source;

                              return (
                                <li key={`${idx}-news-${i}`} className="flex gap-2">
                                  <span className="text-white/80">•</span>
                                  <div className="min-w-0">
                                    {url ? (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-white underline underline-offset-4 decoration-white/40 hover:decoration-white/80"
                                      >
                                        {title}
                                      </a>
                                    ) : (
                                      <span className="text-white">{title}</span>
                                    )}
                                    {source && <span className="text-white/70">{` (${source})`}</span>}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {msg.chips && (
                          <div className="mt-4 flex flex-nowrap gap-2 w-full overflow-x-auto pb-1">
                            {msg.chips.map((chip, chipIdx) => (
                              <button
                                key={`${chip.label}-${chipIdx}`}
                                type="button"
                                onClick={() => handleSuggestion(chip.label, chip.action, chip.path, chip.asset)}
                                className="shrink-0 px-4 py-2 rounded-full border border-white/12 bg-white/[0.05] text-white/90 hover:bg-white/[0.08] transition flex items-center gap-2 text-sm font-medium whitespace-nowrap"
                              >
                                {chip.icon && <span className="text-base">{chip.icon}</span>}
                                <span>{chip.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!msg.chips && msg.actions && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {msg.actions.map((a) => (
                              <button
                                key={a.key}
                                type="button"
                                onClick={() => handleSuggestion(a.label, a.action, a.path)}
                                className="px-4 py-2 rounded-full border border-white/12 bg-white/[0.05] text-white/90 hover:bg-white/[0.08] transition text-sm font-medium"
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </MessageBubble>
                    ))}

                    {error && (
                      <div className="text-red-200 text-sm mt-2 p-4 bg-red-500/15 rounded-2xl border border-red-500/20">
                        {error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Input In Chat */}
                <div className="px-6 pb-6">
                  <form
                    onSubmit={handleSubmit}
                    className="w-full rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur px-5 py-4 flex items-center gap-3 shadow-[0_22px_60px_rgba(0,0,0,0.55)]"
                  >
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Message..."
                      className="flex-1 outline-none text-white placeholder:text-white/40 text-base bg-transparent"
                    />
                    <button
                      type="submit"
                      disabled={!canSend}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                        !canSend ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.07]'
                      }`}
                    >
                      {loading ? (
                        <div className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <img src={sendBtn} alt="Send" className="h-6 w-6 object-contain" />
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ 集成 Footer 组件 */}
      <IntegratedFooter />
    </div>
  );
}
