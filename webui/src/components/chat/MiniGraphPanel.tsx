import { useEffect, useMemo } from "react";
import { SigmaContainer, useSigma } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useGraphStore } from "@/stores/graph";
import { useSettingsStore } from "@/stores/settings";
import { labelColorDarkTheme, labelColorLightTheme } from "@/lib/constants";
import { NetworkIcon } from "lucide-react";

// Import shader để vẽ đẹp hơn
import { NodeBorderProgram } from "@sigma/node-border";
import "@react-sigma/core/lib/style.css";

const SubGraphLoader = () => {
  const sigma = useSigma();
  const graphData = useGraphStore.use.miniGraphData();

  // Cấu hình ForceAtlas2: Tự động dàn trang theo vật lý
  const { start, stop, kill } = useWorkerLayoutForceAtlas2({
    settings: {
      slowDown: 10, // Chậm lại để chuyển động mượt
      gravity: 0.5, // Lực hút vừa phải
      scalingRatio: 8, // Tăng khoảng cách giữa các node
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
              label: nodeId,
              // Random vị trí ban đầu để tạo đà cho ForceAtlas
              x: Math.random() * 100,
              y: Math.random() * 100,

              // [FIX 1] Kích thước nhỏ lại để lộ cạnh nối
              size: 6,

              color: "#10b981", // Xanh Emerald
              borderColor: "#065f46",
              borderSize: 0.5,
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
                size: 2,
                // [FIX 2] Màu xám đậm hơn để nhìn rõ trên nền trắng
                color: "#64748b", // Slate-500
                type: "line",
                label: rel.description,
              });
            }
          }
        } catch (e) {}
      });
    }

    // 3. Kích hoạt thuật toán Force Atlas 2
    if (graph.order > 0) {
      start(); // Bắt đầu chạy

      // Dừng sau 2.5 giây (khi hình đã ổn định)
      const timer = setTimeout(() => {
        stop();
        // Zoom vừa khít màn hình
        const camera = sigma.getCamera();
        camera.animate({ ratio: 1.1, x: 0.5, y: 0.5 }, { duration: 500 });
      }, 2500);

      return () => {
        kill();
        clearTimeout(timer);
      };
    }
  }, [graphData, sigma, start, stop, kill]);

  return null;
};

const MiniGraphPanel = () => {
  const theme = useSettingsStore.use.theme();
  const miniGraphData = useGraphStore.use.miniGraphData();

  const settings = useMemo(
    () => ({
      allowInvalidContainer: true,
      defaultNodeType: "default",
      defaultEdgeType: "line",
      renderEdgeLabels: false,

      // [FIX 3] Giảm cỡ chữ cho cân đối với node nhỏ
      labelSize: 11,
      labelColor: {
        color: theme === "dark" ? labelColorDarkTheme : labelColorLightTheme,
      },

      nodeProgramClasses: {
        default: NodeBorderProgram,
      },
      enableEdgeHoverEvents: false,
      enableHovering: true,
    }),
    [theme]
  );

  // Màn hình chờ
  if (
    !miniGraphData ||
    !miniGraphData.entities ||
    miniGraphData.entities.length === 0
  ) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/20 border-b border-border text-muted-foreground p-4 text-center select-none">
        <div className="mb-3 p-4 bg-background/50 rounded-full shadow-sm ring-1 ring-border">
          <NetworkIcon className="size-8 text-emerald-500/50" />
        </div>
        <p className="text-sm font-medium">
          Chọn nút{" "}
          <span className="font-bold text-emerald-600">Show Graph</span> <br />{" "}
          trên tin nhắn để xem ngữ cảnh.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative border-b border-border bg-card overflow-hidden group">
      <div className="absolute top-3 left-3 z-10 bg-background/90 px-3 py-1.5 rounded-md text-xs font-semibold backdrop-blur-md border shadow-sm flex items-center gap-2 transition-all group-hover:opacity-100">
        <span className="text-muted-foreground">Context:</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
          {miniGraphData.entities.length} Nodes
        </span>
      </div>

      {/* Key để reset khi số lượng node thay đổi */}
      <SigmaContainer
        key={`mini-graph-${miniGraphData.entities.length}`}
        style={{ height: "100%", width: "100%" }}
        settings={settings}
        className="!bg-transparent"
      >
        <SubGraphLoader />
      </SigmaContainer>
    </div>
  );
};

export default MiniGraphPanel;
