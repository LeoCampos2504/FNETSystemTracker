export type IntraLine = {
  id: string; date: string; invoice: string; supplier: string; scope: string;
  operation: string; location: string; product: string; quantity: number;
  net: number; liquidated: string; fuel: boolean; duplicate: boolean;
};
export type IntraRecord = IntraLine & {
  present: boolean; firstSeen: string; lastSeen: string; missingSince: string | null;
};
export type IntraScope = { name: string; importedAt: string; importedBy: string; fileName: string; fingerprint: string };
export type IntraTarget = {
  id: string; kind: 'FUEL' | 'MATERIAL'; hash: string; operation: string;
  description: string; quantity: number; date: string; formCode: string; siteCode: string; invoice?: string;
};
export type IntraAllocation = {
  id: string; lineId: string; targetId: string; targetKind: IntraTarget['kind'];
  targetHash: string; quantity: number; description: string; formCode: string;
  createdAt: string; createdBy: string; active: boolean; removedAt?: string; removedBy?: string;
};
export type IntraState = { version: number; scopes: IntraScope[]; records: IntraRecord[]; allocations: IntraAllocation[] };
export type IntraOverview = IntraState & { targets: IntraTarget[] };
export type IntraHistory = { version: number; at: string; actor: string; change: string };
