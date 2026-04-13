import { Router } from 'express';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { getChildByUserId } from '../db/queries/children.js';
import { getOrCreateWalletForChild, updateSyncTimestamp } from '../db/queries/onchainWallets.js';
import {
  createPayout,
  getPayoutsByChildId,
  getTotalWithdrawnSatoshis,
} from '../db/queries/payouts.js';
import { getChildBalance } from '../db/queries/points.js';
import {
  deriveChildAddress,
  getConfiguredNetwork,
  buildAndSignTx,
  getHotWalletAddress,
} from '../services/bitcoinWallet.js';
import {
  getAddressBalance,
  getUtxos,
  broadcastTx,
  getRecommendedFeeRate,
} from '../services/chainIndex.js';
import type {
  SettleCreditsRequest,
  AppleCashPayoutRequest,
} from '../types.js';

const router = Router();

const SATOSHIS_PER_BONUS_POINT = 2_500;
const DUST_LIMIT = 546;

function ensureWallet(childId: number) {
  return getOrCreateWalletForChild({
    childId,
    network: getConfiguredNetwork(),
    deriveAddress: deriveChildAddress,
  });
}

// ─── Access guard: parent sees any child; child sees only self ───────────
async function resolveAndAuthorizeChildId(
  req: AuthRequest,
  childIdParam: string | number,
): Promise<{ childId: number } | { error: string; status: number }> {
  const childId = typeof childIdParam === 'string' ? parseInt(childIdParam, 10) : childIdParam;
  if (isNaN(childId)) return { error: 'Invalid child ID', status: 400 };

  if (req.user?.role === 'child') {
    const child = await getChildByUserId(req.user.userId);
    if (!child || child.id !== childId) {
      return { error: 'Access denied', status: 403 };
    }
  }
  return { childId };
}

/**
 * GET /api/bitcoin/onchain-wallet/:childId
 * Returns wallet address + on-chain balance.
 */
router.get('/onchain-wallet/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const auth = await resolveAndAuthorizeChildId(req, req.params.childId);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const wallet = await ensureWallet(auth.childId);
    const balance = await getAddressBalance(wallet.receive_address);
    await updateSyncTimestamp(auth.childId);

    res.json({
      childId: auth.childId,
      address: wallet.receive_address,
      network: wallet.network,
      confirmedSat: balance.confirmedSat,
      unconfirmedSat: balance.unconfirmedSat,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bitcoin/onchain-deposit-uri/:childId
 * Returns a bitcoin: URI and raw address for QR display.
 */
router.get('/onchain-deposit-uri/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const auth = await resolveAndAuthorizeChildId(req, req.params.childId);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const wallet = await ensureWallet(auth.childId);

    const amountSat = req.query.amountSat ? parseInt(req.query.amountSat as string, 10) : undefined;
    let bitcoinUri = `bitcoin:${wallet.receive_address}`;
    if (amountSat && amountSat > 0) {
      const btcAmount = amountSat / 100_000_000;
      bitcoinUri += `?amount=${btcAmount}`;
    }

    res.json({
      childId: auth.childId,
      address: wallet.receive_address,
      network: wallet.network,
      bitcoinUri,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bitcoin/onchain/settle-credits
 * Parent sends BTC from the house hot wallet to the child's on-chain address.
 */
router.post(
  '/onchain/settle-credits',
  authenticate,
  requireRole('parent'),
  async (req: AuthRequest, res, next) => {
    try {
      const { childId, satoshis }: SettleCreditsRequest = req.body;

      if (!childId || !satoshis || satoshis <= 0) {
        return res.status(400).json({ error: 'childId and positive satoshis required' });
      }
      if (satoshis < DUST_LIMIT) {
        return res.status(400).json({ error: `Amount below dust limit (${DUST_LIMIT} sat)` });
      }

      // Check available notional balance
      const pointBalance = await getChildBalance(childId);
      const notionalSat = Math.max(0, (pointBalance.bonus - pointBalance.demerit) * SATOSHIS_PER_BONUS_POINT);
      const withdrawn = await getTotalWithdrawnSatoshis(childId);
      const available = notionalSat - withdrawn;

      if (satoshis > available) {
        return res.status(400).json({
          error: `Insufficient credits. Available: ${available} sat, requested: ${satoshis} sat`,
        });
      }

      const wallet = await ensureWallet(childId);

      // Gather UTXOs from the hot wallet
      const hotAddress = getHotWalletAddress();
      const utxos = await getUtxos(hotAddress);
      const confirmedUtxos = utxos
        .filter((u) => u.status.confirmed)
        .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, hex: '' }));

      if (confirmedUtxos.length === 0) {
        return res.status(503).json({ error: 'Hot wallet has no confirmed UTXOs. Fund the hot wallet first.' });
      }

      const feeRate = await getRecommendedFeeRate();
      const { hex, txid, fee } = buildAndSignTx(confirmedUtxos, wallet.receive_address, satoshis, feeRate);

      const broadcastedTxid = await broadcastTx(hex);

      const payout = await createPayout({
        childId,
        type: 'onchain_settlement',
        satoshis,
        parentId: req.user!.userId,
        txid: broadcastedTxid || txid,
      });

      res.status(201).json({ payout, txid: broadcastedTxid || txid, fee });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/bitcoin/payout/apple-cash
 * Parent records a manual Apple Cash payout.
 */
router.post(
  '/payout/apple-cash',
  authenticate,
  requireRole('parent'),
  async (req: AuthRequest, res, next) => {
    try {
      const { childId, satoshis, usdAmount, note }: AppleCashPayoutRequest = req.body;

      if (!childId || !satoshis || satoshis <= 0) {
        return res.status(400).json({ error: 'childId and positive satoshis required' });
      }

      // Validate against notional balance
      const pointBalance = await getChildBalance(childId);
      const notionalSat = Math.max(0, (pointBalance.bonus - pointBalance.demerit) * SATOSHIS_PER_BONUS_POINT);
      const withdrawn = await getTotalWithdrawnSatoshis(childId);
      const available = notionalSat - withdrawn;

      if (satoshis > available) {
        return res.status(400).json({
          error: `Insufficient credits. Available: ${available} sat, requested: ${satoshis} sat`,
        });
      }

      const payout = await createPayout({
        childId,
        type: 'apple_cash_manual',
        satoshis,
        usdAmount: usdAmount ?? null,
        note: note ?? null,
        parentId: req.user!.userId,
      });

      res.status(201).json(payout);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/bitcoin/payouts/:childId
 * Payout history.
 */
router.get('/payouts/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const auth = await resolveAndAuthorizeChildId(req, req.params.childId);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const payouts = await getPayoutsByChildId(auth.childId);
    res.json(payouts);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bitcoin/available-credits/:childId
 * Shows the notional credits balance minus any payouts already made.
 */
router.get('/available-credits/:childId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const auth = await resolveAndAuthorizeChildId(req, req.params.childId);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

    const pointBalance = await getChildBalance(auth.childId);
    const notionalSat = Math.max(0, (pointBalance.bonus - pointBalance.demerit) * SATOSHIS_PER_BONUS_POINT);
    const withdrawn = await getTotalWithdrawnSatoshis(auth.childId);
    const available = Math.max(0, notionalSat - withdrawn);

    res.json({
      childId: auth.childId,
      notionalSat,
      withdrawnSat: withdrawn,
      availableSat: available,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
