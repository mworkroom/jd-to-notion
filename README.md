# Admissions Guideline Local Web App

Local-only app for reviewing a pasted JANDI admissions-guideline request, matching Notion records, creating the required Student/University/Major/Work Log pages, and generating the final Word document.

## Current Phase

Implemented:

- Local web app shell bound to `127.0.0.1`
- JANDI message input
- Mocked structured extraction
- Editable extracted-request review form
- Read-only Notion connection check with the current data-source API
- Read-only Notion preview for Agents, Students, Universities, Majors, and Work Log numbering
- Existing-Major degree-name omission warnings
- Final create/reuse plan with explicit confirmation
- Notion create workflow in Student → University → Major → one Work Log per Major order
- SHA-256 duplicate-request protection and ID-only partial-failure journal
- Numbered Work Log title finalization and saved-value verification
- Programme label generation
- Final Word filename generation
- One-click filename copy button
- Template-preserving Word generation with independent status and create endpoints
- Streamlined Notion preflight and one-click Word generation
- SHA-256 template validation, non-overwriting numbered saves, and atomic publication
- Automatic Desktop work-folder creation using `학생명_Programme Label`
- Automated tests for extraction, matching, creation, recovery, Word OOXML preservation, and endpoint gates

Not implemented yet:

- Public deployment

The app is local-only and binds to `127.0.0.1`. Notion creation becomes available only after the schema check, a fresh preview, all required selections, and explicit confirmation. Existing Notion pages are not modified; the only update exception is reapplying and verifying the numbered title on a Work Log created by the current request.

## Windows Setup

1. Install Node.js 20 or newer from `https://nodejs.org/`.
2. Open PowerShell.
3. Go to the project folder:

   ```powershell
   cd "C:\Users\Marion\Documents\Projects\admission-guidelines-automation"
   ```

4. Install dependencies:

   ```powershell
   npm install
   ```

5. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

6. Add the local Notion values to `.env`:

   ```text
   NOTION_TOKEN=
   NOTION_WORK_LOG_DATA_SOURCE_ID=
   NOTION_STUDENTS_DATA_SOURCE_ID=
   NOTION_AGENTS_DATA_SOURCE_ID=
   NOTION_UNIVERSITIES_DATA_SOURCE_ID=
   NOTION_MAJORS_DATA_SOURCE_ID=
   NOTION_CREATION_ENABLED=true
   WORD_GENERATION_ENABLED=false
   WORD_TEMPLATE_PATH=C:\Users\Marion\Documents\Custom Office Templates\[2026입학요강] 자동생성용.docx
   WORD_TEMPLATE_SHA256=
   WORD_OUTPUT_DIR=C:\Users\Marion\Desktop
   ```

   Extraction and filename generation still work when the Notion values are blank. Set `NOTION_CREATION_ENABLED=false` to disable all create requests at the server.
   Keep `WORD_GENERATION_ENABLED=false` until the generated DOCX has been visually approved in Microsoft Word. Calculate the source template's exact SHA-256, copy it into `WORD_TEMPLATE_SHA256`, then restart the server before testing Word generation.

7. Run the unit tests:

   ```powershell
   npm test
   ```

8. Start the local app:

   ```powershell
   npm start
   ```

9. Open the app:

   ```text
   http://127.0.0.1:3000
   ```

The server binds to `127.0.0.1` only.

## Word Generation Setup

1. Keep the source template at:

   ```text
   C:\Users\Marion\Documents\Custom Office Templates\[2026입학요강] 자동생성용.docx
   ```

2. Confirm the template contains each header marker exactly once:

   ```text
   [[DEGREE_PREFIX]]
   [[PROGRAMME_LABEL]]
   [[STUDENT_NAME]]
   ```

3. Confirm the body prototype contains `[[UNIVERSITY]]`, `[[PROGRAMME]]`, and `[[URL]]` exactly once, followed by one admissions table and one fixed SOP/reference area.
4. Calculate the template SHA-256 and put it in `WORD_TEMPLATE_SHA256`:

   ```powershell
   (Get-FileHash -LiteralPath "C:\Users\Marion\Documents\Custom Office Templates\[2026입학요강] 자동생성용.docx" -Algorithm SHA256).Hash.ToLower()
   ```
5. Restart the server. Template status is checked automatically when the Word section opens.
6. Complete the read-only Notion preview, confirm the final Student and Major names, choose `석사` or `학사`, review the automatically rendered Word summary, and click `Word 파일 만들기`.
7. After Microsoft Word visual approval, set `WORD_GENERATION_ENABLED=true` and restart the server.

Word generation does not require a successful Notion create request. It copies the source DOCX, changes only `word/header1.xml` and `word/document.xml`, keeps the fixed SOP/reference area once, saves to `WORD_OUTPUT_DIR`, and never opens Word automatically. The same action also creates or reuses a sibling work folder named `학생명_Programme Label`; the DOCX remains directly in `WORD_OUTPUT_DIR`, matching the previous Word macro workflow.

### Windows double-click startup

After the initial setup, double-click `Admission Helper 실행.vbs` in the project
folder. The launcher:

- opens the app immediately when its local server is already running;
- starts the server in the background when it is stopped;
- waits until the server is ready, then opens the browser;
- refuses to start a duplicate server when port 3000 belongs to another app.

Background server output is stored in `.local/app-server.log` and
`.local/app-server-error.log`. The `.local` directory is excluded from Git.

## Notion Setup

1. In the work Notion workspace, create a Notion internal connection.
2. Give the connection read and insert/update-content access for the five data sources.
3. Share the original five databases/data sources with the connection:
   - Work Log
   - Students
   - Agents
   - Universities
   - Majors
4. Share relation target databases with the same connection as well.
5. Confirm the relation property names match the Phase 2 schema exactly:
   - Students relation to Agents: `Agent`
   - Majors relation to Universities: `University`
6. Confirm the Work Log properties are `작업 내용`, `Students`, `Major`, `마감일`, `Category`, and `요청 시즌`.
7. Copy each exact data source ID, not a deprecated database ID.
8. Paste the token and five data source IDs into `.env`.
9. Restart the local app after editing `.env`.
10. Open `http://127.0.0.1:3000`.
11. Click `Notion 항목 확인` in `Notion 생성 미리보기`.
12. The app checks the connection and schema automatically before previewing matches.

A Notion 404 usually means either the ID is incorrect or the original database/data source has not been shared with the connection.

## Notion Implementation Notes

The server uses the current Notion data-source API with `Notion-Version: 2026-03-11`.

```text
GET  /api/notion/schema
POST /api/notion/preview
POST /api/notion/work-log-title
POST /api/notion/create
```

Notion SDK calls are isolated under `src/server/notion/`. The repositories use cursor pagination and automated tests use fake Notion clients. Creation is create-only except for the title-only finalization of Work Logs created by the same request. No archive or delete API is used.

The live workspace uses `Agent` on Students, `University` on Majors, and exact Work Log Category option `입학 요강`.
## Local Test Steps

1. Paste one complete JANDI message into the textarea.
2. Click `Analyze`.
3. Confirm the editable fields show requester, request date/time, student name, university, programme name, and URL.
4. Edit any extracted value and confirm the derived fields update.
5. Select `New client` or `Existing client`.
6. Click `Notion 항목 확인`; the connection/schema preflight and read-only item lookup run together.
7. Confirm the 담당자, 학생, 대학, 학과, and 작업 일지 plan. Existing Major degree omissions appear as warnings but do not change the existing page.
8. Confirm the final filename follows:

   ```text
   [2026입학요강] 학생명님_Programme Label.docx
   ```

9. Confirm every newly created Major name with its checkbox.
10. Click `Notion에 기록 생성` and review the final browser confirmation.
11. After creation, open the returned links and confirm each Work Log has one Student and one Major.
12. If a Word file is needed, choose the degree, review the automatic summary, and click `Word 파일 만들기`.
13. Click `Copy file name` only when the filename text is needed separately.

## JANDI to app import with AutoHotkey

The browser app accepts an automated JANDI import without requiring text selection:

1. Start the local app with `npm start` and open `http://127.0.0.1:3000`.
2. Open `automation/jandi-to-admissions.ahk` with AutoHotkey v2.
3. Configure the macro-keyboard key to send `Ctrl + Alt + Shift + F12`.
4. In JANDI, place the mouse over the target message and press the macro key.
5. The script first reads the hovered message from JANDI's Electron renderer through the local DevTools port, then activates the app, focuses the JANDI input, and pastes the sender, date, body, and links.
6. If DOM extraction is unavailable, the script falls back to JANDI's manual `⋯` → `Copy` flow and continues automatically after the clipboard changes.
7. The browser app starts `Analyze` automatically after the paste.
8. For an SOP request, the app arms a two-minute watcher for the `.docx` attachment names found in that same message.
9. Return to JANDI and download the SOP Word attachment. After the download finishes, the app moves the confirmed student name to the front of the filename and shows the result in the SOP review area.

Examples:

```text
SOP_1차_0731.docx                    → 은주하_SOP_1차_0731.docx
Personal essay 최최종본_은주하.docx → 은주하_Personal essay 최최종본.docx
Personal essay 최종(은주하).docx    → 은주하_Personal essay 최종.docx
SOP_오지석_초안.docx                → 오지석_SOP_초안.docx
```

The watcher ignores unrelated Word files and temporary downloads. It never overwrites an existing normalized file; filename collisions use ` (2)`, ` (3)`, and so on. Set `JANDI_DOWNLOAD_DIR` in `.env` only when JANDI saves files somewhere other than the Windows `Downloads` folder.

The app-side import contract is intentionally browser-native: a paste event supplies the raw message to the existing analysis flow. A future Tauri shell can replace only the clipboard/activation adapter while reusing the same input, parser, and review UI.

The script assumes the browser window title contains `Admissions Guideline Helper`. If the title is changed, update `appWindowTitle` in the `.ahk` file. JANDI must be launched with `--remote-debugging-port=9222` for the DOM-first path. The macro trigger (`F12`) and app focus shortcut (`F11`) are intentionally different.
