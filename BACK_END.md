<!-- CLAUDE.md for Kumo Backend -->
<!-- Place this file in the backend project root as CLAUDE.md -->

## Project Context

This is the backend for **Kumo** - a mental wellness React Native app (Expo). The backend serves a REST API with JWT authentication and SSE streaming for AI chat. The mobile client uses Axios for requests and native fetch for SSE.

## Tech Stack

- **Runtime:** Node.js with **Fastify** (v5)
- **Database:** PostgreSQL (production) / SQLite (local dev) with **Prisma**
- **Auth:** JWT (Bearer token in Authorization header) — single token, no refresh tokens
- **Rate Limiting:** `@fastify/rate-limit` — global + per-route overrides
- **File Storage:** AWS S3-compatible (audio uploads)
- **AI Provider:** OpenAI API for chat responses (streaming)
- **Email:** SMTP via Nodemailer
- **SSE:** Native response streaming (`reply.raw.write` with `text/event-stream`)

---

## Database Schema

### users

| Column          | Type      | Notes                                    |
| --------------- | --------- | ---------------------------------------- |
| id              | UUID (PK) | Auto-generated                           |
| email           | VARCHAR   | Unique, required                         |
| password        | VARCHAR   | Hashed (bcrypt, 10 rounds)               |
| authProvider    | ENUM      | `email`, `google`. Default: `email`      |
| firstName       | VARCHAR   | Nullable                                 |
| lastName        | VARCHAR   | Nullable                                 |
| emailConfirmed  | BOOLEAN   | Default: false                           |
| subscription    | ENUM      | `free`, `free-trial`, `pro`, `cancelled` |
| nextPaymentDate | TIMESTAMP | Nullable                                 |
| trialEndsDate   | TIMESTAMP | Nullable                                 |
| productId       | VARCHAR   | Nullable — `pro_monthly` \| `pro_quarterly` |
| purchaseToken   | VARCHAR   | Nullable — latest Play Store token       |
| role            | ENUM      | `user`, `admin`. Default: `user`         |
| notification    | BOOLEAN   | Default: true                            |
| pushToken       | VARCHAR   | Nullable — Expo push token for this device |
| createdAt       | TIMESTAMP | Auto-generated                           |

### weekly_streaks

| Column | Type      | Notes               |
| ------ | --------- | ------------------- |
| id     | UUID (PK) |                     |
| userId | UUID (FK) | References users.id |
| date   | TIMESTAMP |                     |

### verification_tokens

| Column    | Type      | Notes               |
| --------- | --------- | ------------------- |
| id        | UUID (PK) |                     |
| userId    | UUID (FK) | References users.id |
| token     | VARCHAR   | Unique              |
| expiresAt | TIMESTAMP | 24-hour TTL         |
| createdAt | TIMESTAMP |                     |

### password_reset_tokens

| Column    | Type      | Notes               |
| --------- | --------- | ------------------- |
| id        | UUID (PK) |                     |
| userId    | UUID (FK) | References users.id |
| token     | VARCHAR   | Unique              |
| expiresAt | TIMESTAMP | 1-hour TTL          |
| createdAt | TIMESTAMP |                     |

> **Note:** `conversations` and `messages` tables are not yet implemented. The chat endpoint is stateless — the client sends full message history in each request.

---

## API Endpoints

All endpoints prefixed with base URL. Authenticated endpoints require: `Authorization: Bearer <jwt-token>`

### Auth

#### `POST /auth/register`

```
Request:  { email: string, password: string }
Response: { token: string, user: User }
Status:   201
```

- Password min 6 characters
- Hash password with bcrypt (10 rounds)
- Generate JWT token
- Return full user object

#### `POST /auth/login`

```
Request:  { email: string, password: string }
Response: { token: string, user: User }
```

- Validate credentials
- Generate JWT token
- Include weeklyStreak array in user response

#### `POST /auth/forgot-password`

```
Request:  { email: string }
Response: { success: true, message: string }
```

- Always returns 200 regardless of whether the email exists (prevents enumeration)
- Deletes any existing reset tokens for the user
- Generates token with 1-hour expiry, sends reset email via SMTP
- Email contains link to `GET /auth/password-reset-redirect?token=...`

#### `GET /auth/password-reset-redirect`

```
Query:    token=<string>
Response: 302 redirect to calmisu://password-reset?token=... (valid)
          302 redirect to calmisu://password-reset?error=expired_token (expired)
          302 redirect to calmisu://password-reset?error=invalid_token (not found)
          302 redirect to calmisu://password-reset?error=missing_token (no token param)
```

- Validates token; redirects to app deep link

#### `POST /auth/reset-password`

```
Request:  { token: string, newPassword: string }
Response: { success: boolean, message: string }
```

- Validates token exists and is not expired
- Hashes new password with bcrypt (10 rounds), updates user, deletes token (single-use)
- newPassword min 6 characters

#### `POST /auth/logout`

```
Response: { success: boolean, message: string }
```

- JWT is stateless — client should delete token locally
- This endpoint is for API consistency only

#### `POST /auth/google`

```
Request:  { idToken: string, platform: 'android' | 'ios' | 'web', firstName?: string | null, lastName?: string | null }
Response: { token: string, user: User }
```

- Verify Google ID token using `google-auth-library`
- Optional `firstName`/`lastName` are used as fallback if the token payload doesn't include them (needed for some Expo Go flows)
- Token payload claims take priority over client-provided name fields
- If user exists by email: update firstName/lastName if missing, set `emailConfirmed: true`, return with new JWT
- If new user: create with random hashed password (Google users don't use password auth), `emailConfirmed: true`
- **CRITICAL:** Must return both `token` AND full `user` object. If `user` is missing, the app enters an invalid state where `isAuth=true` but `user=null`.

**Google Client IDs required in env:**

- `GOOGLE_WEB_CLIENT_ID` — For Expo Go / web auth
- `GOOGLE_ANDROID_CLIENT_ID` — For Android standalone builds
- `GOOGLE_IOS_CLIENT_ID` — For iOS standalone builds

**Token verification implementation:**

```typescript
import { OAuth2Client } from "google-auth-library";

const CLIENT_IDS = {
  web: process.env.GOOGLE_WEB_CLIENT_ID,
  android: process.env.GOOGLE_ANDROID_CLIENT_ID,
  ios: process.env.GOOGLE_IOS_CLIENT_ID,
};

async function verifyGoogleToken(idToken: string) {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: Object.values(CLIENT_IDS).filter(Boolean),
  });
  return ticket.getPayload();
  // payload contains: email, name, picture, sub (Google user ID), email_verified
}
```

**Error responses:**

- 400: "Invalid Google token" — Token verification failed
- 400: "No email in Google token" — Token missing email claim

### Profile (all auth required)

#### `GET /me`

```
Response: { user: User }
```

- Return authenticated user's profile with weeklyStreak array

#### `PATCH /me`

```
Request:  { firstName?: string, lastName?: string, notification?: boolean }
Response: { success: boolean, message: string, user: User }
```

- At least one field required
- `firstName` / `lastName`: min 1 char, max 50 chars
- `notification`: boolean — controls whether the user receives push notifications

#### `DELETE /me`

```
Request:  { password: string, confirmDelete: true }
Response: { success: boolean, message: string }
```

- Requires password confirmation
- All related data (weeklyStreaks, verificationTokens) cascade deleted

#### `POST /push-token`

```
Request:  { token: string }
Response: { success: boolean }
Auth:     required (Bearer)
```

- Stores the Expo push token for the authenticated user — overwrites any previous value
- Only called when the device token changes (the app detects this and re-registers)
- Respect the user's `notification` flag: if `notification = false`, ignore incoming pushes for this user

**Prisma implementation:**
```typescript
await prisma.user.update({
  where: { id: request.user.id },
  data: { pushToken: body.token },
})
return { success: true }
```

> **Note:** `pushToken` is never included in user responses — it is internal to the server only.

#### `POST /change-email`

```
Request:  { newEmail: string, password: string }
Response: { success: boolean, message: string }
```

- Verify current password before changing
- Check new email not already in use
- Set `emailConfirmed = false` after change

#### `POST /change-password`

```
Request:  { currentPassword: string, newPassword: string }
Response: { success: boolean, message: string }
```

- newPassword min 6 characters

#### `POST /send-verification`

```
Request:  { email: string }
Response: { success: boolean, message: string }
```

- Verifies the email matches the authenticated user's account
- Deletes any existing verification tokens for user
- Generates new token with 24-hour expiry
- Sends verification email via SMTP

#### `POST /verify-email`

```
Request:  { token: string }
Response: { success: boolean, message: string }
```

- Validates token and expiry
- Sets `emailConfirmed = true`
- Deletes used token

### Chat (auth required)

#### `POST /chat/stream`

SSE endpoint. Client sends the full message history; backend streams the AI response. **No server-side conversation persistence.**

```
Request:  { messages: Array<{ role: 'user' | 'assistant', content: string }> }
```

- `messages` array: 1–100 items, each content max 2,000 chars
- Per-message token limit: 500 estimated tokens (~2,000 chars)
- Total context limit: 4,000 estimated tokens across all messages
- Auth required
- Rate limited: 20 requests per hour per user
- **Subscription limit:** `free` users capped at `FREE_CHAT_MESSAGE_LIMIT` lifetime messages (default: 10). Returns `403` with `"Chat message limit reached for free plan"` when exceeded. Counter increments on successful stream only.

**Response headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**SSE event format:**

```
data: {"type":"token","content":"<token_text>"}\n\n   (streamed tokens)
data: {"type":"done"}\n\n                               (stream complete)
data: [DONE]\n\n                                        (end signal)
data: {"type":"error","content":"<description>"}\n\n   (on error)
```

**Implementation:**

1. Validate messages array (Zod schema)
2. Validate token limits via `validateMessageTokens()` — rejects before SSE headers are written
3. Build system prompt + message history via `buildChatMessages()`
4. Call OpenAI with streaming enabled via `streamChatResponse()`
5. Write each token as an SSE event
6. Send `done` then `[DONE]`, close stream
7. Keep-alive: write `: keepalive\n\n` every 15 seconds
8. Clean up interval on client disconnect

### Subscription (auth required)

#### `POST /subscription/verify`

```
Request:  {} (empty body — user identified from JWT)
Response: { success: boolean, message: string, user: User }
```

- Call RevenueCat REST API using the authenticated user's `id` as the RC `appUserId`:
  ```
  GET https://api.revenuecat.com/v1/subscribers/{userId}
  Authorization: Bearer {REVENUECAT_SECRET_API_KEY}
  ```
- Check `subscriber.entitlements.pro.is_active === true`
- Updates user: `subscription: 'pro'`, `nextPaymentDate` from `subscriber.entitlements.pro.expires_date`, `productId` from `subscriber.entitlements.pro.product_identifier`
- If entitlement not active: return user with current (unchanged) subscription status

#### `POST /subscription/restore`

```
Request:  {} (empty body — user identified from JWT)
Response: { success: boolean, message: string, user: User }
```

- Same logic as `/subscription/verify` — calls RC REST API with the JWT user's `id`
- RC already tracks all purchases associated with that `appUserId`
- If entitlement active: restores `subscription: 'pro'`, refreshes `nextPaymentDate`
- If not active: returns user with `subscription: 'cancelled'`

#### `POST /subscription/rc-webhook`

**RevenueCat webhook. Called by RevenueCat servers — NOT the mobile app. No JWT auth.**

```
Request:  RevenueCat webhook event payload (JSON)
Response: 200 OK — always, including on non-fatal errors
Auth:     None (JWT not required). Secured via Authorization header.
```

**Security:** Validate `request.headers.authorization === `Bearer ${process.env.REVENUECAT_WEBHOOK_SECRET}`` before processing. Always return `200` — non-2xx causes RC to retry.

**Request body format:**

```json
{
  "api_version": "1.0",
  "event": {
    "type": "RENEWAL",
    "app_user_id": "<user-db-id>",
    "product_id": "pro_monthly",
    "expiration_at_ms": 1740564000000,
    "purchased_at_ms": 1737972000000,
    "store": "PLAY_STORE"
  }
}
```

**User lookup:** find by `id` where `id = event.app_user_id` (set via `Purchases.logIn(user.id)` on the client).

**Event type actions:**

| Event type | DB Action |
|------------|-----------|
| `TRIAL_STARTED` | Set `subscription: 'free-trial'`, `trialEndsDate` from `expiration_at_ms`, `productId` |
| `TRIAL_CONVERTED` | Set `subscription: 'pro'`, `nextPaymentDate` from `expiration_at_ms`, `trialEndsDate: null` |
| `TRIAL_CANCELLED` | Set `subscription: 'cancelled'`, `trialEndsDate: null`, `nextPaymentDate: null` |
| `INITIAL_PURCHASE` | Set `subscription: 'pro'`, `nextPaymentDate` from `expiration_at_ms`, `productId` from `product_id` |
| `RENEWAL` | Update `nextPaymentDate` from `expiration_at_ms` |
| `CANCELLATION` | No immediate change — `nextPaymentDate` intact; `GET /me` handles expiry at period end |
| `EXPIRATION` | Set `subscription: 'cancelled'`, `nextPaymentDate: null` |
| `BILLING_ISSUE` | Set `subscription: 'cancelled'`, `nextPaymentDate: null` |
| `UNCANCELLATION` | Keep existing `subscription: 'pro'` and `nextPaymentDate` |

**Error handling:** wrap entire handler in try/catch — always return `200`:

```typescript
try {
  // ... handle event
} catch (err) {
  fastify.log.error({ err, appUserId: event.app_user_id }, 'RC webhook error');
}
return reply.status(200).send({ received: true });
```

---

#### `GET /me` — subscription auto-expire

Before returning the user object, check if subscription has lapsed:

```javascript
if (user.subscription === 'pro' && user.nextPaymentDate && new Date(user.nextPaymentDate) < new Date()) {
  await prisma.user.update({ where: { id }, data: { subscription: 'cancelled' } });
  user.subscription = 'cancelled';
}
```

This acts as a safety net for any events missed by the RC webhook.

### RevenueCat Dashboard Setup

One-time setup steps to connect RevenueCat to the app and backend.

#### Step 1 — Create RC project and connect Google Play

1. Sign up at [app.revenuecat.com](https://app.revenuecat.com) → **Create new project**.
2. Add app → select **Google Play Store** → enter package name `com.anonymous.kumo`.
3. Upload your Google Play service account JSON (same service account used previously for Play API verification).

#### Step 2 — Create entitlement and products

1. **Entitlements** → **New Entitlement** → identifier: `pro`.
2. **Products** → **New Product** → add `pro_monthly` and `pro_quarterly` (must match Play Store product IDs exactly).
3. Attach both products to the `pro` entitlement.

#### Step 3 — Create offering

1. **Offerings** → **New Offering** → identifier: `default`.
2. Add packages: one with `pro_monthly` (Monthly package type), one with `pro_quarterly` (3 Month package type).
3. Set `default` as the current offering.

#### Step 4 — Configure webhook

1. RC Dashboard → **Project Settings** → **Webhooks** → **Add webhook**.
2. **Endpoint URL:** `https://your-backend.com/subscription/rc-webhook`
3. **Authorization header value:** set to your `REVENUECAT_WEBHOOK_SECRET`
4. Select events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `UNCANCELLATION`, `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_CANCELLED`
5. Save and send a test event to verify the endpoint responds with `200`.

---

### Push Notifications (server-side sending)

The server sends push notifications to devices via the **Expo Push API** using the `pushToken` stored on each user.

#### Expo Push API endpoint

```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json
Authorization: Bearer <EXPO_ACCESS_TOKEN>   (optional but recommended)
```

#### Message format

```typescript
interface ExpoPushMessage {
  to: string            // Expo push token, e.g. "ExponentPushToken[xxx]"
  title?: string
  body: string
  data?: Record<string, unknown>   // extra payload delivered to the app
  sound?: 'default' | null
  badge?: number
}
```

#### Sending a notification (utility function)

```typescript
import fetch from 'node-fetch'

async function sendPushNotification(
  pushToken: string,
  title: string | undefined,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const message = { to: pushToken, title, body, data, sound: 'default' }
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(message),
  })
}
```

#### Sending to a specific user (with notification flag check)

```typescript
async function notifyUser(
  userId: string,
  title: string | undefined,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true, notification: true },
  })
  if (!user?.pushToken || !user.notification) return
  await sendPushNotification(user.pushToken, title, body, data)
}
```

#### Sending to all users (broadcast)

```typescript
async function broadcastNotification(
  title: string | undefined,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { notification: true, pushToken: { not: null } },
    select: { pushToken: true },
  })
  // Expo supports up to 100 messages per request
  const chunks = chunkArray(users, 100)
  for (const chunk of chunks) {
    const messages = chunk.map((u) => ({
      to: u.pushToken!,
      title,
      body,
      data,
      sound: 'default',
    }))
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    })
  }
}
```

#### Prisma schema changes

Add to `prisma/schema.prisma`:
```prisma
model User {
  // ... existing fields
  notification  Boolean  @default(true)
  pushToken     String?
}
```

Run migration: `npx prisma migrate dev --name add_push_token`

For **local SQLite** (`schema.test.prisma`), the same fields work since they use native SQLite types.

---

### Streak (auth required)

#### `GET /streak`

```
Response: {
  streak: [
    { day: "monday", date: "2026-01-26", visited: boolean },
    ...
    { day: "sunday", date: "2026-02-01", visited: boolean }
  ],
  totalVisits: number
}
```

- Returns current week (Monday–Sunday UTC) with visited status
- Dates in `YYYY-MM-DD` format

#### `POST /streak/check-in`

```
Request:  {} (empty body)
Response: {
  success: boolean,
  message: "Check-in recorded" | "Already checked in today",
  streak: [...],
  totalVisits: number
}
```

- Idempotent — safe to call multiple times per day
- Returns updated streak for the current week

### Feedback (NO AUTH REQUIRED)

#### `POST /feedback`

```
Request:  { feedback?: string, rating?: number, name?: string }
Response: { success: boolean, message?: string }
```

- No authentication required — accessible to all users including guests
- Appends row to Google Sheets "Calmisu feedbacks"
- Rating: `0 = Poor`, `1 = Average`, `2 = Great`
- All fields optional
- Google Sheets columns: Name, Timestamp, Rating, Feedbacks

**Env vars required:**

- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

### App Version

#### `GET /version`

```
Response: { minVersion: string, latestVersion: string, storeUrls: { android: string, ios: string } }
```

- No authentication required
- `minVersion` — app versions below this show a critical update popup on every launch
- `latestVersion` — app versions below this (but ≥ minVersion) show a soft update popup once per 24h
- `storeUrls` — deep links to Google Play and App Store
- Values are **hardcoded constants** in `src/routes/version.ts` — update them when releasing a new build

### Health Check

#### `GET /health`

```
Response: { status: "ok" }
```

---

## Response Formats

### User object (returned in auth responses)

```json
{
  "id": "uuid",
  "firstName": "string | null",
  "lastName": "string | null",
  "email": "string",
  "emailConfirmed": "boolean",
  "subscription": "free | free-trial | pro | cancelled",
  "nextPaymentDate": "ISO string | null",
  "trialEndsDate": "ISO string | null",
  "weeklyStreak": [{ "date": "ISO string" }],
  "role": "user | admin",
  "notification": "boolean",
  "createdAt": "ISO string"
}
```

### WeeklyStreakDay object

```json
{
  "day": "monday | tuesday | wednesday | thursday | friday | saturday | sunday",
  "date": "YYYY-MM-DD",
  "visited": "boolean"
}
```

### Error response (all error cases)

```json
{
  "message": "Human-readable error message",
  "statusCode": 400
}
```

Status codes: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limit), 500 (server error)

**401 error messages:**
- `"Authorization header missing"` — no/malformed Authorization header
- `"Token expired or invalid"` — JWT expired or signature invalid

---

## Security Rules

- Hash passwords with bcrypt (10 rounds)
- JWT tokens expire in 7 days (`JWT_EXPIRES_IN`)
- Never return password hash in any response
- Validate file uploads: accept only audio/m4a, audio/mp4, audio/mpeg; max 10MB
- Sanitize all user input before storing
- On 401: client clears local auth state and redirects to login

### Rate Limits

| Endpoint | Limit | Key |
|----------|-------|-----|
| `POST /auth/register` | 5 req / min | IP |
| `POST /auth/login` | 10 req / min | IP |
| `POST /auth/google` | 10 req / min | IP |
| `POST /chat/stream` | 20 req / hour | JWT user ID |
| All other endpoints | 100 req / min | IP |

Returns `429` with `{ message: "Too many requests, please try again later", statusCode: 429 }` when exceeded.

---

## AI Chat System Prompt

The AI assistant is named **Calmisu** — a calming, supportive mental wellness companion:

```
You are Calmisu, a gentle and supportive mental wellness companion. You:
- Listen with empathy and validate feelings
- Ask thoughtful follow-up questions
- Suggest grounding techniques, breathing exercises, or mindfulness practices when appropriate
- Never diagnose or replace professional mental health support
- Keep responses concise (2-4 sentences unless the user needs more)
- Use a warm, calm tone
```

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...  # or file:./prisma/test.db for local SQLite

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-...

# AWS S3 (audio uploads)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=...

# SMTP (email verification)
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@example.com

# Google OAuth
GOOGLE_WEB_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...
GOOGLE_IOS_CLIENT_ID=...

# RevenueCat (subscription management)
REVENUECAT_SECRET_API_KEY=sk_...     # Secret API key from RC dashboard (Project Settings → API Keys)
REVENUECAT_WEBHOOK_SECRET=...        # Shared secret set in RC webhook config (used in Authorization header)

# Expo Push Notifications (optional — increases delivery reliability)
EXPO_ACCESS_TOKEN=...            # From expo.dev → Account Settings → Access Tokens

# Google Sheets (feedback)
GOOGLE_SHEETS_PRIVATE_KEY=...
GOOGLE_SHEETS_CLIENT_EMAIL=...
GOOGLE_SHEETS_SPREADSHEET_ID=...

# Server
PORT=3001
NODE_ENV=development
```

> External service env vars (AWS, SMTP, OpenAI, Google Play, Google Sheets) are only required in production. Services are lazy-initialized — the server starts without them.

---

## Local Development (SQLite, no external services)

The backend runs locally with SQLite instead of PostgreSQL. Server runs on **port 3001**.

### Files

| File                        | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `prisma/schema.prisma`      | Production PostgreSQL schema                                |
| `prisma/schema.test.prisma` | SQLite version (enums replaced with `String`)               |
| `.env`                      | Dev env: `DATABASE_URL=file:./prisma/test.db`, port 3001    |
| `prisma/seed.ts`            | Seed script: 3 users, 2 conversations, 4 messages, 5 streaks |

### Scripts

```bash
npm run db:local:generate  # Generate Prisma client for SQLite
npm run db:local:push      # Create/sync SQLite tables
npm run db:local:seed      # Populate with test data
npm run db:local:studio    # Open Prisma Studio for SQLite
npm run db:local:setup     # Run generate + push + seed in one command
npm run dev                # Start dev server on port 3001
```

### First-time setup

```bash
npm install
npm run db:local:setup
npm run dev
```

### Test credentials

All seeded users share the password `Password123!`:

| Email          | Role  | Subscription |
| -------------- | ----- | ------------ |
| alice@test.com | user  | pro          |
| bob@test.com   | user  | free         |
| admin@test.com | admin | pro          |

### Notes

- SQLite does not support Prisma enums; the test schema uses `String` fields instead
- The Prisma plugin (`src/plugins/prisma.ts`) resolves SQLite `file:` paths to absolute paths at runtime
- `prisma/test.db` and `.env.test` are in `.gitignore`

---

## Implementation Notes

- All dates must be ISO 8601 strings in responses
- Use UUIDs (v4) for all IDs
- **CRITICAL: All auth endpoints (`/auth/login`, `/auth/register`, `/auth/google`) MUST return the full `user` object alongside the token.** The mobile app sets `isAuth=true` and `user` from the same response. If `user` is missing, the app enters an invalid state where `isAuth=true` but `user=null`.
- SSE keep-alive: send `: keepalive\n\n` every 15s to prevent timeout
- The stream endpoint handles client disconnect gracefully (clears keep-alive interval on `request.raw.on('close', ...)`)
- Chat is stateless — the client owns conversation history and sends it with each stream request
- Token estimation uses `ceil(chars / 4)` — accurate enough for limiting, not billing
- `validateMessageTokens()` is in `src/services/chat.service.ts` and throws before SSE headers are written, so errors return a clean JSON 400 (not an SSE error event)
