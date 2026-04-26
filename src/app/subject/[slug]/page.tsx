import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FacetLevel } from "@prisma/client";
import { isSynthesisReady } from "@/lib/levels";
import SubjectQueueButtons from "@/components/SubjectQueueButtons";
import RoundQueue from "@/components/RoundQueue";
import Link from "next/link";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending-approval");

  const { slug } = await params;
  const userId = session.user.id;

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
              vocabWords: {
                include: { progress: { where: { userId } } },
              },
            },
          },
        },
      },
    },
  });

  if (!curriculum) notFound();

  type Section = (typeof curriculum.sections)[number];
  type Concept = Section["concepts"][number];
  type Mastery = Concept["masteries"][number];
  type Sub = Mastery["subMasteries"][number];

  const allConcepts = curriculum.sections.flatMap((s: Section) => s.concepts);
  const now = new Date();

  // Build round-queue data: per-concept facet state + roundsDue + synthesis flag.
  // Mirrors /api/round-queue but inline since this is already a server component.
  const roundQueueConcepts = allConcepts.map((concept: Concept) => {
    const mastery: Mastery | undefined = concept.masteries[0];
    const subByName = new Map<string, Sub>(
      mastery?.subMasteries.map((s: Sub) => [s.name, s]) ?? []
    );

    const facets = concept.facets.map((name: string) => {
      const sub = subByName.get(name);
      const level: FacetLevel = sub?.level ?? FacetLevel.NOVICE;
      const expertStage = sub?.expertStage ?? 0;
      const nextDueAt = sub?.nextDueAt ?? new Date(0);
      const due = nextDueAt <= now;
      return { name, level, expertStage, due };
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
    const roundsDue = isMastered ? 0 : facets.filter((f) => f.due).length;

    return {
      id: concept.id,
      title: concept.title,
      facets,
      roundsDue,
      mastered: isMastered,
      synthesisReady,
    };
  });

  const totalRoundsDue = roundQueueConcepts.reduce((sum, c) => sum + c.roundsDue, 0);
  const unstartedCount = allConcepts.filter((c: Concept) => c.masteries.length === 0).length;

  // Vocab counts (untouched by the rounds redesign)
  type VocabWord = Concept["vocabWords"][number];
  type VocabProgress = VocabWord["progress"][number];
  let vocabNewCount = 0;
  let vocabDueCount = 0;
  for (const c of allConcepts) {
    for (const v of c.vocabWords) {
      const p: VocabProgress | undefined = v.progress[0];
      if (!p) {
        vocabNewCount++;
        continue;
      }
      if (p.dismissed) continue;
      if (new Date(p.nextReviewAt) <= now) vocabDueCount++;
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <Link
        href="/dashboard"
        className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-cyan)] text-sm mb-4 inline-block font-[family-name:var(--font-share-tech-mono)] transition-colors"
      >
        &larr; Back to subjects
      </Link>

      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] mb-2 glow-cyan tracking-wide">
        {curriculum.name}
      </h1>
      <p className="text-[var(--foreground)] opacity-50 text-sm mb-4">{curriculum.description}</p>

      <SubjectQueueButtons
        slug={slug}
        unstartedCount={unstartedCount}
        reviewCount={totalRoundsDue}
        vocabNewCount={vocabNewCount}
        vocabDueCount={vocabDueCount}
      />

      <RoundQueue concepts={roundQueueConcepts} totalRoundsDue={totalRoundsDue} />

      <div className="space-y-8">
        {curriculum.sections.map((section: Section) => (
          <div key={section.id}>
            <h2 className="font-[family-name:var(--font-share-tech-mono)] text-lg font-semibold text-[var(--neon-magenta)] mb-3 border-b border-[var(--border-retro)] pb-2 glow-magenta">
              {section.name}
            </h2>
            <div className="space-y-2">
              {section.concepts.map((concept: Concept) => (
                <Link
                  key={concept.id}
                  href={`/learn/${concept.id}`}
                  className="flex items-center gap-4 bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg px-4 py-3 hover:border-[var(--neon-cyan)]/30 hover:box-glow-cyan transition-all duration-300"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--foreground)] text-sm font-medium truncate">
                      {concept.title}
                    </p>
                    <p className="text-[var(--foreground)] opacity-30 text-xs truncate">
                      {concept.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
