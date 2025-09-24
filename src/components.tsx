import React, { useState, useCallback } from 'react';
import { Address, parseUnits } from 'viem';
import { GryffindorsSDK } from './core';
import { useGryffindors, useGryffindorsChannels, useGryffindorsTransfers } from './react-hooks';
import { useGryffindorsWallet, useEIP712Signature } from './wagmi-integration';
import { useAccount, useWalletClient } from 'wagmi';

// Provider component for Gryffindors SDK
interface GryffindorsProviderProps {
  sdk: GryffindorsSDK;
  // Use any to avoid ReactNode identity mismatch across linked packages
  children: any;
}

const GryffindorsContext = React.createContext<GryffindorsSDK | null>(null);

export function GryffindorsProvider({ sdk, children }: GryffindorsProviderProps) {
  return (
    <GryffindorsContext.Provider value={sdk}>
      {children}
    </GryffindorsContext.Provider>
  );
}

export function useGryffindorsContext() {
  const context = React.useContext(GryffindorsContext);
  if (!context) {
    throw new Error('useGryffindorsContext must be used within a GryffindorsProvider');
  }
  return context;
}

// Wallet connection component
export function WalletConnector() {
  const sdk = useGryffindorsContext();
  const { walletState, sessionInfo, connectWallet, disconnectWallet, isConnecting } = useGryffindorsWallet(sdk);

  if (walletState.isConnected && sessionInfo.isActive) {
    return (
      <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">
            Connected: {walletState.address?.slice(0, 6)}...{walletState.address?.slice(-4)}
          </p>
          <p className="text-xs text-green-600">Session Active</p>
        </div>
        <button
          onClick={disconnectWallet}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">
          {walletState.isConnected ? 'Wallet Connected' : 'Wallet Not Connected'}
        </p>
        <p className="text-xs text-gray-600">
          {walletState.isConnected ? 'Creating session...' : 'Connect to get started'}
        </p>
      </div>
      <button
        onClick={connectWallet}
        disabled={isConnecting}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    </div>
  );
}

// Channel management component
interface ChannelManagerProps {
  tokenAddress: Address;
  tokenSymbol?: string;
}

export function ChannelManager({ tokenAddress, tokenSymbol = 'TOKEN' }: ChannelManagerProps) {
  const sdk = useGryffindorsContext();
  const { channels } = useGryffindors(sdk);
  const { deposit, withdraw, isOperating, lastOperation } = useGryffindorsChannels(sdk);
  
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState<'deposit' | 'withdraw'>('deposit');

  const channel = channels[`${tokenAddress}-${sdk.getSessionInfo().account}`];

  const handleOperation = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    const params = {
      tokenAddress,
      amount: parseUnits(amount, 18).toString()
    };

    if (operation === 'deposit') {
      await deposit(params);
    } else {
      await withdraw(params);
    }

    setAmount('');
  }, [amount, operation, tokenAddress, deposit, withdraw]);

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {tokenSymbol} Channel
      </h3>
      
      {channel ? (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            Status: <span className={`font-medium ${channel.isOpen ? 'text-green-600' : 'text-red-600'}`}>
              {channel.isOpen ? 'Open' : 'Closed'}
            </span>
          </p>
          <p className="text-sm text-gray-600">
            Balance: <span className="font-medium">{parseFloat(channel.balance).toFixed(4)} {tokenSymbol}</span>
          </p>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-yellow-50 rounded-md">
          <p className="text-sm text-yellow-800">No channel found. Deposit to create one.</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Operation
          </label>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as 'deposit' | 'withdraw')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="deposit">Deposit</option>
            <option value="withdraw">Withdraw</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount ({tokenSymbol})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleOperation}
          disabled={isOperating || !amount || parseFloat(amount) <= 0}
          className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isOperating ? 'Processing...' : `${operation === 'deposit' ? 'Deposit' : 'Withdraw'} ${tokenSymbol}`}
        </button>
      </div>

      {lastOperation && (
        <div className={`mt-4 p-3 rounded-md ${lastOperation.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <p className="text-sm font-medium">
            {lastOperation.success ? 'Operation Successful' : 'Operation Failed'}
          </p>
          {lastOperation.hash && (
            <p className="text-xs mt-1">
              TX: {lastOperation.hash.slice(0, 10)}...{lastOperation.hash.slice(-8)}
            </p>
          )}
          {lastOperation.error && (
            <p className="text-xs mt-1">{lastOperation.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Transfer component
export function TransferForm() {
  const sdk = useGryffindorsContext();
  const { transfer, isTransferring, lastTransfer } = useGryffindorsTransfers(sdk);
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('usdc');

  const handleTransfer = useCallback(async () => {
    if (!recipient || !amount || parseFloat(amount) <= 0) return;

    await transfer({
      to: recipient as Address,
      amount,
      asset
    });

    setRecipient('');
    setAmount('');
  }, [recipient, amount, asset, transfer]);

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Transfer Funds
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asset
          </label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="usdc">USDC</option>
            <option value="usdt">USDT</option>
            <option value="dai">DAI</option>
          </select>
        </div>

        <button
          onClick={handleTransfer}
          disabled={isTransferring || !recipient || !amount || parseFloat(amount) <= 0}
          className="w-full px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTransferring ? 'Transferring...' : 'Transfer'}
        </button>
      </div>

      {lastTransfer && (
        <div className={`mt-4 p-3 rounded-md ${lastTransfer.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <p className="text-sm font-medium">
            {lastTransfer.success ? 'Transfer Successful' : 'Transfer Failed'}
          </p>
          {lastTransfer.error && (
            <p className="text-xs mt-1">{lastTransfer.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Balance display component
export function BalanceDisplay() {
  const sdk = useGryffindorsContext();
  const { balances, refresh, isLoading } = useGryffindors(sdk);

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Balances</h3>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {Object.keys(balances).length === 0 ? (
        <p className="text-sm text-gray-500">No balances available</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(balances).map(([asset, balance]) => (
            <div key={asset} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
              <span className="text-sm font-medium text-gray-700 uppercase">{asset}</span>
              <span className="text-sm text-gray-900">{parseFloat(balance).toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Yellow Network Authenticator component
interface YellowAuthenticatorProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

export function YellowAuthenticator({ onSuccess, onError, className }: YellowAuthenticatorProps) {
  const sdk = useGryffindorsContext();
  const { isAuthenticated, connect } = useGryffindors(sdk);
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAuthenticate = useCallback(async () => {
    if (!isConnected || !address || !walletClient) {
      onError?.("Please connect your wallet first");
      return;
    }

    setIsAuthenticating(true);
    try {
      await connect();
      await sdk.createApplicationSession(walletClient, address);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      onError?.(message);
    } finally {
      setIsAuthenticating(false);
    }
  }, [isConnected, address, walletClient, connect, sdk, onSuccess, onError]);

  if (isAuthenticated) {
    return (
      <div className={`p-4 bg-green-50 border border-green-200 rounded-lg ${className}`}>
        <p className="text-green-800 font-medium">✓ Authenticated with Yellow Network</p>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
      <button
        onClick={handleAuthenticate}
        disabled={!isConnected || isAuthenticating}
        className="w-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
      >
        {isAuthenticating ? 'Authenticating...' : 'Authenticate with Yellow Network'}
      </button>
    </div>
  );
}

// Quick Deposit component
interface QuickDepositProps {
  tokenAddress?: Address;
  tokenSymbol?: string;
  defaultAmount?: string;
  onSuccess?: (hash: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function QuickDeposit({ 
  tokenAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
  tokenSymbol = "USDC",
  defaultAmount = "",
  onSuccess,
  onError,
  className 
}: QuickDepositProps) {
  const sdk = useGryffindorsContext();
  const { isAuthenticated } = useGryffindors(sdk);
  const { deposit, isOperating } = useGryffindorsChannels(sdk);
  const [amount, setAmount] = useState(defaultAmount);

  const handleDeposit = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    try {
      const result = await deposit({ tokenAddress, amount });
      if (result.success && result.hash) {
        onSuccess?.(result.hash);
        setAmount("");
      } else {
        onError?.(result.error || "Deposit failed");
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Deposit failed");
    }
  }, [amount, tokenAddress, deposit, onSuccess, onError]);

  return (
    <div className={`p-4 bg-white border border-gray-200 rounded-lg ${className}`}>
      <h3 className="font-medium mb-3">Quick Deposit</h3>
      <div className="space-y-3">
        <input
          type="number"
          placeholder={`Amount (${tokenSymbol})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <button
          onClick={handleDeposit}
          disabled={!isAuthenticated || !amount || parseFloat(amount) <= 0 || isOperating}
          className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
        >
          {isOperating ? 'Processing...' : `Deposit ${tokenSymbol}`}
        </button>
      </div>
    </div>
  );
}

// Channel Status component
interface ChannelStatusProps {
  tokenAddress?: Address;
  tokenSymbol?: string;
  className?: string;
}

export function ChannelStatus({ 
  tokenAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  tokenSymbol = "USDC",
  className 
}: ChannelStatusProps) {
  const sdk = useGryffindorsContext();
  const { channels } = useGryffindors(sdk);
  
  const channel = channels[`${tokenAddress}-${sdk.getSessionInfo().account}`];

  return (
    <div className={`p-4 bg-white border border-gray-200 rounded-lg ${className}`}>
      <h3 className="font-medium mb-3">Channel Status</h3>
      {channel ? (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className={`font-medium ${channel.isOpen ? 'text-green-600' : 'text-red-600'}`}>
              {channel.isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Balance:</span>
            <span className="font-medium">{parseFloat(channel.balance).toFixed(4)} {tokenSymbol}</span>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">No channel found</p>
      )}
    </div>
  );
}
