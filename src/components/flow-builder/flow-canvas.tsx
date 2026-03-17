"use client";

import { useCallback, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useFlowBuilderStore } from "@/stores/flow-builder-store";
import type { FlowNodeType, WorkflowNodeData } from "@/types/flow";

import { StartNode } from "./custom-nodes/start-node";
import { EndNode } from "./custom-nodes/end-node";
import { TaskNode } from "./custom-nodes/task-node";
import { ApprovalNode } from "./custom-nodes/approval-node";
import { ConditionNode } from "./custom-nodes/condition-node";
import { LabeledEdge } from "./custom-edges/labeled-edge";

// Register node and edge types OUTSIDE the component to avoid
// re-creating the objects on every render (critical for React Flow perf).
const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  task: TaskNode,
  approval: ApprovalNode,
  condition: ConditionNode,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

export function FlowCanvas() {
  const nodes = useFlowBuilderStore((s) => s.nodes);
  const edges = useFlowBuilderStore((s) => s.edges);
  const onNodesChange = useFlowBuilderStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowBuilderStore((s) => s.onEdgesChange);
  const onConnect = useFlowBuilderStore((s) => s.onConnect);
  const addNode = useFlowBuilderStore((s) => s.addNode);
  const selectNode = useFlowBuilderStore((s) => s.selectNode);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData(
        "application/reactflow-node-type"
      ) as FlowNodeType;

      if (!nodeType) return;

      // Get the position relative to the ReactFlow canvas.
      // We use the bounding rect of the drop target to compute the offset.
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      addNode(nodeType, position);
    },
    [addNode]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<WorkflowNodeData>) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{ type: "labeled" }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-muted/50"
        />
      </ReactFlow>
    </div>
  );
}
