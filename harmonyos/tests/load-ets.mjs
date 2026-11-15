import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../entry/src/main/ets/", import.meta.url));

/**
 * @param replacements - 仅用于测试的原生 SDK 模块替身。
 * @returns 执行真实 ETS 源文件的加载器；不代表 ArkTS SDK 编译验证。
 */
export function createLoader(replacements = {}) {
  const modules = new Map();
  return function load(relative, parent = sourceRoot) {
    if (Object.hasOwn(replacements, relative)) return replacements[relative];
    const path = resolve(parent, relative.endsWith(".ets") ? relative : `${relative}.ets`);
    if (modules.has(path)) return modules.get(path).exports;
    const source = readFileSync(path, "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: path.replace(/\.ets$/, ".ts"),
      reportDiagnostics: true,
    });
    const errors = result.diagnostics?.filter(
      (item) => item.category === ts.DiagnosticCategory.Error
    );
    if (errors?.length) {
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => sourceRoot,
          getNewLine: () => "\n",
        })
      );
    }
    const module = { exports: {} };
    modules.set(path, module);
    const evaluate = vm.runInThisContext(
      `(function(require, module, exports) { ${result.outputText}\n})`,
      { filename: path }
    );
    evaluate((id) => load(id, dirname(path)), module, module.exports);
    return module.exports;
  };
}
