import bcrypt from "bcryptjs";
import crypto from "node:crypto";

export const roles = ["Admin", "Manager", "Editor", "Reviewer", "Viewer"];

export const permissions = {
  Admin: ["upload", "edit", "review", "approve", "delete", "team", "roles", "invite"],
  Manager: ["upload", "edit", "review", "approve", "team", "invite"],
  Editor: ["upload", "edit", "review"],
  Reviewer: ["review", "approve"],
  Viewer: []
};

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
      status: "Active",
      createdAt: now
    }))
  );

  return {
    users,
    invites: [],
    files: [
      {
        id: crypto.randomUUID(),
        name: "Vendor Contract.docx",
        type: "Document",
        owner: "Priya Sharma",
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
