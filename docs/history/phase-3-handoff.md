# Phase 3 Handoff — Notion General Use

- 완료일: 2026-07-25
- 상태: 일반 사용 활성화
- 기준 브랜치: `main`

## 완료된 흐름

```text
JANDI 입력
→ 추출값 검토
→ 신규/기존 학생 선택
→ Notion 연결 및 schema 확인
→ Agent·Student·University·Major 읽기 전용 preview
→ 새 Major 이름 확인
→ 최종 create/reuse 계획 확인
→ browser confirm
→ Student → University → Major → 학과별 Work Log 생성
→ Work Log 번호 제목 재적용 및 저장 검증
→ 생성 결과 링크 표시
```

## 운영 규칙

- Work Log는 고유 Major 하나당 하나를 만든다.
- 각 Work Log는 Student relation 한 개와 Major relation 한 개를 갖는다.
- 제목은 Student의 기존 입학 요강 개수를 기준으로 `입학 요강 N`을 이어간다.
- Category는 정확히 `입학 요강`, 요청 시즌은 `2026/27`을 사용한다.
- 기존 Major에 공식 학위명이 빠져 있으면 경고만 표시하고 자동 수정하지 않는다.
- Agent는 자동 생성하지 않는다.
- 기존 Student·University·Major는 update하지 않는다.
- 현재 요청에서 생성한 Work Log의 번호 제목을 확정하는 title-only update만 허용한다.
- archive와 delete는 호출하지 않는다.

## 안전장치

- schema 불일치, Agent missing/duplicate, Student ambiguity, University/Major ambiguity는 생성 전 차단한다.
- preview 이후 입력 변경 시 생성 계획과 버튼을 즉시 무효화한다.
- 새 Major 이름은 checkbox 확인이 필요하다.
- 브라우저 버튼은 요청 중 잠기고 성공 후 같은 화면에서 재실행할 수 없다.
- 서버는 SHA-256 fingerprint로 동시 요청과 완료된 동일 요청을 차단한다.
- ID-only journal로 부분 실패 후 앞에서 생성된 page를 재사용한다.
- `NOTION_CREATION_ENABLED=false`로 서버 쓰기를 즉시 차단할 수 있다.

## Live 검증

양원재 요청으로 다음을 실제 workspace에서 확인했다.

- `양원재 B` Student 생성 및 최승미 Agent relation
- University 3개 재사용
- 기존 Major 2개 재사용
- `Strategic Entrepreneurship & Innovation MSc` Major 생성 및 KCL relation
- `입학 요강 1`, `입학 요강 2`, `입학 요강 3` 생성
- 모든 Work Log의 Student 1개, Major 1개, Category, 마감일, 요청 시즌 재조회 검증

Work Log DB의 시스템 사용자가 생성 직후 번호를 지우는 현상이 있어, 앱이 생성한 Work Log 제목을 다시 적용하고 검증하도록 보완했다.

## 일반 사용

1. `npm start`로 서버를 시작한다.
2. JANDI 요청을 입력하고 추출 결과를 검토한다.
3. 신규/기존 학생을 선택한다.
4. `연결 및 스키마 확인`을 누른다.
5. `Notion 항목 다시 조회`를 누른다.
6. 새 Major가 있으면 생성 이름을 확인한다.
7. 최종 학생명, Work Log 제목, create/reuse 개수를 검토한다.
8. `Notion에 기록 생성`을 누르고 최종 확인한다.
9. 완료 링크에서 실제 Notion 결과를 확인한다.

## 주요 파일

- `public/app.js`: preview 검토, 생성 버튼, 최종 확인, 완료·오류 UI
- `src/server/notion/notionCreationService.js`: preflight, 생성 순서, fingerprint, journal 복구
- `src/server/notion/repositories/workLogsRepository.js`: Work Log 생성 및 번호 제목 검증
- `src/server/notion/creationJournal.js`: secret-free ID journal
- `docs/spec/PHASE_3_PLAN.md`: Phase 3 설계와 live 검증 기록
