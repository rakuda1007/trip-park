import { AuthGuard } from "@/components/auth-guard";
import { DestinationVotesClient } from "./destination-votes-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "目的地を決める",
};

export default function DestinationVotesPage() {
  return (
    <AuthGuard>
      <DestinationVotesClient />
    </AuthGuard>
  );
}
