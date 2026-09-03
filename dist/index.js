import { program } from "commander";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import pc from "picocolors";
//#region src/context.ts
/** Thư mục lưu toàn bộ skill files (~/.ai-skills) */
const SKILLS_DIR = path.join(os.homedir(), ".ai-skills");
function createCliContext(overrides = {}) {
	return {
		skillsDir: SKILLS_DIR,
		verbose: false,
		...overrides
	};
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
	if (!fs.existsSync(ctx.skillsDir)) fs.mkdirSync(ctx.skillsDir, { recursive: true });
}
/** Lấy path của một skill file */
function skillPath(ctx, name) {
	return path.join(ctx.skillsDir, `${name}.md`);
}
/** Kiểm tra skill có tồn tại không */
function skillExists(ctx, name) {
	return fs.existsSync(skillPath(ctx, name));
}
/** Liệt kê tất cả skills */
function listSkills(ctx) {
	ensureSkillsDir(ctx);
	return fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md")).map((f) => ({
		name: f.replace(/\.md$/, ""),
		path: path.join(ctx.skillsDir, f)
	}));
}
/** Đọc nội dung một skill */
function getSkill(ctx, name) {
	const p = skillPath(ctx, name);
	if (!fs.existsSync(p)) throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
	return fs.readFileSync(p, "utf8").replace(/\r\n?/g, "\n");
}
/** Thêm skill từ file có sẵn */
function addSkill(ctx, name, sourcePath, opts = {}) {
	ensureSkillsDir(ctx);
	const absoluteSource = path.resolve(process.cwd(), sourcePath);
	if (!fs.existsSync(absoluteSource)) throw new SkillRegistryError(`Không tìm thấy file nguồn tại "${absoluteSource}".`, "SOURCE_NOT_FOUND");
	const dest = skillPath(ctx, name);
	if (fs.existsSync(dest) && !opts.overwrite) throw new SkillRegistryError(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`, "ALREADY_EXISTS");
	try {
		fs.copyFileSync(absoluteSource, dest);
	} catch (err) {
		throw new SkillRegistryError(`Lỗi khi sao chép file: ${err instanceof Error ? err.message : String(err)}`, "IO_ERROR");
	}
}
/** Xóa một skill */
function removeSkill(ctx, name) {
	const p = skillPath(ctx, name);
	if (!fs.existsSync(p)) throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
	try {
		fs.unlinkSync(p);
	} catch (err) {
		throw new SkillRegistryError(`Lỗi khi xóa file: ${err instanceof Error ? err.message : String(err)}`, "IO_ERROR");
	}
}
/** Tìm kiếm skills theo từ khóa */
function searchSkills(ctx, keyword) {
	ensureSkillsDir(ctx);
	const lowerKw = keyword.toLowerCase();
	const files = fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
	const results = [];
	for (const file of files) {
		const name = file.replace(/\.md$/, "");
		const content = fs.readFileSync(path.join(ctx.skillsDir, file), "utf8");
		const matchedInName = name.toLowerCase().includes(lowerKw);
		const matchedInContent = content.toLowerCase().includes(lowerKw);
		if (matchedInName || matchedInContent) results.push({
			name,
			matchedInName,
			matchedInContent
		});
	}
	return results;
}
//#endregion
//#region src/policies/git-sync.ts
/**
* Business Rule: Git sync cho skill registry.
* Transparent — lỗi git không làm crash CLI, chỉ silently fail.
* Trả về boolean để caller biết có sync thành công không.
*/
function isGitRepo(ctx) {
	return fs.existsSync(path.join(ctx.skillsDir, ".git"));
}
function runGit(ctx, args) {
	try {
		if (!isGitRepo(ctx)) return false;
		execFileSync("git", args, {
			cwd: ctx.skillsDir,
			stdio: "ignore"
		});
		return true;
	} catch {
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
	const added = runGit(ctx, ["add", "."]);
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
					stdio: "ignore"
				});
			} catch {}
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
				stdio: "ignore"
			});
			return {
				ok: true,
				message: "Thiết lập Git Sync thành công!"
			};
		} catch {
			return {
				ok: true,
				message: "Git Sync đã thiết lập cục bộ, nhưng chưa push được. Hãy đảm bảo repo đã được tạo trên GitHub."
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
/** Handle SkillValidationError và SkillRegistryError, gọi fatal cho cả hai */
function handleError(err) {
	if (err instanceof Error) fatal(err.message);
	fatal(String(err));
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
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
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
	const basename = path.basename(withoutExt);
	if (basename !== withoutExt) throw new SkillValidationError(`Tên skill không hợp lệ (phát hiện path traversal): "${rawName}"`);
	if (basename.length === 0) throw new SkillValidationError("Tên skill không được để trống sau khi xử lý.");
	if (basename.length > MAX_SKILL_NAME_LENGTH) throw new SkillValidationError(`Tên skill quá dài (tối đa ${MAX_SKILL_NAME_LENGTH} ký tự). Nhận được: ${basename.length} ký tự.`);
	if (!VALID_NAME_PATTERN.test(basename)) throw new SkillValidationError(`Tên skill chỉ được chứa chữ cái (a-z, A-Z), số (0-9), gạch ngang (-), gạch dưới (_). Nhận được: "${basename}"`);
	return basename;
}
//#endregion
//#region src/commands/get.ts
function runGet(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		syncPull(ctx);
		const content = getSkill(ctx, name);
		console.log(content);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/search.ts
function runSearch(ctx, keyword) {
	syncPull(ctx);
	const results = searchSkills(ctx, keyword);
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
//#endregion
//#region src/commands/add.ts
function runAdd(ctx, rawName, filePath, opts) {
	try {
		const name = validateSkillName(rawName);
		if (skillExists(ctx, name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (skillExists(ctx, name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		addSkill(ctx, name, filePath, { overwrite: opts.force });
		success(`Đã thêm kỹ năng "${name}" vào kho lưu trữ!`);
		syncPush(ctx, `Auto-sync: Add skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/remove.ts
function runRemove(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		removeSkill(ctx, name);
		success(`Đã xóa kỹ năng "${name}".`);
		syncPush(ctx, `Auto-sync: Remove skill ${name}`);
	} catch (err) {
		handleError(err);
	}
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
		if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
		let method = "Copy";
		try {
			fs.symlinkSync(sourcePath, targetPath, "file");
			method = "Symlink";
		} catch {
			try {
				fs.linkSync(sourcePath, targetPath);
				method = "Hardlink";
			} catch {
				fs.copyFileSync(sourcePath, targetPath);
				method = "Copy";
			}
		}
		success(`Đã apply kỹ năng "${name}" vào dự án! (phương thức: ${method})`);
		info(`Đường dẫn: ${targetPath}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/run.ts
/**
* Policy: Trích xuất và chạy bash script từ nội dung Markdown.
*
* ⚠️ BẢO MẬT: Lệnh này thực thi code tùy ý từ file Markdown.
* Chỉ chạy các skill từ nguồn đáng tin cậy.
* Trong tương lai nên sandbox bằng Docker hoặc deno.
*/
function extractBashHook(content) {
	return content.match(/```bash\s+(?:hook|pre-hook)[^\n]*\n([\s\S]*?)```/)?.[1]?.trim() ?? null;
}
function runRun(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		let skillFilePath = path.join(process.cwd(), ".agents", "skills", name, "SKILL.md");
		if (!fs.existsSync(skillFilePath)) skillFilePath = skillPath(ctx, name);
		if (!fs.existsSync(skillFilePath)) handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}".`));
		let scriptContent = extractBashHook(fs.readFileSync(skillFilePath, "utf8"));
		if (!scriptContent) {
			info(`Kỹ năng "${name}" không chứa khối mã \`\`\`bash để thực thi.`);
			return;
		}
		warn("Đang thực thi code từ file Markdown. Chỉ chạy các skill từ nguồn đáng tin cậy!");
		console.log(`\n🚀 Thực thi kỹ năng "${name}"...\n`);
		if (os.platform() === "win32") scriptContent = scriptContent.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
		const output = execSync(scriptContent, {
			encoding: "utf8",
			stdio: "pipe"
		});
		console.log(output);
	} catch (err) {
		if (err instanceof Error && "stdout" in err) {
			const execErr = err;
			if (execErr.stdout) console.log(execErr.stdout);
			if (execErr.stderr) console.error(execErr.stderr);
			handleError(/* @__PURE__ */ new Error(`Lỗi khi thực thi: ${err.message}`));
		}
		handleError(err);
	}
}
//#endregion
//#region src/commands/init-sync.ts
async function runInitSync(ctx, url) {
	info(`Đang thiết lập Git Sync với repo: ${url}...`);
	const result = initSync(ctx, url);
	if (result.ok) {
		success(result.message);
		info("Từ giờ mọi thay đổi sẽ tự động đồng bộ ngầm.");
	} else warn(result.message);
}
//#endregion
//#region src/index.ts
const ctx = createCliContext();
program.name("ai-skills").description("CLI Tool — Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)").version("1.0.0");
program.command("init-sync <url>").description("Khởi tạo đồng bộ Git cho kho kỹ năng (liên kết với Cloud repo)").action((url) => runInitSync(ctx, url));
program.command("list").description("Liệt kê danh sách tất cả các kỹ năng đang có").action(() => runList(ctx));
program.command("get <name>").description("Đọc và in ra nội dung của một kỹ năng cụ thể").action((name) => runGet(ctx, name));
program.command("add <name> <file_path>").description("Thêm một kỹ năng mới từ file Markdown có sẵn").option("--force", "Ghi đè nếu skill đã tồn tại").action((name, filePath, opts) => runAdd(ctx, name, filePath, opts));
program.command("remove <name>").alias("rm").description("Xóa một kỹ năng khỏi kho lưu trữ").action((name) => runRemove(ctx, name));
program.command("search <keyword>").description("Tìm kiếm kỹ năng theo tên hoặc nội dung").action((keyword) => runSearch(ctx, keyword));
program.command("apply <name>").description("Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)").action((name) => runApply(ctx, name));
program.command("run <name>").description("Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng").action((name) => runRun(ctx, name));
program.parse();
//#endregion
export {};
