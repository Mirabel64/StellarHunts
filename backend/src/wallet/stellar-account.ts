import { createPublicKey, verify as verifySignature } from 'crypto';

/**
 * Minimal Stellar account-address (strkey) support.
 *
 * The backend only needs two operations for wallet login: reject addresses
 * that are not ed25519 account keys, and verify an ed25519 signature made by
 * one. Pulling the full Stellar SDK into the API process for that is a large
 * dependency with its own network/HTTP surface, so this module implements the
 * small, well-specified part the authentication flow actually uses.
 *
 * Strkey format for an ed25519 public key (`G...`):
 *
 *   version byte (0x30) || 32-byte public key || CRC16-XModem (little-endian)
 *
 * encoded with RFC 4648 base32 (no padding), 56 characters in total.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ED25519_PUBLIC_KEY_VERSION = 6 << 3; // 0x30
const ACCOUNT_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

/** DER prefix for a raw ed25519 public key (`SubjectPublicKeyInfo`). */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * True when `address` is a syntactically valid Stellar account address.
 * The CRC checksum is validated, so a single mistyped character is caught.
 */
export function isValidAccountAddress(address: unknown): boolean {
  if (typeof address !== 'string' || !ACCOUNT_ADDRESS_PATTERN.test(address)) {
    return false;
  }
  try {
    decodeAccountAddress(address);
    return true;
  } catch {
    return false;
  }
}

/** Decodes a `G...` address to its raw 32-byte ed25519 public key. */
export function decodeAccountAddress(address: string): Buffer {
  if (typeof address !== 'string' || !ACCOUNT_ADDRESS_PATTERN.test(address)) {
    throw new Error('Not a Stellar account address');
  }

  const decoded = base32Decode(address);
  if (decoded.length !== 35) {
    throw new Error('Malformed Stellar account address');
  }
  if (decoded[0] !== ED25519_PUBLIC_KEY_VERSION) {
    throw new Error('Unsupported Stellar address version');
  }

  const payload = decoded.subarray(0, 33);
  const checksum = decoded.readUInt16LE(33);
  if (crc16Xmodem(payload) !== checksum) {
    throw new Error('Invalid Stellar address checksum');
  }

  return Buffer.from(decoded.subarray(1, 33));
}

/**
 * Encodes a raw 32-byte ed25519 public key as a `G...` account address.
 * Kept alongside the decoder so tests (and any future key import tooling)
 * can produce addresses without depending on the Stellar SDK.
 */
export function encodeAccountAddress(publicKey: Buffer): string {
  if (publicKey.length !== 32) {
    throw new Error('An ed25519 public key must be 32 bytes');
  }

  const payload = Buffer.concat([
    Buffer.from([ED25519_PUBLIC_KEY_VERSION]),
    publicKey,
  ]);
  const checksum = Buffer.alloc(2);
  checksum.writeUInt16LE(crc16Xmodem(payload));

  return base32Encode(Buffer.concat([payload, checksum]));
}

/**
 * Verifies an ed25519 signature over `message` made by the account that owns
 * `address`. Returns `false` for malformed input instead of throwing so that
 * callers have a single failure path.
 */
export function verifyAccountSignature(
  address: string,
  message: Buffer,
  signature: Buffer,
): boolean {
  if (signature.length !== 64) {
    return false;
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, decodeAccountAddress(address)]),
      format: 'der',
      type: 'spki',
    });

    return verifySignature(null, message, publicKey, signature);
  } catch {
    return false;
  }
}

function base32Decode(value: string): Buffer {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const character of value) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error('Invalid base32 character');
    }

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

function base32Encode(value: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let output = '';

  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }

  return output;
}

/** CRC16-XModem, the checksum Stellar uses for strkey addresses. */
function crc16Xmodem(data: Buffer): number {
  let crc = 0x0000;

  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc;
}
