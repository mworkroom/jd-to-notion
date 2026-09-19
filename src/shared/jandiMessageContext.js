export const JANDI_COMMENT_MARKER = '[JANDI 댓글 요청]';
export const JANDI_PARENT_MARKER = '[JANDI 원글 문맥]';
export const JANDI_SELECTED_ATTACHMENTS_MARKER = '[JANDI 선택 댓글 첨부파일]';

export function formatJandiCommentMessage({ commentMessage, parentMessage }) {
  return [
    JANDI_COMMENT_MARKER,
    String(commentMessage ?? '').trim(),
    JANDI_PARENT_MARKER,
    String(parentMessage ?? '').trim()
  ].filter(Boolean).join('\n');
}

export function formatJandiSelectedAttachments(message, attachmentNames = []) {
  const names = [...new Set(attachmentNames
    .map((name) => String(name ?? '').trim())
    .filter(Boolean))];

  return [
    String(message ?? '').trim(),
    JANDI_SELECTED_ATTACHMENTS_MARKER,
    ...names
  ].filter(Boolean).join('\n');
}

export function selectJandiRequestComment(comments, selectedIndex) {
  if (!Array.isArray(comments) || selectedIndex < 0 || selectedIndex >= comments.length) {
    return -1;
  }

  for (let index = selectedIndex; index >= 0; index -= 1) {
    if (isLikelyJandiRequestMessage(comments[index]?.message)) {
      return index;
    }
  }

  return -1;
}

export function isLikelyJandiRequestMessage(message) {
  const value = String(message ?? '');
  const hasRequestVerb = /요청|부탁/u.test(value);
  const hasWorkKeyword = /SOP|자소서|에세이|감수|입학\s*요강|지원서|추천서/iu.test(value);
  const isDeliveryOnly = /전달|완료/u.test(value)
    && !/요청\s*(?:드립니다|드려요|합니다|바랍니다)|부탁\s*(?:드립니다|드려요|합니다)/u.test(value);
  return hasRequestVerb && hasWorkKeyword && !isDeliveryOnly;
}

export function splitJandiMessageContext(message) {
  const rawValue = String(message ?? '').trim();
  const selectedAttachmentsMarkerIndex = rawValue.indexOf(
    `\n${JANDI_SELECTED_ATTACHMENTS_MARKER}`
  );
  const value = selectedAttachmentsMarkerIndex === -1
    ? rawValue
    : rawValue.slice(0, selectedAttachmentsMarkerIndex).trim();
  const selectedAttachmentText = selectedAttachmentsMarkerIndex === -1
    ? ''
    : rawValue.slice(
      selectedAttachmentsMarkerIndex + JANDI_SELECTED_ATTACHMENTS_MARKER.length + 1
    ).trim();
  if (!value.startsWith(JANDI_COMMENT_MARKER)) {
    return {
      sourceType: 'post',
      primaryMessage: value,
      parentMessage: '',
      selectedAttachmentText
    };
  }

  const parentMarkerIndex = value.indexOf(`\n${JANDI_PARENT_MARKER}`);
  if (parentMarkerIndex === -1) {
    return {
      sourceType: 'comment',
      primaryMessage: value.slice(JANDI_COMMENT_MARKER.length).trim(),
      parentMessage: '',
      selectedAttachmentText
    };
  }

  return {
    sourceType: 'comment',
    primaryMessage: value.slice(JANDI_COMMENT_MARKER.length, parentMarkerIndex).trim(),
    parentMessage: value.slice(parentMarkerIndex + JANDI_PARENT_MARKER.length + 1).trim(),
    selectedAttachmentText
  };
}
