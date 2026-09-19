import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJandiCommentMessage,
  formatJandiSelectedAttachments,
  selectJandiRequestComment,
  splitJandiMessageContext
} from '../src/shared/jandiMessageContext.js';
import { mockExtractJandiMessage } from '../src/server/extraction/mockExtractor.js';

test('comment context keeps the comment current and uses the parent only for the missing Student', () => {
  const message = formatJandiCommentMessage({
    commentMessage: [
      '댓글담당자',
      '2026/08/29 PM 04:44',
      '자소서 2차감수 부탁드립니다.'
    ].join('\n'),
    parentMessage: [
      '원글담당자',
      '2026/08/20 PM 01:20',
      '[업무요청] 홍길동 SOP 1차 감수',
      'UCL',
      'MSc Management',
      'https://www.ucl.ac.uk/example'
    ].join('\n')
  });
  const context = splitJandiMessageContext(message);
  const extraction = mockExtractJandiMessage(message);

  assert.equal(context.sourceType, 'comment');
  assert.equal(extraction.sourceType, 'comment');
  assert.equal(extraction.requesterName, '댓글담당자');
  assert.equal(extraction.requestDateTime, '2026-08-29T16:44:00+09:00');
  assert.equal(extraction.studentName, '홍길동');
  assert.deepEqual(extraction.contextFallbacks, ['studentName']);
  assert.deepEqual(extraction.sopReview, { round: 2, language: '영문' });
  assert.deepEqual(extraction.programmes, []);
});

test('additional admissions programmes in a comment do not merge parent programmes', () => {
  const message = formatJandiCommentMessage({
    commentMessage: [
      '댓글담당자',
      '2026/08/29 PM 05:10',
      '입학요강 추가 2개 부탁드립니다.',
      'UCL - MSc Management',
      'https://www.ucl.ac.uk/example',
      'KCL - International Management MSc',
      'https://www.kcl.ac.uk/example'
    ].join('\n'),
    parentMessage: [
      '원글담당자',
      '2026/08/20 PM 01:20',
      '[업무요청] 홍길동 입학요강 3개 요청',
      'Warwick - Finance MSc',
      'https://warwick.ac.uk/example'
    ].join('\n')
  });
  const extraction = mockExtractJandiMessage(message);

  assert.equal(extraction.requestType, 'admissions');
  assert.equal(extraction.studentName, '홍길동');
  assert.deepEqual(
    extraction.programmes.map((programme) => programme.universityName),
    ['UCL', 'KCL']
  );
});

test('delivery comment resolves to the nearest earlier request in the same thread', () => {
  const comments = [
    { message: '@김유진 신민수님 SOP 감수본 전달드려요.' },
    { message: '@Marion Lee (정규감수) 신민수 SOP2차감수 요청드립니다. 감사합니다.' },
    { message: '@김유진 신민수님 SOP 2차 감수본 전달드려요.' }
  ];

  assert.equal(selectJandiRequestComment(comments, 2), 1);
  assert.equal(selectJandiRequestComment(comments, 1), 1);
  assert.equal(selectJandiRequestComment(comments, 0), -1);
});

test('selected attachment block stays outside request and parent parsing context', () => {
  const message = formatJandiSelectedAttachments(formatJandiCommentMessage({
    commentMessage: '김유진\n2026/09/16 PM 03:38\n신민수 SOP2차감수 요청드립니다.',
    parentMessage: '김유진\n2026/09/10 PM 02:14\n[업무요청] 신민수 SOP감수 요청'
  }), ['신민수_SOP_2차.docx']);
  const context = splitJandiMessageContext(message);

  assert.doesNotMatch(context.parentMessage, /docx/u);
  assert.equal(context.selectedAttachmentText, '신민수_SOP_2차.docx');
});
