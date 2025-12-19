import { useEffect, useMemo } from "react";
import { SigmaContainer, useSigma } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useGraphStore } from "@/stores/graph";
import { useSettingsStore } from "@/stores/settings";
import { labelColorDarkTheme, labelColorLightTheme } from "@/lib/constants";
import { NetworkIcon } from "lucide-react";

// Import shader
import { NodeBorderProgram } from "@sigma/node-border";
import "@react-sigma/core/lib/style.css";

// [UPDATE] Nhận prop isExpanded để điều chỉnh layout
const SubGraphLoader = ({ isExpanded }: { isExpanded: boolean }) => {
  const sigma = useSigma();
  const graphData = useGraphStore.use.miniGraphData();

  // Cấu hình ForceAtlas2
  const { start, stop, kill } = useWorkerLayoutForceAtlas2({
    settings: {
      slowDown: 20, // Giảm slowDown để layout chạy nhanh hơn chút
      gravity: 0.05, // Giảm trọng lực để đồ thị bung rộng ra
      // [UPDATE] Tăng mạnh khoảng cách các node để nhãn không đè lên nhau
      scalingRatio: 40,
      iterations: 2000, // [TĂNG] Số lần tính toán nhiều hơn
      barnesHutOptimize: true, // Tối ưu hiệu năng cho đồ thị lớn
    },
  });

  useEffect(() => {
    if (!sigma || !graphData) return;
    const graph = sigma.getGraph();
    graph.clear();

    // 1. Vẽ Nodes
    if (graphData.entities) {
      graphData.entities.forEach((entity) => {
        const nodeId = entity.entity_name || entity.name;
        if (!nodeId) return;

        try {
          if (!graph.hasNode(nodeId)) {
            graph.addNode(nodeId, {
              label: nodeId, // Luôn set label
              x: Math.random() * 100,
              y: Math.random() * 100,
              // [UPDATE] Node to hơn hẳn (15-20px)
              size: isExpanded ? 20 : 12,
              color: "#10b981",
              borderColor: "#065f46",
              borderSize: 1,
            });
          }
        } catch (e) {}
      });
    }

    // 2. Vẽ Edges
    if (graphData.relationships) {
      graphData.relationships.forEach((rel) => {
        try {
          if (graph.hasNode(rel.src_id) && graph.hasNode(rel.tgt_id)) {
            if (!graph.hasEdge(rel.src_id, rel.tgt_id)) {
              graph.addEdge(rel.src_id, rel.tgt_id, {
                // [UPDATE] Cạnh dày hơn
                size: isExpanded ? 4 : 2,
                color: "#94a3b8",
                type: "arrow", // Dùng mũi tên
                label: rel.description || rel.relation_type || "liên kết", // Hiện tên quan hệ
              });
            }
          }
        } catch (e) {}
      });
    }

    // 3. Chạy thuật toán layout
    if (graph.order > 0) {
      start();
      const timer = setTimeout(() => {
        stop();
        // Zoom fit thông minh
        const camera = sigma.getCamera();
        // Zoom out xa hơn một chút (ratio < 1 là zoom in, ratio > 1 là zoom out trong Sigma camera state,
        // nhưng hàm animate ratio thường là đích đến relative.
        // Ta dùng coordinate system để fit.
        //camera.animatedReset({ duration: 500 });
        camera.animate({ ratio: 1.5, x: 0.5, y: 0.5 }, { duration: 500 });
      }, 7000); //2000

      return () => {
        kill();
        clearTimeout(timer);
      };
    }
  }, [graphData, sigma, start, stop, kill, isExpanded]);

  return null;
};

interface MiniGraphPanelProps {
  isExpanded?: boolean;
}

const MiniGraphPanel = ({ isExpanded = false }: MiniGraphPanelProps) => {
  const theme = useSettingsStore.use.theme();
  const miniGraphData = useGraphStore.use.miniGraphData();

  // [UPDATE] Settings hiển thị
  const settings = useMemo(
    () => ({
      allowInvalidContainer: true,
      defaultNodeType: "default",
      defaultEdgeType: "arrow",

      // [UPDATE] Cấu hình Label
      renderEdgeLabels: true, // Luôn hiện nhãn cạnh
      edgeLabelSize: isExpanded ? 12 : 10,
      edgeLabelColor: { color: theme === "dark" ? "#94a3b8" : "#64748b" },

      labelSize: isExpanded ? 16 : 12, // Chữ node to rõ
      labelColor: {
        color: theme === "dark" ? labelColorDarkTheme : labelColorLightTheme,
      },
      // Render label ngay cả khi node nhỏ (threshold = 0)
      labelRenderedSizeThreshold: 0,

      // Tăng mật độ grid để chữ ko bị ẩn khi zoom xa
      labelGridCellSize: 10,

      nodeProgramClasses: {
        default: NodeBorderProgram,
      },
      enableEdgeHoverEvents: true,
      enableHovering: true,
    }),
    [theme, isExpanded]
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
    <div className="h-full w-full relative bg-card overflow-hidden">
      {/* Info Badge */}
      <div className="absolute top-3 left-3 z-10 bg-background/90 backdrop-blur px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-sm font-bold text-foreground">
            {miniGraphData.entities.length} Nodes
          </span>
        </div>
        <div className="w-px h-3 bg-border"></div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-slate-400"></span>
          <span className="text-sm font-bold text-foreground">
            {miniGraphData.relationships?.length || 0} Edges
          </span>
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
