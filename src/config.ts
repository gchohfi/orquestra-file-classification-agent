export const CLASSIFIER_VERSION = "file-classifier.v1";

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
