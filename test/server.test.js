import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';

async function extractMessage(baseUrl, message) {
  const extraction = await fetch(`${baseUrl}/api/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });

  assert.equal(extraction.status, 200);
  return extraction.json();
}

test('local app serves the shell and mocked extraction endpoint', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Admissions Guideline Helper/);

    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/06/17 PM 05:04',
      '[업무요청] 테스트학생 입학요강',
      '',
      '🍀University of Warwick',
      '- Medical Biotechnology and Business Management (MSc)',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-medical-biotechnology-business-management/'
    ].join('\n'));

    assert.equal(payload.extraction.requesterName, '담당자');
    assert.equal(payload.extraction.studentName, '테스트학생');
    assert.equal(payload.extraction.requestDateTime, '2026-06-17T17:04:00+09:00');
    assert.equal(payload.extraction.programmes[0].rawUniversityName, 'University of Warwick');
    assert.equal(payload.extraction.programmes[0].universityName, 'Warwick');
    assert.equal(payload.extraction.programmes[0].majorSearchKey, 'medical biotechnology and business management');
  } finally {
    await close(server);
  }
});

test('mocked extraction keeps only the Korean student name from a descriptive title', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/06/17 PM 05:04',
      '[업무요청] 설명학생 영국 석사 입학요강',
      '',
      '🍀University of Warwick',
      '- Medical Biotechnology and Business Management (MSc)',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-medical-biotechnology-business-management/'
    ].join('\n'));

    assert.equal(payload.extraction.studentName, '설명학생');
  } finally {
    await close(server);
  }
});

test('mocked extraction strips attached honorific from the student name', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/06/17 PM 05:04',
      '[업무요청] 존칭학생님 입학요강',
      '',
      'University of Warwick',
      'MSc Computer Science',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/'
    ].join('\n'));

    assert.equal(payload.extraction.studentName, '존칭학생');
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts programme names and links pasted on the same line', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/06/17 PM 05:04',
      '[업무요청] 존칭학생님 입학요강',
      '',
      'University of Warwick',
      'MSc Computer Science https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/',
      'University of York',
      '[MSc Biomedical Sciences with Bioenterprise](https://www.york.ac.uk/study/postgraduate-taught/courses/msc-bio-sciences-bioenterprise/)'
    ].join('\n'));

    assert.equal(payload.extraction.programmes.length, 2);
    assert.equal(payload.extraction.programmes[0].programmeNameOriginal, 'MSc Computer Science');
    assert.equal(payload.extraction.programmes[0].programmeUrl, 'https://warwick.ac.uk/study/postgraduate/courses/msc-computer-science/');
    assert.equal(payload.extraction.programmes[1].programmeNameOriginal, 'MSc Biomedical Sciences with Bioenterprise');
    assert.equal(payload.extraction.programmes[1].universityName, 'York');
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts university dash programme lines from real JANDI copy', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/07/06 AM 10:30',
      '[업무요청] 실전학생님 입학요강 서칭',
      '안녕하세요 ^^',
      '26년 9월학기 석사 지원하는 실전학생님 입학요강 요청 드립니다.',
      '',
      'Goldsmiths - MA Contemporary Art Theory',
      'https://www.gold.ac.uk/pg/ma-contemporary-art-theory/',
      '',
      'Sussex - MA Museums and Curating',
      'https://www.sussex.ac.uk/study/masters/courses/museums-and-curating-ma',
      '',
      'Leeds - MA Art Gallery and Museum Studies',
      'https://courses.leeds.ac.uk/a241/art-gallery-and-museum-studies-ma',
      '',
      ' Essex -MA Art History and Theory',
      'https://www.essex.ac.uk/courses/PG00456/1/MA-Art-History-and-Theory'
    ].join('\n'));

    assert.equal(payload.extraction.studentName, '실전학생');
    assert.equal(payload.extraction.programmes.length, 4);
    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['Goldsmiths', 'Sussex', 'Leeds', 'Essex']
    );
    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.programmeNameOriginal),
      [
        'MA Contemporary Art Theory',
        'MA Museums and Curating',
        'MA Art Gallery and Museum Studies',
        'MA Art History and Theory'
      ]
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction applies the last university header to following programme rows', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/06/17 PM 05:04',
      '[업무요청] 테스트학생 입학요강',
      '',
      '🍀University of Warwick',
      '- Medical Biotechnology and Business Management (MSc)',
      '[https://warwick.ac.uk/study/postgraduate/courses/msc-medical-biotechnology-business-management/](https://warwick.ac.uk/study/postgraduate/courses/msc-medical-biotechnology-business-management/)',
      '',
      '🍀University of Nottingham',
      '- Immunology and Immunotherapeutics MSc',
      '[https://www.nottingham.ac.uk/pgstudy/course/taught/immunology-and-immunotherapeutics-msc](https://www.nottingham.ac.uk/pgstudy/course/taught/immunology-and-immunotherapeutics-msc)',
      '',
      '🍀University of York',
      '- MSc Biomedical Sciences with Bioenterprise',
      '[https://www.york.ac.uk/study/postgraduate-taught/courses/msc-bio-sciences-bioenterprise/](https://www.york.ac.uk/study/postgraduate-taught/courses/msc-bio-sciences-bioenterprise/)',
      '',
      '- MSc Pharmacology and Drug Development',
      '[https://www.hyms.ac.uk/postgraduate-taught/msc-in-pharmacology-and-drug-development](https://www.hyms.ac.uk/postgraduate-taught/msc-in-pharmacology-and-drug-development)',
      '',
      '🍀University of Manchester',
      '- MSc Model-based Drug Development - Pharmacokinetic and Pharmacodynamic Modelling',
      '',
      '[https://www.manchester.ac.uk/study/masters/courses/list/08749/msc-model-based-drug-development-pharmacokinetic-and-pharmacodynamic-modelling/](https://www.manchester.ac.uk/study/masters/courses/list/08749/msc-model-based-drug-development-pharmacokinetic-and-pharmacodynamic-modelling/)'
    ].join('\n'));

    assert.equal(payload.extraction.programmes.length, 5);
    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      [
        'Warwick',
        'Nottingham',
        'York',
        'York',
        'Manchester'
      ]
    );
    assert.equal(
      payload.extraction.programmes[3].programmeNameOriginal,
      'MSc Pharmacology and Drug Development'
    );
    assert.equal(
      payload.extraction.programmes[3].programmeUrl,
      'https://www.hyms.ac.uk/postgraduate-taught/msc-in-pharmacology-and-drug-development'
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction resolves Korean university names and prefers matching URL domains', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = await extractMessage(baseUrl, [
      '김샘',
      '2026/06/10 PM 04:22',
      '[업무요청] 별칭학생 님 입학요강 요청',
      '',
      '사우스햄튼',
      'Engineering Materials (Advanced Mechanical Engineering Science) (MSc)',
      '[https://www.southampton.ac.uk/courses/engineering-materials-advanced-mechanical-engineering-science-masters-msc](https://www.southampton.ac.uk/courses/engineering-materials-advanced-mechanical-engineering-science-masters-msc)',
      '',
      '크랜필드',
      'Advanced Materials: Engineering and Industrial Applications MSc',
      '[https://www.cranfield.ac.uk/courses/taught/advanced-materials](https://www.cranfield.ac.uk/courses/taught/advanced-materials)',
      '',
      '리즈',
      'Materials Science and Engineering MSc',
      '[https://courses.leeds.ac.uk/g591/materials-science-and-engineering-msc](https://courses.leeds.ac.uk/g591/materials-science-and-engineering-msc)'
    ].join('\n'));

    assert.equal(payload.extraction.studentName, '별칭학생');
    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.rawUniversityName),
      ['사우스햄튼', '크랜필드', '리즈']
    );
    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['Southampton', 'Cranfield', 'Leeds']
    );
    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityAliasMatchSource),
      ['domain', 'domain', 'domain']
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction prioritizes the programme URL domain over a conflicting written university', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/07/20 PM 02:00',
      '[업무요청] 도메인학생님 입학요강 요청',
      'Bath',
      'Business Analytics MSc',
      'https://www.qmul.ac.uk/postgraduate/taught/coursefinder/courses/business-analytics-msc/'
    ].join('\n'));

    assert.equal(payload.extraction.programmes[0].rawUniversityName, 'Bath');
    assert.equal(payload.extraction.programmes[0].universityName, 'Queen Mary');
    assert.equal(payload.extraction.programmes[0].universityAliasMatchSource, 'domain');
  } finally {
    await close(server);
  }
});

test('mocked extraction falls back to the written alias when the URL domain is unknown', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '담당자',
      '2026/07/20 PM 02:00',
      '[업무요청] 별칭학생님 입학요강 요청',
      '퀸메리',
      'Business Analytics MCs',
      'https://courses.example.com/business-analytics/'
    ].join('\n'));

    const programme = payload.extraction.programmes[0];
    assert.equal(programme.universityName, 'Queen Mary');
    assert.equal(programme.universityAliasMatchSource, 'alias');
    assert.equal(programme.programmeNameOriginal, 'Business Analytics MCs');
    assert.equal(programme.majorSearchKey, 'business analytics');
    assert.equal(programme.notionMajorNameProposed, 'Business Analytics MSc');
  } finally {
    await close(server);
  }
});

test('mocked extraction reports misplaced URLs, domain conflicts, and programmes without URLs', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '오유리',
      '2026/07/20 PM 03:25',
      '[업무요청] 송모민님 입학요강',
      'University of Sussex',
      'Gender and Development MA',
      'https://www.sussex.ac.uk/study/masters/courses/gender-and-development-ma',
      'Development Studies MA',
      'https://www.soas.ac.uk/study/find-course/msc-global-political-economy',
      'https://www.sussex.ac.uk/study/masters/courses/development-studies-ma',
      'SOAS',
      'MSc Global Political Economy'
    ].join('\n'));

    assert.equal(payload.extraction.programmes.length, 2);
    assert.deepEqual(
      payload.extraction.extractionWarnings.map((warning) => warning.code),
      ['university_domain_conflict', 'orphan_url', 'missing_programme_url']
    );
    assert.equal(payload.extraction.extractionWarnings[0].programmeIndex, 1);
    assert.equal(payload.extraction.extractionWarnings[0].writtenUniversityName, 'Sussex');
    assert.equal(payload.extraction.extractionWarnings[0].domainUniversityName, 'SOAS');
    assert.equal(
      payload.extraction.extractionWarnings[2].programmeName,
      'MSc Global Political Economy'
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts comma-separated undergraduate programme rows', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '강명희',
      '2026/07/15 PM 01:53',
      '[업무요청] 고나현님 입학요강 서치 요청',
      'KCL, Psychology BSc',
      'https://www.kcl.ac.uk/study/undergraduate/courses/psychology-bsc',
      'Bath, Psychology BSc',
      'https://www.bath.ac.uk/courses/undergraduate-2026/psychology/bsc-psychology/',
      'Manchester, Psychology BSc',
      'https://www.manchester.ac.uk/study/undergraduate/courses/2026/00653/bsc-psychology/'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'KCL', programmeNameOriginal: 'Psychology BSc' },
        { universityName: 'Bath', programmeNameOriginal: 'Psychology BSc' },
        { universityName: 'Manchester', programmeNameOriginal: 'Psychology BSc' }
      ]
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts Korean alias headers with trailing separators', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '성지혜',
      '2026/07/07 PM 05:25',
      '[업무요청] 정우영님 입학요강 요청',
      '퀸메리 -',
      'Business Analytics MSc',
      'https://www.qmul.ac.uk/postgraduate/taught/coursefinder/courses/business-analytics-msc/',
      '워릭-',
      'Business Analytics & Artificial Intelligence (MSc)',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-business-analytics/',
      'Business with Operations Management (MSc)',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-business-operations-management/',
      '버밍엄 -',
      'Business Analytics MSc',
      'https://www.birmingham.ac.uk/study/postgraduate/subjects/business-and-management-courses/business-analytics-msc'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['Queen Mary', 'Warwick', 'Warwick', 'Birmingham']
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts slash-separated university and programme rows', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '김샘',
      '2026/07/07 AM 11:23',
      '[업무요청] 임국희 님 입학요강 요청',
      'University of Manchester /',
      'MSc Advanced Engineering Materials',
      'https://www.manchester.ac.uk/study/masters/courses/list/04169/msc-advanced-engineering-materials/',
      'Loughborough University / MCs Advanced Materials Science & Engineering',
      'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/advanced-materials-science-engineering/'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['Manchester', 'Loughborough']
    );
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts colon-separated university and programme rows', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '김샘',
      '2026/07/03 PM 02:27',
      '[업무요청] 손정호 님 입학요강',
      'KCL: Biotechnology & Computational Biology MSc',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/biotechnology-computational-biology-msc-mres',
      'Manchester: MSc Computer-Aided Drug Discovery for Cancer Therapeutics',
      'https://www.manchester.ac.uk/study/masters/courses/list/21890/msc-computer-aided-drug-discovery-for-cancer-therapeutics/',
      'EdinBurgh: Drug Discovery and Translational Biology MSc',
      'https://study.ed.ac.uk/programmes/postgraduate-taught/3-drug-discovery-and-translational-biology#overview'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['KCL', 'Manchester', 'Edinburgh']
    );
    assert.deepEqual(payload.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction ignores numbered-list prefixes before university names', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '오유리',
      '2026/07/02 PM 12:22',
      '[업무요청] 이지현님 요강정리 요청',
      '1. Bath-Marketing',
      'https://www.bath.ac.uk/courses/postgraduate-2026/taught-postgraduate-courses/msc-marketing-january-start/',
      '2.Exeter-MSc Business and Management',
      'https://www.exeter.ac.uk/masters-degrees/msc-business-and-management/',
      '3.Loughborough University-International Business Management',
      'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/international-business-management/',
      '4.University of Birmingham-International Business MSc',
      'https://www.birmingham.ac.uk/study/postgraduate/subjects/business-and-management-courses/international-business-msc',
      '5.Queen Mary-Management MSc',
      'https://www.qmul.ac.uk/postgraduate/taught/coursefinder/courses/management-msc/'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['Bath', 'Exeter', 'Loughborough', 'Birmingham', 'Queen Mary']
    );
    assert.deepEqual(payload.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction recognizes NTU alias and reports its conflicting Northumbria URL', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '성지혜',
      '2026/07/01 PM 05:53',
      '[업무요청] 김세현님 요강정리 요청',
      'Reading',
      'MSc Real Estate',
      'https://www.henley.ac.uk/study/masters/msc-real-estate',
      'Northumbria',
      'Real Estate MSc',
      'https://www.northumbria.ac.uk/study-at-northumbria/courses/real-estate-msc-ft-dtfrez6/',
      'NTU',
      'Real Estate MSc',
      'https://www.northumbria.ac.uk/study-at-northumbria/courses/real-estate-msc-ft-dtfrez6/',
      'NTU',
      'Building Surveying MSc',
      'https://www.ntu.ac.uk/course/architecture-design-and-the-built-environment/pg/msc-building-surveying',
      'Manchester',
      'MSc Real Estate Development',
      'https://www.manchester.ac.uk/study/masters/courses/list/09632/msc-real-estate-development/'
    ].join('\n'));

    assert.equal(payload.extraction.programmes.length, 5);
    assert.deepEqual(
      payload.extraction.extractionWarnings.map((warning) => warning.code),
      ['university_domain_conflict']
    );
    assert.equal(payload.extraction.extractionWarnings[0].writtenUniversityName, 'Nottingham Trent');
    assert.equal(payload.extraction.extractionWarnings[0].domainUniversityName, 'Northumbria');
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts parenthesized and inline university programme rows', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '김샘',
      '2026/07/01 PM 04:17',
      '[업무요청] 김관식 님 입학요강',
      'Loughborough University (Strength and Conditioning )',
      'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/strength-conditioning/',
      'Manchester Metropolitan University (Strength and Conditioning )',
      'https://www.mmu.ac.uk/study/postgraduate/course/msc-strength-and-conditioning',
      'University of Bath (sport management)',
      'https://www.bath.ac.uk/courses/postgraduate-2026/taught-postgraduate-courses/msc-sport-management-full-time/',
      'University of Liverpool (Sports Business and Management)',
      'https://www.liverpool.ac.uk/courses/sports-business-and-management-msc',
      'middlesex university msc strength conditioning',
      'https://www.mdx.ac.uk/courses/postgraduate/strength-and-conditioning-msc/'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['Loughborough', 'MMU', 'Bath', 'Liverpool', 'Middlesex']
    );
    assert.deepEqual(payload.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction recognizes numbered Korean university aliases', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '성지혜',
      '2026/07/01 PM 12:02',
      '[업무요청] 최인영 님 입학요강 요청',
      'KCL',
      'Electronic Engineering with Management MSc',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/electronic-engineering-with-management-msc',
      '2. 사우스햄튼',
      'Microelectronics Systems Design (MSc)',
      'https://www.southampton.ac.uk/courses/microelectronics-systems-design-masters-msc',
      '3. 에딘버러',
      'Electronics MSc',
      'https://study.ed.ac.uk/programmes/postgraduate-taught/669-electronics'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['KCL', 'Southampton', 'Edinburgh']
    );
    assert.deepEqual(payload.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction handles degree-led inline rows, full University names, notes, and unknown acronyms', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const cases = [
      {
        name: 'Cardiff Met alias',
        expectedUniversities: ['Loughborough', 'MMU', 'Bournemouth', 'Cardiff Metropolitan', 'Sunderland', 'Swansea', 'Leeds Becket'],
        lines: [
          'Loughborough', 'Musculoskeletal Sport Science and Health MSc', 'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/musculoskeletal-sport-science-health/',
          'MMU', 'MSc Sport and Exercise Science', 'https://www.mmu.ac.uk/study/postgraduate/course/msc-sport-and-exercise-science',
          'Bournemouth', 'MSc Sport and Exercise Science', 'https://www.bournemouth.ac.uk/study/courses/msc-sport-exercise-science-1',
          'Cardiff Met', "Sport & Exercise Science Master's Degree - MSc", 'https://www.cardiffmet.ac.uk/courses/postgraduate/msc-sport-and-exercise-science/',
          'Sunderland', 'MSc Sport and Exercise Sciences', 'https://www.sunderland.ac.uk/postgraduate/msc-sport-exercise-sciences',
          'Swansea', 'Advanced sport performance science, MSc', 'https://www.swansea.ac.uk/postgraduate/taught/engineering-applied-sciences/sport-science/msc-advanced-sport-performance-science/',
          'Leeds Becket', 'Sport and Exercise Science MSc', 'https://www.leedsbeckett.ac.uk/courses/sport-exercise-science-msc/'
        ]
      },
      {
        name: 'degree-led inline University row',
        expectedUniversities: ['Reading', 'SOAS', 'Edinburgh', 'Sussex'],
        lines: [
          'Reading - MSc Agriculture and Development', 'https://www.reading.ac.uk/ready-to-study/study/2026/msc-agriculture-and-development',
          'SOAS -MSc Research for International Development', 'https://www.soas.ac.uk/study/find-course/msc-research-international-development',
          'University of Edinburgh - MSc Food Security', 'https://study.ed.ac.uk/programmes/postgraduate-taught/668-food-security',
          'University of Sussex MA Development Studies', 'https://www.sussex.ac.uk/study/masters/courses/development-studies-ma'
        ]
      },
      {
        name: 'note before the first university',
        expectedUniversities: ['UCL', 'Reading', 'Sheffield', 'Manchester'],
        lines: [
          '*참고사항: 영국에서 건축학 전공으로 학부 졸업하셔서 영국식기준으로 요강 정리 부탁드립니다 :)',
          'UCL', 'International Real Estate and Planning MSc', 'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/international-real-estate-and-planning-msc',
          'Reading', 'MSc Real Estate', 'https://www.henley.ac.uk/study/masters/msc-real-estate',
          'Sheffield', 'Real Estate MSc', 'https://sheffield.ac.uk/postgraduate/taught/courses/2026/real-estate-msc',
          'Manchester', 'MSc Real Estate Development', 'https://www.manchester.ac.uk/study/masters/courses/list/09632/msc-real-estate-development/'
        ]
      },
      {
        name: 'The University of Sheffield header',
        expectedUniversities: ['Southampton', 'Leeds', 'Sheffield'],
        lines: [
          'University of Southampton', 'MA Acoustical and Vibration Engineering', 'https://www.southampton.ac.uk/courses/acoustical-and-vibration-engineering-masters-msc',
          '2.University of Leeds', 'MSc Advanced Mechanical Engineering', 'https://courses.leeds.ac.uk/f360/advanced-mechanical-engineering-msc-eng',
          '3.The University of Sheffield', 'MSc Advanced Mechanical Engineering', 'https://www.sheffield.ac.uk/postgraduate/taught/courses/2020/advanced-mechanical-engineering-msc'
        ]
      },
      {
        name: 'University of Bath header',
        expectedUniversities: ['Queen Mary', 'Bristol', 'Bath', 'Sheffield'],
        lines: [
          'Queen Mary :', 'Biomedical Science (Medical Microbiology) MSc', 'https://www.qmul.ac.uk/postgraduate/taught/coursefinder/courses/biomedical-science-medical-microbiology-msc/',
          '2. University of Bristol : MSc Biomedical Sciences Research', 'https://www.bristol.ac.uk/study/postgraduate/taught/msc-biomedical-sciences-research/',
          '3. University of Bath', 'MSc Molecular Biosciences (Medical Biosciences)', 'https://www.bath.ac.uk/courses/postgraduate-2026/taught-postgraduate-courses/msc-molecular-biosciences-medical-biosciences/',
          '4. Sheffield University', 'Biomedical Science MSc', 'https://sheffield.ac.uk/postgraduate/taught/courses/2026/biomedical-science-msc'
        ]
      },
      {
        name: 'QMUL acronym resolved by domain',
        expectedUniversities: ['KCL', 'Queen Mary', 'Manchester', 'UCL'],
        lines: [
          'KCL', 'Artificial Intelligence MSc', 'https://www.kcl.ac.uk/study/postgraduate-taught/courses/artificial-intelligence-msc',
          'QMUL', 'Artificial Intelligence MSc', 'https://www.qmul.ac.uk/postgraduate/taught/coursefinder/courses/artificial-intelligence-msc/',
          'Manchester', 'MSc Artificial Intelligence', 'https://www.manchester.ac.uk/study/masters/courses/list/21574/msc-artificial-intelligence/',
          'UCL', 'Artificial Intelligence and Data Engineering MSc', 'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/artificial-intelligence-and-data-engineering-msc'
        ]
      }
    ];

    for (const item of cases) {
      const payload = await extractMessage(baseUrl, [
        '담당자',
        '2026/06/10 PM 05:58',
        '[업무요청] 테스트학생님 입학요강',
        ...item.lines
      ].join('\n'));

      assert.deepEqual(
        payload.extraction.programmes.map((programme) => programme.universityName),
        item.expectedUniversities,
        item.name
      );
      assert.deepEqual(payload.extraction.extractionWarnings, [], item.name);
    }
  } finally {
    await close(server);
  }
});

test('mocked extraction handles Korean prefixes, supplementary notes, wrapped URLs, and University suffixes', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const cases = [
      {
        name: 'unlisted Korean university prefixes',
        expectedUniversities: ['KCL', 'Leeds', 'Goldsmiths', 'Manchester'],
        lines: [
          '1. Kcl - Global Media Industries MA', 'https://www.kcl.ac.uk/study/postgraduate-taught/courses/global-media-industries-ma',
          '2. 리즈 - Digital Media MA', 'https://courses.leeds.ac.uk/j692/digital-media-ma',
          '3. 골드스미스 - Digital Media', 'https://www.gold.ac.uk/pg/ma-digital-media/',
          '4. 맨체스터 - MA Digital Media, Culture and Society', 'https://www.manchester.ac.uk/study/masters/courses/list/20641/ma-digital-media-culture-and-society/'
        ]
      },
      {
        name: 'supplementary pathway note',
        expectedUniversities: ['Edinburgh', 'Warwick', 'Bristol', 'Leeds'],
        lines: [
          '에딘버러 - Education MSc', '(Early Childhood Practice and Froebel pathway)', 'https://study.ed.ac.uk/programmes/postgraduate-taught/98-education',
          '워릭 - Childhood in Society (MA)', 'https://warwick.ac.uk/study/postgraduate/courses/ma-childhood-in-society/',
          '브리스톨-', 'MSc Education', 'https://www.bristol.ac.uk/study/postgraduate/taught/msc-education',
          '리즈 - Education MA', 'https://courses.leeds.ac.uk/a591/education-ma'
        ]
      },
      {
        name: 'decorated university header with manually supplied MBA',
        expectedUniversities: ['Manchester', 'Warwick'],
        lines: [
          'Manchester_18개월', 'MBA', 'https://www.alliancembs.manchester.ac.uk/study/mba/full-time-mba/',
          'Warwick', 'MBA', 'https://www.wbs.ac.uk/courses/mba/full-time/'
        ]
      },
      {
        name: 'programme rows without a repeated KCL header',
        expectedUniversities: ['KCL', 'KCL'],
        lines: [
          'KCL 2개 전공 입학 요강 부탁드립니다.',
          'International Managemnet MSc', 'https://www.kcl.ac.uk/study/postgraduate-taught/courses/international-management-msc',
          '2. Digital Humanities MA', 'https://www.kcl.ac.uk/study/postgraduate-taught/courses/digital-humanities-ma?alp_source=google'
        ]
      },
      {
        name: 'Uni abbreviations resolved by domain',
        expectedUniversities: ['Leeds', 'Cardiff', 'Nottingham', 'Exeter'],
        lines: [
          'Uni of Leeds, Communication and Media MA', 'https://courses.leeds.ac.uk/g636/communication-and-media-ma',
          'Cardiff Uni, Journalism, Media And Communications (MA)', 'https://www.cardiff.ac.uk/study/postgraduate/taught/courses/course/journalism-media-and-communications-ma',
          'Uni of Nottingham, International Media and Communication Studies MA', 'https://www.nottingham.ac.uk/pgstudy/course/taught/international-media-and-communication-studies-ma',
          'Uni of Exeter, MA Media and Communications', 'https://www.exeter.ac.uk/study/postgraduate/courses/communications/ma-mediacomms/'
        ]
      },
      {
        name: 'wrapped URL and Korean commentary',
        expectedUniversities: ['Birmingham', 'Durham', 'Warwick'],
        lines: [
          'Birmingham', 'Management MSc (이전에 2:2 성적으로 지원한 후 오퍼 받은 적 있음)',
          'https://www.birmingham.ac.uk/study/postgraduate/subjects/business-and-managementcourses/', 'management-msc',
          'Durham', 'Management MSc (이전에 2:2 성적으로 지원한 후 오퍼 받은 적 있음)', 'https://www.durham.ac.uk/business/courses/management-n2p109/',
          'Warwick', 'Management MSc', 'https://www.wbs.ac.uk/courses/masters/management/'
        ],
        expectedProposedNames: ['Management MSc', 'Management MSc', 'Management MSc']
      },
      {
        name: 'University of London suffixes',
        expectedUniversities: ['Exeter', 'York', 'Aston', 'RHUL', 'SOAS'],
        lines: [
          '1) University of Exeter', 'MSc Marketing', 'https://www.exeter.ac.uk/study/postgraduate/courses/business/marketing/',
          '2) University of York', 'MSc Global Marketing', 'https://www.york.ac.uk/study/postgraduate-taught/courses/msc-global-marketing/',
          '3) Aston University', 'Strategic Marketing Management MSc', 'https://www.aston.ac.uk/study/courses/strategic-marketing-management-msc',
          '4) Royal Holloway, University of London', 'Marketing MSc', 'https://www.royalholloway.ac.uk/studying-here/postgraduate/business-school/marketing-msc/',
          '5) SOAS, University of London', 'MSc International Marketing', 'https://www.soas.ac.uk/study/find-course/msc-international-marketing'
        ]
      }
    ];

    for (const item of cases) {
      const payload = await extractMessage(baseUrl, [
        '담당자',
        '2026/04/13 AM 11:58',
        '[업무요청] 테스트학생님 입학요강',
        ...item.lines
      ].join('\n'));

      assert.deepEqual(
        payload.extraction.programmes.map((programme) => programme.universityName),
        item.expectedUniversities,
        item.name
      );
      assert.deepEqual(payload.extraction.extractionWarnings, [], item.name);

      if (item.expectedProposedNames) {
        assert.deepEqual(
          payload.extraction.programmes.map((programme) => programme.notionMajorNameProposed),
          item.expectedProposedNames,
          item.name
        );
      }
    }
  } finally {
    await close(server);
  }
});

test('mocked extraction ignores greeting mentions and reuses a shared MBA request', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const education = await extractMessage(baseUrl, [
      '성지혜',
      '2026/03/26 PM 01:56',
      '[업무요청] 김희원 입학요강 정리요청',
      '안녕하세요, @Marion Lee (정규감수) 님',
      '교육학전공으로 지원하시는 김희원님 요강정리 부탁드립니다.',
      '에딘버러 - Education MSc',
      '(Early Childhood Practice and Froebel pathway)',
      'https://study.ed.ac.uk/programmes/postgraduate-taught/98-education',
      '워릭 - Childhood in Society (MA)',
      'https://warwick.ac.uk/study/postgraduate/courses/ma-childhood-in-society/',
      '브리스톨-',
      'MSc Education',
      'https://www.bristol.ac.uk/study/postgraduate/taught/msc-education',
      '리즈 - Education MA',
      'https://courses.leeds.ac.uk/a591/education-ma'
    ].join('\n'));

    assert.deepEqual(
      education.extraction.programmes.map((programme) => programme.universityName),
      ['Edinburgh', 'Warwick', 'Bristol', 'Leeds']
    );
    assert.deepEqual(education.extraction.extractionWarnings, []);

    const mba = await extractMessage(baseUrl, [
      '강명희',
      '2026/03/23 PM 05:51',
      '[업무요청] 홍윤태 입학요강 정리',
      '안녕하세요:) @Marion Lee (정규감수)',
      'MBA 입학요강 정리 부탁드립니다.',
      'Manchester_18개월',
      'https://www.alliancembs.manchester.ac.uk/study/mba/full-time-mba/',
      'Warwick',
      'https://www.wbs.ac.uk/courses/mba/full-time/'
    ].join('\n'));

    assert.deepEqual(
      mba.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'Manchester', programmeNameOriginal: 'MBA' },
        { universityName: 'Warwick', programmeNameOriginal: 'MBA' }
      ]
    );
    assert.deepEqual(mba.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts programme-first colon rows and numbered misspelled university headers', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const programmeFirst = await extractMessage(baseUrl, [
      '김샘',
      '2025/12/05 AM 10:19',
      '[업무요청] 박민정 님 입학요강 요청',
      '1.-Central and South-East European Studies MA : UCL',
      'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/central-and-south-east-european-studies-ma',
      '2.-RUSSIAN, EAST EUROPEAN & EURASIAN STUDIES MSc/PgDip : Glasgow',
      'https://www.gla.ac.uk/postgraduate/taught/russiancentraleasteuropeanstudiesmsc/',
      '3.-KCL: Language and Cultural Diversity MA',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/language-and-cultural-diversity-ma',
      '4.- BIRMINGHAM : Language, Culture and Communication MA',
      'https://www.birmingham.ac.uk/study/postgraduate/subjects/english-language-and-linguistics-courses/language-culture-and-communication-ma',
      '5.- EDINBURGH : Language and Intercultural Communication MSc',
      'https://study.ed.ac.uk/programmes/postgraduate-taught/1006-language-and-intercultural-communication',
      '6.- York: INTERNATIONAL RELATIONS AND GLOBAL ETHICS',
      'https://www.york.ac.uk/study/postgraduate-taught/courses/ma-international-relations-global-ethics/'
    ].join('\n'));

    assert.deepEqual(
      programmeFirst.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'UCL', programmeNameOriginal: 'Central and South-East European Studies MA' },
        { universityName: 'Glasgow', programmeNameOriginal: 'RUSSIAN, EAST EUROPEAN & EURASIAN STUDIES MSc/PgDip' },
        { universityName: 'KCL', programmeNameOriginal: 'Language and Cultural Diversity MA' },
        { universityName: 'Birmingham', programmeNameOriginal: 'Language, Culture and Communication MA' },
        { universityName: 'Edinburgh', programmeNameOriginal: 'Language and Intercultural Communication MSc' },
        { universityName: 'York', programmeNameOriginal: 'INTERNATIONAL RELATIONS AND GLOBAL ETHICS' }
      ]
    );
    assert.deepEqual(programmeFirst.extraction.extractionWarnings, []);

    const misspelledUniversity = await extractMessage(baseUrl, [
      '김유진',
      '2025/12/02 PM 01:56',
      '[업무요청] 이혜림_입학요강',
      '1. Imperial', 'MSc in Management', 'https://www.imperial.ac.uk/study/courses/postgraduate-taught/management/',
      '2. UCL', 'Management MSc', 'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/management-msc',
      '3. KCL', 'International Management MSc', 'https://www.kcl.ac.uk/study/postgraduate-taught/courses/international-management-msc',
      '4. Queen Mary', 'Management MSc', 'https://www.qmul.ac.uk/postgraduate/taught/coursefinder/courses/management-msc/',
      '5. Manchster', 'MSc Management', 'https://www.alliancembs.manchester.ac.uk/study/masters/msc-management/'
    ].join('\n'));

    assert.deepEqual(
      misspelledUniversity.extraction.programmes.map((programme) => programme.universityName),
      ['Imperial', 'UCL', 'KCL', 'Queen Mary', 'Manchester']
    );
    assert.deepEqual(misspelledUniversity.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction handles acronym headers, MPA, malformed request titles, and title text', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const acronymHeaders = await extractMessage(baseUrl, [
      '성지혜',
      '2025/11/25 PM 12:04',
      '[업무요청] 양지원님 추가 2개교 입학요강 정리',
      'University College London (UCL)',
      'MSc Management',
      'https://www.mgmt.ucl.ac.uk/management',
      'King’s College London (KCL)',
      'MSc International Management',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/international-management-msc'
    ].join('\n'));

    assert.deepEqual(
      acronymHeaders.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'UCL', programmeNameOriginal: 'MSc Management' },
        { universityName: 'KCL', programmeNameOriginal: 'MSc International Management' }
      ]
    );
    assert.deepEqual(acronymHeaders.extraction.extractionWarnings, []);

    const mpa = await extractMessage(baseUrl, [
      '김유진',
      '2025/11/19 PM 05:23',
      '[업무요청] 나종혁 입학요강 요청',
      'Exester',
      'MPA Master of Public Administration',
      'https://www.exeter.ac.uk/study/postgraduate/courses/politics/public-administration/#entry-requirements',
      'UEA',
      'MA Public Policy and Public Management',
      'https://www.uea.ac.uk/course/postgraduate/ma-public-policy-and-public-management#entry_requirements'
    ].join('\n'));

    assert.deepEqual(
      mpa.extraction.programmes.map((programme) => programme.universityName),
      ['Exeter', 'UEA']
    );
    assert.deepEqual(mpa.extraction.extractionWarnings, []);

    const malformedTitle = await extractMessage(baseUrl, [
      '김유진',
      '2025/11/12 PM 06:02',
      '[업무요청 안정인 1개교 입학요강',
      'Southampton',
      'Engineering Materials (Advanced Mechanical Engineering Science) (MSc)',
      'https://www.southampton.ac.uk/courses/engineering-materials-advanced-mechanical-engineering-science-masters-msc'
    ].join('\n'));

    assert.equal(malformedTitle.extraction.studentName, '안정인');
    assert.deepEqual(malformedTitle.extraction.extractionWarnings, []);

    const inlineUniversities = await extractMessage(baseUrl, [
      '강명희',
      '2025/11/10 PM 02:32',
      '[입학요강] 조채원님 International Business 입학요강',
      'University of Liverpool MSc International Business',
      'https://www.liverpool.ac.uk/courses/international-business-msc',
      'University of Exeter International Business MSc',
      'https://www.exeter.ac.uk/study/postgraduate/courses/business/international_business/',
      'Loughboroug University International Business MSc',
      'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/international-business/'
    ].join('\n'));

    assert.deepEqual(
      inlineUniversities.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'Liverpool', programmeNameOriginal: 'MSc International Business' },
        { universityName: 'Exeter', programmeNameOriginal: 'International Business MSc' },
        { universityName: 'Loughborough', programmeNameOriginal: 'International Business MSc' }
      ]
    );
    assert.deepEqual(inlineUniversities.extraction.extractionWarnings, []);

    const requestTitle = await extractMessage(baseUrl, [
      '김슬아',
      '2025/11/06 PM 06:20',
      '[입학요강] 주정민님 - Computer Science 입학요강 요청',
      'KCL - Advanced Computing',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/advanced-computing-msc',
      'Bristol - Data Science',
      'https://www.bristol.ac.uk/study/postgraduate/taught/msc-data-science/',
      'Birmingham - Advanced Computer Science',
      'https://www.birmingham.ac.uk/study/postgraduate/subjects/computer-science-and-data-science-courses/advanced-computer-science-msc',
      'Leeds - Advanced Computer Science',
      'https://courses.leeds.ac.uk/f753/advanced-computer-science-msc',
      'Nottingham - Computer Science',
      'https://www.nottingham.ac.uk/pgstudy/course/taught/computer-science-or-computer-science-artificial-intelligence-msc'
    ].join('\n'));

    assert.equal(requestTitle.extraction.studentName, '주정민');
    assert.equal(requestTitle.extraction.programmes.length, 5);
    assert.deepEqual(requestTitle.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction accepts numbered misspelled dash headers and Korean university suffixes', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const misspelledDashHeader = await extractMessage(baseUrl, [
      '김유진',
      '2025/10/30 PM 01:19',
      '[업무요청] 임보라 입학요강',
      '1. KCL - Advanced Software Engineering MSc',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/advanced-software-engineering-msc',
      '2. Manchster - Advanced Computer Science',
      'https://www.manchester.ac.uk/study/masters/courses/list/21573/msc-advanced-computer-science/',
      '3. Warwick - Applied Artificial Intelligence MSc',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-applied-artificial-intelligence/'
    ].join('\n'));

    assert.deepEqual(
      misspelledDashHeader.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'KCL', programmeNameOriginal: 'Advanced Software Engineering MSc' },
        { universityName: 'Manchester', programmeNameOriginal: 'Advanced Computer Science' },
        { universityName: 'Warwick', programmeNameOriginal: 'Applied Artificial Intelligence MSc' }
      ]
    );
    assert.deepEqual(misspelledDashHeader.extraction.extractionWarnings, []);

    const koreanUniversitySuffix = await extractMessage(baseUrl, [
      '성지혜',
      '2025/10/28 PM 07:01',
      '[업무요청] 김예은 호주 석사 요강정리',
      '안녕하세요 :)',
      '호주의 경우 WAM(weighted average mark)라는 형태로 입학요건이 나와있는데,',
      '학교에 따라 International admission 요건 - 한국 GPA 기준으로 확인되는곳도 있어서 확인 가능하시다면 한국 GPA 타입으로 정리 부탁드려요 :)',
      '안된다면 기본 요구조건으로 찾아봐주세요 !',
      '아들레이드대학교',
      'Master of Professional Engineering (Environmental and Water Resources Management)',
      'https://adelaideuni.edu.au/study/degrees/master-of-professional-engineering-environmental-and-water-resources-management/',
      '2. RMIT',
      'Master of Engineering (Environmental Engineering)',
      'https://www.rmit.edu.au/study-with-us/levels-of-study/postgraduate-study/masters-by-coursework/master-of-engineering-environmental-engineering-mc254'
    ].join('\n'));

    assert.equal(koreanUniversitySuffix.extraction.programmes.length, 2);
    assert.deepEqual(
      koreanUniversitySuffix.extraction.programmes.map((programme) => programme.programmeNameOriginal),
      [
        'Master of Professional Engineering (Environmental and Water Resources Management)',
        'Master of Engineering (Environmental Engineering)'
      ]
    );
    assert.deepEqual(koreanUniversitySuffix.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction recognizes a scheme-less programme URL in its original position', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '최승미',
      '2025/10/28 PM 03:52',
      '[업무요청] 장시아 입학요강 정리',
      'UCL',
      'Human–Computer Interaction',
      'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/human-computer-interaction-msc',
      '2. Imperial College London Design with Behaviour Science',
      'imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/',
      '3. City St George\'s, University of London',
      'User Experience Engineering MSc',
      'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering',
      '4. Loughborough',
      'MSc Human Factors & Ergonomics',
      'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/ergonomics-human-factors/',
      '5. Nottingham',
      'Human Factors and Ergonomics MSc',
      'https://www.nottingham.ac.uk/pgstudy/course/taught/human-factors-and-ergonomics-msc'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map(({ universityName, programmeUrl }) => ({
        universityName,
        programmeUrl
      })),
      [
        {
          universityName: 'UCL',
          programmeUrl: 'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/human-computer-interaction-msc'
        },
        {
          universityName: 'Imperial',
          programmeUrl: 'https://imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/'
        },
        {
          universityName: 'City St George',
          programmeUrl: 'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering'
        },
        {
          universityName: 'Loughborough',
          programmeUrl: 'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/ergonomics-human-factors/'
        },
        {
          universityName: 'Nottingham',
          programmeUrl: 'https://www.nottingham.ac.uk/pgstudy/course/taught/human-factors-and-ergonomics-msc'
        }
      ]
    );
    assert.deepEqual(payload.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction handles unlabeled inline programmes, metadata, bracket headers, and City variants', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const imperial = await extractMessage(baseUrl, [
      '최승미',
      '2025/10/28 PM 03:52',
      '[업무요청] 장시아 입학요강 정리',
      'UCL', 'Human–Computer Interaction',
      'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/human-computer-interaction-msc',
      '2. Imperial College London Design with Behaviour Science',
      'imperial.ac.uk/study/courses/postgraduate-taught/2026/design-behaviour/',
      '3. City St George’s, University of London', 'User Experience Engineering MSc',
      'https://www.citystgeorges.ac.uk/prospective-students/courses/postgraduate/user-experience-engineering',
      '4. Loughborough', 'MSc Human Factors & Ergonomics',
      'https://www.lboro.ac.uk/study/postgraduate/masters-degrees/a-z/ergonomics-human-factors/',
      '5. Nottingham', 'Human Factors and Ergonomics MSc',
      'https://www.nottingham.ac.uk/pgstudy/course/taught/human-factors-and-ergonomics-msc'
    ].join('\n'));

    assert.deepEqual(
      imperial.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [
        { universityName: 'UCL', programmeNameOriginal: 'Human–Computer Interaction' },
        { universityName: 'Imperial', programmeNameOriginal: 'Design with Behaviour Science' },
        { universityName: 'City St George', programmeNameOriginal: 'User Experience Engineering MSc' },
        { universityName: 'Loughborough', programmeNameOriginal: 'MSc Human Factors & Ergonomics' },
        { universityName: 'Nottingham', programmeNameOriginal: 'Human Factors and Ergonomics MSc' }
      ]
    );
    assert.deepEqual(imperial.extraction.extractionWarnings, []);

    const metadata = await extractMessage(baseUrl, [
      '김유진', '2025/10/20 PM 05:30', '[업무요청] 김성결 입학요강 요청',
      '1. UCL', 'Development Planning Unit (DPU), IOE',
      'MA Education and International Development',
      'https://www.ucl.ac.uk/prospective-students/graduate/taught-degrees/education-and-international-development-ma',
      '2. SOAS', 'Department of Development Studies', 'MSc Global Development',
      'https://www.soas.ac.uk/study/find-course/msc-global-development',
      '3. KCL', 'Department of International Development',
      'Emerging Economies and International Development MSc',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/emerging-economies-and-international-development-msc'
    ].join('\n'));

    assert.equal(metadata.extraction.programmes.length, 3);
    assert.deepEqual(metadata.extraction.extractionWarnings, []);

    const bracketHeaders = await extractMessage(baseUrl, [
      '강명희', '2025/09/11 AM 10:59', '[입학요강] 김재안님_Development Studies',
      '[University of Manchester]', 'MSc Development Finance',
      'https://www.manchester.ac.uk/study/masters/courses/list/06537/msc-development-finance/',
      '[SOAS]', 'MSc Global Development',
      'https://www.soas.ac.uk/study/find-course/msc-global-development',
      '[University of Sussex]', 'MA Development Studies',
      'https://www.sussex.ac.uk/study/masters/courses/development-studies-ma'
    ].join('\n'));

    assert.deepEqual(
      bracketHeaders.extraction.programmes.map((programme) => programme.universityName),
      ['Manchester', 'SOAS', 'Sussex']
    );
    assert.deepEqual(bracketHeaders.extraction.extractionWarnings, []);

    const misspelledUniversity = await extractMessage(baseUrl, [
      '홍혜진', '2025/09/01 PM 01:18', '[업무요청] 김민지 입학요강 서칭 요청',
      'Univerisity of York', 'psychology in education',
      'https://www.york.ac.uk/study/postgraduate-taught/courses/msc-psychology-education-conversion-programme/',
      'University of Sheffield', 'psychology and education',
      'https://sheffield.ac.uk/postgraduate/taught/courses/2025/psychology-and-education-ma',
      'University of Warwick', 'psychology and education',
      'https://warwick.ac.uk/study/postgraduate/courses/ma-psychology-education'
    ].join('\n'));

    assert.deepEqual(
      misspelledUniversity.extraction.programmes.map((programme) => programme.universityName),
      ['York', 'Sheffield', 'Warwick']
    );
    assert.deepEqual(misspelledUniversity.extraction.extractionWarnings, []);

    const cityVariant = await extractMessage(baseUrl, [
      '담당자', '2025/09/01 PM 01:18', '[업무요청] 테스트학생 입학요강 요청',
      'City St George’s, University of London / Business Analytics',
      'https://www.bayes.citystgeorges.ac.uk/study/masters/courses/business-analytics'
    ].join('\n'));

    assert.deepEqual(
      cityVariant.extraction.programmes.map(({ universityName, programmeNameOriginal }) => ({
        universityName,
        programmeNameOriginal
      })),
      [{ universityName: 'City St George', programmeNameOriginal: 'Business Analytics' }]
    );
    assert.deepEqual(cityVariant.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

test('mocked extraction stops at post-programme notes and ignores attachment filenames', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const payload = await extractMessage(baseUrl, [
      '성지혜',
      '2025/07/16 PM 02:59',
      '[업무요청] 박정진님 입학요강 정리',
      'Business Analytics 학과로',
      '26년 9월 지원 원하는 박정진님 요강 정리 부탁드립니다.',
      'UCL - MSc Business Analytics',
      'https://www.mgmt.ucl.ac.uk/business-analytics',
      '2.KCL - Finance Analytics MSc',
      'https://www.kcl.ac.uk/study/postgraduate-taught/courses/finance-analytics-msc',
      '3. 사우스햄튼 - Data and Decision Analytics MSc',
      'https://www.southampton.ac.uk/courses/data-decision-analytics-masters-msc',
      '4. 리즈 - Business Analytics and Decision Sciences MSc',
      'https://courses.leeds.ac.uk/g503/business-analytics-and-decision-sciences-msc',
      '5. 워릭 - Business Analytics MSc',
      'https://warwick.ac.uk/study/postgraduate/courses/msc-business-analytics/',
      '특이사항: 학부전공이 산업공학 (industrial and management engineering)이고 성적표에 Quantitative 관련 과목 + 프로그래밍 과목이 섞여있는 학생입니다.',
      '입학 요구조건에 어떤 degree를 선호하는지, 선수과목등 명시된 있다면 최대한 상세히 정리부탁드리겠습니다~',
      '박정진-영문-성적증명서-202507151745.pdf'
    ].join('\n'));

    assert.deepEqual(
      payload.extraction.programmes.map((programme) => programme.universityName),
      ['UCL', 'KCL', 'Southampton', 'Leeds', 'Warwick']
    );
    assert.deepEqual(payload.extraction.extractionWarnings, []);

    const attachmentWithoutNotesHeading = await extractMessage(baseUrl, [
      '담당자',
      '2025/07/16 PM 02:59',
      '[업무요청] 첨부학생 입학요강 정리',
      'UCL',
      'MSc Business Analytics',
      'https://www.mgmt.ucl.ac.uk/business-analytics',
      '첨부학생-영문성적표.pdf'
    ].join('\n'));

    assert.equal(attachmentWithoutNotesHeading.extraction.programmes.length, 1);
    assert.deepEqual(attachmentWithoutNotesHeading.extraction.extractionWarnings, []);
  } finally {
    await close(server);
  }
});

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

