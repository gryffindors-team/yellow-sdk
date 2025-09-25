import React, { useState, useCallback } from 'react';
import { Address, parseUnits } from 'viem';
import { GryffindorsSDK } from './core';
import { useGryffindors, useGryffindorsChannels, useGryffindorsTransfers } from './react-hooks';
import { useP2PTransfers, P2PTransferUtils } from './p2p-transfers';
import { useGryffindorsWallet } from './wagmi-integration';
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
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 rounded-xl shadow-lg">
        <div className="flex-1">
          <p className="text-sm font-bold text-black">
            Connected: {walletState.address?.slice(0, 6)}...{walletState.address?.slice(-4)}
          </p>
          <p className="text-xs text-black/80">Ready for authentication</p>
        </div>
        <button
          onClick={disconnectWallet}
          className="px-4 py-2 text-sm font-medium text-white bg-black/20 border border-black/30 rounded-lg hover:bg-black/30 transition-all duration-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (walletState.isConnected && !sessionInfo.isActive) {
    return (
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 rounded-xl shadow-lg">
        <div className="flex-1">
          <p className="text-sm font-bold text-black">
            Connected: {walletState.address?.slice(0, 6)}...{walletState.address?.slice(-4)}
          </p>
          <p className="text-xs text-black/80">Ready for authentication</p>
        </div>
        <button
          onClick={disconnectWallet}
          className="px-4 py-2 text-sm font-medium text-white bg-black/20 border border-black/30 rounded-lg hover:bg-black/30 transition-all duration-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-6">
      <button
        onClick={connectWallet}
        disabled={isConnecting}
        className="w-full px-6 py-3 text-lg font-bold rounded-xl shadow-xl transition-all duration-200 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 text-black hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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

// Enhanced P2P Transfer component with chain selection
export function TransferForm() {
  const sdk = useGryffindorsContext();
  const { transfer, isTransferring, lastTransfer, status } = useP2PTransfers(sdk);
  const { isAuthenticated } = useGryffindors(sdk);
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [chain, setChain] = useState('polygon');
  const [errors, setErrors] = useState<{recipient?: string; amount?: string}>({});

  // Token addresses for different chains
  const TOKEN_ADDRESSES = {
    polygon: {
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
    },
    base: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
    }
  };

  // Use P2P transfer utilities for validation
  const validateAddress = (address: string) => P2PTransferUtils.validateAddress(address);
  const validateAmount = (amount: string) => P2PTransferUtils.validateAmount(amount);

  const handleTransfer = useCallback(async () => {
    console.log('🚀 Starting P2P transfer...', { recipient, amount, asset, chain });
    
    // Validate inputs using P2P utils
    const recipientValidation = validateAddress(recipient);
    const amountValidation = validateAmount(amount);
    
    setErrors({
      recipient: recipientValidation.isValid ? undefined : recipientValidation.error,
      amount: amountValidation.isValid ? undefined : amountValidation.error
    });

    if (!recipientValidation.isValid || !amountValidation.isValid) {
      console.log('❌ Validation failed:', { 
        recipientError: recipientValidation.error, 
        amountError: amountValidation.error 
      });
      return;
    }

    try {
      console.log('📤 Executing P2P transfer through enhanced hooks...');
      const result = await transfer({
        to: recipient as Address,
        amount,
        asset: asset.toLowerCase()
      });

      console.log('📊 P2P Transfer result:', result);

      if (result.success) {
        console.log('✅ P2P Transfer successful!');
        // Clear form on success
        setRecipient('');
        setAmount('');
        setErrors({});
      } else {
        console.log('❌ P2P Transfer failed:', result.error);
      }
    } catch (error) {
      console.error('💥 P2P Transfer error:', error);
    }
  }, [recipient, amount, asset, chain, transfer]);

  // Use P2P transfer utilities for formatting
  const formatAddress = P2PTransferUtils.formatAddress;

  const isFormValid = recipient && amount && parseFloat(amount) > 0 && !errors.recipient && !errors.amount;

  return (
    <div className="p-6 bg-gray-900/50 border border-gray-600 rounded-xl backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        💸 Transfer Assets
      </h3>

      {!isAuthenticated && (
        <div className="mb-6 p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-200 text-sm">
            Please connect your wallet and authenticate to enable P2P transfers.
          </p>
        </div>
      )}

      {/* P2P Transfer Status */}
      {status && (
        <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
          <p className="text-blue-200 text-sm font-medium">{status}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              if (errors.recipient) {
                setErrors(prev => ({ ...prev, recipient: undefined }));
              }
            }}
            placeholder="0x..."
            className={`w-full px-4 py-3 bg-gray-800/50 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 ${
              errors.recipient 
                ? 'border-red-500 focus:ring-red-500/50' 
                : 'border-gray-600 focus:ring-yellow-500/50 focus:border-yellow-500'
            }`}
          />
          {errors.recipient && (
            <p className="mt-2 text-sm text-red-400">{errors.recipient}</p>
          )}
          {recipient && !errors.recipient && recipient.length === 42 && (
            <p className="mt-2 text-sm text-green-400">
              ✓ Valid address: {formatAddress(recipient as Address)}
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (errors.amount) {
                  setErrors(prev => ({ ...prev, amount: undefined }));
                }
              }}
              placeholder="0.0"
              step="0.01"
              min="0"
              className={`w-full px-4 py-3 pr-20 bg-gray-800/50 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 ${
                errors.amount 
                  ? 'border-red-500 focus:ring-red-500/50' 
                  : 'border-gray-600 focus:ring-yellow-500/50 focus:border-yellow-500'
              }`}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
              <span className="text-gray-300 text-sm font-medium">{asset}</span>
            </div>
          </div>
          {errors.amount && (
            <p className="mt-2 text-sm text-red-400">{errors.amount}</p>
          )}
          
          {/* Quick amount buttons */}
          <div className="mt-3 flex gap-2">
            {['0.01', '0.1', '1', '10'].map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                onClick={() => setAmount(quickAmount)}
                className="text-xs px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 hover:text-white transition-all duration-200 border border-gray-600"
              >
                {quickAmount}
              </button>
            ))}
          </div>
        </div>

        {/* Chain Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Network
          </label>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all duration-200"
          >
            <option value="polygon">Polygon</option>
            <option value="base">Base</option>
          </select>
        </div>

        {/* Asset Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Asset
          </label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all duration-200"
          >
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
            <option value="DAI">DAI</option>
          </select>
          <p className="mt-2 text-xs text-gray-400">
            Token address: {TOKEN_ADDRESSES[chain as keyof typeof TOKEN_ADDRESSES]?.[asset as keyof typeof TOKEN_ADDRESSES.polygon] || 'Not available'}
          </p>
        </div>

        {/* Transfer Summary */}
        {isFormValid && (
          <div className="p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-200">
              <strong>Summary:</strong> Send {amount} {asset} on {chain.charAt(0).toUpperCase() + chain.slice(1)} to {formatAddress(recipient as Address)}
            </p>
            <p className="text-xs text-blue-300 mt-1">
              Token: {TOKEN_ADDRESSES[chain as keyof typeof TOKEN_ADDRESSES]?.[asset as keyof typeof TOKEN_ADDRESSES.polygon]}
            </p>
          </div>
        )}

        {/* Transfer Button */}
        <button
          onClick={handleTransfer}
          disabled={!isAuthenticated || !isFormValid || isTransferring}
          className="w-full px-6 py-4 text-lg font-bold rounded-xl shadow-xl transition-all duration-200 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 text-black hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {!isAuthenticated 
            ? 'Connect Wallet to Transfer'
            : isTransferring 
            ? 'Transferring...' 
            : 'Connect Wallet to Transfer'}
        </button>

        {/* Debug Info */}
        {isAuthenticated && (
          <div className="mt-4 p-3 bg-gray-800/30 border border-gray-700 rounded-lg text-xs text-gray-400">
            <p>🔧 Debug: Session Active = {sdk.isSessionActive() ? 'Yes' : 'No'}</p>
            <p>🔧 Debug: Selected Chain = {chain}</p>
            <p>🔧 Debug: Token Address = {TOKEN_ADDRESSES[chain as keyof typeof TOKEN_ADDRESSES]?.[asset as keyof typeof TOKEN_ADDRESSES.polygon]}</p>
          </div>
        )}
      </div>

      {/* Transfer Result */}
      {lastTransfer && (
        <div className={`mt-6 p-4 rounded-lg border ${
          lastTransfer.success 
            ? 'bg-green-500/20 border-green-500/30 text-green-200' 
            : 'bg-red-500/20 border-red-500/30 text-red-200'
        }`}>
          <p className="text-sm font-medium">
            {lastTransfer.success ? '✅ Transfer Successful!' : '❌ Transfer Failed'}
          </p>
          {lastTransfer.hash && (
            <p className="text-xs mt-1">
              Transaction: {lastTransfer.hash.slice(0, 10)}...{lastTransfer.hash.slice(-8)}
            </p>
          )}
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
    <div className="p-6 bg-gray-900/50 border border-gray-600 rounded-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Balances</h3>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all duration-200"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {Object.keys(balances).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No balances available</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(balances).map(([asset, balance]) => (
            <div key={asset} className="flex justify-between items-center p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
              <span className="text-sm font-medium text-gray-300 uppercase">{asset}</span>
              <span className="text-sm font-bold text-white">{parseFloat(balance).toFixed(4)}</span>
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
      <div className={`p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg ${className}`}>
        <p className="text-white font-bold text-center">✓ Authenticated with Yellow Network</p>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center p-6 ${className}`}>
      <button
        onClick={handleAuthenticate}
        disabled={!isConnected || isAuthenticating}
        className="w-full px-6 py-3 text-lg font-bold rounded-xl shadow-xl transition-all duration-200 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 text-black hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
