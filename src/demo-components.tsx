"use client";

import React, { useState, useCallback } from "react";
import { type Address, type WalletClient } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useConnectorClient,
  useWalletClient,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { useGryffindors, useGryffindorsChannels } from "./react-hooks";
import { useGryffindorsContext } from "./components";

/**
 * Complete Yellow Network integration example component
 * Shows wallet connection, authentication, balances, and channel management
 */
export function YellowNetworkExample() {
  const { isConnected, address, connector } = useAccount();
  const { connect: wagmiConnect, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { data: connectorClient } = useConnectorClient();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const sdk = useGryffindorsContext();
  const {
    connectionStatus,
    sessionInfo,
    balances,
    channels,
    errors,
    isLoading,
    connect: sdkConnect,
    disconnect: sdkDisconnect,
    refresh,
    clearErrors,
  } = useGryffindors(sdk);

  const {
    deposit,
    withdraw,
    isOperating,
    lastOperation,
  } = useGryffindorsChannels(sdk);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Wallet connection handlers
  const connectWallet = useCallback(async () => {
    try {
      const connector = connectors.find(c => c.id === 'injected') || connectors[0];
      if (connector) {
        wagmiConnect({ connector });
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  }, [wagmiConnect, connectors]);

  const disconnectWallet = useCallback(async () => {
    try {
      await sdkDisconnect();
      wagmiDisconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, [wagmiDisconnect, sdkDisconnect]);

  // Authentication handler with improved wallet client handling
  const handleAuthenticate = useCallback(async () => {
    if (!isConnected || !address) {
      alert("Please connect your wallet first.");
      return;
    }

    // Check if we're on a supported network - Yellow Network supports Polygon (137) and Base (8453)
    const supportedChainIds = [137, 8453]; // Polygon mainnet, Base mainnet
    const chainNames = { 137: "Polygon", 8453: "Base" };
    
    if (!supportedChainIds.includes(chainId)) {
      const supportedNetworks = supportedChainIds.map(id => chainNames[id as keyof typeof chainNames]).join(" or ");
      
      try {
        // Default to Polygon if not on a supported network
        await switchChain({ chainId: 137 });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Failed to switch network:", error);
        alert(`Please switch to ${supportedNetworks} network in your wallet and try again.`);
        return;
      }
    }

    // Wait for wallet client to be available with retry logic
    let availableClient = walletClient || connectorClient;
    let retryCount = 0;
    const maxRetries = 5;

    while (!availableClient && retryCount < maxRetries) {
      console.log(`Waiting for wallet client... attempt ${retryCount + 1}/${maxRetries}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      availableClient = walletClient || connectorClient;
      retryCount++;
    }

    if (!availableClient) {
      alert("Wallet client not available. Please try:\n1. Disconnect and reconnect your wallet\n2. Refresh the page\n3. Make sure you're on Polygon or Base network");
      return;
    }

    try {
      console.log("Starting authentication with wallet client...");
      await sdk.createApplicationSession(availableClient as WalletClient, address);
      console.log("Authentication successful!");
    } catch (error) {
      console.error("Authentication failed:", error);
      let errorMessage = "Authentication failed";
      
      if (error instanceof Error) {
        if (error.message.includes("User rejected")) {
          errorMessage = "Authentication was cancelled. Please try again and approve the signature request.";
        } else if (error.message.includes("network")) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else {
          errorMessage = `Authentication failed: ${error.message}`;
        }
      }
      
      alert(errorMessage);
    }
  }, [walletClient, connectorClient, address, isConnected, chainId, switchChain, sdk]);

  // Channel operations
  const handleOpenChannel = useCallback(async () => {
    if (!depositAmount) {
      alert("Please enter a deposit amount");
      return;
    }

    try {
      // Use appropriate USDC address based on current chain
      const usdcAddresses = {
        137: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
        8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      };
      
      const tokenAddress = usdcAddresses[chainId as keyof typeof usdcAddresses] || usdcAddresses[137];
      
      const result = await deposit({
        tokenAddress: tokenAddress as Address,
        amount: depositAmount,
      });

      if (result.success) {
        alert(`Channel opened successfully! TX: ${result.hash}`);
        setDepositAmount("");
      } else {
        alert(`Failed to open channel: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to open channel:", error);
      alert("Failed to open channel");
    }
  }, [depositAmount, deposit]);

  const handleCloseChannel = useCallback(async () => {
    if (!withdrawAmount) {
      alert("Please enter a withdrawal amount");
      return;
    }

    try {
      // Use appropriate USDC address based on current chain
      const usdcAddresses = {
        137: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
        8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      };
      
      const tokenAddress = usdcAddresses[chainId as keyof typeof usdcAddresses] || usdcAddresses[137];
      
      const result = await withdraw({
        tokenAddress: tokenAddress as Address,
        amount: withdrawAmount,
      });

      if (result.success) {
        alert(`Channel closed successfully! TX: ${result.hash}`);
        setWithdrawAmount("");
      } else {
        alert(`Failed to close channel: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to close channel:", error);
      alert("Failed to close channel");
    }
  }, [withdrawAmount, withdraw]);

  if (!mounted) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Yellow Network SDK Example</h1>

      {/* Error Display */}
      {errors.length > 0 && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Errors:</strong>
          {errors.map((error, i) => (
            <div key={i}>{error}</div>
          ))}
          <button onClick={clearErrors} className="mt-2 text-sm underline">
            Clear Errors
          </button>
        </div>
      )}

      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <h3 className="font-semibold mb-2 text-gray-800">Wallet Connection</h3>
          <p className={`text-sm font-medium ${isConnected ? "text-green-600" : "text-red-600"}`}>
            Status: {isConnected ? "Connected" : "Disconnected"}
          </p>
          {address && (
            <p className="text-xs text-gray-600 mt-1">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          )}
          <div className="mt-3 space-x-2">
            <button
              onClick={connectWallet}
              disabled={isConnected}
              className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnected ? "Connected" : "Connect Wallet"}
            </button>
            {isConnected && (
              <button
                onClick={disconnectWallet}
                className="px-4 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <h3 className="font-semibold mb-2 text-gray-800">Yellow Network Authentication</h3>
          <p className={`text-sm font-medium ${sessionInfo.isActive ? "text-green-600" : "text-orange-600"}`}>
            Status: {sessionInfo.isActive ? "Authenticated" : "Not Authenticated"}
          </p>
          {sessionInfo.account && (
            <p className="text-xs text-gray-600 mt-1">
              Account: {sessionInfo.account.slice(0, 10)}...
            </p>
          )}
          <div className="mt-3">
            <button
              onClick={handleAuthenticate}
              disabled={!isConnected || sessionInfo.isActive || !address}
              className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sessionInfo.isActive ? "Authenticated" : "Authenticate"}
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
          <h3 className="font-semibold mb-2 text-gray-800">Account Balances</h3>
          <div className="text-sm space-y-2">
            {Object.entries(balances).length > 0 ? (
              Object.entries(balances).map(([asset, balance]) => (
                <div key={asset} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700 uppercase">{asset}:</span>
                  <span className="text-gray-900">{parseFloat(balance).toFixed(4)}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 italic">No balances available</p>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={!sessionInfo.isActive || isLoading}
            className="mt-3 px-4 py-2 bg-purple-500 text-white rounded-md text-sm font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Balances'}
          </button>
        </div>
      </div>

      {/* Channel Management */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Channel Management</h2>

        {/* Current Channels */}
        <div className="mb-4">
          <h3 className="font-medium mb-2">Open Channels</h3>
          {Object.entries(channels).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(channels).map(([channelId, channel]) => (
                <div
                  key={channelId}
                  className="flex justify-between items-center p-2 bg-gray-50 rounded"
                >
                  <div>
                    <span className="font-medium">Token:</span>{" "}
                    {channel.tokenAddress.slice(0, 10)}...
                    <span className="ml-4 font-medium">Balance:</span>{" "}
                    {channel.balance}
                    <span
                      className={`ml-4 px-2 py-1 rounded text-xs ${
                        channel.isOpen
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {channel.isOpen ? "Open" : "Closed"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No open channels</p>
          )}
        </div>

        {/* Open/Close Channel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium mb-2">Open Channel (Deposit)</h3>
            <div className="space-y-2">
              <input
                type="number"
                placeholder="Amount (USDC)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full p-2 border rounded"
              />
              <button
                onClick={handleOpenChannel}
                disabled={!sessionInfo.isActive || !depositAmount || isOperating}
                className="w-full px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
              >
                {isOperating ? 'Processing...' : 'Open Channel'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Close Channel (Withdraw)</h3>
            <div className="space-y-2">
              <input
                type="number"
                placeholder="Amount (USDC)"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full p-2 border rounded"
              />
              <button
                onClick={handleCloseChannel}
                disabled={!sessionInfo.isActive || !withdrawAmount || isOperating}
                className="w-full px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
              >
                {isOperating ? 'Processing...' : 'Close Channel'}
              </button>
            </div>
          </div>
        </div>

        {/* Last Operation Result */}
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
    </div>
  );
}
