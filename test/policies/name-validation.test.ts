import { describe, it, expect } from "vitest";
import { validateSkillName, SkillValidationError } from "../../src/policies/name-validation.js";

describe("validateSkillName", () => {
  // --- Happy path ---
  it("chấp nhận tên hợp lệ đơn giản", () => {
    expect(validateSkillName("my-skill")).toBe("my-skill");
  });

  it("chấp nhận tên có gạch dưới", () => {
    expect(validateSkillName("my_skill_v2")).toBe("my_skill_v2");
  });

  it("chấp nhận tên với số", () => {
    expect(validateSkillName("skill123")).toBe("skill123");
  });

  it("loại bỏ extension .md", () => {
    expect(validateSkillName("my-skill.md")).toBe("my-skill");
  });

  it("loại bỏ extension .MD (case insensitive)", () => {
    expect(validateSkillName("my-skill.MD")).toBe("my-skill");
  });

  // --- Security: Path traversal ---
  it("từ chối path traversal với ../", () => {
    expect(() => validateSkillName("../etc/passwd")).toThrow(SkillValidationError);
  });

  it("từ chối path có dấu /", () => {
    expect(() => validateSkillName("skills/hack")).toThrow(SkillValidationError);
  });

  it("từ chối path có dấu \\", () => {
    expect(() => validateSkillName("skills\\hack")).toThrow(SkillValidationError);
  });

  it("từ chối ../../secret", () => {
    expect(() => validateSkillName("../../secret")).toThrow(SkillValidationError);
  });

  // --- Validation rules ---
  it("từ chối tên rỗng", () => {
    expect(() => validateSkillName("")).toThrow(SkillValidationError);
  });

  it("từ chối tên chỉ là .md", () => {
    expect(() => validateSkillName(".md")).toThrow(SkillValidationError);
  });

  it("từ chối tên có ký tự đặc biệt (dấu cách)", () => {
    expect(() => validateSkillName("my skill")).toThrow(SkillValidationError);
  });

  it("từ chối tên có ký tự đặc biệt (!)", () => {
    expect(() => validateSkillName("skill!")).toThrow(SkillValidationError);
  });

  it("từ chối tên quá dài (> 100 ký tự)", () => {
    const longName = "a".repeat(101);
    expect(() => validateSkillName(longName)).toThrow(SkillValidationError);
  });

  it("chấp nhận tên đúng 100 ký tự", () => {
    const maxName = "a".repeat(100);
    expect(validateSkillName(maxName)).toBe(maxName);
  });
});
