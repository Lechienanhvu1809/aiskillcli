#!/usr/bin/env node
import { C as syncPush, S as syncPull, _ as injectTags, a as ensureSkillsDir, b as renameTag, c as listSkills, d as searchSkills, f as searchSkillsSemantic, g as getTags, i as addSkill, l as removeSkill, m as skillPath, n as createCliContext, o as getSkill, p as skillExists, r as analyzeProject, t as CLI_VERSION, v as parseFrontmatter, x as initSync, y as removeTag } from "./version-Dvmk0_Df.js";
import { program } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import crypto from "node:crypto";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
//#region src/policies/name-validation.ts
/**
* Business Rule: Validate và sanitize tên skill.
* Chặn path traversal, ký tự đặc biệt, tên quá dài.
* Trả về tên đã clean hoặc throw SkillValidationError.
*/
var SkillValidationError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "SkillValidationError";
	}
};
const MAX_SKILL_NAME_LENGTH = 100;
const VALID_NAME_PATTERN = /^[\p{L}\p{N}_\-. ]+$/u;
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
/**
* Validate và normalize tên skill.
* - Loại bỏ extension .md nếu có
* - Reject path traversal (../ hoặc /)
* - Reject ký tự đặc biệt
* - Reject tên quá dài hoặc quá ngắn
*/
function validateSkillName(rawName) {
	if (!rawName || typeof rawName !== "string") throw new SkillValidationError("Tên skill không được để trống.");
	const withoutExt = rawName.replace(/\.md$/i, "");
	if (withoutExt.includes("/") || withoutExt.includes("\\")) throw new SkillValidationError(`Tên skill không được chứa dấu "/" hoặc "\\". Nhận được: "${rawName}"`);
	if (WINDOWS_RESERVED_NAMES.test(withoutExt)) throw new SkillValidationError(`Tên skill "${rawName}" trùng với từ khóa hệ thống bị cấm trên Windows.`);
	if (withoutExt.length === 0) throw new SkillValidationError("Tên skill không được để trống sau khi xử lý.");
	if (withoutExt.length > MAX_SKILL_NAME_LENGTH) throw new SkillValidationError(`Tên skill quá dài (tối đa ${MAX_SKILL_NAME_LENGTH} ký tự). Nhận được: ${withoutExt.length} ký tự.`);
	if (!VALID_NAME_PATTERN.test(withoutExt)) throw new SkillValidationError(`Tên skill chỉ được chứa chữ cái, số, khoảng trắng, dấu chấm, gạch ngang (-) và gạch dưới (_). Nhận được: "${withoutExt}"`);
	return withoutExt;
}
//#endregion
//#region src/utils/output.ts
/** Các color helpers cho terminal output */
const c = {
	ok: pc.green,
	warn: pc.yellow,
	err: pc.red,
	dim: pc.dim,
	bold: pc.bold,
	cmd: (s) => pc.bold(pc.cyan(s)),
	accent: (s) => pc.bold(pc.yellow(s))
};
/** In thông báo lỗi và exit với code 1 */
function fatal(message) {
	console.error(`${c.err("✗")} ${message}`);
	process.exit(1);
}
/** In thông báo thành công */
function success(message) {
	console.log(`${c.ok("✓")} ${message}`);
}
/** In thông báo cảnh báo */
function warn(message) {
	console.warn(`${c.warn("⚠")} ${message}`);
}
/** In thông tin */
function info(message) {
	console.log(`${c.dim("ℹ")} ${message}`);
}
/** Gợi ý hành động dựa trên error code */
const ERROR_HINTS = {
	NOT_FOUND: "Kiểm tra tên skill bằng: ai-skills list",
	ALREADY_EXISTS: "Dùng --force để ghi đè",
	SOURCE_NOT_FOUND: "Kiểm tra đường dẫn file nguồn",
	IO_ERROR: "Kiểm tra quyền truy cập thư mục ~/.ai-skills",
	INVALID_BUNDLE: "Đảm bảo file là định dạng JSON hợp lệ từ ai-skills export",
	UNSUPPORTED_VERSION: "Cập nhật ai-skill-cli: npm update -g ai-skill-cli",
	NETWORK_ERROR: "Kiểm tra kết nối mạng và thử lại",
	HASH_MISMATCH: "Nội dung từ registry có thể đã bị thay đổi — liên hệ maintainer",
	INVALID_MANIFEST: "Registry manifest không hợp lệ — thử lại sau"
};
/** Handle SkillValidationError, SkillRegistryError, FetchError, BundleError — gọi fatal với hint */
function handleError(err) {
	if (err instanceof Error) {
		const code = err.code;
		const hint = code ? ERROR_HINTS[code] : void 0;
		if (hint) fatal(`${err.message}\n  ${c.dim(`💡 ${hint}`)}`);
		fatal(err.message);
	}
	fatal(String(err));
}
//#endregion
//#region src/commands/add.ts
function runAdd(ctx, rawName, filePath, opts) {
	try {
		const name = validateSkillName(rawName);
		if (!opts.noSync) syncPull(ctx);
		if (skillExists(ctx, name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (skillExists(ctx, name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		addSkill(ctx, name, filePath, {
			overwrite: opts.force,
			tags: opts.tags
		});
		success(`Đã thêm kỹ năng "${name}" vào kho lưu trữ!`);
		if (!opts.noSync) syncPush(ctx, `Auto-sync: Add skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/analytics.ts
function getAnalyticsPath(ctx) {
	return path.join(ctx.skillsDir, "analytics.json");
}
function readAnalytics(ctx) {
	const p = getAnalyticsPath(ctx);
	if (!fs.existsSync(p)) return {};
	try {
		const raw = fs.readFileSync(p, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
function writeAnalytics(ctx, data) {
	const p = getAnalyticsPath(ctx);
	if (!fs.existsSync(ctx.skillsDir)) fs.mkdirSync(ctx.skillsDir, { recursive: true });
	fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}
function trackUsage(ctx, skillName) {
	const data = readAnalytics(ctx);
	if (!data[skillName]) data[skillName] = {
		usageCount: 0,
		lastUsed: 0
	};
	data[skillName].usageCount += 1;
	data[skillName].lastUsed = Date.now();
	writeAnalytics(ctx, data);
}
function auditSkills(ctx) {
	const data = readAnalytics(ctx);
	const allSkills = listSkills(ctx).map((s) => s.name);
	if (allSkills.length === 0) {
		console.log(pc.yellow("Kho kỹ năng trống."));
		return;
	}
	const sixMonthsAgo = Date.now() - 15552e6;
	const unusedSkills = [];
	const topSkills = Object.entries(data).sort((a, b) => b[1].usageCount - a[1].usageCount).slice(0, 5);
	for (const skill of allSkills) {
		const stat = data[skill];
		if (!stat || stat.lastUsed < sixMonthsAgo) unusedSkills.push(skill);
	}
	console.log(pc.bold(pc.cyan("\n📊 BÁO CÁO SỬ DỤNG KỸ NĂNG (SKILL ANALYTICS)\n")));
	console.log(pc.bold("🔥 Top 5 Kỹ năng dùng nhiều nhất:"));
	if (topSkills.length > 0) topSkills.forEach(([name, stat], idx) => {
		console.log(`  ${idx + 1}. ${pc.green(name)} (Dùng ${stat.usageCount} lần, Lần cuối: ${new Date(stat.lastUsed).toLocaleDateString()})`);
	});
	else console.log(pc.gray("  Chưa có dữ liệu sử dụng."));
	console.log("\n" + pc.bold("⚠️  Các Kỹ năng có nguy cơ lỗi thời (Không dùng > 6 tháng hoặc chưa bao giờ dùng):"));
	if (unusedSkills.length > 0) unusedSkills.forEach((name) => {
		const stat = data[name];
		const detail = stat ? `(Lần cuối: ${new Date(stat.lastUsed).toLocaleDateString()})` : "(Chưa từng sử dụng)";
		console.log(`  - ${pc.yellow(name)} ${pc.gray(detail)}`);
	});
	else console.log(pc.green("  Tuyệt vời! Tất cả các kỹ năng đều được sử dụng thường xuyên."));
	console.log();
}
//#endregion
//#region src/commands/apply.ts
function runApply(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		const sourcePath = skillPath(ctx, name);
		if (!fs.existsSync(sourcePath)) handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}" trong kho tổng.`));
		const targetDir = path.join(process.cwd(), ".agents", "skills", name);
		const targetPath = path.join(targetDir, "SKILL.md");
		fs.mkdirSync(targetDir, { recursive: true });
		fs.rmSync(targetPath, { force: true });
		let method = "Copy";
		try {
			fs.symlinkSync(sourcePath, targetPath, "file");
			method = "Symlink";
		} catch {
			fs.copyFileSync(sourcePath, targetPath);
			method = "Copy";
		}
		trackUsage(ctx, name);
		success(`Đã apply kỹ năng "${name}" vào dự án! (phương thức: ${method})`);
		if (method === "Copy") info("Lưu ý: Bạn đang dùng Copy, file này sẽ không tự cập nhật khi kho tổng thay đổi. Cần apply lại nếu muốn cập nhật.");
		info(`Đường dẫn: .agents/skills/${name}/SKILL.md`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/audit.ts
function runAudit(ctx) {
	try {
		auditSkills(ctx);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/templates.ts
function frontmatter(name, description, tags) {
	return `---\nname: ${name}\ndescription: ${description}${tags && tags.length > 0 ? `\ntags: [${tags.join(", ")}]` : ""}\n---`;
}
/** Tất cả templates có sẵn, sắp xếp theo thứ tự ưu tiên */
const TEMPLATES = [
	{
		id: "coding-guide",
		label: "Coding Guide",
		description: "Hướng dẫn coding chuẩn — rules, examples, anti-patterns",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}

## When to Use

- Describe the situations where this skill should be activated.

## Rules

1. Rule one — explain clearly.
2. Rule two — provide rationale.
3. Rule three — include edge cases.

## Examples

### Good ✅

\`\`\`typescript
// Example of correct usage
\`\`\`

### Bad ❌

\`\`\`typescript
// Example of what to avoid
\`\`\`

## Anti-Patterns

- Describe common mistakes and why they are problematic.
`;
		}
	},
	{
		id: "bash-automation",
		label: "Bash Automation",
		description: "Script tự động hóa với bash hook có thể thực thi",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}

## Prerequisites

- List any tools or dependencies required.

## What This Does

Describe what the automation script accomplishes.

## Usage

Run this skill with:

\`\`\`
ai-skills run ${name}
\`\`\`

\`\`\`bash hook
#!/bin/bash
# ${description}
echo "Running ${name}..."

# Add your automation commands here

echo "Done!"
\`\`\`

## Notes

- Add any important notes or caveats here.
`;
		}
	},
	{
		id: "checklist",
		label: "Checklist",
		description: "Danh sách kiểm tra — pre-launch, code review, deployment",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}

## Pre-Check

- [ ] Item one — verify before starting.
- [ ] Item two — confirm prerequisites.
- [ ] Item three — check dependencies.

## Main Checklist

- [ ] Step 1 — describe the action.
- [ ] Step 2 — describe the action.
- [ ] Step 3 — describe the action.
- [ ] Step 4 — describe the action.
- [ ] Step 5 — describe the action.

## Post-Check

- [ ] Verify the outcome.
- [ ] Document any issues found.
- [ ] Notify stakeholders if needed.

## Rollback Plan

If something goes wrong:

1. Step to revert changes.
2. Step to restore previous state.
3. Step to notify the team.
`;
		}
	},
	{
		id: "blank",
		label: "Blank",
		description: "Template trống — chỉ có frontmatter cơ bản",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}
`;
		}
	}
];
/** Tìm template theo ID. Trả về undefined nếu không tìm thấy. */
function getTemplate(id) {
	return TEMPLATES.find((t) => t.id === id);
}
/** Liệt kê tất cả template IDs */
function listTemplates() {
	return [...TEMPLATES];
}
//#endregion
//#region src/commands/create.ts
function runCreate(ctx, rawName, opts) {
	try {
		if (opts.listTemplates) {
			const templates = listTemplates();
			console.log(c.bold(`Templates có sẵn (${templates.length}):\n`));
			for (const t of templates) {
				const isDefault = t.id === "coding-guide" ? c.dim(" (mặc định)") : "";
				console.log(`  ${c.ok("•")} ${c.accent(t.id)}${isDefault}`);
				console.log(`    ${c.dim(t.description)}`);
			}
			return;
		}
		if (!rawName) handleError(/* @__PURE__ */ new Error("Vui lòng cung cấp tên skill. Ví dụ: ai-skills create my-skill"));
		const name = validateSkillName(rawName);
		if (skillExists(ctx, name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (skillExists(ctx, name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		const templateId = opts.template ?? "coding-guide";
		const template = getTemplate(templateId);
		if (!template) {
			const available = listTemplates().map((t) => t.id).join(", ");
			handleError(/* @__PURE__ */ new Error(`Template "${templateId}" không tồn tại. Các template có sẵn: ${available}`));
		}
		const description = opts.description ?? `Kỹ năng ${name}`;
		const content = template.generate(name, description, opts.tags);
		ensureSkillsDir(ctx);
		fs.writeFileSync(skillPath(ctx, name), content, "utf8");
		success(`Đã tạo kỹ năng "${name}" từ template "${template.id}"!`);
		info(`Đường dẫn: ${skillPath(ctx, name)}`);
		info(`Chỉnh sửa file và thêm nội dung phù hợp với dự án của bạn.`);
		syncPush(ctx, `Auto-sync: Create skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/diff.ts
var DiffError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "DiffError";
	}
};
/**
* Generate a visual text diff between two contents using `git diff --no-index`.
* Throws DiffError if git is not available or execution fails.
*/
function generateDiff(skillName, contentOld, contentNew) {
	if (contentOld === contentNew) return `Kỹ năng "${skillName}" không có thay đổi nào.`;
	const tmpDir = os.tmpdir();
	const sessionId = crypto.randomBytes(8).toString("hex");
	const fileA = path.join(tmpDir, `${skillName}_old_${sessionId}.md`);
	const fileB = path.join(tmpDir, `${skillName}_new_${sessionId}.md`);
	try {
		fs.writeFileSync(fileA, contentOld, "utf8");
		fs.writeFileSync(fileB, contentNew, "utf8");
		try {
			execSync(`git diff --no-index --color=always "${fileA}" "${fileB}"`, {
				encoding: "utf8",
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			return "";
		} catch (err) {
			if (err.status === 1 && err.stdout) {
				let diffStr = err.stdout;
				diffStr = diffStr.replace(new RegExp(`a/${fileA.replace(/\\/g, "/")}`, "g"), `a/${skillName}.md (current)`);
				diffStr = diffStr.replace(new RegExp(`b/${fileB.replace(/\\/g, "/")}`, "g"), `b/${skillName}.md (incoming)`);
				diffStr = diffStr.replace(new RegExp(`--- a/.*${skillName}_old.*\\.md`), `--- a/${skillName}.md (current)`);
				diffStr = diffStr.replace(new RegExp(`\\+\\+\\+ b/.*${skillName}_new.*\\.md`), `+++ b/${skillName}.md (incoming)`);
				return diffStr;
			}
			throw new DiffError(`Không thể chạy lệnh git diff. Vui lòng đảm bảo Git đã được cài đặt: ${err.message}`);
		}
	} finally {
		if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
		if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
	}
}
//#endregion
//#region src/commands/diff.ts
function runDiff(ctx, name, filePath) {
	try {
		if (!skillExists(ctx, name)) fatal(`Không tìm thấy kỹ năng "${name}" trong kho lưu trữ.`);
		const absolutePath = path.resolve(process.cwd(), filePath);
		if (!fs.existsSync(absolutePath)) fatal(`Không tìm thấy file "${filePath}" để so sánh.`);
		const diffOutput = generateDiff(name, getSkill(ctx, name), fs.readFileSync(absolutePath, "utf8"));
		if (diffOutput) console.log(diffOutput);
		else console.log(`Kỹ năng "${name}" không có thay đổi nào so với file "${filePath}".`);
	} catch (err) {
		if (err instanceof DiffError) fatal(err.message);
		handleError(err);
	}
}
//#endregion
//#region src/policies/bundle.ts
var BundleError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "BundleError";
	}
};
/**
* Export a list of skill names into a JSON bundle string.
*/
function exportBundle(ctx, skillNames) {
	const skills = [];
	for (const name of skillNames) {
		if (!skillExists(ctx, name)) throw new BundleError(`Không tìm thấy skill "${name}" để export.`, "INVALID_BUNDLE");
		const content = getSkill(ctx, name);
		skills.push({
			name,
			content
		});
	}
	return JSON.stringify({
		version: 1,
		type: "ai-skills-bundle",
		skills
	}, null, 2);
}
/**
* Parse a JSON string into a SkillBundle, validating its format.
*/
function parseBundle(jsonString) {
	let parsed;
	try {
		parsed = JSON.parse(jsonString);
	} catch {
		throw new BundleError("File bundle không hợp lệ (lỗi cú pháp JSON).", "INVALID_BUNDLE");
	}
	if (typeof parsed !== "object" || parsed === null || parsed.type !== "ai-skills-bundle" || typeof parsed.version !== "number" || !Array.isArray(parsed.skills)) throw new BundleError("File bundle thiếu các trường bắt buộc (type, version, skills).", "INVALID_BUNDLE");
	const bundle = parsed;
	if (bundle.version > 1) throw new BundleError(`Bundle version ${bundle.version} chưa được hỗ trợ.`, "UNSUPPORTED_VERSION");
	for (const skill of bundle.skills) if (typeof skill.name !== "string" || typeof skill.content !== "string") throw new BundleError("Định dạng của một skill trong bundle không hợp lệ.", "INVALID_BUNDLE");
	return bundle;
}
/**
* Import skills from a SkillBundle into the local registry.
* Trả về danh sách tên các skills đã được import thành công.
*/
function importBundle(ctx, bundle, opts = {}) {
	ensureSkillsDir(ctx);
	const imported = [];
	const skipped = [];
	for (const skill of bundle.skills) {
		if (skillExists(ctx, skill.name) && !opts.force) {
			skipped.push(skill.name);
			continue;
		}
		try {
			fs.writeFileSync(skillPath(ctx, skill.name), skill.content, "utf8");
			imported.push(skill.name);
		} catch (err) {
			throw new BundleError(`Lỗi khi ghi skill "${skill.name}": ${err instanceof Error ? err.message : String(err)}`, "IO_ERROR");
		}
	}
	return {
		imported,
		skipped
	};
}
//#endregion
//#region src/commands/export.ts
function runExport(ctx, outputFile, skills, opts) {
	try {
		const allSkills = listSkills(ctx);
		let toExport = [];
		if (opts.all) toExport = allSkills.map((s) => s.name);
		else if (opts.tag) {
			const lowerTag = opts.tag.toLowerCase();
			for (const skill of allSkills) {
				const content = fs.readFileSync(skill.path, "utf8");
				if ((parseFrontmatter(content).tags ?? []).map((t) => t.toLowerCase()).includes(lowerTag)) toExport.push(skill.name);
			}
		} else toExport = skills;
		if (opts.withDeps) {
			const visited = /* @__PURE__ */ new Set();
			function addDeps(name) {
				if (visited.has(name)) return;
				visited.add(name);
				try {
					const content = fs.readFileSync(path.join(ctx.skillsDir, `${name}.md`), "utf8");
					const frontmatter = parseFrontmatter(content);
					if (frontmatter.requires && Array.isArray(frontmatter.requires)) for (const req of frontmatter.requires) addDeps(req);
				} catch {}
			}
			for (const s of toExport) addDeps(s);
			toExport = Array.from(visited);
		}
		if (toExport.length === 0) {
			warn("Không có skill nào để export.");
			return;
		}
		info(`Đang đóng gói ${toExport.length} skills...`);
		const bundleStr = exportBundle(ctx, toExport);
		const outputPath = path.resolve(process.cwd(), outputFile);
		fs.writeFileSync(outputPath, bundleStr, "utf8");
		success(`Đã export ${toExport.length} skills ra file "${outputFile}".`);
	} catch (err) {
		if (err instanceof BundleError) fatal(err.message);
		handleError(err);
	}
}
//#endregion
//#region src/policies/registry-fetcher.ts
const MANIFEST_URL = `https://registry.autoskills.sh/manifest.json`;
var FetchError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "FetchError";
	}
};
/** Verify SHA-256 của một string content */
function verifySha256(content, expectedHash) {
	return crypto.createHash("sha256").update(content, "utf8").digest("hex") === expectedHash;
}
/** Parse và validate manifest JSON */
function parseManifest(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new FetchError("Manifest không hợp lệ (JSON parse lỗi).", "INVALID_MANIFEST");
	}
	if (typeof parsed !== "object" || parsed === null || typeof parsed.version !== "number" || typeof parsed.skills !== "object") throw new FetchError("Manifest thiếu trường bắt buộc (version, skills).", "INVALID_MANIFEST");
	const manifest = parsed;
	if (manifest.version > 2) throw new FetchError(`Manifest version ${manifest.version} chưa được hỗ trợ. Hãy cập nhật ai-skill-cli.`, "UNSUPPORTED_VERSION");
	return manifest;
}
/**
* Fetch và parse manifest từ registry.
* Có thể truyền custom manifestUrl để test.
*/
async function fetchManifest(manifestUrl = MANIFEST_URL) {
	let raw;
	try {
		const res = await fetch(manifestUrl);
		if (!res.ok) throw new FetchError(`Lỗi kết nối registry (HTTP ${res.status}): ${manifestUrl}`, "NETWORK_ERROR");
		raw = await res.text();
	} catch (err) {
		if (err instanceof FetchError) throw err;
		throw new FetchError(`Không thể kết nối registry: ${err instanceof Error ? err.message : String(err)}`, "NETWORK_ERROR");
	}
	return parseManifest(raw);
}
/**
* Tìm một skill entry trong manifest theo tên (case-insensitive).
*/
function findSkillInManifest(manifest, name) {
	const lower = name.toLowerCase();
	if (manifest.skills[name]) return manifest.skills[name];
	return Object.values(manifest.skills).find((s) => s.name.toLowerCase() === lower);
}
/**
* Tìm tất cả skills thuộc một bundle (source).
*/
function findSkillsByBundle(manifest, bundleId) {
	const lower = bundleId.toLowerCase();
	return Object.values(manifest.skills).filter((s) => s.source.toLowerCase() === lower);
}
/**
* Download content của một skill, verify hash.
* Throws FetchError nếu network lỗi hoặc hash không khớp.
*/
async function downloadSkill(entry) {
	let content;
	try {
		const res = await fetch(entry.url);
		if (!res.ok) throw new FetchError(`Không thể tải skill "${entry.name}" (HTTP ${res.status})`, "NETWORK_ERROR");
		content = await res.text();
	} catch (err) {
		if (err instanceof FetchError) throw err;
		throw new FetchError(`Lỗi network khi tải "${entry.name}": ${err instanceof Error ? err.message : String(err)}`, "NETWORK_ERROR");
	}
	if (!verifySha256(content, entry.hash)) throw new FetchError(`Hash mismatch cho skill "${entry.name}" — nội dung có thể đã bị thay đổi.`, "HASH_MISMATCH");
	return content;
}
/**
* Liệt kê tất cả skills trong manifest, sorted theo name.
*/
function listRemoteSkills(manifest) {
	return Object.values(manifest.skills).sort((a, b) => a.name.localeCompare(b.name));
}
//#endregion
//#region src/commands/fetch.ts
function printSkillEntry(entry, installed) {
	const status = installed ? c.ok("✓ installed") : c.dim("○ available");
	const desc = entry.description ? c.dim(` — ${entry.description}`) : "";
	console.log(`  ${status}  ${c.accent(entry.name)}${desc}`);
	console.log(`            ${c.dim(`source: ${entry.source}`)}`);
}
async function writeSkill(ctx, entry, opts) {
	const exists = skillExists(ctx, entry.name);
	if (exists && opts.diff) {
		const currentContent = getSkill(ctx, entry.name);
		process.stdout.write(`  ${c.dim("↓")}  Đang tải ${c.accent(entry.name)} để so sánh...`);
		const newContent = await downloadSkill(entry);
		process.stdout.write(` ${c.ok("✓")}\n`);
		const diffOutput = generateDiff(entry.name, currentContent, newContent);
		if (diffOutput) {
			console.log(`\n${c.bold(`Sự khác biệt cho kỹ năng "${entry.name}":`)}`);
			console.log(diffOutput);
		} else console.log(`\nKhông có sự thay đổi nào cho kỹ năng "${entry.name}".`);
		return false;
	}
	if (exists && !opts.force) {
		console.log(`  ${c.warn("⚠")}  ${entry.name} ${c.dim("đã tồn tại — dùng --force để ghi đè hoặc --diff để xem thay đổi")}`);
		return false;
	}
	process.stdout.write(`  ${c.dim("↓")}  Đang tải ${c.accent(entry.name)}...`);
	const content = await downloadSkill(entry);
	fs.mkdirSync(path.dirname(skillPath(ctx, entry.name)), { recursive: true });
	fs.writeFileSync(skillPath(ctx, entry.name), content, "utf8");
	process.stdout.write(` ${c.ok("✓")}\n`);
	return true;
}
async function runFetch(ctx, name, opts = {}) {
	if (opts.list) {
		console.log(`\n${c.bold("Skills trong autoskills registry:")}\n`);
		let manifest;
		try {
			manifest = await fetchManifest();
		} catch (err) {
			fatal(err instanceof FetchError ? err.message : String(err));
		}
		const entries = listRemoteSkills(manifest);
		for (const e of entries) printSkillEntry(e, skillExists(ctx, e.name));
		console.log(`\n${c.dim(`Tổng: ${entries.length} skills`)}`);
		return;
	}
	console.log(`\n${c.dim("Đang kết nối autoskills registry...")}`);
	let manifest;
	try {
		manifest = await fetchManifest();
	} catch (err) {
		fatal(err instanceof FetchError ? err.message : String(err));
		return;
	}
	console.log(`${c.ok("✓")} Kết nối thành công (${Object.keys(manifest.skills).length} skills có sẵn)\n`);
	if (opts.auto) {
		const profile = analyzeProject(process.cwd());
		const keywords = [
			profile.language,
			...profile.frameworks,
			...profile.tools
		].filter(Boolean);
		console.log(`${c.bold("Dự án hiện tại:")} ${profile.name} (${profile.language})`);
		console.log(`${c.dim("Tech stack:")} ${keywords.join(", ") || "unknown"}\n`);
		const matched = listRemoteSkills(manifest).filter((e) => {
			const searchStr = `${e.name} ${e.description ?? ""} ${e.source}`.toLowerCase();
			return keywords.some((kw) => searchStr.includes(kw.toLowerCase()));
		});
		if (matched.length === 0) {
			console.log(c.dim("Không tìm thấy skill phù hợp với tech stack của dự án."));
			return;
		}
		console.log(`${c.bold(`Tìm thấy ${matched.length} skill phù hợp:`)}\n`);
		let installed = 0;
		for (const entry of matched) if (await writeSkill(ctx, entry, opts)) installed++;
		console.log(`\n${c.ok("✓")} Đã cài ${installed}/${matched.length} skills.`);
		return;
	}
	if (opts.from) {
		const entries = findSkillsByBundle(manifest, opts.from);
		if (entries.length === 0) {
			fatal(`Không tìm thấy bundle "${opts.from}" trong registry.`);
			return;
		}
		console.log(`${c.bold(`Bundle "${opts.from}":`)} ${entries.length} skills\n`);
		let installed = 0;
		for (const entry of entries) if (await writeSkill(ctx, entry, opts)) installed++;
		console.log(`\n${c.ok("✓")} Đã cài ${installed}/${entries.length} skills từ "${opts.from}".`);
		return;
	}
	if (!name) {
		fatal("Cần truyền tên skill, --from <bundle>, hoặc --auto.\nVí dụ: ai-skills fetch bash-defensive-patterns");
		return;
	}
	const entry = findSkillInManifest(manifest, name);
	if (!entry) {
		fatal(`Không tìm thấy skill "${name}" trong registry.\nChạy ${c.accent("ai-skills fetch --list")} để xem danh sách.`);
		return;
	}
	if (await writeSkill(ctx, entry, opts)) {
		console.log(`\n${c.ok("✓")} Skill "${entry.name}" đã được thêm vào kho local.`);
		console.log(c.dim(`   Dùng ${c.accent(`ai-skills apply ${entry.name}`)} để nhúng vào dự án.`));
	}
}
//#endregion
//#region src/commands/get.ts
function runGet(ctx, rawName, options = {}) {
	try {
		const name = validateSkillName(rawName);
		if (!options.noSync) syncPull(ctx);
		if (!options.recursive) {
			const content = getSkill(ctx, name);
			trackUsage(ctx, name);
			console.log(content);
			return;
		}
		const visited = /* @__PURE__ */ new Set();
		const maxDepth = 2;
		const output = [];
		function fetchRecursive(currentName, depth) {
			if (visited.has(currentName) || depth > maxDepth) return;
			visited.add(currentName);
			try {
				const validName = validateSkillName(currentName);
				const content = getSkill(ctx, validName);
				trackUsage(ctx, validName);
				output.push(`\n<!-- ===== BẮT ĐẦU SKILL: ${validName} ===== -->\n`);
				output.push(content);
				output.push(`\n<!-- ===== KẾT THÚC SKILL: ${validName} ===== -->\n`);
				const frontmatter = parseFrontmatter(content);
				if (frontmatter.requires && Array.isArray(frontmatter.requires)) for (const req of frontmatter.requires) fetchRecursive(req, depth + 1);
			} catch (e) {
				output.push(`\n<!-- [LỖI] Không thể lấy phụ thuộc: ${currentName} (${e.message}) -->\n`);
			}
		}
		fetchRecursive(name, 0);
		console.log(output.join(""));
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/graph.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function runGraph(ctx) {
	try {
		ensureSkillsDir(ctx);
		const skills = listSkills(ctx);
		const nodes = [];
		const edges = [];
		for (const skill of skills) {
			const skillName = typeof skill === "string" ? skill : skill.name;
			const content = getSkill(ctx, skillName);
			const parsed = parseFrontmatter(content);
			nodes.push({
				id: skillName,
				label: skillName,
				description: parsed.attributes.description || "",
				tags: parsed.attributes.tags || []
			});
			const requires = parsed.attributes.requires || [];
			for (const req of requires) edges.push({
				from: skillName,
				to: req
			});
		}
		const graphData = {
			nodes,
			edges
		};
		const server = http.createServer((req, res) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			if (req.url === "/api/graph") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(graphData));
				return;
			}
			if (req.url === "/" || req.url === "/index.html") {
				const viewerPath = path.join(__dirname, "..", "viewer", "index.html");
				if (fs.existsSync(viewerPath)) {
					const html = fs.readFileSync(viewerPath, "utf8");
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(html);
				} else {
					const srcViewerPath = path.join(__dirname, "..", "..", "src", "viewer", "index.html");
					if (fs.existsSync(srcViewerPath)) {
						const html = fs.readFileSync(srcViewerPath, "utf8");
						res.writeHead(200, { "Content-Type": "text/html" });
						res.end(html);
					} else {
						res.writeHead(404);
						res.end("Viewer HTML not found.");
					}
				}
				return;
			}
			res.writeHead(404);
			res.end("Not Found");
		});
		const PORT = 3113;
		server.listen(PORT, () => {
			console.log(pc.cyan(`\n🕸️  Khởi động Web Graph Viewer thành công!`));
			console.log(pc.white(`👉 Mở trình duyệt tại: ${pc.bold(pc.blue(`http://localhost:${PORT}`))}`));
			console.log(pc.dim("Nhấn Ctrl+C để thoát.\n"));
		});
		server.on("error", (e) => {
			if (e.code === "EADDRINUSE") {
				console.error(pc.red(`Cổng ${PORT} đã được sử dụng. Hãy đóng tiến trình khác trước.`));
				process.exit(1);
			}
		});
	} catch (error) {
		handleError(error);
	}
}
//#endregion
//#region src/commands/import.ts
function runImport(ctx, inputFile, opts) {
	try {
		const inputPath = path.resolve(process.cwd(), inputFile);
		if (!fs.existsSync(inputPath)) fatal(`Không tìm thấy file "${inputFile}".`);
		const bundle = parseBundle(fs.readFileSync(inputPath, "utf8"));
		console.log(`Đọc bundle thành công (chứa ${bundle.skills.length} skills).`);
		if (opts.diff) {
			let hasDiff = false;
			for (const skill of bundle.skills) if (skillExists(ctx, skill.name)) {
				const currentContent = getSkill(ctx, skill.name);
				const diffOutput = generateDiff(skill.name, currentContent, skill.content);
				if (diffOutput) {
					hasDiff = true;
					console.log(`\n${c.bold(`Sự khác biệt cho kỹ năng "${skill.name}":`)}`);
					console.log(diffOutput);
				}
			} else {
				hasDiff = true;
				console.log(`\n${c.ok("+")} Kỹ năng "${skill.name}" là kỹ năng mới (chưa tồn tại cục bộ).`);
			}
			if (!hasDiff) console.log(`\nKhông có sự thay đổi nào cho các kỹ năng trong bundle.`);
			return;
		}
		const result = importBundle(ctx, bundle, { force: opts.force });
		if (result.imported.length > 0) {
			success(`Đã import thành công ${result.imported.length} skills:`);
			for (const name of result.imported) console.log(`  ${c.ok("✓")} ${name}`);
			syncPush(ctx, `Auto-sync: Import ${result.imported.length} skills`);
		}
		if (result.skipped.length > 0) {
			warn(`Đã bỏ qua ${result.skipped.length} skills (đã tồn tại, dùng --force để ghi đè hoặc --diff để xem thay đổi):`);
			for (const name of result.skipped) console.log(`  ${c.dim("○")} ${name}`);
		}
	} catch (err) {
		if (err instanceof BundleError) fatal(err.message);
		handleError(err);
	}
}
//#endregion
//#region src/commands/learn.ts
function runLearn(ctx, topic, lesson, options = {}) {
	try {
		ensureSkillsDir(ctx);
		const cleanTopic = validateSkillName(topic.toLowerCase().replace(/[^a-z0-9_-]/g, "-"));
		const skillName = `learned-${cleanTopic}`;
		const filePath = skillPath(ctx, skillName);
		const newEntry = `- **[${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}]**: ${lesson}\n`;
		let content = "";
		if (skillExists(ctx, skillName)) {
			content = getSkill(ctx, skillName);
			if (!content.endsWith("\n")) content += "\n";
			content += newEntry;
			console.log(pc.blue(`ℹ Đang cập nhật bài học mới vào sổ tay "${skillName}"...`));
		} else {
			console.log(pc.blue(`ℹ Đang tạo sổ tay học tập mới "${skillName}"...`));
			content = `---
name: ${skillName}
description: Tự động ghi lại các bài học và kinh nghiệm rút ra liên quan đến chủ đề ${cleanTopic}.
tags: [learned, ${cleanTopic}]
---

# Sổ tay học tập: ${cleanTopic.toUpperCase()}

Kỹ năng này là một tập hợp các bài học, quy tắc và kinh nghiệm tự động được tích lũy bởi AI Agent sau các lần gỡ lỗi hoặc cấu hình thực tế. Hãy luôn đọc kỹ sổ tay này trước khi làm việc với ${cleanTopic} để tránh lặp lại sai lầm.

## Những bài học đã ghi nhận

${newEntry}`;
		}
		fs.writeFileSync(filePath, content, "utf8");
		success(`Đã lưu bài học vào kỹ năng "${skillName}".`);
		if (!options.noSync) {
			console.log(pc.blue("ℹ Đang đồng bộ sổ tay lên kho lưu trữ đám mây..."));
			syncPush(ctx, `docs(learn): auto-learned new lesson for ${cleanTopic}`);
		}
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/init-sync.ts
function runInitSync(ctx, url) {
	info(`Đang thiết lập Git Sync với repo: ${url}...`);
	const result = initSync(ctx, url);
	if (result.ok) {
		success(result.message);
		info("Từ giờ mọi thay đổi sẽ tự động đồng bộ ngầm.");
	} else warn(result.message);
}
//#endregion
//#region src/commands/list.ts
function runList(ctx) {
	syncPull(ctx);
	const skills = listSkills(ctx);
	if (skills.length === 0) {
		console.log(c.dim("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <đường_dẫn_file>"));
		return;
	}
	console.log(c.bold(`Danh sách kỹ năng (${skills.length}):`));
	for (const skill of skills) console.log(`  ${c.ok("•")} ${skill.name}`);
}
//#endregion
//#region src/policies/recommender.ts
/** Kiểm tra keyword xuất hiện trong name, content, hoặc description */
function matchesAny(keyword, ...sources) {
	return sources.some((s) => s.includes(keyword));
}
/** Tính điểm từ frameworks và tools */
function matchKeywords(profile, lowerName, lowerContent, description, tags) {
	let score = 0;
	const reasons = [];
	for (const fw of profile.frameworks) if (matchesAny(fw, lowerContent, lowerName, description, ...tags)) {
		score += 3;
		reasons.push(`Phù hợp với framework "${fw}"`);
	}
	for (const tool of profile.tools) if (matchesAny(tool, lowerContent, lowerName, description, ...tags)) {
		score += 2;
		reasons.push(`Liên quan đến tool "${tool}"`);
	}
	if (matchesAny(profile.language, lowerContent, lowerName, description, ...tags)) {
		score += 2;
		reasons.push(`Phù hợp với ngôn ngữ "${profile.language}"`);
	}
	return {
		score,
		reasons
	};
}
/** Tính điểm contextual (tests, CI, Docker) */
function matchContextual(profile, lowerName, lowerContent) {
	let score = 0;
	const reasons = [];
	if (profile.hasTests && matchesAny("test", lowerContent, lowerName)) {
		score += 1;
		reasons.push("Dự án có tests — skill liên quan đến testing");
	}
	if (profile.hasCi && (lowerContent.includes("ci") || lowerContent.includes("deploy"))) {
		score += 1;
		reasons.push("Dự án có CI/CD — skill liên quan đến automation");
	}
	if (profile.hasDocker && (lowerContent.includes("docker") || lowerContent.includes("container"))) {
		score += 1;
		reasons.push("Dự án dùng Docker — skill liên quan đến containerization");
	}
	return {
		score,
		reasons
	};
}
/** Tính relevance score giữa skill content và project profile */
function computeRelevance(skillName, content, profile) {
	const lowerContent = content.toLowerCase();
	const lowerName = skillName.toLowerCase();
	const frontmatter = parseFrontmatter(content);
	const keywords = matchKeywords(profile, lowerName, lowerContent, frontmatter.description?.toLowerCase() ?? "", (frontmatter.tags ?? []).map((t) => t.toLowerCase()));
	const contextual = matchContextual(profile, lowerName, lowerContent);
	return {
		score: keywords.score + contextual.score,
		reasons: [...keywords.reasons, ...contextual.reasons]
	};
}
/** Chuyển score thành confidence level */
function scoreToConfidence(score) {
	if (score >= 5) return "high";
	if (score >= 2) return "medium";
	return "low";
}
/**
* Gợi ý skills phù hợp với project profile.
* Đọc nội dung từng skill, so sánh với profile, trả về top matches.
* @param maxResults Số kết quả tối đa trả về (mặc định 5)
*/
function recommendSkills(ctx, profile, availableSkills, maxResults = 5) {
	const recommendations = [];
	for (const skill of availableSkills) {
		let content;
		try {
			content = getSkill(ctx, skill.name);
		} catch {
			continue;
		}
		const { score, reasons } = computeRelevance(skill.name, content, profile);
		if (score <= 0 || reasons.length === 0) continue;
		recommendations.push({
			skillName: skill.name,
			reason: reasons.slice(0, 3).join("; "),
			confidence: scoreToConfidence(score),
			score
		});
	}
	recommendations.sort((a, b) => b.score - a.score);
	return recommendations.slice(0, maxResults);
}
//#endregion
//#region src/commands/recommend.ts
function runRecommend(ctx, opts) {
	syncPull(ctx);
	const projectDir = opts.dir ?? process.cwd();
	const profile = analyzeProject(projectDir);
	console.log(c.bold("📁 Phân tích dự án:\n"));
	console.log(`  Tên:        ${c.accent(profile.name)}`);
	console.log(`  Ngôn ngữ:   ${profile.language}`);
	console.log(`  Frameworks: ${profile.frameworks.length > 0 ? profile.frameworks.join(", ") : c.dim("không phát hiện")}`);
	console.log(`  Tools:      ${profile.tools.length > 0 ? profile.tools.join(", ") : c.dim("không phát hiện")}`);
	console.log(`  Tests:      ${profile.hasTests ? c.ok("✓") : c.dim("✗")}`);
	console.log(`  CI/CD:      ${profile.hasCi ? c.ok("✓") : c.dim("✗")}`);
	console.log(`  Docker:     ${profile.hasDocker ? c.ok("✓") : c.dim("✗")}`);
	console.log();
	const skills = listSkills(ctx);
	if (skills.length === 0) {
		info("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <file>");
		return;
	}
	const recommendations = recommendSkills(ctx, profile, skills);
	if (recommendations.length === 0) {
		info("Không tìm thấy kỹ năng phù hợp với dự án này.");
		info(`Kho hiện có ${skills.length} kỹ năng. Thử thêm skills liên quan đến ${profile.frameworks.join(", ") || profile.language}.`);
		return;
	}
	console.log(c.bold(`🎯 Gợi ý kỹ năng (${recommendations.length}):\n`));
	const confidenceIcon = {
		high: c.ok("★★★"),
		medium: c.warn("★★☆"),
		low: c.dim("★☆☆")
	};
	for (const rec of recommendations) {
		console.log(`  ${confidenceIcon[rec.confidence]} ${c.accent(rec.skillName)}`);
		console.log(`    ${c.dim(rec.reason)}`);
	}
	console.log();
	info(`Apply bằng: ai-skills apply <tên>`);
}
//#endregion
//#region src/commands/remove.ts
function runRemove(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		syncPull(ctx);
		removeSkill(ctx, name);
		success(`Đã xóa kỹ năng "${name}".`);
		syncPush(ctx, `Auto-sync: Remove skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/bash-hook.ts
/**
* Policy: Trích xuất bash script từ nội dung Markdown.
*
* ⚠️ BẢO MẬT: Thực thi code tùy ý từ file Markdown.
*/
function extractBashHook(content) {
	return content.replace(/\r\n?/g, "\n").match(/```bash[ \t]+(?:hook|pre-hook)\b[^\n]*\n([\s\S]*?)```/)?.[1]?.trim() ?? null;
}
//#endregion
//#region src/commands/run.ts
async function runRun(ctx, rawName, options = {}) {
	try {
		const name = validateSkillName(rawName);
		let skillFilePath = path.join(process.cwd(), ".agents", "skills", name, "SKILL.md");
		if (!fs.existsSync(skillFilePath)) skillFilePath = skillPath(ctx, name);
		if (!fs.existsSync(skillFilePath)) handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}".`));
		const scriptContent = extractBashHook(fs.readFileSync(skillFilePath, "utf8"));
		if (!scriptContent) {
			info(`Kỹ năng "${name}" không chứa khối mã \`\`\`bash để thực thi.`);
			return;
		}
		warn("Đang thực thi code từ file Markdown. Chỉ chạy các skill từ nguồn đáng tin cậy!");
		console.log(`\n🚀 Thực thi kỹ năng "${name}":\n`);
		for (const line of scriptContent.split("\n")) if (line.trim()) console.log(`  │ ${line}`);
		console.log();
		if (!options.yes) {
			const shouldRun = await p.confirm({ message: "Bạn có chắc chắn muốn chạy đoạn mã này không?" });
			if (p.isCancel(shouldRun) || !shouldRun) {
				info("Đã hủy thực thi.");
				return;
			}
		}
		const execOptions = {
			stdio: "inherit",
			timeout: 3e5
		};
		if (os.platform() === "win32") execOptions.shell = "bash";
		try {
			execSync(scriptContent, execOptions);
		} catch (e) {
			if (os.platform() === "win32" && e.message && e.message.includes("ENOENT")) handleError(/* @__PURE__ */ new Error("Không tìm thấy 'bash' trên Windows. Hãy chắc chắn bạn đã cài Git Bash hoặc WSL và đưa vào PATH."));
			else throw e;
		}
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/search.ts
/** Hiển thị kết quả TF-IDF/fuzzy search */
function displaySemanticResults(results, keyword) {
	console.log(`Kết quả tìm kiếm thông minh cho ${c.accent(`"${keyword}"`)}: \n`);
	if (results.length === 0) {
		console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
		return;
	}
	for (const r of results) {
		const scoreBar = "█".repeat(Math.round(r.score * 10)).padEnd(10, "░");
		const scoreLabel = c.dim(`[${scoreBar}] ${(r.score * 100).toFixed(0)}%`);
		const typeLabel = r.matchType === "exact" ? c.ok("exact") : r.matchType === "fuzzy" ? c.warn("fuzzy") : c.dim("tfidf");
		console.log(`  ${c.ok("•")} ${r.name}  ${scoreLabel}  ${typeLabel}`);
		if (r.snippet) console.log(`    ${c.dim(r.snippet)}`);
	}
}
/** Hiển thị kết quả brute-force search */
function displayBruteForceResults(results, keyword) {
	console.log(`Kết quả tìm kiếm cho ${c.accent(`"${keyword}"`)}: \n`);
	if (results.length === 0) {
		console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
		return;
	}
	for (const r of results) {
		const tags = [];
		if (r.matchedInName) tags.push("tên");
		if (r.matchedInContent) tags.push("nội dung");
		console.log(`  ${c.ok("•")} ${r.name} ${c.dim(`(khớp trong: ${tags.join(", ")})`)}`);
	}
}
function runSearch(ctx, keyword, opts = {}) {
	syncPull(ctx);
	if (opts.semantic) displaySemanticResults(searchSkillsSemantic(ctx, keyword, opts.tag), keyword);
	else displayBruteForceResults(searchSkills(ctx, keyword, opts.tag), keyword);
}
//#endregion
//#region src/commands/stats.ts
function runStats(ctx) {
	try {
		const skills = listSkills(ctx);
		if (skills.length === 0) {
			console.log(c.dim("Kho kỹ năng trống. Hãy dùng lệnh `create` hoặc `add` để thêm."));
			return;
		}
		const tagCounts = /* @__PURE__ */ new Map();
		for (const skill of skills) {
			const content = getSkill(ctx, skill.name);
			const tags = (parseFrontmatter(content).tags ?? []).map((t) => t.toLowerCase());
			for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
		}
		success(`Thống kê kho kỹ năng:`);
		console.log(`  ${c.ok("•")} Tổng số kỹ năng: ${c.bold(skills.length)}`);
		if (tagCounts.size > 0) {
			console.log(`  ${c.ok("•")} Phân bố tags:`);
			const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
			for (const [tag, count] of sortedTags) console.log(`      - ${c.accent(tag)}: ${count}`);
		} else console.log(c.dim(`  (Không có tags nào được sử dụng)`));
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/tag.ts
/**
* Subcommand `tag` — quản lý tags của skills.
* Dùng như: ai-skills tag <action> [args...]
*/
function runTagAdd(ctx, skillName, tags) {
	if (tags.length === 0) {
		fatal("Cần ít nhất 1 tag. Ví dụ: ai-skills tag add my-skill frontend web");
		return;
	}
	if (!skillExists(ctx, skillName)) {
		fatal(`Không tìm thấy skill "${skillName}".`);
		return;
	}
	const p = skillPath(ctx, skillName);
	const content = fs.readFileSync(p, "utf8");
	const current = getTags(content);
	const lower = new Set(current.map((t) => t.toLowerCase()));
	const toAdd = tags.filter((t) => !lower.has(t.toLowerCase()));
	if (toAdd.length === 0) {
		console.log(`${c.warn("⚠")}  Tất cả tags đã tồn tại trong "${skillName}": ${current.map((t) => c.accent(t)).join(", ")}`);
		return;
	}
	const next = [...current, ...toAdd];
	const updated = injectTags(content, next);
	fs.writeFileSync(p, updated, "utf8");
	console.log(`${c.ok("✓")}  Tags của "${skillName}":`);
	console.log(`   ${next.map((t) => c.accent(t)).join("  ")}`);
	if (toAdd.length < tags.length) {
		const skipped = tags.filter((t) => lower.has(t.toLowerCase()));
		console.log(`${c.dim(`   (bỏ qua đã có: ${skipped.join(", ")})`)}`);
	}
}
function runTagRemove(ctx, skillName, tag) {
	if (!skillExists(ctx, skillName)) {
		fatal(`Không tìm thấy skill "${skillName}".`);
		return;
	}
	const p = skillPath(ctx, skillName);
	const content = fs.readFileSync(p, "utf8");
	const { content: updated, removed } = removeTag(content, tag);
	if (!removed) {
		console.log(`${c.warn("⚠")}  Tag "${tag}" không tồn tại trong skill "${skillName}".`);
		const current = getTags(content);
		if (current.length > 0) console.log(`   Tags hiện tại: ${current.map((t) => c.accent(t)).join("  ")}`);
		return;
	}
	fs.writeFileSync(p, updated, "utf8");
	const remaining = getTags(updated);
	console.log(`${c.ok("✓")}  Đã xóa tag "${tag}" khỏi "${skillName}".`);
	if (remaining.length > 0) console.log(`   Tags còn lại: ${remaining.map((t) => c.accent(t)).join("  ")}`);
	else console.log(`   ${c.dim("(không còn tag nào)")}`);
}
function runTagList(ctx) {
	const skills = listSkills(ctx);
	if (skills.length === 0) {
		console.log(c.dim("Kho kỹ năng trống."));
		return;
	}
	const tagMap = /* @__PURE__ */ new Map();
	let untaggedCount = 0;
	for (const skill of skills) {
		const content = getSkill(ctx, skill.name);
		const tags = getTags(content);
		if (tags.length === 0) {
			untaggedCount++;
			continue;
		}
		for (const tag of tags) {
			const existing = tagMap.get(tag) ?? [];
			existing.push(skill.name);
			tagMap.set(tag, existing);
		}
	}
	if (tagMap.size === 0 && untaggedCount === 0) {
		console.log(c.dim("Không có skill nào."));
		return;
	}
	console.log(`\n${c.bold("Tags trong kho kỹ năng:")}\n`);
	const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	for (const [tag, names] of sortedTags) {
		const count = c.dim(`(${names.length} skill)`);
		console.log(`  ${c.accent(tag.padEnd(24))} ${count}`);
		for (const n of names.sort()) console.log(`    ${c.dim("•")} ${n}`);
	}
	if (untaggedCount > 0) console.log(`\n  ${c.dim(`(untagged: ${untaggedCount} skills)`)}`);
	console.log(`\n${c.dim(`Tổng: ${tagMap.size} tags, ${skills.length} skills`)}`);
}
function runTagRename(ctx, oldTag, newTag) {
	if (!newTag || newTag.trim() === "") {
		fatal("Tên tag mới không được để trống.");
		return;
	}
	const skills = listSkills(ctx);
	let renamedCount = 0;
	for (const skill of skills) {
		const content = getSkill(ctx, skill.name);
		const { content: updated, renamed } = renameTag(content, oldTag, newTag);
		if (renamed) {
			fs.writeFileSync(skill.path, updated, "utf8");
			renamedCount++;
			console.log(`  ${c.ok("✓")}  ${skill.name}`);
		}
	}
	if (renamedCount === 0) {
		console.log(`${c.warn("⚠")}  Tag "${oldTag}" không tìm thấy trong bất kỳ skill nào.`);
		return;
	}
	console.log(`\n${c.ok("✓")} Đã đổi "${oldTag}" → "${newTag}" trong ${renamedCount} skill.`);
}
function runTag(ctx, action, args) {
	switch (action) {
		case "add": {
			const [skill, ...tags] = args;
			if (!skill) {
				fatal("Usage: ai-skills tag add <skill> <tag1> [tag2...]");
				return;
			}
			runTagAdd(ctx, skill, tags);
			break;
		}
		case "remove":
		case "rm": {
			const [skill, tag] = args;
			if (!skill || !tag) {
				fatal("Usage: ai-skills tag remove <skill> <tag>");
				return;
			}
			runTagRemove(ctx, skill, tag);
			break;
		}
		case "list":
		case "ls":
			runTagList(ctx);
			break;
		case "rename":
		case "mv": {
			const [oldTag, newTag] = args;
			if (!oldTag || !newTag) {
				fatal("Usage: ai-skills tag rename <old-tag> <new-tag>");
				return;
			}
			runTagRename(ctx, oldTag, newTag);
			break;
		}
		default: fatal(`Action không hợp lệ: "${action}". Dùng: add | remove | list | rename`);
	}
}
//#endregion
//#region src/commands/update.ts
function runUpdate(ctx) {
	try {
		info("Đang cập nhật kỹ năng từ Cloud (Git)...");
		if (syncPull(ctx)) success("Đã cập nhật kho kỹ năng thành công!");
		else warn("Không thể cập nhật. Kho kỹ năng chưa được cấu hình Git (dùng lệnh init-sync) hoặc đang bị lỗi mạng/conflict.");
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/index.ts
const ctx = createCliContext();
program.name("ai-skills").description("CLI Tool — Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)").version(CLI_VERSION);
program.command("init-sync <url>").description("Khởi tạo đồng bộ Git cho kho kỹ năng (liên kết với Cloud repo)").action((url) => runInitSync(ctx, url));
program.command("list").description("Liệt kê danh sách tất cả các kỹ năng đang có").action(() => runList(ctx));
program.command("get <name>").description("Đọc và in ra nội dung của một kỹ năng cụ thể").option("--no-sync", "Bỏ qua việc đồng bộ git tự động").option("-r, --recursive", "Tự động tải nội dung của các skill phụ thuộc (thông qua requires)").action((name, opts) => runGet(ctx, name, {
	noSync: !opts.sync,
	recursive: opts.recursive
}));
program.command("add <name> <file_path>").description("Thêm một kỹ năng mới từ file Markdown có sẵn").option("--no-sync", "Bỏ qua việc đồng bộ git tự động").action((name, filePath, opts) => runAdd(ctx, name, filePath, { noSync: !opts.sync }));
program.command("learn <topic> <lesson>").description("Tự động trích xuất bài học và ghi vào sổ tay kỹ năng (learned-<topic>)").option("--no-sync", "Bỏ qua việc đồng bộ git tự động").action((topic, lesson, opts) => runLearn(ctx, topic, lesson, opts));
program.command("graph").description("Khởi động Web Viewer để xem đồ thị liên kết kỹ năng (Knowledge Graph)").action(() => runGraph(ctx));
program.command("remove <name>").alias("rm").description("Xóa một kỹ năng khỏi kho lưu trữ").action((name) => runRemove(ctx, name));
program.command("search <keyword>").description("Tìm kiếm kỹ năng theo tên hoặc nội dung").option("-s, --semantic", "Tìm kiếm thông minh với TF-IDF + fuzzy matching").option("--tag <tag>", "Lọc kết quả theo tag").action((keyword, opts) => runSearch(ctx, keyword, opts));
program.command("apply <name>").description("Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)").action((name) => runApply(ctx, name));
program.command("run <name>").description("Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng").option("-y, --yes", "Bỏ qua xác nhận (dùng cho automation)").action((name, opts) => runRun(ctx, name, opts));
program.command("create [name]").description("Tạo kỹ năng mới từ template có sẵn").option("-t, --template <id>", "Chọn template (mặc định: basic)").option("-d, --description <text>", "Mô tả ngắn cho kỹ năng").option("--tags <tags...>", "Danh sách tags (cách nhau bởi dấu cách)").option("--force", "Ghi đè nếu skill đã tồn tại").option("--list-templates", "Liệt kê các template có sẵn").action((name, opts) => runCreate(ctx, name, opts));
program.command("recommend").description("Phân tích dự án và gợi ý kỹ năng phù hợp").option("--dir <path>", "Thư mục dự án cần phân tích (mặc định: thư mục hiện tại)").action((opts) => runRecommend(ctx, opts));
program.command("update").description("Cập nhật kho kỹ năng từ Cloud (Git Pull)").action(() => runUpdate(ctx));
program.command("stats").description("Xem thống kê kho kỹ năng và tags").action(() => runStats(ctx));
program.command("audit").alias("analytics").description("Phân tích dữ liệu sử dụng kỹ năng và đề xuất dọn dẹp").action(() => runAudit(ctx));
program.command("diff <name> <file>").description("So sánh kỹ năng trong kho với file bên ngoài").action((name, file) => runDiff(ctx, name, file));
program.command("fetch [name]").description("Tải skill từ autoskills registry về kho local").option("--from <bundle>", "Tải toàn bộ skills từ một bundle (vd: wshobson/agents)").option("--auto", "Tự động detect tech stack và fetch skills phù hợp").option("--force", "Ghi đè skill đã tồn tại").option("--diff", "So sánh khác biệt thay vì ghi đè").option("--list", "Chỉ hiển thị danh sách skills có sẵn, không tải").action((name, opts) => runFetch(ctx, name, opts));
program.command("tag <action> [args...]").description("Quản lý tags của skills (add | remove | list | rename)").addHelpText("after", [
	"",
	"  Actions:",
	"    add <skill> <tag...>       Thêm tags vào skill",
	"    remove <skill> <tag>       Xóa tag khỏi skill",
	"    list                       Liệt kê tất cả tags",
	"    rename <old-tag> <new-tag> Đổi tên tag trên toàn bộ kho",
	"",
	"  Ví dụ:",
	"    ai-skills tag add my-skill frontend web",
	"    ai-skills tag remove my-skill web",
	"    ai-skills tag list",
	"    ai-skills tag rename frontend ui"
].join("\n")).action((action, args) => runTag(ctx, action, args));
program.command("export <file> [skills...]").description("Đóng gói skills thành một file JSON").option("--tag <tag>", "Export các skills có chứa tag này").option("--all", "Export toàn bộ kho kỹ năng").option("--with-deps", "Bao gồm cả các skill phụ thuộc (thông qua requires)").action((file, skills, opts) => runExport(ctx, file, skills, opts));
program.command("import <file>").description("Nhập các skills từ file bundle JSON").option("--force", "Ghi đè nếu skill đã tồn tại").option("--diff", "So sánh khác biệt thay vì ghi đè").action((file, opts) => runImport(ctx, file, opts));
program.parseAsync().catch((err) => {
	console.error(err);
	process.exit(1);
});
//#endregion
export {};
