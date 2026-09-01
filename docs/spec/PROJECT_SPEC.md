# Admissions Guideline Local Web App — MVP Specification

## 1. Project Goal

Build a local-only web application that reduces the manual work required to process admissions guideline requests copied from JANDI.

The user will paste one complete JANDI request message into the app. The app will:

1. Extract the requester, request date/time, student name, university names, programme names, and programme URLs.
2. Let the user choose whether the student is a new or existing client.
3. Match or create the required Notion records across related databases.
4. Create one new page in the Work Log database.
5. Generate and display the required Word file name.
6. In a later phase, generate the Word file from the existing template.

The MVP must prioritize reliability, visible confirmation, and easy correction over full automation.

---

## 2. Deployment Model

Build this as a local-only web app.

Recommended stack:

- Node.js
- Express
- Vite
- Plain JavaScript or React
- Local server bound to `127.0.0.1`

The app should open in the browser, for example:

`http://127.0.0.1:3000`

Do not expose the server to the local network or the public internet.

Store secrets in a local `.env` file.

Required environment variables:

```env
OPENAI_API_KEY=
NOTION_TOKEN=
NOTION_WORK_LOG_DB_ID=
NOTION_STUDENTS_DB_ID=
NOTION_AGENTS_DB_ID=
NOTION_UNIVERSITIES_DB_ID=
NOTION_MAJORS_DB_ID=
```

Add `.env` to `.gitignore`.

---

## 3. User Workflow

### Step 1: Paste JANDI message

The user pastes the entire JANDI request message into a textarea.

Example:

```text
오유리
2026/06/17 PM 05:04
[업무요청] 설민희 입학요강
안녕하세요 @Marion Lee (정규감수)

설민희님 입학요강 정리 부탁드립니다.
영국학사 졸업자라 영국 기준으로 정리 부탁드려요

감사합니다!

🍀University of Warwick
- Medical Biotechnology and Business Management (MSc)
https://warwick.ac.uk/study/postgraduate/courses/msc-medical-biotechnology-business-management/

🍀University of Nottingham
- Immunology and Immunotherapeutics MSc
https://www.nottingham.ac.uk/pgstudy/course/taught/immunology-and-immunotherapeutics-msc
```

### Step 2: Analyze

The app sends the text to a low-cost AI model and requests structured JSON.

Required extracted fields:

```json
{
  "requesterName": "오유리",
  "requestDateTime": "2026-06-17T17:04:00+09:00",
  "studentName": "설민희",
  "programmes": [
    {
      "universityName": "University of Warwick",
      "programmeNameOriginal": "Medical Biotechnology and Business Management (MSc)",
      "programmeUrl": "https://..."
    }
  ]
}
```

Ignore greetings, tags, accreditation notes, prerequisite notes, intake notes, and other special instructions for the purpose of Notion registration and file-name generation.

### Step 3: Review and edit

Show all extracted fields in editable controls.

The user must be able to correct:

- Requester name
- Request date
- Student name
- University name
- Programme name
- Programme URL

No Notion write action should happen before this review step.

### Step 4: Choose client type

Display:

- New client — default
- Existing client

New client is the default because approximately 80% of requests are for new clients.

### Step 5: Match Notion records

The app queries Notion and shows what will be reused or created.

### Step 6: Confirm and create

The user clicks one final button:

`Create Notion records`

After success, show:

- Final Student display name
- Agent
- Universities used or created
- Majors used or created
- Work Log page title
- Deadline
- Final Word file name
- Copy button for the Word file name

---

## 4. Notion Database Structure

### 4.1 Work Log database

Purpose: show all work-related information in one place.

Current properties:

- 완료일 — Date
- 마감일 — Date
- Status — Rollup from Students DB
- Hours — Number
- Agent — Rollup from Students DB
- Students — Relation to Students DB
- University — Rollup from Majors DB
- Major — Relation to Majors DB
- 작업내용 — Title / Name
- Category — Select
- 학과 링크 — Formula
- 요청 시즌 — Select

The app directly writes:

- 작업내용
- 마감일
- Category
- 요청 시즌, if Notion automation does not apply to API-created pages
- Students relation
- Major relation

The app does not directly write:

- Status
- Agent
- University
- 학과 링크

Those are derived by rollup or formula.

### 4.2 Students database

Properties used by the app:

- Name — Title
- Agent DB — Relation to Agents DB

The app frequently creates new Student records.

### 4.3 Agents database

Properties used by the app:

- Name — Title

Agents are rarely created.

For MVP:

- Search by requester name.
- If exactly one Agent is found, use it.
- If no Agent is found, stop and show an error.
- Do not auto-create an Agent in MVP.
- If more than one Agent is found, require user selection.

### 4.4 Universities database

Properties used by the app:

- Name — Title

The app may create a new University when no exact normalized match exists.

### 4.5 Majors database

Properties used by the app:

- Name — Title
- Universities DB — Relation to Universities DB

The app frequently creates new Major records.

---

## 5. Student Matching Rules

### 5.1 New client

Search the Students DB for the base name and suffixed variants.

Example base name:

`김민지`

Possible existing values:

```text
김민지
김민지 B
김민지 C
김민지 D
```

Rules:

- If no matching name family exists, create `김민지`.
- If matching names exist, create the next alphabetic suffix.
- Existing suffix gaps should not be reused.
- Use the highest existing suffix and advance by one.

Examples:

```text
Existing: 김민지
New: 김민지 B
```

```text
Existing: 김민지, 김민지 B, 김민지 D
New: 김민지 E
```

The newly created Student must be connected to the Agent found from the JANDI requester name.

### 5.2 Existing client

Search the same Student name family.

Display all candidates with Agent information.

Example:

```text
김민지 — Agent: 오유리
김민지 B — Agent: 박수진
김민지 C — Agent: 오유리
```

Matching behavior:

- If only one candidate matches the requester Agent, preselect it.
- If multiple candidates match, require manual selection.
- If no candidate matches the requester Agent, show all candidates and require manual selection.
- Never choose an existing client silently when more than one plausible record exists.

The final Student display name must also be used in the Word file name.

---

## 6. Deadline Rule

The deadline is two weekdays after the request date.

Exclude Saturday and Sunday.

Examples:

- Monday → Wednesday
- Tuesday → Thursday
- Wednesday → Friday
- Thursday → Monday
- Friday → Tuesday

MVP does not need Korean public-holiday handling.

Use the request date extracted from JANDI, not the current system date.

---

## 7. Category, Season, and Work Log Title

### Category

Always set:

`입학 요강`

### Request season

Use:

`2026/27`

The existing Notion database may already apply this automatically to newly created pages.

Implementation rule:

1. First test whether API-created pages receive the default automatically.
2. If not, explicitly write `2026/27` from the app.

### Work Log title

Use sequential numbering per Student.

Examples:

```text
입학요강 1
입학요강 2
입학요강 3
```

Before creating the new Work Log page, query existing Work Log pages where:

- Students relation contains the selected Student
- Category equals `입학 요강`

Count all matching pages.

If old pages are titled simply `입학요강`, they still count as one existing admissions-guideline task.

New title rule:

`입학요강 {existing count + 1}`

---

## 8. University Matching Rules

Normalize for comparison only:

- Trim leading and trailing spaces
- Collapse repeated spaces
- Compare case-insensitively

Prefer exact normalized matching.

If no match exists, create a new University using the reviewed university name from the JANDI request.

Do not automatically merge similar but different university names.

---

## 9. Major Matching and Naming Rules

A Major is identified by both:

- Normalized programme subject name
- University relation

Do not match by programme name alone because the same programme name can exist at several universities.

### 9.1 Degree labels to recognize

Initial list:

```text
MSc
MA
MRes
MBA
MPH
MEd
LLM
MEng
MArch
MFA
MMus
MPhil
PGDip
PGCert
```

Keep this list centralized in one configuration file so it can be expanded later.

### 9.2 Search normalization

For matching existing Majors, remove degree labels regardless of whether they appear:

- At the beginning
- At the end
- In parentheses at the end

Examples that must share the same comparison key:

```text
MSc Medical Biotechnology and Business Management
Medical Biotechnology and Business Management MSc
Medical Biotechnology and Business Management (MSc)
Medical Biotechnology and Business Management
```

Comparison key:

`medical biotechnology and business management`

Also normalize:

- Case
- Repeated spaces
- Leading and trailing spaces

### 9.3 Existing Major behavior

If a Major with the same normalized subject key is already connected to the same University, reuse it.

Do not rename existing Major pages automatically.

### 9.4 New Major naming

When creating a new Major, include the degree label.

Preferred format:

`Programme Subject + space + Degree Label`

Examples:

```text
MSc Biomedical Sciences with Bioenterprise
→ Biomedical Sciences with Bioenterprise MSc
```

```text
MA Educational Leadership
→ Educational Leadership MA
```

Accepted source forms that already have the degree at the end:

```text
Medical Biotechnology and Business Management MSc
Medical Biotechnology and Business Management (MSc)
```

If the written programme name omits a degree label, inspect only standalone
recognized degree tokens in the programme URL path. A single token such as
`-msc/` or `-ma-` may supply the trailing degree label for the proposed Notion
Major name while `programmeNameOriginal` remains unchanged. Do not infer a
degree from query parameters, partial words, or generic `master` wording.

If the written name and URL degree conflict, the URL contains multiple degree
tokens, or neither source contains a recognized degree, require manual review
instead of choosing a degree automatically.

Creation behavior:

- If the degree label appears at the beginning, move it to the end.
- If it already appears at the end without parentheses, keep it.
- If it appears at the end in parentheses, it may be kept as-is for MVP, but prefer the no-parentheses form when generating a normalized new name.
- If no degree label can be identified, use the reviewed programme name unchanged.
- If the degree format is complex or ambiguous, show the proposed Major name as editable before creation.

Examples requiring manual review rather than aggressive normalization:

```text
MSc by Research
MSc/PGDip
Integrated Masters
```

### 9.5 Keep three separate values

For each programme, maintain:

```json
{
  "programmeNameOriginal": "MSc Medical Biotechnology and Business Management",
  "majorSearchKey": "medical biotechnology and business management",
  "notionMajorNameProposed": "Medical Biotechnology and Business Management MSc"
}
```

Use:

- `programmeNameOriginal` for future Word document generation
- `majorSearchKey` for matching
- `notionMajorNameProposed` for creating a new Major

---

## 10. Programme Label and Word File Name

The app does not need to generate the Word file in the first MVP.

It must generate the final file name.

Required format:

```text
[2026입학요강] StudentName님_Programme Label.docx
```

Use the final Student display name, including suffixes such as `B`, `C`, or `D`.

Example:

```text
[2026입학요강] 김민지 D님_Biomedical Sciences.docx
```

### Programme Label rules

Compare all extracted programme names.

- If a meaningful subject phrase appears in at least two programme names, use that shared phrase.
- Exclude degree labels such as MSc or MA when choosing a shared phrase.
- If no meaningful subject phrase is shared by at least two programme names, use the first listed programme name as the label.

The generated file name must be editable before copying.

Provide a one-click copy button.

### Future Word-generation phase

A future phase may use the existing template:

`[2026입학요강] Template.docx`

The existing template structure, tables, formatting, highlighting, logo, and layout must be preserved.

One Word file is created per JANDI request, not one file per programme.

The main admissions table is duplicated once per programme within the same document.

Do not implement full Word generation until the Notion workflow and file-name generation are stable.

---

## 11. AI Extraction Requirements

Use one API request per pasted JANDI message.

Prefer a low-cost model with structured output / JSON schema support.

The AI must only extract data. It must not perform Notion actions directly.

Required schema:

```json
{
  "requesterName": "string",
  "requestDateTime": "ISO-8601 datetime with timezone",
  "studentName": "string",
  "programmes": [
    {
      "universityName": "string",
      "programmeNameOriginal": "string",
      "programmeUrl": "string"
    }
  ]
}
```

Validation rules:

- Student name is required.
- Requester name is required.
- Request date is required.
- At least one programme is required.
- Every programme requires university name, programme name, and URL.
- Do not proceed to Notion matching if validation fails.

Show clear field-level errors and allow manual correction.

---

## 12. Notion API Behavior

Use Notion page IDs for all relations.

General pattern:

1. Query existing page.
2. If found, store its page ID.
3. If not found and creation is allowed, create it.
4. Store the newly created page ID.
5. Use that page ID in downstream relations.

Never keep separate downstream logic for “found page ID” and “new page ID.” Normalize both into one common variable.

Example:

```js
const pageId = existingPage?.id ?? newlyCreatedPage.id;
```

The Notion integration must be shared with all five databases:

- Work Log
- Students
- Agents
- Universities
- Majors

Do not depend on the user's ChatGPT Notion connection. The app uses its own Notion internal integration token.

Before writing data, fetch each database schema and verify exact property names and property types.

Property names must be configurable rather than scattered through the code.

Suggested configuration object:

```js
const notionSchema = {
  workLog: {
    title: "작업내용",
    deadline: "마감일",
    category: "Category",
    season: "요청 시즌",
    studentsRelation: "Students",
    majorsRelation: "Major"
  },
  students: {
    title: "Name",
    agentRelation: "Agent DB"
  },
  agents: {
    title: "Name"
  },
  universities: {
    title: "Name"
  },
  majors: {
    title: "Name",
    universityRelation: "Universities DB"
  }
};
```

The actual property names must be confirmed against the user's workspace before final implementation.

---

## 13. Error Handling

The app must stop before writing partial data when a required decision is unresolved.

Block creation when:

- AI extraction validation fails
- Agent is missing
- Multiple Agents match and none is selected
- Existing-client selection is ambiguous
- A programme is missing university, name, or URL
- Proposed Major normalization is ambiguous and not reviewed
- Required Notion database schema does not match configuration

For multi-step Notion writes, log every created page ID.

If an error occurs after partial creation:

- Show exactly which records were already created.
- Do not silently retry creation.
- Provide a retry action that reuses already created IDs where possible.

Prevent accidental duplicate submissions:

- Disable the final button while processing.
- Generate an idempotency fingerprint from student, requester, request date, and programme URLs.
- Warn if the same request appears to have been processed before.

---

## 14. MVP Interface

### Section A: JANDI input

- Large textarea
- Analyze button
- Clear button

### Section B: Extracted request

Editable fields:

- Requester
- Request date/time
- Student base name
- Programme list

Programme rows must support:

- Edit
- Remove
- Add another programme

### Section C: Student mode

- New client — default
- Existing client

Show Student matching results.

### Section D: Notion preview

Show status for each entity:

```text
Agent: existing
Student: will create as 김민지 D
University of Warwick: existing
Medical Biotechnology and Business Management MSc: will create
```

Allow editing of proposed new Student and Major names before creation.

### Section E: Final output

Show:

- Work Log title
- Deadline
- Category
- Request season
- Final Word file name

Buttons:

- Create Notion records
- Copy file name

Do not combine AI analysis and Notion creation into a single button.

---

## 15. Recommended Implementation Phases

### Phase 1 — Local shell and extraction

Implement:

- Local app startup
- JANDI textarea
- AI structured extraction
- Editable review form
- Programme Label generation
- Final Word file-name generation
- Copy button

No Notion writes yet.

### Phase 2 — Read-only Notion matching

Implement:

- Database schema checks
- Agent lookup
- Student-family lookup
- University lookup
- Major lookup using University + normalized subject key
- Work Log count lookup
- Preview only

No creation yet.

### Phase 3 — Notion creation

Implement:

- New Student creation and Agent relation
- New University creation
- New Major creation and University relation
- Work Log creation
- Sequential title generation
- Deadline and Category
- Request season fallback

### Phase 4 — Reliability

Implement:

- Duplicate request detection
- Partial-failure reporting
- Retry behavior
- Local execution logs
- Clear user-facing errors

### Phase 5 — Word template generation

Only after the Notion workflow is stable:

- Load `[2026입학요강] Template.docx`
- Preserve existing formatting
- Duplicate the main table once per programme
- Insert university, programme, and URL
- Update header
- Save one DOCX file with the generated Korean filename
- Optionally place it inside an English-named ZIP

---

## 16. Non-Goals for MVP

Do not implement:

- Automatic JANDI integration
- Browser extension
- JANDI desktop-app scraping
- Public internet deployment
- User accounts
- Multi-user support
- University website research
- Admissions requirement extraction
- Automatic table completion in Word
- Google Sheets updates
- PDF generation
- Korean public-holiday deadline handling

---

## 17. Codex Working Instructions

1. Read this document before writing code.
2. Build the project incrementally by phase.
3. Do not change the user's Notion database structure.
4. Keep all Notion property names and database IDs in configuration files.
5. Do not hard-code API keys.
6. Do not expose the local server beyond `127.0.0.1`.
7. Add clear comments around matching and normalization rules.
8. Add unit tests for:
   - Student suffix generation
   - Weekday deadline calculation
   - Degree-label removal
   - Degree-label movement to the end
   - Programme Label generation
   - Work Log sequential numbering
9. Use mocked Notion responses until the user supplies the real integration token and database IDs.
10. After each phase, provide exact local test steps before continuing.

Start with Phase 1 only.
