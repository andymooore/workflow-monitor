#!/usr/bin/env node
/**
 * Production seed script - creates roles, admin user, categories, reference
 * data, and workflow templates using pg directly.
 * Column names match the Prisma schema exactly. Idempotent — safe to re-run.
 */
const { Client } = require("pg");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Pre-computed bcrypt hash for "Admin@2026!" (cost 12)
const ADMIN_PASSWORD_HASH =
  "$2b$12$765xGgoPjbiaM1/lk4aTB.qtW5eXYf0vJ9aoGZYobxVIHCX8QVAou";

const uid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function upsertRole(client, name, description) {
  await client.query(
    `INSERT INTO "Role" (id, name, description, "createdAt")
     VALUES ($1, $2, $3, NOW()) ON CONFLICT (name) DO NOTHING`,
    [uid(), name, description]
  );
  const { rows } = await client.query(
    `SELECT id FROM "Role" WHERE name = $1`,
    [name]
  );
  return rows[0].id;
}

async function upsertCategory(client, name, description, icon, color, sortOrder) {
  await client.query(
    `INSERT INTO "WorkflowCategory" (id, name, description, icon, color, "sortOrder", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (name) DO NOTHING`,
    [uid(), name, description, icon, color, sortOrder]
  );
}

async function upsertMinistry(client, name, shortCode, website, headOfEntity) {
  await client.query(
    `INSERT INTO "Ministry" (id, name, "shortCode", website, "headOfEntity", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT ("shortCode") DO NOTHING`,
    [uid(), name, shortCode, website, headOfEntity]
  );
  const { rows } = await client.query(
    `SELECT id FROM "Ministry" WHERE "shortCode" = $1`,
    [shortCode]
  );
  return rows[0].id;
}

async function upsertClient(
  client,
  name,
  shortCode,
  description,
  ministryId,
  slaTier,
  parish,
  city
) {
  await client.query(
    `INSERT INTO "Client" (id, name, "shortCode", description, "ministryId", "slaTier", "addressParish", "addressCity", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) ON CONFLICT ("shortCode") DO NOTHING`,
    [uid(), name, shortCode, description, ministryId, slaTier, parish, city]
  );
  const { rows } = await client.query(
    `SELECT id FROM "Client" WHERE "shortCode" = $1`,
    [shortCode]
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to database");

  // ── Roles ───────────────────────────────────────────────────────────────
  console.log("Seeding roles...");
  const roleIds = {};
  const roles = [
    ["manager", "Department manager - approves requests"],
    ["webmaster", "Web team - manages website infrastructure"],
    ["admin", "System administrator"],
    ["web-developer", "Web Developer - builds and maintains websites"],
    [
      "security-officer",
      "Security Officer - cybersecurity reviews and risk assessments",
    ],
    [
      "dpo",
      "Data Protection Officer - JDPA compliance and data protection",
    ],
    ["director", "Director - final approvals and oversight"],
    ["helpdesk", "Help Desk - first-line support and ticket management"],
  ];
  for (const [name, desc] of roles) {
    roleIds[name] = await upsertRole(client, name, desc);
    console.log(`  role: ${name}`);
  }

  // ── Admin user ──────────────────────────────────────────────────────────
  console.log("Seeding admin user...");
  await client.query(
    `INSERT INTO "User" (id, name, email, "passwordHash", status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = $4, "updatedAt" = NOW()`,
    [uid(), "System Admin", "admin@jis.gov.jm", ADMIN_PASSWORD_HASH]
  );
  const { rows: adminRows } = await client.query(
    `SELECT id FROM "User" WHERE email = 'admin@jis.gov.jm'`
  );
  const adminId = adminRows[0].id;
  await client.query(
    `INSERT INTO "UserRole" (id, "userId", "roleId")
     VALUES ($1, $2, $3) ON CONFLICT ("userId", "roleId") DO NOTHING`,
    [uid(), adminId, roleIds["admin"]]
  );
  console.log("  user: admin@jis.gov.jm (password: Admin@2026!)");

  // ── Categories ──────────────────────────────────────────────────────────
  console.log("Seeding categories...");
  await upsertCategory(client, "Environment Management", "Request, provision, or decommission development and staging environments", "Server", "blue", 0);
  await upsertCategory(client, "Security & Compliance", "Security reviews, data handling exceptions, and compliance processes", "Shield", "amber", 1);
  await upsertCategory(client, "Access Management", "Request access to environments, systems, and resources", "KeyRound", "purple", 2);
  await upsertCategory(client, "Production", "Production deployments, go-live checklists, and release management", "Rocket", "emerald", 3);
  await upsertCategory(client, "General", "General workflow requests and processes", "FolderOpen", "slate", 4);
  console.log("  categories created");

  // ── Ministries ──────────────────────────────────────────────────────────
  console.log("Seeding ministries...");
  const mohwId = await upsertMinistry(client, "Ministry of Health and Wellness", "MOHW", "https://www.moh.gov.jm", "Hon. Dr. Christopher Tufton");
  const motId = await upsertMinistry(client, "Ministry of Tourism", "MOT", "https://www.mot.gov.jm", "Hon. Edmund Bartlett");
  const msettId = await upsertMinistry(client, "Ministry of Science, Energy, Telecommunications and Transport", "MSETT", "https://www.msett.gov.jm", "Hon. Daryl Vaz");
  const mofpsId = await upsertMinistry(client, "Ministry of Finance and the Public Service", "MOFPS", "https://www.mof.gov.jm", "Hon. Dr. Nigel Clarke");
  await upsertMinistry(client, "Office of the Prime Minister", "OPM", "https://opm.gov.jm", "Most Hon. Andrew Holness");
  console.log("  ministries created");

  // ── Clients ─────────────────────────────────────────────────────────────
  console.log("Seeding clients...");
  await upsertClient(client, "Ministry of Health - IT Division", "MOH-IT", "IT Division of the Ministry of Health and Wellness", mohwId, "GOLD", "KINGSTON", "Kingston");
  await upsertClient(client, "National Health Fund", "NHF", "Government agency managing health benefits", mohwId, "SILVER", "KINGSTON", "Kingston");
  await upsertClient(client, "Jamaica Tourist Board", "JTB", "Tourism promotion and marketing", motId, "GOLD", "KINGSTON", "Kingston");
  await upsertClient(client, "e-Gov Jamaica", "EGOV", "Digital government services platform", msettId, "GOLD", "KINGSTON", "Kingston");
  await upsertClient(client, "Tax Administration Jamaica", "TAJ", "Revenue collection and tax administration", mofpsId, "GOLD", "KINGSTON", "Kingston");
  console.log("  clients created");

  // ── Workflow Templates ──────────────────────────────────────────────────
  const { rows: existingTemplates } = await client.query(
    `SELECT id FROM "WorkflowTemplate" LIMIT 1`
  );
  if (existingTemplates.length > 0) {
    console.log("Workflow templates already exist. Skipping.");
  } else {
    console.log("Seeding workflow templates...");
    await seedWorkflowTemplates(client, adminId, roleIds);
  }

  console.log("Seed complete!");
  await client.end();
}

// ---------------------------------------------------------------------------
// Workflow templates
// ---------------------------------------------------------------------------
async function seedWorkflowTemplates(client, adminId, roleIds) {
  // Helper to create a full template with nodes, edges, and role assignments
  async function createTemplate(tmpl) {
    const templateId = uid();
    await client.query(
      `INSERT INTO "WorkflowTemplate" (id, name, description, category, "intakeForm", version, "isPublished", "createdById", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 1, true, $6, NOW(), NOW())`,
      [
        templateId,
        tmpl.name,
        tmpl.description,
        tmpl.category,
        JSON.stringify(tmpl.intakeForm || []),
        adminId,
      ]
    );

    const nodeIdMap = {}; // localId -> dbId
    for (const node of tmpl.nodes) {
      const nodeId = uid();
      nodeIdMap[node.id] = nodeId;
      await client.query(
        `INSERT INTO "WorkflowNode" (id, "templateId", type, label, "positionX", "positionY", config, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          nodeId,
          templateId,
          node.type,
          node.label,
          node.x,
          node.y,
          JSON.stringify(node.config || {}),
        ]
      );
      // Role assignments
      if (node.roles) {
        for (const r of node.roles) {
          await client.query(
            `INSERT INTO "WorkflowNodeRoleAssignment" (id, "nodeId", "roleId", "assignToOwner")
             VALUES ($1, $2, $3, $4)`,
            [uid(), nodeId, roleIds[r.role], r.assignToOwner || false]
          );
        }
      }
    }

    for (const edge of tmpl.edges) {
      await client.query(
        `INSERT INTO "WorkflowEdge" (id, "templateId", "sourceId", "targetId", label, "conditionBranch")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uid(),
          templateId,
          nodeIdMap[edge.from],
          nodeIdMap[edge.to],
          edge.label || null,
          edge.branch || null,
        ]
      );
    }

    console.log(`  template: ${tmpl.name}`);
    return templateId;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1. IT-SEC-002 Website Launch (full 7-phase workflow)
  // ────────────────────────────────────────────────────────────────────────
  await createTemplate({
    name: "IT-SEC-002 Website Launch",
    description:
      "Full IT-SEC-002 compliant website launch workflow — covers environment setup, security review, JDPA compliance, director sign-off, and production deployment.",
    category: "Production",
    intakeForm: [
      { id: "site_name", label: "Website / Application Name", type: "text", required: true, placeholder: "e.g. moh.gov.jm", options: [], defaultValue: "" },
      { id: "site_url", label: "Staging URL", type: "text", required: true, placeholder: "https://staging.example.gov.jm", options: [], defaultValue: "" },
      { id: "launch_date", label: "Requested Launch Date", type: "date", required: true, placeholder: "", options: [], defaultValue: "" },
      { id: "description", label: "Description of Changes", type: "textarea", required: true, placeholder: "Describe what is being launched or changed", options: [], defaultValue: "" },
      { id: "priority", label: "Priority", type: "select", required: true, placeholder: "", options: ["Low", "Medium", "High", "Critical"], defaultValue: "Medium" },
    ],
    nodes: [
      { id: "start", type: "START", label: "Request Submitted", x: 400, y: 50 },
      { id: "dev_review", type: "TASK", label: "Developer Review & Staging Setup", x: 400, y: 180, roles: [{ role: "web-developer" }], config: { description: "Review code, verify staging environment, run automated tests." } },
      { id: "webmaster_check", type: "TASK", label: "Webmaster QA Check", x: 400, y: 310, roles: [{ role: "webmaster" }], config: { description: "Verify content, accessibility, cross-browser testing, performance audit." } },
      { id: "mgr_approval", type: "APPROVAL", label: "Manager Approval", x: 400, y: 440, roles: [{ role: "manager" }], config: { description: "Review staging site and approve for security assessment.", approvalStrategy: "ANY_CAN_APPROVE" } },
      { id: "mgr_gate", type: "CONDITION", label: "Manager Decision", x: 400, y: 570 },
      { id: "security_review", type: "TASK", label: "Security Assessment (IT-SEC-002)", x: 250, y: 700, roles: [{ role: "security-officer" }], config: { description: "Conduct vulnerability scan, penetration test summary, SSL/TLS verification, OWASP top 10 review." } },
      { id: "dpo_review", type: "TASK", label: "JDPA Compliance Review", x: 250, y: 830, roles: [{ role: "dpo" }], config: { description: "Review data handling, privacy policy, cookie consent, JDPA compliance checklist." } },
      { id: "director_approval", type: "APPROVAL", label: "Director Sign-Off", x: 250, y: 960, roles: [{ role: "director" }], config: { description: "Final approval to proceed with production launch.", approvalStrategy: "ALL_MUST_APPROVE" } },
      { id: "director_gate", type: "CONDITION", label: "Director Decision", x: 250, y: 1090 },
      { id: "prod_deploy", type: "TASK", label: "Production Deployment", x: 100, y: 1220, roles: [{ role: "web-developer" }], config: { description: "Deploy to production, verify DNS, SSL, monitoring, and backups." } },
      { id: "end_launched", type: "END", label: "Website Launched", x: 100, y: 1350 },
      { id: "end_rejected", type: "END", label: "Request Rejected", x: 550, y: 700 },
    ],
    edges: [
      { from: "start", to: "dev_review" },
      { from: "dev_review", to: "webmaster_check" },
      { from: "webmaster_check", to: "mgr_approval" },
      { from: "mgr_approval", to: "mgr_gate" },
      { from: "mgr_gate", to: "security_review", label: "Approved", branch: "APPROVED_PATH" },
      { from: "mgr_gate", to: "end_rejected", label: "Rejected", branch: "REJECTED_PATH" },
      { from: "security_review", to: "dpo_review" },
      { from: "dpo_review", to: "director_approval" },
      { from: "director_approval", to: "director_gate" },
      { from: "director_gate", to: "prod_deploy", label: "Approved", branch: "APPROVED_PATH" },
      { from: "director_gate", to: "end_rejected", label: "Rejected", branch: "REJECTED_PATH" },
      { from: "prod_deploy", to: "end_launched" },
    ],
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Environment Provisioning Request
  // ────────────────────────────────────────────────────────────────────────
  await createTemplate({
    name: "Environment Provisioning",
    description:
      "Request a new development or staging environment for a client project.",
    category: "Environment Management",
    intakeForm: [
      { id: "env_type", label: "Environment Type", type: "select", required: true, placeholder: "", options: ["Development", "Staging", "UAT"], defaultValue: "Staging" },
      { id: "project_name", label: "Project Name", type: "text", required: true, placeholder: "e.g. MOH Portal Redesign", options: [], defaultValue: "" },
      { id: "requirements", label: "Technical Requirements", type: "textarea", required: false, placeholder: "PHP version, database, storage needs, etc.", options: [], defaultValue: "" },
    ],
    nodes: [
      { id: "start", type: "START", label: "Request Submitted", x: 400, y: 50 },
      { id: "mgr_review", type: "APPROVAL", label: "Manager Approval", x: 400, y: 200, roles: [{ role: "manager" }], config: { approvalStrategy: "ANY_CAN_APPROVE" } },
      { id: "mgr_gate", type: "CONDITION", label: "Manager Decision", x: 400, y: 350 },
      { id: "provision", type: "TASK", label: "Provision Environment", x: 250, y: 500, roles: [{ role: "web-developer" }], config: { description: "Set up server, deploy base code, configure DNS and SSL." } },
      { id: "handover", type: "TASK", label: "Handover & Documentation", x: 250, y: 650, roles: [{ role: "webmaster" }], config: { description: "Document access credentials, update asset register, notify client." } },
      { id: "end_done", type: "END", label: "Environment Ready", x: 250, y: 800 },
      { id: "end_rejected", type: "END", label: "Request Denied", x: 550, y: 500 },
    ],
    edges: [
      { from: "start", to: "mgr_review" },
      { from: "mgr_review", to: "mgr_gate" },
      { from: "mgr_gate", to: "provision", label: "Approved", branch: "APPROVED_PATH" },
      { from: "mgr_gate", to: "end_rejected", label: "Rejected", branch: "REJECTED_PATH" },
      { from: "provision", to: "handover" },
      { from: "handover", to: "end_done" },
    ],
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Security Incident Response
  // ────────────────────────────────────────────────────────────────────────
  await createTemplate({
    name: "Security Incident Response",
    description:
      "Handle a reported security incident — triage, investigate, remediate, and document.",
    category: "Security & Compliance",
    intakeForm: [
      { id: "incident_type", label: "Incident Type", type: "select", required: true, placeholder: "", options: ["Unauthorized Access", "Data Breach", "Malware", "Phishing", "DDoS", "Other"], defaultValue: "" },
      { id: "severity", label: "Severity", type: "select", required: true, placeholder: "", options: ["Low", "Medium", "High", "Critical"], defaultValue: "Medium" },
      { id: "affected_systems", label: "Affected Systems", type: "text", required: true, placeholder: "e.g. moh.gov.jm, internal CRM", options: [], defaultValue: "" },
      { id: "description", label: "Incident Description", type: "textarea", required: true, placeholder: "What happened, when was it discovered, initial observations", options: [], defaultValue: "" },
    ],
    nodes: [
      { id: "start", type: "START", label: "Incident Reported", x: 400, y: 50 },
      { id: "triage", type: "TASK", label: "Triage & Containment", x: 400, y: 200, roles: [{ role: "security-officer" }], config: { description: "Assess severity, contain the threat, preserve evidence." } },
      { id: "investigate", type: "TASK", label: "Investigation & Analysis", x: 400, y: 350, roles: [{ role: "security-officer" }], config: { description: "Determine root cause, scope of impact, affected data." } },
      { id: "mgr_review", type: "APPROVAL", label: "Management Review", x: 400, y: 500, roles: [{ role: "manager" }], config: { description: "Review findings and approve remediation plan.", approvalStrategy: "ANY_CAN_APPROVE" } },
      { id: "mgr_gate", type: "CONDITION", label: "Remediation Approved?", x: 400, y: 650 },
      { id: "remediate", type: "TASK", label: "Remediation", x: 250, y: 800, roles: [{ role: "web-developer" }], config: { description: "Patch vulnerabilities, rotate credentials, restore services." } },
      { id: "dpo_notify", type: "TASK", label: "DPO Notification & Reporting", x: 250, y: 950, roles: [{ role: "dpo" }], config: { description: "If personal data affected, prepare breach notification per JDPA. File regulatory reports if required." } },
      { id: "director_signoff", type: "APPROVAL", label: "Director Sign-Off", x: 250, y: 1100, roles: [{ role: "director" }], config: { description: "Confirm incident resolved, lessons-learned documented.", approvalStrategy: "ALL_MUST_APPROVE" } },
      { id: "end_resolved", type: "END", label: "Incident Resolved", x: 250, y: 1250 },
      { id: "end_escalated", type: "END", label: "Escalated Externally", x: 550, y: 800 },
    ],
    edges: [
      { from: "start", to: "triage" },
      { from: "triage", to: "investigate" },
      { from: "investigate", to: "mgr_review" },
      { from: "mgr_review", to: "mgr_gate" },
      { from: "mgr_gate", to: "remediate", label: "Approved", branch: "APPROVED_PATH" },
      { from: "mgr_gate", to: "end_escalated", label: "Escalate", branch: "REJECTED_PATH" },
      { from: "remediate", to: "dpo_notify" },
      { from: "dpo_notify", to: "director_signoff" },
      { from: "director_signoff", to: "end_resolved" },
    ],
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Access Request
  // ────────────────────────────────────────────────────────────────────────
  await createTemplate({
    name: "Access Request",
    description:
      "Request access to a system, environment, or resource. Requires security officer review and manager approval.",
    category: "Access Management",
    intakeForm: [
      { id: "system", label: "System / Resource", type: "text", required: true, placeholder: "e.g. Production CPanel, GitHub Org, VPN", options: [], defaultValue: "" },
      { id: "access_level", label: "Access Level", type: "select", required: true, placeholder: "", options: ["Read Only", "Read/Write", "Admin"], defaultValue: "Read Only" },
      { id: "justification", label: "Business Justification", type: "textarea", required: true, placeholder: "Why is this access needed?", options: [], defaultValue: "" },
      { id: "duration", label: "Duration", type: "select", required: false, placeholder: "", options: ["Permanent", "30 Days", "90 Days", "Project Duration"], defaultValue: "Permanent" },
    ],
    nodes: [
      { id: "start", type: "START", label: "Request Submitted", x: 400, y: 50 },
      { id: "sec_review", type: "TASK", label: "Security Review", x: 400, y: 200, roles: [{ role: "security-officer" }], config: { description: "Verify principle of least privilege, check for conflicts of interest." } },
      { id: "mgr_approval", type: "APPROVAL", label: "Manager Approval", x: 400, y: 350, roles: [{ role: "manager" }], config: { approvalStrategy: "ANY_CAN_APPROVE" } },
      { id: "mgr_gate", type: "CONDITION", label: "Manager Decision", x: 400, y: 500 },
      { id: "provision", type: "TASK", label: "Provision Access", x: 250, y: 650, roles: [{ role: "web-developer" }], config: { description: "Create account/credentials, configure permissions, document in access register." } },
      { id: "end_granted", type: "END", label: "Access Granted", x: 250, y: 800 },
      { id: "end_denied", type: "END", label: "Access Denied", x: 550, y: 650 },
    ],
    edges: [
      { from: "start", to: "sec_review" },
      { from: "sec_review", to: "mgr_approval" },
      { from: "mgr_approval", to: "mgr_gate" },
      { from: "mgr_gate", to: "provision", label: "Approved", branch: "APPROVED_PATH" },
      { from: "mgr_gate", to: "end_denied", label: "Denied", branch: "REJECTED_PATH" },
      { from: "provision", to: "end_granted" },
    ],
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Content Update Request
  // ────────────────────────────────────────────────────────────────────────
  await createTemplate({
    name: "Content Update Request",
    description:
      "Request a content change on a live website — text, images, documents, or minor layout updates.",
    category: "General",
    intakeForm: [
      { id: "website", label: "Website", type: "text", required: true, placeholder: "e.g. moh.gov.jm", options: [], defaultValue: "" },
      { id: "page_url", label: "Page URL", type: "text", required: true, placeholder: "https://moh.gov.jm/about", options: [], defaultValue: "" },
      { id: "change_type", label: "Type of Change", type: "select", required: true, placeholder: "", options: ["Text Update", "Image Replacement", "Document Upload", "New Page", "Layout Change"], defaultValue: "Text Update" },
      { id: "details", label: "Change Details", type: "textarea", required: true, placeholder: "Describe exactly what needs to change", options: [], defaultValue: "" },
    ],
    nodes: [
      { id: "start", type: "START", label: "Request Submitted", x: 400, y: 50 },
      { id: "implement", type: "TASK", label: "Implement Changes", x: 400, y: 200, roles: [{ role: "webmaster" }], config: { description: "Make the content changes on staging, screenshot for review." } },
      { id: "mgr_review", type: "APPROVAL", label: "Requester Review", x: 400, y: 350, roles: [{ role: "manager" }], config: { description: "Review changes on staging and approve for production.", approvalStrategy: "ANY_CAN_APPROVE" } },
      { id: "mgr_gate", type: "CONDITION", label: "Approved?", x: 400, y: 500 },
      { id: "publish", type: "TASK", label: "Publish to Production", x: 250, y: 650, roles: [{ role: "webmaster" }], config: { description: "Push changes live, verify on production, clear cache." } },
      { id: "end_done", type: "END", label: "Content Updated", x: 250, y: 800 },
      { id: "end_rejected", type: "END", label: "Changes Rejected", x: 550, y: 650 },
    ],
    edges: [
      { from: "start", to: "implement" },
      { from: "implement", to: "mgr_review" },
      { from: "mgr_review", to: "mgr_gate" },
      { from: "mgr_gate", to: "publish", label: "Approved", branch: "APPROVED_PATH" },
      { from: "mgr_gate", to: "end_rejected", label: "Rejected", branch: "REJECTED_PATH" },
      { from: "publish", to: "end_done" },
    ],
  });
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
