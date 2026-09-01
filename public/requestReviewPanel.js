import { deriveProgrammeFields } from '/shared/normalization.js';
import { SOP_REQUEST_TYPE } from '/shared/sopReview.js';

export function createEmptyRequest() {
  return {
    requestType: 'admissions',
    requesterName: '',
    requestDateTime: '',
    studentName: '',
    programmes: [],
    extractionWarnings: [],
    sourceType: 'post',
    contextFallbacks: [],
    sopReview: null
  };
}

export function normalizeRequest(extraction) {
  return {
    requestType: extraction?.requestType ?? 'admissions',
    requesterName: extraction?.requesterName ?? '',
    requestDateTime: extraction?.requestDateTime ?? '',
    studentName: extraction?.studentName ?? '',
    programmes: (extraction?.programmes ?? []).map((programme) => deriveProgrammeFields({
      rawUniversityName: programme.rawUniversityName ?? programme.universityName ?? '',
      universityName: programme.universityName ?? '',
      universityAliasMatched: Boolean(programme.universityAliasMatched),
      universityAliasMatchSource: programme.universityAliasMatchSource ?? null,
      rawProgrammeName: programme.rawProgrammeName ?? programme.programmeNameOriginal ?? '',
      programmeNameOriginal: programme.programmeNameOriginal ?? '',
      programmeUrl: programme.programmeUrl ?? ''
    })),
    extractionWarnings: Array.isArray(extraction?.extractionWarnings)
      ? extraction.extractionWarnings
      : [],
    sourceType: extraction?.sourceType === 'comment' ? 'comment' : 'post',
    contextFallbacks: Array.isArray(extraction?.contextFallbacks)
      ? extraction.contextFallbacks
      : [],
    sopReview: extraction?.sopReview
      ? {
          round: Number(extraction.sopReview.round),
          language: extraction.sopReview.language ?? '영문'
        }
      : null
  };
}

export function validateRequest(request) {
  const errors = {};

  if (!request.requesterName.trim()) {
    errors.requesterName = '담당자 이름이 필요합니다.';
  }
  if (!request.requestDateTime.trim()) {
    errors.requestDateTime = '요청 일시가 필요합니다.';
  }
  if (!request.studentName.trim()) {
    errors.studentName = '학생 이름이 필요합니다.';
  }

  if (request.requestType === SOP_REQUEST_TYPE) {
    if (![1, 2, 3].includes(Number(request.sopReview?.round))) {
      errors.sopReviewRound = '감수 회차는 1차, 2차, 3차 중 하나여야 합니다.';
    }
    if (!['영문', '국문'].includes(request.sopReview?.language)) {
      errors.sopReviewRound = '언어를 선택해주세요.';
    }
    return errors;
  }

  if (request.programmes.length === 0) {
    errors.programmes = '학과를 하나 이상 입력해주세요.';
  }

  request.programmes.forEach((programme, index) => {
    if (!programme.universityName.trim()) {
      errors[`programmes.${index}.universityName`] = '대학 이름이 필요합니다.';
    }
    if (!programme.programmeNameOriginal.trim()) {
      errors[`programmes.${index}.programmeNameOriginal`] = '학과 이름이 필요합니다.';
    }
    if (!programme.programmeUrl.trim()) {
      errors[`programmes.${index}.programmeUrl`] = '학과 URL이 필요합니다.';
    }
  });

  return errors;
}

export function countUniqueRequestProgrammes(request) {
  const keys = request.programmes.map((programme) => [
    String(programme.universityName ?? '').trim().toLowerCase(),
    String(programme.majorSearchKey ?? '').trim().toLowerCase()
  ].join('|'));
  return Math.max(1, new Set(keys.filter((key) => key !== '|')).size);
}

export function initializeRequestReviewPanel({
  documentRef = document,
  getContext = () => ({ requestState: createEmptyRequest() }),
  onRequestChange = () => {},
  onSopReviewChange = () => {}
} = {}) {
  const elements = {
    requestTypeBadge: documentRef.querySelector('#request-type-badge'),
    programmeReviewBlock: documentRef.querySelector('#programme-review-block'),
    sopReviewBlock: documentRef.querySelector('#sop-review-block'),
    requesterName: documentRef.querySelector('#requester-name'),
    requestDateTime: documentRef.querySelector('#request-date-time'),
    studentName: documentRef.querySelector('#student-name'),
    extractionWarnings: documentRef.querySelector('#extraction-warnings'),
    programmeList: documentRef.querySelector('#programme-list'),
    addProgrammeButton: documentRef.querySelector('#add-programme-button'),
    sopRoundInputs: documentRef.querySelectorAll('input[name="sop-round"]'),
    sopLanguageInputs: documentRef.querySelectorAll('input[name="sop-language"]')
  };

  elements.addProgrammeButton.addEventListener('click', addProgramme);
  elements.sopRoundInputs.forEach((input) => {
    input.addEventListener('change', updateSopReview);
  });
  elements.sopLanguageInputs.forEach((input) => {
    input.addEventListener('change', updateSopReview);
  });
  for (const input of [elements.requesterName, elements.requestDateTime, elements.studentName]) {
    input.addEventListener('input', updateBaseFields);
  }

  return {
    render: renderRequestReview,
    renderErrors,
    reset: renderRequestReview
  };

  function renderRequestReview() {
    const { requestState } = getContext();
    elements.requesterName.value = requestState.requesterName;
    elements.requestDateTime.value = requestState.requestDateTime;
    elements.studentName.value = requestState.studentName;
    const requestTypeLabel = requestState.requestType === SOP_REQUEST_TYPE ? 'SOP 감수' : '입학요강';
    elements.requestTypeBadge.textContent = requestState.sourceType === 'comment'
      ? `${requestTypeLabel} · 댓글`
      : requestTypeLabel;
    elements.programmeReviewBlock.classList.toggle('hidden', requestState.requestType === SOP_REQUEST_TYPE);
    elements.sopReviewBlock.classList.toggle('hidden', requestState.requestType !== SOP_REQUEST_TYPE);
    renderSopControls(requestState);
    renderProgrammes(requestState);
  }

  function renderSopControls(requestState) {
    if (requestState.requestType !== SOP_REQUEST_TYPE) {
      return;
    }
    elements.sopRoundInputs.forEach((input) => {
      input.checked = Number(input.value) === Number(requestState.sopReview?.round);
    });
    elements.sopLanguageInputs.forEach((input) => {
      input.checked = input.value === requestState.sopReview?.language;
    });
  }

  function updateBaseFields() {
    const { requestState } = getContext();
    requestState.requesterName = elements.requesterName.value;
    requestState.requestDateTime = elements.requestDateTime.value;
    requestState.studentName = elements.studentName.value;
    onRequestChange({
      invalidationMessage: '입력값이 변경되어 Notion 항목을 다시 조회해야 합니다.',
      scheduleSopRearm: requestState.requestType === SOP_REQUEST_TYPE
    });
  }

  function updateSopReview() {
    const { requestState } = getContext();
    const round = Number([...elements.sopRoundInputs].find((input) => input.checked)?.value ?? 0);
    const language = [...elements.sopLanguageInputs].find((input) => input.checked)?.value ?? '';
    requestState.sopReview = { round, language };
    onSopReviewChange({ round, language });
  }

  function renderProgrammes(requestState) {
    elements.programmeList.innerHTML = '';
    renderExtractionWarnings(requestState.extractionWarnings);

    requestState.programmes.forEach((programme, index) => {
      const programmeWarnings = requestState.extractionWarnings.filter(
        (warning) => warning.programmeIndex === index
      );
      const status = getProgrammeStatus(programme, programmeWarnings);
      const urlDomain = getUrlDomain(programme.programmeUrl);
      const row = documentRef.createElement('div');
      row.className = `programme-row programme-row--${status.tone}`;
      row.innerHTML = `
        <div class="programme-card-header">
          <div class="programme-card-title">
            <h4>
              <span class="programme-number">${index + 1}.</span>
              ${escapeHtml(programme.universityName || 'University not set')}
              <span aria-hidden="true">·</span>
              ${escapeHtml(programme.notionMajorNameProposed || 'Programme not set')}
            </h4>
          </div>
          <span class="programme-status programme-status--${status.tone}">${escapeHtml(status.label)}</span>
        </div>
        ${programmeWarnings.length ? `
          <div class="programme-alert" role="alert">
            <strong>대학과 URL을 확인해주세요.</strong>
            ${programmeWarnings.map((warning) => `<p>${escapeHtml(formatExtractionWarning(warning))}</p>`).join('')}
          </div>
        ` : ''}
        <div class="programme-fields">
          <label>
            University name
            <input type="text" data-programme-index="${index}" data-field="universityName" value="${escapeHtml(programme.universityName)}">
            <span class="field-error" data-error-for="programmes.${index}.universityName"></span>
          </label>
          <label>
            Proposed Notion Major name
            <input type="text" data-programme-index="${index}" data-field="programmeNameOriginal" value="${escapeHtml(programme.notionMajorNameProposed)}">
            <span class="field-error" data-error-for="programmes.${index}.programmeNameOriginal"></span>
          </label>
          <div class="programme-url-field">
            <span class="field-label">Programme URL</span>
            <div class="programme-url-control">
              <details class="url-details" ${programme.programmeUrl ? '' : 'open'}>
                <summary>
                  <span class="url-domain">${escapeHtml(urlDomain || 'URL 없음')}</span>
                  <span class="url-edit-label">전체 주소 보기·수정</span>
                </summary>
                <label class="visually-hidden" for="programme-url-${index}">Programme ${index + 1} URL</label>
                <input id="programme-url-${index}" type="url" data-programme-index="${index}" data-field="programmeUrl" value="${escapeHtml(programme.programmeUrl)}">
              </details>
              <button
                type="button"
                class="secondary compact programme-remove-button"
                data-remove-programme="${index}"
                aria-label="Remove programme ${index + 1}"
              >Remove</button>
            </div>
            <span class="field-error" data-error-for="programmes.${index}.programmeUrl"></span>
          </div>
        </div>
        <details class="matching-details">
          <summary>매칭 상세 보기</summary>
          <div class="derived-fields">
            <label>
              Original university text
              <input type="text" value="${escapeHtml(programme.rawUniversityName || programme.universityName)}" readonly>
            </label>
            <label>
              University alias match
              <input type="text" value="${escapeHtml(programme.universityAliasMatched ? `${programme.universityName} · Matched by ${programme.universityAliasMatchSource}` : 'No alias match')}" readonly>
            </label>
            <label>
              Original Programme name
              <input type="text" value="${escapeHtml(programme.rawProgrammeName || programme.programmeNameOriginal)}" readonly>
            </label>
            <label>
              Major search key
              <input type="text" value="${escapeHtml(programme.majorSearchKey)}" readonly>
            </label>
          </div>
        </details>
        ${programme.inferredDegreeLabel ? `<p class="programme-review-note">URL에서 학위명 ${escapeHtml(programme.inferredDegreeLabel)}를 자동 보완했습니다.</p>` : ''}
        ${programme.needsMajorNameReview ? `<p class="programme-review-note">${escapeHtml(getDegreeReviewMessage(programme))}</p>` : ''}
      `;

      elements.programmeList.append(row);
    });

    elements.programmeList.querySelectorAll('[data-programme-index]').forEach((input) => {
      input.addEventListener('input', updateProgrammeField);
    });
    elements.programmeList.querySelectorAll('[data-remove-programme]').forEach((button) => {
      button.addEventListener('click', removeProgramme);
    });
  }

  function updateProgrammeField(event) {
    const { requestState } = getContext();
    const index = Number(event.target.dataset.programmeIndex);
    const field = event.target.dataset.field;
    requestState.extractionWarnings = requestState.extractionWarnings.filter(
      (warning) => warning.programmeIndex !== index
    );
    requestState.programmes[index][field] = event.target.value;
    requestState.programmes[index] = deriveProgrammeFields(requestState.programmes[index]);
    renderProgrammes(requestState);
    onRequestChange({
      invalidationMessage: '학과 정보가 변경되어 Notion 항목을 다시 조회해야 합니다.',
      scheduleSopRearm: false
    });
  }

  function addProgramme() {
    const { requestState } = getContext();
    requestState.programmes.push(deriveProgrammeFields({
      universityName: '',
      rawProgrammeName: '',
      programmeNameOriginal: '',
      programmeUrl: ''
    }));
    renderProgrammes(requestState);
    onRequestChange({
      invalidationMessage: '학과가 추가되어 Notion 항목을 다시 조회해야 합니다.',
      scheduleSopRearm: false
    });
  }

  function removeProgramme(event) {
    const { requestState } = getContext();
    const index = Number(event.target.dataset.removeProgramme);
    requestState.programmes.splice(index, 1);
    renderProgrammes(requestState);
    onRequestChange({
      invalidationMessage: '학과가 삭제되어 Notion 항목을 다시 조회해야 합니다.',
      scheduleSopRearm: false
    });
  }

  function renderExtractionWarnings(warnings) {
    elements.extractionWarnings.innerHTML = '';
    elements.extractionWarnings.classList.toggle('hidden', warnings.length === 0);
    if (!warnings.length) {
      return;
    }

    const heading = documentRef.createElement('strong');
    heading.textContent = `추출 문제 ${warnings.length}개를 발견했습니다.`;
    const list = documentRef.createElement('ul');
    for (const warning of warnings) {
      const item = documentRef.createElement('li');
      item.className = `warning-item warning-item--${warning.severity === 'error' ? 'error' : 'warning'}`;
      item.textContent = formatExtractionWarning(warning);
      list.append(item);
    }
    elements.extractionWarnings.append(heading, list);
  }

  function renderErrors(errors) {
    documentRef.querySelectorAll('[data-error-for]').forEach((element) => {
      element.textContent = errors[element.dataset.errorFor] ?? '';
    });
  }
}

function formatExtractionWarning(warning) {
  if (warning.code === 'university_domain_conflict') {
    return `학과 ${(warning.programmeIndex ?? 0) + 1}의 대학 연결이 서로 다릅니다. 글에서 연결된 대학: ${warning.writtenUniversityName} / URL 기준 대학: ${warning.domainUniversityName}. 바로 앞 학교명 또는 URL 위치를 확인해주세요.`;
  }
  if (warning.code === 'orphan_url') {
    return `연결될 학과명이 없는 URL이 있습니다: ${warning.programmeUrl}`;
  }
  if (warning.code === 'missing_programme_url') {
    return `URL이 없는 학과명이 있습니다: ${warning.programmeName}`;
  }
  return '입력 순서를 확인해주세요.';
}

function getProgrammeStatus(programme, warnings) {
  const missingRequiredField = !programme.universityName.trim()
    || !programme.programmeNameOriginal.trim()
    || !programme.programmeUrl.trim();
  if (missingRequiredField || warnings.some((warning) => warning.severity === 'error')) {
    return { tone: 'error', label: '확인 필요' };
  }
  if (programme.needsMajorNameReview || warnings.length) {
    return { tone: 'warning', label: '검토 필요' };
  }
  return { tone: 'success', label: '정상' };
}

function getDegreeReviewMessage(programme) {
  if (programme.degreeReviewReason === 'url-degree-ambiguous') {
    return `URL에서 복수 학위(${programme.urlDegreeLabels.join(', ')})가 확인되어 수동 확인이 필요합니다.`;
  }
  if (programme.degreeReviewReason === 'programme-url-degree-conflict') {
    return `학과명과 URL의 학위가 서로 달라 수동 확인이 필요합니다. URL 학위: ${programme.urlDegreeLabels[0]}`;
  }
  if (programme.degreeReviewReason === 'degree-missing') {
    return '학과명과 URL에서 학위명을 확인하지 못했습니다.';
  }
  return '학위 형식이 모호하여 수동 확인이 필요합니다.';
}

function getUrlDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
