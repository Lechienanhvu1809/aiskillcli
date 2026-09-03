import path from "node:path";
import os from "node:os";

/** Thư mục lưu toàn bộ skill files (~/.ai-skills) */
export const SKILLS_DIR = path.join(os.homedir(), ".ai-skills");

/** Context được truyền xuống mọi command handler và policy function */
export interface CliContext {
  /** Thư mục gốc lưu skill files */
  skillsDir: string;
  /** Có phải đang chạy trong mode verbose không */
  verbose: boolean;
}

export function createCliContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    skillsDir: SKILLS_DIR,
    verbose: false,
    ...overrides,
  };
}
