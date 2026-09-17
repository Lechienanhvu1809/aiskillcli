/**
 * Business Rule: Skill templates cho lệnh `create`.
 * Mỗi template tạo ra một file SKILL.md hoàn chỉnh với frontmatter YAML.
 * Không có side effects — chỉ trả về string content.
 */

export interface SkillTemplate {
  /** ID dùng trong CLI: --template=<id> */
  id: string;
  /** Tên hiển thị */
  label: string;
  /** Mô tả ngắn về template */
  description: string;
  /** Tạo nội dung SKILL.md từ tên và mô tả */
  generate(name: string, description: string, tags?: string[]): string;
}

function frontmatter(name: string, description: string, tags?: string[]): string {
  const tagsStr = tags && tags.length > 0 ? `\ntags: [${tags.join(", ")}]` : "";
  return `---\nname: ${name}\ndescription: ${description}${tagsStr}\n---`;
}

const codingGuide: SkillTemplate = {
  id: "coding-guide",
  label: "Coding Guide",
  description: "Hướng dẫn coding chuẩn — rules, examples, anti-patterns",
  generate(name, description, tags) {
    return `${frontmatter(name, description, tags)}

# ${name}

${description}

## When to Use

- Describe the situations where this skill should be activated.

## Rules

1. Rule one — explain clearly.
2. Rule two — provide rationale.
3. Rule three — include edge cases.

## Examples

### Good ✅

\`\`\`typescript
// Example of correct usage
\`\`\`

### Bad ❌

\`\`\`typescript
// Example of what to avoid
\`\`\`

## Anti-Patterns

- Describe common mistakes and why they are problematic.
`;
  },
};

const bashAutomation: SkillTemplate = {
  id: "bash-automation",
  label: "Bash Automation",
  description: "Script tự động hóa với bash hook có thể thực thi",
  generate(name, description, tags) {
    return `${frontmatter(name, description, tags)}

# ${name}

${description}

## Prerequisites

- List any tools or dependencies required.

## What This Does

Describe what the automation script accomplishes.

## Usage

Run this skill with:

\`\`\`
ai-skills run ${name}
\`\`\`

\`\`\`bash hook
#!/bin/bash
# ${description}
echo "Running ${name}..."

# Add your automation commands here

echo "Done!"
\`\`\`

## Notes

- Add any important notes or caveats here.
`;
  },
};

const checklist: SkillTemplate = {
  id: "checklist",
  label: "Checklist",
  description: "Danh sách kiểm tra — pre-launch, code review, deployment",
  generate(name, description, tags) {
    return `${frontmatter(name, description, tags)}

# ${name}

${description}

## Pre-Check

- [ ] Item one — verify before starting.
- [ ] Item two — confirm prerequisites.
- [ ] Item three — check dependencies.

## Main Checklist

- [ ] Step 1 — describe the action.
- [ ] Step 2 — describe the action.
- [ ] Step 3 — describe the action.
- [ ] Step 4 — describe the action.
- [ ] Step 5 — describe the action.

## Post-Check

- [ ] Verify the outcome.
- [ ] Document any issues found.
- [ ] Notify stakeholders if needed.

## Rollback Plan

If something goes wrong:

1. Step to revert changes.
2. Step to restore previous state.
3. Step to notify the team.
`;
  },
};

const blank: SkillTemplate = {
  id: "blank",
  label: "Blank",
  description: "Template trống — chỉ có frontmatter cơ bản",
  generate(name, description, tags) {
    return `${frontmatter(name, description, tags)}

# ${name}

${description}
`;
  },
};

/** Tất cả templates có sẵn, sắp xếp theo thứ tự ưu tiên */
export const TEMPLATES: readonly SkillTemplate[] = [codingGuide, bashAutomation, checklist, blank];

/** Tìm template theo ID. Trả về undefined nếu không tìm thấy. */
export function getTemplate(id: string): SkillTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Liệt kê tất cả template IDs */
export function listTemplates(): SkillTemplate[] {
  return [...TEMPLATES];
}

/** Template mặc định khi user không chỉ định */
export const DEFAULT_TEMPLATE_ID = "coding-guide";
