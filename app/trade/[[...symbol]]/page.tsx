import { TradePage } from "@/components/trade/TradePage";
import { DEFAULT_SYMBOL } from "@/lib/store";

export const dynamic = "force-dynamic";

/** /trade/HYPE/USDC → ["HYPE","USDC"] → "HYPE/USDC"; /trade/BTC-USDC → "BTC-USDC". */
export default async function Page({ params }: { params: Promise<{ symbol?: string[] }> }) {
  const { symbol } = await params;
  const sym = symbol && symbol.length ? symbol.map(decodeURIComponent).join("/") : DEFAULT_SYMBOL;
  return <TradePage symbol={sym} />;
}
