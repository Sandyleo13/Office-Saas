import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSeedData } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "db.json");
export const uploadsDir = path.join(dataDir, "uploads");

let cache = null;

export async function loadDb() {
  if (cache) return cache;

  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  try {
    cache = JSON.parse(await fs.readFile(dataFile, "utf8"));
  } catch {
    cache = await createSeedData();
    await saveDb(cache);
  }

  return cache;
}

export async function saveDb(nextDb = cache) {
  cache = nextDb;
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(cache, null, 2));
  return cache;
}

export async function logAudit(actor, action, target = "") {
  const db = await loadDb();
  db.auditLogs.unshift({
    id: crypto.randomUUID(),
    actor,
    action,
    target,
    createdAt: new Date().toISOString()
  });
  db.auditLogs = db.auditLogs.slice(0, 80);
  await saveDb(db);
}
