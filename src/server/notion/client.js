import { Client } from '@notionhq/client';
import { getNotionConfig } from './config.js';

export const NOTION_VERSION = '2026-03-11';
export const NOTION_TIMEOUT_MS = 10_000;

let defaultClient = null;

export function createNotionClient(config = getNotionConfig()) {
  return new Client({
    auth: config.token,
    notionVersion: NOTION_VERSION,
    timeoutMs: NOTION_TIMEOUT_MS
  });
}

export function getDefaultNotionClient() {
  if (!defaultClient) {
    defaultClient = createNotionClient();
  }

  return defaultClient;
}

export function resetDefaultNotionClientForTests() {
  defaultClient = null;
}
