"use client";

import { createContext, useContext, type ReactNode } from "react";

const GroupRouteContext = createContext<string | null>(null);

/**
 * app/groups/[groupId]/layout でサーバー側の `await params` から渡す。
 * クライアントの useParams() より確実に groupId を渡す（Next.js 15）。
 */
export function GroupRouteProvider({
  groupId,
  children,
}: {
  groupId: string;
  children: ReactNode;
}) {
  return (
    <GroupRouteContext.Provider value={groupId}>
      {children}
    </GroupRouteContext.Provider>
  );
}

export function useGroupRouteId(): string {
  const id = useContext(GroupRouteContext);
  if (id == null || id === "") {
    throw new Error(
      "useGroupRouteId は GroupRouteProvider 内（/groups/[groupId] 配下）でのみ使えます。",
    );
  }
  return id;
}
