import type { ExpenseDoc } from "@/types/expense";
import type { FamilyDoc } from "@/types/family";

/** 均等割り: 端数は 1 円ずつ先頭（ユーザー ID 昇順）に配分 */
export function distributeEqualSharesYen(amount: number, n: number): number[] {
  if (n <= 0 || !Number.isFinite(amount)) return [];
  const a = Math.floor(amount);
  if (a < 0) return [];
  const base = Math.floor(a / n);
  const rem = a % n;
  const shares = new Array<number>(n).fill(base);
  for (let i = 0; i < rem; i++) shares[i] += 1;
  return shares;
}

/**
 * 重み付き: 最大剰余法で合計が amountYen と一致する整数配分。
 */
export function distributeWeightedSharesYen(
  amountYen: number,
  weights: Map<string, number>,
): Map<string, number> {
  const entries = [...weights.entries()].filter(([, w]) => w > 0);
  const sumW = entries.reduce((s, [, w]) => s + w, 0);
  if (sumW <= 0 || !Number.isFinite(amountYen)) return new Map();
  const amt = Math.floor(amountYen);
  if (amt < 0) return new Map();

  type Row = { uid: string; floor: number; frac: number };
  const rows: Row[] = entries.map(([uid, w]) => {
    const exact = (amt * w) / sumW;
    return { uid, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  const sumFloors = rows.reduce((s, r) => s + r.floor, 0);
  let remainder = amt - sumFloors;
  rows.sort((a, b) => b.frac - a.frac);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.uid, r.floor);
  let i = 0;
  while (remainder > 0 && rows.length > 0) {
    const r = rows[i % rows.length]!;
    out.set(r.uid, (out.get(r.uid) ?? 0) + 1);
    remainder -= 1;
    i += 1;
  }
  return out;
}

function expenseSharesYen(e: ExpenseDoc): Map<string, number> {
  // 新形式: 世帯ベース
  if (e.participantFamilyIds && e.participantFamilyIds.length > 0) {
    const familyIds = [...e.participantFamilyIds].sort();
    if (e.splitMode === "weighted" && e.weightByFamilyId) {
      const wmap = new Map<string, number>();
      for (const fid of familyIds) {
        const w = e.weightByFamilyId[fid];
        if (w != null && w > 0 && Number.isFinite(w)) wmap.set(`family:${fid}`, w);
      }
      if (wmap.size > 0) return distributeWeightedSharesYen(e.amount, wmap);
    }
    const shares = distributeEqualSharesYen(e.amount, familyIds.length);
    const out = new Map<string, number>();
    for (let i = 0; i < familyIds.length; i++) {
      out.set(`family:${familyIds[i]!}`, shares[i] ?? 0);
    }
    return out;
  }

  // 旧形式: ユーザーベース（後方互換）
  const ids = [...e.participantUserIds].sort();
  const n = ids.length;
  if (n === 0) return new Map();

  if (e.splitMode === "weighted" && e.weightByUserId) {
    const wmap = new Map<string, number>();
    for (const uid of ids) {
      const w = e.weightByUserId[uid];
      if (w != null && w > 0 && Number.isFinite(w)) wmap.set(uid, w);
    }
    if (wmap.size === 0) return new Map();
    return distributeWeightedSharesYen(e.amount, wmap);
  }

  const shares = distributeEqualSharesYen(e.amount, n);
  const out = new Map<string, number>();
  for (let i = 0; i < n; i++) out.set(ids[i]!, shares[i] ?? 0);
  return out;
}

/**
 * 各ユーザーの残高（円）。
 * プラス＝全体から受け取るべき、マイナス＝全体に払うべき。
 */
/**
 * メンバー別の負担は userId キー、立て替えは `family:${familyId}` キー。
 * `userToFamilyId` は旧 expense（paidByUserId のみ）の解決に使う。
 */
export function computeBalancesYen(
  expenses: { data: ExpenseDoc }[],
  userToFamilyId?: Map<string, string>,
): Map<string, number> {
  const bal = new Map<string, number>();
  for (const { data: e } of expenses) {
    const shares = expenseSharesYen(e);
    for (const [uid, share] of shares) {
      bal.set(uid, (bal.get(uid) ?? 0) - share);
    }
    let payerKey: string | null = null;
    if (e.paidByFamilyId) {
      payerKey = `family:${e.paidByFamilyId}`;
    } else if (e.paidByUserId) {
      const fid = userToFamilyId?.get(e.paidByUserId);
      payerKey = fid ? `family:${fid}` : e.paidByUserId;
    }
    if (payerKey) {
      bal.set(payerKey, (bal.get(payerKey) ?? 0) + e.amount);
    }
  }
  return bal;
}

export type SettlementTransfer = {
  fromUserId: string;
  toUserId: string;
  amountYen: number;
};

export type KeyedSettlementTransfer = {
  fromKey: string;
  toKey: string;
  amountYen: number;
};

function computeSettlementFromBalances(
  balancesYen: Map<string, number>,
): { from: string; to: string; amountYen: number }[] {
  const EPS = 0.5;
  const debtors: { id: string; owed: number }[] = [];
  const creditors: { id: string; credit: number }[] = [];
  for (const [id, b] of balancesYen) {
    if (b < -EPS) debtors.push({ id, owed: -b });
    else if (b > EPS) creditors.push({ id, credit: b });
  }
  debtors.sort((a, b) => b.owed - a.owed);
  creditors.sort((a, b) => b.credit - a.credit);
  const out: { from: string; to: string; amountYen: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i]!.owed, creditors[j]!.credit);
    const yen = Math.round(pay);
    if (yen >= 1) {
      out.push({
        from: debtors[i]!.id,
        to: creditors[j]!.id,
        amountYen: yen,
      });
    }
    debtors[i]!.owed -= pay;
    creditors[j]!.credit -= pay;
    if (debtors[i]!.owed < EPS) i += 1;
    if (creditors[j]!.credit < EPS) j += 1;
  }
  return out;
}

/**
 * 貪欲法で債権者・債務者を突き合わせ、送金回数を抑えた送金リスト（円・整数）。
 */
export function computeSettlementTransfers(
  balancesYen: Map<string, number>,
): SettlementTransfer[] {
  return computeSettlementFromBalances(balancesYen).map((t) => ({
    fromUserId: t.from,
    toUserId: t.to,
    amountYen: t.amountYen,
  }));
}

/** メンバー ID 以外のキー（例: family:xxx）でも利用可能 */
export function computeKeyedSettlementTransfers(
  balancesYen: Map<string, number>,
): KeyedSettlementTransfer[] {
  return computeSettlementFromBalances(balancesYen).map((t) => ({
    fromKey: t.from,
    toKey: t.to,
    amountYen: t.amountYen,
  }));
}

/**
 * メンバー別残高を世帯に合算。キーは `family:${familyId}` または `user:${uid}`（未所属）。
 */
export function aggregateBalancesByFamilyUnit(
  balances: Map<string, number>,
  families: { id: string; data: { memberUserIds: string[] } }[],
): Map<string, number> {
  const userToFamily = new Map<string, string>();
  for (const f of families) {
    for (const uid of f.data.memberUserIds) {
      userToFamily.set(uid, f.id);
    }
  }
  const out = new Map<string, number>();
  for (const [key, b] of balances) {
    if (key.startsWith("family:")) {
      out.set(key, (out.get(key) ?? 0) + b);
      continue;
    }
    const fid = userToFamily.get(key);
    if (fid) {
      const k = `family:${fid}`;
      out.set(k, (out.get(k) ?? 0) + b);
    } else {
      const k = `user:${key}`;
      out.set(k, (out.get(k) ?? 0) + b);
    }
  }
  return out;
}

export function resolveSettlementUnitLabel(
  key: string,
  families: { id: string; data: FamilyDoc }[],
  displayName: (uid: string) => string,
): string {
  if (key.startsWith("family:")) {
    const id = key.slice(7);
    const f = families.find((x) => x.id === id);
    return f ? `${f.data.name}（世帯）` : key;
  }
  if (key.startsWith("user:")) {
    const uid = key.slice(5);
    return `${displayName(uid)}（未所属）`;
  }
  return key;
}
