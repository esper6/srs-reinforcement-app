import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions, ADMIN_EMAIL } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FacetLevel } from "@prisma/client";
import { isSynthesisReady } from "@/lib/levels";
import SubjectQueueButtons from "@/components/SubjectQueueButtons";
import RoundQueue from "@/components/RoundQueue";
import BurnedShelf from "@/components/BurnedShelf";
import DeleteSubjectButton from "@/components/DeleteSubjectButton";
import ArchiveSubjectButton from "@/components/ArchiveSubjectButton";
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
      userPrefs: { where: { userId } },
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
      masteredAt: mastery?.masteredAt ?? null,
      synthesisReady,
    };
  });

  const totalRoundsDue = roundQueueConcepts.reduce((sum, c) => sum + c.roundsDue, 0);
  const burnedConcepts = roundQueueConcepts
    .filter((c) => c.mastered)
    .map((c) => ({ id: c.id, title: c.title, masteredAt: c.masteredAt }));

  // Per-user archive flag (independent of admin / shared curriculum row).
  const userArchived = curriculum.userPrefs[0]?.archivedAt != null;

  // Counts shown in the delete-subject confirmation modal (admin only).
  // Cross-user: total mastery records and total vocab words tied to this curriculum.
  const isAdmin = session.user.email === ADMIN_EMAIL;
  const conceptCount = allConcepts.length;
  const [masteryCount, vocabCount] = isAdmin
    ? await Promise.all([
        prisma.conceptMastery.count({
          where: { concept: { section: { curriculumId: curriculum.id } } },
        }),
        prisma.vocabWord.count({
          where: { concept: { section: { curriculumId: curriculum.id } } },
        }),
      ])
    : [0, 0];

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

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] glow-cyan tracking-wide">
          {curriculum.name}
          {userArchived && (
            <span className="ml-3 align-middle text-xs text-[var(--foreground)]/50 border border-[var(--border-retro)] rounded px-2 py-0.5 tracking-wide">
              archived
            </span>
          )}
        </h1>
        <div className="flex items-center gap-4 pt-1">
          <ArchiveSubjectButton slug={slug} archived={userArchived} />
          {isAdmin && (
            <DeleteSubjectButton
              slug={slug}
              name={curriculum.name}
              conceptCount={conceptCount}
              masteryCount={masteryCount}
              vocabCount={vocabCount}
            />
          )}
        </div>
      </div>
      <p className="text-[var(--foreground)] opacity-50 text-sm mb-4">{curriculum.description}</p>

      <SubjectQueueButtons
        slug={slug}
        vocabNewCount={vocabNewCount}
        vocabDueCount={vocabDueCount}
      />

      <RoundQueue
        concepts={roundQueueConcepts}
        totalRoundsDue={totalRoundsDue}
        slug={slug}
      />

      <BurnedShelf concepts={burnedConcepts} />
    </div>
  );
}
