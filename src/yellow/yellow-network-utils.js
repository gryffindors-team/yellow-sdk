import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// ============================================================
// JOTAI ATOMS FOR STATE MANAGEMENT
// ============================================================
export const sessionKeyAtom = atomWithStorage("yellow_network_session_key", null, undefined, { getOnInit: true });
export const jwtTokenAtom = atomWithStorage("yellow_network_jwt_token", null, undefined, { getOnInit: true });
// Store EIP-712 signature to avoid multiple signature requests
export const eip712SignatureAtom = atomWithStorage("yellow_network_eip712_signature", null, undefined, { getOnInit: true });
export const connectionStatusAtom = atom("Disconnected");
export const authStateAtom = atom({
    isAuthenticated: false,
    isAuthAttempted: false,
    account: null,
});
export const balancesAtom = atom({});
export const transferStateAtom = atom({
    isTransferring: false,
    status: null,
});
// ============================================================
// SESSION KEY MANAGEMENT WITH ATOMS
// ============================================================
/**
 * Generates a new ephemeral session key pair
 * This creates a temporary private/public key pair that will be used
 * for signing requests without requiring wallet popups
 */
export const generateSessionKey = () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    return {
        privateKey,
        address: account.address,
    };
};
/**
 * Validates session key structure
 */
export const validateSessionKey = (sessionKey) => {
    if (!sessionKey || typeof sessionKey !== "object")
        return false;
    if (typeof sessionKey.privateKey !== "string" ||
        !sessionKey.privateKey.startsWith("0x")) {
        return false;
    }
    if (typeof sessionKey.address !== "string" ||
        !sessionKey.address.startsWith("0x")) {
        return false;
    }
    return true;
};
// ============================================================
// LEGACY FUNCTIONS FOR BACKWARD COMPATIBILITY
// ============================================================
/**
 * Legacy function - now reads from atom
 * @deprecated Use sessionKeyAtom directly with useAtom
 */
export const getStoredSessionKey = () => {
    try {
        const ls = getSafeLocalStorage();
        if (!ls)
            return null;
        const stored = ls.getItem("yellow_network_session_key");
        if (!stored)
            return null;
        const parsed = JSON.parse(stored);
        return validateSessionKey(parsed) ? parsed : null;
    }
    catch (error) {
        console.warn("Failed to retrieve session key from storage:", error);
        return null;
    }
};
/**
 * Legacy function - now writes to atom
 * @deprecated Use sessionKeyAtom directly with useSetAtom
 */
export const storeSessionKey = (sessionKey) => {
    try {
        const ls = getSafeLocalStorage();
        if (!ls)
            return;
        const serialized = JSON.stringify(sessionKey);
        ls.setItem("yellow_network_session_key", serialized);
    }
    catch (error) {
        console.warn("Failed to store session key:", error);
    }
};
/**
 * Legacy function - now clears atom
 * @deprecated Use sessionKeyAtom directly with useSetAtom
 */
export const removeSessionKey = () => {
    try {
        const ls = getSafeLocalStorage();
        if (!ls)
            return;
        ls.removeItem("yellow_network_session_key");
    }
    catch (error) {
        console.warn("Failed to remove session key:", error);
    }
};
/**
 * Legacy function - now reads from atom
 * @deprecated Use jwtTokenAtom directly with useAtom
 */
export const getStoredJWT = () => {
    try {
        const ls = getSafeLocalStorage();
        if (!ls)
            return null;
        return ls.getItem("yellow_network_jwt_token");
    }
    catch (error) {
        console.warn("Failed to retrieve JWT token:", error);
        return null;
    }
};
/**
 * Legacy function - now writes to atom
 * @deprecated Use jwtTokenAtom directly with useSetAtom
 */
export const storeJWT = (token) => {
    try {
        if (typeof token !== "string" || token.trim().length === 0) {
            console.warn("Invalid JWT token provided for storage");
            return;
        }
        const ls = getSafeLocalStorage();
        if (!ls)
            return;
        ls.setItem("yellow_network_jwt_token", token);
    }
    catch (error) {
        console.warn("Failed to store JWT token:", error);
    }
};
/**
 * Legacy function - now clears atom
 * @deprecated Use jwtTokenAtom directly with useSetAtom
 */
export const removeJWT = () => {
    try {
        const ls = getSafeLocalStorage();
        if (!ls)
            return;
        ls.removeItem("yellow_network_jwt_token");
    }
    catch (error) {
        console.warn("Failed to remove JWT token:", error);
    }
};
// ============================================================
// JWT UTILITY FUNCTIONS
// ============================================================
/**
 * Checks if a JWT token is expired (basic client-side validation)
 * Note: This only checks expiration, not signature validity
 */
export const isJWTExpired = (token) => {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const exp = payload.exp;
        if (!exp)
            return true;
        const now = Math.floor(Date.now() / 1000);
        return exp < now;
    }
    catch (error) {
        console.warn("Failed to parse JWT token:", error);
        return true;
    }
};
/**
 * Gets the expiration time of a JWT token as a Date object
 * Returns null if token is invalid or has no expiration
 */
export const getJWTExpiration = (token) => {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const exp = payload.exp;
        if (!exp)
            return null;
        return new Date(exp * 1000);
    }
    catch (error) {
        console.warn("Failed to parse JWT expiration:", error);
        return null;
    }
};
/**
 * Derived atom that returns valid JWT or null if expired
 */
export const validJwtTokenAtom = atom((get) => {
    const token = get(jwtTokenAtom);
    if (!token)
        return null;
    if (isJWTExpired(token)) {
        console.log("Stored JWT token is expired");
        return null;
    }
    return token;
});
// ============================================================
// ADDRESS FORMATTING UTILITIES
// ============================================================
/**
 * Formats an Ethereum address for display (0x1234...5678)
 */
export const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
/**
 * Validates if a string is a valid Ethereum address
 */
export const isValidAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};
// ============================================================
// DERIVED ATOMS FOR COMPUTED VALUES
// ============================================================
export const canAuthenticateAtom = atom((get) => {
    const sessionKey = get(sessionKeyAtom);
    const authState = get(authStateAtom);
    const connectionStatus = get(connectionStatusAtom);
    return !!(sessionKey &&
        authState.account &&
        connectionStatus === "Connected" &&
        !authState.isAuthenticated &&
        !authState.isAuthAttempted);
});
// Computed atom for authentication status summary
export const authSummaryAtom = atom((get) => {
    const sessionKey = get(sessionKeyAtom);
    const authState = get(authStateAtom);
    const connectionStatus = get(connectionStatusAtom);
    const jwt = get(validJwtTokenAtom);
    return {
        hasSessionKey: !!sessionKey,
        hasAccount: !!authState.account,
        isConnected: connectionStatus === "Connected",
        isAuthenticated: authState.isAuthenticated,
        isAuthAttempted: authState.isAuthAttempted,
        hasValidJWT: !!jwt,
        canAuthenticate: !!(sessionKey &&
            authState.account &&
            connectionStatus === "Connected" &&
            !authState.isAuthenticated &&
            !authState.isAuthAttempted),
    };
});
// ============================================================
// STORAGE UTILITIES
// ============================================================
/**
 * Clears all Yellow Network related data
 */
export const clearAllStoredDataAtom = atom(null, (get, set) => {
    // Clear persisted atoms
    set(sessionKeyAtom, null);
    set(jwtTokenAtom, null);
    set(eip712SignatureAtom, null);
    // Reset in-memory state
    set(authStateAtom, {
        isAuthenticated: false,
        isAuthAttempted: false,
        account: null,
    });
    set(balancesAtom, {});
    set(transferStateAtom, {
        isTransferring: false,
        status: null,
    });
    set(connectionStatusAtom, "Disconnected");
});
// ============================================================
// EIP-712 SIGNATURE MANAGEMENT
// ============================================================
/**
 * Checks if stored EIP-712 signature is valid and not expired
 */
export const isEIP712SignatureValid = (signature, currentSessionKeyAddress, currentAccount, currentExpireTimestamp) => {
    if (!signature)
        return false;
    // Check if signature matches current session
    if (signature.sessionKeyAddress.toLowerCase() !== currentSessionKeyAddress.toLowerCase() ||
        signature.account.toLowerCase() !== currentAccount.toLowerCase() ||
        signature.expireTimestamp !== currentExpireTimestamp) {
        return false;
    }
    // Check if signature is not too old (valid for 1 hour)
    const now = Date.now();
    const signatureAge = now - signature.timestamp;
    const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
    return signatureAge < oneHour;
};
/**
 * Derived atom for valid EIP-712 signature
 */
export const validEIP712SignatureAtom = atom((get) => {
    const signature = get(eip712SignatureAtom);
    const sessionKey = get(sessionKeyAtom);
    const authState = get(authStateAtom);
    if (!signature || !sessionKey || !authState.account) {
        return null;
    }
    // For now, we'll validate against current state when we know the expire timestamp
    // This will be updated in the SDK when we have the current expire timestamp
    return signature;
});
/**
 * Returns a safe localStorage reference if available in the browser, else null.
 */
const getSafeLocalStorage = () => {
    if (typeof window === "undefined" || !("localStorage" in window))
        return null;
    try {
        const test = "__storage_test__";
        window.localStorage.setItem(test, test);
        window.localStorage.removeItem(test);
        return window.localStorage;
    }
    catch {
        return null;
    }
};
/**
 * Checks if localStorage is available and working
 */
export const isStorageAvailable = () => {
    return !!getSafeLocalStorage();
};
// ============================================================
// DEBUGGING UTILITIES
// ============================================================
/**
 * Debug atom that provides comprehensive state information
 */
export const debugInfoAtom = atom((get) => {
    const sessionKey = get(sessionKeyAtom);
    const jwt = get(jwtTokenAtom);
    const authState = get(authStateAtom);
    const connectionStatus = get(connectionStatusAtom);
    const balances = get(balancesAtom);
    const transferState = get(transferStateAtom);
    return {
        sessionKey: {
            exists: !!sessionKey,
            address: sessionKey?.address,
            isValid: sessionKey ? validateSessionKey(sessionKey) : false,
        },
        jwt: {
            exists: !!jwt,
            isExpired: jwt ? isJWTExpired(jwt) : null,
            expiration: jwt ? getJWTExpiration(jwt) : null,
        },
        auth: authState,
        connection: connectionStatus,
        balances: {
            count: Object.keys(balances).length,
            assets: Object.keys(balances),
        },
        transfer: transferState,
        storage: {
            available: isStorageAvailable(),
        },
    };
});
// ============================================================
// CRYPTO UTILITIES
// ============================================================
/**
 * Generates a cryptographically secure random string
 */
export const generateSecureId = (length = 16) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            result += chars[array[i] % chars.length];
        }
    }
    else {
        // Fallback for environments without crypto.getRandomValues
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    return result;
};
/**
 * Creates a timestamp string for the current time
 */
export const getCurrentTimestamp = () => {
    return Math.floor(Date.now() / 1000).toString();
};
/**
 * Creates a future timestamp string
 */
export const getFutureTimestamp = (secondsFromNow) => {
    return Math.floor(Date.now() / 1000 + secondsFromNow).toString();
};
