# Admissions Guideline Local Web App

Local-only app for reviewing a pasted JANDI admissions-guideline request, matching Notion records, creating the required Student/University/Major/Work Log pages, and generating the final Word filename.

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
- Automated tests for extraction, matching, creation, recovery, and endpoint gates

Not implemented yet:

- Word document generation
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
   ```

   Extraction and filename generation still work when the Notion values are blank. Set `NOTION_CREATION_ENABLED=false` to disable all create requests at the server.

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
11. Click `연결 및 스키마 확인` in `Notion 생성 미리보기`.
12. Confirm the status says `연결 및 스키마 정상` before previewing matches.

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
6. Click `연결 및 스키마 확인`.
7. Click `Notion 항목 다시 조회`.
8. Confirm the 담당자, 학생, 대학, 학과, and 작업 일지 plan. Existing Major degree omissions appear as warnings but do not change the existing page.
9. Confirm the final filename follows:

   ```text
   [2026입학요강] 학생명님_Programme Label.docx
   ```

10. Confirm every newly created Major name with its checkbox.
11. Click `Notion에 기록 생성` and review the final browser confirmation.
12. After creation, open the returned links and confirm each Work Log has one Student and one Major.
13. Click `Copy file name` when the Word filename is needed.

## JANDI to app import with AutoHotkey

The browser app accepts an automated JANDI import without requiring text selection:

1. Start the local app with `npm start` and open `http://127.0.0.1:3000`.
2. Open `automation/jandi-to-admissions.ahk` with AutoHotkey v2.
3. Configure the macro-keyboard key to send `Ctrl + Alt + Shift + F12`.
4. In JANDI, place the mouse over the target message and press the macro key.
5. The script first reads the hovered message from JANDI's Electron renderer through the local DevTools port, then activates the app, focuses the JANDI input, and pastes the sender, date, body, and links.
6. If DOM extraction is unavailable, the script falls back to JANDI's manual `⋯` → `Copy` flow and continues automatically after the clipboard changes.
7. The browser app starts `Analyze` automatically after the paste.

The app-side import contract is intentionally browser-native: a paste event supplies the raw message to the existing analysis flow. A future Tauri shell can replace only the clipboard/activation adapter while reusing the same input, parser, and review UI.

The script assumes the browser window title contains `Admissions Guideline Helper`. If the title is changed, update `appWindowTitle` in the `.ahk` file. JANDI must be launched with `--remote-debugging-port=9222` for the DOM-first path. The macro trigger (`F12`) and app focus shortcut (`F11`) are intentionally different.
