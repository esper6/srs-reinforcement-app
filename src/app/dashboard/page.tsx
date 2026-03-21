import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateCurrentMastery } from "@/lib/mastery";
import SubjectCard from "@/components/SubjectCard";
import ReviewQueueBanner from "@/components/ReviewQueueBanner";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");

  const userId = (session.user as { id: string }).id;

  const curricula = await prisma.curriculum.findMany({
    orderBy: { order: "asc" },
    include: {
      sections: {
        include: {
          concepts: {
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

  type Curriculum = (typeof curricula)[number];
  type Section = Curriculum["sections"][number];
  type Concept = Section["concepts"][number];
  const subjects = curricula.map((c: Curriculum) => {
    const concepts = c.sections.flatMap((s: Section) => s.concepts);
    const masteries = concepts
      .map((concept: Concept) => concept.masteries[0])
      .filter(Boolean);

    let averageMastery: number | null = null;
    if (masteries.length > 0) {
      const total = masteries.reduce(
        (sum: number, m: { score: number; decayRate: number; lastReviewedAt: Date }) =>
          sum + calculateCurrentMastery(m.score, m.decayRate, m.lastReviewedAt),
        0
      );
      averageMastery = total / concepts.length;
    }

    return {
      name: c.name,
      slug: c.slug,
      description: c.description,
      conceptCount: concepts.length,
      averageMastery,
    };
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full">
      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] mb-6 glow-cyan tracking-wide">
        Your Subjects
      </h1>
      <ReviewQueueBanner />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s) => (
          <SubjectCard key={s.slug} {...s} />
        ))}
      </div>
    </div>
  );
}
