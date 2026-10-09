"use client";

import { useGroupRouteId } from "@/contexts/group-route-context";
import { listDestinationPolls, type PollItem } from "@/lib/firestore/destination-votes";
import { getGroup } from "@/lib/firestore/groups";
import { listScheduleCandidates } from "@/lib/firestore/schedule";
import { listTripRoutes } from "@/lib/firestore/trip";
import type { GroupDoc } from "@/types/group";
import type { TripRouteDoc } from "@/types/trip";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type GroupWorkflowValue = {
  groupId: string;
  group: GroupDoc | null | undefined;
  setGroup: (g: GroupDoc | null) => void;
  polls: PollItem[];
  tripRoutes: { id: string; data: TripRouteDoc }[];
  scheduleHasCandidates: boolean;
  coreLoading: boolean;
  refreshCore: () => Promise<void>;
};

const GroupWorkflowContext = createContext<GroupWorkflowValue | null>(null);

/**
 * 旅行配下で getGroup / polls / routes / schedule 候補を1回だけ取り回す。
 */
export function GroupWorkflowProvider({ children }: { children: ReactNode }) {
  const groupId = useGroupRouteId();
  const [group, setGroupState] = useState<GroupDoc | null | undefined>(undefined);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [tripRoutes, setTripRoutes] = useState<
    { id: string; data: TripRouteDoc }[]
  >([]);
  const [scheduleHasCandidates, setScheduleHasCandidates] = useState(false);
  const [coreLoading, setCoreLoading] = useState(true);

  const refreshCore = useCallback(async () => {
    setCoreLoading(true);
    try {
      const g = await getGroup(groupId);
      setGroupState(g);
      if (!g) {
        setPolls([]);
        setTripRoutes([]);
        setScheduleHasCandidates(false);
        return;
      }
      const [p, routes, cands] = await Promise.all([
        listDestinationPolls(groupId).catch(() => [] as PollItem[]),
        listTripRoutes(groupId).catch(
          () => [] as { id: string; data: TripRouteDoc }[],
        ),
        listScheduleCandidates(groupId).catch(() => []),
      ]);
      setPolls(p);
      setTripRoutes(routes);
      setScheduleHasCandidates(cands.length > 0);
    } catch {
      setGroupState(null);
      setPolls([]);
      setTripRoutes([]);
      setScheduleHasCandidates(false);
    } finally {
      setCoreLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void refreshCore();
  }, [refreshCore]);

  const setGroup = useCallback((g: GroupDoc | null) => {
    setGroupState(g);
  }, []);

  const value = useMemo(
    () => ({
      groupId,
      group,
      setGroup,
      polls,
      tripRoutes,
      scheduleHasCandidates,
      coreLoading,
      refreshCore,
    }),
    [
      groupId,
      group,
      setGroup,
      polls,
      tripRoutes,
      scheduleHasCandidates,
      coreLoading,
      refreshCore,
    ],
  );

  return (
    <GroupWorkflowContext.Provider value={value}>
      {children}
    </GroupWorkflowContext.Provider>
  );
}

export function useGroupWorkflow(): GroupWorkflowValue {
  const ctx = useContext(GroupWorkflowContext);
  if (!ctx) {
    throw new Error(
      "useGroupWorkflow は GroupWorkflowProvider 内でのみ使えます。",
    );
  }
  return ctx;
}
