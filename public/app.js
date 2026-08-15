import { calculateWeekdayDeadline } from '/shared/deadline.js';
import { generateProgrammeLabel, generateWordFilename } from '/shared/filename.js';
import { deriveProgrammeFields } from '/shared/normalization.js';
import { ADMISSIONS_CATEGORY, REQUEST_SEASON, getNextWorkLogTitles } from '/shared/workLog.js';
import {
  SOP_REQUEST_TYPE,
  getSopCategory,
  getSopWorkLogTitle
} from '/shared/sopReview.js';

const emptyRequest = {
  requestType: 'admissions',
  requesterName: '',
  requestDateTime: '',
  studentName: '',
  programmes: [],
  extractionWarnings: [],
  sopReview: null
};

let requestState = structuredClone(emptyRequest);
let notionPreviewState = null;
let clientMode = 'new';
let notionSchemaValid = false;
let notionCreationEnabled = false;
let isCreatingNotion = false;
let creationCompleted = false;
let wordEnvironmentState = null;
let isGeneratingWord = false;
let programmeLabelOverride = null;
let sopCandidatesExpanded = false;
let sopDownloadContextId = '';
let sopDownloadPollTimer = null;
let sopDownloadRearmTimer = null;
let sopDownloadRequestSequence = 0;

const elements = {
  jandiMessage: document.querySelector('#jandi-message'),
  analyzeButton: document.querySelector('#analyze-button'),
  clearButton: document.querySelector('#clear-button'),
  analysisStatus: document.querySelector('#analysis-status'),
  reviewSection: document.querySelector('#review-section'),
  requestTypeBadge: document.querySelector('#request-type-badge'),
  programmeReviewBlock: document.querySelector('#programme-review-block'),
  sopReviewBlock: document.querySelector('#sop-review-block'),
  sopDownloadStatus: document.querySelector('#sop-download-status'),
  sopMajorSelection: document.querySelector('#sop-major-selection'),
  studentModeSection: document.querySelector('#student-mode-section'),
  notionPreviewSection: document.querySelector('#notion-preview-section'),
  outputSection: document.querySelector('#output-section'),
  wordGenerationSection: document.querySelector('#word-generation-section'),
  requesterName: document.querySelector('#requester-name'),
  requestDateTime: document.querySelector('#request-date-time'),
  studentName: document.querySelector('#student-name'),
  extractionWarnings: document.querySelector('#extraction-warnings'),
  programmeList: document.querySelector('#programme-list'),
  addProgrammeButton: document.querySelector('#add-programme-button'),
  clientModeInputs: document.querySelectorAll('input[name="client-type"]'),
  clientModeNote: document.querySelector('#client-mode-note'),
  sopRoundInputs: document.querySelectorAll('input[name="sop-round"]'),
  sopLanguageInputs: document.querySelectorAll('input[name="sop-language"]'),
  notionStatus: document.querySelector('#notion-status'),
  previewNotionButton: document.querySelector('#preview-notion-button'),
  notionPreviewStatus: document.querySelector('#notion-preview-status'),
  notionPlanSummary: document.querySelector('#notion-plan-summary'),
  notionPreview: document.querySelector('#notion-preview'),
  creationPlan: document.querySelector('#creation-plan'),
  creationPlanDetails: document.querySelector('#creation-plan-details'),
  creationReadiness: document.querySelector('#creation-readiness'),
  creationGateNote: document.querySelector('#creation-gate-note'),
  creationResult: document.querySelector('#creation-result'),
  createNotionButton: document.querySelector('#create-notion-button'),
  workLogTitle: document.querySelector('#work-log-title'),
  deadline: document.querySelector('#deadline'),
  category: document.querySelector('#category'),
  requestSeason: document.querySelector('#request-season'),
  programmeLabel: document.querySelector('#programme-label'),
  wordFilename: document.querySelector('#word-filename'),
  copyFilenameButton: document.querySelector('#copy-filename-button'),
  copyStatus: document.querySelector('#copy-status'),
  wordStatus: document.querySelector('#word-status'),
  wordDegreeInputs: document.querySelectorAll('input[name="word-degree"]'),
  wordReadiness: document.querySelector('#word-readiness'),
  wordSummary: document.querySelector('#word-summary'),
  wordResult: document.querySelector('#word-result'),
  generateWordButton: document.querySelector('#generate-word-button'),
  wordGenerationStatus: document.querySelector('#word-generation-status')
};

elements.analyzeButton.addEventListener('click', analyzeMessage);
elements.clearButton.addEventListener('click', clearAll);
elements.addProgrammeButton.addEventListener('click', addProgramme);
elements.previewNotionButton.addEventListener('click', previewNotionMatches);
elements.createNotionButton.addEventListener('click', createNotionRecords);
elements.copyFilenameButton.addEventListener('click', copyFilename);
elements.generateWordButton.addEventListener('click', generateWordFile);
elements.wordFilename.addEventListener('input', () => {
  invalidateWordSummary('파일명 변경을 Word 생성 예정 내용에 반영했습니다.');
  renderWordPanel();
});
elements.programmeLabel.addEventListener('input', () => {
  programmeLabelOverride = elements.programmeLabel.value;
  elements.wordFilename.value = generateWordFilename({
    studentName: getFinalStudentName() || requestState.studentName,
    programmeNames: [programmeLabelOverride]
  });
  invalidateWordSummary('공통 학과명 변경을 파일명과 Word 생성 예정 내용에 반영했습니다.');
  renderWordPanel();
});
elements.jandiMessage.addEventListener('paste', handleJandiPaste);
document.addEventListener('keydown', handleJandiImportShortcut);

elements.clientModeInputs.forEach((input) => {
  input.addEventListener('change', updateClientMode);
});

elements.sopRoundInputs.forEach((input) => {
  input.addEventListener('change', updateSopReview);
});
elements.sopLanguageInputs.forEach((input) => {
  input.addEventListener('change', updateSopReview);
});

elements.wordDegreeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    invalidateWordSummary('과정 변경을 Word 생성 예정 내용에 반영했습니다.');
    renderWordPanel();
  });
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
    configureRequestType();
    programmeLabelOverride = null;
    sopCandidatesExpanded = false;
    invalidateNotionPreview('');
    renderRequest();
    renderErrors(payload.errors ?? {});
    showSections();
    elements.analysisStatus.textContent = response.ok
      ? 'Extraction complete. Review every field before using the filename.'
      : 'Extraction needs correction. Missing fields are marked below.';
    if (response.ok && requestState.requestType === SOP_REQUEST_TYPE) {
      void armSopDownload();
    } else {
      void cancelSopDownload();
    }
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
  notionCreationEnabled = false;
  isCreatingNotion = false;
  creationCompleted = false;
  wordEnvironmentState = null;
  isGeneratingWord = false;
  programmeLabelOverride = null;
  sopCandidatesExpanded = false;
  void cancelSopDownload();
  elements.jandiMessage.value = '';
  elements.analysisStatus.textContent = '';
  elements.copyStatus.textContent = '';
  elements.notionStatus.textContent = '확인 전';
  elements.wordStatus.textContent = '확인 전';
  elements.notionPreviewStatus.textContent = '';
  elements.wordGenerationStatus.textContent = '';
  elements.notionPlanSummary.classList.add('hidden');
  elements.creationPlan.classList.add('hidden');
  resetCreationResult();
  resetWordResult();
  elements.wordSummary.classList.add('hidden');
  elements.wordDegreeInputs.forEach((input) => {
    input.checked = input.value === '석사';
  });
  elements.clientModeInputs.forEach((input) => {
    input.checked = input.value === 'new';
    input.disabled = false;
  });
  elements.reviewSection.classList.add('hidden');
  elements.studentModeSection.classList.add('hidden');
  elements.notionPreviewSection.classList.add('hidden');
  elements.outputSection.classList.add('hidden');
  elements.wordGenerationSection.classList.add('hidden');
}

async function checkNotionConnection() {
  elements.notionStatus.textContent = '확인 중';

  try {
    const response = await fetch('/api/notion/schema');
    const payload = await response.json();
    notionSchemaValid = response.ok && payload?.ok === true;
    notionCreationEnabled = notionSchemaValid && payload?.creationEnabled === true;
    elements.notionStatus.textContent = summarizeNotionSchemaStatus(response, payload);
    renderCreationPlan();
    return notionSchemaValid;
  } catch (error) {
    notionSchemaValid = false;
    notionCreationEnabled = false;
    elements.notionStatus.textContent = `연결 실패 (${error.message})`;
    renderCreationPlan();
    return false;
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
  const isSop = requestState.requestType === SOP_REQUEST_TYPE;
  elements.reviewSection.classList.remove('hidden');
  elements.studentModeSection.classList.remove('hidden');
  elements.notionPreviewSection.classList.remove('hidden');
  elements.outputSection.classList.toggle('hidden', isSop);
  elements.wordGenerationSection.classList.toggle('hidden', isSop);
  if (!isSop) {
    checkWordStatus();
  }
}

function renderRequest() {
  elements.requesterName.value = requestState.requesterName;
  elements.requestDateTime.value = requestState.requestDateTime;
  elements.studentName.value = requestState.studentName;
  elements.requestTypeBadge.textContent = requestState.requestType === SOP_REQUEST_TYPE
    ? 'SOP 감수'
    : '입학요강';
  elements.programmeReviewBlock.classList.toggle('hidden', requestState.requestType === SOP_REQUEST_TYPE);
  elements.sopReviewBlock.classList.toggle('hidden', requestState.requestType !== SOP_REQUEST_TYPE);
  renderSopControls();
  renderProgrammes();
  renderDerivedOutput();
  updatePreviewButtonState();
}

function configureRequestType() {
  const isSop = requestState.requestType === SOP_REQUEST_TYPE;
  clientMode = isSop ? 'existing' : 'new';
  elements.clientModeInputs.forEach((input) => {
    input.checked = input.value === clientMode;
    input.disabled = isSop && input.value === 'new';
  });
  elements.clientModeNote.textContent = isSop
    ? 'SOP 감수는 기존 학생만 지원합니다. 담당자 연결까지 일치하는 학생을 사용합니다.'
    : '학생 구분을 바꾸면 Notion 항목을 다시 조회해야 합니다.';
}

function renderSopControls() {
  if (requestState.requestType !== SOP_REQUEST_TYPE) {
    return;
  }
  elements.sopRoundInputs.forEach((input) => {
    input.checked = Number(input.value) === Number(requestState.sopReview?.round);
  });
  elements.sopLanguageInputs.forEach((input) => {
    input.checked = input.value === requestState.sopReview?.language;
  });
  renderSopMajorSelection();
}

function updateSopReview() {
  const round = Number([...elements.sopRoundInputs].find((input) => input.checked)?.value ?? 0);
  const language = [...elements.sopLanguageInputs].find((input) => input.checked)?.value ?? '';
  requestState.sopReview = { round, language };
  if (notionPreviewState) {
    const title = getSopWorkLogTitle(round, language);
    notionPreviewState.workLog = {
      ...notionPreviewState.workLog,
      title,
      titles: [title],
      category: getSopCategory(language)
    };
    creationCompleted = false;
    resetCreationResult();
    elements.notionPreviewStatus.textContent = '감수 회차·언어 변경을 생성 계획에 반영했습니다.';
  }
  renderDerivedOutput();
  renderErrors(validateRequest(requestState));
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
      ${programme.needsMajorNameReview ? '<p class="programme-review-note">Degree format is ambiguous and should be reviewed before a later Notion creation phase.</p>' : ''}
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
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    const title = notionPreviewState?.workLog?.title
      ?? getSopWorkLogTitle(requestState.sopReview?.round, requestState.sopReview?.language);
    elements.workLogTitle.value = title;
    elements.deadline.value = calculateWeekdayDeadline(requestState.requestDateTime);
    elements.category.value = getSopCategory(requestState.sopReview?.language);
    elements.requestSeason.value = REQUEST_SEASON;
    renderSopMajorSelection();
    renderNotionPreview();
    renderCreationPlan();
    return;
  }

  const programmeNames = requestState.programmes.map((programme) => programme.programmeNameOriginal);
  const programmeLabel = programmeLabelOverride ?? generateProgrammeLabel(programmeNames);
  const finalStudentName = getFinalStudentName() || requestState.studentName;

  const workLogTitles = notionPreviewState?.workLog?.titles
    ?? getNextWorkLogTitles([], countUniqueRequestProgrammes());
  elements.workLogTitle.value = formatWorkLogTitles(workLogTitles);
  elements.deadline.value = calculateWeekdayDeadline(requestState.requestDateTime);
  elements.category.value = ADMISSIONS_CATEGORY;
  elements.requestSeason.value = REQUEST_SEASON;
  elements.programmeLabel.value = programmeLabel;
  elements.wordFilename.value = generateWordFilename({
    studentName: finalStudentName,
    programmeNames: [programmeLabel]
  });

  renderNotionPreview();
  renderCreationPlan();
  renderWordPanel();
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

  const previewCards = [
    renderAgentPreview(notionPreviewState.agent),
    renderStudentPreview(notionPreviewState.student)
  ];
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    previewCards.push(renderSopMajorPreview(notionPreviewState.sopReview));
  } else {
    previewCards.push(...notionPreviewState.programmes.map(renderProgrammePreview));
  }
  previewCards.push(renderWorkLogPreview(notionPreviewState.workLog));
  elements.notionPreview.append(...previewCards);
  bindPreviewInteractions();
}

function getPlaceholderPreviewItems() {
  if (!requestState.studentName) {
    return ['검토할 요청을 먼저 추출해주세요.'];
  }

  if (requestState.requestType === SOP_REQUEST_TYPE) {
    return [
      `담당자: ${requestState.requesterName || '검토된 담당자'} 이름으로 기존 항목을 찾습니다.`,
      `학생: ${requestState.studentName || '검토된 학생'} · 기존 고객 모드`,
      '학교·학과: 학생의 입학요강 기록에서 자동 선택합니다.'
    ];
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
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    scheduleSopDownloadRearm();
  }
}

function scheduleSopDownloadRearm() {
  window.clearTimeout(sopDownloadRearmTimer);
  sopDownloadRearmTimer = window.setTimeout(() => {
    void armSopDownload();
  }, 500);
}

async function armSopDownload() {
  const studentName = requestState.studentName.trim();
  const message = elements.jandiMessage.value.trim();
  const requestSequence = ++sopDownloadRequestSequence;

  stopSopDownloadPolling();
  if (!studentName || !message || requestState.requestType !== SOP_REQUEST_TYPE) {
    renderSopDownloadStatus({ status: 'not_armed', reason: 'student_name_missing' });
    return;
  }

  renderSopDownloadStatus({ status: 'preparing' });
  try {
    const response = await fetch('/api/sop-download/arm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, message })
    });
    const status = await response.json();
    if (requestSequence !== sopDownloadRequestSequence) {
      return;
    }

    sopDownloadContextId = status.id ?? '';
    renderSopDownloadStatus(status);
    if (status.status === 'armed') {
      pollSopDownloadStatus();
    }
  } catch (error) {
    renderSopDownloadStatus({
      status: 'error',
      reason: 'download_arm_failed',
      message: error.message
    });
  }
}

function pollSopDownloadStatus() {
  stopSopDownloadPolling();

  const poll = async () => {
    if (!sopDownloadContextId) {
      return;
    }

    try {
      const response = await fetch(`/api/sop-download/status?id=${encodeURIComponent(sopDownloadContextId)}`);
      const status = await response.json();
      if (!response.ok) {
        renderSopDownloadStatus({ status: 'error', reason: status.reason ?? 'status_failed' });
        return;
      }

      renderSopDownloadStatus(status);
      if (status.status === 'armed') {
        sopDownloadPollTimer = window.setTimeout(poll, 750);
      }
    } catch (error) {
      renderSopDownloadStatus({
        status: 'error',
        reason: 'status_failed',
        message: error.message
      });
    }
  };

  sopDownloadPollTimer = window.setTimeout(poll, 750);
}

async function cancelSopDownload() {
  sopDownloadRequestSequence += 1;
  window.clearTimeout(sopDownloadRearmTimer);
  stopSopDownloadPolling();
  sopDownloadContextId = '';
  try {
    await fetch('/api/sop-download/cancel', { method: 'POST' });
  } catch {
    // The app can still clear its local state if the local server is restarting.
  }
}

function stopSopDownloadPolling() {
  window.clearTimeout(sopDownloadPollTimer);
  sopDownloadPollTimer = null;
}

function renderSopDownloadStatus(status = {}) {
  const attachments = (status.attachmentNames ?? []).join(' · ');
  let tone = 'neutral';
  let message = 'SOP 요청을 분석하면 첨부파일 이름 자동 정리를 준비합니다.';

  if (status.status === 'preparing') {
    tone = 'working';
    message = 'SOP 첨부파일과 학생 이름을 확인하고 있습니다...';
  } else if (status.status === 'armed') {
    tone = 'working';
    message = `파일명 자동 정리 준비됨 · JANDI에서 ${attachments} 파일을 다운로드하세요.`;
    if (status.rosterCheck === 'unavailable') {
      message += ' 다른 Student 이름 대조는 현재 사용할 수 없습니다.';
    }
  } else if (status.status === 'completed') {
    tone = 'success';
    message = status.originalFilename === status.filename
      ? `파일명 확인 완료 · ${status.filename}`
      : `파일명 정리 완료 · ${status.originalFilename} → ${status.filename}`;
    if (status.collisionSuffixApplied) {
      message += ' 기존 파일을 보존하기 위해 번호를 붙였습니다.';
    }
  } else if (status.status === 'conflict') {
    tone = 'error';
    message = `자동 정리 중단 · 본문 학생명 ${status.studentName || requestState.studentName}과 파일명의 ${
      (status.conflictingStudentNames ?? []).join(', ') || '다른 Student 이름'
    }이 일치하지 않습니다.`;
  } else if (status.status === 'timed_out') {
    tone = 'warning';
    message = '2분 동안 해당 SOP 다운로드를 찾지 못했습니다. 다시 Analyze한 뒤 다운로드해주세요.';
  } else if (status.status === 'not_armed' && status.reason === 'docx_attachment_not_found') {
    tone = 'warning';
    message = '이 JANDI 메시지에서 .docx 첨부파일 이름을 찾지 못해 자동 정리를 준비하지 않았습니다.';
  } else if (status.status === 'not_armed') {
    tone = 'warning';
    message = '학생 이름을 확인한 뒤 파일명 자동 정리를 다시 준비해주세요.';
  } else if (status.status === 'error') {
    tone = 'error';
    message = status.reason === 'downloads_directory_unavailable'
      ? '다운로드 폴더를 찾지 못했습니다. JANDI_DOWNLOAD_DIR 설정을 확인해주세요.'
      : `파일명 자동 정리를 시작하지 못했습니다${status.message ? `: ${status.message}` : '.'}`;
  }

  elements.sopDownloadStatus.dataset.tone = tone;
  elements.sopDownloadStatus.textContent = message;
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
    rawProgrammeName: '',
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

async function checkWordStatus() {
  elements.wordStatus.textContent = '확인 중';

  try {
    const response = await fetch('/api/word/status');
    const payload = await response.json();
    wordEnvironmentState = response.ok ? payload : null;
    elements.wordStatus.textContent = summarizeWordStatus(response, payload);
  } catch (error) {
    wordEnvironmentState = null;
    elements.wordStatus.textContent = `확인 실패 (${error.message})`;
  } finally {
    renderWordPanel();
  }
}

function summarizeWordStatus(response, payload) {
  if (!response.ok) {
    return payload?.error?.message ?? '상태 확인 실패';
  }
  if (!payload.enabled) {
    return '기능 비활성화';
  }
  if (!payload.template?.valid) {
    return payload.template?.issues?.[0]?.message ?? '템플릿 확인 필요';
  }
  if (!payload.output?.writable) {
    return payload.output?.issues?.[0]?.message ?? '저장 폴더 확인 필요';
  }
  return payload.ready ? '준비 완료' : '확인 필요';
}

function renderWordSummary(payload) {
  elements.wordSummary.innerHTML = `
    <div class="word-summary-heading">
      <div>
        <p class="eyebrow">자동 요약</p>
        <h3>Word 생성 예정 내용</h3>
      </div>
      <span class="readiness-badge readiness-badge--ready">입력값 확정</span>
    </div>
    <dl class="plan-facts">
      <div><dt>최종 학생명</dt><dd>${escapeHtml(payload.studentName)}</dd></div>
      <div><dt>과정</dt><dd>[${escapeHtml(payload.degree)}]</dd></div>
      <div><dt>Programme Label</dt><dd>${escapeHtml(payload.programmeLabel)}</dd></div>
      <div><dt>전공 수</dt><dd>${payload.programmes.length}개</dd></div>
      <div class="wide"><dt>저장 예정 파일명</dt><dd>${escapeHtml(payload.filename)}</dd></div>
    </dl>
    <ol class="word-programme-summary">
      ${payload.programmes.map((programme) => `
        <li>
          <strong>${escapeHtml(programme.rawUniversityName)}</strong>
          <span>${escapeHtml(programme.reviewedMajorName)}</span>
          <small>${escapeHtml(programme.programmeUrl)}</small>
        </li>
      `).join('')}
    </ol>
  `;
  elements.wordSummary.classList.remove('hidden');
}

async function generateWordFile() {
  const readiness = getWordReadiness();
  const payload = buildWordPayload();
  if (!readiness.ready || !wordEnvironmentState?.ready || isGeneratingWord) {
    renderWordPanel();
    return;
  }

  isGeneratingWord = true;
  elements.wordGenerationStatus.textContent = 'Word 파일을 만들고 있습니다...';
  resetWordResult();
  renderWordPanel();

  try {
    const response = await fetch('/api/word/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      elements.wordResult.className = 'creation-result creation-result--error';
      elements.wordResult.innerHTML = `
        <h3>Word 생성 확인 필요</h3>
        <p>${escapeHtml(result?.error?.message ?? 'Word 파일을 만들지 못했습니다.')}</p>
      `;
      elements.wordGenerationStatus.textContent = 'Word 파일이 생성되지 않았습니다.';
      if (result?.error?.code === 'WORD_GENERATION_DISABLED'
        || result?.error?.code === 'WORD_TEMPLATE_INVALID'
        || result?.error?.code === 'WORD_OUTPUT_UNAVAILABLE') {
        await checkWordStatus();
      }
      return;
    }

    elements.wordResult.className = 'creation-result creation-result--success';
    elements.wordResult.innerHTML = `
      <h3>Word 파일 생성 완료</h3>
      <p><strong>${escapeHtml(result.filename)}</strong></p>
      <p class="word-output-path">${escapeHtml(result.outputPath)}</p>
      <p><strong>${escapeHtml(result.folderCreated ? '작업 폴더 생성' : '기존 작업 폴더 사용')}</strong></p>
      <p class="word-output-path">${escapeHtml(result.folderPath)}</p>
      <p>Word는 자동으로 열지 않았습니다.</p>
    `;
    elements.wordGenerationStatus.textContent = `${result.programmeCount}개 전공이 포함된 Word 파일을 저장하고 작업 폴더를 준비했습니다.`;
  } catch (error) {
    elements.wordResult.className = 'creation-result creation-result--error';
    elements.wordResult.innerHTML = `
      <h3>Word 생성 확인 필요</h3>
      <p>${escapeHtml(`로컬 서버 요청에 실패했습니다: ${error.message}`)}</p>
    `;
    elements.wordGenerationStatus.textContent = 'Word 파일이 생성되지 않았습니다.';
  } finally {
    isGeneratingWord = false;
    renderWordPanel();
  }
}

function renderWordPanel() {
  const readiness = getWordReadiness();
  const payload = buildWordPayload();
  renderWordReadiness(readiness);
  if (readiness.ready) {
    renderWordSummary(payload);
  } else {
    elements.wordSummary.classList.add('hidden');
  }

  const canGenerate = readiness.ready
    && wordEnvironmentState?.ready === true
    && !isGeneratingWord;
  elements.generateWordButton.disabled = !canGenerate;
  elements.generateWordButton.textContent = isGeneratingWord
    ? 'Word 파일 생성 중...'
    : 'Word 파일 만들기';
  elements.generateWordButton.title = canGenerate
    ? '현재 확정값으로 새 DOCX 파일을 바로 저장합니다.'
    : getWordGenerationBlockReason(readiness);
}

function renderWordReadiness(readiness) {
  const reasons = [...readiness.reasons];

  if (readiness.ready && wordEnvironmentState === null) {
    reasons.push('Word 템플릿 상태를 확인하고 있습니다.');
  } else if (readiness.ready && wordEnvironmentState?.ready !== true) {
    reasons.push(getWordEnvironmentBlockReason());
  }

  const ready = readiness.ready
    && wordEnvironmentState?.ready === true;
  elements.wordReadiness.className = ready
    ? 'word-readiness word-readiness--ready'
    : 'word-readiness word-readiness--blocked';
  elements.wordReadiness.innerHTML = ready
    ? '<strong>Word 파일을 만들 준비가 끝났습니다.</strong>'
    : `
      <strong>파일 만들기 버튼이 비활성화된 이유</strong>
      <ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
    `;
}

function getWordEnvironmentBlockReason() {
  if (!wordEnvironmentState?.enabled) {
    return '서버의 Word 생성 기능 설정이 꺼져 있습니다.';
  }
  if (!wordEnvironmentState?.template?.valid) {
    return wordEnvironmentState?.template?.issues?.[0]?.message
      ?? 'Word 템플릿 확인이 필요합니다.';
  }
  if (!wordEnvironmentState?.output?.writable) {
    return 'Word 저장 폴더를 사용할 수 없습니다.';
  }
  return 'Word 상태를 다시 확인해주세요.';
}

function getWordGenerationBlockReason(readiness) {
  if (!readiness.ready) {
    return readiness.reasons.join(' / ');
  }
  return getWordEnvironmentBlockReason();
}

function getWordReadiness() {
  const reasons = [];
  const finalStudentName = getFinalStudentName();
  const programmeLabel = elements.programmeLabel.value.trim();
  const filename = elements.wordFilename.value.trim();

  if (!notionPreviewState) {
    reasons.push('Notion 항목 미리보기를 먼저 완료해야 합니다.');
  }
  if (!finalStudentName) {
    reasons.push('최종 학생명을 확정해야 합니다.');
  }
  if (requestState.extractionWarnings.length > 0) {
    reasons.push('추출 경고를 모두 검토하고 수정해야 합니다.');
  }
  if (!programmeLabel) {
    reasons.push('Programme Label을 확인해야 합니다.');
  }
  if (!filename) {
    reasons.push('Word 파일명을 입력해야 합니다.');
  } else if (filename.includes('..') || /[\\/]/.test(filename)) {
    reasons.push('Word 파일명에는 폴더 경로나 상대 경로를 사용할 수 없습니다.');
  }
  if (requestState.programmes.length === 0) {
    reasons.push('전공이 한 개 이상 있어야 합니다.');
  }

  requestState.programmes.forEach((programme, index) => {
    if (!(programme.rawUniversityName || programme.universityName)?.trim()) {
      reasons.push(`전공 ${index + 1}의 원문 학교명이 필요합니다.`);
    }
    if (!programme.programmeUrl?.trim()) {
      reasons.push(`전공 ${index + 1}의 URL이 필요합니다.`);
    }
    if (!getReviewedMajorName(index)) {
      reasons.push(`전공 ${index + 1}의 최종 Notion 전공명을 확정해야 합니다.`);
    }
  });

  return {
    ready: reasons.length === 0,
    reasons
  };
}

function buildWordPayload() {
  return {
    studentName: getFinalStudentName(),
    degree: getWordDegree(),
    filename: elements.wordFilename.value.trim(),
    programmeLabel: elements.programmeLabel.value.trim(),
    programmes: requestState.programmes.map((programme, index) => ({
      rawUniversityName: (programme.rawUniversityName || programme.universityName || '').trim(),
      reviewedMajorName: getReviewedMajorName(index),
      programmeUrl: programme.programmeUrl.trim()
    }))
  };
}

function getReviewedMajorName(index) {
  const major = notionPreviewState?.programmes?.[index]?.major;
  if (major?.status === 'matched') {
    return major.selected?.name?.trim() ?? '';
  }

  const createsMajor = major?.status === 'missing'
    || (major?.status === 'blocked'
      && notionPreviewState?.programmes?.[index]?.university?.status === 'missing');
  if (createsMajor && major?.nameConfirmed) {
    return major.reviewedCreateName?.trim()
      || major.proposedCreateName?.trim()
      || '';
  }

  return '';
}

function getWordDegree() {
  return [...elements.wordDegreeInputs].find((input) => input.checked)?.value ?? '석사';
}

function invalidateWordSummary(message = '') {
  elements.wordSummary.classList.add('hidden');
  resetWordResult();
  if (message) {
    elements.wordGenerationStatus.textContent = message;
  }
}

function resetWordResult() {
  elements.wordResult.innerHTML = '';
  elements.wordResult.className = 'creation-result hidden';
}

function normalizeRequest(extraction) {
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
    sopReview: extraction?.sopReview
      ? {
          round: Number(extraction.sopReview.round),
          language: extraction.sopReview.language ?? '영문'
        }
      : null
  };
}

async function previewNotionMatches(selectedStudentId = '') {
  const errors = validateRequest(requestState);
  renderErrors(errors);
  updatePreviewButtonState();

  if (Object.keys(errors).length > 0) {
    elements.notionPreviewStatus.textContent = '입력 오류를 수정한 뒤 Notion 항목을 조회해주세요.';
    return;
  }

  invalidateWordSummary('Notion 항목 확인 뒤 Word 생성 예정 내용을 자동 표시합니다.');
  notionPreviewState = null;
  elements.previewNotionButton.disabled = true;
  elements.previewNotionButton.textContent = 'Notion 연결 및 항목 확인 중...';
  elements.notionPreviewStatus.textContent = '연결과 스키마를 자동 검사하고 있습니다...';

  try {
    const schemaReady = await checkNotionConnection();
    if (!schemaReady) {
      elements.notionPreviewStatus.textContent = 'Notion 연결 또는 스키마 문제를 해결한 뒤 다시 확인해주세요.';
      renderDerivedOutput();
      return;
    }

    elements.notionPreviewStatus.textContent = 'Notion 항목을 읽기 전용으로 확인하고 있습니다...';
    const response = await fetch('/api/notion/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestType: requestState.requestType,
        clientMode,
        requesterName: requestState.requesterName,
        requestDateTime: requestState.requestDateTime,
        studentName: requestState.studentName,
        programmes: requestState.programmes,
        sopReview: requestState.sopReview,
        selectedStudentId: typeof selectedStudentId === 'string'
          ? selectedStudentId
          : notionPreviewState?.student?.selectedStudentId ?? '',
        selectedMajorId: notionPreviewState?.sopReview?.selectedMajorId ?? ''
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
    invalidateWordSummary('Notion 확인 결과를 Word 생성 예정 내용에 반영했습니다.');
    creationCompleted = false;
    resetCreationResult();
    elements.notionPreviewStatus.textContent = payload.blockingIssues?.length
      ? '미리보기가 끝났습니다. 아래 확인 필요 항목을 검토해주세요.'
      : '미리보기가 끝났습니다.';
    renderDerivedOutput();
  } catch (error) {
    notionPreviewState = null;
    elements.notionPreviewStatus.textContent = `Notion 미리보기 실패: ${error.message}`;
    renderDerivedOutput();
  } finally {
    elements.previewNotionButton.textContent = notionPreviewState
      ? 'Notion 항목 다시 확인'
      : 'Notion 항목 확인';
    updatePreviewButtonState();
  }
}

async function updateWorkLogTitleForSelection(studentId) {
  if (!notionPreviewState) {
    return;
  }

  if (requestState.requestType === SOP_REQUEST_TYPE) {
    await previewNotionMatches(studentId);
    return;
  }

  invalidateWordSummary('최종 학생 변경을 Word 생성 예정 내용에 반영했습니다.');
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
  creationCompleted = false;
  resetCreationResult();
  invalidateWordSummary(message
    ? `${message} Notion 항목을 다시 확인하면 Word 생성 예정 내용도 자동 갱신됩니다.`
    : 'Notion 항목을 다시 확인하면 Word 생성 예정 내용도 자동 갱신됩니다.');
}

function initializePhase3Review(payload) {
  const state = structuredClone(payload);

  if (state.requestType === SOP_REQUEST_TYPE) {
    sopCandidatesExpanded = !state.sopReview?.selectedMajorId;
    return state;
  }

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
    elements.createNotionButton.textContent = 'Notion에 기록 생성';
    elements.createNotionButton.title = 'Notion 미리보기를 먼저 완료해야 합니다.';
    return;
  }

  const statistics = getCreationStatistics();
  const readiness = getCreationReadiness();
  const finalStudentName = getFinalStudentName();
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    renderSopCreationPlan({ statistics, readiness, finalStudentName });
    return;
  }
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

  const canCreate = readiness.ready
    && notionCreationEnabled
    && !isCreatingNotion
    && !creationCompleted;
  elements.createNotionButton.disabled = !canCreate;
  elements.createNotionButton.textContent = isCreatingNotion
    ? 'Notion에 생성 중...'
    : creationCompleted
      ? 'Notion 생성 완료'
      : 'Notion에 기록 생성';
  elements.createNotionButton.title = canCreate
    ? '최종 확인 후 실제 Notion에 기록합니다.'
    : readiness.reasons.join(' / ');
  elements.creationGateNote.textContent = notionCreationEnabled
    ? '생성 버튼을 누르면 위 계획을 한 번 더 확인한 뒤 실제 Notion에 기록합니다.'
    : '서버의 실제 생성 설정이 꺼져 있습니다. 설정을 활성화하고 서버를 다시 시작해야 합니다.';
}

function renderSopCreationPlan({ statistics, readiness, finalStudentName }) {
  const selected = notionPreviewState.sopReview?.selected;
  elements.notionPlanSummary.textContent = [
    '담당자 기존 사용',
    '학생 기존 항목 사용',
    '학교·학과 기존 항목 사용',
    '작업 일지 1개 생성'
  ].join(' · ');
  elements.notionPlanSummary.classList.remove('hidden');
  elements.creationPlanDetails.innerHTML = `
    <dl class="plan-facts">
      <div><dt>최종 학생명</dt><dd>${escapeHtml(finalStudentName || '확인 필요')}</dd></div>
      <div><dt>학교·학과</dt><dd>${escapeHtml(selected ? `${selected.university.name} · ${selected.name}` : '확인 필요')}</dd></div>
      <div><dt>작업 일지 제목</dt><dd>${escapeHtml(notionPreviewState.workLog?.title || '확인 필요')}</dd></div>
      <div><dt>Category</dt><dd>${escapeHtml(notionPreviewState.workLog?.category || '확인 필요')}</dd></div>
      <div><dt>마감일</dt><dd>${escapeHtml(notionPreviewState.workLog?.deadline || '확인 필요')}</dd></div>
      <div><dt>새로 생성</dt><dd>${statistics.totalCreates}개</dd></div>
    </dl>
    ${readiness.reasons.length
      ? `<div class="readiness-reasons"><strong>생성 전 확인할 항목</strong><ul>${readiness.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>`
      : ''}
  `;
  elements.creationReadiness.textContent = readiness.ready
    ? '생성 계획 확인 완료'
    : `확인 필요 ${readiness.reasons.length}개`;
  elements.creationReadiness.classList.toggle('readiness-badge--ready', readiness.ready);
  elements.creationPlan.classList.remove('hidden');

  const canCreate = readiness.ready
    && notionCreationEnabled
    && !isCreatingNotion
    && !creationCompleted;
  elements.createNotionButton.disabled = !canCreate;
  elements.createNotionButton.textContent = isCreatingNotion
    ? 'Notion에 생성 중...'
    : creationCompleted
      ? 'Notion 생성 완료'
      : 'Notion에 기록 생성';
  elements.createNotionButton.title = canCreate
    ? '최종 확인 후 실제 Notion에 기록합니다.'
    : readiness.reasons.join(' / ');
  elements.creationGateNote.textContent = notionCreationEnabled
    ? '생성 버튼을 누르면 위 계획을 한 번 더 확인한 뒤 실제 Notion에 기록합니다.'
    : '서버의 실제 생성 설정이 꺼져 있습니다. 설정을 활성화하고 서버를 다시 시작해야 합니다.';
}

function getCreationStatistics() {
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    return {
      studentCreates: 0,
      universityCreates: 0,
      majorCreates: 0,
      workLogCreates: 1,
      totalCreates: 1,
      totalReuses: notionPreviewState.sopReview?.selected ? 4 : 2
    };
  }

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
  if (notionSchemaValid && !notionCreationEnabled) {
    reasons.push('서버의 실제 생성 설정을 활성화해야 합니다.');
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

  if (requestState.requestType === SOP_REQUEST_TYPE) {
    if (!notionPreviewState.sopReview?.selectedMajorId) {
      reasons.push(notionPreviewState.sopReview?.candidates?.length
        ? '사용할 학교·학과를 선택해야 합니다.'
        : '학생의 입학요강 기록에서 사용할 학교·학과를 찾을 수 없습니다.');
    }
    return {
      ready: reasons.length === 0,
      reasons
    };
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

async function createNotionRecords() {
  if (!notionPreviewState || isCreatingNotion || creationCompleted) {
    return;
  }

  const readiness = getCreationReadiness();
  if (!readiness.ready || !notionCreationEnabled) {
    renderCreationPlan();
    return;
  }

  const statistics = getCreationStatistics();
  const confirmed = window.confirm([
    '실제 Notion에 아래 계획을 생성합니다.',
    '',
    `최종 학생명: ${getFinalStudentName()}`,
    `작업 일지: ${formatWorkLogTitles(notionPreviewState.workLog?.titles)}`,
    ...(requestState.requestType === SOP_REQUEST_TYPE && notionPreviewState.sopReview?.selected
      ? [`학교·학과: ${notionPreviewState.sopReview.selected.university.name} · ${notionPreviewState.sopReview.selected.name}`]
      : []),
    `새로 생성: ${statistics.totalCreates}개`,
    `기존 항목 사용: ${statistics.totalReuses}개`,
    '',
    '계속할까요?'
  ].join('\n'));
  if (!confirmed) {
    return;
  }

  isCreatingNotion = true;
  resetCreationResult();
  elements.notionPreviewStatus.textContent = '실제 Notion에 기록을 생성하고 있습니다...';
  renderCreationPlan();

  try {
    const response = await fetch('/api/notion/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildCreationPayload())
    });
    const payload = await response.json();

    if (!response.ok) {
      if (payload?.error?.code === 'NOTION_CREATION_DISABLED') {
        notionCreationEnabled = false;
      }
      renderCreationFailure(payload?.error);
      elements.notionPreviewStatus.textContent = 'Notion 생성이 완료되지 않았습니다.';
      return;
    }

    creationCompleted = true;
    renderCreationSuccess(payload);
    elements.notionPreviewStatus.textContent = 'Notion 생성과 저장 검증이 완료됐습니다.';
  } catch (error) {
    renderCreationFailure({
      code: 'NETWORK_ERROR',
      message: `로컬 서버 요청에 실패했습니다: ${error.message}`,
      details: {}
    });
    elements.notionPreviewStatus.textContent = 'Notion 생성이 완료되지 않았습니다.';
  } finally {
    isCreatingNotion = false;
    renderCreationPlan();
  }
}

function buildCreationPayload() {
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    return {
      requestType: SOP_REQUEST_TYPE,
      clientMode: 'existing',
      requesterName: requestState.requesterName,
      requestDateTime: requestState.requestDateTime,
      studentName: requestState.studentName,
      selectedStudentId: notionPreviewState.student?.selectedStudentId ?? '',
      selectedMajorId: notionPreviewState.sopReview?.selectedMajorId ?? '',
      sopReview: requestState.sopReview,
      extractionWarnings: requestState.extractionWarnings,
      programmes: []
    };
  }

  return {
    requestType: requestState.requestType,
    clientMode,
    requesterName: requestState.requesterName,
    requestDateTime: requestState.requestDateTime,
    studentName: requestState.studentName,
    selectedStudentId: notionPreviewState.student?.selectedStudentId ?? '',
    extractionWarnings: requestState.extractionWarnings,
    programmes: requestState.programmes.map((programme, index) => {
      const reviewedMajor = notionPreviewState.programmes[index]?.major;
      return {
        ...programme,
        reviewedMajorName: reviewedMajor?.reviewedCreateName
          ?? programme.notionMajorNameProposed,
        majorNameConfirmed: reviewedMajor?.status === 'matched'
          || reviewedMajor?.nameConfirmed === true
      };
    })
  };
}

function renderCreationSuccess(result) {
  const items = [
    {
      label: `학생: ${result.finalStudentName}`,
      url: result.student?.url
    },
    ...result.universities
      .filter((item) => item.action === 'create')
      .map((item) => ({ label: `대학: ${item.name}`, url: item.url })),
    ...result.majors
      .filter((item) => item.action === 'create')
      .map((item) => ({ label: `학과: ${item.name}`, url: item.url })),
    ...result.workLogs.map((item) => ({
      label: `작업 일지: ${item.title}`,
      url: item.url
    }))
  ];
  renderCreationResult({
    tone: 'success',
    title: 'Notion 생성 완료',
    message: '생성된 페이지와 relation·제목 저장 검증이 완료됐습니다.',
    items
  });
}

function renderCreationFailure(error = {}) {
  const partial = error.details?.partialResult;
  const items = partial
    ? [
        partial.student,
        ...(partial.universities ?? []),
        ...(partial.majors ?? []),
        ...(partial.workLogs ?? [])
      ]
        .filter((item) => item?.url)
        .map((item) => ({
          label: item.title ?? item.name ?? item.id,
          url: item.url
        }))
    : [];
  const failedStep = error.details?.failedStep
    ? ` 실패 단계: ${error.details.failedStep}.`
    : '';
  renderCreationResult({
    tone: 'error',
    title: 'Notion 생성 확인 필요',
    message: `${error.message ?? '생성 중 오류가 발생했습니다.'}${failedStep} 같은 요청으로 다시 실행하면 완료된 page ID를 사용해 이어서 처리합니다.`,
    items
  });
}

function renderCreationResult({ tone, title, message, items = [] }) {
  elements.creationResult.innerHTML = '';
  elements.creationResult.className = `creation-result creation-result--${tone}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  elements.creationResult.append(heading, paragraph(message));

  if (items.length > 0) {
    const list = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      if (item.url) {
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = item.label;
        li.append(link);
      } else {
        li.textContent = item.label;
      }
      list.append(li);
    }
    elements.creationResult.append(list);
  }
}

function resetCreationResult() {
  elements.creationResult.innerHTML = '';
  elements.creationResult.className = 'creation-result hidden';
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
    list.className = 'student-selection-list';
    for (const candidate of student.candidates) {
      const label = document.createElement('label');
      label.className = 'student-selection-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'student-selection';
      input.value = candidate.id;
      input.checked = candidate.id === student.selectedStudentId;
      input.dataset.studentSelection = candidate.id;
      if (input.checked) {
        label.classList.add('student-selection-option--selected');
      }

      const candidateText = document.createElement('span');
      candidateText.className = 'student-selection-name';
      candidateText.append(
        notionLink(candidate),
        document.createTextNode(` (${candidate.agentNames?.join(', ') || '담당자 연결 없음'})`)
      );

      label.append(input, candidateText);
      list.append(label);
    }
    card.append(list);
  } else {
    card.append(paragraph('같은 이름 계열의 기존 학생이 없습니다.'));
  }

  return card;
}

function renderSopMajorSelection() {
  if (requestState.requestType !== SOP_REQUEST_TYPE) {
    return;
  }

  const preview = notionPreviewState?.sopReview;
  if (!preview) {
    elements.sopMajorSelection.innerHTML = '<p class="muted">Notion 항목을 확인하면 입학요강 기록에서 학교·학과를 자동 선택합니다.</p>';
    return;
  }
  if (!preview.candidates?.length) {
    elements.sopMajorSelection.innerHTML = '<p class="programme-review-note">연결 가능한 입학요강 학교·학과가 없습니다. 이번 버전에서는 수동 입력으로 생성할 수 없습니다.</p>';
    return;
  }

  const selected = preview.candidates.find((candidate) => candidate.id === preview.selectedMajorId);
  const summary = selected
    ? `<div class="sop-major-summary"><span><strong>${escapeHtml(selected.university.name)}</strong> · ${escapeHtml(selected.name)}</span><button type="button" class="secondary compact" data-change-sop-major>변경</button></div>`
    : '<p class="programme-review-note">학교·학과를 선택해주세요.</p>';
  const options = sopCandidatesExpanded || !selected
    ? `<div class="sop-major-options">${preview.candidates.map((candidate) => `
        <label class="student-selection-option${candidate.id === preview.selectedMajorId ? ' student-selection-option--selected' : ''}">
          <input type="radio" name="sop-major-selection" value="${escapeHtml(candidate.id)}" ${candidate.id === preview.selectedMajorId ? 'checked' : ''}>
          <span><strong>${escapeHtml(candidate.university.name)}</strong> · ${escapeHtml(candidate.name)}</span>
        </label>
      `).join('')}</div>`
    : '';
  elements.sopMajorSelection.innerHTML = `
    <div class="sop-major-label">학교·학과</div>
    ${summary}
    ${options}
  `;

  elements.sopMajorSelection.querySelector('[data-change-sop-major]')?.addEventListener('click', () => {
    sopCandidatesExpanded = !sopCandidatesExpanded;
    renderSopMajorSelection();
  });
  elements.sopMajorSelection.querySelectorAll('input[name="sop-major-selection"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const selectedMajorId = event.target.value;
      preview.selectedMajorId = selectedMajorId;
      preview.selected = preview.candidates.find((candidate) => candidate.id === selectedMajorId) ?? null;
      preview.selectionReason = 'manual';
      sopCandidatesExpanded = false;
      creationCompleted = false;
      resetCreationResult();
      renderDerivedOutput();
    });
  });
}

function renderSopMajorPreview(sopReview) {
  const card = createPreviewCard('학교·학과');
  if (sopReview?.selected) {
    card.append(
      paragraphWithLink(`대학: ${sopReview.selected.university.name} · 학과: `, sopReview.selected),
      paragraph(sopReview.selectionReason === 'admissions-1'
        ? '입학 요강 1 기록을 기준으로 자동 선택했습니다.'
        : sopReview.selectionReason === 'plain-as-first'
          ? '번호 없는 첫 입학요강 기록을 기준으로 자동 선택했습니다.'
          : sopReview.selectionReason === 'single-candidate'
            ? '유일한 학과 후보를 자동 선택했습니다.'
            : 'J님이 선택한 학교·학과를 사용합니다.')
    );
  } else if (sopReview?.candidates?.length) {
    card.append(paragraph('후보가 여러 개라 학교·학과 선택이 필요합니다.'));
  } else {
    card.append(paragraph('학생의 입학요강 작업 일지에서 연결 가능한 학과를 찾지 못했습니다.'));
  }
  return card;
}

function renderProgrammePreview(programme) {
  const card = document.createElement('div');
  card.className = 'preview-card preview-card--programme';
  const original = document.createElement('p');
  original.className = 'preview-summary-line';
  const originalLabel = document.createElement('strong');
  originalLabel.textContent = `학과 ${programme.index + 1} 원문:`;
  original.append(
    originalLabel,
    document.createTextNode(` ${programme.officialProgrammeName || programme.major.requestedOriginalName}`)
  );
  card.append(
    original,
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
  section.className = 'preview-entity';
  const status = statusLabelForUniversity(university.status);

  if (university.selected) {
    section.append(compactStatusWithLink(`대학: ${status}`, university.selected));
  } else if (university.status === 'missing') {
    section.append(compactStatusWithText(`대학: ${status}`, university.proposedCreateName));
  } else if (university.candidates?.length) {
    section.append(compactStatusWithText(`대학: ${status}`));
    section.append(renderLinkedList(university.candidates));
  } else {
    section.append(compactStatusWithText(`대학: ${status}`, university.requestedName));
  }

  return section;
}

function renderMajorPreview(major, programmeIndex, university, degreeNameWarning) {
  const section = document.createElement('div');
  section.className = 'preview-entity';
  const effectiveStatus = major.status === 'blocked' && university.status === 'missing'
    ? 'missing'
    : major.status;
  const status = statusLabelForMajor(effectiveStatus);

  if (major.selected) {
    section.append(compactStatusWithLink(`학과: ${status}`, major.selected));
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
    section.append(compactStatusWithText(`학과: ${status}`));
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
    section.append(compactStatusWithText(`학과: ${status}`));
    section.append(renderLinkedList(major.candidates));
  } else if (major.status === 'blocked') {
    section.append(compactStatusWithText(`학과: ${status}`));
    section.append(paragraph('대학이 확정되어야 학과를 다시 조회할 수 있습니다.'));
  }

  return section;
}

function renderWorkLogPreview(workLog) {
  const card = createPreviewCard('작업 일지');
  card.append(
    paragraph(requestState.requestType === SOP_REQUEST_TYPE
      ? '생성 개수: 1개'
      : `생성 개수: ${workLog.count}개 (학과별 1개)`),
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
        invalidateWordSummary('전공명 변경을 Word 생성 예정 내용에 반영했습니다.');
        renderWordPanel();
      }
    });
  });

  elements.notionPreview.querySelectorAll('[data-major-name-confirmation]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const programme = notionPreviewState?.programmes?.[Number(event.target.dataset.majorNameConfirmation)];
      if (programme) {
        programme.major.nameConfirmed = event.target.checked;
        renderCreationPlan();
        invalidateWordSummary('전공명 확인 상태를 Word 생성 예정 내용에 반영했습니다.');
        renderWordPanel();
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

function compactStatusWithLink(label, item) {
  const element = document.createElement('p');
  element.className = 'preview-summary-line';
  const strong = document.createElement('strong');
  strong.textContent = label;
  element.append(
    strong,
    document.createTextNode(' ('),
    notionLink(item),
    document.createTextNode(')')
  );
  return element;
}

function compactStatusWithText(label, value = '') {
  const element = document.createElement('p');
  element.className = 'preview-summary-line';
  const strong = document.createElement('strong');
  strong.textContent = label;
  element.append(strong);
  if (value) {
    element.append(document.createTextNode(` (${value})`));
  }
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
