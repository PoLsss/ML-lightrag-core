import { create } from "zustand";
import { createSelectors } from "@/lib/utils";
import { DirectedGraph } from "graphology";
import MiniSearch from "minisearch";
import { resolveNodeColor, DEFAULT_NODE_COLOR } from "@/utils/graphColor";

// ... (Giữ nguyên các type cũ RawNodeType, RawEdgeType, RawGraph)
export type RawNodeType = {
  id: string;
  labels: string[];
  properties: Record<string, any>;
  size: number;
  x: number;
  y: number;
  color: string;
  degree: number;
};

export type RawEdgeType = {
  id: string;
  source: string;
  target: string;
  type?: string;
  properties: Record<string, any>;
  dynamicId: string;
};

export class RawGraph {
  nodes: RawNodeType[] = [];
  edges: RawEdgeType[] = [];
  nodeIdMap: Record<string, number> = {};
  edgeIdMap: Record<string, number> = {};
  edgeDynamicIdMap: Record<string, number> = {};

  getNode = (nodeId: string) => {
    const nodeIndex = this.nodeIdMap[nodeId];
    return nodeIndex !== undefined ? this.nodes[nodeIndex] : undefined;
  };

  getEdge = (edgeId: string, dynamicId: boolean = true) => {
    const edgeIndex = dynamicId
      ? this.edgeDynamicIdMap[edgeId]
      : this.edgeIdMap[edgeId];
    return edgeIndex !== undefined ? this.edges[edgeIndex] : undefined;
  };

  buildDynamicMap = () => {
    this.edgeDynamicIdMap = {};
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      this.edgeDynamicIdMap[edge.dynamicId] = i;
    }
  };
}

// [NEW] Type cho dữ liệu đồ thị con từ Chat API
export type GraphData = {
  entities: Array<{
    entity_name: string;
    entity_type?: string;
    description?: string;
  }>;
  relationships: Array<{
    src_id: string;
    tgt_id: string;
    description?: string;
    weight?: number;
  }>;
  chunks?: any[];
};

interface GraphState {
  selectedNode: string | null;
  focusedNode: string | null;
  selectedEdge: string | null;
  focusedEdge: string | null;

  rawGraph: RawGraph | null;
  sigmaGraph: DirectedGraph | null;
  sigmaInstance: any | null;

  searchEngine: MiniSearch | null;

  moveToSelectedNode: boolean;
  isFetching: boolean;
  graphIsEmpty: boolean;
  lastSuccessfulQueryLabel: string;

  typeColorMap: Map<string, string>;

  graphDataFetchAttempted: boolean;
  labelsFetchAttempted: boolean;

  // [UPDATED] State chứa dữ liệu đồ thị con (thay vì chỉ danh sách tên node)
  miniGraphData: GraphData | null;
  setMiniGraphData: (data: GraphData | null) => void;

  setSigmaInstance: (instance: any) => void;
  setSelectedNode: (
    nodeId: string | null,
    moveToSelectedNode?: boolean
  ) => void;
  setFocusedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setFocusedEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  reset: () => void;

  setMoveToSelectedNode: (moveToSelectedNode: boolean) => void;
  setGraphIsEmpty: (isEmpty: boolean) => void;
  setLastSuccessfulQueryLabel: (label: string) => void;

  setRawGraph: (rawGraph: RawGraph | null) => void;
  setSigmaGraph: (sigmaGraph: DirectedGraph | null) => void;
  setIsFetching: (isFetching: boolean) => void;

  setTypeColorMap: (typeColorMap: Map<string, string>) => void;
  setSearchEngine: (engine: MiniSearch | null) => void;
  resetSearchEngine: () => void;

  setGraphDataFetchAttempted: (attempted: boolean) => void;
  setLabelsFetchAttempted: (attempted: boolean) => void;

  triggerNodeExpand: (nodeId: string | null) => void;
  triggerNodePrune: (nodeId: string | null) => void;

  nodeToExpand: string | null;
  nodeToPrune: string | null;

  graphDataVersion: number;
  incrementGraphDataVersion: () => void;

  updateNodeAndSelect: (
    nodeId: string,
    entityId: string,
    propertyName: string,
    newValue: string
  ) => Promise<void>;
  updateEdgeAndSelect: (
    edgeId: string,
    dynamicId: string,
    sourceId: string,
    targetId: string,
    propertyName: string,
    newValue: string
  ) => Promise<void>;

  focusOnSubgraph: (nodeIds: string[]) => void;
  resetGraphView: () => void;
}

const useGraphStoreBase = create<GraphState>()((set, get) => ({
  // [NEW] Init state
  miniGraphData: null,
  setMiniGraphData: (data) => set({ miniGraphData: data }),

  selectedNode: null,
  focusedNode: null,
  selectedEdge: null,
  focusedEdge: null,
  moveToSelectedNode: false,
  isFetching: false,
  graphIsEmpty: false,
  lastSuccessfulQueryLabel: "",
  graphDataFetchAttempted: false,
  labelsFetchAttempted: false,
  rawGraph: null,
  sigmaGraph: null,
  sigmaInstance: null,
  typeColorMap: new Map<string, string>(),
  searchEngine: null,
  nodeToExpand: null,
  nodeToPrune: null,
  graphDataVersion: 0,

  setGraphIsEmpty: (isEmpty) => set({ graphIsEmpty: isEmpty }),
  setLastSuccessfulQueryLabel: (label) =>
    set({ lastSuccessfulQueryLabel: label }),
  setIsFetching: (isFetching) => set({ isFetching }),
  setSelectedNode: (nodeId, moveToSelectedNode) =>
    set({ selectedNode: nodeId, moveToSelectedNode }),
  setFocusedNode: (nodeId) => set({ focusedNode: nodeId }),
  setSelectedEdge: (edgeId) => set({ selectedEdge: edgeId }),
  setFocusedEdge: (edgeId) => set({ focusedEdge: edgeId }),
  clearSelection: () =>
    set({
      selectedNode: null,
      focusedNode: null,
      selectedEdge: null,
      focusedEdge: null,
    }),

  reset: () => {
    set({
      selectedNode: null,
      focusedNode: null,
      selectedEdge: null,
      focusedEdge: null,
      rawGraph: null,
      sigmaGraph: null,
      searchEngine: null,
      moveToSelectedNode: false,
      graphIsEmpty: false,
      miniGraphData: null, // Reset mini graph
    });
  },

  setRawGraph: (rawGraph) => set({ rawGraph }),
  setSigmaGraph: (sigmaGraph) => set({ sigmaGraph }),
  setMoveToSelectedNode: (moveToSelectedNode) => set({ moveToSelectedNode }),
  setSigmaInstance: (instance) => set({ sigmaInstance: instance }),
  setTypeColorMap: (typeColorMap) => set({ typeColorMap }),
  setSearchEngine: (engine) => set({ searchEngine: engine }),
  resetSearchEngine: () => set({ searchEngine: null }),
  setGraphDataFetchAttempted: (attempted) =>
    set({ graphDataFetchAttempted: attempted }),
  setLabelsFetchAttempted: (attempted) =>
    set({ labelsFetchAttempted: attempted }),
  triggerNodeExpand: (nodeId) => set({ nodeToExpand: nodeId }),
  triggerNodePrune: (nodeId) => set({ nodeToPrune: nodeId }),
  incrementGraphDataVersion: () =>
    set((state) => ({ graphDataVersion: state.graphDataVersion + 1 })),

  // Giữ nguyên logic updateNode và updateEdge
  updateNodeAndSelect: async (nodeId, entityId, propertyName, newValue) => {
    /* ... giữ nguyên code cũ ... */
  },
  updateEdgeAndSelect: async (
    edgeId,
    dynamicId,
    sourceId,
    targetId,
    propertyName,
    newValue
  ) => {
    /* ... giữ nguyên code cũ ... */
  },

  focusOnSubgraph: (nodeIds: string[]) => {
    /* ... giữ nguyên code cũ nếu cần ... */
  },
  resetGraphView: () => {
    /* ... giữ nguyên code cũ nếu cần ... */
  },
}));

const useGraphStore = createSelectors(useGraphStoreBase);

export { useGraphStore };
