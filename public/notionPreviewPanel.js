import { SOP_REQUEST_TYPE } from '/shared/sopReview.js';

export function initializeNotionPreviewPanel({
  documentRef = document,
  getContext = () => ({
    requestState: null,
    notionPreviewState: null,
    clientMode: 'new'
  }),
  onStudentSelection = () => {},
  onPreviewEdit = () => {}
} = {}) {
  const elements = {
    notionPreview: documentRef.querySelector('#notion-preview'),
    sopMajorSelection: documentRef.querySelector('#sop-major-selection')
  };

  let sopCandidatesExpanded = false;

  return {
    prepareState,
    render: renderNotionPreview,
    renderSopMajorSelection,
    reset: resetPreviewPanel
  };

  function prepareState(payload) {
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

  function resetPreviewPanel() {
    sopCandidatesExpanded = false;
    elements.notionPreview.innerHTML = '';
  }

  function renderNotionPreview() {
    const { requestState, notionPreviewState, clientMode } = getContext();
    elements.notionPreview.innerHTML = '';

    if (!notionPreviewState) {
      const list = documentRef.createElement('ul');
      for (const item of getPlaceholderPreviewItems({ requestState, clientMode })) {
        const listItem = documentRef.createElement('li');
        listItem.textContent = item;
        list.append(listItem);
      }
      elements.notionPreview.append(list);
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
    previewCards.push(renderWorkLogPreview(notionPreviewState.workLog, requestState.requestType));
    elements.notionPreview.append(...previewCards);
    bindPreviewInteractions(notionPreviewState);
  }

  function renderSopMajorSelection() {
    const { requestState, notionPreviewState } = getContext();
    if (requestState.requestType !== SOP_REQUEST_TYPE) {
      return;
    }

    const preview = notionPreviewState?.sopReview;
    if (!preview) {
      elements.sopMajorSelection.innerHTML = '<p class="muted">Notion 항목을 확인하면 입학요강 기록에서 학교·학과를 자동 선택합니다.</p>';
      return;
    }
    if (!preview.candidates?.length) {
      elements.sopMajorSelection.innerHTML = `<p class="programme-review-note">${escapeHtml(preview.placeholderIssue
        ? 'Jandi · Unknown 임시 학교·학과를 찾지 못했습니다.'
        : '연결 가능한 입학요강 학교·학과가 없습니다.')}</p>`;
      return;
    }

    const selected = preview.candidates.find(
      (candidate) => candidate.id === preview.selectedMajorId
    );
    const summary = selected
      ? `<div class="sop-major-summary"><span><strong>${escapeHtml(selected.university.name)}</strong> · ${escapeHtml(selected.name)}</span>${preview.isPlaceholder ? '' : '<button type="button" class="secondary compact" data-change-sop-major>변경</button>'}</div>${preview.isPlaceholder ? '<p class="programme-review-note">학교·학과 미확인 · Notion에서 추후 수정</p>' : ''}`
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
        preview.selected = preview.candidates.find(
          (candidate) => candidate.id === selectedMajorId
        ) ?? null;
        preview.selectionReason = 'manual';
        sopCandidatesExpanded = false;
        onPreviewEdit({ type: 'sop-major-selection' });
      });
    });
  }

  function getPlaceholderPreviewItems({ requestState, clientMode }) {
    if (!requestState.studentName) {
      return ['검토할 요청을 먼저 추출해주세요.'];
    }

    if (requestState.requestType === SOP_REQUEST_TYPE) {
      return [
        `담당자: ${requestState.requesterName || '검토된 담당자'} 이름으로 기존 항목을 찾습니다.`,
        `학생: ${requestState.studentName || '검토된 학생'} · ${clientMode === 'new' ? '신규 고객' : '기존 고객 우선'} 모드`,
        clientMode === 'new'
          ? '학교·학과: Jandi · Unknown 임시 항목을 사용합니다.'
          : '학교·학과: 기존 학생의 입학요강 기록에서 자동 선택합니다.'
      ];
    }

    return [
      `담당자: ${requestState.requesterName || '검토된 담당자'} 이름으로 기존 항목을 찾습니다.`,
      `학생: ${requestState.studentName || '검토된 학생'} · ${clientMode === 'new' ? '신규 고객' : '기존 고객'} 모드`,
      ...requestState.programmes.map((programme) => `${programme.universityName || '대학'} / ${programme.notionMajorNameProposed || '학과'}: 미리보기 전`)
    ];
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

      const label = documentRef.createElement('label');
      label.textContent = '서버가 다시 계산할 최종 신규 학생명';
      const input = documentRef.createElement('input');
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
      const list = documentRef.createElement('div');
      list.className = 'student-selection-list';
      for (const candidate of student.candidates) {
        const label = documentRef.createElement('label');
        label.className = 'student-selection-option';
        const input = documentRef.createElement('input');
        input.type = 'radio';
        input.name = 'student-selection';
        input.value = candidate.id;
        input.checked = candidate.id === student.selectedStudentId;
        input.dataset.studentSelection = candidate.id;
        if (input.checked) {
          label.classList.add('student-selection-option--selected');
        }

        const candidateText = documentRef.createElement('span');
        candidateText.className = 'student-selection-name';
        candidateText.append(
          notionLink(candidate),
          documentRef.createTextNode(` (${candidate.agentNames?.join(', ') || '담당자 연결 없음'})`)
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

  function renderSopMajorPreview(sopReview) {
    const card = createPreviewCard('학교·학과');
    if (sopReview?.selected) {
      card.append(
        paragraphWithLink(`대학: ${sopReview.selected.university.name} · 학과: `, sopReview.selected),
        paragraph(sopReview.selectionReason === 'placeholder'
          ? '학교·학과 미확인 · Notion에서 추후 수정'
          : sopReview.selectionReason === 'admissions-1'
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
    const card = documentRef.createElement('div');
    card.className = 'preview-card preview-card--programme';
    const original = documentRef.createElement('p');
    original.className = 'preview-summary-line';
    const originalLabel = documentRef.createElement('strong');
    originalLabel.textContent = `학과 ${programme.index + 1} 원문:`;
    original.append(
      originalLabel,
      documentRef.createTextNode(` ${programme.officialProgrammeName || programme.major.requestedOriginalName}`)
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
    const section = documentRef.createElement('div');
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
    const section = documentRef.createElement('div');
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
      const label = documentRef.createElement('label');
      label.textContent = '새로 생성할 Notion 학과명';
      const input = documentRef.createElement('input');
      input.type = 'text';
      input.value = major.reviewedCreateName ?? major.proposedCreateName ?? '';
      input.dataset.majorCreateName = String(programmeIndex);
      label.append(input);

      const confirmation = documentRef.createElement('label');
      confirmation.className = 'major-confirmation';
      const checkbox = documentRef.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = major.nameConfirmed === true;
      checkbox.dataset.majorNameConfirmation = String(programmeIndex);
      confirmation.append(
        checkbox,
        documentRef.createTextNode(' 이 이름으로 생성하는 것을 확인했습니다.')
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

  function renderWorkLogPreview(workLog, requestType) {
    const card = createPreviewCard('작업 일지');
    card.append(
      paragraph(requestType === SOP_REQUEST_TYPE
        ? '생성 개수: 1개'
        : `생성 개수: ${workLog.count}개 (학과별 1개)`),
      paragraph(`제목: ${formatWorkLogTitles(workLog.titles)}`),
      paragraph(`마감일: ${workLog.deadline}`),
      paragraph(`Category: ${workLog.category}`),
      paragraph(`요청 시즌: ${workLog.requestSeason}`)
    );
    return card;
  }

  function bindPreviewInteractions(notionPreviewState) {
    elements.notionPreview.querySelectorAll('[data-student-selection]').forEach((input) => {
      input.addEventListener('change', (event) => onStudentSelection(event.target.value));
    });

    elements.notionPreview.querySelectorAll('[data-major-create-name]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const programmeIndex = Number(event.target.dataset.majorCreateName);
        const programme = notionPreviewState.programmes?.[programmeIndex];
        if (programme) {
          programme.major.reviewedCreateName = event.target.value;
          programme.major.nameConfirmed = false;
          onPreviewEdit({ type: 'major-create-name', programmeIndex });
        }
      });
    });

    elements.notionPreview.querySelectorAll('[data-major-name-confirmation]').forEach((input) => {
      input.addEventListener('change', (event) => {
        const programmeIndex = Number(event.target.dataset.majorNameConfirmation);
        const programme = notionPreviewState.programmes?.[programmeIndex];
        if (programme) {
          programme.major.nameConfirmed = event.target.checked;
          onPreviewEdit({ type: 'major-name-confirmation', programmeIndex });
        }
      });
    });
  }

  function createPreviewCard(title) {
    const card = documentRef.createElement('div');
    card.className = 'preview-card';
    const heading = documentRef.createElement('h3');
    heading.textContent = title;
    card.append(heading);
    return card;
  }

  function paragraph(text) {
    const element = documentRef.createElement('p');
    element.textContent = text;
    return element;
  }

  function paragraphWithLink(prefix, item) {
    const element = documentRef.createElement('p');
    element.append(documentRef.createTextNode(prefix), notionLink(item));
    return element;
  }

  function compactStatusWithLink(label, item) {
    const element = documentRef.createElement('p');
    element.className = 'preview-summary-line';
    const strong = documentRef.createElement('strong');
    strong.textContent = label;
    element.append(
      strong,
      documentRef.createTextNode(' ('),
      notionLink(item),
      documentRef.createTextNode(')')
    );
    return element;
  }

  function compactStatusWithText(label, value = '') {
    const element = documentRef.createElement('p');
    element.className = 'preview-summary-line';
    const strong = documentRef.createElement('strong');
    strong.textContent = label;
    element.append(strong);
    if (value) {
      element.append(documentRef.createTextNode(` (${value})`));
    }
    return element;
  }

  function renderLinkedList(items) {
    const list = documentRef.createElement('ul');
    for (const item of items) {
      const listItem = documentRef.createElement('li');
      listItem.append(notionLink(item));
      list.append(listItem);
    }
    return list;
  }

  function renderStudentList(students) {
    const list = documentRef.createElement('ul');
    for (const student of students) {
      const listItem = documentRef.createElement('li');
      listItem.append(documentRef.createTextNode(`${student.name} (${student.agentNames?.join(', ') || '담당자 연결 없음'})`));
      if (student.url) {
        listItem.append(documentRef.createTextNode(' '), notionLink(student));
      }
      list.append(listItem);
    }
    return list;
  }

  function notionLink(item) {
    if (!item?.url) {
      return documentRef.createTextNode(item?.name ?? item?.id ?? 'Untitled');
    }

    const link = documentRef.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = item.name ?? item.id;
    return link;
  }
}

export function getSelectedStudentName(student) {
  return student?.candidates?.find(
    (candidate) => candidate.id === student.selectedStudentId
  )?.name ?? '';
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
