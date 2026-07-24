import net from 'node:net';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { restoreLinkedUrls } from './jandi-message-text.mjs';

const endpoint = process.argv.find((argument) => argument.startsWith('http')) ?? 'http://127.0.0.1:9222';
const extractMode = process.argv.includes('--extract');
const mouseX = Number(process.argv.find((argument) => argument.startsWith('--x='))?.slice(4));
const mouseY = Number(process.argv.find((argument) => argument.startsWith('--y='))?.slice(4));
const outputPath = process.argv.find((argument) => argument.startsWith('--output='))?.slice(9);
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find((item) => item.type === 'page' && item.url?.includes('edmworks.jandi.com/app'));

if (!target) {
  throw new Error('JANDI main renderer target was not found.');
}

const client = await connectWebSocket(target.webSocketDebuggerUrl);
const restoreLinkedUrlsSource = restoreLinkedUrls.toString();
const expression = extractMode
  ? `(() => {
      const restoreLinkedUrls = ${restoreLinkedUrlsSource};
      const cards = [...document.querySelectorAll('.message.article._message')];
      const point = Number.isFinite(${mouseX}) && Number.isFinite(${mouseY})
        ? {
            x: (${mouseX} - window.screenX) * window.devicePixelRatio,
            y: (${mouseY} - window.screenY) * window.devicePixelRatio
          }
        : null;
      const card = (point
        ? cards.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
          })
        : null) ?? cards.find((candidate) => candidate.matches(':hover') || candidate.querySelector(':hover'));
      if (!card) return null;
      const writer = card.querySelector('.fn-user-name')?.textContent?.trim() ?? '';
      const date = card.querySelector('.article-date, .fn-write-time')?.textContent?.trim() ?? '';
      const body = card.querySelector('.article-body._messageBubbleTarget');
      const links = [...(body?.querySelectorAll('a[href]') ?? [])]
        .map((link) => ({ href: link.href, text: link.innerText ?? link.textContent ?? '' }));
      const text = restoreLinkedUrls(body?.innerText ?? '', links);
      return [writer, date, text].filter(Boolean).join('\\n');
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
  if (!value) process.exitCode = 2;
  else if (outputPath) writeFileSync(outputPath, value, 'utf8');
  else console.log(value);
} else {
  console.log(JSON.stringify(value ?? result, null, 2));
}
client.close();

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
