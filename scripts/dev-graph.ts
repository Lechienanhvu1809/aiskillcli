import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import pc from "picocolors";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Thư mục gốc chứa source code
const SRC_DIR = path.join(__dirname, "..", "src");

// Thu thập đệ quy tất cả các file .ts
function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllTsFiles(filePath, fileList);
    } else if (file.endsWith(".ts")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// Chuyển đường dẫn absolute thành dạng tương đối (ví dụ: commands/add.ts)
function getRelativeId(absolutePath: string): string {
  // Thay thế .js thành .ts để map đúng tên file trong src (vì import dùng .js)
  let relPath = path.relative(SRC_DIR, absolutePath).replace(/\\/g, "/");
  if (relPath.endsWith(".js")) {
    relPath = relPath.replace(/\.js$/, ".ts");
  }
  return relPath;
}

export function buildDependencyGraph() {
  const files = getAllTsFiles(SRC_DIR);
  const nodes = new Map<string, any>();
  const edges: { from: string; to: string }[] = [];

  const importRegex = /import\s+(?:type\s+)?.*?from\s+["'](.*?)["']/g;
  const exportRegex = /export\s+(?:type\s+)?.*?from\s+["'](.*?)["']/g;
  
  // Regex để tìm các import như: import * as foo from "./foo.js" hoặc import { a } from "./a.js"
  // hoặc import "./a.js" (side effect)
  const allImportsRegex = /(?:import|export)\s+(?:type\s+)?[^"']*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;

  for (const file of files) {
    const id = getRelativeId(file);
    const content = fs.readFileSync(file, "utf8");
    
    // Tạo Node
    if (!nodes.has(id)) {
      const folder = path.dirname(id);
      nodes.set(id, {
        id: id,
        label: path.basename(id),
        description: `Source file: ${id}`,
        group: folder === "." ? "root" : folder,
        tags: [folder]
      });
    }

    // Tìm các import/export
    let match;
    while ((match = allImportsRegex.exec(content)) !== null) {
      // match[1] là import ... from "path"
      // match[2] là import "path"
      const importPath = match[1] || match[2];
      if (importPath && importPath.startsWith(".")) {
        // Tính toán đường dẫn tuyệt đối của file được import
        const dir = path.dirname(file);
        const resolvedAbsolute = path.resolve(dir, importPath);
        
        let targetId = getRelativeId(resolvedAbsolute);
        
        // Tạo edge
        edges.push({
          from: id,
          to: targetId
        });
        
        // Đảm bảo node target cũng tồn tại (dù đôi khi nó có thể là index.ts hoặc đuôi js)
        if (!nodes.has(targetId)) {
          const folder = path.dirname(targetId);
          nodes.set(targetId, {
            id: targetId,
            label: path.basename(targetId),
            description: `Source file: ${targetId}`,
            group: folder === "." ? "root" : folder,
            tags: [folder]
          });
        }
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges
  };
}

function startServer() {
  const PORT = 3114;
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    if (req.url === "/api/graph") {
      const graphData = buildDependencyGraph();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(graphData));
      return;
    }
    
    if (req.url === "/" || req.url === "/index.html") {
      const viewerPath = path.join(__dirname, "..", "src", "viewer", "index.html");
      if (fs.existsSync(viewerPath)) {
        let html = fs.readFileSync(viewerPath, "utf8");
        // Đổi title một chút để phân biệt
        html = html.replace("AI Skills Knowledge Graph", "Source Code Dependency Graph");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end("Viewer HTML not found at: " + viewerPath);
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    console.log(pc.cyan(`\n🕸️  Khởi động Dev Source Graph Viewer thành công!`));
    console.log(pc.white(`👉 Mở trình duyệt tại: ${pc.bold(pc.blue(`http://localhost:${PORT}`))}`));
    console.log(pc.dim("Nhấn Ctrl+C để thoát.\n"));
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(pc.red(`Cổng ${PORT} đã được sử dụng. Hãy đóng tiến trình khác trước.`));
      process.exit(1);
    }
  });
}

startServer();
