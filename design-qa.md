# Programme Extraction Review Design QA

- Source visual truth: user-provided `C:\Users\Marion\Desktop\IMG 002.png` and the six approved UI changes in the conversation
- Implementation screenshot: `C:\Users\Marion\Documents\Projects\admission-guidelines-automation\artifacts\programme-extraction-warnings-review-2026-07-21.png`
- Viewport: 1377 × 1105
- State: the supplied Sussex/SOAS misplaced-link JANDI message after extraction

## Full-view comparison evidence

The original screen gave the three editable fields and four derived fields nearly equal visual weight. The revised screen keeps University, Programme, and URL in the default card, adds a compact University · Programme heading and status badge, and moves matching metadata into a closed details section. The extraction-level warning summary appears before the cards, while the programme with a university/domain conflict receives a red border and an inline explanation.

## Focused region comparison evidence

The programme review region was captured separately because the full-page browser capture repeated content during rendering. The focused screenshot confirms:

- three extraction warnings are visible above the cards;
- the valid Sussex card has a green `정상` status;
- the conflicting SOAS card has a red `확인 필요` status, red edge, and inline conflict copy;
- URLs default to `sussex.ac.uk` and `soas.ac.uk` rather than full paths;
- matching metadata is collapsed by default;
- both `매칭 상세 보기` and `전체 주소 보기·수정` open successfully.

## Required fidelity surfaces

- Fonts and typography: existing Arial/Helvetica stack and hierarchy were preserved; status and programme summaries add a clearer reading order without introducing a new type system.
- Spacing and layout rhythm: normal cards are materially shorter because URL paths and derived fields are collapsed; three-column alignment remains consistent with the existing product.
- Colors and visual tokens: semantic red, amber, and green tokens were added with text labels so state is not communicated by color alone.
- Image quality and asset fidelity: no raster imagery or custom icons are present in the source or implementation, so this surface is not applicable.
- Copy and content: warnings name the exact conflict, orphan URL, and missing-URL programme. Existing Notion-area copy remains unchanged because it is outside this iteration.

## Findings

No actionable P0, P1, or P2 findings remain in the requested programme extraction scope.

## Interaction and browser checks

- Primary interactions tested: Analyze, matching-details disclosure, URL-details disclosure
- Console errors and warnings: none
- Automated tests: 54 passed, 0 failed

## Comparison history

- Initial implementation: the full-page capture repeated content, so it was rejected as focused visual evidence.
- Fix/evidence adjustment: a same-state 1377 × 1105 viewport capture of the programme review region was taken and inspected. No code change was required from this capture.

## Follow-up polish

- P3: translate or simplify the remaining programme action labels in a later whole-app language pass.
- P3: revisit Notion Preview and Final Output hierarchy during Phase 3 as explicitly deferred.

final result: passed
