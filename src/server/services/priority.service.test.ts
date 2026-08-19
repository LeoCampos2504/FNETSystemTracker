import { describe, expect, it } from "vitest";
import { TaskCriticality, TaskType } from "@/contracts";
import { OperationalPriorityDecision, decideOperationalPriority } from "./priority.service";

describe("decideOperationalPriority", () => {
  it("interrupts the current preventive when an urgent corrective comes in", () => {
    const result = decideOperationalPriority(
      { type: TaskType.PREVENTIVE },
      { type: TaskType.CORRECTIVE, criticality: TaskCriticality.URGENT },
    );
    expect(result).toBe(OperationalPriorityDecision.INTERRUPT_CURRENT_AND_ATTEND_CORRECTIVE);
  });

  it("lets the crew finish the current preventive when a normal corrective comes in", () => {
    const result = decideOperationalPriority(
      { type: TaskType.PREVENTIVE },
      { type: TaskType.CORRECTIVE, criticality: TaskCriticality.NORMAL },
    );
    expect(result).toBe(OperationalPriorityDecision.FINISH_CURRENT_THEN_ATTEND_CORRECTIVE);
  });

  it("takes no special action when the crew isn't on a preventive", () => {
    const result = decideOperationalPriority(
      { type: TaskType.CORRECTIVE },
      { type: TaskType.CORRECTIVE, criticality: TaskCriticality.URGENT },
    );
    expect(result).toBe(OperationalPriorityDecision.NO_ACTION);
  });

  it("takes no special action when the crew is idle (no current task)", () => {
    const result = decideOperationalPriority(null, {
      type: TaskType.CORRECTIVE,
      criticality: TaskCriticality.URGENT,
    });
    expect(result).toBe(OperationalPriorityDecision.NO_ACTION);
  });

  it("takes no special action when the incoming task is itself a preventive", () => {
    const result = decideOperationalPriority(
      { type: TaskType.PREVENTIVE },
      { type: TaskType.PREVENTIVE, criticality: TaskCriticality.NORMAL },
    );
    expect(result).toBe(OperationalPriorityDecision.NO_ACTION);
  });
});
