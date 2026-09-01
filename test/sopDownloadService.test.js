import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createSopDownloadService } from '../src/server/sop/sopDownloadService.js';

test('renames only the matching completed JANDI DOCX download', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sop-download-'));
  const service = testService(directory);

  try {
    const armed = await service.arm({
      studentName: '은주하',
      message: ['은주하 SOP 1차 감수', 'SOP_1차_0731.docx'].join('\n')
    });
    assert.equal(armed.status, 'armed');

    await writeFile(path.join(directory, '무관한파일.docx'), 'unrelated');
    await writeFile(path.join(directory, 'SOP_1차_0731.docx.crdownload'), 'partial');
    await wait(40);
    assert.equal(service.getStatus(armed.id).status, 'armed');

    await rename(
      path.join(directory, 'SOP_1차_0731.docx.crdownload'),
      path.join(directory, 'SOP_1차_0731.docx')
    );
    const completed = await waitForTerminal(service, armed.id);

    assert.equal(completed.status, 'completed');
    assert.equal(completed.filename, '은주하_SOP_1차_0731.docx');
    assert.equal(await readFile(path.join(directory, completed.filename), 'utf8'), 'partial');
    assert.equal(await readFile(path.join(directory, '무관한파일.docx'), 'utf8'), 'unrelated');
  } finally {
    service.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves an existing normalized file and adds a collision suffix', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sop-download-collision-'));
  const service = testService(directory);

  try {
    await writeFile(path.join(directory, '은주하_SOP_초안.docx'), 'existing');
    const armed = await service.arm({
      studentName: '은주하',
      message: 'SOP_초안.docx'
    });
    await writeFile(path.join(directory, 'SOP_초안.docx'), 'new');
    const completed = await waitForTerminal(service, armed.id);

    assert.equal(completed.status, 'completed');
    assert.equal(completed.filename, '은주하_SOP_초안 (2).docx');
    assert.equal(completed.collisionSuffixApplied, true);
    assert.equal(await readFile(path.join(directory, '은주하_SOP_초안.docx'), 'utf8'), 'existing');
    assert.equal(await readFile(path.join(directory, completed.filename), 'utf8'), 'new');
  } finally {
    service.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

test('blocks arming when a different registered Student name is in the attachment filename', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sop-download-conflict-'));
  const service = testService(directory, {
    resolveKnownStudentNames: async (names) => names.includes('김철수') ? ['김철수'] : []
  });

  try {
    const result = await service.arm({
      studentName: '은주하',
      message: 'SOP_김철수_초안.docx'
    });

    assert.equal(result.status, 'conflict');
    assert.equal(result.reason, 'student_name_mismatch');
    assert.deepEqual(result.conflictingStudentNames, ['김철수']);
  } finally {
    service.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

test('arms before triggering JANDI and renames an automatically downloaded SOP PDF', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sop-download-pdf-'));
  const calls = [];
  const service = testService(directory, {
    triggerJandiDownload: async ({ filename }) => {
      calls.push(filename);
      await writeFile(path.join(directory, filename), 'pdf');
      return { status: 'triggered', reason: '', filename };
    }
  });

  try {
    const armed = await service.arm({
      studentName: '은주하',
      message: 'Personal Statement final.pdf'
    });
    const completed = await waitForTerminal(service, armed.id);

    assert.deepEqual(calls, ['Personal Statement final.pdf']);
    assert.equal(armed.autoDownloadStatus, 'triggered');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.filename, '은주하_Personal Statement final.pdf');
  } finally {
    service.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps multiple SOP attachments armed for manual selection without clicking JANDI', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sop-download-manual-'));
  let triggerCount = 0;
  const service = testService(directory, {
    triggerJandiDownload: async () => {
      triggerCount += 1;
      return { status: 'triggered', reason: '' };
    }
  });

  try {
    const armed = await service.arm({
      studentName: '은주하',
      message: ['SOP old.docx', 'SOP final.docx'].join('\n')
    });

    assert.equal(armed.status, 'armed');
    assert.equal(armed.autoDownloadStatus, 'manual');
    assert.equal(armed.autoDownloadReason, 'multiple_sop_candidates');
    assert.deepEqual(armed.attachmentNames, ['SOP old.docx', 'SOP final.docx']);
    assert.equal(triggerCount, 0);
  } finally {
    service.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rearms the watcher after edits without clicking the JANDI attachment again', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sop-download-rearm-'));
  let triggerCount = 0;
  const service = testService(directory, {
    triggerJandiDownload: async () => {
      triggerCount += 1;
      return { status: 'triggered', reason: '' };
    }
  });

  try {
    const armed = await service.arm({
      studentName: '은주하',
      message: 'Personal Statement final.docx',
      autoDownload: false
    });

    assert.equal(armed.status, 'armed');
    assert.equal(armed.autoDownloadStatus, 'watching');
    assert.equal(armed.autoDownloadReason, 'rearmed_without_click');
    assert.equal(triggerCount, 0);
  } finally {
    service.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

function testService(directory, options = {}) {
  return createSopDownloadService({
    downloadsDirectory: directory,
    timeoutMs: 1_000,
    pollIntervalMs: 10,
    stablePollCount: 2,
    ...options
  });
}

async function waitForTerminal(service, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = service.getStatus(id);
    if (status?.status !== 'armed') {
      return status;
    }
    await wait(15);
  }
  assert.fail('SOP download watcher did not reach a terminal state.');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
