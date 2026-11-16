import { defineConfig } from "vite";

// GitHub Pages(https://<user>.github.io/dice-board/)에서는 VITE_BASE=/dice-board/ 로 빌드한다.
// 로컬 개발/빌드는 기본값 "/" 그대로.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  root: ".",
  publicDir: "public",
  server: { port: 5173 },
  build: { outDir: "dist", target: "es2020" },
});
