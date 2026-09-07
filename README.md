# mock-terminal

A trading terminal we control, for testing the QA agent. Fake exchange + realistic UI, with
named bug switches in `faults.json` so we can plant a bug and see whether the agent catches it.

- `pnpm dev` → http://localhost:3100 (Next.js UI + fake exchange + WebSocket in one process)
- `pnpm seed` → refresh `data/seed.json` from real Hyperliquid prices
- Edit `faults.json` (see `lib/types.ts` → `Faults`) to plant a bug; no restart needed.
- Login is a single "Connect" click; balance starts at 10,000 USDC.

See `FAULTS.md` for the list of bug switches.
