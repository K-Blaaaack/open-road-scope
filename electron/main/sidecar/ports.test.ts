import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseListPortsOutput } from "./ports";

describe("parseListPortsOutput", () => {
  test("parses the ports line", () => {
    const out = JSON.stringify({
      ports: [
        {
          name: "COM5",
          description: "蓝牙链接上的标准串行",
          hwid: "BTHENUM\\1",
          type: "bluetooth",
        },
      ],
    });
    assert.deepEqual(parseListPortsOutput(out + "\n"), {
      ports: [
        {
          name: "COM5",
          description: "蓝牙链接上的标准串行",
          hwid: "BTHENUM\\1",
          type: "bluetooth",
        },
      ],
    });
  });

  test("ignores leading noise lines", () => {
    const out = ["not json", JSON.stringify({ hello: 1 }), JSON.stringify({ ports: [] })].join(
      "\n"
    );
    assert.deepEqual(parseListPortsOutput(out), { ports: [] });
  });

  test("falls back to other for unknown port types", () => {
    const out = JSON.stringify({ ports: [{ name: "/dev/ttyS0", type: "weird" }] });
    assert.equal(parseListPortsOutput(out).ports[0].type, "other");
  });

  test("throws when no ports line is present", () => {
    assert.throws(() => parseListPortsOutput("boom\n"), /unexpected --list-ports output/);
  });
});
