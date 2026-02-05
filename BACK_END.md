<!-- CLAUDE.md for Kumo Backend -->
<!-- Place this file in the backend project root as CLAUDE.md -->

## Project Context

This is the backend for **Kumo** - a mental wellness React Native app (Expo 54). The backend serves a REST API with JWT authentication and SSE streaming for AI chat. The mobile client uses Axios for requests and native fetch for SSE.

## Tech Stack Recommendations

- **Runtime:** Node.js with Express/Fastify or NestJS
- **Database:** PostgreSQL with Prisma/TypeORM
- **Auth:** JWT (Bearer token in Authorization header)
- **File Storage:** S3-compatible (audio uploads)
- **AI Provider:** OpenAI or Anthropic API for chat responses
- **SSE:** Native response streaming (res.write with text/event-stream)

---

## Database Schema

### users

| Column          | Type      | Notes                                      |
| --------------- | --------- | ------------------------------------------ |
| id              | UUID (PK) | Auto-generated                             |
| email           | VARCHAR   | Unique, required                           |
| password        | VARCHAR   | Hashed (bcrypt)                            |
| firstName       | VARCHAR   | Nullable                                   |
| lastName        | VARCHAR   | Nullable                                   |
| emailConfirmed  | BOOLEAN   | Default: false                             |
| subscription    | ENUM      | `free`, `free-trial`, `pro`, `cancelled`   |
| nextPaymentDate | TIMESTAMP | Nullable                                   |
| trialEndsDate   | TIMESTAMP | Nullable                                   |
| role            | ENUM      | `user`, `admin`. Default: `user`           |
| notification    | BOOLEAN   | Default: true (push notifications enabled) |
| createdAt       | TIMESTAMP | Auto-generated                             |

### weekly_streaks

| Column | Type      | Notes               |
| ------ | --------- | ------------------- |
| id     | UUID (PK) |                     |
| userId | UUID (FK) | References users.id |
| date   | TIMESTAMP |                     |

### conversations

| Column      | Type      | Notes                                      |
| ----------- | --------- | ------------------------------------------ |
| id          | UUID (PK) |                                            |
| userId      | UUID (FK) | References users.id                        |
| title       | VARCHAR   | Nullable, auto-generate from first message |
| lastMessage | TEXT      | Nullable, update on each new message       |
| createdAt   | TIMESTAMP |                                            |
| updatedAt   | TIMESTAMP |                                            |

### messages

| Column         | Type      | Notes                            |
| -------------- | --------- | -------------------------------- |
| id             | UUID (PK) |                                  |
| conversationId | UUID (FK) | References conversations.id      |
| role           | ENUM      | `user`, `assistant`              |
| content        | TEXT      | Empty string for audio-only msgs |
| audioUrl       | VARCHAR   | Nullable, URL to stored audio    |
| audioDuration  | INTEGER   | Nullable, seconds                |
| createdAt      | TIMESTAMP |                                  |

---

## API Endpoints

All endpoints prefixed with base URL. Authenticated endpoints require: `Authorization: Bearer <jwt-token>`

### Auth

#### `POST /auth/register`

```
Request:  { email: string, password: string }
Response: { token: string, user: User }
```

- Hash password with bcrypt
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

#### `POST /auth/logout`

```
Response: { success: boolean, message: string }
```

- Logout user (client should delete token)
- JWT is stateless, so this endpoint confirms logout for API consistency

#### `POST /auth/google`

```
Request:  { idToken: string, platform: 'android' | 'ios' | 'web' }
Response: { token: string, user: User }
```

- Verify Google ID token using `google-auth-library` npm package
- Use appropriate client ID based on `platform` parameter for verification
- Extract email, name, picture from verified token payload
- If user exists by email: return existing user data with new JWT
- If new user: create account with Google data, set `emailConfirmed: true` (Google already verified)
- Return JWT token and user object (same format as `/auth/login`)

**Google Client IDs required in env:**

- `GOOGLE_WEB_CLIENT_ID` - For Expo Go / web auth
- `GOOGLE_ANDROID_CLIENT_ID` - For Android standalone builds
- `GOOGLE_IOS_CLIENT_ID` - For iOS standalone builds

**Token verification implementation:**

```typescript
import { OAuth2Client } from "google-auth-library";

const CLIENT_IDS = {
  web: process.env.GOOGLE_WEB_CLIENT_ID,
  android: process.env.GOOGLE_ANDROID_CLIENT_ID,
  ios: process.env.GOOGLE_IOS_CLIENT_ID,
};

async function verifyGoogleToken(
  idToken: string,
  platform: "android" | "ios" | "web",
) {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: Object.values(CLIENT_IDS).filter(Boolean),
  });
  const payload = ticket.getPayload();
  // payload contains: email, name, picture, sub (Google user ID), email_verified
  return payload;
}
```

**Error responses:**

- 400: "Invalid Google token" - Token verification failed
- 400: "No email in Google token" - Token missing email claim

### Profile (all auth required)

#### `GET /me`

```
Response: { user: User }
```

- Return authenticated user's profile with weeklyStreak array
- Uses JWT userId to identify the user

#### `PATCH /me`

```
Request:  { firstName?: string, lastName?: string, notification?: boolean }
Response: { success: boolean, message: string, user: User }
```

- Update profile fields (at least one field required)
- Only firstName, lastName, and notification can be updated via this route

#### `DELETE /me`

```
Request:  { password: string, confirmDelete: true }
Response: { success: boolean, message: string }
```

- Permanently deletes user account
- Requires password confirmation for security
- All related data (conversations, messages, streaks) cascade deleted

#### `POST /change-email`

```
Request:  { newEmail: string, password: string }
Response: { success: boolean, message?: string }
```

- Verify current password before changing
- Set emailConfirmed = false after change

#### `POST /change-password`

```
Request:  { currentPassword: string, newPassword: string }
Response: { success: boolean, message?: string }
```

#### `POST /send-verification`

```
Request:  { email: string }
Response: { success: boolean, message?: string }
```

- Generate verification token, send email

#### `POST /verify-email`

```
Request:  { token: string }
Response: { success: boolean, message?: string }
```

- Validate token, set emailConfirmed = true

### Chat (all auth required)

#### `GET /chat/conversations`

```
Response: Conversation[]
```

- Return user's conversations sorted by updatedAt DESC
- Enforce: only return conversations where userId = authenticated user

#### `POST /chat/conversations`

```
Request:  {} (empty body)
Response: Conversation
Status:   201
```

#### `GET /chat/conversations/:conversationId/messages`

```
Response: Message[]
```

- Sorted by createdAt ASC (chronological)
- Verify conversation belongs to authenticated user

#### `POST /chat/messages`

```
Request:  { conversationId: string, content: string, audioUrl?: string, audioDuration?: number }
Response: Message (the saved user message)
Status:   201
```

- Save user message to DB
- Update conversation.lastMessage and conversation.updatedAt
- If conversation has no title and content is non-empty, auto-generate title from content (first 50 chars or AI-summarized)
- Trigger async AI response generation (the client will read it via stream)
- For audio messages: if audioUrl provided, run speech-to-text to get transcript, use that as context for AI

#### `POST /chat/audio`

```
Request:  multipart/form-data with field "audio" (file, .m4a format)
Response: { url: string, duration: number }
```

- Store file in S3/cloud storage
- Detect audio duration (use ffprobe or audio metadata library)
- Return public CDN URL and duration in seconds

#### `GET /chat/conversations/:conversationId/stream`

SSE endpoint for streaming AI responses.

**Headers required:**

```
Authorization: Bearer <token>
Accept: text/event-stream
```

**Response headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Implementation:**

1. Verify auth and conversation ownership
2. Get conversation message history from DB
3. Build AI prompt with message history as context
4. Call AI provider (OpenAI/Anthropic) with streaming enabled
5. For each token received from AI, write SSE event:
   ```
   data: {"type":"token","content":"<token_text>"}\n\n
   ```
6. When AI response is complete, save full response as assistant message in DB
7. Send done event:
   ```
   data: {"type":"done","messageId":"<saved_message_uuid>"}\n\n
   ```
8. Send end signal and close:
   ```
   data: [DONE]\n\n
   ```
9. On error:
   ```
   data: {"type":"error","content":"<error_description>"}\n\n
   ```

### Subscription (auth required)

#### `POST /subscription/verify`

```
Request:  { purchaseToken: string, productId: string }
Response: { success: boolean, message: string, user: User }
```

- Verify Google Play purchase and activate subscription
- Client sends purchase token received from Google Play
- Backend verifies with Google Play Developer API
- Updates user subscription to 'pro' with nextPaymentDate

### Streak (auth required, Pro subscription check on frontend)

#### `GET /streak`

```
Response: {
  streak: [
    { day: "monday", date: "2026-01-26", visited: boolean },
    { day: "tuesday", date: "2026-01-27", visited: boolean },
    { day: "wednesday", date: "2026-01-28", visited: boolean },
    { day: "thursday", date: "2026-01-29", visited: boolean },
    { day: "friday", date: "2026-01-30", visited: boolean },
    { day: "saturday", date: "2026-01-31", visited: boolean },
    { day: "sunday", date: "2026-02-01", visited: boolean }
  ],
  totalVisits: number
}
```

- Returns the current week (Monday to Sunday) with visited status for each day
- Dates are in YYYY-MM-DD format (UTC)

#### `POST /streak/check-in`

```
Request:  {} (empty body)
Response: {
  success: boolean,
  message: "Check-in recorded" | "Already checked in today",
  streak: [...],  // Same format as GET /streak
  totalVisits: number
}
```

- Records today as a visited day
- Prevents duplicate entries (calling multiple times same day is safe)
- Returns updated streak data for the current week

### Feedback (NO AUTH REQUIRED)

#### `POST /feedback`

```
Request:  { feedback?: string, rating?: number, name?: string }
Response: { success: boolean, message?: string }
```

- **No authentication required** - accessible to all users including guests
- Submit user feedback to Google Sheets "Calmisu feedbacks"
- Rating values: 0 = Poor, 1 = Average, 2 = Great
- All fields are optional
- Google Sheets columns (in order): Name, Timestamp, Rating, Feedbacks
  - **Name**: Optional - passed from frontend if user is logged in, empty for guests
  - **Timestamp**: Server-generated ISO timestamp
  - **Rating**: "Poor" | "Average" | "Great" | empty string
  - **Feedbacks**: User's text feedback (max 300 characters)

**Backend Implementation Notes:**

- Use Google Sheets API v4 with `googleapis` npm package
- Service account: `calmisu-service-account@calmisu.iam.gserviceaccount.com`
- Environment variables required:
  - `GOOGLE_SHEETS_PRIVATE_KEY` - Service account private key (from JSON key file)
  - `GOOGLE_SHEETS_CLIENT_EMAIL` - Service account email
  - `GOOGLE_SHEETS_SPREADSHEET_ID` - ID of "Calmisu feedbacks" spreadsheet

**Example implementation:**

```typescript
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// Append row to spreadsheet
await sheets.spreadsheets.values.append({
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  range: "Sheet1!A:D",
  valueInputOption: "USER_ENTERED",
  resource: {
    values: [
      [
        name || "", // Name from request body (optional)
        new Date().toISOString(),
        ["Poor", "Average", "Great"][rating] || "",
        feedback || "",
      ],
    ],
  },
});
```

---

## Response Formats

### User object (returned in auth responses)

```json
{
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

### Conversation object

```json
{
  "id": "uuid",
  "title": "string | null",
  "lastMessage": "string | null",
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```

### Message object

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "user | assistant",
  "content": "string",
  "audioUrl": "string | null",
  "audioDuration": "number | null",
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

Status codes: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

---

## Security Rules

- Hash passwords with bcrypt (min 10 rounds)
- JWT tokens should expire (recommended: 7 days)
- Always verify conversation ownership before returning messages or streaming
- Validate file uploads: accept only audio/m4a, audio/mp4, audio/mpeg; max 10MB
- Rate limit chat messages (e.g., 20 messages/minute per user)
- Sanitize all user input before storing
- Never return password hash in any response
- On 401: client clears local auth state and redirects to login

---

## AI Chat System Prompt

The AI assistant is named **Calmisu** - a calming, supportive mental wellness companion. When building the AI prompt, use this system message:

```
You are Calmisu, a gentle and supportive mental wellness companion. You:
- Listen with empathy and validate feelings
- Ask thoughtful follow-up questions
- Suggest grounding techniques, breathing exercises, or mindfulness practices when appropriate
- Never diagnose or replace professional mental health support
- Keep responses concise (2-4 sentences unless the user needs more)
- Use a warm, calm tone
```

Include the full conversation history (all messages in the conversation) as context when calling the AI provider.

---

## Local Development (SQLite, no external services)

The backend runs locally with SQLite instead of PostgreSQL. No API keys needed — external services (OpenAI, AWS S3, SMTP) are optional outside production. The server runs on **port 3001** (frontend uses 3000).

### Files

| File                        | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `prisma/schema.test.prisma` | SQLite version of the schema (enums replaced with `String`)  |
| `.env`                      | Dev env: `DATABASE_URL=file:./prisma/test.db`, port 3001     |
| `.env.test`                 | Test env: same DB, `NODE_ENV=test`                           |
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

- External service env vars (AWS, SMTP, OpenAI, Google Play) are only required when `NODE_ENV=production`
- Google Play subscription verification requires `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON string) and `ANDROID_PACKAGE_NAME`
- Services (OpenAI, S3, SMTP) are lazy-initialized — the server boots without them and only throws when you call an endpoint that needs them
- SQLite does not support Prisma enums; the test schema uses `String` fields instead
- The Prisma plugin (`src/plugins/prisma.ts`) resolves SQLite `file:` paths to absolute paths at runtime
- `prisma/test.db` and `.env.test` are in `.gitignore`

---

## Implementation Notes

- All dates must be ISO 8601 strings in responses
- Use UUIDs (v4) for all IDs
- **CRITICAL: All auth endpoints (`/auth/login`, `/auth/register`, `/auth/google`) MUST return the full `user` object alongside the token.** The mobile app sets `isAuth=true` and `user` from the same response. If `user` is missing, the app enters an invalid state where `isAuth=true` but `user=null`.
- Conversation.title: auto-generate from first user message (truncate to ~50 chars)
- Conversation.lastMessage: update with the latest message content on each new message
- Audio speech-to-text: use OpenAI Whisper or similar to transcribe audio before sending to AI
- SSE keep-alive: send a comment line (`: keepalive\n\n`) every 15s to prevent timeout
- The stream endpoint should handle client disconnect gracefully (abort AI request if client disconnects)
