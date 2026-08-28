import { listPortsResultSchema, type ListPortsResult } from "../../../shared/obd";

/**
 * 解析 sidecar `--list-ports` 的标准输出（JSON Lines，可能夹带前置日志行）
 * @param stdout - 子进程标准输出全文
 * @returns 串口列表
 */
export function parseListPortsOutput(stdout: string): ListPortsResult {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  // 从后往前找第一条能解析成串口列表的 JSON 行，避免被日志/告警行干扰
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let msg: unknown;
    try {
      msg = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const parsed = listPortsResultSchema.safeParse(msg);
    if (parsed.success) return parsed.data;
  }
  throw new Error(`unexpected --list-ports output: ${lines.at(-1) ?? "<empty>"}`);
}
