import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import type { CliContext } from "../context.js";
import { ensureSkillsDir, getSkill, listSkills } from "../policies/skill-registry.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { handleError } from "../utils/output.js";

// Helper để lấy __dirname trong ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runGraph(ctx: CliContext) {
  try {
    ensureSkillsDir(ctx);
    
    // Thu thập dữ liệu graph
    const skills = listSkills(ctx);
    const nodes: any[] = [];
    const edges: any[] = [];
    
    for (const skill of skills) {
      const skillName = typeof skill === "string" ? skill : skill.name;
      const content = getSkill(ctx, skillName);
      const parsed = parseFrontmatter(content);
      const attrs = parsed.attributes || {};
      
      nodes.push({
        id: skillName,
        label: skillName,
        description: attrs.description || "",
        tags: attrs.tags || []
      });
      
      const requires = attrs.requires || [];
      for (const req of requires) {
        edges.push({
          from: skillName,
          to: req
        });
      }
    }

    const graphData = { nodes, edges };

    // Khởi tạo HTTP Server
    const server = http.createServer((req, res) => {
      // Bật CORS (đề phòng)
      res.setHeader("Access-Control-Allow-Origin", "*");
      
      if (req.url === "/api/graph") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(graphData));
        return;
      }
      
      if (req.url === "/" || req.url === "/index.html") {
        // Cố gắng tìm ở nhiều vị trí (do bundle có thể làm thay đổi cấu trúc thư mục)
        const pathsToTry = [
          path.join(__dirname, "viewer", "index.html"), // khi chạy từ dist/index.js
          path.join(__dirname, "..", "viewer", "index.html"), // khi chạy trong src/commands bằng tsx
          path.join(process.cwd(), "dist", "viewer", "index.html"), // fallback 
          path.join(process.cwd(), "src", "viewer", "index.html") // fallback dev
        ];

        let html = "";
        for (const p of pathsToTry) {
          if (fs.existsSync(p)) {
            html = fs.readFileSync(p, "utf8");
            break;
          }
        }

        if (html) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        } else {
          res.writeHead(404);
          res.end("Viewer HTML not found. Looked in: " + pathsToTry.join(", "));
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
    
    server.on('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.error(pc.red(`Cổng ${PORT} đã được sử dụng. Hãy đóng tiến trình khác trước.`));
        process.exit(1);
      }
    });
  } catch (error) {
    handleError(error);
  }
}
