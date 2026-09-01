import net from 'node:net';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreLinkedUrls } from './jandi-message-text.mjs';
import { extractSopAttachmentNames } from '../src/shared/sopFilename.js';
import {
  JANDI_COMMENT_MARKER,
  JANDI_PARENT_MARKER,
  formatJandiCommentMessage
} from '../src/shared/jandiMessageContext.js';

const endpoint = process.argv.find((argument) => argument.startsWith('http')) ?? 'http://127.0.0.1:9222';
const extractMode = process.argv.includes('--extract');
const listAttachmentsMode = process.argv.includes('--list-attachments');
const listPostId = process.argv.find((argument) => argument.startsWith('--post='))?.slice(7) ?? '';
const outputPath = process.argv.find((argument) => argument.startsWith('--output='))?.slice(9);
const downloadFilename = process.argv.find((argument) => argument.startsWith('--download='))?.slice(11);
const defaultContextPath = fileURLToPath(
  new URL('../.local/jandi-source-context.json', import.meta.url)
);
const contextPath = process.argv
  .find((argument) => argument.startsWith('--context='))?.slice(10)
  ?? defaultContextPath;
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find((item) => item.type === 'page' && item.url?.includes('edmworks.jandi.com/app'));

if (!target) {
  throw new Error('JANDI main renderer target was not found.');
}

const client = await connectWebSocket(target.webSocketDebuggerUrl);
if (listAttachmentsMode) {
  console.log(JSON.stringify(await listVisibleAttachments(client, listPostId), null, 2));
  client.close();
  process.exit(0);
}
if (downloadFilename) {
  await clickStoredAttachment({ client, contextPath, filename: downloadFilename });
  client.close();
  process.exit(0);
}

const restoreLinkedUrlsSource = restoreLinkedUrls.toString();
const formatJandiCommentMessageSource = formatJandiCommentMessage.toString();
const expression = extractMode
  ? `(() => {
      const restoreLinkedUrls = ${restoreLinkedUrlsSource};
      const JANDI_COMMENT_MARKER = ${JSON.stringify(JANDI_COMMENT_MARKER)};
      const JANDI_PARENT_MARKER = ${JSON.stringify(JANDI_PARENT_MARKER)};
      const formatJandiCommentMessage = ${formatJandiCommentMessageSource};
      const hovered = (element) => element.matches(':hover') || Boolean(element.querySelector(':hover'));
      const readVisibleText = (element) => String(element?.innerText ?? element?.textContent ?? '').trim();
      const readAttachmentText = (container) => {
        const commentContainer = container?.matches('.comment-item.article-comment') ? container : null;
        return [...(container?.querySelectorAll(
          'a, button, [role="button"], [class*="file"], [class*="attach"]'
        ) ?? [])]
        .filter((element) => commentContainer
          ? element.closest('.comment-item.article-comment') === commentContainer
          : !element.closest('.comment-item.article-comment'))
        .flatMap((element) => String(element.innerText ?? element.textContent ?? '').split(/\\r?\\n/))
        .map((line) => line.trim())
        .filter((line) => /\\.(?:docx|pdf)(?:\\s|$)/i.test(line))
        .join('\\n');
      };
      const readMessage = (container, bodySelector, dateSelector = '.article-date, .fn-write-time') => {
        const writer = readVisibleText(container?.querySelector('.fn-user-name'));
        const date = readVisibleText(container?.querySelector(dateSelector));
        const body = container?.querySelector(bodySelector);
        const links = [...(body?.querySelectorAll('a[href]') ?? [])]
          .map((link) => ({ href: link.href, text: link.innerText ?? link.textContent ?? '' }));
        const text = restoreLinkedUrls(body?.innerText ?? '', links);
        return [writer, date, text].filter(Boolean).join('\\n');
      };
      const comment = [...document.querySelectorAll('.comment-item.article-comment')].find(hovered);
      if (comment) {
        const parent = comment.closest('.message.article._message');
        const commentMessage = readMessage(comment, '.comment-text-box', '.fn-write-time');
        const parentMessage = readMessage(parent, '.article-body._messageBubbleTarget');
        const parentCards = [...document.querySelectorAll('.message.article._message')];
        const comments = [...(parent?.querySelectorAll('.comment-item.article-comment') ?? [])];
        return {
          message: formatJandiCommentMessage({ commentMessage, parentMessage }),
          attachmentText: readAttachmentText(comment),
          sourceType: 'comment',
          locator: {
            sourceType: 'comment',
            postId: parent?.id ?? '',
            postIndex: parentCards.indexOf(parent),
            commentIndex: comments.indexOf(comment)
          }
        };
      }
      const cards = [...document.querySelectorAll('.message.article._message')];
      const card = cards.find(hovered);
      if (!card) return null;
      const message = readMessage(card, '.article-body._messageBubbleTarget');
      return {
        message,
        attachmentText: readAttachmentText(card),
        sourceType: 'post',
        locator: {
          sourceType: 'post',
          postId: card.id ?? '',
          postIndex: cards.indexOf(card),
          commentIndex: -1
        }
      };
    })()`
  : `(() => {
    const className = (element) => typeof element.className === 'string' ? element.className : '';
    const candidates = [...document.querySelectorAll('*')]
      .filter((element) => /message|chat|room|sender|user|author|date|time|timestamp|nickname/i.test(
        [element.id, className(element), element.getAttribute('role'), element.getAttribute('aria-label')].filter(Boolean).join(' ')
      ))
      .slice(0, 150)
      .map((element) => ({
        tag: element.tagName,
        id: element.id,
        className: className(element).slice(0, 180),
        role: element.getAttribute('role'),
        ariaLabel: element.getAttribute('aria-label'),
        textLength: element.innerText?.length ?? 0,
        childCount: element.children.length
      }));

    return {
      url: location.href,
      title: document.title,
      bodyTextLength: document.body?.innerText?.length ?? 0,
      elementCount: document.querySelectorAll('*').length,
      commentCount: document.querySelectorAll('.comment-item.article-comment').length,
      commentBodyCount: document.querySelectorAll('.comment-item.article-comment .comment-text-box').length,
      windowInfo: {
        screenX: window.screenX,
        screenY: window.screenY,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      activePanels: [...document.querySelectorAll('.cpanel')]
        .filter((panel) => !panel.classList.contains('ng-hide'))
        .map((panel) => ({ className: panel.className, textLength: panel.innerText?.length ?? 0 })),
      hoveredMessages: [...document.querySelectorAll('.message.article._message')]
        .filter((card) => card.matches(':hover') || card.querySelector(':hover'))
        .map((card) => ({
        writerLength: card.querySelector('.fn-user-name')?.textContent?.length ?? 0,
        dateLength: card.querySelector('.article-date, .fn-write-time')?.textContent?.length ?? 0,
        bodyLength: card.querySelector('.article-body._messageBubbleTarget')?.innerText?.length ?? 0
      })),
      hoveredComments: [...document.querySelectorAll('.comment-item.article-comment')]
        .filter((comment) => comment.matches(':hover') || comment.querySelector(':hover'))
        .map((comment) => ({
          writerLength: comment.querySelector('.fn-user-name')?.textContent?.length ?? 0,
          dateLength: comment.querySelector('.fn-write-time')?.textContent?.length ?? 0,
          bodyLength: comment.querySelector('.comment-text-box')?.innerText?.length ?? 0
        })),
      visibleMessages: [...document.querySelectorAll('.message.article._message')]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(-10)
        .map((card) => ({
          writerLength: card.querySelector('.fn-user-name')?.textContent?.length ?? 0,
          dateLength: card.querySelector('.article-date, .fn-write-time')?.textContent?.length ?? 0,
          bodyLength: card.querySelector('.article-body._messageBubbleTarget')?.innerText?.length ?? 0
        })),
      messageCardStates: [...document.querySelectorAll('.message.article._message')].slice(-10).map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          className: card.className,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          offsetParent: Boolean(card.offsetParent),
          parentClassName: card.parentElement?.className ?? '',
          parentId: card.parentElement?.id ?? ''
        };
      }),
      candidates
    };
  })()`;
const result = await client.call('Runtime.evaluate', {
  expression,
  returnByValue: true
});

const value = result.result?.result?.value;
if (extractMode) {
  const extractedMessage = typeof value === 'string' ? value : value?.message ?? '';
  const attachmentNames = extractSopAttachmentNames([
    extractedMessage,
    typeof value === 'object' ? value?.attachmentText : ''
  ].filter(Boolean).join('\n'));
  const completeMessage = [
    extractedMessage,
    ...attachmentNames.filter((filename) => !extractedMessage.includes(filename))
  ].filter(Boolean).join('\n');

  if (!completeMessage) {
    process.exitCode = 2;
  } else {
    if (value?.locator) {
      mkdirSync(path.dirname(contextPath), { recursive: true });
      writeFileSync(contextPath, JSON.stringify({
        version: 1,
        capturedAt: new Date().toISOString(),
        targetUrl: target.url,
        messageSha256: sha256(completeMessage),
        locator: value.locator,
        attachmentNames
      }, null, 2), 'utf8');
    }
    if (outputPath) writeFileSync(outputPath, completeMessage, 'utf8');
    else console.log(completeMessage);
  }
} else {
  console.log(JSON.stringify(value ?? result, null, 2));
}
client.close();

async function listVisibleAttachments(client, postId = '') {
  const expression = [
    '(() => {',
    'const requestedPostId = ' + JSON.stringify(postId) + ';',
    "const cards = [...document.querySelectorAll('.message.article._message')];",
    "const attachmentSelector = 'a,button,[role=\"button\"],[class*=\"file\"],[class*=\"attach\"]';",
    "const filenamePattern = /[^\\r\\n]*\\.(?:docx|pdf)(?=\\s|$)/ig;",
    'return cards.filter((card) => !requestedPostId || card.id === requestedPostId).map((card) => {',
    'const postIndex = cards.indexOf(card);',
    'const rect = card.getBoundingClientRect();',
    "const describeAction = (action) => ({ tagName: action.tagName, className: String(action.className ?? '').slice(0, 180), href: action.getAttribute('href'), ngClick: action.getAttribute('ng-click'), title: action.getAttribute('title'), ariaLabel: action.getAttribute('aria-label') });",
    "const describe = (element) => ({ tagName: element.tagName, className: String(element.className ?? '').slice(0, 180), href: element.getAttribute('href'), ngClick: element.getAttribute('ng-click'), handlerSource: element.getAttribute('ng-click') ? String(window.angular?.element(element).scope()?.onPreviewClick ?? '').slice(0, 2000) : null, role: element.getAttribute('role'), title: element.getAttribute('title'), ariaLabel: element.getAttribute('aria-label'), parentClassName: String(element.parentElement?.className ?? '').slice(0, 180), actions: [...element.querySelectorAll('[ng-click],a[href],button,[role=\"button\"]')].map(describeAction), filenames: String(element.innerText ?? element.textContent ?? '').match(filenamePattern) ?? [] });",
    "const elements = [...card.querySelectorAll(attachmentSelector)].filter((element) => !element.closest('.comment-item.article-comment')).map(describe).filter((entry) => entry.filenames.length > 0);",
    "const comments = [...card.querySelectorAll('.comment-item.article-comment')].map((comment, commentIndex) => ({ commentIndex, elements: [...comment.querySelectorAll(attachmentSelector)].filter((element) => element.closest('.comment-item.article-comment') === comment).map(describe).filter((entry) => entry.filenames.length > 0) })).filter((entry) => entry.elements.length > 0);",
    "return { postId: card.id ?? '', postIndex, visible: rect.width > 0 && rect.height > 0, elements, comments };",
    '}).filter((entry) => entry.elements.length > 0 || entry.comments.length > 0);',
    '})()'
  ].join('\n');
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.result?.value ?? [];
}

async function clickStoredAttachment({ client, contextPath, filename }) {
  const context = JSON.parse(readFileSync(contextPath, 'utf8'));
  const expression = [
    '(() => {',
    'const locator = ' + JSON.stringify(context.locator ?? {}) + ';',
    'const expectedFilename = ' + JSON.stringify(filename) + ';',
    "const cards = [...document.querySelectorAll('.message.article._message')];",
    'const card = locator.postId ? document.getElementById(locator.postId) : cards[locator.postIndex];',
    "if (!card || !card.matches('.message.article._message')) return { status: 'not_found', reason: 'source_post_not_found' };",
    "const source = locator.sourceType === 'comment' ? [...card.querySelectorAll('.comment-item.article-comment')][locator.commentIndex] : card;",
    "if (!source) return { status: 'not_found', reason: 'source_comment_not_found' };",
    "const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();",
    'const expected = normalize(expectedFilename);',
    "const primaryClickableSelector = '[ng-click*=\"onPreviewClick\"],a[href],button,[role=\"button\"],[ng-click]';",
    "const clickableSelector = 'a[href],button,[role=\"button\"],[ng-click],[class*=\"file\"],[class*=\"attach\"]';",
    "const scopedElements = [...source.querySelectorAll('*')].filter((element) => locator.sourceType === 'comment' ? element.closest('.comment-item.article-comment') === source : !element.closest('.comment-item.article-comment'));",
    "const textMatches = scopedElements.filter((element) => normalize(element.innerText ?? element.textContent).includes(expected)).sort((left, right) => normalize(left.innerText ?? left.textContent).length - normalize(right.innerText ?? right.textContent).length);",
    'for (const match of textMatches) {',
    'const clickable = match.matches(primaryClickableSelector) ? match : match.querySelector(primaryClickableSelector) ?? (match.matches(clickableSelector) ? match : match.closest(clickableSelector) ?? match.querySelector(clickableSelector));',
    'if (!clickable || !source.contains(clickable)) continue;',
    "clickable.scrollIntoView({ block: 'center', inline: 'nearest' });",
    'const rect = clickable.getBoundingClientRect();',
    'if (rect.width <= 0 || rect.height <= 0) continue;',
    "return { status: 'ready', x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2), tagName: clickable.tagName, className: String(clickable.className ?? '').slice(0, 160) };",
    '}',
    "return { status: 'not_found', reason: 'attachment_element_not_found' };",
    '})()'
  ].join('\n');
  const located = await client.call('Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  const result = located.result?.result?.value;
  if (result?.status !== 'ready') {
    const error = new Error(result?.reason ?? 'attachment_element_not_found');
    error.code = 'JANDI_ATTACHMENT_NOT_FOUND';
    throw error;
  }
  await client.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: result.x,
    y: result.y,
    button: 'left',
    clickCount: 1
  });
  await client.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: result.x,
    y: result.y,
    button: 'left',
    clickCount: 1
  });
  await wait(650);
  const viewerDownload = await locateViewerDownload(client, filename);
  if (viewerDownload?.status === 'ready') {
    await client.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: viewerDownload.x,
      y: viewerDownload.y,
      button: 'left',
      clickCount: 1
    });
    await client.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: viewerDownload.x,
      y: viewerDownload.y,
      button: 'left',
      clickCount: 1
    });
  }
  console.log(JSON.stringify({
    status: 'clicked',
    filename,
    viewerDownloadClicked: viewerDownload?.status === 'ready'
  }));
}

async function locateViewerDownload(client, filename) {
  const expression = [
    '(() => {',
    'const expectedFilename = ' + JSON.stringify(filename) + ';',
    "const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();",
    "const actionSelector = '[ng-click],[data-ng-click],a[href],button,[role=\"button\"],[title],[aria-label]';",
    "const downloadHint = /download|다운로드|file.*down|cloudfrontdown/i;",
    'const expected = normalize(expectedFilename);',
    "const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };",
    "const descriptor = (element) => [element.innerText, element.textContent, element.className, element.id, element.getAttribute('ng-click'), element.getAttribute('data-ng-click'), element.getAttribute('title'), element.getAttribute('aria-label')].filter(Boolean).join(' ');",
    "const viewerRoots = [...document.querySelectorAll('[role=\"dialog\"],[class*=\"viewer\"],[class*=\"modal\"],[class*=\"preview\"]')].filter(visible).filter((element) => normalize(element.innerText ?? element.textContent).includes(expected));",
    'const candidates = viewerRoots.flatMap((root) => [...root.querySelectorAll(actionSelector)]).filter(visible).filter((element) => downloadHint.test(descriptor(element)));',
    'const action = candidates.sort((left, right) => descriptor(left).length - descriptor(right).length)[0];',
    "if (!action) return { status: 'not_found' };",
    "action.scrollIntoView({ block: 'center', inline: 'nearest' });",
    'const rect = action.getBoundingClientRect();',
    "return { status: 'ready', x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };",
    '})()'
  ].join('\n');
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.result?.value ?? { status: 'not_found' };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '').trim()).digest('hex');
}

async function connectWebSocket(webSocketUrl) {
  const url = new URL(webSocketUrl);
  const socket = net.createConnection({ host: url.hostname, port: Number(url.port) });
  let buffer = Buffer.alloc(0);
  let handshakeComplete = false;
  const pending = new Map();
  let nextId = 1;

  const handshakeKey = crypto.randomBytes(16).toString('base64');
  const handshake = [
    `GET ${url.pathname} HTTP/1.1`,
    `Host: ${url.hostname}:${url.port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${handshakeKey}`,
    'Sec-WebSocket-Version: 13',
    '',
    ''
  ].join('\r\n');

  const parseFrames = () => {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const masked = (second & 0x80) !== 0;
      const frameEnd = offset + (masked ? 4 : 0) + length;
      if (buffer.length < frameEnd) return;

      let mask;
      if (masked) {
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      buffer = buffer.subarray(frameEnd);
      if ((first & 0x0f) === 8) continue;

      try {
        const message = JSON.parse(payload.toString('utf8'));
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          waiter.resolve(message);
        }
      } catch {
        // Ignore non-JSON protocol frames.
      }
    }
  };

  await new Promise((resolve, reject) => {
    socket.once('connect', () => socket.write(handshake));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!handshakeComplete) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headers = buffer.subarray(0, headerEnd).toString('utf8');
        if (!headers.includes('HTTP/1.1 101')) {
          reject(new Error(headers));
          return;
        }
        buffer = buffer.subarray(headerEnd + 4);
        handshakeComplete = true;
        resolve();
      }

      parseFrames();
    });
    socket.once('error', reject);
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    let timer;
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject
    });
    const payload = Buffer.from(JSON.stringify({ id, method, params }));
    const mask = crypto.randomBytes(4);
    const header = payload.length < 126
      ? Buffer.from([0x81, 0x80 | payload.length])
      : (() => {
          const extended = Buffer.alloc(4);
          extended[0] = 0x81;
          extended[1] = 0x80 | 126;
          extended.writeUInt16BE(payload.length, 2);
          return extended;
        })();

    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
    socket.write(Buffer.concat([header, mask, payload]));

    timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 10_000);
  });

  return { call, close: () => socket.end() };
}
