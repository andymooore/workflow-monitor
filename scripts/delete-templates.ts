import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const d = await prisma.workflowTemplate.deleteMany({ where: { isPublished: true } });
  console.log(`Deleted ${d.count} published templates`);
  await prisma.$disconnect();
}
main().catch(console.error);
