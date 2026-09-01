# SOP 감수 요청 자동화 구현 계획

- 작성일: 2026-08-15
- 대상 프로젝트: Admission Guidelines Automation
- 상태: Phase SOP-1~4 및 SOP-6 자동 다운로드 로컬 구현 완료 · Phase SOP-5와 실제 파일 저장 end-to-end 검증 미완료
- 선행 조건: 업무용 Notion의 기존 Work Log 제목 자동화 비활성화

## 1. 목표

JANDI에서 들어오는 SOP 감수 요청을 기존 입학요강 자동화와 같은 매크로 입력 흐름으로 처리한다.

앱은 요청 유형, 담당자, 학생, 요청 시각, 감수 차수를 자동으로 판별한다. SOP 요청이면 영문을 기본값으로 제안하고, 해당 학생의 `입학 요강 1`에 연결된 학교·학과를 기본 선택한다. J는 파일을 열어 언어와 목표 학교·학과가 맞는지 확인하고, 필요한 경우 한 번의 간단한 선택으로 수정한 뒤 완성된 Work Log 한 건을 Notion에 생성한다.

최종 Work Log에는 수당 정산에 필요한 다음 정보가 모두 있어야 한다.

- Student
- Agent rollup
- Major
- University rollup
- SOP 감수 Category
- 감수 차수가 포함된 작업 내용
- 마감일
- 요청 시즌

## 2. 배경과 문제 정의

SOP 감수 요청의 JANDI 본문에서는 일반적으로 다음 정보를 얻을 수 있다.

- 게시물 작성자이자 담당자
- 요청 날짜와 시각
- 학생 이름
- SOP 감수 요청 여부
- 감수 차수

반면 담당자는 SOP 파일의 언어와 기준 학교를 모르는 경우가 많다. 첨부된 입학요강 PDF나 파일명으로 학과 분야를 짐작할 수는 있지만, 실제 SOP가 어느 학교를 1지망 기준으로 작성됐는지는 파일을 열어야 확인할 수 있다.

학교 선택은 단순 기록 문제가 아니다. 학교별 글자 수 제한과 감수 전략이 달라질 수 있으므로 실제 1지망 학교를 확정해야 한다. 또한 Notion의 Work Log에 Student, Major, University, Category, 작업 내용이 정확히 입력되어야 Make.com의 Google Sheets 수당 정산 자동화가 올바르게 동작한다.

따라서 파일 확인 자체는 제거하지 않는다. 대신 파일을 확인한 뒤 반복적으로 Notion 관계와 제목을 입력하는 작업을 제거한다.

## 3. 확정된 운영 결정

### 3.1 Notion Automation 비활성화

과거 유료 플랜에서 설정한 Work Log Automation은 앞으로 비활성화한다.

기존 Automation은 Category를 기준으로 `입학 요강` 또는 `SOP 감수(국문)` 같은 제목을 입력했지만, 앱이 작성한 `입학 요강 1` 등의 번호 제목을 나중에 다시 덮어쓰는 문제가 있었다. 앞으로 Work Log 제목은 앱이 직접 완성해서 저장한다.

- 입학요강 제목 예: `입학 요강 1`
- SOP 제목 예: `SOP 1차 감수(영문)`
- Notion Automation에 제목 생성을 의존하지 않는다.
- 앱이 생성한 Work Log의 제목 저장값을 재조회하는 안전 검증은 유지한다.
- 과거에 번호가 사라진 기존 Work Log를 일괄 수정하는 작업은 이번 범위에 포함하지 않는다.

### 3.2 Make.com 운영

Make.com 전송은 현재 하루 한 번 J가 수동 실행한다.

- Notion 생성 직후 Google Sheets로 즉시 전송되는 시간차는 이번 기능의 제약이 아니다.
- 같은 날 Make.com을 실행하기 전에 Notion에서 학교·학과를 수정해도 정산 데이터에는 최종 수정값이 반영된다.
- 그래도 앱의 기본 흐름은 가능한 한 생성 전에 언어와 학교·학과를 확인하여 완성된 Work Log를 만드는 것으로 한다.
- Make.com 시나리오나 Google Sheets 구조는 이번 구현에서 변경하지 않는다.

### 3.3 자동화 대상

- SOP 감수 요청만 새 자동화 대상으로 추가한다.
- CV 감수와 추천서 감수는 빈도가 매우 낮으므로 수동 처리한다.
- 첨부 파일 본문 분석, DOCX 자동 열기, OCR, AI 기반 학교 추론은 구현하지 않는다.

## 4. 실제 데이터 조사 결과

2026-08-15 기준 live Notion을 읽기 전용으로 조사했다.

### 4.1 현재 Work Log 구조

- Category에는 `SOP 감수(영문)`과 `SOP 감수(국문)`이 이미 존재한다.
- Work Log의 `Major` relation을 선택하면 Major에 연결된 University가 `University` rollup으로 표시된다.
- Work Log의 `Students` relation을 선택하면 Student에 연결된 Agent가 `Agent` rollup으로 표시된다.
- 따라서 SOP UI에서 학교와 학과를 별개로 조합하지 않고 기존 Major 하나를 선택해야 한다.

### 4.2 학교·학과 후보 재사용 가능성

최근 SOP Work Log 50건과 기존 Work Log 2,103건을 익명 집계했다.

| 후보 상황 | 건수 |
|---|---:|
| 같은 학생의 기존 Major 후보 없음 | 6 |
| 후보 1개 | 7 |
| 후보 2~3개 | 19 |
| 후보 4개 이상 | 18 |

- 50건 중 44건은 같은 학생의 기존 Work Log에서 Major 후보를 만들 수 있었다.
- 그중 43건은 실제 SOP에 연결된 Major가 후보 안에 있었다.
- 후보가 있는 경우의 포함률은 약 97.7%였다.
- 요청 시즌 `2026/27`만 사용하면 후보가 있는 사례가 16건으로 감소하므로 후보를 시즌으로 제한하지 않는다.

### 4.3 `입학 요강 1` 기본값 적중률

최근 SOP 50건 중 같은 학생에게 정확한 제목 `입학 요강 1`이 존재한 사례는 39건이었다. 그중 21건에서 `입학 요강 1`의 Major가 실제 SOP Major와 일치했다.

- 기본값 적중률은 약 54%다.
- 자동 확정값으로 쓰기에는 부족하지만, 파일 확인 전 먼저 보여주는 기본 선택으로는 유용하다.
- 사용자가 틀린 경우 즉시 다른 Major로 변경할 수 있어야 한다.
- 생성일이 가장 오래된 입학요강을 대신 선택하는 규칙은 39건 중 13건만 맞았으므로 사용하지 않는다.

### 4.4 입학요강 번호 상태

입학요강 Category의 Work Log 1,231건을 조사했다.

| 제목 상태 | 전체 | 2026-07-25 이후 |
|---|---:|---:|
| `입학 요강 N` 형식 | 1,193 | 26 |
| 번호 없는 `입학 요강` | 33 | 3 |
| 기타 제목 | 5 | 1 |

기존 Automation을 비활성화하면 신규 Work Log의 번호가 사후에 제거되는 원인은 사라진다. 기존 번호 누락 데이터는 SOP 기본 Major 결정 시 fallback 규칙으로 흡수한다.

## 5. 최종 사용자 흐름

```text
JANDI 게시물에 마우스를 올리고 매크로 키 입력
→ 기존 앱으로 게시물 전달
→ 입학요강 / SOP 감수 자동 판별
→ 담당자·학생·요청 시각·감수 차수 추출
→ 기존 Student 및 Agent 매칭
→ `입학 요강 1` 기준 학교·학과 기본 선택
→ J가 파일을 열어 언어와 학교·학과 확인
→ 맞으면 그대로 진행, 틀리면 `변경`으로 다른 Major 선택
→ Notion 미리보기 및 최종 확인
→ 완성된 SOP Work Log 한 건 생성
```

입학요강 요청은 기존 흐름을 그대로 사용한다. SOP 요청에서만 전공 추출 및 Word 생성 영역 대신 SOP 검토 영역을 표시한다.

## 6. 요청 유형과 차수 판별

### 6.1 요청 유형

다음 조건을 모두 만족하면 SOP 감수 요청으로 분류한다.

- 대소문자를 무시하고 `SOP`가 있다.
- `감수`가 있다.

`SOP`와 `감수`가 모두 없는 요청은 기존 입학요강 추출 흐름으로 보낸다. CV 또는 추천서만 언급된 요청은 SOP로 분류하지 않는다.

SOP 분류는 입학요강 첨부 파일명보다 우선한다. SOP 게시물에 `[2026입학요강]` PDF가 첨부되어 있어도 게시물의 업무 요청이 SOP 감수이면 SOP 흐름을 사용한다.

### 6.2 감수 차수

| 원문 | 추출 차수 |
|---|---:|
| `1차` 포함 | 1 |
| `2차` 포함 | 2 |
| `3차` 포함 | 3 |
| 차수 표현 없음 | 1 |

다음 상황은 자동 확정하지 않고 검토 필요 상태로 표시한다.

- 여러 차수 표현이 동시에 존재
- `4차` 이상 또는 지원하지 않는 차수
- `SOP`는 있으나 감수 요청인지 불명확함

추출된 차수는 `1차`, `2차`, `3차` 선택 버튼으로 항상 수정할 수 있다.

### 6.3 언어

- 기본값은 `영문`이다.
- 선택 가능 값은 `영문`, `국문`이다.
- 메시지에 `국문` 또는 `영문`이 명시된 경우 해당 값을 자동 선택할 수 있다.
- 메시지에 표시가 없으면 `영문`을 선택한 상태로 보여준다.
- J는 SOP 파일을 확인한 뒤 필요한 경우 `국문`으로 변경한다.

## 7. Student와 Agent 매칭

기존 Notion 미리보기 규칙을 재사용한다.

1. JANDI 게시물 작성자 이름으로 Agent exact match를 수행한다.
2. 학생 기본 이름으로 Student family를 조회한다.
3. 후보가 하나면 해당 Student를 선택한다.
4. 동명이인이 여러 명이면 Agent relation이 일치하는 Student를 우선한다.
5. 여전히 모호하면 기존 학생 선택 UI에서 J가 선택한다.

SOP 요청의 90% 이상은 기존 학생일 것으로 예상한다. 첫 구현에서는 Student를 찾지 못했거나 기존 Student를 확정하지 못하면 SOP 자동 생성을 차단하고 수동 처리를 안내한다. 신규 Student 생성과 전역 Major 검색은 후속 범위로 둔다.

## 8. 학교·학과 기본 선택 규칙

### 8.1 관계 단위

화면에는 학교와 학과를 함께 표시하지만 실제 저장 단위는 기존 Major page ID 하나다.

```text
Queen Mary · Corporate Finance
```

Major relation을 저장하면 University rollup이 자동으로 채워진다. 학교 dropdown과 학과 dropdown을 따로 제공하지 않는다.

### 8.2 후보 수집

선택된 Student가 연결된 기존 Work Log 중 Category가 `입학 요강`인 항목을 조회한다. 각 Work Log의 다음 값을 사용한다.

- Work Log page ID
- 작업 내용 title
- Major page ID
- Major 이름
- Major의 University relation과 University 이름
- Work Log created time

후보는 Major page ID 기준으로 중복 제거한다. 같은 Major가 여러 Work Log에 있으면 한 번만 표시한다.

### 8.3 기본값 결정 순서

1. 제목이 정확히 `입학 요강 1`이고 Major relation이 정확히 한 개인 Work Log가 있으면 해당 Major를 기본 선택한다.
2. `입학 요강 1`이 없고, 번호 없는 `입학 요강`이 정확히 하나이며 같은 학생에게 `입학 요강 2` 이상의 번호 항목이 있으면 번호 없는 항목을 1번으로 간주한다.
3. 위 조건을 만족하지 않지만 고유 Major 후보가 하나뿐이면 그 Major를 기본 선택한다.
4. 그 외에는 자동 선택하지 않고 후보 변경 목록을 바로 연다.

생성일이 가장 빠른 Work Log를 1번으로 추측하지 않는다.

### 8.4 기본값 변경

기본값이 있으면 화면에는 다음처럼 한 줄로 먼저 표시한다.

```text
Queen Mary · Corporate Finance
입학 요강 1 기준 자동 선택                         [변경]
```

`변경`을 누르면 같은 학생의 다른 고유 Major 후보를 펼친다.

```text
○ Queen Mary · Corporate Finance
○ KCL · Strategic Entrepreneurship & Innovation
○ Manchester · Real Estate Finance and Investment
```

기본값이 없어도 후보가 있으면 목록을 처음부터 펼친다. 후보가 없으면 Notion 생성을 차단하고 수동 처리 안내를 표시한다.

## 9. 기존 UI 유지 방안

### A. JANDI Input

기존 textarea, 매크로 입력, 자동 Analyze를 그대로 사용한다.

분석 후 요청 유형을 짧은 배지로 표시한다.

```text
SOP 감수 요청 · 자동 판별
```

### B. Extracted Request

기존 공통 필드를 유지한다.

- Requester
- Request date/time
- Student base name

SOP 요청이면 기존 `Programmes` 목록 대신 다음 SOP 검토 영역을 표시한다.

```text
SOP 감수 정보

차수       [1차] [2차] [3차]
언어       [영문] [국문]
학교·학과  Queen Mary · Corporate Finance       [변경]
```

### C. 학생 구분

SOP 요청에서는 기존 고객을 기본값으로 사용한다. 동명이인 선택 등 기존 Student 검토 UI는 재사용한다.

### D. Notion 생성 미리보기

SOP에서는 새 University 또는 Major를 생성하지 않는다. 다음 정보만 요약한다.

```text
담당자      기존 Agent 사용
학생        기존 Student 사용
학교·학과   기존 Major 사용
작업 내용   SOP 1차 감수(영문)
Category    SOP 감수(영문)
마감일      YYYY-MM-DD
요청 시즌   2026/27
```

### E/F. 입학요강 출력과 Word 생성

SOP 요청에서는 입학요강 파일명, 공통 학과명, 입학요강 Word 생성 영역을 숨긴다. SOP 문서의 내용 수정·생성은 범위 밖이다.

### G. JANDI 첨부파일 다운로드와 파일명 정규화

JANDI 첨부파일 자동 다운로드와 파일명 정규화는 Phase SOP-6에서 구현했다. 파일명에서 사람 이름을 새로 추측하지 않고, 같은 JANDI 본문을 기존 파서로 분석해 얻은 `studentName`을 해당 요청의 기준 학생명으로 사용한다.

SOP 첨부는 `.docx`와 `.pdf`를 지원한다. 다운로드가 완료된 파일은 다음 계약에 따라 `학생명_정리된 원래파일명.확장자` 형식으로 변경한다.

| 본문에서 확정된 학생명 | 받은 파일명 | 결과 파일명 |
|---|---|---|
| `은주하` | `SOP_1차_0731.docx` | `은주하_SOP_1차_0731.docx` |
| `은주하` | `Personal essay 최최종본_은주하.docx` | `은주하_Personal essay 최최종본.docx` |
| `은주하` | `Personal essay 최종(은주하).docx` | `은주하_Personal essay 최종.docx` |
| `오지석` | `SOP_오지석_초안.docx` | `오지석_SOP_초안.docx` |
| `은주하` | `Personal Statement final.pdf` | `은주하_Personal Statement final.pdf` |

파일명 정규화 규칙은 다음과 같다.

1. 파일명에 기준 학생명이 없으면 맨 앞에 `학생명_`을 추가한다.
2. 기준 학생명이 파일명 중간이나 끝에 있으면 기존 위치에서 제거하고 맨 앞으로 옮긴다.
3. `(학생명)`, `[학생명]`처럼 학생명만 감싼 괄호와 학생명 제거 뒤 남은 불필요한 공백·중복 구분자도 함께 정리한다.
4. 학생명 외의 원래 문구, 감수 차수, 날짜와 확장자는 보존한다.
5. 이미 정규화된 파일명에 다시 적용해도 결과가 바뀌지 않는 멱등성을 보장한다.
6. 정확히 일치하는 기준 학생명만 자동으로 제거한다. 유사 이름이나 오타를 추정해 삭제하지 않는다.

오류 가능성이 있는 파일은 다음과 같이 처리한다.

- 파일명에서 기준 학생명과 다른 등록 Student 이름이 정확히 발견되면 자동 이름 변경을 중단하고 본문 학생명과 파일명 학생명이 다르다는 경고를 표시한다.
- 오타 또는 등록되지 않은 이름처럼 확정할 수 없는 문자열은 억지로 사람 이름으로 분류하지 않는다. 변경 전·후 파일명을 확인하고 수동으로 수정할 수 있는 경로를 남긴다.
- 다운로드가 완료되지 않은 임시 파일에는 이름 변경을 적용하지 않는다.
- 같은 이름의 파일이 이미 존재할 때 기존 파일을 덮어쓰지 않는다. 첫 충돌은 `파일명 (2).docx`, 이후에는 `파일명 (3).docx` 순서로 비어 있는 이름을 사용한다.

기존 JANDI 가져오기 흐름은 마우스로 선택한 게시글 또는 댓글의 위치와 `.docx`·`.pdf` 첨부파일 이름을 함께 저장한다. 게시글 첨부와 댓글 첨부는 DOM 범위를 분리하여 답글의 처리 완료 파일을 원본 후보로 섞지 않는다.

브라우저 분석이 SOP 요청을 확정하면 다음 순서로 처리한다.

1. 다운로드 폴더의 기존 파일 상태를 먼저 기록하고 2분 감시를 시작한다.
2. 파일명에 SOP·Personal Statement·Personal Essay 등 명시적인 단서가 있는 후보가 하나면 선택한다.
3. 명시적인 후보가 없더라도 첨부가 하나뿐이거나 입학요강 등 참고 파일을 제외한 후보가 하나면 선택한다.
4. SOP 후보가 여러 개이거나 후보를 안전하게 구분할 수 없으면 자동 클릭하지 않고 화면에서 수동 다운로드를 안내한다.
5. 입학요강 등 참고 파일만 있으면 자동 다운로드하지 않는다.
6. 선택된 JANDI 첨부 카드의 실제 미리보기/다운로드 요소를 클릭한다. 환경에 따라 미리보기 창이 열리면 그 안의 다운로드 동작도 이어서 시도한다.
7. 임시 다운로드가 끝나 최종 파일 크기가 안정되면 학생명 기준으로 이름을 변경한다.

학생명 등 검토값이 바뀌어 감시를 다시 설정할 때는 같은 JANDI 첨부를 재클릭하지 않는다. 다운로드 폴더의 다른 DOCX/PDF 파일은 변경하지 않는다. 기본 감시 경로는 Windows `Downloads`이며, 다른 경로는 `.env`의 `JANDI_DOWNLOAD_DIR`로 지정한다.

## 10. Notion 저장 계약

SOP 요청당 Work Log 한 건을 생성한다.

| Work Log 속성 | 저장 규칙 |
|---|---|
| `작업 내용` | `SOP {차수}차 감수({언어})` |
| `Category` | `SOP 감수(영문)` 또는 `SOP 감수(국문)` |
| `Students` | 확정된 기존 Student page ID 한 개 |
| `Major` | 확정된 기존 Major page ID 한 개 |
| `마감일` | 요청일로부터 평일 2일 뒤 |
| `요청 시즌` | 현재 앱의 요청 시즌 값 |

직접 쓰지 않는 속성:

- Agent rollup
- University rollup
- Level rollup
- Status rollup
- SOP Word Count formula
- 완료일
- Hours

예시:

```text
작업 내용   SOP 1차 감수(국문)
Category    SOP 감수(국문)
Students    양원재
Major       Corporate Finance
University  Queen Mary     # Major에서 rollup
Agent       최승미         # Student에서 rollup
```

## 11. 서버 구현 방향

### 11.1 요청 모델

공통 요청에 유형을 추가한다.

```js
{
  requestType: 'admissions' | 'sop_review',
  requesterName: string,
  requestDateTime: string,
  studentName: string,
  programmes: [],
  sopReview: {
    round: 1 | 2 | 3,
    language: '영문' | '국문'
  }
}
```

입학요강 요청은 기존 `programmes` 계약을 유지한다. SOP 요청은 `programmes`를 요구하지 않는다.

### 11.2 읽기 전용 미리보기

SOP preview는 다음 순서로 수행한다.

1. Agent exact match
2. 기존 Student 확정
3. 해당 Student의 입학요강 Work Log 조회
4. Major와 University 후보 구성
5. 기본 Major 결정
6. SOP Work Log 예정값 반환

기존 Work Log repository에 Student 기준 입학요강과 Major 관계를 반환하는 전용 읽기 함수를 추가한다. raw Notion page 전체를 브라우저에 노출하지 않는다.

### 11.3 생성

쓰기 직전 서버가 다음을 다시 검증한다.

- `requestType === 'sop_review'`
- 유효한 요청 시각
- 차수 1~3
- 언어가 영문 또는 국문
- Agent exact match 1개
- 선택된 Student가 현재 후보에 포함됨
- 선택된 Major가 해당 Student의 현재 후보에 포함됨
- Work Log schema와 SOP Category options가 정상
- 동일 요청이 이미 처리되지 않음

검증 후 새 Student, University, Major는 만들지 않고 Work Log 한 건만 생성한다.

### 11.4 중복 방지

SOP fingerprint에는 다음 값을 포함한다.

- 요청 유형
- 정규화된 담당자 이름
- 요청 날짜와 시각
- Student page ID
- 감수 차수
- 언어
- Major page ID

같은 fingerprint의 동시 실행과 완료 후 재실행을 차단한다. 기존 in-flight lock과 secret-free creation journal을 재사용한다.

학교·학과나 언어를 수정하면 fingerprint와 미리보기를 무효화하고 다시 확인한다.

### 11.5 제목 저장

Notion Automation 비활성화를 선행 조건으로 한다. 그래도 앱은 생성한 Work Log에 한정하여 다음을 수행한다.

1. 완성된 SOP 제목을 create payload에 포함한다.
2. 생성 직후 저장된 제목을 재조회한다.
3. 예상 제목과 다르면 현재 요청에서 만든 page에만 제목을 다시 적용한다.
4. 기존 Work Log 제목은 자동 수정하지 않는다.

## 12. 오류와 fallback

| 상황 | 처리 |
|---|---|
| SOP와 감수 키워드가 명확함 | SOP 흐름 사용 |
| 차수 없음 | 1차 기본값 |
| 차수 충돌 또는 4차 이상 | 검토 필요, 생성 차단 |
| 언어 표시 없음 | 영문 기본값 |
| Agent 없음 또는 중복 | 기존처럼 생성 차단 |
| Student 동명이인 | 기존 Student 선택 UI 표시 |
| Student 없음 | 첫 버전에서는 수동 처리 안내 |
| `입학 요강 1` 있음 | 해당 Major 기본 선택 |
| 번호 없는 `입학 요강` + 2번 이상 있음 | 번호 없는 항목을 1번으로 간주 |
| 고유 Major 후보 하나 | 해당 Major 기본 선택 |
| 후보 여러 개, 기본값 없음 | 후보 목록에서 선택 요구 |
| Major 후보 없음 | 수동 처리 안내, 생성 차단 |
| Notion schema 불일치 | 생성 차단 |
| 제목 저장값 불일치 | 현재 생성 page만 재적용 후 검증 |

## 13. 테스트 계획

### 13.1 요청 판별

- `SOP 1차 감수요청`
- `SOP 감수 요청` → 1차
- `SOP2차 감수요청`
- `SOP 3차 감수 요청`
- 공백 없는 `SOP1차`
- 대소문자 변형 `sop`
- SOP 게시물에 `[2026입학요강]` 첨부 파일명이 포함된 사례
- CV 감수와 추천서 감수가 SOP로 오인되지 않는 사례
- 여러 차수와 4차 이상 차단

### 13.2 Student와 Major 기본값

- Student 후보 하나
- 동명이인 중 Agent relation으로 하나 확정
- Student 선택 미해결
- 정확한 `입학 요강 1`의 Major 기본 선택
- 번호 없는 `입학 요강`과 `입학 요강 2`가 함께 있는 fallback
- 고유 Major 하나뿐인 fallback
- 후보 여러 개이며 기본값 없음
- 후보 Major 중복 제거
- Major와 University 이름 묶음 표시
- Major relation 누락 또는 복수 relation 방어

### 13.3 UI

- 입학요강 요청에서는 기존 UI가 변하지 않음
- SOP 요청에서 Programme 및 Word 영역이 숨겨짐
- 영문 기본 선택
- 차수와 언어 변경 시 제목·Category 즉시 갱신
- `변경` 전에는 기본 Major 한 줄만 표시
- `변경` 후 후보 목록 표시
- Major 확정 전 생성 버튼 비활성화
- 입력 변경 후 기존 Notion 미리보기와 승인 무효화

### 13.4 Notion 생성

- 기존 Student와 Major만 재사용
- Work Log 한 건 생성
- Student·Major relation payload
- 영문/국문 Category payload
- 감수 차수가 포함된 title payload
- 평일 2일 마감일
- 요청 시즌
- fingerprint 중복 차단
- 부분 실패 journal
- 저장된 제목 재검증
- Make.com 관련 API 호출이 발생하지 않음

### 13.5 회귀 검증

- 기존 입학요강 추출 fixture 전체
- 대학·학과 매칭
- Notion preview와 생성
- Work Log 번호 제목
- Word 파일명 및 Word 생성
- JANDI 매크로 입력

## 14. 구현 단계

### Phase SOP-1 — 판별과 데이터 계약

- SOP 요청 유형 및 차수 추출
- 언어 기본값
- SOP validation 분기
- 실제 JANDI 예시 fixture와 회귀 테스트

### Phase SOP-2 — Student 및 Major 미리보기

- 기존 Student 확정
- Student의 입학요강 Work Log 및 Major 조회
- `입학 요강 1` 기본값과 번호 누락 fallback
- University와 Major를 묶은 브라우저용 후보 응답

### Phase SOP-3 — 기존 UI 내 조건부 SOP 검토 화면

- 요청 유형 배지
- 차수·언어 선택
- 기본 학교·학과 한 줄 표시
- `변경` 후보 목록
- SOP에서 불필요한 입학요강·Word 영역 숨김

### Phase SOP-4 — Notion 생성

- SOP 전용 preflight
- Work Log 한 건 create
- fingerprint, lock, journal 재사용
- 제목 저장 검증
- 생성 결과 링크

### Phase SOP-5 — Controlled live 검증

1. 업무용 Notion의 기존 Work Log 제목 Automation이 꺼졌는지 확인한다.
2. 실제 SOP 요청 한 건을 미리보기까지만 실행한다.
3. Student, Major, University, 차수, 언어, 제목, 마감일을 J가 확인한다.
4. 승인 후 Work Log 한 건을 생성한다.
5. Notion에서 relation, rollup, Category, 제목을 재확인한다.
6. Make.com 수동 전송 전 Google Sheets에 들어갈 값이 완성됐는지 확인한다.
7. Controlled live 성공 후 일반 사용 여부를 결정한다.

### Phase SOP-6 — JANDI 첨부파일 다운로드와 파일명 정규화

- 기존 JANDI 입력 흐름에서 분석한 `studentName`을 다운로드 작업에 전달
- 같은 JANDI 요청에서 선택한 SOP DOCX/PDF 첨부파일만 처리
- 게시물과 댓글 첨부 범위를 분리하고 선택한 원본 위치를 짧게 보존
- 다운로드 감시를 먼저 시작한 뒤 JANDI 첨부를 자동 클릭
- 단일 명확 후보 자동 선택, 다중·모호 후보 수동 선택, 참고 파일 제외
- 다운로드 완료 확인 후 임시 파일이 아닌 최종 파일에 이름 변경 적용
- 학생명 없음·뒤쪽·괄호 내부·중간 위치 사례를 하나의 정규화 함수로 처리
- 이미 정규화된 파일명에 대한 멱등성 보장
- 다른 등록 Student 이름과의 불일치 경고 및 자동 처리 중단
- 오타·미확정 이름에 대한 수동 수정 경로 제공
- 기존 파일 덮어쓰기 방지
- 실제 JANDI 다운로드를 포함한 Windows 환경 검증

로컬 구현과 자동 테스트, 브라우저의 자동·수동 상태 검증을 완료했다. 실제 JANDI DOM에서 게시글과 댓글 첨부가 분리되고 첨부 카드의 `onPreviewClick` 동작을 식별할 수 있음을 읽기 전용으로 확인했다. 실제 업무 게시물에서 자동 클릭 후 Windows에 파일이 저장되고 이름이 변경되는 end-to-end 확인은 남아 있다.

## 15. 완료 기준

1. 같은 매크로 입력으로 입학요강과 SOP를 자동 구분한다.
2. SOP의 담당자, 학생, 요청 시각, 차수를 추출한다.
3. 차수 미표기는 1차로 처리한다.
4. 언어는 영문을 기본값으로 표시하고 국문으로 변경할 수 있다.
5. 정확한 `입학 요강 1`이 있으면 해당 Major를 기본 선택한다.
6. 번호 누락 fallback이 생성일 추측 없이 동작한다.
7. 기본 Major가 틀리면 `변경`에서 다른 기존 Major를 선택할 수 있다.
8. Work Log에는 Student, Major, Category, 차수 포함 제목, 마감일, 요청 시즌이 저장된다.
9. University와 Agent rollup이 기대값으로 표시된다.
10. Notion Automation 없이 입학요강 및 SOP 제목이 유지된다.
11. Make.com과 Google Sheets 설정을 변경하지 않는다.
12. 기존 입학요강 및 Word 흐름의 전체 회귀 테스트가 통과한다.
13. SOP 첨부파일 이름에 학생명이 없으면 본문의 기준 학생명을 맨 앞에 추가한다.
14. 학생명이 파일명 중간·끝·괄호 안에 있으면 기존 위치에서 제거하고 맨 앞으로 옮긴다.
15. 학생명 외의 원래 파일명 정보와 확장자를 보존하며 중복 구분자를 정리한다.
16. 같은 파일명 정규화를 반복해도 결과가 더 바뀌지 않는다.
17. 본문 학생명과 다른 등록 Student 이름이 파일명에서 발견되면 자동 처리를 중단한다.
18. 다운로드 폴더의 무관한 파일과 다운로드 중인 임시 파일은 변경하지 않는다.
19. 명확한 SOP DOCX/PDF 후보 하나는 JANDI에서 자동 다운로드를 시작한다.
20. SOP 후보가 여러 개이거나 참고 파일만 있으면 임의의 파일을 클릭하지 않는다.

## 16. 범위 밖

- CV 감수 자동화
- 추천서 감수 자동화
- SOP 파일 내용 자동 분석
- 다운로드한 SOP 문서 자동 열기
- 학교별 글자 수 제한 자동 판독
- AI를 이용한 1지망 학교 추론
- 신규 Student 자동 생성
- 전역 University/Major 검색과 신규 Major 생성
- 과거 번호 누락 Work Log 일괄 정리
- Notion Automation 신규 구성
- Make.com 또는 Google Sheets 시나리오 변경
- SOP 문서 자체 편집 또는 생성
