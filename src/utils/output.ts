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

/** Gợi ý hành động dựa trên error code */
const ERROR_HINTS: Record<string, string> = {
  NOT_FOUND: "Kiểm tra tên skill bằng: ai-skills list",
  ALREADY_EXISTS: "Dùng --force để ghi đè",
  SOURCE_NOT_FOUND: "Kiểm tra đường dẫn file nguồn",
  IO_ERROR: "Kiểm tra quyền truy cập thư mục ~/.ai-skills",
  INVALID_BUNDLE: "Đảm bảo file là định dạng JSON hợp lệ từ ai-skills export",
  UNSUPPORTED_VERSION: "Cập nhật ai-skill-cli: npm update -g ai-skill-cli",
  NETWORK_ERROR: "Kiểm tra kết nối mạng và thử lại",
  HASH_MISMATCH: "Nội dung từ registry có thể đã bị thay đổi — liên hệ maintainer",
  INVALID_MANIFEST: "Registry manifest không hợp lệ — thử lại sau",
};

/** Handle SkillValidationError, SkillRegistryError, FetchError, BundleError — gọi fatal với hint */
export function handleError(err: unknown): never {
  if (err instanceof Error) {
    const code = (err as any).code as string | undefined;
    const hint = code ? ERROR_HINTS[code] : undefined;
    if (hint) {
      fatal(`${err.message}\n  ${c.dim(`💡 ${hint}`)}`);
    }
    fatal(err.message);
  }
  fatal(String(err));
}
