# @gryffindors/yellow

A comprehensive SDK for Yellow Network integration with simplified API, wagmi support, and React components.

## Features

- 🚀 **Simple API**: Easy-to-use wrapper around Yellow Network SDK
- 🔐 **EIP-712 Authentication**: Built-in wallet authentication with session management
- ⚡ **React Hooks**: Ready-to-use hooks for React applications
- 🎨 **UI Components**: Pre-built components for common operations
- 🔗 **Wagmi Integration**: Seamless wallet connection with MetaMask support
- � **P2pP Transfers**: Seamless peer-to-peer transfers with session keys
- 📦 **TypeScript**: Full TypeScript support with comprehensive types

## Installation

```bash
npm install @gryffindors/yellow
# or
yarn add @gryffindors/yellow
```

## Quick Start

### 1. Basic Setup

```typescript
import { createGryffindorsSDK } from '@gryffindors/yellow';

const sdk = createGryffindorsSDK({
  appName: "My DApp",
  scope: "trading"
});
```

### 2. React Integration

```tsx
import { GryffindorsProvider, WalletConnector } from '@gryffindors/yellow';
import { createGryffindorsSDK } from '@gryffindors/yellow';

const sdk = createGryffindorsSDK();

function App() {
  return (
    <GryffindorsProvider sdk={sdk}>
      <WalletConnector />
      {/* Your app components */}
    </GryffindorsProvider>
  );
}
```

### 3. Wagmi Setup

```tsx
import { WagmiProvider, createConfig } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { gryffindorsConnectors } from '@gryffindors/yellow';
import { polygon } from 'wagmi/chains';

const config = createConfig({
  chains: [polygon],
  connectors: gryffindorsConnectors,
  // ... other wagmi config
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Your app */}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

## Core API

### Initialize Channel
```typescript
await sdk.initializeChannel();
```

### Connect to ClearNode
```typescript
await sdk.connectToClearNode();
```

### Create Application Session
```typescript
const session = await sdk.createApplicationSession(walletClient, account);
```

### Perform Operations
```typescript
// Deposit
const result = await sdk.performOperation('deposit', {
  tokenAddress: '0x...',
  amount: '1000000' // in wei
});

// Transfer
const result = await sdk.performOperation('transfer', {
  to: '0x...',
  amount: '100',
  asset: 'usdc'
});
```

### Close Session
```typescript
await sdk.closeSession();
```

## React Hooks

### useGryffindors
Main hook for SDK integration:

```tsx
import { useGryffindors } from '@gryffindors/yellow';

function MyComponent() {
  const { 
    connectionStatus, 
    sessionInfo, 
    balances, 
    channels,
    connect,
    disconnect,
    refresh 
  } = useGryffindors(sdk);

  return (
    <div>
      <p>Status: {connectionStatus}</p>
      <p>Session: {sessionInfo.isActive ? 'Active' : 'Inactive'}</p>
      <button onClick={connect}>Connect</button>
    </div>
  );
}
```

### useGryffindorsWallet
Wallet connection with authentication:

```tsx
import { useGryffindorsWallet } from '@gryffindors/yellow';

function WalletComponent() {
  const { 
    walletState, 
    sessionInfo, 
    connectWallet, 
    disconnectWallet,
    signEIP712Message 
  } = useGryffindorsWallet(sdk);

  return (
    <div>
      {walletState.isConnected ? (
        <button onClick={disconnectWallet}>Disconnect</button>
      ) : (
        <button onClick={connectWallet}>Connect MetaMask</button>
      )}
    </div>
  );
}
```

### useGryffindorsChannels
Channel operations:

```tsx
import { useGryffindorsChannels } from '@gryffindors/yellow';

function ChannelComponent() {
  const { deposit, withdraw, isOperating, lastOperation } = useGryffindorsChannels(sdk);

  const handleDeposit = async () => {
    await deposit({
      tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
      amount: parseUnits('100', 6).toString()
    });
  };

  return (
    <div>
      <button onClick={handleDeposit} disabled={isOperating}>
        {isOperating ? 'Processing...' : 'Deposit 100 USDC'}
      </button>
    </div>
  );
}
```

## Components

### WalletConnector
Pre-built wallet connection component:

```tsx
import { WalletConnector } from '@gryffindors/yellow';

<WalletConnector />
```

### ChannelManager
Complete channel management UI:

```tsx
import { ChannelManager, COMMON_TOKENS } from '@gryffindors/yellow';

<ChannelManager 
  tokenAddress={COMMON_TOKENS.POLYGON.USDC}
  tokenSymbol="USDC"
/>
```

### TransferForm
Transfer funds UI:

```tsx
import { TransferForm } from '@gryffindors/yellow';

<TransferForm />
```

### P2P Transfer Components
Enhanced peer-to-peer transfer functionality:

```tsx
import { 
  P2PTransferForm, 
  QuickSupportButton, 
  P2PTransferStatus 
} from '@gryffindors/yellow';

// Complete P2P transfer form
<P2PTransferForm
  onSuccess={(hash) => console.log('Success:', hash)}
  onError={(error) => console.error('Error:', error)}
/>

// Quick support button for content creators
<QuickSupportButton
  recipient="0x742d35Cc6634C0532925a3b8D4C2C4e07b34ac7d"
  recipientName="Alice"
  amount="0.01"
  asset="usdc"
  onSuccess={() => alert('Thanks for supporting!')}
/>

// Transfer status and history
<P2PTransferStatus />
```

### BalanceDisplay
Show user balances:

```tsx
import { BalanceDisplay } from '@gryffindors/yellow';

<BalanceDisplay />
```

## Configuration

```typescript
interface GryffindorsConfig {
  wsUrl?: string;           // Yellow Network WebSocket URL
  appName?: string;         // Your app name
  scope?: string;           // Authentication scope
  sessionDuration?: number; // Session duration in seconds
  network?: 'mainnet' | 'testnet';
  rpcUrl?: string;         // Custom RPC URL
}
```

## Common Tokens

```typescript
import { COMMON_TOKENS } from '@gryffindors/yellow';

// Polygon tokens
const usdcAddress = COMMON_TOKENS.POLYGON.USDC;
const usdtAddress = COMMON_TOKENS.POLYGON.USDT;
```

## Error Handling

```typescript
import { GryffindorsError, GryffindorsSessionError } from '@gryffindors/yellow';

try {
  await sdk.performOperation('deposit', params);
} catch (error) {
  if (error instanceof GryffindorsSessionError) {
    // Handle session-related errors
  } else if (error instanceof GryffindorsError) {
    // Handle other SDK errors
  }
}
```

## P2P Transfers

The SDK includes comprehensive P2P transfer functionality following the Nitrolite tutorial patterns:

```tsx
import { useP2PTransfers, P2PTransferUtils } from '@gryffindors/yellow';

function MyTransferComponent() {
  const { transfer, quickTransfer, support, isTransferring } = useP2PTransfers(sdk);

  // Regular transfer
  const handleTransfer = async () => {
    const result = await transfer({
      to: "0x742d35Cc6634C0532925a3b8D4C2C4e07b34ac7d",
      amount: "1.0",
      asset: "usdc"
    });
  };

  // Quick support (like tipping content creators)
  const handleSupport = async () => {
    await support("0x742d35Cc6634C0532925a3b8D4C2C4e07b34ac7d", "0.01");
  };

  return (
    <div>
      <button onClick={handleTransfer} disabled={isTransferring}>
        Send 1 USDC
      </button>
      <button onClick={handleSupport} disabled={isTransferring}>
        Support with 0.01 USDC
      </button>
    </div>
  );
}
```

See [P2P_TRANSFERS.md](./P2P_TRANSFERS.md) for complete documentation and examples.

## License

MIT
