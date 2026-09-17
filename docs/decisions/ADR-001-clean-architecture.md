# ADR-001: Clean Architecture — Tách Policies khỏi Commands

## Status

Accepted

## Date

2026-09-03

## Context

File `src/cli.ts` ban đầu dài hơn 4.000 dòng, vi phạm nghiêm trọng nguyên tắc Single Responsibility (SRP). Logic nghiệp vụ (business rules), giao diện dòng lệnh (CLI presentation), và các tác vụ I/O được trộn lẫn trong một file duy nhất, gây ra:

- Khó test: Không thể viết unit test mà không cần mock toàn bộ CLI
- Khó mở rộng: Thêm bất kỳ rule nào cũng phải sửa file khổng lồ
- Nguy hiểm: Lỗi ở bất kỳ phần nào có thể gây ảnh hưởng không lường trước

## Decision

Tái cấu trúc codebase theo **Clean Architecture** với 3 tầng rõ ràng:

```
commands/  →  policies/  →  utils/
(CLI UI)     (Business)    (Shared)
```

**Quy tắc phụ thuộc (Dependency Rule):**
- `commands/` được phép import từ `policies/` và `utils/`
- `policies/` KHÔNG được phép import từ `commands/`
- `policies/` KHÔNG được phép gọi `console.log` (không có side effects)

**CliContext** được inject vào mọi function thay vì dùng global variables, để dễ test và dễ thay đổi cấu hình.

## Alternatives Considered

### Option A: Giữ nguyên monolithic `cli.ts`, chỉ thêm comments
- Pros: Không cần refactor
- Cons: Không giải quyết vấn đề testability, technical debt tiếp tục tăng
- **Rejected**: Chỉ là band-aid, không giải quyết gốc rễ

### Option B: Tách theo command (mỗi command 1 file duy nhất, bao gồm cả logic)
- Pros: Dễ tìm code hơn
- Cons: Duplicate business logic giữa các commands (ví dụ: validation chạy ở nhiều chỗ)
- **Rejected**: Vi phạm DRY, logic phân tán

### Option C: Clean Architecture (lựa chọn hiện tại)
- Pros: Policies có thể test độc lập, tái sử dụng như library, rõ ràng về ownership
- Cons: Thêm files và imports
- **Accepted**

## Consequences

- **Tốt**: 31 unit tests có thể kiểm tra policies mà không cần khởi động CLI
- **Tốt**: Thêm command mới chỉ cần tạo file trong `commands/`, không đụng `policies/`
- **Tốt**: Có thể publish `policies/` như một thư viện riêng trong tương lai
- **Trung tính**: Số lượng file tăng từ 1 lên ~12 file
- **Trung tính**: Developer cần hiểu cấu trúc thư mục trước khi đóng góp
