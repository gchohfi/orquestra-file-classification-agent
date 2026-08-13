import type { StructuredLogger } from "../../ports.js";

export class NullLogger implements StructuredLogger {
  public info(_event: string, _metadata: Record<string, string | number | boolean>): void {}
  public error(_event: string, _metadata: Record<string, string | number | boolean>): void {}
}
