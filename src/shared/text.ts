const INSTRUCTION_PATTERNS = [
  /ignore\s+(todas?|as|qualquer|previous|all)/iu,
  /system\s+prompt/iu,
  /execute\s+(sql|javascript|codigo|código|comando)/iu,
  /revele?\s+(segredo|senha|token|credencial)/iu,
  /desconsidere\s+(as|todas?)\s+instru/iu,
  /tool\s*call/iu,
];

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function isInstructionLike(value: string): boolean {
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function isFormulaLikeText(value: string): boolean {
  const trimmed = value.trimStart();
  if (trimmed.startsWith("=") || trimmed.startsWith("@")) return true;
  if (trimmed.startsWith("+") || trimmed.startsWith("-")) {
    return !/^[+-]\d+(?:[.,]\d+)?$/u.test(trimmed);
  }
  return false;
}

export function periodicFamilyName(value: string): string {
  return normalizeHeader(value)
    .replace(
      /\b(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)(?:\s*(?:20)?\d{2})?\b/gu,
      " ",
    )
    .replace(/\b20\d{2}\b/gu, " ")
    .replace(/\b\d{1,2}\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
