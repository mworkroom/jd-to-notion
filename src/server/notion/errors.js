export class NotionAppError extends Error {
  constructor({ code, message, statusCode = 500, details = {}, cause } = {}) {
    super(message ?? 'Notion request failed.', { cause });
    this.name = 'NotionAppError';
    this.code = code ?? 'NOTION_API_ERROR';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function mapNotionError(error, fallbackMessage = 'Notion request failed.') {
  if (error instanceof NotionAppError) {
    return error;
  }

  const status = Number(error?.status ?? error?.statusCode ?? 0);

  if (status === 401) {
    return new NotionAppError({
      code: 'NOTION_UNAUTHORIZED',
      statusCode: 401,
      message: 'Notion token is invalid or expired.',
      cause: error
    });
  }

  if (status === 403) {
    return new NotionAppError({
      code: 'NOTION_FORBIDDEN',
      statusCode: 403,
      message: 'The Notion connection does not have access to this data source.',
      cause: error
    });
  }

  if (status === 404) {
    return new NotionAppError({
      code: 'NOTION_NOT_FOUND',
      statusCode: 404,
      message: 'A Notion data source was not found. Check the data source ID and sharing settings.',
      cause: error
    });
  }

  if (status === 429) {
    return new NotionAppError({
      code: 'NOTION_RATE_LIMITED',
      statusCode: 429,
      message: 'Notion rate limited the request. Try again shortly.',
      cause: error
    });
  }

  return new NotionAppError({
    code: 'NOTION_API_ERROR',
    statusCode: 502,
    message: fallbackMessage,
    cause: error
  });
}

export function safeErrorPayload(error) {
  const appError = error instanceof NotionAppError
    ? error
    : new NotionAppError({
        code: 'NOTION_API_ERROR',
        statusCode: 500,
        message: error?.message || 'Unexpected server error.'
      });

  return {
    code: appError.code,
    message: appError.message,
    details: appError.details ?? {}
  };
}
