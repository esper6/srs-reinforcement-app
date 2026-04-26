import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SubjectCard from "@/components/SubjectCard";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending-approval");

  const userId = session.user.id;

  const curricula = await prisma.curriculum.findMany({
    orderBy: { order: "asc" },
    include: {
      sections: {
        include: {
          concepts: {
            include: {
              masteries: { where: { userId }, select: { mastered: true } },
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
    const masteredCount = concepts.filter(
      (concept: Concept) => concept.masteries[0]?.mastered === true
    ).length;
    return {
      name: c.name,
      slug: c.slug,
      description: c.description,
      conceptCount: concepts.length,
      masteredCount,
    };
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full">
      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] mb-6 glow-cyan tracking-wide">
        Your Subjects
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s) => (
          <SubjectCard key={s.slug} {...s} />
        ))}
      </div>
    </div>
  );
}
