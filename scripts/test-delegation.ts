import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.delegation.findMany({
      where: { isActive: true },
      include: { delegate: { select: { id: true, name: true, email: true } } },
      take: 5,
    });
    console.log("OK - count:", result.length);
  } catch (e: any) {
    console.error("ERROR:", e.message);
  }

  await prisma.$disconnect();
}

main();
