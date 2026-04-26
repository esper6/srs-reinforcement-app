import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FacetLevel } from "@prisma/client";
import { isSynthesisReady } from "@/lib/levels";
import { NextRequest, NextResponse } from "next/server";

// Feed for the rounds-redesign decay queue UI.
// Returns every concept in the curriculum with the user's facet states +
// computed roundsDue and synthesis eligibility. The UI uses this to render
// the per-concept pip chart and chain rounds via "Burn through queue".

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const userId = session.user.id;
  const slug = req.nextUrl.searchParams.get("subject");
  if (!slug) {
    return NextResponse.json({ error: "Missing 'subject' query param" }, { status: 400 });
  }

  const curriculum = await prisma.curriculum.findUnique({
    where: { slug },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          concepts: {
            orderBy: { order: "asc" },
            include: {
              masteries: {
                where: { userId },
                include: { subMasteries: true },
              },
            },
          },
        },
      },
    },
  });

  if (!curriculum) {
    return NextResponse.json({ error: "Curriculum not found" }, { status: 404 });
  }

  const now = new Date();
  let totalRoundsDue = 0;

  type Section = (typeof curriculum.sections)[number];
  type ConceptRow = Section["concepts"][number];
  type MasteryRow = ConceptRow["masteries"][number];
  type SubRow = MasteryRow["subMasteries"][number];

  const concepts = curriculum.sections.flatMap((sec: Section) =>
    sec.concepts.map((concept: ConceptRow) => {
      const mastery: MasteryRow | undefined = concept.masteries[0];
      const subByName = new Map<string, SubRow>(
        mastery?.subMasteries.map((s: SubRow) => [s.name, s]) ?? []
      );

      const facets = concept.facets.map((name: string) => {
        const sub = subByName.get(name);
        const level: FacetLevel = sub?.level ?? FacetLevel.NOVICE;
        const expertStage = sub?.expertStage ?? 0;
        // No SubConceptMastery yet → never reviewed → always due
        const nextDueAt = sub?.nextDueAt ?? new Date(0);
        const due = nextDueAt <= now;
        return { name, level, expertStage, nextDueAt, due };
      });

      const isMastered = mastery?.mastered ?? false;
      const cooldownActive =
        mastery?.synthesisCooldownUntil != null &&
        mastery.synthesisCooldownUntil > now;
      const allFacetsAtExpert3 =
        facets.length > 0 &&
        facets.every((f) =>
          isSynthesisReady({ level: f.level, expertStage: f.expertStage })
        );
      const synthesisReady = allFacetsAtExpert3 && !cooldownActive && !isMastered;

      // Mastered concepts contribute 0 rounds. Empty-facets concepts also
      // contribute 0 (they need re-import — UI can show that state).
      const roundsDue = isMastered ? 0 : facets.filter((f) => f.due).length;
      totalRoundsDue += roundsDue;

      // True iff the user has at least one SubConceptMastery row for this
      // concept — i.e., they've completed ≥1 round here. Burn-mode uses this
      // to skip lesson-gate concepts (those need explicit /learn entry first).
      const started = (mastery?.subMasteries.length ?? 0) > 0;

      return {
        id: concept.id,
        title: concept.title,
        description: concept.description,
        sectionName: sec.name,
        mastered: isMastered,
        masteredAt: mastery?.masteredAt ?? null,
        synthesisReady,
        synthesisCooldownUntil: mastery?.synthesisCooldownUntil ?? null,
        started,
        facets,
        roundsDue,
      };
    })
  );

  return NextResponse.json({
    curriculum: { name: curriculum.name, slug: curriculum.slug },
    concepts,
    totalRoundsDue,
  });
}
