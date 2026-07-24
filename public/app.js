import { calculateWeekdayDeadline } from '/shared/deadline.js';
import { generateProgrammeLabel, generateWordFilename } from '/shared/filename.js';
import { deriveProgrammeFields } from '/shared/normalization.js';
import { ADMISSIONS_CATEGORY, REQUEST_SEASON, getNextWorkLogTitles } from '/shared/workLog.js';

const emptyRequest = {
  requesterName: '',
  requestDateTime: '',
  studentName: '',
  programmes: [],
  extractionWarnings: []
};

let requestState = structuredClone(emptyRequest);
let notionPreviewState = null;
let clientMode = 'new';
let notionSchemaValid = false;

const elements = {
  jandiMessage: document.querySelector('#jandi-message'),
  analyzeButton: document.querySelector('#analyze-button'),
  clearButton: document.querySelector('#clear-button'),
  analysisStatus: document.querySelector('#analysis-status'),
  reviewSection: document.querySelector('#review-section'),
  studentModeSection: document.querySelector('#student-mode-section'),
  notionPreviewSection: document.querySelector('#notion-preview-section'),
  outputSection: document.querySelector('#output-section'),
  requesterName: document.querySelector('#requester-name'),
  requestDateTime: document.querySelector('#request-date-time'),
  studentName: document.querySelector('#student-name'),
  extractionWarnings: document.querySelector('#extraction-warnings'),
  programmeList: document.querySelector('#programme-list'),
  addProgrammeButton: document.querySelector('#add-programme-button'),
  clientModeInputs: document.querySelectorAll('input[name="client-type"]'),
  checkNotionButton: document.querySelector('#check-notion-button'),
  notionStatus: document.querySelector('#notion-status'),
  previewNotionButton: document.querySelector('#preview-notion-button'),
  notionPreviewStatus: document.querySelector('#notion-preview-status'),
  notionPlanSummary: document.querySelector('#notion-plan-summary'),
  notionPreview: document.querySelector('#notion-preview'),
  creationPlan: document.querySelector('#creation-plan'),
  creationPlanDetails: document.querySelector('#creation-plan-details'),
  creationReadiness: document.querySelector('#creation-readiness'),
  createNotionButton: document.querySelector('#create-notion-button'),
  workLogTitle: document.querySelector('#work-log-title'),
  deadline: document.querySelector('#deadline'),
  category: document.querySelector('#category'),
  requestSeason: document.querySelector('#request-season'),
  programmeLabel: document.querySelector('#programme-label'),
  wordFilename: document.querySelector('#word-filename'),
  copyFilenameButton: document.querySelector('#copy-filename-button'),
  copyStatus: document.querySelector('#copy-status')
};

elements.analyzeButton.addEventListener('click', analyzeMessage);
elements.clearButton.addEventListener('click', clearAll);
elements.addProgrammeButton.addEventListener('click', addProgramme);
elements.checkNotionButton.addEventListener('click', checkNotionConnection);
elements.previewNotionButton.addEventListener('click', previewNotionMatches);
elements.copyFilenameButton.addEventListener('click', copyFilename);
elements.jandiMessage.addEventListener('paste', handleJandiPaste);
document.addEventListener('keydown', handleJandiImportShortcut);

elements.clientModeInputs.forEach((input) => {
  input.addEventListener('change', updateClientMode);
});

for (const input of [elements.requesterName, elements.requestDateTime, elements.studentName]) {
  input.addEventListener('input', updateRequestFromBaseFields);
}

function handleJandiImportShortcut(event) {
  if (!(event.ctrlKey && event.altKey && event.shiftKey && event.code === 'F11')) {
    return;
  }

  event.preventDefault();
  elements.jandiMessage.focus();
  elements.jandiMessage.select();
  elements.analysisStatus.textContent = 'JANDI input ready. Paste the copied message.';
}

function handleJandiPaste() {
  window.setTimeout(() => {
    if (elements.jandiMessage.value.trim()) {
      analyzeMessage();
    }
  }, 0);
}

async function analyzeMessage() {
  const message = elements.jandiMessage.value.trim();
  if (!message) {
    elements.analysisStatus.textContent = 'Paste a JANDI message before analyzing.';
    return;
  }

  elements.analyzeButton.disabled = true;
  elements.analysisStatus.textContent = 'Analyzing with mocked structured extraction...';

  try {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });
    const payload = await response.json();

    requestState = normalizeRequest(payload.extraction);
    invalidateNotionPreview('');
    renderRequest();
    renderErrors(payload.errors ?? {});
    showSections();
    elements.analysisStatus.textContent = response.ok
      ? 'Extraction complete. Review every field before using the filename.'
      : 'Extraction needs correction. Missing fields are marked below.';
  } catch (error) {
    elements.analysisStatus.textContent = `Extraction failed: ${error.message}`;
  } finally {
    elements.analyzeButton.disabled = false;
  }
}

function clearAll() {
  requestState = structuredClone(emptyRequest);
  notionPreviewState = null;
  clientMode = 'new';
  notionSchemaValid = false;
  elements.jandiMessage.value = '';
  elements.analysisStatus.textContent = '';
  elements.copyStatus.textContent = '';
  elements.notionStatus.textContent = '확인 전';
  elements.notionPreviewStatus.textContent = '';
  elements.notionPlanSummary.classList.add('hidden');
  elements.creationPlan.classList.add('hidden');
  elements.clientModeInputs.forEach((input) => {
    input.checked = input.value === 'new';
  });
  elements.reviewSection.classList.add('hidden');
  elements.studentModeSection.classList.add('hidden');
  elements.notionPreviewSection.classList.add('hidden');
  elements.outputSection.classList.add('hidden');
}

async function checkNotionConnection() {
  elements.checkNotionButton.disabled = true;
  elements.notionStatus.textContent = '확인 중';

  try {
    const response = await fetch('/api/notion/schema');
    const payload = await response.json();
    notionSchemaValid = response.ok && payload?.ok === true;
    elements.notionStatus.textContent = summarizeNotionSchemaStatus(response, payload);
    renderCreationPlan();
  } catch (error) {
    notionSchemaValid = false;
    elements.notionStatus.textContent = `연결 실패 (${error.message})`;
    renderCreationPlan();
  } finally {
    elements.checkNotionButton.disabled = false;
  }
}

function summarizeNotionSchemaStatus(response, payload) {
  if (payload?.error?.code === 'NOTION_CONFIG_MISSING') {
    return '설정되지 않음';
  }

  if (!response.ok) {
    return '연결 실패';
  }

  if (payload?.ok) {
    return '연결 및 스키마 정상';
  }

  const results = Object.values(payload?.dataSources ?? {});
  if (results.some((result) => !result.accessible)) {
    return '연결 실패';
  }

  return '연결됨 · 스키마 확인 필요';
}

function showSections() {
  elements.reviewSection.classList.remove('hidden');
  elements.studentModeSection.classList.remove('hidden');
  elements.notionPreviewSection.classList.remove('hidden');
  elements.outputSection.classList.remove('hidden');
}

function renderRequest() {
  elements.requesterName.value = requestState.requesterName;
  elements.requestDateTime.value = requestState.requestDateTime;
  elements.studentName.value = requestState.studentName;
  renderProgrammes();
  renderDerivedOutput();
  updatePreviewButtonState();
}

function renderProgrammes() {
  elements.programmeList.innerHTML = '';
  renderExtractionWarnings();

  requestState.programmes.forEach((programme, index) => {
    const programmeWarnings = requestState.extractionWarnings.filter(
      (warning) => warning.programmeIndex === index
    );
    const status = getProgrammeStatus(programme, programmeWarnings);
    const urlDomain = getUrlDomain(programme.programmeUrl);
    const row = document.createElement('div');
    row.className = `programme-row programme-row--${status.tone}`;
    row.innerHTML = `
      <div class="programme-card-header">
        <div class="programme-card-title">
          <span class="programme-number">Programme ${index + 1}</span>
          <h4>${escapeHtml(programme.universityName || 'University not set')} <span aria-hidden="true">·</span> ${escapeHtml(programme.programmeNameOriginal || 'Programme not set')}</h4>
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
          Programme name
          <input type="text" data-programme-index="${index}" data-field="programmeNameOriginal" value="${escapeHtml(programme.programmeNameOriginal)}">
          <span class="field-error" data-error-for="programmes.${index}.programmeNameOriginal"></span>
        </label>
        <div class="programme-url-field">
          <span class="field-label">Programme URL</span>
          <details class="url-details" ${programme.programmeUrl ? '' : 'open'}>
            <summary>
              <span class="url-domain">${escapeHtml(urlDomain || 'URL 없음')}</span>
              <span class="url-edit-label">전체 주소 보기·수정</span>
            </summary>
            <label class="visually-hidden" for="programme-url-${index}">Programme ${index + 1} URL</label>
            <input id="programme-url-${index}" type="url" data-programme-index="${index}" data-field="programmeUrl" value="${escapeHtml(programme.programmeUrl)}">
          </details>
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
            <input type="text" value="${escapeHtml(programme.universityAliasMatched ? `Matched by ${programme.universityAliasMatchSource}` : 'No alias match')}" readonly>
          </label>
          <label>
            Major search key
            <input type="text" value="${escapeHtml(programme.majorSearchKey)}" readonly>
          </label>
          <label>
            Proposed Notion Major name
            <input type="text" value="${escapeHtml(programme.notionMajorNameProposed)}" readonly>
          </label>
        </div>
      </details>
      ${programme.needsMajorNameReview ? '<p class="programme-review-note">Degree format is ambiguous and should be reviewed before a later Notion creation phase.</p>' : ''}
      <div class="programme-actions">
        <button type="button" class="secondary compact" data-remove-programme="${index}">Remove</button>
      </div>
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

function renderExtractionWarnings() {
  const warnings = requestState.extractionWarnings;
  elements.extractionWarnings.innerHTML = '';
  elements.extractionWarnings.classList.toggle('hidden', warnings.length === 0);

  if (!warnings.length) {
    return;
  }

  const heading = document.createElement('strong');
  heading.textContent = `추출 문제 ${warnings.length}개를 발견했습니다.`;
  const list = document.createElement('ul');

  for (const warning of warnings) {
    const item = document.createElement('li');
    item.className = `warning-item warning-item--${warning.severity === 'error' ? 'error' : 'warning'}`;
    item.textContent = formatExtractionWarning(warning);
    list.append(item);
  }

  elements.extractionWarnings.append(heading, list);
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

function getUrlDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function renderDerivedOutput() {
  const programmeNames = requestState.programmes.map((programme) => programme.programmeNameOriginal);
  const programmeLabel = generateProgrammeLabel(programmeNames);

  const workLogTitles = notionPreviewState?.workLog?.titles
    ?? getNextWorkLogTitles([], countUniqueRequestProgrammes());
  elements.workLogTitle.value = formatWorkLogTitles(workLogTitles);
  elements.deadline.value = calculateWeekdayDeadline(requestState.requestDateTime);
  elements.category.value = ADMISSIONS_CATEGORY;
  elements.requestSeason.value = REQUEST_SEASON;
  elements.programmeLabel.value = programmeLabel;
  elements.wordFilename.value = generateWordFilename({
    studentName: requestState.studentName,
    programmeNames
  });

  renderNotionPreview();
  renderCreationPlan();
}

function renderNotionPreview() {
  elements.notionPreview.innerHTML = '';

  if (!notionPreviewState) {
    const ul = document.createElement('ul');
    for (const item of getPlaceholderPreviewItems()) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.append(li);
    }
    elements.notionPreview.append(ul);
    return;
  }

  elements.notionPreview.append(
    renderAgentPreview(notionPreviewState.agent),
    renderStudentPreview(notionPreviewState.student),
    ...notionPreviewState.programmes.map(renderProgrammePreview),
    renderWorkLogPreview(notionPreviewState.workLog)
  );
  bindPreviewInteractions();
}

function getPlaceholderPreviewItems() {
  if (!requestState.studentName) {
    return ['검토할 요청을 먼저 추출해주세요.'];
  }

  return [
    `담당자: ${requestState.requesterName || '검토된 담당자'} 이름으로 기존 항목을 찾습니다.`,
    `학생: ${requestState.studentName || '검토된 학생'} · ${clientMode === 'new' ? '신규 고객' : '기존 고객'} 모드`,
    ...requestState.programmes.map((programme) => `${programme.universityName || '대학'} / ${programme.notionMajorNameProposed || '학과'}: 미리보기 전`)
  ];
}

function updateRequestFromBaseFields() {
  invalidateNotionPreview('입력값이 변경되어 Notion 항목을 다시 조회해야 합니다.');
  requestState.requesterName = elements.requesterName.value;
  requestState.requestDateTime = elements.requestDateTime.value;
  requestState.studentName = elements.studentName.value;
  renderDerivedOutput();
  renderErrors(validateRequest(requestState));
  updatePreviewButtonState();
}

function updateProgrammeField(event) {
  invalidateNotionPreview('학과 정보가 변경되어 Notion 항목을 다시 조회해야 합니다.');
  const index = Number(event.target.dataset.programmeIndex);
  const field = event.target.dataset.field;
  requestState.extractionWarnings = requestState.extractionWarnings.filter(
    (warning) => warning.programmeIndex !== index
  );
  requestState.programmes[index][field] = event.target.value;
  requestState.programmes[index] = deriveProgrammeFields(requestState.programmes[index]);
  renderProgrammes();
  renderDerivedOutput();
  renderErrors(validateRequest(requestState));
  updatePreviewButtonState();
}

function addProgramme() {
  invalidateNotionPreview('학과가 추가되어 Notion 항목을 다시 조회해야 합니다.');
  requestState.programmes.push(deriveProgrammeFields({
    universityName: '',
    programmeNameOriginal: '',
    programmeUrl: ''
  }));
  renderProgrammes();
  renderDerivedOutput();
  renderErrors(validateRequest(requestState));
  updatePreviewButtonState();
}

function removeProgramme(event) {
  invalidateNotionPreview('학과가 삭제되어 Notion 항목을 다시 조회해야 합니다.');
  const index = Number(event.target.dataset.removeProgramme);
  requestState.programmes.splice(index, 1);
  renderProgrammes();
  renderDerivedOutput();
  renderErrors(validateRequest(requestState));
  updatePreviewButtonState();
}

function updateClientMode(event) {
  clientMode = event.target.value;
  invalidateNotionPreview('학생 구분이 변경되어 Notion 항목을 다시 조회해야 합니다.');
  renderDerivedOutput();
}

async function copyFilename() {
  const filename = elements.wordFilename.value.trim();
  if (!filename) {
    elements.copyStatus.textContent = 'Generate a filename before copying.';
    return;
  }

  try {
    await navigator.clipboard.writeText(filename);
    elements.copyStatus.textContent = 'Filename copied.';
  } catch {
    elements.wordFilename.select();
    document.execCommand('copy');
    elements.copyStatus.textContent = 'Filename copied.';
  }
}

function normalizeRequest(extraction) {
  return {
    requesterName: extraction?.requesterName ?? '',
    requestDateTime: extraction?.requestDateTime ?? '',
    studentName: extraction?.studentName ?? '',
    programmes: (extraction?.programmes ?? []).map((programme) => deriveProgrammeFields({
      rawUniversityName: programme.rawUniversityName ?? programme.universityName ?? '',
      universityName: programme.universityName ?? '',
      universityAliasMatched: Boolean(programme.universityAliasMatched),
      universityAliasMatchSource: programme.universityAliasMatchSource ?? null,
      programmeNameOriginal: programme.programmeNameOriginal ?? '',
      programmeUrl: programme.programmeUrl ?? ''
    })),
    extractionWarnings: Array.isArray(extraction?.extractionWarnings)
      ? extraction.extractionWarnings
      : []
  };
}

async function previewNotionMatches() {
  const errors = validateRequest(requestState);
  renderErrors(errors);
  updatePreviewButtonState();

  if (Object.keys(errors).length > 0) {
    elements.notionPreviewStatus.textContent = '입력 오류를 수정한 뒤 Notion 항목을 조회해주세요.';
    return;
  }

  elements.previewNotionButton.disabled = true;
  elements.notionPreviewStatus.textContent = 'Notion 항목을 읽기 전용으로 다시 확인하고 있습니다...';

  try {
    const response = await fetch('/api/notion/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientMode,
        requesterName: requestState.requesterName,
        requestDateTime: requestState.requestDateTime,
        studentName: requestState.studentName,
        programmes: requestState.programmes
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      notionPreviewState = null;
      elements.notionPreviewStatus.textContent = payload?.error?.message ?? 'Notion 미리보기에 실패했습니다.';
      renderDerivedOutput();
      return;
    }

    notionPreviewState = initializePhase3Review(payload);
    elements.notionPreviewStatus.textContent = payload.blockingIssues?.length
      ? '미리보기가 끝났습니다. 아래 확인 필요 항목을 검토해주세요.'
      : '미리보기가 끝났습니다.';
    renderDerivedOutput();
  } catch (error) {
    notionPreviewState = null;
    elements.notionPreviewStatus.textContent = `Notion 미리보기 실패: ${error.message}`;
    renderDerivedOutput();
  } finally {
    updatePreviewButtonState();
  }
}

async function updateWorkLogTitleForSelection(studentId) {
  if (!notionPreviewState) {
    return;
  }

  notionPreviewState.student.selectedStudentId = studentId;
  notionPreviewState.student.selection = {
    type: 'manual',
    studentId
  };
  notionPreviewState.workLog.title = '선택한 학생의 작업 일지 순번 확인 중...';
  notionPreviewState.workLog.titles = [notionPreviewState.workLog.title];
  renderDerivedOutput();

  try {
    const response = await fetch('/api/notion/work-log-title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        selectedStudentId: studentId,
        workLogCount: countUniqueRequestProgrammes()
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      elements.notionPreviewStatus.textContent = payload?.error?.message ?? '작업 일지 순번을 확인하지 못했습니다.';
      notionPreviewState.workLog.title = '기존 학생 선택 필요';
      notionPreviewState.workLog.titles = [notionPreviewState.workLog.title];
      renderDerivedOutput();
      return;
    }

    notionPreviewState.workLog = {
      ...notionPreviewState.workLog,
      ...payload.workLog
    };
    elements.notionPreviewStatus.textContent = '선택한 학생 기준 작업 일지 순번을 다시 계산했습니다.';
    renderDerivedOutput();
  } catch (error) {
    notionPreviewState.workLog.title = '기존 학생 선택 필요';
    notionPreviewState.workLog.titles = [notionPreviewState.workLog.title];
    elements.notionPreviewStatus.textContent = `작업 일지 순번 확인 실패: ${error.message}`;
    renderDerivedOutput();
  }
}

function invalidateNotionPreview(message) {
  if (notionPreviewState) {
    notionPreviewState = null;
    elements.notionPreviewStatus.textContent = message;
  }
}

function initializePhase3Review(payload) {
  const state = structuredClone(payload);

  for (const programme of state.programmes ?? []) {
    const needsCreate = programme.major.status === 'missing'
      || (programme.major.status === 'blocked' && programme.university.status === 'missing');
    if (needsCreate) {
      programme.major.reviewedCreateName = programme.major.proposedCreateName ?? '';
      programme.major.nameConfirmed = false;
    }
  }

  return state;
}

function renderCreationPlan() {
  if (!notionPreviewState) {
    elements.notionPlanSummary.classList.add('hidden');
    elements.creationPlan.classList.add('hidden');
    elements.createNotionButton.disabled = true;
    return;
  }

  const statistics = getCreationStatistics();
  const readiness = getCreationReadiness();
  const finalStudentName = getFinalStudentName();
  const linkedMajorNames = notionPreviewState.programmes.map((programme) => (
    programme.major.selected?.name
      ?? programme.major.reviewedCreateName
      ?? programme.major.proposedCreateName
      ?? programme.major.requestedOriginalName
  ));

  elements.notionPlanSummary.textContent = [
    '담당자 기존 사용',
    `학생 ${statistics.studentCreates ? '새로 생성' : '기존 항목 사용'}`,
    `대학 ${statistics.universityCreates}개 생성`,
    `학과 ${statistics.majorCreates}개 생성`,
    `작업 일지 ${statistics.workLogCreates}개 생성`
  ].join(' · ');
  elements.notionPlanSummary.classList.remove('hidden');

  elements.creationPlanDetails.innerHTML = `
    <dl class="plan-facts">
      <div><dt>최종 학생명</dt><dd>${escapeHtml(finalStudentName || '확인 필요')}</dd></div>
      <div><dt>마감일</dt><dd>${escapeHtml(notionPreviewState.workLog?.deadline || '확인 필요')}</dd></div>
      <div><dt>작업 일지 제목</dt><dd>${escapeHtml(formatWorkLogTitles(notionPreviewState.workLog?.titles) || '확인 필요')}</dd></div>
      <div><dt>새로 생성</dt><dd>${statistics.totalCreates}개</dd></div>
      <div><dt>기존 항목 사용</dt><dd>${statistics.totalReuses}개</dd></div>
    </dl>
    <div class="plan-major-list">
      <strong>연결할 학과 ${linkedMajorNames.length}개</strong>
      <ul>${linkedMajorNames.map((name) => `<li>${escapeHtml(name || '확인 필요')}</li>`).join('')}</ul>
    </div>
    ${readiness.reasons.length
      ? `<div class="readiness-reasons"><strong>생성 전 확인할 항목</strong><ul>${readiness.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>`
      : ''}
  `;
  elements.creationReadiness.textContent = readiness.ready
    ? '생성 계획 확인 완료'
    : `확인 필요 ${readiness.reasons.length}개`;
  elements.creationReadiness.classList.toggle('readiness-badge--ready', readiness.ready);
  elements.creationPlan.classList.remove('hidden');

  // Phase 3.2까지는 fake-client 검증만 허용한다. Gate B/C 승인 전에는 항상 비활성화한다.
  elements.createNotionButton.disabled = true;
  elements.createNotionButton.title = readiness.ready
    ? '통제된 live 1건 시험 승인 전까지 비활성화되어 있습니다.'
    : readiness.reasons.join(' / ');
}

function getCreationStatistics() {
  const universities = uniquePreviewEntities(
    notionPreviewState.programmes.map((programme) => ({
      key: programme.university.selected?.id
        ?? programme.university.requestedName?.trim().toLowerCase(),
      action: programme.university.status === 'missing' ? 'create' : 'reuse'
    }))
  );
  const majors = uniquePreviewEntities(
    notionPreviewState.programmes.map((programme) => ({
      key: [
        programme.university.selected?.id
          ?? programme.university.requestedName?.trim().toLowerCase(),
        programme.major.searchKey
      ].join('|'),
      action: programme.major.status === 'matched' ? 'reuse' : 'create'
    }))
  );
  const studentCreates = notionPreviewState.student.mode === 'new' ? 1 : 0;
  const universityCreates = universities.filter((item) => item.action === 'create').length;
  const majorCreates = majors.filter((item) => item.action === 'create').length;
  const workLogCreates = majors.length;
  const totalCreates = studentCreates + universityCreates + majorCreates + workLogCreates;
  const totalReuses = 1
    + (studentCreates ? 0 : 1)
    + universities.filter((item) => item.action === 'reuse').length
    + majors.filter((item) => item.action === 'reuse').length;

  return {
    studentCreates,
    universityCreates,
    majorCreates,
    workLogCreates,
    totalCreates,
    totalReuses
  };
}

function uniquePreviewEntities(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.key || seen.has(item.key)) {
      return false;
    }
    seen.add(item.key);
    return true;
  });
}

function getCreationReadiness() {
  const reasons = [];

  if (!notionSchemaValid) {
    reasons.push('연결 및 스키마 검사를 통과해야 합니다.');
  }
  if (Object.keys(validateRequest(requestState)).length > 0) {
    reasons.push('입력값 오류를 모두 수정해야 합니다.');
  }
  if (requestState.extractionWarnings.length > 0) {
    reasons.push('추출 경고를 모두 검토하고 수정해야 합니다.');
  }
  if (notionPreviewState.agent?.status !== 'matched') {
    reasons.push('담당자가 정확히 1개 일치해야 합니다.');
  }
  if (notionPreviewState.student?.mode === 'existing'
    && !notionPreviewState.student.selectedStudentId) {
    reasons.push('사용할 기존 학생을 선택해야 합니다.');
  }

  notionPreviewState.programmes.forEach((programme, index) => {
    if (!['matched', 'missing'].includes(programme.university.status)) {
      reasons.push(`학과 ${index + 1}의 대학을 확정해야 합니다.`);
    }

    const createsMajor = programme.major.status === 'missing'
      || (programme.major.status === 'blocked' && programme.university.status === 'missing');
    if (createsMajor) {
      if (!programme.major.reviewedCreateName?.trim() || !programme.major.nameConfirmed) {
        reasons.push(`학과 ${index + 1}의 새 Notion 이름을 확인해야 합니다.`);
      }
    } else if (programme.major.status !== 'matched') {
      reasons.push(`학과 ${index + 1}의 Notion 항목을 확정해야 합니다.`);
    }
  });

  return {
    ready: reasons.length === 0,
    reasons
  };
}

function getFinalStudentName() {
  if (notionPreviewState?.student?.mode === 'new') {
    return notionPreviewState.student.suggestedStudentName;
  }
  return getSelectedStudentName(notionPreviewState?.student);
}

function getSelectedStudentName(student) {
  return student?.candidates?.find(
    (candidate) => candidate.id === student.selectedStudentId
  )?.name ?? '';
}

function updatePreviewButtonState() {
  elements.previewNotionButton.disabled = Object.keys(validateRequest(requestState)).length > 0;
}

function renderAgentPreview(agent) {
  const card = createPreviewCard('담당자');
  card.append(
    paragraph(`상태: ${statusLabelForEntity(agent.status)}`),
    agent.selected
      ? paragraphWithLink('기존 담당자 사용: ', agent.selected)
      : paragraph(agent.status === 'missing'
          ? '요청자 이름과 일치하는 담당자가 없습니다.'
          : `같은 이름의 담당자 ${agent.candidateCount}개를 정리해야 합니다.`)
  );

  if (agent.candidates?.length) {
    card.append(renderLinkedList(agent.candidates));
  }

  return card;
}

function renderStudentPreview(student) {
  const card = createPreviewCard('학생');

  if (student.mode === 'new') {
    card.append(
      paragraph(`기본 이름: ${student.baseName}`),
      paragraph(`같은 이름 계열의 기존 학생: ${student.existingFamily?.length ?? 0}명`)
    );

    if (student.existingFamily?.length) {
      card.append(renderStudentList(student.existingFamily));
    }

    const label = document.createElement('label');
    label.textContent = '서버가 다시 계산할 최종 신규 학생명';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = student.suggestedStudentName ?? '';
    input.readOnly = true;
    label.append(input);
    card.append(label);
    return card;
  }

  card.append(
    paragraph(`기본 이름: ${student.baseName}`),
    paragraph(student.selectedStudentId
      ? `선택된 기존 학생: ${getSelectedStudentName(student)}`
      : '사용할 기존 학생을 선택해야 합니다.')
  );

  if (student.candidates?.length) {
    const list = document.createElement('div');
    for (const candidate of student.candidates) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'student-selection';
      input.value = candidate.id;
      input.checked = candidate.id === student.selectedStudentId;
      input.dataset.studentSelection = candidate.id;
      label.append(input, document.createTextNode(` ${candidate.name} (${candidate.agentNames?.join(', ') || '담당자 연결 없음'})`));
      if (candidate.url) {
        label.append(document.createTextNode(' '), notionLink(candidate));
      }
      list.append(label);
    }
    card.append(list);
  } else {
    card.append(paragraph('같은 이름 계열의 기존 학생이 없습니다.'));
  }

  return card;
}

function renderProgrammePreview(programme) {
  const card = createPreviewCard(`학과 ${programme.index + 1}`);
  card.append(
    paragraph(`검토된 원문: ${programme.officialProgrammeName || programme.major.requestedOriginalName}`),
    renderUniversityPreview(programme.university),
    renderMajorPreview(
      programme.major,
      programme.index,
      programme.university,
      programme.degreeNameWarning
    )
  );
  return card;
}

function renderUniversityPreview(university) {
  const section = document.createElement('div');
  const heading = document.createElement('h4');
  heading.textContent = `대학: ${statusLabelForUniversity(university.status)}`;
  section.append(heading);

  if (university.selected) {
    section.append(paragraphWithLink('기존 대학 사용: ', university.selected));
  } else if (university.status === 'missing') {
    section.append(paragraph(`새로 생성할 이름: ${university.proposedCreateName}`));
  } else if (university.candidates?.length) {
    section.append(renderLinkedList(university.candidates));
  } else {
    section.append(paragraph(`요청된 이름: ${university.requestedName}`));
  }

  return section;
}

function renderMajorPreview(major, programmeIndex, university, degreeNameWarning) {
  const section = document.createElement('div');
  const heading = document.createElement('h4');
  const effectiveStatus = major.status === 'blocked' && university.status === 'missing'
    ? 'missing'
    : major.status;
  heading.textContent = `학과: ${statusLabelForMajor(effectiveStatus)}`;
  section.append(heading);

  if (major.selected) {
    section.append(paragraphWithLink('기존 학과 사용: ', major.selected));
    if (degreeNameWarning) {
      const warning = paragraph(
        `학위명 누락 경고: 기존 학과명 “${degreeNameWarning.existingMajorName}”에는 `
        + `원문의 학위명 ${degreeNameWarning.expectedDegreeLabel}가 없습니다. `
        + '기존 항목은 수정하지 않고 그대로 사용합니다.'
      );
      warning.className = 'programme-review-note';
      warning.setAttribute('role', 'status');
      section.append(warning);
    }
  } else if (effectiveStatus === 'missing') {
    const label = document.createElement('label');
    label.textContent = '새로 생성할 Notion 학과명';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = major.reviewedCreateName ?? major.proposedCreateName ?? '';
    input.dataset.majorCreateName = String(programmeIndex);
    label.append(input);

    const confirmation = document.createElement('label');
    confirmation.className = 'major-confirmation';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = major.nameConfirmed === true;
    checkbox.dataset.majorNameConfirmation = String(programmeIndex);
    confirmation.append(
      checkbox,
      document.createTextNode(' 이 이름으로 생성하는 것을 확인했습니다.')
    );
    section.append(label, confirmation);
  } else if (major.candidates?.length) {
    section.append(renderLinkedList(major.candidates));
  } else if (major.status === 'blocked') {
    section.append(paragraph('대학이 확정되어야 학과를 다시 조회할 수 있습니다.'));
  }

  return section;
}

function renderWorkLogPreview(workLog) {
  const card = createPreviewCard('작업 일지');
  card.append(
    paragraph(`생성 개수: ${workLog.count}개 (학과별 1개)`),
    paragraph(`제목: ${formatWorkLogTitles(workLog.titles)}`),
    paragraph(`마감일: ${workLog.deadline}`),
    paragraph(`Category: ${workLog.category}`),
    paragraph(`요청 시즌: ${workLog.requestSeason}`)
  );
  return card;
}

function countUniqueRequestProgrammes() {
  const keys = requestState.programmes.map((programme) => [
    String(programme.universityName ?? '').trim().toLowerCase(),
    String(programme.majorSearchKey ?? '').trim().toLowerCase()
  ].join('|'));
  return Math.max(1, new Set(keys.filter((key) => key !== '|')).size);
}

function formatWorkLogTitles(titles = []) {
  return Array.isArray(titles) ? titles.filter(Boolean).join(' · ') : '';
}

function bindPreviewInteractions() {
  elements.notionPreview.querySelectorAll('[data-student-selection]').forEach((input) => {
    input.addEventListener('change', (event) => updateWorkLogTitleForSelection(event.target.value));
  });

  elements.notionPreview.querySelectorAll('[data-major-create-name]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const programme = notionPreviewState?.programmes?.[Number(event.target.dataset.majorCreateName)];
      if (programme) {
        programme.major.reviewedCreateName = event.target.value;
        programme.major.nameConfirmed = false;
        renderCreationPlan();
      }
    });
  });

  elements.notionPreview.querySelectorAll('[data-major-name-confirmation]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const programme = notionPreviewState?.programmes?.[Number(event.target.dataset.majorNameConfirmation)];
      if (programme) {
        programme.major.nameConfirmed = event.target.checked;
        renderCreationPlan();
      }
    });
  });
}

function createPreviewCard(title) {
  const card = document.createElement('div');
  card.className = 'preview-card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  card.append(heading);
  return card;
}

function paragraph(text) {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function paragraphWithLink(prefix, item) {
  const element = document.createElement('p');
  element.append(document.createTextNode(prefix), notionLink(item));
  return element;
}

function renderLinkedList(items) {
  const list = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    li.append(notionLink(item));
    list.append(li);
  }
  return list;
}

function renderStudentList(students) {
  const list = document.createElement('ul');
  for (const student of students) {
    const li = document.createElement('li');
    li.append(document.createTextNode(`${student.name} (${student.agentNames?.join(', ') || '담당자 연결 없음'})`));
    if (student.url) {
      li.append(document.createTextNode(' '), notionLink(student));
    }
    list.append(li);
  }
  return list;
}

function notionLink(item) {
  if (!item?.url) {
    return document.createTextNode(item?.name ?? item?.id ?? 'Untitled');
  }

  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = item.name ?? item.id;
  return link;
}

function statusLabelForUniversity(status) {
  return {
    matched: '기존 항목 사용',
    missing: '새로 생성',
    ambiguous: '선택 필요',
    error: '연결 오류'
  }[status] ?? '확인 필요';
}

function statusLabelForMajor(status) {
  return {
    matched: '기존 항목 사용',
    missing: '새로 생성',
    ambiguous: '선택 필요',
    blocked: '대학 확인 필요'
  }[status] ?? '확인 필요';
}

function statusLabelForEntity(status) {
  return {
    matched: '기존 항목 사용',
    missing: '찾을 수 없음',
    ambiguous: '선택 필요'
  }[status] ?? '확인 필요';
}

function validateRequest(request) {
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

function renderErrors(errors) {
  document.querySelectorAll('[data-error-for]').forEach((element) => {
    element.textContent = errors[element.dataset.errorFor] ?? '';
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
