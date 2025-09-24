// ============================================================
// GRYFFINDORS SDK - MAIN EXPORTS
// ============================================================

// Core SDK
export { GryffindorsSDK, createGryffindorsSDK } from './core';

// Types
export type {
  GryffindorsConfig,
  SessionInfo,
  ChannelOperation,
  ChannelInfo,
  TransactionParams,
  TransactionResult,
  WalletConnectionState,
  ConnectionStatusCallback,
  SessionCallback,
  BalanceCallback,
  ChannelCallback,
  ErrorCallback
} from './types';

// React Hooks
export {
  useGryffindors,
  useGryffindorsChannels,
  useGryffindorsTransfers,
  useGryffindorsSession
} from './react-hooks';

// Wagmi Integration
export {
  useGryffindorsWallet,
  useEIP712Signature,
  gryffindorsConnectors
} from './wagmi-integration';

// React Components
export {
  GryffindorsProvider,
  useGryffindorsContext,
  WalletConnector,
  ChannelManager,
  TransferForm,
  BalanceDisplay,
  YellowAuthenticator,
  QuickDeposit,
  ChannelStatus
} from './components';

// Pre-configured Providers (simplified integration)
export {
  GryffindorsAppProvider,
  GryffindorsSDKProvider,
  defaultWagmiConfig,
  defaultGryffindorsConfig
} from './providers';

// Demo Components
export {
  YellowNetworkExample
} from './demo-components';

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

// Default configuration
export const DEFAULT_GRYFFINDORS_CONFIG = {
  wsUrl: "wss://clearnet.yellow.com/ws",
  appName: "Gryffindors DApp",
  scope: "trading",
  sessionDuration: 3600,
  network: "mainnet"
};

// Common token addresses
export const COMMON_TOKENS = {
  POLYGON: {
    USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    USDC_NATIVE: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"
  }
} as const;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Creates a Gryffindors SDK instance with default mainnet configuration
 */
export function createMainnetGryffindorsSDK(overrides: Partial<import('./types').GryffindorsConfig> = {}) {
  const { createGryffindorsSDK } = require('./core');
  return createGryffindorsSDK({
    ...DEFAULT_GRYFFINDORS_CONFIG,
    ...overrides
  });
}

/**
 * Quick setup function for React apps
 */
export function setupGryffindors(config?: import('./types').GryffindorsConfig) {
  const { createGryffindorsSDK } = require('./core');
  const { gryffindorsConnectors } = require('./wagmi-integration');
  const sdk = createGryffindorsSDK(config);
  
  return {
    sdk,
    connectors: gryffindorsConnectors,
    defaultConfig: DEFAULT_GRYFFINDORS_CONFIG
  };
}

// ============================================================
// VERSION INFO
// ============================================================

export const VERSION = "1.0.0";
export const SDK_NAME = "Gryffindors SDK";

// ============================================================
// ERROR CLASSES
// ============================================================

export class GryffindorsError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = "GryffindorsError";
  }
}

export class GryffindorsSessionError extends GryffindorsError {
  constructor(message: string, details?: any) {
    super(message, "SESSION_ERROR", details);
    this.name = "GryffindorsSessionError";
  }
}

export class GryffindorsChannelError extends GryffindorsError {
  constructor(message: string, details?: any) {
    super(message, "CHANNEL_ERROR", details);
    this.name = "GryffindorsChannelError";
  }
}
