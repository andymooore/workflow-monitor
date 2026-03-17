"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  FolderOpen,
  Users,
  Workflow,
  Landmark,
  BookOpen,
  Search,
  Loader2,
  Filter,
  X,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GraphNodeData {
  id: string;
  type: "client" | "project" | "user" | "workflow" | "ministry" | "article";
  label: string;
  metadata: Record<string, unknown>;
}

interface GraphEdgeData {
  source: string;
  target: string;
  label: string;
}

interface GraphResponse {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

// ---------------------------------------------------------------------------
// Color & config per entity type
// ---------------------------------------------------------------------------
const ENTITY_CONFIG: Record<
  string,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    darkBgColor: string;
    darkBorderColor: string;
    icon: typeof Building2;
    label: string;
  }
> = {
  client: {
    color: "#3b82f6",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-400",
    darkBgColor: "dark:bg-blue-950",
    darkBorderColor: "dark:border-blue-600",
    icon: Building2,
    label: "Clients",
  },
  project: {
    color: "#22c55e",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-400",
    darkBgColor: "dark:bg-emerald-950",
    darkBorderColor: "dark:border-emerald-600",
    icon: FolderOpen,
    label: "Projects",
  },
  user: {
    color: "#a855f7",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-400",
    darkBgColor: "dark:bg-purple-950",
    darkBorderColor: "dark:border-purple-600",
    icon: Users,
    label: "Users",
  },
  workflow: {
    color: "#f59e0b",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-400",
    darkBgColor: "dark:bg-amber-950",
    darkBorderColor: "dark:border-amber-600",
    icon: Workflow,
    label: "Workflows",
  },
  ministry: {
    color: "#64748b",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-400",
    darkBgColor: "dark:bg-slate-900",
    darkBorderColor: "dark:border-slate-600",
    icon: Landmark,
    label: "Ministries",
  },
  article: {
    color: "#06b6d4",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-400",
    darkBgColor: "dark:bg-cyan-950",
    darkBorderColor: "dark:border-cyan-600",
    icon: BookOpen,
    label: "Articles",
  },
};

// ---------------------------------------------------------------------------
// Layout: Simple force-directed-like positioning
// ---------------------------------------------------------------------------
function layoutNodes(graphNodes: GraphNodeData[]): Node[] {
  // Group nodes by type for tiered layout
  const groups: Record<string, GraphNodeData[]> = {};
  for (const node of graphNodes) {
    if (!groups[node.type]) groups[node.type] = [];
    groups[node.type].push(node);
  }

  const typeOrder = [
    "ministry",
    "client",
    "project",
    "user",
    "workflow",
    "article",
  ];
  const rfNodes: Node[] = [];

  let yOffset = 0;
  for (const type of typeOrder) {
    const nodesOfType = groups[type] ?? [];
    if (nodesOfType.length === 0) continue;

    const cols = Math.min(nodesOfType.length, 6);
    const xSpacing = 320;
    const ySpacing = 180;
    const startX =
      -(cols * xSpacing) / 2 + xSpacing / 2;

    nodesOfType.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      rfNodes.push({
        id: node.id,
        position: {
          x: startX + col * xSpacing + (row % 2 === 1 ? xSpacing / 2 : 0),
          y: yOffset + row * ySpacing,
        },
        data: {
          label: node.label,
          entityType: node.type,
          metadata: node.metadata,
        },
        type: "graphNode",
        style: {
          width: 260,
        },
      });
    });

    const rows = Math.ceil(nodesOfType.length / cols);
    yOffset += rows * ySpacing + 120;
  }

  return rfNodes;
}

function layoutEdges(graphEdges: GraphEdgeData[]): Edge[] {
  return graphEdges.map((edge, idx) => ({
    id: `edge-${idx}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "default",
    animated: false,
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "#94a3b8" },
    labelBgStyle: { fill: "transparent" },
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#94a3b8" },
  }));
}

// ---------------------------------------------------------------------------
// Custom Node Component
// ---------------------------------------------------------------------------
function GraphNodeComponent({ data, selected }: { data: Record<string, unknown>; selected?: boolean }) {
  const entityType = data.entityType as string;
  const label = data.label as string;
  const metadata = data.metadata as Record<string, unknown>;
  const config = ENTITY_CONFIG[entityType] ?? ENTITY_CONFIG.client;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 shadow-sm transition-all cursor-pointer",
        config.bgColor,
        config.borderColor,
        config.darkBgColor,
        config.darkBorderColor,
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md"
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: config.color + "20" }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">
            {label}
          </p>
          {metadata.status && (
            <p className="truncate text-[10px] text-muted-foreground">
              {String(metadata.status)}
            </p>
          )}
          {metadata.email && (
            <p className="truncate text-[10px] text-muted-foreground">
              {String(metadata.email)}
            </p>
          )}
          {metadata.shortCode && (
            <p className="truncate text-[10px] text-muted-foreground">
              {String(metadata.shortCode)}
            </p>
          )}
          {metadata.slug && (
            <p className="truncate text-[10px] text-muted-foreground">
              /{String(metadata.slug)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  graphNode: GraphNodeComponent,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function KnowledgeGraphPage() {
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(["client", "project", "user", "workflow", "ministry", "article"])
  );

  // Side panel
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch graph data
  useEffect(() => {
    setIsLoading(true);
    fetch("/api/knowledge/graph")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch graph data");
        return r.json();
      })
      .then((data: GraphResponse) => {
        setGraphData(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Apply filters and layout
  useEffect(() => {
    if (!graphData) return;

    let filteredNodes = graphData.nodes.filter((n) =>
      visibleTypes.has(n.type)
    );

    // Search filter — highlight matching nodes by filtering
    if (search.trim()) {
      const q = search.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q)
      );
    }

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredEdges = graphData.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );

    setNodes(layoutNodes(filteredNodes));
    setEdges(layoutEdges(filteredEdges));
  }, [graphData, visibleTypes, search, setNodes, setEdges]);

  const toggleType = useCallback(
    (type: string) => {
      setVisibleTypes((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      });
    },
    []
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!graphData) return;
      const found = graphData.nodes.find((n) => n.id === node.id);
      setSelectedNode(found ?? null);
    },
    [graphData]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Count nodes per type from original data
  const typeCounts = useMemo(() => {
    if (!graphData) return {};
    const counts: Record<string, number> = {};
    for (const n of graphData.nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts;
  }, [graphData]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Building knowledge graph...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Link href="/knowledge">
            <Button variant="outline" size="sm">
              Back to Knowledge Base
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/knowledge">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              Knowledge Graph
            </h1>
            <p className="text-xs text-muted-foreground">
              {graphData?.nodes.length ?? 0} entities,{" "}
              {graphData?.edges.length ?? 0} relationships
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Graph Area */}
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls className="!bg-card !border-border !shadow-md" />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="!bg-muted/50"
            nodeColor={(node) => {
              const entityType = (node.data as Record<string, unknown>)?.entityType as string;
              return ENTITY_CONFIG[entityType]?.color ?? "#64748b";
            }}
          />

          {/* Filter Panel */}
          <Panel position="top-left" className="!m-3">
            <Card className="w-52 shadow-lg">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
                  <Filter className="h-3 w-3" />
                  Entity Types
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                {Object.entries(ENTITY_CONFIG).map(([type, config]) => {
                  const Icon = config.icon;
                  const count = typeCounts[type] ?? 0;
                  const isVisible = visibleTypes.has(type);

                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all",
                        isVisible
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground opacity-50 hover:opacity-75"
                      )}
                    >
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded"
                        style={{
                          backgroundColor: isVisible
                            ? config.color + "20"
                            : "transparent",
                        }}
                      >
                        <Icon
                          className="h-3 w-3"
                          style={{
                            color: isVisible ? config.color : "#94a3b8",
                          }}
                        />
                      </div>
                      <span className="flex-1 text-left">{config.label}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </Panel>
        </ReactFlow>

        {/* Detail Side Panel */}
        {selectedNode && (
          <div className="absolute top-3 right-3 z-10 w-72">
            <Card className="shadow-lg">
              <CardHeader className="p-4 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const config =
                        ENTITY_CONFIG[selectedNode.type] ??
                        ENTITY_CONFIG.client;
                      const Icon = config.icon;
                      return (
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: config.color + "20",
                          }}
                        >
                          <Icon
                            className="h-4 w-4"
                            style={{ color: config.color }}
                          />
                        </div>
                      );
                    })()}
                    <div>
                      <CardTitle className="text-sm font-semibold line-clamp-2">
                        {selectedNode.label}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px] capitalize"
                      >
                        {selectedNode.type}
                      </Badge>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-2">
                  {Object.entries(selectedNode.metadata).map(
                    ([key, value]) => {
                      if (value === null || value === undefined) return null;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground capitalize">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          <span className="font-medium text-foreground truncate max-w-[140px]">
                            {String(value)}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* Connections */}
                {graphData && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Connections
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {graphData.edges
                        .filter(
                          (e) =>
                            e.source === selectedNode.id ||
                            e.target === selectedNode.id
                        )
                        .slice(0, 15)
                        .map((edge, idx) => {
                          const isSource =
                            edge.source === selectedNode.id;
                          const otherId = isSource
                            ? edge.target
                            : edge.source;
                          const otherNode = graphData.nodes.find(
                            (n) => n.id === otherId
                          );

                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                            >
                              <span className="text-[10px] shrink-0 rounded bg-muted px-1.5 py-0.5">
                                {edge.label}
                              </span>
                              <span className="truncate font-medium text-foreground">
                                {otherNode?.label ?? otherId}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
