import { NextResponse } from "next/server";

function getHealthStatus() {
  return { status: "ok", service: "fnet-system-tracker" } as const;
}

export async function GET() {
  return NextResponse.json(getHealthStatus());
}
