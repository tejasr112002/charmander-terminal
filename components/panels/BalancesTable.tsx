"use client";
import type { Fill } from "@/lib/types";
import { useStore } from "@/lib/store";
import { openTransfer, openWithdraw } from "@/components/dialogs/dialogStore";
import { EmptyState } from "./EmptyState";
import { fmtNum, fmtPct, fmtSignedUsd, fmtUsd, marketForAsset } from "./format";
import s from "./panels.module.css";

export const SMALL_BALANCE_USD = 1;

/** Average cost of a spot asset from buy fills, for the PNL (ROE %) column. */
function avgCost(fills: Fill[], asset: string): number | null {
  let qty = 0;
  let cost = 0;
  for (const f of fills) {
    if (f.side !== "buy" || !f.symbol.startsWith(`${asset}/`)) continue;
    qty += f.size;
    cost += f.size * f.price;
  }
  return qty > 0 ? cost / qty : null;
}

export function BalancesTable({ fills, hideSmall }: { fills: Fill[]; hideSmall: boolean }) {
  const account = useStore((st) => st.account);
  const markets = useStore((st) => st.markets);
  const tickers = useStore((st) => st.tickers);
  const renderTs = Date.now();
  if (!account) return <EmptyState text="Connect to see balances" testId="balances-empty" />;

  const rows = account.balances
    .filter((b) => b.asset === "USDC" || b.total > 0)
    .filter((b) => !hideSmall || b.asset === "USDC" || b.usdValue >= SMALL_BALANCE_USD)
    .sort((a, b) => (a.asset === "USDC" ? -1 : b.asset === "USDC" ? 1 : b.usdValue - a.usdValue));

  return (
    <div className={s.scroll}>
      <table className={s.table} data-testid="balances-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Total Balance</th>
            <th>Available Balance</th>
            <th>USDC Value</th>
            <th>PNL (ROE %)</th>
            <th>Send</th>
            <th>Transfer</th>
            <th>Repay</th>
            <th>Contract</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const market = marketForAsset(markets, b.asset);
            const dec = b.asset === "USDC" ? 2 : market?.sizeDecimals ?? 4;
            const mark = market ? tickers[market.symbol]?.mark ?? tickers[market.symbol]?.last : undefined;
            const cost = b.asset === "USDC" ? null : avgCost(fills, b.asset);
            const pnl = cost !== null && mark !== undefined ? (mark - cost) * b.total : null;
            const roe = pnl !== null && cost ? (pnl / (cost * b.total)) * 100 : null;
            return (
              <tr key={b.asset} data-server-ts={account.ts} data-client-ts={renderTs} data-asset={b.asset} data-testid="balance-row">
                <td className={s.text}>
                  <span className={s.coin}>{b.asset}</span>
                </td>
                <td data-col="total">{fmtNum(b.total, dec)}</td>
                <td data-col="available">{fmtNum(b.available, dec)}</td>
                <td data-col="usdValue">{fmtUsd(b.usdValue)}</td>
                <td data-col="pnl" className={pnl === null ? s.muted : pnl >= 0 ? s.green : s.red}>
                  {pnl === null || roe === null ? "--" : `${fmtSignedUsd(pnl)} (${fmtPct(roe)})`}
                </td>
                <td className={s.text}>
                  <button type="button" className={s.link} onClick={openWithdraw} disabled={b.asset !== "USDC"}>
                    Send
                  </button>
                </td>
                <td className={s.text}>
                  <button type="button" className={s.link} onClick={openTransfer} disabled={b.asset !== "USDC"}>
                    Transfer to/from EVM
                  </button>
                </td>
                <td className={`${s.text} ${s.muted}`}>--</td>
                <td className={s.muted}>{b.asset === "USDC" ? "--" : `0x${b.asset.toLowerCase().padEnd(6, "0").slice(0, 6)}…`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
