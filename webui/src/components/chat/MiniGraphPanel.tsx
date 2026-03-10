import { useEffect, useMemo, useState, useCallback } from "react";
import {
  SigmaContainer,
  useSigma,
  useRegisterEvents,
  useSetSettings,
  useCamera,
} from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { UndirectedGraph } from "graphology";
import { NodeBorderProgram } from "@sigma/node-border";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import "@react-sigma/core/lib/style.css";

import { useGraphStore, GraphData } from "@/stores/graph";
import { useSettingsStore } from "@/stores/settings";
import {
  labelColorDarkTheme,
  labelColorLightTheme,
  nodeBorderColor,
  nodeBorderColorSelected,
  nodeColorDisabled,
  edgeColorDarkTheme,
  edgeColorHighlightedDarkTheme,
  edgeColorHighlightedLightTheme,
  minNodeSize,
  maxNodeSize,
} from "@/lib/constants";
import { resolveNodeColor } from "@/utils/graphColor";
import { NetworkIcon, ZoomInIcon, ZoomOutIcon, FullscreenIcon } from "lucide-react";
import seedrandom from "seedrandom";

// ─── Build graphology graph from miniGraphData ───────────────────────────────

function buildGraphologyGraph(data: GraphData): UndirectedGraph {
  const graph = new UndirectedGraph();
  const rng = seedrandom("mini-graph-seed");
  const typeColorMap = new Map<string, string>();

  // Pre-compute degree for node sizing
  const degreeMap: Record<string, number> = {};
  data.relationships?.forEach((rel) => {
    degreeMap[rel.src_id] = (degreeMap[rel.src_id] || 0) + 1;
    degreeMap[rel.tgt_id] = (degreeMap[rel.tgt_id] || 0) + 1;
  });

  const degrees = Object.values(degreeMap);
  const minDeg = degrees.length > 0 ? Math.min(...degrees) : 1;
  const maxDeg = degrees.length > 0 ? Math.max(...degrees) : 1;
  const degRange = maxDeg - minDeg;
  const sizeRange = maxNodeSize - minNodeSize;

  // Add nodes with entity-type coloring
  data.entities?.forEach((entity) => {
    const nodeId = entity.entity_name;
    if (!nodeId || graph.hasNode(nodeId)) return;

    const { color } = resolveNodeColor(entity.entity_type, typeColorMap);
    const degree = degreeMap[nodeId] || 0;
    const size =
      degRange > 0
        ? minNodeSize + sizeRange * Math.sqrt((degree - minDeg) / degRange)
        : (minNodeSize + maxNodeSize) / 2;

    graph.addNode(nodeId, {
      label: nodeId,
      x: rng() * 100,
      y: rng() * 100,
      size: Math.round(size),
      color,
      borderColor: nodeBorderColor,
      borderSize: 0.2,
    });
  });

  // Add edges with curve type and weight-based sizing
  const weights: number[] = [];
  data.relationships?.forEach((rel) => {
    if (graph.hasNode(rel.src_id) && graph.hasNode(rel.tgt_id)) {
      weights.push(rel.weight || 1);
    }
  });
  const minW = weights.length > 0 ? Math.min(...weights) : 1;
  const maxW = weights.length > 0 ? Math.max(...weights) : 1;
  const wRange = maxW - minW;

  data.relationships?.forEach((rel) => {
    if (!graph.hasNode(rel.src_id) || !graph.hasNode(rel.tgt_id)) return;
    if (graph.hasEdge(rel.src_id, rel.tgt_id)) return;

    const w = rel.weight || 1;
    const edgeSize =
      wRange > 0 ? 1 + 3 * Math.sqrt((w - minW) / wRange) : 1.5;

    graph.addEdge(rel.src_id, rel.tgt_id, {
      label: rel.description,
      size: edgeSize,
      originalWeight: w,
      type: "curvedNoArrow",
    });
  });

  return graph;
}

// ─── Inner controller: layout + highlight reducers ───────────────────────────

const MiniGraphController = ({
  graphologyGraph,
}: {
  graphologyGraph: UndirectedGraph;
}) => {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const setSettings = useSetSettings();
  const { assign } = useLayoutForceAtlas2({ iterations: 150 });

  const theme = useSettingsStore.use.theme();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  // Load graph into sigma and apply layout
  useEffect(() => {
    if (!sigma || !graphologyGraph) return;
    try {
      (sigma as any).setGraph(graphologyGraph);
    } catch {
      (sigma as any).graph = graphologyGraph;
    }
    assign();
  }, [sigma, graphologyGraph, assign]);

  // Drag events
  useEffect(() => {
    registerEvents({
      downNode: (e: any) => {
        setDraggedNode(e.node);
      },
      mousemovebody: (e: any) => {
        if (!draggedNode) return;
        const pos = sigma.viewportToGraph(e);
        (sigma.getGraph() as UndirectedGraph).setNodeAttribute(draggedNode, "x", pos.x);
        (sigma.getGraph() as UndirectedGraph).setNodeAttribute(draggedNode, "y", pos.y);
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
      },
      mouseup: () => setDraggedNode(null),
      enterNode: (e: any) => setHoveredNode(e.node),
      leaveNode: () => setHoveredNode(null),
      clickStage: () => setHoveredNode(null),
    });
  }, [registerEvents, sigma, draggedNode]);

  // Visual reducers matching GraphViewer quality
  useEffect(() => {
    const isDark =
      theme === "dark" ||
      document.documentElement.classList.contains("dark");
    const labelColor = isDark ? labelColorDarkTheme : labelColorLightTheme;
    const edgeColor = isDark ? edgeColorDarkTheme : undefined;
    const edgeHighlightColor = isDark
      ? edgeColorHighlightedDarkTheme
      : edgeColorHighlightedLightTheme;

    setSettings({
      renderLabels: true,
      renderEdgeLabels: false,
      nodeReducer: (node, data) => {
        const newData = { ...data, labelColor };
        if (!hoveredNode) return newData;

        try {
          const graph = sigma.getGraph();
          const isNeighbor =
            node === hoveredNode || graph.neighbors(hoveredNode).includes(node);
          if (isNeighbor) {
            newData.highlighted = true;
            if (node === hoveredNode) {
              (newData as any).borderColor = nodeBorderColorSelected;
            }
          } else {
            (newData as any).color = nodeColorDisabled;
            newData.highlighted = false;
          }
        } catch {
          // node may not exist in graph yet
        }
        return newData;
      },
      edgeReducer: (edge, data) => {
        const newData = { ...data, color: edgeColor };
        if (!hoveredNode) return newData;

        try {
          const graph = sigma.getGraph();
          if (graph.extremities(edge).includes(hoveredNode)) {
            (newData as any).color = edgeHighlightColor;
          } else {
            (newData as any).color = nodeColorDisabled;
          }
        } catch {
          // edge may not exist yet
        }
        return newData;
      },
    });
  }, [setSettings, sigma, hoveredNode, theme]);

  return null;
};

// ─── Inline zoom bar ──────────────────────────────────────────────────────────

const MiniZoomBar = () => {
  const { zoomIn, zoomOut, reset } = useCamera({ duration: 200, factor: 1.5 });
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 bg-background/80 backdrop-blur rounded-lg border shadow-sm p-1">
      <button
        onClick={() => zoomIn()}
        className="p-1.5 hover:bg-accent rounded transition-colors"
        title="Zoom In"
      >
        <ZoomInIcon className="size-3.5 text-muted-foreground" />
      </button>
      <button
        onClick={() => zoomOut()}
        className="p-1.5 hover:bg-accent rounded transition-colors"
        title="Zoom Out"
      >
        <ZoomOutIcon className="size-3.5 text-muted-foreground" />
      </button>
      <button
        onClick={() => reset()}
        className="p-1.5 hover:bg-accent rounded transition-colors"
        title="Fit to Screen"
      >
        <FullscreenIcon className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
};

// ─── Main exported component ──────────────────────────────────────────────────

const MiniGraphPanel = () => {
  const theme = useSettingsStore.use.theme();
  const miniGraphData = useGraphStore.use.miniGraphData();

  // Build the graphology graph whenever source data changes
  const graphologyGraph = useMemo(() => {
    if (!miniGraphData?.entities?.length) return null;
    return buildGraphologyGraph(miniGraphData);
  }, [miniGraphData]);

  const sigmaSettings = useMemo(
    () => ({
      allowInvalidContainer: true,
      defaultNodeType: "default",
      defaultEdgeType: "curvedNoArrow",
      renderEdgeLabels: false,
      edgeProgramClasses: {
        curvedNoArrow: createEdgeCurveProgram(),
      },
      nodeProgramClasses: {
        default: NodeBorderProgram,
      },
      labelGridCellSize: 60,
      labelRenderedSizeThreshold: 6,
      enableEdgeEvents: false,
      labelColor: {
        color: theme === "dark" ? labelColorDarkTheme : labelColorLightTheme,
      },
      labelSize: 11,
    }),
    [theme]
  );

  // Empty state
  if (!graphologyGraph) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 text-muted-foreground p-5 text-center select-none">
        <div className="mb-3 p-4 bg-muted rounded-full shadow border">
          <NetworkIcon className="size-8 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium">Send a RAG query to see the</p>
        <p className="text-sm font-bold text-primary mt-1">Knowledge Graph Context</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative bg-card overflow-hidden">
      {/* Node count badge */}
      <div className="absolute top-3 left-3 z-10 bg-background/90 px-3 py-1.5 rounded-md text-xs font-semibold backdrop-blur-md border shadow-sm flex items-center gap-2">
        <span className="text-muted-foreground">Nodes:</span>
        <span className="text-primary font-bold">
          {miniGraphData!.entities!.length}
        </span>
        {miniGraphData!.relationships && (
          <>
            <span className="text-muted-foreground ml-1">Edges:</span>
            <span className="text-primary font-bold">
              {miniGraphData!.relationships.length}
            </span>
          </>
        )}
      </div>

      <SigmaContainer
        key={`mini-graph-${graphologyGraph.order}-${graphologyGraph.size}`}
        style={{ height: "100%", width: "100%" }}
        settings={sigmaSettings}
        className="!bg-transparent"
      >
        <MiniGraphController graphologyGraph={graphologyGraph} />
        <MiniZoomBar />
      </SigmaContainer>
    </div>
  );
};

export default MiniGraphPanel;
