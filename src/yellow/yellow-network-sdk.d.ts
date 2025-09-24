import { type Address, type WalletClient } from "viem";
import { type SessionKey } from "./yellow-network-utils";
export type ConnectionStatus = "Connecting" | "Connected" | "Disconnected";
export type NetworkType = "mainnet";
export interface YellowNetworkConfig {
    wsUrl: string;
    appName: string;
    scope: string;
    sessionDuration?: number;
    network?: NetworkType;
    rpcUrl?: string;
}
export interface AuthenticationState {
    isAuthenticated: boolean;
    isAuthAttempted: boolean;
    sessionKey: SessionKey | null;
    account: Address | null;
}
export interface ChannelState {
    isOpen: boolean;
    balance: string;
    tokenAddress: Address;
    channelId?: string;
    lastUpdate?: number;
}
export interface DepositParams {
    tokenAddress: Address;
    amount: bigint;
    recipient?: Address;
}
export interface WithdrawParams {
    tokenAddress: Address;
    amount: bigint;
    recipient?: Address;
}
export interface TransferParams {
    recipient: Address;
    amount: string;
    asset?: string;
}
export interface ChannelResult {
    success: boolean;
    channelId?: string;
    transactionHash?: string;
    error?: string;
}
export interface TransferResult {
    success: boolean;
    error?: string;
}
export interface SwapSession {
    sessionId: string;
    participant: Address;
    fromToken: Address;
    toToken: Address;
    amount: string;
    chainId: number;
    timestamp: number;
    expire: number;
    status: "created" | "channel_created" | "swap_initiated" | "completed" | "failed";
    channelId?: string;
    swapId?: string;
}
type ConnectionStatusListener = (status: ConnectionStatus) => void;
type AuthStateListener = (state: AuthenticationState) => void;
type BalanceListener = (balances: Record<string, string>) => void;
type TransferListener = (result: TransferResult) => void;
type ChannelListener = (channels: Record<string, ChannelState>) => void;
type ErrorListener = (error: string) => void;
export declare class YellowNetworkSDK {
    private socket;
    private config;
    private messageQueue;
    private chain;
    private connectionStatus;
    private authState;
    private walletClient;
    private publicClient;
    private balances;
    private channels;
    private isTransferring;
    private activeSwapSession;
    private connectionStatusListeners;
    private authStateListeners;
    private balanceListeners;
    private transferListeners;
    private channelListeners;
    private errorListeners;
    private sessionExpireTimestamp;
    private cachedSignature;
    private signatureSetCallback;
    constructor(config: YellowNetworkConfig);
    connect(): void;
    disconnect(): void;
    getConnectionStatus(): ConnectionStatus;
    authenticate(walletClient: WalletClient, account: Address): Promise<void>;
    logout(): void;
    getAuthState(): AuthenticationState;
    isAuthenticated(): boolean;
    setSignatureCallback(callback: (signature: {
        signature: `0x${string}`;
        timestamp: number;
        sessionKeyAddress: Address;
        account: Address;
        expireTimestamp: string;
    }) => void): void;
    setCachedSignature(signature: `0x${string}`): void;
    /**
     * Opens a channel by depositing tokens to the custody contract
     */
    openChannel(params: DepositParams): Promise<ChannelResult>;
    /**
     * Closes a channel by withdrawing tokens from the custody contract
     */
    closeChannel(params: WithdrawParams): Promise<ChannelResult>;
    /**
     * Gets the balance of a specific token in the custody contract
     */
    getChannelBalance(tokenAddress: Address, userAddress?: Address): Promise<string>;
    /**
     * Gets all open channels for the current user
     */
    getChannels(): Record<string, ChannelState>;
    /**
     * Gets a specific channel state
     */
    getChannel(tokenAddress: Address): ChannelState | null;
    /**
     * Refreshes channel balances from the contract
     */
    refreshChannelBalances(): Promise<void>;
    /**
     * Sends a transaction using Yellow Network SDK without showing wallet popups
     * This is the primary method for executing transactions through Yellow Network
     */
    sendTransaction(to: Address, data: `0x${string}`, value?: bigint, chainId?: number): Promise<{
        hash: `0x${string}`;
    }>;
    /**
     * Deposits tokens to Yellow Network channel with session management
     * This method handles the entire flow: EIP-712 session creation, allowance, and deposit
     */
    depositToChannel(tokenAddress: Address, amount: bigint, chainId?: number): Promise<ChannelResult>;
    fetchBalances(): Promise<void>;
    getBalances(): Record<string, string>;
    getBalance(asset: string): string | null;
    transfer(params: TransferParams): Promise<TransferResult>;
    isTransferInProgress(): boolean;
    onConnectionStatusChange(listener: ConnectionStatusListener): () => void;
    onAuthStateChange(listener: AuthStateListener): () => void;
    onBalanceChange(listener: BalanceListener): () => void;
    onChannelChange(listener: ChannelListener): () => void;
    onTransferComplete(listener: TransferListener): () => void;
    onError(listener: ErrorListener): () => void;
    private initializeSessionKey;
    private checkExistingJWT;
    private tryAutoAuthenticate;
    private startAuthentication;
    private handleAuthChallenge;
    private handleAuthSuccess;
    /**
     * Creates a new session for swap operations
     * This initializes the session with EIP-712 signatures
     */
    createSwapSession(fromToken: Address, toToken: Address, amount: bigint, chainId?: number): Promise<{
        sessionId: string;
        success: boolean;
        error?: string;
    }>;
    /**
     * Creates a channel for the swap operation
     */
    createSwapChannel(sessionId: string, tokenAddress: Address, amount: bigint, chainId?: number): Promise<ChannelResult>;
    /**
     * Sends a swap request message to Yellow Network API
     */
    sendSwapRequest(sessionId: string, swapParams: {
        fromToken: Address;
        toToken: Address;
        fromChain: string;
        toChain: string;
        amount: string;
        minAmountOut: string;
        recipient: Address;
        slippageBps?: number;
    }): Promise<{
        success: boolean;
        swapId?: string;
        error?: string;
    }>;
    /**
     * Waits for swap response from Yellow Network API
     */
    private waitForSwapResponse;
    /**
     * Executes the complete swap flow: session -> channel -> swap
     */
    executeCompleteSwap(params: {
        fromToken: Address;
        toToken: Address;
        fromChain: string;
        toChain: string;
        amount: bigint;
        minAmountOut: string;
        recipient: Address;
        slippageBps?: number;
        chainId?: number;
    }): Promise<{
        success: boolean;
        transactionHash?: string;
        error?: string;
    }>;
    /**
     * Signs session data using EIP-712
     */
    private signSessionData;
    private sendMessage;
    private handleMessage;
    private handleBalanceResponse;
    private handleBalanceUpdate;
    private handleTransferResponse;
    private handleError;
    private updateConnectionStatus;
    private updateAuthState;
    private notifyConnectionStatusListeners;
    private notifyAuthStateListeners;
    private notifyBalanceListeners;
    private notifyChannelListeners;
    private notifyTransferListeners;
    private notifyErrorListeners;
    private getCustodyAddress;
    private getUSDCAddress;
    /**
     * Gets the current network configuration
     */
    getNetworkConfig(): {
        network: NetworkType;
        custodyAddress: Address;
        usdcAddress: Address;
    };
    /**
     * Formats an amount with proper decimals
     */
    formatAmount(amount: bigint, decimals?: number): string;
    /**
     * Parses an amount string to bigint with proper decimals
     */
    parseAmount(amount: string, decimals?: number): bigint;
    /**
     * Gets the public client for direct contract interactions
     */
    getPublicClient(): any;
    /**
     * Gets the wallet client for signing transactions
     */
    getWalletClient(): any;
}
/**
 * Creates a new Yellow Network SDK instance with default configuration
 */
export declare function createYellowNetworkSDK(config?: Partial<YellowNetworkConfig>): YellowNetworkSDK;
export {};
