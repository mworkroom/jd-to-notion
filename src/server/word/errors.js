export class WordGenerationError extends Error {
  constructor(code, message, { statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = 'WordGenerationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function safeWordError(error) {
  if (error instanceof WordGenerationError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  return {
    code: 'WORD_GENERATION_FAILED',
    message: 'Word 파일을 만들지 못했습니다.',
    details: {}
  };
}
