import { SOP_REQUEST_TYPE } from '/shared/sopReview.js';

export function initializeNotionPreviewController({
  documentRef = document,
  fetchImpl = window.fetch.bind(window),
  getContext = () => ({
    requestState: null,
    clientMode: 'new',
    workLogCount: 1
  }),
  validateRequest = () => ({}),
  renderErrors = () => {},
  checkConnection = async () => false,
  prepareState = (payload) => structuredClone(payload),
  onRender = () => {},
  onPreviewStarted = () => {},
  onPreviewCompleted = () => {},
  onPreviewInvalidated = () => {},
  onStudentSelectionStarted = () => {}
} = {}) {
  const elements = {
    previewNotionButton: documentRef.querySelector('#preview-notion-button'),
    notionPreviewStatus: documentRef.querySelector('#notion-preview-status')
  };

  let notionPreviewState = null;
  let previewRequestSequence = 0;
  let workLogRequestSequence = 0;
  let isPreviewing = false;

  elements.previewNotionButton.addEventListener('click', () => {
    void previewNotionMatches();
  });

  return {
    getState: () => notionPreviewState,
    invalidate: invalidateNotionPreview,
    preview: previewNotionMatches,
    reset: resetNotionPreview,
    setStatus: setPreviewStatus,
    syncButtonState: syncPreviewButtonState,
    updateWorkLogTitleForSelection
  };

  function setPreviewStatus(message) {
    elements.notionPreviewStatus.textContent = message;
  }

  function syncPreviewButtonState() {
    const { requestState } = getContext();
    const errors = requestState ? validateRequest(requestState) : { request: 'missing' };
    elements.previewNotionButton.disabled = isPreviewing || Object.keys(errors).length > 0;
  }

  function resetNotionPreview() {
    previewRequestSequence += 1;
    workLogRequestSequence += 1;
    notionPreviewState = null;
    isPreviewing = false;
    elements.previewNotionButton.textContent = 'Notion 항목 확인';
    setPreviewStatus('');
    syncPreviewButtonState();
  }

  function invalidateNotionPreview(message) {
    previewRequestSequence += 1;
    workLogRequestSequence += 1;
    isPreviewing = false;
    const hadPreview = Boolean(notionPreviewState);
    notionPreviewState = null;
    elements.previewNotionButton.textContent = 'Notion 항목 확인';
    if (hadPreview) {
      setPreviewStatus(message);
    }
    onPreviewInvalidated(message);
    syncPreviewButtonState();
  }

  async function previewNotionMatches(selectedStudentId) {
    const sequence = ++previewRequestSequence;
    workLogRequestSequence += 1;
    const { requestState, clientMode } = getContext();
    const errors = validateRequest(requestState);
    renderErrors(errors);

    if (Object.keys(errors).length > 0) {
      setPreviewStatus('입력 오류를 수정한 뒤 Notion 항목을 조회해주세요.');
      syncPreviewButtonState();
      return;
    }

    const previousState = notionPreviewState;
    const preservedStudentId = typeof selectedStudentId === 'string'
      ? selectedStudentId
      : previousState?.student?.selectedStudentId ?? '';
    const preservedMajorId = previousState?.sopReview?.selectedMajorId ?? '';

    onPreviewStarted();
    notionPreviewState = null;
    isPreviewing = true;
    elements.previewNotionButton.disabled = true;
    elements.previewNotionButton.textContent = 'Notion 연결 및 항목 확인 중...';
    setPreviewStatus('연결과 스키마를 자동 검사하고 있습니다...');

    try {
      const schemaReady = await checkConnection();
      if (sequence !== previewRequestSequence) {
        return;
      }
      if (!schemaReady) {
        setPreviewStatus('Notion 연결 또는 스키마 문제를 해결한 뒤 다시 확인해주세요.');
        onRender();
        return;
      }

      setPreviewStatus('Notion 항목을 읽기 전용으로 확인하고 있습니다...');
      const response = await fetchImpl('/api/notion/preview', {
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
          selectedStudentId: preservedStudentId,
          selectedMajorId: preservedMajorId
        })
      });
      const payload = await response.json();

      if (sequence !== previewRequestSequence) {
        return;
      }
      if (!response.ok) {
        notionPreviewState = null;
        setPreviewStatus(payload?.error?.message ?? 'Notion 미리보기에 실패했습니다.');
        onRender();
        return;
      }

      notionPreviewState = prepareState(payload);
      onPreviewCompleted();
      setPreviewStatus(payload.blockingIssues?.length
        ? '미리보기가 끝났습니다. 아래 확인 필요 항목을 검토해주세요.'
        : '미리보기가 끝났습니다.');
      onRender();
    } catch (error) {
      if (sequence !== previewRequestSequence) {
        return;
      }
      notionPreviewState = null;
      setPreviewStatus(`Notion 미리보기 실패: ${error.message}`);
      onRender();
    } finally {
      if (sequence !== previewRequestSequence) {
        return;
      }
      isPreviewing = false;
      elements.previewNotionButton.textContent = notionPreviewState
        ? 'Notion 항목 다시 확인'
        : 'Notion 항목 확인';
      syncPreviewButtonState();
    }
  }

  async function updateWorkLogTitleForSelection(studentId) {
    const previewState = notionPreviewState;
    if (!previewState) {
      return;
    }

    const { requestState, workLogCount } = getContext();
    if (requestState.requestType === SOP_REQUEST_TYPE) {
      await previewNotionMatches(studentId);
      return;
    }

    const sequence = ++workLogRequestSequence;
    onStudentSelectionStarted();
    previewState.student.selectedStudentId = studentId;
    previewState.student.selection = {
      type: 'manual',
      studentId
    };
    previewState.workLog.title = '선택한 학생의 작업 일지 순번 확인 중...';
    previewState.workLog.titles = [previewState.workLog.title];
    onRender();

    try {
      const response = await fetchImpl('/api/notion/work-log-title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selectedStudentId: studentId,
          workLogCount
        })
      });
      const payload = await response.json();

      if (sequence !== workLogRequestSequence || notionPreviewState !== previewState) {
        return;
      }
      if (!response.ok) {
        setPreviewStatus(payload?.error?.message ?? '작업 일지 순번을 확인하지 못했습니다.');
        setWorkLogSelectionFailure(previewState);
        onRender();
        return;
      }

      previewState.workLog = {
        ...previewState.workLog,
        ...payload.workLog
      };
      setPreviewStatus('선택한 학생 기준 작업 일지 순번을 다시 계산했습니다.');
      onRender();
    } catch (error) {
      if (sequence !== workLogRequestSequence || notionPreviewState !== previewState) {
        return;
      }
      setWorkLogSelectionFailure(previewState);
      setPreviewStatus(`작업 일지 순번 확인 실패: ${error.message}`);
      onRender();
    }
  }

  function setWorkLogSelectionFailure(previewState) {
    previewState.workLog.title = '기존 학생 선택 필요';
    previewState.workLog.titles = [previewState.workLog.title];
  }
}
