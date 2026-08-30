export const JANDI_COMMENT_MARKER = '[JANDI 댓글 요청]';
export const JANDI_PARENT_MARKER = '[JANDI 원글 문맥]';

export function formatJandiCommentMessage({ commentMessage, parentMessage }) {
  return [
    JANDI_COMMENT_MARKER,
    String(commentMessage ?? '').trim(),
    JANDI_PARENT_MARKER,
    String(parentMessage ?? '').trim()
  ].filter(Boolean).join('\n');
}

export function splitJandiMessageContext(message) {
  const value = String(message ?? '').trim();
  if (!value.startsWith(JANDI_COMMENT_MARKER)) {
    return {
      sourceType: 'post',
      primaryMessage: value,
      parentMessage: ''
    };
  }

  const parentMarkerIndex = value.indexOf(`\n${JANDI_PARENT_MARKER}`);
  if (parentMarkerIndex === -1) {
    return {
      sourceType: 'comment',
      primaryMessage: value.slice(JANDI_COMMENT_MARKER.length).trim(),
      parentMessage: ''
    };
  }

  return {
    sourceType: 'comment',
    primaryMessage: value.slice(JANDI_COMMENT_MARKER.length, parentMarkerIndex).trim(),
    parentMessage: value.slice(parentMarkerIndex + JANDI_PARENT_MARKER.length + 1).trim()
  };
}
