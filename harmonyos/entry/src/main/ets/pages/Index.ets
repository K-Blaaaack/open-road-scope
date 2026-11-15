import { webview } from "@kit.ArkWeb";
import { HarmonyObdProxy, nativeBridge } from "../bridge/NativeBridge";
import { LOCAL_PAGE, isTrustedPage } from "../bridge/Protocol";

const BRIDGE_PERMISSION: string = '{"javascriptProxyPermission":{"urlPermissionList":[' +
  '{"scheme":"resource","host":"rawfile","port":"","path":"web/index.html"}]}}';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private proxy: HarmonyObdProxy = new HarmonyObdProxy();
  @State private loadFailed: boolean = false;

  /** @returns 无。 */
  aboutToAppear(): void {
    nativeBridge.attach(this.controller);
  }

  /** @returns 无。 */
  aboutToDisappear(): void {
    nativeBridge.detach();
    try {
      this.controller.deleteJavaScriptRegister("harmonyObd");
    } catch (_) {
      console.warn("OpenRoadScope: WEB_ALREADY_DESTROYED");
    }
  }

  /** @returns ArkWeb 本地页面。 */
  build() {
    Stack() {
      Web({ src: LOCAL_PAGE, controller: this.controller })
        .width("100%")
        .height("100%")
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .blockNetwork(true)
        .mixedMode(MixedMode.None)
        .geolocationAccess(false)
        .multiWindowAccess(false)
        .javaScriptProxy({
          object: this.proxy,
          name: "harmonyObd",
          methodList: ["call"],
          controller: this.controller,
          permission: BRIDGE_PERMISSION,
        })
        .onLoadIntercept((event) => {
          if (event === undefined) {
            return true;
          }
          return !isTrustedPage(event.data.getRequestUrl());
        })
        .onOverrideUrlLoading((request: WebResourceRequest) => {
          return !isTrustedPage(request.getRequestUrl());
        })
        .onPageBegin((event) => {
          this.loadFailed = false;
          nativeBridge.pageBegin(event === undefined ? "" : event.url);
        })
        .onPageEnd((event) => {
          nativeBridge.pageEnd(event === undefined ? "" : event.url);
        })
        .onErrorReceive((event) => {
          if (event !== undefined && event.request.isMainFrame()) {
            this.loadFailed = true;
            nativeBridge.detach();
          }
        })
        .onRenderExited(() => {
          this.loadFailed = true;
          nativeBridge.detach();
        })
      if (this.loadFailed) {
        Text($r("app.string.web_load_error"))
          .padding(24)
          .fontSize(16)
          .width("100%")
          .height("100%")
          .backgroundColor($r("app.color.start_window_background"))
          .fontColor(Color.White)
      }
    }
    .width("100%")
    .height("100%")
  }
}
