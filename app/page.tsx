import { redirect } from "next/navigation";
import { DEFAULT_SYMBOL, symbolPath } from "@/lib/store";

export default function Home() {
  redirect(symbolPath(DEFAULT_SYMBOL));
}
