# Notion to Google Sheets 직접 동기화 계획서

- 작성일: 2026-08-24
- 대상 프로젝트: `jd-to-notion`
- 상태: Phase G1~G4 완료 · Phase G5 회사 시트 cutover 완료 · 첫 신규 행 live write 검증 대기
- 목적: Make.com 없이 Notion Work Log의 신규 항목을 회사 Google Sheets 월별 탭에 전송

## 1. 목표

현재의 다음 흐름을 제거한다.

```text
앱에서 Notion 등록
→ Notion 결과 확인
→ Make.com 접속 및 로그인
→ 시나리오 수동 실행
→ Google Sheets 등록
```

목표 흐름은 다음과 같다.

```text
앱에서 Notion 등록 또는 Notion에서 Work Log 수동 등록
→ Notion 결과 확인
→ 앱의 Google Sheets 동기화 버튼 또는 16키 매크로 키 입력
→ 신규 미전송 Work Log 일괄 전송
→ Windows 알림 및 앱 화면에서 결과 확인
```

Make.com, Zapier, n8n, Apps Script와 같은 중간 실행 서비스는 사용하지 않는다. 로컬 앱이 Notion API와 Google Sheets API를 직접 호출한다.

## 2. 확인된 현재 구조

2026-08-24에 Make.com 설정 캡처와 실제 Google Sheets를 읽기 전용으로 확인했다.

### 2.1 Make.com 시나리오

현재 Make.com은 다음 순서로 실행된다.

```text
Notion Work Log 신규 항목 감지
→ Clients 검색
→ Major 검색
→ University 검색
→ Agents 검색
→ Google Sheets 행 추가
```

첫 Notion 모듈의 설정은 다음과 같다.

- Watch By: `Data Source`
- Trigger By: `created time`
- 한 실행 주기의 Limit: `20`
- 수정된 항목이 아니라 새로 생성된 항목을 기준으로 실행한다.

Clients, Major, University, Agents 검색 모듈은 아직 `Database Items (Legacy)`를 사용한다. Make.com에서 새 `Data Source` 방식으로 변경했을 때 반환 구조와 매핑 경로가 바뀌어 기존 시나리오가 깨진 이력이 있다.

Work Log 한 건마다 여러 Notion 검색 모듈과 Google 모듈이 실행되므로 Make.com operation 할당량을 빠르게 소비할 수 있다.

### 2.2 Google Sheets

- Spreadsheet ID는 고정한다.
- 월별 탭은 `YY년 M월` 형식이다.
- 확인된 탭 범위는 `24년 10월`부터 `26년 9월`까지다.
- 최신 월 탭이 앞쪽에 배치되어 있다.
- 표의 헤더는 4행에 있다.
- 실제 기록 열은 A:G이며 앱은 미전송 Work Log를 정산 단위로 먼저 묶은 뒤 C:G을 작성한다.

| 열 | 헤더 | 처리 원칙 |
|---|---|---|
| A | `no` | 앱이 작성하지 않음 |
| B | `작업날짜` | 앱이 작성하지 않음 |
| C | `소요시간(H)` | Notion `Hours`의 개별값 또는 입학요강 그룹 합계 |
| D | `edm 담당자` | Agent 이름 |
| E | `고객이름` | Student/Client 이름 |
| F | `지원학교 / 전공` | `University - Major` |
| G | `비고` | Work Log의 `작업 내용` |

학과가 여러 개면 F열에서 한 줄에 하나씩 표시한다.

```text
University A - Major A
University B - Major B
```

A:B는 정산 과정에서 별도로 사용하므로 앱이 값을 입력하거나 덮어쓰지 않는다. C열은 Notion `Hours`를 기준으로 앱이 작성한다.

## 3. 확정된 운영 정책

### 3.1 신규 Work Log만 최초 1회 전송

Google Sheets 동기화 대상은 Notion에서 새로 생성된 Work Log다.

- 앱이 만든 입학요강 Work Log: 포함
- 앱이 만든 SOP 감수 Work Log: 포함
- Notion에서 수동으로 만든 CV 감수 Work Log: 포함
- Notion에서 수동으로 만든 추천서 감수 Work Log: 포함
- 그 밖의 수동 Work Log: 정산에 필요한 관계와 값이 있으면 포함
- 이미 전송된 Work Log: 제외
- 과거 Work Log 또는 관계 페이지의 수정: 제외

`last_edited_time`은 동기화 기준으로 사용하지 않는다. 과거 Major 이름에 `MSc`를 추가하는 등의 수정이 대량 재전송을 일으키지 않게 한다.

전송 전에 Notion에서 수정한 값은 버튼을 누르는 시점의 최종값으로 전송된다. 전송 완료 이후의 수정은 자동 반영하지 않는다.

### 3.2 앱이 만든 항목으로 제한하지 않음

앱의 로컬 대기 목록만 보는 방식은 사용하지 않는다. 동기화할 때 Notion Work Log Data Source에서 신규 항목을 조회하고, 전송 이력과 비교하여 미전송 항목을 찾는다.

따라서 앱이 처리하지 않는 CV 감수나 추천서 감수를 Notion에 수동 등록해도 같은 동기화 버튼으로 Google Sheets에 보낼 수 있다.

### 3.3 동기화 시점은 J가 결정

실시간 웹훅이나 자동 스케줄을 사용하지 않는다.

- 앱 화면의 `Google Sheets 동기화` 버튼
- 16키 매크로 키보드에 지정한 전용 단축키

두 입력은 같은 서버 동기화 기능을 호출한다. 하루의 마지막 작업 후 한 번 실행하는 방식을 기본으로 하되, 언제든 여러 번 실행해도 중복 행이 생기지 않아야 한다.

### 3.4 미전송 입학요강 그룹화

Google Sheets에 쓰기 전에 현재 동기화에서 발견한 **미전송 입학요강 Work Log만** 먼저 그룹화한다.

그룹 키는 표시 이름이 아니라 다음 안정적인 ID 조합을 사용한다.

```text
대상 월별 탭 ID
+ Agent Page ID
+ Student Page ID
+ 입학요강 Category
```

같은 그룹의 Work Log는 `입학 요강 N`의 번호 오름차순으로 정렬한다. 번호가 없는 항목은 번호가 있는 항목 뒤에 두고, 같은 순위에서는 created time과 Page ID로 안정적인 순서를 유지한다.

F열에는 각 Work Log의 `University - Major`를 줄바꿈으로 결합하고 G열은 `입학 요강`으로 통일한다.

이미 전송된 Page ID는 그룹 입력에서 제외한다. 예를 들어 `입학 요강 1~3`을 먼저 전송한 뒤 `입학 요강 4~5`가 새로 생성되면, 다음 동기화에서는 4~5만 새 정산 행으로 묶는다. 기존 1~3의 Google 행은 갱신하지 않는다.

```text
첫 동기화: 입학 요강 1~3 → 정산 행 A
다음 동기화: 입학 요강 4~5 → 정산 행 B
```

4와 5가 서로 다른 날짜에 생성되어도 둘 다 아직 미전송이면 같은 실행에서 한 행으로 묶는다. 반대로 4를 먼저 동기화한 뒤 5가 생성되면 각각 별도 정산 행이 된다.

### 3.5 Hours 합산

Notion의 `Hours`는 Work Log별 실제 개별 작업시간이다. 같은 학생의 학과라도 기존 문서를 재사용하여 시간이 들지 않았다면 `0`을 정상적으로 기록한다.

입학요강 그룹의 C열은 그룹에 포함된 미전송 Work Log의 `Hours`를 모두 합산한다.

```text
0 + 0 + 0.5 + 0.5 + 0.33 = 1.33
```

- `0`: 정상적인 숫자이며 합계에 포함
- 양수 또는 소수: 정상적인 숫자이며 합계에 포함
- 모든 값이 `0`: C열에 빈칸이 아니라 `0` 기록
- 빈 값 또는 `null`: 입력 누락으로 보고 해당 그룹 보류
- 숫자가 아닌 값: 해당 그룹 보류

SOP, CV, 추천서처럼 그룹화하지 않는 Work Log는 해당 페이지의 `Hours` 한 값을 C열에 기록한다. JavaScript 부동소수점 오차가 셀에 노출되지 않도록 합계 계산과 직렬화를 테스트한다.

## 4. 월별 탭 자동 선택

### 4.1 기준 날짜

대상 탭은 각 Work Log의 생성일이 아니라 **동기화 버튼 또는 매크로 키를 누른 시점의 한국 날짜**로 결정한다.

- 시간대는 시스템 설정에 의존하지 않고 `Asia/Seoul`로 고정한다.
- 마감일까지 전송하지 못한 항목을 다음 정산 기간에 보내는 현재 운영 방식과 일치한다.

### 4.2 계산 규칙

```text
오늘이 1일~19일이면 현재 월 탭
오늘이 20일~말일이면 다음 월 탭
```

| 동기화 날짜 | 대상 탭 |
|---|---|
| 2026-08-19 | `26년 8월` |
| 2026-08-20 | `26년 9월` |
| 2026-09-19 | `26년 9월` |
| 2026-09-20 | `26년 10월` |
| 2026-12-20 | `27년 1월` |

### 4.3 탭이 없으면 전체 중단

계산된 월별 탭이 아직 만들어지지 않았다면 앱은 새 탭을 임의로 만들지 않고 동기화를 전부 중단한다.

```text
Google Sheets 동기화 중단

예상 대상: 26년 10월
해당 월별 탭이 아직 만들어지지 않았습니다.
탭이 만들어진 뒤 다시 실행해주세요.
```

이 검사는 실제 쓰기 전에 수행한다. 탭이 없을 때 일부 항목만 다른 탭으로 보내거나 최신 탭을 임의로 대신 선택하지 않는다.

### 4.4 탭 구조 검사

대상 탭이 있어도 다음 헤더가 정확하지 않으면 쓰기를 중단한다.

```text
C4 = 소요시간(H)
D4 = edm 담당자
E4 = 고객이름
F4 = 지원학교 / 전공
G4 = 비고
```

앱 화면에는 계산된 대상 탭을 표시하고, 예외 상황을 위한 수동 탭 선택 경로만 보조 기능으로 남긴다. 정상적인 월 변경 때는 수동 선택이 필요하지 않아야 한다.

## 5. Google 인증

### 5.1 선택 방식

전용 Google 서비스 계정을 사용한다.

서비스 계정은 이 로컬 앱만을 위한 단일 목적 계정으로 만들고, 대상 정산 Spreadsheet 한 개에만 편집 권한을 부여한다.

### 5.2 J가 최초 한 번 준비할 항목

1. Google Cloud 프로젝트 생성
2. Google Sheets API 활성화
3. `jd-to-notion` 전용 서비스 계정 생성
4. 서비스 계정 JSON 키 다운로드
5. 대상 Google Sheets를 서비스 계정 이메일에 편집자로 공유
6. JSON 키를 프로젝트 저장소 밖 또는 프로젝트의 Git 제외 로컬 비밀 경로에 저장
7. 앱 환경 변수에 Spreadsheet ID와 키 경로 설정

### 5.3 보안 원칙

- JSON 키는 비밀번호와 동일하게 취급한다.
- 키 내용을 소스 코드나 `.env.example`에 넣지 않는다.
- 실제 키 파일은 Git에 추가하지 않는다.
- 서비스 계정에는 대상 Spreadsheet 이외의 Google 파일을 공유하지 않는다.
- 키가 노출되면 즉시 폐기하고 새 키로 교체한다.

## 6. 신규 항목 탐색과 중복 방지

### 6.1 전환 기준 시각

첫 활성화 때 `GOOGLE_SYNC_START_AT`을 확정한다. 이 시각 이전의 과거 Work Log는 자동 전송 대상에서 제외하여 기존 Google Sheets 기록이 다시 들어가지 않게 한다.

### 6.2 안정적인 식별자

Notion Work Log Page ID를 고유 식별자로 사용한다. 이름, 날짜, Category 또는 fingerprint는 중복 판정 키로 사용하지 않는다.

### 6.3 전송 이력 저장

권장 방식은 대상 Spreadsheet 안에 숨김 관리 탭 `_JD_SYNC`를 만들고 개인 정보 없이 다음 값만 저장하는 것이다.

| 필드 | 용도 |
|---|---|
| `notion_page_id` | 중복 방지 키 |
| `synced_at` | 전송 완료 시각 |
| `target_sheet_id` | 기록한 월별 탭 ID |
| `target_row` | 기록된 행 번호 |
| `output_group_key` | 같은 정산 행으로 묶인 미전송 그룹 식별자 |

월별 정산 탭에는 관리용 ID 열을 추가하지 않는다. `_JD_SYNC` 생성은 구현 승인 후 테스트용 사본에서 먼저 검증하고, 원본 시트에 쓰기 전 다시 확인한다.

로컬 journal도 실행 중 상태와 오류 복구에 사용할 수 있지만, 장기 중복 방지의 기준은 Spreadsheet에 보존된 Page ID 기록으로 한다. PC 변경이나 앱 재설치 후에도 전송 이력이 유지되어야 하기 때문이다.

여러 입학요강 Page ID가 한 정산 행으로 묶이면 `_JD_SYNC`에는 Page ID별 이력을 각각 저장하되 `target_sheet_id`, `target_row`, `output_group_key`는 동일하게 기록한다. Google 행 쓰기가 성공한 뒤 그룹에 포함된 모든 Page ID를 함께 완료 처리한다.

## 7. Notion 데이터 해석

미전송 Work Log를 찾은 뒤 관계를 다음 방향으로 읽는다.

```text
Work Log
├─ Hours → 개별 작업시간
├─ Students → Student 이름 → Agent relation → Agent 이름
└─ Major → Major 이름 → University relation → University 이름
```

같은 실행에서 반복되는 Student, Major, Agent, University Page ID는 메모리 캐시에 저장하여 한 번만 조회한다. 여러 Work Log를 개별 Make 모듈로 반복 검색하던 구조를 피한다.

정산 행을 만들 수 없는 항목은 추측하지 않는다.

- Student 없음 또는 여러 명: 해당 항목 보류
- Agent 없음 또는 여러 명: 해당 항목 보류
- Major 없음: 해당 항목 보류
- University 없음 또는 관계 불일치: 해당 항목 보류
- Work Log 제목 없음: 해당 항목 보류
- Hours 빈 값 또는 숫자가 아님: 해당 항목 또는 입학요강 그룹 보류

항목별 데이터 오류는 정상 항목의 전송까지 막지 않는다. 정상 항목은 전송하고, 오류 항목은 미전송 상태로 남긴 뒤 이유를 보여준다. 반면 Google 인증, 대상 탭 부재, 헤더 불일치는 전체 실행을 중단한다.

## 8. Google Sheets 쓰기

미전송 Work Log를 모두 읽은 뒤 최종 정산 행을 메모리에서 먼저 만든다. 대상 월별 탭에는 최종 행들의 `C:G` 값만 추가한다.

```text
C = Work Log Hours 또는 미전송 입학요강 그룹의 Hours 합계
D = Agent 이름
E = Student/Client 이름
F = University - Major 또는 입학요강 그룹의 줄바꿈 결합값
G = Work Log 작업 내용 또는 입학요강 그룹의 `입학 요강`
```

A:B는 쓰기 대상에서 제외한다. Notion Work Log가 여러 개여도 입학요강 그룹화가 끝난 최종 정산 행만 Google에 보낸다. 여러 최종 행은 가능한 한 한 번의 묶음 요청으로 기록한다.

예를 들어 미전송 Work Log가 12개여도 입학요강 그룹화 결과가 정산 행 6개라면 Google에는 6개 행만 전송한다. Google 응답에서 실제 추가 범위를 확인한 뒤, 각 정산 행에 포함된 모든 Notion Page ID의 `_JD_SYNC` 이력을 완료 상태로 저장한다.

부분 성공이나 응답 유실이 발생해도 재실행 시 같은 Notion Page ID를 다시 추가하지 않도록 쓰기와 전송 이력의 순서를 설계하고 테스트한다.

## 9. 앱 UI와 매크로 키

### 9.1 앱 화면

앱에 다음 상태와 버튼을 추가한다.

```text
Google Sheets
대상 탭 · 26년 9월
미전송 · 7건
마지막 동기화 · 2026-08-24 18:20

[Google Sheets 동기화]
```

완료 요약 예시:

```text
26년 9월 · 7건 전송 완료
이미 전송됨 · 12건 제외
보류 · 1건
```

### 9.2 16키 매크로 키보드

Google Sheets 전송 전용 키 조합을 별도로 지정한다. 기존 JANDI 가져오기 단축키와 충돌하지 않게 한다.

```text
매크로 키
→ 로컬 앱 서버 상태 확인
→ 서버가 꺼져 있으면 백그라운드 실행
→ Google Sheets 동기화 endpoint 호출
→ Windows 알림으로 결과 표시
```

매크로 키 입력 자체를 실행 승인으로 본다. 화면 버튼과 매크로 키는 동일한 중복 방지와 검증을 적용한다.

- 실행 중 재입력: 두 번째 실행 차단
- 완료 후 재입력: 신규 미전송 항목이 없다는 알림
- 탭 없음: 아무것도 쓰지 않고 오류 알림
- 항목 오류: 성공·보류 건수와 보류 이유 표시

## 10. 환경 변수 초안

```env
GOOGLE_SHEETS_ENABLED=false
GOOGLE_SHEETS_WRITE_ENABLED=false
GOOGLE_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=
GOOGLE_SYNC_START_AT=
GOOGLE_SYNC_LOG_SHEET_NAME=_JD_SYNC
```

- `.env.example`은 `GOOGLE_SHEETS_ENABLED=false`를 기본값으로 유지한다. Phase G1 실제 읽기 검증 환경에서만 `true`로 설정하며, Google 쓰기 endpoint는 Phase G3 controlled test 전까지 구현하지 않는다.
- 월별 탭 이름은 날짜로 계산하므로 고정 `GOOGLE_SHEET_NAME`은 사용하지 않는다.
- 실제 비밀값은 `.env` 또는 로컬 비밀 파일에만 저장한다.

## 11. 서버 기능 초안

```text
GET  /api/google-sheets/status
POST /api/google-sheets/preview
POST /api/google-sheets/sync
```

- `status`: 인증, Spreadsheet 접근, 오늘의 대상 탭과 헤더를 읽기 전용으로 검사
- `preview`: 신규 미전송 항목, 그룹화된 정산 행 수, 대상 탭, C:G 예정값과 보류 사유를 반환
- `sync`: 서버에서 모든 조건을 재검증한 뒤 실제 기록

브라우저가 보낸 대상 탭이나 행 값을 그대로 신뢰하지 않는다. 서버가 KST 날짜, 실제 탭 목록, 헤더, Notion 관계, 전송 이력을 다시 확인한다.

## 12. 구현 단계

### Phase G1 — 읽기 전용 연결

- Google client와 설정 검증
- 서비스 계정 인증
- Spreadsheet 및 월별 탭 목록 조회
- KST 기준 대상 탭 계산
- 대상 탭 존재 여부와 C4:G4 헤더 확인
- Google 쓰기 없음

#### 완료 기록 — 2026-08-24

- `googleapis`와 서비스 계정 JSON 경로를 사용하는 읽기 전용 Google client를 추가했다.
- `GET /api/google-sheets/status`가 Spreadsheet 접근, KST 대상 탭 계산, 탭 존재 여부, C4:G4 헤더를 검사한다.
- 테스트 사본 `[TEST] JD to Notion Google Sync`에 실제 서비스 계정으로 연결했다.
- 2026-08-24 KST 기준 `26년 9월` 탭과 시트 ID `931518682`를 확인했다.
- C4:G4 실제 헤더가 계획서의 예상 헤더와 모두 일치하여 `ready: true`를 확인했다.
- Phase G1 client는 `spreadsheets.readonly` scope만 사용하며 Google 쓰기 기능은 구현하지 않았다.

### Phase G2 — Notion 신규 항목 미리보기

- 전환 기준 시각 이후 Work Log 페이지네이션 조회
- 앱 생성 및 수동 생성 Work Log 모두 포함
- Page ID 기준 미전송 판별
- Student·Agent·Major·University 관계 해석 및 캐시
- Hours 숫자·0·빈 값 검증
- 미전송 입학요강의 Agent·Student 기준 그룹화와 번호순 정렬
- 입학요강 그룹 Hours 합산 및 F열 줄바꿈 결합
- C:G 예정값과 보류 사유 표시
- Google 쓰기 없음

#### 완료 기록 — 2026-08-24

- `GOOGLE_SYNC_START_AT`을 `2026-08-24T00:00:00+09:00`으로 확정했다.
- created time 필터와 페이지네이션으로 기준 시각 이후의 앱 생성·수동 생성 Work Log를 함께 조회한다.
- `_JD_SYNC`가 있으면 A열의 Notion Page ID를 정규화해 이미 전송된 항목을 제외하고, 탭이 아직 없으면 전송 이력 0건으로 안전하게 처리한다.
- Work Log의 `Hours`를 실제 `number` 속성으로 검증하고 `0`을 정상값으로 유지한다.
- Student → Agent, Major → University를 Page ID로 해석하고 같은 실행의 중복 Page ID 조회를 메모리 캐시한다.
- 관계 페이지 조회는 동시 작업 수를 2개로 제한하고, 일시적 timeout·429·5xx만 최대 3회 제한 재시도한다.
- 현재 미전송 입학요강만 대상 탭 ID·Agent Page ID·Student Page ID·Category 기준으로 묶고, 제목 번호순으로 F열을 줄바꿈 결합하며 Hours를 합산한다.
- `POST /api/google-sheets/preview`는 C:G 예정값과 항목·행·보류 건수를 반환하며 Notion과 Google에 쓰지 않는다.
- 실제 오늘 로그 8건을 테스트한 결과 SOP 1행, 입학요강 4건 그룹 1행, 입학요강 3건 그룹 1행으로 총 3개 정산 행이 생성됐다.
- 입학요강 Hours 합계는 각각 `1.33`, `0.5`였고, F열 줄 수는 각각 4줄, 3줄이며 보류는 0건이었다.

### Phase G3 — 테스트용 Spreadsheet 쓰기

- 실제 시트의 사본 또는 별도 테스트 파일 사용
- `_JD_SYNC` 숨김 관리 탭 생성 검증
- 한 행 controlled write
- 같은 Page ID 재실행 시 중복 없음 확인
- 입학요강 여러 Page ID를 한 정산 행으로 쓰고 Hours 합계 확인
- 이미 전송된 1~3을 제외하고 신규 4~5만 새 행으로 그룹화하는지 확인
- 여러 행 batch write 및 부분 오류 복구 확인
- A:B와 다른 월별 탭이 변경되지 않았는지 확인

#### 완료 기록 — 2026-08-24

- 읽기 기능과 별도로 `GOOGLE_SHEETS_WRITE_ENABLED` gate와 Google `spreadsheets` scope를 쓰는 전용 write client를 추가했다.
- `POST /api/google-sheets/sync`는 `confirm: true`와 `controlled` 또는 `all` mode를 요구하며, 브라우저가 보낸 셀 값은 받지 않고 서버에서 최신 preview를 다시 계산한다.
- 테스트 시트의 다음 빈 행을 확인한 뒤 C열부터 G열까지만 `UpdateCells`로 기록한다. A:B는 batch request 범위에 포함하지 않는다.
- `_JD_SYNC`가 없으면 고정 충돌 검사를 거친 sheet ID로 생성하고 즉시 숨김 처리하며, 헤더·정산 행·Page ID 이력을 하나의 `spreadsheets.batchUpdate`에 묶는다.
- Google의 원자적 batch update를 사용하여 정산 행과 이력이 함께 성공하거나 함께 실패하도록 했다.
- 응답 유실 또는 일시 오류가 발생하면 `_JD_SYNC`의 Page ID를 다시 읽어 성공 여부를 판정하고, 미적용이 확인된 timeout·429·5xx만 제한 재시도한다.
- 첫 controlled write로 SOP 1건을 `26년 9월` 18행 C:G에 기록하고 `_JD_SYNC`를 생성했다. 같은 selection 재실행은 0건이었다.
- 남은 입학요강 4건 그룹과 3건 그룹을 한 batch로 19~20행에 기록했다. 재실행은 다시 0건이었다.
- 최종 직접 확인 결과 18~20행 A:B는 모두 빈칸, C열은 `0.33`, `1.33`, `0.5`, F열은 각각 1줄·4줄·3줄이었다.
- `_JD_SYNC`는 숨김 상태이며 헤더가 정확하고, 8개 고유 Notion Page ID가 대상 행 18·19·20과 연결됐다.
- 기존 24개 탭 중 쓰기 request가 참조한 sheet ID는 대상 월별 탭과 새 `_JD_SYNC`뿐이다. 원본 회사 Spreadsheet에는 요청하지 않았다.
- 이미 전송된 입학요강 1~3을 제외하고 신규 4~5만 묶는 자동 테스트와 여러 행·여러 Page ID batch 테스트를 추가했다.

### Phase G4 — 앱 UI 및 매크로

- 상태, 대상 탭, 미전송 건수, 완료·보류 요약 UI
- 중복 클릭 및 동시 실행 잠금
- 매크로 키용 로컬 호출 경로
- 성공, 미전송 없음, 탭 없음, 오류 Windows 알림

#### 완료 기록 — 2026-08-24

- 앱 상단에 JANDI 분석과 독립적으로 항상 보이는 Google Sheets 카드를 추가했다.
- 앱을 열거나 `미전송 항목 다시 확인`을 누르면 상태와 preview를 읽기 전용으로 갱신하고, 대상 탭·미전송 Work Log·예정 행·마지막 동기화를 표시한다.
- C:G 예정값은 정산 행별 학생·담당자·Hours·학교/학과·작업 내용으로 표시하고, 관계 또는 Hours 문제는 별도 보류 영역에 이유와 함께 표시한다.
- 전송 버튼은 대상 탭과 헤더가 정상이고 write gate가 켜져 있으며 미리보기 행이 있을 때만 활성화한다.
- 화면 전송은 현재 미리보기의 output group key만 `controlled` mode로 보내며, 대상 탭·행·Work Log·보류 수와 A:B 비변경 원칙을 확인한 뒤 실행한다.
- 브라우저의 중복 클릭 잠금과 서버의 동시 실행 잠금을 함께 적용하고, 완료·0건·탭 없음·인증·stale preview·보류 오류를 구분해 표시한다.
- `_JD_SYNC`의 가장 최근 `synced_at`을 읽어 앱 화면의 마지막 동기화 시각으로 표시한다.
- 매크로 기본 키를 `Ctrl + Alt + Shift + F10`으로 정하고, 같은 서버 sync 기능을 `all` mode로 호출하는 Windows PowerShell 스크립트를 추가했다.
- 매크로 스크립트는 서버가 꺼져 있을 때만 백그라운드 실행하고, 성공·신규 없음·보류·월별 탭 없음·오류를 Windows 알림과 로컬 로그로 남긴다.
- Windows PowerShell 5에서도 한국어 스크립트와 UTF-8 JSON 탭 이름이 깨지지 않도록 BOM과 명시적 UTF-8 응답 해석을 적용했다.
- 실제 Google 쓰기가 없는 UI fixture로 데스크톱·모바일 렌더링, `다시 확인` 상호작용, 버튼 gate와 콘솔 오류 부재를 검증했다.
- 매크로 fixture에서 `all + confirm` 요청, 2행·3개 Work Log 성공 요약과 보류 1건 알림 경로를 검증했다.
- 실제 3000번 앱 서버를 새 코드로 재시작한 뒤 테스트 Spreadsheet의 `26년 9월`, 이미 전송 8건, 미전송 0건, 보류 0건을 읽기 전용으로 확인했다.
- 실제 매크로 스크립트를 3000번 서버에 실행해 Google 추가 쓰기 없이 `새로 전송할 Work Log가 없습니다` Windows 알림·로그 경로를 확인했다.

### Phase G5 — 실제 시트 controlled live 검증

- Make.com 시나리오와 앱을 동시에 실행하지 않음
- 승인된 신규 Work Log 한 건으로 실제 전송
- C:G 값, 대상 탭, 행 위치, A:B 보존 확인
- 같은 항목 재실행 시 중복 없음 확인
- 수동 생성 CV 또는 추천서 Work Log 검증
- 검증 완료 후 Make.com을 비상용 fallback으로만 보관하거나 중단

#### 회사 시트 cutover 기록 — 2026-08-24

- 회사 Spreadsheet의 `26년 9월` 탭과 sheet ID `931518682`, C4:G4 헤더를 실제 연결 계정과 앱 서비스 계정 양쪽에서 확인했다.
- 오늘 Work Log 8건에 해당하는 3개 정산 행이 Make.com을 통해 이미 회사 15~17행에 존재함을 확인하여 앱의 중복 live write를 중단했다.
- 테스트 시트 18~20행과 회사 시트 15~17행의 C:G을 비교해 SOP 1건, 입학요강 4건 그룹, 입학요강 3건 그룹의 대응을 확정했다.
- 회사 월별 탭은 수정하지 않고 숨김 `_JD_SYNC`만 생성하여 고유 Notion Page ID 8개를 기존 회사 15·16·17행에 연결했다.
- 이력 생성 후 회사 15~17행 A:G이 그대로이고 18행 전체가 빈칸이며, `_JD_SYNC` 헤더·숨김 상태·고유 Page ID 8개·행 매핑이 정확한지 재확인했다.
- 로컬 `.env`의 `GOOGLE_SPREADSHEET_ID`를 테스트 사본에서 회사 Spreadsheet로 전환하고 서버를 재시작했다.
- 앱 service account 기준 preview 결과는 발견 8건, 이미 전송 8건, 미전송 0건, 출력 0행, 보류 0건이다.
- 실제 F10 경로와 같은 PowerShell 매크로를 회사 설정에서 실행했고 `새로 전송할 Work Log가 없습니다`로 종료됐다. 실행 전후 회사 15~18행과 이력 8건은 변하지 않았다.
- 현재 `EDM.ahk`가 실제 메인 매크로 파일이며 F10 블록은 J가 반영했다. 프로젝트의 `automation/jandi-to-admissions.ahk`는 백업 및 참고용으로 유지한다.
- 아직 cutover 이후 새로 생성된 Work Log가 없으므로, 회사 시트에 앱이 새 행을 실제 추가하는 첫 live write와 그 재실행 중복 방지 확인은 다음 실제 업무 1건에서 진행한다.

## 13. 테스트 항목

- 1일, 19일, 20일, 말일의 월 탭 계산
- 12월 20일의 연도 전환
- Windows 시스템 시간대와 무관한 KST 계산
- 계산된 탭이 없을 때 쓰기 0건
- C4:G4 헤더 불일치 시 쓰기 0건
- 앱 생성 Work Log와 Notion 수동 생성 Work Log 동시 탐색
- 20건을 넘는 미전송 Work Log 페이지네이션
- 과거 수정 항목 제외
- 같은 Page ID 반복 실행 중복 방지
- Hours의 `0`을 빈 값으로 오인하지 않음
- Hours가 모두 `0`인 그룹의 C열에 `0` 기록
- Hours 빈 값 또는 숫자가 아닌 그룹 보류
- `0 + 0 + 0.5 + 0.5 + 0.33 = 1.33` 합산
- 같은 실행의 미전송 입학요강만 Agent·Student별로 그룹화
- 이미 전송된 입학요강 행을 추가 요청 때문에 갱신하지 않음
- 서로 다른 날짜에 생성됐지만 모두 미전송인 4~5 그룹화
- 여러 Major의 줄바꿈 조합
- `입학 요강 N` 번호순 정렬과 번호 없는 항목 후순위 처리
- 반복되는 관계 Page ID 캐시
- 항목별 관계 누락 시 보류 및 정상 항목 계속 처리
- Google 429 및 일시 오류의 제한된 지수 백오프
- 실행 중 매크로 키 재입력 차단
- A:B 및 다른 월별 탭 불변 확인

## 14. 범위 밖

- 기존 Google Sheets 과거 행 일괄 수정
- 이미 전송된 Work Log의 자동 재동기화
- 과거 Major·University·Student·Agent 이름 변경 반영
- 월별 탭 자동 생성 또는 서식 복제
- A:B 번호·작업날짜 자동 작성
- Google Sheets 수식이나 정산 로직 변경
- Notion webhook 기반 실시간 전송
- Make.com 시나리오의 Legacy 모듈 마이그레이션
- Apps Script, Zapier, n8n 도입

## 15. 구현 전 남은 확인

1. 서비스 계정 생성 및 테스트 Spreadsheet 편집 권한 공유 — 완료
2. 실제 전환 기준 시각 `GOOGLE_SYNC_START_AT` 확정 — 완료 (`2026-08-24T00:00:00+09:00`)
3. 테스트용 Spreadsheet 사본 준비 — 완료
4. `_JD_SYNC` 숨김 관리 탭 사용 최종 확인 — 완료
5. 매크로 키에 배정할 키 조합 확정 — 완료 (`Ctrl + Alt + Shift + F10`)

다섯 항목이 모두 준비됐다. 현재 앱과 매크로는 테스트 Spreadsheet를 대상으로 하며, 원본 회사 Spreadsheet 전환은 Phase G5 controlled live 검증에서 수행한다.
