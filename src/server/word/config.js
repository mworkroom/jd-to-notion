import os from 'node:os';
import path from 'node:path';

const DEFAULT_TEMPLATE_NAME = '[2026입학요강] 자동생성용.docx';

export function readWordConfig(env = process.env) {
  return {
    enabled: env.WORD_GENERATION_ENABLED === 'true',
    templatePath: env.WORD_TEMPLATE_PATH?.trim()
      || path.join(
        os.homedir(),
        'Documents',
        'Custom Office Templates',
        DEFAULT_TEMPLATE_NAME
      ),
    templateSha256: env.WORD_TEMPLATE_SHA256?.trim().toLowerCase() || '',
    outputDir: env.WORD_OUTPUT_DIR?.trim() || path.join(os.homedir(), 'Desktop')
  };
}
