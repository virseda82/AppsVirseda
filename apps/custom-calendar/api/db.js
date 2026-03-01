import dotenv from "dotenv";
dotenv.config();

import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set. Check api/.env");
}

const needsSSL =
  typeof connectionString === "string" &&
  (connectionString.includes("render.com") || connectionString.includes("dpg-"));

export const pool = new pg.Pool({
  connectionString,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});
