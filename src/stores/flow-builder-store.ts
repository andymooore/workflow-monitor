import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import type {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  XYPosition,
} from "@xyflow/react";
import type { FlowNodeType, WorkflowNodeData, LabeledEdgeData } from "@/types/flow";

interface FlowBuilderState {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge<LabeledEdgeData>[];
  selectedNodeId: string | null;
  isDirty: boolean;
  templateId: string | null;
  templateName: string;
  templateDescription: string;
  templateCategory: string;
  templateIntakeForm: {
    steps: Array<{
      id: string;
      title: string;
      description: string;
      fields: Array<{
        id: string;
        label: string;
        type: "text" | "textarea" | "select" | "date" | "number";
        required: boolean;
        placeholder: string;
        options: string[];
        defaultValue: string;
      }>;
    }>;
  };

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: FlowNodeType, position: XYPosition) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  selectNode: (nodeId: string | null) => void;
  setTemplateName: (name: string) => void;
  setTemplateDescription: (description: string) => void;
  setTemplateCategory: (category: string) => void;
  setTemplateIntakeForm: (form: FlowBuilderState["templateIntakeForm"]) => void;
  setTemplateId: (id: string | null) => void;
  loadTemplate: (data: {
    id: string;
    name: string;
    description: string;
    category: string;
    intakeForm: FlowBuilderState["templateIntakeForm"] | Array<{
      id: string;
      label: string;
      type: "text" | "textarea" | "select" | "date" | "number";
      required: boolean;
      placeholder: string;
      options: string[];
      defaultValue: string;
    }>;
    nodes: Node<WorkflowNodeData>[];
    edges: Edge<LabeledEdgeData>[];
  }) => void;
  reset: () => void;
  markClean: () => void;
}

let nodeIdCounter = 0;
function generateNodeId() {
  nodeIdCounter++;
  return `node_${Date.now()}_${nodeIdCounter}`;
}

function getDefaultData(type: FlowNodeType): WorkflowNodeData {
  switch (type) {
    case "start":
      return { label: "Start" };
    case "end":
      return { label: "End" };
    case "task":
      return { label: "New Task", description: "", assignedRoleIds: [], handbackToOwner: false };
    case "approval":
      return { label: "Approval", strategy: "ALL_MUST_APPROVE", requiredCount: 1, approverRoleIds: [], instructions: "" };
    case "condition":
      return { label: "Condition", sourceApprovalNodeId: undefined };
  }
}

export const useFlowBuilderStore = create<FlowBuilderState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isDirty: false,
  templateId: null,
  templateName: "Untitled Workflow",
  templateDescription: "",
  templateCategory: "General",
  templateIntakeForm: { steps: [] },

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as Node<WorkflowNodeData>[],
      isDirty: true,
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges) as Edge<LabeledEdgeData>[],
      isDirty: true,
    });
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(connection, get().edges) as Edge<LabeledEdgeData>[],
      isDirty: true,
    });
  },

  addNode: (type, position) => {
    const id = generateNodeId();
    const newNode: Node<WorkflowNodeData> = {
      id,
      type,
      position,
      data: getDefaultData(type),
    };
    set({
      nodes: [...get().nodes, newNode],
      isDirty: true,
      selectedNodeId: id,
    });
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      isDirty: true,
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  setTemplateName: (name) => {
    set({ templateName: name, isDirty: true });
  },

  setTemplateDescription: (description) => {
    set({ templateDescription: description, isDirty: true });
  },

  setTemplateCategory: (category) => {
    set({ templateCategory: category, isDirty: true });
  },

  setTemplateIntakeForm: (form) => {
    set({ templateIntakeForm: form, isDirty: true });
  },

  setTemplateId: (id) => {
    set({ templateId: id });
  },

  loadTemplate: (data) => {
    // Normalize legacy flat array format to multistep
    let intakeForm = data.intakeForm;
    if (Array.isArray(intakeForm)) {
      // Legacy: convert flat fields to a single default step
      intakeForm = {
        steps: intakeForm.length > 0
          ? [{ id: "default", title: "Request Details", description: "", fields: intakeForm }]
          : [],
      };
    }
    set({
      templateId: data.id,
      templateName: data.name,
      templateDescription: data.description,
      templateCategory: data.category,
      templateIntakeForm: intakeForm,
      nodes: data.nodes,
      edges: data.edges,
      isDirty: false,
      selectedNodeId: null,
    });
  },

  reset: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isDirty: false,
      templateId: null,
      templateName: "Untitled Workflow",
      templateDescription: "",
      templateCategory: "General",
      templateIntakeForm: { steps: [] },
    });
  },

  markClean: () => {
    set({ isDirty: false });
  },
}));
