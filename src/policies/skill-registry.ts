import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { injectTags, parseFrontmatter } from "../utils/frontmatter.js";
import { type ScoredResult, searchWithTfIdf } from "./text-search.js";
import { syncPush } from "./git-sync.js";
import { embedText, saveVector } from "./semantic-search.js";
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

/** Đọc skill và tự động đệ quy lấy các skill phụ thuộc (Knowledge Graph traversal) */
export function getSkillWithDependencies(
  ctx: CliContext,
  name: string,
  maxDepth: number = 2,
  visited: Set<string> = new Set()
): string {
  if (visited.has(name)) return ""; // Chống lặp vòng
  visited.add(name);

  const content = getSkill(ctx, name);
  const frontmatter = parseFrontmatter(content);

  let dependenciesContent = "";
  if (frontmatter.requires && frontmatter.requires.length > 0 && maxDepth > 0) {
    for (const dep of frontmatter.requires) {
      if (!visited.has(dep)) {
        try {
          const depContent = getSkillWithDependencies(ctx, dep, maxDepth - 1, visited);
          if (depContent) {
            dependenciesContent += `\n\n--- BẮT ĐẦU ĐIỀU KIỆN TIÊN QUYẾT: ${dep} ---\n${depContent}\n--- KẾT THÚC ĐIỀU KIỆN TIÊN QUYẾT: ${dep} ---\n\n`;
          }
        } catch {
          // Ignore missing dependencies
        }
      }
    }
  }

  // Gộp dependencies lên trên, skill chính nằm dưới
  return (dependenciesContent + content).trim();
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
      if (fs.existsSync(dest) && !opts.overwrite) {
        throw new SkillRegistryError(
          `Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`,
          "ALREADY_EXISTS",
        );
      }
      const content = fs.readFileSync(absoluteSource, "utf8");
      const updatedContent = injectTags(content, opts.tags);
      fs.writeFileSync(dest, updatedContent, "utf8");
    } else {
      const flags = opts.overwrite ? 0 : fs.constants.COPYFILE_EXCL;
      fs.copyFileSync(absoluteSource, dest, flags);
    }
  } catch (err: any) {
    if (err.code === "EEXIST") {
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

/** Xóa một skill */
export function removeSkill(ctx: CliContext, name: string): void {
  const p = skillPath(ctx, name);
  if (!fs.existsSync(p)) {
    throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
  }
  try {
    fs.unlinkSync(p);
  } catch (err) {
    throw new SkillRegistryError(
      `Lỗi khi xóa file: ${err instanceof Error ? err.message : String(err)}`,
      "IO_ERROR",
    );
  }
}

/** Tìm kiếm skills theo từ khóa */
export function searchSkills(ctx: CliContext, keyword: string, tag?: string): SearchResult[] {
  ensureSkillsDir(ctx);
  const lowerKw = keyword.toLowerCase();
  const lowerTag = tag?.toLowerCase();
  const files = fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
  const results: SearchResult[] = [];
  for (const file of files) {
    const name = file.replace(/\.md$/, "");
    const content = fs.readFileSync(path.join(ctx.skillsDir, file), "utf8");

    if (lowerTag) {
      const frontmatter = parseFrontmatter(content);
      const tags = (frontmatter.tags ?? []).map((t) => t.toLowerCase());
      if (!tags.includes(lowerTag)) continue;
    }

    const matchedInName = name.toLowerCase().includes(lowerKw);
    const matchedInContent = content.toLowerCase().includes(lowerKw);
    if (matchedInName || matchedInContent) {
      results.push({ name, matchedInName, matchedInContent });
    }
  }
  return results;
}

/** 
 * Lưu skill mới hoặc ghi đè, tự động cập nhật vector và push git 
 */
export async function saveSkill(ctx: CliContext, name: string, content: string): Promise<void> {
  ensureSkillsDir(ctx);
  const p = skillPath(ctx, name);
  fs.writeFileSync(p, content, "utf8");
  
  try {
    const vector = await embedText(content);
    saveVector(ctx, name, vector);
  } catch (err) {
    // Bỏ qua nếu lỗi embedding để không cản trở việc lưu skill
  }

  syncPush(ctx, `Auto-sync: Save skill ${name} via AI learning`);
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
