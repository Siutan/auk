import type { BunPlugin } from "bun";

export const buildConfig = {
  entryPoints: {
    index: "./index.ts",
    nats: "./distributed/nats/index.ts",
  },
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: true,
  sourcemap: "external",
  external: ["nats"],
  plugins: [] as BunPlugin[],
};

export default buildConfig;
