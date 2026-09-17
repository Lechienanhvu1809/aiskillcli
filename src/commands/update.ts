import type { CliContext } from "../context.js";
import { syncPull } from "../policies/git-sync.js";
import { handleError, info, success, warn } from "../utils/output.js";

export function runUpdate(ctx: CliContext): void {
  try {
    info("Đang cập nhật kỹ năng từ Cloud (Git)...");

    // We try to pull
    const ok = syncPull(ctx);

    if (ok) {
      success("Đã cập nhật kho kỹ năng thành công!");
    } else {
      warn(
        "Không thể cập nhật. Kho kỹ năng chưa được cấu hình Git (dùng lệnh init-sync) hoặc đang bị lỗi mạng/conflict.",
      );
    }
  } catch (err) {
    handleError(err);
  }
}
