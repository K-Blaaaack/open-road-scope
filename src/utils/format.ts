/**
 * 时间戳格式化为 HH:MM:SS
 * @param ms - 毫秒时间戳
 * @returns 形如 "14:05:33" 的字符串
 */
export const formatTime = (ms: number): string => {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};
