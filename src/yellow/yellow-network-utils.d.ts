import { type Address } from "viem";
export interface SessionKey {
    privateKey: `0x${string}`;
    address: Address;
}
export declare const sessionKeyAtom: any;
export declare const jwtTokenAtom: any;
export declare const eip712SignatureAtom: any;
export declare const connectionStatusAtom: any;
export declare const authStateAtom: any;
export declare const balancesAtom: any;
export declare const transferStateAtom: any;
/**
 * Generates a new ephemeral session key pair
 * This creates a temporary private/public key pair that will be used
 * for signing requests without requiring wallet popups
 */
export declare const generateSessionKey: () => SessionKey;
/**
 * Validates session key structure
 */
export declare const validateSessionKey: (sessionKey: any) => sessionKey is SessionKey;
/**
 * Legacy function - now reads from atom
 * @deprecated Use sessionKeyAtom directly with useAtom
 */
export declare const getStoredSessionKey: () => SessionKey | null;
/**
 * Legacy function - now writes to atom
 * @deprecated Use sessionKeyAtom directly with useSetAtom
 */
export declare const storeSessionKey: (sessionKey: SessionKey) => void;
/**
 * Legacy function - now clears atom
 * @deprecated Use sessionKeyAtom directly with useSetAtom
 */
export declare const removeSessionKey: () => void;
/**
 * Legacy function - now reads from atom
 * @deprecated Use jwtTokenAtom directly with useAtom
 */
export declare const getStoredJWT: () => string | null;
/**
 * Legacy function - now writes to atom
 * @deprecated Use jwtTokenAtom directly with useSetAtom
 */
export declare const storeJWT: (token: string) => void;
/**
 * Legacy function - now clears atom
 * @deprecated Use jwtTokenAtom directly with useSetAtom
 */
export declare const removeJWT: () => void;
/**
 * Checks if a JWT token is expired (basic client-side validation)
 * Note: This only checks expiration, not signature validity
 */
export declare const isJWTExpired: (token: string) => boolean;
/**
 * Gets the expiration time of a JWT token as a Date object
 * Returns null if token is invalid or has no expiration
 */
export declare const getJWTExpiration: (token: string) => Date | null;
/**
 * Derived atom that returns valid JWT or null if expired
 */
export declare const validJwtTokenAtom: any;
/**
 * Formats an Ethereum address for display (0x1234...5678)
 */
export declare const formatAddress: (address: Address) => string;
/**
 * Validates if a string is a valid Ethereum address
 */
export declare const isValidAddress: (address: string) => boolean;
export declare const canAuthenticateAtom: any;
export declare const authSummaryAtom: any;
/**
 * Clears all Yellow Network related data
 */
export declare const clearAllStoredDataAtom: any;
/**
 * Checks if stored EIP-712 signature is valid and not expired
 */
export declare const isEIP712SignatureValid: (signature: {
    signature: `0x${string}`;
    timestamp: number;
    sessionKeyAddress: Address;
    account: Address;
    expireTimestamp: string;
} | null, currentSessionKeyAddress: Address, currentAccount: Address, currentExpireTimestamp: string) => boolean;
/**
 * Derived atom for valid EIP-712 signature
 */
export declare const validEIP712SignatureAtom: any;
/**
 * Checks if localStorage is available and working
 */
export declare const isStorageAvailable: () => boolean;
/**
 * Debug atom that provides comprehensive state information
 */
export declare const debugInfoAtom: any;
/**
 * Generates a cryptographically secure random string
 */
export declare const generateSecureId: (length?: number) => string;
/**
 * Creates a timestamp string for the current time
 */
export declare const getCurrentTimestamp: () => string;
/**
 * Creates a future timestamp string
 */
export declare const getFutureTimestamp: (secondsFromNow: number) => string;
