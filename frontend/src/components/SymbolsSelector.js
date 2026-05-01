import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { apiService } from '../services/api';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const SymbolsSelector = ({
    marketType = 'stocks',  // 'stocks' | 'futures' | 'forex'
    value = '',             // Currently selected symbol (single mode) or array (multi mode)
    onValueChange,          // Callback when selection changes: (symbol(s), item(s)) => void
    placeholder = 'Select symbol...',
    className = '',
    disabled = false,
    multiSelect = false,    // Enable multi-select mode with Apply button
    onApply = null,         // Callback when Apply button is clicked in multi-select mode
    maxSelections = 3       // Maximum number of selections allowed (default: 3)
}) => {
    const [symbols, setSymbols] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedSymbols, setSelectedSymbols] = useState(multiSelect ? (Array.isArray(value) ? value : []) : []);
    const [showLimitWarning, setShowLimitWarning] = useState(false);

    useEffect(() => {
        fetchSymbols();
    }, [marketType]);

    useEffect(() => {
        if (multiSelect && Array.isArray(value)) {
            setSelectedSymbols(value);
        }
    }, [value, multiSelect]);

    const fetchSymbols = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await apiService.getComprehensiveMarketData(marketType);

            if (response && response.data) {
                setSymbols(response.data);
            } else {
                setSymbols([]);
            }
        } catch (err) {
            console.error('Error fetching symbols:', err);
            setError(err.message || 'Failed to fetch symbols');
            setSymbols([]);
        } finally {
            setLoading(false);
        }
    }, [marketType]);

    const handleSelect = useCallback((item) => {
        if (multiSelect) {
            // Multi-select mode: toggle selection
            const symbol = item.symbol;
            setSelectedSymbols(prev => {
                if (prev.includes(symbol)) {
                    // Deselect: remove from array
                    setShowLimitWarning(false);
                    return prev.filter(s => s !== symbol);
                } else {
                    // Select: check if limit reached
                    if (prev.length >= maxSelections) {
                        setShowLimitWarning(true);
                        // Auto-hide warning after 3 seconds
                        setTimeout(() => setShowLimitWarning(false), 3000);
                        return prev; // Don't add if limit reached
                    }
                    setShowLimitWarning(false);
                    return [...prev, symbol];
                }
            });
        } else {
            // Single-select mode: select and close
            const newValue = item.symbol;
            if (onValueChange) {
                onValueChange(newValue, item);
            }
            setIsOpen(false);
            setSearchTerm('');
        }
    }, [multiSelect, onValueChange, maxSelections]);

    const handleApply = useCallback(() => {
        if (multiSelect && onApply) {
            const selectedItems = symbols.filter(s => selectedSymbols.includes(s.symbol));
            onApply(selectedSymbols, selectedItems);
        }
        setIsOpen(false);
        setSearchTerm('');
    }, [multiSelect, onApply, symbols, selectedSymbols]);

    const filteredSymbols = useMemo(() => {
        if (!searchTerm) return symbols;
        const search = searchTerm.toLowerCase();
        return symbols.filter((item) =>
            item.symbol?.toLowerCase().includes(search) ||
            item.name?.toLowerCase().includes(search)
        );
    }, [symbols, searchTerm]);

    const displayText = useMemo(() => {
        if (multiSelect) {
            return selectedSymbols.length > 0
                ? `${selectedSymbols.length} selected`
                : placeholder;
        }
        const selectedItem = symbols.find((item) => item.symbol === value);
        return selectedItem
            ? `${selectedItem.symbol}${selectedItem.name ? ` - ${selectedItem.name}` : ''}`
            : placeholder;
    }, [multiSelect, selectedSymbols, symbols, value, placeholder]);

    const getMarketLabel = () => {
        switch (marketType) {
            case 'stocks':
                return 'Stocks';
            case 'futures':
                return 'Futures';
            case 'forex':
                return 'Forex';
            default:
                return 'Symbols';
        }
    };

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    disabled={disabled || loading}
                    className={`
            flex items-center justify-between w-full px-2 py-1 
            bg-secondary border border-border rounded-lg 
            text-left text-sm font-medium text-foreground
            hover:bg-secondary/80 
            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all
            ${className}
          `}
                >
                    <span className={`truncate ${!value ? 'text-muted-foreground' : ''}`}>
                        {loading ? 'Loading...' : displayText}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                className="w-[300px] max-h-[400px] overflow-hidden p-0"
                align="start"
            >
                {/* Header with Market Type */}
                <div className='inline-flex items-center justify-between w-full'>
                    <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold">
                        {getMarketLabel()}
                    </DropdownMenuLabel>
                    {!loading && !error && filteredSymbols.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                {filteredSymbols.length} {filteredSymbols.length === 1 ? 'symbol' : 'symbols'}
                                {searchTerm && ` matching "${searchTerm}"`}
                            </div>
                        </>
                    )}
                    {/* Apply Button for Multi-Select Mode */}
                    {multiSelect && !loading && !error && (
                        <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1">
                                <button
                                    onClick={handleApply}
                                    disabled={selectedSymbols.length === 0}
                                    className="text-xs w-full px-2 py-1 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Apply ({selectedSymbols.length})
                                </button>
                            </div>
                        </>
                    )}
                </div>
                {/* Search Input */}
                <div className="px-3 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search symbols..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>

                {/* Limit Warning Message */}
                {showLimitWarning && multiSelect && (
                    <div className="mx-3 mb-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                            Free users can compare up to {maxSelections} stocks only.
                        </p>
                    </div>
                )}

                <DropdownMenuSeparator />

                {/* Symbol List */}
                <div className="max-h-[280px] overflow-y-auto">
                    {error ? (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                            <p className="text-red-500 mb-2">Error: {error}</p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fetchSymbols();
                                }}
                                className="text-primary hover:underline"
                            >
                                Retry
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                            <div className="inline-block h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                            <p>Loading symbols...</p>
                        </div>
                    ) : filteredSymbols.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                            {searchTerm ? 'No symbols found' : 'No symbols available'}
                        </div>
                    ) : (
                        filteredSymbols.map((item) => (
                            <DropdownMenuItem
                                key={item.symbol}
                                onSelect={(e) => {
                                    // Prevent default close behavior in multi-select mode
                                    if (multiSelect) {
                                        e.preventDefault();
                                    }
                                    handleSelect(item);
                                }}
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {multiSelect && (
                                        <div className={`
                      h-4 w-4 rounded border-2 flex items-center justify-center shrink-0
                      ${selectedSymbols.includes(item.symbol)
                                                ? 'bg-primary border-primary'
                                                : 'border-muted-foreground'
                                            }
                    `}>
                                            {selectedSymbols.includes(item.symbol) && (
                                                <Check className="h-3 w-3 text-primary-foreground" />
                                            )}
                                        </div>
                                    )}
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="font-semibold text-sm text-foreground">
                                            {item.symbol}
                                        </span>
                                        {item.name && (
                                            <span className="text-xs text-muted-foreground truncate">
                                                {item.name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {!multiSelect && value === item.symbol && (
                                    <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />
                                )}
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default SymbolsSelector;
