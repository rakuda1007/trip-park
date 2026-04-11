import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { ExpensesClient } from "./expenses-client";

export const metadata: Metadata = {
  title: "支出・精算",
};

export default function GroupExpensesPage() {
  return (
    <AuthGuard>
      <ExpensesClient />
    </AuthGuard>
  );
}
