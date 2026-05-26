import bcrypt from "bcryptjs";
import prisma from "./lib/prisma.js";
import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import mammoth from "mammoth";
import XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import htmlToPdf from "html-pdf-node";
import {
  Document,
  Packer,
  Paragraph,
  TextRun
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const port = Number(process.env.PORT || 4100);

const jwtSecret =
  process.env.JWT_SECRET || "dev-only-change-this-secret";

const sessionHours = Number(process.env.SESSION_HOURS || 8);

const uploadsDir = path.join(__dirname, "data", "uploads");

const clientOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const permissions = {
  ADMIN: [
    "upload",
    "edit",
    "delete",
    "approve",
    "review",
    "invite",
    "roles"
  ],

  MANAGER: [
    "upload",
    "edit",
    "approve",
    "review",
    "invite"
  ],

  EDITOR: [
    "upload",
    "edit",
    "review"
  ],

  REVIEWER: [
    "review"
  ],

  VIEWER: []
};

const roles = [
  "ADMIN",
  "MANAGER",
  "EDITOR",
  "REVIEWER",
  "VIEWER"
];

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        clientOrigins.length === 0 ||
        clientOrigins.includes(origin)
      ) {
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

  const effectivePermissions = new Set(
    permissions[user.role] || []
  );

  if (user.storageAccess === false) {
    effectivePermissions.delete("upload");
    effectivePermissions.delete("edit");
  }

  return {
    ...safeUser,
    permissions: [...effectivePermissions]
  };
}

function tokenFor(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role
    },
    jwtSecret,
    {
      expiresIn: `${sessionHours}h`
    }
  );
}

function effectivePermissions(user) {
  const allowed = new Set(
    permissions[user.role] || []
  );

  if (user.storageAccess === false) {
    allowed.delete("upload");
    allowed.delete("edit");
  }

  return allowed;
}

function can(permission) {
  return (req, res, next) => {
    if (
      effectivePermissions(req.user).has(permission)
    ) {
      return next();
    }

    return res.status(403).json({
      message: "Role does not allow this action"
    });
  };
}

async function auth(req, res, next) {
  try {
    const header =
      req.headers.authorization || "";

    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    const payload = jwt.verify(
      token,
      jwtSecret
    );

    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub
      }
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        message: "Session expired"
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error(error);

    return res.status(401).json({
      message: "Invalid session"
    });
  }
}

function ensureStorageAccess(
  req,
  res,
  next
) {
  if (req.user.storageAccess === false) {
    return res.status(403).json({
      message:
        "Storage access is disabled by Admin"
    });
  }

  next();
}

function inferType(fileName) {
  const ext = fileName
    .split(".")
    .pop()
    .toLowerCase();

  if (
    ["xls", "xlsx", "csv"].includes(ext)
  ) {
    return "SPREADSHEET";
  }

  if (ext === "pdf") {
    return "PDF";
  }

  return "DOCUMENT";
}
async function extractFileContent(filePath, fileName) {

  const ext =
    fileName
      .split(".")
      .pop()
      .toLowerCase();

  try {

    if (ext === "txt") {

      return await fs.readFile(
        filePath,
        "utf8"
      );
    }

    if (ext === "docx") {

      const result =
        await mammoth.extractRawText({
          path: filePath
        });

      return result.value;
    }

if (ext === "pdf") {

  try {

    const buffer =
      await fs.readFile(filePath);

    const uint8Array =
      new Uint8Array(buffer);

    const pdf =
      await pdfjsLib.getDocument({
        data: uint8Array
      }).promise;

    let text = "";

    for (
      let pageNum = 1;
      pageNum <= pdf.numPages;
      pageNum++
    ) {

      const page =
        await pdf.getPage(pageNum);

      const content =
        await page.getTextContent();

      const strings =
        content.items.map(
          (item) => item.str
        );

      text +=
        strings.join(" ") + "\n";
    }

    return (
      text ||
      "No readable text found in PDF"
    );

  } catch (pdfError) {

    console.error(
      "PDF PARSE ERROR:",
      pdfError
    );

    return "Failed to read PDF content";
  }
}

    if (
      ["xlsx", "xls", "csv"].includes(ext)
    ) {

      const workbook =
        XLSX.readFile(filePath);

      const firstSheet =
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      return XLSX.utils.sheet_to_csv(
        firstSheet
      );
    }

    return "Preview not supported";

  } catch (error) {

    console.error(
      "FILE CONTENT READ ERROR:",
      error
    );

    return "Failed to read file";
  }
}
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "OfficeFlow API"
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password
    } = req.body;

    if (
      !name ||
      !email ||
      String(password).length < 8
    ) {
      return res.status(400).json({
        message:
          "Name, email and password are required"
      });
    }

    const existingUser =
      await prisma.user.findUnique({
        where: {
          email: String(email)
            .trim()
            .toLowerCase()
        }
      });

    if (existingUser) {
      return res.status(409).json({
        message:
          "Email already registered"
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        String(password),
        12
      );

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email)
          .trim()
          .toLowerCase(),
        passwordHash: hashedPassword,
        role: "VIEWER",
        status: "ACTIVE",
        storageAccess: true
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "REGISTERED"
      }
    });

    res.status(201).json({
      token: tokenFor(user),
      user: publicUser(user),
      expiresInHours: sessionHours
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Registration failed"
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    const user =
      await prisma.user.findUnique({
        where: {
          email: String(email)
            .trim()
            .toLowerCase()
        }
      });

    if (!user) {
      return res.status(401).json({
        message:
          "Invalid email or password"
      });
    }

    const validPassword =
      await bcrypt.compare(
        String(password),
        user.passwordHash
      );

    if (!validPassword) {
      return res.status(401).json({
        message:
          "Invalid email or password"
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        message:
          "Account is not active"
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "SIGNED_IN"
      }
    });

    res.json({
      token: tokenFor(user),
      user: publicUser(user),
      expiresInHours: sessionHours
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login failed"
    });
  }
});

app.get("/api/me", auth, async (req, res) => {
  res.json({
    user: publicUser(req.user)
  });
});

app.get("/api/bootstrap", auth, async (req, res) => {
  try {

    const files =
      await prisma.fileRecord.findMany({
        where:
          req.user.role === "ADMIN"
            ? {}
            : {
                ownerId: req.user.id
              },

        orderBy: {
          createdAt: "desc"
        }
      });

    const documents =
      await prisma.document.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

    const users =
      req.user.role === "ADMIN"
        ? await prisma.user.findMany()
        : [req.user];

    const auditLogs =
      await prisma.auditLog.findMany({
        include: {
          actor: true
        },

        orderBy: {
          createdAt: "desc"
        },

        take: 50
      });

    res.json({
      user: publicUser(req.user),

      roles,

      permissions,

      files,

      documents,

      users: users.map(publicUser),

      invites: [],

      auditLogs,

      sheet: {
        title: "Demo Sheet",
        columns: [],
        rows: []
      }
    });

  } catch (error) {

    console.error(
      "BOOTSTRAP ERROR:",
      error
    );

    res.status(500).json({
      message:
        "Failed to load dashboard"
    });
  }
});

app.get(
  "/api/files",
  auth,
  async (req, res) => {

    try {

      let files = [];

      if (req.user.role === "ADMIN") {

        files =
          await prisma.fileRecord.findMany({
            include: {
              owner: true
            },

            orderBy: {
              createdAt: "desc"
            }
          });

      } else {

        files =
          await prisma.fileRecord.findMany({
            where: {
              ownerId:
                req.user.id
            },

            include: {
              owner: true
            },

            orderBy: {
              createdAt: "desc"
            }
          });
      }

      const formattedFiles =
        files.map((file) => ({
          id: file.id,

          name: file.name,

          type: file.type,

          status: file.status,

          owner:
            file.owner?.name ||
            "Unknown",

          ownerId:
            file.ownerId,

          visibility:
            file.visibility,

          size:
            `${Math.max(
              1,
              Math.round(
                file.sizeBytes /
                  1024
              )
            )} KB`,

          sizeBytes:
            file.sizeBytes,

          notes:
            file.notes,

          version:
            file.version,

          url:
            file.url,

          createdAt:
            file.createdAt,

          updatedAt:
            file.updatedAt
        }));

      res.json(
        formattedFiles
      );

    } catch (error) {

      console.error(
        "FILES FETCH ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch files"
      });
    }
  }
);

app.post(
  "/api/files/upload",
  auth,
  can("upload"),
  ensureStorageAccess,
  upload.array("files"),
  async (req, res) => {

    try {

      const created = [];

      for (const file of req.files || []) {

        const extractedContent =
          await extractFileContent(
            file.path,
            file.originalname
          );

        const newFile =
          await prisma.fileRecord.create({
            data: {
              name:
                file.originalname,

              type:
                inferType(
                  file.originalname
                ),

              status:
                "EDITING",

              sizeBytes:
                file.size,

              storageKey:
                file.filename,

              ownerId:
                req.user.id,

              content:
                extractedContent,

              notes:
                "Uploaded to local storage",

              version: 1,

              url:
                `/uploads/${file.filename}`,

              visibility:
                req.user.role ===
                "VIEWER"
                  ? "private"
                  : "team"
            }
          });

        created.push(newFile);
      }

      await prisma.auditLog.create({
        data: {
          actorId:
            req.user.id,

          action:
            `UPLOADED_${created.length}_FILES`
        }
      });

      res.status(201).json(created);

    } catch (error) {

      console.error(
        "UPLOAD ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Upload failed"
      });
    }
  }
);

app.post(
  "/api/documents",
  auth,
  can("edit"),
  ensureStorageAccess,
  async (req, res) => {
    try {

      const document =
        await prisma.document.create({
          data: {
            title:
              req.body.title ||
              "Untitled document",

            body:
              req.body.body ||
              "<p>Start typing here.</p>",

            status: "EDITING"
          }
        });

      await prisma.fileRecord.create({
        data: {
          name: `${document.title}.docx`,

          type: "DOCUMENT",

          status: "EDITING",

          sizeBytes:
            Buffer.byteLength(
              document.body,
              "utf8"
            ),

          ownerId: req.user.id,

          visibility: "private",

          notes:
            "Generated document file",

          version: 1
        }
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,

          action: "CREATED_DOCUMENT",

          target: document.id
        }
      });

      res.status(201).json(document);

    } catch (error) {

      console.error(
        "DOCUMENT CREATE ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Document creation failed"
      });
    }
  }
);;

app.get(
  "/api/documents",
  auth,
  async (req, res) => {
    try {

      const documents =
        await prisma.document.findMany({
          orderBy: {
            createdAt: "desc"
          }
        });

      res.json(documents);

    } catch (error) {

      console.error(
        "FETCH DOCUMENTS ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch documents"
      });
    }
  }
);

app.patch(
  "/api/documents/:id",
  auth,
  can("edit"),
  ensureStorageAccess,
  async (req, res) => {

    try {

      const existingDocument =
        await prisma.document.findUnique({
          where: {
            id: req.params.id
          }
        });

      if (!existingDocument) {
        return res.status(404).json({
          message:
            "Document not found"
        });
      }

      const updatedDocument =
        await prisma.document.update({
          where: {
            id: req.params.id
          },

          data: {
            title:
              req.body.title ||
              existingDocument.title,

            body:
              req.body.body ||
              req.body.content ||
              existingDocument.body,

            status:
              req.body.status ||
              existingDocument.status
          }
        });

      await prisma.fileRecord.updateMany({
        where: {
          name:
            `${existingDocument.title}.docx`
        },

        data: {
          name:
            `${updatedDocument.title}.docx`,

          sizeBytes:
            Buffer.byteLength(
              updatedDocument.body,
              "utf8"
            ),

          updatedAt:
            new Date()
        }
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,

          action:
            "UPDATED_DOCUMENT",

          target:
            updatedDocument.id
        }
      });

      res.json(updatedDocument);

    } catch (error) {

      console.error(
        "DOCUMENT UPDATE ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to update document"
      });
    }
  }
);
app.get(
  "/api/documents/:id/export/docx",
  auth,
  async (req, res) => {

    try {

      const documentRecord =
        await prisma.document.findUnique({
          where: {
            id: req.params.id
          }
        });

      if (!documentRecord) {
        return res.status(404).json({
          message:
            "Document not found"
        });
      }

      const cleanText =
        documentRecord.body
          .replace(/<[^>]+>/g, "");

      const doc =
        new Document({
          sections: [
            {
              children: [

                new Paragraph({
                  children: [
                    new TextRun({
                      text:
                        documentRecord.title,
                      bold: true,
                      size: 32
                    })
                  ]
                }),

                new Paragraph({
                  children: [
                    new TextRun({
                      text:
                        cleanText
                    })
                  ]
                })
              ]
            }
          ]
        });

      const buffer =
        await Packer.toBuffer(doc);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${documentRecord.title}.docx"`
      );

      res.send(buffer);

    } catch (error) {

      console.error(
        "DOCX EXPORT ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to export DOCX"
      });
    }
  }
);
app.get(
  "/api/documents/:id/export/pdf",
  auth,
  async (req, res) => {

    try {

      const documentRecord =
        await prisma.document.findUnique({
          where: {
            id: req.params.id
          }
        });

      if (!documentRecord) {
        return res.status(404).json({
          message:
            "Document not found"
        });
      }

      const file = {
        content: `
          <html>
            <body style="font-family: Arial; padding: 40px;">
              <h1>${documentRecord.title}</h1>
              <div>${documentRecord.body}</div>
            </body>
          </html>
        `
      };

      const pdfBuffer =
        await htmlToPdf.generatePdf(
          file,
          {
            format: "A4"
          }
        );

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${documentRecord.title}.pdf"`
      );

      res.send(pdfBuffer);

    } catch (error) {

      console.error(
        "PDF EXPORT ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to export PDF"
      });
    }
  }
);
app.patch(
  "/api/users/:id/role",
  auth,
  can("roles"),
  async (req, res) => {
    try {

      const role =
        String(req.body.role);

      if (!roles.includes(role)) {
        return res.status(400).json({
          message: "Invalid role"
        });
      }

      const updatedUser =
        await prisma.user.update({
          where: {
            id: req.params.id
          },
          data: {
            role
          }
        });

      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: `UPDATED_ROLE_TO_${role}`,
          target: updatedUser.id
        }
      });

      res.json(
        publicUser(updatedUser)
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to update role"
      });
    }
  }
);

app.get(
  "/api/audit-logs",
  auth,
  async (req, res) => {
    try {

      const logs =
        await prisma.auditLog.findMany({
          include: {
            actor: true
          },
          orderBy: {
            createdAt: "desc"
          }
        });

      res.json(logs);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to fetch logs"
      });
    }
  }
);
app.delete(
  "/api/files/:id",
  auth,
  async (req, res) => {

    try {

      const file =
        await prisma.fileRecord.findUnique({
          where: {
            id: req.params.id
          }
        });

      if (!file) {
        return res.status(404).json({
          message:
            "File not found"
        });
      }

      if (
        req.user.role !== "ADMIN" &&
        file.ownerId !== req.user.id
      ) {
        return res.status(403).json({
          message:
            "Not allowed to delete this file"
        });
      }

      await prisma.fileRecord.delete({
        where: {
          id: req.params.id
        }
      });

      await prisma.auditLog.create({
        data: {
          actorId:
            req.user.id,

          action:
            "DELETED_FILE",

          target:
            req.params.id
        }
      });

      res.status(204).end();

    } catch (error) {

      console.error(
        "DELETE FILE ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to delete file"
      });
    }
  }
);
app.use("/api", (req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

if (
  process.env.NODE_ENV ===
  "production"
) {
  const dist = path.join(
    __dirname,
    "..",
    "dist"
  );

  app.use(
    express.static(dist)
  );

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    res.sendFile(
      path.join(dist, "index.html")
    );
  });
}

app.get("/", (req, res) => {
  res.json({
    status:
      "OfficeFlow API running"
  });
});

app.listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      `OfficeFlow API listening on http://0.0.0.0:${port}`
    );
  }
);
