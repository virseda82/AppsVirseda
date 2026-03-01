import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrateCli = resolve(__dirname, "../node_modules/node-pg-migrate/bin/node-pg-migrate.js");
const migrateBin = resolve(__dirname, "../node_modules/.bin/node-pg-migrate");

const direction = process.argv[2] || "up";
const validDirections = new Set(["up", "down"]);

if (!validDirections.has(direction)) {
  console.error("Invalid migration direction. Use: up | down");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const needsSSL = databaseUrl.includes("render.com") || databaseUrl.includes("dpg-");
const hasSSLMode = /[?&]sslmode=/i.test(databaseUrl);
if (needsSSL && !hasSSLMode) {
  const separator = databaseUrl.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${databaseUrl}${separator}sslmode=require`;
}

let command;
let args;

if (existsSync(migrateCli)) {
  command = process.execPath;
  args = [migrateCli, "-m", "migrations", direction];
} else if (existsSync(migrateBin)) {
  command = migrateBin;
  args = ["-m", "migrations", direction];
} else {
  console.error("node-pg-migrate is not installed. Run npm ci before migrations.");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
