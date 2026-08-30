import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The vendor app runs on a different port than illuxus so both can run
// side by side against the same Supabase backend during local dev.
export default defineConfig({
  server: {
    host: "::",
    port: 8081,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
