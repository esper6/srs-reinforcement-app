import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateCurrentMastery, getReviewThreshold } from "@/lib/mastery";
import MasteryBar from "@/components/MasteryBar";
import SubjectQueueButtons from "@/components/SubjectQueueButtons";
import DecayQueue from "@/components/DecayQueue";
import Link from "next/link";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");

  const { slug } = await params;
  const userId = (session.user as { id: string }).id;

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
              },
            },
          },
        },
      },
    },
  });

  if (!curriculum) notFound();

  // Count unstarted concepts and concepts due for review
  type Section = (typeof curriculum.sections)[number];
  type Concept = Section["concepts"][number];
  const allConcepts = curriculum.sections.flatMap((s: Section) => s.concepts);
  const unstartedCount = allConcepts.filter((c: Concept) => c.masteries.length === 0).length;
  const reviewCount = allConcepts.filter((c: Concept) => {
    const m = c.masteries[0];
    if (!m) return false;
    const current = calculateCurrentMastery(m.score, m.decayRate, m.lastReviewedAt);
    return current < getReviewThreshold(m.score);
  }).length;

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
        reviewCount={reviewCount}
      />

      <DecayQueue
        items={allConcepts
          .filter((c: Concept) => c.masteries.length > 0)
          .map((c: Concept) => ({
            conceptId: c.id,
            title: c.title,
            score: c.masteries[0].score,
            decayRate: c.masteries[0].decayRate,
            lastReviewedAt: c.masteries[0].lastReviewedAt.toISOString(),
          }))}
      />

      <div className="space-y-8">
        {curriculum.sections.map((section: Section) => (
          <div key={section.id}>
            <h2 className="font-[family-name:var(--font-share-tech-mono)] text-lg font-semibold text-[var(--neon-magenta)] mb-3 border-b border-[var(--border-retro)] pb-2 glow-magenta">
              {section.name}
            </h2>
            <div className="space-y-2">
              {section.concepts.map((concept: Concept) => {
                const mastery = concept.masteries[0];
                const currentScore = mastery
                  ? calculateCurrentMastery(
                      mastery.score,
                      mastery.decayRate,
                      mastery.lastReviewedAt
                    )
                  : null;

                return (
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
                    <div className="w-24 shrink-0">
                      <MasteryBar score={currentScore} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
