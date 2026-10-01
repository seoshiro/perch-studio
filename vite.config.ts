import { defineConfig } from "vite";
export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [
    {
      name: "local-development-csp",
      transformIndexHtml(html) {
        const content = command === "serve"
          ? html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*\/>/, "")
          : html;
        const input = process.env.PERCH_BUILD_SHA || "";
        const revision = /^[a-f0-9]{40}$/.test(input) ? input : "local";
        return content.replace("</head>", `<meta name="perch-revision" content="${revision}" /></head>`);
      },
    },
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 650 },
}));
