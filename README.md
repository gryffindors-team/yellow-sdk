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
import { polygon, base } from 'wagmi/chains';

// Enhanced connector configuration with multiple wallet support
const config = createConfig({
  chains: [polygon, base],
  connectors: gryffindorsConnectors, // Includes MetaMask, WalletConnect, Coinbase, Safe, and more
  // ... other wagmi config
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <GryffindorsProvider sdk={sdk}>
          <WalletConnector />
          {/* Your app components */}
        </GryffindorsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

#### Environment Variables

For full WalletConnect functionality, add to your `.env`:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

Get your project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/).

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
Enhanced wallet connection with multi-wallet authentication:

```tsx
import { useGryffindorsWallet } from '@gryffindors/yellow';

function WalletComponent() {
  const { 
    walletState, 
    sessionInfo, 
    connectWallet, 
    disconnectWallet,
    createSession,
    signEIP712Message,
    isConnecting 
  } = useGryffindorsWallet(sdk);

  return (
    <div>
      {walletState.isConnected ? (
        <div>
          <p>Connected: {walletState.address}</p>
          <p>Chain: {walletState.chainId}</p>
          <p>Session: {sessionInfo.isActive ? 'Active' : 'Inactive'}</p>
          <button onClick={disconnectWallet}>Disconnect</button>
          {!sessionInfo.isActive && (
            <button onClick={createSession}>Create Session</button>
          )}
        </div>
      ) : (
        <button onClick={connectWallet} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
}
```

#### Hook Return Values

```typescript
interface UseGryffindorsWalletReturn {
  // Wallet connection state
  walletState: {
    isConnected: boolean;
    address: Address | null;
    chainId: number | null;
  };
  
  // Session state
  sessionInfo: {
    isActive: boolean;
    sessionKey: string | null;
    account: Address | null;
    expiresAt: number | null;
  };
  
  // Connection status
  isConnecting: boolean;
  
  // Actions
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  createSession: () => Promise<SessionInfo>;
  signEIP712Message: (message: any, types: any, domain: any) => Promise<string>;
  
  // Raw wagmi data for advanced usage
  address: Address | undefined;
  isConnected: boolean;
  chainId: number | undefined;
  walletClient: WalletClient | undefined;
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
Enhanced wallet connection component with multi-wallet support:

```tsx
import { WalletConnector } from '@gryffindors/yellow';

// Default setup (MetaMask only - clean single wallet UI)
<WalletConnector />

// Multiple wallet options
<WalletConnector 
  supportedWallets={['metamask', 'walletconnect', 'coinbase', 'trust']}
/>

// Different default wallet with multiple options
<WalletConnector 
  defaultWallet="walletconnect"
  supportedWallets={['walletconnect', 'trust', 'rainbow', 'metamask']}
/>

// Single specific wallet
<WalletConnector 
  defaultWallet="coinbase"
  supportedWallets={['coinbase']}
/>
```

#### Supported Wallets

**Popular Wallets** (Featured prominently):
- 🦊 **MetaMask** - Browser extension wallet (default)
- 🔗 **WalletConnect** - Mobile wallets via QR code
- 🔵 **Coinbase Wallet** - Coinbase's official wallet
- 🛡️ **Trust Wallet** - Popular mobile wallet
- 🌈 **Rainbow** - Beautiful Ethereum wallet

**Additional Wallets** (Available in dropdown):
- 🔒 **Safe (Gnosis)** - Multisig wallet for teams/DAOs
- 👻 **Phantom** - Popular wallet with Ethereum support
- 🌐 **Browser Wallet** - Any injected wallet provider

#### WalletConnector Props

```typescript
interface WalletConnectorProps {
  /** Default wallet to connect to. Defaults to 'metamask' */
  defaultWallet?: 'metamask' | 'walletconnect' | 'coinbase' | 'safe' | 'trust' | 'rainbow' | 'phantom' | 'injected';
  
  /** Array of supported wallets. If not provided, shows ONLY the default wallet */
  supportedWallets?: Array<'metamask' | 'walletconnect' | 'coinbase' | 'safe' | 'trust' | 'rainbow' | 'phantom' | 'injected'>;
  
  /** Custom styling class */
  className?: string;
}
```

**Key Behavior Changes:**
- **Default**: Shows only MetaMask (clean, simple UI)
- **Multiple Wallets**: Only when `supportedWallets` is explicitly provided
- **Connector Mapping**: Fixed to use correct wagmi connector IDs

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

### SDK Configuration

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

### Wallet Configuration

The SDK includes pre-configured connectors for multiple wallets. You can customize which wallets are available:

```typescript
import { gryffindorsConnectors } from '@gryffindors/yellow';

// All connectors (default)
const allConnectors = gryffindorsConnectors;

// Custom connector setup
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

const customConnectors = [
  injected({ target: 'metaMask' }),
  walletConnect({
    projectId: 'your-project-id',
    metadata: {
      name: 'Your DApp',
      description: 'Your DApp Description',
      url: 'https://yourdapp.com',
      icons: ['https://yourdapp.com/icon.png']
    }
  }),
  coinbaseWallet({
    appName: 'Your DApp',
    appLogoUrl: 'https://yourdapp.com/icon.png'
  })
];
```

### Environment Variables

```bash
# Required for WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Optional: Custom RPC endpoints
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_BASE_RPC_URL=https://base-rpc.com
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

## Troubleshooting

### Wallet Connection Issues

**MetaMask not detected:**
```typescript
// Check if MetaMask is installed
if (typeof window.ethereum !== 'undefined') {
  console.log('MetaMask is installed!');
} else {
  console.log('Please install MetaMask');
}
```

**WalletConnect not working:**
- Ensure you have a valid `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- Check that your domain is registered in WalletConnect Cloud
- Verify the metadata configuration is correct

**Coinbase Wallet issues:**
- Make sure the app name and logo URL are properly configured
- Check that the user has Coinbase Wallet installed or is using the web version

**Safe (Gnosis) connection:**
- Ensure you're connecting from a supported domain (gnosis-safe.io or app.safe.global)
- Verify the Safe is on the correct network

### Common Error Messages

**"Connector not found":**
```typescript
// Fallback to injected connector
const connector = connectors.find(c => c.id === 'injected') || connectors[0];
```

**"Session expired":**
```typescript
// Recreate session
await sdk.closeSession();
await sdk.createApplicationSession(walletClient, address);
```

**"Network mismatch":**
```typescript
// Switch to correct network
await walletClient.switchChain({ id: 137 }); // Polygon
```

### Debug Mode

Enable debug logging:

```typescript
const sdk = createGryffindorsSDK({
  debug: true,
  // ... other config
});
```

## Examples

Check out the [examples](./examples) directory for complete implementation examples:

- [Basic React App](./examples/basic-react)
- [Next.js Integration](./examples/nextjs)
- [Multi-wallet Setup](./examples/multi-wallet)
- [P2P Transfer App](./examples/p2p-transfers)

## License

MIT
