import { defineConfig, loadEnv } from "vite";
import path from "path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Load tất cả biến môi trường (tham số thứ 3 là '' để load cả các biến không có prefix VITE_)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: "/", // Chỉ cần thiết nếu deploy vào sub-folder, mặc định là '/' rồi nên có thể bỏ
    build: {
      outDir: "dist",
      emptyOutDir: true,
      // Fix circular dependency issues with dynamic imports
      rollupOptions: {
        output: {
          manualChunks: undefined, // Disable manual chunking to avoid init errors
        },
      },
    },
    server: {
      port: 3000,
      open: true, // Tự động mở trình duyệt khi chạy npm run dev (tùy chọn)
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://localhost:9621",
          changeOrigin: true,
          secure: false, // Thêm dòng này nếu backend dùng https tự ký (self-signed)
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
