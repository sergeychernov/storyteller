import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ envDir: "../../", plugins: [react()], test: { include: ["src/**/*.test.ts"] } });
