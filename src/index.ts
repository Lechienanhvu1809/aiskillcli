#!/usr/bin/env node
import { program } from "commander";
import { runAdd } from "./commands/add.js";
import { runApply } from "./commands/apply.js";
import { type CreateOptions, runCreate } from "./commands/create.js";
import { runDiff } from "./commands/diff.js";
import { type ExportOptions, runExport } from "./commands/export.js";
import { type FetchOptions, runFetch } from "./commands/fetch.js";
import { runGet } from "./commands/get.js";
import { type ImportOptions, runImport } from "./commands/import.js";
import { runInitSync } from "./commands/init-sync.js";
import { runList } from "./commands/list.js";
import { type RecommendOptions, runRecommend } from "./commands/recommend.js";
import { runRemove } from "./commands/remove.js";
import { runRun } from "./commands/run.js";
import { runSearch, type SearchOptions } from "./commands/search.js";
import { runStats } from "./commands/stats.js";
import { runTag } from "./commands/tag.js";
import { runUpdate } from "./commands/update.js";
import { createCliContext } from "./context.js";
import { CLI_VERSION } from "./version.js";

const ctx = createCliContext();

program
  .name("ai-skills")
  .description("CLI Tool — Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)")
  .version(CLI_VERSION);

program
  .command("init-sync <url>")
  .description("Khởi tạo đồng bộ Git cho kho kỹ năng (liên kết với Cloud repo)")
  .action((url: string) => runInitSync(ctx, url));

program
  .command("list")
  .description("Liệt kê danh sách tất cả các kỹ năng đang có")
  .action(() => runList(ctx));

program
  .command("get <name>")
  .description("Đọc và in ra nội dung của một kỹ năng cụ thể")
  .option("--no-sync", "Bỏ qua việc đồng bộ git tự động")
  .action((name: string, opts: { sync?: boolean }) => runGet(ctx, name, { noSync: !opts.sync }));

program
  .command("add <name> <file_path>")
  .description("Thêm một kỹ năng mới từ file Markdown có sẵn")
  .option("--force", "Ghi đè nếu skill đã tồn tại")
  .option("--tags <tags...>", "Danh sách tags (cách nhau bởi dấu cách)")
  .action((name: string, filePath: string, opts: { force?: boolean; tags?: string[] }) =>
    runAdd(ctx, name, filePath, opts),
  );

program
  .command("remove <name>")
  .alias("rm")
  .description("Xóa một kỹ năng khỏi kho lưu trữ")
  .action((name: string) => runRemove(ctx, name));

program
  .command("search <keyword>")
  .description("Tìm kiếm kỹ năng theo tên hoặc nội dung")
  .option("-s, --semantic", "Tìm kiếm thông minh với TF-IDF + fuzzy matching")
  .option("--tag <tag>", "Lọc kết quả theo tag")
  .action((keyword: string, opts: SearchOptions) => runSearch(ctx, keyword, opts));

program
  .command("apply <name>")
  .description("Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)")
  .action((name: string) => runApply(ctx, name));

program
  .command("run <name>")
  .description("Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng")
  .option("-y, --yes", "Bỏ qua xác nhận (dùng cho automation)")
  .action((name: string, opts: { yes?: boolean }) => runRun(ctx, name, opts));

program
  .command("create [name]")
  .description("Tạo kỹ năng mới từ template có sẵn")
  .option("-t, --template <id>", "Chọn template (mặc định: basic)")
  .option("-d, --description <text>", "Mô tả ngắn cho kỹ năng")
  .option("--tags <tags...>", "Danh sách tags (cách nhau bởi dấu cách)")
  .option("--force", "Ghi đè nếu skill đã tồn tại")
  .option("--list-templates", "Liệt kê các template có sẵn")
  .action((name: string | undefined, opts: CreateOptions) => runCreate(ctx, name, opts));

program
  .command("recommend")
  .description("Phân tích dự án và gợi ý kỹ năng phù hợp")
  .option("--dir <path>", "Thư mục dự án cần phân tích (mặc định: thư mục hiện tại)")
  .action((opts: RecommendOptions) => runRecommend(ctx, opts));

program
  .command("update")
  .description("Cập nhật kho kỹ năng từ Cloud (Git Pull)")
  .action(() => runUpdate(ctx));

program
  .command("stats")
  .description("Xem thống kê kho kỹ năng và tags")
  .action(() => runStats(ctx));

program
  .command("diff <name> <file>")
  .description("So sánh kỹ năng trong kho với file bên ngoài")
  .action((name: string, file: string) => runDiff(ctx, name, file));

program
  .command("fetch [name]")
  .description("Tải skill từ autoskills registry về kho local")
  .option("--from <bundle>", "Tải toàn bộ skills từ một bundle (vd: wshobson/agents)")
  .option("--auto", "Tự động detect tech stack và fetch skills phù hợp")
  .option("--force", "Ghi đè skill đã tồn tại")
  .option("--diff", "So sánh khác biệt thay vì ghi đè")
  .option("--list", "Chỉ hiển thị danh sách skills có sẵn, không tải")
  .action((name: string | undefined, opts: FetchOptions) => runFetch(ctx, name, opts));

program
  .command("tag <action> [args...]")
  .description("Quản lý tags của skills (add | remove | list | rename)")
  .addHelpText(
    "after",
    [
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
      "    ai-skills tag rename frontend ui",
    ].join("\n"),
  )
  .action((action: string, args: string[]) => runTag(ctx, action, args));

program
  .command("export <file> [skills...]")
  .description("Đóng gói skills thành một file JSON")
  .option("--tag <tag>", "Export các skills có chứa tag này")
  .option("--all", "Export toàn bộ kho kỹ năng")
  .action((file: string, skills: string[], opts: ExportOptions) =>
    runExport(ctx, file, skills, opts),
  );

program
  .command("import <file>")
  .description("Nhập các skills từ file bundle JSON")
  .option("--force", "Ghi đè nếu skill đã tồn tại")
  .option("--diff", "So sánh khác biệt thay vì ghi đè")
  .action((file: string, opts: ImportOptions) => runImport(ctx, file, opts));

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
