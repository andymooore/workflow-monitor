
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: "postgresql://appuser:apppass123@localhost:5432/workflow_monitor?schema=public" });
const prisma = new PrismaClient({ adapter });
async function main() {
  const u = await prisma.user.findUnique({ where: { email: "alice@jis.gov.jm" }, include: { roles: { include: { role: true } } } });
  console.log(u?.name, "-", u?.roles?.map(r => r.role.name).join(", "));
  await prisma.$disconnect();
}
main();

