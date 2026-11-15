import { UIAbility } from "@kit.AbilityKit";
import { window } from "@kit.ArkUI";
import { nativeBridge } from "../bridge/NativeBridge";

export default class EntryAbility extends UIAbility {
  /**
   * @param windowStage - 当前 Ability 的窗口阶段。
   * @returns 无。
   */
  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent("pages/Index", (error) => {
      if (error.code !== 0) {
        console.error("OpenRoadScope: PAGE_LOAD_FAILED");
      }
    });
  }

  /** @returns 无。 */
  onForeground(): void {
    nativeBridge.setForeground(true);
  }

  /** @returns 无。 */
  onBackground(): void {
    nativeBridge.setForeground(false);
  }

  /** @returns 无。 */
  onWindowStageDestroy(): void {
    nativeBridge.detach();
  }

  /** @returns 无。 */
  onDestroy(): void {
    nativeBridge.detach();
  }
}
