import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(
  projectRoot,
  "node_modules",
  "html5-qrcode",
  "html5-qrcode.min.js",
);
const targetDirectory = path.join(projectRoot, "public", "vendor");
const targetPath = path.join(targetDirectory, "html5-qrcode.min.js");

await mkdir(targetDirectory, { recursive: true });
await copyFile(sourcePath, targetPath);
