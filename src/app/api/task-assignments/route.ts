import { NextResponse } from "next/server";
import { z } from "zod";
import type { InternalTaskType } from "@/contracts";
import { getTaskAssignment, internalTechnicianOptions, saveTaskAssignment } from "@/server/services/task-assignments";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

const taskTypeSchema = z.enum(["CORRECTIVO", "PREVENTIVO"]);
const assignmentSchema = z.object({
  taskType: taskTypeSchema,
  taskCode: z.string().trim().min(1),
  technicianPrimary: z.string().trim().min(1),
  technicianCollaborator: z.string().trim().min(1),
  actor: z.enum(["DEMO_COORDINATOR", "DEMO_ADMIN"]),
});

function productionBlocked(): NextResponse | null {
  return process.env.NODE_ENV === "production" ? new NextResponse(null, { status: 404 }) : null;
}

function errorResponse(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "ASSIGNMENT_ERROR";
  if (code === "TASK_NOT_FOUND") return NextResponse.json({ code }, { status: 404 });
  if (["DUPLICATE_TECHNICIANS", "UNKNOWN_TECHNICIAN", "INVALID_TASK_TYPE", "INVALID_TASK_CODE"].includes(code)) return NextResponse.json({ code }, { status: 400 });
  if (code === "UNAUTHORIZED_ASSIGNMENT_ACTOR") return NextResponse.json({ code }, { status: 403 });
  if (code === "ASSIGNMENTS_TABLE_NOT_READY") return NextResponse.json({ code, message: "Ejecutá el SQL de la migración FNET antes de guardar asignaciones." }, { status: 503 });
  return NextResponse.json({ code: "ASSIGNMENT_ERROR" }, { status: 500 });
}

export async function GET(request: Request) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  const blocked = productionBlocked();
  if (blocked) return blocked;
  const url = new URL(request.url);
  const taskType = taskTypeSchema.safeParse(url.searchParams.get("taskType") ?? "CORRECTIVO");
  const taskCode = url.searchParams.get("taskCode")?.trim() ?? "";
  if (!taskType.success) return NextResponse.json({ code: "INVALID_TASK_TYPE" }, { status: 400 });
  try {
    const assignment = taskCode ? await getTaskAssignment(taskType.data as InternalTaskType, taskCode) : null;
    return NextResponse.json({ source: "fnet", assignment, technicians: internalTechnicianOptions, authorization: "DEMO_ONLY" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "ASSIGNMENT_ERROR" }, { status: 500 });
  }
}

async function save(request: Request) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  const blocked = productionBlocked();
  if (blocked) return blocked;
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_ASSIGNMENT", details: parsed.error.flatten() }, { status: 400 });
  try {
    const assignment = await saveTaskAssignment(parsed.data);
    return NextResponse.json({ source: "fnet", assignment, technicians: internalTechnicianOptions, authorization: "DEMO_ONLY" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) { return save(request); }
export async function PUT(request: Request) { return save(request); }
