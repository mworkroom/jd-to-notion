export class GoogleSheetsAppError extends Error {
  constructor({ code, message, statusCode = 500, details = {}, cause } = {}) {
    super(message ?? 'Google Sheets request failed.', { cause });
    this.name = 'GoogleSheetsAppError';
    this.code = code ?? 'GOOGLE_SHEETS_API_ERROR';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function mapGoogleSheetsError(error) {
  if (error instanceof GoogleSheetsAppError) {
    return error;
  }

  const status = Number(error?.response?.status ?? error?.status ?? error?.code ?? 0);

  if (status === 401) {
    return new GoogleSheetsAppError({
      code: 'GOOGLE_SHEETS_UNAUTHORIZED',
      statusCode: 401,
      message: 'Google service-account credentials are invalid.',
      cause: error
    });
  }

  if (status === 403) {
    return new GoogleSheetsAppError({
      code: 'GOOGLE_SHEETS_FORBIDDEN',
      statusCode: 403,
      message: 'The Google service account cannot access this spreadsheet.',
      cause: error
    });
  }

  if (status === 404) {
    return new GoogleSheetsAppError({
      code: 'GOOGLE_SPREADSHEET_NOT_FOUND',
      statusCode: 404,
      message: 'The configured Google spreadsheet was not found.',
      cause: error
    });
  }

  if (status === 429) {
    return new GoogleSheetsAppError({
      code: 'GOOGLE_SHEETS_RATE_LIMITED',
      statusCode: 429,
      message: 'Google Sheets temporarily rate limited the request.',
      cause: error
    });
  }

  return new GoogleSheetsAppError({
    code: 'GOOGLE_SHEETS_API_ERROR',
    statusCode: 502,
    message: 'Google Sheets connection check failed.',
    cause: error
  });
}

export function safeGoogleSheetsError(error) {
  const appError = mapGoogleSheetsError(error);
  return {
    code: appError.code,
    message: appError.message,
    details: appError.details ?? {}
  };
}
