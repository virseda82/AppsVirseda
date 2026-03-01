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

app.get("/health", (_, res) => res.json({ ok: true }));
const isDevelopment = process.env.NODE_ENV === "development";

function parseIsoDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t);
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

/**
 * Bootstrap DB (rápido para arrancar)
 * En producción lo quitaríamos o protegeríamos con una clave.
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
        password_hash TEXT NOT NULL
      );
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
      `INSERT INTO users(email, name, password_hash)
       VALUES ($1,$2,$3)
       RETURNING id, email, name`,
      [email.toLowerCase(), name || null, hash]
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
      "SELECT id, email, name, password_hash FROM users WHERE email=$1",
      [email.toLowerCase()]
    );
    const user = q.rows[0];
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, is_admin: isAdminEmail(user.email) },
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

async function requireFamilyMember(client, familyId, userId) {
  const r = await client.query(
    "SELECT role FROM family_members WHERE family_id=$1 AND user_id=$2",
    [familyId, userId]
  );
  return r.rows[0]?.role || null;
}

app.get("/families/:familyId/events", auth, async (req, res) => {
  const { familyId } = req.params;
  const { from, to } = req.query;
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
  const { familyId } = req.params;
  const validated = validateEventPayload(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { title, notes, startAt, endAt, allDay, color } = validated.value;

  const client = await pool.connect();
  try {
    const role = await requireFamilyMember(client, familyId, req.user.userId);
    if (!role || (role !== "owner" && role !== "editor")) {
      return res.status(403).json({ error: "No write permission" });
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

app.post("/admin/reset-events", auth, async (req, res) => {
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: "admin only" });
  }

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

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`✅ API running on http://localhost:${port}`));
