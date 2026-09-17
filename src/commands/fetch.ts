import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import {
  FetchError,
  type RemoteSkillEntry,
  downloadSkill,
  fetchManifest,
  findSkillInManifest,
  findSkillsByBundle,
  listRemoteSkills,
} from "../policies/registry-fetcher.js";
import { skillExists, skillPath } from "../policies/skill-registry.js";
import { analyzeProject } from "../policies/project-analyzer.js";
import { c, fatal } from "../utils/output.js";

export interface FetchOptions {
  /** Bundle ID: e.g. "wshobson/agents" */
  from?: string;
  /** Tự động phân tích dự án và fetch skills phù hợp */
  auto?: boolean;
  /** Ghi đè skill đã có */
  force?: boolean;
  /** Chỉ hiển thị skills có sẵn, không tải */
  list?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printSkillEntry(entry: RemoteSkillEntry, installed: boolean): void {
  const status = installed ? c.ok("✓ installed") : c.dim("○ available");
  const desc = entry.description ? c.dim(` — ${entry.description}`) : "";
  console.log(`  ${status}  ${c.accent(entry.name)}${desc}`);
  console.log(`            ${c.dim(`source: ${entry.source}`)}`);
}

async function writeSkill(ctx: CliContext, entry: RemoteSkillEntry, force: boolean): Promise<boolean> {
  const exists = skillExists(ctx, entry.name);
  if (exists && !force) {
    console.log(
      `  ${c.warn("⚠")}  ${entry.name} ${c.dim("đã tồn tại — dùng --force để ghi đè")}`,
    );
    return false;
  }

  process.stdout.write(`  ${c.dim("↓")}  Đang tải ${c.accent(entry.name)}...`);
  const content = await downloadSkill(entry);
  fs.mkdirSync(path.dirname(skillPath(ctx, entry.name)), { recursive: true });
  fs.writeFileSync(skillPath(ctx, entry.name), content, "utf8");
  process.stdout.write(` ${c.ok("✓")}\n`);
  return true;
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function runFetch(
  ctx: CliContext,
  name: string | undefined,
  opts: FetchOptions = {},
): Promise<void> {
  // ── --list: show remote catalog ────────────────────────────────────────────
  if (opts.list) {
    console.log(`\n${c.bold("Skills trong autoskills registry:")}\n`);
    let manifest;
    try {
      manifest = await fetchManifest();
    } catch (err) {
      fatal(err instanceof FetchError ? err.message : String(err));
    }
    const entries = listRemoteSkills(manifest!);
    for (const e of entries) {
      printSkillEntry(e, skillExists(ctx, e.name));
    }
    console.log(`\n${c.dim(`Tổng: ${entries.length} skills`)}`);
    return;
  }

  // ── Fetch manifest ─────────────────────────────────────────────────────────
  console.log(`\n${c.dim("Đang kết nối autoskills registry...")}`);
  let manifest;
  try {
    manifest = await fetchManifest();
  } catch (err) {
    fatal(err instanceof FetchError ? err.message : String(err));
    return;
  }
  console.log(`${c.ok("✓")} Kết nối thành công (${Object.keys(manifest!.skills).length} skills có sẵn)\n`);

  // ── --auto: analyze project + pick matching skills ─────────────────────────
  if (opts.auto) {
    const profile = analyzeProject(process.cwd());
    const keywords = [
      profile.language,
      ...profile.frameworks,
      ...profile.tools,
    ].filter(Boolean);

    console.log(`${c.bold("Dự án hiện tại:")} ${profile.name} (${profile.language})`);
    console.log(`${c.dim("Tech stack:")} ${keywords.join(", ") || "unknown"}\n`);

    // Filter entries khớp với keywords
    const all = listRemoteSkills(manifest!);
    const matched = all.filter((e) => {
      const searchStr = `${e.name} ${e.description ?? ""} ${e.source}`.toLowerCase();
      return keywords.some((kw) => searchStr.includes(kw.toLowerCase()));
    });

    if (matched.length === 0) {
      console.log(c.dim("Không tìm thấy skill phù hợp với tech stack của dự án."));
      return;
    }

    console.log(`${c.bold(`Tìm thấy ${matched.length} skill phù hợp:`)}\n`);
    let installed = 0;
    for (const entry of matched) {
      const ok = await writeSkill(ctx, entry, opts.force ?? false);
      if (ok) installed++;
    }
    console.log(`\n${c.ok("✓")} Đã cài ${installed}/${matched.length} skills.`);
    return;
  }

  // ── --from <bundle>: fetch all skills from a bundle ────────────────────────
  if (opts.from) {
    const entries = findSkillsByBundle(manifest!, opts.from);
    if (entries.length === 0) {
      fatal(`Không tìm thấy bundle "${opts.from}" trong registry.`);
      return;
    }
    console.log(`${c.bold(`Bundle "${opts.from}":`)} ${entries.length} skills\n`);
    let installed = 0;
    for (const entry of entries) {
      const ok = await writeSkill(ctx, entry, opts.force ?? false);
      if (ok) installed++;
    }
    console.log(`\n${c.ok("✓")} Đã cài ${installed}/${entries.length} skills từ "${opts.from}".`);
    return;
  }

  // ── fetch <name>: fetch một skill cụ thể ────────────────────────────────────
  if (!name) {
    fatal("Cần truyền tên skill, --from <bundle>, hoặc --auto.\nVí dụ: ai-skills fetch bash-defensive-patterns");
    return;
  }

  const entry = findSkillInManifest(manifest!, name);
  if (!entry) {
    fatal(
      `Không tìm thấy skill "${name}" trong registry.\nChạy ${c.accent("ai-skills fetch --list")} để xem danh sách.`,
    );
    return;
  }

  const ok = await writeSkill(ctx, entry, opts.force ?? false);
  if (ok) {
    console.log(`\n${c.ok("✓")} Skill "${entry.name}" đã được thêm vào kho local.`);
    console.log(c.dim(`   Dùng ${c.accent(`ai-skills apply ${entry.name}`)} để nhúng vào dự án.`));
  }
}
