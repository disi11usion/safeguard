import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import image1 from '../picture/1.png';
import image2 from '../picture/2.jpg';
import image3 from '../picture/3.png';
import image4 from '../picture/4.jpg';



const UserGuide = () => {
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(0);

  const pages = [
    {
      id: 1,
      title: "Comprehensive Market Data",
      content: (
        <div className="space-y-4">
          <p>Access real-time data across multiple asset classes:</p>
          <ul className="space-y-2 pl-4">
            <li>Cryptocurrencies - Track top digital assets</li>
            <li>Stocks - Monitor global equities</li>
            <li>Forex - Follow currency pairs</li>
            <li>Futures - Analyze derivatives markets</li>
          </ul>
         <p>View essential metrics including rankings, 24h changes, VWAP, high/low prices, and trading volumes all in one intuitive interface.</p>
        </div>
      ),
      image: image1,
      imageStyle: "object-cover"
    },
    {
      id: 2,
      title: "Personalized Dashboard",
      content: (
        <div className="space-y-4">
          <p className="text-gray-300">Your customized financial command center:</p>
          <ul className="space-y-3 pl-4">
            <li className="text-gray-200">
              <span className="font-semibold">Asset Insights</span> - View summary, news, social media, and whale transactions
            </li>
            <li className="text-gray-200">
              <span className="font-semibold">Price Comparison</span> - Track multiple assets side-by-side with interactive charts
            </li>
            <li className="text-gray-200">
              <span className="font-semibold">Sentiment Analysis</span> - Gauge market mood across your portfolio
            </li>
            <li className="text-gray-200">
              <span className="font-semibold">Risk Profile</span> - Get recommendations based on your investment style
            </li>
          </ul>
          <p className="text-gray-300 pt-2">
            Everything you need to make informed decisions, tailored to your preferred assets and trading goals.
          </p>
        </div>
      ),
      image: image2,
      imageStyle: "object-cover -mt-10"
    },
    {
      id: 3,
      title: "Events Calendar",
      content: (
        <div className="space-y-4">
          <p>Stay ahead with our intelligent events calendar:</p>
          <ul className="space-y-2 pl-4">
            <li>Price Trends Overlay - Visualize market movements alongside events</li>
            <li>Multi-Asset Tracking - Monitor news for your preferred cryptocurrencies</li>
            <li>Real-time Updates - Get instant notifications for breaking news</li>
            <li>Event Categories - Filter by announcements, launches, and market events</li>
          </ul>
          <p>See how major announcements and developments correlate with price action to make better-informed trading decisions.</p>
        </div>
      ),
      image: image3,
      imageStyle: "object-cover"
    },
    {
      id: 4,
      title: "AI-Powered Assistant",
      content: (
        <div className="space-y-4">
          <p>Get intelligent market insights with our AI assistant:</p>
          <ul className="space-y-2 pl-4">
            <li>Real-time Analysis - Ask questions about current market conditions</li>
            <li>Interactive Charts - Visualize price trends and trading volumes</li>
            <li>Multi-Asset Support - Analyze crypto, stocks, and forex data</li>
            <li>Smart Context - AI understands your portfolio and preferences</li>
          </ul>
          <p>Powered by advanced LLM technology to provide actionable trading insights and market analysis in natural language.</p>
        </div>
      ),
      image: image4,
      // imageStyle: "object-cover"
      imageStyle: "object-contain scale-100"

    }
  ];

  const nextPage = () => {
    if (currentPage < pages.length - 1) {
      setDirection(1);
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setDirection(-1);
      setCurrentPage(currentPage - 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') prevPage();
      if (e.key === 'ArrowRight') nextPage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage]);

  const pageVariants = {
    enter: (direction) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction) => ({
      x: direction > 0 ? -1000 : 1000,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 relative overflow-hidden">
      {/* Background Gradient Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      
      <div className="relative w-full max-w-7xl z-10">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            Welcome to Safe Guard
          </h1>
          <p className="text-muted-foreground text-lg">
            Your comprehensive guide to getting started
          </p>
        </motion.div>

        {/* Book Container */}
        <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Glow Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-50" />
          
          {/* Page Content */}
          <div className="relative h-[700px] flex items-center overflow-hidden">
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={currentPage}
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 gap-0"
              >
                {/* Left Side - Text */}
                <div className="flex flex-col justify-center p-10 md:p-16 bg-card/50 backdrop-blur-sm relative">
                  <div className="space-y-6 relative z-10">
                    <div className="inline-block px-4 py-1 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 border border-blue-500/30 rounded-full text-sm font-semibold">
                      <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Step {currentPage + 1} of {pages.length}
                      </span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold text-foreground">
                      {pages[currentPage].title}
                    </h2>
                    <div className="text-base md:text-xl text-muted-foreground leading-relaxed">
                      {pages[currentPage].content}
                    </div>
                  </div>
                </div>

                <div className="relative h-full bg-secondary/20 overflow-hidden flex items-center justify-center">
                  <img
                    src={pages[currentPage].image}
                    alt={pages[currentPage].title}
                    className={`w-full h-full ${pages[currentPage].imageStyle || 'object-cover'}`}
                    onError={(e) => {
                      console.error('Image failed to load:', pages[currentPage].image);
                      e.target.src = 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&h=400&fit=crop';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-900/30 via-purple-900/20 to-transparent" />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Buttons */}
          <div className="absolute top-1/2 -translate-y-1/2 left-4 right-4 flex justify-between pointer-events-none z-20">
            <button
              onClick={prevPage}
              disabled={currentPage === 0}
              className={`pointer-events-auto p-3 rounded-full bg-card/80 backdrop-blur-xl border border-border shadow-lg transition-all hover:scale-110 hover:shadow-blue-500/50 ${
                currentPage === 0
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10 hover:border-blue-500/50'
              }`}
            >
              <ChevronLeft className="w-6 h-6 text-foreground" />
            </button>
            <button
              onClick={nextPage}
              disabled={currentPage === pages.length - 1}
              className={`pointer-events-auto p-3 rounded-full bg-card/80 backdrop-blur-xl border border-border shadow-lg transition-all hover:scale-110 hover:shadow-purple-500/50 ${
                currentPage === pages.length - 1
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-pink-500/10 hover:border-purple-500/50'
              }`}
            >
              <ChevronRight className="w-6 h-6 text-foreground" />
            </button>
          </div>

          {/* Page Indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {pages.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  setDirection(index > currentPage ? 1 : -1);
                  setCurrentPage(index);
                }}
                className={`h-2 rounded-full transition-all ${
                  index === currentPage
                    ? 'w-8 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 shadow-lg shadow-purple-500/50'
                    : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Keyboard Hint */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Use arrow keys ← → or buttons to navigate</p>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;