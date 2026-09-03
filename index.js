#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { program } = require('commander');
const { execSync, execFileSync } = require('child_process');

// Xác định đường dẫn thư mục lưu trữ toàn cục
const SKILLS_DIR = path.join(os.homedir(), '.ai-skills');

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(SKILLS_DIR)) {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function getCleanName(inputName) {
  return path.basename(inputName).replace(/\.md$/i, '');
}

// --- Git Helpers cho Transparent Sync ---
function runGitCommandSafe(args) {
  try {
    const isGitRepo = fs.existsSync(path.join(SKILLS_DIR, '.git'));
    if (!isGitRepo) return false;
    const { execFileSync } = require('child_process');
    execFileSync('git', args, { cwd: SKILLS_DIR, stdio: 'ignore' });
    return true;
  } catch (error) {
    // Bỏ qua lỗi (ví dụ: mất mạng, không có gì để commit, conflict nhẹ)
    return false;
  }
}

function syncPull() {
  runGitCommandSafe(['pull', 'origin', 'main', '--rebase']);
}

function syncPush(message) {
  runGitCommandSafe(['add', '.']);
  runGitCommandSafe(['commit', '-m', message]);
  runGitCommandSafe(['push', 'origin', 'main']);
}
// ----------------------------------------

program
  .name('ai-skills')
  .description('CLI Tool - Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)')
  .version('1.0.0');

// Lệnh: init-sync <git_url>
program
  .command('init-sync <url>')
  .description('Khởi tạo đồng bộ Git cho kho kỹ năng (liên kết với Cloud repo)')
  .action((url) => {
    console.log(`Đang thiết lập Git Sync với repo: ${url}...`);
    try {
      if (!fs.existsSync(path.join(SKILLS_DIR, '.git'))) {
        execFileSync('git', ['init'], { cwd: SKILLS_DIR, stdio: 'ignore' });
        // Khởi tạo một commit rỗng nếu repo chưa có commit nào
        try {
          execFileSync('git', ['commit', '--allow-empty', '-m', 'Initial commit'], { cwd: SKILLS_DIR, stdio: 'ignore' });
        } catch (e) {}
      }
      try {
        execFileSync('git', ['remote', 'set-url', 'origin', url], { cwd: SKILLS_DIR, stdio: 'ignore' });
      } catch (e) {
        try {
          execFileSync('git', ['remote', 'add', 'origin', url], { cwd: SKILLS_DIR, stdio: 'ignore' });
        } catch (e2) {}
      }
      execFileSync('git', ['branch', '-M', 'main'], { cwd: SKILLS_DIR, stdio: 'ignore' });
      
      try {
        execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: SKILLS_DIR, stdio: 'ignore' });
      } catch (e) {
        console.log('⚠️ Lưu ý: Chưa thể đẩy (push) lên GitHub ngay lập tức. Hãy chắc chắn bạn ĐÃ TẠO repo trống trên GitHub.');
      }
      console.log('🎉 Thiết lập Git Sync thành công! Từ giờ mọi thay đổi sẽ tự động đồng bộ ngầm.');
    } catch (e) {
      console.error('❌ Lỗi khi thiết lập Git:', e.message);
    }
  });

// Lệnh: list
program
  .command('list')
  .description('Liệt kê danh sách tất cả các kỹ năng đang có')
  .action(() => {
    syncPull(); // Kéo dữ liệu mới nhất trước khi đọc
    const files = fs.readdirSync(SKILLS_DIR).filter(file => file.endsWith('.md'));
    if (files.length === 0) {
      console.log('Kho kỹ năng đang trống. Hãy thêm kỹ năng bằng lệnh: "ai-skills add <tên> <đường_dẫn_file>".');
    } else {
      console.log('Danh sách các kỹ năng hiện có:');
      files.forEach(file => {
        console.log(`- ${file.replace('.md', '')}`);
      });
    }
  });

// Lệnh: get <tên>
program
  .command('get <name>')
  .description('Đọc và in ra nội dung của một kỹ năng cụ thể')
  .action((name) => {
    syncPull(); // Kéo dữ liệu mới nhất trước khi đọc
    const cleanName = getCleanName(name);
    const skillPath = path.join(SKILLS_DIR, `${cleanName}.md`);
    if (!fs.existsSync(skillPath)) {
      console.error(`Lỗi: Không tìm thấy kỹ năng "${cleanName}".`);
      process.exit(1);
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    const normalizedContent = content.replace(/\r\n?/g, '\n');
    console.log(normalizedContent);
  });

// Lệnh: add <tên> <đường_dẫn_file>
program
  .command('add <name> <file_path>')
  .description('Thêm một kỹ năng mới từ file Markdown có sẵn')
  .action((name, filePath) => {
    const cleanName = getCleanName(name);
    const absolutePath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Lỗi: Không tìm thấy file gốc tại "${absolutePath}".`);
      process.exit(1);
    }
    const destPath = path.join(SKILLS_DIR, `${cleanName}.md`);
    fs.copyFileSync(absolutePath, destPath);
    console.log(`Đã thêm thành công kỹ năng "${cleanName}" vào kho lưu trữ!`);
    
    // Đẩy dữ liệu lên Cloud
    syncPush(`Auto-sync: Add skill ${cleanName}`);
  });

// Lệnh: remove <tên>
program
  .command('remove <name>')
  .alias('rm')
  .description('Xóa một kỹ năng khỏi kho lưu trữ')
  .action((name) => {
    const cleanName = getCleanName(name);
    const skillPath = path.join(SKILLS_DIR, `${cleanName}.md`);
    if (!fs.existsSync(skillPath)) {
      console.error(`Lỗi: Không tìm thấy kỹ năng "${cleanName}".`);
      process.exit(1);
    }
    fs.unlinkSync(skillPath);
    console.log(`Đã xóa thành công kỹ năng "${cleanName}".`);
    
    // Đẩy dữ liệu lên Cloud
    syncPush(`Auto-sync: Remove skill ${cleanName}`);
  });

// Lệnh: search <từ_khóa>
program
  .command('search <keyword>')
  .description('Tìm kiếm kỹ năng theo tên hoặc nội dung')
  .action((keyword) => {
    syncPull(); // Kéo dữ liệu mới nhất trước khi tìm
    const files = fs.readdirSync(SKILLS_DIR).filter(file => file.endsWith('.md'));
    const lowerKeyword = keyword.toLowerCase();
    let found = false;

    console.log(`Kết quả tìm kiếm cho "${keyword}":\n`);
    files.forEach(file => {
      const skillName = getCleanName(file);
      const content = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
      
      if (skillName.toLowerCase().includes(lowerKeyword) || content.toLowerCase().includes(lowerKeyword)) {
        console.log(`- ${skillName}`);
        found = true;
      }
    });

    if (!found) {
      console.log('Không tìm thấy kỹ năng nào khớp với từ khóa.');
    }
  });

// Lệnh: apply <name>
program
  .command('apply <name>')
  .description('Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)')
  .action((name) => {
    const cleanName = getCleanName(name);
    const sourcePath = path.join(SKILLS_DIR, `${cleanName}.md`);
    
    if (!fs.existsSync(sourcePath)) {
      console.error(`Lỗi: Không tìm thấy kỹ năng "${cleanName}" trong kho tổng.`);
      process.exit(1);
    }
    
    const targetDir = path.join(process.cwd(), '.agents', 'skills', cleanName);
    const targetPath = path.join(targetDir, 'SKILL.md');
    
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Xóa file cũ nếu đã tồn tại
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    
    try {
      // Ưu tiên Symlink
      fs.symlinkSync(sourcePath, targetPath, 'file');
      console.log(`✅ Đã apply thành công (Symlink) kỹ năng "${cleanName}" vào dự án!`);
    } catch (err) {
      try {
        // Fallback sang Hardlink
        fs.linkSync(sourcePath, targetPath);
        console.log(`✅ Đã apply thành công (Hardlink) kỹ năng "${cleanName}" vào dự án!`);
      } catch (err2) {
        // Fallback sang Copy
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✅ Đã apply thành công (Copy) kỹ năng "${cleanName}" vào dự án!`);
      }
    }
  });

// Lệnh: run <name>
program
  .command('run <name>')
  .description('Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng')
  .action((name) => {
    const cleanName = getCleanName(name);
    // Ưu tiên tìm trong thư mục dự án hiện tại trước, nếu không có mới tìm trong kho tổng
    let skillPath = path.join(process.cwd(), '.agents', 'skills', cleanName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      skillPath = path.join(SKILLS_DIR, `${cleanName}.md`);
    }
    
    if (!fs.existsSync(skillPath)) {
      console.error(`Lỗi: Không tìm thấy kỹ năng "${cleanName}".`);
      process.exit(1);
    }
    
    const content = fs.readFileSync(skillPath, 'utf8');
    
    // Tìm đoạn mã: ```bash hook hoặc ```bash pre-hook
    const regex = /```bash\s+(?:hook|pre-hook)[^\n]*\n([\s\S]*?)```/;
    const match = content.match(regex);
    
    if (match && match[1]) {
      let scriptContent = match[1].trim();
      console.log(`🚀 Đang thực thi đoạn mã từ kỹ năng "${cleanName}"...\n`);
      try {
        const { execSync } = require('child_process');
        
        // Trên Windows, cmd.exe (shell mặc định của execSync) không hiểu '#' là comment.
        // Ta cần loại bỏ các dòng bắt đầu bằng '#' trước khi thực thi để tránh lỗi.
        if (os.platform() === 'win32') {
          scriptContent = scriptContent.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
        }

        // Chạy đoạn mã qua môi trường shell
        const output = execSync(scriptContent, { encoding: 'utf8', stdio: 'pipe' });
        console.log(output);
      } catch (err) {
        console.error(`❌ Lỗi khi thực thi:\n`, err.message);
        if (err.stdout) console.log(err.stdout);
        if (err.stderr) console.error(err.stderr);
      }
    } else {
      console.log(`ℹ️ Kỹ năng "${cleanName}" không chứa khối mã \`\`\`bash nào để thực thi.`);
    }
  });

program.parse();
