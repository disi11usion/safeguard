import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { Fish, ArrowRight, ArrowRightLeft, ExternalLink } from 'lucide-react';

const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
};

const shortenAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export default function WhalesTransaction({ coinId = 'btc' }) {
    const [whaleTransactions, setWhaleTransactions] = useState([]);
    const [isWhaleLoading, setIsWhaleLoading] = useState(true);
    const [whaleError, setWhaleError] = useState(null);

    useEffect(() => {
        if (!coinId) return;
        
        const fetchWhaleData = async () => {
            setIsWhaleLoading(true);
            setWhaleError(null);
            try {
                const response = await apiService.getWhaleTransactions(coinId.toLowerCase());
                if (response.success) {
                    setWhaleTransactions(response.transactions);
                } else {
                    setWhaleError('Failed to fetch whale data.');
                }
            } catch (err) {
                console.error("Whale data fetch error:", err);
                setWhaleError('An error occurred while fetching whale transactions.');
            } finally {
                setIsWhaleLoading(false);
            }
        };
        
        fetchWhaleData();
    }, [coinId]);

    const renderWhaleTransactions = () => {
        if (isWhaleLoading) {
            return (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-card/30 rounded-lg border border-border/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                    <p className="text-sm text-muted-foreground">Loading Whale Transactions...</p>
                </div>
            );
        }

        if (whaleError) {
            return (
                <div className="flex items-center justify-center py-12 bg-destructive/10 rounded-lg border border-destructive/50">
                    <p className="text-sm text-destructive">{whaleError}</p>
                </div>
            );
        }

        if (!whaleTransactions || whaleTransactions.length === 0) {
            return (
                <div className="flex items-center justify-center py-12 bg-card/30 rounded-lg border border-border/50">
                    <p className="text-sm text-muted-foreground">No recent whale transactions found.</p>
                </div>
            );
        }

        // Transaction Item sub-component for better readability
        const TransactionItem = ({ tx }) => {
            const sender = tx.senders[0]?.[0];
            const receiver = tx.receivers[0]?.[0];
            const explorerUrl = `https://www.blockchain.com/btc/tx/${tx.hash}`; // Example for BTC

            return (
                <li className="flex items-center justify-between gap-4 p-1 border-b border-border/50 last:border-b-0 hover:bg-muted/30 rounded-md transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 p-2 bg-blue-500/10 rounded-full">
                            <ArrowRightLeft className="h-5 w-5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-foreground text-sm">
                                {tx.total.toFixed(4)} {tx.blockchain}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                                <span className="font-mono">{shortenAddress(sender)}</span>
                                <ArrowRight className="h-3 w-3 flex-shrink-0" />
                                <span className="font-mono">{shortenAddress(receiver)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimeAgo(tx.timestamp)}
                        </span>
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </div>
                </li>
            );
        };

        return (
            <div>
                <div className="flex items-center gap-3 pb-3 border-b border-border/50">
                    <Fish className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-bold text-foreground">
                        Recent Whale Transactions
                    </h3>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase">
                        {coinId}
                    </span>
                </div>
                <ul className="space-y-1 max-h-96 overflow-y-auto pr-2 m-0 p-0">
                    {whaleTransactions.map(tx => <TransactionItem key={tx.hash} tx={tx} />)}
                </ul>
            </div>
        );
    };

    return (
        <div>
            {renderWhaleTransactions()}
        </div>
    );
}
