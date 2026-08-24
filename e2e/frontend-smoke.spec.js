import { expect, test } from '@playwright/test';

const extractionFixture = {
  extraction: {
    requestType: 'admissions',
    requesterName: '테스트 담당자',
    requestDateTime: '2026-08-24T09:00:00+09:00',
    studentName: '김테스트',
    programmes: [
      {
        rawUniversityName: 'University of Warwick',
        universityName: 'University of Warwick',
        programmeNameOriginal: 'MSc Computer Science',
        programmeUrl: 'https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/'
      }
    ],
    extractionWarnings: [],
    sopReview: null
  },
  errors: {}
};

const sopExtractionFixture = {
  extraction: {
    requestType: 'sop_review',
    requesterName: '테스트 담당자',
    requestDateTime: '2026-08-25T09:00:00+09:00',
    studentName: '김테스트',
    programmes: [],
    extractionWarnings: [],
    sopReview: {
      round: 1,
      language: '영문'
    }
  },
  errors: {}
};

const googleStatusFixture = {
  ok: true,
  enabled: true,
  writeEnabled: true,
  ready: true,
  target: {
    name: '26년 9월'
  }
};

const googlePreviewFixture = {
  ok: true,
  target: {
    name: '26년 9월'
  },
  counts: {
    discovered: 3,
    synced: 0,
    unsynced: 3,
    readyPages: 2,
    heldPages: 1,
    outputRows: 1
  },
  rows: [
    {
      outputGroupKey: 'fixture-output-group',
      pageIds: ['work-log-1', 'work-log-2'],
      values: {
        C: 1.5,
        D: '테스트 담당자',
        E: '김테스트',
        F: 'University of Warwick - Computer Science MSc',
        G: '입학 요강'
      }
    }
  ],
  held: [
    {
      title: '입학 요강 보류 그룹',
      pageIds: ['work-log-3'],
      reasons: [
        {
          message: 'Hours를 입력해주세요.'
        }
      ]
    }
  ],
  syncHistory: {
    latestSyncedAt: '2026-08-24T08:30:00+09:00'
  }
};

const notionPreviewFixture = {
  ok: true,
  requestType: 'admissions',
  blockingIssues: [],
  agent: {
    status: 'matched',
    requestedName: '테스트 담당자',
    selected: {
      id: 'agent-1',
      name: '테스트 담당자',
      url: 'https://www.notion.so/agent-1'
    },
    candidates: []
  },
  student: {
    mode: 'new',
    baseName: '김테스트',
    existingFamily: [],
    suggestedStudentName: '김테스트',
    selectedStudentId: null,
    proposedAction: 'create'
  },
  programmes: [
    {
      index: 0,
      university: {
        status: 'matched',
        requestedName: 'University of Warwick',
        selected: {
          id: 'university-1',
          name: 'University of Warwick',
          url: 'https://www.notion.so/university-1'
        },
        candidates: []
      },
      major: {
        status: 'matched',
        requestedOriginalName: 'MSc Computer Science',
        searchKey: 'computer science',
        proposedCreateName: 'Computer Science MSc',
        selected: {
          id: 'major-1',
          name: 'Computer Science MSc',
          url: 'https://www.notion.so/major-1'
        },
        candidates: []
      },
      officialProgrammeName: 'MSc Computer Science',
      programmeUrl: 'https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/',
      needsMajorNameReview: false,
      degreeNameWarning: null
    }
  ],
  workLog: {
    title: '입학 요강 1',
    titles: ['입학 요강 1'],
    count: 1,
    deadline: '2026-08-26',
    category: '입학 요강',
    requestSeason: '2026/27'
  },
  phase3Plan: {
    canCreate: false,
    reasons: ['Fixture에서는 실제 Notion 쓰기를 사용하지 않습니다.'],
    studentAction: 'create',
    universitiesToCreate: [],
    majorsToCreate: []
  }
};

const notionCreationFixture = {
  ok: true,
  finalStudentName: '김테스트',
  student: {
    id: 'student-created-1',
    name: '김테스트',
    url: 'https://www.notion.so/student-created-1'
  },
  universities: [
    {
      action: 'reuse',
      id: 'university-1',
      name: 'University of Warwick',
      url: 'https://www.notion.so/university-1'
    }
  ],
  majors: [
    {
      action: 'reuse',
      id: 'major-1',
      name: 'Computer Science MSc',
      url: 'https://www.notion.so/major-1'
    }
  ],
  workLogs: [
    {
      id: 'work-log-created-1',
      title: '입학 요강 1',
      url: 'https://www.notion.so/work-log-created-1'
    }
  ]
};

test('Google Sheets 미리보기와 확인 동기화가 격리된 fixture에서 동작한다', async ({ page }) => {
  const api = await installApiFixtures(page);

  await page.goto('/');

  await expect(page).toHaveTitle('JD to Notion');
  await expect(page.locator('#google-sheets-target')).toHaveText('26년 9월');
  await expect(page.locator('#google-sheets-unsynced')).toHaveText('3건');
  await expect(page.locator('#google-sheets-output-rows')).toHaveText('1행');
  await expect(page.locator('#google-sheets-preview')).toContainText('Computer Science MSc');
  await expect(page.locator('#google-sheets-held')).toContainText('Hours를 입력해주세요.');

  const syncButton = page.getByRole('button', { name: '1행 Google Sheets에 전송' });
  await expect(syncButton).toBeEnabled();
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('C:G만 기록하며 A:B는 변경하지 않습니다.');
    await dialog.accept();
  });
  await syncButton.click();

  await expect(page.locator('#google-sheets-result')).toContainText('1행 전송 완료');
  expect(api.syncRequests).toEqual([
    {
      mode: 'controlled',
      confirm: true,
      outputGroupKeys: ['fixture-output-group']
    }
  ]);
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test('JANDI 분석부터 Notion 미리보기와 Word 준비까지 주요 화면 상태가 이어진다', async ({ page }) => {
  const api = await installApiFixtures(page);

  await page.goto('/');
  await page.locator('#jandi-message').fill('브라우저 회귀 테스트용 JANDI 요청');
  await page.getByRole('button', { name: 'Analyze' }).click();

  await expect(page.locator('#analysis-status')).toContainText('Extraction complete');
  await expect(page.locator('#review-section')).toBeVisible();
  await expect(page.locator('#requester-name')).toHaveValue('테스트 담당자');
  await expect(page.locator('#student-name')).toHaveValue('김테스트');
  await expect(page.locator('#programme-list')).toContainText('Computer Science MSc');
  await expect(page.locator('#word-status')).toHaveText('준비 완료');

  await page.getByRole('button', { name: 'Notion 항목 확인' }).click();

  await expect(page.locator('#notion-status')).toHaveText('연결 및 스키마 정상');
  await expect(page.locator('#notion-preview-status')).toHaveText('미리보기가 끝났습니다.');
  await expect(page.locator('#creation-plan')).toBeVisible();
  await expect(page.locator('#create-notion-button')).toBeDisabled();
  await expect(page.locator('#word-summary')).toContainText('Computer Science MSc');
  await expect(page.locator('#generate-word-button')).toBeEnabled();

  await page.getByRole('button', { name: 'Word 파일 만들기' }).click();

  await expect(page.locator('#word-result')).toContainText('Word 파일 생성 완료');
  await expect(page.locator('#word-result')).toContainText('[2026입학요강] 김테스트님_MSc Computer Science.docx');
  expect(api.wordRequests).toEqual([
    {
      studentName: '김테스트',
      degree: '석사',
      filename: '[2026입학요강] 김테스트님_MSc Computer Science.docx',
      programmeLabel: 'MSc Computer Science',
      programmes: [
        {
          rawUniversityName: 'University of Warwick',
          reviewedMajorName: 'Computer Science MSc',
          programmeUrl: 'https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/'
        }
      ]
    }
  ]);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Clear' }).click();

  await expect(page.locator('#review-section')).toBeHidden();
  await expect(page.locator('#notion-preview-section')).toBeHidden();
  await expect(page.locator('#word-generation-section')).toBeHidden();
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
});

test('요청 검토 패널에서 학과 추가·수정·삭제와 검증 상태가 이어진다', async ({ page }) => {
  const api = await installApiFixtures(page);

  await page.goto('/');
  await page.locator('#jandi-message').fill('요청 검토 패널 회귀 테스트');
  await page.getByRole('button', { name: 'Analyze' }).click();

  await page.getByRole('button', { name: 'Add programme' }).click();

  await expect(page.locator('#programme-list .programme-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Notion 항목 확인' })).toBeDisabled();

  await page.locator('[data-programme-index="1"][data-field="universityName"]').fill('York');
  await page.locator('[data-programme-index="1"][data-field="programmeNameOriginal"]').fill('MSc Data Science');
  await page.locator('[data-programme-index="1"][data-field="programmeUrl"]').fill('https://www.york.ac.uk/study/postgraduate-taught/courses/msc-data-science/');

  await expect(page.locator('#programme-list .programme-row').nth(1)).toContainText('York · Data Science MSc');
  await expect(page.getByRole('button', { name: 'Notion 항목 확인' })).toBeEnabled();

  await page.getByRole('button', { name: 'Remove programme 2' }).click();

  await expect(page.locator('#programme-list .programme-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Notion 항목 확인' })).toBeEnabled();
  expect(api.notionPreviewRequests).toEqual([]);
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test('기존 학생 선택은 작업 일지 순번을 다시 계산하고 재조회 선택값을 보존한다', async ({ page }) => {
  const existingStudentPreview = structuredClone(notionPreviewFixture);
  existingStudentPreview.student = {
    mode: 'existing',
    baseName: '김테스트',
    candidates: [
      {
        id: 'student-existing-1',
        name: '김테스트',
        url: 'https://www.notion.so/student-existing-1',
        agentNames: ['테스트 담당자']
      }
    ],
    selectedStudentId: null,
    selection: null,
    proposedAction: 'select'
  };
  existingStudentPreview.workLog = {
    ...existingStudentPreview.workLog,
    title: '기존 학생 선택 필요',
    titles: ['기존 학생 선택 필요']
  };
  existingStudentPreview.phase3Plan = {
    ...existingStudentPreview.phase3Plan,
    studentAction: 'select',
    reasons: ['기존 학생을 선택해야 합니다.']
  };
  const api = await installApiFixtures(page, {
    notionPreviewResponse: existingStudentPreview,
    workLogTitleResponse: {
      ok: true,
      workLog: {
        title: '입학 요강 4',
        titles: ['입학 요강 4'],
        count: 1
      }
    }
  });

  await page.goto('/');
  await page.locator('#jandi-message').fill('기존 학생 선택 회귀 테스트');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('radio', { name: '기존 고객' }).check();
  await page.getByRole('button', { name: 'Notion 항목 확인' }).click();

  await page.locator('[data-student-selection="student-existing-1"]').check();

  await expect(page.locator('#notion-preview-status')).toHaveText('선택한 학생 기준 작업 일지 순번을 다시 계산했습니다.');
  await expect(page.locator('#work-log-title')).toHaveValue('입학 요강 4');
  expect(api.workLogTitleRequests).toEqual([
    {
      selectedStudentId: 'student-existing-1',
      workLogCount: 1
    }
  ]);

  await page.getByRole('button', { name: 'Notion 항목 다시 확인' }).click();
  await expect(page.locator('#notion-preview-status')).toHaveText('미리보기가 끝났습니다.');
  expect(api.notionPreviewRequests).toHaveLength(2);
  expect(api.notionPreviewRequests[1].selectedStudentId).toBe('student-existing-1');
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test('새 Notion 학과명 검토가 생성 계획과 Word 준비 상태에 즉시 반영된다', async ({ page }) => {
  const missingMajorPreview = structuredClone(notionPreviewFixture);
  missingMajorPreview.programmes[0].major = {
    status: 'missing',
    requestedOriginalName: 'MSc Computer Science',
    searchKey: 'computer science',
    proposedCreateName: 'Computer Science MSc',
    selected: null,
    candidates: []
  };
  missingMajorPreview.phase3Plan = {
    canCreate: false,
    reasons: ['새 학과명을 확인해야 합니다.'],
    studentAction: 'create',
    universitiesToCreate: [],
    majorsToCreate: ['Computer Science MSc']
  };
  const api = await installApiFixtures(page, {
    notionSchemaResponse: {
      ok: true,
      creationEnabled: true,
      dataSources: {}
    },
    notionPreviewResponse: missingMajorPreview
  });

  await page.goto('/');
  await page.locator('#jandi-message').fill('Notion 미리보기 패널 회귀 테스트');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('button', { name: 'Notion 항목 확인' }).click();

  const majorNameInput = page.getByLabel('새로 생성할 Notion 학과명');
  const nameConfirmation = page.getByLabel('이 이름으로 생성하는 것을 확인했습니다.');
  await expect(majorNameInput).toHaveValue('Computer Science MSc');
  await expect(nameConfirmation).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Notion에 기록 생성' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Word 파일 만들기' })).toBeDisabled();

  await majorNameInput.fill('Applied Data Science MSc');
  await nameConfirmation.check();

  await expect(page.locator('#creation-readiness')).toHaveText('생성 계획 확인 완료');
  await expect(page.locator('#creation-plan-details')).toContainText('Applied Data Science MSc');
  await expect(page.getByRole('button', { name: 'Notion에 기록 생성' })).toBeEnabled();
  await expect(page.locator('#word-summary')).toContainText('Applied Data Science MSc');
  await expect(page.getByRole('button', { name: 'Word 파일 만들기' })).toBeEnabled();
  expect(api.notionCreateRequests).toEqual([]);
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test('Notion 생성은 최종 확인 뒤 격리된 fixture에 정확한 payload를 보낸다', async ({ page }) => {
  const enabledPreview = structuredClone(notionPreviewFixture);
  enabledPreview.phase3Plan = {
    canCreate: true,
    reasons: [],
    studentAction: 'create',
    universitiesToCreate: [],
    majorsToCreate: []
  };
  const api = await installApiFixtures(page, {
    notionSchemaResponse: {
      ok: true,
      creationEnabled: true,
      dataSources: {}
    },
    notionPreviewResponse: enabledPreview,
    notionCreationResponse: notionCreationFixture
  });

  await page.goto('/');
  await page.locator('#jandi-message').fill('Notion 생성 컨트롤러 회귀 테스트');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('button', { name: 'Notion 항목 확인' }).click();

  const createButton = page.getByRole('button', { name: 'Notion에 기록 생성' });
  await expect(page.locator('#creation-readiness')).toHaveText('생성 계획 확인 완료');
  await expect(createButton).toBeEnabled();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('실제 Notion에 아래 계획을 생성합니다.');
    expect(dialog.message()).toContain('최종 학생명: 김테스트');
    expect(dialog.message()).toContain('작업 일지: 입학 요강 1');
    await dialog.accept();
  });
  await createButton.click();

  await expect(page.locator('#creation-result')).toContainText('Notion 생성 완료');
  await expect(page.locator('#creation-result')).toContainText('작업 일지: 입학 요강 1');
  await expect(page.locator('#notion-preview-status')).toHaveText(
    'Notion 생성과 저장 검증이 완료됐습니다.'
  );
  await expect(page.getByRole('button', { name: 'Notion 생성 완료' })).toBeDisabled();
  expect(api.notionCreateRequests).toHaveLength(1);
  expect(api.notionCreateRequests[0]).toMatchObject({
    requestType: 'admissions',
    clientMode: 'new',
    requesterName: '테스트 담당자',
    studentName: '김테스트',
    selectedStudentId: '',
    extractionWarnings: [],
    programmes: [
      {
        rawUniversityName: 'University of Warwick',
        reviewedMajorName: 'Computer Science MSc',
        majorNameConfirmed: true,
        programmeUrl: 'https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/'
      }
    ]
  });
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test('SOP 첨부파일 감시가 arm, 완료 표시, Clear 취소까지 격리되어 동작한다', async ({ page }) => {
  const message = [
    '테스트 담당자',
    '2026/08/25 AM 09:00',
    '[업무요청] 김테스트 SOP 1차 감수',
    '첨부: SOP_1차_초안.docx'
  ].join('\n');
  const api = await installApiFixtures(page, {
    extractionResponse: sopExtractionFixture,
    sopDownloadFixture: {
      arm: {
        id: 'sop-context-1',
        status: 'armed',
        attachmentNames: ['SOP_1차_초안.docx'],
        rosterCheck: 'available'
      },
      status: {
        id: 'sop-context-1',
        status: 'completed',
        originalFilename: 'SOP_1차_초안.docx',
        filename: '김테스트_SOP_1차_초안.docx',
        collisionSuffixApplied: false
      }
    }
  });

  await page.goto('/');
  await page.locator('#jandi-message').fill(message);
  await page.getByRole('button', { name: 'Analyze' }).click();

  await expect(page.locator('#request-type-badge')).toHaveText('SOP 감수');
  await expect(page.locator('#word-generation-section')).toBeHidden();
  await expect(page.locator('#sop-download-status')).toContainText(
    'SOP_1차_초안.docx → 김테스트_SOP_1차_초안.docx'
  );
  await expect(page.locator('#sop-download-status')).toHaveAttribute('data-tone', 'success');
  expect(api.sopArmRequests).toEqual([{ studentName: '김테스트', message }]);
  expect(api.sopStatusRequests).toEqual(['sop-context-1']);

  await page.getByRole('button', { name: 'Clear' }).click();

  await expect(page.locator('#review-section')).toBeHidden();
  expect(api.cancelRequests).toBeGreaterThan(0);
  expect(api.unexpectedRequests).toEqual([]);
  expect(api.browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

async function installApiFixtures(page, {
  extractionResponse = extractionFixture,
  sopDownloadFixture = null,
  notionSchemaResponse = {
    ok: true,
    creationEnabled: false,
    dataSources: {}
  },
  notionPreviewResponse = notionPreviewFixture,
  notionCreationResponse = null,
  workLogTitleResponse = {
    ok: true,
    workLog: {
      title: '입학 요강 1',
      titles: ['입학 요강 1'],
      count: 1
    }
  }
} = {}) {
  const state = {
    syncRequests: [],
    wordRequests: [],
    notionCreateRequests: [],
    notionPreviewRequests: [],
    workLogTitleRequests: [],
    sopArmRequests: [],
    sopStatusRequests: [],
    cancelRequests: 0,
    unexpectedRequests: [],
    browserErrors: []
  };

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      state.browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    state.browserErrors.push(`pageerror: ${error.message}`);
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const requestKey = `${request.method()} ${pathname}`;

    if (requestKey === 'GET /api/google-sheets/status') {
      await fulfillJson(route, googleStatusFixture);
      return;
    }
    if (requestKey === 'POST /api/google-sheets/preview') {
      await fulfillJson(route, googlePreviewFixture);
      return;
    }
    if (requestKey === 'POST /api/google-sheets/sync') {
      state.syncRequests.push(request.postDataJSON());
      await fulfillJson(route, {
        ok: true,
        target: { name: '26년 9월' },
        writtenRowCount: 1,
        writtenPageCount: 2,
        heldPageCount: 1
      });
      return;
    }
    if (requestKey === 'POST /api/extract') {
      await fulfillJson(route, extractionResponse);
      return;
    }
    if (requestKey === 'GET /api/notion/schema') {
      await fulfillJson(route, notionSchemaResponse);
      return;
    }
    if (requestKey === 'POST /api/notion/preview') {
      state.notionPreviewRequests.push(request.postDataJSON());
      await fulfillJson(route, notionPreviewResponse);
      return;
    }
    if (requestKey === 'POST /api/notion/work-log-title') {
      state.workLogTitleRequests.push(request.postDataJSON());
      await fulfillJson(route, workLogTitleResponse);
      return;
    }
    if (requestKey === 'POST /api/notion/create' && notionCreationResponse) {
      state.notionCreateRequests.push(request.postDataJSON());
      await fulfillJson(route, notionCreationResponse);
      return;
    }
    if (requestKey === 'GET /api/word/status') {
      await fulfillJson(route, {
        enabled: true,
        ready: true,
        template: { valid: true, issues: [] },
        output: { writable: true, issues: [] }
      });
      return;
    }
    if (requestKey === 'POST /api/word/generate') {
      const payload = request.postDataJSON();
      state.wordRequests.push(payload);
      await fulfillJson(route, {
        ok: true,
        filename: payload.filename,
        outputPath: `C:\\fixture-output\\${payload.filename}`,
        folderCreated: true,
        folderPath: 'C:\\fixture-output\\김테스트_MSc Computer Science',
        programmeCount: payload.programmes.length
      });
      return;
    }
    if (requestKey === 'POST /api/sop-download/arm' && sopDownloadFixture) {
      state.sopArmRequests.push(request.postDataJSON());
      await fulfillJson(route, sopDownloadFixture.arm);
      return;
    }
    if (requestKey === 'GET /api/sop-download/status' && sopDownloadFixture) {
      state.sopStatusRequests.push(new URL(request.url()).searchParams.get('id'));
      await fulfillJson(route, sopDownloadFixture.status);
      return;
    }
    if (requestKey === 'POST /api/sop-download/cancel') {
      state.cancelRequests += 1;
      await fulfillJson(route, {
        status: 'cancelled',
        reason: 'no_active_download_context'
      });
      return;
    }

    state.unexpectedRequests.push(requestKey);
    await fulfillJson(route, {
      ok: false,
      error: {
        code: 'UNEXPECTED_FIXTURE_REQUEST',
        message: `Unexpected fixture request: ${requestKey}`,
        details: {}
      }
    }, 500);
  });

  return state;
}

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload)
  });
}

async function expectNoHorizontalOverflow(page) {
  const hasOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  ));
  expect(hasOverflow).toBe(false);
}
