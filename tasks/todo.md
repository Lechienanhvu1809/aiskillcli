# Task List: ai-skill-cli Refactor

---

## Phase 1: Foundation & Tooling

- [x] Task 1: Migrate sang TypeScript + ESM
- [x] Task 2: Tạo `src/context.ts` và `src/policies/name-validation.ts`

### Checkpoint 1
- [x] Build pass, name validation có test pass

---

## Phase 2: Core Policies (Business Rules)

- [x] Task 3: Tạo `src/policies/skill-registry.ts`
- [x] Task 4: Tạo `src/policies/git-sync.ts`

### Checkpoint 2
- [x] Tất cả policies có unit test pass

---

## Phase 3: Commands (Presentation Layer)

- [x] Task 5: Tạo `src/utils/output.ts` và migrate commands: `list`, `get`, `search`
- [x] Task 6: Migrate commands: `add`, `remove`
- [x] Task 7: Migrate commands: `apply`, `run`, `init-sync`

### Checkpoint 3
- [x] Tất cả 8 commands hoạt động đúng, backward-compatible

---

## Phase 4: Entry Point & Wiring

- [x] Task 8: Viết `src/index.ts` — register tất cả commands vào commander

### Checkpoint Final
- [x] `npm run build` pass — dist/index.js 15.17 kB
- [x] `npm test` pass — 31/31 tests
- [x] Tất cả commands backward-compatible
- [x] Business Rules (policies) tách biệt hoàn toàn khỏi Presentation (commands)
