import test from 'node:test';
import assert from 'node:assert/strict';

import { restoreLinkedUrls } from '../automation/jandi-message-text.mjs';

test('restores a scheme-less Jandi link at its original position', () => {
  const bodyText = [
    '2. Imperial\u00a0College\u00a0London Design\u00a0with\u00a0Behaviour\u00a0Science',
    'imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/',
    '3. City St George’s, University of London',
    'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering'
  ].join('\n');

  const restored = restoreLinkedUrls(bodyText, [
    {
      text: 'imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/',
      href: 'http://imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/'
    },
    {
      text: 'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering',
      href: 'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering'
    }
  ]);

  assert.equal(restored, [
    '2. Imperial College London Design with Behaviour Science',
    'http://imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/',
    '3. City St George’s, University of London',
    'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering'
  ].join('\n'));
  assert.equal(restored.endsWith('http://imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/'), false);
});

test('keeps non-URL link labels and appends their targets as a fallback', () => {
  const restored = restoreLinkedUrls('Programme details', [
    { text: 'Programme details', href: 'https://example.edu/course' }
  ]);

  assert.equal(restored, 'Programme details\nhttps://example.edu/course');
});
