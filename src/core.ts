import { Address, WalletClient } from 'viem';
import {
  createYellowNetworkSDK,
  YellowNetworkSDK,
  type YellowNetworkConfig
} from './yellow/yellow-network-sdk';
import {
  GryffindorsConfig,
  SessionInfo,
  ChannelOperation,
  ChannelInfo,
  TransactionParams,
  TransactionResult,
  ConnectionStatusCallback,
  SessionCallback,
  BalanceCallback,
  ChannelCallback,
  ErrorCallback
} from './types';

export class GryffindorsSDK {
  private yellowSDK: YellowNetworkSDK;
  private config: GryffindorsConfig;

  // Event callbacks
  private connectionCallbacks = new Set<ConnectionStatusCallback>();
  private sessionCallbacks = new Set<SessionCallback>();
  private balanceCallbacks = new Set<BalanceCallback>();
  private channelCallbacks = new Set<ChannelCallback>();
  private errorCallbacks = new Set<ErrorCallback>();

  constructor(config: GryffindorsConfig = {}) {
    this.config = {
      wsUrl: config.wsUrl || "wss://clearnet.yellow.com/ws",
      appName: config.appName || "Gryffindors DApp",
      scope: config.scope || "trading",
      sessionDuration: config.sessionDuration || 3600,
      network: config.network || "mainnet",
      ...config
    };

    // Initialize Yellow Network SDK with our config
    const yellowConfig: YellowNetworkConfig = {
      wsUrl: this.config.wsUrl!,
      appName: this.config.appName!,
      scope: this.config.scope!,
      sessionDuration: this.config.sessionDuration,
      network: this.config.network === 'mainnet' ? 'mainnet' : 'mainnet',
      rpcUrl: this.config.rpcUrl
    };

    this.yellowSDK = createYellowNetworkSDK(yellowConfig);
    this.setupEventListeners();
  }

  // ============================================================
  // CORE CONNECTION METHODS
  // ============================================================

  /**
   * Initialize Channel - Connect to Yellow Network
   */
  public async initializeChannel(): Promise<void> {
    try {
      this.yellowSDK.connect();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to initialize channel';
      this.notifyError(errorMsg);
      throw error;
    }
  }

  /**
   * Connect to ClearNode - Establish WebSocket connection
   */
  public async connectToClearNode(): Promise<void> {
    return this.initializeChannel();
  }

  /**
   * Create Application Session - Authenticate with wallet
   */
  public async createApplicationSession(walletClient: WalletClient, account: Address): Promise<SessionInfo> {
    try {
      await this.yellowSDK.authenticate(walletClient, account);

      const authState = this.yellowSDK.getAuthState();
      const sessionInfo: SessionInfo = {
        isActive: authState.isAuthenticated,
        sessionKey: authState.sessionKey?.address || null,
        account: authState.account,
        expiresAt: authState.sessionKey ? Date.now() + (this.config.sessionDuration! * 1000) : null
      };

      this.notifySession(sessionInfo);
      return sessionInfo;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create session';
      this.notifyError(errorMsg);
      throw error;
    }
  }

  /**
   * Perform Operations - Execute transactions through Yellow Network
   */
  public async performOperation(operation: 'deposit' | 'withdraw' | 'transfer', params: any): Promise<TransactionResult> {
    try {
      switch (operation) {
        case 'deposit':
          return await this.depositToChannel(params);
        case 'withdraw':
          return await this.withdrawFromChannel(params);
        case 'transfer':
          return await this.transferFunds(params);
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : `Failed to perform ${operation}`;
      this.notifyError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Close Session - Logout and cleanup
   */
  public async closeSession(): Promise<void> {
    try {
      this.yellowSDK.logout();
      this.yellowSDK.disconnect();

      const sessionInfo: SessionInfo = {
        isActive: false,
        sessionKey: null,
        account: null,
        expiresAt: null
      };

      this.notifySession(sessionInfo);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to close session';
      this.notifyError(errorMsg);
      throw error;
    }
  }

  // ============================================================
  // CHANNEL MANAGEMENT METHODS
  // ============================================================

  /**
   * Deposit tokens to open/fund a channel
   */
  public async depositToChannel(params: ChannelOperation): Promise<TransactionResult> {
    try {
      const result = await this.yellowSDK.depositToChannel(
        params.tokenAddress,
        BigInt(params.amount),
        137 // Polygon mainnet
      );

      return {
        success: result.success,
        hash: result.transactionHash,
        error: result.error
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Deposit failed';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Withdraw tokens from a channel
   */
  public async withdrawFromChannel(params: ChannelOperation): Promise<TransactionResult> {
    try {
      const result = await this.yellowSDK.closeChannel({
        tokenAddress: params.tokenAddress,
        amount: BigInt(params.amount),
        recipient: params.recipient
      });

      return {
        success: result.success,
        hash: result.transactionHash,
        error: result.error
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Withdrawal failed';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Transfer funds through Yellow Network
   */
  public async transferFunds(params: TransactionParams): Promise<TransactionResult> {
    try {
      const result = await this.yellowSDK.transfer({
        recipient: params.to,
        amount: params.amount,
        asset: params.asset || 'usdc'
      });

      return {
        success: result.success,
        error: result.error
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transfer failed';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get channel information
   */
  public getChannelInfo(tokenAddress: Address): ChannelInfo | null {
    const channel = this.yellowSDK.getChannel(tokenAddress);
    if (!channel) return null;

    return {
      isOpen: channel.isOpen,
      balance: channel.balance,
      tokenAddress: channel.tokenAddress,
      channelId: channel.channelId || '',
      lastUpdate: channel.lastUpdate || Date.now()
    };
  }

  /**
   * Get all channels
   */
  public getAllChannels(): Record<string, ChannelInfo> {
    const channels = this.yellowSDK.getChannels();
    const result: Record<string, ChannelInfo> = {};

    for (const [key, channel] of Object.entries(channels)) {
      result[key] = {
        isOpen: channel.isOpen,
        balance: channel.balance,
        tokenAddress: channel.tokenAddress,
        channelId: channel.channelId || key,
        lastUpdate: channel.lastUpdate || Date.now()
      };
    }

    return result;
  }

  /**
   * Refresh channel balances
   */
  public async refreshBalances(): Promise<void> {
    try {
      await this.yellowSDK.refreshChannelBalances();
      await this.yellowSDK.fetchBalances();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to refresh balances';
      this.notifyError(errorMsg);
      throw error;
    }
  }

  // ============================================================
  // SESSION AND AUTH METHODS
  // ============================================================

  /**
   * Get current session information
   */
  public getSessionInfo(): SessionInfo {
    const authState = this.yellowSDK.getAuthState();
    return {
      isActive: authState.isAuthenticated,
      sessionKey: authState.sessionKey?.address || null,
      account: authState.account,
      expiresAt: authState.sessionKey ? Date.now() + (this.config.sessionDuration! * 1000) : null
    };
  }

  /**
   * Check if session is active
   */
  public isSessionActive(): boolean {
    return this.yellowSDK.isAuthenticated();
  }

  /**
   * Get balances
   */
  public getBalances(): Record<string, string> {
    return this.yellowSDK.getBalances();
  }

  /**
   * Set cached signature for EIP-712 authentication
   */
  public setCachedSignature(signature: `0x${string}`): void {
    // This method is used by the wagmi integration
    // The actual implementation is handled by the Yellow SDK
    if (this.yellowSDK && typeof (this.yellowSDK as any).setCachedSignature === 'function') {
      (this.yellowSDK as any).setCachedSignature(signature);
    }
  }

  /**
   * Get direct connection status from Yellow SDK (for debugging)
   */
  public getDirectConnectionStatus(): string {
    return (this.yellowSDK as any)?.connectionStatus || 'unknown';
  }

  /**
   * Get Yellow SDK instance (for debugging)
   */
  public getYellowSDK(): YellowNetworkSDK {
    return this.yellowSDK;
  }

  // ============================================================
  // EVENT MANAGEMENT
  // ============================================================

  public onConnectionStatus(callback: ConnectionStatusCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  public onSessionChange(callback: SessionCallback): () => void {
    this.sessionCallbacks.add(callback);
    return () => this.sessionCallbacks.delete(callback);
  }

  public onBalanceChange(callback: BalanceCallback): () => void {
    this.balanceCallbacks.add(callback);
    return () => this.balanceCallbacks.delete(callback);
  }

  public onChannelChange(callback: ChannelCallback): () => void {
    this.channelCallbacks.add(callback);
    return () => this.channelCallbacks.delete(callback);
  }

  public onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private setupEventListeners(): void {
    // Connection status changes
    this.yellowSDK.onConnectionStatusChange((status) => {
      const mappedStatus = status === 'Connecting' ? 'connecting' :
        status === 'Connected' ? 'connected' : 'disconnected';
      this.connectionCallbacks.forEach(cb => cb(mappedStatus));
    });

    // Auth state changes
    this.yellowSDK.onAuthStateChange((authState) => {
      const sessionInfo: SessionInfo = {
        isActive: authState.isAuthenticated,
        sessionKey: authState.sessionKey?.address || null,
        account: authState.account,
        expiresAt: authState.sessionKey ? Date.now() + (this.config.sessionDuration! * 1000) : null
      };
      this.sessionCallbacks.forEach(cb => cb(sessionInfo));
    });

    // Balance changes
    this.yellowSDK.onBalanceChange((balances) => {
      this.balanceCallbacks.forEach(cb => cb(balances));
    });

    // Channel changes
    this.yellowSDK.onChannelChange((channels) => {
      const mappedChannels: Record<string, ChannelInfo> = {};
      for (const [key, channel] of Object.entries(channels)) {
        mappedChannels[key] = {
          isOpen: channel.isOpen,
          balance: channel.balance,
          tokenAddress: channel.tokenAddress,
          channelId: channel.channelId || key,
          lastUpdate: channel.lastUpdate || Date.now()
        };
      }
      this.channelCallbacks.forEach(cb => cb(mappedChannels));
    });

    // Error handling
    this.yellowSDK.onError((error) => {
      this.errorCallbacks.forEach(cb => cb(error));
    });
  }

  private notifySession(sessionInfo: SessionInfo): void {
    this.sessionCallbacks.forEach(cb => cb(sessionInfo));
  }

  private notifyError(error: string): void {
    this.errorCallbacks.forEach(cb => cb(error));
  }
}

// Factory function for easy instantiation
export function createGryffindorsSDK(config?: GryffindorsConfig): GryffindorsSDK {
  return new GryffindorsSDK(config);
}
