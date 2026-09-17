<div align="center">

# 🧠 ai-skill-cli

**Thư viện kỹ năng cục bộ (Local AI Skill Registry) dành cho AI Agent**

[![CI](https://github.com/your-org/ai-skill-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ai-skill-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/ai-skill-cli)](https://www.npmjs.com/package/ai-skill-cli)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

Công cụ CLI để lưu trữ, tìm kiếm, và apply các file Markdown kỹ năng (SKILL.md) vào bất kỳ dự án nào. Được thiết kế để dùng kết hợp với AI coding agents như Antigravity, Claude Code, hay Cursor.

</div>

---

## ✨ Tính năng

- **📦 Kho kỹ năng cục bộ** — lưu trữ các file `SKILL.md` trong thư mục cấu hình của máy
- **🔍 Tìm kiếm toàn văn** — tìm skill theo tên hoặc nội dung
- **🧠 Tìm kiếm thông minh** — TF-IDF + fuzzy matching với `--semantic`
- **🎨 Tạo skill từ template** — 4 templates có sẵn (coding-guide, bash-automation, checklist, blank)
- **🎯 Gợi ý thông minh** — phân tích dự án và recommend skills phù hợp
- **🔗 Apply vào dự án** — tạo Symlink/Hardlink để skill luôn được cập nhật real-time
- **☁️ Git Sync** — đồng bộ kho kỹ năng lên GitHub để chia sẻ giữa các máy
- **🛡️ An toàn** — ngăn chặn Path Traversal, cảnh báo trước khi thực thi code

---

## 🚀 Khởi động nhanh

### Cài đặt

```bash
# Dùng trực tiếp từ thư mục dự án (sau khi build)
npm install && npm run build
node dist/index.js --help

# Hoặc link global (phát triển)
npm link
ai-skills --help
```

### Workflow điển hình

```bash
# 1. Thêm một kỹ năng vào kho từ file có sẵn
ai-skills add git-workflow ~/projects/skills/git-workflow.md

# 2. Tìm kiếm kỹ năng
ai-skills search "typescript"

# 3. Apply kỹ năng vào dự án hiện tại (tạo Symlink trong .agents/skills/)
cd ~/projects/my-app
ai-skills apply git-workflow

# 4. Đồng bộ lên GitHub (chỉ cần làm 1 lần)
ai-skills init-sync https://github.com/you/my-skills-repo.git
```

---

## 📖 Toàn bộ lệnh

| Lệnh | Mô tả |
|------|-------|
| `ai-skills list` | Liệt kê tất cả kỹ năng trong kho |
| `ai-skills get <tên>` | Hiển thị nội dung một kỹ năng |
| `ai-skills add <tên> <file>` | Thêm kỹ năng mới từ file Markdown |
| `ai-skills add <tên> <file> --force` | Ghi đè nếu kỹ năng đã tồn tại |
| `ai-skills remove <tên>` | Xóa kỹ năng khỏi kho |
| `ai-skills search <từ-khóa>` | Tìm kỹ năng theo tên hoặc nội dung |
| `ai-skills search <từ-khóa> --semantic` | Tìm kiếm thông minh với TF-IDF + fuzzy matching |
| `ai-skills create <tên>` | Tạo kỹ năng mới từ template |
| `ai-skills create --list-templates` | Liệt kê các template có sẵn |
| `ai-skills recommend` | Phân tích dự án và gợi ý kỹ năng phù hợp |
| `ai-skills recommend --dir <path>` | Phân tích thư mục dự án cụ thể |
| `ai-skills apply <tên>` | Nhúng kỹ năng vào dự án (Symlink) |
| `ai-skills run <tên>` | Thực thi khối `bash hook` trong Markdown ⚠️ |
| `ai-skills init-sync <url>` | Khởi tạo đồng bộ Git với remote repo |

---

## 🗂️ Kiến trúc dự án

```
src/
├── index.ts              # Entry point — đăng ký lệnh vào commander
├── context.ts            # CliContext — cấu hình và đường dẫn
├── policies/             # Business Rules (không có side effects)
│   ├── name-validation.ts  → Chặn path traversal, validate tên
│   ├── skill-registry.ts   → CRUD cho skill files
│   ├── git-sync.ts         → Đồng bộ Git an toàn
│   ├── text-search.ts      → TF-IDF search engine + fuzzy matching
│   ├── templates.ts        → Skill templates cho lệnh create
│   ├── project-analyzer.ts → Detect tech stack từ filesystem
│   └── recommender.ts      → Match skills ↔ project profile
├── commands/             # Presentation Layer — nhận input, gọi policies, in kết quả
│   ├── list.ts / get.ts / search.ts
│   ├── add.ts / remove.ts
│   ├── apply.ts / run.ts / init-sync.ts
│   ├── create.ts / recommend.ts
└── utils/
    └── output.ts         # Tiện ích màu sắc: success(), warn(), fatal()
```

Dự án tuân theo **Clean Architecture**: `commands/` chỉ xử lý giao diện CLI, toàn bộ logic nghiệp vụ nằm trong `policies/` và có thể được tái sử dụng như một thư viện độc lập.

Xem thêm tại: [`docs/decisions/`](docs/decisions/)

---

## 🛠️ Phát triển

```bash
# Cài đặt dependencies
npm install

# Build
npm run build

# Chạy test (87 tests)
npm test

# Xem test real-time
npm run test:watch

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

---

## 🔒 Bảo mật

- **Tên skill** được validate nghiêm ngặt: chỉ cho phép `[a-zA-Z0-9_-]`, tối đa 100 ký tự.
- **Path Traversal** bị chặn hoàn toàn (vd: `../etc/passwd` → lỗi ngay lập tức).
- **Lệnh `run`** thực thi code từ Markdown — luôn hiển thị cảnh báo trước khi chạy. Chỉ dùng với skill từ nguồn đáng tin cậy.
- **Git Sync** lỗi sẽ bị bỏ qua âm thầm — không bao giờ làm crash CLI.

---

## 📋 Cấu trúc SKILL.md

Mỗi file kỹ năng là một file Markdown bình thường. Bạn có thể thêm khối `bash hook` để kỹ năng có thể tự thực thi:

````markdown
---
name: my-skill
description: Mô tả ngắn về kỹ năng này.
---

# Kỹ năng của tôi

Nội dung kỹ năng...

```bash hook
# Đoạn script này sẽ chạy khi ai-skills run <tên> được gọi
echo "Đang cài đặt..."
npm install some-tool
```
````

---

## 📄 License

ISC — Xem [LICENSE](LICENSE) để biết thêm.
