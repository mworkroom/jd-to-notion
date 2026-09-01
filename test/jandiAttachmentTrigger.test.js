import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createJandiAttachmentTrigger } from '../src/server/sop/jandiAttachmentTrigger.js';

test('triggers only when the fresh source context matches the message and attachment', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jandi-trigger-'));
  const contextPath = path.join(directory, 'context.json');
  const calls = [];
  const message = '은주하 SOP 1차\nSOP final.docx';
  const now = Date.parse('2026-09-02T03:00:00.000Z');
  await writeFile(contextPath, JSON.stringify({
    capturedAt: new Date(now - 1_000).toISOString(),
    messageSha256: sha256(message),
    attachmentNames: ['SOP final.docx'],
    locator: { postId: '500' }
  }));

  try {
    const trigger = createJandiAttachmentTrigger({
      contextPath,
      now: () => now,
      runInspector: async (input) => calls.push(input)
    });
    const result = await trigger.trigger({ message, filename: 'SOP final.docx' });

    assert.equal(result.status, 'triggered');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].filename, 'SOP final.docx');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps stale, mismatched, and missing contexts manual', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jandi-trigger-manual-'));
  const contextPath = path.join(directory, 'context.json');
  const message = '은주하 SOP\nSOP.pdf';
  const now = Date.parse('2026-09-02T03:00:00.000Z');
  const trigger = createJandiAttachmentTrigger({
    contextPath,
    now: () => now,
    contextMaxAgeMs: 1_000,
    runInspector: async () => assert.fail('stale or mismatched context must not click')
  });

  try {
    assert.equal(
      (await trigger.trigger({ message, filename: 'SOP.pdf' })).reason,
      'source_context_missing'
    );
    await writeFile(contextPath, JSON.stringify({
      capturedAt: new Date(now - 2_000).toISOString(),
      messageSha256: sha256(message),
      attachmentNames: ['SOP.pdf']
    }));
    assert.equal(
      (await trigger.trigger({ message, filename: 'SOP.pdf' })).reason,
      'source_context_expired'
    );
    await writeFile(contextPath, JSON.stringify({
      capturedAt: new Date(now).toISOString(),
      messageSha256: sha256('another message'),
      attachmentNames: ['SOP.pdf']
    }));
    assert.equal(
      (await trigger.trigger({ message, filename: 'SOP.pdf' })).reason,
      'source_context_mismatch'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim()).digest('hex');
}
