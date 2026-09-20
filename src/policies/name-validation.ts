
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
// Cho phép: chữ cái (cả tiếng Việt/Unicode), số, gạch ngang, gạch dưới, khoảng trắng, và dấu chấm
const VALID_NAME_PATTERN = /^[\p{L}\p{N}_\-. ]+$/u;
// Các tên bị cấm trên Windows
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

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

  // Reject tên bị cấm trên Windows
  if (WINDOWS_RESERVED_NAMES.test(withoutExt)) {
    throw new SkillValidationError(
      `Tên skill "${rawName}" trùng với từ khóa hệ thống bị cấm trên Windows.`,
    );
  }

  // Reject tên quá ngắn
  if (withoutExt.length === 0) {
    throw new SkillValidationError("Tên skill không được để trống sau khi xử lý.");
  }

  // Reject tên quá dài
  if (withoutExt.length > MAX_SKILL_NAME_LENGTH) {
    throw new SkillValidationError(
      `Tên skill quá dài (tối đa ${MAX_SKILL_NAME_LENGTH} ký tự). Nhận được: ${withoutExt.length} ký tự.`,
    );
  }

  // Reject ký tự đặc biệt
  if (!VALID_NAME_PATTERN.test(withoutExt)) {
    throw new SkillValidationError(
      `Tên skill chỉ được chứa chữ cái, số, khoảng trắng, dấu chấm, gạch ngang (-) và gạch dưới (_). Nhận được: "${withoutExt}"`,
    );
  }

  return withoutExt;
}
