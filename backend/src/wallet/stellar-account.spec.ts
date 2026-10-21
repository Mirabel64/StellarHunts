import { generateKeyPairSync, sign } from 'crypto';
import {
  decodeAccountAddress,
  encodeAccountAddress,
  isValidAccountAddress,
  verifyAccountSignature,
} from './stellar-account';

const createKeypair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKey = publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32);

  return {
    rawPublicKey,
    address: encodeAccountAddress(rawPublicKey),
    sign: (message: string | Buffer) =>
      sign(null, Buffer.from(message), privateKey),
  };
};

describe('Stellar account addresses', () => {
  it('round-trips a raw ed25519 public key through a G address', () => {
    const { address, rawPublicKey } = createKeypair();

    expect(address).toMatch(/^G[A-Z2-7]{55}$/);
    expect(decodeAccountAddress(address)).toEqual(rawPublicKey);
  });

  it('encodes and decodes a known vector', () => {
    const known = 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G';

    expect(isValidAccountAddress(known)).toBe(true);
    expect(encodeAccountAddress(decodeAccountAddress(known))).toBe(known);
  });

  it('rejects a mistyped address because the checksum no longer matches', () => {
    const { address } = createKeypair();
    const mistyped = `${address.slice(0, 10)}${
      address[10] === 'A' ? 'B' : 'A'
    }${address.slice(11)}`;

    expect(mistyped).not.toBe(address);
    expect(isValidAccountAddress(mistyped)).toBe(false);
  });

  it.each([
    ['an empty string', ''],
    ['a contract address', 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE'],
    ['an Ethereum address', '0x1234567890abcdef1234567890abcdef12345678'],
    ['lowercase base32', 'gdn752q6gw5gmeedzol7dacrhe2qmcd55milmlrpmzdcn2aokb6wuoh2g'],
  ])('rejects %s', (_label, value) => {
    expect(isValidAccountAddress(value)).toBe(false);
    expect(() => decodeAccountAddress(value)).toThrow();
  });
});

describe('Stellar signature verification', () => {
  it('accepts a signature made by the account key', () => {
    const { address, sign } = createKeypair();
    const message = Buffer.from('stellar-hunts: authenticate', 'utf8');

    expect(verifyAccountSignature(address, message, sign(message))).toBe(true);
  });

  it('rejects a signature over different bytes', () => {
    const { address, sign } = createKeypair();

    expect(
      verifyAccountSignature(
        address,
        Buffer.from('tampered'),
        sign('original'),
      ),
    ).toBe(false);
  });

  it('rejects a signature made by a different key', () => {
    const { address } = createKeypair();
    const { sign } = createKeypair();
    const message = Buffer.from('login');

    expect(verifyAccountSignature(address, message, sign(message))).toBe(false);
  });

  it('rejects a malformed (non-64-byte) signature', () => {
    const { address } = createKeypair();

    expect(
      verifyAccountSignature(address, Buffer.from('login'), Buffer.alloc(10)),
    ).toBe(false);
  });
});
