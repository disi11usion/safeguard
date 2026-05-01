import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Coins, TrendingUp, Building2, DollarSign, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";

const PreferenceTable = ({ onAssetSelect, selectedAsset }) => {
    const { user } = useAuth();
    const [assetData, setAssetData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const navigate = useNavigate();

    useEffect(() => {
        if (user && user.username) {
            fetchPreferenceAssets();
        }
    }, [user]);

    const fetchPreferenceAssets = async () => {
        try {
            setLoading(true);
            const response = await apiService.getUserPreferenceAssets(user.username);
            setAssetData(response.assets || []);
        } catch (error) {
            console.error('Error fetching preference assets:', error);
            setAssetData([]);
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

    const sortedData = [...assetData].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (sortConfig.direction === 'asc') {
            return aValue > bValue ? 1 : -1;
        } else {
            return aValue < bValue ? 1 : -1;
        }
    });

    const filteredData = sortedData.filter(asset =>
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Get category icon
    const getCategoryIcon = (category) => {
        switch (category) {
            case 'crypto':
                return <Coins className="h-4 w-4" />;
            case 'stock':
                return <Building2 className="h-4 w-4" />;
            case 'forex':
                return <DollarSign className="h-4 w-4" />;
            case 'futures':
                return <Trophy className="h-4 w-4" />;
            default:
                return null;
        }
    };

    // Get category display name
    const getCategoryDisplay = (category) => {
        switch (category) {
            case 'crypto':
                return 'Cryptos';
            case 'stock':
                return 'Stock';
            case 'forex':
                return 'Forex';
            case 'futures':
                return 'Futures';
            default:
                return category;
        }
    };

    // Get category color
    const getCategoryColor = (category) => {
        switch (category) {
            case 'crypto':
                return 'text-yellow-500 bg-yellow-500/10';
            case 'stock':
                return 'text-blue-500 bg-blue-500/10';
            case 'forex':
                return 'text-green-500 bg-green-500/10';
            case 'futures':
                return 'text-purple-500 bg-purple-500/10';
            default:
                return 'text-gray-500 bg-gray-500/10';
        }
    };

    const handleRowClick = (asset) => {
        // If onAssetSelect callback is provided, use it (for Dashboard)
        if (onAssetSelect) {
            onAssetSelect(asset);
        } else {
            // Otherwise navigate to analysis page (for standalone usage)
            const marketMap = {
                'crypto': 'crypto',
                'stock': 'stock',
                'forex': 'forex',
                'futures': 'forex' // Futures use forex endpoint
            };
            const market = marketMap[asset.category] || 'crypto';
            navigate(`/analysis/ticker?symbol=${asset.ticker}&name=${encodeURIComponent(asset.name)}&market=${market}`);
        }
    };

    if (loading) {
        return (
            <motion.div
                className="flex flex-col items-center justify-center min-h-[400px] space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
            >
                <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground">Loading your preference assets...</p>
            </motion.div>
        );
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <p className="text-muted-foreground">Please log in to view your preference assets.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Scrollable Table Container */}
            <div className="flex-1 overflow-auto border border-border bg-card max-h-[300px]">
                <Table>
                    <TableBody>
                        <AnimatePresence>
                            {filteredData.map((asset) => {
                                const isSelected = selectedAsset && selectedAsset.crypto_id === asset.crypto_id;
                                return (
                                <TableRow
                                    key={asset.crypto_id}
                                    onClick={() => handleRowClick(asset)}
                                    className={`cursor-pointer transition-colors ${
                                        isSelected 
                                            ? 'bg-primary/10 hover:bg-primary/15' 
                                            : 'hover:bg-muted/50'
                                    }`}
                                >
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-semibold text-foreground text-sm leading-tight">
                                                {asset.name}
                                            </span>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {/* Category Tag */}
                                                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${getCategoryColor(asset.category)}`}>
                                                    {getCategoryIcon(asset.category)}
                                                    <span>{asset.category.toUpperCase()}</span>
                                                </div>
                                                {/* Date Tag */}
                                                {asset.selected_at && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                                                        <span>{new Date(asset.selected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right py-3">
                                        <span className="font-mono font-bold text-foreground text-sm">
                                            {asset.ticker}
                                        </span>
                                    </TableCell>
                                </TableRow>
                                );
                            })}
                        </AnimatePresence>
                    </TableBody>
                </Table>

                {/* Empty State inside scrollable area */}
                {filteredData.length === 0 && !loading && (
                    <div className="text-center py-12 space-y-4">
                        <p className="text-muted-foreground text-lg">No preference assets found.</p>
                        <p className="text-sm text-muted-foreground">
                            Complete your <a href="/preferences" className="text-primary underline">investment profile assessment</a> to select your preferred assets.
                        </p>
                    </div>
                )}
            </div>

            {/* Fixed Summary Statistics at Bottom */}
            {assetData.length > 0 && (
                <div className="p-3 border-t border-border bg-card/50 backdrop-blur-sm">
                    <div className="flex items-center gap-x-6">
                        {['crypto', 'stock', 'forex', 'futures'].map(category => {
                            const count = assetData.filter(a => a.category === category).length;
                            if (count === 0) return null;
                            return (
                                <div key={category} className="flex items-center gap-2">
                                    {getCategoryIcon(category)}
                                    <span className="text-xs text-muted-foreground">{getCategoryDisplay(category)}</span>
                                    <div className="text-sm font-bold text-foreground">{count}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PreferenceTable;
