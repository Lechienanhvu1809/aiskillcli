# Spec: ai-skill-cli — Chuyên nghiệp hóa theo Clean Architecture

## Objective

**Xây dựng lại `ai-skill-cli`** — một CLI tool quản lý kho kỹ năng (Skills) cho AI agent — từ kiến trúc monolith 1 file sang kiến trúc module hóa chuyên nghiệp, áp dụng Clean Architecture với Policy/Business Rule isolation.

**Người dùng mục tiêu:** Developer/AI Engineer sử dụng Antigravity IDE, muốn quản lý kỹ năng agent qua dòng lệnh.

**Trạng thái hiện tại:**
- 1 file `index.js` duy nhất (~275 dòng CommonJS)
- Không có kiểm tra input validation (name có thể là path traversal `../../etc/passwd`)
- Không có error boundary / exit code nhất quán
- Không có test
- Không phân tách Business Rule khỏi UI (console.log trộn lẫn với logic file I/O)
- Không có type safety (pure JS, không TS)

**Thành công có nghĩa là:**
- Mỗi command nằm trong file riêng, có thể unit test độc lập
- Business Rules (validation, policy) tách biệt hoàn toàn khỏi Presentation (console output)
- Đã có test suite chạy được
- `npm run build` và `npm test` pass
- CLI backward-compatible 100% (cùng command names, cùng behavior)

---

## Tech Stack

- **Language:** TypeScript (ESM, `"type": "module"`)
- **Runtime:** Node.js ≥ 18
- **CLI Framework:** `commander` v15 (đã có)
- **Output:** `picocolors` (màu sắc terminal nhẹ, không dependency)
- **Prompts:** `@clack/prompts` (UX đẹp, consistent với agentmemory)
- **Test Framework:** `vitest` (nhanh, ESM-native, tích hợp TypeScript)
- **Build:** `tsdown` (đã có pattern từ agentmemory)
- **Lint:** `biome` (đã có pattern từ agentmemory)

---

## Commands

```bash
# Development
npm run dev          # ts-node / tsx watch

# Build
npm run build        # tsdown → dist/

# Test
npm test             # vitest run
npm run test:watch   # vitest watch

# Lint
npm run lint         # biome check src/
npm run lint:fix     # biome check --write src/

# CLI (sau khi build)
node dist/index.js --help
```

---

## Project Structure

```text
ai-skill-cli/
├── src/
│   ├── index.ts                  # Entry point: khởi tạo program, register commands, parse()
│   ├── context.ts                # CliContext: config paths, environment constants
│   ├── policies/
│   │   ├── name-validation.ts    # Business Rule: validate/sanitize skill name
│   │   ├── skill-registry.ts     # Business Rule: CRUD logic cho skill file (pure I/O, no console)
│   │   └── git-sync.ts           # Business Rule: transparent git sync
│   ├── commands/
│   │   ├── init-sync.ts          # Presentation: lệnh init-sync
│   │   ├── list.ts               # Presentation: lệnh list
│   │   ├── get.ts                # Presentation: lệnh get
│   │   ├── add.ts                # Presentation: lệnh add
│   │   ├── remove.ts             # Presentation: lệnh remove
│   │   ├── search.ts             # Presentation: lệnh search
│   │   ├── apply.ts              # Presentation: lệnh apply
│   │   └── run.ts                # Presentation: lệnh run
│   └── utils/
│       └── output.ts             # Terminal output helpers (colors, formatting)
├── test/
│   ├── policies/
│   │   ├── name-validation.test.ts
│   │   └── skill-registry.test.ts
│   └── commands/
│       └── add.test.ts
├── tasks/
│   ├── plan.md                   # (file này)
│   └── todo.md                   # Task checklist
├── biome.json
├── package.json
└── tsconfig.json
```

---

## Code Style

```typescript
// Mỗi command handler nhận CliContext, không dùng global state
export async function runAdd(ctx: CliContext, name: string, filePath: string): Promise<void> {
  const validName = validateSkillName(name); // throws SkillValidationError nếu invalid
  await skillRegistry.add(ctx, validName, filePath); // pure I/O
  p.log.success(`Đã thêm kỹ năng "${validName}"`);
}

// Business Rules trả về Result, không throw đối với expected errors
export type SkillResult<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Quy ước:**
- `camelCase` cho function, variable
- `PascalCase` cho type/interface/class
- File name: `kebab-case.ts`
- Không dùng `any` — dùng `unknown` rồi narrow
- Mỗi Policy function: pure (không side-effect ngoài I/O file), có thể test

---

## Testing Strategy

- **Framework:** `vitest`
- **Test location:** `test/` mirror cấu trúc `src/`
- **Coverage target:** ≥ 80% cho `src/policies/`
- **Test levels:**
  - **Unit:** Policy functions (name-validation, skill-registry) — mock `fs`
  - **Integration:** Command handlers — dùng temp directory thật
- **Quy tắc:** Không test `console.log`. Test behavior (file được tạo/xóa/đọc đúng không).

---

## Boundaries

**Always do:**
- Validate và sanitize skill name trước khi dùng làm file path (chặn path traversal)
- Trả về exit code ≠ 0 khi có lỗi (dùng `process.exit(1)`)
- Dùng `CliContext` thay vì global variable
- Giữ backward compatibility với các commands hiện tại

**Ask first:**
- Thêm subcommand mới
- Thay đổi storage location (`~/.ai-skills`)
- Thêm external API dependency

**Never do:**
- `eval()` hay `execSync(script)` trực tiếp từ input user mà không sandbox (lỗ hổng RCE trong lệnh `run`)
- Log credential hoặc path tuyệt đối của user ra stdout mà không cần thiết
- Overwrite skill file mà không cảnh báo (silent overwrite)

---

## Success Criteria

- [ ] `npm run build` pass, tạo ra `dist/index.js` có thể chạy được
- [ ] `npm test` pass với ≥ 5 test cases
- [ ] `node dist/index.js list` hoạt động giống hệt hiện tại
- [ ] `node dist/index.js add myskill README.md` hoạt động đúng
- [ ] Tên skill có `../` bị từ chối với error message rõ ràng
- [ ] Mỗi command nằm trong file riêng (`src/commands/`)
- [ ] Policies không `import` bất kỳ thứ gì từ `commands/`

---

## Open Questions

> [!NOTE]
> Không có open questions. Business rules đã rõ ràng từ code hiện tại, tiến hành implement.
