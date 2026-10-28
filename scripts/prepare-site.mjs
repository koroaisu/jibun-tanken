// 静的公開用のファイルだけをdistへコピーする。秘密や参考ソースは含めない。
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, "dist");
const files = ["index.html", "styles.css", "app.js", "assets/figma-favicon.svg", "assets/fonts/klee-one-jp.ttf", "assets/fonts/OFL.txt"];
async function scan(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const output = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error("distにリンクが含まれています。公開対象を確認してください。");
    if (entry.isDirectory()) output.push(...await scan(path));
    else output.push(relative(target, path).replaceAll("\\", "/"));
  }
  return output;
}
const unexpected = (await scan(target)).filter(file => !files.includes(file));
if (unexpected.length) throw Error("distに公開対象外のファイルがあります。内容を確認してから再実行してください。");
for (const file of files) {
  const destination = resolve(target, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file), destination);
}
console.log(`静的公開用の${files.length}ファイルをdistに用意しました。APIキー・worker・参考ソースは含みません。`);
