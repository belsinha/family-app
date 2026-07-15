import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBitcoinWalletConfig } from './bitcoinWalletConfig.js';

test('signing secrets do not enable signing without the explicit opt-in', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    BITCOIN_MNEMONIC: 'high risk mnemonic',
  };

  const wallet = loadBitcoinWalletConfig(env);

  assert.equal(wallet.hotWalletEnabled, false);
  assert.equal(wallet.mnemonic, undefined);
  assert.equal(wallet.xprv, undefined);
  assert.equal(env.BITCOIN_MNEMONIC, undefined);
});

test('cloud startup rejects an unmanaged signing secret without exposing it', () => {
  const secret = 'do not print this xprv';
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    BITCOIN_XPRV: secret,
  };

  assert.throws(
    () => loadBitcoinWalletConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /BITCOIN_ENABLE_HOT_WALLET=true/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
  assert.equal(env.BITCOIN_XPRV, undefined);
});

test('cloud startup rejects a signing opt-in that has no managed secret', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    BITCOIN_ENABLE_HOT_WALLET: 'true',
  };

  assert.throws(() => loadBitcoinWalletConfig(env), /managed BITCOIN_MNEMONIC or BITCOIN_XPRV/);
});

test('a private key pasted into BITCOIN_XPUB is rejected and scrubbed', () => {
  const env: NodeJS.ProcessEnv = {
    BITCOIN_XPUB: 'xprv-do-not-echo',
  };

  assert.throws(
    () => loadBitcoinWalletConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /BITCOIN_XPUB.*private key/i);
      assert.doesNotMatch(error.message, /do-not-echo/);
      return true;
    },
  );
  assert.equal(env.BITCOIN_XPUB, undefined);
});

test('explicit cloud opt-in enables a managed signing secret and scrubs the environment', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    BITCOIN_ENABLE_HOT_WALLET: 'true',
    BITCOIN_MNEMONIC: 'managed secret value',
  };

  const wallet = loadBitcoinWalletConfig(env);

  assert.equal(wallet.hotWalletEnabled, true);
  assert.equal(wallet.mnemonic, 'managed secret value');
  assert.equal(env.BITCOIN_MNEMONIC, undefined);
});

test('watch-only cloud config needs no signing opt-in', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    BITCOIN_XPUB: 'xpub-public-only',
  };

  const wallet = loadBitcoinWalletConfig(env);

  assert.equal(wallet.hotWalletEnabled, false);
  assert.equal(wallet.xpub, 'xpub-public-only');
});
