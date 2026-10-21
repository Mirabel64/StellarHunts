/**
 * Cryptography puzzle set (issue #711): hashing and signing.
 *
 * `hints` reveal progressively: show hints[0] first and the next one after
 * each further request. `explanation` is shown after the puzzle is solved.
 * Solutions are compared case-insensitively after trimming.
 */
export interface CryptographyPuzzle {
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  solution: string;
  hints: string[];
  explanation: string;
}

export const CRYPTOGRAPHY_PUZZLES: CryptographyPuzzle[] = [
  {
    title: 'Fingerprint of "abc"',
    description:
      'What are the first 8 hex characters of the SHA-256 hash of the text "abc"?',
    difficulty: 'Easy',
    solution: 'ba7816bf',
    hints: [
      'SHA-256 prints 64 hex characters; you only need the first 8.',
      'Use any SHA-256 tool, e.g. `echo -n abc | sha256sum`. Do not include a newline.',
      'The hash starts with "ba78...".',
    ],
    explanation:
      'SHA-256 is a deterministic hash: the same input always gives ba7816bf8f01cfea... (the NIST test vector for "abc"). Stellar uses SHA-256 for transaction hashes.',
  },
  {
    title: 'Hash length',
    description: 'How many bits long is a SHA-256 digest?',
    difficulty: 'Easy',
    solution: '256',
    hints: [
      'The number is in the name.',
      '64 hex characters at 4 bits each.',
    ],
    explanation:
      'SHA-256 always outputs 256 bits (32 bytes) regardless of input size, which is why a hash can fingerprint a file of any length.',
  },
  {
    title: 'Hello, hash',
    description:
      'What are the first 8 hex characters of the SHA-256 hash of the lowercase text "hello"?',
    difficulty: 'Easy',
    solution: '2cf24dba',
    hints: [
      'Lowercase "hello", five letters, no newline.',
      'Compute it locally; never paste secrets into online tools.',
      'It starts with "2cf2...".',
    ],
    explanation:
      'Changing even one bit of the input (try "Hello") produces a completely different digest. This avalanche effect is what makes hashes useful for integrity checks.',
  },
  {
    title: 'Public key size',
    description: 'How many bytes is a raw Ed25519 public key?',
    difficulty: 'Medium',
    solution: '32',
    hints: [
      'Stellar account keys (G...) encode this many bytes plus a version byte and checksum.',
      'It is the same size as a SHA-256 digest.',
    ],
    explanation:
      'Stellar accounts use Ed25519. A public key is 32 bytes; the human-readable G... address is that key in strkey encoding (version byte + key + CRC16 checksum, base32).',
  },
  {
    title: 'Signature size',
    description: 'How many bytes is an Ed25519 signature?',
    difficulty: 'Medium',
    solution: '64',
    hints: [
      'It is exactly twice the size of the public key.',
      'It consists of two 32-byte parts, R and S.',
    ],
    explanation:
      'An Ed25519 signature is 64 bytes (R || S). Stellar transactions carry such signatures so validators can verify that the account owner authorised them.',
  },
  {
    title: 'Account prefix',
    description:
      'Every Stellar public account address starts with the same single letter. Which one?',
    difficulty: 'Medium',
    solution: 'G',
    hints: [
      'Secret seeds start with a different letter (S).',
      'Public addresses are the first letter of a word meaning "public key" in strkey.',
    ],
    explanation:
      'Strkey encoding uses a version byte that makes public Ed25519 keys start with "G" and secret seeds with "S". Never share an "S..." seed.',
  },
];
