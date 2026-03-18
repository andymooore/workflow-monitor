#!/usr/bin/env node
/**
 * Production seed script - creates initial roles and admin user using pg directly.
 */
const { Client } = require("pg");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Simple bcrypt-compatible hash using Node.js crypto (for seeding only)
// We'll use a pre-computed bcrypt hash for the default password
// Password: "Admin@2026!"
// bcrypt hash (cost 10):
const ADMIN_PASSWORD_HASH = "$2b$10$aAGNGJ1YdnOuv7AzyXf/N.kaPQL96XNXhpXcNzFtlUkxmCNtAraju";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to database");

  // Check if already seeded
  const { rows: existingRoles } = await client.query(
    `SELECT id FROM "Role" LIMIT 1`
  );
  if (existingRoles.length > 0) {
    console.log("Database already seeded (roles exist). Skipping.");
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
      `INSERT INTO "Role" (id, name, description, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (name) DO NOTHING RETURNING id`,
      [id, role.name, role.description]
    );
    const { rows } = await client.query(`SELECT id FROM "Role" WHERE name = $1`, [role.name]);
    roleIds[role.name] = rows[0].id;
    console.log(`  role: ${role.name}`);
  }

  console.log("Seeding admin user...");
  const adminId = crypto.randomUUID();
  await client.query(
    `INSERT INTO "User" (id, name, email, password, "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, true, NOW(), NOW())
     ON CONFLICT (email) DO NOTHING`,
    [adminId, "System Admin", "admin@jis.gov.jm", ADMIN_PASSWORD_HASH]
  );

  // Get the actual admin ID (in case it already existed)
  const { rows: adminRows } = await client.query(
    `SELECT id FROM "User" WHERE email = 'admin@jis.gov.jm'`
  );
  const actualAdminId = adminRows[0].id;

  // Assign admin role
  await client.query(
    `INSERT INTO "UserRole" (id, "userId", "roleId", "assignedAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [crypto.randomUUID(), actualAdminId, roleIds["admin"]]
  );
  console.log("  user: admin@jis.gov.jm (password: Admin@2026!)");

  console.log("Seed complete!");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
