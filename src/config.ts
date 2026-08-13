export const CLASSIFIER_VERSION = "file-classifier.v1";
export const CLASSIFICATION_POLICY_VERSION = "classification-safety-policy.v2";

export const OPENAI_CLASSIFIER_MODEL = "gpt-5.6-sol" as const;
export const OPENAI_CLASSIFIER_REASONING_EFFORT = "high" as const;
export const OPENAI_CLASSIFIER_PROVIDER_ID = "openai.responses.gpt-5.6-sol.high.v1" as const;
export const OPENAI_CLASSIFIER_ENDPOINT_ORIGIN = "https://api.openai.com" as const;
export const OPENAI_CLASSIFIER_PROMPT_VERSION = "file-classification.prompt.v1" as const;
export const OPENAI_CLASSIFIER_SCHEMA_VERSION = "classification-proposal.v1" as const;
export const OPENAI_CLASSIFIER_TIMEOUT_MS = 5 * 60 * 1_000;
export const OPENAI_CLASSIFIER_MAX_INPUT_BYTES = 512 * 1_024;
export const OPENAI_CLASSIFIER_MAX_OUTPUT_TOKENS = 32_000;

export const DEFAULT_LIMITS = {
  maxBatchBytes: 100 * 1024 * 1024,
  maxFiles: 100,
  maxSheetsPerFile: 200,
  maxRowsPerSheet: 1_000_000,
  maxColumnsPerSheet: 2_000,
  maxCellCharacters: 100_000,
  maxZipEntries: 20_000,
  maxUncompressedBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 100,
} as const;

export type ClassifierLimits = typeof DEFAULT_LIMITS;
