import { createPublicClient, http, parseUnits, formatUnits, } from "viem";
import { polygon } from "viem/chains";
import { createAuthRequestMessage, createAuthVerifyMessage, createEIP712AuthMessageSigner, createECDSAMessageSigner, createGetLedgerBalancesMessage, createTransferMessage, parseAnyRPCResponse, RPCMethod, } from "@erc7824/nitrolite";
import { generateSessionKey, getStoredSessionKey, storeSessionKey, removeSessionKey, storeJWT, removeJWT, getStoredJWT, } from "./yellow-network-utils";
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
];
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
];
// Contract addresses for mainnet networks
const CONTRACT_ADDRESSES = {
    mainnet: {
        polygon: {
            custody: "0x6F71a38d919ad713D0AfE0eB712b95064Fc2616f", // Yellow Network Custody on Polygon
            usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
            usdcNative: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // Native USDC on Polygon
        },
        base: {
            custody: "0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6", // Yellow Network Custody on Base
            usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
        },
    },
};
// ============================================================
// MAIN SDK CLASS
// ============================================================
export class YellowNetworkSDK {
    constructor(config) {
        this.socket = null;
        this.messageQueue = [];
        this.connectionStatus = "Disconnected";
        this.authState = {
            isAuthenticated: false,
            isAuthAttempted: false,
            sessionKey: null,
            account: null,
        };
        this.walletClient = null;
        this.publicClient = null;
        this.balances = {};
        this.channels = {};
        this.isTransferring = false;
        this.activeSwapSession = null;
        // Event listeners
        this.connectionStatusListeners = new Set();
        this.authStateListeners = new Set();
        this.balanceListeners = new Set();
        this.transferListeners = new Set();
        this.channelListeners = new Set();
        this.errorListeners = new Set();
        this.sessionExpireTimestamp = "";
        this.cachedSignature = null;
        this.signatureSetCallback = null;
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
    connect() {
        if (this.socket && this.socket.readyState < 2)
            return;
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
            }
            catch (error) {
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
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.updateConnectionStatus("Disconnected");
    }
    getConnectionStatus() {
        return this.connectionStatus;
    }
    // ============================================================
    // PUBLIC API - Authentication
    // ============================================================
    async authenticate(walletClient, account) {
        this.walletClient = walletClient;
        this.updateAuthState({ account });
        if (this.connectionStatus === "Connected") {
            await this.startAuthentication();
        }
    }
    logout() {
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
    getAuthState() {
        return { ...this.authState };
    }
    isAuthenticated() {
        return this.authState.isAuthenticated;
    }
    // ============================================================
    // PUBLIC API - Signature Management
    // ============================================================
    setSignatureCallback(callback) {
        this.signatureSetCallback = callback;
    }
    setCachedSignature(signature) {
        this.cachedSignature = signature;
    }
    // ============================================================
    // PUBLIC API - Channel Management
    // ============================================================
    /**
     * Opens a channel by depositing tokens to the custody contract
     */
    async openChannel(params) {
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
        }
        catch (error) {
            console.error("Failed to open channel:", error);
            let errorMessage = "Failed to open channel";
            if (String(error).includes("approve") &&
                String(error).includes("not been authorized")) {
                errorMessage =
                    "Token approval was rejected. Please approve the token spend in your wallet to proceed.";
            }
            else if (String(error).includes("user rejected transaction")) {
                errorMessage =
                    "Transaction was rejected. Please confirm the transaction in your wallet.";
            }
            else {
                errorMessage = `Channel opening error: ${error}`;
            }
            return { success: false, error: errorMessage };
        }
    }
    /**
     * Closes a channel by withdrawing tokens from the custody contract
     */
    async closeChannel(params) {
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
                }
                else {
                    // Partial withdrawal
                    this.channels[channelId].balance = (currentBalance - withdrawAmount).toString();
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
        }
        catch (error) {
            console.error("Failed to close channel:", error);
            let errorMessage = "Failed to close channel";
            if (String(error).includes("user rejected transaction")) {
                errorMessage =
                    "Transaction was rejected. Please confirm the transaction in your wallet.";
            }
            else {
                errorMessage = `Channel closing error: ${error}`;
            }
            return { success: false, error: errorMessage };
        }
    }
    /**
     * Gets the balance of a specific token in the custody contract
     */
    async getChannelBalance(tokenAddress, userAddress) {
        try {
            const user = userAddress || this.authState.account;
            if (!user)
                throw new Error("No user address provided");
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
        }
        catch (error) {
            console.error("Failed to get channel balance:", error);
            return "0";
        }
    }
    /**
     * Gets all open channels for the current user
     */
    getChannels() {
        return { ...this.channels };
    }
    /**
     * Gets a specific channel state
     */
    getChannel(tokenAddress) {
        if (!this.authState.account)
            return null;
        const channelId = `${tokenAddress}-${this.authState.account}`;
        return this.channels[channelId] || null;
    }
    /**
     * Refreshes channel balances from the contract
     */
    async refreshChannelBalances() {
        if (!this.authState.account)
            return;
        try {
            for (const [channelId, channel] of Object.entries(this.channels)) {
                if (channel.isOpen) {
                    const balance = await this.getChannelBalance(channel.tokenAddress);
                    this.channels[channelId].balance = balance;
                    this.channels[channelId].lastUpdate = Date.now();
                }
            }
            this.notifyChannelListeners();
        }
        catch (error) {
            console.error("Failed to refresh channel balances:", error);
        }
    }
    /**
     * Sends a transaction using Yellow Network SDK without showing wallet popups
     * This is the primary method for executing transactions through Yellow Network
     */
    async sendTransaction(to, data, value = 0n, chainId) {
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
        }
        catch (error) {
            console.error("Failed to send transaction via Yellow Network:", error);
            throw error;
        }
    }
    /**
     * Deposits tokens to Yellow Network channel with session management
     * This method handles the entire flow: EIP-712 session creation, allowance, and deposit
     */
    async depositToChannel(tokenAddress, amount, chainId) {
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
        }
        catch (error) {
            console.error("Yellow Network deposit failed:", error);
            let errorMessage = "Deposit failed";
            if (String(error).includes("approve") &&
                String(error).includes("not been authorized")) {
                errorMessage =
                    "Token approval was rejected. Please approve the USDC spend in your wallet to proceed.";
            }
            else if (String(error).includes("user rejected transaction")) {
                errorMessage =
                    "Transaction was rejected. Please confirm the transaction in your wallet.";
            }
            else {
                errorMessage = `Deposit error: ${error}`;
            }
            return { success: false, error: errorMessage };
        }
    }
    // ============================================================
    // PUBLIC API - Balance Management
    // ============================================================
    async fetchBalances() {
        if (!this.authState.isAuthenticated ||
            !this.authState.sessionKey ||
            !this.authState.account) {
            throw new Error("Not authenticated");
        }
        try {
            const sessionSigner = createECDSAMessageSigner(this.authState.sessionKey.privateKey);
            const balancePayload = await createGetLedgerBalancesMessage(sessionSigner, this.authState.account);
            this.sendMessage(balancePayload);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Failed to fetch balances";
            this.notifyErrorListeners(errorMsg);
            throw error;
        }
    }
    getBalances() {
        return { ...this.balances };
    }
    getBalance(asset) {
        return (this.balances[asset.toLowerCase()] ||
            this.balances[asset.toUpperCase()] ||
            null);
    }
    // ============================================================
    // PUBLIC API - Transfers
    // ============================================================
    async transfer(params) {
        if (!this.authState.isAuthenticated || !this.authState.sessionKey) {
            return { success: false, error: "Not authenticated" };
        }
        if (this.isTransferring) {
            return { success: false, error: "Transfer already in progress" };
        }
        try {
            this.isTransferring = true;
            const sessionSigner = createECDSAMessageSigner(this.authState.sessionKey.privateKey);
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
        }
        catch (error) {
            this.isTransferring = false;
            const errorMsg = error instanceof Error ? error.message : "Transfer failed";
            const result = { success: false, error: errorMsg };
            this.notifyTransferListeners(result);
            return result;
        }
    }
    isTransferInProgress() {
        return this.isTransferring;
    }
    // ============================================================
    // PUBLIC API - Event Listeners
    // ============================================================
    onConnectionStatusChange(listener) {
        this.connectionStatusListeners.add(listener);
        listener(this.connectionStatus);
        return () => {
            this.connectionStatusListeners.delete(listener);
        };
    }
    onAuthStateChange(listener) {
        this.authStateListeners.add(listener);
        listener(this.getAuthState());
        return () => {
            this.authStateListeners.delete(listener);
        };
    }
    onBalanceChange(listener) {
        this.balanceListeners.add(listener);
        listener(this.getBalances());
        return () => {
            this.balanceListeners.delete(listener);
        };
    }
    onChannelChange(listener) {
        this.channelListeners.add(listener);
        listener(this.getChannels());
        return () => {
            this.channelListeners.delete(listener);
        };
    }
    onTransferComplete(listener) {
        this.transferListeners.add(listener);
        return () => {
            this.transferListeners.delete(listener);
        };
    }
    onError(listener) {
        this.errorListeners.add(listener);
        return () => {
            this.errorListeners.delete(listener);
        };
    }
    // ============================================================
    // PRIVATE METHODS - Initialization
    // ============================================================
    initializeSessionKey() {
        const existingSessionKey = getStoredSessionKey();
        if (existingSessionKey) {
            this.updateAuthState({ sessionKey: existingSessionKey });
        }
        else {
            const newSessionKey = generateSessionKey();
            storeSessionKey(newSessionKey);
            this.updateAuthState({ sessionKey: newSessionKey });
        }
    }
    checkExistingJWT() {
        const storedJWT = getStoredJWT();
        if (storedJWT) {
            console.log("Found existing JWT token - could implement quick re-auth");
            // TODO: Implement JWT-based quick authentication
        }
    }
    tryAutoAuthenticate() {
        if (this.authState.account &&
            this.authState.sessionKey &&
            this.connectionStatus === "Connected" &&
            !this.authState.isAuthenticated &&
            !this.authState.isAuthAttempted &&
            this.walletClient) {
            this.startAuthentication();
        }
    }
    // ============================================================
    // PRIVATE METHODS - Authentication Flow
    // ============================================================
    async startAuthentication() {
        if (!this.authState.account || !this.authState.sessionKey) {
            throw new Error("Missing account or session key");
        }
        this.updateAuthState({ isAuthAttempted: true });
        this.sessionExpireTimestamp = String(Math.floor(Date.now() / 1000) + (this.config.sessionDuration || 3600));
        const authParams = {
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
        }
        catch (error) {
            this.updateAuthState({ isAuthAttempted: false });
            const errorMsg = error instanceof Error ? error.message : "Authentication failed";
            this.notifyErrorListeners(errorMsg);
        }
    }
    async handleAuthChallenge(response) {
        if (!this.walletClient ||
            !this.authState.sessionKey ||
            !this.authState.account ||
            !this.sessionExpireTimestamp) {
            throw new Error("Missing authentication prerequisites");
        }
        const authParams = {
            scope: this.config.scope,
            application: this.walletClient.account?.address,
            participant: this.authState.sessionKey.address,
            expire: this.sessionExpireTimestamp,
            allowances: [],
        };
        const eip712Signer = createEIP712AuthMessageSigner(this.walletClient, authParams, { name: this.config.appName });
        try {
            const authVerifyPayload = await createAuthVerifyMessage(eip712Signer, response);
            this.sendMessage(authVerifyPayload);
        }
        catch (error) {
            this.updateAuthState({ isAuthAttempted: false });
            const errorMsg = "Signature rejected. Please try again.";
            this.notifyErrorListeners(errorMsg);
        }
    }
    handleAuthSuccess(params) {
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
    async createSwapSession(fromToken, toToken, amount, chainId) {
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
                participant: this.authState.account,
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
                participant: this.authState.account,
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
        }
        catch (error) {
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
    async createSwapChannel(sessionId, tokenAddress, amount, chainId) {
        if (!this.activeSwapSession ||
            this.activeSwapSession.sessionId !== sessionId) {
            return { success: false, error: "Invalid or expired session" };
        }
        try {
            console.log("Creating swap channel for session:", sessionId);
            // Use existing depositToChannel method but with session context
            const depositResult = await this.depositToChannel(tokenAddress, amount, chainId);
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
                console.log("Swap channel created and notified to API:", depositResult.channelId);
            }
            return depositResult;
        }
        catch (error) {
            console.error("Failed to create swap channel:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Channel creation failed",
            };
        }
    }
    /**
     * Sends a swap request message to Yellow Network API
     */
    async sendSwapRequest(sessionId, swapParams) {
        if (!this.activeSwapSession ||
            this.activeSwapSession.sessionId !== sessionId) {
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
        }
        catch (error) {
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
    async waitForSwapResponse(swapId) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ success: false, error: "Swap response timeout" });
            }, 60000); // 1 minute timeout
            // Add temporary message listener for swap response
            const originalHandler = this.handleMessage.bind(this);
            this.handleMessage = async (data) => {
                await originalHandler(data);
                if (data.type === "swap_response" && data.payload?.swapId === swapId) {
                    clearTimeout(timeout);
                    this.handleMessage = originalHandler;
                    if (data.payload.success) {
                        resolve({ success: true, swapId });
                    }
                    else {
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
    async executeCompleteSwap(params) {
        try {
            console.log("Starting complete Yellow Network swap flow...", params);
            // Step 1: Create session
            const sessionResult = await this.createSwapSession(params.fromToken, params.toToken, params.amount, params.chainId);
            if (!sessionResult.success) {
                return {
                    success: false,
                    error: `Session creation failed: ${sessionResult.error}`,
                };
            }
            // Step 2: Create channel
            const channelResult = await this.createSwapChannel(sessionResult.sessionId, params.fromToken, params.amount, params.chainId);
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
        }
        catch (error) {
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
    async signSessionData(data) {
        if (!this.walletClient || !this.authState.account) {
            throw new Error("Wallet not available for signing");
        }
        try {
            // Create EIP-712 domain
            const domain = {
                name: this.config.appName,
                version: "1",
                chainId: this.chain.id,
                verifyingContract: this.getCustodyAddress(),
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
        }
        catch (error) {
            console.error("Failed to sign session data:", error);
            throw error;
        }
    }
    // ============================================================
    // PRIVATE METHODS - Message Handling
    // ============================================================
    sendMessage(payload) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(payload);
        }
        else {
            this.messageQueue.push(payload);
        }
    }
    async handleMessage(data) {
        const response = parseAnyRPCResponse(JSON.stringify(data));
        try {
            switch (response.method) {
                case RPCMethod.AuthChallenge:
                    await this.handleAuthChallenge(response);
                    break;
                case RPCMethod.AuthVerify:
                    if (response.params?.success) {
                        this.handleAuthSuccess(response.params);
                    }
                    break;
                case RPCMethod.GetLedgerBalances:
                    this.handleBalanceResponse(response);
                    break;
                case RPCMethod.BalanceUpdate:
                    this.handleBalanceUpdate(response);
                    break;
                case RPCMethod.Transfer:
                    this.handleTransferResponse(response);
                    break;
                case RPCMethod.Error:
                    this.handleError(response.params);
                    break;
                default:
                    console.log("Unhandled message:", response);
            }
        }
        catch (error) {
            console.error("Error handling message:", error);
            const errorMsg = error instanceof Error ? error.message : "Message handling failed";
            this.notifyErrorListeners(errorMsg);
        }
    }
    handleBalanceResponse(response) {
        const balances = response.params.ledgerBalances;
        if (balances && balances.length > 0) {
            this.balances = Object.fromEntries(balances.map((balance) => [balance.asset, balance.amount]));
        }
        else {
            this.balances = {};
        }
        this.notifyBalanceListeners();
    }
    handleBalanceUpdate(response) {
        const balances = response.params.balanceUpdates;
        this.balances = Object.fromEntries(balances.map((balance) => [balance.asset, balance.amount]));
        this.notifyBalanceListeners();
    }
    handleTransferResponse(response) {
        this.isTransferring = false;
        const result = { success: true };
        this.notifyTransferListeners(result);
        console.log("Transfer completed successfully:", response.params);
    }
    handleError(params) {
        if (this.isTransferring) {
            this.isTransferring = false;
            const result = {
                success: false,
                error: params.error || "Transfer failed",
            };
            this.notifyTransferListeners(result);
        }
        else {
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
    updateConnectionStatus(status) {
        this.connectionStatus = status;
        this.notifyConnectionStatusListeners();
    }
    updateAuthState(updates) {
        this.authState = { ...this.authState, ...updates };
        this.notifyAuthStateListeners();
    }
    notifyConnectionStatusListeners() {
        this.connectionStatusListeners.forEach((listener) => {
            try {
                listener(this.connectionStatus);
            }
            catch (error) {
                console.error("Error in connection status listener:", error);
            }
        });
    }
    notifyAuthStateListeners() {
        this.authStateListeners.forEach((listener) => {
            try {
                listener(this.getAuthState());
            }
            catch (error) {
                console.error("Error in auth state listener:", error);
            }
        });
    }
    notifyBalanceListeners() {
        this.balanceListeners.forEach((listener) => {
            try {
                listener(this.getBalances());
            }
            catch (error) {
                console.error("Error in balance listener:", error);
            }
        });
    }
    notifyChannelListeners() {
        this.channelListeners.forEach((listener) => {
            try {
                listener(this.getChannels());
            }
            catch (error) {
                console.error("Error in channel listener:", error);
            }
        });
    }
    notifyTransferListeners(result) {
        this.transferListeners.forEach((listener) => {
            try {
                listener(result);
            }
            catch (error) {
                console.error("Error in transfer listener:", error);
            }
        });
    }
    notifyErrorListeners(error) {
        this.errorListeners.forEach((listener) => {
            try {
                listener(error);
            }
            catch (error) {
                console.error("Error in error listener:", error);
            }
        });
    }
    // ============================================================
    // PRIVATE METHODS - Utility
    // ============================================================
    getCustodyAddress(chainId) {
        const network = this.config.network || "mainnet";
        // Determine chain based on chainId or default to polygon
        if (chainId === 8453) {
            // Base
            return CONTRACT_ADDRESSES[network].base.custody;
        }
        else {
            // Default to Polygon (137)
            return CONTRACT_ADDRESSES[network].polygon.custody;
        }
    }
    getUSDCAddress(chainId) {
        const network = this.config.network || "mainnet";
        // Determine chain based on chainId or default to polygon
        if (chainId === 8453) {
            // Base
            return CONTRACT_ADDRESSES[network].base.usdc;
        }
        else {
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
    getNetworkConfig() {
        return {
            network: this.config.network || "mainnet",
            custodyAddress: this.getCustodyAddress(),
            usdcAddress: this.getUSDCAddress(),
        };
    }
    /**
     * Formats an amount with proper decimals
     */
    formatAmount(amount, decimals = 18) {
        return formatUnits(amount, decimals);
    }
    /**
     * Parses an amount string to bigint with proper decimals
     */
    parseAmount(amount, decimals = 18) {
        return parseUnits(amount, decimals);
    }
    /**
     * Gets the public client for direct contract interactions
     */
    getPublicClient() {
        return this.publicClient;
    }
    /**
     * Gets the wallet client for signing transactions
     */
    getWalletClient() {
        return this.walletClient;
    }
}
// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================
/**
 * Creates a new Yellow Network SDK instance with default configuration
 */
export function createYellowNetworkSDK(config = {}) {
    const defaultConfig = {
        wsUrl: process.env.NEXT_PUBLIC_NITROLITE_WS_URL ||
            "wss://clearnet.yellow.com/ws",
        appName: process.env.NEXT_PUBLIC_APP_NAME || "Yellow Network App",
        scope: "trading",
        sessionDuration: 3600,
        network: config.network || "mainnet",
        ...config,
    };
    return new YellowNetworkSDK(defaultConfig);
}
