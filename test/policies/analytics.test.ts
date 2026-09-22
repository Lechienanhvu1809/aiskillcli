import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliContext } from "../../src/context.js";
import { readAnalytics, trackUsage, writeAnalytics, auditSkills } from "../../src/policies/analytics.js";
import * as registry from "../../src/policies/skill-registry.js";
import pc from "picocolors";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
}));

vi.mock("../../src/policies/skill-registry.js", () => ({
  listSkills: vi.fn(),
}));

describe("Analytics Policy", () => {
  let ctx: CliContext;
  let consoleSpy: any;

  beforeEach(() => {
    ctx = {
      skillsDir: "/mock/skills",
      projectDir: "/mock/project",
      verbose: false,
    };
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("readAnalytics", () => {
    it("trả về object rỗng nếu file không tồn tại", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(readAnalytics(ctx)).toEqual({});
    });

    it("đọc và parse file thành công", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const data = { "test-skill": { usageCount: 5, lastUsed: 12345 } };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));
      expect(readAnalytics(ctx)).toEqual(data);
    });

    it("trả về object rỗng nếu JSON lỗi", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error("JSON error"); });
      expect(readAnalytics(ctx)).toEqual({});
    });
  });

  describe("writeAnalytics", () => {
    it("tạo thư mục và ghi file nếu chưa có", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // cho skillsDir
      writeAnalytics(ctx, { "test": { usageCount: 1, lastUsed: 1 } });
      expect(fs.mkdirSync).toHaveBeenCalledWith("/mock/skills", { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("trackUsage", () => {
    it("tăng count và cập nhật thời gian cho skill đã có", () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === path.join(ctx.skillsDir, "analytics.json"));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        "my-skill": { usageCount: 1, lastUsed: 100 }
      }));
      
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      trackUsage(ctx, "my-skill");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(ctx.skillsDir, "analytics.json"),
        expect.stringContaining('"usageCount": 2'),
        "utf-8"
      );

      vi.useRealTimers();
    });

    it("tạo mới entry nếu skill chưa từng dùng", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      trackUsage(ctx, "new-skill");
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(ctx.skillsDir, "analytics.json"),
        expect.stringContaining('"usageCount": 1'),
        "utf-8"
      );
    });
  });

  describe("auditSkills", () => {
    it("báo kho trống nếu không có skill nào", () => {
      vi.mocked(registry.listSkills).mockReturnValue([]);
      auditSkills(ctx);
      expect(consoleSpy).toHaveBeenCalledWith(pc.yellow("Kho kỹ năng trống."));
    });

    it("in ra báo cáo phân tích bình thường", () => {
      vi.mocked(registry.listSkills).mockReturnValue([
        { name: "skill-1", path: "" },
        { name: "skill-2", path: "" },
        { name: "skill-3", path: "" }
      ]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const now = Date.now();
      const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        "skill-1": { usageCount: 100, lastUsed: now }, // Rất hay dùng
        "skill-2": { usageCount: 1, lastUsed: now - sixMonths - 1000 }, // Cũ
        // skill-3 không có trong db (chưa dùng)
      }));

      auditSkills(ctx);

      // Sẽ có thông báo báo cáo
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("BÁO CÁO SỬ DỤNG KỸ NĂNG"));
      // Top 5 sẽ có skill-1
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("skill-1"));
      // Danh sách lỗi thời sẽ có skill-2 và skill-3
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("skill-2"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("skill-3"));
    });

    it("in ra báo cáo tốt khi mọi kỹ năng đều được dùng", () => {
      vi.mocked(registry.listSkills).mockReturnValue([{ name: "skill-1", path: "" }]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        "skill-1": { usageCount: 100, lastUsed: Date.now() },
      }));

      auditSkills(ctx);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Tuyệt vời! Tất cả các kỹ năng đều được sử dụng thường xuyên."));
    });
  });
});
