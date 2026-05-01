import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const CryptoTable = () => {
  const [cryptoData, setCryptoData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchCryptoData();
  }, []);

  const fetchCryptoData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getComprehensiveMarketData('crypto');
      setCryptoData(response.data || []);
    } catch (error) {
      console.error('Error fetching crypto data:', error);
      setCryptoData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedData = [...cryptoData].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (sortConfig.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const filteredData = sortedData.filter(crypto =>
    crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPrice = (price) => {
    if (price === "N/A" || price === undefined || price === null) {
      return "N/A";
    }
    if (typeof price === 'string') {
      return price; // Already formatted
    }
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMarketCap = (marketCap) => {
    if (marketCap === "N/A" || marketCap === undefined || marketCap === null) {
      return "N/A";
    }
    if (typeof marketCap === 'string') {
      return marketCap; // Already formatted
    }
    if (marketCap >= 1e12) {
      return `$${(marketCap / 1e12).toFixed(2)}T`;
    } else if (marketCap >= 1e9) {
      return `$${(marketCap / 1e9).toFixed(2)}B`;
    } else if (marketCap >= 1e6) {
      return `$${(marketCap / 1e6).toFixed(2)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  };

  const formatVolume = (volume) => {
    if (volume === "N/A" || volume === undefined || volume === null) {
      return "N/A";
    }
    if (typeof volume === 'string') {
      return volume; // Already formatted
    }
    if (volume >= 1e9) {
      return `${(volume / 1e9).toFixed(2)}B`;
    } else if (volume >= 1e6) {
      return `${(volume / 1e6).toFixed(2)}M`;
    } else if (volume >= 1e3) {
      return `${(volume / 1e3).toFixed(2)}K`;
    }
    return volume.toLocaleString();
  };

  const handleRowClick = (crypto) => {
    // Remove X: prefix from symbol if present
    const cleanSymbol = crypto.symbol.replace(/^X:/, '');
    navigate(`/analysis/ticker?symbol=${cleanSymbol}&name=${encodeURIComponent(crypto.name)}&market=crypto`);
  };

  if (loading) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[400px] space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground">Loading crypto data...</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search crypto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('rank')}
              >
                <div className="flex items-center gap-2">
                  Rank
                  {sortConfig.key === 'rank' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('vwap')}
              >
                <div className="flex items-center gap-2">
                  VWAP
                  {sortConfig.key === 'vwap' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('change_percent')}
              >
                <div className="flex items-center gap-2">
                  24h Change
                  {sortConfig.key === 'change_percent' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead>
              <TableHead>Open / Close</TableHead>
              <TableHead>High / Low</TableHead>
              <TableHead>Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredData.map((crypto) => (
                <TableRow 
                  key={crypto.symbol}
                  onClick={() => handleRowClick(crypto)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="font-medium text-muted-foreground">
                    #{crypto.rank}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{crypto.name}</span>
                      <span className="text-sm text-muted-foreground">{crypto.symbol}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {formatPrice(crypto.vwap)}
                  </TableCell>
                  <TableCell>
                    {crypto.change_percent === "N/A" || !crypto.change_percent ? (
                      <span className="text-muted-foreground">N/A</span>
                    ) : (
                      <div className={`flex items-center gap-2 font-medium ${
                        typeof crypto.change_percent === 'string' && crypto.change_percent.includes('-') 
                          ? 'text-red-500' 
                          : 'text-green-500'
                      }`}>
                        {typeof crypto.change_percent === 'string' && crypto.change_percent.includes('-') ? (
                          <TrendingDown className="h-4 w-4" />
                        ) : (
                          <TrendingUp className="h-4 w-4" />
                        )}
                        <span>{crypto.change_percent}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex flex-col text-sm">
                      <span>{formatPrice(crypto.open)}</span>
                      <span className="text-muted-foreground">{formatPrice(crypto.close)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex flex-col text-sm">
                      <span className="text-green-500">{formatPrice(crypto.high)}</span>
                      <span className="text-red-500">{formatPrice(crypto.low)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatVolume(crypto.volume)}
                  </TableCell>
                </TableRow>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {filteredData.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No crypto found matching your search.</p>
        </div>
      )}
    </div>
  );
};

export default CryptoTable;
