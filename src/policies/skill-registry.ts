import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { injectTags, parseFrontmatter } from "../utils/frontmatter.js";
import { type ScoredResult, searchWithTfIdf } from "./text-search.js";

/**
 * Business Rule: CRUD operations cho skill registry.
 * Tất cả I/O file tập trung ở đây, không có console.log.
 * Các command handler gọi vào đây và tự xử lý output.
 */

export interface SkillInfo {
  name: string;
  path: string;
}

export interface SearchResult {
  name: string;
  matchedInName: boolean;
  matchedInContent: boolean;
}

export class SkillRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "ALREADY_EXISTS" | "IO_ERROR" | "SOURCE_NOT_FOUND",
  ) {
    super(message);
    this.name = "SkillRegistryError";
  }
}

/** Đảm bảo thư mục kho skill tồn tại */
export function ensureSkillsDir(ctx: CliContext): void {
  if (!fs.existsSync(ctx.skillsDir)) {
    fs.mkdirSync(ctx.skillsDir, { recursive: true });
  }
}

/** Lấy path của một skill file */
export function skillPath(ctx: CliContext, name: string): string {
  return path.join(ctx.skillsDir, `${name}.md`);
}

/** Kiểm tra skill có tồn tại không */
export function skillExists(ctx: CliContext, name: string): boolean {
  return fs.existsSync(skillPath(ctx, name));
}

/** Liệt kê tất cả skills */
export function listSkills(ctx: CliContext): SkillInfo[] {
  ensureSkillsDir(ctx);
  const files = fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => ({
    name: f.replace(/\.md$/, ""),
    path: path.join(ctx.skillsDir, f),
  }));
}

/** Đọc nội dung một skill */
export function getSkill(ctx: CliContext, name: string): string {
  const p = skillPath(ctx, name);
  if (!fs.existsSync(p)) {
    throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
  }
  const content = fs.readFileSync(p, "utf8");
  return content.replace(/\r\n?/g, "\n");
}

/** Thêm skill từ file có sẵn */
export function addSkill(
  ctx: CliContext,
  name: string,
  sourcePath: string,
  opts: { overwrite?: boolean; tags?: string[] } = {},
): void {
  ensureSkillsDir(ctx);
  const absoluteSource = path.resolve(process.cwd(), sourcePath);
  if (!fs.existsSync(absoluteSource)) {
    throw new SkillRegistryError(
      `Không tìm thấy file nguồn tại "${absoluteSource}".`,
      "SOURCE_NOT_FOUND",
    );
  }
  const dest = skillPath(ctx, name);

  try {
    if (opts.tags && opts.tags.length > 0) {
      const content = fs.readFileSync(absoluteSource, "utf8");
      const updatedContent = injectTags(content, opts.tags);

      const flag = opts.overwrite ? "w" : "wx";
      const fd = fs.openSync(dest, flag);
      fs.writeSync(fd, updatedContent);
      fs.closeSync(fd);
    } else {
      const flags = opts.overwrite ? 0 : fs.constants.COPYFILE_EXCL;
      fs.copyFileSync(absoluteSource, dest, flags);
    }
  } catch (err: unknown) {
    const execErr = err as { code?: string };
    if (execErr.code === "EEXIST") {
      throw new SkillRegistryError(
        `Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`,
        "ALREADY_EXISTS",
      );
    }
    throw new SkillRegistryError(
      `Lỗi khi sao chép file: ${err instanceof Error ? err.message : String(err)}`,
      "IO_ERROR",
    );
  }
}

/** Tìm kiếm thông minh với TF-IDF + fuzzy matching */
export function searchSkillsSemantic(ctx: CliContext, query: string, tag?: string): ScoredResult[] {
  ensureSkillsDir(ctx);
  const lowerTag = tag?.toLowerCase();
  const files = fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
  const docs = new Map<string, string>();
  for (const file of files) {
    const name = file.replace(/\.md$/, "");
    const content = fs.readFileSync(path.join(ctx.skillsDir, file), "utf8");

    if (lowerTag) {
      const frontmatter = parseFrontmatter(content);
      const tags = (frontmatter.tags ?? []).map((t) => t.toLowerCase());
      if (!tags.includes(lowerTag)) continue;
    }

    docs.set(name, content);
  }
  return searchWithTfIdf(docs, query);
}

/**
 * Lấy nội dung của một skill kèm theo nội dung các skill phụ thuộc (requires)
 */
export function getSkillWithDependencies(ctx: CliContext, name: string, maxDepth = 2): string {
  const visited = new Set<string>();
  const output: string[] = [];

  function fetchRecursive(currentName: string, depth: number) {
    if (visited.has(currentName) || depth > maxDepth) return;
    visited.add(currentName);

    try {
      const content = getSkill(ctx, currentName);

      output.push(`\n<!-- ===== BẮT ĐẦU SKILL: ${currentName} ===== -->\n`);
      output.push(content);
      output.push(`\n<!-- ===== KẾT THÚC SKILL: ${currentName} ===== -->\n`);

      const fm = parseFrontmatter(content);
      const reqs = fm.requires || [];
      if (Array.isArray(reqs)) {
        for (const req of reqs) {
          fetchRecursive(req, depth + 1);
        }
      }
    } catch (e: unknown) {
      if (depth === 0) {
        throw e;
      }
      const errMsg = e instanceof Error ? e.message : String(e);
      output.push(`\n<!-- [LỖI] Không thể lấy phụ thuộc: ${currentName} (${errMsg}) -->\n`);
    }
  }

  fetchRecursive(name, 0);
  return output.join("").trim();
}

/**
 * Lưu trực tiếp nội dung string vào file skill
 */
export async function saveSkill(ctx: CliContext, name: string, content: string): Promise<void> {
  ensureSkillsDir(ctx);
  const dest = skillPath(ctx, name);
  await fs.promises.writeFile(dest, content, "utf8");
}
