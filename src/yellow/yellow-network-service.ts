import { type Address, type WalletClient } from "viem";
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
  type SessionKey,
} from "./yellow-network-utils";

// Re-export the new SDK for backward compatibility
export {
  YellowNetworkSDK,
  createYellowNetworkSDK,
  type DepositParams,
  type WithdrawParams,
  type ChannelResult,
  type ChannelState,
} from "./yellow-network-sdk";

export type ConnectionStatus = "Connecting" | "Connected" | "Disconnected";

export interface YellowNetworkConfig {
  wsUrl: string;
  appName: string;
  scope: string;
  sessionDuration?: number;
}

export interface AuthenticationState {
  isAuthenticated: boolean;
  isAuthAttempted: boolean;
  sessionKey: SessionKey | null;
  account: Address | null;
}

export interface TransferParams {
  recipient: Address;
  amount: string;
  asset?: string;
}

export interface TransferResult {
  success: boolean;
  error?: string;
}

type ConnectionStatusListener = (status: ConnectionStatus) => void;
type AuthStateListener = (state: AuthenticationState) => void;
type BalanceListener = (balances: Record<string, string>) => void;
type TransferListener = (result: TransferResult) => void;
type ErrorListener = (error: string) => void;

export class YellowNetworkService {
  private socket: WebSocket | null = null;
  private config: YellowNetworkConfig;
  private messageQueue: string[] = [];

  private connectionStatus: ConnectionStatus = "Disconnected";

  private authState: AuthenticationState = {
    isAuthenticated: false,
    isAuthAttempted: false,
    sessionKey: null,
    account: null,
  };

  private walletClient: WalletClient | null = null;

  private balances: Record<string, string> = {};

  private isTransferring = false;

  private connectionStatusListeners = new Set<ConnectionStatusListener>();
  private authStateListeners = new Set<AuthStateListener>();
  private balanceListeners = new Set<BalanceListener>();
  private transferListeners = new Set<TransferListener>();
  private errorListeners = new Set<ErrorListener>();

  private sessionExpireTimestamp = "";

  constructor(config: YellowNetworkConfig) {
    this.config = {
      sessionDuration: 3600,
      ...config,
    };

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
    this.isTransferring = false;

    this.notifyAuthStateListeners();
    this.notifyBalanceListeners();

    this.initializeSessionKey();
  }

  public getAuthState(): AuthenticationState {
    return { ...this.authState };
  }

  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
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
      // If we have a valid JWT, we might be able to skip full authentication
      // This would need to be validated with the server, but for now we just log it
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

    // Generate timestamp for this auth attempt
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
  // PUBLIC API - Utility Methods
  // ============================================================

  public getConfig(): YellowNetworkConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<YellowNetworkConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public async reconnect(): Promise<void> {
    this.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.connect();
  }

  public getConnectionDetails(): {
    status: ConnectionStatus;
    isAuthenticated: boolean;
    hasSessionKey: boolean;
    hasWalletClient: boolean;
    balanceCount: number;
    isTransferring: boolean;
  } {
    return {
      status: this.connectionStatus,
      isAuthenticated: this.authState.isAuthenticated,
      hasSessionKey: !!this.authState.sessionKey,
      hasWalletClient: !!this.walletClient,
      balanceCount: Object.keys(this.balances).length,
      isTransferring: this.isTransferring,
    };
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const yellowNetwork: YellowNetworkService | null =
  typeof window !== "undefined"
    ? new YellowNetworkService({
        wsUrl: process.env.NEXT_PUBLIC_NITROLITE_WS_URL || "",
        appName: process.env.NEXT_PUBLIC_APP_NAME || "Yellow Network App",
        scope: "yellow-network.app",
        sessionDuration: 3600,
      })
    : null;
