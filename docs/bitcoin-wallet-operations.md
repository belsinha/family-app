# Bitcoin wallet operations

`BITCOIN_MNEMONIC` and `BITCOIN_XPRV` can spend wallet funds. Treat either value as a high-risk
custody secret, especially on mainnet. They must never be committed, pasted into tickets, sent to
the browser, included in build arguments, or written to application or deployment logs.

## Deployment modes

Cloud launch defaults to signing disabled:

- **Disabled:** leave `BITCOIN_XPUB`, `BITCOIN_MNEMONIC`, and `BITCOIN_XPRV` unset. Server-side
  settlement is unavailable.
- **Watch-only (preferred):** set `BITCOIN_XPUB` to the account-level public key exported at
  `m/84'/coin'/0'`, using plain `xpub` for mainnet or `tpub` for testnet. Receive addresses and
  balances work, but the settlement endpoint returns 503 and the UI hides the settlement action.
- **Signing (exception):** set `BITCOIN_ENABLE_HOT_WALLET=true` and inject exactly one of
  `BITCOIN_MNEMONIC` or `BITCOIN_XPRV` from the cloud platform's managed secret store at runtime.
  If `BITCOIN_XPUB` is also set, export it from the same wallet.

In production, a signing secret without the explicit opt-in stops startup. An opt-in without a
managed signing secret also stops startup. On config load, the app captures the selected secret in
process memory and removes the raw environment variables so later environment dumps and child
processes cannot inherit them. Error messages and logs must identify configuration variable names
only; they must never interpolate a mnemonic, xprv, seed, serialized config object, or environment
dump. Restrict secret-store access and deployment access to the minimum operator set.

## Enabling signing

1. Confirm `BITCOIN_NETWORK`; use testnet for rehearsal.
2. Generate or restore the wallet in a trusted offline environment. Keep an offline recovery backup.
3. Export the account public key at `m/84'/coin'/0'` for `BITCOIN_XPUB`.
4. Add the mnemonic or root xprv to the platform managed secret store. Do not put it in
   `render.yaml`, local `.env` files, CI output, or build-time variables.
5. Set `BITCOIN_ENABLE_HOT_WALLET=true`, deploy, and verify the reported receive/change addresses
   against the trusted wallet before funding them.
6. Rehearse a small testnet settlement and confirm the transaction on an independent explorer.

## Routine rotation

A wallet secret cannot be rotated like an API key: funds at old derived addresses remain controlled
by the old key. Preserve the old recovery material until all funds are moved and confirmed.

1. Disable settlement and set `BITCOIN_ENABLE_HOT_WALLET=false` (or remove it), then redeploy.
2. From a trusted wallet, inventory every receive/change address and prepare a new offline wallet.
3. Sweep all funds from the old wallet to an independently verified address in the new wallet.
4. Wait for the required confirmations and verify the old wallet balance independently.
5. Replace the managed signing secret and `BITCOIN_XPUB` together, re-enable signing, and redeploy.
6. Verify derived addresses, run a small test transaction, then securely archive or destroy the old
   recovery material according to the family's retention policy.

## Suspected compromise and recovery

If a mnemonic or xprv may have appeared in source control, chat, logs, screenshots, an environment
dump, or an unauthorized system, assume it is compromised. From a clean device, immediately sweep
funds to a newly generated wallet; disabling this server does not prevent an attacker from spending.
Then remove the exposed managed secret, rotate deployment access, inspect logs without copying the
secret, and follow the routine rotation steps with the new wallet.

For disaster recovery, restore the offline backup in a trusted wallet using the same network and
BIP84 account path. Verify known addresses before moving funds. Recovery must come from the offline
backup—not server logs, database records, browser storage, or cloud build artifacts, none of which
should contain spend-capable material.
