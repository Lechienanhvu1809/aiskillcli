# Changelog

Tất cả các thay đổi đáng kể đối với dự án này sẽ được ghi lại tại đây.

Định dạng tuân theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] — 2026-09-17

### Added
- **Command `fetch`**: Kéo skill từ autoskills online registry về local store
  - `ai-skills fetch <name>` — tải 1 skill theo tên
  - `ai-skills fetch --from <bundle>` — tải toàn bộ skills từ 1 bundle (vd: `wshobson/agents`)
  - `ai-skills fetch --auto` — tự động phân tích dự án và fetch skills phù hợp
  - `ai-skills fetch --list` — xem danh sách skills có sẵn mà không tải
  - `ai-skills fetch --force` — ghi đè skill đã tồn tại
- **Command `tag`**: Quản lý tags của skills đầy đủ
  - `ai-skills tag add <skill> <tag...>` — thêm 1 hoặc nhiều tags (có deduplication case-insensitive)
  - `ai-skills tag remove <skill> <tag>` — xóa 1 tag
  - `ai-skills tag list` — liệt kê tất cả tags kèm danh sách skills thuộc về
  - `ai-skills tag rename <old> <new>` — đổi tên tag trên toàn bộ kho
- **`policies/registry-fetcher.ts`**: Fetch + verify SHA-256, parse manifest, tìm kiếm theo tên/bundle, download skill content — zero external dependencies
- **`utils/frontmatter.ts`**: Bổ sung `getTags()`, `removeTag()`, `renameTag()` cho Tag Management
- **35 tests mới** — tổng cộng 130 tests (registry-fetcher: 18, tag commands: 17)

---

## [1.1.0] — 2026-09-16


### Added
- **Command `create`**: Tạo kỹ năng mới từ 4 templates có sẵn (coding-guide, bash-automation, checklist, blank)
- **Command `recommend`**: Phân tích dự án (ngôn ngữ, frameworks, tools, tests, CI/CD, Docker) và gợi ý kỹ năng phù hợp
- **`policies/text-search.ts`**: TF-IDF search engine zero-dependency — hỗ trợ exact match, fuzzy match (Levenshtein), TF-IDF scoring, snippet extraction
- **`policies/templates.ts`**: 4 skill templates với YAML frontmatter generation
- **`policies/project-analyzer.ts`**: Detect tech stack từ package.json và filesystem — nhận diện 30+ frameworks/tools
- **`policies/recommender.ts`**: Scoring engine so khớp skill content với project profile, xếp hạng confidence (★★★/★★☆/★☆☆)
- **`--semantic` flag** cho lệnh `search` — kích hoạt TF-IDF + fuzzy matching thay vì brute-force
- **56 tests mới** — tổng cộng 87 tests (templates, text-search, project-analyzer, recommender)

### Changed
- **Biome config**: Migrate schema 2.0.0 → 2.5.12 (`organizeImports` → `assist.actions.source`)
- **Import ordering**: Auto-fix toàn bộ source files theo chuẩn Biome mới

---

## [1.0.0] — 2026-09-03

### Added
- **Clean Architecture refactor**: Tách biệt hoàn toàn `commands/` (Presentation) và `policies/` (Business Rules)
- **CliContext**: Dependency injection thay thế global variables — không còn state chia sẻ ngầm
- **`policies/name-validation.ts`**: Validate tên skill nghiêm ngặt — chặn path traversal, ký tự đặc biệt, tên quá dài
- **`policies/skill-registry.ts`**: Pure I/O CRUD (list, get, add, remove, search) không có side effects
- **`policies/git-sync.ts`**: Git sync an toàn — lỗi network/git không làm crash CLI
- **`utils/output.ts`**: Tiện ích màu sắc và format output chuẩn hóa (`success`, `warn`, `fatal`, `info`)
- **Command `apply`**: Nhúng skill vào dự án theo thứ tự ưu tiên Symlink → Hardlink → Copy
- **Command `run`**: Thực thi `bash hook` từ Markdown với cảnh báo bảo mật rõ ràng
- **Command `init-sync`**: Khởi tạo Git Sync với remote repository
- **TypeScript**: Toàn bộ codebase được viết bằng TypeScript strict, 0 lỗi `tsc --noEmit`
- **Test suite**: 31 unit tests (Vitest) bao phủ tất cả policies — `name-validation` và `skill-registry`
- **CI/CD**: GitHub Actions pipeline với các quality gates: type-check, test, build, security audit

### Changed
- **Build tool**: Chuyển sang `tsdown` với output ESM, bundle size 15.17 kB
- **Entry point**: `src/index.ts` chỉ còn là router thuần túy đăng ký lệnh vào `commander`

### Removed
- `@clack/prompts`: Loại bỏ dependency không dùng đến

---

## [0.1.0] — 2026-09-01 (Legacy)

- Phiên bản prototype ban đầu — monolithic JavaScript với `index.js` duy nhất
