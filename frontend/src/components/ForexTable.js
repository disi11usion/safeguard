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

const ForexTable = () => {
  const navigate = useNavigate();
  const [forexData, setForexData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });

  useEffect(() => {
    fetchForexData();
  }, []);

  const fetchForexData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getComprehensiveMarketData('forex');
      setForexData(response.data || []);
    } catch (error) {
      console.error('Error fetching forex data:', error);
      setForexData([]);
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

  const sortedData = [...forexData].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (sortConfig.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const filteredData = sortedData.filter(pair =>
    pair.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pair.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPrice = (price) => {
    if (price === "N/A" || price === undefined || price === null) {
      return "N/A";
    }
    if (typeof price === 'string') {
      return price;
    }
    if (price >= 1000) {
      return price.toFixed(2);
    } else if (price >= 1) {
      return price.toFixed(4);
    }
    return price.toFixed(6);
  };

  const formatVolume = (volume) => {
    if (volume === "N/A" || volume === undefined || volume === null) {
      return "N/A";
    }
    if (typeof volume === 'string') {
      return volume;
    }
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toLocaleString();
  };

  const handleRowClick = (pair) => {
    // Navigate to TickerAnalyze page with ticker parameter
    const cleanSymbol = pair.symbol.replace(/^C:/, '');
    navigate(`/analysis/ticker?symbol=${encodeURIComponent(cleanSymbol)}&name=${encodeURIComponent(pair.name)}&market=forex`);
  };

  if (loading) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[400px] space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground">Loading forex data...</p>
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
          placeholder="Search forex pairs..."
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
              <TableHead>Pair</TableHead>
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
                onClick={() => handleSort('volume')}
              >
                <div className="flex items-center gap-2">
                  Volume
                  {sortConfig.key === 'volume' && (
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
              {/* <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('trades')}
              >
                <div className="flex items-center gap-2">
                  Trades
                  {sortConfig.key === 'trades' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead> */}
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredData.map((pair) => (
                <TableRow 
                  key={pair.symbol}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleRowClick(pair)}
                  data-ticker={pair.ticker}
                >
                  <TableCell className="font-medium text-muted-foreground">
                    #{pair.rank}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{pair.symbol}</span>
                      <span className="text-sm text-muted-foreground">{pair.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {formatPrice(pair.vwap)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatVolume(pair.volume)}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const changePercent = typeof pair.change_percent === 'number' 
                        ? pair.change_percent 
                        : parseFloat(pair.change_percent);
                      
                      if (isNaN(changePercent) || pair.change_percent === "N/A" || pair.change_percent === undefined || pair.change_percent === null) {
                        return <span className="text-muted-foreground">N/A</span>;
                      }
                      
                      return (
                        <div className={`flex items-center gap-2 font-medium ${changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {changePercent >= 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          <span>
                            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex flex-col">
                      <span>{formatPrice(pair.open)}</span>
                      <span className="text-xs opacity-70">{formatPrice(pair.close)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex flex-col">
                      <span className="text-green-500">{formatPrice(pair.high)}</span>
                      <span className="text-red-500 text-xs">{formatPrice(pair.low)}</span>
                    </div>
                  </TableCell>
                  {/* <TableCell className="font-medium text-foreground">
                    {formatVolume(pair.trades || 0)}
                  </TableCell> */}
                </TableRow>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {filteredData.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No forex pairs found matching your search.</p>
        </div>
      )}
    </div>
  );
};

export default ForexTable;
