import type {
  Api,
  AssignGuardInput,
  AssignTechniciansToTaskInput,
  AuthSession,
  GetGuardsParams,
  GetPendingTasksParams,
  GetQuotesParams,
  GetTasksParams,
  Guard,
  GuardPerformance,
  LoginCredentials,
  Notification,
  Quote,
  ScheduleTaskInput,
  Site,
  Task,
  TechnicianKpis,
  TechnicianRankingEntry,
  Technician,
  UpdateTaskStatusInput,
  User,
  Vehicle,
  Zone,
} from "@/contracts";
import { TaskStatus } from "@/contracts";
import {
  mockCoordinators,
  mockGuardPerformances,
  mockGuards,
  mockNotifications,
  mockQuotes,
  mockSites,
  mockTechnicianKpis,
  mockTechnicianRanking,
  mockTechnicians,
  mockTasks,
  mockUsers,
  mockVehicles,
  mockZones,
  toDateString,
  MOCK_TODAY,
} from "@/mocks";

const MOCK_LATENCY_MS = 120;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

const COMPLETED_STATUSES = new Set<string>([TaskStatus.APPROVED, TaskStatus.APPROVED_WITH_PENDING]);

// In-memory copies so coordinator actions (assign/schedule/status change) can
// be exercised end-to-end without a backend. State resets on reload/restart.
const tasksStore: Task[] = mockTasks.map((task) => ({ ...task, assignments: [...task.assignments] }));
const guardsStore: Guard[] = mockGuards.map((guard) => ({ ...guard, technicianIds: [...guard.technicianIds] }));

let currentUserId: string | null = null;

function matchesTechnicianOrZone(task: Task, technicianId?: string, zoneId?: string): boolean {
  if (technicianId && !task.assignments.some((a) => a.technicianId === technicianId)) return false;
  if (zoneId && task.zoneId !== zoneId) return false;
  return true;
}

/**
 * In-memory implementation of the shared `Api`. Always available, requires
 * no backend, and is the default when NEXT_PUBLIC_USE_MOCK_API=true.
 * Data comes exclusively from `src/mocks` and must never import Prisma.
 */
export const mockApi: Api = {
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const user = mockUsers.find((u) => u.email.toLowerCase() === credentials.email.toLowerCase());
    if (!user) {
      throw new Error("Invalid credentials");
    }
    currentUserId = user.id;
    return delay({
      user,
      token: `mock-token-${user.id}`,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    });
  },

  async getCurrentUser(): Promise<User | null> {
    return delay(mockUsers.find((u) => u.id === currentUserId) ?? null);
  },

  async getTodayTasks(params: GetTasksParams): Promise<Task[]> {
    const date = params.date ?? toDateString(MOCK_TODAY);
    return delay(
      tasksStore.filter(
        (t) => t.scheduledDate === date && matchesTechnicianOrZone(t, params.technicianId, params.zoneId),
      ),
    );
  },

  async getPendingTasks(params: GetPendingTasksParams): Promise<Task[]> {
    const asOfDate = params.asOfDate ?? toDateString(MOCK_TODAY);
    return delay(
      tasksStore.filter(
        (t) =>
          t.scheduledDate <= asOfDate &&
          !COMPLETED_STATUSES.has(t.status) &&
          matchesTechnicianOrZone(t, params.technicianId, params.zoneId),
      ),
    );
  },

  async getTask(taskId: string): Promise<Task | null> {
    return delay(tasksStore.find((t) => t.id === taskId) ?? null);
  },

  async assignTechniciansToTask(input: AssignTechniciansToTaskInput): Promise<Task> {
    const task = tasksStore.find((t) => t.id === input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    task.assignments = input.assignments;
    return delay(task);
  },

  async scheduleTask(input: ScheduleTaskInput): Promise<Task> {
    const task = tasksStore.find((t) => t.id === input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    task.scheduledDate = input.scheduledDate;
    return delay(task);
  },

  async updateTaskStatus(input: UpdateTaskStatusInput): Promise<Task> {
    const task = tasksStore.find((t) => t.id === input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    task.status = input.status;
    return delay(task);
  },

  async getGuards(params: GetGuardsParams): Promise<Guard[]> {
    return delay(
      guardsStore.filter(
        (g) =>
          (!params.zoneId || g.zoneId === params.zoneId) &&
          (!params.technicianId || g.technicianIds.includes(params.technicianId)),
      ),
    );
  },

  async getGuardPerformance(guardId: string): Promise<GuardPerformance | null> {
    return delay(mockGuardPerformances.find((p) => p.guardId === guardId) ?? null);
  },

  async assignGuard(input: AssignGuardInput): Promise<Guard> {
    const guard = guardsStore.find((g) => g.id === input.guardId);
    if (!guard) throw new Error(`Guard not found: ${input.guardId}`);
    guard.technicianIds = input.technicianIds;
    return delay(guard);
  },

  async getTechnician(technicianId: string): Promise<Technician | null> {
    return delay(mockTechnicians.find((t) => t.id === technicianId) ?? null);
  },

  async getTechnicianKpis(technicianId: string): Promise<TechnicianKpis | null> {
    return delay(mockTechnicianKpis.find((k) => k.technicianId === technicianId) ?? null);
  },

  async getTechnicianRanking(params: { zoneId?: string }): Promise<TechnicianRankingEntry[]> {
    if (!params.zoneId) return delay(mockTechnicianRanking);
    const zoneTechnicianIds = new Set(
      mockTechnicians.filter((t) => t.primaryZoneId === params.zoneId).map((t) => t.id),
    );
    return delay(mockTechnicianRanking.filter((r) => zoneTechnicianIds.has(r.technicianId)));
  },

  async getCoordinatorZones(coordinatorId: string): Promise<Zone[]> {
    const coordinator = mockCoordinators.find((c) => c.id === coordinatorId);
    if (!coordinator) return delay([]);
    return delay(mockZones.filter((z) => coordinator.zoneIds.includes(z.id)));
  },

  async getZoneTechnicians(zoneId: string): Promise<Technician[]> {
    return delay(mockTechnicians.filter((t) => t.primaryZoneId === zoneId || t.onLoanZoneId === zoneId));
  },

  async getZoneSites(zoneId: string): Promise<Site[]> {
    return delay(mockSites.filter((s) => s.zoneId === zoneId));
  },

  async getVehicle(vehicleId: string): Promise<Vehicle | null> {
    return delay(mockVehicles.find((v) => v.id === vehicleId) ?? null);
  },

  async getTechnicianVehicle(technicianId: string): Promise<Vehicle | null> {
    return delay(mockVehicles.find((v) => v.assignedTechnicianId === technicianId) ?? null);
  },

  async getQuotes(params: GetQuotesParams): Promise<Quote[]> {
    const coordinatorZoneIds = params.coordinatorId
      ? new Set(mockCoordinators.find((c) => c.id === params.coordinatorId)?.zoneIds ?? [])
      : null;
    return delay(
      mockQuotes.filter(
        (q) =>
          (!params.zoneId || q.zoneId === params.zoneId) &&
          (!params.status || q.status === params.status) &&
          (!coordinatorZoneIds || coordinatorZoneIds.has(q.zoneId)),
      ),
    );
  },

  async getNotifications(userId: string): Promise<Notification[]> {
    return delay(mockNotifications.filter((n) => n.userId === userId));
  },
};
