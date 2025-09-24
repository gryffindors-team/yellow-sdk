// ============================================================
// YELLOW NETWORK SDK - MAIN EXPORTS
// ============================================================

import {
  ChannelResult,
  createYellowNetworkSDK,
  TransferResult,
  YellowNetworkConfig,
} from "./yellow-network-sdk";

// Core SDK
export {
  YellowNetworkSDK,
  createYellowNetworkSDK,
  type YellowNetworkConfig,
  type ConnectionStatus,
  type AuthenticationState,
  type ChannelState,
  type DepositParams,
  type WithdrawParams,
  type TransferParams,
  // type ChannelResult,
  type TransferResult,
  type NetworkType,
} from "./yellow-network-sdk";

// React Hooks
export {
  useYellowNetwork,
  useYellowChannels,
  useYellowBalances,
  useYellowTransfers,
  type UseYellowNetworkOptions,
  type UseYellowNetworkReturn,
} from "./use-yellow-network";

// Utilities
export {
  generateSessionKey,
  getStoredSessionKey,
  storeSessionKey,
  removeSessionKey,
  getStoredJWT,
  storeJWT,
  removeJWT,
  isJWTExpired,
  getJWTExpiration,
  formatAddress,
  isValidAddress,
  generateSecureId,
  getCurrentTimestamp,
  getFutureTimestamp,
  type SessionKey,
  sessionKeyAtom,
  jwtTokenAtom,
  connectionStatusAtom,
  authStateAtom,
  balancesAtom,
  transferStateAtom,
  validJwtTokenAtom,
  canAuthenticateAtom,
  authSummaryAtom,
  clearAllStoredDataAtom,
  debugInfoAtom,
} from "./yellow-network-utils";

// Legacy service (for backward compatibility)
export { YellowNetworkService } from "./yellow-network-service";

// Example components (for reference)
export { YellowNetworkExample, SimpleChannelManager } from "./example-usage";

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

// Quick access to most commonly used items
export type {
  // Core types
  YellowNetworkConfig as Config,
  DepositParams as Deposit,
  WithdrawParams as Withdraw,
  ChannelResult as ChannelResult,
  ChannelState as Channel,
} from "./yellow-network-sdk";

// ============================================================
// DEFAULT CONFIGURATIONS
// ============================================================

export const DEFAULT_CONFIG = {
  MAINNET: {
    wsUrl: "wss://clearnet.yellow.com/ws", // Replace with actual URL
    appName: "Yellow Network App",
    scope: "trading",
    network: "mainnet" as const,
    sessionDuration: 3600,
  },
} as const;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Creates a mainnet SDK with default configuration
 */
export function createMainnetSDK(overrides: Partial<YellowNetworkConfig> = {}) {
  return createYellowNetworkSDK({
    ...DEFAULT_CONFIG.MAINNET,
    ...overrides,
  });
}

// ============================================================
// VERSION INFO
// ============================================================

export const VERSION = "1.0.0";
export const SDK_NAME = "Yellow Network SDK";

// ============================================================
// COMMON PATTERNS
// ============================================================

/**
 * Common token addresses for easy reference
 */
export const COMMON_TOKENS = {
  POLYGON_MAINNET: {
    USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
} as const;

/**
 * Common RPC URLs
 */
export const RPC_URLS = {
  POLYGON_MAINNET: [
    "https://polygon-rpc.com",
    "https://rpc-mainnet.matic.network",
    "https://matic-mainnet.chainstacklabs.com",
  ],
} as const;

// ============================================================
// ERROR TYPES
// ============================================================

export class YellowNetworkError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = "YellowNetworkError";
  }
}

export class ChannelError extends YellowNetworkError {
  constructor(message: string, details?: any) {
    super(message, "CHANNEL_ERROR", details);
    this.name = "ChannelError";
  }
}

export class AuthenticationError extends YellowNetworkError {
  constructor(message: string, details?: any) {
    super(message, "AUTH_ERROR", details);
    this.name = "AuthenticationError";
  }
}

export class ConnectionError extends YellowNetworkError {
  constructor(message: string, details?: any) {
    super(message, "CONNECTION_ERROR", details);
    this.name = "ConnectionError";
  }
}

// ============================================================
// TYPE GUARDS
// ============================================================

export function isChannelResult(obj: any): obj is ChannelResult {
  return (
    typeof obj === "object" && obj !== null && typeof obj.success === "boolean"
  );
}

export function isTransferResult(obj: any): obj is TransferResult {
  return (
    typeof obj === "object" && obj !== null && typeof obj.success === "boolean"
  );
}

// ============================================================
// CONSTANTS
// ============================================================

export const SUPPORTED_CHAINS = {
  POLYGON: 137,
  POLYGON_AMOY: 80002,
} as const;

export const DEFAULT_SESSION_DURATION = 3600; // 1 hour
export const DEFAULT_RECONNECT_DELAY = 5000; // 5 seconds
export const DEFAULT_TIMEOUT = 30000; // 30 seconds

// ============================================================
// DEVELOPMENT HELPERS
// ============================================================

/**
 * Enable debug logging for development
 */
export function enableDebugLogging() {
  if (typeof window !== "undefined") {
    (window as any).__YELLOW_DEBUG__ = true;
  }
}

/**
 * Disable debug logging
 */
export function disableDebugLogging() {
  if (typeof window !== "undefined") {
    (window as any).__YELLOW_DEBUG__ = false;
  }
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  if (typeof window !== "undefined") {
    return !!(window as any).__YELLOW_DEBUG__;
  }
  return false;
}
