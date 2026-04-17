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
  /** 待ち合わせ・出発の目安時間（任意、例: 8:30） */
  departureMeetTime: string | null;
  /** 出発地の地図リンク（任意） */
  departureMapUrl: string | null;
  /** 目的地名 */
  destinationName: string;
  /** 目的地の地図リンク（任意） */
  destinationMapUrl: string | null;
  /** 経由地リスト */
  waypoints: TripWaypoint[];
  /**
   * 区間ごとのルート地図リンク（任意）。経由地が n 件のとき長さ n+1。
   * [0]=出発地→第1経由地, [1..n-1]=経由同士, [n]=最終経由地→目的地
   */
  segmentRouteMapUrls: (string | null)[];
  /** 全体のルート地図リンク（任意） */
  routeMapUrl: string | null;
  /** メモ（任意） */
  memo: string | null;
  /** この日が完了済みか */
  isDone: boolean;
  sortOrder: number;
  createdByUserId: string;
  createdByDisplayName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
