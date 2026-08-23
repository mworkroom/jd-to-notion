import { google } from 'googleapis';
import {
  getGoogleSheetsConfig,
  GOOGLE_SHEETS_READONLY_SCOPE,
  GOOGLE_SHEETS_WRITE_SCOPE
} from './config.js';

export function createGoogleSheetsClient(config = getGoogleSheetsConfig()) {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.serviceAccountKeyPath,
    scopes: [GOOGLE_SHEETS_READONLY_SCOPE]
  });

  return google.sheets({
    version: 'v4',
    auth
  });
}

export function createGoogleSheetsWriteClient(config = getGoogleSheetsConfig()) {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.serviceAccountKeyPath,
    scopes: [GOOGLE_SHEETS_WRITE_SCOPE]
  });

  return google.sheets({
    version: 'v4',
    auth
  });
}
