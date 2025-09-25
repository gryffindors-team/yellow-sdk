import { useAccount, useConnect, useDisconnect, useWalletClient } from 'wagmi';
import { injected, walletConnect, coinbaseWallet, safe } from 'wagmi/connectors';
import { useCallback, useEffect, useState } from 'react';
import { Address } from 'viem';
import { GryffindorsSDK } from './core';
import { SessionInfo, WalletConnectionState } from './types';
import type { CreateConnectorFn } from 'wagmi';

// Wagmi connector configuration with multiple wallet support
export const gryffindorsConnectors: CreateConnectorFn[] = [
  // Generic injected for MetaMask and other browser wallets
  injected(),
  
  // WalletConnect v2 (only if project ID is available)
  ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? [
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'Gryffindors DApp',
        description: 'Gryffindors Web3 Application',
        url: 'https://gryffindors.app',
        icons: ['https://gryffindors.app/icon.png']
      },
      showQrModal: true,
    })
  ] : []),
  
  // Coinbase Wallet
  coinbaseWallet({
    appName: 'Gryffindors DApp',
    appLogoUrl: 'https://gryffindors.app/icon.png',
  }),
  
  // Safe (Gnosis Safe) - only in supported environments
  ...(typeof window !== 'undefined' && (
    window.location.hostname.includes('gnosis-safe.io') || 
    window.location.hostname.includes('app.safe.global')
  ) ? [
    safe({
      allowedDomains: [/gnosis-safe.io$/, /app.safe.global$/],
      debug: false,
    })
  ] : [])
];

// Hook for wallet connection with Gryffindors SDK integration
export function useGryffindorsWallet(sdk: GryffindorsSDK) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    isActive: false,
    sessionKey: null,
    account: null,
    expiresAt: null
  });

  const [walletState, setWalletState] = useState<WalletConnectionState>({
    isConnected: false,
    address: null,
    chainId: null
  });

  // Update wallet state when account changes
  useEffect(() => {
    setWalletState({
      isConnected,
      address: address || null,
      chainId: chainId || null
    });
  }, [isConnected, address, chainId]);

  // Setup SDK session callbacks
  useEffect(() => {
    const unsubscribe = sdk.onSessionChange(setSessionInfo);
    return unsubscribe;
  }, [sdk]);

  // Note: Removed auto-create session to prevent automatic authentication popup
  // Sessions are now created manually via YellowAuthenticator component or createSession() call

  const connectWallet = useCallback(async () => {
    try {
      const connector = connectors.find(c => c.id === 'injected') || connectors[0];
      if (connector) {
        connect({ connector });
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  }, [connect, connectors]);

  const disconnectWallet = useCallback(async () => {
    try {
      await sdk.closeSession();
      disconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, [disconnect, sdk]);

  const createSession = useCallback(async () => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      await sdk.initializeChannel();
      const session = await sdk.createApplicationSession(walletClient, address);
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }, [walletClient, address, sdk]);

  const signEIP712Message = useCallback(async (message: any, types: any, domain: any) => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await walletClient.signTypedData({
        account: address,
        message,
        primaryType: Object.keys(types)[0],
        types,
        domain
      });

      return signature;
    } catch (error) {
      console.error('Failed to sign EIP-712 message:', error);
      throw error;
    }
  }, [walletClient, address]);

  return {
    // Wallet connection state
    walletState,
    isConnecting: isPending,
    
    // Session state
    sessionInfo,
    
    // Actions
    connectWallet,
    disconnectWallet,
    createSession,
    signEIP712Message,
    
    // Raw wagmi data for advanced usage
    address,
    isConnected,
    chainId,
    walletClient
  };
}

// Hook for EIP-712 signing with wallet integration
export function useGryffindorsAuth(sdk: GryffindorsSDK) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningEnabled, setIsSigningEnabled] = useState(false);

  const createAuthSignature = useCallback(async (sessionKeyAddress: Address, expireTimestamp: string) => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }

    const domain = {
      name: 'Yellow Network',
      version: '1',
      chainId: 137, // Polygon
      verifyingContract: '0x0000000000000000000000000000000000000000' as Address
    };

    const types = {
      Auth: [
        { name: 'user', type: 'address' },
        { name: 'sessionKey', type: 'address' },
        { name: 'expireTimestamp', type: 'string' }
      ]
    };

    const message = {
      user: address,
      sessionKey: sessionKeyAddress,
      expireTimestamp
    };

    try {
      const signature = await walletClient.signTypedData({
        account: address,
        message,
        primaryType: 'Auth',
        types,
        domain
      });

      // Store signature in SDK for later use
      sdk.setCachedSignature(signature);
      
      return {
        signature,
        timestamp: Date.now(),
        sessionKeyAddress,
        account: address,
        expireTimestamp
      };
    } catch (error) {
      console.error('Failed to create auth signature:', error);
      throw error;
    }
  }, [walletClient, address, sdk]);

  const enableSigning = useCallback(() => {
    setIsSigningEnabled(true);
  }, []);

  const disableSigning = useCallback(() => {
    setIsSigningEnabled(false);
  }, []);

  return {
    createAuthSignature,
    isAuthenticating,
    authError,
    isSigningEnabled,
    enableSigning,
    disableSigning
  };
}

// Alias for backward compatibility
export const useEIP712Signature = useGryffindorsAuth;
