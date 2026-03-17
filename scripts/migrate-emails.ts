import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Update all user emails from @example.com to @jis.gov.jm
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@example.com" } },
  });

  const newPasswordHash = await hash("WorkFlow@2026!", 12);

  for (const user of users) {
    const newEmail = user.email.replace("@example.com", "@jis.gov.jm");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        passwordHash: newPasswordHash,
      },
    });
    console.log(`Updated: ${user.email} → ${newEmail}`);
  }

  console.log(`\nMigrated ${users.length} users to @jis.gov.jm with password: WorkFlow@2026!`);
  await prisma.$disconnect();
}

main().catch(console.error);
