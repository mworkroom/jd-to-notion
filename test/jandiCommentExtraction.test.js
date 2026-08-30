import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJandiCommentMessage,
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
