import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliContext } from "../../src/context.js";
import { initSync, syncPull, syncPush } from "../../src/policies/git-sync.js";

// Mock các module hệ thống
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

describe("Git Sync Policy", () => {
  let ctx: CliContext;

  beforeEach(() => {
    ctx = {
      skillsDir: "/mock/skills/dir",
      projectDir: "/mock/project",
      verbose: false,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("syncPull", () => {
    it("bỏ qua nếu không phải git repo", () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false); // isGitRepo
      syncPull(ctx);
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it("chạy git pull origin main --rebase thành công", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      syncPull(ctx);
      expect(execFileSync).toHaveBeenCalledWith("git", ["pull", "origin", "main", "--rebase"], expect.any(Object));
    });

    it("tự động gọi git rebase --abort nếu pull thất bại", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Lần gọi đầu tiên (pull) throw error
      vi.mocked(execFileSync).mockImplementationOnce((cmd, args) => {
        if (args && args[0] === "pull") {
          throw new Error("Merge conflict");
        }
        return Buffer.from("");
      });

      syncPull(ctx);

      // Sẽ catch lỗi pull và gọi rebase abort
      expect(execFileSync).toHaveBeenCalledWith("git", ["rebase", "--abort"], expect.any(Object));
    });
  });

  describe("syncPush", () => {
    it("bỏ qua nếu không phải git repo", () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      syncPush(ctx, "Commit msg");
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it("chạy git add, commit và push thành công", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      syncPush(ctx, "Auto commit");
      
      expect(execFileSync).toHaveBeenCalledTimes(3);
      expect(execFileSync).toHaveBeenNthCalledWith(1, "git", ["add", "*.md"], expect.any(Object));
      expect(execFileSync).toHaveBeenNthCalledWith(2, "git", ["commit", "-m", "Auto commit"], expect.any(Object));
      expect(execFileSync).toHaveBeenNthCalledWith(3, "git", ["push", "origin", "main"], expect.any(Object));
    });

    it("trả về false nếu commit không có thay đổi hoặc push thất bại", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error("Nothing to commit");
      });
      
      expect(syncPush(ctx, "Auto commit")).toBe(false);
    });
  });

  describe("initSync", () => {
    beforeEach(() => {
      // Giả sử skillsDir chưa tồn tại -> gọi mkdirSync
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === ctx.skillsDir) return false;
        if (typeof p === "string" && p.includes(".git")) return false; // chưa init git
        return false;
      });
    });

    it("thực hiện đầy đủ luồng thiết lập và đẩy lên remote", () => {
      const res = initSync(ctx, "https://example.com/repo.git");
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(ctx.skillsDir, { recursive: true });
      expect(execFileSync).toHaveBeenCalledWith("git", ["init"], expect.any(Object));
      expect(execFileSync).toHaveBeenCalledWith("git", ["commit", "--allow-empty", "-m", "Initial commit"], expect.any(Object));
      expect(execFileSync).toHaveBeenCalledWith("git", ["remote", "set-url", "origin", "https://example.com/repo.git"], expect.any(Object));
      expect(execFileSync).toHaveBeenCalledWith("git", ["branch", "-M", "main"], expect.any(Object));
      expect(execFileSync).toHaveBeenCalledWith("git", ["push", "-u", "origin", "main"], expect.any(Object));
      
      expect(res.ok).toBe(true);
      expect(res.message).toMatch(/Thiết lập Git Sync thành công/);
    });

    it("chặn lỗi danh tính git (Please tell me who you are)", () => {
      vi.mocked(execFileSync).mockImplementation((cmd, args) => {
        if (args && args[0] === "commit") {
          const err: any = new Error("Command failed");
          err.stderr = Buffer.from("Please tell me who you are");
          throw err;
        }
        return Buffer.from("");
      });

      const res = initSync(ctx, "https://example.com/repo.git");
      
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/Lỗi Git: Bạn chưa thiết lập danh tính Git/);
    });

    it("xử lý lỗi remote set-url bằng cách add origin nếu chưa có", () => {
      vi.mocked(execFileSync).mockImplementation((cmd, args) => {
        if (args && args[0] === "remote" && args[1] === "set-url") {
          throw new Error("No such remote");
        }
        return Buffer.from("");
      });

      const res = initSync(ctx, "https://example.com/repo.git");
      
      expect(execFileSync).toHaveBeenCalledWith("git", ["remote", "add", "origin", "https://example.com/repo.git"], expect.any(Object));
      expect(res.ok).toBe(true);
    });

    it("xử lý lỗi khi push bị từ chối", () => {
      vi.mocked(execFileSync).mockImplementation((cmd, args) => {
        if (args && args[0] === "push") {
          throw new Error("Push rejected");
        }
        return Buffer.from("");
      });

      const res = initSync(ctx, "https://example.com/repo.git");
      
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/Thiết lập thất bại \(push bị từ chối\)/);
    });
  });
});
