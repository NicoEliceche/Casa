import "dotenv/config";
import cors from "cors";
import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;

const defaultTasks = [
  "Pedir presupuesto final de mano de obra",
  "Definir ubicacion de tomas y luces",
  "Comprar canerias y accesorios sanitarios",
  "Elegir aberturas para puerta y ventanas",
  "Coordinar revoques interiores",
  "Definir pisos y revestimientos",
  "Revisar instalacion de cocina y bano"
];

const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

const sseClients = new Map();

app.set("trust proxy", 1);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", async (req, res, next) => {
  try {
    const listId = parseListId(req.query.listId);
    await ensureList(listId);
    const tasks = await getTasks(listId);
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", async (req, res, next) => {
  try {
    const listId = parseListId(req.body.listId);
    const text = parseText(req.body.text);

    await ensureList(listId);
    const { rows } = await pool.query(
      `
      insert into todo_items (list_id, text, position)
      values (
        $1,
        $2,
        coalesce((select max(position) + 1 from todo_items where list_id = $1), 0)
      )
      returning id, text, completed, position, created_at, updated_at
      `,
      [listId, text]
    );

    broadcast(listId);
    res.status(201).json({ task: mapTask(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id", async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const listId = parseListId(req.body.listId);

    if (typeof req.body.completed !== "boolean") {
      throw httpError(400, "completed must be boolean");
    }

    const { rows } = await pool.query(
      `
      update todo_items
      set completed = $1, updated_at = now()
      where id = $2 and list_id = $3
      returning id, text, completed, position, created_at, updated_at
      `,
      [req.body.completed, id, listId]
    );

    if (!rows.length) throw httpError(404, "task not found");

    broadcast(listId);
    res.json({ task: mapTask(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:id", async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const listId = parseListId(req.query.listId);

    const result = await pool.query("delete from todo_items where id = $1 and list_id = $2", [id, listId]);
    if (!result.rowCount) throw httpError(404, "task not found");

    broadcast(listId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/events", (req, res, next) => {
  try {
    const listId = parseListId(req.query.listId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    addSseClient(listId, res);
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeSseClient(listId, res);
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error.message || "server error" });
});

await ensureSchema();

app.listen(port, () => {
  console.log(`Casa 10x10 API running on port ${port}`);
});

async function ensureSchema() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  await pool.query(`
    create extension if not exists pgcrypto;

    create table if not exists todo_lists (
      id text primary key,
      created_at timestamptz not null default now()
    );

    create table if not exists todo_items (
      id uuid primary key default gen_random_uuid(),
      list_id text not null references todo_lists(id) on delete cascade,
      text text not null,
      completed boolean not null default false,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists todo_items_list_position_idx
      on todo_items (list_id, position, created_at);
  `);
}

async function ensureList(listId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const inserted = await client.query(
      "insert into todo_lists (id) values ($1) on conflict do nothing returning id",
      [listId]
    );

    if (inserted.rowCount) {
      for (const [position, text] of defaultTasks.entries()) {
        await client.query("insert into todo_items (list_id, text, position) values ($1, $2, $3)", [
          listId,
          text,
          position
        ]);
      }
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function getTasks(listId) {
  const { rows } = await pool.query(
    `
    select id, text, completed, position, created_at, updated_at
    from todo_items
    where list_id = $1
    order by position asc, created_at asc
    `,
    [listId]
  );
  return rows.map(mapTask);
}

function mapTask(row) {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function addSseClient(listId, res) {
  if (!sseClients.has(listId)) sseClients.set(listId, new Set());
  sseClients.get(listId).add(res);
}

function removeSseClient(listId, res) {
  const clients = sseClients.get(listId);
  if (!clients) return;
  clients.delete(res);
  if (!clients.size) sseClients.delete(listId);
}

function broadcast(listId) {
  const clients = sseClients.get(listId);
  if (!clients) return;
  const payload = `event: changed\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function parseListId(value) {
  const listId = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{4,72}$/.test(listId)) {
    throw httpError(400, "invalid listId");
  }
  return listId;
}

function parseText(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || text.length > 140) {
    throw httpError(400, "text must be 1 to 140 chars");
  }
  return text;
}

function parseUuid(value) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw httpError(400, "invalid task id");
  }
  return id;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseCorsOrigin(value) {
  const raw = String(value || "*").trim();
  if (!raw || raw === "*") return "*";

  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length ? origins : "*";
}
