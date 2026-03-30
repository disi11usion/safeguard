import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoShield from '../picture/logo_shield.png';
import {
  FaTwitter,
  FaGithub,
  FaLinkedin,
  FaDiscord,
  FaHeart,
  FaShieldAlt,
  FaChartLine,
  FaGlobe
} from 'react-icons/fa';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [collapsedSections, setCollapsedSections] = useState({
    quickLinks: false,
    resources: false,
    support: false,
    social: false
  });

  const toggleSection = (section) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Section */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-4">
              <img
                src={logoShield}
                alt="Safe Guard Logo"
                className="w-20 h-20 flex-shrink-0 object-contain"
              />
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">Safe Guard</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your intelligent crypto companion for informed investment decisions
                </p>
              </div>
              <div className="col-start-2 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FaShieldAlt className="text-primary" />
                  <span>Secure & Reliable</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FaChartLine className="text-primary" />
                  <span>Real-time Data</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FaGlobe className="text-primary" />
                  <span>Global Coverage</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h4
              onClick={() => toggleSection('quickLinks')}
              className="text-base font-semibold text-foreground cursor-pointer md:cursor-default"
            >
              Quick Links
            </h4>
            <ul className={`space-y-2 ${collapsedSections.quickLinks ? 'hidden md:block' : 'block'}`}>
              <li>
                <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/preferences" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Preferences
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Sign Up
                </Link>
              </li>
            </ul>
          </motion.div>

          {/* Resources */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h4
              onClick={() => toggleSection('resources')}
              className="text-base font-semibold text-foreground cursor-pointer md:cursor-default"
            >
              Resources
            </h4>
            <ul className={`space-y-2 ${collapsedSections.resources ? 'hidden md:block' : 'block'}`}>
              <li>
                <a
                  href="https://binance.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Binance API
                </a>
              </li>
              <li>
                <a
                  href="https://coinmarketcap.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Market Data
                </a>
              </li>
              <li>
                <a
                  href="https://cryptonews.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Crypto News
                </a>
              </li>
              <li>
                <a
                  href="https://bitcoin.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Bitcoin
                </a>
              </li>
              <li>
                <a
                  href="https://ethereum.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Ethereum
                </a>
              </li>
            </ul>
          </motion.div>

          {/* Support */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h4
              onClick={() => toggleSection('support')}
              className="text-base font-semibold text-foreground cursor-pointer md:cursor-default"
            >
              Support
            </h4>
            <ul className={`space-y-2 ${collapsedSections.support ? 'hidden md:block' : 'block'}`}>
              <li>
                <a href="#help" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#faq" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </motion.div>

          {/* Social Media - This section spans full width across all columns */}
          <motion.div
            className="col-span-1 md:col-span-2 lg:col-span-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className={`flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6 ${collapsedSections.social ? 'hidden md:flex' : 'flex'}`}>
              <div className="flex flex-col gap-3">
                <h4
                  onClick={() => toggleSection('social')}
                  className="text-base font-semibold text-foreground cursor-pointer md:cursor-default"
                >
                  Connect With Us
                </h4>
                <div className='flex gap-4'>
                  <motion.a
                    href="https://twitter.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-lg bg-secondary hover:bg-accent flex items-center justify-center text-foreground transition-colors"
                  >
                    <FaTwitter className="text-lg" />
                  </motion.a>
                  <motion.a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-lg bg-secondary hover:bg-accent flex items-center justify-center text-foreground transition-colors"
                  >
                    <FaGithub className="text-lg" />
                  </motion.a>
                  <motion.a
                    href="https://linkedin.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-lg bg-secondary hover:bg-accent flex items-center justify-center text-foreground transition-colors"
                  >
                    <FaLinkedin className="text-lg" />
                  </motion.a>
                  <motion.a
                    href="https://discord.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-lg bg-secondary hover:bg-accent flex items-center justify-center text-foreground transition-colors"
                  >
                    <FaDiscord className="text-lg" />
                  </motion.a>
                </div>
              </div>

              <div className="space-y-3 lg:max-w-md">
                <h4 className="text-base font-semibold text-foreground">Stay Updated</h4>
                <p className="text-sm text-muted-foreground">
                  Get the latest crypto insights delivered to your inbox
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="flex-1 px-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                  />
                  <button className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap">
                    Subscribe
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bottom Section */}
        <motion.div
          className="mt-12 pt-8 border-t border-border"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-muted-foreground text-center md:text-left">
              <p className="flex items-center gap-1 justify-center md:justify-start">
                © {currentYear} Safe Guard. Made with <FaHeart className="text-red-500" /> for the crypto community.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Risk insights only — not financial advice. You are responsible for all decisions.
              </p>
            </div>
            <div className="flex flex-wrap justify-center md:justify-end gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                🚀 50+ Cryptocurrencies
              </span>
              <span className="flex items-center gap-1">
                ⚡ Real-time Updates
              </span>
              <span className="flex items-center gap-1">
                🔒 Secure & Private
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
