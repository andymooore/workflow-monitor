import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

async function main() {
  const adapter = new PrismaPg({
    connectionString:
      "postgresql://appuser:apppass123@localhost:5432/workflow_monitor?schema=public",
  });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await hash("password123", 12);

  const secOfficer = await prisma.role.findFirst({
    where: { name: "security-officer" },
  });
  const dpo = await prisma.role.findFirst({ where: { name: "dpo" } });
  const director = await prisma.role.findFirst({
    where: { name: "director" },
  });

  if (!secOfficer || !dpo || !director) {
    console.error("Missing roles:", { secOfficer, dpo, director });
    process.exit(1);
  }

  console.log("Roles found:", secOfficer.name, dpo.name, director.name);

  const users = [
    { email: "eve@jis.gov.jm", name: "Eve Martinez", roleId: secOfficer.id },
    { email: "frank@jis.gov.jm", name: "Frank Thompson", roleId: dpo.id },
    { email: "grace@jis.gov.jm", name: "Grace Chen", roleId: director.id },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        status: "ACTIVE",
        roles: { create: { roleId: u.roleId } },
      },
    });
    console.log("Created:", user.name, user.id);
  }

  await prisma.$disconnect();
  console.log("Done!");
}

main().catch(console.error);
