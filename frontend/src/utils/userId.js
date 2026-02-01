/**
 * UserID Utilities for Decentralized Health Data Vault
 * 
 * Design Principles:
 * - UserIDs are derived from wallet addresses using keccak256
 * - Format: ROLE-HASH (e.g., PAT-9F3C8A2D, DOC-A71E4C90, DIA-4B8F2D19)
 * - Deterministic: same wallet + role = same UserID
 * - Collision-resistant: 8 hex chars = 4 billion possible values
 * - Wallet addresses remain the ONLY authority for permissions
 */

import { ethers } from 'ethers';

// Role prefixes
export const ROLE_PREFIXES = {
  PATIENT: 'PAT',
  DOCTOR: 'DOC',
  DIAGNOSTICS: 'DIA',
  RESEARCHER: 'RES'
};

// Role enum values (must match contract)
export const ROLE_ENUM = {
  NONE: 0,
  PATIENT: 1,
  DOCTOR: 2,
  DIAGNOSTICS: 3,
  RESEARCHER: 4
};

// Reverse lookup: prefix -> role number
export const PREFIX_TO_ROLE = {
  'PAT': ROLE_ENUM.PATIENT,
  'DOC': ROLE_ENUM.DOCTOR,
  'DIA': ROLE_ENUM.DIAGNOSTICS,
  'RES': ROLE_ENUM.RESEARCHER
};

// Role number -> prefix
export const ROLE_TO_PREFIX = {
  [ROLE_ENUM.PATIENT]: 'PAT',
  [ROLE_ENUM.DOCTOR]: 'DOC',
  [ROLE_ENUM.DIAGNOSTICS]: 'DIA',
  [ROLE_ENUM.RESEARCHER]: 'RES'
};

/**
 * Generate UserID hash from wallet address and role
 * Uses keccak256 for deterministic, collision-resistant hashing
 * 
 * @param {string} address - Ethereum wallet address (0x...)
 * @param {string} rolePrefix - Role prefix (PAT, DOC, DIA, RES)
 * @returns {string} - 8 character hex hash (uppercase)
 */
export function generateUserIdHash(address, rolePrefix) {
  if (!ethers.isAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }
  
  const normalizedPrefix = rolePrefix.toUpperCase();
  if (!PREFIX_TO_ROLE[normalizedPrefix]) {
    throw new Error(`Invalid role prefix: ${rolePrefix}`);
  }
  
  // Hash: keccak256(rolePrefix + address)
  // This matches the on-chain computation
  const packed = ethers.solidityPackedKeccak256(
    ['string', 'address'],
    [normalizedPrefix, address]
  );
  
  // Take first 8 hex characters (after 0x)
  return packed.substring(2, 10).toUpperCase();
}

/**
 * Encode wallet address to UserID
 * 
 * @param {string} address - Ethereum wallet address
 * @param {string|number} role - Role prefix string (PAT/DOC/DIA) or role enum number
 * @returns {string} - UserID in format ROLE-HASH (e.g., PAT-9F3C8A2D)
 */
export function encodeAddressToId(address, role) {
  if (!ethers.isAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }
  
  // Convert role number to prefix if needed
  let rolePrefix;
  if (typeof role === 'number') {
    rolePrefix = ROLE_TO_PREFIX[role];
    if (!rolePrefix) {
      throw new Error(`Invalid role number: ${role}`);
    }
  } else {
    rolePrefix = role.toUpperCase();
    if (!PREFIX_TO_ROLE[rolePrefix]) {
      throw new Error(`Invalid role prefix: ${role}`);
    }
  }
  
  const hash = generateUserIdHash(address, rolePrefix);
  return `${rolePrefix}-${hash}`;
}

/**
 * Parse UserID to extract role prefix and hash
 * 
 * @param {string} userId - UserID string (e.g., PAT-9F3C8A2D)
 * @returns {{ prefix: string, hash: string, roleNumber: number }} - Parsed components
 */
export function parseUserId(userId) {
  const normalized = normalizeUserId(userId);
  
  // Validate format: ROLE-HASH
  const regex = /^(PAT|DOC|DIA|RES)-([A-F0-9]{8})$/;
  const match = normalized.match(regex);
  
  if (!match) {
    throw new Error('Invalid UserID format. Expected: ROLE-XXXXXXXX (e.g., PAT-9F3C8A2D)');
  }
  
  return {
    prefix: match[1],
    hash: match[2],
    roleNumber: PREFIX_TO_ROLE[match[1]]
  };
}

/**
 * Validate UserID format without resolving to address
 * 
 * @param {string} userId - UserID string to validate
 * @returns {boolean} - True if format is valid
 */
export function isValidUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return false;
  }
  
  try {
    parseUserId(userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize UserID: trim whitespace, uppercase, remove extra characters
 * 
 * @param {string} userId - Raw UserID input
 * @returns {string} - Normalized UserID
 */
export function normalizeUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return '';
  }
  
  // Trim whitespace, convert to uppercase, remove any invalid characters
  return userId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/**
 * Check if input looks like a UserID (vs raw address)
 * 
 * @param {string} input - User input string
 * @returns {boolean} - True if it looks like a UserID format
 */
export function looksLikeUserId(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  const normalized = input.trim().toUpperCase();
  
  // Check if it starts with a role prefix
  return /^(PAT|DOC|DIA|RES)-/.test(normalized);
}

/**
 * Verify that a UserID matches a given address
 * Used to confirm resolution is correct
 * 
 * @param {string} userId - UserID to verify
 * @param {string} address - Address to check against
 * @returns {boolean} - True if UserID matches the address
 */
export function verifyUserIdForAddress(userId, address) {
  try {
    const { prefix } = parseUserId(userId);
    const expectedId = encodeAddressToId(address, prefix);
    return normalizeUserId(userId) === expectedId;
  } catch {
    return false;
  }
}

/**
 * Get role name from role number
 * 
 * @param {number} role - Role enum value
 * @returns {string} - Role name
 */
export function getRoleName(role) {
  const roleMap = {
    0: 'None',
    1: 'Patient',
    2: 'Doctor',
    3: 'Diagnostics',
    4: 'Researcher'
  };
  return roleMap[role] || 'Unknown';
}

/**
 * Get role prefix from role number
 * 
 * @param {number} role - Role enum value
 * @returns {string} - Role prefix (PAT, DOC, DIA, RES)
 */
export function getRolePrefix(role) {
  const prefixMap = {
    1: 'PAT',
    2: 'DOC',
    3: 'DIA',
    4: 'RES'
  };
  return prefixMap[role] || '';
}

/**
 * Format file size to human-readable format
 * Shows KB for files under 1MB, MB otherwise
 * 
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    // Show in KB for files under 1 MB
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    // Show in MB for larger files
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * Get expected role for a given UserID prefix
 * 
 * @param {string} userId - UserID string
 * @returns {number} - Expected role enum value
 */
export function getExpectedRoleFromUserId(userId) {
  try {
    const { roleNumber } = parseUserId(userId);
    return roleNumber;
  } catch {
    return ROLE_ENUM.NONE;
  }
}

/**
 * Format UserID for display with copy button helper
 * 
 * @param {string} userId - UserID string
 * @returns {string} - Formatted display string
 */
export function formatUserIdForDisplay(userId) {
  try {
    const { prefix, hash } = parseUserId(userId);
    return `${prefix}-${hash}`;
  } catch {
    return userId;
  }
}

/**
 * Shorten address for display
 * 
 * @param {string} address - Full Ethereum address
 * @returns {string} - Shortened address (0x1234...5678)
 */
export function shortenAddress(address) {
  if (!address || !ethers.isAddress(address)) {
    return '';
  }
  return `${address.substring(0, 6)}...${address.substring(38)}`;
}

/**
 * Resolve UserID to address using contract lookup
 * This is the ONLY way to get an address from a UserID
 * 
 * @param {string} userId - UserID to resolve
 * @param {object} contract - HealthVault contract instance
 * @returns {Promise<string|null>} - Resolved address or null if not found
 */
export async function resolveUserIdToAddress(userId, contract) {
  if (!contract) {
    throw new Error('Contract instance required');
  }
  
  if (!isValidUserId(userId)) {
    throw new Error('Invalid UserID format');
  }
  
  try {
    const { prefix, hash } = parseUserId(userId);
    
    // Compute the full hash that would be stored on-chain
    // The contract stores: keccak256(abi.encodePacked(rolePrefix, address))
    // We have the first 8 chars of this hash, need to find the address
    
    // Call contract to resolve the userIdHash to address
    const userIdHashBytes = ethers.keccak256(
      ethers.solidityPacked(['string', 'string'], [prefix, hash])
    );
    
    // Try to resolve via contract (if it has the mapping)
    if (typeof contract.resolveUserId === 'function') {
      const resolvedAddress = await contract.resolveUserId(userIdHashBytes);
      if (resolvedAddress && resolvedAddress !== ethers.ZeroAddress) {
        return resolvedAddress;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to resolve UserID:', error);
    return null;
  }
}

/**
 * Validate input and determine if it's a UserID or address
 * Returns normalized form and type
 * 
 * @param {string} input - User input (could be UserID or address)
 * @returns {{ type: 'userId' | 'address' | 'invalid', value: string, error?: string }}
 */
export function validatePatientInput(input) {
  if (!input || typeof input !== 'string') {
    return { type: 'invalid', value: '', error: 'Please enter a Patient ID or address' };
  }
  
  const trimmed = input.trim();
  
  // Check if it's a valid Ethereum address
  if (ethers.isAddress(trimmed)) {
    return { type: 'address', value: ethers.getAddress(trimmed) }; // Checksum
  }
  
  // Check if it's a valid UserID format
  if (looksLikeUserId(trimmed)) {
    const normalized = normalizeUserId(trimmed);
    if (isValidUserId(normalized)) {
      return { type: 'userId', value: normalized };
    } else {
      return { type: 'invalid', value: trimmed, error: 'Invalid UserID format. Expected: PAT-XXXXXXXX' };
    }
  }
  
  // Neither valid address nor UserID
  return { type: 'invalid', value: trimmed, error: 'Invalid input. Enter a Patient ID (PAT-XXXXXXXX) or wallet address (0x...)' };
}
