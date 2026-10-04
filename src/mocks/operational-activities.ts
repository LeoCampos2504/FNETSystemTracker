import type { Task } from "@/contracts";
import { ExternalSource } from "@/contracts";
import { mockTasks } from "./tasks";

export interface MockSytexActivity {
  id: string;
  taskId: string;
  taskCode: string;
  siteCode: string;
  zoneId: string;
  activityAt: string;
  technicianId: string | null;
  source: typeof ExternalSource.SYTEX;
}

function fromTask(id: string, taskId: string, activityAt: string, technicianId: string | null): MockSytexActivity {
  const task = mockTasks.find((item) => item.id === taskId) as Task | undefined;
  if (!task) throw new Error(`Missing mock task ${taskId}`);
  return { id, taskId, taskCode: task.taskCode, siteCode: task.siteCode, zoneId: task.zoneId, activityAt, technicianId, source: ExternalSource.SYTEX };
}

/** Sytex-owned demo activity events; they are not BizFlow-generated forms. */
export const mockSytexActivities: MockSytexActivity[] = [
  fromTask("activity-guarded", "task-C0001", "2026-08-18T19:31:00", "tech-01"),
  fromTask("activity-not-guarded", "task-C0002", "2026-09-01T19:12:00", "tech-06"),
  fromTask("activity-unassigned", "task-C0004", "2026-08-18T20:10:00", null),
];
