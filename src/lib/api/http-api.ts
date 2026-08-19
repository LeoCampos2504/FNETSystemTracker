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

/**
 * Real HTTP implementation of the shared `Api`. Endpoints and payloads are
 * documented in docs/API_CONTRACTS.md and owned by Leo (`src/app/api/**`,
 * except `/api/kpis/**` which Gino owns). Until those routes exist, calls
 * here will fail — that is expected during foundation setup.
 */

/** Params objects here are always flat { [key]: string | undefined } shapes. */
function toQueryString(params: object): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const search = new URLSearchParams(entries);
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export const httpApi: Api = {
  login(credentials: LoginCredentials): Promise<AuthSession> {
    return request("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) });
  },

  getCurrentUser(): Promise<User | null> {
    return request("/api/auth/me");
  },

  getTodayTasks(params: GetTasksParams): Promise<Task[]> {
    return request(`/api/tasks/today${toQueryString(params)}`);
  },

  getPendingTasks(params: GetPendingTasksParams): Promise<Task[]> {
    return request(`/api/tasks/pending${toQueryString(params)}`);
  },

  getTask(taskId: string): Promise<Task | null> {
    return request(`/api/tasks/${taskId}`);
  },

  assignTechniciansToTask(input: AssignTechniciansToTaskInput): Promise<Task> {
    return request(`/api/tasks/${input.taskId}/assignments`, { method: "PUT", body: JSON.stringify(input) });
  },

  scheduleTask(input: ScheduleTaskInput): Promise<Task> {
    return request(`/api/tasks/${input.taskId}/schedule`, { method: "PUT", body: JSON.stringify(input) });
  },

  updateTaskStatus(input: UpdateTaskStatusInput): Promise<Task> {
    return request(`/api/tasks/${input.taskId}/status`, { method: "PUT", body: JSON.stringify(input) });
  },

  getGuards(params: GetGuardsParams): Promise<Guard[]> {
    return request(`/api/guards${toQueryString(params)}`);
  },

  getGuardPerformance(guardId: string): Promise<GuardPerformance | null> {
    return request(`/api/guards/${guardId}/performance`);
  },

  assignGuard(input: AssignGuardInput): Promise<Guard> {
    return request(`/api/guards/${input.guardId}/assignments`, { method: "PUT", body: JSON.stringify(input) });
  },

  getTechnician(technicianId: string): Promise<Technician | null> {
    return request(`/api/technicians/${technicianId}`);
  },

  getTechnicianKpis(technicianId: string): Promise<TechnicianKpis | null> {
    return request(`/api/kpis/technicians/${technicianId}`);
  },

  getTechnicianRanking(params: { zoneId?: string }): Promise<TechnicianRankingEntry[]> {
    return request(`/api/kpis/ranking${toQueryString(params)}`);
  },

  getCoordinatorZones(coordinatorId: string): Promise<Zone[]> {
    return request(`/api/coordinators/${coordinatorId}/zones`);
  },

  getZoneTechnicians(zoneId: string): Promise<Technician[]> {
    return request(`/api/zones/${zoneId}/technicians`);
  },

  getZoneSites(zoneId: string): Promise<Site[]> {
    return request(`/api/zones/${zoneId}/sites`);
  },

  getVehicle(vehicleId: string): Promise<Vehicle | null> {
    return request(`/api/vehicles/${vehicleId}`);
  },

  getTechnicianVehicle(technicianId: string): Promise<Vehicle | null> {
    return request(`/api/technicians/${technicianId}/vehicle`);
  },

  getQuotes(params: GetQuotesParams): Promise<Quote[]> {
    return request(`/api/quotes${toQueryString(params)}`);
  },

  getNotifications(userId: string): Promise<Notification[]> {
    return request(`/api/notifications${toQueryString({ userId })}`);
  },
};
