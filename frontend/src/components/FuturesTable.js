import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Search, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { apiService } from '../services/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const FuturesTable = () => {
  const navigate = useNavigate();
  const [futuresData, setFuturesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });

  useEffect(() => {
    fetchFuturesData();
  }, []);

  const fetchFuturesData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getComprehensiveMarketData('futures');
      setFuturesData(response.data || []);
    } catch (error) {
      console.error('Error fetching futures data:', error);
      setFuturesData([]);
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

  const sortedData = [...futuresData].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (sortConfig.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const filteredData = sortedData.filter(future =>
    future.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    future.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPrice = (price) => {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return price.toFixed(2);
  };

  const handleRowClick = (future) => {
    // Navigate to futures analysis page for any futures contract
    navigate(`/analysis/futures?symbol=${future.symbol}&name=${encodeURIComponent(future.name)}`);
  };

  const getTechRatingIcon = (rating) => {
    const normalizedRating = rating?.toLowerCase() || '';
    if (normalizedRating.includes('live data')) {
      return <ShieldCheck className="h-4 w-4 text-green-500" />;
    }
    return <Shield className="h-4 w-4 text-gray-400" />;
  };

  const getTechRatingColor = (rating) => {
    const normalizedRating = rating?.toLowerCase() || '';
    if (normalizedRating.includes('live data')) {
      return 'text-green-500';
    }
    return 'text-gray-400';
  };

  if (loading) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[400px] space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground">Loading futures data...</p>
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
          placeholder="Search futures..."
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
              <TableHead>Contract</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('price')}
              >
                <div className="flex items-center gap-2">
                  Price
                  {sortConfig.key === 'price' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('percent_change_24h')}
              >
                <div className="flex items-center gap-2">
                  24h Change
                  {sortConfig.key === 'percent_change_24h' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('change')}
              >
                <div className="flex items-center gap-2">
                  Change
                  {sortConfig.key === 'change' && (
                    <span className="text-primary">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </TableHead>
              <TableHead>High / Low</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredData.map((future) => (
                <TableRow 
                  key={future.symbol}
                  onClick={() => handleRowClick(future)}
                  className="cursor-pointer hover:bg-secondary/50 transition-colors"
                >
                  <TableCell className="font-medium text-muted-foreground">
                    #{future.rank}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{future.name}</span>
                        {future.category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            future.category === 'Metals' 
                              ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' 
                              : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                          }`}>
                            {future.category}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">{future.symbol}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {future.price > 0 ? `$${formatPrice(future.price)}` : <span className="text-muted-foreground text-sm">N/A</span>}
                  </TableCell>
                  <TableCell>
                    {future.price > 0 ? (
                      <div className={`flex items-center gap-2 font-medium ${future.percent_change_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {future.percent_change_24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        <span>{Math.abs(future.percent_change_24h).toFixed(2)}%</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {future.price > 0 ? (
                      <span className={`font-medium ${future.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {future.change >= 0 ? '+' : ''}{formatPrice(future.change)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {future.price > 0 ? (
                      <div className="flex flex-col">
                        <span className="text-green-500">{formatPrice(future.high)}</span>
                        <span className="text-red-500 text-xs">{formatPrice(future.low)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {filteredData.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No futures found matching your search.</p>
        </div>
      )}
    </div>
  );
};

export default FuturesTable;
