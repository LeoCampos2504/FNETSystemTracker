import type { Task, TaskAssignment, TaskStatus } from "@/contracts";

export interface TaskListFilter {
  technicianId?: string;
  zoneId?: string;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  listByDate(date: string, filter?: TaskListFilter): Promise<Task[]>;
  listPending(asOfDate: string, filter?: TaskListFilter): Promise<Task[]>;
  updateAssignments(taskId: string, assignments: TaskAssignment[]): Promise<Task>;
  updateSchedule(taskId: string, scheduledDate: string): Promise<Task>;
  updateStatus(taskId: string, status: TaskStatus): Promise<Task>;
}
