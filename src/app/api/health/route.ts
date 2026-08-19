import { NextResponse } from "next/server";

export function getHealthStatus() {
  return { status: "ok", service: "fnet-system-tracker" } as const;
}

export async function GET() {
  return NextResponse.json(getHealthStatus());
}
