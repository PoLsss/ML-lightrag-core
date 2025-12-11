import { useEffect } from "react";
import { useSigma } from "@react-sigma/core";
import { useGraphStore } from "@/stores/graph";
import { useSettingsStore } from "@/stores/settings";

const GraphControl = () => {
  // 1. Lấy instance từ Context của Sigma
  const sigma = useSigma();

  // 2. Lấy hàm set instance từ store
  const setSigmaInstance = useGraphStore.use.setSigmaInstance();

  // 3. Lấy theme hiện tại
  const theme = useSettingsStore.use.theme();

  // Effect 1: Đồng bộ instance vào Global Store
  // Chạy khi sigma thay đổi (mount/unmount)
  useEffect(() => {
    if (sigma) {
      setSigmaInstance(sigma);
    }

    // Cleanup: Xóa instance khỏi store khi component unmount
    return () => {
      setSigmaInstance(null);
    };
  }, [sigma, setSigmaInstance]);

  // Effect 2: Xử lý Refresh khi đổi Theme
  // QUAN TRỌNG: Chỉ chạy khi 'theme' thay đổi.
  // KHÔNG cho 'sigma' vào dependency array để tránh loop refresh khi mount.
  useEffect(() => {
    if (!sigma) return;

    // Dùng requestAnimationFrame để đảm bảo WebGL context không đang bận
    const frameId = requestAnimationFrame(() => {
      try {
        // Chỉ refresh nếu graph đang có dữ liệu và sigma vẫn hoạt động
        if (sigma && sigma.getGraph && sigma.getGraph().order > 0) {
          console.log("Theme changed, refreshing graph view...");
          sigma.refresh();
        }
      } catch (error) {
        // Bắt lỗi im lặng để không crash app
        // Lỗi bindFramebuffer thường xuất hiện ở đây nhưng không ảnh hưởng logic
        console.warn("Safe refresh skipped:", error);
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [theme]); // <-- Chỉ refresh khi Theme đổi

  return null;
};

export default GraphControl;
