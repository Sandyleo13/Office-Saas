# OfficeFlow Mini SaaS

OfficeFlow is now a React + Express mini SaaS for office files, approvals, document editing, sheets, team roles, invites, and audit history.

## Stack

- React 19 + Vite frontend
- Express API backend
- JWT sessions with expiry
- `bcryptjs` password hashing
- Server-side role permissions
- Local JSON persistence for fast development
- Local upload storage under `server/data/uploads`
- CSV sheet export without the vulnerable SheetJS package
- PostgreSQL schema in `prisma/schema.prisma`
- MinIO/S3 and PostgreSQL Docker services in `docker-compose.yml`

## Run Locally

```bash
npm install
npm run dev
```

Frontend: `http://127.0.0.1:5173`

API: `http://127.0.0.1:4100`

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@office.local` | `admin123` |
| Manager | `priya@office.local` | `manager123` |
| Editor | `ravi@office.local` | `editor123` |
| Reviewer | `neha@office.local` | `review123` |

New registrations become Viewer accounts unless they use a valid invite token. Admins can change roles from the Team page.

## Production Path

The app already has the production structure in place:

- Backend API with real authentication routes
- Password hashing with bcrypt
- JWT session expiry via `SESSION_HOURS`
- Invite tokens for controlled onboarding
- Local file storage now, S3/MinIO target config in `.env.example`
- PostgreSQL-ready Prisma schema
- Server-side permission checks on protected routes
- Audit logs for important actions

Before public launch, replace the JSON store with PostgreSQL repositories, add refresh tokens or secure cookies, hash invite tokens before storage, configure email delivery, and connect uploads to S3 or MinIO.

## Environment

Copy `.env.example` to `.env` and set a strong `JWT_SECRET` before deployment.

```bash
PORT=4100
CLIENT_ORIGIN=http://127.0.0.1:5173
JWT_SECRET=replace-with-a-long-random-secret
SESSION_HOURS=8
DATABASE_URL=postgresql://officeflow:officeflow@localhost:5432/officeflow
```

## Notes

OnlyOffice or Collabora integration is still the right next step for true browser editing of `.docx`, `.xlsx`, and `.pptx` files. The current Docs and Sheets tools cover browser-native editing and CSV export workflows.
