import os from 'node:os';
import path from 'node:path';
import {
  getAdmissionsFilenamePrefix,
  readAdmissionsCycle
} from '../../shared/admissionsCycle.js';

export function readWordConfig(env = process.env) {
  const admissionsCycle = readAdmissionsCycle(env);
  const filenamePrefix = getAdmissionsFilenamePrefix(admissionsCycle);
  return {
    enabled: env.WORD_GENERATION_ENABLED === 'true',
    admissionsCycle,
    filenamePrefix,
    templatePath: env.WORD_TEMPLATE_PATH?.trim()
      || path.join(
        os.homedir(),
        'Documents',
        'Custom Office Templates',
        `${filenamePrefix} 자동생성용.docx`
      ),
    templateSha256: env.WORD_TEMPLATE_SHA256?.trim().toLowerCase() || '',
    outputDir: env.WORD_OUTPUT_DIR?.trim() || path.join(os.homedir(), 'Desktop')
  };
}
