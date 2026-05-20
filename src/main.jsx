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
  Download,
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

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "officeflow-token";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "files", label: "Files", icon: Folder },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "sheets", label: "Sheets", icon: BarChart3 },
  { id: "team", label: "Team", icon: Users, permission: "team" },
  { id: "admin", label: "Admin Panel", icon: ShieldCheck, permission: "roles" }
];

const statusOptions = ["All", "Editing", "Review", "Approved"];
const assignableRoleOptions = ["Manager", "Editor", "Reviewer", "Viewer"];
const WORKSPACE_SHEET_KEY = "workspace-sheet";

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
  const [selectedDocKey, setSelectedDocKey] = useState("");
  const [openDocFileIds, setOpenDocFileIds] = useState([]);
  const [selectedSheetKey, setSelectedSheetKey] = useState(WORKSPACE_SHEET_KEY);
  const [openSheetFileIds, setOpenSheetFileIds] = useState([]);
  const [sheetDrafts, setSheetDrafts] = useState({});
  const [authLoading, setAuthLoading] = useState(false);
  const uploadRef = useRef(null);

  const user = data?.user;
  const can = (permission) => Boolean(user?.permissions?.includes(permission));

  useEffect(() => {
    if (!token) return;
    api("/api/bootstrap", { token })
      .then((nextData) => {
        setData(nextData);
        setSelectedDocKey(nextData.documents[0]?.id || "");
        setSheetDrafts({ [WORKSPACE_SHEET_KEY]: nextData.sheet });
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

  const openDocFiles = useMemo(
    () => openDocFileIds.map((id) => (data?.files || []).find((file) => file.id === id)).filter(Boolean),
    [data, openDocFileIds]
  );
  const openSheetFiles = useMemo(
    () => openSheetFileIds.map((id) => (data?.files || []).find((file) => file.id === id)).filter(Boolean),
    [data, openSheetFileIds]
  );
  const docTabs = useMemo(
    () => [
      ...(data?.documents || []).map((doc) => ({ key: doc.id, title: doc.title, status: doc.status, source: "document" })),
      ...openDocFiles.map((file) => ({ key: fileKey(file), title: file.name, status: file.status, source: "file" }))
    ],
    [data, openDocFiles]
  );
  const sheetTabs = useMemo(
    () => [
      { key: WORKSPACE_SHEET_KEY, title: data?.sheet?.title || "Expense Tracker", status: "Workspace", source: "sheet" },
      ...openSheetFiles.map((file) => ({ key: fileKey(file), title: file.name, status: file.status, source: "file" }))
    ],
    [data, openSheetFiles]
  );
  const selectedDoc =
    selectedDocKey.startsWith("file:")
      ? documentFromFile((data?.files || []).find((file) => fileKey(file) === selectedDocKey))
      : (data?.documents || []).find((doc) => doc.id === selectedDocKey) || data?.documents?.[0];
  const sheet = sheetDrafts[selectedSheetKey] || data?.sheet;

  function saveToken(nextToken) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setData(null);
    setView("dashboard");
    setOpenDocFileIds([]);
    setOpenSheetFileIds([]);
    setSheetDrafts({});
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (authLoading) return;

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
      setAuthLoading(true);
      const result = await api(`/api/auth/${authMode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: payload
      });
      saveToken(result.token);
      setToast(authMode === "login" ? "Welcome back" : "Account created");
    } catch (error) {
      setToast(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function refresh() {
    const nextData = await api("/api/bootstrap", { token });
    setData(nextData);
    setSheetDrafts((current) => ({ ...current, [WORKSPACE_SHEET_KEY]: nextData.sheet }));
  }

  function openFile(file) {
    const kind = fileKind(file);
    if (kind === "sheet") {
      const key = fileKey(file);
      setOpenSheetFileIds((current) => (current.includes(file.id) ? current : [...current, file.id]));
      setSheetDrafts((current) => ({ ...current, [key]: current[key] || sheetFromFile(file) }));
      setSelectedSheetKey(key);
      setView("sheets");
      setToast(`${file.name} opened in Sheets`);
      return;
    }

    const key = fileKey(file);
    setOpenDocFileIds((current) => (current.includes(file.id) ? current : [...current, file.id]));
    setSelectedDocKey(key);
    setView("docs");
    setToast(`${file.name} opened in Docs`);
  }

  function closeDocFile(fileId) {
    setOpenDocFileIds((current) => current.filter((id) => id !== fileId));
    if (selectedDocKey === `file:${fileId}`) {
      setSelectedDocKey(data?.documents?.[0]?.id || "");
    }
  }

  function closeSheetFile(fileId) {
    const key = `file:${fileId}`;
    setOpenSheetFileIds((current) => current.filter((id) => id !== fileId));
    setSheetDrafts((current) => {
      const { [key]: removed, ...rest } = current;
      return rest;
    });
    if (selectedSheetKey === key) {
      setSelectedSheetKey(WORKSPACE_SHEET_KEY);
    }
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
    if (selectedDoc.source === "file") {
      await api(`/api/files/${selectedDoc.fileId}`, { token, method: "PATCH", body: { name: title, content: body, type: "Document" } });
    } else {
      await api(`/api/documents/${selectedDoc.id}`, { token, method: "PATCH", body: { title, body } });
    }
    await refresh();
    setToast(selectedDoc.source === "file" ? "File document saved" : "Document saved");
  }

  async function createDocument() {
    const doc = await api("/api/documents", { token, method: "POST", body: { title: "Untitled document" } });
    await refresh();
    setSelectedDocKey(doc.id);
    setToast("Document created");
  }

  async function saveSheet() {
    if (selectedSheetKey.startsWith("file:")) {
      const fileId = selectedSheetKey.slice(5);
      await api(`/api/files/${fileId}`, { token, method: "PATCH", body: { name: sheet.title, type: "Spreadsheet", content: sheetToCsv(sheet) } });
    } else {
      await api("/api/sheet", { token, method: "PUT", body: sheet });
    }
    await refresh();
    setToast(selectedSheetKey.startsWith("file:") ? "File sheet saved" : "Sheet saved");
  }

  function updateSheetCell(rowIndex, columnIndex, value) {
    setSheetDrafts((drafts) => {
      const current = drafts[selectedSheetKey] || data.sheet;
      const rows = current.rows.map((row) => [...row]);
      rows[rowIndex][columnIndex] = value;
      return { ...drafts, [selectedSheetKey]: { ...current, rows } };
    });
  }

  function updateSheetHeader(columnIndex, value) {
    setSheetDrafts((drafts) => {
      const current = drafts[selectedSheetKey] || data.sheet;
      const headers = [...current.headers];
      headers[columnIndex] = value;
      return { ...drafts, [selectedSheetKey]: { ...current, headers } };
    });
  }

  function addSheetRow() {
    setSheetDrafts((drafts) => {
      const current = drafts[selectedSheetKey] || data.sheet;
      return { ...drafts, [selectedSheetKey]: { ...current, rows: [...current.rows, current.headers.map(() => "")] } };
    });
  }

  function updateSheetTitle(title) {
    setSheetDrafts((drafts) => {
      const current = drafts[selectedSheetKey] || data.sheet;
      return { ...drafts, [selectedSheetKey]: { ...current, title } };
    });
  }

  function exportSheet(targetSheet = sheet) {
    downloadText(`${targetSheet.title || "OfficeFlow Sheet"}.csv`, sheetToCsv(targetSheet), "text/csv;charset=utf-8");
  }

  function downloadDocument(doc = selectedDoc) {
    if (!doc) return;
    downloadText(`${doc.title || "OfficeFlow Document"}.html`, `<!doctype html><html><body>${doc.body || ""}</body></html>`, "text/html;charset=utf-8");
  }

  function downloadOriginal(file) {
    if (file?.url) {
      window.open(`${API_URL}${file.url}`, "_blank", "noopener,noreferrer");
      return;
    }

    downloadText(file?.name || "officeflow-file.txt", file?.content || file?.notes || "", "text/plain;charset=utf-8");
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

  async function changeStorageAccess(member, storageAccess) {
    await api(`/api/users/${member.id}/storage-access`, { token, method: "PATCH", body: { storageAccess } });
    await refresh();
    setToast(storageAccess ? "Storage access enabled" : "Storage access disabled");
  }

  if (!token || !data) {
    return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} toast={toast} loading={authLoading} />;
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
            onOpen={openFile}
          />
        )}
        {view === "docs" && (
          <DocsView
            docs={data.documents}
            tabs={docTabs}
            files={openDocFiles}
            selectedDoc={selectedDoc}
            selectedDocKey={selectedDoc?.id || selectedDocKey}
            setSelectedDocKey={setSelectedDocKey}
            canEdit={can("edit")}
            onCreate={createDocument}
            onSave={saveDocument}
            onCloseFile={closeDocFile}
            onDownload={downloadDocument}
            onDownloadOriginal={downloadOriginal}
          />
        )}
        {view === "sheets" && sheet && (
          <SheetsView
            sheet={sheet}
            tabs={sheetTabs}
            files={openSheetFiles}
            selectedSheetKey={selectedSheetKey}
            setSelectedSheetKey={setSelectedSheetKey}
            setSheetTitle={updateSheetTitle}
            canEdit={can("edit")}
            onHeader={updateSheetHeader}
            onCell={updateSheetCell}
            onAddRow={addSheetRow}
            onSave={saveSheet}
            onExport={exportSheet}
            onCloseFile={closeSheetFile}
            onDownloadOriginal={downloadOriginal}
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
        {view === "admin" && (
          <AdminPanel
            users={data.users}
            files={data.files}
            logs={data.auditLogs}
            onRole={changeRole}
            onStorageAccess={changeStorageAccess}
          />
        )}
      </main>

      <input ref={uploadRef} type="file" multiple hidden onChange={uploadFiles} />
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X /></button>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("OfficeFlow failed to render", error);
  }

  reloadApp = () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="fallbackScreen">
        <div className="fallbackPanel">
          <div className="brand">
            <div className="brandMark">OF</div>
            <div>
              <strong>OfficeFlow</strong>
              <span>Workspace recovery</span>
            </div>
          </div>
          <h1>OfficeFlow had trouble loading.</h1>
          <p>Refresh the workspace to clear the local session and load the latest app files.</p>
          <button className="primaryButton" type="button" onClick={this.reloadApp}>
            Reload workspace
          </button>
        </div>
      </section>
    );
  }
}

function AuthScreen({ mode, setMode, onSubmit, toast, loading }) {
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
          {!isLogin && <input name="name" placeholder="Full name" required disabled={loading} />}
          <input name="email" type="email" placeholder="Email" required disabled={loading} />
          <input name="password" type="password" placeholder="Password" minLength={isLogin ? 1 : 8} required disabled={loading} />
          {!isLogin && <input name="inviteToken" placeholder="Invite token (optional)" defaultValue={inviteFromUrl} disabled={loading} />}
          <button className="primaryButton" type="submit" disabled={loading}>
            {loading ? (isLogin ? "Logging in..." : "Creating account...") : isLogin ? "Login" : "Register"}
          </button>
        </form>
        <button className="linkButton" type="button" disabled={loading} onClick={() => setMode(isLogin ? "register" : "login")}>
          {isLogin ? "New user? Create a private public account" : "Back to login"}
        </button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}

function AdminPanel({ users, files, logs, onRole, onStorageAccess }) {
  const publicUsers = users.filter((member) => member.role === "Viewer");
  const storageEnabled = users.filter((member) => member.storageAccess).length;
  const privateFiles = files.filter((file) => file.visibility === "private").length;

  return (
    <div className="adminLayout">
      <section className="adminHero panel">
        <div>
          <p className="eyebrow">Admin control</p>
          <h2>Primary admin access</h2>
          <p>Use <strong>admin@office.local</strong> with the admin password for full workspace control. Public users stay inside their own demo workspace unless you expand their access.</p>
        </div>
        <div className="adminStats">
          <div><strong>{users.length}</strong><span>Total users</span></div>
          <div><strong>{publicUsers.length}</strong><span>Public accounts</span></div>
          <div><strong>{storageEnabled}</strong><span>Storage enabled</span></div>
          <div><strong>{privateFiles}</strong><span>Private files</span></div>
        </div>
      </section>
      <section className="panel adminUsers">
        <PanelHeader title="User access" action="Admin only" />
        <div className="adminUserList">
          {users.map((member) => {
            const isPrimaryAdmin = member.email === "admin@office.local";
            return (
              <article className="adminUserRow" key={member.id}>
                <span className="avatar">{initials(member.name)}</span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
                <select value={member.role} disabled={isPrimaryAdmin} onChange={(event) => onRole(member, event.target.value)}>
                  {(isPrimaryAdmin ? ["Admin"] : assignableRoleOptions).map((role) => <option key={role}>{role}</option>)}
                </select>
                <label className="toggleLabel">
                  <input
                    type="checkbox"
                    checked={member.storageAccess !== false}
                    disabled={isPrimaryAdmin}
                    onChange={(event) => onStorageAccess(member, event.target.checked)}
                  />
                  <span>Storage</span>
                </label>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="Recent admin activity" action="Audit" />
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

function FilesView({ files, status, setStatus, can, onUpload, onStatus, onDelete, onOpen }) {
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
          <article className="fileCard" key={file.id} onClick={() => onOpen(file)}>
            <div className="fileIcon"><FileText size={22} /></div>
            <strong>{file.name}</strong>
            <p>{file.type} · {file.owner} · v{file.version}</p>
            <StatusBadge status={file.status} />
            <small>{file.notes}</small>
            <div className="cardActions">
              <button onClick={(event) => { event.stopPropagation(); onOpen(file); }}>Open</button>
              {can("edit") && <button onClick={(event) => { event.stopPropagation(); onStatus(file, "Editing"); }}>Edit</button>}
              {can("review") && <button onClick={(event) => { event.stopPropagation(); onStatus(file, "Review"); }}>Review</button>}
              {can("approve") && <button onClick={(event) => { event.stopPropagation(); onStatus(file, "Approved"); }}>Approve</button>}
              {can("delete") && <button className="danger" onClick={(event) => { event.stopPropagation(); onDelete(file); }}>Delete</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DocsView({
  docs,
  tabs,
  files,
  selectedDoc,
  selectedDocKey,
  setSelectedDocKey,
  canEdit,
  onCreate,
  onSave,
  onCloseFile,
  onDownload,
  onDownloadOriginal
}) {
  const selectedFile = selectedDoc?.source === "file" ? files.find((file) => file.id === selectedDoc.fileId) : null;

  return (
    <div className="editorLayout">
      <aside className="panel docRail">
        <PanelHeader title="Documents" action={canEdit ? <button className="iconButton" onClick={onCreate}><Plus size={18} /></button> : null} />
        {docs.map((doc) => (
          <button className={selectedDocKey === doc.id ? "docButton active" : "docButton"} key={doc.id} onClick={() => setSelectedDocKey(doc.id)}>
            <strong>{doc.title}</strong>
            <small>{doc.status}</small>
          </button>
        ))}
        <div className="subTabZone">
          <span>Open files</span>
          {tabs.filter((tab) => tab.source === "file").map((tab) => {
            const fileId = tab.key.slice(5);
            return (
              <button className={selectedDocKey === tab.key ? "subTab active" : "subTab"} key={tab.key} onClick={() => setSelectedDocKey(tab.key)}>
                <FileText size={15} />
                <span>{tab.title}</span>
                <X size={14} onClick={(event) => { event.stopPropagation(); onCloseFile(fileId); }} />
              </button>
            );
          })}
        </div>
      </aside>
      <section className="panel docEditor">
        <div className="editorTabs">
          {tabs.map((tab) => (
            <button className={selectedDocKey === tab.key ? "active" : ""} key={tab.key} onClick={() => setSelectedDocKey(tab.key)}>
              {tab.title}
            </button>
          ))}
        </div>
        <input key={`${selectedDoc?.id}-title`} id="docTitle" className="docTitle" defaultValue={selectedDoc?.title || ""} readOnly={!canEdit} />
        <div
          key={`${selectedDoc?.id}-body`}
          id="docBody"
          className="richEditor"
          contentEditable={canEdit}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: selectedDoc?.body || "" }}
        />
        <div className="editorActions">
          <button className="primaryButton" disabled={!canEdit} onClick={onSave}><ClipboardCheck size={18} /> Save document</button>
          <button className="secondaryButton" onClick={() => onDownload(selectedDoc)}><Download size={17} /> Updated file</button>
          {selectedFile && <button className="secondaryButton" onClick={() => onDownloadOriginal(selectedFile)}><Download size={17} /> Original file</button>}
        </div>
      </section>
    </div>
  );
}

function SheetsView({
  sheet,
  tabs,
  files,
  selectedSheetKey,
  setSelectedSheetKey,
  setSheetTitle,
  canEdit,
  onHeader,
  onCell,
  onAddRow,
  onSave,
  onExport,
  onCloseFile,
  onDownloadOriginal
}) {
  const selectedFile = selectedSheetKey.startsWith("file:") ? files.find((file) => file.id === selectedSheetKey.slice(5)) : null;

  return (
    <section className="panel">
      <div className="toolbar">
        <input className="sheetTitle" value={sheet.title} readOnly={!canEdit} onChange={(event) => setSheetTitle(event.target.value)} />
        <div className="editorTabs sheetTabs">
          {tabs.map((tab) => (
            <button className={selectedSheetKey === tab.key ? "active" : ""} key={tab.key} onClick={() => setSelectedSheetKey(tab.key)}>
              <span>{tab.title}</span>
              {tab.source === "file" && <X size={14} onClick={(event) => { event.stopPropagation(); onCloseFile(tab.key.slice(5)); }} />}
            </button>
          ))}
        </div>
        <div className="sheetActions">
          <button className="secondaryButton" disabled={!canEdit} onClick={onAddRow}><Plus size={17} /> Row</button>
          <button className="primaryButton" disabled={!canEdit} onClick={onSave}><CheckCircle2 size={17} /> Save</button>
          <button className="secondaryButton" onClick={() => onExport(sheet)}>Export CSV</button>
          {selectedFile && <button className="secondaryButton" onClick={() => onDownloadOriginal(selectedFile)}><Download size={17} /> Original</button>}
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
                  {(member.email === "admin@office.local" ? ["Admin"] : assignableRoleOptions).map((role) => <option key={role}>{role}</option>)}
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
            <select name="role" disabled={!canInvite}>{assignableRoleOptions.map((role) => <option key={role}>{role}</option>)}</select>
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

function fileKey(file) {
  return `file:${file.id}`;
}

function fileKind(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type.includes("sheet") || /\.(csv|xls|xlsx)$/i.test(name)) return "sheet";
  return "document";
}

function documentFromFile(file) {
  if (!file) return null;
  const isPdf = String(file.name || "").toLowerCase().endsWith(".pdf") || file.type === "PDF";
  const body =
    file.content ||
    (isPdf
      ? `<h2>${escapeHtml(file.name)}</h2><p>This PDF is available as an original file reference. Download the original file when you need the source copy.</p>`
      : `<h2>${escapeHtml(file.name)}</h2><p>${escapeHtml(file.notes || "Start editing this file content.")}</p>`);

  return {
    id: fileKey(file),
    fileId: file.id,
    source: "file",
    title: file.name,
    status: file.status,
    body
  };
}

function sheetFromFile(file) {
  if (file?.content) {
    const rows = parseCsv(file.content);
    if (rows.length && rows.some((row) => row.some((cell) => String(cell).trim()))) {
      const [headers, ...bodyRows] = rows;
      return {
        sourceFileId: file.id,
        title: file.name,
        headers: headers.some((cell) => String(cell).trim()) ? headers : ["Item", "Owner", "Status", "Notes"],
        rows: bodyRows.some((row) => row.some((cell) => String(cell).trim())) ? bodyRows : [[file.name, file.owner || "", file.status || "Editing", file.notes || ""]]
      };
    }
  }

  return {
    sourceFileId: file.id,
    title: file.name,
    headers: ["Item", "Owner", "Status", "Notes"],
    rows: [[file.name, file.owner || "", file.status || "Editing", file.notes || ""]]
  };
}

function parseCsv(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvRow);
}

function parseCsvRow(row) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const next = row[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function sheetToCsv(sheet) {
  return [sheet.headers, ...sheet.rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, { token, method = "GET", body, formData } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: formData || (body ? JSON.stringify(body) : undefined)
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The server did not respond. Please refresh and try again in a moment.");
    }

    throw new Error("Cannot reach the server. Please check the live deployment and try again.");
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await readJson(response).catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  if (response.status === 204) return null;
  return readJson(response);
}

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  const preview = text.trim().slice(0, 80);
  throw new Error(preview ? `Expected JSON from the API, but received: ${preview}` : "Expected JSON from the API");
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
    team: "Team Access",
    admin: "Admin Panel"
  }[view];
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
