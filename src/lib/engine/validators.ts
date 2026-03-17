import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeRoleAssignment,
} from "@/generated/prisma/client";
import type { ValidationError } from "./types";

type NodeWithRelations = WorkflowNode & {
  roleAssignments: WorkflowNodeRoleAssignment[];
};

interface TemplateForValidation {
  nodes: NodeWithRelations[];
  edges: WorkflowEdge[];
}

/**
 * Validates a workflow template's structural integrity before it can be
 * published or instantiated.
 */
export class TemplateValidator {
  /**
   * Run all validation rules against the template.
   */
  validate(template: TemplateForValidation): ValidationError[] {
    const errors: ValidationError[] = [];

    errors.push(...this.validateStartNodes(template));
    errors.push(...this.validateEndNodes(template));
    errors.push(...this.validateReachability(template));
    errors.push(...this.validateConditionNodes(template));
    errors.push(...this.validateRoleAssignments(template));

    return errors;
  }

  // ---------------------------------------------------------------------------
  // Rule: exactly one START node
  // ---------------------------------------------------------------------------
  private validateStartNodes(template: TemplateForValidation): ValidationError[] {
    const startNodes = template.nodes.filter((n) => n.type === "START");

    if (startNodes.length === 0) {
      return [{ message: "Template must have exactly one START node" }];
    }
    if (startNodes.length > 1) {
      return startNodes.map((n) => ({
        nodeId: n.id,
        message: `Multiple START nodes found — only one is allowed (node: "${n.label}")`,
      }));
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Rule: at least one END node
  // ---------------------------------------------------------------------------
  private validateEndNodes(template: TemplateForValidation): ValidationError[] {
    const endNodes = template.nodes.filter((n) => n.type === "END");

    if (endNodes.length === 0) {
      return [{ message: "Template must have at least one END node" }];
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Rule: all nodes must be reachable from START (BFS)
  // ---------------------------------------------------------------------------
  private validateReachability(template: TemplateForValidation): ValidationError[] {
    const startNode = template.nodes.find((n) => n.type === "START");
    if (!startNode) {
      // Already reported by validateStartNodes.
      return [];
    }

    // Build adjacency list (source -> targets).
    const adjacency = new Map<string, string[]>();
    for (const edge of template.edges) {
      const targets = adjacency.get(edge.sourceId) ?? [];
      targets.push(edge.targetId);
      adjacency.set(edge.sourceId, targets);
    }

    // BFS from START.
    const visited = new Set<string>();
    const queue: string[] = [startNode.id];
    visited.add(startNode.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbours = adjacency.get(current) ?? [];
      for (const neighbour of neighbours) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    const errors: ValidationError[] = [];
    for (const node of template.nodes) {
      if (!visited.has(node.id)) {
        errors.push({
          nodeId: node.id,
          message: `Node "${node.label}" (${node.id}) is not reachable from the START node`,
        });
      }
    }

    return errors;
  }

  // ---------------------------------------------------------------------------
  // Rule: CONDITION nodes must have exactly 2 outgoing edges —
  //       one APPROVED_PATH and one REJECTED_PATH
  // ---------------------------------------------------------------------------
  private validateConditionNodes(
    template: TemplateForValidation,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const conditionNodes = template.nodes.filter((n) => n.type === "CONDITION");

    for (const node of conditionNodes) {
      const outgoing = template.edges.filter((e) => e.sourceId === node.id);

      if (outgoing.length !== 2) {
        errors.push({
          nodeId: node.id,
          message: `Condition node "${node.label}" must have exactly 2 outgoing edges, found ${outgoing.length}`,
        });
        continue;
      }

      const branches = new Set(
        outgoing.map((e) => e.conditionBranch).filter(Boolean),
      );

      if (!branches.has("APPROVED_PATH")) {
        errors.push({
          nodeId: node.id,
          message: `Condition node "${node.label}" is missing an APPROVED_PATH edge`,
        });
      }
      if (!branches.has("REJECTED_PATH")) {
        errors.push({
          nodeId: node.id,
          message: `Condition node "${node.label}" is missing a REJECTED_PATH edge`,
        });
      }
    }

    return errors;
  }

  // ---------------------------------------------------------------------------
  // Rule: TASK and APPROVAL nodes must have at least one role assignment
  // ---------------------------------------------------------------------------
  private validateRoleAssignments(
    template: TemplateForValidation,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const assignableNodes = template.nodes.filter(
      (n) => n.type === "TASK" || n.type === "APPROVAL",
    );

    for (const node of assignableNodes) {
      if (node.roleAssignments.length === 0) {
        errors.push({
          nodeId: node.id,
          message: `${node.type} node "${node.label}" must have at least one role assignment`,
        });
      }
    }

    return errors;
  }
}
