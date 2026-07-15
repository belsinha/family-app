export interface BitcoinWalletSecretConfig {
  xpub: string | undefined;
  hotWalletEnabled: boolean;
  mnemonic: string | undefined;
  xprv: string | undefined;
}

function configured(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

/**
 * Loads the Bitcoin wallet mode while minimizing exposure of spend-capable material.
 * The raw secret variables are removed from the provided environment immediately so
 * later environment dumps and child processes cannot inherit them.
 */
export function loadBitcoinWalletConfig(env: NodeJS.ProcessEnv): BitcoinWalletSecretConfig {
  const mnemonic = configured(env.BITCOIN_MNEMONIC) ? env.BITCOIN_MNEMONIC : undefined;
  const xprv = configured(env.BITCOIN_XPRV) ? env.BITCOIN_XPRV : undefined;
  const xpub = configured(env.BITCOIN_XPUB) ? env.BITCOIN_XPUB.trim() : undefined;
  const optedIn = env.BITCOIN_ENABLE_HOT_WALLET === 'true';

  delete env.BITCOIN_MNEMONIC;
  delete env.BITCOIN_XPRV;

  if (xpub && (/^[xyztuv]prv/.test(xpub) || /\s/.test(xpub))) {
    delete env.BITCOIN_XPUB;
    throw new Error(
      'BITCOIN_XPUB contains a private key or mnemonic. Treat it as compromised, remove it from ' +
        'the environment, and follow docs/bitcoin-wallet-operations.md.',
    );
  }

  if (env.NODE_ENV === 'production' && (mnemonic || xprv) && !optedIn) {
    throw new Error(
      'Refusing cloud startup: BITCOIN_MNEMONIC/BITCOIN_XPRV requires ' +
        'BITCOIN_ENABLE_HOT_WALLET=true. Prefer BITCOIN_XPUB for watch-only operation; ' +
        'if signing is required, inject the signing secret through the platform managed-secret store.',
    );
  }
  if (env.NODE_ENV === 'production' && optedIn && !mnemonic && !xprv) {
    throw new Error(
      'BITCOIN_ENABLE_HOT_WALLET=true requires a managed BITCOIN_MNEMONIC or BITCOIN_XPRV secret.',
    );
  }

  const hotWalletEnabled = optedIn && Boolean(mnemonic || xprv);

  return {
    xpub,
    hotWalletEnabled,
    mnemonic: hotWalletEnabled ? mnemonic : undefined,
    xprv: hotWalletEnabled ? xprv : undefined,
  };
}
