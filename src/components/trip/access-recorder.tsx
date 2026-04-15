"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import { recordMemberAccess } from "@/lib/firestore/groups";
import { useEffect, useRef } from "react";

/**
 * グループページへのアクセスを記録するコンポーネント。
 * sessionStorage を使ってセッション単位で1回のみ Firestore に書き込む。
 */
export function AccessRecorder() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();
  const recorded = useRef(false);

  useEffect(() => {
    if (!user || !groupId || recorded.current) return;
    const key = `trip_access_${groupId}_${user.uid}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    recordMemberAccess(groupId, user.uid).catch(() => {});
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, "1");
    }
    recorded.current = true;
  }, [user, groupId]);

  return null;
}
