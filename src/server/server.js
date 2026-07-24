import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockExtractJandiMessage, validateExtraction } from './extraction/mockExtractor.js';
import { safeErrorPayload } from './notion/errors.js';
import { createDefaultNotionCreationService } from './notion/notionCreationService.js';
import { createDefaultNotionPreviewService } from './notion/notionPreviewService.js';
import { checkNotionSchema } from './notion/schema.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.join(projectRoot, 'public');
const sharedDir = path.join(projectRoot, 'src', 'shared');

export function createAppServer(options = {}) {
  const notionCreationEnabled = options.notionCreationEnabled
    ?? process.env.NOTION_CREATION_ENABLED !== 'false';
  let notionCreationService = options.notionCreationService ?? null;

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);

      if (request.method === 'POST' && requestUrl.pathname === '/api/extract') {
        await handleExtract(request, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/notion/schema') {
        await handleNotionSchema(response, options, notionCreationEnabled);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/notion/preview') {
        await handleNotionPreview(request, response, options);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/notion/work-log-title') {
        await handleNotionWorkLogTitle(request, response, options);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/notion/create') {
        if (!notionCreationEnabled) {
          sendJson(response, 403, {
            ok: false,
            error: {
              code: 'NOTION_CREATION_DISABLED',
              message: 'Notion creation is disabled until the controlled live-write gate is approved.',
              details: {}
            }
          });
          return;
        }

        notionCreationService ??= createDefaultNotionCreationService({
          client: options.notionClient,
          config: options.notionConfig,
          journal: options.notionCreationJournal,
          journalPath: options.notionCreationJournalPath
        });
        await handleNotionCreate(request, response, notionCreationService);
        return;
      }

      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }

      await serveStatic(requestUrl.pathname, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

export function startServer({ host = HOST, port = PORT } = {}) {
  const server = createAppServer();

  server.listen(port, host, () => {
    console.log(`Local app running at http://${host}:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set PORT to another value and restart.`);
      process.exit(1);
    }

    throw error;
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

async function handleExtract(request, response) {
  const body = await readRequestBody(request);
  const parsed = JSON.parse(body || '{}');
  const extraction = mockExtractJandiMessage(parsed.message);
  const errors = validateExtraction(extraction);

  sendJson(response, Object.keys(errors).length ? 422 : 200, {
    extraction,
    errors
  });
}

async function handleNotionSchema(response, options, notionCreationEnabled) {
  try {
    const result = await checkNotionSchema({
      client: options.notionClient,
      config: options.notionConfig
    });
    sendJson(response, 200, {
      ...result,
      creationEnabled: notionCreationEnabled
    });
  } catch (error) {
    const payload = safeErrorPayload(error);
    sendJson(response, error.statusCode ?? 500, {
      ok: false,
      error: payload
    });
  }
}

async function handleNotionPreview(request, response, options) {
  try {
    const payload = await readJsonRequest(request);
    const service = options.notionPreviewService ?? createDefaultNotionPreviewService({
      client: options.notionClient,
      config: options.notionConfig
    });
    const result = await service.preview(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendNotionError(response, error);
  }
}

async function handleNotionWorkLogTitle(request, response, options) {
  try {
    const payload = await readJsonRequest(request);
    const service = options.notionPreviewService ?? createDefaultNotionPreviewService({
      client: options.notionClient,
      config: options.notionConfig
    });
    const result = await service.getWorkLogTitleForStudent(
      payload.selectedStudentId ?? payload.studentId,
      payload.workLogCount
    );
    sendJson(response, 200, result);
  } catch (error) {
    sendNotionError(response, error);
  }
}

async function handleNotionCreate(request, response, service) {
  try {
    const payload = await readJsonRequest(request);
    const result = await service.create(payload);
    sendJson(response, 201, result);
  } catch (error) {
    sendNotionError(response, error);
  }
}

async function readJsonRequest(request) {
  const body = await readRequestBody(request);
  return JSON.parse(body || '{}');
}

function sendNotionError(response, error) {
  const payload = safeErrorPayload(error);
  sendJson(response, error.statusCode ?? 500, {
    ok: false,
    error: payload
  });
}

async function serveStatic(pathname, response) {
  if (pathname.startsWith('/shared/')) {
    const relativePath = pathname.replace('/shared/', '');
    await sendFile(response, path.join(sharedDir, relativePath), sharedDir);
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  await sendFile(response, path.join(publicDir, relativePath), publicDir);
}

async function sendFile(response, filePath, baseDir) {
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(baseDir, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    const file = await readFile(resolvedPath);
    response.writeHead(200, {
      'Content-Type': contentTypeFor(resolvedPath)
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error('Request body is too large.'));
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json'
  });
  response.end(JSON.stringify(payload));
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
  };

  return types[extension] ?? 'application/octet-stream';
}
