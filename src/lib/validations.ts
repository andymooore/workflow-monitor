import { z } from "zod";

// ---------------------------------------------------------------------------
// Intake form field & step schemas (template-defined request forms)
// ---------------------------------------------------------------------------
export const intakeFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "textarea", "select", "date", "number"]),
  required: z.boolean().default(false),
  placeholder: z.string().max(500).optional().default(""),
  options: z.array(z.string()).optional().default([]),
  defaultValue: z.string().optional().default(""),
});

export type IntakeField = z.infer<typeof intakeFieldSchema>;

export const intakeStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(""),
  fields: z.array(intakeFieldSchema).default([]),
});

export type IntakeStep = z.infer<typeof intakeStepSchema>;

/**
 * intakeForm can be either:
 * - A flat array of fields (legacy, treated as a single step)
 * - An object with { steps: IntakeStep[] } for multistep forms
 */
export const intakeFormSchema = z.union([
  z.array(intakeFieldSchema),
  z.object({ steps: z.array(intakeStepSchema) }),
]);

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------
export const nodeTypeEnum = z.enum(["START", "END", "TASK", "APPROVAL", "CONDITION"]);
export type NodeTypeValue = z.infer<typeof nodeTypeEnum>;

export const conditionBranchEnum = z.enum(["APPROVED_PATH", "REJECTED_PATH"]);
export type ConditionBranchValue = z.infer<typeof conditionBranchEnum>;

const roleAssignmentSchema = z.object({
  roleId: z.string().min(1, "roleId is required"),
  assignToOwner: z.boolean().optional().default(false),
});

const workflowNodeSchema = z.object({
  id: z.string().min(1, "Node id is required"),
  type: z.string().min(1, "Node type is required"),
  label: z.string().min(1, "Node label is required").max(200),
  positionX: z.number(),
  positionY: z.number(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  roleAssignments: z.array(roleAssignmentSchema).optional().default([]),
});

const workflowEdgeSchema = z.object({
  id: z.string().min(1, "Edge id is required"),
  sourceId: z.string().min(1, "sourceId is required"),
  targetId: z.string().min(1, "targetId is required"),
  label: z.string().max(200).optional().nullable(),
  conditionBranch: conditionBranchEnum.optional().nullable(),
});

// ---------------------------------------------------------------------------
// Template schemas
// ---------------------------------------------------------------------------
export const WORKFLOW_CATEGORIES = [
  "Environment Management",
  "Security & Compliance",
  "Access Management",
  "Production",
  "General",
] as const;

export type WorkflowCategory = (typeof WORKFLOW_CATEGORIES)[number];

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required")
    .max(200, "Template name must be 200 characters or fewer"),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer")
    .optional()
    .default(""),
  category: z
    .string()
    .max(100, "Category must be 100 characters or fewer")
    .optional()
    .default("General"),
  intakeForm: intakeFormSchema.optional().default([]),
  nodes: z.array(workflowNodeSchema).optional().default([]),
  edges: z.array(workflowEdgeSchema).optional().default([]),
});

export const updateTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required")
    .max(200, "Template name must be 200 characters or fewer")
    .optional(),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer")
    .optional(),
  category: z
    .string()
    .max(100, "Category must be 100 characters or fewer")
    .optional(),
  intakeForm: intakeFormSchema.optional(),
  nodes: z.array(workflowNodeSchema).optional().default([]),
  edges: z.array(workflowEdgeSchema).optional().default([]),
});

// ---------------------------------------------------------------------------
// Ministry schemas
// ---------------------------------------------------------------------------
export const createMinistrySchema = z.object({
  name: z.string().min(1, "Ministry name is required").max(300),
  shortCode: z.string().min(1).max(10)
    .regex(/^[A-Z0-9\-]+$/, "Short code must be uppercase alphanumeric with hyphens"),
  description: z.string().max(2000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  headOfEntity: z.string().max(200).optional().nullable(),
});

export const updateMinistrySchema = z.object({
  name: z.string().min(1).max(300).optional(),
  shortCode: z.string().min(1).max(10).regex(/^[A-Z0-9\-]+$/).optional(),
  description: z.string().max(2000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  headOfEntity: z.string().max(200).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

// ---------------------------------------------------------------------------
// Contact schemas
// ---------------------------------------------------------------------------
export const createContactSchema = z.object({
  name: z.string().min(1, "Contact name is required").max(200),
  email: z.string().email("Must be a valid email").max(254),
  phone: z.string().max(30).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  department: z.string().max(200).optional().nullable(),
  role: z.enum(["PRIMARY", "TECHNICAL", "ESCALATION", "BILLING", "DATA_PROTECTION_OFFICER"]),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  department: z.string().max(200).optional().nullable(),
  role: z.enum(["PRIMARY", "TECHNICAL", "ESCALATION", "BILLING", "DATA_PROTECTION_OFFICER"]).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Client schemas
// ---------------------------------------------------------------------------
export const createClientSchema = z.object({
  name: z.string().min(1, "Client name is required").max(200),
  shortCode: z.string().min(1, "Short code is required").max(10)
    .regex(/^[A-Z0-9\-]+$/, "Short code must be uppercase alphanumeric with hyphens"),
  description: z.string().max(2000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  ministryId: z.string().optional().nullable(),
  referenceNumber: z.string().max(50).optional().nullable(),
  slaTier: z.enum(["GOLD", "SILVER", "BRONZE"]).optional().default("BRONZE"),
  addressStreet: z.string().max(500).optional().nullable(),
  addressCity: z.string().max(200).optional().nullable(),
  addressParish: z.enum(["KINGSTON", "ST_ANDREW", "ST_THOMAS", "PORTLAND", "ST_MARY", "ST_ANN", "TRELAWNY", "ST_JAMES", "HANOVER", "WESTMORELAND", "ST_ELIZABETH", "MANCHESTER", "CLARENDON", "ST_CATHERINE"]).optional().nullable(),
  hasSignedAgreement: z.boolean().optional().default(false),
  agreementDate: z.string().datetime().optional().nullable(),
  agreementReference: z.string().max(200).optional().nullable(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  shortCode: z.string().min(1).max(10).regex(/^[A-Z0-9\-]+$/).optional(),
  description: z.string().max(2000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  ministryId: z.string().optional().nullable(),
  referenceNumber: z.string().max(50).optional().nullable(),
  slaTier: z.enum(["GOLD", "SILVER", "BRONZE"]).optional(),
  addressStreet: z.string().max(500).optional().nullable(),
  addressCity: z.string().max(200).optional().nullable(),
  addressParish: z.enum(["KINGSTON", "ST_ANDREW", "ST_THOMAS", "PORTLAND", "ST_MARY", "ST_ANN", "TRELAWNY", "ST_JAMES", "HANOVER", "WESTMORELAND", "ST_ELIZABETH", "MANCHESTER", "CLARENDON", "ST_CATHERINE"]).optional().nullable(),
  hasSignedAgreement: z.boolean().optional(),
  agreementDate: z.string().datetime().optional().nullable(),
  agreementReference: z.string().max(200).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Project schemas
// ---------------------------------------------------------------------------
export const projectStatusEnum = z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);
export const projectHealthEnum = z.enum(["ON_TRACK", "AT_RISK", "BLOCKED"]);
export const milestoneStatusEnum = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"]);

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  status: projectStatusEnum.optional(),
  health: projectHealthEnum.optional(),
  budgetAmount: z.number().min(0).optional().nullable(),
  budgetSpent: z.number().min(0).optional().nullable(),
  budgetCurrency: z.string().max(10).optional(),
  slaReference: z.string().max(200).optional().nullable(),
  slaSignedDate: z.string().datetime().optional().nullable(),
  slaSummary: z.string().max(5000).optional().nullable(),
  torReference: z.string().max(200).optional().nullable(),
  torSignedDate: z.string().datetime().optional().nullable(),
  torSummary: z.string().max(5000).optional().nullable(),
  stagingUrl: z.string().max(500).optional().nullable(),
  liveUrl: z.string().max(500).optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  status: projectStatusEnum.optional(),
  health: projectHealthEnum.optional(),
  budgetAmount: z.number().min(0).optional().nullable(),
  budgetSpent: z.number().min(0).optional().nullable(),
  budgetCurrency: z.string().max(10).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  slaReference: z.string().max(200).optional().nullable(),
  slaSignedDate: z.string().datetime().optional().nullable(),
  slaSummary: z.string().max(5000).optional().nullable(),
  torReference: z.string().max(200).optional().nullable(),
  torSignedDate: z.string().datetime().optional().nullable(),
  torSummary: z.string().max(5000).optional().nullable(),
  stagingUrl: z.string().max(500).optional().nullable(),
  liveUrl: z.string().max(500).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Milestone schemas
// ---------------------------------------------------------------------------
export const createMilestoneSchema = z.object({
  title: z.string().min(1, "Milestone title is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  targetDate: z.string().datetime({ message: "Target date is required" }),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateMilestoneSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: milestoneStatusEnum.optional(),
  targetDate: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Project member schemas
// ---------------------------------------------------------------------------
export const addProjectMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: z.string().min(1).max(50).optional().default("member"),
});

export const updateProjectMemberSchema = z.object({
  role: z.string().min(1, "Role is required").max(50),
});

// ---------------------------------------------------------------------------
// Document schemas
// ---------------------------------------------------------------------------
export const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  type: z.enum(["SLA", "TOR", "CLIENT_ACCESS_AGREEMENT", "CONTRACT", "PROPOSAL", "CHANGE_REQUEST", "REPORT", "MEETING_MINUTES", "OTHER"]),
  description: z.string().max(2000).optional().nullable(),
  fileName: z.string().max(500).optional().nullable(),
  fileUrl: z.string().max(1000).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  clientId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  instanceId: z.string().optional().nullable(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  type: z.enum(["SLA", "TOR", "CLIENT_ACCESS_AGREEMENT", "CONTRACT", "PROPOSAL", "CHANGE_REQUEST", "REPORT", "MEETING_MINUTES", "OTHER"]).optional(),
  description: z.string().max(2000).optional().nullable(),
  fileName: z.string().max(500).optional().nullable(),
  fileUrl: z.string().max(1000).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Instance schemas
// ---------------------------------------------------------------------------
export const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"] as const;
export type Priority = (typeof PRIORITY_OPTIONS)[number];

export const startInstanceSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional().default("Medium"),
  clientId: z.string().min(1, "Client is required"),
  projectId: z.string().optional().nullable(),
  requestedByContactId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

// ---------------------------------------------------------------------------
// Task schemas
// ---------------------------------------------------------------------------
export const completeTaskSchema = z.object({
  notes: z
    .string()
    .max(5000, "Notes must be 5000 characters or fewer")
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------------------
// Approval schemas
// ---------------------------------------------------------------------------
export const approvalSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"], {
      error: "Decision must be 'APPROVED' or 'REJECTED'",
    }),
    comment: z
      .string()
      .max(2000, "Comment must be 2000 characters or fewer")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      // Comment is required when decision is REJECTED
      if (data.decision === "REJECTED") {
        return data.comment && data.comment.trim().length > 0;
      }
      return true;
    },
    {
      message: "A comment is required when rejecting",
      path: ["comment"],
    }
  );

// ---------------------------------------------------------------------------
// Role schemas
// ---------------------------------------------------------------------------
export const createRoleSchema = z.object({
  name: z
    .string()
    .min(1, "Role name is required")
    .max(100, "Role name must be 100 characters or fewer")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9 \-]*$/,
      "Role name must start with an alphanumeric character and contain only letters, numbers, spaces, and hyphens"
    ),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------------------
// Comment schemas
// ---------------------------------------------------------------------------
export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment content is required")
    .max(5000, "Comment must be 5000 characters or fewer"),
});

// ---------------------------------------------------------------------------
// Password policy — enterprise-grade complexity requirements
// ---------------------------------------------------------------------------
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be 128 characters or fewer")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

// ---------------------------------------------------------------------------
// User schemas
// ---------------------------------------------------------------------------
// Allowed email domain for user registration
const ALLOWED_EMAIL_DOMAIN = "jis.gov.jm";

export const govEmailSchema = z
  .string()
  .email("Must be a valid email address")
  .max(254, "Email must be 254 characters or fewer")
  .refine(
    (email) => email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`),
    { message: `Only @${ALLOWED_EMAIL_DOMAIN} email addresses are permitted` },
  );

export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name must be 200 characters or fewer"),
  email: govEmailSchema,
  password: passwordSchema,
  roleId: z.string().optional().nullable(),
});

export const updateRoleSchema = z.object({
  name: z
    .string()
    .min(1, "Role name is required")
    .max(100, "Role name must be 100 characters or fewer")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9 \-]*$/,
      "Role name must start with an alphanumeric character and contain only letters, numbers, spaces, and hyphens"
    )
    .optional(),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .nullable(),
});

export const addUserRoleSchema = z.object({
  roleId: z.string().min(1, "roleId is required"),
});

// ---------------------------------------------------------------------------
// System settings schema
// ---------------------------------------------------------------------------
export const systemSettingsSchema = z.object({
  defaultSlaDays: z.number().int().min(1).max(365).optional(),
  sessionTimeoutHours: z.number().int().min(1).max(168).optional(),
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
});

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;

// ---------------------------------------------------------------------------
// Export types for convenience
// ---------------------------------------------------------------------------
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type StartInstanceInput = z.infer<typeof startInstanceSchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;
export type ApprovalInput = z.infer<typeof approvalSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
