import type { AuthSession, LoginCredentials, User } from "./user";
import type { Task, TaskAssignment } from "./task";
import type { TaskStatus } from "./enums";
import type { Guard, GuardPerformance } from "./guard";
import type { Technician } from "./technician";
import type { TechnicianKpis, TechnicianRankingEntry } from "./kpi";
import type { Zone } from "./zone";
import type { Site } from "./site";
import type { Vehicle } from "./vehicle";
import type { Quote } from "./quote";
import type { Notification } from "./notification";
import type { QuoteStatus } from "./enums";

export interface GetTasksParams {
  technicianId?: string;
  zoneId?: string;
  /** Defaults to today when omitted. */
  date?: string;
}

export interface GetPendingTasksParams {
  technicianId?: string;
  zoneId?: string;
  /** Tasks with scheduledDate <= asOfDate and not completed/approved. Defaults to today. */
  asOfDate?: string;
}

export interface GetGuardsParams {
  zoneId?: string;
  technicianId?: string;
}

export interface GetQuotesParams {
  zoneId?: string;
  coordinatorId?: string;
  status?: QuoteStatus;
}

export interface AssignTechniciansToTaskInput {
  taskId: string;
  assignments: TaskAssignment[];
}

export interface ScheduleTaskInput {
  taskId: string;
  scheduledDate: string;
}

export interface UpdateTaskStatusInput {
  taskId: string;
  status: TaskStatus;
}

export interface AssignGuardInput {
  guardId: string;
  technicianIds: string[];
}

/**
 * The single interface the frontend is allowed to depend on. Implemented by
 * `mock-api.ts` (always available, no backend required) and `http-api.ts`
 * (calls the real API routes). Selected via NEXT_PUBLIC_USE_MOCK_API.
 *
 * Frontend code must import the `api` singleton from `src/lib/api`, never
 * either implementation directly, and must never import Prisma or server code.
 */
export interface Api {
  login(credentials: LoginCredentials): Promise<AuthSession>;
  getCurrentUser(): Promise<User | null>;

  getTodayTasks(params: GetTasksParams): Promise<Task[]>;
  getPendingTasks(params: GetPendingTasksParams): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  assignTechniciansToTask(input: AssignTechniciansToTaskInput): Promise<Task>;
  scheduleTask(input: ScheduleTaskInput): Promise<Task>;
  updateTaskStatus(input: UpdateTaskStatusInput): Promise<Task>;

  getGuards(params: GetGuardsParams): Promise<Guard[]>;
  getGuardPerformance(guardId: string): Promise<GuardPerformance | null>;
  assignGuard(input: AssignGuardInput): Promise<Guard>;

  getTechnician(technicianId: string): Promise<Technician | null>;
  getTechnicianKpis(technicianId: string): Promise<TechnicianKpis | null>;
  getTechnicianRanking(params: { zoneId?: string }): Promise<TechnicianRankingEntry[]>;

  getCoordinatorZones(coordinatorId: string): Promise<Zone[]>;
  getZoneTechnicians(zoneId: string): Promise<Technician[]>;
  getZoneSites(zoneId: string): Promise<Site[]>;

  getVehicle(vehicleId: string): Promise<Vehicle | null>;
  getTechnicianVehicle(technicianId: string): Promise<Vehicle | null>;

  getQuotes(params: GetQuotesParams): Promise<Quote[]>;

  getNotifications(userId: string): Promise<Notification[]>;
}
