import { mockTasks } from "@/mocks";
import type { Task } from "@/contracts";
import { TaskStatus } from "@/contracts";
import type { TaskListFilter, TaskRepository } from "@/server/ports";

const COMPLETED_STATUSES = new Set<string>([TaskStatus.APPROVED, TaskStatus.APPROVED_WITH_PENDING]);

const tasksStore: Task[] = mockTasks.map((task) => ({ ...task, assignments: [...task.assignments] }));

function matchesFilter(task: Task, filter: TaskListFilter): boolean {
  if (filter.technicianId && !task.assignments.some((a) => a.technicianId === filter.technicianId)) return false;
  if (filter.zoneId && task.zoneId !== filter.zoneId) return false;
  return true;
}

export const taskMemoryRepository: TaskRepository = {
  async findById(id) {
    return tasksStore.find((t) => t.id === id) ?? null;
  },
  async listByDate(date, filter = {}) {
    return tasksStore.filter((t) => t.scheduledDate === date && matchesFilter(t, filter));
  },
  async listPending(asOfDate, filter = {}) {
    return tasksStore.filter(
      (t) => t.scheduledDate <= asOfDate && !COMPLETED_STATUSES.has(t.status) && matchesFilter(t, filter),
    );
  },
  async updateAssignments(taskId, assignments) {
    const task = tasksStore.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.assignments = assignments;
    return task;
  },
  async updateSchedule(taskId, scheduledDate) {
    const task = tasksStore.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.scheduledDate = scheduledDate;
    return task;
  },
  async updateStatus(taskId, status) {
    const task = tasksStore.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.status = status;
    return task;
  },
};
