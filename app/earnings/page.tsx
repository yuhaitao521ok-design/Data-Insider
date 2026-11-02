import type { Metadata } from "next";
import EarningsDashboard from "@/components/earnings/EarningsDashboard";

export const metadata: Metadata = {
  title: "财报站 · Data Insider",
  description: "财报日历、EPS 实际与预期、三大报表与关键财务趋势",
};

export default function Page() {
  return <EarningsDashboard />;
}
