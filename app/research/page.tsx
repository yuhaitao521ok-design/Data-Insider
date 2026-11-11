import type { Metadata } from "next";
import ResearchDashboard from "@/components/research/ResearchDashboard";

export const metadata: Metadata = {
  title: "量化研究 · TideWhale",
  description: "因子表、相关性矩阵、风险统计与相对强弱",
};

export default function Page() {
  return <ResearchDashboard />;
}
