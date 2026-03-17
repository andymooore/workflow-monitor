import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  // Get all roles
  const roles = await prisma.role.findMany();
  const r: Record<string, string> = {};
  for (const role of roles) r[role.name] = role.id;

  console.log("Roles:", Object.keys(r).join(", "));

  // Get Alice as creator
  const aliceResult = await prisma.user.findUnique({ where: { email: "alice@jis.gov.jm" } });
  if (!aliceResult) throw new Error("Alice not found");
  const alice = aliceResult;

  // Helper to create a template with nodes, edges, and intake forms
  async function createTemplate(data: {
    name: string;
    description: string;
    category: string;
    intakeForm: object;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      positionX: number;
      positionY: number;
      config: Record<string, unknown>;
      roleAssignments: Array<{ roleId: string; assignToOwner: boolean }>;
    }>;
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      label?: string;
      conditionBranch?: string;
    }>;
  }) {
    const template = await prisma.workflowTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        intakeForm: data.intakeForm as object,
        isPublished: true,
        createdById: alice.id,
        nodes: {
          create: data.nodes.map((n) => ({
            id: n.id,
            type: n.type as any,
            label: n.label,
            positionX: n.positionX,
            positionY: n.positionY,
            config: n.config as object,
            roleAssignments: {
              create: n.roleAssignments,
            },
          })),
        },
        edges: {
          create: data.edges.map((e) => ({
            id: e.id,
            sourceId: e.sourceId,
            targetId: e.targetId,
            label: e.label ?? null,
            conditionBranch: (e.conditionBranch as any) ?? null,
          })),
        },
      },
    });
    console.log(`Created: ${template.name} (${template.id})`);
    return template;
  }

  // =========================================================================
  // TEMPLATE 1: Environment Request & Risk Classification (S.4)
  // Category: Environment Management
  // =========================================================================
  await createTemplate({
    name: "Environment Request & Risk Classification",
    description:
      "IT-SEC-002 S.4 — Developer requests a new dev/staging environment. Webmaster classifies risk. IT Manager approves. Based on risk level, Security Officer review may be required.",
    category: "Environment Management",
    intakeForm: {
      steps: [
        {
          id: "env-details",
          title: "Environment Details",
          description: "Describe the environment you need provisioned",
          fields: [
            { id: "env_name", label: "Environment Name", type: "text", required: true, placeholder: "e.g. staging-mohw-portal", options: [], defaultValue: "" },
            { id: "env_type", label: "Environment Type", type: "select", required: true, placeholder: "", options: ["Development", "Staging", "UAT", "Pre-Production"], defaultValue: "Staging" },
            { id: "project_name", label: "Project / Website Name", type: "text", required: true, placeholder: "e.g. MOHW Public Portal Redesign", options: [], defaultValue: "" },
            { id: "cms_platform", label: "CMS / Platform", type: "select", required: true, placeholder: "", options: ["WordPress", "Joomla", "Drupal", "Custom PHP", "Static HTML", "Node.js", "Other"], defaultValue: "WordPress" },
            { id: "expected_duration", label: "Expected Duration", type: "select", required: true, placeholder: "", options: ["1-2 weeks", "1 month", "3 months", "6 months", "Ongoing"], defaultValue: "3 months" },
          ],
        },
        {
          id: "risk-info",
          title: "Risk & Data Classification",
          description: "Help us assess the risk level for this environment",
          fields: [
            { id: "risk_level", label: "Initial Risk Classification", type: "select", required: true, placeholder: "", options: ["Standard - No personal data", "Elevated - Limited personal data", "High - Sensitive personal data or critical systems"], defaultValue: "" },
            { id: "personal_data", label: "Will personal data be processed?", type: "select", required: true, placeholder: "", options: ["No", "Yes - anonymised/synthetic only", "Yes - limited real data (exception required)", "Yes - sensitive categories (JDPA)"], defaultValue: "No" },
            { id: "external_access", label: "External/client access required?", type: "select", required: true, placeholder: "", options: ["No - internal only", "Yes - client review access needed"], defaultValue: "No - internal only" },
            { id: "justification", label: "Business Justification", type: "textarea", required: true, placeholder: "Explain why this environment is needed and what it will be used for", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t1-start", type: "START", label: "Request Initiated", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t1-dev-form", type: "TASK", label: "Submit Environment Request Form", positionX: 400, positionY: 180, config: { description: "Complete the Environment Request Form (Appendix A) with project details, risk classification, access requirements, and expected duration." }, roleAssignments: [{ roleId: r["web-developer"], assignToOwner: true }] },
      { id: "t1-wm-classify", type: "TASK", label: "Webmaster Risk Assessment", positionX: 400, positionY: 330, config: { description: "Review the request form. Classify risk level (Standard/Elevated/High). Verify all required fields are completed. Record in Environment Register." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t1-so-review", type: "TASK", label: "Security Officer Review", positionX: 400, positionY: 480, config: { description: "Review request from cybersecurity standpoint. Assess risk classification. Provide written technical risk recommendation to IT Manager." }, roleAssignments: [{ roleId: r["security-officer"], assignToOwner: false }] },
      { id: "t1-mgr-approve", type: "APPROVAL", label: "IT Manager Approval", positionX: 400, positionY: 630, config: { strategy: "ANY_CAN_APPROVE", instructions: "Review the environment request, risk assessment, and Security Officer recommendation. Approve or reject the provisioning request." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t1-condition", type: "CONDITION", label: "Approval Decision", positionX: 400, positionY: 780, config: {}, roleAssignments: [] },
      { id: "t1-end-approved", type: "END", label: "Approved - Proceed to Provisioning", positionX: 250, positionY: 930, config: {}, roleAssignments: [] },
      { id: "t1-end-rejected", type: "END", label: "Request Rejected", positionX: 550, positionY: 930, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t1-e1", sourceId: "t1-start", targetId: "t1-dev-form" },
      { id: "t1-e2", sourceId: "t1-dev-form", targetId: "t1-wm-classify" },
      { id: "t1-e3", sourceId: "t1-wm-classify", targetId: "t1-so-review" },
      { id: "t1-e4", sourceId: "t1-so-review", targetId: "t1-mgr-approve" },
      { id: "t1-e5", sourceId: "t1-mgr-approve", targetId: "t1-condition" },
      { id: "t1-e6", sourceId: "t1-condition", targetId: "t1-end-approved", label: "Approved", conditionBranch: "APPROVED_PATH" },
      { id: "t1-e7", sourceId: "t1-condition", targetId: "t1-end-rejected", label: "Rejected", conditionBranch: "REJECTED_PATH" },
    ],
  });

  // =========================================================================
  // TEMPLATE 2: Environment Provisioning & Security Checklist (S.5)
  // Category: Environment Management
  // =========================================================================
  await createTemplate({
    name: "Environment Provisioning & Security Checklist",
    description:
      "IT-SEC-002 S.5 — Webmaster provisions the environment following the 25-control security checklist. IT Manager must sign off before handover to developer.",
    category: "Environment Management",
    intakeForm: {
      steps: [
        {
          id: "provision-details",
          title: "Provisioning Details",
          description: "Reference the approved environment request",
          fields: [
            { id: "approved_request_ref", label: "Approved Request Reference", type: "text", required: true, placeholder: "e.g. ENV-2026-042", options: [], defaultValue: "" },
            { id: "subdomain", label: "Subdomain / URL", type: "text", required: true, placeholder: "e.g. staging-portal.example.gov.jm", options: [], defaultValue: "" },
            { id: "server_location", label: "Server / Hosting Location", type: "text", required: true, placeholder: "e.g. cPanel Server 2 - Kingston DC", options: [], defaultValue: "" },
            { id: "cms_version", label: "CMS Version to Install", type: "text", required: false, placeholder: "e.g. WordPress 6.5.2", options: [], defaultValue: "" },
            { id: "special_requirements", label: "Special Requirements", type: "textarea", required: false, placeholder: "PHP version, plugins, database size, etc.", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t2-start", type: "START", label: "Provisioning Started", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t2-provision", type: "TASK", label: "Provision Environment", positionX: 400, positionY: 180, config: { description: "Set up the cPanel environment: create subdomain, configure DNS, install CMS, set up database. Apply all security controls per S.5.1-5.12." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t2-checklist", type: "TASK", label: "Complete Security Checklist", positionX: 400, positionY: 330, config: { description: "Verify all 25+ controls: robots.txt, noindex, HTTP auth, HTTPS, directory listing, file permissions (755/644/600), no 777, database isolation, CMS hardening, outbound email disabled, debug mode off, MFA, IP restrictions, SSL cert." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t2-mgr-signoff", type: "APPROVAL", label: "IT Manager Sign-off", positionX: 400, positionY: 480, config: { strategy: "ANY_CAN_APPROVE", instructions: "Review the completed provisioning checklist. Verify all security controls are in place. Sign off to authorize handover to developer. Environment MUST NOT be used until this sign-off is received." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t2-condition", type: "CONDITION", label: "Sign-off Decision", positionX: 400, positionY: 630, config: {}, roleAssignments: [] },
      { id: "t2-handover", type: "TASK", label: "Hand Over to Developer", positionX: 250, positionY: 780, config: { description: "Environment is approved. Provide access credentials to the requesting developer. Record handover in Environment Register." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t2-dev-confirm", type: "TASK", label: "Developer Confirms Receipt", positionX: 250, positionY: 930, config: { description: "Confirm you have received access to the provisioned environment and can log in successfully." }, roleAssignments: [{ roleId: r["web-developer"], assignToOwner: true }] },
      { id: "t2-end-done", type: "END", label: "Environment Active", positionX: 250, positionY: 1080, config: {}, roleAssignments: [] },
      { id: "t2-end-failed", type: "END", label: "Checklist Failed - Rework", positionX: 550, positionY: 780, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t2-e1", sourceId: "t2-start", targetId: "t2-provision" },
      { id: "t2-e2", sourceId: "t2-provision", targetId: "t2-checklist" },
      { id: "t2-e3", sourceId: "t2-checklist", targetId: "t2-mgr-signoff" },
      { id: "t2-e4", sourceId: "t2-mgr-signoff", targetId: "t2-condition" },
      { id: "t2-e5", sourceId: "t2-condition", targetId: "t2-handover", label: "Approved", conditionBranch: "APPROVED_PATH" },
      { id: "t2-e6", sourceId: "t2-condition", targetId: "t2-end-failed", label: "Rejected", conditionBranch: "REJECTED_PATH" },
      { id: "t2-e7", sourceId: "t2-handover", targetId: "t2-dev-confirm" },
      { id: "t2-e8", sourceId: "t2-dev-confirm", targetId: "t2-end-done" },
    ],
  });

  // =========================================================================
  // TEMPLATE 3: Live Data Exception Request (S.6.3)
  // Category: Security & Compliance
  // =========================================================================
  await createTemplate({
    name: "Live Data Exception Request",
    description:
      "IT-SEC-002 S.6.3 — 10-step exception process for when live data is needed in dev/staging. Requires Security Officer, DPO, and IT Manager approval. Data must be deleted within 24-48 hours.",
    category: "Security & Compliance",
    intakeForm: {
      steps: [
        {
          id: "exception-reason",
          title: "Exception Justification",
          description: "Explain why live/production data is required",
          fields: [
            { id: "environment_name", label: "Target Environment", type: "text", required: true, placeholder: "e.g. staging-mohw-portal", options: [], defaultValue: "" },
            { id: "data_description", label: "What data is needed?", type: "textarea", required: true, placeholder: "Describe the specific data subset required (full database restores are NOT permitted where a subset will suffice)", options: [], defaultValue: "" },
            { id: "why_synthetic_fails", label: "Why can't synthetic data be used?", type: "textarea", required: true, placeholder: "Explain specifically why synthetic/anonymised data cannot replicate the issue being investigated", options: [], defaultValue: "" },
            { id: "data_categories", label: "Personal Data Categories Involved", type: "select", required: true, placeholder: "", options: ["Names & contact details only", "Financial records", "Health records", "National ID / TRN", "Multiple categories", "No personal data (system data only)"], defaultValue: "" },
          ],
        },
        {
          id: "containment",
          title: "Containment & Deletion Plan",
          description: "How will data be protected and removed",
          fields: [
            { id: "access_restriction", label: "Who will have access to the data?", type: "textarea", required: true, placeholder: "List specific individuals by name and role", options: [], defaultValue: "" },
            { id: "containment_measures", label: "Containment Measures", type: "textarea", required: true, placeholder: "e.g. IP-restricted environment, no client access, encrypted at rest", options: [], defaultValue: "" },
            { id: "deletion_timeline", label: "Deletion Timeline", type: "select", required: true, placeholder: "", options: ["Within 24 hours of resolution", "Within 48 hours of copying", "Custom (specify in notes)"], defaultValue: "Within 24 hours of resolution" },
            { id: "min_data_subset", label: "Minimum Data Subset Justification", type: "textarea", required: true, placeholder: "Confirm this is the minimum necessary data — not a full production restore", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t3-start", type: "START", label: "Exception Requested", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t3-dev-request", type: "TASK", label: "Developer Submits Written Request", positionX: 400, positionY: 180, config: { description: "Submit written request to Webmaster explaining specifically why synthetic data cannot replicate the issue. Include the minimum data subset needed." }, roleAssignments: [{ roleId: r["web-developer"], assignToOwner: true }] },
      { id: "t3-wm-forward", type: "TASK", label: "Webmaster Reviews & Forwards", positionX: 400, positionY: 330, config: { description: "Review the exception request. Forward simultaneously to Security Officer and DPO for independent written assessments." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t3-so-assess", type: "TASK", label: "Security Officer Risk Assessment", positionX: 400, positionY: 480, config: { description: "Provide written technical risk recommendation to IT Manager regarding the live data exception request." }, roleAssignments: [{ roleId: r["security-officer"], assignToOwner: false }] },
      { id: "t3-dpo-assess", type: "TASK", label: "DPO Data Protection Assessment", positionX: 400, positionY: 630, config: { description: "Provide independent written data protection assessment. Evaluate JDPA 2020 compliance, lawful basis, and proportionality." }, roleAssignments: [{ roleId: r.dpo, assignToOwner: false }] },
      { id: "t3-mgr-decide", type: "APPROVAL", label: "IT Manager Decision", positionX: 400, positionY: 780, config: { strategy: "ANY_CAN_APPROVE", instructions: "Review both assessments. Only minimum necessary data permitted. No data may be copied before this approval." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t3-condition", type: "CONDITION", label: "Exception Decision", positionX: 400, positionY: 930, config: {}, roleAssignments: [] },
      { id: "t3-dev-delete", type: "TASK", label: "Developer Confirms Data Deletion", positionX: 250, positionY: 1080, config: { description: "Data must be deleted within 24 hours of resolution and no later than 48 hours after copying. Confirm deletion in writing." }, roleAssignments: [{ roleId: r["web-developer"], assignToOwner: true }] },
      { id: "t3-wm-verify", type: "TASK", label: "Webmaster Verifies Deletion", positionX: 250, positionY: 1230, config: { description: "Verify data has been completely deleted. Record full exception in the Environment Register." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t3-end-complete", type: "END", label: "Exception Closed", positionX: 250, positionY: 1380, config: {}, roleAssignments: [] },
      { id: "t3-end-denied", type: "END", label: "Exception Denied", positionX: 550, positionY: 1080, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t3-e1", sourceId: "t3-start", targetId: "t3-dev-request" },
      { id: "t3-e2", sourceId: "t3-dev-request", targetId: "t3-wm-forward" },
      { id: "t3-e3", sourceId: "t3-wm-forward", targetId: "t3-so-assess" },
      { id: "t3-e4", sourceId: "t3-so-assess", targetId: "t3-dpo-assess" },
      { id: "t3-e5", sourceId: "t3-dpo-assess", targetId: "t3-mgr-decide" },
      { id: "t3-e6", sourceId: "t3-mgr-decide", targetId: "t3-condition" },
      { id: "t3-e7", sourceId: "t3-condition", targetId: "t3-dev-delete", label: "Approved", conditionBranch: "APPROVED_PATH" },
      { id: "t3-e8", sourceId: "t3-condition", targetId: "t3-end-denied", label: "Denied", conditionBranch: "REJECTED_PATH" },
      { id: "t3-e9", sourceId: "t3-dev-delete", targetId: "t3-wm-verify" },
      { id: "t3-e10", sourceId: "t3-wm-verify", targetId: "t3-end-complete" },
    ],
  });

  // =========================================================================
  // TEMPLATE 4: Client Access Authorization (S.7)
  // Category: Access Management
  // =========================================================================
  await createTemplate({
    name: "Client Access Authorization",
    description:
      "IT-SEC-002 S.7 — Process for granting approved clients access to staging environments. Requires signed Client Access Agreement and IT Manager authorization.",
    category: "Access Management",
    intakeForm: {
      steps: [
        {
          id: "access-details",
          title: "Access Request Details",
          description: "Specify the client and environment for access",
          fields: [
            { id: "client_org", label: "Client Organisation", type: "text", required: true, placeholder: "e.g. Ministry of Health & Wellness", options: [], defaultValue: "" },
            { id: "client_contact", label: "Client Contact Name", type: "text", required: true, placeholder: "Full name of the person requiring access", options: [], defaultValue: "" },
            { id: "client_email", label: "Client Contact Email", type: "text", required: true, placeholder: "email@ministry.gov.jm", options: [], defaultValue: "" },
            { id: "environment_url", label: "Environment URL", type: "text", required: true, placeholder: "e.g. staging-portal.example.gov.jm", options: [], defaultValue: "" },
            { id: "access_level", label: "Access Level Required", type: "select", required: true, placeholder: "", options: ["View only (browser access)", "Content editor (CMS login)", "Admin access (limited)", "Full admin access"], defaultValue: "View only (browser access)" },
            { id: "access_duration", label: "Access Duration", type: "select", required: true, placeholder: "", options: ["1 week", "2 weeks", "1 month", "3 months", "Until project completion"], defaultValue: "2 weeks" },
            { id: "purpose", label: "Purpose of Access", type: "textarea", required: true, placeholder: "e.g. Client review and feedback on staging site design", options: [], defaultValue: "" },
            { id: "agreement_signed", label: "Client Access Agreement Status", type: "select", required: true, placeholder: "", options: ["Agreement signed and attached", "Agreement pending signature", "New agreement required"], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t4-start", type: "START", label: "Access Requested", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t4-wm-prepare", type: "TASK", label: "Webmaster Prepares Access", positionX: 400, positionY: 180, config: { description: "Prepare Client Access Agreement (Appendix B). Define access level, expiry date, and scope." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t4-mgr-auth", type: "APPROVAL", label: "IT Manager Authorization", positionX: 400, positionY: 330, config: { strategy: "ANY_CAN_APPROVE", instructions: "Verify Client Access Agreement is complete. Authorize or deny access." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t4-condition", type: "CONDITION", label: "Authorization Decision", positionX: 400, positionY: 480, config: {}, roleAssignments: [] },
      { id: "t4-wm-grant", type: "TASK", label: "Grant Access & Record", positionX: 250, positionY: 630, config: { description: "Create client credentials with minimum required access. Set expiry date. Record in Environment Register." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t4-end-granted", type: "END", label: "Access Granted", positionX: 250, positionY: 780, config: {}, roleAssignments: [] },
      { id: "t4-end-denied", type: "END", label: "Access Denied", positionX: 550, positionY: 630, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t4-e1", sourceId: "t4-start", targetId: "t4-wm-prepare" },
      { id: "t4-e2", sourceId: "t4-wm-prepare", targetId: "t4-mgr-auth" },
      { id: "t4-e3", sourceId: "t4-mgr-auth", targetId: "t4-condition" },
      { id: "t4-e4", sourceId: "t4-condition", targetId: "t4-wm-grant", label: "Authorized", conditionBranch: "APPROVED_PATH" },
      { id: "t4-e5", sourceId: "t4-condition", targetId: "t4-end-denied", label: "Denied", conditionBranch: "REJECTED_PATH" },
      { id: "t4-e6", sourceId: "t4-wm-grant", targetId: "t4-end-granted" },
    ],
  });

  // =========================================================================
  // TEMPLATE 5: Migration to Production (S.9)
  // Category: Production
  // =========================================================================
  await createTemplate({
    name: "Migration to Production",
    description:
      "IT-SEC-002 S.9 — Process for migrating a staging environment to production. Requires migration checklist, Security Officer review, IT Manager sign-off, and DPO confirmation.",
    category: "Production",
    intakeForm: {
      steps: [
        {
          id: "migration-info",
          title: "Migration Details",
          description: "Specify what is being migrated",
          fields: [
            { id: "source_env", label: "Source Environment (Staging URL)", type: "text", required: true, placeholder: "e.g. staging-portal.example.gov.jm", options: [], defaultValue: "" },
            { id: "target_env", label: "Target Production URL", type: "text", required: true, placeholder: "e.g. portal.ministry.gov.jm", options: [], defaultValue: "" },
            { id: "migration_type", label: "Migration Type", type: "select", required: true, placeholder: "", options: ["Full site migration", "Content update only", "Theme/design update", "Plugin/module update", "Database migration", "DNS cutover"], defaultValue: "Full site migration" },
            { id: "downtime_window", label: "Expected Downtime Window", type: "select", required: true, placeholder: "", options: ["No downtime (blue-green)", "< 30 minutes", "1-2 hours", "Scheduled maintenance window required"], defaultValue: "< 30 minutes" },
          ],
        },
        {
          id: "readiness",
          title: "Migration Readiness",
          description: "Confirm pre-migration checklist items",
          fields: [
            { id: "testing_complete", label: "UAT / Testing Status", type: "select", required: true, placeholder: "", options: ["All tests passed", "Minor issues remaining (documented)", "Testing in progress"], defaultValue: "" },
            { id: "backup_plan", label: "Rollback Plan", type: "textarea", required: true, placeholder: "Describe the rollback strategy if migration fails", options: [], defaultValue: "" },
            { id: "stakeholder_signoff", label: "Client/Stakeholder Approval", type: "select", required: true, placeholder: "", options: ["Written approval received", "Verbal approval (to be documented)", "Pending"], defaultValue: "" },
            { id: "data_handling_notes", label: "Data Handling Notes", type: "textarea", required: false, placeholder: "Any personal data considerations for the migration", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t5-start", type: "START", label: "Migration Initiated", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t5-dev-prepare", type: "TASK", label: "Developer Prepares Migration", positionX: 400, positionY: 180, config: { description: "Complete migration checklist. Remove all dev artifacts, debug settings, and test data." }, roleAssignments: [{ roleId: r["web-developer"], assignToOwner: true }] },
      { id: "t5-wm-review", type: "TASK", label: "Webmaster Technical Review", positionX: 400, positionY: 330, config: { description: "Review migration package. Verify no dev artifacts remain. Check file permissions and configurations." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t5-so-review", type: "TASK", label: "Security Officer Review", positionX: 400, positionY: 480, config: { description: "Verify no security vulnerabilities, leaked credentials, or debug endpoints. Confirm CMS hardening." }, roleAssignments: [{ roleId: r["security-officer"], assignToOwner: false }] },
      { id: "t5-mgr-approve", type: "APPROVAL", label: "IT Manager Sign-off", positionX: 400, positionY: 630, config: { strategy: "ANY_CAN_APPROVE", instructions: "Review the migration checklist, technical review, and security assessment. Approve or reject." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t5-condition", type: "CONDITION", label: "Migration Decision", positionX: 400, positionY: 780, config: {}, roleAssignments: [] },
      { id: "t5-dpo-confirm", type: "TASK", label: "DPO Data Handling Confirmation", positionX: 250, positionY: 930, config: { description: "Confirm no personal data from dev/staging will carry over. Verify JDPA 2020 compliance." }, roleAssignments: [{ roleId: r.dpo, assignToOwner: false }] },
      { id: "t5-wm-deploy", type: "TASK", label: "Execute Migration", positionX: 250, positionY: 1080, config: { description: "Deploy to production. Verify live site. Decommission staging per S.10." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t5-end-live", type: "END", label: "Live - Migration Complete", positionX: 250, positionY: 1230, config: {}, roleAssignments: [] },
      { id: "t5-end-blocked", type: "END", label: "Migration Blocked", positionX: 550, positionY: 930, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t5-e1", sourceId: "t5-start", targetId: "t5-dev-prepare" },
      { id: "t5-e2", sourceId: "t5-dev-prepare", targetId: "t5-wm-review" },
      { id: "t5-e3", sourceId: "t5-wm-review", targetId: "t5-so-review" },
      { id: "t5-e4", sourceId: "t5-so-review", targetId: "t5-mgr-approve" },
      { id: "t5-e5", sourceId: "t5-mgr-approve", targetId: "t5-condition" },
      { id: "t5-e6", sourceId: "t5-condition", targetId: "t5-dpo-confirm", label: "Approved", conditionBranch: "APPROVED_PATH" },
      { id: "t5-e7", sourceId: "t5-condition", targetId: "t5-end-blocked", label: "Rejected", conditionBranch: "REJECTED_PATH" },
      { id: "t5-e8", sourceId: "t5-dpo-confirm", targetId: "t5-wm-deploy" },
      { id: "t5-e9", sourceId: "t5-wm-deploy", targetId: "t5-end-live" },
    ],
  });

  // =========================================================================
  // TEMPLATE 6: Environment Decommissioning (S.10)
  // Category: Environment Management
  // =========================================================================
  await createTemplate({
    name: "Environment Decommissioning",
    description:
      "IT-SEC-002 S.10 — Process for safely decommissioning a dev/staging environment. Webmaster removes all data, IT Manager confirms, register is updated.",
    category: "Environment Management",
    intakeForm: {
      steps: [
        {
          id: "decomm-details",
          title: "Decommission Details",
          description: "Identify the environment to be decommissioned",
          fields: [
            { id: "env_name", label: "Environment Name / URL", type: "text", required: true, placeholder: "e.g. staging-portal.example.gov.jm", options: [], defaultValue: "" },
            { id: "reason", label: "Reason for Decommissioning", type: "select", required: true, placeholder: "", options: ["Project completed - migrated to production", "Project cancelled", "Environment expired", "Security concern", "Consolidation", "Other"], defaultValue: "" },
            { id: "data_present", label: "Does the environment contain any data?", type: "select", required: true, placeholder: "", options: ["No data present", "Test/synthetic data only", "May contain production data remnants", "Contains personal data (requires DPO notification)"], defaultValue: "Test/synthetic data only" },
            { id: "active_users", label: "Active Users / Credentials to Revoke", type: "textarea", required: false, placeholder: "List any active user accounts that need to be revoked", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t6-start", type: "START", label: "Decommission Initiated", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t6-wm-decomm", type: "TASK", label: "Webmaster Decommissions Environment", positionX: 400, positionY: 180, config: { description: "Remove all files, databases, CMS installations, and DNS records. Revoke all access credentials. Delete cPanel account." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t6-wm-register", type: "TASK", label: "Update Environment Register", positionX: 400, positionY: 330, config: { description: "Update the Environment Register to reflect decommissioning. Record date, reason, and confirmation of data destruction." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t6-mgr-confirm", type: "APPROVAL", label: "IT Manager Confirms Decommission", positionX: 400, positionY: 480, config: { strategy: "ANY_CAN_APPROVE", instructions: "Verify environment has been fully decommissioned and register is updated." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t6-condition", type: "CONDITION", label: "Confirmation", positionX: 400, positionY: 630, config: {}, roleAssignments: [] },
      { id: "t6-end-done", type: "END", label: "Environment Decommissioned", positionX: 250, positionY: 780, config: {}, roleAssignments: [] },
      { id: "t6-end-issue", type: "END", label: "Issues Found - Rework", positionX: 550, positionY: 780, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t6-e1", sourceId: "t6-start", targetId: "t6-wm-decomm" },
      { id: "t6-e2", sourceId: "t6-wm-decomm", targetId: "t6-wm-register" },
      { id: "t6-e3", sourceId: "t6-wm-register", targetId: "t6-mgr-confirm" },
      { id: "t6-e4", sourceId: "t6-mgr-confirm", targetId: "t6-condition" },
      { id: "t6-e5", sourceId: "t6-condition", targetId: "t6-end-done", label: "Confirmed", conditionBranch: "APPROVED_PATH" },
      { id: "t6-e6", sourceId: "t6-condition", targetId: "t6-end-issue", label: "Issues", conditionBranch: "REJECTED_PATH" },
    ],
  });

  // =========================================================================
  // TEMPLATE 7: Security Incident Response (S.12)
  // Category: Security & Compliance
  // =========================================================================
  await createTemplate({
    name: "Security Incident Response",
    description:
      "IT-SEC-002 S.12 — Incident response chain for security events in dev/staging environments. Reporter escalates to IT Manager who activates the IRP. DPO engaged for data breaches (72hr JDPA clock).",
    category: "Security & Compliance",
    intakeForm: {
      steps: [
        {
          id: "incident-report",
          title: "Incident Report",
          description: "Describe the security incident",
          fields: [
            { id: "incident_type", label: "Incident Type", type: "select", required: true, placeholder: "", options: ["Unauthorized access detected", "Malware / malicious code", "Data breach / data exposure", "Defacement", "Credential compromise", "Vulnerability exploited", "Phishing / social engineering", "DDoS / availability", "Other"], defaultValue: "" },
            { id: "severity", label: "Initial Severity Assessment", type: "select", required: true, placeholder: "", options: ["Critical - active exploitation / data breach", "High - potential data exposure", "Medium - contained but needs investigation", "Low - suspicious activity, unconfirmed"], defaultValue: "" },
            { id: "affected_environments", label: "Affected Environment(s)", type: "text", required: true, placeholder: "e.g. staging-portal.example.gov.jm", options: [], defaultValue: "" },
            { id: "discovery_time", label: "When was the incident discovered?", type: "text", required: true, placeholder: "e.g. 2026-03-17 14:30 EST", options: [], defaultValue: "" },
            { id: "description", label: "Incident Description", type: "textarea", required: true, placeholder: "What was observed? What systems are affected? What immediate actions (if any) were taken?", options: [], defaultValue: "" },
          ],
        },
        {
          id: "data-impact",
          title: "Data Impact Assessment",
          description: "Assess potential personal data involvement (critical for JDPA 72-hour clock)",
          fields: [
            { id: "personal_data_involved", label: "Is personal data involved?", type: "select", required: true, placeholder: "", options: ["No - system/code only", "Unknown - under investigation", "Yes - personal data may be exposed", "Yes - confirmed personal data breach"], defaultValue: "" },
            { id: "data_subjects_affected", label: "Estimated number of data subjects affected", type: "text", required: false, placeholder: "e.g. ~500 records, or Unknown", options: [], defaultValue: "" },
            { id: "immediate_actions", label: "Immediate Containment Actions Taken", type: "textarea", required: false, placeholder: "e.g. Environment taken offline, passwords rotated, IP blocked", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t7-start", type: "START", label: "Incident Reported", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t7-report", type: "TASK", label: "Report to IT Manager", positionX: 400, positionY: 180, config: { description: "Report the suspected security incident to the IT Manager immediately with all available details." }, roleAssignments: [{ roleId: r["web-developer"], assignToOwner: true }] },
      { id: "t7-mgr-assess", type: "TASK", label: "IT Manager Initial Assessment", positionX: 400, positionY: 330, config: { description: "Assess severity. If personal data is involved, the DPO must be engaged IMMEDIATELY — the 72-hour JDPA notification clock starts from awareness." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t7-dpo-assess", type: "TASK", label: "DPO Breach Assessment", positionX: 400, positionY: 480, config: { description: "Assess JDPA 2020 notification obligations. Determine if the Information Commissioner must be notified within 72 hours." }, roleAssignments: [{ roleId: r.dpo, assignToOwner: false }] },
      { id: "t7-so-contain", type: "TASK", label: "Security Officer Containment", positionX: 400, positionY: 630, config: { description: "Isolate affected environment, preserve evidence and logs, block unauthorized access." }, roleAssignments: [{ roleId: r["security-officer"], assignToOwner: false }] },
      { id: "t7-wm-technical", type: "TASK", label: "Webmaster Technical Remediation", positionX: 400, positionY: 780, config: { description: "Take environment offline if needed, patch vulnerabilities, rotate credentials, restore from clean backup." }, roleAssignments: [{ roleId: r.webmaster, assignToOwner: false }] },
      { id: "t7-mgr-resolve", type: "APPROVAL", label: "IT Manager Resolution Sign-off", positionX: 400, positionY: 930, config: { strategy: "ANY_CAN_APPROVE", instructions: "Confirm the incident is fully resolved and IRP handoff is complete." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t7-condition", type: "CONDITION", label: "Resolution Status", positionX: 400, positionY: 1080, config: {}, roleAssignments: [] },
      { id: "t7-dir-review", type: "TASK", label: "Director Post-Incident Review", positionX: 250, positionY: 1230, config: { description: "Review incident report, response actions, and lessons learned. Determine if procedure updates are required." }, roleAssignments: [{ roleId: r.director, assignToOwner: false }] },
      { id: "t7-end-closed", type: "END", label: "Incident Closed", positionX: 250, positionY: 1380, config: {}, roleAssignments: [] },
      { id: "t7-end-escalate", type: "END", label: "Escalated - Further Action Required", positionX: 550, positionY: 1230, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t7-e1", sourceId: "t7-start", targetId: "t7-report" },
      { id: "t7-e2", sourceId: "t7-report", targetId: "t7-mgr-assess" },
      { id: "t7-e3", sourceId: "t7-mgr-assess", targetId: "t7-dpo-assess" },
      { id: "t7-e4", sourceId: "t7-dpo-assess", targetId: "t7-so-contain" },
      { id: "t7-e5", sourceId: "t7-so-contain", targetId: "t7-wm-technical" },
      { id: "t7-e6", sourceId: "t7-wm-technical", targetId: "t7-mgr-resolve" },
      { id: "t7-e7", sourceId: "t7-mgr-resolve", targetId: "t7-condition" },
      { id: "t7-e8", sourceId: "t7-condition", targetId: "t7-dir-review", label: "Resolved", conditionBranch: "APPROVED_PATH" },
      { id: "t7-e9", sourceId: "t7-condition", targetId: "t7-end-escalate", label: "Escalate", conditionBranch: "REJECTED_PATH" },
      { id: "t7-e10", sourceId: "t7-dir-review", targetId: "t7-end-closed" },
    ],
  });

  // =========================================================================
  // TEMPLATE 8: Document Approval & Review (S.17)
  // Category: Security & Compliance
  // =========================================================================
  await createTemplate({
    name: "Document Approval & Review",
    description:
      "IT-SEC-002 S.17 — Annual procedure review process. Security Officer reviews cybersecurity, DPO reviews data protection, IT Manager approves operationally, Director provides final sign-off.",
    category: "Security & Compliance",
    intakeForm: {
      steps: [
        {
          id: "document-info",
          title: "Document Under Review",
          description: "Identify the procedure document being reviewed",
          fields: [
            { id: "document_title", label: "Document Title", type: "text", required: true, placeholder: "e.g. IT-SEC-002 Security of Dev & Staging Environments", options: [], defaultValue: "" },
            { id: "current_version", label: "Current Version", type: "text", required: true, placeholder: "e.g. 2.0", options: [], defaultValue: "" },
            { id: "review_type", label: "Review Type", type: "select", required: true, placeholder: "", options: ["Annual scheduled review", "Post-incident review", "Regulatory change", "Technology change", "Ad-hoc review requested"], defaultValue: "Annual scheduled review" },
            { id: "changes_summary", label: "Summary of Proposed Changes", type: "textarea", required: false, placeholder: "Describe key changes or areas that need review", options: [], defaultValue: "" },
            { id: "effective_date_target", label: "Target Effective Date", type: "date", required: false, placeholder: "", options: [], defaultValue: "" },
          ],
        },
      ],
    },
    nodes: [
      { id: "t8-start", type: "START", label: "Review Initiated", positionX: 400, positionY: 50, config: {}, roleAssignments: [] },
      { id: "t8-so-review", type: "TASK", label: "Security Officer Cybersecurity Review", positionX: 400, positionY: 180, config: { description: "Review from cybersecurity standpoint. Identify controls needing updates." }, roleAssignments: [{ roleId: r["security-officer"], assignToOwner: false }] },
      { id: "t8-dpo-review", type: "TASK", label: "DPO Data Protection Review", positionX: 400, positionY: 330, config: { description: "Review from data protection standpoint. Ensure JDPA 2020 compliance. Recommendations must be addressed before Director sign-off." }, roleAssignments: [{ roleId: r.dpo, assignToOwner: false }] },
      { id: "t8-mgr-approve", type: "APPROVAL", label: "IT Manager Operational Approval", positionX: 400, positionY: 480, config: { strategy: "ANY_CAN_APPROVE", instructions: "Review SO and DPO assessments. Approve operationally. Ensure all recommendations addressed." }, roleAssignments: [{ roleId: r.manager, assignToOwner: false }] },
      { id: "t8-condition", type: "CONDITION", label: "Operational Approval", positionX: 400, positionY: 630, config: {}, roleAssignments: [] },
      { id: "t8-dir-signoff", type: "APPROVAL", label: "Director Final Sign-off", positionX: 250, positionY: 780, config: { strategy: "ANY_CAN_APPROVE", instructions: "Provide final sign-off. Procedure is not operative until signed with an Effective Date." }, roleAssignments: [{ roleId: r.director, assignToOwner: false }] },
      { id: "t8-condition2", type: "CONDITION", label: "Director Decision", positionX: 250, positionY: 930, config: {}, roleAssignments: [] },
      { id: "t8-end-approved", type: "END", label: "Procedure Approved & Effective", positionX: 100, positionY: 1080, config: {}, roleAssignments: [] },
      { id: "t8-end-revise", type: "END", label: "Revisions Required", positionX: 550, positionY: 780, config: {}, roleAssignments: [] },
      { id: "t8-end-dir-revise", type: "END", label: "Director Requests Changes", positionX: 400, positionY: 1080, config: {}, roleAssignments: [] },
    ],
    edges: [
      { id: "t8-e1", sourceId: "t8-start", targetId: "t8-so-review" },
      { id: "t8-e2", sourceId: "t8-so-review", targetId: "t8-dpo-review" },
      { id: "t8-e3", sourceId: "t8-dpo-review", targetId: "t8-mgr-approve" },
      { id: "t8-e4", sourceId: "t8-mgr-approve", targetId: "t8-condition" },
      { id: "t8-e5", sourceId: "t8-condition", targetId: "t8-dir-signoff", label: "Approved", conditionBranch: "APPROVED_PATH" },
      { id: "t8-e6", sourceId: "t8-condition", targetId: "t8-end-revise", label: "Revisions Needed", conditionBranch: "REJECTED_PATH" },
      { id: "t8-e7", sourceId: "t8-dir-signoff", targetId: "t8-condition2" },
      { id: "t8-e8", sourceId: "t8-condition2", targetId: "t8-end-approved", label: "Signed Off", conditionBranch: "APPROVED_PATH" },
      { id: "t8-e9", sourceId: "t8-condition2", targetId: "t8-end-dir-revise", label: "Changes Needed", conditionBranch: "REJECTED_PATH" },
    ],
  });

  await prisma.$disconnect();
  console.log("\nAll 8 templates created and published!");
}

main().catch(console.error);
