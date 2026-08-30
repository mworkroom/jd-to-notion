import { SOP_REQUEST_TYPE } from '/shared/sopReview.js';

export function initializeNotionCreationPanel({
  documentRef = document,
  fetchImpl = window.fetch.bind(window),
  confirmImpl = window.confirm.bind(window),
  getContext = () => ({
    requestState: null,
    notionPreviewState: null,
    clientMode: 'new',
    finalStudentName: ''
  }),
  validateRequest = () => ({}),
  setPreviewStatus = () => {}
} = {}) {
  const elements = {
    notionStatus: documentRef.querySelector('#notion-status'),
    notionPlanSummary: documentRef.querySelector('#notion-plan-summary'),
    creationPlan: documentRef.querySelector('#creation-plan'),
    creationPlanDetails: documentRef.querySelector('#creation-plan-details'),
    creationReadiness: documentRef.querySelector('#creation-readiness'),
    creationGateNote: documentRef.querySelector('#creation-gate-note'),
    creationResult: documentRef.querySelector('#creation-result'),
    createNotionButton: documentRef.querySelector('#create-notion-button')
  };

  let notionSchemaValid = false;
  let notionCreationEnabled = false;
  let isCreatingNotion = false;
  let creationCompleted = false;

  elements.createNotionButton.addEventListener('click', () => {
    void createNotionRecords();
  });

  return {
    checkConnection: checkNotionConnection,
    invalidatePreview,
    render: renderCreationPlan,
    reset: resetCreationPanel
  };

  function resetCreationPanel() {
    notionSchemaValid = false;
    notionCreationEnabled = false;
    isCreatingNotion = false;
    creationCompleted = false;
    elements.notionStatus.textContent = '확인 전';
    elements.notionPlanSummary.classList.add('hidden');
    elements.creationPlan.classList.add('hidden');
    elements.createNotionButton.disabled = true;
    elements.createNotionButton.textContent = 'Notion에 기록 생성';
    elements.createNotionButton.title = 'Notion 미리보기를 먼저 완료해야 합니다.';
    resetCreationResult();
  }

  function invalidatePreview() {
    creationCompleted = false;
    resetCreationResult();
  }

  async function checkNotionConnection() {
    elements.notionStatus.textContent = '확인 중';

    try {
      const response = await fetchImpl('/api/notion/schema');
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

  function renderCreationPlan() {
    const context = getContext();
    const { requestState, notionPreviewState, finalStudentName } = context;

    if (!notionPreviewState) {
      elements.notionPlanSummary.classList.add('hidden');
      elements.creationPlan.classList.add('hidden');
      elements.createNotionButton.disabled = true;
      elements.createNotionButton.textContent = 'Notion에 기록 생성';
      elements.createNotionButton.title = 'Notion 미리보기를 먼저 완료해야 합니다.';
      return;
    }

    const statistics = getCreationStatistics(context);
    const readiness = getCreationReadiness(context);
    if (requestState.requestType === SOP_REQUEST_TYPE) {
      renderSopCreationPlan({ statistics, readiness, finalStudentName, notionPreviewState });
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
      ${renderReadinessReasons(readiness)}
    `;
    renderCreationControls(readiness);
  }

  function renderSopCreationPlan({ statistics, readiness, finalStudentName, notionPreviewState }) {
    const selected = notionPreviewState.sopReview?.selected;
    const createsStudent = notionPreviewState.student?.mode === 'new';
    elements.notionPlanSummary.textContent = [
      '담당자 기존 사용',
      `학생 ${createsStudent ? '새로 생성' : '기존 항목 사용'}`,
      '학교·학과 기존 항목 사용',
      '작업 일지 1개 생성'
    ].join(' · ');
    elements.notionPlanSummary.classList.remove('hidden');
    elements.creationPlanDetails.innerHTML = `
      <dl class="plan-facts">
        <div><dt>최종 학생명</dt><dd>${escapeHtml(finalStudentName || '확인 필요')}</dd></div>
        <div><dt>학교·학과</dt><dd>${escapeHtml(selected ? `${selected.university.name} · ${selected.name}` : '확인 필요')}</dd></div>
        ${notionPreviewState.sopReview?.isPlaceholder ? '<div><dt>후속 작업</dt><dd>학교·학과 미확인 · Notion에서 추후 수정</dd></div>' : ''}
        <div><dt>작업 일지 제목</dt><dd>${escapeHtml(notionPreviewState.workLog?.title || '확인 필요')}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(notionPreviewState.workLog?.category || '확인 필요')}</dd></div>
        <div><dt>마감일</dt><dd>${escapeHtml(notionPreviewState.workLog?.deadline || '확인 필요')}</dd></div>
        <div><dt>새로 생성</dt><dd>${statistics.totalCreates}개</dd></div>
      </dl>
      ${renderReadinessReasons(readiness)}
    `;
    renderCreationControls(readiness);
  }

  function renderCreationControls(readiness) {
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

  function renderReadinessReasons(readiness) {
    return readiness.reasons.length
      ? `<div class="readiness-reasons"><strong>생성 전 확인할 항목</strong><ul>${readiness.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>`
      : '';
  }

  function getCreationStatistics({ requestState, notionPreviewState }) {
    if (requestState.requestType === SOP_REQUEST_TYPE) {
      const studentCreates = notionPreviewState.student?.mode === 'new' ? 1 : 0;
      return {
        studentCreates,
        universityCreates: 0,
        majorCreates: 0,
        workLogCreates: 1,
        totalCreates: studentCreates + 1,
        totalReuses: notionPreviewState.sopReview?.selected ? (studentCreates ? 3 : 4) : 2
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

  function getCreationReadiness({ requestState, notionPreviewState }) {
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
    const context = getContext();
    const { requestState, notionPreviewState, finalStudentName } = context;
    if (!notionPreviewState || isCreatingNotion || creationCompleted) {
      return;
    }

    const readiness = getCreationReadiness(context);
    if (!readiness.ready || !notionCreationEnabled) {
      renderCreationPlan();
      return;
    }

    const statistics = getCreationStatistics(context);
    const confirmed = confirmImpl([
      '실제 Notion에 아래 계획을 생성합니다.',
      '',
      `최종 학생명: ${finalStudentName}`,
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
    setPreviewStatus('실제 Notion에 기록을 생성하고 있습니다...');
    renderCreationPlan();

    try {
      const response = await fetchImpl('/api/notion/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildCreationPayload(context))
      });
      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.code === 'NOTION_CREATION_DISABLED') {
          notionCreationEnabled = false;
        }
        renderCreationFailure(payload?.error);
        setPreviewStatus('Notion 생성이 완료되지 않았습니다.');
        return;
      }

      creationCompleted = true;
      renderCreationSuccess(payload);
      setPreviewStatus('Notion 생성과 저장 검증이 완료됐습니다.');
    } catch (error) {
      renderCreationFailure({
        code: 'NETWORK_ERROR',
        message: `로컬 서버 요청에 실패했습니다: ${error.message}`,
        details: {}
      });
      setPreviewStatus('Notion 생성이 완료되지 않았습니다.');
    } finally {
      isCreatingNotion = false;
      renderCreationPlan();
    }
  }

  function buildCreationPayload({ requestState, notionPreviewState, clientMode }) {
    if (requestState.requestType === SOP_REQUEST_TYPE) {
      return {
        requestType: SOP_REQUEST_TYPE,
        clientMode: notionPreviewState.student?.mode ?? clientMode,
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
    const heading = documentRef.createElement('h3');
    heading.textContent = title;
    elements.creationResult.append(heading, paragraph(message));

    if (items.length > 0) {
      const list = documentRef.createElement('ul');
      for (const item of items) {
        const li = documentRef.createElement('li');
        if (item.url) {
          const link = documentRef.createElement('a');
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

  function paragraph(text) {
    const node = documentRef.createElement('p');
    node.textContent = text;
    return node;
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

function formatWorkLogTitles(titles = []) {
  return Array.isArray(titles) ? titles.filter(Boolean).join(' · ') : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
