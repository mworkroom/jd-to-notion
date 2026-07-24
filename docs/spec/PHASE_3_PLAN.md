# Phase 3 — Notion 생성 계획서

- 작성일: 2026-07-24
- 대상 프로젝트: Admission Guidelines Automation
- 상태: Phase 3.1~3.2 로컬 구현 완료 · live Gate A 통과 · Gate B 대기
- 선행 단계: Phase 1, Phase 2, Phase 2.5 완료

## 구현 진행 기록 — 2026-07-24

- Phase 3.1의 한국어 생성 계획 UI, preview 무효화, 생성 조건 요약을 구현했다.
- Phase 3.2의 property builder, create repository 함수, creation service, fingerprint, in-flight lock, 최소 journal, `POST /api/notion/create`를 구현했다.
- 실제 endpoint는 `NOTION_CREATION_ENABLED=false`가 기본값이며 Gate B·C 승인 전에는 HTTP 403으로 차단된다.
- fake Notion client로 Student → University → Major → Work Log 순서, relation payload, 부분 실패 복구, 중복 요청 차단을 검증했다.
- 전체 자동 테스트는 80개가 통과한다.
- Work Log 제목 접두사 `입학요강`과 회사 표준 Category option `입학 요강`을 별도 상수로 분리했다.
- 수정된 코드의 live 읽기 전용 schema 검사에서 5개 data source 접근, property 이름·type, `Major` exact name, Category `입학 요강`, 요청 시즌 `2026/27` option이 모두 정상이다.
- 사용자 live 시험은 수정 전 Category 값 때문에 Work Log 생성 단계에서 중단되었다. 로컬 journal이 없어 선행 page 생성 여부는 Notion에서 직접 확인해야 한다.

## 1. 현재 기준선

Phase 3 시작 시점의 기준선은 다음과 같다.

- JANDI 요청 복사·붙여넣기와 검토용 추출 UI가 동작한다.
- 1년치 실제 요청을 전수조사해 담당자별 입력 변형을 파서에 반영했다.
- 전체 자동 테스트 70개가 통과한다.
- 대학은 URL domain을 우선하고 CSV alias를 보조 수단으로 사용한다.
- 추출 오류와 확인이 필요한 카드는 Notion 작업 전에 차단된다.
- Notion 연결, schema 검사, Agent·Student·University·Major·Work Log 읽기 전용 미리보기가 구현되어 있다.
- Notion page 생성·수정·보관·삭제는 아직 구현되어 있지 않다.
- `Create Notion records — Phase 3` 버튼은 비활성화 상태다.

Phase 3 작업 중에도 Phase 1·2.5의 추출 및 파일명 생성 기능은 Notion 설정 여부와 관계없이 계속 사용할 수 있어야 한다.

## 2. Phase 3 목표

검토와 Notion 미리보기가 끝난 요청에 대해 필요한 Notion page를 안전한 순서로 생성한다.

한 번의 요청으로 다음 결과를 만든다.

1. Agent는 기존 page를 재사용한다.
2. 신규 고객이면 Student를 만들고 Agent relation을 연결한다.
3. 없는 University만 생성한다.
4. 없는 Major만 생성하고 University relation을 연결한다.
5. 요청 하나당 Work Log 하나를 생성한다.
6. Work Log에 최종 Student와 모든 Major를 연결한다.
7. 생성·재사용된 항목과 실패 지점을 사용자에게 명확히 보여준다.

## 3. 핵심 원칙

### 3.1 검토와 쓰기 분리

JANDI 추출 버튼과 Notion 생성 버튼을 합치지 않는다.

흐름은 항상 다음 순서를 따른다.

```text
JANDI 추출
→ 사용자 검토 및 수정
→ Notion 읽기 전용 미리보기
→ 생성 예정 항목 확인
→ 최종 확인
→ Notion 생성
```

### 3.2 브라우저 값을 신뢰하지 않음

최종 생성 요청을 받으면 서버가 다시 수행한다.

- 입력값 validation
- Notion schema 검사
- Agent exact match
- Student 후보 및 선택 확인
- University·Major 재조회
- Work Log 순번 재계산

브라우저가 보낸 Notion page ID도 현재 요청의 후보에 포함되는지 서버에서 검증한다.

### 3.3 create-only

Phase 3에서 허용하는 Notion 변경은 page 생성뿐이다.

- create: 허용
- update: 제외
- archive: 제외
- delete: 제외

잘못 생성된 page를 앱이 자동 삭제하거나 원복하지 않는다.

### 3.4 Agent는 생성하지 않음

Agent가 없거나 중복이면 생성 작업 전체를 차단한다. Agent 자동 생성은 Phase 3 범위가 아니다.

### 3.5 최종 ID 기준으로 relation 연결

기존 page와 새 page를 구분하지 않고 최종적으로 확보한 page ID를 downstream relation에 사용한다.

## 4. 실제 쓰기 대상

현재 live schema와 canonical 코드의 property 이름을 기준으로 한다.

### 4.1 Students

신규 고객일 때만 생성한다.

| Property | 값 |
|---|---|
| `Name` | 서버가 최종 계산한 학생명과 suffix |
| `Agent` | exact match된 Agent page ID |

기존 고객 모드에서는 선택된 Student를 재사용하며 새 Student를 만들지 않는다.

### 4.2 Universities

읽기 전용 미리보기와 최종 재조회에서 모두 일치 항목이 없을 때만 생성한다.

| Property | 값 |
|---|---|
| `Name` | 검토된 Notion 대학 표준명 |

동일 요청 안에서 같은 대학이 여러 번 나와도 한 번만 생성한다.

### 4.3 Majors

University ID와 정규화된 Major 이름 조합으로 다시 조회한 뒤 없을 때만 생성한다.

| Property | 값 |
|---|---|
| `Name` | 검토된 Notion Major 후보명 |
| `University` | 최종 University page ID |

Major 중복 제거 키는 이름만 사용하지 않는다. 반드시 다음 조합을 사용한다.

```text
University page ID + normalized Major key
```

동일한 학과명이 서로 다른 대학에 있을 수 있기 때문이다.

### 4.4 Work Log

JANDI 요청 하나당 Work Log 하나를 생성한다.

| Property | 값 |
|---|---|
| `작업 내용` | 선택된 Student 기준 다음 `입학요강 N` |
| `마감일` | 요청일 기준 주말을 제외한 2영업일 뒤 |
| `Category` | `입학 요강` |
| `요청 시즌` | `2026/27` |
| `Students` | 최종 Student page ID |
| `Major` | 요청에 포함된 모든 최종 Major page ID |

다음 속성은 직접 쓰지 않는다.

- Status
- Agent rollup
- University rollup
- 학과 링크 formula
- 완료일
- Hours

프로그램 URL은 현재 writable Notion property가 정의되어 있지 않으므로 Phase 3에서 임의의 새 속성을 만들거나 쓰지 않는다. 검토 UI와 향후 Word 생성에 사용한다.

## 5. 서버 쓰기 순서

Notion에는 여러 data source를 묶는 transaction이 없으므로 순서를 고정한다.

### 5.1 최종 preflight

쓰기 직전에 다음을 모두 확인한다.

1. 요청 validation 통과
2. 추출 경고 해결
3. Notion 연결 및 schema 정상
4. Agent exact match 1개
5. 기존 고객 Student 선택 완료
6. Major 이름 검토 완료
7. 동일 요청의 처리 이력 확인

하나라도 실패하면 page를 하나도 만들지 않는다.

### 5.2 Student 확정

- 신규 고객: 최신 Student name family를 다시 조회하고 suffix를 재계산한 뒤 생성
- 기존 고객: 선택된 Student가 현재 후보에 포함되는지 재검증 후 재사용

최종 Student 이름은 파일명에도 다시 반영한다.

### 5.3 University 확정

각 대학을 다시 조회한다.

- 발견: 기존 ID 재사용
- 없음: 생성 후 ID 저장
- 중복: 전체 작업 중단

### 5.4 Major 확정

각 Major를 University ID와 함께 다시 조회한다.

- 발견: 기존 ID 재사용
- 없음: University relation과 함께 생성
- 중복: 전체 작업 중단

### 5.5 Work Log 생성

Student와 모든 Major ID가 확보된 뒤 마지막으로 생성한다.

Work Log 순번은 생성 직전에 다시 계산한다. Preview 시점의 순번을 그대로 신뢰하지 않는다.

## 6. 중복 방지와 부분 실패

### 6.1 요청 fingerprint

다음 값을 정규화해 SHA-256 fingerprint를 만든다.

- requester
- request date
- client mode
- 최종 Student ID 또는 신규 Student base name
- 정렬된 programme URL 목록

브라우저가 임의로 만든 fingerprint를 신뢰하지 않고 서버에서 계산한다.

### 6.2 이중 클릭 방지

- 생성 버튼을 요청 직후 비활성화한다.
- 같은 fingerprint가 처리 중이면 두 번째 요청을 거부한다.
- 완료된 fingerprint가 있으면 이미 처리된 요청으로 경고한다.

### 6.3 최소 쓰기 journal

로컬 전용 journal에는 다음만 기록한다.

- fingerprint
- 시작·완료 시각
- 작업 상태
- 생성 또는 재사용한 page ID
- 실패 단계와 안전한 오류 코드

원본 JANDI 메시지, Notion token, 불필요한 개인정보, raw Notion response는 기록하지 않는다. journal 경로는 Git에서 제외한다.

### 6.4 부분 실패 처리

부분 실패 시 자동 재시도하거나 자동 삭제하지 않는다.

화면에 다음을 보여준다.

- 성공적으로 생성된 항목
- 재사용한 항목
- 실패한 단계
- 생성되지 않은 나머지 항목
- 재시도 전에 확인할 내용

Phase 3의 최소 재시도는 journal의 생성 ID를 재사용하고, 모든 항목을 다시 조회한 뒤 이어서 진행하는 방식으로 설계한다. 고급 복구 화면과 운영 로그 관리는 Phase 4에서 확장한다.

## 7. API 및 코드 구조 계획

### 7.1 Repository 확장

기존 read-only repository에 raw SDK 호출을 섞지 않고 create 함수를 추가한다.

- Students: `createStudent`
- Universities: `createUniversity`
- Majors: `createMajor`
- Work Log: `createWorkLog`

Agents repository에는 create 함수를 추가하지 않는다.

### 7.2 Property builder

Notion property payload 생성을 별도 모듈로 분리한다.

- title
- relation
- select
- date

property 이름은 `NOTION_PROPERTY_NAMES`만 사용하며 문자열을 서비스 곳곳에 중복 작성하지 않는다.

### 7.3 Creation service

별도의 orchestration service가 preflight와 쓰기 순서를 담당한다.

예상 책임:

- 최종 요청 정규화
- schema 재검사
- read-only matching 재실행
- unresolved decision 차단
- fingerprint 계산
- create/reuse 순서 제어
- journal 기록
- 브라우저용 결과 payload 생성

### 7.4 Endpoint

최종 endpoint는 하나로 제한한다.

```text
POST /api/notion/create
```

응답에는 raw SDK object를 포함하지 않는다.

정상 응답은 다음 내용을 포함한다.

- request fingerprint
- Student create/reuse 결과
- University별 create/reuse 결과
- Major별 create/reuse 결과
- Work Log 생성 결과와 Notion URL
- 최종 파일명에 사용할 Student 이름

부분 실패 응답은 생성된 page ID와 실패 단계를 포함하되 token과 raw Notion data는 포함하지 않는다.

## 8. UI 재정비 계획

Phase 3에서는 Notion Preview 이후 영역을 함께 재정비한다.

### 8.1 한국어 중심 정보 구조

다음 용어를 한국어로 바꾼다.

- Agent → 담당자
- Student → 학생
- University → 대학
- Major → 학과
- Work Log → 작업 일지
- create → 새로 생성
- reuse → 기존 항목 사용
- ambiguous → 선택 필요

Notion의 실제 property 이름을 설명해야 할 때만 영문을 병기한다.

### 8.2 상태 요약

Notion 영역 상단에 다음을 한 줄로 요약한다.

```text
담당자 기존 사용 · 학생 새로 생성 · 대학 1개 생성 · 학과 2개 생성 · 작업 일지 1개 생성
```

정상적으로 재사용되는 상세 정보는 접고, 선택이나 검토가 필요한 항목만 펼쳐서 보여준다.

### 8.3 생성 전 최종 확인

버튼을 누르면 최종 확인 화면에서 다음을 보여준다.

- 최종 학생명
- 마감일
- 작업 일지 제목
- 새로 생성할 Student·University·Major 수
- 재사용할 항목 수
- 연결될 모든 학과

확인 전에는 실제 Notion 요청을 보내지 않는다.

### 8.4 버튼 상태

다음 조건을 모두 충족할 때만 생성 버튼을 활성화한다.

- 추출 validation 정상
- 추출 경고 없음
- Notion schema 정상
- 최신 preview 존재
- preview 이후 입력 수정 없음
- Agent 확정
- Student 확정
- University·Major ambiguity 없음
- Major 이름 검토 완료

버튼 문구는 실제 작업량을 반영한다.

```text
Notion에 기록 생성
```

진행 중에는 단계별 상태를 보여준다.

```text
학생 확인 중
대학 1/3 처리 중
학과 2/4 처리 중
작업 일지 생성 중
```

### 8.5 완료 화면

완료 후 생성·재사용 항목을 분리하고, 생성된 Work Log의 Notion 링크를 가장 눈에 띄게 보여준다.

## 9. 구현 단계

### Phase 3.0 — 기준선 동결과 live preflight

작업:

- 전체 자동 테스트 통과 확인
- live `Check connection` 재실행
- 5개 data source의 property 이름과 type 확인
- Work Log의 `Major ` trailing-space 문제가 없는지 확인
- Category `입학 요강`, 요청 시즌 `2026/27` option 존재 확인

완료 조건:

- 코드 기준 테스트 전체 통과
- live schema가 `Connected and schema valid`
- 실제 Notion write는 0건

승인 Gate A:

- live schema 결과를 J님에게 보고하고 다음 단계 진행 여부 확인

### Phase 3.1 — UI와 최종 생성 계획

작업:

- Notion Preview 영역 한국어화
- create/reuse/선택 필요 상태 요약
- 최종 생성 계획 카드
- 입력 수정 시 preview와 생성 승인을 즉시 무효화
- 생성 버튼은 계속 비활성화

완료 조건:

- fake preview로 모든 UI 상태 확인
- unresolved 상태에서 생성 버튼이 활성화되지 않음
- 실제 Notion write는 0건

### Phase 3.2 — 쓰기 모듈과 fake-client 테스트

작업:

- property builder
- create repository 함수
- creation service
- `/api/notion/create`
- fingerprint와 in-flight lock
- 최소 journal

완료 조건:

- fake Notion client만 사용한 테스트 통과
- create 순서와 relation payload 검증
- token·raw SDK object가 응답이나 로그에 없음
- UI 생성 버튼은 아직 live workspace에 대해 비활성화

승인 Gate B:

- 생성 payload와 fake-client 결과를 J님에게 보여주고 live 1건 시험 여부 확인

### Phase 3.3 — 통제된 live 1건 시험

J님이 직접 고른 안전한 실제 요청 한 건만 사용한다.

시험 전 확인:

- 신규 고객인지 기존 고객인지 명확함
- Agent exact match
- Student 선택 또는 생성명이 명확함
- 대학과 학과 ambiguity 없음
- 최종 확인 화면의 모든 값 승인

시험 후 직접 확인:

- Student 생성 또는 재사용 결과
- Agent relation
- University 생성 또는 재사용 결과
- Major 이름과 University relation
- Work Log 제목과 순번
- Student·Major relations
- 마감일
- Category
- 요청 시즌
- rollup과 formula 표시

완료 조건:

- 승인된 한 요청만 생성
- 중복 page 없음
- 모든 relation 정상
- 예상하지 않은 property 변경 없음

승인 Gate C:

- live 생성 직전에 J님의 명시적 승인 필요

승인 Gate D:

- 생성 결과를 J님이 Notion에서 확인한 뒤 일반 사용 활성화 여부 결정

### Phase 3.4 — 일반 사용 활성화

작업:

- 최종 생성 버튼 활성화
- 완료·부분 실패 결과 UI
- README 운영 절차 갱신
- Phase 3 인수인계 문서 작성

완료 조건:

- 신규 고객과 기존 고객 각각 검증
- create와 reuse가 섞인 요청 검증
- 여러 학과가 있는 요청에서 Work Log 하나만 생성
- 빠른 이중 클릭과 동일 요청 재전송 차단
- Phase 1 추출과 파일명 기능 회귀 없음

## 10. 테스트 계획

### Unit tests

- Notion title·relation·select·date payload
- fingerprint 안정성
- 신규 Student suffix 재계산
- University 중복 제거
- Major의 University별 복합 identity
- Work Log 순번 재계산
- journal에 민감정보가 포함되지 않음

### Service tests

- 신규 고객 전체 create
- 기존 고객 전체 reuse
- University만 create
- Major만 create
- 동일 대학의 여러 Major
- 같은 이름의 Major가 서로 다른 대학에 존재
- Agent missing·duplicate 차단
- Student ambiguity 차단
- Major ambiguity 차단
- schema mismatch 차단
- 단계별 Notion 오류와 partial result

### Endpoint tests

- 잘못된 요청 400
- unresolved decision 409
- 동일 fingerprint 중복 요청 차단
- 브라우저가 조작한 derived field 재계산
- 안전한 응답 payload

### UI tests

- preview 이후 입력 수정 시 생성 불가
- 버튼 이중 클릭 방지
- create/reuse 개수 표시
- 선택 필요 항목 강조
- 진행 단계와 완료 링크 표시
- 부분 실패 시 생성 완료 항목 보존

### Live verification

자동 테스트와 별도로 J님이 승인한 1건만 실제 workspace에서 확인한다.

## 11. Non-goals

Phase 3에서 하지 않는다.

- Agent 자동 생성
- 기존 Notion page 수정
- 자동 archive 또는 delete
- 자동 rollback
- Notion schema 변경
- bulk import
- 여러 요청 일괄 생성
- 공휴일을 반영한 마감일 계산
- Word 문서 생성
- AI 추출 도입
- 공개 배포 또는 cloud hosting
- Phase 4 수준의 고급 복구 대시보드

## 12. 최종 완료 기준

다음을 모두 충족하면 Phase 3를 완료로 본다.

1. 전체 자동 테스트가 통과한다.
2. live schema 검사가 통과한다.
3. 신규 고객과 기존 고객 흐름이 모두 동작한다.
4. Agent를 자동 생성하지 않는다.
5. 없는 University·Major만 생성한다.
6. 모든 Major가 올바른 University relation을 갖는다.
7. 요청 하나당 Work Log 하나만 생성한다.
8. Work Log가 최종 Student와 모든 Major에 연결된다.
9. 제목, 마감일, Category, 요청 시즌이 정확하다.
10. 동일 요청의 중복 제출이 차단된다.
11. 부분 실패 시 이미 생성된 page와 실패 단계가 표시된다.
12. 실제 쓰기 전 최종 확인이 필요하다.
13. update·archive·delete 호출이 없다.
14. Phase 1·2.5 기능에 회귀가 없다.

## 13. Phase 3 이후

Phase 3가 안정화된 뒤 Phase 4에서 다음을 확장한다.

- 복구 및 재시도 전용 UI
- 장기 실행 journal 관리
- 운영 로그 검색
- 중복 요청 이력 화면
- 추가적인 장애 대응

그 이후 Phase 5에서 Word template 생성을 시작한다.
