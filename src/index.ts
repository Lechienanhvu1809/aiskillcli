import { program } from "commander";
import { createCliContext } from "./context.js";
import { runList } from "./commands/list.js";
import { runGet } from "./commands/get.js";
import { runSearch } from "./commands/search.js";
import { runAdd } from "./commands/add.js";
import { runRemove } from "./commands/remove.js";
import { runApply } from "./commands/apply.js";
import { runRun } from "./commands/run.js";
import { runInitSync } from "./commands/init-sync.js";

const ctx = createCliContext();

program
  .name("ai-skills")
  .description("CLI Tool — Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)")
  .version("1.0.0");

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
  .action((name: string) => runGet(ctx, name));

program
  .command("add <name> <file_path>")
  .description("Thêm một kỹ năng mới từ file Markdown có sẵn")
  .option("--force", "Ghi đè nếu skill đã tồn tại")
  .action((name: string, filePath: string, opts: { force?: boolean }) =>
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
  .action((keyword: string) => runSearch(ctx, keyword));

program
  .command("apply <name>")
  .description("Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)")
  .action((name: string) => runApply(ctx, name));

program
  .command("run <name>")
  .description("Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng")
  .action((name: string) => runRun(ctx, name));

program.parse();
