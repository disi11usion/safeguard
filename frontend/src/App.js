import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CryptoDataProvider } from './context/CryptoDataContext'; 
import { ThemeProvider } from './components/theme-provider';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CryptoTable from './components/CryptoTable';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Preferences from './pages/Preferences';
import Pricing from './pages/Pricing';
import Checkout from './pages/Checkout';
import ProtectedRoute from './components/ProtectedRoute';
import AIChatOllama from './pages/AIChatOllama';
import AIChatbot from './components/AIchatbot';
import ComprehensiveTable from './components/ComprehensiveTable';
import FuturesAnalyze from './pages/Analysis/FuturesAnalyze';
import TickerAnalyze from './pages/Analysis/TickerAnalyze';
import MarketShakePage from './pages/Analysis/MarketShakePage';
import CalendarPage from './pages/CalendarPage';
import Userguide from './pages/Userguide';
import LandingChat_new from './pages/LandingChat_new';
import PaymentSuccess from './pages/PaymentSuccess.jsx';
import PaymentCancel from './pages/PaymentCancel.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import ProfileSection from './pages/ProfileSection';
import GovernmentPage from './pages/GovernmentPage';
import NewsPage from './pages/NewsPage';
import PortfolioPage from './pages/PortfolioPage';
import LegalAccessGate from "./components/LegalAccessGate";


function AppShell() {
  const location = useLocation();
  const path = location?.pathname || '/';
  const hideGate =
  path.startsWith('/admin')
  const isLandingChatPage = path === '/' || path === '/landing-chat';
  
  // Logic to hide AI Chatbot button on certain pages
  //const hideAI = path.startsWith('/research') || path.startsWith('/ai-chat');
  const hideAI = isLandingChatPage || path.startsWith('/ai-chat');

  // Logic to hide Footer on full-screen chat pages
  //const hideFooter = path === '/landing-chat' || path === '/ai-chat';
  const hideFooter = isLandingChatPage || path === '/ai-chat';


  return (
    <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
      {!hideGate && <LegalAccessGate />}
      <Navbar />
      <main className={`flex-1 px-4 ${isLandingChatPage ? 'p-0' : 'pt-32 pb-8'}`}>
        <Routes>
          <Route path="/" element={<LandingChat_new />} />
          <Route path="/landing-chat" element={<LandingChat_new />} />
          //<Route path="/" element={<ComprehensiveTable isLandingPage={true} />} />
          <Route path="/dashboard-table" element={<ComprehensiveTable />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/preferences"
            element={
              <ProtectedRoute>
                <Preferences />
              </ProtectedRoute>
            }
          />
          <Route path="/ai-chat" element={<AIChatOllama />} />
          <Route path="/analysis/ticker" element={<TickerAnalyze />} />
          <Route path="/analysis/futures" element={<FuturesAnalyze />} />
          <Route path="/analysis/market-shake" element={<MarketShakePage />} />
          <Route path="/market-shake" element={<MarketShakePage />} />
          <Route path="/government" element={<GovernmentPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/calendar" element={
            <ProtectedRoute>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
          <Route path="/userguide" element={<Userguide />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </main>
      
      {!hideAI && <AIChatbot />}
      
      {/* Conditionally render Footer */}
      {!hideFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="crypto-ui-theme">
      <AuthProvider>
        <Router>
          <AppShell />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
