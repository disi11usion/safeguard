import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Bitcoin, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import CryptoTable from './CryptoTable';
import StocksTable from './StocksTable';
import ForexTable from './ForexTable';
import FuturesTable from './FuturesTable';

const ComprehensiveTable = ({ preferredCoins = null, selectedCoin, setSelectedCoin, setCoinLoading, onExchangeChange }) => {
  const [activeTab, setActiveTab] = useState('crypto');

  return (
    <section id="comprehensive-markets" className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Comprehensive Market Data
          </h2>
          <p className="text-muted-foreground text-lg">
            Real-time data across cryptocurrencies, stocks, forex, and futures
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8 bg-card/50 p-1 rounded-xl border border-border">
              <TabsTrigger
                value="crypto"
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Bitcoin className="h-4 w-4" />
                <span className="hidden sm:inline">Cryptocurrencies</span>
                <span className="sm:hidden">Crypto</span>
              </TabsTrigger>
              <TabsTrigger
                value="stocks"
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Stocks</span>
                <span className="sm:hidden">Stocks</span>
              </TabsTrigger>
              <TabsTrigger
                value="forex"
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <DollarSign className="h-4 w-4" />
                <span className="hidden sm:inline">Forex</span>
                <span className="sm:hidden">Forex</span>
              </TabsTrigger>
              <TabsTrigger
                value="futures"
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Futures</span>
                <span className="sm:hidden">Futures</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="crypto" className="mt-0">
              <CryptoTable
                preferredCoins={preferredCoins}
                selectedCoin={selectedCoin}
                setSelectedCoin={setSelectedCoin}
                setCoinLoading={setCoinLoading}
                onExchangeChange={onExchangeChange}
                showTitle={false}
              />
            </TabsContent>

            <TabsContent value="stocks" className="mt-0">
              <StocksTable />
            </TabsContent>

            <TabsContent value="forex" className="mt-0">
              <ForexTable />
            </TabsContent>

            <TabsContent value="futures" className="mt-0">
              <FuturesTable />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </section>
  );
};

export default ComprehensiveTable;
