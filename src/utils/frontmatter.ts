/**
 * Utility: Parse YAML frontmatter đơn giản (không cần dependency).
 */

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: SkillFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const valueStr = line.slice(colonIdx + 1).trim();

      if (key === "tags") {
        // Parse array format like: [tag1, tag2] or just comma separated string
        let cleaned = valueStr;
        if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
          cleaned = cleaned.slice(1, -1);
        }
        result.tags = cleaned
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      } else {
        result[key] = valueStr;
      }
    }
  }
  return result;
}

/**
 * Thêm tags vào frontmatter của nội dung markdown.
 * Nếu chưa có frontmatter, sẽ tạo mới.
 * Nếu đã có tags, sẽ thay thế bằng tags mới.
 */
export function injectTags(content: string, tags: string[]): string {
  if (tags.length === 0) return content;

  const tagsStr = `tags: [${tags.join(", ")}]`;
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);

  if (match) {
    const frontmatterContent = match[1];
    // Xóa dòng tags cũ nếu có
    const lines = frontmatterContent.split("\n").filter((line) => !line.trim().startsWith("tags:"));
    lines.push(tagsStr);
    const newFrontmatter = `---\n${lines.join("\n")}\n---`;
    return content.replace(/^---\s*\n([\s\S]*?)\n---/, newFrontmatter);
  } else {
    // Không có frontmatter, thêm vào đầu file
    return `---\n${tagsStr}\n---\n\n${content}`;
  }
}

/**
 * Lấy danh sách tags hiện tại từ content.
 */
export function getTags(content: string): string[] {
  return parseFrontmatter(content).tags ?? [];
}

/**
 * Xóa một tag khỏi frontmatter.
 * Trả về content mới và boolean cho biết tag có tồn tại hay không.
 */
export function removeTag(content: string, tag: string): { content: string; removed: boolean } {
  const current = getTags(content);
  const lower = tag.toLowerCase();
  const next = current.filter((t) => t.toLowerCase() !== lower);
  if (next.length === current.length) return { content, removed: false };
  return { content: injectTags(content, next), removed: true };
}

/**
 * Đổi tên một tag trong frontmatter.
 * Trả về content mới và boolean cho biết tag có tồn tại hay không.
 */
export function renameTag(
  content: string,
  oldTag: string,
  newTag: string,
): { content: string; renamed: boolean } {
  const current = getTags(content);
  const lower = oldTag.toLowerCase();
  let renamed = false;
  const next = current.map((t) => {
    if (t.toLowerCase() === lower) {
      renamed = true;
      return newTag;
    }
    return t;
  });
  if (!renamed) return { content, renamed: false };
  return { content: injectTags(content, next), renamed: true };
}
