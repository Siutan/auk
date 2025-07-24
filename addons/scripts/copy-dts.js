#!/usr/bin/env bun

import { $ } from "bun";

const dtsMap = [
  { src: "./dist/addons/index.d.ts", dest: "./dist/index.d.ts" },
  { src: "./dist/addons/distributed/nats/index.d.ts", dest: "./dist/nats.d.ts" },
  { src: "./dist/addons/middleware/sentry/index.d.ts", dest: "./dist/sentry.d.ts" },
  { src: "./dist/addons/triggers/index.d.ts", dest: "./dist/triggers.d.ts" },
  { src: "./dist/addons/umq/index.d.ts", dest: "./dist/umq.d.ts" }
];

for (const { src, dest } of dtsMap) {
  try {
    await $`cp ${src} ${dest}`;
    console.log(`Copied ${src} -> ${dest}`);
  } catch (e) {
    console.warn(`Failed to copy ${src} -> ${dest}: ${e}`);
  }
}