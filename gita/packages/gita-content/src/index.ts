/**
 * Runtime access to the generated, validated Gita dataset.
 * The JSON is produced by `scripts/ingest.ts` from the verified public-domain snapshot in `raw/`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GitaDataset, type GitaDataset as GitaDatasetType } from "@gita/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "gita.json");

let cached: GitaDatasetType | null = null;

/** Load and validate the dataset from disk (Node contexts: ingestion, backend, tests). */
export function loadDataset(): GitaDatasetType {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  cached = GitaDataset.parse(raw);
  return cached;
}

export { DATA_PATH };
