import fs from "node:fs";
import type { CliContext } from "../context.js";
import { ensureSkillsDir, getSkill, skillExists, skillPath } from "./skill-registry.js";

/**
 * Business Rule: Export/Import bundles.
 */

export interface BundleSkill {
  name: string;
  content: string;
}

export interface SkillBundle {
  version: number;
  type: "ai-skills-bundle";
  skills: BundleSkill[];
}

export class BundleError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_BUNDLE" | "UNSUPPORTED_VERSION" | "IO_ERROR",
  ) {
    super(message);
    this.name = "BundleError";
  }
}

/**
 * Export a list of skill names into a JSON bundle string.
 */
export function exportBundle(ctx: CliContext, skillNames: string[]): string {
  const skills: BundleSkill[] = [];

  for (const name of skillNames) {
    if (!skillExists(ctx, name)) {
      throw new BundleError(`Không tìm thấy skill "${name}" để export.`, "INVALID_BUNDLE");
    }
    const content = getSkill(ctx, name);
    skills.push({ name, content });
  }

  const bundle: SkillBundle = {
    version: 1,
    type: "ai-skills-bundle",
    skills,
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Parse a JSON string into a SkillBundle, validating its format.
 */
export function parseBundle(jsonString: string): SkillBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new BundleError("File bundle không hợp lệ (lỗi cú pháp JSON).", "INVALID_BUNDLE");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).type !== "ai-skills-bundle" ||
    typeof (parsed as Record<string, unknown>).version !== "number" ||
    !Array.isArray((parsed as Record<string, unknown>).skills)
  ) {
    throw new BundleError(
      "File bundle thiếu các trường bắt buộc (type, version, skills).",
      "INVALID_BUNDLE",
    );
  }

  const bundle = parsed as SkillBundle;
  if (bundle.version > 1) {
    throw new BundleError(
      `Bundle version ${bundle.version} chưa được hỗ trợ.`,
      "UNSUPPORTED_VERSION",
    );
  }

  for (const skill of bundle.skills) {
    if (typeof skill.name !== "string" || typeof skill.content !== "string") {
      throw new BundleError("Định dạng của một skill trong bundle không hợp lệ.", "INVALID_BUNDLE");
    }
  }

  return bundle;
}

/**
 * Import skills from a SkillBundle into the local registry.
 * Trả về danh sách tên các skills đã được import thành công.
 */
export function importBundle(
  ctx: CliContext,
  bundle: SkillBundle,
  opts: { force?: boolean } = {},
): { imported: string[]; skipped: string[] } {
  ensureSkillsDir(ctx);

  const imported: string[] = [];
  const skipped: string[] = [];

  for (const skill of bundle.skills) {
    if (skillExists(ctx, skill.name) && !opts.force) {
      skipped.push(skill.name);
      continue;
    }

    try {
      fs.writeFileSync(skillPath(ctx, skill.name), skill.content, "utf8");
      imported.push(skill.name);
    } catch (err) {
      throw new BundleError(
        `Lỗi khi ghi skill "${skill.name}": ${err instanceof Error ? err.message : String(err)}`,
        "IO_ERROR",
      );
    }
  }

  return { imported, skipped };
}
