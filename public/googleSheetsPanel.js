export function initializeGoogleSheetsPanel({
  documentRef = document,
  fetchImpl = window.fetch.bind(window),
  confirmImpl = window.confirm.bind(window)
} = {}) {
  const elements = {
    googleSheetsReadiness: documentRef.querySelector('#google-sheets-readiness'),
    googleSheetsTarget: documentRef.querySelector('#google-sheets-target'),
    googleSheetsUnsynced: documentRef.querySelector('#google-sheets-unsynced'),
    googleSheetsOutputRows: documentRef.querySelector('#google-sheets-output-rows'),
    googleSheetsLastSynced: documentRef.querySelector('#google-sheets-last-synced'),
    googleSheetsStatus: documentRef.querySelector('#google-sheets-status'),
    googleSheetsPreview: documentRef.querySelector('#google-sheets-preview'),
    googleSheetsPreviewRows: documentRef.querySelector('#google-sheets-preview-rows'),
    googleSheetsHeld: documentRef.querySelector('#google-sheets-held'),
    googleSheetsResult: documentRef.querySelector('#google-sheets-result'),
    refreshGoogleSheetsButton: documentRef.querySelector('#refresh-google-sheets-button'),
    syncGoogleSheetsButton: documentRef.querySelector('#sync-google-sheets-button')
  };

  let googleSheetsStatusState = null;
  let googleSheetsPreviewState = null;
  let googleSheetsBusy = false;

  elements.refreshGoogleSheetsButton.addEventListener('click', () => {
    void refreshGoogleSheetsPanel();
  });
  elements.syncGoogleSheetsButton.addEventListener('click', () => {
    void syncGoogleSheets();
  });

  void refreshGoogleSheetsPanel();

  return {
    refresh: refreshGoogleSheetsPanel
  };

  async function refreshGoogleSheetsPanel({ preserveResult = false } = {}) {
    if (googleSheetsBusy) {
      return;
    }

    googleSheetsBusy = true;
    googleSheetsPreviewState = null;
    if (!preserveResult) {
      hideGoogleSheetsResult();
    }
    elements.googleSheetsStatus.textContent = '대상 탭과 미전송 Notion Work Log를 확인하고 있습니다.';
    elements.googleSheetsPreview.classList.add('hidden');
    updateGoogleSheetsControls();

    try {
      const statusResponse = await fetchImpl('/api/google-sheets/status');
      const status = await statusResponse.json();
      if (!statusResponse.ok) {
        throw apiPayloadError(status);
      }

      googleSheetsStatusState = status;
      renderGoogleSheetsStatus(status);
      if (!status.ready) {
        googleSheetsPreviewState = null;
        renderGoogleSheetsIssue(status.issue, status.target);
        return;
      }

      const previewResponse = await fetchImpl('/api/google-sheets/preview', { method: 'POST' });
      const preview = await previewResponse.json();
      if (!previewResponse.ok) {
        throw apiPayloadError(preview);
      }

      googleSheetsPreviewState = preview;
      renderGoogleSheetsPreview(preview);
    } catch (error) {
      googleSheetsStatusState = null;
      googleSheetsPreviewState = null;
      renderGoogleSheetsError(error);
    } finally {
      googleSheetsBusy = false;
      updateGoogleSheetsControls();
    }
  }

  async function syncGoogleSheets() {
    const rows = googleSheetsPreviewState?.rows ?? [];
    if (googleSheetsBusy || rows.length === 0) {
      return;
    }

    const counts = googleSheetsPreviewState.counts ?? {};
    const targetName = googleSheetsPreviewState.target?.name ?? '대상 탭';
    const confirmed = confirmImpl([
      `${targetName}에 Google Sheets 정산 데이터를 기록합니다.`,
      '',
      `전송 행: ${counts.outputRows ?? rows.length}행`,
      `포함 Work Log: ${counts.readyPages ?? 0}건`,
      `보류: ${counts.heldPages ?? 0}건`,
      '',
      'C:G만 기록하며 A:B는 변경하지 않습니다.',
      '계속할까요?'
    ].join('\n'));
    if (!confirmed) {
      return;
    }

    googleSheetsBusy = true;
    hideGoogleSheetsResult();
    elements.googleSheetsStatus.textContent = `${targetName}에 기록하고 있습니다. 창을 닫지 마세요.`;
    updateGoogleSheetsControls();

    try {
      const response = await fetchImpl('/api/google-sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'controlled',
          confirm: true,
          outputGroupKeys: rows.map((row) => row.outputGroupKey)
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw apiPayloadError(result);
      }

      renderGoogleSheetsSyncResult(result);
    } catch (error) {
      renderGoogleSheetsError(error, { showResult: true });
    } finally {
      googleSheetsBusy = false;
      updateGoogleSheetsControls();
    }

    await refreshGoogleSheetsPanel({ preserveResult: true });
  }

  function renderGoogleSheetsStatus(status) {
    elements.googleSheetsTarget.textContent = status.target?.name ?? '확인 불가';
    elements.googleSheetsReadiness.textContent = status.ready ? '전송 준비됨' : '확인 필요';
    elements.googleSheetsReadiness.classList.toggle('readiness-badge--ready', status.ready);
    elements.googleSheetsReadiness.classList.toggle('readiness-badge--error', !status.ready);
  }

  function renderGoogleSheetsPreview(preview) {
    const counts = preview.counts ?? {};
    elements.googleSheetsTarget.textContent = preview.target?.name ?? '확인 불가';
    elements.googleSheetsUnsynced.textContent = `${counts.unsynced ?? 0}건`;
    elements.googleSheetsOutputRows.textContent = `${counts.outputRows ?? 0}행`;
    elements.googleSheetsLastSynced.textContent = preview.syncHistory?.latestSyncedAt
      ? formatKoreanDateTime(preview.syncHistory.latestSyncedAt)
      : '전송 이력 없음';
    elements.googleSheetsStatus.textContent = counts.outputRows > 0
      ? `${counts.readyPages ?? 0}개 Work Log를 ${counts.outputRows}개 정산 행으로 전송할 수 있습니다.`
      : counts.heldPages > 0
        ? `전송 가능한 행은 없고 ${counts.heldPages}개 Work Log가 보류되었습니다.`
        : '새로 전송할 Work Log가 없습니다.';

    elements.googleSheetsPreviewRows.replaceChildren(
      ...preview.rows.map((row, index) => createGoogleSheetsPreviewRow(row, index))
    );
    renderGoogleSheetsHeld(preview.held ?? []);
    elements.googleSheetsPreview.classList.toggle(
      'hidden',
      preview.rows.length === 0 && (preview.held ?? []).length === 0
    );
  }

  function createGoogleSheetsPreviewRow(row, index) {
    const card = documentRef.createElement('article');
    card.className = 'google-sheets-preview-row';

    const heading = documentRef.createElement('div');
    heading.className = 'google-sheets-row-heading';
    const title = documentRef.createElement('strong');
    title.textContent = `${index + 1}. ${row.values?.E || '이름 없음'} · ${row.values?.G || '작업 내용 없음'}`;
    const hours = documentRef.createElement('span');
    hours.textContent = `${row.values?.C ?? 0}시간`;
    heading.append(title, hours);

    const meta = documentRef.createElement('p');
    meta.textContent = `${row.values?.D || '담당자 없음'} · Work Log ${row.pageIds?.length ?? 0}건`;
    const programmes = documentRef.createElement('p');
    programmes.className = 'google-sheets-programmes';
    programmes.textContent = row.values?.F || '';
    card.append(heading, meta, programmes);
    return card;
  }

  function renderGoogleSheetsHeld(held) {
    elements.googleSheetsHeld.replaceChildren();
    elements.googleSheetsHeld.classList.toggle('hidden', held.length === 0);
    if (held.length === 0) {
      return;
    }

    const heading = documentRef.createElement('strong');
    heading.textContent = `보류 ${held.reduce((sum, item) => sum + (item.pageIds?.length ?? 0), 0)}건`;
    const list = documentRef.createElement('ul');
    for (const item of held) {
      const line = documentRef.createElement('li');
      const reason = (item.reasons ?? []).map((entry) => entry.message).join(' · ');
      line.textContent = `${item.title || '입학 요강 그룹'} · ${reason || '입력값을 확인해주세요.'}`;
      list.append(line);
    }
    elements.googleSheetsHeld.append(heading, list);
  }

  function renderGoogleSheetsIssue(issue, target) {
    elements.googleSheetsUnsynced.textContent = '확인 중단';
    elements.googleSheetsOutputRows.textContent = '0행';
    elements.googleSheetsLastSynced.textContent = '확인하지 않음';
    elements.googleSheetsStatus.textContent = issue?.code === 'GOOGLE_TARGET_SHEET_MISSING'
      ? `${target?.name ?? '예상 월별'} 탭이 없습니다. 탭을 만든 뒤 다시 확인해주세요.`
      : issue?.message ?? 'Google Sheets 구조를 확인해주세요.';
  }

  function renderGoogleSheetsSyncResult(result) {
    const writtenRows = result.writtenRowCount ?? 0;
    const writtenPages = result.writtenPageCount ?? 0;
    elements.googleSheetsResult.className = 'creation-result creation-result--success';
    elements.googleSheetsResult.replaceChildren();
    const heading = documentRef.createElement('h3');
    heading.textContent = writtenRows > 0
      ? `${result.target?.name ?? 'Google Sheets'} · ${writtenRows}행 전송 완료`
      : '새로 전송할 항목 없음';
    const detail = documentRef.createElement('p');
    detail.textContent = writtenRows > 0
      ? `Work Log ${writtenPages}건의 C:G 기록과 중복 방지 이력을 저장했습니다.${result.heldPageCount ? ` 보류 ${result.heldPageCount}건은 전송하지 않았습니다.` : ''}`
      : '이미 전송된 항목은 다시 기록하지 않았습니다.';
    elements.googleSheetsResult.append(heading, detail);
  }

  function renderGoogleSheetsError(error, { showResult = false } = {}) {
    const message = googleSheetsErrorMessage(error);
    elements.googleSheetsReadiness.textContent = '연결 오류';
    elements.googleSheetsReadiness.classList.remove('readiness-badge--ready');
    elements.googleSheetsReadiness.classList.add('readiness-badge--error');
    elements.googleSheetsStatus.textContent = message;
    if (showResult) {
      elements.googleSheetsResult.className = 'creation-result creation-result--error';
      elements.googleSheetsResult.replaceChildren();
      const heading = documentRef.createElement('h3');
      heading.textContent = 'Google Sheets 동기화 중단';
      const detail = documentRef.createElement('p');
      detail.textContent = message;
      elements.googleSheetsResult.append(heading, detail);
    }
  }

  function updateGoogleSheetsControls() {
    const rows = googleSheetsPreviewState?.rows ?? [];
    elements.refreshGoogleSheetsButton.disabled = googleSheetsBusy;
    elements.syncGoogleSheetsButton.disabled = googleSheetsBusy
      || !googleSheetsStatusState?.ready
      || googleSheetsStatusState?.writeEnabled !== true
      || rows.length === 0;
    elements.refreshGoogleSheetsButton.textContent = googleSheetsBusy
      ? '확인 중…'
      : '미전송 항목 다시 확인';
    elements.syncGoogleSheetsButton.textContent = googleSheetsBusy
      ? '처리 중…'
      : rows.length > 0
        ? `${rows.length}행 Google Sheets에 전송`
        : 'Google Sheets 동기화';
  }

  function hideGoogleSheetsResult() {
    elements.googleSheetsResult.className = 'creation-result hidden';
    elements.googleSheetsResult.replaceChildren();
  }
}

function apiPayloadError(payload) {
  const error = new Error(payload?.error?.message ?? '요청을 처리하지 못했습니다.');
  error.code = payload?.error?.code ?? 'UNKNOWN';
  error.details = payload?.error?.details ?? {};
  return error;
}

function googleSheetsErrorMessage(error) {
  const targetName = error?.details?.target?.name;
  const issue = error?.details?.issue;
  const messages = {
    GOOGLE_SHEETS_DISABLED: 'Google Sheets 기능이 비활성화되어 있습니다.',
    GOOGLE_SHEETS_WRITE_DISABLED: 'Google Sheets 쓰기 기능이 비활성화되어 있습니다.',
    GOOGLE_SHEETS_FORBIDDEN: '서비스 계정에 이 Spreadsheet의 편집 권한이 없습니다.',
    GOOGLE_SHEETS_UNAUTHORIZED: 'Google 서비스 계정 키를 확인해주세요.',
    GOOGLE_SHEETS_API_ERROR: 'Google Sheets 연결을 확인하지 못했습니다. 인터넷 연결과 서비스 계정 설정을 확인해주세요.',
    GOOGLE_SYNC_IN_PROGRESS: '이미 Google Sheets 동기화가 실행 중입니다.',
    GOOGLE_SYNC_PREVIEW_STALE: '미리보기 이후 항목이 변경되었습니다. 다시 확인한 뒤 전송해주세요.',
    GOOGLE_SYNC_LOG_INVALID: '_JD_SYNC 탭 구조가 예상과 달라 동기화를 중단했습니다.',
    GOOGLE_SHEETS_RATE_LIMITED: 'Google 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.'
  };
  if (error?.code === 'GOOGLE_SHEETS_NOT_READY' && issue?.code === 'GOOGLE_TARGET_SHEET_MISSING') {
    return `${targetName ?? '예상 월별'} 탭이 없습니다. 탭을 만든 뒤 다시 실행해주세요.`;
  }
  if (error?.code === 'GOOGLE_SHEETS_NOT_READY' && issue?.message) {
    return issue.message;
  }
  return messages[error?.code] ?? error?.message ?? 'Google Sheets 요청을 처리하지 못했습니다.';
}

function formatKoreanDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '기록 있음';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}
