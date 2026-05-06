import bcrypt from "bcryptjs";
import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { permissions, roles } from "./seed.js";
import { loadDb, logAudit, saveDb, uploadsDir } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4100);
const jwtSecret = process.env.JWT_SECRET || "dev-only-change-this-secret";
const sessionHours = Number(process.env.SESSION_HOURS || 8);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    permissions: permissions[user.role] || []
  };
}

function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: `${sessionHours}h` });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Authentication required" });

  try {
    const payload = jwt.verify(token, jwtSecret);
    const db = await loadDb();
    const user = db.users.find((item) => item.id === payload.sub && item.status === "Active");
    if (!user) return res.status(401).json({ message: "Session user not found" });
    req.user = user;
    req.db = db;
    next();
  } catch {
    res.status(401).json({ message: "Session expired" });
  }
}

function can(permission) {
  return (req, res, next) => {
    if ((permissions[req.user.role] || []).includes(permission)) return next();
    return res.status(403).json({ message: "Role does not allow this action" });
  };
}

function inferType(fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
  if (ext === "pdf") return "PDF";
  return "Document";
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "OfficeFlow API" });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const db = await loadDb();
  const user = db.users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ""), user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (user.status !== "Active") return res.status(403).json({ message: "Account is not active" });

  await logAudit(user.name, "Signed in");
  res.json({ token: tokenFor(user), user: publicUser(user), expiresInHours: sessionHours });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, inviteToken } = req.body;
  const db = await loadDb();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanInviteToken = String(inviteToken || "").trim();

  if (!name || !cleanEmail || String(password || "").length < 8) {
    return res.status(400).json({ message: "Name, email, and an 8 character password are required" });
  }
  if (db.users.some((user) => user.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({ message: "Email is already registered" });
  }

  let role = "Viewer";
  const invite = cleanInviteToken ? db.invites.find((item) => item.token === cleanInviteToken) : null;
  if (cleanInviteToken && !invite) {
    return res.status(400).json({ message: "Invite token is invalid" });
  }
  if (invite?.acceptedAt) {
    return res.status(400).json({ message: "Invite has already been accepted" });
  }
  if (invite && new Date(invite.expiresAt) <= new Date()) {
    return res.status(400).json({ message: "Invite has expired" });
  }
  if (invite && invite.email && invite.email !== cleanEmail) {
    return res.status(400).json({ message: "Invite token belongs to a different email" });
  }
  if (invite) {
    role = invite.role;
    invite.acceptedAt = new Date().toISOString();
  }

  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: cleanEmail,
    passwordHash: await bcrypt.hash(String(password), 12),
    role,
    status: "Active",
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  await saveDb(db);
  await logAudit(user.name, `Registered as ${role}`);
  res.status(201).json({ token: tokenFor(user), user: publicUser(user), expiresInHours: sessionHours });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/bootstrap", auth, (req, res) => {
  res.json({
    user: publicUser(req.user),
    roles,
    permissions,
    files: req.db.files,
    documents: req.db.documents,
    sheet: req.db.sheet,
    users: req.db.users.map(publicUser),
    invites: req.db.invites,
    auditLogs: req.db.auditLogs
  });
});

app.get("/api/files", auth, (req, res) => {
  res.json(req.db.files);
});

app.post("/api/files/upload", auth, can("upload"), upload.array("files"), async (req, res) => {
  const now = new Date().toISOString();
  const created = (req.files || []).map((file) => ({
    id: crypto.randomUUID(),
    name: file.originalname,
    type: inferType(file.originalname),
    owner: req.user.name,
    status: "Editing",
    size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    updatedAt: now,
    notes: "Uploaded to local server storage. Configure S3 or MinIO for production.",
    version: 1,
    storageKey: file.filename,
    url: `/uploads/${file.filename}`
  }));
  req.db.files.unshift(...created);
  await saveDb(req.db);
  await logAudit(req.user.name, `Uploaded ${created.length} file(s)`);
  res.status(201).json(created);
});

app.patch("/api/files/:id", auth, can("edit"), async (req, res) => {
  const file = req.db.files.find((item) => item.id === req.params.id);
  if (!file) return res.status(404).json({ message: "File not found" });

  Object.assign(file, {
    ...req.body,
    id: file.id,
    updatedAt: new Date().toISOString()
  });
  await saveDb(req.db);
  await logAudit(req.user.name, `Updated ${file.name}`, file.id);
  res.json(file);
});

app.post("/api/files/:id/status", auth, async (req, res) => {
  const status = req.body.status;
  const needed = status === "Approved" ? "approve" : status === "Review" ? "review" : "edit";
  if (!(permissions[req.user.role] || []).includes(needed)) {
    return res.status(403).json({ message: "Role does not allow this status change" });
  }

  const file = req.db.files.find((item) => item.id === req.params.id);
  if (!file) return res.status(404).json({ message: "File not found" });
  file.status = status;
  file.updatedAt = new Date().toISOString();
  await saveDb(req.db);
  await logAudit(req.user.name, `Moved ${file.name} to ${status}`, file.id);
  res.json(file);
});

app.delete("/api/files/:id", auth, can("delete"), async (req, res) => {
  const file = req.db.files.find((item) => item.id === req.params.id);
  req.db.files = req.db.files.filter((item) => item.id !== req.params.id);
  await saveDb(req.db);
  await logAudit(req.user.name, `Deleted ${file?.name || req.params.id}`, req.params.id);
  res.status(204).end();
});

app.post("/api/documents", auth, can("edit"), async (req, res) => {
  const document = {
    id: crypto.randomUUID(),
    title: req.body.title || "Untitled document",
    status: "Editing",
    body: req.body.body || "<p>Start typing here.</p>",
    updatedAt: new Date().toISOString()
  };
  req.db.documents.unshift(document);
  await saveDb(req.db);
  await logAudit(req.user.name, `Created ${document.title}`);
  res.status(201).json(document);
});

app.patch("/api/documents/:id", auth, can("edit"), async (req, res) => {
  const document = req.db.documents.find((item) => item.id === req.params.id);
  if (!document) return res.status(404).json({ message: "Document not found" });
  Object.assign(document, req.body, { updatedAt: new Date().toISOString() });
  await saveDb(req.db);
  await logAudit(req.user.name, `Saved ${document.title}`, document.id);
  res.json(document);
});

app.put("/api/sheet", auth, can("edit"), async (req, res) => {
  req.db.sheet = req.body;
  await saveDb(req.db);
  await logAudit(req.user.name, `Saved sheet ${req.body.title || "Untitled sheet"}`);
  res.json(req.db.sheet);
});

app.post("/api/invites", auth, can("invite"), async (req, res) => {
  const role = roles.includes(req.body.role) ? req.body.role : "Viewer";
  const invite = {
    id: crypto.randomUUID(),
    email: String(req.body.email || "").trim().toLowerCase(),
    role,
    token: crypto.randomBytes(20).toString("hex"),
    createdBy: req.user.name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    acceptedAt: null
  };
  req.db.invites.unshift(invite);
  await saveDb(req.db);
  await logAudit(req.user.name, `Invited ${invite.email} as ${role}`);
  res.status(201).json(invite);
});

app.patch("/api/users/:id/role", auth, can("roles"), async (req, res) => {
  const user = req.db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!roles.includes(req.body.role)) return res.status(400).json({ message: "Unknown role" });
  user.role = req.body.role;
  await saveDb(req.db);
  await logAudit(req.user.name, `Changed ${user.name} to ${user.role}`, user.id);
  res.json(publicUser(user));
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => {
  console.log(`OfficeFlow API listening on http://127.0.0.1:${port}`);
});
