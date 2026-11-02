#!/usr/bin/env node
import { program } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import fs$1 from "node:fs";
import pc from "picocolors";
import crypto from "node:crypto";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
//#region src/domain/value-objects/Tag.ts
var Tag = class {
	value;
	constructor(value) {
		const trimmed = value.trim();
		if (!trimmed) throw new Error("Tag cannot be empty");
		this.value = trimmed.toLowerCase();
	}
	equals(other) {
		return this.value === other.value;
	}
};
//#endregion
//#region src/domain/entities/Skill.ts
var Skill = class {
	id;
	name;
	description;
	content;
	tags;
	requirements;
	constructor(id, description = "", content = "") {
		if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid skill ID: ${id}. Must be lowercase alphanumeric with hyphens.`);
		this.id = id;
		this.name = id;
		this.description = description;
		this.content = content;
		this.tags = /* @__PURE__ */ new Set();
		this.requirements = /* @__PURE__ */ new Set();
	}
	addTag(tag) {
		this.tags.add(tag.value);
	}
	removeTag(tag) {
		this.tags.delete(tag.value);
	}
	getTags() {
		return Array.from(this.tags).map((t) => new Tag(t));
	}
	addRequirement(skillId) {
		this.requirements.add(skillId);
	}
	getRequirements() {
		return Array.from(this.requirements);
	}
	equals(other) {
		return this.id === other.id;
	}
};
//#endregion
//#region src/utils/frontmatter.ts
function parseFrontmatter(content) {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!match) return {};
	const result = {};
	for (const line of match[1].split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			const valueStr = line.slice(colonIdx + 1).trim();
			if (key === "tags" || key === "requires") {
				let cleaned = valueStr;
				if (cleaned.startsWith("[") && cleaned.endsWith("]")) cleaned = cleaned.slice(1, -1);
				result[key] = cleaned.split(",").map((t) => t.trim()).filter(Boolean);
			} else result[key] = valueStr;
		}
	}
	return result;
}
/**
* Serialize object thành YAML frontmatter và gắn với body content.
*/
function serializeFrontmatter(frontmatter, body) {
	const lines = ["---"];
	if (frontmatter.name) lines.push(`name: ${frontmatter.name}`);
	if (frontmatter.description) lines.push(`description: ${frontmatter.description}`);
	if (frontmatter.tags && frontmatter.tags.length > 0) lines.push(`tags: [${frontmatter.tags.join(", ")}]`);
	if (frontmatter.requires && frontmatter.requires.length > 0) lines.push(`requires: [${frontmatter.requires.join(", ")}]`);
	lines.push("---");
	return `${lines.join("\n")}\n\n${body.trim()}`;
}
function formatSkillAsMarkdown(skill) {
	return serializeFrontmatter({
		name: skill.name,
		description: skill.description.split("\n")[0] || "",
		tags: skill.getTags().map((t) => t.value),
		requires: skill.getRequirements()
	}, skill.content || "No content yet.");
}
/**
* Bóc tách cả frontmatter và phần body của file markdown một cách chuẩn xác,
* hỗ trợ linh hoạt các ngắt dòng.
*/
function parseSkillFile(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!match) return {
		meta: parseFrontmatter(content),
		body: content.trim()
	};
	const frontmatterStr = match[1];
	const body = content.slice(match[0].length).trim();
	const result = {};
	for (const line of frontmatterStr.split(/\r?\n/)) {
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			const valueStr = line.slice(colonIdx + 1).trim();
			if (key === "tags" || key === "requires") {
				let cleaned = valueStr;
				if (cleaned.startsWith("[") && cleaned.endsWith("]")) cleaned = cleaned.slice(1, -1);
				result[key] = cleaned.split(",").map((t) => t.trim()).filter(Boolean);
			} else result[key] = valueStr;
		}
	}
	return {
		meta: result,
		body
	};
}
//#endregion
//#region src/application/SkillApplicationService.ts
var SkillApplicationService = class {
	skillRepo;
	constructor(skillRepo) {
		this.skillRepo = skillRepo;
	}
	async createSkill(skillId, sourceFilePath, extraTags = [], overwrite = false) {
		if (await this.skillRepo.findById(skillId) && !overwrite) throw new Error(`Skill already exists: ${skillId}`);
		const { meta, body } = parseSkillFile(await fs.readFile(sourceFilePath, "utf8"));
		let description = meta.description || "";
		if (!description) {
			description = body.slice(0, 150).replace(/\n/g, " ").trim();
			if (body.length > 150) description += "...";
		}
		const skill = new Skill(skillId, description, body);
		if (Array.isArray(meta.tags)) for (const t of meta.tags) skill.addTag(new Tag(t));
		if (Array.isArray(meta.requires)) for (const r of meta.requires) skill.addRequirement(r);
		for (const t of extraTags) skill.addTag(new Tag(t));
		await this.skillRepo.save(skill);
		return skill;
	}
	/** Tạo skill mới từ nội dung đã được sinh sẵn (template-generated). */
	async createSkillFromContent(skillId, content, overwrite = false) {
		if (await this.skillRepo.findById(skillId) && !overwrite) throw new Error(`Skill already exists: ${skillId}`);
		const { meta, body } = parseSkillFile(content);
		let description = meta.description || "";
		if (!description) {
			description = body.slice(0, 150).replace(/\n/g, " ").trim();
			if (body.length > 150) description += "...";
		}
		const skill = new Skill(skillId, description, body);
		if (Array.isArray(meta.tags)) for (const t of meta.tags) skill.addTag(new Tag(t));
		if (Array.isArray(meta.requires)) for (const r of meta.requires) skill.addRequirement(r);
		await this.skillRepo.save(skill);
		return skill;
	}
	/** Append một dòng bài học vào skill. Tự tạo skill mới nếu chưa tồn tại. */
	async appendLesson(skillId, lesson, initialContent) {
		const newEntry = `- **[${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}]**: ${lesson}`;
		let skill = await this.skillRepo.findById(skillId);
		const isNew = !skill;
		if (!skill) {
			const { meta, body } = parseSkillFile(initialContent);
			let description = meta.description || "";
			if (!description) {
				description = body.slice(0, 150).replace(/\n/g, " ").trim();
				if (body.length > 150) description += "...";
			}
			skill = new Skill(skillId, description, body);
			if (Array.isArray(meta.tags)) for (const t of meta.tags) skill.addTag(new Tag(t));
		} else skill.content = `${skill.content.trimEnd()}\n${newEntry}\n`;
		await this.skillRepo.save(skill);
		return {
			skill,
			isNew
		};
	}
	/** Tìm kiếm skills theo keyword trong tên và nội dung. */
	async searchSkills(keyword, tag) {
		const allSkills = await this.skillRepo.findAll();
		const kw = keyword.toLowerCase();
		return allSkills.filter((s) => {
			if (tag) return s.getTags().some((t) => t.value === tag.toLowerCase());
			return true;
		}).map((s) => ({
			id: s.id,
			matchedInName: s.id.toLowerCase().includes(kw),
			matchedInContent: s.description.toLowerCase().includes(kw) || s.content.toLowerCase().includes(kw)
		})).filter((r) => r.matchedInName || r.matchedInContent);
	}
	async deleteSkill(skillId) {
		if (!await this.skillRepo.findById(skillId)) throw new Error(`Skill not found: ${skillId}`);
		await this.skillRepo.delete(skillId);
	}
	async getSkill(skillId) {
		return await this.skillRepo.findById(skillId);
	}
	async addTagsToSkill(skillId, tagNames) {
		const skill = await this.skillRepo.findById(skillId);
		if (!skill) throw new Error(`Skill not found: ${skillId}`);
		for (const tagName of tagNames) skill.addTag(new Tag(tagName));
		await this.skillRepo.save(skill);
		return skill;
	}
	async removeTagFromSkill(skillId, tagName) {
		const skill = await this.skillRepo.findById(skillId);
		if (!skill) throw new Error(`Skill not found: ${skillId}`);
		skill.removeTag(new Tag(tagName));
		await this.skillRepo.save(skill);
		return skill;
	}
	async getAllSkills() {
		return await this.skillRepo.findAll();
	}
	async getTagsOverview() {
		const allSkills = await this.skillRepo.findAll();
		const tagMap = /* @__PURE__ */ new Map();
		const untagged = [];
		for (const skill of allSkills) {
			const tags = skill.getTags();
			if (tags.length === 0) untagged.push(skill.id);
			else for (const tag of tags) {
				const val = tag.value;
				if (!tagMap.has(val)) tagMap.set(val, []);
				tagMap.get(val)?.push(skill.id);
			}
		}
		return {
			tagMap,
			untagged
		};
	}
	async renameTag(oldName, newName) {
		const allSkills = await this.skillRepo.findAll();
		const oldTag = new Tag(oldName);
		const newTag = new Tag(newName);
		let affectedCount = 0;
		for (const skill of allSkills) if (skill.getTags().some((t) => t.equals(oldTag))) {
			skill.removeTag(oldTag);
			skill.addTag(newTag);
			await this.skillRepo.save(skill);
			affectedCount++;
		}
		return affectedCount;
	}
};
//#endregion
//#region src/infrastructure/FileSystemSkillRepository.ts
var FileSystemSkillRepository = class {
	baseDir;
	constructor(baseDir) {
		this.baseDir = baseDir;
	}
	getFilePath(id) {
		const fullPath = path.join(this.baseDir, `${id}.md`);
		if (!fullPath.startsWith(path.normalize(this.baseDir))) throw new Error("Invalid skill ID: Path traversal detected");
		return fullPath;
	}
	async findById(id) {
		const filePath = this.getFilePath(id);
		try {
			const content = await fs.readFile(filePath, "utf-8");
			return this.mapToEntity(id, content);
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}
	async findAll() {
		try {
			const promises = (await fs.readdir(this.baseDir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => this.findById(entry.name.replace(/\.md$/, "")));
			return (await Promise.all(promises)).filter((s) => s !== null);
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
	}
	async save(skill) {
		await fs.mkdir(this.baseDir, { recursive: true });
		const filePath = this.getFilePath(skill.id);
		const newContent = this.mapToMarkdown(skill);
		await fs.writeFile(filePath, newContent, "utf-8");
	}
	async delete(id) {
		const filePath = this.getFilePath(id);
		try {
			await fs.rm(filePath, { force: true });
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	async exists(id) {
		const filePath = this.getFilePath(id);
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}
	mapToEntity(id, content) {
		const { meta, body } = parseSkillFile(content);
		let description = meta.description || "";
		if (!description) {
			description = body.slice(0, 150).replace(/\n/g, " ").trim();
			if (body.length > 150) description += "...";
		}
		const skill = new Skill(id, description, body);
		if (meta.tags && Array.isArray(meta.tags)) for (const t of meta.tags) skill.addTag(new Tag(t));
		if (meta.requires && Array.isArray(meta.requires)) for (const r of meta.requires) skill.addRequirement(r);
		return skill;
	}
	mapToMarkdown(skill) {
		return serializeFrontmatter({
			name: skill.name,
			description: skill.description.split("\n")[0] || "",
			tags: skill.getTags().map((t) => t.value),
			requires: skill.getRequirements()
		}, skill.content);
	}
};
//#endregion
//#region src/policies/git-sync.ts
/**
* Business Rule: Git sync cho skill registry.
* Transparent — lỗi git không làm crash CLI, chỉ silently fail.
* Trả về boolean để caller biết có sync thành công không.
*/
function isGitRepo(ctx) {
	return fs$1.existsSync(path.join(ctx.skillsDir, ".git"));
}
function runGit(ctx, args) {
	try {
		if (!isGitRepo(ctx)) return false;
		execFileSync("git", args, {
			cwd: ctx.skillsDir,
			stdio: "ignore",
			timeout: 15e3,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0"
			}
		});
		return true;
	} catch (_err) {
		if (args.includes("--rebase")) try {
			execFileSync("git", ["rebase", "--abort"], {
				cwd: ctx.skillsDir,
				stdio: "ignore"
			});
		} catch {}
		return false;
	}
}
/** Pull về từ remote trước khi đọc */
function syncPull(ctx) {
	return runGit(ctx, [
		"pull",
		"origin",
		"main",
		"--rebase"
	]);
}
/** Commit và push sau khi ghi */
function syncPush(ctx, message) {
	const added = runGit(ctx, ["add", "*.md"]);
	const committed = runGit(ctx, [
		"commit",
		"-m",
		message
	]);
	const pushed = runGit(ctx, [
		"push",
		"origin",
		"main"
	]);
	return added && committed && pushed;
}
/** Khởi tạo git repo và link với remote */
function initSync(ctx, remoteUrl) {
	if (!fs$1.existsSync(ctx.skillsDir)) fs$1.mkdirSync(ctx.skillsDir, { recursive: true });
	const safeUrl = remoteUrl.replace(/https?:\/\/[^@]+@/, "https://***@");
	try {
		if (!isGitRepo(ctx)) {
			execFileSync("git", ["init"], {
				cwd: ctx.skillsDir,
				stdio: "ignore"
			});
			try {
				execFileSync("git", [
					"commit",
					"--allow-empty",
					"-m",
					"Initial commit"
				], {
					cwd: ctx.skillsDir,
					stdio: "pipe"
				});
			} catch (err) {
				if (err.stderr?.toString().includes("Please tell me who you are")) return {
					ok: false,
					message: "Lỗi Git: Bạn chưa thiết lập danh tính Git. Hãy chạy `git config --global user.name 'Tên của bạn'` và `git config --global user.email 'Email'` trước."
				};
			}
		}
		try {
			execFileSync("git", [
				"remote",
				"set-url",
				"origin",
				remoteUrl
			], {
				cwd: ctx.skillsDir,
				stdio: "ignore"
			});
		} catch {
			try {
				execFileSync("git", [
					"remote",
					"add",
					"origin",
					remoteUrl
				], {
					cwd: ctx.skillsDir,
					stdio: "ignore"
				});
			} catch {}
		}
		execFileSync("git", [
			"branch",
			"-M",
			"main"
		], {
			cwd: ctx.skillsDir,
			stdio: "ignore"
		});
		try {
			execFileSync("git", [
				"push",
				"-u",
				"origin",
				"main"
			], {
				cwd: ctx.skillsDir,
				stdio: "ignore",
				timeout: 15e3,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: "0"
				}
			});
			return {
				ok: true,
				message: `Thiết lập Git Sync thành công với remote: ${safeUrl}`
			};
		} catch {
			return {
				ok: false,
				message: `Thiết lập thất bại (push bị từ chối). Repo ${safeUrl} có thể đã chứa dữ liệu, hãy clone thủ công hoặc kiểm tra quyền truy cập.`
			};
		}
	} catch (err) {
		return {
			ok: false,
			message: `Lỗi khi thiết lập Git: ${err instanceof Error ? err.message : String(err)}`
		};
	}
}
//#endregion
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
async function runAdd(ctx, rawName, filePath, opts) {
	try {
		const name = validateSkillName(rawName);
		if (!opts.noSync) syncPull(ctx);
		const repo = new FileSystemSkillRepository(ctx.skillsDir);
		const service = new SkillApplicationService(repo);
		if (await repo.exists(name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (await repo.exists(name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		await service.createSkill(name, filePath, opts.tags || [], opts.force);
		success(`Đã thêm/cập nhật kỹ năng "${name}".`);
		if (!opts.noSync) syncPush(ctx, `Auto-sync: Add/update skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/text-search.ts
const STOPWORDS = /* @__PURE__ */ new Set([
	"a",
	"an",
	"the",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"shall",
	"can",
	"need",
	"dare",
	"ought",
	"used",
	"to",
	"of",
	"in",
	"for",
	"on",
	"with",
	"at",
	"by",
	"from",
	"as",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"between",
	"out",
	"off",
	"over",
	"under",
	"again",
	"further",
	"then",
	"once",
	"here",
	"there",
	"when",
	"where",
	"why",
	"how",
	"all",
	"both",
	"each",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"no",
	"nor",
	"not",
	"only",
	"own",
	"same",
	"so",
	"than",
	"too",
	"very",
	"just",
	"because",
	"but",
	"and",
	"or",
	"if",
	"while",
	"about",
	"up",
	"its",
	"it",
	"this",
	"that",
	"these",
	"those",
	"i",
	"me",
	"my",
	"we",
	"our",
	"you",
	"your",
	"he",
	"him",
	"his",
	"she",
	"her",
	"they",
	"them",
	"their",
	"what",
	"which",
	"who",
	"whom",
	"và",
	"hoặc",
	"của",
	"là",
	"các",
	"những",
	"cho",
	"để",
	"trong",
	"trên",
	"dưới",
	"với",
	"như",
	"một",
	"sẽ",
	"đã",
	"đang",
	"thì",
	"mà",
	"có",
	"không",
	"khi",
	"làm"
]);
/** Tách text thành tokens đã normalize */
function tokenize(text) {
	const words = text.toLowerCase().match(/[\p{L}\d-]+/gu);
	if (!words) return [];
	return words.filter((w) => w.length > 1 && !STOPWORDS.has(w));
}
const prevRow = /* @__PURE__ */ new Int32Array(256);
const currRow = /* @__PURE__ */ new Int32Array(256);
/** Tính Levenshtein distance giữa 2 string */
function levenshtein(a, b) {
	const la = a.length;
	const lb = b.length;
	if (la === 0) return lb;
	if (lb === 0) return la;
	let prev = lb < 256 ? prevRow : new Int32Array(lb + 1);
	let curr = lb < 256 ? currRow : new Int32Array(lb + 1);
	for (let i = 0; i <= lb; i++) prev[i] = i;
	for (let i = 1; i <= la; i++) {
		curr[0] = i;
		for (let j = 1; j <= lb; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		const temp = prev;
		prev = curr;
		curr = temp;
	}
	return prev[lb];
}
/** Kiểm tra fuzzy match: distance <= threshold dựa trên độ dài từ */
function isFuzzyMatch(word, target, maxRatio = .3) {
	const maxDist = Math.max(1, Math.floor(target.length * maxRatio));
	return levenshtein(word, target) <= maxDist;
}
/**
* Trích snippet chứa từ khóa (±context words xung quanh).
* Trả về dòng đầu tiên chứa bất kỳ query token nào.
*/
function extractSnippet(content, queryTokens, maxLen = 120) {
	const lines = content.split("\n").filter((l) => l.trim().length > 0);
	const lowerTokens = queryTokens.map((t) => t.toLowerCase());
	for (const line of lines) {
		const lowerLine = line.toLowerCase();
		if (lowerTokens.some((t) => lowerLine.includes(t))) {
			const trimmed = line.trim();
			if (trimmed.length <= maxLen) return trimmed;
			return `${trimmed.slice(0, maxLen - 3)}...`;
		}
	}
	const first = lines.find((l) => !l.startsWith("---"))?.trim() ?? "";
	if (first.length <= maxLen) return first;
	return `${first.slice(0, maxLen - 3)}...`;
}
/** Tính term frequency: số lần xuất hiện / tổng tokens */
function tf(term, tokens) {
	if (tokens.length === 0) return 0;
	return tokens.filter((t) => t === term).length / tokens.length;
}
/** Tính inverse document frequency: log(N / df) */
function idf(term, docs) {
	const df = docs.filter((d) => d.tokens.includes(term)).length;
	if (df === 0) return 0;
	return Math.log(docs.length / df);
}
/** Tính TF-IDF + fuzzy score cho một document với query tokens */
function scoreDocAgainstQuery(doc, queryTokens, idfScores, allDocs) {
	let tfidfScore = 0;
	let exactHits = 0;
	let fuzzyHits = 0;
	for (const term of queryTokens) {
		const termTf = tf(term, doc.tokens);
		const termIdf = idfScores.get(term) ?? 0;
		tfidfScore += termTf * termIdf;
		if (termTf > 0) exactHits++;
		else {
			const fuzzyToken = doc.tokens.find((t) => isFuzzyMatch(t, term));
			if (fuzzyToken) {
				fuzzyHits++;
				const fuzzyIdf = idf(fuzzyToken, allDocs);
				tfidfScore += .3 * (fuzzyIdf > 0 ? fuzzyIdf : 1);
			}
		}
	}
	return {
		tfidfScore,
		exactHits,
		fuzzyHits
	};
}
/** Normalize raw TF-IDF score to 0..1 range với name bonus */
function normalizeScore(rawScore, queryTokens, idfScores, docName) {
	const maxPossible = queryTokens.reduce((sum, t) => sum + (idfScores.get(t) ?? 0), 0);
	const normalized = maxPossible > 0 ? Math.min(1, rawScore / maxPossible) : Math.min(1, rawScore);
	const nameBonus = queryTokens.some((t) => docName.toLowerCase().includes(t)) ? .2 : 0;
	return Math.min(1, normalized + nameBonus);
}
/** Phân loại match type dựa trên exact/fuzzy hit counts */
function classifyMatchType(exactHits, fuzzyHits) {
	if (exactHits > 0 && fuzzyHits === 0) return "exact";
	if (fuzzyHits > 0 && exactHits === 0) return "fuzzy";
	return "tfidf";
}
const docTokenCache = /* @__PURE__ */ new Map();
/**
* Tìm kiếm thông minh với TF-IDF + fuzzy matching.
* @param docs Map<skillName, fileContent>
* @param query Chuỗi tìm kiếm
* @returns Kết quả sắp xếp theo score giảm dần
*/
function searchWithTfIdf(docs, query) {
	const queryTokens = tokenize(query);
	if (queryTokens.length === 0) return [];
	const docTokensList = [];
	for (const [name, content] of docs) {
		let tokens;
		const cached = docTokenCache.get(name);
		if (cached && cached.content === content) tokens = cached.tokens;
		else {
			tokens = tokenize(`${name} ${content}`);
			docTokenCache.set(name, {
				content,
				tokens
			});
		}
		docTokensList.push({
			name,
			tokens,
			content
		});
	}
	const idfScores = /* @__PURE__ */ new Map();
	for (const term of queryTokens) idfScores.set(term, idf(term, docTokensList));
	const results = [];
	for (const doc of docTokensList) {
		const { tfidfScore, exactHits, fuzzyHits } = scoreDocAgainstQuery(doc, queryTokens, idfScores, docTokensList);
		if (tfidfScore <= 0) continue;
		const finalScore = normalizeScore(tfidfScore, queryTokens, idfScores, doc.name);
		results.push({
			name: doc.name,
			score: Math.round(finalScore * 100) / 100,
			matchType: classifyMatchType(exactHits, fuzzyHits),
			snippet: extractSnippet(doc.content, queryTokens)
		});
	}
	results.sort((a, b) => b.score - a.score);
	return results;
}
//#endregion
//#region src/policies/skill-registry.ts
var SkillRegistryError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "SkillRegistryError";
	}
};
/** Đảm bảo thư mục kho skill tồn tại */
function ensureSkillsDir(ctx) {
	if (!fs$1.existsSync(ctx.skillsDir)) fs$1.mkdirSync(ctx.skillsDir, { recursive: true });
}
/** Lấy path của một skill file */
function skillPath(ctx, name) {
	return path.join(ctx.skillsDir, `${name}.md`);
}
/** Kiểm tra skill có tồn tại không */
function skillExists(ctx, name) {
	return fs$1.existsSync(skillPath(ctx, name));
}
/** Liệt kê tất cả skills */
function listSkills(ctx) {
	ensureSkillsDir(ctx);
	return fs$1.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md")).map((f) => ({
		name: f.replace(/\.md$/, ""),
		path: path.join(ctx.skillsDir, f)
	}));
}
/** Đọc nội dung một skill */
function getSkill(ctx, name) {
	const p = skillPath(ctx, name);
	if (!fs$1.existsSync(p)) throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
	return fs$1.readFileSync(p, "utf8").replace(/\r\n?/g, "\n");
}
/** Tìm kiếm thông minh với TF-IDF + fuzzy matching */
function searchSkillsSemantic(ctx, query, tag) {
	ensureSkillsDir(ctx);
	const lowerTag = tag?.toLowerCase();
	const files = fs$1.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
	const docs = /* @__PURE__ */ new Map();
	for (const file of files) {
		const name = file.replace(/\.md$/, "");
		const content = fs$1.readFileSync(path.join(ctx.skillsDir, file), "utf8");
		if (lowerTag) {
			if (!(parseFrontmatter(content).tags ?? []).map((t) => t.toLowerCase()).includes(lowerTag)) continue;
		}
		docs.set(name, content);
	}
	return searchWithTfIdf(docs, query);
}
//#endregion
//#region src/policies/analytics.ts
function getAnalyticsPath(ctx) {
	return path.join(ctx.skillsDir, "analytics.json");
}
function readAnalytics(ctx) {
	const p = getAnalyticsPath(ctx);
	if (!fs$1.existsSync(p)) return {};
	try {
		const raw = fs$1.readFileSync(p, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
function writeAnalytics(ctx, data) {
	const p = getAnalyticsPath(ctx);
	if (!fs$1.existsSync(ctx.skillsDir)) fs$1.mkdirSync(ctx.skillsDir, { recursive: true });
	fs$1.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
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
async function runApply(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		if (!await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).getSkill(name)) {
			handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}" trong kho tổng.`));
			return;
		}
		const sourcePath = path.join(ctx.skillsDir, `${name}.md`);
		const targetDir = path.join(process.cwd(), ".agents", "skills", name);
		const targetPath = path.join(targetDir, "SKILL.md");
		fs$1.mkdirSync(targetDir, { recursive: true });
		fs$1.rmSync(targetPath, { force: true });
		let method = "Copy";
		try {
			fs$1.symlinkSync(sourcePath, targetPath, "file");
			method = "Symlink";
		} catch {
			fs$1.copyFileSync(sourcePath, targetPath);
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
async function runCreate(ctx, rawName, opts) {
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
		if (!rawName) {
			handleError(/* @__PURE__ */ new Error("Vui lòng cung cấp tên skill. Ví dụ: ai-skills create my-skill"));
			return;
		}
		const name = validateSkillName(rawName);
		const templateId = opts.template ?? "coding-guide";
		const template = getTemplate(templateId);
		if (!template) {
			const available = listTemplates().map((t) => t.id).join(", ");
			handleError(/* @__PURE__ */ new Error(`Template "${templateId}" không tồn tại. Các template có sẵn: ${available}`));
			return;
		}
		const repo = new FileSystemSkillRepository(ctx.skillsDir);
		const service = new SkillApplicationService(repo);
		if (await repo.exists(name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (await repo.exists(name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		const description = opts.description ?? `Kỹ năng ${name}`;
		const content = template.generate(name, description, opts.tags);
		await service.createSkillFromContent(name, content, opts.force);
		success(`Đã tạo kỹ năng "${name}" từ template "${template.id}"!`);
		info(`Chỉnh sửa file tại: ${ctx.skillsDir}/${name}.md`);
		info(`Thêm nội dung phù hợp với dự án của bạn.`);
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
		fs$1.writeFileSync(fileA, contentOld, "utf8");
		fs$1.writeFileSync(fileB, contentNew, "utf8");
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
			const execErr = err;
			if (execErr.status === 1 && execErr.stdout) {
				let diffStr = execErr.stdout;
				diffStr = diffStr.replace(new RegExp(`a/${fileA.replace(/\\/g, "/")}`, "g"), `a/${skillName}.md (current)`);
				diffStr = diffStr.replace(new RegExp(`b/${fileB.replace(/\\/g, "/")}`, "g"), `b/${skillName}.md (incoming)`);
				diffStr = diffStr.replace(new RegExp(`--- a/.*${skillName}_old.*\\.md`), `--- a/${skillName}.md (current)`);
				diffStr = diffStr.replace(new RegExp(`\\+\\+\\+ b/.*${skillName}_new.*\\.md`), `+++ b/${skillName}.md (incoming)`);
				return diffStr;
			}
			throw new DiffError(`Không thể chạy lệnh git diff. Vui lòng đảm bảo Git đã được cài đặt: ${execErr.message}`);
		}
	} finally {
		if (fs$1.existsSync(fileA)) fs$1.unlinkSync(fileA);
		if (fs$1.existsSync(fileB)) fs$1.unlinkSync(fileB);
	}
}
//#endregion
//#region src/commands/diff.ts
async function runDiff(ctx, name, filePath) {
	try {
		const skill = await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).getSkill(name);
		if (!skill) {
			fatal(`Không tìm thấy kỹ năng "${name}" trong kho lưu trữ.`);
			return;
		}
		const absolutePath = path.resolve(process.cwd(), filePath);
		if (!fs$1.existsSync(absolutePath)) {
			fatal(`Không tìm thấy file "${filePath}" để so sánh.`);
			return;
		}
		const currentContent = skill.content;
		const diffOutput = generateDiff(name, currentContent, fs$1.readFileSync(absolutePath, "utf8"));
		if (diffOutput) console.log(diffOutput);
		else console.log(`Kỹ năng "${name}" không có thay đổi nào so với file "${filePath}".`);
	} catch (err) {
		if (err instanceof DiffError) {
			fatal(err.message);
			return;
		}
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
			fs$1.writeFileSync(skillPath(ctx, skill.name), skill.content, "utf8");
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
async function runExport(ctx, outputFile, skills, opts) {
	try {
		const service = new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir));
		const allSkills = await service.getAllSkills();
		let toExport = [];
		if (opts.all) toExport = allSkills.map((s) => s.id);
		else if (opts.tag) {
			const lowerTag = opts.tag.toLowerCase();
			for (const skill of allSkills) if (skill.getTags().some((t) => t.value === lowerTag)) toExport.push(skill.id);
		} else toExport = skills;
		if (opts.withDeps) {
			const visited = /* @__PURE__ */ new Set();
			async function addDeps(name) {
				if (visited.has(name)) return;
				visited.add(name);
				const dep = await service.getSkill(name);
				if (dep) for (const req of dep.getRequirements()) await addDeps(req);
			}
			for (const s of toExport) await addDeps(s);
			toExport = Array.from(visited);
		}
		if (toExport.length === 0) {
			warn("Không có skill nào để export.");
			return;
		}
		info(`Đang đóng gói ${toExport.length} skills...`);
		const bundleStr = exportBundle(ctx, toExport);
		const outputPath = path.resolve(process.cwd(), outputFile);
		fs$1.writeFileSync(outputPath, bundleStr, "utf8");
		success(`Đã export ${toExport.length} skills ra file "${outputFile}".`);
	} catch (err) {
		if (err instanceof BundleError) {
			fatal(err.message);
			return;
		}
		handleError(err);
	}
}
//#endregion
//#region src/policies/project-analyzer.ts
/** Mapping: dependency name → framework/tool label */
const FRAMEWORK_MAP = {
	react: "react",
	"react-dom": "react",
	next: "nextjs",
	vue: "vue",
	nuxt: "nuxt",
	svelte: "svelte",
	"@sveltejs/kit": "sveltekit",
	angular: "angular",
	"@angular/core": "angular",
	express: "express",
	fastify: "fastify",
	koa: "koa",
	hono: "hono",
	nestjs: "nestjs",
	"@nestjs/core": "nestjs",
	prisma: "prisma",
	"@prisma/client": "prisma",
	drizzle: "drizzle",
	"drizzle-orm": "drizzle",
	mongoose: "mongoose",
	sequelize: "sequelize",
	"socket.io": "socketio",
	graphql: "graphql",
	"@apollo/server": "apollo",
	trpc: "trpc",
	"@trpc/server": "trpc",
	tailwindcss: "tailwind",
	"styled-components": "styled-components",
	electron: "electron",
	"react-native": "react-native",
	expo: "expo",
	three: "threejs"
};
const TOOL_MAP = {
	vitest: "vitest",
	jest: "jest",
	mocha: "mocha",
	cypress: "cypress",
	playwright: "playwright",
	"@testing-library/react": "testing-library",
	eslint: "eslint",
	"@biomejs/biome": "biome",
	prettier: "prettier",
	typescript: "typescript",
	tsx: "tsx",
	tsdown: "tsdown",
	tsup: "tsup",
	vite: "vite",
	webpack: "webpack",
	esbuild: "esbuild",
	rollup: "rollup",
	commander: "commander",
	yargs: "yargs",
	zod: "zod",
	joi: "joi",
	dotenv: "dotenv",
	husky: "husky",
	"lint-staged": "lint-staged",
	storybook: "storybook",
	"@storybook/react": "storybook",
	docker: "docker"
};
/** Đọc package.json nếu có */
function readPackageJson(dir) {
	const pkgPath = path.join(dir, "package.json");
	if (!fs$1.existsSync(pkgPath)) return null;
	try {
		return JSON.parse(fs$1.readFileSync(pkgPath, "utf8"));
	} catch {
		return null;
	}
}
/** Trích xuất dependencies từ package.json */
function extractDeps(pkg) {
	const deps = /* @__PURE__ */ new Set();
	for (const key of [
		"dependencies",
		"devDependencies",
		"optionalDependencies",
		"peerDependencies"
	]) {
		const section = pkg[key];
		if (section && typeof section === "object") for (const dep of Object.keys(section)) deps.add(dep);
	}
	return [...deps];
}
/** Detect frameworks từ dependency list */
function detectFrameworks(deps) {
	const frameworks = /* @__PURE__ */ new Set();
	for (const dep of deps) {
		const fw = FRAMEWORK_MAP[dep];
		if (fw) frameworks.add(fw);
	}
	return [...frameworks].sort();
}
/** Detect tools từ dependency list */
function detectTools(deps) {
	const tools = /* @__PURE__ */ new Set();
	for (const dep of deps) {
		const tool = TOOL_MAP[dep];
		if (tool) tools.add(tool);
	}
	return [...tools].sort();
}
/** Detect ngôn ngữ chính */
function detectLanguage(dir, deps) {
	if (deps.includes("typescript") || fs$1.existsSync(path.join(dir, "tsconfig.json"))) return "typescript";
	if (fs$1.existsSync(path.join(dir, "package.json"))) return "javascript";
	for (const marker of [
		"requirements.txt",
		"setup.py",
		"pyproject.toml",
		"Pipfile"
	]) if (fs$1.existsSync(path.join(dir, marker))) return "python";
	return "unknown";
}
/**
* Phân tích dự án tại thư mục chỉ định.
* Đọc package.json, kiểm tra cấu trúc thư mục, và detect tech stack.
*/
function analyzeProject(projectDir) {
	const resolvedDir = path.resolve(projectDir);
	const pkg = readPackageJson(resolvedDir);
	const deps = pkg ? extractDeps(pkg) : [];
	const dirName = path.basename(resolvedDir);
	return {
		name: pkg?.name ?? dirName,
		language: detectLanguage(resolvedDir, deps),
		frameworks: detectFrameworks(deps),
		tools: detectTools(deps),
		hasTests: [
			"test",
			"tests",
			"__tests__",
			"spec"
		].some((d) => fs$1.existsSync(path.join(resolvedDir, d))),
		hasCi: [
			".github/workflows",
			".gitlab-ci.yml",
			".circleci",
			"Jenkinsfile"
		].some((p) => fs$1.existsSync(path.join(resolvedDir, p))),
		hasDocker: [
			"Dockerfile",
			"docker-compose.yml",
			"docker-compose.yaml"
		].some((f) => fs$1.existsSync(path.join(resolvedDir, f)))
	};
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
	fs$1.mkdirSync(path.dirname(skillPath(ctx, entry.name)), { recursive: true });
	fs$1.writeFileSync(skillPath(ctx, entry.name), content, "utf8");
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
		if (!manifest) return;
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
	if (!manifest) return;
	console.log(`${c.ok("✓")} Kết nối thành công (${Object.keys(manifest?.skills).length} skills có sẵn)\n`);
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
async function runGet(ctx, rawName, options = {}) {
	try {
		const name = validateSkillName(rawName);
		if (!options.noSync) syncPull(ctx);
		const service = new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir));
		if (!options.recursive) {
			const skill = await service.getSkill(name);
			if (!skill) throw new Error(`Không tìm thấy kỹ năng: ${name}`);
			const content = formatSkillAsMarkdown(skill);
			trackUsage(ctx, name);
			console.log(content);
			return;
		}
		const visited = /* @__PURE__ */ new Set();
		const maxDepth = 2;
		const output = [];
		async function fetchRecursive(currentName, depth) {
			if (visited.has(currentName) || depth > maxDepth) return;
			visited.add(currentName);
			try {
				const validName = validateSkillName(currentName);
				const skill = await service.getSkill(validName);
				if (!skill) throw new Error("Not found");
				const content = formatSkillAsMarkdown(skill);
				trackUsage(ctx, validName);
				output.push(`\n<!-- ===== BẮT ĐẦU SKILL: ${validName} ===== -->\n`);
				output.push(content);
				output.push(`\n<!-- ===== KẾT THÚC SKILL: ${validName} ===== -->\n`);
				const reqs = skill.getRequirements();
				if (reqs && reqs.length > 0) for (const req of reqs) await fetchRecursive(req, depth + 1);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				output.push(`\n<!-- [LỖI] Không thể lấy phụ thuộc: ${currentName} (${msg}) -->\n`);
			}
		}
		await fetchRecursive(name, 0);
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
			const skillName = skill.name;
			const attrs = parseFrontmatter(getSkill(ctx, skillName));
			nodes.push({
				id: skillName,
				label: skillName,
				description: attrs.description || "",
				tags: attrs.tags || []
			});
			const requires = attrs.requires || [];
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
				const pathsToTry = [
					path.join(__dirname, "viewer", "index.html"),
					path.join(__dirname, "..", "viewer", "index.html"),
					path.join(process.cwd(), "dist", "viewer", "index.html"),
					path.join(process.cwd(), "src", "viewer", "index.html")
				];
				let html = "";
				for (const p of pathsToTry) if (fs$1.existsSync(p)) {
					html = fs$1.readFileSync(p, "utf8");
					break;
				}
				if (html) {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(html);
				} else {
					res.writeHead(404);
					res.end(`Viewer HTML not found. Looked in: ${pathsToTry.join(", ")}`);
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
async function runImport(ctx, inputFile, opts) {
	try {
		const inputPath = path.resolve(process.cwd(), inputFile);
		if (!fs$1.existsSync(inputPath)) {
			fatal(`Không tìm thấy file "${inputFile}".`);
			return;
		}
		const bundle = parseBundle(fs$1.readFileSync(inputPath, "utf8"));
		console.log(`Đọc bundle thành công (chứa ${bundle.skills.length} skills).`);
		const service = new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir));
		if (opts.diff) {
			let hasDiff = false;
			for (const skill of bundle.skills) {
				const existing = await service.getSkill(skill.name);
				if (existing) {
					const diffOutput = generateDiff(skill.name, existing.content, skill.content);
					if (diffOutput) {
						hasDiff = true;
						console.log(`\n${c.bold(`Sự khác biệt cho kỹ năng "${skill.name}":`)}`);
						console.log(diffOutput);
					}
				} else {
					hasDiff = true;
					console.log(`\n${c.ok("+")} Kỹ năng "${skill.name}" là kỹ năng mới (chưa tồn tại cục bộ).`);
				}
			}
			if (!hasDiff) console.log("\nKhông có sự thay đổi nào cho các kỹ năng trong bundle.");
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
		if (err instanceof BundleError) {
			fatal(err.message);
			return;
		}
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
//#region src/commands/learn.ts
async function runLearn(ctx, topic, lesson, options = {}) {
	try {
		const cleanTopic = validateSkillName(topic.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, ""));
		const skillName = `learned-${cleanTopic}`;
		const service = new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir));
		const newEntry = `- **[${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}]**: ${lesson}`;
		const initialContent = `---
name: ${skillName}
description: Tự động ghi lại các bài học và kinh nghiệm rút ra liên quan đến chủ đề ${cleanTopic}.
tags: [learned, ${cleanTopic}]
---

# Sổ tay học tập: ${cleanTopic.toUpperCase()}

Kỹ năng này là một tập hợp các bài học, quy tắc và kinh nghiệm tự động được tích lũy bởi AI Agent sau các lần gỡ lỗi hoặc cấu hình thực tế. Hãy luôn đọc kỹ sổ tay này trước khi làm việc với ${cleanTopic} để tránh lặp lại sai lầm.

## Những bài học đã ghi nhận

${newEntry}
`;
		const { isNew } = await service.appendLesson(skillName, lesson, initialContent);
		if (isNew) console.log(pc.blue(`ℹ Đang tạo sổ tay học tập mới "${skillName}"...`));
		else console.log(pc.blue(`ℹ Đang cập nhật bài học mới vào sổ tay "${skillName}"...`));
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
//#region src/commands/list.ts
async function runList(ctx) {
	syncPull(ctx);
	const skills = await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).getAllSkills();
	if (skills.length === 0) {
		console.log(c.dim("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <đường_dẫn_file>"));
		return;
	}
	console.log(c.bold(`Danh sách kỹ năng (${skills.length}):`));
	const sorted = skills.sort((a, b) => a.name.localeCompare(b.name));
	for (const skill of sorted) console.log(`  ${c.ok("•")} ${skill.name}`);
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
	const { meta } = parseSkillFile(content);
	const keywords = matchKeywords(profile, lowerName, lowerContent, meta.description?.toLowerCase() ?? "", (meta.tags ?? []).map((t) => t.toLowerCase()));
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
async function recommendSkills(ctx, profile, availableSkills, maxResults = 5) {
	const recommendations = [];
	const promises = availableSkills.map(async (skill) => {
		try {
			const p = path.join(ctx.skillsDir, `${skill.name}.md`);
			return {
				skill,
				content: await fs.readFile(p, "utf-8")
			};
		} catch {
			return null;
		}
	});
	const loadedSkills = (await Promise.all(promises)).filter((s) => s !== null);
	for (const { skill, content } of loadedSkills) {
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
async function runRecommend(ctx, opts) {
	syncPull(ctx);
	const profile = analyzeProject(opts.dir ?? process.cwd());
	console.log(c.bold("📁 Phân tích dự án:\n"));
	console.log(`  Tên:        ${c.accent(profile.name)}`);
	console.log(`  Ngôn ngữ:   ${profile.language}`);
	console.log(`  Frameworks: ${profile.frameworks.length > 0 ? profile.frameworks.join(", ") : c.dim("không phát hiện")}`);
	console.log(`  Tools:      ${profile.tools.length > 0 ? profile.tools.join(", ") : c.dim("không phát hiện")}`);
	console.log(`  Tests:      ${profile.hasTests ? c.ok("✓") : c.dim("✗")}`);
	console.log(`  CI/CD:      ${profile.hasCi ? c.ok("✓") : c.dim("✗")}`);
	console.log(`  Docker:     ${profile.hasDocker ? c.ok("✓") : c.dim("✗")}`);
	console.log();
	const skills = await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).getAllSkills();
	if (skills.length === 0) {
		info("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <file>");
		return;
	}
	const recommendations = await recommendSkills(ctx, profile, skills.map((s) => ({
		name: s.id,
		path: `${ctx.skillsDir}/${s.id}.md`
	})));
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
	info("Apply bằng: ai-skills apply <tên>");
}
//#endregion
//#region src/commands/remove.ts
async function runRemove(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		syncPull(ctx);
		await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).deleteSkill(name);
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
		if (!fs$1.existsSync(skillFilePath)) skillFilePath = skillPath(ctx, name);
		if (!fs$1.existsSync(skillFilePath)) handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}".`));
		const scriptContent = extractBashHook(fs$1.readFileSync(skillFilePath, "utf8"));
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
			const errMsg = e instanceof Error ? e.message : String(e);
			if (os.platform() === "win32" && errMsg.includes("ENOENT")) handleError(/* @__PURE__ */ new Error("Không tìm thấy 'bash' trên Windows. Hãy chắc chắn bạn đã cài Git Bash hoặc WSL và đưa vào PATH."));
			else throw e;
		}
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/search.ts
/** Hiển thị kết quả TF-IDF/fuzzy search (legacy policy path) */
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
/** Hiển thị kết quả brute-force search (từ Application Service) */
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
		console.log(`  ${c.ok("•")} ${r.id} ${c.dim(`(khớp trong: ${tags.join(", ")})`)}`);
	}
}
async function runSearch(ctx, keyword, opts = {}) {
	syncPull(ctx);
	if (opts.semantic) displaySemanticResults(searchSkillsSemantic(ctx, keyword, opts.tag), keyword);
	else displayBruteForceResults(await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).searchSkills(keyword, opts.tag), keyword);
}
//#endregion
//#region src/commands/stats.ts
async function runStats(ctx) {
	try {
		const skills = await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).getAllSkills();
		if (skills.length === 0) {
			console.log(c.dim("Kho kỹ năng trống. Hãy dùng lệnh `create` hoặc `add` để thêm."));
			return;
		}
		const tagCounts = /* @__PURE__ */ new Map();
		for (const skill of skills) {
			const tags = skill.getTags().map((t) => t.value.toLowerCase());
			for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
		}
		success("Thống kê kho kỹ năng:");
		console.log(`  ${c.ok("•")} Tổng số kỹ năng: ${c.bold(String(skills.length))}`);
		if (tagCounts.size > 0) {
			console.log(`  ${c.ok("•")} Phân bố tags:`);
			const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
			for (const [tag, count] of sortedTags) console.log(`      - ${c.accent(tag)}: ${count}`);
		} else console.log(c.dim("  (Không có tags nào được sử dụng)"));
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
async function runTagAdd(ctx, skillName, tags) {
	if (tags.length === 0) {
		fatal("Cần ít nhất 1 tag. Ví dụ: ai-skills tag add my-skill frontend web");
		return;
	}
	const service = new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir));
	try {
		const skill = await service.addTagsToSkill(skillName, tags);
		console.log(`${c.ok("✓")}  Tags của "${skillName}":`);
		console.log(`   ${skill.getTags().map((t) => c.accent(t.value)).join("  ")}`);
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		if (errMsg.includes("not found")) fatal(`Không tìm thấy skill "${skillName}".`);
		else fatal(errMsg);
	}
}
async function runTagRemove(ctx, skillName, tag) {
	const service = new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir));
	try {
		const skill = await service.removeTagFromSkill(skillName, tag);
		console.log(`${c.ok("✓")}  Đã xóa tag "${tag}" khỏi "${skillName}".`);
		const remaining = skill.getTags();
		if (remaining.length > 0) console.log(`   Tags còn lại: ${remaining.map((t) => c.accent(t.value)).join("  ")}`);
		else console.log(`   ${c.dim("(không còn tag nào)")}`);
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		if (errMsg.includes("not found")) fatal(`Không tìm thấy skill "${skillName}".`);
		else fatal(errMsg);
	}
}
async function runTagList(ctx) {
	const { tagMap, untagged } = await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).getTagsOverview();
	Array.from(tagMap.values()).flat().length + untagged.length;
	if (tagMap.size === 0 && untagged.length === 0) {
		console.log(c.dim("Không có skill nào."));
		return;
	}
	console.log(`\n${c.bold("Tags trong kho kỹ năng:")}\n`);
	const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	for (const [tag, names] of sortedTags) {
		const uniqueNames = Array.from(new Set(names)).sort();
		const count = c.dim(`(${uniqueNames.length} skill)`);
		console.log(`  ${c.accent(tag.padEnd(24))} ${count}`);
		for (const n of uniqueNames) console.log(`    ${c.dim("•")} ${n}`);
	}
	if (untagged.length > 0) console.log(`\n  ${c.dim(`(untagged: ${untagged.length} skills)`)}`);
	console.log(`\n${c.dim(`Tổng: ${tagMap.size} tags`)}`);
}
async function runTagRename(ctx, oldTag, newTag) {
	if (!newTag || newTag.trim() === "") {
		fatal("Tên tag mới không được để trống.");
		return;
	}
	const renamedCount = await new SkillApplicationService(new FileSystemSkillRepository(ctx.skillsDir)).renameTag(oldTag, newTag);
	if (renamedCount === 0) {
		console.log(`${c.warn("⚠")}  Tag "${oldTag}" không tìm thấy trong bất kỳ skill nào.`);
		return;
	}
	console.log(`\n${c.ok("✓")} Đã đổi "${oldTag}" → "${newTag}" trong ${renamedCount} skill.`);
}
async function runTag(ctx, action, args) {
	switch (action) {
		case "add": {
			const [skill, ...tags] = args;
			if (!skill) {
				fatal("Usage: ai-skills tag add <skill> <tag1> [tag2...]");
				return;
			}
			await runTagAdd(ctx, skill, tags);
			break;
		}
		case "remove":
		case "rm": {
			const [skill, tag] = args;
			if (!skill || !tag) {
				fatal("Usage: ai-skills tag remove <skill> <tag>");
				return;
			}
			await runTagRemove(ctx, skill, tag);
			break;
		}
		case "list":
		case "ls":
			await runTagList(ctx);
			break;
		case "rename":
		case "mv": {
			const [oldTag, newTag] = args;
			if (!oldTag || !newTag) {
				fatal("Usage: ai-skills tag rename <old-tag> <new-tag>");
				return;
			}
			await runTagRename(ctx, oldTag, newTag);
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
//#region src/context.ts
/** Thư mục lưu toàn bộ skill files (~/.ai-skills) */
const SKILLS_DIR = path.join(os.homedir(), ".ai-skills");
function createCliContext(overrides = {}) {
	return {
		skillsDir: SKILLS_DIR,
		verbose: false,
		projectDir: process.cwd(),
		...overrides
	};
}
//#endregion
//#region src/version.ts
/** Single source of truth cho CLI version — đồng bộ với package.json */
const CLI_VERSION = "1.3.0";
//#endregion
//#region src/index.ts
const ctx = createCliContext();
program.name("ai-skills").description("CLI Tool — Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)").version(CLI_VERSION);
program.command("init-sync <url>").description("Khởi tạo đồng bộ Git cho kho kỹ năng (liên kết với Cloud repo)").action((url) => runInitSync(ctx, url));
program.command("list").description("Liệt kê danh sách tất cả các kỹ năng đang có").action(async () => await runList(ctx));
program.command("get <name>").description("Đọc và in ra nội dung của một kỹ năng cụ thể").option("--no-sync", "Bỏ qua việc đồng bộ git tự động").option("-r, --recursive", "Tự động tải nội dung của các skill phụ thuộc (thông qua requires)").action(async (name, opts) => await runGet(ctx, name, {
	noSync: !opts.sync,
	recursive: opts.recursive
}));
program.command("add <name> <file_path>").description("Thêm một kỹ năng mới từ file Markdown có sẵn").option("--no-sync", "Bỏ qua việc đồng bộ git tự động").action(async (name, filePath, opts) => await runAdd(ctx, name, filePath, { noSync: !opts.sync }));
program.command("learn <topic> <lesson>").description("Tự động trích xuất bài học và ghi vào sổ tay kỹ năng (learned-<topic>)").option("--no-sync", "Bỏ qua việc đồng bộ git tự động").action(async (topic, lesson, opts) => await runLearn(ctx, topic, lesson, opts));
program.command("graph").description("Khởi động Web Viewer để xem đồ thị liên kết kỹ năng (Knowledge Graph)").action(() => runGraph(ctx));
program.command("remove <name>").alias("rm").description("Xóa một kỹ năng khỏi kho lưu trữ").action(async (name) => await runRemove(ctx, name));
program.command("search <keyword>").description("Tìm kiếm kỹ năng theo tên hoặc nội dung").option("-s, --semantic", "Tìm kiếm thông minh với TF-IDF + fuzzy matching").option("--tag <tag>", "Lọc kết quả theo tag").action(async (keyword, opts) => await runSearch(ctx, keyword, opts));
program.command("apply <name>").description("Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)").action(async (name) => await runApply(ctx, name));
program.command("run <name>").description("Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng").option("-y, --yes", "Bỏ qua xác nhận (dùng cho automation)").action((name, opts) => runRun(ctx, name, opts));
program.command("create [name]").description("Tạo kỹ năng mới từ template có sẵn").option("-t, --template <id>", "Chọn template (mặc định: basic)").option("-d, --description <text>", "Mô tả ngắn cho kỹ năng").option("--tags <tags...>", "Danh sách tags (cách nhau bởi dấu cách)").option("--force", "Ghi đè nếu skill đã tồn tại").option("--list-templates", "Liệt kê các template có sẵn").action(async (name, opts) => await runCreate(ctx, name, opts));
program.command("recommend").description("Phân tích dự án và gợi ý kỹ năng phù hợp").option("--dir <path>", "Thư mục dự án cần phân tích (mặc định: thư mục hiện tại)").action(async (opts) => await runRecommend(ctx, opts));
program.command("update").description("Cập nhật kho kỹ năng từ Cloud (Git Pull)").action(() => runUpdate(ctx));
program.command("stats").description("Xem thống kê kho kỹ năng và tags").action(async () => await runStats(ctx));
program.command("audit").alias("analytics").description("Phân tích dữ liệu sử dụng kỹ năng và đề xuất dọn dẹp").action(() => runAudit(ctx));
program.command("diff <name> <file>").description("So sánh kỹ năng trong kho với file bên ngoài").action(async (name, file) => await runDiff(ctx, name, file));
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
].join("\n")).action(async (action, args) => await runTag(ctx, action, args));
program.command("export <file> [skills...]").description("Đóng gói skills thành một file JSON").option("--tag <tag>", "Export các skills có chứa tag này").option("--all", "Export toàn bộ kho kỹ năng").option("--with-deps", "Bao gồm cả các skill phụ thuộc (thông qua requires)").action(async (file, skills, opts) => await runExport(ctx, file, skills, opts));
program.command("import <file>").description("Nhập các skills từ file bundle JSON").option("--force", "Ghi đè nếu skill đã tồn tại").option("--diff", "So sánh khác biệt thay vì ghi đè").action(async (file, opts) => await runImport(ctx, file, opts));
program.parseAsync().catch((err) => {
	console.error(err);
	process.exit(1);
});
//#endregion
export {};
