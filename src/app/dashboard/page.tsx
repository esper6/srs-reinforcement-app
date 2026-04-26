import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SubjectCard from "@/components/SubjectCard";
import Link from "next/link";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending-approval");

  const userId = session.user.id;
  const { archived: showArchivedParam } = await searchParams;
  const showArchived = showArchivedParam === "1";

  const curricula = await prisma.curriculum.findMany({
    orderBy: { order: "asc" },
    include: {
      userPrefs: { where: { userId } },
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

  const all = curricula.map((c: Curriculum) => {
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
      archived: c.userPrefs[0]?.archivedAt != null,
    };
  });

  const subjects = all.filter((s) => (showArchived ? s.archived : !s.archived));
  const archivedCount = all.filter((s) => s.archived).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full">
      <div className="flex items-baseline justify-between mb-6 gap-4">
        <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] glow-cyan tracking-wide">
          {showArchived ? "Archived Subjects" : "Your Subjects"}
        </h1>
        {(archivedCount > 0 || showArchived) && (
          <Link
            href={showArchived ? "/dashboard" : "/dashboard?archived=1"}
            className="text-xs text-[var(--foreground)] opacity-40 hover:opacity-100 hover:text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] transition-colors tracking-wide"
          >
            {showArchived ? "← Active" : `Archived (${archivedCount})`}
          </Link>
        )}
      </div>
      {subjects.length === 0 ? (
        <p className="text-[var(--foreground)] opacity-50 text-sm">
          {showArchived ? "Nothing archived." : "No subjects yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((s) => (
            <div key={s.slug} className={s.archived ? "opacity-60" : ""}>
              <SubjectCard {...s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
