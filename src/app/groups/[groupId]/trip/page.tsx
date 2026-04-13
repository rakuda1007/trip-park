import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { TripClient } from "./trip-client";

export const metadata: Metadata = {
  title: "旅程",
};

export default function GroupTripPage() {
  return (
    <AuthGuard>
      <TripClient />
    </AuthGuard>
  );
}
