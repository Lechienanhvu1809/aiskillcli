import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import pc from "picocolors";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, "..");
const EXCLUDE_DIRS = ["node_modules", "dist", ".git", ".agents", "coverage"];

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file);
      if ([".ts", ".js", ".json", ".md", ".html"].includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

function getRelativeId(absolutePath: string): string {
  return path.relative(ROOT_DIR, absolutePath).replace(/\\/g, "/");
}

function analyzeFile(filePath: string, content: string): string {
  const ext = path.extname(filePath);
  let desc = "";

  try {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    const loc = content.split("\n").length;
    desc += `[Stats]\nSize: ${sizeKB} KB\nLines: ${loc}\n\n`;

    if (ext === ".ts" || ext === ".js") {
      const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
      if (jsdocMatch) {
        let cleanDoc = jsdocMatch[1].replace(/\n\s*\*/g, "\n").trim();
        desc += `[Description]\n${cleanDoc}\n\n`;
      }
      const exports = [];
      const exportRegex = /export\s+(?:async\s+)?(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      if (exports.length > 0) {
        desc += `[Exports]\n${exports.join(", ")}\n\n`;
      }
    } else if (ext === ".json") {
      if (path.basename(filePath) === "package.json") {
        const pkg = JSON.parse(content);
        desc += `[NPM Package]\nName: ${pkg.name}\nVersion: ${pkg.version}\nDesc: ${pkg.description}\n\n`;
        if (pkg.scripts) {
          desc += `[Scripts]\n${Object.keys(pkg.scripts).map(k => `- ${k}: ${pkg.scripts[k]}`).join("\n")}\n\n`;
        }
      }
    } else if (ext === ".md") {
      const heading = content.match(/^#\s+(.*)/m);
      if (heading) {
        desc += `[Heading]\n${heading[1]}\n\n`;
      }
    }
  } catch (e) {
    desc += "Error analyzing file.";
  }

  return desc.trim() || "No specific metadata extracted.";
}

export function buildDependencyGraph() {
  const files = getAllFiles(ROOT_DIR);
  const nodes = new Map<string, any>();
  const edges: { from: string; to: string }[] = [];

  const allImportsRegex = /(?:import|export)\s+(?:type\s+)?[^"']*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;

  // Xây dựng Node
  for (const file of files) {
    const id = getRelativeId(file);
    const content = fs.readFileSync(file, "utf8");
    const description = analyzeFile(file, content);
    
    let folder = path.dirname(id);
    if (folder === ".") folder = "root";

    nodes.set(id, {
      id: id,
      label: path.basename(id),
      description: description,
      group: folder,
      tags: [folder]
    });
  }

  // Xây dựng Edges
  for (const file of files) {
    const id = getRelativeId(file);
    const content = fs.readFileSync(file, "utf8");
    const ext = path.extname(file);

    if (ext === ".ts" || ext === ".js") {
      let match;
      while ((match = allImportsRegex.exec(content)) !== null) {
        let importPath = match[1] || match[2];
        if (importPath && importPath.startsWith(".")) {
          // Xử lý .js -> .ts mapping
          if (importPath.endsWith(".js")) {
            importPath = importPath.replace(/\.js$/, ".ts");
          }
          
          const dir = path.dirname(file);
          const resolvedAbsolute = path.resolve(dir, importPath);
          const targetId = getRelativeId(resolvedAbsolute);
          
          if (nodes.has(targetId)) {
            edges.push({ from: id, to: targetId });
          }
        }
      }
    }

    // Heuristic edges (package.json scripts)
    if (id === "package.json") {
      try {
        const pkg = JSON.parse(content);
        if (pkg.scripts) {
          Object.values(pkg.scripts).forEach((script: any) => {
            if (typeof script === "string") {
              if (script.includes("scripts/dev-graph.ts")) {
                edges.push({ from: id, to: "scripts/dev-graph.ts" });
              }
              if (script.includes("src/index.ts") || script.includes("dist/")) {
                edges.push({ from: id, to: "src/index.ts" });
              }
            }
          });
        }
      } catch (e) {}
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
        html = html.replace("System Dependency Graph", "System Source Graph");
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
