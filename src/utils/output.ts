import pc from "picocolors";

/** Các color helpers cho terminal output */
export const c = {
  ok: pc.green,
  warn: pc.yellow,
  err: pc.red,
  dim: pc.dim,
  bold: pc.bold,
  cmd: (s: string) => pc.bold(pc.cyan(s)),
  accent: (s: string) => pc.bold(pc.yellow(s)),
};

/** In thông báo lỗi và exit với code 1 */
export function fatal(message: string): never {
  console.error(`${c.err("✗")} ${message}`);
  process.exit(1);
}

/** In thông báo thành công */
export function success(message: string): void {
  console.log(`${c.ok("✓")} ${message}`);
}

/** In thông báo cảnh báo */
export function warn(message: string): void {
  console.warn(`${c.warn("⚠")} ${message}`);
}

/** In thông tin */
export function info(message: string): void {
  console.log(`${c.dim("ℹ")} ${message}`);
}

/** Handle SkillValidationError và SkillRegistryError, gọi fatal cho cả hai */
export function handleError(err: unknown): never {
  if (err instanceof Error) {
    fatal(err.message);
  }
  fatal(String(err));
}
