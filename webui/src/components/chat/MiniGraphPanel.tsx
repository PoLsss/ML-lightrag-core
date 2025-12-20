import { useEffect, useMemo, useState } from "react";
import { SigmaContainer, useSigma } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useGraphStore } from "@/stores/graph";
import { useSettingsStore } from "@/stores/settings";
import { labelColorDarkTheme, labelColorLightTheme } from "@/lib/constants";
import { NetworkIcon, LayersIcon } from "lucide-react";
import { NodeBorderProgram } from "@sigma/node-border";
import "@react-sigma/core/lib/style.css";

// --- CẤU HÌNH MÀU SẮC (Giữ xanh theo ý bạn, hoặc đổi tùy thích) ---
const NODE_COLOR = "#10b981"; // Xanh Emerald
const EDGE_COLOR = "#94a3b8"; // Xám Slate

// --- LOADER & LAYOUT LOGIC ---
const SubGraphLoader = ({ isExpanded }: { isExpanded: boolean }) => {
  const sigma = useSigma();
  const graphData = useGraphStore.use.miniGraphData();

  // [CẤU HÌNH "TỶ LỆ VÀNG" ĐỂ GIỐNG HÌNH 1]
  const { start, stop, kill } = useWorkerLayoutForceAtlas2({
    settings: {
      slowDown: 10,

      // [QUAN TRỌNG 1] Gravity = 1: Tạo lực hút đủ mạnh để tạo thành cụm (Cluster) như Hình 1
      gravity: 1,

      // [QUAN TRỌNG 2] Scaling Ratio = 10: Tỷ lệ chuẩn, không quá xa, không quá gần
      scalingRatio: 10,

      // Chống chồng lấn
      adjustSizes: true,
      strongGravityMode: false,
      barnesHutOptimize: true,
    },
  });

  useEffect(() => {
    if (!sigma || !graphData) return;
    const graph = sigma.getGraph();
    graph.clear();

    // 1. ADD NODES
    if (graphData.entities) {
      graphData.entities.forEach((entity) => {
        const nodeId = entity.entity_name || entity.name;
        if (!nodeId || graph.hasNode(nodeId)) return;

        graph.addNode(nodeId, {
          label: nodeId,
          // Rải node ngẫu nhiên trong phạm vi nhỏ để chúng tự bung ra
          x: Math.random() * 100,
          y: Math.random() * 100,

          // Size node vừa phải (10px), không quá to
          size: entity.importance ? 15 : 8, // Nếu có info độ quan trọng thì to hơn chút

          color: NODE_COLOR,
          borderColor: "#047857",
          borderSize: 1,
        });
      });
    }

    // 2. ADD EDGES
    if (graphData.relationships) {
      graphData.relationships.forEach((rel) => {
        if (
          graph.hasNode(rel.src_id) &&
          graph.hasNode(rel.tgt_id) &&
          !graph.hasEdge(rel.src_id, rel.tgt_id)
        ) {
          graph.addEdge(rel.src_id, rel.tgt_id, {
            // Cạnh mảnh (2px) như Hình 1
            size: 2,
            color: EDGE_COLOR,
            type: "line", // Dùng line thay vì arrow to để nhìn thanh thoát
            label: rel.description,
          });
        }
      });
    }

    // 3. RUN LAYOUT
    if (graph.order > 0) {
      start();
      const timer = setTimeout(() => {
        stop();
        // Zoom fit vừa vặn
        sigma
          .getCamera()
          .animate({ ratio: 1.1, x: 0.5, y: 0.5 }, { duration: 500 });
      }, 3000);

      return () => {
        kill();
        clearTimeout(timer);
      };
    }
  }, [graphData, sigma, start, stop, kill, isExpanded]);

  return null;
};

// --- MAIN COMPONENT ---
const MiniGraphPanel = ({ isExpanded = false }: { isExpanded?: boolean }) => {
  const theme = useSettingsStore.use.theme();
  const miniGraphData = useGraphStore.use.miniGraphData();

  const settings = useMemo(
    () => ({
      allowInvalidContainer: true,

      // Node
      defaultNodeType: "default",
      nodeProgramClasses: { default: NodeBorderProgram },
      minNodeSize: 4, // Node nhỏ nhất
      maxNodeSize: 15, // Node lớn nhất (Không để to đùng như cũ)

      // Edge
      defaultEdgeType: "line",
      minEdgeSize: 1,
      maxEdgeSize: 3, // Cạnh tối đa 3px

      // Label Edge
      renderEdgeLabels: true,
      edgeLabelSize: 10,
      edgeLabelColor: { color: "#64748b" },

      // Label Node
      renderLabels: true,
      // [BÍ QUYẾT HÌNH 1] Luôn hiện label để nhìn thấy thông tin (hoặc set rất nhỏ)
      labelRenderedSizeThreshold: 4,
      labelSize: 12,
      labelColor: {
        color: theme === "dark" ? labelColorDarkTheme : labelColorLightTheme,
      },
      labelWeight: "bold",
      labelGridCellSize: 60,

      zIndex: true,
      enableEdgeHoverEvents: true,
    }),
    [theme]
  );

  if (!miniGraphData?.entities?.length) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 text-muted-foreground p-5 text-center select-none">
        <div className="mb-3 p-4 bg-emerald-100/50 dark:bg-emerald-900/20 rounded-full">
          <NetworkIcon className="size-8 text-emerald-600/50" />
        </div>
        <p className="text-sm">Chọn một đoạn chat để xem đồ thị.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative bg-card overflow-hidden group">
      {/* Badge Info */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <div className="bg-background/90 backdrop-blur px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-bold text-foreground">
              {miniGraphData.entities.length} Nodes
            </span>
          </div>
          <div className="w-px h-3 bg-border"></div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-400"></span>
            <span className="text-xs font-bold text-foreground text-muted-foreground">
              {miniGraphData.relationships?.length || 0} Edges
            </span>
          </div>
        </div>
      </div>

      <SigmaContainer
        key={`mini-graph-${miniGraphData.entities.length}-${isExpanded}`}
        style={{ height: "100%", width: "100%" }}
        settings={settings}
        className="!bg-transparent"
      >
        <SubGraphLoader isExpanded={isExpanded} />
      </SigmaContainer>
    </div>
  );
};

export default MiniGraphPanel;
