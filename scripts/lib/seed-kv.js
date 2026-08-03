import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

export async function seedKv(records, outFilePath) {
  const bulkPayload = [...records].map(([key, value]) => ({ key, value }));
  await writeFile(outFilePath, JSON.stringify(bulkPayload, null, 2));
  console.log(`\nWrote ${bulkPayload.length} records to ${outFilePath}`);

  console.log("\nSeeding KV...");
  execFileSync(
    "npx",
    [
      "wrangler",
      "kv",
      "bulk",
      "put",
      outFilePath,
      "--binding=PROCESSED_TRACKS",
      "--remote",
    ],
    { stdio: "inherit" }
  );
}
