import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create roles
  const managerRole = await prisma.role.upsert({
    where: { name: "manager" },
    update: {},
    create: { name: "manager", description: "Department manager - approves requests" },
  });

  const webmasterRole = await prisma.role.upsert({
    where: { name: "webmaster" },
    update: {},
    create: { name: "webmaster", description: "Web team - manages website infrastructure" },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: { name: "admin", description: "System administrator" },
  });

  const webDeveloperRole = await prisma.role.upsert({
    where: { name: "web-developer" },
    update: {},
    create: { name: "web-developer", description: "Web Developer - builds and maintains websites" },
  });

  const securityOfficerRole = await prisma.role.upsert({
    where: { name: "security-officer" },
    update: {},
    create: { name: "security-officer", description: "Security Officer - cybersecurity reviews and risk assessments" },
  });

  const dpoRole = await prisma.role.upsert({
    where: { name: "dpo" },
    update: {},
    create: { name: "dpo", description: "Data Protection Officer - JDPA compliance and data protection" },
  });

  const directorRole = await prisma.role.upsert({
    where: { name: "director" },
    update: {},
    create: { name: "director", description: "Director - final sign-off authority" },
  });

  console.log("Roles created:", managerRole.name, webmasterRole.name, adminRole.name, webDeveloperRole.name, securityOfficerRole.name, dpoRole.name, directorRole.name);

  // Create default workflow categories
  const defaultCategories = [
    { name: "Environment Management", description: "Request, provision, or decommission development and staging environments", icon: "Server", color: "blue", sortOrder: 0 },
    { name: "Security & Compliance", description: "Security reviews, data handling exceptions, and compliance processes", icon: "Shield", color: "amber", sortOrder: 1 },
    { name: "Access Management", description: "Request access to environments, systems, and resources", icon: "KeyRound", color: "purple", sortOrder: 2 },
    { name: "Production", description: "Migration to production, release approvals, and go-live processes", icon: "Rocket", color: "emerald", sortOrder: 3 },
    { name: "General", description: "General workflow requests and processes", icon: "FolderOpen", color: "slate", sortOrder: 4 },
  ];

  for (const cat of defaultCategories) {
    await prisma.workflowCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  console.log("Default workflow categories created");

  // Create users with password "WorkFlow@2026!" (meets 12+ char, upper, lower, number, special)
  const passwordHash = await hash("WorkFlow@2026!", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@jis.gov.jm" },
    update: {},
    create: {
      email: "alice@jis.gov.jm",
      name: "Alice Johnson",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: adminRole.id } } },
          { role: { connect: { id: webDeveloperRole.id } } },
        ],
      },
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@jis.gov.jm" },
    update: {},
    create: {
      email: "bob@jis.gov.jm",
      name: "Bob Smith",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: managerRole.id } } },
        ],
      },
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: "carol@jis.gov.jm" },
    update: {},
    create: {
      email: "carol@jis.gov.jm",
      name: "Carol Davis",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: webmasterRole.id } } },
        ],
      },
    },
  });

  const dave = await prisma.user.upsert({
    where: { email: "dave@jis.gov.jm" },
    update: {},
    create: {
      email: "dave@jis.gov.jm",
      name: "Dave Wilson",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: webDeveloperRole.id } } },
        ],
      },
    },
  });

  const eve = await prisma.user.upsert({
    where: { email: "eve@jis.gov.jm" },
    update: {},
    create: {
      email: "eve@jis.gov.jm",
      name: "Eve Martinez",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: securityOfficerRole.id } } },
        ],
      },
    },
  });

  const frank = await prisma.user.upsert({
    where: { email: "frank@jis.gov.jm" },
    update: {},
    create: {
      email: "frank@jis.gov.jm",
      name: "Frank Thompson",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: dpoRole.id } } },
        ],
      },
    },
  });

  const grace = await prisma.user.upsert({
    where: { email: "grace@jis.gov.jm" },
    update: {},
    create: {
      email: "grace@jis.gov.jm",
      name: "Grace Chen",
      passwordHash,
      roles: {
        create: [
          { role: { connect: { id: directorRole.id } } },
        ],
      },
    },
  });

  console.log("Users created:", alice.name, bob.name, carol.name, dave.name, eve.name, frank.name, grace.name);

  // Create ministries
  const mohwMinistry = await prisma.ministry.upsert({
    where: { shortCode: "MOHW" },
    update: {},
    create: { name: "Ministry of Health and Wellness", shortCode: "MOHW", website: "https://www.moh.gov.jm", headOfEntity: "Hon. Dr. Christopher Tufton" },
  });
  const motMinistry = await prisma.ministry.upsert({
    where: { shortCode: "MOT" },
    update: {},
    create: { name: "Ministry of Tourism", shortCode: "MOT", website: "https://www.mot.gov.jm", headOfEntity: "Hon. Edmund Bartlett" },
  });
  const msettMinistry = await prisma.ministry.upsert({
    where: { shortCode: "MSETT" },
    update: {},
    create: { name: "Ministry of Science, Energy, Telecommunications and Transport", shortCode: "MSETT", website: "https://www.msett.gov.jm", headOfEntity: "Hon. Daryl Vaz" },
  });
  const mofpsMinistry = await prisma.ministry.upsert({
    where: { shortCode: "MOFPS" },
    update: {},
    create: { name: "Ministry of Finance and the Public Service", shortCode: "MOFPS", website: "https://www.mof.gov.jm", headOfEntity: "Hon. Dr. Nigel Clarke" },
  });
  const opmMinistry = await prisma.ministry.upsert({
    where: { shortCode: "OPM" },
    update: {},
    create: { name: "Office of the Prime Minister", shortCode: "OPM", website: "https://opm.gov.jm", headOfEntity: "Most Hon. Andrew Holness" },
  });

  console.log("Ministries created:", mohwMinistry.shortCode, motMinistry.shortCode, msettMinistry.shortCode, mofpsMinistry.shortCode, opmMinistry.shortCode);

  // Create clients under ministries
  const mohClient = await prisma.client.upsert({
    where: { shortCode: "MOH-IT" },
    update: {},
    create: {
      name: "Ministry of Health - IT Division",
      shortCode: "MOH-IT",
      description: "IT Division of the Ministry of Health and Wellness",
      ministryId: mohwMinistry.id,
      slaTier: "GOLD",
      hasSignedAgreement: true,
      agreementDate: new Date("2025-06-15"),
      addressParish: "KINGSTON",
      addressCity: "Kingston",
    },
  });
  const nhfClient = await prisma.client.upsert({
    where: { shortCode: "NHF" },
    update: {},
    create: {
      name: "National Health Fund",
      shortCode: "NHF",
      description: "Government agency managing health benefits",
      ministryId: mohwMinistry.id,
      slaTier: "SILVER",
      addressParish: "KINGSTON",
      addressCity: "Kingston",
    },
  });
  const jtbClient = await prisma.client.upsert({
    where: { shortCode: "JTB" },
    update: {},
    create: {
      name: "Jamaica Tourist Board",
      shortCode: "JTB",
      description: "Tourism promotion and marketing",
      ministryId: motMinistry.id,
      slaTier: "GOLD",
      hasSignedAgreement: true,
      agreementDate: new Date("2025-08-01"),
      addressParish: "KINGSTON",
      addressCity: "Kingston",
    },
  });
  const egovClient = await prisma.client.upsert({
    where: { shortCode: "EGOV" },
    update: {},
    create: {
      name: "e-Gov Jamaica",
      shortCode: "EGOV",
      description: "Digital government services platform",
      ministryId: msettMinistry.id,
      slaTier: "GOLD",
      hasSignedAgreement: true,
      agreementDate: new Date("2025-03-10"),
      addressParish: "KINGSTON",
      addressCity: "Kingston",
    },
  });
  const tajClient = await prisma.client.upsert({
    where: { shortCode: "TAJ" },
    update: {},
    create: {
      name: "Tax Administration Jamaica",
      shortCode: "TAJ",
      description: "Revenue collection and tax administration",
      ministryId: mofpsMinistry.id,
      slaTier: "GOLD",
      hasSignedAgreement: true,
      agreementDate: new Date("2025-01-20"),
      addressParish: "KINGSTON",
      addressCity: "Kingston",
    },
  });

  console.log("Clients created:", mohClient.shortCode, nhfClient.shortCode, jtbClient.shortCode, egovClient.shortCode, tajClient.shortCode);

  // Create contacts for clients
  await prisma.clientContact.createMany({
    data: [
      // MOH-IT contacts
      { clientId: mohClient.id, name: "Dr. Sarah Williams", email: "swilliams@moh.gov.jm", role: "PRIMARY", isPrimary: true, title: "Director of IT", department: "IT Division" },
      { clientId: mohClient.id, name: "Kevin Brown", email: "kbrown@moh.gov.jm", role: "TECHNICAL", title: "Senior Systems Administrator", department: "IT Division", phone: "876-555-0101" },
      { clientId: mohClient.id, name: "Patricia Clarke", email: "pclarke@moh.gov.jm", role: "DATA_PROTECTION_OFFICER", title: "Data Protection Officer", department: "Legal & Compliance" },
      // NHF contacts
      { clientId: nhfClient.id, name: "Richard James", email: "rjames@nhf.org.jm", role: "PRIMARY", isPrimary: true, title: "IT Manager" },
      { clientId: nhfClient.id, name: "Donna Williams", email: "dwilliams@nhf.org.jm", role: "TECHNICAL", title: "Web Developer" },
      // JTB contacts
      { clientId: jtbClient.id, name: "Mark Thompson", email: "mthompson@jtb.gov.jm", role: "PRIMARY", isPrimary: true, title: "IT Manager" },
      { clientId: jtbClient.id, name: "Andrea Stewart", email: "astewart@jtb.gov.jm", role: "TECHNICAL", title: "Web Administrator", phone: "876-555-0202" },
      // EGOV contacts
      { clientId: egovClient.id, name: "Lisa Chen", email: "lchen@egov.gov.jm", role: "PRIMARY", isPrimary: true, title: "Programme Director" },
      { clientId: egovClient.id, name: "Michael Reid", email: "mreid@egov.gov.jm", role: "DATA_PROTECTION_OFFICER", title: "Data Protection Officer" },
      { clientId: egovClient.id, name: "Natasha Gordon", email: "ngordon@egov.gov.jm", role: "TECHNICAL", title: "Lead Developer", phone: "876-555-0303" },
      // TAJ contacts
      { clientId: tajClient.id, name: "Andrew Marshall", email: "amarshall@taj.gov.jm", role: "PRIMARY", isPrimary: true, title: "Chief Information Officer" },
      { clientId: tajClient.id, name: "Simone Reid", email: "sreid@taj.gov.jm", role: "ESCALATION", title: "Deputy Commissioner" },
    ],
  });

  console.log("Contacts created");

  // Create projects
  await prisma.project.upsert({
    where: { clientId_name: { clientId: mohClient.id, name: "Website Redesign 2026" } },
    update: {},
    create: { clientId: mohClient.id, name: "Website Redesign 2026", description: "Complete redesign of the MOH public website" },
  });
  await prisma.project.upsert({
    where: { clientId_name: { clientId: jtbClient.id, name: "Staging Environment Q2" } },
    update: {},
    create: { clientId: jtbClient.id, name: "Staging Environment Q2", description: "Q2 staging setup for visitjamaica.com" },
  });
  await prisma.project.upsert({
    where: { clientId_name: { clientId: egovClient.id, name: "Digital Services Platform" } },
    update: {},
    create: { clientId: egovClient.id, name: "Digital Services Platform", description: "Core digital government services infrastructure" },
  });
  await prisma.project.upsert({
    where: { clientId_name: { clientId: tajClient.id, name: "Online Tax Portal v3" } },
    update: {},
    create: { clientId: tajClient.id, name: "Online Tax Portal v3", description: "Major overhaul of the TAJ online tax filing system" },
  });

  console.log("Projects created");

  // Set Alice's default client
  await prisma.user.update({
    where: { id: alice.id },
    data: { defaultClientId: mohClient.id },
  });

  console.log("\nAll users have password: WorkFlow@2026!");
  console.log("Alice (admin/web-developer, default client: MOH), Bob (manager), Carol (webmaster), Dave (web-developer), Eve (security-officer), Frank (dpo), Grace (director)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
