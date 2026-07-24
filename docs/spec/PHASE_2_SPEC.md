# Admission Guidelines Automation — Phase 2 Specification

## 1. Purpose

Phase 2 adds a **read-only connection to the user's work Notion workspace**.

The app must use the reviewed Phase 1 extraction result to:

- verify that the configured Notion data sources are accessible;
- inspect and validate the required Notion schemas;
- find the requester in the Agents data source;
- find Student candidates by the extracted base name;
- suggest the next Student display name for a new client;
- find matching Universities;
- find matching Majors using both University and normalized Major identity;
- preview what Phase 3 would create or reuse;
- calculate the correct next work-log title from existing work-log rows.

**Phase 2 must not create, update, archive, or delete any Notion page.**

The existing disabled `Create Notion records` button must remain disabled.

---

## 2. Existing Project Assessment

The current project is a small local-only Node.js ESM application.

### Current stack

- Node.js 20+
- Node built-in HTTP server
- Plain HTML, CSS, and browser JavaScript
- ES modules
- No frontend framework
- No production dependencies yet
- Node built-in test runner (`node --test`)
- Local binding to `127.0.0.1`

### Current structure

```text
.
├─ .env.example
├─ .gitignore
├─ README.md
├─ data/
│  └─ universityAliases.csv
├─ package.json
├─ public/
│  ├─ app.js
│  ├─ index.html
│  └─ styles.css
├─ src/
│  ├─ server/
│  │  ├─ extraction/
│  │  │  └─ mockExtractor.js
│  │  ├─ universities/
│  │  │  └─ universityAliases.js
│  │  └─ server.js
│  └─ shared/
│     ├─ deadline.js
│     ├─ degreeLabels.js
│     ├─ filename.js
│     ├─ normalization.js
│     └─ workLog.js
└─ test/
   ├─ rules.test.js
   └─ server.test.js
```

### Current implementation quality

- The server is correctly restricted to `127.0.0.1`.
- Static-file path traversal is guarded.
- Request bodies have a size limit.
- Phase 1 business rules are separated into shared modules.
- Student suffix logic, Major normalization, deadline calculation, Programme Label generation, filename generation, and work-log numbering already have tests.
- The frontend already contains placeholders for Student Mode and Notion Preview.
- All 15 existing tests pass.

Phase 2 should extend this structure instead of rewriting it.

---

## 3. Notion API Version and Terminology

Use the current Notion API model based on **data sources**, not the deprecated database-query API.

Use:

```text
Notion-Version: 2026-03-11
```

In code and environment variables, use `DATA_SOURCE_ID` terminology.

Do not introduce new code using deprecated calls such as:

```text
notion.databases.query(...)
```

Prefer the current JavaScript SDK methods under:

```text
notion.dataSources.retrieve(...)
notion.dataSources.query(...)
```

A database may contain one or more data sources. The user will configure the exact data source ID for each required table.

---

## 4. Dependencies

Add only the dependencies needed for Phase 2:

```json
{
  "dependencies": {
    "@notionhq/client": "latest",
    "dotenv": "latest"
  }
}
```

Use `dotenv/config` or an equivalent server-only import before environment variables are read.

Do not expose the Notion token or data source IDs to browser JavaScript.

---

## 5. Environment Variables

Update `.env.example` to contain:

```text
NOTION_TOKEN=
NOTION_WORK_LOG_DATA_SOURCE_ID=
NOTION_STUDENTS_DATA_SOURCE_ID=
NOTION_AGENTS_DATA_SOURCE_ID=
NOTION_UNIVERSITIES_DATA_SOURCE_ID=
NOTION_MAJORS_DATA_SOURCE_ID=
```

The real `.env` remains local and must stay ignored by Git.

Confirm `.gitignore` includes at least:

```text
.env
.env.*
!.env.example
node_modules/
```

Never log the token.

Never return the token to the browser.

---

## 6. Required Notion Data Sources

### 6.1 Work Log data source

Purpose: one row per requested work item.

Known properties:

| Property | Type | Phase 2 use |
|---|---|---|
| 완료일 | Date | Ignore |
| 마감일 | Date | Preview only |
| Status | Rollup from Students | Read only; no direct write |
| Hours | Number | Ignore |
| Agent | Rollup from Students | Read only; no direct write |
| Students | Relation to Students | Use for existing-work-log lookup |
| University | Rollup from Majors | Read only; no direct write |
| Major | Relation to Majors | Preview only |
| 작업내용 | Title | Read existing titles to calculate next number |
| Category | Select | Filter existing admissions-guideline work logs |
| 학과 링크 | Formula | Ignore |
| 요청 시즌 | Select | Preview `2026/27` |

Phase 3 write values will eventually be:

```text
작업내용 = 입학 요강 N
마감일 = request date + 2 weekdays
Students = selected or newly created Student page
Major = matched or newly created Major pages
Category = 입학 요강
요청 시즌 = 2026/27
```

### 6.2 Students data source

Known properties:

| Property | Type | Phase 2 use |
|---|---|---|
| Name | Title | Search by base-name family |
| Agent DB | Relation to Agents | Display and disambiguate candidates |
| Status | Any existing type | Optional display only if easily available |

The exact relation property name must be verified from the live schema. The user described it as `Agent DB`; do not silently assume a different name.

### 6.3 Agents data source

Known properties:

| Property | Type | Phase 2 use |
|---|---|---|
| Name | Title | Exact requester-name lookup |

Agents are rarely added. Phase 2 must never create one.

### 6.4 Universities data source

Known properties:

| Property | Type | Phase 2 use |
|---|---|---|
| Name | Title | Exact normalized name lookup |

Universities are rarely added. Phase 2 only reports whether each University exists.

### 6.5 Majors data source

Known properties:

| Property | Type | Phase 2 use |
|---|---|---|
| Name | Title | Search and display |
| Universities DB | Relation to Universities | Confirm the Major belongs to the correct University |

The exact relation property name must be verified from the live schema. The user described it as `Universities DB`.

---

## 7. Startup Configuration Validation

Add a Notion configuration layer that validates environment variables before any Notion request.

Suggested module:

```text
src/server/notion/config.js
```

Export:

```js
getNotionConfig()
validateNotionConfig()
```

Validation requirements:

- `NOTION_TOKEN` must be present.
- All five data source IDs must be present.
- Whitespace around values must be trimmed.
- Missing variables produce a structured error with a safe list of missing variable names.
- Never include secret values in an error.

Suggested error shape:

```json
{
  "code": "NOTION_CONFIG_MISSING",
  "message": "Notion is not configured.",
  "details": {
    "missing": ["NOTION_TOKEN", "NOTION_STUDENTS_DATA_SOURCE_ID"]
  }
}
```

The app should still load when Notion is unconfigured. Only Notion endpoints should fail.

---

## 8. Notion Client and Repository Layer

Do not put raw Notion SDK calls in `server.js` or `public/app.js`.

Add:

```text
src/server/notion/
├─ client.js
├─ config.js
├─ errors.js
├─ schema.js
├─ pagination.js
├─ pageValues.js
└─ repositories/
   ├─ agentsRepository.js
   ├─ studentsRepository.js
   ├─ universitiesRepository.js
   ├─ majorsRepository.js
   └─ workLogsRepository.js
```

### 8.1 `client.js`

Responsibilities:

- create one Notion client from `NOTION_TOKEN`;
- configure the current API version if the SDK requires explicit configuration;
- export a testable factory as well as the default singleton;
- allow repository tests to inject a fake client.

### 8.2 `pagination.js`

Create a reusable helper for cursor pagination.

Phase 2 searches may require more than one page of results. Do not silently inspect only the first 100 records.

Suggested interface:

```js
async function collectPaginated(queryPage)
```

Stop when `has_more` is false or `next_cursor` is null.

### 8.3 `pageValues.js`

Provide safe helpers for:

- reading a title property as plain text;
- reading relation page IDs;
- reading select values;
- reading rollup text where useful;
- extracting a page URL;
- tolerating missing or empty properties without crashing.

Do not make the frontend parse raw Notion property objects.

---

## 9. Live Schema Inspection

Phase 2 must include a schema-check endpoint.

Suggested endpoint:

```text
GET /api/notion/schema
```

The server retrieves all five configured data sources and verifies:

### Work Log

- `작업내용` exists and is a title property.
- `Students` exists and is a relation.
- `Major` exists and is a relation.
- `Category` exists and is a select.
- `마감일` exists and is a date.
- `요청 시즌` exists and is a select.

### Students

- `Name` exists and is a title property.
- `Agent DB` exists and is a relation.

### Agents

- `Name` exists and is a title property.

### Universities

- `Name` exists and is a title property.

### Majors

- `Name` exists and is a title property.
- `Universities DB` exists and is a relation.

Return a browser-safe summary:

```json
{
  "ok": true,
  "dataSources": {
    "workLog": {
      "accessible": true,
      "missingProperties": [],
      "typeMismatches": []
    }
  }
}
```

If a property name differs, do not guess. Report the mismatch clearly.

The UI should provide a small `Check Notion connection` button or automatically run this check before the first matching request.

---

## 10. Read-Only Matching Endpoint

Add:

```text
POST /api/notion/preview
```

### Request body

```json
{
  "clientMode": "new",
  "requesterName": "오유리",
  "studentName": "김민지",
  "requestDateTime": "2026-06-17T17:04:00+09:00",
  "programmes": [
    {
      "universityName": "Warwick",
      "programmeNameOriginal": "MSc Computer Science",
      "majorSearchKey": "computer science",
      "notionMajorNameProposed": "Computer Science MSc",
      "programmeUrl": "https://example.com"
    }
  ]
}
```

### Validation

Reject the request with `400` if:

- `clientMode` is not `new` or `existing`;
- requester name is empty;
- student name is empty;
- there are no programmes;
- a programme is missing University name or Major search key.

Do not trust derived fields sent by the browser. Recalculate server-side when practical, especially Major search keys and proposed Notion Major names.

---

## 11. Agent Matching Rules

Search `Agents` by exact title equality using the reviewed requester name.

Normalize only harmless formatting before comparison:

- trim leading and trailing whitespace;
- collapse repeated internal whitespace;
- preserve Korean characters;
- do not perform fuzzy matching;
- do not automatically substitute similar names.

Result states:

```text
matched      exactly one Agent
missing      zero Agents
ambiguous    more than one Agent with the same title
```

Return:

```json
{
  "status": "matched",
  "candidateCount": 1,
  "selected": {
    "id": "page-id",
    "name": "오유리",
    "url": "https://..."
  },
  "candidates": []
}
```

If missing or ambiguous, Phase 2 still completes the rest of the read-only preview but marks Notion creation as blocked.

Do not create an Agent.

---

## 12. Student Matching Rules

### 12.1 Student name family

The extracted JANDI name is the **base name**.

For base name `김민지`, the same-name family contains titles matching exactly:

```text
김민지
김민지 B
김민지 C
김민지 D
...
```

It must not include unrelated titles such as:

```text
김민지연
김민지 상담
김민지_B
```

Use a strict local regex after retrieving plausible title matches:

```text
^김민지(?: [A-Z]+)?$
```

Escape the base name before constructing the regex.

The existing `suggestNextStudentName()` rule must remain authoritative:

- no family found → `김민지`;
- `김민지` exists → `김민지 B`;
- `김민지`, `김민지 B`, `김민지 D` exist → `김민지 E`;
- use the highest existing suffix and advance it;
- do not fill suffix gaps.

### 12.2 New client mode

For `clientMode = new`:

- retrieve the full same-name family;
- calculate `suggestedStudentName` with the existing shared helper;
- show all existing family members to the user;
- do not automatically treat any existing page as the new client;
- the proposed Phase 3 action is always `create`;
- link the new Student to the matched Agent in Phase 3.

Example:

```json
{
  "mode": "new",
  "baseName": "김민지",
  "existingFamily": [
    { "id": "1", "name": "김민지", "agentNames": ["오유리"] },
    { "id": "2", "name": "김민지 B", "agentNames": ["박수진"] }
  ],
  "suggestedStudentName": "김민지 C",
  "proposedAction": "create"
}
```

The suggested name should be editable in the UI, but Phase 2 does not save it.

### 12.3 Existing client mode

For `clientMode = existing`:

- retrieve the same-name family;
- include each candidate's Agent relation page IDs and resolved Agent names;
- display all candidates;
- preselect a candidate only when there is exactly one unambiguous candidate after applying Agent information;

Automatic preselection hierarchy:

1. If exactly one Student exists in the family, preselect it.
2. If multiple Students exist and exactly one is related to the matched requester Agent, preselect that Student.
3. Otherwise, require manual selection.

Never auto-select when multiple candidates remain.

The browser must send the chosen Student page ID in a future Phase 3 request. Phase 2 stores the selection only in frontend state.

---

## 13. University Matching Rules

The reviewed `universityName` produced by Phase 1 is the canonical display/search value.

For each programme:

- search `Universities` by exact title equality;
- trim and collapse whitespace;
- compare case-insensitively after retrieval as a defensive check;
- do not use fuzzy matching;
- do not create a University in Phase 2.

Result states:

```text
matched
missing
ambiguous
```

If exactly one match exists, return its page ID, title, and URL.

If zero matches exist, return the proposed University title that Phase 3 would create.

If multiple exact matches exist, return all candidates and block automatic Phase 3 creation until resolved.

---

## 14. Major Matching Rules

A Major match requires both:

1. normalized Major identity; and
2. the correct University relation.

### 14.1 Normalized identity

Use the existing shared `getMajorSearchKey()` logic.

These must share the same search key:

```text
Computer Science
Computer Science MSc
Computer Science (MSc)
MSc Computer Science
```

Expected key:

```text
computer science
```

Degree position and parentheses must not affect matching.

### 14.2 University relation

A matching Major must be related to the matched University page ID.

A title match in a different University is not a match.

Example:

```text
York + Computer Science
Nottingham + Computer Science
```

These are separate Majors.

### 14.3 Search strategy

Because the Notion API cannot directly filter by the app's custom normalized key, use this strategy:

1. Retrieve plausible Major rows by title text when supported.
2. Paginate all results.
3. Locally calculate `getMajorSearchKey(title)` for each candidate.
4. Keep candidates whose key equals the requested `majorSearchKey`.
5. Keep only candidates whose `Universities DB` relation contains the matched University page ID.

If no reliable title-contains filter is possible for a given case, paginate the Majors data source and perform the normalized comparison locally. Correctness is more important than premature optimization for this small private app.

### 14.4 Result states

```text
matched      exactly one Major with matching key and University
missing      no matching Major
ambiguous    multiple matching Majors for the same University
blocked      University is unresolved, so Major cannot be safely matched
```

When missing, return the existing Phase 1 `notionMajorNameProposed` as the Phase 3 create name.

New Major naming rule remains:

```text
MSc Medical Biotechnology
→ Medical Biotechnology MSc
```

Existing Majors must never be renamed by this app.

---

## 15. Existing Work Log Lookup

Phase 2 should calculate the real next work-log title for an existing Student selection.

### 15.1 Filter intent

Retrieve Work Log rows where:

- `Students` relation contains the selected Student page ID; and
- `Category` equals `입학 요강`.

Map each result to:

```js
{
  title,
  category
}
```

Then call the existing shared helper:

```js
getNextWorkLogTitle(existingLogs)
```

The existing rule counts both:

```text
입학요강
입학요강 2
```

and generates the next title.

### 15.2 New Student mode

A newly proposed Student has no existing work logs, so preview:

```text
입학요강 1
```

### 15.3 Existing Student without manual selection

If existing mode has unresolved multiple candidates, do not invent a work-log number.

Return:

```text
Work Log title pending Student selection
```

When the user selects a candidate, the frontend may call a smaller endpoint:

```text
POST /api/notion/work-log-title
```

with the selected Student page ID, or it may re-run the full preview. Prefer the smaller endpoint to avoid repeating all lookups.

---

## 16. Preview Response Contract

Return a normalized browser-safe payload. Do not expose raw Notion objects.

Suggested shape:

```json
{
  "ok": true,
  "blockingIssues": [],
  "agent": {
    "status": "matched",
    "selected": {
      "id": "agent-page-id",
      "name": "오유리",
      "url": "https://..."
    },
    "candidates": []
  },
  "student": {
    "mode": "new",
    "baseName": "김민지",
    "suggestedStudentName": "김민지 D",
    "selectedStudentId": null,
    "candidates": []
  },
  "programmes": [
    {
      "index": 0,
      "university": {
        "status": "matched",
        "requestedName": "Warwick",
        "selected": {
          "id": "university-page-id",
          "name": "Warwick",
          "url": "https://..."
        },
        "candidates": []
      },
      "major": {
        "status": "missing",
        "requestedOriginalName": "MSc Computer Science",
        "searchKey": "computer science",
        "proposedCreateName": "Computer Science MSc",
        "selected": null,
        "candidates": []
      }
    }
  ],
  "workLog": {
    "title": "입학요강 1",
    "deadline": "2026-06-19",
    "category": "입학 요강",
    "requestSeason": "2026/27"
  },
  "phase3Plan": {
    "canCreate": false,
    "reasons": ["Phase 2 is read-only."],
    "studentAction": "create",
    "universitiesToCreate": [],
    "majorsToCreate": [
      {
        "name": "Computer Science MSc",
        "universityName": "Warwick"
      }
    ]
  }
}
```

Use IDs only for app state and later writes. Display human-readable names and Notion page URLs in the UI.

---

## 17. Frontend Changes

Keep the current Phase 1 sections and styling language.

### 17.1 Notion connection status

Add a compact status area near `Notion Preview`:

```text
Notion: Not checked
[Check connection]
```

States:

```text
Not configured
Checking
Connected and schema valid
Connected but schema mismatch
Connection failed
```

Do not show secrets.

### 17.2 Preview button

Add an enabled button after reviewed extraction:

```text
Preview Notion matches
```

Disable it when Phase 1 validation has errors.

The existing `Create Notion records` button remains disabled and labeled clearly:

```text
Create Notion records — Phase 3
```

### 17.3 Agent preview

Show:

- matched Agent name;
- missing or duplicate warning;
- clickable Notion page link when available.

### 17.4 Student preview

New mode:

```text
Base name: 김민지
Existing same-name clients: 3
Suggested new name: 김민지 D
```

Make `Suggested new name` editable.

Existing mode:

- render radio buttons or a select list;
- show each Student title;
- show related Agent names;
- link to the Student page;
- clearly indicate automatic preselection versus manual selection.

Changing `New client / Existing client` after a preview should invalidate the old preview and require a new preview call.

### 17.5 University and Major preview

For each programme card show:

```text
University: Existing / New / Ambiguous
Major: Existing / New / Ambiguous / Blocked
```

For existing rows, show the exact Notion title that will be reused.

For missing rows, show the proposed Phase 3 create title.

Do not hide differences between the official programme name and the Notion Major title.

Example:

```text
Official programme: MSc Computer Science
Notion Major: Computer Science MSc
Status: New Major
```

### 17.6 Work Log preview

Replace the Phase 1 placeholder title with the real calculated title when possible.

Continue showing:

```text
Deadline
Category
Request season
Programme Label
Final Word filename
```

The filename workflow remains usable even if Notion preview fails.

---

## 18. Error Handling

Create structured server errors.

Suggested codes:

```text
NOTION_CONFIG_MISSING
NOTION_UNAUTHORIZED
NOTION_FORBIDDEN
NOTION_NOT_FOUND
NOTION_RATE_LIMITED
NOTION_SCHEMA_MISMATCH
NOTION_API_ERROR
INVALID_PREVIEW_REQUEST
```

Map common Notion statuses:

- 401 → token invalid;
- 403 → connection lacks capability;
- 404 → data source not shared or ID incorrect;
- 429 → rate limited;
- other errors → generic safe message.

User-facing messages should identify the corrective action without exposing internal response bodies.

Example:

```text
Majors data source is not accessible. Check the data source ID and share the original database with the Notion connection.
```

A failure in one programme should not erase successful preview results for other programmes when partial results can be returned safely.

---

## 19. Security Requirements

- Keep the server bound to `127.0.0.1`.
- Notion requests run only on the server.
- Do not add a public deployment configuration.
- Never put secrets in `public/` files.
- Never send `NOTION_TOKEN` to the browser.
- Never log complete JANDI messages by default.
- Never log raw Notion responses containing unnecessary personal data.
- Sanitize error messages before returning them.
- Keep the existing request body size protection.
- Add a reasonable timeout to Notion calls.

---

## 20. Testing Requirements

Preserve all current tests.

Add tests for:

### Configuration

- detects missing Notion environment variables;
- does not reveal configured secret values;
- trims IDs.

### Schema validation

- accepts the required exact schema;
- reports missing properties;
- reports property-type mismatches;
- reports inaccessible related data sources cleanly.

### Agent repository

- zero match;
- one exact match;
- duplicate exact matches;
- pagination.

### Student repository

- strict base-name family matching;
- excludes similar but unrelated names;
- resolves Agent relation names;
- new-client suffix suggestion;
- existing-client auto-selection with one candidate;
- existing-client auto-selection with one requester-Agent match;
- unresolved ambiguity.

### University repository

- one exact match;
- missing;
- duplicate exact matches;
- case and whitespace defensive comparison.

### Major repository

- matches degree-less existing Major to an official programme with MSc;
- matches leading-degree official name to trailing-degree existing name;
- does not match the same normalized Major under a different University;
- reports duplicate matching Majors as ambiguous;
- returns the proposed trailing-degree name when missing;
- pagination.

### Work Log repository

- filters by Student and `입학 요강` category;
- maps plain and numbered titles;
- calculates `입학요강 1`, `2`, `3`, etc.;
- does not calculate for unresolved existing Student selection.

### API endpoints

- `/api/notion/schema` success and failure;
- `/api/notion/preview` validates input;
- preview response contains no raw token or raw SDK objects;
- Phase 2 performs no create/update/archive calls;
- Phase 1 extraction and filename endpoints still work when Notion is unconfigured.

Use fake Notion clients in unit tests. Do not require live Notion access for the normal test suite.

Optionally add a manually invoked integration test script that runs only when explicit live-test environment variables are present.

---

## 21. README Updates

Document:

1. Create a Notion internal connection in the work workspace.
2. Give it read access for Phase 2.
3. Share the original five databases/data sources with the connection.
4. Relation target databases must also be shared.
5. Copy each exact data source ID.
6. Copy `.env.example` to `.env`.
7. Add the token and five IDs.
8. Run `npm install`.
9. Run `npm test`.
10. Run `npm start`.
11. Open `http://127.0.0.1:3000`.
12. Use `Check Notion connection` before previewing matches.

Clarify that a 404 commonly means either an incorrect ID or that the database/data source was not shared with the connection.

---

## 22. Implementation Order

Implement in this order:

### Step 1 — Foundation

- add dependencies;
- load `.env`;
- add config validation;
- add Notion client factory;
- add error mapping;
- keep current app behavior unchanged.

### Step 2 — Schema check

- retrieve five data sources;
- validate exact property names and types;
- add `/api/notion/schema`;
- add connection status UI;
- add tests.

### Step 3 — Read repositories

- Agents;
- Students and related Agents;
- Universities;
- Majors and related Universities;
- Work Logs;
- pagination and page-value helpers;
- repository unit tests.

### Step 4 — Preview service

- add `notionPreviewService.js`;
- orchestrate all lookups;
- produce normalized response;
- calculate the real work-log title when possible;
- add endpoint tests.

### Step 5 — Frontend preview

- add preview button;
- render Agent, Student, University, Major, and Work Log results;
- handle client-mode switching;
- support manual existing-Student selection;
- retain editable filename workflow;
- retain disabled Phase 3 creation button.

### Step 6 — Verification

- run all tests;
- manually test with at least:
  - one new unique Student;
  - one new Student with same-name family;
  - one existing unique Student;
  - one existing ambiguous Student;
  - existing University and Major;
  - missing Major under existing University;
  - missing University;
  - same Major name under different Universities;
  - Agent missing or duplicated;
  - schema mismatch.

---

## 23. Explicit Non-Goals

Do not implement in Phase 2:

- creating Students;
- creating Universities;
- creating Majors;
- creating Work Log rows;
- updating any relation;
- renaming existing Majors;
- creating Agents;
- Word template generation;
- ZIP generation;
- replacing mocked extraction with a paid AI API;
- public hosting;
- login or multi-user support;
- automatic JANDI ingestion.

---

## 24. Phase 2 Definition of Done

Phase 2 is complete when:

1. The app starts and Phase 1 still works without Notion configuration.
2. A local `.env` can configure the work Notion workspace.
3. The app can verify all five data source schemas.
4. The app can preview the exact Agent match.
5. New-client mode shows the existing same-name family and the correct next suffix.
6. Existing-client mode lists and disambiguates candidates using Agent relations.
7. Universities are classified as existing, missing, or ambiguous.
8. Majors are matched by normalized subject plus University relation.
9. Degree position does not break Major matching.
10. Missing Majors show the correct proposed trailing-degree title.
11. Existing Student selection produces the correct next `입학 요강 N` title.
12. No Notion record is created, modified, archived, or deleted.
13. The disabled Phase 3 creation button remains disabled.
14. All existing and new automated tests pass.
15. The README contains exact Windows setup and Notion connection instructions.

---
