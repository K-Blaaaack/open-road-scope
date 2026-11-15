import { MAX_BUFFER_BYTES } from "./Protocol";

export class LineReader {
  private buffered: string = "";
  private resolveRead: ((line: string) => void) | undefined = undefined;
  private rejectRead: ((error: Error) => void) | undefined = undefined;
  private timer: number = -1;

  /**
   * @param data - TCP 收到的 ASCII 数据。
   * @returns 无。
   */
  append(data: string): void {
    if (this.buffered.length + data.length > MAX_BUFFER_BYTES) {
      throw new Error("BUFFER_OVERFLOW");
    }
    this.buffered += data;
    const resolve = this.resolveRead;
    if (resolve !== undefined) {
      const line: string | undefined = this.takeLine();
      if (line !== undefined) {
        this.clearPending();
        resolve(line);
      }
    }
  }

  /**
   * @param timeoutMs - 最长等待时间，毫秒。
   * @returns 下一条非空行或提示符；超时返回空字符串。
   */
  read(timeoutMs: number): Promise<string> {
    if (this.resolveRead !== undefined) {
      return Promise.reject(new Error("READ_IN_PROGRESS"));
    }
    const line: string | undefined = this.takeLine();
    if (line !== undefined) {
      return Promise.resolve(line);
    }
    return new Promise<string>((resolve, reject) => {
      this.resolveRead = resolve;
      this.rejectRead = reject;
      this.timer = setTimeout(() => {
        this.clearPending();
        resolve("");
      }, timeoutMs);
    });
  }

  /**
   * @param reason - 结束未完成读取的错误码。
   * @returns 无。
   */
  reset(reason: string): void {
    const reject = this.rejectRead;
    this.clearPending();
    this.buffered = "";
    if (reject !== undefined) {
      reject(new Error(reason));
    }
  }

  /** @returns 下一条行；尚无完整行时返回 undefined。 */
  private takeLine(): string | undefined {
    this.buffered = this.buffered.replace(/^[\r\n]+/, "");
    for (let index: number = 0; index < this.buffered.length; index += 1) {
      const character: string = this.buffered.charAt(index);
      if (character === ">") {
        if (index === 0) {
          this.buffered = this.buffered.substring(1);
          return ">";
        }
        const line: string = this.buffered.substring(0, index);
        this.buffered = this.buffered.substring(index);
        return line;
      }
      if (character === "\r" || character === "\n") {
        const line: string = this.buffered.substring(0, index);
        this.buffered = this.buffered.substring(index + 1);
        return line;
      }
    }
    return undefined;
  }

  /** @returns 无。 */
  private clearPending(): void {
    if (this.timer !== -1) {
      clearTimeout(this.timer);
    }
    this.timer = -1;
    this.resolveRead = undefined;
    this.rejectRead = undefined;
  }
}
