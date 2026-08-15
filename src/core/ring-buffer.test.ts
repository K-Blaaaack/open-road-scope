import { describe, expect, test } from "vitest";
import { RingBuffer } from "./ring-buffer";

describe("RingBuffer", () => {
  test("按序写入并展开", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  test("超出容量覆盖最旧数据", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  test("peek 返回最新元素", () => {
    const buf = new RingBuffer<number>(2);
    expect(buf.peek()).toBeUndefined();
    buf.push(10);
    expect(buf.peek()).toBe(10);
    buf.push(20);
    expect(buf.peek()).toBe(20);
  });

  test("空缓冲 toArray 为空", () => {
    const buf = new RingBuffer<number>(2);
    expect(buf.toArray()).toEqual([]);
  });

  test("clear 清空全部", () => {
    const buf = new RingBuffer<number>(2);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.full).toBe(false);
  });

  test("push 返回被覆盖元素", () => {
    const buf = new RingBuffer<number>(2);
    buf.push(1);
    expect(buf.push(2)).toBeUndefined();
    expect(buf.push(3)).toBe(1);
  });
});
