import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const distDir = join(process.cwd(), "dist");

type FileSize = {
  file: string;
  rawSize: number;
  gzipSize: number;
};

async function getFileSizes() {
  const files = await readdir(distDir);
  const results: FileSize[] = [];
  for (const file of files) {
    const filePath = join(distDir, file);
    const stats = await stat(filePath);
    if (!stats.isFile()) continue;
    const rawSize = stats.size;
    const content = await readFile(filePath);
    const gzipped = gzipSync(content);
    results.push({
      file,
      rawSize,
      gzipSize: gzipped.length,
    });
  }
  return results;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

(async () => {
  const sizes = await getFileSizes();
  console.log("\nFile size report for ./dist\n");
  console.log(
    `${"File".padEnd(20)} | ${"Raw Size".padEnd(12)} | ${"Gzipped".padEnd(12)}`
  );
  console.log("-".repeat(50));
  for (const { file, rawSize, gzipSize } of sizes) {
    console.log(
      `${file.padEnd(20)} | ${formatSize(rawSize).padEnd(12)} | ${formatSize(
        gzipSize
      ).padEnd(12)}`
    );
  }
  console.log("");
})();
