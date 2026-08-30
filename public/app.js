import { calculateWeekdayDeadline } from '/shared/deadline.js';
import { generateProgrammeLabel } from '/shared/filename.js';
import { ADMISSIONS_CATEGORY, REQUEST_SEASON, getNextWorkLogTitles } from '/shared/workLog.js';
import {
  SOP_REQUEST_TYPE,
  getSopCategory,
  getSopWorkLogTitle
} from '/shared/sopReview.js';
import { initializeGoogleSheetsPanel } from './googleSheetsPanel.js';
import { initializeNotionCreationPanel } from './notionCreationPanel.js';
import { initializeNotionPreviewController } from './notionPreviewController.js';
import {
  getSelectedStudentName,
  initializeNotionPreviewPanel
} from './notionPreviewPanel.js';
import { initializeSopDownloadPanel } from './sopDownloadPanel.js';
import { initializeWordPanel } from './wordPanel.js';
import {
  countUniqueRequestProgrammes,
  createEmptyRequest,
  initializeRequestReviewPanel,
  normalizeRequest,
  validateRequest
} from './requestReviewPanel.js';

let requestState = createEmptyRequest();
let clientMode = 'new';
let notionPreviewController = null;

const elements = {
  jandiMessage: document.querySelector('#jandi-message'),
  analyzeButton: document.querySelector('#analyze-button'),
  clearButton: document.querySelector('#clear-button'),
  analysisStatus: document.querySelector('#analysis-status'),
  reviewSection: document.querySelector('#review-section'),
  studentModeSection: document.querySelector('#student-mode-section'),
  notionPreviewSection: document.querySelector('#notion-preview-section'),
  outputSection: document.querySelector('#output-section'),
  wordGenerationSection: document.querySelector('#word-generation-section'),
  clientModeInputs: document.querySelectorAll('input[name="client-type"]'),
  clientModeNote: document.querySelector('#client-mode-note'),
  workLogTitle: document.querySelector('#work-log-title'),
  deadline: document.querySelector('#deadline'),
  category: document.querySelector('#category'),
  requestSeason: document.querySelector('#request-season')
};

const requestReviewPanel = initializeRequestReviewPanel({
  getContext: () => ({ requestState }),
  onRequestChange: handleRequestReviewChange,
  onSopReviewChange: handleSopReviewChange
});

const wordPanel = initializeWordPanel({
  getContext: () => ({
    requestState,
    notionPreviewState: getNotionPreviewState(),
    finalStudentName: getFinalStudentName()
  })
});

const sopDownloadPanel = initializeSopDownloadPanel({
  getContext: () => ({
    requestState,
    message: elements.jandiMessage.value
  })
});

const notionCreationPanel = initializeNotionCreationPanel({
  getContext: () => ({
    requestState,
    notionPreviewState: getNotionPreviewState(),
    clientMode,
    finalStudentName: getFinalStudentName()
  }),
  validateRequest,
  setPreviewStatus: (message) => {
    notionPreviewController?.setStatus(message);
  }
});

const notionPreviewPanel = initializeNotionPreviewPanel({
  getContext: () => ({
    requestState,
    notionPreviewState: getNotionPreviewState(),
    clientMode
  }),
  onStudentSelection: (studentId) => {
    void notionPreviewController.updateWorkLogTitleForSelection(studentId);
  },
  onPreviewEdit: ({ type }) => {
    if (type === 'sop-major-selection') {
      notionCreationPanel.invalidatePreview();
      renderDerivedOutput();
      return;
    }

    notionCreationPanel.render();
    wordPanel.invalidateSummary(type === 'major-create-name'
      ? '전공명 변경을 Word 생성 예정 내용에 반영했습니다.'
      : '전공명 확인 상태를 Word 생성 예정 내용에 반영했습니다.');
    wordPanel.render();
  }
});

notionPreviewController = initializeNotionPreviewController({
  getContext: () => ({
    requestState,
    clientMode,
    workLogCount: countUniqueRequestProgrammes(requestState)
  }),
  validateRequest,
  renderErrors: (errors) => requestReviewPanel.renderErrors(errors),
  checkConnection: () => notionCreationPanel.checkConnection(),
  prepareState: (payload) => notionPreviewPanel.prepareState(payload),
  onRender: renderDerivedOutput,
  onPreviewStarted: () => {
    wordPanel.invalidateSummary('Notion 항목 확인 뒤 Word 생성 예정 내용을 자동 표시합니다.');
  },
  onPreviewCompleted: (previewState) => {
    if (requestState.requestType === SOP_REQUEST_TYPE
      && previewState?.student?.mode
      && previewState.student.mode !== clientMode) {
      clientMode = previewState.student.mode;
      syncClientModeControls();
    }
    wordPanel.invalidateSummary('Notion 확인 결과를 Word 생성 예정 내용에 반영했습니다.');
    notionCreationPanel.invalidatePreview();
  },
  onPreviewInvalidated: (message) => {
    notionCreationPanel.invalidatePreview();
    wordPanel.invalidateSummary(message
      ? `${message} Notion 항목을 다시 확인하면 Word 생성 예정 내용도 자동 갱신됩니다.`
      : 'Notion 항목을 다시 확인하면 Word 생성 예정 내용도 자동 갱신됩니다.');
  },
  onStudentSelectionStarted: () => {
    wordPanel.invalidateSummary('최종 학생 변경을 Word 생성 예정 내용에 반영했습니다.');
  }
});

elements.analyzeButton.addEventListener('click', analyzeMessage);
elements.clearButton.addEventListener('click', clearAll);
elements.jandiMessage.addEventListener('paste', handleJandiPaste);
document.addEventListener('keydown', handleJandiImportShortcut);

elements.clientModeInputs.forEach((input) => {
  input.addEventListener('change', updateClientMode);
});

initializeGoogleSheetsPanel();

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
    wordPanel.resetProgrammeLabelOverride();
    notionPreviewPanel.reset();
    notionPreviewController.invalidate('');
    renderRequest();
    requestReviewPanel.renderErrors(payload.errors ?? {});
    showSections();
    elements.analysisStatus.textContent = response.ok
      ? 'Extraction complete. Review every field before using the filename.'
      : 'Extraction needs correction. Missing fields are marked below.';
    if (response.ok && requestState.requestType === SOP_REQUEST_TYPE) {
      void sopDownloadPanel.arm();
    } else {
      void sopDownloadPanel.cancel();
    }
  } catch (error) {
    elements.analysisStatus.textContent = `Extraction failed: ${error.message}`;
  } finally {
    elements.analyzeButton.disabled = false;
  }
}

function clearAll() {
  requestState = createEmptyRequest();
  clientMode = 'new';
  void sopDownloadPanel.cancel();
  notionPreviewController.reset();
  wordPanel.reset();
  notionCreationPanel.reset();
  notionPreviewPanel.reset();
  requestReviewPanel.reset();
  elements.jandiMessage.value = '';
  elements.analysisStatus.textContent = '';
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

function showSections() {
  const isSop = requestState.requestType === SOP_REQUEST_TYPE;
  elements.reviewSection.classList.remove('hidden');
  elements.studentModeSection.classList.remove('hidden');
  elements.notionPreviewSection.classList.remove('hidden');
  elements.outputSection.classList.toggle('hidden', isSop);
  elements.wordGenerationSection.classList.toggle('hidden', isSop);
  if (!isSop) {
    void wordPanel.refreshStatus();
  }
}

function renderRequest() {
  requestReviewPanel.render();
  notionPreviewPanel.renderSopMajorSelection();
  renderDerivedOutput();
  notionPreviewController.syncButtonState();
}

function configureRequestType() {
  const isSop = requestState.requestType === SOP_REQUEST_TYPE;
  clientMode = isSop ? 'existing' : 'new';
  syncClientModeControls();
}

function syncClientModeControls() {
  const isSop = requestState.requestType === SOP_REQUEST_TYPE;
  elements.clientModeInputs.forEach((input) => {
    input.checked = input.value === clientMode;
    input.disabled = false;
  });
  elements.clientModeNote.textContent = isSop
    ? clientMode === 'new'
      ? '담당자와 연결된 기존 학생이 없어 신규 학생으로 전환했습니다. 학교·학과는 Jandi · Unknown을 임시 사용합니다.'
      : '담당자와 연결된 기존 학생을 먼저 찾고, 없으면 신규 학생과 Jandi · Unknown으로 자동 전환합니다.'
    : '학생 구분을 바꾸면 Notion 항목을 다시 조회해야 합니다.';
}

function handleRequestReviewChange({ invalidationMessage, scheduleSopRearm }) {
  notionPreviewController.invalidate(invalidationMessage);
  renderDerivedOutput();
  requestReviewPanel.renderErrors(validateRequest(requestState));
  notionPreviewController.syncButtonState();
  if (scheduleSopRearm) {
    sopDownloadPanel.scheduleRearm();
  }
}

function handleSopReviewChange({ round, language }) {
  const notionPreviewState = getNotionPreviewState();
  if (notionPreviewState) {
    const title = getSopWorkLogTitle(round, language);
    notionPreviewState.workLog = {
      ...notionPreviewState.workLog,
      title,
      titles: [title],
      category: getSopCategory(language)
    };
    notionCreationPanel.invalidatePreview();
    notionPreviewController.setStatus('감수 회차·언어 변경을 생성 계획에 반영했습니다.');
  } else {
    notionPreviewController.invalidate('');
  }
  renderDerivedOutput();
  requestReviewPanel.renderErrors(validateRequest(requestState));
  notionPreviewController.syncButtonState();
}

function renderDerivedOutput() {
  const notionPreviewState = getNotionPreviewState();
  if (requestState.requestType === SOP_REQUEST_TYPE) {
    const title = notionPreviewState?.workLog?.title
      ?? getSopWorkLogTitle(requestState.sopReview?.round, requestState.sopReview?.language);
    elements.workLogTitle.value = title;
    elements.deadline.value = calculateWeekdayDeadline(requestState.requestDateTime);
    elements.category.value = getSopCategory(requestState.sopReview?.language);
    elements.requestSeason.value = REQUEST_SEASON;
    notionPreviewPanel.renderSopMajorSelection();
    notionPreviewPanel.render();
    notionCreationPanel.render();
    return;
  }

  const programmeNames = requestState.programmes.map((programme) => programme.programmeNameOriginal);
  const programmeLabel = wordPanel.getProgrammeLabelOverride() ?? generateProgrammeLabel(programmeNames);
  const finalStudentName = getFinalStudentName() || requestState.studentName;

  const workLogTitles = notionPreviewState?.workLog?.titles
    ?? getNextWorkLogTitles([], countUniqueRequestProgrammes(requestState));
  elements.workLogTitle.value = formatWorkLogTitles(workLogTitles);
  elements.deadline.value = calculateWeekdayDeadline(requestState.requestDateTime);
  elements.category.value = ADMISSIONS_CATEGORY;
  elements.requestSeason.value = REQUEST_SEASON;
  wordPanel.setDerivedOutput({
    programmeLabel,
    studentName: finalStudentName
  });

  notionPreviewPanel.render();
  notionCreationPanel.render();
  wordPanel.render();
}

function updateClientMode(event) {
  clientMode = event.target.value;
  notionPreviewController.invalidate('학생 구분이 변경되어 Notion 항목을 다시 조회해야 합니다.');
  renderDerivedOutput();
}

function getFinalStudentName() {
  const notionPreviewState = getNotionPreviewState();
  if (notionPreviewState?.student?.mode === 'new') {
    return notionPreviewState.student.suggestedStudentName;
  }
  return getSelectedStudentName(notionPreviewState?.student);
}

function getNotionPreviewState() {
  return notionPreviewController?.getState() ?? null;
}

function formatWorkLogTitles(titles = []) {
  return Array.isArray(titles) ? titles.filter(Boolean).join(' · ') : '';
}
