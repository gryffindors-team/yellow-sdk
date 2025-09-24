import { Address } from 'viem';

// Core configuration types
export interface GryffindorsConfig {
  wsUrl?: string;
  appName?: string;
  scope?: string;
  sessionDuration?: number;
  network?: 'mainnet' | 'testnet';
  rpcUrl?: string;
}

// Session and authentication types
export interface SessionInfo {
  isActive: boolean;
  sessionKey: string | null;
  account: Address | null;
  expiresAt: number | null;
}

// Channel operation types
export interface ChannelOperation {
  tokenAddress: Address;
  amount: string;
  recipient?: Address;
}

export interface ChannelInfo {
  isOpen: boolean;
  balance: string;
  tokenAddress: Address;
  channelId: string;
  lastUpdate: number;
}

// Transaction types
export interface TransactionParams {
  to: Address;
  amount: string;
  asset?: string;
}

export interface TransactionResult {
  success: boolean;
  hash?: string;
  error?: string;
}

// Wallet connection types
export interface WalletConnectionState {
  isConnected: boolean;
  address: Address | null;
  chainId: number | null;
}

// Event callback types
export type ConnectionStatusCallback = (status: 'connecting' | 'connected' | 'disconnected') => void;
export type SessionCallback = (session: SessionInfo) => void;
export type BalanceCallback = (balances: Record<string, string>) => void;
export type ChannelCallback = (channels: Record<string, ChannelInfo>) => void;
export type ErrorCallback = (error: string) => void;
