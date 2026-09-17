import os from "node:os";
import path from "node:path";

/** Thư mục lưu toàn bộ skill files (~/.ai-skills) */
export const SKILLS_DIR = path.join(os.homedir(), ".ai-skills");

/** Context được truyền xuống mọi command handler và policy function */
export interface CliContext {
  /** Thư mục gốc lưu skill files */
  skillsDir: string;
  /** Có phải đang chạy trong mode verbose không */
  verbose: boolean;
  /** Thư mục dự án hiện tại (dùng cho recommend, apply) */
  projectDir: string;
}

export function createCliContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    skillsDir: SKILLS_DIR,
    verbose: false,
    projectDir: process.cwd(),
    ...overrides,
  };
}
