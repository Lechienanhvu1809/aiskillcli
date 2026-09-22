import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { listSkills } from "./skill-registry.js";
import pc from "picocolors";

export interface SkillAnalytics {
  usageCount: number;
  lastUsed: number; // timestamp
}

export type AnalyticsData = Record<string, SkillAnalytics>;

function getAnalyticsPath(ctx: CliContext): string {
  return path.join(ctx.skillsDir, "analytics.json");
}

export function readAnalytics(ctx: CliContext): AnalyticsData {
  const p = getAnalyticsPath(ctx);
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeAnalytics(ctx: CliContext, data: AnalyticsData): void {
  const p = getAnalyticsPath(ctx);
  if (!fs.existsSync(ctx.skillsDir)) {
    fs.mkdirSync(ctx.skillsDir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

export function trackUsage(ctx: CliContext, skillName: string): void {
  const data = readAnalytics(ctx);
  if (!data[skillName]) {
    data[skillName] = { usageCount: 0, lastUsed: 0 };
  }
  data[skillName].usageCount += 1;
  data[skillName].lastUsed = Date.now();
  writeAnalytics(ctx, data);
}

export function auditSkills(ctx: CliContext): void {
  const data = readAnalytics(ctx);
  const allSkills = listSkills(ctx).map(s => s.name);
  
  if (allSkills.length === 0) {
    console.log(pc.yellow("Kho kỹ năng trống."));
    return;
  }

  // Phân tích
  const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
  
  const unusedSkills: string[] = [];
  const topSkills = Object.entries(data)
    .sort((a, b) => b[1].usageCount - a[1].usageCount)
    .slice(0, 5);

  for (const skill of allSkills) {
    const stat = data[skill];
    if (!stat || stat.lastUsed < sixMonthsAgo) {
      unusedSkills.push(skill);
    }
  }

  // In Report
  console.log(pc.bold(pc.cyan("\n📊 BÁO CÁO SỬ DỤNG KỸ NĂNG (SKILL ANALYTICS)\n")));
  
  console.log(pc.bold("🔥 Top 5 Kỹ năng dùng nhiều nhất:"));
  if (topSkills.length > 0) {
    topSkills.forEach(([name, stat], idx) => {
      console.log(`  ${idx + 1}. ${pc.green(name)} (Dùng ${stat.usageCount} lần, Lần cuối: ${new Date(stat.lastUsed).toLocaleDateString()})`);
    });
  } else {
    console.log(pc.gray("  Chưa có dữ liệu sử dụng."));
  }

  console.log("\n" + pc.bold("⚠️  Các Kỹ năng có nguy cơ lỗi thời (Không dùng > 6 tháng hoặc chưa bao giờ dùng):"));
  if (unusedSkills.length > 0) {
    unusedSkills.forEach(name => {
      const stat = data[name];
      const detail = stat ? `(Lần cuối: ${new Date(stat.lastUsed).toLocaleDateString()})` : "(Chưa từng sử dụng)";
      console.log(`  - ${pc.yellow(name)} ${pc.gray(detail)}`);
    });
  } else {
    console.log(pc.green("  Tuyệt vời! Tất cả các kỹ năng đều được sử dụng thường xuyên."));
  }
  console.log();
}
