import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import type { OnchainBalanceResponse, DepositUriResponse, ChildCreditPayout } from '../../../shared/src/types';

interface Props {
  childId: number;
  childName: string;
  onPayoutComplete?: () => void;
}

const SATS_PER_BTC = 100_000_000;

function formatBtc(sats: number): string {
  return (sats / SATS_PER_BTC).toFixed(8);
}

type Tab = 'wallet' | 'deposit' | 'settle' | 'apple' | 'history';

export default function BitcoinWallet({ childId, childName, onPayoutComplete }: Props) {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [tab, setTab] = useState<Tab>('wallet');
  const [wallet, setWallet] = useState<OnchainBalanceResponse | null>(null);
  const [depositUri, setDepositUri] = useState<DepositUriResponse | null>(null);
  const [payouts, setPayouts] = useState<ChildCreditPayout[]>([]);
  const [credits, setCredits] = useState<{ availableSat: number; notionalSat: number; withdrawnSat: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Settle form
  const [settleSats, setSettleSats] = useState('');
  // Apple Cash form
  const [appleSats, setAppleSats] = useState('');
  const [appleUsd, setAppleUsd] = useState('');
  const [appleNote, setAppleNote] = useState('');
  // Copied indicator
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, d, c] = await Promise.all([
        api.getOnchainWallet(childId),
        api.getDepositUri(childId),
        isParent ? api.getAvailableCredits(childId) : null,
      ]);
      setWallet(w);
      setDepositUri(d);
      if (c) setCredits(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }, [childId, isParent]);

  useEffect(() => { load(); }, [load]);

  const loadPayouts = useCallback(async () => {
    try {
      setPayouts(await api.getPayouts(childId));
    } catch { /* ignore */ }
  }, [childId]);

  useEffect(() => {
    if (tab === 'history') loadPayouts();
  }, [tab, loadPayouts]);

  const handleSettle = async () => {
    const sats = parseInt(settleSats, 10);
    if (!sats || sats <= 0) return setActionMsg('Enter a positive amount');
    setActionLoading(true);
    setActionMsg(null);
    try {
      const result = await api.settleCreditsOnchain({ childId, satoshis: sats });
      setActionMsg(`Sent ${sats.toLocaleString()} sats. Tx: ${result.txid}`);
      setSettleSats('');
      load();
      onPayoutComplete?.();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Settlement failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAppleCash = async () => {
    const sats = parseInt(appleSats, 10);
    if (!sats || sats <= 0) return setActionMsg('Enter a positive sats amount');
    setActionLoading(true);
    setActionMsg(null);
    try {
      await api.payoutAppleCash({
        childId,
        satoshis: sats,
        usdAmount: appleUsd ? parseFloat(appleUsd) : undefined,
        note: appleNote || undefined,
      });
      setActionMsg(`Apple Cash payout of ${sats.toLocaleString()} sats recorded.`);
      setAppleSats('');
      setAppleUsd('');
      setAppleNote('');
      load();
      onPayoutComplete?.();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Payout failed');
    } finally {
      setActionLoading(false);
    }
  };

  const copyAddress = () => {
    if (!depositUri) return;
    navigator.clipboard.writeText(depositUri.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="text-gray-400 text-sm py-4">Loading wallet...</div>;
  }
  if (error) {
    return <div className="text-red-400 text-sm py-4">{error}</div>;
  }

  const tabs: { key: Tab; label: string; parentOnly?: boolean }[] = [
    { key: 'wallet', label: 'Balance' },
    { key: 'deposit', label: 'Receive' },
    ...(isParent
      ? [
          { key: 'settle' as Tab, label: 'Settle to Chain', parentOnly: true },
          { key: 'apple' as Tab, label: 'Apple Cash', parentOnly: true },
        ]
      : []),
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="bg-gray-800 rounded-xl p-5 mt-4">
      <h3 className="text-lg font-semibold text-white mb-3">
        {childName}'s Bitcoin Wallet
        {wallet && (
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded bg-gray-700 text-gray-400">
            {wallet.network}
          </span>
        )}
      </h3>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setActionMsg(null); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ───── Balance ───── */}
      {tab === 'wallet' && wallet && (
        <div className="space-y-2">
          <div className="text-2xl font-bold text-orange-400">
            {wallet.confirmedSat.toLocaleString()} <span className="text-sm font-normal">sats</span>
          </div>
          <div className="text-sm text-gray-400">
            {formatBtc(wallet.confirmedSat)} BTC confirmed
          </div>
          {wallet.unconfirmedSat !== 0 && (
            <div className="text-sm text-yellow-400">
              +{wallet.unconfirmedSat.toLocaleString()} sats unconfirmed
            </div>
          )}
          {credits && isParent && (
            <div className="mt-3 pt-3 border-t border-gray-700 text-sm text-gray-400 space-y-1">
              <div>Notional credits: {credits.notionalSat.toLocaleString()} sats</div>
              <div>Already paid out: {credits.withdrawnSat.toLocaleString()} sats</div>
              <div className="text-white font-medium">
                Available to settle: {credits.availableSat.toLocaleString()} sats
              </div>
            </div>
          )}
          <button onClick={load} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
            Refresh
          </button>
        </div>
      )}

      {/* ───── Receive / Deposit QR ───── */}
      {tab === 'deposit' && depositUri && (
        <div className="flex flex-col items-center space-y-3">
          <div className="bg-white p-3 rounded-lg">
            <QRCodeSVG value={depositUri.bitcoinUri} size={200} />
          </div>
          <div className="text-xs text-gray-400 break-all text-center max-w-xs">
            {depositUri.address}
          </div>
          <button
            onClick={copyAddress}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Address'}
          </button>
          <p className="text-xs text-gray-500 text-center max-w-sm">
            Send Bitcoin to this address from Coinbase or any wallet. Open your sender
            app, choose Send, and scan this QR or paste the address.
          </p>
        </div>
      )}

      {/* ───── Settle credits on-chain ───── */}
      {tab === 'settle' && isParent && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Move in-app credit sats to {childName}'s on-chain wallet from the house hot wallet.
          </p>
          {credits && (
            <p className="text-sm text-gray-300">
              Available: <span className="font-semibold text-white">{credits.availableSat.toLocaleString()}</span> sats
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={settleSats}
              onChange={(e) => setSettleSats(e.target.value)}
              placeholder="Satoshis"
              className="flex-1 bg-gray-700 rounded px-3 py-2 text-white text-sm"
            />
            <button
              onClick={handleSettle}
              disabled={actionLoading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded text-sm text-white font-medium transition-colors"
            >
              {actionLoading ? 'Sending...' : 'Send to Wallet'}
            </button>
          </div>
          {actionMsg && (
            <p className={`text-sm ${actionMsg.includes('Tx:') ? 'text-green-400' : 'text-red-400'}`}>
              {actionMsg}
            </p>
          )}
        </div>
      )}

      {/* ───── Apple Cash manual payout ───── */}
      {tab === 'apple' && isParent && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Record a manual Apple Cash payment to {childName}. This reduces their available credit balance.
          </p>
          <input
            type="number"
            min={1}
            value={appleSats}
            onChange={(e) => setAppleSats(e.target.value)}
            placeholder="Satoshis equivalent"
            className="w-full bg-gray-700 rounded px-3 py-2 text-white text-sm"
          />
          <input
            type="number"
            step="0.01"
            value={appleUsd}
            onChange={(e) => setAppleUsd(e.target.value)}
            placeholder="USD amount (optional)"
            className="w-full bg-gray-700 rounded px-3 py-2 text-white text-sm"
          />
          <input
            type="text"
            value={appleNote}
            onChange={(e) => setAppleNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full bg-gray-700 rounded px-3 py-2 text-white text-sm"
          />
          <button
            onClick={handleAppleCash}
            disabled={actionLoading}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded text-sm text-white font-medium transition-colors"
          >
            {actionLoading ? 'Recording...' : 'Record Apple Cash Payout'}
          </button>
          {actionMsg && (
            <p className={`text-sm ${actionMsg.includes('recorded') ? 'text-green-400' : 'text-red-400'}`}>
              {actionMsg}
            </p>
          )}
        </div>
      )}

      {/* ───── History ───── */}
      {tab === 'history' && (
        <div>
          {payouts.length === 0 ? (
            <p className="text-sm text-gray-500">No payouts yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {payouts.map((p) => (
                <div key={p.id} className="bg-gray-700 rounded-lg px-3 py-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">
                      {p.satoshis.toLocaleString()} sats
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      p.type === 'onchain_settlement'
                        ? 'bg-orange-900/50 text-orange-300'
                        : 'bg-green-900/50 text-green-300'
                    }`}>
                      {p.type === 'onchain_settlement' ? 'On-chain' : 'Apple Cash'}
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {new Date(p.created_at).toLocaleDateString()}{' '}
                    {p.parent_name && `by ${p.parent_name}`}
                  </div>
                  {p.txid && (
                    <a
                      href={`https://blockstream.info/${wallet?.network === 'testnet' ? 'testnet/' : ''}tx/${p.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-xs hover:underline"
                    >
                      View on explorer
                    </a>
                  )}
                  {p.note && <div className="text-gray-400 text-xs mt-0.5">{p.note}</div>}
                  {p.usd_amount != null && (
                    <div className="text-gray-400 text-xs">${Number(p.usd_amount).toFixed(2)} USD</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
