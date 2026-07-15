import test from 'node:test';
import assert from 'node:assert/strict';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import * as ecc from '@bitcoinerlab/secp256k1';
import { accountNodeFromXpub, branchAddress, networkMap } from './bitcoinWalletDerivation.js';

const bip32 = BIP32Factory(ecc);
const BIP84_TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('watch-only account xpub derives the BIP84 receive address', () => {
  const seed = bip39.mnemonicToSeedSync(BIP84_TEST_MNEMONIC);
  const accountXpub = bip32
    .fromSeed(seed, networkMap.mainnet)
    .derivePath("m/84'/0'/0'")
    .neutered()
    .toBase58();

  const account = accountNodeFromXpub(accountXpub, 'mainnet');

  assert.equal(branchAddress(account, 'mainnet', 0, 0), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
});

test('the watch-only public-key slot rejects a mnemonic without echoing it', () => {
  assert.throws(
    () => accountNodeFromXpub(BIP84_TEST_MNEMONIC, 'mainnet'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /mnemonic.*compromised/i);
      assert.doesNotMatch(error.message, /abandon/);
      return true;
    },
  );
});
