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
      
      nodes.push({
        id: skillName,
        label: skillName,
        description: parsed.attributes.description || "",
        tags: parsed.attributes.tags || []
      });
      
      const requires = parsed.attributes.requires || [];
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
        // Tìm file index.html trong dist/viewer
        const viewerPath = path.join(__dirname, "..", "viewer", "index.html");
        if (fs.existsSync(viewerPath)) {
          const html = fs.readFileSync(viewerPath, "utf8");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        } else {
          // Fallback nếu chạy trong dev (src/viewer)
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
