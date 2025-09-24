import {
  type Address,
  type WalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  createGetLedgerBalancesMessage,
  createTransferMessage,
  parseAnyRPCResponse,
  RPCMethod,
  type AuthChallengeResponse,
  type AuthRequestParams,
  type GetLedgerBalancesResponse,
  type BalanceUpdateResponse,
  type TransferResponse,
} from "@erc7824/nitrolite";
import {
  generateSessionKey,
  getStoredSessionKey,
  storeSessionKey,
  removeSessionKey,
  storeJWT,
  removeJWT,
  getStoredJWT,
  eip712SignatureAtom,
  isEIP712SignatureValid,
  type SessionKey,
} from "./yellow-network-utils";

// ============================================================
// TYPES AND INTERFACES
// ============================================================

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
  status:
    | "created"
    | "channel_created"
    | "swap_initiated"
    | "completed"
    | "failed";
  channelId?: string;
  swapId?: string;
}

// Contract ABIs
const CUSTODY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address[]", name: "accounts", type: "address[]" },
      { internalType: "address[]", name: "tokens", type: "address[]" },
    ],
    name: "getAccountsBalances",
    outputs: [{ internalType: "uint256[][]", name: "", type: "uint256[][]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "address", name: "token", type: "address" },
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "Deposit",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "Withdraw",
    type: "event",
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Contract addresses for mainnet networks
const CONTRACT_ADDRESSES = {
  mainnet: {
    polygon: {
      custody: "0x6F71a38d919ad713D0AfE0eB712b95064Fc2616f" as Address, // Yellow Network Custody on Polygon
      usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address, // USDC on Polygon
      usdcNative: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" as Address, // Native USDC on Polygon
    },
    base: {
      custody: "0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6" as Address, // Yellow Network Custody on Base
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, // USDC on Base
    },
  },
};

// Event listener types
type ConnectionStatusListener = (status: ConnectionStatus) => void;
type AuthStateListener = (state: AuthenticationState) => void;
type BalanceListener = (balances: Record<string, string>) => void;
type TransferListener = (result: TransferResult) => void;
type ChannelListener = (channels: Record<string, ChannelState>) => void;
type ErrorListener = (error: string) => void;

// ============================================================
// MAIN SDK CLASS
// ============================================================

export class YellowNetworkSDK {
  private socket: WebSocket | null = null;
  private config: YellowNetworkConfig;
  private messageQueue: string[] = [];
  private chain: typeof polygon | typeof polygonAmoy;

  private connectionStatus: ConnectionStatus = "Disconnected";
  private authState: AuthenticationState = {
    isAuthenticated: false,
    isAuthAttempted: false,
    sessionKey: null,
    account: null,
  };

  private walletClient: WalletClient | null = null;
  private publicClient: any = null;
  private balances: Record<string, string> = {};
  private channels: Record<string, ChannelState> = {};
  private isTransferring = false;
  private activeSwapSession: SwapSession | null = null;

  // Event listeners
  private connectionStatusListeners = new Set<ConnectionStatusListener>();
  private authStateListeners = new Set<AuthStateListener>();
  private balanceListeners = new Set<BalanceListener>();
  private transferListeners = new Set<TransferListener>();
  private channelListeners = new Set<ChannelListener>();
  private errorListeners = new Set<ErrorListener>();

  private sessionExpireTimestamp = "";
  private cachedSignature: `0x${string}` | null = null;
  private signatureSetCallback: ((signature: {
    signature: `0x${string}`;
    timestamp: number;
    sessionKeyAddress: Address;
    account: Address;
    expireTimestamp: string;
  }) => void) | null = null;

  constructor(config: YellowNetworkConfig) {
    this.config = {
      sessionDuration: 3600,
      network: "mainnet",
      ...config,
    };

    // Initialize public client for contract interactions
    this.chain = polygon;
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.config.rpcUrl || this.chain.rpcUrls.default.http[0]),
    });

    this.initializeSessionKey();
    this.checkExistingJWT();
  }

  // ============================================================
  // PUBLIC API - Connection Management
  // ============================================================

  public connect(): void {
    if (this.socket && this.socket.readyState < 2) return;

    if (!this.config.wsUrl) {
      console.error("WebSocket URL is not configured");
      this.updateConnectionStatus("Disconnected");
      return;
    }

    this.updateConnectionStatus("Connecting");
    this.socket = new WebSocket(this.config.wsUrl);

    this.socket.onopen = () => {
      console.log("Yellow Network WebSocket Connected");
      this.updateConnectionStatus("Connected");

      this.messageQueue.forEach((msg) => this.socket?.send(msg));
      this.messageQueue = [];

      this.tryAutoAuthenticate();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    this.socket.onclose = () => {
      console.log("Yellow Network WebSocket Disconnected");
      this.updateConnectionStatus("Disconnected");
    };

    this.socket.onerror = (error) => {
      console.error("Yellow Network WebSocket Error:", error);
      this.updateConnectionStatus("Disconnected");
    };
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.updateConnectionStatus("Disconnected");
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  // ============================================================
  // PUBLIC API - Authentication
  // ============================================================

  public async authenticate(
    walletClient: WalletClient,
    account: Address
  ): Promise<void> {
    this.walletClient = walletClient;
    this.updateAuthState({ account });

    if (this.connectionStatus === "Connected") {
      await this.startAuthentication();
    }
  }

  public logout(): void {
    removeJWT();
    removeSessionKey();

    this.authState = {
      isAuthenticated: false,
      isAuthAttempted: false,
      sessionKey: null,
      account: null,
    };
    this.walletClient = null;
    this.balances = {};
    this.channels = {};
    this.isTransferring = false;

    this.notifyAuthStateListeners();
    this.notifyBalanceListeners();
    this.notifyChannelListeners();

    this.initializeSessionKey();
  }

  public getAuthState(): AuthenticationState {
    return { ...this.authState };
  }

  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  // ============================================================
  // PUBLIC API - Signature Management
  // ============================================================

  public setSignatureCallback(callback: (signature: {
    signature: `0x${string}`;
    timestamp: number;
    sessionKeyAddress: Address;
    account: Address;
    expireTimestamp: string;
  }) => void): void {
    this.signatureSetCallback = callback;
  }

  public setCachedSignature(signature: `0x${string}`): void {
    this.cachedSignature = signature;
  }

  // ============================================================
  // PUBLIC API - Channel Management
  // ============================================================

  /**
   * Opens a channel by depositing tokens to the custody contract
   */
  public async openChannel(params: DepositParams): Promise<ChannelResult> {
    if (!this.walletClient || !this.authState.account) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const { tokenAddress, amount, recipient } = params;
      const custodyAddress = this.getCustodyAddress();

      // Check if token needs approval
      const allowance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [this.authState.account, custodyAddress],
      });

      // Approve if necessary
      if (allowance < amount) {
        console.log("Approving token spend...");
        const approveHash = await this.walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [custodyAddress, amount],
          account: this.authState.account,
          chain: this.chain,
        });

        // Wait for approval confirmation
        await this.publicClient.waitForTransactionReceipt({
          hash: approveHash,
        });
        console.log("Token approval confirmed:", approveHash);
      }

      // Deposit to custody contract
      console.log("Depositing to channel...");
      const depositHash = await this.walletClient.writeContract({
        address: custodyAddress,
        abi: CUSTODY_ABI,
        functionName: "deposit",
        args: [this.authState.account, tokenAddress, amount],
        account: this.authState.account,
        chain: this.chain,
      });

      // Wait for deposit confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: depositHash,
      });

      // Update local channel state
      const channelId = `${tokenAddress}-${this.authState.account}`;
      this.channels[channelId] = {
        isOpen: true,
        balance: formatUnits(amount, 18), // Adjust decimals as needed
        tokenAddress,
        channelId,
        lastUpdate: Date.now(),
      };

      this.notifyChannelListeners();

      console.log("Channel opened successfully:", {
        channelId,
        transactionHash: depositHash,
        amount: formatUnits(amount, 18),
      });

      return {
        success: true,
        channelId,
        transactionHash: depositHash,
      };
    } catch (error) {
      console.error("Failed to open channel:", error);

      let errorMessage = "Failed to open channel";
      if (
        String(error).includes("approve") &&
        String(error).includes("not been authorized")
      ) {
        errorMessage =
          "Token approval was rejected. Please approve the token spend in your wallet to proceed.";
      } else if (String(error).includes("user rejected transaction")) {
        errorMessage =
          "Transaction was rejected. Please confirm the transaction in your wallet.";
      } else {
        errorMessage = `Channel opening error: ${error}`;
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Closes a channel by withdrawing tokens from the custody contract
   */
  public async closeChannel(params: WithdrawParams): Promise<ChannelResult> {
    if (!this.walletClient || !this.authState.account) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const { tokenAddress, amount, recipient } = params;
      const custodyAddress = this.getCustodyAddress();
      const withdrawRecipient = recipient || this.authState.account;

      console.log("Withdrawing from channel...");
      const withdrawHash = await this.walletClient.writeContract({
        address: custodyAddress,
        abi: CUSTODY_ABI,
        functionName: "withdraw",
        args: [tokenAddress, amount],
        account: this.authState.account,
        chain: this.chain,
      });
      // Wait for withdrawal confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: withdrawHash,
      });

      // Update local channel state
      const channelId = `${tokenAddress}-${this.authState.account}`;
      if (this.channels[channelId]) {
        const currentBalance = parseFloat(this.channels[channelId].balance);
        const withdrawAmount = parseFloat(formatUnits(amount, 18));

        if (currentBalance <= withdrawAmount) {
          // Channel is fully closed
          this.channels[channelId].isOpen = false;
          this.channels[channelId].balance = "0";
        } else {
          // Partial withdrawal
          this.channels[channelId].balance = (
            currentBalance - withdrawAmount
          ).toString();
        }

        this.channels[channelId].lastUpdate = Date.now();
      }

      this.notifyChannelListeners();

      console.log("Channel closed successfully:", {
        channelId,
        transactionHash: withdrawHash,
        amount: formatUnits(amount, 18),
      });

      return {
        success: true,
        channelId,
        transactionHash: withdrawHash,
      };
    } catch (error) {
      console.error("Failed to close channel:", error);

      let errorMessage = "Failed to close channel";
      if (String(error).includes("user rejected transaction")) {
        errorMessage =
          "Transaction was rejected. Please confirm the transaction in your wallet.";
      } else {
        errorMessage = `Channel closing error: ${error}`;
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Gets the balance of a specific token in the custody contract
   */
  public async getChannelBalance(
    tokenAddress: Address,
    userAddress?: Address
  ): Promise<string> {
    try {
      const user = userAddress || this.authState.account;
      if (!user) throw new Error("No user address provided");

      // Use getAccountsBalances function from the custody contract
      const balances = await this.publicClient.readContract({
        address: this.getCustodyAddress(),
        abi: CUSTODY_ABI,
        functionName: "getAccountsBalances",
        args: [[user], [tokenAddress]],
      });

      // Extract balance for the user and token (balances is 2D array)
      const balance = balances[0]?.[0] || 0n;
      return formatUnits(balance, 18); // Adjust decimals as needed
    } catch (error) {
      console.error("Failed to get channel balance:", error);
      return "0";
    }
  }

  /**
   * Gets all open channels for the current user
   */
  public getChannels(): Record<string, ChannelState> {
    return { ...this.channels };
  }

  /**
   * Gets a specific channel state
   */
  public getChannel(tokenAddress: Address): ChannelState | null {
    if (!this.authState.account) return null;

    const channelId = `${tokenAddress}-${this.authState.account}`;
    return this.channels[channelId] || null;
  }

  /**
   * Refreshes channel balances from the contract
   */
  public async refreshChannelBalances(): Promise<void> {
    if (!this.authState.account) return;

    try {
      for (const [channelId, channel] of Object.entries(this.channels)) {
        if (channel.isOpen) {
          const balance = await this.getChannelBalance(channel.tokenAddress);
          this.channels[channelId].balance = balance;
          this.channels[channelId].lastUpdate = Date.now();
        }
      }

      this.notifyChannelListeners();
    } catch (error) {
      console.error("Failed to refresh channel balances:", error);
    }
  }

  /**
   * Sends a transaction using Yellow Network SDK without showing wallet popups
   * This is the primary method for executing transactions through Yellow Network
   */
  public async sendTransaction(
    to: Address,
    data: `0x${string}`,
    value: bigint = 0n,
    chainId?: number
  ): Promise<{ hash: `0x${string}` }> {
    if (!this.walletClient || !this.authState.account) {
      throw new Error("Wallet not connected or not authenticated");
    }

    if (!this.authState.isAuthenticated || !this.authState.sessionKey) {
      throw new Error("Not authenticated with Yellow Network");
    }

    try {
      console.log("Executing transaction through Yellow Network SDK...");

      // Use the wallet client to send the transaction
      const hash = await this.walletClient.sendTransaction({
        to,
        data,
        value,
        account: this.authState.account,
        chain: this.chain,
      });

      console.log("Transaction sent via Yellow Network:", hash);
      return { hash };
    } catch (error) {
      console.error("Failed to send transaction via Yellow Network:", error);
      throw error;
    }
  }

  /**
   * Deposits tokens to Yellow Network channel with session management
   * This method handles the entire flow: EIP-712 session creation, allowance, and deposit
   */
  public async depositToChannel(
    tokenAddress: Address,
    amount: bigint,
    chainId?: number
  ): Promise<ChannelResult> {
    if (!this.walletClient || !this.authState.account) {
      return { success: false, error: "Wallet not connected" };
    }

    if (!this.authState.isAuthenticated || !this.authState.sessionKey) {
      return { success: false, error: "Not authenticated with Yellow Network" };
    }

    try {
      const custodyAddress = this.getCustodyAddress(chainId);
      const account = this.authState.account;

      console.log("Starting Yellow Network deposit flow...", {
        tokenAddress,
        custodyAddress,
        amount: amount.toString(),
        chainId: chainId || 137,
      });

      // Check current allowance
      const currentAllowance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, custodyAddress],
      });

      // Approve tokens if needed
      if (currentAllowance < amount) {
        console.log("Approving token spend for Yellow Network...");
        const approveHash = await this.walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [custodyAddress, amount],
          account,
          chain: this.chain,
        });

        await this.publicClient.waitForTransactionReceipt({
          hash: approveHash,
        });
        console.log("Token approval confirmed:", approveHash);
      }

      // Perform deposit using Yellow Network custody contract
      console.log("Depositing to Yellow Network custody contract...");
      const depositHash = await this.walletClient.writeContract({
        address: custodyAddress,
        abi: CUSTODY_ABI,
        functionName: "deposit",
        args: [account, tokenAddress, amount],
        account,
        chain: this.chain,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: depositHash,
      });

      // Update channel state
      const channelId = `${tokenAddress}-${account}`;
      this.channels[channelId] = {
        isOpen: true,
        balance: formatUnits(amount, 18),
        tokenAddress,
        channelId,
        lastUpdate: Date.now(),
      };

      this.notifyChannelListeners();

      console.log("Yellow Network deposit completed:", {
        channelId,
        transactionHash: depositHash,
        amount: formatUnits(amount, 18),
      });

      return {
        success: true,
        channelId,
        transactionHash: depositHash,
      };
    } catch (error) {
      console.error("Yellow Network deposit failed:", error);

      let errorMessage = "Deposit failed";
      if (
        String(error).includes("approve") &&
        String(error).includes("not been authorized")
      ) {
        errorMessage =
          "Token approval was rejected. Please approve the USDC spend in your wallet to proceed.";
      } else if (String(error).includes("user rejected transaction")) {
        errorMessage =
          "Transaction was rejected. Please confirm the transaction in your wallet.";
      } else {
        errorMessage = `Deposit error: ${error}`;
      }

      return { success: false, error: errorMessage };
    }
  }

  // ============================================================
  // PUBLIC API - Balance Management
  // ============================================================

  public async fetchBalances(): Promise<void> {
    if (
      !this.authState.isAuthenticated ||
      !this.authState.sessionKey ||
      !this.authState.account
    ) {
      throw new Error("Not authenticated");
    }

    try {
      const sessionSigner = createECDSAMessageSigner(
        this.authState.sessionKey.privateKey
      );
      const balancePayload = await createGetLedgerBalancesMessage(
        sessionSigner,
        this.authState.account
      );
      this.sendMessage(balancePayload);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to fetch balances";
      this.notifyErrorListeners(errorMsg);
      throw error;
    }
  }

  public getBalances(): Record<string, string> {
    return { ...this.balances };
  }

  public getBalance(asset: string): string | null {
    return (
      this.balances[asset.toLowerCase()] ||
      this.balances[asset.toUpperCase()] ||
      null
    );
  }

  // ============================================================
  // PUBLIC API - Transfers
  // ============================================================

  public async transfer(params: TransferParams): Promise<TransferResult> {
    if (!this.authState.isAuthenticated || !this.authState.sessionKey) {
      return { success: false, error: "Not authenticated" };
    }

    if (this.isTransferring) {
      return { success: false, error: "Transfer already in progress" };
    }

    try {
      this.isTransferring = true;

      const sessionSigner = createECDSAMessageSigner(
        this.authState.sessionKey.privateKey
      );
      const transferPayload = await createTransferMessage(sessionSigner, {
        destination: params.recipient,
        allocations: [
          {
            asset: (params.asset || "usdc").toLowerCase(),
            amount: params.amount,
          },
        ],
      });

      this.sendMessage(transferPayload);
      return { success: true };
    } catch (error) {
      this.isTransferring = false;
      const errorMsg =
        error instanceof Error ? error.message : "Transfer failed";
      const result = { success: false, error: errorMsg };
      this.notifyTransferListeners(result);
      return result;
    }
  }

  public isTransferInProgress(): boolean {
    return this.isTransferring;
  }

  // ============================================================
  // PUBLIC API - Event Listeners
  // ============================================================

  public onConnectionStatusChange(
    listener: ConnectionStatusListener
  ): () => void {
    this.connectionStatusListeners.add(listener);
    listener(this.connectionStatus);

    return () => {
      this.connectionStatusListeners.delete(listener);
    };
  }

  public onAuthStateChange(listener: AuthStateListener): () => void {
    this.authStateListeners.add(listener);
    listener(this.getAuthState());

    return () => {
      this.authStateListeners.delete(listener);
    };
  }

  public onBalanceChange(listener: BalanceListener): () => void {
    this.balanceListeners.add(listener);
    listener(this.getBalances());

    return () => {
      this.balanceListeners.delete(listener);
    };
  }

  public onChannelChange(listener: ChannelListener): () => void {
    this.channelListeners.add(listener);
    listener(this.getChannels());

    return () => {
      this.channelListeners.delete(listener);
    };
  }

  public onTransferComplete(listener: TransferListener): () => void {
    this.transferListeners.add(listener);

    return () => {
      this.transferListeners.delete(listener);
    };
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  // ============================================================
  // PRIVATE METHODS - Initialization
  // ============================================================

  private initializeSessionKey(): void {
    const existingSessionKey = getStoredSessionKey();
    if (existingSessionKey) {
      this.updateAuthState({ sessionKey: existingSessionKey });
    } else {
      const newSessionKey = generateSessionKey();
      storeSessionKey(newSessionKey);
      this.updateAuthState({ sessionKey: newSessionKey });
    }
  }

  private checkExistingJWT(): void {
    const storedJWT = getStoredJWT();
    if (storedJWT) {
      console.log("Found existing JWT token - could implement quick re-auth");
      // TODO: Implement JWT-based quick authentication
    }
  }

  private tryAutoAuthenticate(): void {
    if (
      this.authState.account &&
      this.authState.sessionKey &&
      this.connectionStatus === "Connected" &&
      !this.authState.isAuthenticated &&
      !this.authState.isAuthAttempted &&
      this.walletClient
    ) {
      this.startAuthentication();
    }
  }

  // ============================================================
  // PRIVATE METHODS - Authentication Flow
  // ============================================================

  private async startAuthentication(): Promise<void> {
    if (!this.authState.account || !this.authState.sessionKey) {
      throw new Error("Missing account or session key");
    }

    this.updateAuthState({ isAuthAttempted: true });

    this.sessionExpireTimestamp = String(
      Math.floor(Date.now() / 1000) + (this.config.sessionDuration || 3600)
    );

    const authParams: AuthRequestParams = {
      address: this.authState.account,
      session_key: this.authState.sessionKey.address,
      app_name: this.config.appName,
      expire: this.sessionExpireTimestamp,
      scope: this.config.scope,
      application: this.authState.account,
      allowances: [],
    };

    try {
      const payload = await createAuthRequestMessage(authParams);
      this.sendMessage(payload);
    } catch (error) {
      this.updateAuthState({ isAuthAttempted: false });
      const errorMsg =
        error instanceof Error ? error.message : "Authentication failed";
      this.notifyErrorListeners(errorMsg);
    }
  }

  private async handleAuthChallenge(
    response: AuthChallengeResponse
  ): Promise<void> {
    if (
      !this.walletClient ||
      !this.authState.sessionKey ||
      !this.authState.account ||
      !this.sessionExpireTimestamp
    ) {
      throw new Error("Missing authentication prerequisites");
    }

    const authParams = {
      scope: this.config.scope,
      application: this.walletClient.account?.address as `0x${string}`,
      participant: this.authState.sessionKey.address as `0x${string}`,
      expire: this.sessionExpireTimestamp,
      allowances: [],
    };

    const eip712Signer = createEIP712AuthMessageSigner(
      this.walletClient,
      authParams,
      { name: this.config.appName }
    );

    try {
      const authVerifyPayload = await createAuthVerifyMessage(
        eip712Signer,
        response
      );
      this.sendMessage(authVerifyPayload);
    } catch (error) {
      this.updateAuthState({ isAuthAttempted: false });
      const errorMsg = "Signature rejected. Please try again.";
      this.notifyErrorListeners(errorMsg);
    }
  }

  private handleAuthSuccess(params: any): void {
    this.updateAuthState({ isAuthenticated: true });

    if (params.jwtToken) {
      storeJWT(params.jwtToken);
    }

    // Auto-fetch balances after successful authentication
    this.fetchBalances().catch((error) => {
      console.warn("Failed to fetch balances after authentication:", error);
    });
  }

  // ============================================================
  // PUBLIC API - Session and Swap Management
  // ============================================================

  /**
   * Creates a new session for swap operations
   * This initializes the session with EIP-712 signatures
   */
  public async createSwapSession(
    fromToken: Address,
    toToken: Address,
    amount: bigint,
    chainId?: number
  ): Promise<{ sessionId: string; success: boolean; error?: string }> {
    if (!this.authState.isAuthenticated || !this.authState.sessionKey) {
      return { sessionId: "", success: false, error: "Not authenticated" };
    }

    try {
      const sessionId = `swap-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      console.log("Creating Yellow Network swap session:", {
        sessionId,
        fromToken,
        toToken,
        amount: amount.toString(),
        chainId: chainId || 137,
      });

      // Create session parameters with EIP-712 signing
      const sessionParams = {
        sessionId,
        participant: this.authState.account!,
        fromToken,
        toToken,
        amount: amount.toString(),
        chainId: chainId || 137,
        timestamp: Date.now(),
        expire: Date.now() + 30 * 60 * 1000, // 30 minutes
      };

      // Send session creation message to Yellow Network API
      const sessionMessage = {
        type: "create_swap_session",
        payload: sessionParams,
        signature: await this.signSessionData(sessionParams),
      };

      this.sendMessage(JSON.stringify(sessionMessage));

      // Store session locally
      this.activeSwapSession = {
        sessionId,
        participant: this.authState.account!,
        fromToken,
        toToken,
        amount: amount.toString(),
        chainId: chainId || 137,
        timestamp: Date.now(),
        expire: Date.now() + 30 * 60 * 1000, // 30 minutes
        status: "created",
      };

      console.log("Swap session created:", sessionId);
      return { sessionId, success: true };
    } catch (error) {
      console.error("Failed to create swap session:", error);
      return {
        sessionId: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Creates a channel for the swap operation
   */
  public async createSwapChannel(
    sessionId: string,
    tokenAddress: Address,
    amount: bigint,
    chainId?: number
  ): Promise<ChannelResult> {
    if (
      !this.activeSwapSession ||
      this.activeSwapSession.sessionId !== sessionId
    ) {
      return { success: false, error: "Invalid or expired session" };
    }

    try {
      console.log("Creating swap channel for session:", sessionId);

      // Use existing depositToChannel method but with session context
      const depositResult = await this.depositToChannel(
        tokenAddress,
        amount,
        chainId
      );

      if (depositResult.success) {
        // Update session with channel info
        this.activeSwapSession.channelId = depositResult.channelId;
        this.activeSwapSession.status = "channel_created";

        // Notify Yellow Network API about channel creation
        const channelMessage = {
          type: "swap_channel_created",
          payload: {
            sessionId,
            channelId: depositResult.channelId,
            tokenAddress,
            amount: amount.toString(),
            transactionHash: depositResult.transactionHash,
          },
          signature: await this.signSessionData({
            sessionId,
            channelId: depositResult.channelId,
          }),
        };

        this.sendMessage(JSON.stringify(channelMessage));
        console.log(
          "Swap channel created and notified to API:",
          depositResult.channelId
        );
      }

      return depositResult;
    } catch (error) {
      console.error("Failed to create swap channel:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Channel creation failed",
      };
    }
  }

  /**
   * Sends a swap request message to Yellow Network API
   */
  public async sendSwapRequest(
    sessionId: string,
    swapParams: {
      fromToken: Address;
      toToken: Address;
      fromChain: string;
      toChain: string;
      amount: string;
      minAmountOut: string;
      recipient: Address;
      slippageBps?: number;
    }
  ): Promise<{ success: boolean; swapId?: string; error?: string }> {
    if (
      !this.activeSwapSession ||
      this.activeSwapSession.sessionId !== sessionId
    ) {
      return { success: false, error: "Invalid or expired session" };
    }

    try {
      const swapId = `swap-${sessionId}-${Date.now()}`;

      console.log("Sending swap request to Yellow Network API:", {
        sessionId,
        swapId,
      });

      const swapRequestMessage = {
        type: "initiate_swap",
        payload: {
          sessionId,
          swapId,
          ...swapParams,
          timestamp: Date.now(),
        },
        signature: await this.signSessionData({
          sessionId,
          swapId,
          ...swapParams,
        }),
      };

      this.sendMessage(JSON.stringify(swapRequestMessage));

      // Update session
      this.activeSwapSession.swapId = swapId;
      this.activeSwapSession.status = "swap_initiated";

      // Wait for response from API
      return await this.waitForSwapResponse(swapId);
    } catch (error) {
      console.error("Failed to send swap request:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Swap request failed",
      };
    }
  }

  /**
   * Waits for swap response from Yellow Network API
   */
  private async waitForSwapResponse(
    swapId: string
  ): Promise<{ success: boolean; swapId?: string; error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: "Swap response timeout" });
      }, 60000); // 1 minute timeout

      // Add temporary message listener for swap response
      const originalHandler = this.handleMessage.bind(this);
      this.handleMessage = async (data: any) => {
        await originalHandler(data);

        if (data.type === "swap_response" && data.payload?.swapId === swapId) {
          clearTimeout(timeout);
          this.handleMessage = originalHandler;

          if (data.payload.success) {
            resolve({ success: true, swapId });
          } else {
            resolve({
              success: false,
              error: data.payload.error || "Swap failed",
            });
          }
        }
      };
    });
  }

  /**
   * Executes the complete swap flow: session -> channel -> swap
   */
  public async executeCompleteSwap(params: {
    fromToken: Address;
    toToken: Address;
    fromChain: string;
    toChain: string;
    amount: bigint;
    minAmountOut: string;
    recipient: Address;
    slippageBps?: number;
    chainId?: number;
  }): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      console.log("Starting complete Yellow Network swap flow...", params);

      // Step 1: Create session
      const sessionResult = await this.createSwapSession(
        params.fromToken,
        params.toToken,
        params.amount,
        params.chainId
      );

      if (!sessionResult.success) {
        return {
          success: false,
          error: `Session creation failed: ${sessionResult.error}`,
        };
      }

      // Step 2: Create channel
      const channelResult = await this.createSwapChannel(
        sessionResult.sessionId,
        params.fromToken,
        params.amount,
        params.chainId
      );

      if (!channelResult.success) {
        return {
          success: false,
          error: `Channel creation failed: ${channelResult.error}`,
        };
      }

      // Step 3: Send swap request
      const swapResult = await this.sendSwapRequest(sessionResult.sessionId, {
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromChain: params.fromChain,
        toChain: params.toChain,
        amount: params.amount.toString(),
        minAmountOut: params.minAmountOut,
        recipient: params.recipient,
        slippageBps: params.slippageBps,
      });

      if (!swapResult.success) {
        return {
          success: false,
          error: `Swap execution failed: ${swapResult.error}`,
        };
      }

      console.log("Complete Yellow Network swap flow completed successfully");
      return {
        success: true,
        transactionHash: channelResult.transactionHash,
      };
    } catch (error) {
      console.error("Complete swap flow failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Signs session data using EIP-712
   */
  private async signSessionData(data: any): Promise<string> {
    if (!this.walletClient || !this.authState.account) {
      throw new Error("Wallet not available for signing");
    }

    try {
      // Create EIP-712 domain
      const domain = {
        name: this.config.appName,
        version: "1",
        chainId: this.chain.id,
        verifyingContract: this.getCustodyAddress() as `0x${string}`,
      };

      // Create message types
      const types = {
        SessionData: [
          { name: "sessionId", type: "string" },
          { name: "participant", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };

      // Sign the structured data
      const signature = await this.walletClient.signTypedData({
        account: this.authState.account,
        domain,
        types,
        primaryType: "SessionData",
        message: {
          sessionId: data.sessionId || "",
          participant: this.authState.account,
          timestamp: BigInt(data.timestamp || Date.now()),
        },
      });

      return signature;
    } catch (error) {
      console.error("Failed to sign session data:", error);
      throw error;
    }
  }

  // ============================================================
  // PRIVATE METHODS - Message Handling
  // ============================================================

  private sendMessage(payload: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      this.messageQueue.push(payload);
    }
  }

  private async handleMessage(data: any): Promise<void> {
    const response = parseAnyRPCResponse(JSON.stringify(data));

    try {
      switch (response.method) {
        case RPCMethod.AuthChallenge:
          await this.handleAuthChallenge(response as AuthChallengeResponse);
          break;

        case RPCMethod.AuthVerify:
          if (response.params?.success) {
            this.handleAuthSuccess(response.params);
          }
          break;

        case RPCMethod.GetLedgerBalances:
          this.handleBalanceResponse(response as GetLedgerBalancesResponse);
          break;

        case RPCMethod.BalanceUpdate:
          this.handleBalanceUpdate(response as BalanceUpdateResponse);
          break;

        case RPCMethod.Transfer:
          this.handleTransferResponse(response as TransferResponse);
          break;

        case RPCMethod.Error:
          this.handleError(response.params);
          break;

        default:
          console.log("Unhandled message:", response);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Message handling failed";
      this.notifyErrorListeners(errorMsg);
    }
  }

  private handleBalanceResponse(response: GetLedgerBalancesResponse): void {
    const balances = response.params.ledgerBalances;

    if (balances && balances.length > 0) {
      this.balances = Object.fromEntries(
        balances.map((balance) => [balance.asset, balance.amount])
      );
    } else {
      this.balances = {};
    }

    this.notifyBalanceListeners();
  }

  private handleBalanceUpdate(response: BalanceUpdateResponse): void {
    const balances = response.params.balanceUpdates;

    this.balances = Object.fromEntries(
      balances.map((balance) => [balance.asset, balance.amount])
    );

    this.notifyBalanceListeners();
  }

  private handleTransferResponse(response: TransferResponse): void {
    this.isTransferring = false;
    const result: TransferResult = { success: true };
    this.notifyTransferListeners(result);

    console.log("Transfer completed successfully:", response.params);
  }

  private handleError(params: any): void {
    if (this.isTransferring) {
      this.isTransferring = false;
      const result: TransferResult = {
        success: false,
        error: params.error || "Transfer failed",
      };
      this.notifyTransferListeners(result);
    } else {
      // Auth or other errors
      removeJWT();
      removeSessionKey();
      this.updateAuthState({
        isAuthenticated: false,
        isAuthAttempted: false,
      });
      this.initializeSessionKey();
    }

    this.notifyErrorListeners(params.error || "Unknown error occurred");
  }

  // ============================================================
  // PRIVATE METHODS - State Management & Notifications
  // ============================================================

  private updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.notifyConnectionStatusListeners();
  }

  private updateAuthState(updates: Partial<AuthenticationState>): void {
    this.authState = { ...this.authState, ...updates };
    this.notifyAuthStateListeners();
  }

  private notifyConnectionStatusListeners(): void {
    this.connectionStatusListeners.forEach((listener) => {
      try {
        listener(this.connectionStatus);
      } catch (error) {
        console.error("Error in connection status listener:", error);
      }
    });
  }

  private notifyAuthStateListeners(): void {
    this.authStateListeners.forEach((listener) => {
      try {
        listener(this.getAuthState());
      } catch (error) {
        console.error("Error in auth state listener:", error);
      }
    });
  }

  private notifyBalanceListeners(): void {
    this.balanceListeners.forEach((listener) => {
      try {
        listener(this.getBalances());
      } catch (error) {
        console.error("Error in balance listener:", error);
      }
    });
  }

  private notifyChannelListeners(): void {
    this.channelListeners.forEach((listener) => {
      try {
        listener(this.getChannels());
      } catch (error) {
        console.error("Error in channel listener:", error);
      }
    });
  }

  private notifyTransferListeners(result: TransferResult): void {
    this.transferListeners.forEach((listener) => {
      try {
        listener(result);
      } catch (error) {
        console.error("Error in transfer listener:", error);
      }
    });
  }

  private notifyErrorListeners(error: string): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (error) {
        console.error("Error in error listener:", error);
      }
    });
  }

  // ============================================================
  // PRIVATE METHODS - Utility
  // ============================================================

  private getCustodyAddress(chainId?: number): Address {
    const network = this.config.network || "mainnet";

    // Determine chain based on chainId or default to polygon
    if (chainId === 8453) {
      // Base
      return CONTRACT_ADDRESSES[network].base.custody;
    } else {
      // Default to Polygon (137)
      return CONTRACT_ADDRESSES[network].polygon.custody;
    }
  }

  private getUSDCAddress(chainId?: number): Address {
    const network = this.config.network || "mainnet";

    // Determine chain based on chainId or default to polygon
    if (chainId === 8453) {
      // Base
      return CONTRACT_ADDRESSES[network].base.usdc;
    } else {
      // Default to Polygon (137) - use native USDC
      return CONTRACT_ADDRESSES[network].polygon.usdcNative;
    }
  }

  // ============================================================
  // PUBLIC API - Utility Methods
  // ============================================================

  /**
   * Gets the current network configuration
   */
  public getNetworkConfig(): {
    network: NetworkType;
    custodyAddress: Address;
    usdcAddress: Address;
  } {
    return {
      network: this.config.network || "mainnet",
      custodyAddress: this.getCustodyAddress(),
      usdcAddress: this.getUSDCAddress(),
    };
  }

  /**
   * Formats an amount with proper decimals
   */
  public formatAmount(amount: bigint, decimals: number = 18): string {
    return formatUnits(amount, decimals);
  }

  /**
   * Parses an amount string to bigint with proper decimals
   */
  public parseAmount(amount: string, decimals: number = 18): bigint {
    return parseUnits(amount, decimals);
  }

  /**
   * Gets the public client for direct contract interactions
   */
  public getPublicClient() {
    return this.publicClient;
  }

  /**
   * Gets the wallet client for signing transactions
   */
  public getWalletClient() {
    return this.walletClient;
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Creates a new Yellow Network SDK instance with default configuration
 */
export function createYellowNetworkSDK(
  config: Partial<YellowNetworkConfig> = {}
): YellowNetworkSDK {
  const defaultConfig: YellowNetworkConfig = {
    wsUrl:
      process.env.NEXT_PUBLIC_NITROLITE_WS_URL ||
      "wss://clearnet.yellow.com/ws",
    appName: process.env.NEXT_PUBLIC_APP_NAME || "Yellow Network App",
    scope: "trading",
    sessionDuration: 3600,
    network: (config.network as NetworkType) || "mainnet",
    ...config,
  };

  return new YellowNetworkSDK(defaultConfig);
}
