import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { SigmaContainer, useRegisterEvents, useSigma } from "@react-sigma/core";
import { Settings as SigmaSettings } from "sigma/settings";
import { GraphSearchOption, OptionItem } from "@react-sigma/graph-search";
import {
  EdgeArrowProgram,
  NodePointProgram,
  NodeCircleProgram,
} from "sigma/rendering";
import { NodeBorderProgram } from "@sigma/node-border";
import {
  EdgeCurvedArrowProgram,
  createEdgeCurveProgram,
} from "@sigma/edge-curve";

// Components
import FocusOnNode from "@/components/graph/FocusOnNode";
import LayoutsControl from "@/components/graph/LayoutsControl";
import GraphControl from "@/components/graph/GraphControl";
import ZoomControl from "@/components/graph/ZoomControl";
import FullScreenControl from "@/components/graph/FullScreenControl";
import Settings from "@/components/graph/Settings";
import GraphSearch from "@/components/graph/GraphSearch";
import GraphLabels from "@/components/graph/GraphLabels";
import PropertiesView from "@/components/graph/PropertiesView";
import SettingsDisplay from "@/components/graph/SettingsDisplay";
import Legend from "@/components/graph/Legend";
import LegendButton from "@/components/graph/LegendButton";

// Stores & Constants
import { useSettingsStore } from "@/stores/settings";
import { useGraphStore } from "@/stores/graph";
import { labelColorDarkTheme, labelColorLightTheme } from "@/lib/constants";

// Styles
import "@react-sigma/core/lib/style.css";
import "@react-sigma/graph-search/lib/style.css";

// Hook
import useLightragGraph from "@/hooks/useLightragGraph";

// --- CẤU HÌNH SIGMA (STYLE) ---
const createSigmaSettings = (
  isDarkTheme: boolean,
  showNodeLabel: boolean,
  showEdgeLabel: boolean,
  hasSelectedNode: boolean
): Partial<SigmaSettings> => ({
  allowInvalidContainer: true,
  defaultNodeType: "default",
  defaultEdgeType: "curvedNoArrow",
  renderEdgeLabels: showEdgeLabel,
  edgeProgramClasses: {
    arrow: EdgeArrowProgram,
    curvedArrow: EdgeCurvedArrowProgram,
    curvedNoArrow: createEdgeCurveProgram(),
  },
  nodeProgramClasses: {
    default: NodeBorderProgram,
    circel: NodeCircleProgram,
    point: NodePointProgram,
  },
  labelGridCellSize: 60,
  // Hiển thị labels dễ hơn khi có node được select hoặc showNodeLabel được bật
  labelRenderedSizeThreshold: hasSelectedNode || showNodeLabel ? 6 : 12,
  enableEdgeEvents: true,
  zIndex: true,
  labelColor: {
    color: isDarkTheme ? labelColorDarkTheme : labelColorLightTheme,
    attribute: "labelColor",
  },
  edgeLabelColor: {
    color: isDarkTheme ? labelColorDarkTheme : labelColorLightTheme,
    attribute: "labelColor",
  },
  edgeLabelSize: 8,
  labelSize: hasSelectedNode ? 14 : 12, // Label lớn hơn khi có node được select
});

// --- COMPONENT: SETTINGS UPDATER ---
const SigmaSettingsUpdater = () => {
  const sigma = useSigma();
  const selectedNode = useGraphStore.use.selectedNode();
  const focusedNode = useGraphStore.use.focusedNode();
  const showNodeLabel = useSettingsStore.use.showNodeLabel();
  const theme = useSettingsStore.use.theme();
  const showEdgeLabel = useSettingsStore.use.showEdgeLabel();

  useEffect(() => {
    if (!sigma) return;
    
    try {
      const isDarkTheme = theme === "dark";
      const hasSelectedNode = !!(selectedNode || focusedNode);
      
      // Update label settings dynamically
      sigma.setSetting("labelRenderedSizeThreshold", hasSelectedNode || showNodeLabel ? 6 : 12);
      sigma.setSetting("labelSize", hasSelectedNode ? 14 : 12);
      sigma.setSetting("renderEdgeLabels", showEdgeLabel);
      
      // Refresh to apply new settings
      sigma.refresh();
    } catch (error) {
      console.warn("Failed to update sigma settings:", error);
    }
  }, [sigma, selectedNode, focusedNode, showNodeLabel, showEdgeLabel, theme]);

  return null;
};

// --- COMPONENT: DATA LOADER ---
const GraphDataLoader = ({ graph }: { graph: any }) => {
  const sigma = useSigma();

  useEffect(() => {
    // Chỉ kiểm tra tồn tại, bỏ isKilled để tránh lỗi crash
    if (!graph || !sigma) return;

    try {
      // 1. Clear đồ thị cũ
      sigma.getGraph().clear();

      // 2. Import đồ thị mới
      sigma.getGraph().import(graph);

      // 3. Refresh view
      sigma.refresh();
    } catch (e) {
      console.warn("Graph data load warning:", e);
    }
  }, [graph, sigma]);

  return null;
};

// --- EVENT LISTENER ---
const GraphEvents = () => {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const enableNodeDrag = useSettingsStore.use.enableNodeDrag();

  useEffect(() => {
    const events: any = {
      // Handle node click for selection
      clickNode: (e: any) => {
        // Chỉ select node nếu không đang drag
        if (!isDragging) {
          useGraphStore.getState().setSelectedNode(e.node, true);
        }
      },
      // Handle background click to deselect
      clickStage: () => {
        useGraphStore.getState().setSelectedNode(null);
      },
    };

    // Chỉ thêm drag events nếu drag được enable
    if (enableNodeDrag) {
      events.downNode = (e: any) => {
        setDraggedNode(e.node);
        setIsDragging(false);
        sigma.getGraph().setNodeAttribute(e.node, "highlighted", true);
        if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
      };
      
      events.mousemovebody = (e: any) => {
        if (!draggedNode) return;
        setIsDragging(true);
        const pos = sigma.viewportToGraph(e);
        sigma.getGraph().setNodeAttribute(draggedNode, "x", pos.x);
        sigma.getGraph().setNodeAttribute(draggedNode, "y", pos.y);
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
      };
      
      events.mouseup = () => {
        if (draggedNode) {
          setDraggedNode(null);
          sigma.getGraph().removeNodeAttribute(draggedNode, "highlighted");
          // Reset dragging state sau một chút để tránh trigger click event
          setTimeout(() => setIsDragging(false), 50);
        }
      };
    }

    registerEvents(events);
  }, [registerEvents, sigma, draggedNode, isDragging, enableNodeDrag]);

  return null;
};

// --- MAIN COMPONENT ---
const GraphViewer = () => {
  // 1. Gọi hook lấy dữ liệu
  const { lightragGraph } = useLightragGraph();

  // 2. States & Selectors
  const [isThemeSwitching, setIsThemeSwitching] = useState(false);
  const prevTheme = useRef<string>("");

  const selectedNode = useGraphStore.use.selectedNode();
  const focusedNode = useGraphStore.use.focusedNode();
  const moveToSelectedNode = useGraphStore.use.moveToSelectedNode();
  const isFetching = useGraphStore.use.isFetching();

  const showPropertyPanel = useSettingsStore.use.showPropertyPanel();
  const showNodeSearchBar = useSettingsStore.use.showNodeSearchBar();
  const enableNodeDrag = useSettingsStore.use.enableNodeDrag();
  const showLegend = useSettingsStore.use.showLegend();
  const showNodeLabel = useSettingsStore.use.showNodeLabel();
  const showEdgeLabel = useSettingsStore.use.showEdgeLabel();
  const theme = useSettingsStore.use.theme();

  // 3. Memoize Settings
  const memoizedSigmaSettings = useMemo(() => {
    const isDarkTheme = theme === "dark";
    const hasSelectedNode = !!(selectedNode || focusedNode);
    return createSigmaSettings(isDarkTheme, showNodeLabel, showEdgeLabel, hasSelectedNode);
  }, [theme, showNodeLabel, showEdgeLabel, selectedNode, focusedNode]);

  // 4. Handle Theme Switch
  useEffect(() => {
    const isThemeChange = prevTheme.current && prevTheme.current !== theme;
    if (isThemeChange) {
      setIsThemeSwitching(true);
      const timer = setTimeout(() => setIsThemeSwitching(false), 150);
      return () => clearTimeout(timer);
    }
    prevTheme.current = theme;
  }, [theme]);

  // 5. Cleanup
  useEffect(() => {
    return () => {
      useGraphStore.getState().setSigmaInstance(null);
    };
  }, []);

  // 6. Helpers
  const onSearchFocus = useCallback((value: GraphSearchOption | null) => {
    if (value === null) useGraphStore.getState().setFocusedNode(null);
    else if (value.type === "nodes")
      useGraphStore.getState().setFocusedNode(value.id);
  }, []);

  const onSearchSelect = useCallback((value: GraphSearchOption | null) => {
    if (value === null) {
      useGraphStore.getState().setSelectedNode(null);
    } else if (value.type === "nodes") {
      useGraphStore.getState().setSelectedNode(value.id, true);
    }
  }, []);

  const autoFocusedNode = useMemo(
    () => focusedNode ?? selectedNode,
    [focusedNode, selectedNode]
  );
  const searchInitSelectedNode = useMemo(
    (): OptionItem | null =>
      selectedNode ? { type: "nodes", id: selectedNode } : null,
    [selectedNode]
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SigmaContainer
        settings={memoizedSigmaSettings}
        className="!bg-background !size-full overflow-hidden"
        style={{ visibility: isThemeSwitching ? "hidden" : "visible" }}
      >
        <GraphDataLoader graph={lightragGraph} />
        <SigmaSettingsUpdater />

        <GraphControl />
        <GraphEvents />
        <FocusOnNode node={autoFocusedNode} move={moveToSelectedNode} />

        {/* UI Layers */}
        <div className="absolute top-2 left-2 flex items-start gap-2">
          <GraphLabels />
          {showNodeSearchBar && !isThemeSwitching && (
            <GraphSearch
              value={searchInitSelectedNode}
              onFocus={onSearchFocus}
              onChange={onSearchSelect}
            />
          )}
        </div>

        <div className="bg-background/60 absolute bottom-2 left-2 flex flex-col rounded-xl border-2 backdrop-blur-lg">
          <LayoutsControl />
          <ZoomControl />
          <FullScreenControl />
          <LegendButton />
          <Settings />
        </div>

        {showPropertyPanel && (
          <div className="absolute top-2 right-2 z-10">
            <PropertiesView />
          </div>
        )}

        {showLegend && (
          <div className="absolute bottom-10 right-2 z-0">
            <Legend className="bg-background/60 backdrop-blur-lg" />
          </div>
        )}

        <SettingsDisplay />
      </SigmaContainer>

      {/* Loading Overlay */}
      {(isFetching || isThemeSwitching) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-50">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              {isThemeSwitching ? "Updating Theme..." : "Loading Graph Data..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphViewer;
