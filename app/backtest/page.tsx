import type { Metadata } from "next";
import BacktestDashboard from "@/components/backtest/BacktestDashboard";

export const metadata: Metadata = {
  title: "策略回测 · TideWhale",
  description: "MA 交叉 / RSI / BOLL 策略回测：净值曲线、回撤、交易明细",
};

export default function Page() {
  return <BacktestDashboard />;
}
