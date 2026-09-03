import path from "node:path";

/**
 * Business Rule: Validate và sanitize tên skill.
 * Chặn path traversal, ký tự đặc biệt, tên quá dài.
 * Trả về tên đã clean hoặc throw SkillValidationError.
 */

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}

const MAX_SKILL_NAME_LENGTH = 100;
// Chỉ cho phép: chữ cái, số, gạch ngang, gạch dưới
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate và normalize tên skill.
 * - Loại bỏ extension .md nếu có
 * - Reject path traversal (../ hoặc /)
 * - Reject ký tự đặc biệt
 * - Reject tên quá dài hoặc quá ngắn
 */
export function validateSkillName(rawName: string): string {
  if (!rawName || typeof rawName !== "string") {
    throw new SkillValidationError("Tên skill không được để trống.");
  }

  // Loại bỏ extension .md (vd: "my-skill.md" → "my-skill")
  const withoutExt = rawName.replace(/\.md$/i, "");

  // Reject nếu sau khi xử lý vẫn còn path separator
  if (withoutExt.includes("/") || withoutExt.includes("\\")) {
    throw new SkillValidationError(
      `Tên skill không được chứa dấu "/" hoặc "\\". Nhận được: "${rawName}"`,
    );
  }

  // Reject path traversal bằng cách kiểm tra basename
  const basename = path.basename(withoutExt);
  if (basename !== withoutExt) {
    throw new SkillValidationError(
      `Tên skill không hợp lệ (phát hiện path traversal): "${rawName}"`,
    );
  }

  // Reject tên quá ngắn
  if (basename.length === 0) {
    throw new SkillValidationError("Tên skill không được để trống sau khi xử lý.");
  }

  // Reject tên quá dài
  if (basename.length > MAX_SKILL_NAME_LENGTH) {
    throw new SkillValidationError(
      `Tên skill quá dài (tối đa ${MAX_SKILL_NAME_LENGTH} ký tự). Nhận được: ${basename.length} ký tự.`,
    );
  }

  // Reject ký tự đặc biệt — chỉ cho phép alphanumeric, gạch ngang, gạch dưới
  if (!VALID_NAME_PATTERN.test(basename)) {
    throw new SkillValidationError(
      `Tên skill chỉ được chứa chữ cái (a-z, A-Z), số (0-9), gạch ngang (-), gạch dưới (_). Nhận được: "${basename}"`,
    );
  }

  return basename;
}
