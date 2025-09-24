import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, type WalletClient } from "viem";
import {
  YellowNetworkSDK,
  createYellowNetworkSDK,
  type YellowNetworkConfig,
  type ConnectionStatus,
  type AuthenticationState,
  type ChannelState,
  type DepositParams,
  type WithdrawParams,
  type TransferParams,
  type ChannelResult,
  type TransferResult,
  type NetworkType,
} from "./yellow-network-sdk";

// ============================================================
// HOOK TYPES
// ============================================================

export interface UseYellowNetworkOptions {
  config?: Partial<YellowNetworkConfig>;
  network?: NetworkType;
  autoConnect?: boolean;
}

export interface UseYellowNetworkReturn {
  // Connection state
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;

  // Authentication state
  authState: AuthenticationState;
  isAuthenticated: boolean;
  isAuthenticating: boolean;

  // Balances
  balances: Record<string, string>;

  // Channels
  channels: Record<string, ChannelState>;

  // Transfer state
  isTransferring: boolean;

  // Error state
  error: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  authenticate: (walletClient: WalletClient, account: Address) => Promise<void>;
  logout: () => void;

  // Channel management
  openChannel: (params: DepositParams) => Promise<ChannelResult>;
  closeChannel: (params: WithdrawParams) => Promise<ChannelResult>;
  getChannelBalance: (
    tokenAddress: Address,
    userAddress?: Address
  ) => Promise<string>;
  refreshChannelBalances: () => Promise<void>;

  // Balance management
  fetchBalances: () => Promise<void>;
  getBalance: (asset: string) => string | null;

  // Transfers
  transfer: (params: TransferParams) => Promise<TransferResult>;

  // Utility
  sdk: YellowNetworkSDK | null;
  formatAmount: (amount: bigint, decimals?: number) => string;
  parseAmount: (amount: string, decimals?: number) => bigint;
  getNetworkConfig: () => {
    network: NetworkType;
    custodyAddress: Address;
    usdcAddress: Address;
  } | null;
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useYellowNetwork(
  options: UseYellowNetworkOptions = {}
): UseYellowNetworkReturn {
  const { config = {}, network = "mainnet", autoConnect = true } = options;

  // SDK instance
  const sdkRef = useRef<YellowNetworkSDK | null>(null);

  // State
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("Disconnected");
  const [authState, setAuthState] = useState<AuthenticationState>({
    isAuthenticated: false,
    isAuthAttempted: false,
    sessionKey: null,
    account: null,
  });
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, ChannelState>>({});
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize SDK
  useEffect(() => {
    if (!sdkRef.current) {
      sdkRef.current = createYellowNetworkSDK({ ...config, network });

      // Set up event listeners
      const unsubscribers = [
        sdkRef.current.onConnectionStatusChange(setConnectionStatus),
        sdkRef.current.onAuthStateChange(setAuthState),
        sdkRef.current.onBalanceChange(setBalances),
        sdkRef.current.onChannelChange(setChannels),
        sdkRef.current.onTransferComplete((result) => {
          setIsTransferring(false);
          if (!result.success && result.error) {
            setError(result.error);
          }
        }),
        sdkRef.current.onError(setError),
      ];

      // Auto-connect if enabled
      if (autoConnect) {
        sdkRef.current.connect();
      }

      // Cleanup function
      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        if (sdkRef.current) {
          sdkRef.current.disconnect();
          sdkRef.current = null;
        }
      };
    }
  }, [network, autoConnect]);

  // ============================================================
  // CONNECTION ACTIONS
  // ============================================================

  const connect = useCallback(() => {
    if (sdkRef.current) {
      setError(null);
      sdkRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    if (sdkRef.current) {
      sdkRef.current.disconnect();
    }
  }, []);

  // ============================================================
  // AUTHENTICATION ACTIONS
  // ============================================================

  const authenticate = useCallback(
    async (walletClient: WalletClient, account: Address) => {
      if (!sdkRef.current) {
        throw new Error("SDK not initialized");
      }

      try {
        setError(null);
        await sdkRef.current.authenticate(walletClient, account);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Authentication failed";
        setError(errorMessage);
        throw error;
      }
    },
    []
  );

  const logout = useCallback(() => {
    if (sdkRef.current) {
      setError(null);
      sdkRef.current.logout();
    }
  }, []);

  // ============================================================
  // CHANNEL MANAGEMENT ACTIONS
  // ============================================================

  const openChannel = useCallback(
    async (params: DepositParams): Promise<ChannelResult> => {
      if (!sdkRef.current) {
        return { success: false, error: "SDK not initialized" };
      }

      try {
        setError(null);
        const result = await sdkRef.current.openChannel(params);

        if (!result.success && result.error) {
          setError(result.error);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to open channel";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const closeChannel = useCallback(
    async (params: WithdrawParams): Promise<ChannelResult> => {
      if (!sdkRef.current) {
        return { success: false, error: "SDK not initialized" };
      }

      try {
        setError(null);
        const result = await sdkRef.current.closeChannel(params);

        if (!result.success && result.error) {
          setError(result.error);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to close channel";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const getChannelBalance = useCallback(
    async (tokenAddress: Address, userAddress?: Address): Promise<string> => {
      if (!sdkRef.current) {
        return "0";
      }

      try {
        return await sdkRef.current.getChannelBalance(
          tokenAddress,
          userAddress
        );
      } catch (error) {
        console.error("Failed to get channel balance:", error);
        return "0";
      }
    },
    []
  );

  const refreshChannelBalances = useCallback(async (): Promise<void> => {
    if (!sdkRef.current) {
      return;
    }

    try {
      setError(null);
      await sdkRef.current.refreshChannelBalances();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to refresh channel balances";
      setError(errorMessage);
    }
  }, []);

  // ============================================================
  // BALANCE MANAGEMENT ACTIONS
  // ============================================================

  const fetchBalances = useCallback(async (): Promise<void> => {
    if (!sdkRef.current) {
      return;
    }

    try {
      setError(null);
      await sdkRef.current.fetchBalances();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch balances";
      setError(errorMessage);
    }
  }, []);

  const getBalance = useCallback((asset: string): string | null => {
    if (!sdkRef.current) {
      return null;
    }

    return sdkRef.current.getBalance(asset);
  }, []);

  // ============================================================
  // TRANSFER ACTIONS
  // ============================================================

  const transfer = useCallback(
    async (params: TransferParams): Promise<TransferResult> => {
      if (!sdkRef.current) {
        return { success: false, error: "SDK not initialized" };
      }

      try {
        setError(null);
        setIsTransferring(true);

        const result = await sdkRef.current.transfer(params);

        if (!result.success) {
          setIsTransferring(false);
          if (result.error) {
            setError(result.error);
          }
        }

        return result;
      } catch (error) {
        setIsTransferring(false);
        const errorMessage =
          error instanceof Error ? error.message : "Transfer failed";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  const formatAmount = useCallback(
    (amount: bigint, decimals: number = 18): string => {
      if (!sdkRef.current) {
        return "0";
      }
      return sdkRef.current.formatAmount(amount, decimals);
    },
    []
  );

  const parseAmount = useCallback(
    (amount: string, decimals: number = 18): bigint => {
      if (!sdkRef.current) {
        return BigInt(0);
      }
      return sdkRef.current.parseAmount(amount, decimals);
    },
    []
  );

  const getNetworkConfig = useCallback(() => {
    if (!sdkRef.current) {
      return null;
    }
    return sdkRef.current.getNetworkConfig();
  }, []);

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const isConnected = connectionStatus === "Connected";
  const isConnecting = connectionStatus === "Connecting";
  const isAuthenticated = authState.isAuthenticated;
  const isAuthenticating =
    authState.isAuthAttempted && !authState.isAuthenticated;

  // ============================================================
  // RETURN OBJECT
  // ============================================================

  return {
    // Connection state
    connectionStatus,
    isConnected,
    isConnecting,

    // Authentication state
    authState,
    isAuthenticated,
    isAuthenticating,

    // Balances
    balances,

    // Channels
    channels,

    // Transfer state
    isTransferring,

    // Error state
    error,

    // Actions
    connect,
    disconnect,
    authenticate,
    logout,

    // Channel management
    openChannel,
    closeChannel,
    getChannelBalance,
    refreshChannelBalances,

    // Balance management
    fetchBalances,
    getBalance,

    // Transfers
    transfer,

    // Utility
    sdk: sdkRef.current,
    formatAmount,
    parseAmount,
    getNetworkConfig,
  };
}

// ============================================================
// SPECIALIZED HOOKS
// ============================================================

/**
 * Hook for channel management only
 */
export function useYellowChannels(options: UseYellowNetworkOptions = {}) {
  const yellowNetwork = useYellowNetwork(options);

  return {
    channels: yellowNetwork.channels,
    openChannel: yellowNetwork.openChannel,
    closeChannel: yellowNetwork.closeChannel,
    getChannelBalance: yellowNetwork.getChannelBalance,
    refreshChannelBalances: yellowNetwork.refreshChannelBalances,
    isConnected: yellowNetwork.isConnected,
    isAuthenticated: yellowNetwork.isAuthenticated,
    error: yellowNetwork.error,
    formatAmount: yellowNetwork.formatAmount,
    parseAmount: yellowNetwork.parseAmount,
  };
}

/**
 * Hook for balance management only
 */
export function useYellowBalances(options: UseYellowNetworkOptions = {}) {
  const yellowNetwork = useYellowNetwork(options);

  return {
    balances: yellowNetwork.balances,
    fetchBalances: yellowNetwork.fetchBalances,
    getBalance: yellowNetwork.getBalance,
    isConnected: yellowNetwork.isConnected,
    isAuthenticated: yellowNetwork.isAuthenticated,
    error: yellowNetwork.error,
  };
}

/**
 * Hook for transfers only
 */
export function useYellowTransfers(options: UseYellowNetworkOptions = {}) {
  const yellowNetwork = useYellowNetwork(options);

  return {
    transfer: yellowNetwork.transfer,
    isTransferring: yellowNetwork.isTransferring,
    isConnected: yellowNetwork.isConnected,
    isAuthenticated: yellowNetwork.isAuthenticated,
    error: yellowNetwork.error,
  };
}
