import { SOP_REQUEST_TYPE } from '/shared/sopReview.js';

export function initializeSopDownloadPanel({
  documentRef = document,
  fetchImpl = window.fetch.bind(window),
  windowRef = window,
  getContext = () => ({ requestState: null, message: '' }),
  rearmDelayMs = 500,
  pollDelayMs = 750
} = {}) {
  const statusElement = documentRef.querySelector('#sop-download-status');

  let contextId = '';
  let pollTimer = null;
  let rearmTimer = null;
  let requestSequence = 0;

  return {
    arm: () => armSopDownload({ autoDownload: true }),
    cancel: cancelSopDownload,
    scheduleRearm
  };

  function scheduleRearm() {
    windowRef.clearTimeout(rearmTimer);
    rearmTimer = windowRef.setTimeout(() => {
      void armSopDownload({ autoDownload: false });
    }, rearmDelayMs);
  }

  async function armSopDownload({ autoDownload = true } = {}) {
    const { requestState, message = '' } = getContext();
    const studentName = requestState?.studentName?.trim() ?? '';
    const normalizedMessage = message.trim();
    const currentRequestSequence = ++requestSequence;

    stopPolling();
    if (!studentName || !normalizedMessage || requestState?.requestType !== SOP_REQUEST_TYPE) {
      renderStatus({ status: 'not_armed', reason: 'student_name_missing' });
      return;
    }

    renderStatus({ status: 'preparing' });
    try {
      const response = await fetchImpl('/api/sop-download/arm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName, message: normalizedMessage, autoDownload })
      });
      const status = await response.json();
      if (currentRequestSequence !== requestSequence) {
        return;
      }

      contextId = status.id ?? '';
      renderStatus(status);
      if (status.status === 'armed') {
        pollStatus();
      }
    } catch (error) {
      renderStatus({
        status: 'error',
        reason: 'download_arm_failed',
        message: error.message
      });
    }
  }

  function pollStatus() {
    stopPolling();

    const poll = async () => {
      if (!contextId) {
        return;
      }

      try {
        const response = await fetchImpl(
          `/api/sop-download/status?id=${encodeURIComponent(contextId)}`
        );
        const status = await response.json();
        if (!response.ok) {
          renderStatus({ status: 'error', reason: status.reason ?? 'status_failed' });
          return;
        }

        renderStatus(status);
        if (status.status === 'armed') {
          pollTimer = windowRef.setTimeout(poll, pollDelayMs);
        }
      } catch (error) {
        renderStatus({
          status: 'error',
          reason: 'status_failed',
          message: error.message
        });
      }
    };

    pollTimer = windowRef.setTimeout(poll, pollDelayMs);
  }

  async function cancelSopDownload() {
    requestSequence += 1;
    windowRef.clearTimeout(rearmTimer);
    stopPolling();
    contextId = '';
    try {
      await fetchImpl('/api/sop-download/cancel', { method: 'POST' });
    } catch {
      // The app can still clear its local state if the local server is restarting.
    }
  }

  function stopPolling() {
    windowRef.clearTimeout(pollTimer);
    pollTimer = null;
  }

  function renderStatus(status = {}) {
    const attachments = (status.attachmentNames ?? []).join(' · ');
    let tone = 'neutral';
    let message = 'SOP 요청을 분석하면 첨부파일 이름 자동 정리를 준비합니다.';

    if (status.status === 'preparing') {
      tone = 'working';
      message = 'SOP 첨부파일과 학생 이름을 확인하고 있습니다...';
    } else if (status.status === 'armed') {
      tone = 'working';
      if (status.autoDownloadStatus === 'triggered') {
        message = `자동 다운로드 시작됨 · ${status.selectedAttachmentName || attachments} · 완료되면 학생명을 앞으로 옮깁니다.`;
      } else if (status.autoDownloadStatus === 'watching') {
        message = `다운로드 감시 중 · ${status.selectedAttachmentName || attachments} · 완료되면 학생명을 앞으로 옮깁니다.`;
      } else if (status.autoDownloadStatus === 'manual') {
        tone = 'warning';
        if (['multiple_sop_candidates', 'ambiguous_attachments'].includes(status.autoDownloadReason)) {
          message = `자동 다운로드 보류 · SOP 파일을 하나로 구분할 수 없습니다. JANDI에서 ${attachments} 중 필요한 파일을 다운로드하세요.`;
        } else {
          message = `자동 다운로드를 시작하지 못했습니다 · JANDI에서 ${attachments} 파일을 직접 다운로드하면 이름은 자동 정리됩니다.`;
        }
      } else {
        message = `파일명 자동 정리 준비됨 · ${attachments} 파일을 확인하고 있습니다.`;
      }
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
      const currentStudentName = getContext().requestState?.studentName ?? '';
      tone = 'error';
      message = `자동 정리 중단 · 본문 학생명 ${status.studentName || currentStudentName}과 파일명의 ${
        (status.conflictingStudentNames ?? []).join(', ') || '다른 Student 이름'
      }이 일치하지 않습니다.`;
    } else if (status.status === 'timed_out') {
      tone = 'warning';
      message = '2분 동안 해당 SOP 다운로드를 찾지 못했습니다. 다시 Analyze한 뒤 다운로드해주세요.';
    } else if (status.status === 'not_armed' && status.reason === 'supported_attachment_not_found') {
      tone = 'warning';
      message = '이 JANDI 메시지에서 DOCX/PDF 첨부파일 이름을 찾지 못해 자동 다운로드를 준비하지 않았습니다.';
    } else if (status.status === 'not_armed' && status.reason === 'reference_only') {
      tone = 'warning';
      message = '입학요강 등 참고 파일만 감지되어 자동 다운로드하지 않았습니다.';
    } else if (status.status === 'not_armed') {
      tone = 'warning';
      message = '학생 이름을 확인한 뒤 파일명 자동 정리를 다시 준비해주세요.';
    } else if (status.status === 'error') {
      tone = 'error';
      message = status.reason === 'downloads_directory_unavailable'
        ? '다운로드 폴더를 찾지 못했습니다. JANDI_DOWNLOAD_DIR 설정을 확인해주세요.'
        : `파일명 자동 정리를 시작하지 못했습니다${status.message ? `: ${status.message}` : '.'}`;
    }

    statusElement.dataset.tone = tone;
    statusElement.textContent = message;
  }
}
