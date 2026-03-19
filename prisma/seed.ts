import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
const prisma = new PrismaClient({ adapter });

interface PromptData {
  Description: string;
  ExpectedOutput: string;
  InitialCode: string;
  DifficultyLevel: number;
}

interface ConceptData {
  Title: string;
  Description: string;
  LessonMarkdown: string;
  Order: number;
  Prompts: PromptData[];
}

interface SectionData {
  Name: string;
  Concepts: ConceptData[];
}

interface CurriculumData {
  Name: string;
  Slug: string;
  Description: string;
  Language: string;
  IconClass: string;
  Order: number;
  Sections: SectionData[];
}

async function main() {
  const dataPath = path.join(__dirname, "..", "curricula-export.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: CurriculumData[] = JSON.parse(raw);

  // Filter out C# / .NET curriculum
  const curricula = data.filter((c) => c.Slug !== "csharp");

  console.log(`Seeding ${curricula.length} curricula...`);

  for (const cur of curricula) {
    const curriculum = await prisma.curriculum.upsert({
      where: { slug: cur.Slug },
      update: {
        name: cur.Name,
        description: cur.Description,
        language: cur.Language ?? "",
        iconClass: cur.IconClass ?? "",
        order: cur.Order,
      },
      create: {
        name: cur.Name,
        slug: cur.Slug,
        description: cur.Description,
        language: cur.Language ?? "",
        iconClass: cur.IconClass ?? "",
        order: cur.Order,
      },
    });

    // Delete existing sections for this curriculum (for re-runnability)
    await prisma.section.deleteMany({
      where: { curriculumId: curriculum.id },
    });

    for (const [sIdx, sec] of cur.Sections.entries()) {
      const section = await prisma.section.create({
        data: {
          name: sec.Name,
          order: sIdx,
          curriculumId: curriculum.id,
        },
      });

      for (const concept of sec.Concepts) {
        await prisma.concept.create({
          data: {
            title: concept.Title,
            description: concept.Description,
            lessonMarkdown: concept.LessonMarkdown,
            order: concept.Order,
            sectionId: section.id,
          },
        });
      }

      console.log(
        `  ${cur.Name} > ${sec.Name}: ${sec.Concepts.length} concepts`
      );
    }
  }

  console.log("Seeding complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
