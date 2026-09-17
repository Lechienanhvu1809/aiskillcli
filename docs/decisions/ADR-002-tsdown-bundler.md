# ADR-002: Dùng tsdown thay vì tsc để build

## Status

Accepted

## Date

2026-09-03

## Context

Dự án cần bundler để compile TypeScript ESM và tạo một file `dist/index.js` duy nhất có thể chạy bằng `node`. `tsc` thuần không bundle dependencies, nên người dùng sẽ cần cài đặt `node_modules` sau khi nhận binary.

## Decision

Dùng **tsdown** (wrapper của rolldown) để bundle toàn bộ source và dependencies thành một file ESM duy nhất với shebang `#!/usr/bin/env node`.

## Alternatives Considered

### tsc thuần
- Pros: Không cần dependency build-time
- Cons: Không bundle — `dist/` cần kèm `node_modules` khi distribute
- **Rejected**

### esbuild
- Pros: Cực nhanh, phổ biến
- Cons: tsdown đã wrapping rolldown (nhanh hơn esbuild), API tương tự
- **Rejected**: tsdown là superset tốt hơn

### tsdown (lựa chọn hiện tại)
- Pros: Zero config, hỗ trợ TypeScript natively, rolldown engine nhanh, output bundle đơn
- Cons: Còn tương đối mới (~v0.12)
- **Accepted**

## Consequences

- Build output: `dist/index.js` 15.17 kB (gzip: 4.84 kB)
- Build time: ~20ms — cực nhanh cho local dev
- Người dùng có thể chạy `node dist/index.js` mà không cần `node_modules`
