# OfficeFlow Mini SaaS

OfficeFlow is a React + Express mini SaaS for office file workflows, document editing, spreadsheet editing, approvals, team roles, invites, storage access control, and audit history.

## Features

- Email/password authentication with JWT sessions
- Role-based permissions for Admin, Manager, Editor, Reviewer, and Viewer users
- File workflow board with upload, status updates, approvals, and deletion
- File-to-editor routing from the Files tab
- Document workspace with editable docs and open-file sub tabs
- Sheet workspace with spreadsheet tabs, editable cells, CSV export, and save support
- Download options for original uploaded files and updated editor versions
- Admin panel for user role changes and storage access toggles
- Team invites with role assignment
- Audit logs for important account and file actions
- Production static serving with safe cache headers for Vite assets
- Docker-ready deployment on port `3000`

## Stack

- React 19 + Vite frontend
- Express API backend
- JWT sessions with expiry
- `bcryptjs` password hashing
- Server-side permission checks
- Local JSON persistence for fast development
- Local upload storage under `server/data/uploads`
- CSV sheet export without SheetJS
- PostgreSQL schema in `prisma/schema.prisma`
- Docker Compose production service in `compose.yaml`
- PostgreSQL and MinIO development services in `docker-compose.yml`

## Run Locally

```bash
npm install
npm run dev
```

Frontend: `http://127.0.0.1:5173`

API: `http://127.0.0.1:4100`

## Production Build

```bash
npm run build
NODE_ENV=production PORT=4100 npm start
```

Production app: `http://127.0.0.1:4100`

## Docker Deploy

```bash
docker compose -f compose.yaml up --build
```

Docker app: `http://127.0.0.1:3000`

The production container uses `PORT=3000` and serves both the API and built Vite frontend from Express.

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@office.local` | `admin123` |
| Manager | `priya@office.local` | `manager123` |
| Editor | `ravi@office.local` | `editor123` |
| Reviewer | `neha@office.local` | `review123` |

New registrations become Viewer accounts unless they use a valid invite token. Admins can change roles and storage access from the Team and Admin Panel screens.

## Permissions

- Admin: upload, edit, review, approve, delete, team, roles, invite
- Manager: upload, edit, review, approve, team, invite
- Editor: upload, edit, review
- Reviewer: review, approve
- Viewer: upload, edit for their own workspace

## File Editing Flow

Files are opened from the Files tab into the matching workspace:

- Document-like files, including `.docx` and `.pdf`, open in Docs.
- Spreadsheet-like files, including `.csv`, `.xls`, and `.xlsx`, open in Sheets.
- Opened files appear as sub tabs so users can switch between multiple active files.
- Users with edit permission can save updated file content.
- Users can download the updated editor version.
- Original uploaded files remain available for download when the upload exists on the server.

## Environment

Copy `.env.example` to `.env` and set a strong `JWT_SECRET` before deployment.

```bash
PORT=4100
CLIENT_ORIGIN=http://127.0.0.1:5173
JWT_SECRET=replace-with-a-long-random-secret
SESSION_HOURS=8
DATABASE_URL=postgresql://officeflow:officeflow@localhost:5432/officeflow
```

## Production Path

The app already includes a production-ready structure:

- Real authentication routes
- Password hashing with bcrypt
- JWT session expiry via `SESSION_HOURS`
- Invite tokens for controlled onboarding
- Server-side role and storage-access checks
- Audit logs for sign-in, registration, invites, uploads, saves, and role changes
- Static frontend serving from Express in production
- Dockerfile and Compose config for container hosting
- PostgreSQL-ready Prisma schema

Before a public launch, replace the JSON store with PostgreSQL repositories, add refresh tokens or secure cookies, hash invite tokens before storage, configure email delivery, and connect uploads to S3 or MinIO.

## Notes

The current Docs and Sheets workspaces provide browser-native editing and CSV export. OnlyOffice or Collabora is still the right next step for true high-fidelity editing of native `.docx`, `.xlsx`, and `.pptx` files.
