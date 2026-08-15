# Admission Guidelines Automation Phase 1-2 Handoff

## Purpose

이 문서는 과거 채팅과 폴더명 변경으로 분리된 Phase 1·2 작업을 현재 유지할 canonical 프로젝트로 연결하는 기준 문서다.

현재 canonical 프로젝트 경로:

```text
C:\Users\Marion\Documents\Projects\jd-to-notion
```

기존 Codex 채팅이 예전 폴더명을 working directory로 기억하면 경로를 찾지 못할 수 있다. 기존 채팅과 예전 폴더는 참고용 archive로 보존하고, 이후 개발은 이 canonical 프로젝트와 새 Codex 채팅에서 이어간다.

## Project Status

현재 상태는 Phase 2 완료 상태다.

- Phase 1: local-only 입력, mocked extraction, review form, normalization, deadline, filename generation 완료
- Phase 2: Notion data-source read-only connection, schema check, Agent/Student/University/Major/Work Log preview 완료
- Phase 3: Notion record write 미착수
- Phase 4: duplicate/partial failure/retry 안정성 작업 미착수
- Phase 5: Word template generation 미착수

Phase 2는 Notion page를 create, update, archive, delete하지 않는다. `Create Notion records - Phase 3` 버튼도 비활성 상태를 유지한다.

## Phase 1 Summary

Phase 1은 JANDI 메시지를 붙여넣어 검토 가능한 구조화 데이터와 Word 파일명을 만드는 local-only MVP다.

완료된 범위:

- Node.js ESM local web app
- 서버 `127.0.0.1` 바인딩
- JANDI 전문 붙여넣기와 mocked structured extraction
- requester, request date/time, student name, university, programme, URL editable review
- programme 추가/삭제
- degree label normalization
- major search key와 proposed Notion Major name 생성
- Programme Label 생성
- weekday deadline 계산
- Word filename 생성과 copy button
- New client / Existing client UI
- Notion preview UI
- `님`이 붙은 학생명 정리
- 학과명과 URL이 같은 줄인 입력 처리
- 대학명과 학과명이 하이픈으로 연결된 입력 처리
- 학교명이 생략된 후속 학과의 이전 대학명 상속
- 한국어 학교명과 약칭을 위한 `data/universityAliases.csv` 연결

## Phase 2 Summary

Phase 2는 실제 Notion 매칭 결과를 먼저 확인하는 read-only 단계다.

완료된 범위:

- Notion data-source connection check
- Work Log, Students, Agents, Universities, Majors 접근성 확인
- data source schema/property validation
- requester 이름 기반 exact Agent preview
- strict Student same-name family preview와 suffix suggestion
- 기존 Student 후보의 Agent relation 표시와 자동 선택/수동 선택
- University exact normalized match, missing, ambiguous 분류
- Major normalized subject key와 University relation을 함께 사용하는 match
- degree 위치가 다른 Major 제목의 동일성 처리
- 기존 Student 선택 시 실제 Work Log sequential numbering preview
- `GET /api/notion/schema`
- `POST /api/notion/preview`
- `POST /api/notion/work-log-title`
- Notion connection status와 read-only preview UI
- Phase 3 create button disabled 상태 유지

## Phase 2 Implementation Details

Notion 구현은 `src/server/notion/` 아래에 분리되어 있다.

주요 모듈:

- `client.js`: `Notion-Version: 2026-03-11`, server-side client factory와 timeout
- `config.js`: `NOTION_TOKEN`과 다섯 data source ID 검증
- `errors.js`: 401, 403, 404, 429 및 안전한 browser-facing error mapping
- `schema.js`: 다섯 data source의 required property/type 검증
- `pagination.js`: cursor pagination
- `pageValues.js`: title, relation, select, rollup, page URL 추출
- `notionPreviewService.js`: Agent, Student, University, Major, Work Log preview orchestration
- `repositories/`: 각 data source별 read-only repository

현재 API는 deprecated `databases.query(...)`를 사용하지 않고 `dataSources.retrieve(...)`, `dataSources.query(...)`를 사용한다. 테스트는 fake Notion client를 사용하며 Phase 2 코드에는 Notion write 호출이 없다.

## Environment Variables

실제 값은 로컬 `.env`에만 넣고 `.env.example`에는 빈 템플릿만 유지한다.

```text
NOTION_TOKEN=
NOTION_WORK_LOG_DATA_SOURCE_ID=
NOTION_STUDENTS_DATA_SOURCE_ID=
NOTION_AGENTS_DATA_SOURCE_ID=
NOTION_UNIVERSITIES_DATA_SOURCE_ID=
NOTION_MAJORS_DATA_SOURCE_ID=
```

`.env`는 Git 제외 대상이다. 토큰은 browser JavaScript나 오류 응답에 포함하지 않는다.

## Live Notion Schema Status

라이브 workspace에서 확인된 data source title은 다음과 같다.

- Work Log: `작업 일지`
- Students: `Students`
- Agents: `Agents`
- Universities: `Universities`
- Majors: `Majors`

Phase 2에서 사용하는 라이브 property 이름은 다음 기준으로 관리한다.

주의: 초기 Phase 2 사양에는 `Agent DB`와 `Universities DB`라는 명칭이 남아 있지만, 현재 live workspace와 canonical 코드의 기준은 `Agent`와 `University`다. 실제 workspace schema가 바뀌지 않는 한 이 현재 기준을 유지한다.

| Data source | Property | Type | Use |
|---|---|---|---|
| Work Log | `작업 내용` | title | 기존 Work Log title |
| Work Log | `Major` | relation | Major relation |
| Work Log | `마감일` | date | schema check |
| Work Log | `Category` | select | admissions guideline filter |
| Work Log | `요청 시즌` | select | preview |
| Work Log | `Students` | relation | Student relation |
| Students | `Name` | title | Student name |
| Students | `Agent` | relation | Agent display/disambiguation |
| Agents | `Name` | title | exact requester match |
| Universities | `Name` | title | exact university match |
| Majors | `Name` | title | normalized Major match |
| Majors | `University` | relation | correct University validation |

과거 Work Log에는 `Major `처럼 끝에 공백이 있는 속성명이 관찰됐다. 운영 schema를 `Major`로 정리한 뒤 로컬 코드와 일치시키는 것이 기준이다. 이 rename이 아직 완료되지 않은 workspace에서는 `Check connection`이 schema mismatch를 반환할 수 있다.

## University Alias Data

학교명은 JANDI 원문과 Notion 저장명을 분리한다.

- `rawUniversityName`: JANDI에 실제로 적힌 학교명
- `universityName`: Notion Universities data source에 매칭할 이름

CSV 위치:

```text
data/universityAliases.csv
```

운영 규칙:

- alias가 비어 있으면 `notionName` 자체를 기본 alias로 사용한다.
- 한국어 학교명, 약칭, 공식 영문명을 여러 행으로 추가할 수 있다.
- `notionName`은 Notion Universities data source의 실제 title과 맞춘다.
- `domain`은 URL 기반 보조 매칭에만 사용한다.
- CSV를 수정한 뒤에는 local server를 재시작한다.

## Key Decisions

### Local-only

학생 정보와 업무 요청이 포함되므로 공개 배포하지 않는다. 서버는 계속 `127.0.0.1`에만 바인딩한다.

### Review before match

AI/mock extraction 결과는 확정값이 아니다. review form에서 수정하고 확인한 뒤에만 Notion preview를 실행한다.

### Read-only before write

Phase 2에서 실제 Notion 매칭 결과를 먼저 확인한다. Phase 3에서만 create 작업을 별도로 설계한다.

### One Major, one Work Log

> 2026-07-25 정정: 아래 규칙은 live Work Log 193개를 읽기 전용으로 확인한 결과에 따라 확정했다.

여러 학과가 한 JANDI 요청에 포함되면 학과마다 Work Log를 하나씩 만든다. 각 Work Log는 Student relation 한 개와 Major relation 한 개만 연결하며, 제목은 학생 기준 `입학 요강 N` 순번을 이어간다.

### Preserve raw names

JANDI 원문 학교명은 보존하고, Notion 매칭용 이름만 alias resolver로 바꾼다.

## Current Important Files

- `README.md`: 실행 방법, Notion 연결, Phase 2 운영 주의사항
- `data/universityAliases.csv`: 학교 alias와 Notion명 매핑
- `src/server/extraction/mockExtractor.js`: mocked extraction과 실제 복붙 변형 처리
- `src/server/universities/universityAliases.js`: 학교 alias resolver
- `src/server/server.js`: local server와 API routes
- `src/server/notion/client.js`: current Notion API client
- `src/server/notion/config.js`: environment validation
- `src/server/notion/schema.js`: live property/type validation
- `src/server/notion/notionPreviewService.js`: preview orchestration
- `src/server/notion/repositories/`: read-only repositories
- `src/shared/normalization.js`: degree/student/name normalization
- `src/shared/filename.js`: Programme Label과 Word filename
- `test/rules.test.js`: Phase 1 business rule tests
- `test/server.test.js`: local API와 extraction tests
- `test/notion*.test.js`: Phase 2 config, schema, repository, service, endpoint tests
- `docs/devlog/`: 날짜별 작업 기록

## Verification

현재 canonical 프로젝트에서 마지막으로 확인된 결과:

```text
47 tests passed
0 failed
```

실행 명령:

```powershell
cd "C:\Users\Marion\Documents\Projects\jd-to-notion"
npm install
npm test
npm start
```

브라우저 주소:

```text
http://127.0.0.1:3000
```

라이브 Notion 테스트는 실제 `.env`, connection 공유 권한, live property name 상태에 의존한다. `Check connection`이 `Connected and schema valid`를 반환한 뒤 `Preview Notion matches`를 실행한다.

## Known Limitations

- AI extraction은 아직 mocked data다.
- Notion create/update/archive/delete는 아직 없다.
- Phase 2의 실제 연결 상태는 로컬 `.env`와 Notion 공유 권한에 의존한다.
- Work Log `Major ` trailing-space rename이 완료되지 않은 workspace는 `Major` 기준 코드와 schema mismatch가 날 수 있다.
- public holidays는 deadline 계산에 반영하지 않는다.
- 기존 Codex 채팅이 예전 폴더명을 기억하면 working directory missing이 표시될 수 있다.
- 현재 프로젝트의 `.git` 상태와 GitHub 백업은 별도 확인이 필요하다.

## Recommended Next Step

새 Codex 채팅의 working directory를 canonical 프로젝트 폴더로 지정하고 이 문서를 먼저 읽는다.

다음 구현 순서:

1. 라이브 schema와 read-only matching 상태 재확인
2. Phase 3 Notion write 설계 확정
3. Student, University, Major create와 relation 연결
4. Work Log create와 sequential title 처리
5. duplicate fingerprint와 partial failure reporting 추가
6. 충분한 read-only 검증 후에만 실제 write button 활성화

기존 Phase 1/2 채팅과 예전 프로젝트는 삭제하지 않고 archive로 남긴다. 이 handoff 문서가 새 채팅과 과거 작업을 연결하는 기준 문서다.
