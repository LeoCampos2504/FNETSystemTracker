import type { Task } from "./task";
import type { QuoteStatus } from "./enums";
import type { FuelCharge, FuelMetrics } from "./fuel";
import type { PendingMetrics, PendingVisit } from "./pending";

export interface PostgresQuote {
  id: string;
  code: string;
  status: QuoteStatus;
  zoneId: string;
  projectId: string | null;
  supplier: string | null;
  total: string | null;
  currency: string | null;
  taskCode: string | null;
  relatedCorrectiveCode: string | null;
  siteCode: string | null;
  siteName: string | null;
  createdAt: string | null;
  updatedAt: string;
  link: string | null;
}

export interface PostgresSupply {
  id: string;
  formulario: string;
  grupo: string | null;
  indice: string | null;
  quantity: number | null;
  description: string | null;
  provider: string | null;
  siteCode: string | null;
  siteName: string | null;
  status: string | null;
  image: string | null;
  technician: string | null;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  syncedAt: string;
}

export interface SyncedCounts {
  correctivos: number;
  preventivos: number;
  cotizaciones: number;
  insumos: number;
}

export interface SyncedData {
  source: "postgresql";
  counts: SyncedCounts;
  tasks: Task[];
  quotes: PostgresQuote[];
  insumos: PostgresSupply[];
  fuel: FuelCharge[];
  fuelMetrics: FuelMetrics;
  pendientes: PendingVisit[];
  pendingMetrics: PendingMetrics;
  pendingBySite: Record<string, PendingVisit[]>;
}
