import React, { useState, useCallback } from "react";
import { type Address, type WalletClient } from "viem";
import {
  useAccount,
  useConnectorClient,
  useWalletClient,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { useYellowNetwork, useYellowChannels } from "./use-yellow-network";

// ============================================================
// EXAMPLE COMPONENT - FULL YELLOW NETWORK INTEGRATION
// ============================================================

export function YellowNetworkExample() {
  const { isConnected, address, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { data: connectorClient } = useConnectorClient();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const {
    connectionStatus,
    isAuthenticated,
    authState,
    balances,
    channels,
    error,
    connect,
    disconnect,
    authenticate,
    logout,
    openChannel,
    closeChannel,
    fetchBalances,
    transfer,
    formatAmount,
    parseAmount,
    getNetworkConfig,
  } = useYellowNetwork({
    config: {
      wsUrl:
        process.env.NEXT_PUBLIC_NITROLITE_WS_URL ||
        "wss://clearnet.yellow.com/ws",
      appName: process.env.NEXT_PUBLIC_APP_NAME || "My Yellow App",
      scope: "trading",
    },
    network: "mainnet", // Use mainnet for production
    autoConnect: true,
  });

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Get network configuration
  const networkConfig = getNetworkConfig();

  // ============================================================
  // AUTHENTICATION HANDLERS
  // ============================================================

  React.useEffect(() => {
    console.log("Wallet Client Debug:", {
      isConnected,
      address,
      chainId,
      expectedChainIds: [1, 137, 80002], // mainnet, polygon, polygonAmoy
      walletClient: !!walletClient,
      connectorClient: !!connectorClient,
      hasAnyClient: !!(walletClient || connectorClient),
      connector: connector?.name,
    });
  }, [isConnected, address, walletClient, connectorClient, chainId, connector]);

  const handleAuthenticate = useCallback(async () => {
    console.log("Authenticate attempt:", {
      address,
      isConnected,
      chainId,
      walletClient: !!walletClient,
      connectorClient: !!connectorClient,
      hasAnyClient: !!(walletClient || connectorClient),
      connector: connector?.name,
    });

    if (!isConnected || !address) {
      alert("Please connect your wallet first.");
      return;
    }

    // Check if we're on the right network - Yellow Network uses Polygon (137) for mainnet
    const targetChainId = 137; // Polygon mainnet
    if (chainId !== targetChainId) {
      console.log(
        `Wrong network detected. Current: ${chainId}, Expected: ${targetChainId}`
      );
      try {
        await switchChain({ chainId: targetChainId });
        // Wait for network switch to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Failed to switch network:", error);
        alert("Please switch to Polygon network in your wallet and try again.");
        return;
      }
    }

    // Try walletClient first, then connectorClient
    let availableClient = walletClient || connectorClient;

    if (!availableClient) {
      console.error("No client available. Trying to reconnect...");

      // Try to force a reconnection if no client is available
      if (
        connector &&
        "reconnect" in connector &&
        typeof connector.reconnect === "function"
      ) {
        try {
          await connector.reconnect();
          // Wait a moment for the reconnection
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Check if we now have a client
          availableClient = walletClient || connectorClient;
        } catch (reconnectError) {
          console.error("Reconnect failed:", reconnectError);
        }
      }

      // If still no client, try alternative approach
      if (!availableClient) {
        console.log("Trying alternative client retrieval...");

        // Sometimes refreshing the page helps with wagmi client issues
        if (
          confirm(
            "Wallet client not available. This often happens due to network issues. Would you like to refresh the page to retry?"
          )
        ) {
          window.location.reload();
          return;
        }

        alert(
          "Wallet client not available. Please:\n1. Make sure you're connected to Polygon network\n2. Try disconnecting and reconnecting your wallet\n3. Refresh the page if the issue persists"
        );
        return;
      }
    }

    try {
      console.log("Starting authentication with available client...");
      // The authenticate function expects a WalletClient, but connectorClient may have additional properties
      // We'll cast to WalletClient since both should have the necessary signing capabilities
      await authenticate(availableClient as WalletClient, address);
      console.log("Authentication successful!");
    } catch (error) {
      console.error("Authentication failed:", error);

      let errorMessage = "Authentication failed";
      if (error instanceof Error) {
        if (error.message.includes("User rejected")) {
          errorMessage =
            "Authentication was cancelled. Please try again and approve the signature request.";
        } else if (error.message.includes("network")) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        } else {
          errorMessage = `Authentication failed: ${error.message}`;
        }
      }

      alert(errorMessage);
    }
  }, [
    walletClient,
    connectorClient,
    address,
    authenticate,
    isConnected,
    connector,
    chainId,
    switchChain,
  ]);

  // ============================================================
  // CHANNEL MANAGEMENT HANDLERS
  // ============================================================

  const handleOpenChannel = useCallback(async () => {
    if (!depositAmount || !networkConfig) {
      alert("Please enter a deposit amount");
      return;
    }

    try {
      const amount = parseAmount(depositAmount, 6); // USDC has 6 decimals
      const result = await openChannel({
        tokenAddress: networkConfig.usdcAddress,
        amount,
      });

      if (result.success) {
        alert(`Channel opened successfully! TX: ${result.transactionHash}`);
        setDepositAmount("");
      } else {
        alert(`Failed to open channel: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to open channel:", error);
      alert("Failed to open channel");
    }
  }, [depositAmount, networkConfig, parseAmount, openChannel]);

  const handleCloseChannel = useCallback(async () => {
    if (!withdrawAmount || !networkConfig) {
      alert("Please enter a withdrawal amount");
      return;
    }

    try {
      const amount = parseAmount(withdrawAmount, 6); // USDC has 6 decimals
      const result = await closeChannel({
        tokenAddress: networkConfig.usdcAddress,
        amount,
      });

      if (result.success) {
        alert(`Channel closed successfully! TX: ${result.transactionHash}`);
        setWithdrawAmount("");
      } else {
        alert(`Failed to close channel: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to close channel:", error);
      alert("Failed to close channel");
    }
  }, [withdrawAmount, networkConfig, parseAmount, closeChannel]);

  // ============================================================
  // TRANSFER HANDLERS
  // ============================================================

  const handleTransfer = useCallback(async () => {
    if (!transferRecipient || !transferAmount) {
      alert("Please enter recipient and amount");
      return;
    }

    try {
      const result = await transfer({
        recipient: transferRecipient as Address,
        amount: transferAmount,
        asset: "usdc",
      });

      if (result.success) {
        alert("Transfer completed successfully!");
        setTransferRecipient("");
        setTransferAmount("");
      } else {
        alert(`Transfer failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Transfer failed:", error);
      alert("Transfer failed");
    }
  }, [transferRecipient, transferAmount, transfer]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Yellow Network SDK Example</h1>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Network Info */}
      {networkConfig && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          <strong>Network:</strong> {networkConfig.network} |
          <strong> Current Chain:</strong> {chainId} |<strong> Custody:</strong>{" "}
          {networkConfig.custodyAddress.slice(0, 10)}
          ... |<strong> USDC:</strong> {networkConfig.usdcAddress.slice(0, 10)}
          ...
        </div>
      )}

      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-2">Connection</h3>
          <p
            className={`text-sm ${
              isConnected ? "text-green-600" : "text-red-600"
            }`}
          >
            Status: {connectionStatus}
          </p>
          <div className="mt-2 space-x-2">
            <button
              onClick={connect}
              disabled={isConnected}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm disabled:opacity-50"
            >
              Connect
            </button>
            <button
              onClick={disconnect}
              disabled={!isConnected}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-2">Authentication</h3>
          <p
            className={`text-sm ${
              isAuthenticated ? "text-green-600" : "text-red-600"
            }`}
          >
            Status: {isAuthenticated ? "Authenticated" : "Not Authenticated"}
          </p>
          {authState.account && (
            <p className="text-xs text-gray-600 mt-1">
              Account: {authState.account.slice(0, 10)}...
            </p>
          )}
          <div className="mt-2 space-x-2">
            <button
              onClick={handleAuthenticate}
              disabled={!isConnected || isAuthenticated || !address}
              className="px-3 py-1 bg-green-500 text-white rounded text-sm disabled:opacity-50"
            >
              Authenticate
            </button>
            <button
              onClick={logout}
              disabled={!isAuthenticated}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm disabled:opacity-50"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-2">Balances</h3>
          <div className="text-sm">
            {Object.entries(balances).length > 0 ? (
              Object.entries(balances).map(([asset, balance]) => (
                <div key={asset} className="flex justify-between">
                  <span>{asset.toUpperCase()}:</span>
                  <span>{balance}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No balances</p>
            )}
          </div>
          <button
            onClick={fetchBalances}
            disabled={!isAuthenticated}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm disabled:opacity-50"
          >
            Refresh
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

        {/* Open Channel */}
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
                disabled={!isAuthenticated || !depositAmount}
                className="w-full px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
              >
                Open Channel
              </button>
            </div>
          </div>

          {/* Close Channel */}
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
                disabled={!isAuthenticated || !withdrawAmount}
                className="w-full px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
              >
                Close Channel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Transfer</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Recipient Address"
            value={transferRecipient}
            onChange={(e) => setTransferRecipient(e.target.value)}
            className="p-2 border rounded"
          />
          <input
            type="number"
            placeholder="Amount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            className="p-2 border rounded"
          />
          <button
            onClick={handleTransfer}
            disabled={!isAuthenticated || !transferRecipient || !transferAmount}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SIMPLIFIED CHANNEL MANAGEMENT COMPONENT
// ============================================================

export function SimpleChannelManager() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const {
    channels,
    openChannel,
    closeChannel,
    isConnected,
    isAuthenticated,
    error,
    formatAmount,
    parseAmount,
  } = useYellowChannels({
    network: "mainnet",
    autoConnect: true,
  });

  const [amount, setAmount] = useState("");

  const handleDepositToChannel = useCallback(
    async (tokenAddress: Address, amount: bigint) => {
      try {
        const result = await openChannel({ tokenAddress, amount });

        if (result.success) {
          console.log("Channel opened successfully:", result);
          return true;
        } else {
          throw new Error(result.error || "Deposit failed");
        }
      } catch (depositError) {
        let errorMessage = "Deposit failed";

        if (
          String(depositError).includes("approve") &&
          String(depositError).includes("not been authorized")
        ) {
          errorMessage =
            "Token approval was rejected. Please approve the USDC spend in your wallet to proceed.";
        } else if (String(depositError).includes("user rejected transaction")) {
          errorMessage =
            "Transaction was rejected. Please confirm the transaction in your wallet.";
        } else {
          errorMessage = `Deposit error: ${depositError}`;
        }

        throw new Error(errorMessage);
      }
    },
    [openChannel]
  );

  const handleWithdrawFromChannel = useCallback(
    async (tokenAddress: Address, amount: bigint) => {
      try {
        const result = await closeChannel({ tokenAddress, amount });

        if (result.success) {
          console.log("Channel closed successfully:", result);
          return true;
        } else {
          throw new Error(result.error || "Withdrawal failed");
        }
      } catch (error) {
        console.error("Withdrawal failed:", error);
        throw error;
      }
    },
    [closeChannel]
  );

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Channel Manager</h2>

      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded mb-4">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Amount (USDC)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Enter amount"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (amount) {
                const usdcAddress = "0x..." as Address; // Replace with actual USDC address
                handleDepositToChannel(usdcAddress, parseAmount(amount, 6));
              }
            }}
            disabled={!isConnected || !isAuthenticated || !amount}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
          >
            Deposit
          </button>

          <button
            onClick={() => {
              if (amount) {
                const usdcAddress = "0x..." as Address; // Replace with actual USDC address
                handleWithdrawFromChannel(usdcAddress, parseAmount(amount, 6));
              }
            }}
            disabled={!isConnected || !isAuthenticated || !amount}
            className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>

        {/* Channel Status */}
        <div className="mt-4">
          <h3 className="font-medium mb-2">Channels</h3>
          {Object.entries(channels).length > 0 ? (
            Object.entries(channels).map(([id, channel]) => (
              <div key={id} className="p-2 bg-gray-50 rounded mb-2">
                <div className="text-sm">
                  <div>Balance: {channel.balance}</div>
                  <div>Status: {channel.isOpen ? "Open" : "Closed"}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No channels</p>
          )}
        </div>
      </div>
    </div>
  );
}
