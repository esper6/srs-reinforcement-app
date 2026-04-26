import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Unauthenticated liveness + DB connectivity probe.
// The deploy script polls this after `systemctl restart` to confirm the new
// code actually came up and can talk to Postgres before declaring the deploy
// successful. Without this check, a service that crashes on startup would go
// undetected — systemctl restart returns 0 the moment the unit is requested,
// not when the process is genuinely serving traffic.

// Force dynamic so the result reflects the live process every request — no
// cache, no static optimization. Health checks must hit the actual code path.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
