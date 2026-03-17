# WorkFlow Monitor API Reference

Base URL: `http://localhost:3000/api`

All endpoints require authentication via session cookie (NextAuth JWT) unless noted otherwise.

## Authentication

### POST `/api/auth/callback/credentials`
Login with email and password. Returns session cookie.

**Body:** `application/x-www-form-urlencoded`
- `email` — User email
- `password` — User password
- `csrfToken` — CSRF token from `/api/auth/csrf`

### GET `/api/auth/csrf`
Get CSRF token for authentication.

### GET `/api/auth/session`
Get current session info.

---

## Health & System

### GET `/api/health`
**Public.** Returns system health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-17T00:00:00Z",
  "version": "0.1.0",
  "uptime": 3600,
  "checks": {
    "database": { "status": "healthy", "latencyMs": 2 },
    "email": { "status": "disabled" }
  }
}
```

---

## Workflow Templates

### GET `/api/workflows/templates`
List templates. Supports pagination.

**Query:** `?published=true&search=&limit=50&offset=0`

**Response:** `{ data: Template[], total, limit, offset, hasMore }`

### POST `/api/workflows/templates`
Create a template with nodes, edges, and intake form.

### GET/PATCH/DELETE `/api/workflows/templates/:id`
CRUD operations on a specific template.

### POST `/api/workflows/templates/:id/publish`
Publish a template (makes it available for starting instances).

### POST `/api/workflows/templates/:id/start`
Start a new workflow instance from this template.

**Body:**
```json
{
  "title": "Environment Request - March 2026",
  "priority": "Medium",
  "clientId": "...",
  "projectId": "...",
  "metadata": { "env_name": "staging-portal", "risk_level": "Standard" }
}
```

---

## Workflow Instances

### GET `/api/workflows/instances`
List instances with pagination.

**Query:** `?status=RUNNING&clientId=&ownerId=&limit=50&offset=0`

**Response:** `{ data: Instance[], total, limit, offset, hasMore }`

### GET/PATCH/DELETE `/api/workflows/instances/:id`
Instance operations.

### POST `/api/workflows/instances/:id/tasks/:taskId/complete`
Complete a task (must be the assignee).

### POST `/api/workflows/instances/:id/tasks/:taskId/approve`
Submit approval decision.

**Body:** `{ "decision": "APPROVED" | "REJECTED", "comment": "..." }`

### POST `/api/workflows/instances/:id/tasks/:taskId/reassign`
Reassign a task to another user.

### POST `/api/workflows/instances/:id/comments`
Add a comment to an instance.

### GET `/api/workflows/instances/:id/timeline`
Get execution timeline.

---

## My Tasks

### GET `/api/workflows/my-tasks`
Tasks assigned to the current user.

**Query:** `?status=IN_PROGRESS&limit=50&offset=0`

**Response:** `{ data: Task[], total, limit, offset, hasMore }`

---

## Dashboard

### GET `/api/workflows/dashboard/stats`
Dashboard statistics for the current user.

**Response:**
```json
{
  "activeWorkflows": 5,
  "myPendingTasks": 3,
  "pendingApprovals": 2,
  "completedThisWeek": 12
}
```

---

## Users & Roles

### GET `/api/users`
List users. **Query:** `?search=&includeInactive=false&limit=50&offset=0`

### POST `/api/users`
Create a user (admin only). Password must meet policy: 12+ chars, uppercase, lowercase, number, special char.

### GET/POST `/api/roles`
List / create roles.

---

## Clients & Ministries

### GET `/api/clients`
**Query:** `?status=ACTIVE&search=&ministryId=&limit=50&offset=0`

### GET/POST `/api/ministries`
Ministry management.

---

## Documents

### GET `/api/documents`
**Query:** `?clientId=&projectId=&type=&limit=50&offset=0`

### POST `/api/documents/upload`
Multipart file upload. Max 10MB. Allowed types: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG.

**Form data:** `file`, `title`, `type`, `clientId?`, `projectId?`, `instanceId?`

---

## Delegations

### GET `/api/delegations`
List active delegations (given and received) for current user.

### POST `/api/delegations`
Create a delegation.

**Body:**
```json
{
  "delegateId": "user-id",
  "startDate": "2026-03-20T00:00:00Z",
  "endDate": "2026-03-27T00:00:00Z",
  "reason": "Annual leave"
}
```

### DELETE `/api/delegations/:id`
Revoke a delegation.

---

## Webhooks (Admin Only)

### GET `/api/webhooks`
List registered webhooks.

### POST `/api/webhooks`
Register a webhook.

**Body:**
```json
{
  "name": "Slack Notifier",
  "url": "https://hooks.slack.com/...",
  "events": ["WORKFLOW_COMPLETED", "SLA_BREACHED"],
  "generateSecret": true
}
```

**Events:** `WORKFLOW_STARTED`, `WORKFLOW_COMPLETED`, `WORKFLOW_CANCELLED`, `TASK_ASSIGNED`, `TASK_COMPLETED`, `APPROVAL_DECISION`, `SLA_BREACHED`

Webhook payloads include HMAC-SHA256 signature in `X-Webhook-Signature` header.

---

## Real-Time Events (SSE)

### GET `/api/events`
Server-Sent Events stream. Pushes notifications and task updates in real-time.

**Events:**
- `connected` — Initial connection confirmation
- `notifications` — New notifications
- `tasks` — Task status changes

---

## Cron Endpoints

Protected by `CRON_SECRET` bearer token.

### POST `/api/cron/sla-check`
Check for overdue tasks and create escalation notifications. Run every 15 minutes.

### POST `/api/cron/retention`
Data retention cleanup. Run daily.

---

## Reports

### GET `/api/reports/export?instanceId=xxx`
Export a workflow instance as a printable HTML report (print to PDF via browser).

### GET `/api/reports/overview`
Overview statistics.

### GET `/api/reports/clients/:id`
Client-specific report.

---

## Notifications

### GET `/api/notifications`
**Query:** `?unread=true&limit=50&offset=0`

### POST `/api/notifications`
Mark notifications as read. Body: `{ ids: [...] }` or `{ all: true }`

---

## Audit Log (Admin Only)

### GET `/api/audit`
**Query:** `?action=&userId=&instanceId=&from=&to=&limit=100&offset=0`

**Response:** `{ logs, total, limit, offset, hasMore }`

---

## Pagination

All list endpoints return a standard envelope:
```json
{
  "data": [...],
  "total": 42,
  "limit": 50,
  "offset": 0,
  "hasMore": false
}
```

## Error Format

All errors return:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": { "fields": { "email": ["Must be a valid email"] } }
  }
}
```

Error codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`
