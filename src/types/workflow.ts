import type {
  WorkflowTemplate,
  WorkflowNode,
  WorkflowEdge,
  WorkflowInstance,
  TaskInstance,
  Approval,
  AuditLog,
  User,
  Role,
  UserRole,
  WorkflowNodeRoleAssignment,
  Comment,
} from "@/generated/prisma/client";

// Template with all relations
export type TemplateWithRelations = WorkflowTemplate & {
  nodes: (WorkflowNode & {
    roleAssignments: (WorkflowNodeRoleAssignment & { role: Role })[];
  })[];
  edges: WorkflowEdge[];
  createdBy: Pick<User, "id" | "name" | "email">;
  _count?: { instances: number };
};

// Instance with all relations
export type InstanceWithRelations = WorkflowInstance & {
  template: Pick<WorkflowTemplate, "id" | "name">;
  owner: Pick<User, "id" | "name" | "email">;
  taskInstances: (TaskInstance & {
    node: WorkflowNode;
    assignee: Pick<User, "id" | "name" | "email"> | null;
    approvals: (Approval & {
      decider: Pick<User, "id" | "name" | "email"> | null;
    })[];
  })[];
};

// Task with relations for "My Tasks" view
export type TaskWithRelations = TaskInstance & {
  node: WorkflowNode;
  assignee: Pick<User, "id" | "name" | "email"> | null;
  instance: WorkflowInstance & {
    template: Pick<WorkflowTemplate, "id" | "name">;
    owner: Pick<User, "id" | "name" | "email">;
  };
  approvals: (Approval & {
    decider: Pick<User, "id" | "name" | "email"> | null;
  })[];
};

// Audit log with user
export type AuditLogWithUser = AuditLog & {
  user: Pick<User, "id" | "name" | "email">;
};

// User with roles
export type UserWithRoles = User & {
  roles: (UserRole & { role: Role })[];
};

// Comment with user
export type CommentWithUser = Comment & {
  user: Pick<User, "id" | "name" | "email">;
};
