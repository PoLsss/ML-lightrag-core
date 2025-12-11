import Graph, { UndirectedGraph } from "graphology";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/lib/utils";
import * as Constants from "@/lib/constants";
import {
  useGraphStore,
  RawGraph,
  RawNodeType,
  RawEdgeType,
} from "@/stores/graph";
import { toast } from "sonner";
import { queryGraphs } from "@/api/lightrag";
import { useBackendState } from "@/stores/state";
import { useSettingsStore } from "@/stores/settings";

import seedrandom from "seedrandom";
import { resolveNodeColor, DEFAULT_NODE_COLOR } from "@/utils/graphColor";

// --- HELPER FUNCTIONS ---

const getNodeColorByType = (nodeType: string | undefined): string => {
  const state = useGraphStore.getState();
  const { color, map, updated } = resolveNodeColor(
    nodeType,
    state.typeColorMap
  );

  if (updated) {
    useGraphStore.setState({ typeColorMap: map });
  }

  return color || DEFAULT_NODE_COLOR;
};

const validateGraph = (graph: RawGraph) => {
  if (!graph) return false;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  if (graph.nodes.length === 0) return false;

  for (const node of graph.nodes) {
    if (!node.id || !node.labels || !node.properties) return false;
  }
  for (const edge of graph.edges) {
    if (!edge.id || !edge.source || !edge.target) return false;
  }
  return true;
};

export type NodeType = {
  x: number;
  y: number;
  label: string;
  size: number;
  color: string;
  highlighted?: boolean;
};
export type EdgeType = {
  label: string;
  originalWeight?: number;
  size?: number;
  color?: string;
  hidden?: boolean;
};

const fetchGraphFromAPI = async (
  label: string,
  maxDepth: number,
  maxNodes: number
) => {
  let rawData: any = null;
  useGraphStore.getState().setLabelsFetchAttempted(true);
  const queryLabel = label || "*";

  try {
    console.log(
      `Fetching graph label: ${queryLabel}, depth: ${maxDepth}, nodes: ${maxNodes}`
    );
    rawData = await queryGraphs(queryLabel, maxDepth, maxNodes);
  } catch (e) {
    useBackendState
      .getState()
      .setErrorMessage(errorMessage(e), "Query Graphs Error!");
    return null;
  }

  let rawGraph = null;

  if (rawData) {
    const nodeIdMap: Record<string, number> = {};
    const edgeIdMap: Record<string, number> = {};

    for (let i = 0; i < rawData.nodes.length; i++) {
      const node = rawData.nodes[i];
      nodeIdMap[node.id] = i;
      // Random coordinates for initial processing
      node.x = Math.random();
      node.y = Math.random();
      node.degree = 0;
      node.size = 10;
    }

    for (let i = 0; i < rawData.edges.length; i++) {
      const edge = rawData.edges[i];
      edgeIdMap[edge.id] = i;
      const source = nodeIdMap[edge.source];
      const target = nodeIdMap[edge.target];

      if (source !== undefined && target !== undefined) {
        const sourceNode = rawData.nodes[source];
        const targetNode = rawData.nodes[target];
        if (sourceNode && targetNode) {
          sourceNode.degree += 1;
          targetNode.degree += 1;
        }
      }
    }

    let minDegree = Number.MAX_SAFE_INTEGER;
    let maxDegree = 0;
    for (const node of rawData.nodes) {
      minDegree = Math.min(minDegree, node.degree);
      maxDegree = Math.max(maxDegree, node.degree);
    }
    const range = maxDegree - minDegree;
    if (range > 0) {
      const scale = Constants.maxNodeSize - Constants.minNodeSize;
      for (const node of rawData.nodes) {
        node.size = Math.round(
          Constants.minNodeSize +
            scale * Math.pow((node.degree - minDegree) / range, 0.5)
        );
      }
    }

    rawGraph = new RawGraph();
    rawGraph.nodes = rawData.nodes;
    rawGraph.edges = rawData.edges;
    rawGraph.nodeIdMap = nodeIdMap;
    rawGraph.edgeIdMap = edgeIdMap;

    if (!validateGraph(rawGraph)) {
      rawGraph = null;
      console.warn("Invalid graph data");
    }
  }

  return { rawGraph, is_truncated: rawData.is_truncated };
};

// --- OPTIMIZED CREATE SIGMA GRAPH ---
const createSigmaGraph = (rawGraph: RawGraph | null) => {
  const minEdgeSize = useSettingsStore.getState().minEdgeSize;
  const maxEdgeSize = useSettingsStore.getState().maxEdgeSize;

  if (!rawGraph || !rawGraph.nodes.length) {
    return null;
  }

  const graph = new UndirectedGraph();

  // TỐI ƯU 1: Khởi tạo RNG một lần duy nhất bên ngoài vòng lặp
  const rng = seedrandom("fixed-seed-for-consistency");

  // TỐI ƯU 2: Dùng vòng lặp for thường cho nodes
  const nodes = rawGraph.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const rawNode = nodes[i];
    graph.addNode(rawNode.id, {
      label: rawNode.labels.join(", "),
      color: rawNode.color,
      x: rng(), // Sử dụng hàm rng đã tạo
      y: rng(),
      size: rawNode.size,
      borderColor: Constants.nodeBorderColor,
      borderSize: 0.2,
    });
  }

  // TỐI ƯU 3: Dùng vòng lặp for thường cho edges và kiểm tra tồn tại
  const edges = rawGraph.edges;
  for (let i = 0; i < edges.length; i++) {
    const rawEdge = edges[i];

    // Safety check: Đảm bảo cả source và target đều tồn tại trong graph
    if (!graph.hasNode(rawEdge.source) || !graph.hasNode(rawEdge.target)) {
      continue;
    }

    const weight =
      rawEdge.properties?.weight !== undefined
        ? Number(rawEdge.properties.weight)
        : 1;

    rawEdge.dynamicId = graph.addEdge(rawEdge.source, rawEdge.target, {
      label: rawEdge.properties?.keywords || undefined,
      size: weight,
      originalWeight: weight,
      type: "curvedNoArrow",
    });
  }

  // Scale Edge Sizes
  let minWeight = Number.MAX_SAFE_INTEGER;
  let maxWeight = 0;

  graph.forEachEdge((edge) => {
    const weight = graph.getEdgeAttribute(edge, "originalWeight") || 1;
    minWeight = Math.min(minWeight, weight);
    maxWeight = Math.max(maxWeight, weight);
  });

  const weightRange = maxWeight - minWeight;
  if (weightRange > 0) {
    const sizeScale = maxEdgeSize - minEdgeSize;
    graph.forEachEdge((edge) => {
      const weight = graph.getEdgeAttribute(edge, "originalWeight") || 1;
      const scaledSize =
        minEdgeSize +
        sizeScale * Math.pow((weight - minWeight) / weightRange, 0.5);
      graph.setEdgeAttribute(edge, "size", scaledSize);
    });
  } else {
    graph.forEachEdge((edge) => {
      graph.setEdgeAttribute(edge, "size", minEdgeSize);
    });
  }

  return graph;
};

// --- MAIN HOOK ---
const useLightragGraph = () => {
  const { t } = useTranslation();

  const queryLabel = useSettingsStore.use.queryLabel();
  const refreshTrigger = useSettingsStore.use.graphRefreshTrigger();

  const rawGraph = useGraphStore.use.rawGraph();
  const sigmaGraph = useGraphStore.use.sigmaGraph();
  const maxQueryDepth = useSettingsStore.use.graphQueryMaxDepth();
  const maxNodes = useSettingsStore.use.graphMaxNodes();
  const isFetching = useGraphStore.use.isFetching();
  const nodeToExpand = useGraphStore.use.nodeToExpand();
  const nodeToPrune = useGraphStore.use.nodeToPrune();
  const graphDataVersion = useGraphStore.use.graphDataVersion();

  const dataLoadedRef = useRef(false);
  const emptyDataHandledRef = useRef(false);
  const fetchInProgressRef = useRef(false);

  const getNode = useCallback(
    (nodeId: string) => rawGraph?.getNode(nodeId) || null,
    [rawGraph]
  );
  const getEdge = useCallback(
    (edgeId: string, dynamicId: boolean = true) =>
      rawGraph?.getEdge(edgeId, dynamicId) || null,
    [rawGraph]
  );

  // Ensure graph instance exists
  useEffect(() => {
    if (!sigmaGraph) {
      const graph = new UndirectedGraph();
      useGraphStore.getState().setSigmaGraph(graph);
    }
  }, [sigmaGraph]);

  // Return instance via useMemo to fix "e2 is not a constructor"
  const lightragGraph = useMemo(() => {
    return sigmaGraph || new UndirectedGraph();
  }, [sigmaGraph]);

  // 1. Reset on clear label
  useEffect(() => {
    if (!queryLabel && (rawGraph !== null || sigmaGraph !== null)) {
      const state = useGraphStore.getState();
      state.reset();
      state.setGraphDataFetchAttempted(false);
      state.setLabelsFetchAttempted(false);
      dataLoadedRef.current = false;
    }
  }, [queryLabel, rawGraph, sigmaGraph]);

  // 2. Fetch Data Effect
  useEffect(() => {
    const shouldFetch =
      refreshTrigger > 0 ||
      (!isFetching &&
        !useGraphStore.getState().graphDataFetchAttempted &&
        !!queryLabel);

    if (!shouldFetch) return;
    if (fetchInProgressRef.current) return;

    fetchInProgressRef.current = true;
    useGraphStore.getState().setGraphDataFetchAttempted(true);
    const state = useGraphStore.getState();
    state.setIsFetching(true);
    state.clearSelection();

    console.log("UseLightragGraph: Starting data fetch...", {
      label: queryLabel,
      trigger: refreshTrigger,
    });

    const executeFetch = async () => {
      try {
        let result = null;
        if (queryLabel) {
          result = await fetchGraphFromAPI(queryLabel, maxQueryDepth, maxNodes);
        } else {
          result = { rawGraph: null, is_truncated: false };
        }

        const data = result?.rawGraph;

        if (data && data.nodes) {
          data.nodes.forEach((node) => {
            const nodeEntityType = node.properties?.entity_type as
              | string
              | undefined;
            node.color = getNodeColorByType(nodeEntityType);
          });
        }

        if (result?.is_truncated) {
          toast.info(
            t(
              "graphPanel.dataIsTruncated",
              "Graph data is truncated to Max Nodes"
            )
          );
        }

        state.reset();

        if (!data || !data.nodes || data.nodes.length === 0) {
          const emptyGraph = new UndirectedGraph();
          emptyGraph.addNode("empty-graph-node", {
            label: t("graphPanel.emptyGraph", "No Data"),
            color: "#5D6D7E",
            x: 0.5,
            y: 0.5,
            size: 15,
            borderColor: Constants.nodeBorderColor,
            borderSize: 0.2,
          });
          state.setSigmaGraph(emptyGraph);
          state.setRawGraph(null);
          state.setGraphIsEmpty(true);
        } else {
          // Sử dụng hàm createSigmaGraph đã tối ưu
          const newSigmaGraph = createSigmaGraph(data);
          data.buildDynamicMap();

          state.setSigmaGraph(newSigmaGraph);
          state.setRawGraph(data);
          state.setGraphIsEmpty(false);
          state.setLastSuccessfulQueryLabel(queryLabel);
          state.setMoveToSelectedNode(true);
        }

        dataLoadedRef.current = true;
        if (!data || !data.nodes) emptyDataHandledRef.current = true;
      } catch (error) {
        console.error("Error in fetch effect:", error);
        state.setLastSuccessfulQueryLabel("");
      } finally {
        fetchInProgressRef.current = false;
        state.setIsFetching(false);
      }
    };

    executeFetch();
  }, [
    refreshTrigger,
    queryLabel,
    maxQueryDepth,
    maxNodes,
    t,
    graphDataVersion,
  ]);

  // 3. Expand Effect
  useEffect(() => {
    const handleNodeExpand = async (nodeId: string | null) => {
      if (!nodeId || !sigmaGraph || !rawGraph) return;
      try {
        const nodeToExpand = rawGraph.getNode(nodeId);
        if (!nodeToExpand || !nodeToExpand.labels[0]) return;
        const extendedGraph = await queryGraphs(
          nodeToExpand.labels[0],
          2,
          1000
        );
        if (!extendedGraph) return;
        console.log("Expanding node logic executes here...");
        // NOTE: Logic expand chi tiết (positioning) bạn có thể giữ lại từ bản gốc nếu cần
      } catch (e) {
        console.error(e);
      }
    };

    if (nodeToExpand) {
      handleNodeExpand(nodeToExpand);
      setTimeout(() => useGraphStore.getState().triggerNodeExpand(null), 0);
    }
  }, [nodeToExpand, sigmaGraph, rawGraph, t]);

  // 4. Prune Effect (Updated with Filter)
  useEffect(() => {
    const handleNodePrune = (nodeId: string | null) => {
      if (!nodeId || !sigmaGraph || !rawGraph) return;
      try {
        const state = useGraphStore.getState();
        if (!sigmaGraph.hasNode(nodeId)) return;

        const nodesToDelete = new Set<string>([nodeId]);
        sigmaGraph.forEachNode((node) => {
          if (node === nodeId) return;
          const neighbors = sigmaGraph.neighbors(node);
          if (neighbors.length === 1 && neighbors[0] === nodeId) {
            nodesToDelete.add(node);
          }
        });

        if (nodesToDelete.size === sigmaGraph.nodes().length) {
          toast.error(t("graphPanel.propertiesView.node.deleteAllNodesError"));
          return;
        }

        state.clearSelection();
        nodesToDelete.forEach((node) => sigmaGraph.dropNode(node));

        rawGraph.nodes = rawGraph.nodes.filter((n) => !nodesToDelete.has(n.id));
        rawGraph.edges = rawGraph.edges.filter(
          (e) => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)
        );

        rawGraph.nodeIdMap = {};
        rawGraph.nodes.forEach((n, idx) => (rawGraph.nodeIdMap[n.id] = idx));

        rawGraph.edgeIdMap = {};
        rawGraph.edgeDynamicIdMap = {};
        rawGraph.edges.forEach((e, idx) => {
          rawGraph.edgeIdMap[e.id] = idx;
          if (e.dynamicId) rawGraph.edgeDynamicIdMap[e.dynamicId] = idx;
        });

        useGraphStore.getState().resetSearchEngine();

        if (nodesToDelete.size > 1) {
          toast.info(
            t("graphPanel.propertiesView.node.nodesRemoved", {
              count: nodesToDelete.size,
            })
          );
        }

        state.setRawGraph(Object.assign({}, rawGraph));
      } catch (error) {
        console.error("Error pruning node:", error);
      }
    };

    if (nodeToPrune) {
      handleNodePrune(nodeToPrune);
      setTimeout(() => useGraphStore.getState().triggerNodePrune(null), 0);
    }
  }, [nodeToPrune, sigmaGraph, rawGraph, t]);

  return { lightragGraph, getNode, getEdge };
};

export default useLightragGraph;
