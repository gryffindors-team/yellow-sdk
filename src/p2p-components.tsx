import React, { useState, useCallback } from 'react';
import { Address } from 'viem';
import { useP2PTransfers, useTransferRecipients, P2PTransferUtils } from './p2p-transfers';
import { useGryffindorsContext } from './components';

// Enhanced P2P Transfer Form Component
interface P2PTransferFormProps {
  onSuccess?: (hash?: string) => void;
  onError?: (error: string) => void;
  className?: string;
  defaultRecipient?: string;
  defaultAmount?: string;
  showHistory?: boolean;
}

export function P2PTransferForm({ 
  onSuccess, 
  onError, 
  className = '',
  defaultRecipient = '',
  defaultAmount = '',
  showHistory = true
}: P2PTransferFormProps) {
  const sdk = useGryffindorsContext();
  const { transfer, isTransferring, lastTransfer, transferHistory, status } = useP2PTransfers(sdk);
  const { recipients, addRecipient } = useTransferRecipients();
  
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [amount, setAmount] = useState(defaultAmount);
  const [asset, setAsset] = useState('usdc');
  const [recipientName, setRecipientName] = useState('');

  const handleTransfer = useCallback(async () => {
    // Validate inputs
    const amountValidation = P2PTransferUtils.validateAmount(amount);
    if (!amountValidation.isValid) {
      onError?.(amountValidation.error!);
      return;
    }

    const addressValidation = P2PTransferUtils.validateAddress(recipient);
    if (!addressValidation.isValid) {
      onError?.(addressValidation.error!);
      return;
    }

    try {
      const result = await transfer({
        to: recipient as Address,
        amount,
        asset
      });

      if (result.success) {
        // Add to recipients if name provided
        if (recipientName.trim()) {
          addRecipient({
            id: `recipient_${Date.now()}`,
            name: recipientName.trim(),
            address: recipient as Address
          });
        }

        // Clear form
        setRecipient('');
        setAmount('');
        setRecipientName('');
        
        onSuccess?.(result.hash);
      } else {
        onError?.(result.error || 'Transfer failed');
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Transfer failed');
    }
  }, [recipient, amount, asset, recipientName, transfer, addRecipient, onSuccess, onError]);

  const isFormValid = recipient && amount && parseFloat(amount) > 0;

  return (
    <div className={`p-6 bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        💸 P2P Transfer
      </h3>

      {/* Status Message */}
      {status && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-blue-800 text-sm font-medium">{status}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Recipient Address */}
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
          {recipients.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Recent recipients:</p>
              <div className="flex flex-wrap gap-1">
                {recipients.slice(0, 3).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRecipient(r.address);
                      setRecipientName(r.name);
                    }}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                  >
                    {r.name} ({P2PTransferUtils.formatAddress(r.address)})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recipient Name (Optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recipient Name (Optional)
          </label>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="e.g., Alice, Bob, etc."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <span className="text-gray-500 text-sm">{asset.toUpperCase()}</span>
            </div>
          </div>
          {/* Quick amount buttons */}
          <div className="mt-2 flex gap-2">
            {['0.01', '0.1', '1', '10'].map((quickAmount) => (
              <button
                key={quickAmount}
                onClick={() => setAmount(quickAmount)}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                {quickAmount}
              </button>
            ))}
          </div>
        </div>

        {/* Asset Selection */}
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

        {/* Transfer Summary */}
        {isFormValid && (
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-600">
              <strong>Summary:</strong> {P2PTransferUtils.generateTransferSummary({
                to: recipient as Address,
                amount,
                asset
              })}
            </p>
          </div>
        )}

        {/* Transfer Button */}
        <button
          onClick={handleTransfer}
          disabled={!isFormValid || isTransferring}
          className="w-full px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTransferring ? 'Transferring...' : 'Send Transfer'}
        </button>
      </div>

      {/* Last Transfer Result */}
      {lastTransfer && (
        <div className={`mt-4 p-3 rounded-md ${
          lastTransfer.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          <p className="text-sm font-medium">
            {lastTransfer.success ? 'Transfer Successful!' : 'Transfer Failed'}
          </p>
          {lastTransfer.hash && (
            <p className="text-xs mt-1">
              TX: {lastTransfer.hash.slice(0, 10)}...{lastTransfer.hash.slice(-8)}
            </p>
          )}
          {lastTransfer.error && (
            <p className="text-xs mt-1">{lastTransfer.error}</p>
          )}
        </div>
      )}

      {/* Transfer History */}
      {showHistory && transferHistory.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Transfers</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {transferHistory.slice(0, 5).map((transfer, index) => (
              <div key={transfer.transferId || index} className="flex justify-between items-center p-2 bg-gray-50 rounded text-xs">
                <span className={transfer.success ? 'text-green-600' : 'text-red-600'}>
                  {transfer.success ? '✓' : '✗'}
                </span>
                <span className="text-gray-600">
                  {transfer.timestamp ? new Date(transfer.timestamp).toLocaleTimeString() : 'Unknown time'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Quick Support Button Component (like the tutorial example)
interface QuickSupportButtonProps {
  recipient: Address;
  recipientName?: string;
  amount?: string;
  asset?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  className?: string;
  disabled?: boolean;
}

export function QuickSupportButton({
  recipient,
  recipientName,
  amount = '0.01',
  asset = 'usdc',
  onSuccess,
  onError,
  className = '',
  disabled = false
}: QuickSupportButtonProps) {
  const sdk = useGryffindorsContext();
  const { support, isTransferring, status } = useP2PTransfers(sdk);

  const handleSupport = useCallback(async () => {
    try {
      const result = await support(recipient, amount);
      if (result.success) {
        onSuccess?.();
      } else {
        onError?.(result.error || 'Support failed');
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Support failed');
    }
  }, [recipient, amount, support, onSuccess, onError]);

  const isAuthenticated = sdk.isSessionActive();

  return (
    <button
      onClick={handleSupport}
      disabled={disabled || !isAuthenticated || isTransferring}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        !isAuthenticated
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : isTransferring
          ? 'bg-yellow-100 text-yellow-800 cursor-wait'
          : 'bg-green-100 text-green-800 hover:bg-green-200'
      } ${className}`}
      title={
        !isAuthenticated
          ? 'Connect your wallet to support'
          : isTransferring
          ? 'Supporting...'
          : `Support ${recipientName || 'author'} with ${amount} ${asset.toUpperCase()}`
      }
    >
      {!isAuthenticated
        ? 'Connect Wallet'
        : isTransferring
        ? 'Supporting...'
        : `Support ${amount} ${asset.toUpperCase()}`}
    </button>
  );
}

// P2P Transfer Status Component
interface P2PTransferStatusProps {
  className?: string;
}

export function P2PTransferStatus({ className = '' }: P2PTransferStatusProps) {
  const sdk = useGryffindorsContext();
  const { isTransferring, status, transferHistory, successfulTransfers, failedTransfers } = useP2PTransfers(sdk);

  if (!transferHistory.length && !isTransferring) {
    return null;
  }

  return (
    <div className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Transfer Status</h3>
      
      {/* Current Status */}
      {isTransferring && status && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800 text-sm">{status}</p>
        </div>
      )}

      {/* Transfer Stats */}
      {transferHistory.length > 0 && (
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-gray-900">{transferHistory.length}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-green-600">{successfulTransfers}</p>
            <p className="text-xs text-gray-500">Success</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-red-600">{failedTransfers}</p>
            <p className="text-xs text-gray-500">Failed</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Recipient Manager Component
interface RecipientManagerProps {
  onSelectRecipient?: (address: Address, name: string) => void;
  className?: string;
}

export function RecipientManager({ onSelectRecipient, className = '' }: RecipientManagerProps) {
  const { recipients, addRecipient, removeRecipient } = useTransferRecipients();
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');

  const handleAddRecipient = useCallback(() => {
    const addressValidation = P2PTransferUtils.validateAddress(newAddress);
    if (!addressValidation.isValid) {
      alert(addressValidation.error);
      return;
    }

    if (!newName.trim()) {
      alert('Please enter a name');
      return;
    }

    addRecipient({
      id: `recipient_${Date.now()}`,
      name: newName.trim(),
      address: newAddress as Address
    });

    setNewName('');
    setNewAddress('');
  }, [newName, newAddress, addRecipient]);

  return (
    <div className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Saved Recipients</h3>
      
      {/* Add New Recipient */}
      <div className="space-y-2 mb-4">
        <input
          type="text"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
        <input
          type="text"
          placeholder="0x..."
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
        <button
          onClick={handleAddRecipient}
          disabled={!newName.trim() || !newAddress.trim()}
          className="w-full px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Add Recipient
        </button>
      </div>

      {/* Recipients List */}
      {recipients.length === 0 ? (
        <p className="text-sm text-gray-500">No saved recipients</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((recipient) => (
            <div key={recipient.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{recipient.name}</p>
                <p className="text-xs text-gray-500">{P2PTransferUtils.formatAddress(recipient.address)}</p>
              </div>
              <div className="flex gap-1">
                {onSelectRecipient && (
                  <button
                    onClick={() => onSelectRecipient(recipient.address, recipient.name)}
                    className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200"
                  >
                    Select
                  </button>
                )}
                <button
                  onClick={() => removeRecipient(recipient.address)}
                  className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}