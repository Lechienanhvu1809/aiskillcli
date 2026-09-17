import type { CliContext } from "../context.js";
import { initSync } from "../policies/git-sync.js";
import { info, success, warn } from "../utils/output.js";

export function runInitSync(ctx: CliContext, url: string): void {
  info(`Đang thiết lập Git Sync với repo: ${url}...`);
  const result = initSync(ctx, url);
  if (result.ok) {
    success(result.message);
    info("Từ giờ mọi thay đổi sẽ tự động đồng bộ ngầm.");
  } else {
    warn(result.message);
  }
}
