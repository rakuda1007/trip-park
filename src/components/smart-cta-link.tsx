"use client";

import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import type { ReactNode } from "react";

type SmartCtaLinkProps = {
  children: ReactNode;
  className: string;
};

export function SmartCtaLink({ children, className }: SmartCtaLinkProps) {
  const { user } = useAuth();
  const href = user ? "/dashboard" : "/signup";

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
