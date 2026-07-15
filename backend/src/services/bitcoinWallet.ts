import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import * as ecc from '@bitcoinerlab/secp256k1';
import { config } from '../config.js';
import {
  accountNodeFromXpub,
  branchAddress,
  coinTypeFor,
  networkMap,
} from './bitcoinWalletDerivation.js';

const bip32 = BIP32Factory(ecc);

function getNetwork(): bitcoin.Network {
  return networkMap[config.bitcoin.network];
}

/**
 * Whether this process may sign transactions. Merely providing a mnemonic or xprv is never enough.
 */
export function isSigningEnabled(): boolean {
  return config.bitcoin.hotWalletEnabled;
}

function getRootKey(): ReturnType<typeof bip32.fromBase58> {
  if (!config.bitcoin.hotWalletEnabled) {
    throw new Error(
      'Server-side Bitcoin signing is disabled. This deployment is watch-only; see ' +
        'docs/bitcoin-wallet-operations.md before enabling a managed signing secret.',
    );
  }

  const network = getNetwork();

  if (config.bitcoin.xprv) {
    return bip32.fromBase58(config.bitcoin.xprv, network);
  }

  if (config.bitcoin.mnemonic) {
    const seed = bip39.mnemonicToSeedSync(config.bitcoin.mnemonic);
    return bip32.fromSeed(seed, network);
  }

  throw new Error(
    'Bitcoin signing was enabled without a managed BITCOIN_MNEMONIC or BITCOIN_XPRV secret.',
  );
}

/** Account-level public node used for receive and change address derivation. */
function getAccountPublicNode() {
  if (config.bitcoin.xpub) {
    return accountNodeFromXpub(config.bitcoin.xpub, config.bitcoin.network);
  }
  if (config.bitcoin.hotWalletEnabled) {
    return getRootKey().derivePath(`m/84'/${coinTypeFor(config.bitcoin.network)}'/0'`).neutered();
  }
  throw new Error(
    'Bitcoin wallet is disabled. Configure BITCOIN_XPUB for watch-only operation; do not place a mnemonic or xprv on a default cloud deployment.',
  );
}

/**
 * BIP84 derivation: m/84'/coinType'/0'/0/index
 * Returns a native SegWit (bech32) address.
 */
export function deriveChildAddress(index: number): string {
  return branchAddress(getAccountPublicNode(), config.bitcoin.network, 0, index);
}

/**
 * Build, sign, and serialize a transaction that pays `toAddress` from UTXOs
 * controlled by the house wallet (derivation index 0 on the change path: m/84'/coin'/0'/1/0).
 *
 * Returns the raw hex for broadcast.
 */
export function buildAndSignTx(
  utxos: Array<{ txid: string; vout: number; value: number; hex: string }>,
  toAddress: string,
  amountSat: number,
  feeRateSatPerVbyte: number,
): { hex: string; txid: string; fee: number } {
  const network = getNetwork();
  const root = getRootKey();
  const coinType = coinTypeFor(config.bitcoin.network);

  // House hot-wallet key: change path index 0
  const hotWalletNode = root.derivePath(`m/84'/${coinType}'/0'/1/0`);
  const hotWalletPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(hotWalletNode.publicKey),
    network,
  });

  if (hotWalletPayment.address !== getHotWalletAddress()) {
    throw new Error(
      'BITCOIN_XPUB does not match the configured signing key. Export the public key from the same wallet or disable signing.',
    );
  }

  const psbt = new bitcoin.Psbt({ network });

  let inputSum = BigInt(0);
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: hotWalletPayment.output!,
        value: BigInt(utxo.value),
      },
    });
    inputSum += BigInt(utxo.value);
  }

  // Estimate size for fee: ~110 vbytes for 1-in/2-out p2wpkh
  const estimatedVbytes = 110 + (utxos.length - 1) * 68;
  const fee = Math.ceil(estimatedVbytes * feeRateSatPerVbyte);
  const amountBig = BigInt(amountSat);
  const feeBig = BigInt(fee);

  if (inputSum < amountBig + feeBig) {
    throw new Error(
      `Insufficient hot-wallet funds. Need ${amountSat + fee} sat, have ${inputSum} sat.`
    );
  }

  psbt.addOutput({ address: toAddress, value: amountBig });

  const change = inputSum - amountBig - feeBig;
  if (change > 546n) {
    psbt.addOutput({ address: hotWalletPayment.address!, value: change });
  }

  for (let i = 0; i < utxos.length; i++) {
    psbt.signInput(i, hotWalletNode);
  }

  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();

  return { hex: tx.toHex(), txid: tx.getId(), fee };
}

/**
 * Return the house hot-wallet address (change path index 0) for display / funding.
 */
export function getHotWalletAddress(): string {
  return branchAddress(getAccountPublicNode(), config.bitcoin.network, 1, 0);
}

export function getConfiguredNetwork(): 'mainnet' | 'testnet' {
  return config.bitcoin.network;
}
