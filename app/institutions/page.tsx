import type { Metadata } from "next";
import InstitutionsDashboard from "@/components/institutions/InstitutionsDashboard";
import { SUPER_INVESTORS } from "@/lib/institutions";

export const metadata: Metadata = {
  title: "机构持仓 · TideWhale",
  description: `机构持股比例、内部人交易，以及巴菲特 / 桥水 / 段永平 / 李录等 ${SUPER_INVESTORS.length} 位名人最新 13F 持仓`,
};

export default function Page() {
  return <InstitutionsDashboard />;
}
