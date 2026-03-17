import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import logoShield from '../picture/logo_shield.png'; 
import { 
  FaBitcoin, 
  FaBars, 
  FaTimes, 
  FaSignOutAlt, 
  FaUser, 
  FaCog, 
  FaUserCircle, 
  FaCreditCard, 
  FaChartLine,
  FaUserShield
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Button } from './ui/button';
import { ModeToggle } from './mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [marketSentiment, setMarketSentiment] = useState(null);
  const [sentimentLoading, setSentimentLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkMockMode = async () => {
      try {
        const response = await apiService.makeRequest('/mock/scenarios', {
          method: 'GET',
        }, '/api');
        if (response.success && response.using_mock_data) {
          setUsingMockData(true);
          sessionStorage.setItem('usingMockData', 'true');
        } else {
          sessionStorage.setItem('usingMockData', 'false');
        }
      } catch (error) {
        console.error('Error checking mock mode:', error);
        sessionStorage.setItem('usingMockData', 'false');
      }
    };
    
    checkMockMode();
  }, []);

  useEffect(() => {
    if (location.pathname === '/research') {
      const fetchMarketSentiment = async () => {
        try {
          setSentimentLoading(true);
          const response = await apiService.makeRequest('/sentiment', {
            method: 'GET',
          });
          
          if (response && response.market_sentiment && Array.isArray(response.market_sentiment)) {
            setMarketSentiment({
              score: response.market_sentiment[0],
              label: response.market_sentiment[1]
            });
          }
        } catch (error) {
          console.error('Error fetching market sentiment:', error);
        } finally {
          setSentimentLoading(false);
        }
      };

      fetchMarketSentiment();
    } else {
      setMarketSentiment(null);
      setSentimentLoading(true);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  const roleIsAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const isAdmin = roleIsAdmin || hasAdminAccess;

  useEffect(() => {
    let mounted = true;
    const probeAdminAccess = async () => {
      if (!user) {
        if (mounted) setHasAdminAccess(false);
        return;
      }
      if (roleIsAdmin) {
        if (mounted) setHasAdminAccess(true);
        return;
      }
      try {
        const token =
          localStorage.getItem('cryptoai_access_token') ||
          localStorage.getItem('access_token');
        if (!token) {
          if (mounted) setHasAdminAccess(false);
          return;
        }
        await apiService.makeRequest('/admin/users?limit=1&offset=0', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (mounted) setHasAdminAccess(true);
      } catch (_) {
        if (mounted) setHasAdminAccess(false);
      }
    };
    probeAdminAccess();
    return () => {
      mounted = false;
    };
  }, [user, roleIsAdmin]);

  return (
    <motion.nav 
      className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              {/* Use shared Logo component to keep branding consistent */}
              <Link to="/" className="flex items-center gap-2">
                {/* 替换 FaBitcoin 为 img */}
                <img 
                  src={logoShield} 
                  alt="Safeguard Logo" 
                  className="h-20 w-20 object-contain drop-shadow-[0_0_10px_rgba(102,126,234,0.5)] -mr-5" 
                />
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent ">
                  Safe Guard
                </span>
              </Link>
            </motion.div>
            
            {usingMockData && (
              <motion.div
                className="bg-yellow-500/20 border border-yellow-500/30 rounded-full px-3 py-1 flex items-center gap-1.5"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <span className="text-yellow-600 dark:text-yellow-400 text-xs font-medium">Demo Mode</span>
              </motion.div>
            )}
            
            {location.pathname === '/research' && !sentimentLoading && marketSentiment && (
              <motion.div
                className="hidden lg:flex items-center gap-2 bg-card/50 border border-border rounded-lg px-4 py-2 min-w-[300px]"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaChartLine className="text-teal-400 text-sm" />
                <span className="text-muted-foreground text-xs">Overall Market Sentiment:</span>
                <span className="text-teal-400 text-xs font-bold">
                  {marketSentiment.label.charAt(0).toUpperCase() + marketSentiment.label.slice(1)}
                </span>
                <span className={`text-xs font-semibold ${
                  marketSentiment.score > 0.1 ? 'text-green-500' : 
                  marketSentiment.score < -0.1 ? 'text-red-500' : 
                  'text-yellow-500'
                }`}>
                  ({marketSentiment.score > 0 ? '+' : ''}{marketSentiment.score.toFixed(4)})
                </span>
              </motion.div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/landing-chat')}
                  className="bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                >
                  Chat
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/userguide')}
                  className="bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                >
                    Guide
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/pricing')}
                  className="bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                >
                    Pricing
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="secondary" onClick={() => navigate('/calendar')}>
                    Calendar
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                    Dashboard
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="secondary" onClick={() => navigate('/analysis/market-shake')}>
                    Market Shake
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="secondary" onClick={() => navigate('/government')}>
                    Government
                  </Button>
                </motion.div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button variant="secondary" className="gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <FaUser className="text-sm" />
                        </div>
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-gray-400">▼</span>
                      </Button>
                    </motion.div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      <div className="flex items-center gap-3 py-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <FaUserCircle className="text-xl" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">{user.name}</span>
                          <span className="text-xs text-indigo-400 font-medium">@{user.username}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/preferences')}>
                      <FaCog className="text-base" />
                      <span>Preferences</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/pricing')}>
                      <FaCreditCard className="text-base" />
                      <span>Pricing</span>
                    </DropdownMenuItem>
                    {isAdmin ? (
                      <DropdownMenuItem onClick={() => navigate('/admin')}>
                        <FaUserShield className="text-base" />
                        <span>Admin</span>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                    >
                      <FaSignOutAlt className="text-base" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/landing-chat')}
                  className="bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                >
                  Chat
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/userguide')}
                  className="bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                >
                    Guide
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/pricing')}
                  className="bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                >
                    Pricing
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="secondary" onClick={() => navigate('/login')}>
                    Log In
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="secondary" onClick={() => navigate('/analysis/market-shake')}>
                    Market Shake
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => navigate('/signup')}>
                    Sign Up
                  </Button>
                </motion.div>
              </>
            )}
            <ModeToggle />
          </div>

          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isOpen ? <FaTimes className="text-xl" /> : <FaBars className="text-xl" />}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle className="text-left">Menu</SheetTitle>
                </SheetHeader>
                
                <div className="flex flex-col gap-4 mt-6">
                  {user ? (
                    <>
                      <div className="flex items-center gap-3 bg-card/50 rounded-xl p-4 border border-border">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <FaUser className="text-lg" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-foreground text-sm">{user.name}</span>
                          <span className="text-xs text-indigo-400 font-medium">@{user.username}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>

                      {location.pathname === '/research' && !sentimentLoading && marketSentiment && (
                        <div className="bg-card/50 border border-border rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 text-teal-400">
                            <FaChartLine />
                            <span className="text-sm font-semibold">Market Sentiment</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-teal-400 font-bold text-sm">
                              {marketSentiment.label.charAt(0).toUpperCase() + marketSentiment.label.slice(1)}
                            </span>
                            <span className={`text-xs font-semibold ${
                              marketSentiment.score > 0.1 ? 'text-green-500' : 
                              marketSentiment.score < -0.1 ? 'text-red-500' : 
                              'text-yellow-500'
                            }`}>
                              ({marketSentiment.score > 0 ? '+' : ''}{marketSentiment.score.toFixed(4)})
                            </span>
                          </div>
                        </div>
                      )}
                       <Button 
                        variant="outline" 
                        onClick={() => { navigate('/landing-chat'); setIsOpen(false); }} 
                        className="w-full bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                      >
                        Chat
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => { navigate('/userguide'); setIsOpen(false); }} 
                        className="w-full bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                      >
                        User Guide
                      </Button>

                      <Button variant="secondary" onClick={() => { navigate('/calendar'); setIsOpen(false); }} className="w-full">
                        Calendar
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/dashboard'); setIsOpen(false); }} className="w-full">
                        Dashboard
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/analysis/market-shake'); setIsOpen(false); }} className="w-full">
                        Market Shake
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/government'); setIsOpen(false); }} className="w-full">
                        Government
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/preferences'); setIsOpen(false); }} className="w-full justify-start">
                        <FaCog />
                        Preferences
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/pricing'); setIsOpen(false); }} className="w-full justify-start">
                        <FaCreditCard />
                        Pricing
                      </Button>
                      {isAdmin ? (
                        <Button variant="secondary" onClick={() => { navigate('/admin'); setIsOpen(false); }} className="w-full justify-start">
                          <FaUserShield />
                          Admin
                        </Button>
                      ) : null}
                      <Button variant="destructive" onClick={() => { handleLogout(); setIsOpen(false); }} className="w-full justify-start">
                        <FaSignOutAlt />
                        Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between p-2 bg-card/50 rounded-xl border border-border">
                        <span className="text-sm text-muted-foreground">Theme</span>
                        <ModeToggle />
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => { navigate('/landing-chat'); setIsOpen(false); }} 
                        className="w-full bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                      >
                        Chat
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => { navigate('/userguide'); setIsOpen(false); }} 
                        className="w-full bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                      >
                        User Guide
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={() => { navigate('/pricing'); setIsOpen(false); }} 
                        className="w-full bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-500/70 text-base font-semibold"
                      >
                        Pricing
                      </Button>

                      <Button variant="secondary" onClick={() => { navigate('/login'); setIsOpen(false); }} className="w-full">
                        Log In
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/analysis/market-shake'); setIsOpen(false); }} className="w-full">
                        Market Shake
                      </Button>
                      <Button variant="secondary" onClick={() => { navigate('/government'); setIsOpen(false); }} className="w-full">
                        Government
                      </Button>
                      <Button onClick={() => { navigate('/signup'); setIsOpen(false); }} className="w-full">
                        Sign Up
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
