import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ supplies: vi.fn(), preventives: vi.fn(), assignments: vi.fn() }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({
  correctivos: { findMany: async () => [], count: async () => 0 },
  preventivos: { findMany: mocks.preventives, count: async () => 1 },
  cotizaciones: { findMany: async () => [], count: async () => 0 },
  insumos: { findMany: mocks.supplies, count: async () => 1 },
  sytex_supply_form_contexts: { findMany: async () => [] },
  sytex_form_states: { findMany: async () => [] },
  sytex_form_links: { findMany: async () => [] },
}) }));
vi.mock("@/server/services/operational-data", () => ({
  getFuelData: async () => ({ items: [], metrics: {} }),
  getPendingData: async () => ({ items: [], metrics: {} }),
  getPendingBySites: async () => ({}),
}));
vi.mock("@/server/services/task-assignments", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/services/task-assignments")>(),
  listActiveTaskAssignments: mocks.assignments,
}));
import { getSyncedData } from "./synced-data";

const supply = {
  id: BigInt(1), formulario: "FO-26-610350", grupo: "Insumos", indice: "1", cantidad: null,
  descripcion: "Silicona", provisto_por: null, codigo_sitio: null, nombre_sitio: null,
  estado: null, imagen: null, ultima_edicion_el: null, sincronizado_el: new Date("2026-10-04T12:00:00Z"),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.preventives.mockResolvedValue([]);
  mocks.assignments.mockResolvedValue(new Map());
});
describe("supply technician and editor attribution", () => {
  it("does not infer technician or custody from the last editor", async () => {
    mocks.supplies.mockResolvedValue([{ ...supply, raw_data: { "Última edición por": "editor@example.invalid" } }]);
    const data = await getSyncedData();
    expect(data.insumos[0]).toMatchObject({ technician: null, lastEditedBy: "editor@example.invalid", syncedAt: "2026-10-04T12:00:00.000Z" });
  });
  it("uses the assigned technician of an exactly matching preventive form", async () => {
    mocks.supplies.mockResolvedValue([{ ...supply, raw_data: { "Última edición por": "Editor" } }]);
    mocks.preventives.mockResolvedValue([{ id: BigInt(2), codigo: supply.formulario, asignado_a: "Técnico asignado", sincronizado_el: supply.sincronizado_el }]);
    const data = await getSyncedData();
    expect(data.insumos[0]).toMatchObject({ technician: "Técnico asignado", lastEditedBy: "Editor" });
  });
  it("does not borrow a technician from a different form", async () => {
    mocks.supplies.mockResolvedValue([{ ...supply, raw_data: {} }]);
    mocks.preventives.mockResolvedValue([{ id: BigInt(2), codigo: "FO-26-610351", asignado_a: "Otro técnico", sincronizado_el: supply.sincronizado_el }]);
    const data = await getSyncedData();
    expect(data.insumos[0].technician).toBeNull();
  });
});
