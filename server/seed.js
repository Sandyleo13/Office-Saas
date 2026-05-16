import bcrypt from "bcryptjs";
import crypto from "node:crypto";

export const roles = ["Admin", "Manager", "Editor", "Reviewer", "Viewer"];

export const permissions = {
  Admin: ["upload", "edit", "review", "approve", "delete", "team", "roles", "invite"],
  Manager: ["upload", "edit", "review", "approve", "team", "invite"],
  Editor: ["upload", "edit", "review"],
  Reviewer: ["review", "approve"],
  Viewer: ["upload", "edit"]
};

export function createDemoWorkspace(user, now = new Date().toISOString()) {
  return {
    files: [
      {
        id: crypto.randomUUID(),
        name: "Welcome Checklist.docx",
        type: "Document",
        owner: user.name,
        ownerId: user.id,
        visibility: "private",
        status: "Editing",
        size: "36 KB",
        updatedAt: now,
        notes: "Private demo file. Only this account and Admin can see it.",
        version: 1
      },
      {
        id: crypto.randomUUID(),
        name: "Sample Budget.xlsx",
        type: "Spreadsheet",
        owner: user.name,
        ownerId: user.id,
        visibility: "private",
        status: "Review",
        size: "48 KB",
        updatedAt: now,
        notes: "Try moving this through your own workflow without touching team files.",
        version: 1
      }
    ],
    documents: [
      {
        id: crypto.randomUUID(),
        ownerId: user.id,
        title: "My Demo Notes",
        status: "Editing",
        body: "<h2>Private workspace</h2><p>Use this document to test editing. Admin can manage your storage access, but team files stay hidden.</p>",
        updatedAt: now
      }
    ],
    sheet: {
      sourceFileId: null,
      title: "My Demo Sheet",
      headers: ["Task", "Owner", "Status", "Notes"],
      rows: [
        ["Upload a sample file", user.name, "Editing", "Visible only in this account"],
        ["Edit a document", user.name, "Review", "Saved to this account workspace"],
        ["Export sheet", user.name, "Approved", "Download as CSV"]
      ]
    }
  };
}

export async function createSeedData() {
  const now = new Date().toISOString();
  const users = await Promise.all(
    [
      ["Admin User", "admin@office.local", "admin123", "Admin"],
      ["Priya Sharma", "priya@office.local", "manager123", "Manager"],
      ["Ravi Patel", "ravi@office.local", "editor123", "Editor"],
      ["Neha Khan", "neha@office.local", "review123", "Reviewer"]
    ].map(async ([name, email, password, role]) => ({
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      storageAccess: true,
      status: "Active",
      createdAt: now
    }))
  );
  const userByEmail = Object.fromEntries(users.map((user) => [user.email, user]));

  return {
    users,
    invites: [],
    files: [
      {
        id: crypto.randomUUID(),
        name: "Vendor Contract.docx",
        type: "Document",
        owner: "Priya Sharma",
        ownerId: userByEmail["priya@office.local"].id,
        visibility: "team",
        status: "Review",
        size: "184 KB",
        updatedAt: now,
        notes: "Check payment clause before approval.",
        version: 3
      },
      {
        id: crypto.randomUUID(),
        name: "April Expenses.xlsx",
        type: "Spreadsheet",
        owner: "Ravi Patel",
        ownerId: userByEmail["ravi@office.local"].id,
        visibility: "team",
        status: "Editing",
        size: "92 KB",
        updatedAt: now,
        notes: "Finance team is updating travel rows.",
        content: "Date,Department,Item,Amount,Status\n2026-05-01,Admin,Printer paper,2400,Approved\n2026-05-02,Sales,Client travel,8750,Review\n2026-05-05,IT,Mouse and keyboard,3100,Editing",
        version: 2
      },
      {
        id: crypto.randomUUID(),
        name: "Office Policy.pdf",
        type: "PDF",
        owner: "Neha Khan",
        ownerId: userByEmail["neha@office.local"].id,
        visibility: "team",
        status: "Approved",
        size: "260 KB",
        updatedAt: now,
        notes: "Approved for internal circulation.",
        version: 5
      }
    ],
    documents: [
      {
        id: crypto.randomUUID(),
        ownerId: userByEmail["priya@office.local"].id,
        title: "Meeting Notes",
        status: "Editing",
        body: "<h2>Weekly Operations Review</h2><p>Open points for this week:</p><ul><li>Collect pending vendor files.</li><li>Review expense sheet.</li><li>Prepare approval summary.</li></ul>",
        updatedAt: now
      }
    ],
    sheet: {
      sourceFileId: null,
      title: "Expense Tracker",
      headers: ["Date", "Department", "Item", "Amount", "Status"],
      rows: [
        ["2026-05-01", "Admin", "Printer paper", "2400", "Approved"],
        ["2026-05-02", "Sales", "Client travel", "8750", "Review"],
        ["2026-05-05", "IT", "Mouse and keyboard", "3100", "Editing"]
      ]
    },
    auditLogs: [
      {
        id: crypto.randomUUID(),
        actor: "System",
        action: "Workspace created",
        createdAt: now
      }
    ]
  };
}
