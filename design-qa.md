# Notion Preview Density Design QA

- Source visual truth:
  - `C:\Users\Marion\Desktop\IMG 006.png`
  - `C:\Users\Marion\Desktop\IMG 007.png`
- Browser-rendered implementation screenshot: `C:\Users\Marion\Documents\Projects\jd_to_notion\artifacts\notion-preview-density-2026-07-25.png`
- Side-by-side comparison: `C:\Users\Marion\Documents\Projects\jd_to_notion\artifacts\notion-preview-density-comparison-2026-07-25.png`
- Browser viewport: 491 × 918 CSS px
- Source pixels: 734 × 387 and 400 × 212
- Implementation pixels: 491 × 918
- Density normalization: the implementation's focused 442 × 367 region was scaled to the stacked source height for the comparison canvas. The original implementation screenshot remains unscaled evidence.
- State: existing-client Notion preview for 양원재 with two Student candidates and one matched Sussex / Gender and Development Major

## Full-view comparison evidence

The rendered mobile-width preview keeps the existing card and typography system while substantially shortening both requested areas. The Student card is approximately 224 CSS px high and the matched programme card is approximately 107 CSS px high. Neither card overflows the 491 px viewport.

## Focused region comparison evidence

The focused comparison shows the two Student candidates as compact selectable rows. Each 13 px radio sits 8 px from its linked name rather than at the far edge of the card. The duplicate unlinked name line is removed, and the Agent name remains next to the linked Student name.

The matched programme card contains exactly three visible lines:

- `학과 1 원문: Gender and Development`
- `대학: 기존 항목 사용 (Sussex)`
- `학과: 기존 항목 사용 (Gender and Development MA)`

The University and Major names remain Notion links inside their parenthetical values.

## Required fidelity surfaces

- Fonts and typography: the existing Arial/Helvetica stack, weights, and line heights remain unchanged. Bold labels provide the same scan hierarchy as the source annotations without adding another heading row.
- Spacing and layout rhythm: candidate controls are grouped into 42 px rows with an 8 px control-to-name gap. The programme result uses a 4 px three-line grid and removes redundant status/link lines.
- Colors and visual tokens: existing neutral, accent, and selected-state colors are reused. The selected row adds only the existing accent border and a light background.
- Image quality and asset fidelity: these surfaces contain no imagery, logos, or custom icons.
- Copy and content: the requested three programme lines appear verbatim. Student candidate names and Agent context each appear once.

## Findings

No actionable P0, P1, or P2 findings remain in the requested Notion preview scope.

## Responsive and interaction checks

- The 491 × 918 viewport has no horizontal overflow in either updated card.
- The whole Student row is a label-backed click target.
- Selecting `양원재 B (최승미)` checks the radio, applies the selected-row state, updates the selected Student summary, and triggers the existing work-log title refresh.
- Actual read-only Notion preview data was used; no creation request was sent.
- Browser console errors and warnings: none.
- Automated tests: 84 passed, 0 failed.

## Comparison history

- Source state: matched University and Major each used separate status and link lines; Student radios were stretched to the far edge by global input/label styles.
- Implemented fix: combined matched entity status and link into one line, collapsed the programme card to three lines, and introduced compact label-backed Student selection rows.
- Post-fix evidence: the focused comparison shows adjacent radios and names, no duplicated candidate-name line, and the exact three-line programme summary.

## Follow-up polish

- P3: a future whole-section pass could compact the 담당자 and 작업 일지 cards using the same summary-line pattern.

final result: passed
