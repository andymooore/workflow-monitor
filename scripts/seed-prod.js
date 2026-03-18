#!/usr/bin/env node
/**
 * Production seed script - creates initial roles and admin user using pg directly.
 * Column names match the Prisma schema exactly.
 */
const { Client } = require("pg");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Pre-computed bcrypt hash for "Admin@2026!" (cost 12, matches auth.ts)
const ADMIN_PASSWORD_HASH = "$2b$12$765xGgoPjbiaM1/lk4aTB.qtW5eXYf0vJ9aoGZYobxVIHCX8QVAou";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to database");

  // Check if already seeded
  const { rows: existingRoles } = await client.query(
    `SELECT id FROM "Role" LIMIT 1`
  );
  if (existingRoles.length > 0) {
    console.log("Database already seeded (roles exist). Checking admin user...");

    // Ensure admin user exists even if roles were previously seeded
    const { rows: adminCheck } = await client.query(
      `SELECT id FROM "User" WHERE email = 'admin@jis.gov.jm'`
    );
    if (adminCheck.length === 0) {
      console.log("Admin user missing, creating...");
      await createAdminUser(client);
    } else {
      console.log("Admin user exists. Skipping.");
    }

    await client.end();
    return;
  }

  console.log("Seeding roles...");
  const roles = [
    { name: "manager", description: "Department manager - approves requests" },
    { name: "webmaster", description: "Web team - manages website infrastructure" },
    { name: "admin", description: "System administrator" },
    { name: "web-developer", description: "Web Developer - builds and maintains websites" },
    { name: "security-officer", description: "Security Officer - cybersecurity reviews and risk assessments" },
    { name: "dpo", description: "Data Protection Officer - JDPA compliance and data protection" },
    { name: "director", description: "Director - final approvals and oversight" },
    { name: "helpdesk", description: "Help Desk - first-line support and ticket management" },
  ];

  const roleIds = {};
  for (const role of roles) {
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO "Role" (id, name, description, "createdAt")
       VALUES ($1, $2, $3, NOW()) ON CONFLICT (name) DO NOTHING`,
      [id, role.name, role.description]
    );
    const { rows } = await client.query(`SELECT id FROM "Role" WHERE name = $1`, [role.name]);
    roleIds[role.name] = rows[0].id;
    console.log(`  role: ${role.name}`);
  }

  await createAdminUser(client, roleIds["admin"]);

  console.log("Seed complete!");
  await client.end();
}

async function createAdminUser(client, adminRoleId) {
  // If no roleId passed, look it up
  if (!adminRoleId) {
    const { rows } = await client.query(`SELECT id FROM "Role" WHERE name = 'admin'`);
    if (rows.length === 0) {
      console.error("Admin role not found!");
      return;
    }
    adminRoleId = rows[0].id;
  }

  const adminId = crypto.randomUUID();

  // Use correct column names matching Prisma schema:
  // passwordHash (not password), status (not isActive)
  await client.query(
    `INSERT INTO "User" (id, name, email, "passwordHash", status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = $4, "updatedAt" = NOW()`,
    [adminId, "System Admin", "admin@jis.gov.jm", ADMIN_PASSWORD_HASH]
  );

  // Get the actual admin ID
  const { rows: adminRows } = await client.query(
    `SELECT id FROM "User" WHERE email = 'admin@jis.gov.jm'`
  );
  const actualAdminId = adminRows[0].id;

  // Assign admin role (UserRole has no assignedAt column)
  await client.query(
    `INSERT INTO "UserRole" (id, "userId", "roleId")
     VALUES ($1, $2, $3)
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    [crypto.randomUUID(), actualAdminId, adminRoleId]
  );
  console.log("  user: admin@jis.gov.jm (password: Admin@2026!)");
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
