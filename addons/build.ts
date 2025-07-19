#!/usr/bin/env bun

// Using bun as the build tool for the addons
// Addons are less concerned with the final bundle size than Auk core, which uses tsup with terser
// The terser minification results in a ~3% reduction in size vs the bun minifier

import { build } from "bun";

async function buildAddons() {
  console.log("Building addons...");

  const buildOutputs = [];

  // Build main index
  const index = await build({
    entrypoints: ["./index.ts"],
    outdir: "./dist",
    target: "bun",
    format: "esm",
    minify: true,
  });
  buildOutputs.push(index);

  // Build NATS addon separately
  const nats = await build({
    entrypoints: ["./distributed/nats/index.ts"],
    outdir: "./dist",
    target: "bun",
    format: "esm",
    minify: true,
    naming: "nats.js",
  });
  buildOutputs.push(nats);

  // Add some color and style to the logs
  const green = "\x1b[32m";
  const blue = "\x1b[34m";
  const yellow = "\x1b[33m";
  const magenta = "\x1b[35m";
  const bold = "\x1b[1m";
  const reset = "\x1b[0m";
  const dim = "\x1b[2m";
  const check = `${green}✔${reset}`;

  console.log(`${bold}${magenta}Build outputs:${reset}`);
  for (const output of buildOutputs) {
    for (const artifact of output.outputs) {
      // get file size in kb
      const size = (Bun.file(artifact.path).size / 1024).toFixed(2);
      // show only the path from dist, eg. dist/index.js
      const sanitizedPath = artifact.path.split("addons/")[1];
      console.log(
        `  ${check} ${blue}${sanitizedPath}${reset} ${dim}(${yellow}${size} kb${reset}${dim})${reset}`
      );
    }
  }

  console.log(`${bold}${green}Build complete!${reset}`);
}

buildAddons().catch(console.error);
