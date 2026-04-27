import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const HISTORY_LIMIT = 10;

// Tag formats are duplicated from src/hooks/useRound.ts and src/lib/claude.ts.
// Single source of truth would be nice but the regex is small and migrating
// the parser into a shared module is its own task.
const ROUND_TAG_RX = /<round_result\s+name="([^"]+)"\s+outcome="(advance|drop)"\s*\/>/;
const SYNTHESIS_TAG_RX = /<synthesis_result\s+outcome="(pass|fail)"\s*\/>/;
const ANY_RESULT_TAG_RX = /<(round_result|synthesis_result)[^/]*\/>/g;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conceptId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const { conceptId } = await params;
  const userId = session.user.id;

  const sessions = await prisma.chatSession.findMany({
    where: {
      userId,
      conceptId,
      mode: { in: ["ROUND", "SYNTHESIS"] },
      finishedAt: { not: null },
    },
    orderBy: { startedAt: "desc" },
    take: HISTORY_LIMIT,
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  type SessionRow = (typeof sessions)[number];
  type MessageRow = SessionRow["messages"][number];

  // Parse outcome + facet from the result tag in the last assistant message.
  // The tag is appended at the end of Claude's final reply when a round /
  // synthesis resolves; we strip it from display content but keep it stored
  // for exactly this kind of post-hoc analysis. Sessions without a
  // parseable outcome (abandoned mid-stream, e.g., from a facet switch) are
  // dropped from the list — they have no story to tell.
  const result = sessions
    .map((s: SessionRow) => {
      let outcome: string | null = null;
      let facetName: string | null = null;

      for (let i = s.messages.length - 1; i >= 0; i--) {
        const m = s.messages[i];
        if (m.role !== "assistant") continue;
        if (s.mode === "ROUND") {
          const match = m.content.match(ROUND_TAG_RX);
          if (match) {
            facetName = match[1];
            outcome = match[2];
            break;
          }
        } else if (s.mode === "SYNTHESIS") {
          const match = m.content.match(SYNTHESIS_TAG_RX);
          if (match) {
            outcome = match[1];
            break;
          }
        }
      }

      return {
        id: s.id,
        mode: s.mode,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        outcome,
        facetName,
        messages: s.messages.map((m: MessageRow) => ({
          role: m.role,
          content: m.content.replace(ANY_RESULT_TAG_RX, "").trim(),
          createdAt: m.createdAt,
        })),
      };
    })
    .filter((s) => s.outcome != null);

  return NextResponse.json({ sessions: result });
}
