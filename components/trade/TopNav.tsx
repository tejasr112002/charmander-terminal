"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MOCK_ADDRESS, useStore } from "@/lib/store";
import { shortAddress } from "@/lib/format";
import { ConnectModal } from "@/components/trade/ConnectModal";
import { openDeposit, openWithdraw } from "@/components/dialogs/Dialogs";

export function TopNav() {
  const path = usePathname();
  const loggedIn = useStore((s) => s.loggedIn);
  const logout = useStore((s) => s.logout);
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <Link href="/trade" className="nav-logo">
        <i /> MockTerminal
      </Link>
      <nav className="nav-links">
        <Link href="/trade" className={path?.startsWith("/trade") ? "active" : ""}>
          Trade
        </Link>
        <Link href="/portfolio" className={path?.startsWith("/portfolio") ? "active" : ""}>
          Portfolio
        </Link>
      </nav>
      <div className="nav-right">
        <button className="btn btn-ghost" data-testid="withdraw" onClick={openWithdraw}>
          Withdraw
        </button>
        <button className="btn btn-ghost" data-testid="deposit" onClick={openDeposit}>
          Deposit
        </button>
        {loggedIn ? (
          <button className="chip" data-testid="account-chip" title="Click to disconnect" onClick={logout}>
            <i /> {shortAddress(MOCK_ADDRESS)}
          </button>
        ) : (
          <button className="btn btn-primary" data-testid="connect" onClick={() => setOpen(true)}>
            Connect
          </button>
        )}
      </div>
      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </header>
  );
}
