import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import ConnectionPage from "./ConnectionPage.vue";
import { i18n } from "@/i18n";
import { createMobileApi } from "@/obd/mobile-bridge";
import { useObdStore } from "@/stores/obd";
import type { TransportBridge } from "@/obd/elm327";

afterEach(async () => {
  await window.obd?.disconnect();
  Reflect.deleteProperty(window, "obd");
});

describe("原生平台连接页", () => {
  test("HarmonyOS 仅显示网络，输入地址后真实按钮触发原生桥", async () => {
    const native: TransportBridge = {
      listPorts: () => "[]",
      open: vi.fn(() => false),
      close: () => {},
      connected: () => false,
      write: () => {},
      readLine: () => "",
    };
    i18n.global.locale.value = "zh-CN";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    window.obd = createMobileApi(native, "harmonyos");
    const pinia = createPinia();
    const wrapper = mount(ConnectionPage, { global: { plugins: [pinia, i18n] } });
    const store = useObdStore(pinia);
    store.setup();
    await flushPromises();
    expect(wrapper.find(".conn-net").exists()).toBe(true);
    expect(wrapper.find(".conn-port").exists()).toBe(false);
    expect(wrapper.findAll(".conn-block button").map((button) => button.text())).toEqual([
      "网络 (RJ45)",
    ]);
    await wrapper.get(".conn-net__host input").setValue("192.168.0.10");
    await wrapper.get(".conn-net__port input").setValue("35000");
    await wrapper.get(".conn-actions button").trigger("click");
    await flushPromises();
    expect(native.open).toHaveBeenCalledWith("tcp", "192.168.0.10:35000");
    expect(store.status.state).toBe("error");
    expect(wrapper.get(".conn-status").text()).toContain("连接异常");
    await wrapper.get(".conn-actions button").trigger("click");
    await flushPromises();
    expect(wrapper.get(".conn-actions button").text()).toBe("连接");
    wrapper.unmount();
    errorLog.mockRestore();
  });
});
