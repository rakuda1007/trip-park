import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { ScheduleClient } from "./schedule-client";

export const metadata: Metadata = {
  title: "日程調整",
};

export default function GroupSchedulePage() {
  return (
    <AuthGuard>
      <ScheduleClient />
    </AuthGuard>
  );
}
