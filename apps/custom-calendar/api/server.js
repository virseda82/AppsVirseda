import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.WEB_ORIGIN }));

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ADMIN_EMAIL = "virseda82@gmail.com";
const DEFAULT_FATHER_COLOR = "#dbeafe";
const DEFAULT_MOTHER_COLOR = "#f3e8ff";
const DEFAULT_ANCHOR_MONDAY = "2026-03-02";
const DEFAULT_ANCHOR_OWNER = "father";

function isAdminEmail(email) {
  return String(email || "").toLowerCase() === ADMIN_EMAIL;
}

function signToken(user) {
  const email = String(user.email || "").toLowerCase();
  return jwt.sign(
    { userId: user.id, email, is_admin: isAdminEmail(email) },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: "admin only" });
  }
  next();
}

app.get("/health", (_, res) => res.json({ ok: true }));
const isDevelopment = process.env.NODE_ENV === "development";

function parseIsoDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function parseDateOnly(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function validateEventPayload(body) {
  const title = String(body?.title || "").trim();
  if (!title) return { ok: false, error: "title required" };

  const startDate = parseIsoDate(body?.startAt);
  const endDate = parseIsoDate(body?.endAt);
  if (!startDate || !endDate) return { ok: false, error: "startAt/endAt must be ISO dates" };
  if (endDate < startDate) return { ok: false, error: "endAt must be >= startAt" };

  return {
    ok: true,
    value: {
      title,
      notes: body?.notes ? String(body.notes) : null,
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      allDay: !!body?.allDay,
      color: body?.color ? String(body.color) : null,
    },
  };
}

function validateCustodyConfig(payload) {
  const anchorMonday = parseDateOnly(payload?.anchor_monday);
  const anchorOwner = String(payload?.anchor_owner || "").toLowerCase();
  if (!anchorMonday) return { ok: false, error: "anchor_monday must be YYYY-MM-DD" };
  if (!["father", "mother"].includes(anchorOwner)) return { ok: false, error: "anchor_owner must be father|mother" };

  return {
    ok: true,
    value: {
      anchor_monday: anchorMonday,
      anchor_owner: anchorOwner,
      father_color: String(payload?.father_color || DEFAULT_FATHER_COLOR),
      mother_color: String(payload?.mother_color || DEFAULT_MOTHER_COLOR),
    },
  };
}

function validateCustodyOverride(payload) {
  const startDate = parseDateOnly(payload?.start_date);
  const endDate = parseDateOnly(payload?.end_date);
  const owner = String(payload?.owner || "").toLowerCase();
  if (!startDate || !endDate) return { ok: false, error: "start_date/end_date must be YYYY-MM-DD" };
  if (startDate > endDate) return { ok: false, error: "end_date must be >= start_date" };
  if (!["father", "mother"].includes(owner)) return { ok: false, error: "owner must be father|mother" };

  return {
    ok: true,
    value: {
      start_date: startDate,
      end_date: endDate,
      owner,
      color: payload?.color ? String(payload.color) : null,
      notes: payload?.notes ? String(payload.notes) : null,
    },
  };
}

async function ensureCustodyConfigForFamily(client, familyId) {
  await client.query(
    `INSERT INTO custody_config (family_id, anchor_monday, anchor_owner, father_color, mother_color)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (family_id) DO NOTHING`,
    [familyId, DEFAULT_ANCHOR_MONDAY, DEFAULT_ANCHOR_OWNER, DEFAULT_FATHER_COLOR, DEFAULT_MOTHER_COLOR]
  );
}

async function requireFamilyMember(client, familyId, userId) {
  const r = await client.query(
    "SELECT role FROM family_members WHERE family_id=$1 AND user_id=$2",
    [familyId, userId]
  );
  return r.rows[0]?.role || null;
}

async function exceedsDailyEventLimit(client, familyId, startAt, excludeEventId = null) {
  const q = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM events
     WHERE family_id=$1
       AND (start_at AT TIME ZONE 'UTC')::date = (($2::timestamptz) AT TIME ZONE 'UTC')::date
       AND ($3::int IS NULL OR id <> $3::int)`,
    [familyId, startAt, excludeEventId]
  );
  return q.rows[0].total >= 3;
}

async function findEventWithRole(client, eventId, userId) {
  const q = await client.query(
    `SELECT e.id, e.family_id, fm.role
     FROM events e
     LEFT JOIN family_members fm ON fm.family_id=e.family_id AND fm.user_id=$2
     WHERE e.id=$1`,
    [eventId, userId]
  );
  return q.rows[0] || null;
}

async function fetchCustodyForFamily(client, familyId) {
  await ensureCustodyConfigForFamily(client, familyId);

  const configQ = await client.query(
    `SELECT family_id, anchor_monday, anchor_owner, father_color, mother_color, updated_at
     FROM custody_config
     WHERE family_id=$1`,
    [familyId]
  );

  const overridesQ = await client.query(
    `SELECT id, family_id, start_date, end_date, owner, color, notes, created_at
     FROM custody_overrides
     WHERE family_id=$1
     ORDER BY start_date ASC, id ASC`,
    [familyId]
  );

  return { config: configQ.rows[0] || null, overrides: overridesQ.rows };
}

/**
 * Bootstrap DB (dev only)
 */
app.post("/admin/bootstrap", async (_req, res) => {
  if (!isDevelopment) {
    return res.status(404).json({ error: "Not found" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        password_hash TEXT NOT NULL
      );
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS families (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS family_members (
        family_id INT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner','editor','reader')),
        PRIMARY KEY (family_id, user_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        family_id INT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        all_day BOOLEAN NOT NULL DEFAULT FALSE,
        color TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS events_family_start_idx ON events(family_id, start_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS custody_config (
        family_id INT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
        anchor_monday DATE NOT NULL DEFAULT '2026-03-02',
        anchor_owner TEXT NOT NULL CHECK (anchor_owner IN ('father','mother')) DEFAULT 'father',
        father_color TEXT NOT NULL DEFAULT '#dbeafe',
        mother_color TEXT NOT NULL DEFAULT '#f3e8ff',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS custody_overrides (
        id SERIAL PRIMARY KEY,
        family_id INT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        owner TEXT NOT NULL CHECK (owner IN ('father','mother')),
        color TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (end_date >= start_date)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS custody_overrides_family_dates_idx
      ON custody_overrides(family_id, start_date, end_date);
    `);

    await client.query(`
      INSERT INTO custody_config (family_id, anchor_monday, anchor_owner, father_color, mother_color)
      SELECT f.id, $1::date, $2, $3, $4
      FROM families f
      ON CONFLICT (family_id) DO NOTHING;
    `, [DEFAULT_ANCHOR_MONDAY, DEFAULT_ANCHOR_OWNER, DEFAULT_FATHER_COLOR, DEFAULT_MOTHER_COLOR]);

    await client.query("COMMIT");
    res.json({ ok: true, message: "DB bootstrap done" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "bootstrap failed" });
  } finally {
    client.release();
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email/password required" });
  if (String(password).length < 8) return res.status(400).json({ error: "password min 8 chars" });

  const hash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    const ins = await client.query(
      `INSERT INTO users(email, name, color, password_hash)
       VALUES ($1,$2,$3,$4)
       RETURNING id, email, name, color`,
      [email.toLowerCase(), name || null, "#3b82f6", hash]
    );

    const token = signToken(ins.rows[0]);
    res.status(201).json({ token, user: { ...ins.rows[0], is_admin: isAdminEmail(ins.rows[0].email) } });
  } catch (e) {
    if (String(e?.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "email already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "register failed" });
  } finally {
    client.release();
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email/password required" });

  const client = await pool.connect();
  try {
    const q = await client.query(
      "SELECT id, email, name, color, password_hash FROM users WHERE email=$1",
      [email.toLowerCase()]
    );
    const user = q.rows[0];
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        color: user.color,
        is_admin: isAdminEmail(user.email),
      },
    });
  } finally {
    client.release();
  }
});

app.get("/families", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT f.id, f.name, fm.role
       FROM families f
       JOIN family_members fm ON fm.family_id=f.id
       WHERE fm.user_id=$1
       ORDER BY f.id ASC`,
      [req.user.userId]
    );
    res.json({ families: q.rows });
  } finally {
    client.release();
  }
});

app.post("/families", auth, async (req, res) => {
  const { name, members } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const fam = await client.query(
      "INSERT INTO families(name) VALUES($1) RETURNING id, name",
      [name]
    );

    await client.query(
      "INSERT INTO family_members(family_id, user_id, role) VALUES($1,$2,'owner')",
      [fam.rows[0].id, req.user.userId]
    );

    if (Array.isArray(members)) {
      for (const m of members) {
        if (!m?.email) continue;
        const uq = await client.query("SELECT id FROM users WHERE email=$1", [m.email.toLowerCase()]);
        if (!uq.rows[0]) continue;
        const role = ["editor", "reader"].includes(m.role) ? m.role : "reader";
        await client.query(
          "INSERT INTO family_members(family_id, user_id, role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [fam.rows[0].id, uq.rows[0].id, role]
        );
      }
    }

    await ensureCustodyConfigForFamily(client, fam.rows[0].id);

    await client.query("COMMIT");
    res.status(201).json({ family: fam.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "create family failed" });
  } finally {
    client.release();
  }
});

app.get("/families/:familyId/events", auth, async (req, res) => {
  const familyId = Number(req.params.familyId);
  const { from, to } = req.query;
  if (!familyId) return res.status(400).json({ error: "invalid family id" });
  if (!from || !to) return res.status(400).json({ error: "from/to required" });

  const client = await pool.connect();
  try {
    const role = await requireFamilyMember(client, familyId, req.user.userId);
    if (!role) return res.status(403).json({ error: "Not a family member" });

    const q = await client.query(
      `SELECT id, title, notes, start_at, end_at, all_day, color
       FROM events
       WHERE family_id=$1 AND start_at < $3 AND end_at > $2
       ORDER BY start_at ASC`,
      [familyId, from, to]
    );
    res.json({ events: q.rows });
  } finally {
    client.release();
  }
});

app.post("/families/:familyId/events", auth, async (req, res) => {
  const familyId = Number(req.params.familyId);
  if (!familyId) return res.status(400).json({ error: "invalid family id" });

  const validated = validateEventPayload(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { title, notes, startAt, endAt, allDay, color } = validated.value;

  const client = await pool.connect();
  try {
    const role = await requireFamilyMember(client, familyId, req.user.userId);
    if (!role || (role !== "owner" && role !== "editor")) {
      return res.status(403).json({ error: "No write permission" });
    }
    const limitReached = await exceedsDailyEventLimit(client, familyId, startAt);
    if (limitReached) {
      return res.status(400).json({ error: "daily event limit reached (max 3)" });
    }

    const ins = await client.query(
      `INSERT INTO events(family_id, title, notes, start_at, end_at, all_day, color, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, title, notes, start_at, end_at, all_day, color`,
      [familyId, title, notes || null, startAt, endAt, !!allDay, color || null, req.user.userId]
    );

    res.status(201).json({ event: ins.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create event failed" });
  } finally {
    client.release();
  }
});

app.put("/events/:id", auth, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: "invalid event id" });

  const validated = validateEventPayload(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { title, notes, startAt, endAt, allDay, color } = validated.value;

  const client = await pool.connect();
  try {
    const eventCtx = await findEventWithRole(client, eventId, req.user.userId);
    if (!eventCtx) return res.status(404).json({ error: "event not found" });
    if (!eventCtx.role || !["owner", "editor"].includes(eventCtx.role)) {
      return res.status(403).json({ error: "No write permission" });
    }
    const limitReached = await exceedsDailyEventLimit(client, eventCtx.family_id, startAt, eventId);
    if (limitReached) {
      return res.status(400).json({ error: "daily event limit reached (max 3)" });
    }

    const upd = await client.query(
      `UPDATE events
       SET title=$2, notes=$3, start_at=$4, end_at=$5, all_day=$6, color=$7
       WHERE id=$1
       RETURNING id, title, notes, start_at, end_at, all_day, color`,
      [eventId, title, notes, startAt, endAt, allDay, color]
    );
    res.json({ event: upd.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update event failed" });
  } finally {
    client.release();
  }
});

app.delete("/events/:id", auth, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: "invalid event id" });

  const client = await pool.connect();
  try {
    const eventCtx = await findEventWithRole(client, eventId, req.user.userId);
    if (!eventCtx) return res.status(404).json({ error: "event not found" });
    if (!eventCtx.role || !["owner", "editor"].includes(eventCtx.role)) {
      return res.status(403).json({ error: "No write permission" });
    }

    await client.query("DELETE FROM events WHERE id=$1", [eventId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "delete event failed" });
  } finally {
    client.release();
  }
});

app.get("/families/:familyId/custody", auth, async (req, res) => {
  const familyId = Number(req.params.familyId);
  if (!familyId) return res.status(400).json({ error: "invalid family id" });

  const client = await pool.connect();
  try {
    const role = await requireFamilyMember(client, familyId, req.user.userId);
    if (!role) return res.status(403).json({ error: "Not a family member" });

    const payload = await fetchCustodyForFamily(client, familyId);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "list custody failed" });
  } finally {
    client.release();
  }
});

app.post("/admin/reset-events", auth, requireAdmin, async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query("TRUNCATE TABLE events RESTART IDENTITY CASCADE");
    res.json({ ok: true, message: "events reset" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "reset events failed" });
  } finally {
    client.release();
  }
});

app.get("/admin/users", auth, requireAdmin, async (_req, res) => {
  const client = await pool.connect();
  try {
    const q = await client.query("SELECT id, email, name, color FROM users ORDER BY id ASC");
    res.json({ users: q.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "list users failed" });
  } finally {
    client.release();
  }
});

app.get("/admin/families", auth, requireAdmin, async (_req, res) => {
  const client = await pool.connect();
  try {
    const q = await client.query("SELECT id, name FROM families ORDER BY id ASC");
    res.json({ families: q.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "list families failed" });
  } finally {
    client.release();
  }
});

app.post("/admin/users", auth, requireAdmin, async (req, res) => {
  const { email, name, color, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email/password required" });
  if (String(password).length < 8) return res.status(400).json({ error: "password min 8 chars" });

  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash(password, 12);
    const ins = await client.query(
      `INSERT INTO users(email, name, color, password_hash)
       VALUES($1,$2,$3,$4)
       RETURNING id, email, name, color`,
      [String(email).toLowerCase(), name || null, color || "#3b82f6", hash]
    );
    res.status(201).json({ user: ins.rows[0] });
  } catch (e) {
    if (String(e?.message || "").includes("duplicate key")) {
      return res.status(409).json({ error: "email already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "create user failed" });
  } finally {
    client.release();
  }
});

app.put("/admin/users/:id", auth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "invalid user id" });

  const { name, color, password } = req.body;
  const fields = [];
  const params = [];
  let idx = 1;

  if (typeof name !== "undefined") {
    fields.push(`name=$${idx++}`);
    params.push(name || null);
  }
  if (typeof color !== "undefined") {
    fields.push(`color=$${idx++}`);
    params.push(color || "#3b82f6");
  }
  if (typeof password !== "undefined") {
    if (String(password).length < 8) return res.status(400).json({ error: "password min 8 chars" });
    const hash = await bcrypt.hash(String(password), 12);
    fields.push(`password_hash=$${idx++}`);
    params.push(hash);
  }

  if (!fields.length) return res.status(400).json({ error: "no fields to update" });

  params.push(userId);

  const client = await pool.connect();
  try {
    const upd = await client.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id=$${idx} RETURNING id, email, name, color`,
      params
    );
    if (!upd.rows[0]) return res.status(404).json({ error: "user not found" });
    res.json({ user: upd.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update user failed" });
  } finally {
    client.release();
  }
});

app.delete("/admin/users/:id", auth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "invalid user id" });

  const client = await pool.connect();
  try {
    const q = await client.query("SELECT id, email FROM users WHERE id=$1", [userId]);
    const user = q.rows[0];
    if (!user) return res.status(404).json({ error: "user not found" });
    if (isAdminEmail(user.email)) {
      return res.status(400).json({ error: "cannot delete admin user" });
    }

    await client.query("DELETE FROM users WHERE id=$1", [userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "delete user failed" });
  } finally {
    client.release();
  }
});

app.get("/admin/families/:familyId/custody", auth, requireAdmin, async (req, res) => {
  const familyId = Number(req.params.familyId);
  if (!familyId) return res.status(400).json({ error: "invalid family id" });

  const client = await pool.connect();
  try {
    const payload = await fetchCustodyForFamily(client, familyId);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin list custody failed" });
  } finally {
    client.release();
  }
});

app.put("/admin/families/:familyId/custody/config", auth, requireAdmin, async (req, res) => {
  const familyId = Number(req.params.familyId);
  if (!familyId) return res.status(400).json({ error: "invalid family id" });

  const validated = validateCustodyConfig(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const client = await pool.connect();
  try {
    const familyQ = await client.query("SELECT id FROM families WHERE id=$1", [familyId]);
    if (!familyQ.rows[0]) return res.status(404).json({ error: "family not found" });

    const cfg = validated.value;
    const upsert = await client.query(
      `INSERT INTO custody_config (family_id, anchor_monday, anchor_owner, father_color, mother_color, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (family_id)
       DO UPDATE SET anchor_monday=EXCLUDED.anchor_monday,
                     anchor_owner=EXCLUDED.anchor_owner,
                     father_color=EXCLUDED.father_color,
                     mother_color=EXCLUDED.mother_color,
                     updated_at=NOW()
       RETURNING family_id, anchor_monday, anchor_owner, father_color, mother_color, updated_at`,
      [familyId, cfg.anchor_monday, cfg.anchor_owner, cfg.father_color, cfg.mother_color]
    );
    res.json({ config: upsert.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "upsert custody config failed" });
  } finally {
    client.release();
  }
});

app.post("/admin/families/:familyId/custody/overrides", auth, requireAdmin, async (req, res) => {
  const familyId = Number(req.params.familyId);
  if (!familyId) return res.status(400).json({ error: "invalid family id" });

  const validated = validateCustodyOverride(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const client = await pool.connect();
  try {
    const familyQ = await client.query("SELECT id FROM families WHERE id=$1", [familyId]);
    if (!familyQ.rows[0]) return res.status(404).json({ error: "family not found" });

    const ov = validated.value;
    const ins = await client.query(
      `INSERT INTO custody_overrides (family_id, start_date, end_date, owner, color, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, family_id, start_date, end_date, owner, color, notes, created_at`,
      [familyId, ov.start_date, ov.end_date, ov.owner, ov.color, ov.notes]
    );
    res.status(201).json({ override: ins.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create custody override failed" });
  } finally {
    client.release();
  }
});

app.put("/admin/custody/overrides/:id", auth, requireAdmin, async (req, res) => {
  const overrideId = Number(req.params.id);
  if (!Number.isInteger(overrideId) || overrideId <= 0) return res.status(400).json({ error: "invalid override id" });

  const validated = validateCustodyOverride(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const client = await pool.connect();
  try {
    const ov = validated.value;
    const upd = await client.query(
      `UPDATE custody_overrides
       SET start_date=$2, end_date=$3, owner=$4, color=$5, notes=$6
       WHERE id=$1
       RETURNING id, family_id, start_date, end_date, owner, color, notes, created_at`,
      [overrideId, ov.start_date, ov.end_date, ov.owner, ov.color, ov.notes]
    );
    if (!upd.rows[0]) return res.status(404).json({ error: "override not found" });
    res.json({ override: upd.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update custody override failed" });
  } finally {
    client.release();
  }
});

app.delete("/admin/custody/overrides/:id", auth, requireAdmin, async (req, res) => {
  const overrideId = Number(req.params.id);
  if (!Number.isInteger(overrideId) || overrideId <= 0) return res.status(400).json({ error: "invalid override id" });

  const client = await pool.connect();
  try {
    const del = await client.query("DELETE FROM custody_overrides WHERE id=$1 RETURNING id", [overrideId]);
    if (!del.rows[0]) return res.status(404).json({ error: "override not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "delete custody override failed" });
  } finally {
    client.release();
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`✅ API running on http://localhost:${port}`));
