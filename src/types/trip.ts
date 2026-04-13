import type { Timestamp } from "firebase/firestore";

/** 経由地（順序は配列の並び） */
export type TripWaypoint = {
  name: string;
  memo?: string | null;
  mapUrl?: string | null;
};

/** 旅程ブロック（1日分） */
export type TripRouteDoc = {
  /** Day番号（1始まり） */
  dayNumber: number;
  /** 出発地（任意） */
  departurePoint: string | null;
  /** 出発地の地図リンク（任意） */
  departureMapUrl: string | null;
  /** 目的地名 */
  destinationName: string;
  /** 目的地の地図リンク（任意） */
  destinationMapUrl: string | null;
  /** 経由地リスト */
  waypoints: TripWaypoint[];
  /** 全体のルート地図リンク（任意） */
  routeMapUrl: string | null;
  /** メモ（任意） */
  memo: string | null;
  /** この日が完了済みか */
  isDone: boolean;
  /** Directions APIで描画したルートのエンコード済みポリライン（キャッシュ） */
  routePolyline: string | null;
  sortOrder: number;
  createdByUserId: string;
  createdByDisplayName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
