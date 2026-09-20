import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";

/**
 * Business Rule: Git sync cho skill registry.
 * Transparent — lỗi git không làm crash CLI, chỉ silently fail.
 * Trả về boolean để caller biết có sync thành công không.
 */

function isGitRepo(ctx: CliContext): boolean {
  return fs.existsSync(path.join(ctx.skillsDir, ".git"));
}

function runGit(ctx: CliContext, args: string[]): boolean {
  try {
    if (!isGitRepo(ctx)) return false;
    execFileSync("git", args, { 
      cwd: ctx.skillsDir, 
      stdio: "ignore",
      timeout: 15000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    return true;
  } catch (err: any) {
    if (args.includes("--rebase")) {
      try {
        execFileSync("git", ["rebase", "--abort"], { cwd: ctx.skillsDir, stdio: "ignore" });
      } catch {}
    }
    return false;
  }
}

/** Pull về từ remote trước khi đọc */
export function syncPull(ctx: CliContext): boolean {
  return runGit(ctx, ["pull", "origin", "main", "--rebase"]);
}

/** Commit và push sau khi ghi */
export function syncPush(ctx: CliContext, message: string): boolean {
  const added = runGit(ctx, ["add", "*.md"]);
  const committed = runGit(ctx, ["commit", "-m", message]);
  const pushed = runGit(ctx, ["push", "origin", "main"]);
  return added && committed && pushed;
}

/** Khởi tạo git repo và link với remote */
export function initSync(ctx: CliContext, remoteUrl: string): { ok: boolean; message: string } {
  const safeUrl = remoteUrl.replace(/https?:\/\/[^@]+@/, "https://***@");
  try {
    if (!isGitRepo(ctx)) {
      execFileSync("git", ["init"], { cwd: ctx.skillsDir, stdio: "ignore" });
      try {
        execFileSync("git", ["commit", "--allow-empty", "-m", "Initial commit"], {
          cwd: ctx.skillsDir,
          stdio: "ignore",
        });
      } catch {
        // ignore
      }
    }

    try {
      execFileSync("git", ["remote", "set-url", "origin", remoteUrl], {
        cwd: ctx.skillsDir,
        stdio: "ignore",
      });
    } catch {
      try {
        execFileSync("git", ["remote", "add", "origin", remoteUrl], {
          cwd: ctx.skillsDir,
          stdio: "ignore",
        });
      } catch {}
    }

    execFileSync("git", ["branch", "-M", "main"], { cwd: ctx.skillsDir, stdio: "ignore" });

    try {
      execFileSync("git", ["push", "-u", "origin", "main"], {
        cwd: ctx.skillsDir,
        stdio: "ignore",
        timeout: 15000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
      });
      return { ok: true, message: `Thiết lập Git Sync thành công với remote: ${safeUrl}` };
    } catch {
      return {
        ok: false,
        message: `Thiết lập thất bại (push bị từ chối). Repo ${safeUrl} có thể đã chứa dữ liệu, hãy clone thủ công hoặc kiểm tra quyền truy cập.`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      message: `Lỗi khi thiết lập Git: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
