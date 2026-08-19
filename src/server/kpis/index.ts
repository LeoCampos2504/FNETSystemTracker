/**
 * Pure, DB-free KPI computation. See docs/KPI_DEFINITIONS.md for the
 * formulas. Data-fetching (Prisma) lives in ./fetch.ts, imported directly by
 * the API routes — kept out of this barrel so this module stays pure and
 * trivially testable.
 */
export { computeGuardPerformance } from "./guard-performance";
export { computeTechnicianKpis } from "./technician-kpis";
export type { ComputeTechnicianKpisInput, TechnicianKpisWithoutRanking } from "./technician-kpis";
export { assignRanking, toRankingEntries } from "./ranking";
export { resolveDefaultPeriod, toDateString } from "./period";
