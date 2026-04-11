import type { Timestamp } from "firebase/firestore";

/** 経由地（順序は配列の並び） */
export type TripWaypoint = {
  name: string;
  memo?: string | null;
  mapUrl?: string | null;
};

/** 旅程ブロック（目的地・経由地・地図リンク） */
export type TripRouteDoc = {
  /** 例: A車・行き */
  routeLabel: string | null;
  /** ブロックの見出し */
  title: string;
  destinationName: string;
  destinationAddress: string | null;
  destinationMemo: string | null;
  destinationMapUrl: string | null;
  waypoints: TripWaypoint[];
  /** 全体のルートをまとめた地図リンク（任意） */
  routeMapUrl: string | null;
  sortOrder: number;
  createdByUserId: string;
  createdByDisplayName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
