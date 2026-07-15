import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory, { type BIP32Interface } from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';

const bip32 = BIP32Factory(ecc);

bitcoin.initEccLib(ecc);

export type BitcoinNetworkName = 'mainnet' | 'testnet';

export const networkMap = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
} as const;

export function coinTypeFor(networkName: BitcoinNetworkName): 0 | 1 {
  return networkName === 'mainnet' ? 0 : 1;
}

/** Parse an account-level public node (m/84'/coin'/0') for watch-only derivation. */
export function accountNodeFromXpub(xpub: string, networkName: BitcoinNetworkName): BIP32Interface {
  const trimmed = xpub.trim();
  if (/\s/.test(trimmed)) {
    throw new Error(
      'BITCOIN_XPUB looks like a mnemonic. Never place a signing secret in the public-key slot; ' +
        'treat the pasted mnemonic as compromised and follow docs/bitcoin-wallet-operations.md.',
    );
  }
  if (/^[xyztuv]prv/.test(trimmed)) {
    throw new Error(
      'BITCOIN_XPUB contains a private key. Replace it with the account public key and treat the ' +
        'private key as compromised; follow docs/bitcoin-wallet-operations.md.',
    );
  }
  if (/^[yzuv]pub/.test(trimmed)) {
    throw new Error(
      'BITCOIN_XPUB must use plain xpub (mainnet) or tpub (testnet) version bytes; convert the account public key first.',
    );
  }
  const node = bip32.fromBase58(trimmed, networkMap[networkName]);
  if (!node.isNeutered()) {
    throw new Error('BITCOIN_XPUB must contain an account public key, never a private key.');
  }
  return node;
}

/** Derive a native SegWit address below an account-level public node. */
export function branchAddress(
  account: BIP32Interface,
  networkName: BitcoinNetworkName,
  branch: number,
  index: number,
): string {
  const child = account.derive(branch).derive(index);
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network: networkMap[networkName],
  });
  if (!address) throw new Error(`Failed to derive address at branch ${branch}, index ${index}`);
  return address;
}
