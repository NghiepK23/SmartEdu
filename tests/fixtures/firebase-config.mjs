import fs from 'node:fs';
import path from 'node:path';

/* Cấu hình Firebase dùng cho kiểm thử.
   `firebase-applet-config.json` là tệp cấu hình cục bộ của từng máy (đã gitignore, chứa
   projectId và apiKey của dự án thật). Bản clone sạch chỉ có
   `firebase-applet-config.example.json` với giá trị mẫu, nên test đọc tệp thật nếu có và
   tự lùi về tệp mẫu — không phụ thuộc cấu hình của người chạy. */
export function readFirebaseConfig(rootDir) {
  const real = path.join(rootDir, 'firebase-applet-config.json');
  const example = path.join(rootDir, 'firebase-applet-config.example.json');
  const file = fs.existsSync(real) ? real : example;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
