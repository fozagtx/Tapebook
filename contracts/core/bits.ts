// Bit packing used by TapeOut's NetlistVM: pin i lives at (bytes[i >> 3] >> (i & 7)) & 1.
// No dependencies: imported by the Hardhat package (CommonJS) and the web app (bundler).

export type Hex = `0x${string}`;

export function bytesToHex(bytes: Uint8Array): Hex {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s as Hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error(`bad hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Number of bytes a canonical packing of `nBits` pins takes. */
export function byteLength(nBits: number): number {
  return (nBits + 7) >> 3;
}

/** Reads pin `i`; bytes past the end read as 0, as in NetlistVM._getBit. */
export function getBit(bytes: Uint8Array, i: number): 0 | 1 {
  const idx = i >> 3;
  if (idx >= bytes.length) return 0;
  return ((bytes[idx] >> (i & 7)) & 1) as 0 | 1;
}

/** Packs an integer into the canonical input encoding for `nBits` pins (bit i of x → pin i). */
export function packInt(x: bigint | number, nBits: number): Uint8Array {
  let v = BigInt(x);
  if (v < 0n) throw new RangeError('negative input');
  if (nBits < 256 && v >> BigInt(nBits) !== 0n) throw new RangeError(`input ${v} does not fit in ${nBits} pins`);
  const out = new Uint8Array(byteLength(nBits));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Inverse of packInt: pin i → bit i. */
export function unpackInt(bytes: Uint8Array, nBits?: number): bigint {
  const n = nBits ?? bytes.length * 8;
  let v = 0n;
  for (let i = n - 1; i >= 0; i--) v = (v << 1n) | BigInt(getBit(bytes, i));
  return v;
}

/** Pins as an array of 0/1, pin 0 first. */
export function unpackBits(bytes: Uint8Array, nBits: number): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  for (let i = 0; i < nBits; i++) out.push(getBit(bytes, i));
  return out;
}

/**
 * The canonical form TapebookClaims requires of a counterexample:
 * exactly ceil(nIn / 8) bytes and every bit above pin nIn - 1 zero.
 */
export function isCanonical(bytes: Uint8Array, nIn: number): boolean {
  if (bytes.length !== byteLength(nIn)) return false;
  const rem = nIn & 7;
  if (rem === 0 || bytes.length === 0) return true;
  return bytes[bytes.length - 1] >> rem === 0;
}
