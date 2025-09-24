import { useEffect, useState, useCallback, useMemo } from 'react';
import { Address } from 'viem';
import { GryffindorsSDK } from './core';
import { 
  SessionInfo, 
  ChannelInfo, 
  TransactionResult, 
  ChannelOperation,
  TransactionParams 
} from './types';

// Main hook for Gryffindors SDK
export function useGryffindors(sdk: GryffindorsSDK): {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  sessionInfo: SessionInfo;
  balances: Record<string, string>;
  channels: Record<string, ChannelInfo>;
  errors: string[];
  isLoading: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  clearErrors: () => void;
  sdk: GryffindorsSDK;
} {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    isActive: false,
    sessionKey: null,
    account: null,
    expiresAt: null
  });
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, ChannelInfo>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Setup event listeners
  useEffect(() => {
    const unsubscribeConnection = sdk.onConnectionStatus(setConnectionStatus);
    const unsubscribeSession = sdk.onSessionChange(setSessionInfo);
    const unsubscribeBalance = sdk.onBalanceChange(setBalances);
    const unsubscribeChannel = sdk.onChannelChange(setChannels);
    const unsubscribeError = sdk.onError((error) => {
      setErrors(prev => [...prev, error]);
    });

    return () => {
      unsubscribeConnection();
      unsubscribeSession();
      unsubscribeBalance();
      unsubscribeChannel();
      unsubscribeError();
    };
  }, [sdk]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  // Initialize connection
  const connect = useCallback(async () => {
    setIsLoading(true);
    try {
      await sdk.initializeChannel();
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Disconnect
  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      await sdk.closeSession();
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Refresh data
  const refresh = useCallback(async () => {
    if (!sessionInfo.isActive) return;
    
    setIsLoading(true);
    try {
      await sdk.refreshBalances();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sdk, sessionInfo.isActive]);

  return {
    // State
    connectionStatus,
    sessionInfo,
    balances,
    channels,
    errors,
    isLoading,
    
    // Computed state
    isConnected: connectionStatus === 'connected',
    isAuthenticated: sessionInfo.isActive,
    
    // Actions
    connect,
    disconnect,
    refresh,
    clearErrors,
    
    // SDK instance for advanced usage
    sdk
  };
}

// Hook for channel operations
export function useGryffindorsChannels(sdk: GryffindorsSDK) {
  const [isOperating, setIsOperating] = useState(false);
  const [lastOperation, setLastOperation] = useState<TransactionResult | null>(null);

  const deposit = useCallback(async (params: ChannelOperation): Promise<TransactionResult> => {
    setIsOperating(true);
    try {
      const result = await sdk.performOperation('deposit', params);
      setLastOperation(result);
      return result;
    } catch (error) {
      const errorResult = { 
        success: false, 
        error: error instanceof Error ? error.message : 'Deposit failed' 
      };
      setLastOperation(errorResult);
      return errorResult;
    } finally {
      setIsOperating(false);
    }
  }, [sdk]);

  const withdraw = useCallback(async (params: ChannelOperation): Promise<TransactionResult> => {
    setIsOperating(true);
    try {
      const result = await sdk.performOperation('withdraw', params);
      setLastOperation(result);
      return result;
    } catch (error) {
      const errorResult = { 
        success: false, 
        error: error instanceof Error ? error.message : 'Withdrawal failed' 
      };
      setLastOperation(errorResult);
      return errorResult;
    } finally {
      setIsOperating(false);
    }
  }, [sdk]);

  const getChannelInfo = useCallback((tokenAddress: Address) => {
    return sdk.getChannelInfo(tokenAddress);
  }, [sdk]);

  const getAllChannels = useCallback(() => {
    return sdk.getAllChannels();
  }, [sdk]);

  return {
    // State
    isOperating,
    lastOperation,
    
    // Actions
    deposit,
    withdraw,
    getChannelInfo,
    getAllChannels
  };
}

// Hook for transfers
export function useGryffindorsTransfers(sdk: GryffindorsSDK) {
  const [isTransferring, setIsTransferring] = useState(false);
  const [lastTransfer, setLastTransfer] = useState<TransactionResult | null>(null);

  const transfer = useCallback(async (params: TransactionParams): Promise<TransactionResult> => {
    setIsTransferring(true);
    try {
      const result = await sdk.performOperation('transfer', params);
      setLastTransfer(result);
      return result;
    } catch (error) {
      const errorResult = { 
        success: false, 
        error: error instanceof Error ? error.message : 'Transfer failed' 
      };
      setLastTransfer(errorResult);
      return errorResult;
    } finally {
      setIsTransferring(false);
    }
  }, [sdk]);

  return {
    // State
    isTransferring,
    lastTransfer,
    
    // Actions
    transfer
  };
}

// Hook for session management
export function useGryffindorsSession(sdk: GryffindorsSDK) {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    isActive: false,
    sessionKey: null,
    account: null,
    expiresAt: null
  });

  useEffect(() => {
    const unsubscribe = sdk.onSessionChange(setSessionInfo);
    // Get initial session info
    setSessionInfo(sdk.getSessionInfo());
    return unsubscribe;
  }, [sdk]);

  const isSessionExpiring = useMemo(() => {
    if (!sessionInfo.expiresAt) return false;
    const timeUntilExpiry = sessionInfo.expiresAt - Date.now();
    return timeUntilExpiry < 300000; // 5 minutes
  }, [sessionInfo.expiresAt]);

  const timeUntilExpiry = useMemo(() => {
    if (!sessionInfo.expiresAt) return null;
    return Math.max(0, sessionInfo.expiresAt - Date.now());
  }, [sessionInfo.expiresAt]);

  return {
    sessionInfo,
    isSessionExpiring,
    timeUntilExpiry,
    isActive: sessionInfo.isActive
  };
}
