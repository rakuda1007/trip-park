import { AuthGuard } from "@/components/auth-guard";
import { PlaceStepClient } from "./place-step-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "場所を決める",
};

export default function DestinationVotesPage() {
  return (
    <AuthGuard>
      <PlaceStepClient />
    </AuthGuard>
  );
}
