import { TaskCriticality, TaskType, type Task } from "@/contracts";

export const OperationalPriorityDecision = {
  /** No incoming corrective task to react to. */
  NO_ACTION: "NO_ACTION",
  /** Crew is on a preventive; an urgent corrective must interrupt it now. */
  INTERRUPT_CURRENT_AND_ATTEND_CORRECTIVE: "INTERRUPT_CURRENT_AND_ATTEND_CORRECTIVE",
  /** Crew is on a preventive; a normal corrective can wait until it's done. */
  FINISH_CURRENT_THEN_ATTEND_CORRECTIVE: "FINISH_CURRENT_THEN_ATTEND_CORRECTIVE",
} as const;
export type OperationalPriorityDecision =
  (typeof OperationalPriorityDecision)[keyof typeof OperationalPriorityDecision];

/**
 * Pure decision function for docs/PROJECT_CONTEXT.md's "Correctivos y
 * prioridades" rule. Does not touch Sytex, a repository, or any I/O — it
 * only decides what *should* happen operationally, given what the crew is
 * currently doing and what just came in. Wiring this into an actual
 * interruption workflow (pausing the in-progress preventive, notifying the
 * crew, etc.) is future work and intentionally out of scope here.
 */
export function decideOperationalPriority(
  currentTask: Pick<Task, "type"> | null,
  incomingTask: Pick<Task, "type" | "criticality">,
): OperationalPriorityDecision {
  if (incomingTask.type !== TaskType.CORRECTIVE) {
    return OperationalPriorityDecision.NO_ACTION;
  }
  if (!currentTask || currentTask.type !== TaskType.PREVENTIVE) {
    return OperationalPriorityDecision.NO_ACTION;
  }
  return incomingTask.criticality === TaskCriticality.URGENT
    ? OperationalPriorityDecision.INTERRUPT_CURRENT_AND_ATTEND_CORRECTIVE
    : OperationalPriorityDecision.FINISH_CURRENT_THEN_ATTEND_CORRECTIVE;
}
