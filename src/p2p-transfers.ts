import { useCallback, useState } from 'react';
import { Address } from 'viem';
import { GryffindorsSDK } from './core';
import { TransactionResult } from './types';

// P2P Transfer specific types
export interface P2PTransferParams {
  to: Address;
  amount: string;
  asset?: string;
}

export interface P2PTransferResult extends TransactionResult {
  transferId?: string;
  timestamp?: number;
}

export interface P2PTransferState {
  isTransferring: boolean;
  lastTransfer: P2PTransferResult | null;
  transferHistory: P2PTransferResult[];
  status: string | null;
}

// Enhanced P2P Transfer Hook
export function useP2PTransfers(sdk: GryffindorsSDK) {
  const [isTransferring, setIsTransferring] = useState(false);
  const [lastTransfer, setLastTransfer] = useState<P2PTransferResult | null>(null);
  const [transferHistory, setTransferHistory] = useState<P2PTransferResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  // Main P2P transfer function
  const transfer = useCallback(async (params: P2PTransferParams): Promise<P2PTransferResult> => {
    console.log('🚀 P2P Transfer Hook: Starting transfer...', params);
    setIsTransferring(true);
    setStatus('Preparing transfer...');

    try {
      // Validate session
      if (!sdk.isSessionActive()) {
        console.log('❌ P2P Transfer Hook: Session not active');
        throw new Error('Please authenticate first');
      }

      console.log('✅ P2P Transfer Hook: Session is active');
      setStatus('Sending transfer...');
      
      // Execute transfer through SDK
      console.log('📤 P2P Transfer Hook: Calling SDK performOperation...');
      const result = await sdk.performOperation('transfer', {
        to: params.to,
        amount: params.amount,
        asset: params.asset || 'usdc'
      });

      console.log('📊 P2P Transfer Hook: SDK result:', result);

      const transferResult: P2PTransferResult = {
        ...result,
        transferId: `transfer_${Date.now()}`,
        timestamp: Date.now()
      };

      setLastTransfer(transferResult);
      
      if (result.success) {
        console.log('✅ P2P Transfer Hook: Transfer successful!');
        setStatus('Transfer completed successfully!');
        setTransferHistory(prev => [transferResult, ...prev.slice(0, 9)]); // Keep last 10
      } else {
        console.log('❌ P2P Transfer Hook: Transfer failed:', result.error);
        setStatus(null);
      }

      return transferResult;
    } catch (error) {
      console.error('💥 P2P Transfer Hook: Error:', error);
      const errorResult: P2PTransferResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed',
        timestamp: Date.now()
      };
      
      setLastTransfer(errorResult);
      setStatus(null);
      return errorResult;
    } finally {
      setIsTransferring(false);
      // Clear status after 3 seconds
      setTimeout(() => setStatus(null), 3000);
    }
  }, [sdk]);

  // Quick transfer with predefined amount (like the tutorial example)
  const quickTransfer = useCallback(async (recipient: Address, amount: string = '0.01'): Promise<P2PTransferResult> => {
    return transfer({
      to: recipient,
      amount,
      asset: 'usdc'
    });
  }, [transfer]);

  // Support function (like sponsoring an author)
  const support = useCallback(async (recipient: Address, amount: string = '0.01'): Promise<P2PTransferResult> => {
    setStatus(`Supporting with ${amount} USDC...`);
    return quickTransfer(recipient, amount);
  }, [quickTransfer]);

  // Clear transfer history
  const clearHistory = useCallback(() => {
    setTransferHistory([]);
    setLastTransfer(null);
  }, []);

  return {
    // State
    isTransferring,
    lastTransfer,
    transferHistory,
    status,
    
    // Actions
    transfer,
    quickTransfer,
    support,
    clearHistory,
    
    // Computed state
    hasTransfers: transferHistory.length > 0,
    successfulTransfers: transferHistory.filter(t => t.success).length,
    failedTransfers: transferHistory.filter(t => !t.success).length
  };
}

// Hook for managing transfer recipients (like the users data from tutorial)
export function useTransferRecipients() {
  const [recipients, setRecipients] = useState<Array<{
    id: string;
    name: string;
    address: Address;
    avatar?: string;
  }>>([]);

  const addRecipient = useCallback((recipient: {
    id: string;
    name: string;
    address: Address;
    avatar?: string;
  }) => {
    setRecipients(prev => {
      const exists = prev.find(r => r.address === recipient.address);
      if (exists) return prev;
      return [...prev, recipient];
    });
  }, []);

  const removeRecipient = useCallback((address: Address) => {
    setRecipients(prev => prev.filter(r => r.address !== address));
  }, []);

  const getRecipient = useCallback((address: Address) => {
    return recipients.find(r => r.address === address);
  }, [recipients]);

  return {
    recipients,
    addRecipient,
    removeRecipient,
    getRecipient
  };
}

// Utility functions for P2P transfers
export const P2PTransferUtils = {
  // Format transfer amount for display
  formatAmount: (amount: string, decimals: number = 2): string => {
    const num = parseFloat(amount);
    return isNaN(num) ? '0.00' : num.toFixed(decimals);
  },

  // Format address for display
  formatAddress: (address: Address): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },

  // Validate transfer amount
  validateAmount: (amount: string): { isValid: boolean; error?: string } => {
    const num = parseFloat(amount);
    if (isNaN(num)) {
      return { isValid: false, error: 'Invalid amount' };
    }
    if (num <= 0) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }
    if (num > 1000000) {
      return { isValid: false, error: 'Amount too large' };
    }
    return { isValid: true };
  },

  // Validate address
  validateAddress: (address: string): { isValid: boolean; error?: string } => {
    if (!address) {
      return { isValid: false, error: 'Address is required' };
    }
    if (!address.startsWith('0x')) {
      return { isValid: false, error: 'Address must start with 0x' };
    }
    if (address.length !== 42) {
      return { isValid: false, error: 'Address must be 42 characters long' };
    }
    return { isValid: true };
  },

  // Generate transfer summary
  generateTransferSummary: (params: P2PTransferParams): string => {
    const amount = P2PTransferUtils.formatAmount(params.amount);
    const asset = (params.asset || 'USDC').toUpperCase();
    const recipient = P2PTransferUtils.formatAddress(params.to);
    return `Send ${amount} ${asset} to ${recipient}`;
  }
};