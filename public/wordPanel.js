import { generateWordFilename } from '/shared/filename.js';

export function initializeWordPanel({
  documentRef = document,
  fetchImpl = window.fetch.bind(window),
  navigatorRef = navigator,
  getContext = () => ({
    requestState: null,
    notionPreviewState: null,
    finalStudentName: ''
  })
} = {}) {
  const elements = {
    programmeLabel: documentRef.querySelector('#programme-label'),
    wordFilename: documentRef.querySelector('#word-filename'),
    copyFilenameButton: documentRef.querySelector('#copy-filename-button'),
    copyStatus: documentRef.querySelector('#copy-status'),
    wordStatus: documentRef.querySelector('#word-status'),
    wordDegreeInputs: documentRef.querySelectorAll('input[name="word-degree"]'),
    wordReadiness: documentRef.querySelector('#word-readiness'),
    wordSummary: documentRef.querySelector('#word-summary'),
    wordResult: documentRef.querySelector('#word-result'),
    generateWordButton: documentRef.querySelector('#generate-word-button'),
    wordGenerationStatus: documentRef.querySelector('#word-generation-status')
  };

  let programmeLabelOverride = null;
  let wordEnvironmentState = null;
  let isGeneratingWord = false;

  elements.copyFilenameButton.addEventListener('click', () => {
    void copyFilename();
  });
  elements.generateWordButton.addEventListener('click', () => {
    void generateWordFile();
  });
  elements.wordFilename.addEventListener('input', () => {
    invalidateWordSummary('파일명 변경을 Word 생성 예정 내용에 반영했습니다.');
    renderWordPanel();
  });
  elements.programmeLabel.addEventListener('input', () => {
    programmeLabelOverride = elements.programmeLabel.value;
    const context = getContext();
    elements.wordFilename.value = generateWordFilename({
      studentName: context.finalStudentName || context.requestState?.studentName,
      programmeNames: [programmeLabelOverride]
    });
    invalidateWordSummary('공통 학과명 변경을 파일명과 Word 생성 예정 내용에 반영했습니다.');
    renderWordPanel();
  });
  elements.wordDegreeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      invalidateWordSummary('과정 변경을 Word 생성 예정 내용에 반영했습니다.');
      renderWordPanel();
    });
  });

  return {
    getProgrammeLabelOverride: () => programmeLabelOverride,
    invalidateSummary: invalidateWordSummary,
    refreshStatus: checkWordStatus,
    render: renderWordPanel,
    reset: resetWordPanel,
    resetProgrammeLabelOverride: () => {
      programmeLabelOverride = null;
    },
    setDerivedOutput
  };

  function setDerivedOutput({ programmeLabel, studentName }) {
    elements.programmeLabel.value = programmeLabel;
    elements.wordFilename.value = generateWordFilename({
      studentName,
      programmeNames: [programmeLabel]
    });
  }

  function resetWordPanel() {
    programmeLabelOverride = null;
    wordEnvironmentState = null;
    isGeneratingWord = false;
    elements.copyStatus.textContent = '';
    elements.wordStatus.textContent = '확인 전';
    elements.wordGenerationStatus.textContent = '';
    resetWordResult();
    elements.wordSummary.classList.add('hidden');
    elements.wordDegreeInputs.forEach((input) => {
      input.checked = input.value === '석사';
    });
  }

  async function copyFilename() {
    const filename = elements.wordFilename.value.trim();
    if (!filename) {
      elements.copyStatus.textContent = 'Generate a filename before copying.';
      return;
    }

    try {
      await navigatorRef.clipboard.writeText(filename);
      elements.copyStatus.textContent = 'Filename copied.';
    } catch {
      elements.wordFilename.select();
      documentRef.execCommand('copy');
      elements.copyStatus.textContent = 'Filename copied.';
    }
  }

  async function checkWordStatus() {
    elements.wordStatus.textContent = '확인 중';

    try {
      const response = await fetchImpl('/api/word/status');
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
      const response = await fetchImpl('/api/word/generate', {
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
    const { requestState, notionPreviewState, finalStudentName } = getContext();
    const programmeLabel = elements.programmeLabel.value.trim();
    const filename = elements.wordFilename.value.trim();

    if (!notionPreviewState) {
      reasons.push('Notion 항목 미리보기를 먼저 완료해야 합니다.');
    }
    if (!finalStudentName) {
      reasons.push('최종 학생명을 확정해야 합니다.');
    }
    if ((requestState?.extractionWarnings ?? []).length > 0) {
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
    if ((requestState?.programmes ?? []).length === 0) {
      reasons.push('전공이 한 개 이상 있어야 합니다.');
    }

    (requestState?.programmes ?? []).forEach((programme, index) => {
      if (!(programme.rawUniversityName || programme.universityName)?.trim()) {
        reasons.push(`전공 ${index + 1}의 원문 학교명이 필요합니다.`);
      }
      if (!programme.programmeUrl?.trim()) {
        reasons.push(`전공 ${index + 1}의 URL이 필요합니다.`);
      }
      if (!getReviewedMajorName(index, notionPreviewState)) {
        reasons.push(`전공 ${index + 1}의 최종 Notion 전공명을 확정해야 합니다.`);
      }
    });

    return {
      ready: reasons.length === 0,
      reasons
    };
  }

  function buildWordPayload() {
    const { requestState, notionPreviewState, finalStudentName } = getContext();
    return {
      studentName: finalStudentName,
      degree: getWordDegree(),
      filename: elements.wordFilename.value.trim(),
      programmeLabel: elements.programmeLabel.value.trim(),
      programmes: (requestState?.programmes ?? []).map((programme, index) => ({
        rawUniversityName: (programme.rawUniversityName || programme.universityName || '').trim(),
        reviewedMajorName: getReviewedMajorName(index, notionPreviewState),
        programmeUrl: programme.programmeUrl.trim()
      }))
    };
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

function getReviewedMajorName(index, notionPreviewState) {
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
