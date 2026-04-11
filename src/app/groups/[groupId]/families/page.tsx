import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { FamiliesClient } from "./families-client";

export const metadata: Metadata = {
  title: "家族（世帯）",
};

export default function GroupFamiliesPage() {
  return (
    <AuthGuard>
      <FamiliesClient />
    </AuthGuard>
  );
}
