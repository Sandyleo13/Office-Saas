import bcrypt from "bcryptjs";
import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoWorkspace, permissions, roles } from "./seed.js";
import { loadDb, logAudit, saveDb, uploadsDir } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4100);
const jwtSecret = process.env.JWT_SECRET || "dev-only-change-this-secret";
const sessionHours = Number(process.env.SESSION_HOURS || 8);
const clientOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || clientOrigins.length === 0 || clientOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    }
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  const effectivePermissions = new Set(permissions[user.role] || []);
  if (user.storageAccess === false) {
    effectivePermissions.delete("upload");
    effectivePermissions.delete("edit");
  }

  return {
    ...safeUser,
    storageAccess: user.storageAccess !== false,
    permissions: [...effectivePermissions]
  };
}

function isAdmin(user) {
  return user.role === "Admin";
}

function isTeamMember(user) {
  return ["Admin", "Manager", "Editor", "Reviewer"].includes(user.role);
}

function effectivePermissions(user) {
  const allowed = new Set(permissions[user.role] || []);
  if (user.storageAccess === false) {
    allowed.delete("upload");
    allowed.delete("edit");
  }
  return allowed;
}

function visibleFiles(db, user) {
  if (isAdmin(user)) return db.files;
  if (isTeamMember(user)) return db.files.filter((file) => file.visibility !== "private");
  return db.files.filter((file) => file.ownerId === user.id);
}

function visibleDocuments(db, user) {
  if (isAdmin(user)) return db.documents;
  if (isTeamMember(user)) return db.documents.filter((document) => !document.ownerId || document.visibility === "team");
  return db.documents.filter((document) => document.ownerId === user.id);
}

function sheetForUser(db, user) {
  if (isTeamMember(user)) return db.sheet;
  db.userSheets ||= {};
  if (!db.userSheets[user.id]) {
    db.userSheets[user.id] = createDemoWorkspace(user).sheet;
  }
  return db.userSheets[user.id];
}

async function ensurePersonalWorkspace(db, user) {
  if (isTeamMember(user)) return;
  const hasFiles = db.files.some((file) => file.ownerId === user.id);
  const hasDocuments = db.documents.some((document) => document.ownerId === user.id);
  db.userSheets ||= {};
  if (hasFiles && hasDocuments && db.userSheets[user.id]) return;

  const demo = createDemoWorkspace(user);
  if (!hasFiles) db.files.unshift(...demo.files);
  if (!hasDocuments) db.documents.unshift(...demo.documents);
  db.userSheets[user.id] ||= demo.sheet;
  await saveDb(db);
}

function ensureStorageAccess(req, res, next) {
  if (req.user.storageAccess === false) {
    return res.status(403).json({ message: "Storage access is disabled by Admin" });
  }
  next();
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
    await ensurePersonalWorkspace(db, user);
    req.user = user;
    req.db = db;
    next();
  } catch {
    res.status(401).json({ message: "Session expired" });
  }
}

function can(permission) {
  return (req, res, next) => {
    if (effectivePermissions(req.user).has(permission)) return next();
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
    storageAccess: true,
    status: "Active",
    createdAt: new Date().toISOString()
  };
  const demo = createDemoWorkspace(user);
  db.users.push(user);
  db.files.unshift(...demo.files);
  db.documents.unshift(...demo.documents);
  db.userSheets ||= {};
  db.userSheets[user.id] = demo.sheet;
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
    files: visibleFiles(req.db, req.user),
    documents: visibleDocuments(req.db, req.user),
    sheet: sheetForUser(req.db, req.user),
    users: isTeamMember(req.user) ? req.db.users.map(publicUser) : [publicUser(req.user)],
    invites: isTeamMember(req.user) ? req.db.invites : [],
    auditLogs: isTeamMember(req.user) ? req.db.auditLogs : req.db.auditLogs.filter((log) => log.actor === req.user.name)
  });
});

app.get("/api/files", auth, (req, res) => {
  res.json(visibleFiles(req.db, req.user));
});

app.post("/api/files/upload", auth, can("upload"), ensureStorageAccess, upload.array("files"), async (req, res) => {
  const now = new Date().toISOString();
  const created = (req.files || []).map((file) => ({
    id: crypto.randomUUID(),
    name: file.originalname,
    type: inferType(file.originalname),
    owner: req.user.name,
    ownerId: req.user.id,
    visibility: isTeamMember(req.user) ? "team" : "private",
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

app.patch("/api/files/:id", auth, can("edit"), ensureStorageAccess, async (req, res) => {
  const file = visibleFiles(req.db, req.user).find((item) => item.id === req.params.id);
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
  const file = req.db.files.find((item) => item.id === req.params.id);
  if (!file) return res.status(404).json({ message: "File not found" });
  if (!visibleFiles(req.db, req.user).some((item) => item.id === file.id)) {
    return res.status(404).json({ message: "File not found" });
  }
  const canChangeOwnPrivateFile = file.ownerId === req.user.id && file.visibility === "private" && req.user.storageAccess !== false;
  if (!canChangeOwnPrivateFile && !effectivePermissions(req.user).has(needed)) {
    return res.status(403).json({ message: "Role does not allow this status change" });
  }

  file.status = status;
  file.updatedAt = new Date().toISOString();
  await saveDb(req.db);
  await logAudit(req.user.name, `Moved ${file.name} to ${status}`, file.id);
  res.json(file);
});

app.delete("/api/files/:id", auth, can("delete"), async (req, res) => {
  const file = visibleFiles(req.db, req.user).find((item) => item.id === req.params.id);
  if (!file) return res.status(404).json({ message: "File not found" });
  req.db.files = req.db.files.filter((item) => item.id !== req.params.id);
  await saveDb(req.db);
  await logAudit(req.user.name, `Deleted ${file?.name || req.params.id}`, req.params.id);
  res.status(204).end();
});

app.post("/api/documents", auth, can("edit"), ensureStorageAccess, async (req, res) => {
  const document = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    visibility: isTeamMember(req.user) ? "team" : "private",
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

app.patch("/api/documents/:id", auth, can("edit"), ensureStorageAccess, async (req, res) => {
  const document = visibleDocuments(req.db, req.user).find((item) => item.id === req.params.id);
  if (!document) return res.status(404).json({ message: "Document not found" });
  Object.assign(document, req.body, { updatedAt: new Date().toISOString() });
  await saveDb(req.db);
  await logAudit(req.user.name, `Saved ${document.title}`, document.id);
  res.json(document);
});

app.put("/api/sheet", auth, can("edit"), ensureStorageAccess, async (req, res) => {
  if (isTeamMember(req.user)) {
    req.db.sheet = req.body;
  } else {
    req.db.userSheets ||= {};
    req.db.userSheets[req.user.id] = req.body;
  }
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
  if (user.email === "admin@office.local" && req.body.role !== "Admin") {
    return res.status(400).json({ message: "Primary admin account must keep Admin access" });
  }
  if (user.email !== "admin@office.local" && req.body.role === "Admin") {
    return res.status(400).json({ message: "Only the primary admin account can use Admin access" });
  }
  if (!roles.includes(req.body.role)) return res.status(400).json({ message: "Unknown role" });
  user.role = req.body.role;
  await saveDb(req.db);
  await logAudit(req.user.name, `Changed ${user.name} to ${user.role}`, user.id);
  res.json(publicUser(user));
});

app.patch("/api/users/:id/storage-access", auth, can("roles"), async (req, res) => {
  const user = req.db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.email === "admin@office.local") {
    return res.status(400).json({ message: "Primary admin account must keep storage access" });
  }
  user.storageAccess = Boolean(req.body.storageAccess);
  await saveDb(req.db);
  await logAudit(req.user.name, `${user.storageAccess ? "Enabled" : "Disabled"} storage access for ${user.name}`, user.id);
  res.json(publicUser(user));
});

app.use("/api", (req, res) => {
  res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");

  app.use(express.static(dist));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    res.sendFile(path.join(dist, "index.html"));
  });
}
app.listen(port, () => {
  console.log(`OfficeFlow API listening on http://127.0.0.1:${port}`);
});
app.get("/", (req, res) => {
  res.json({
    status: "OfficeFlow API running"
  });
});
