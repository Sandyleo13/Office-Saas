import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Database,
  FileText,
  Folder,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = "officeflow-token";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "files", label: "Files", icon: Folder },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "sheets", label: "Sheets", icon: BarChart3 },
  { id: "team", label: "Team", icon: Users, permission: "team" }
];

const statusOptions = ["All", "Editing", "Review", "Approved"];
const roleOptions = ["Admin", "Manager", "Editor", "Reviewer", "Viewer"];

function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [data, setData] = useState(null);
  const [view, setView] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [authMode, setAuthMode] = useState(new URLSearchParams(window.location.search).has("invite") ? "register" : "login");
  const [toast, setToast] = useState("");
  const [lastInvite, setLastInvite] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [sheet, setSheet] = useState(null);
  const uploadRef = useRef(null);

  const user = data?.user;
  const can = (permission) => Boolean(user?.permissions?.includes(permission));

  useEffect(() => {
    if (!token) return;
    api("/api/bootstrap", { token })
      .then((nextData) => {
        setData(nextData);
        setSelectedDocId(nextData.documents[0]?.id || "");
        setSheet(nextData.sheet);
      })
      .catch(() => logout());
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const metrics = useMemo(() => {
    const files = data?.files || [];
    return [
      { label: "Total files", value: files.length, trend: "+12%", tone: "violet" },
      { label: "In review", value: files.filter((file) => file.status === "Review").length, trend: "+4", tone: "amber" },
      { label: "Approved", value: files.filter((file) => file.status === "Approved").length, trend: "82%", tone: "green" },
      { label: "Open tasks", value: files.filter((file) => file.status !== "Approved").length, trend: "-8%", tone: "blue" }
    ];
  }, [data]);

  const filteredFiles = useMemo(() => {
    const search = query.toLowerCase();
    return (data?.files || []).filter((file) => {
      const matchesStatus = status === "All" || file.status === status;
      const haystack = `${file.name} ${file.owner} ${file.type} ${file.status}`.toLowerCase();
      return matchesStatus && haystack.includes(search);
    });
  }, [data, query, status]);

  const selectedDoc = (data?.documents || []).find((doc) => doc.id === selectedDocId) || data?.documents?.[0];

  function saveToken(nextToken) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setData(null);
    setView("dashboard");
  }

  async function handleAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload =
      authMode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            inviteToken: form.get("inviteToken")
          };

    try {
      const result = await api(`/api/auth/${authMode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: payload
      });
      saveToken(result.token);
      setToast(authMode === "login" ? "Welcome back" : "Account created");
    } catch (error) {
      setToast(error.message);
    }
  }

  async function demoLogin(email, password) {
    try {
      const result = await api("/api/auth/login", { method: "POST", body: { email, password } });
      saveToken(result.token);
      setToast("Demo session started");
    } catch (error) {
      setToast(error.message);
    }
  }

  async function refresh() {
    const nextData = await api("/api/bootstrap", { token });
    setData(nextData);
    setSheet(nextData.sheet);
  }

  async function uploadFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    await api("/api/files/upload", { token, method: "POST", formData });
    event.target.value = "";
    await refresh();
    setToast("Files uploaded");
  }

  async function updateFileStatus(file, nextStatus) {
    await api(`/api/files/${file.id}/status`, { token, method: "POST", body: { status: nextStatus } });
    await refresh();
    setToast(`${file.name} moved to ${nextStatus}`);
  }

  async function deleteFile(file) {
    await api(`/api/files/${file.id}`, { token, method: "DELETE" });
    await refresh();
    setToast("File deleted");
  }

  async function saveDocument() {
    if (!selectedDoc) return;
    const title = document.querySelector("#docTitle").value.trim() || "Untitled document";
    const body = document.querySelector("#docBody").innerHTML;
    await api(`/api/documents/${selectedDoc.id}`, { token, method: "PATCH", body: { title, body } });
    await refresh();
    setToast("Document saved");
  }

  async function createDocument() {
    const doc = await api("/api/documents", { token, method: "POST", body: { title: "Untitled document" } });
    await refresh();
    setSelectedDocId(doc.id);
    setToast("Document created");
  }

  async function saveSheet() {
    await api("/api/sheet", { token, method: "PUT", body: sheet });
    await refresh();
    setToast("Sheet saved");
  }

  function updateSheetCell(rowIndex, columnIndex, value) {
    setSheet((current) => {
      const rows = current.rows.map((row) => [...row]);
      rows[rowIndex][columnIndex] = value;
      return { ...current, rows };
    });
  }

  function updateSheetHeader(columnIndex, value) {
    setSheet((current) => {
      const headers = [...current.headers];
      headers[columnIndex] = value;
      return { ...current, headers };
    });
  }

  function addSheetRow() {
    setSheet((current) => ({ ...current, rows: [...current.rows, current.headers.map(() => "")] }));
  }

  function exportSheet() {
    const rows = [sheet.headers, ...sheet.rows];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sheet.title || "OfficeFlow Sheet"}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function createInvite(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const invite = await api("/api/invites", {
      token,
      method: "POST",
      body: { email: form.get("email"), role: form.get("role") }
    });
    event.currentTarget.reset();
    await refresh();
    setLastInvite(invite);
    setToast("Invite created. Token is visible in Team.");
  }

  async function copyInvite(invite) {
    const link = inviteUrl(invite.token);
    await navigator.clipboard.writeText(link);
    setToast("Invite link copied");
  }

  async function changeRole(member, role) {
    await api(`/api/users/${member.id}/role`, { token, method: "PATCH", body: { role } });
    await refresh();
    setToast("Role updated");
  }

  if (!token || !data) {
    return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} onDemo={demoLogin} toast={toast} />;
  }

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brandMark">OF</div>
          <div>
            <strong>OfficeFlow</strong>
            <span>Production workspace</span>
          </div>
        </div>
        <nav>
          {navItems
            .filter((item) => !item.permission || can(item.permission))
            .map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={view === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
        </nav>
        <div className="storageCard">
          <div className="storageTop">
            <Database size={18} />
            <span>Local storage</span>
          </div>
          <strong>{data.files.length} file records</strong>
          <div className="meter"><span style={{ width: `${Math.min(100, data.files.length * 12)}%` }} /></div>
        </div>
        <div className="profileCard">
          <span className="avatar">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="iconButton mobileOnly" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div>
            <p className="eyebrow">Role-secured SaaS workspace</p>
            <h1>{titleFor(view)}</h1>
          </div>
          <div className="topbarActions">
            <label className="search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace" />
            </label>
            <button className="iconButton"><Bell size={19} /></button>
            <button className="secondaryButton" onClick={logout}><LogOut size={17} /> Logout</button>
          </div>
        </header>

        <div className="permissionBanner">
          <ShieldCheck size={18} />
          <span>{user.role} permissions: {user.permissions.length ? user.permissions.join(", ") : "view only"}</span>
        </div>

        {view === "dashboard" && (
          <Dashboard
            metrics={metrics}
            files={data.files}
            logs={data.auditLogs}
            users={data.users}
            onUpload={() => uploadRef.current.click()}
            canUpload={can("upload")}
          />
        )}
        {view === "files" && (
          <FilesView
            files={filteredFiles}
            status={status}
            setStatus={setStatus}
            can={can}
            onUpload={() => uploadRef.current.click()}
            onStatus={updateFileStatus}
            onDelete={deleteFile}
          />
        )}
        {view === "docs" && (
          <DocsView
            docs={data.documents}
            selectedDoc={selectedDoc}
            selectedDocId={selectedDocId}
            setSelectedDocId={setSelectedDocId}
            canEdit={can("edit")}
            onCreate={createDocument}
            onSave={saveDocument}
          />
        )}
        {view === "sheets" && sheet && (
          <SheetsView
            sheet={sheet}
            setSheet={setSheet}
            canEdit={can("edit")}
            onHeader={updateSheetHeader}
            onCell={updateSheetCell}
            onAddRow={addSheetRow}
            onSave={saveSheet}
            onExport={exportSheet}
          />
        )}
        {view === "team" && (
          <TeamView
            users={data.users}
            invites={data.invites}
            canRoles={can("roles")}
            canInvite={can("invite")}
            onInvite={createInvite}
            onCopyInvite={copyInvite}
            onRole={changeRole}
            lastInvite={lastInvite}
          />
        )}
      </main>

      <input ref={uploadRef} type="file" multiple hidden onChange={uploadFiles} />
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X /></button>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AuthScreen({ mode, setMode, onSubmit, onDemo, toast }) {
  const isLogin = mode === "login";
  const inviteFromUrl = new URLSearchParams(window.location.search).get("invite") || "";
  return (
    <section className="authScreen">
      <div className="authHero">
        <div className="brand">
          <div className="brandMark">OF</div>
          <div>
            <strong>OfficeFlow</strong>
            <span>Secure office operations</span>
          </div>
        </div>
        <h1>Modern documents, approvals, storage, and team access in one workspace.</h1>
        <p>React UI, Express API, hashed passwords, role-based access, audit logs, local file storage, and PostgreSQL/MinIO production scaffolding.</p>
        <div className="heroPills">
          <span><Lock size={15} /> JWT sessions</span>
          <span><ShieldCheck size={15} /> Server roles</span>
          <span><Sparkles size={15} /> Responsive UI</span>
        </div>
      </div>
      <div className="authPanel">
        <p className="eyebrow">{isLogin ? "Welcome back" : "Public access"}</p>
        <h2>{isLogin ? "Sign in" : "Create account"}</h2>
        <form onSubmit={onSubmit}>
          {!isLogin && <input name="name" placeholder="Full name" required />}
          <input name="email" type="email" placeholder="Email" defaultValue={isLogin ? "admin@office.local" : ""} required />
          <input name="password" type="password" placeholder="Password" defaultValue={isLogin ? "admin123" : ""} minLength={isLogin ? 1 : 8} required />
          {!isLogin && <input name="inviteToken" placeholder="Invite token (optional)" defaultValue={inviteFromUrl} />}
          <button className="primaryButton" type="submit">{isLogin ? "Login" : "Register"}</button>
        </form>
        <button className="linkButton" onClick={() => setMode(isLogin ? "register" : "login")}>
          {isLogin ? "Create public viewer account" : "Back to login"}
        </button>
        <div className="demoGrid">
          <button onClick={() => onDemo("admin@office.local", "admin123")}>Admin</button>
          <button onClick={() => onDemo("priya@office.local", "manager123")}>Manager</button>
          <button onClick={() => onDemo("ravi@office.local", "editor123")}>Editor</button>
          <button onClick={() => onDemo("neha@office.local", "review123")}>Reviewer</button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}

function Dashboard({ metrics, files, logs, users, onUpload, canUpload }) {
  return (
    <div className="dashboardGrid">
      <section className="heroPanel">
        <div>
          <p className="eyebrow">Office health</p>
          <h2>Approval velocity is strong this week</h2>
          <p>Track document throughput, owner workload, and production readiness from one calm command center.</p>
        </div>
        <button className="primaryButton" disabled={!canUpload} onClick={onUpload}><Upload size={18} /> Upload files</button>
      </section>
      <section className="metricsRow">
        {metrics.map((metric) => (
          <article className={`metricCard ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.trend}</small>
          </article>
        ))}
      </section>
      <section className="panel widePanel">
        <PanelHeader title="Recent files" action="Workflow status" />
        <div className="tableList">
          {files.slice(0, 6).map((file) => <FileRow file={file} key={file.id} />)}
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="Team load" action={`${users.length} people`} />
        <div className="teamStack">
          {users.map((member) => (
            <div className="miniMember" key={member.id}>
              <span className="avatar">{initials(member.name)}</span>
              <div>
                <strong>{member.name}</strong>
                <small>{member.role}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel activityPanel">
        <PanelHeader title="Audit trail" action="Live" />
        {logs.slice(0, 8).map((log) => (
          <div className="activityItem" key={log.id}>
            <Activity size={16} />
            <span>{log.action}</span>
            <small>{new Date(log.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </section>
    </div>
  );
}

function FilesView({ files, status, setStatus, can, onUpload, onStatus, onDelete }) {
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="segments">
          {statusOptions.map((option) => (
            <button className={status === option ? "active" : ""} key={option} onClick={() => setStatus(option)}>{option}</button>
          ))}
        </div>
        <button className="primaryButton" disabled={!can("upload")} onClick={onUpload}><Upload size={18} /> Upload</button>
      </div>
      <div className="fileGrid">
        {files.map((file) => (
          <article className="fileCard" key={file.id}>
            <div className="fileIcon"><FileText size={22} /></div>
            <strong>{file.name}</strong>
            <p>{file.type} · {file.owner} · v{file.version}</p>
            <StatusBadge status={file.status} />
            <small>{file.notes}</small>
            <div className="cardActions">
              {can("edit") && <button onClick={() => onStatus(file, "Editing")}>Edit</button>}
              {can("review") && <button onClick={() => onStatus(file, "Review")}>Review</button>}
              {can("approve") && <button onClick={() => onStatus(file, "Approved")}>Approve</button>}
              {can("delete") && <button className="danger" onClick={() => onDelete(file)}>Delete</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DocsView({ docs, selectedDoc, selectedDocId, setSelectedDocId, canEdit, onCreate, onSave }) {
  return (
    <div className="editorLayout">
      <aside className="panel docRail">
        <PanelHeader title="Documents" action={canEdit ? <button className="iconButton" onClick={onCreate}><Plus size={18} /></button> : null} />
        {docs.map((doc) => (
          <button className={selectedDocId === doc.id ? "docButton active" : "docButton"} key={doc.id} onClick={() => setSelectedDocId(doc.id)}>
            <strong>{doc.title}</strong>
            <small>{doc.status}</small>
          </button>
        ))}
      </aside>
      <section className="panel docEditor">
        <input id="docTitle" className="docTitle" defaultValue={selectedDoc?.title || ""} readOnly={!canEdit} />
        <div id="docBody" className="richEditor" contentEditable={canEdit} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: selectedDoc?.body || "" }} />
        <button className="primaryButton" disabled={!canEdit} onClick={onSave}><ClipboardCheck size={18} /> Save document</button>
      </section>
    </div>
  );
}

function SheetsView({ sheet, setSheet, canEdit, onHeader, onCell, onAddRow, onSave, onExport }) {
  return (
    <section className="panel">
      <div className="toolbar">
        <input className="sheetTitle" value={sheet.title} readOnly={!canEdit} onChange={(event) => setSheet({ ...sheet, title: event.target.value })} />
        <div className="sheetActions">
          <button className="secondaryButton" disabled={!canEdit} onClick={onAddRow}><Plus size={17} /> Row</button>
          <button className="primaryButton" disabled={!canEdit} onClick={onSave}><CheckCircle2 size={17} /> Save</button>
          <button className="secondaryButton" onClick={onExport}>Export CSV</button>
        </div>
      </div>
      <div className="sheetWrap">
        <table>
          <thead>
            <tr>{sheet.headers.map((header, index) => <th key={index}><input value={header} readOnly={!canEdit} onChange={(event) => onHeader(index, event.target.value)} /></th>)}</tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, columnIndex) => (
                  <td key={columnIndex}><input value={cell} readOnly={!canEdit} onChange={(event) => onCell(rowIndex, columnIndex, event.target.value)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamView({ users, invites, canRoles, canInvite, onInvite, onCopyInvite, onRole, lastInvite }) {
  return (
    <div className="teamLayout">
      <section className="panel">
        <PanelHeader title="People and permissions" action="Server enforced" />
        <div className="teamGrid">
          {users.map((member) => (
            <article className="memberCard" key={member.id}>
              <span className="avatar">{initials(member.name)}</span>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
              {canRoles ? (
                <select value={member.role} onChange={(event) => onRole(member, event.target.value)}>
                  {roleOptions.map((role) => <option key={role}>{role}</option>)}
                </select>
              ) : (
                <StatusBadge status={member.role} />
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="panel invitePanel">
        <PanelHeader title="Invite user" action={<Mail size={17} />} />
        <form onSubmit={onInvite}>
          <input name="email" type="email" placeholder="teammate@company.com" required disabled={!canInvite} />
          <label className="selectLabel">
            Role
            <select name="role" disabled={!canInvite}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select>
          </label>
          <button className="primaryButton" disabled={!canInvite}>Create invite</button>
        </form>
        {lastInvite && (
          <div className="inviteSuccess">
            <strong>Latest invite link</strong>
            <code>{inviteUrl(lastInvite.token)}</code>
            <button className="secondaryButton" onClick={() => onCopyInvite(lastInvite)} type="button"><Copy size={16} /> Copy link</button>
          </div>
        )}
        <div className="inviteList">
          {invites.slice(0, 5).map((invite) => (
            <div key={invite.id}>
              <strong>{invite.email}</strong>
              <small>{invite.role} · {invite.acceptedAt ? "Accepted" : "Pending"} · expires {new Date(invite.expiresAt).toLocaleDateString()}</small>
              {!invite.acceptedAt && (
                <button className="copyInviteButton" onClick={() => onCopyInvite(invite)} type="button">
                  <Copy size={15} /> Copy invite link
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PanelHeader({ title, action }) {
  return (
    <div className="panelHeader">
      <h2>{title}</h2>
      {typeof action === "string" ? <span>{action}</span> : action}
    </div>
  );
}

function FileRow({ file }) {
  return (
    <div className="fileRow">
      <span className="fileIcon"><FileText size={18} /></span>
      <div>
        <strong>{file.name}</strong>
        <small>{file.type} · {file.owner}</small>
      </div>
      <StatusBadge status={file.status} />
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`statusBadge ${status}`}>{status}</span>;
}

async function api(path, { token, method = "GET", body, formData } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: formData || (body ? JSON.stringify(body) : undefined)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

function initials(name) {
  return String(name)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function inviteUrl(token) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  return url.toString();
}

function titleFor(view) {
  return {
    dashboard: "Dashboard",
    files: "File Workflow",
    docs: "Document Studio",
    sheets: "Sheet Workspace",
    team: "Team Access"
  }[view];
}

createRoot(document.getElementById("root")).render(<App />);
