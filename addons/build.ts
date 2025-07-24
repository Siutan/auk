#!/usr/bin/env bun

import { type BuildOutput, build } from "bun";

function printResults(buildOutputs: BuildOutput[]) {
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
      const size = (Bun.file(artifact.path).size / 1024).toFixed(2);
      const sanitizedPath = artifact.path.split("addons/")[1];
      console.log(
        `  ${check} ${blue}${sanitizedPath}${reset} ${dim}(${yellow}${size} kb${reset}${dim})${reset}`
      );
    }
  }
  console.log(`${bold}${green}Build complete!${reset}`);
}

import { $ } from "bun";

async function buildAddons() {
  console.log("Cleaning output directory...");
  await $`rm -rf ./dist`;

  console.log("Generating declaration files...");
  await $`bun tsc`;

  console.log("Building single unified addon bundle...");
  const result = await build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "bun",
    format: "esm",
    minify: true,
    sourcemap: "external",
    define: { "process.env.NODE_ENV": '"production"' },
  });

  if (result.success) {
    printResults([result]);
  } else {
    console.error("Build failed!");
    console.log(...result.logs);
  }
}

buildAddons().catch(console.error);
