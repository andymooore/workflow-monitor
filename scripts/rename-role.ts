import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({
    connectionString:
      "postgresql://appuser:apppass123@localhost:5432/workflow_monitor?schema=public",
  });
  const prisma = new PrismaClient({ adapter });

  const role = await prisma.role.findFirst({ where: { name: "employee" } });
  if (!role) {
    console.log("employee role not found");
    process.exit(1);
  }

  const updated = await prisma.role.update({
    where: { id: role.id },
    data: {
      name: "web-developer",
      description: "Web Developer - builds and maintains websites",
    },
  });
  console.log("Renamed:", updated.name, updated.id);
  await prisma.$disconnect();
}

main().catch(console.error);
