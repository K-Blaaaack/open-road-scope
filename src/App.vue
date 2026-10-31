<script setup lang="ts">
/**
 * 应用外壳（MD3 自适应导航）
 *
 * 三档断点决定导航形态：
 * - compact（<600px）：底部导航栏 MdNavBar，拇指可达；
 * - medium（600–839px）：折叠的导航侧栏（80dp 仅图标）；
 * - expanded（≥840px）：展开的导航侧栏（240dp，图标 + 文字，可在设置里收起）。
 * 按「宽度」而不是「设备」判断，是因为桌面端也会被拉成窄窗，车载横屏又常常很矮。
 */
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useMediaQuery } from "@vueuse/core";

import { useObdStore } from "@/stores/obd";
import { usePrefsStore } from "@/stores/prefs";
import { useDashboardStore } from "@/stores/dashboard";
import { prefetchRoutes } from "@/router";
import OnboardingOverlay from "@/components/OnboardingOverlay.vue";
import PageSkeleton from "@/components/PageSkeleton.vue";
import MdTopAppBar from "@/components/md3/MdTopAppBar.vue";
import MdNavRail, { type NavItem } from "@/components/md3/MdNavRail.vue";
import MdNavBar from "@/components/md3/MdNavBar.vue";
import MdIconButton from "@/components/md3/MdIconButton.vue";
import MdBadge from "@/components/md3/MdBadge.vue";
import MdSnackbarHost from "@/components/md3/MdSnackbarHost.vue";

const { t } = useI18n();
const route = useRoute();
const store = useObdStore();
const prefs = usePrefsStore();
const layout = useDashboardStore();

/** 当前页面标题（取自路由 meta，页面内不再重复渲染 h1，省出垂直空间） */
const pageTitle = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : ""));

const isDark = computed(() => prefs.theme === "dark");

/** 连接状态文案 */
const statusText = computed(() => {
  const key = store.status.state as "idle" | "connecting" | "connected" | "error";
  return t(`status.${key}`);
});

/** 连接状态 → 徽标色系：空闲中性、连接中警告、已连接成功、异常错误 */
const statusTone = computed<"neutral" | "warning" | "success" | "error">(() => {
  const map = {
    idle: "neutral",
    connecting: "warning",
    connected: "success",
    error: "error",
  } as const;
  return map[store.status.state] ?? "neutral";
});

/* ---------- 自适应断点 ---------- */

/** 手机：底部导航栏 */
const compact = useMediaQuery("(max-width: 599px)");
/** 平板：侧栏恒为折叠态 */
const medium = useMediaQuery("(min-width: 600px) and (max-width: 839px)");
/** 桌面/横屏：侧栏可展开 */
const wide = useMediaQuery("(min-width: 840px)");

/** 导航形态：bar 底部栏 / rail 折叠侧栏 / rail-expanded 展开侧栏 */
const navMode = computed<"bar" | "rail" | "rail-expanded">(() => {
  if (compact.value) return "bar";
  if (medium.value) return "rail";
  if (wide.value) return "rail-expanded";
  // 断点切换瞬间可能都不命中，回退为折叠侧栏，避免导航整块消失
  return "rail";
});

/** 侧栏是否展开：宽屏且用户没在设置里收起文字 */
const railExpanded = computed(() => navMode.value === "rail-expanded" && prefs.showNavLabels);

/** 仪表盘已连接但还没收到第一帧数据 */
const waitingData = computed(
  () => route.path === "/dashboard" && store.status.state === "connected" && store.lastTs === 0
);

/** 导航目的地：开发者模式开启时追加开发者菜单 */
const navItems = computed<NavItem[]>(() => {
  const base: NavItem[] = [
    { path: "/dashboard", icon: "i-lucide-layout-dashboard", key: "nav.dashboard" },
    { path: "/connection", icon: "i-lucide-cable", key: "nav.connection" },
    { path: "/diagnostics", icon: "i-lucide-stethoscope", key: "nav.diagnostics" },
    { path: "/settings", icon: "i-lucide-settings", key: "nav.settings" },
    { path: "/about", icon: "i-lucide-info", key: "nav.about" },
  ];
  if (prefs.devMode) {
    base.push({ path: "/developer", icon: "i-lucide-terminal", key: "nav.developer" });
  }
  return base;
});

/** 仪表盘页面才显示布局编辑开关 */
const isDashboard = computed(() => route.path === "/dashboard");

/** 顶栏副标题：连接后标明模拟/实车，未连接时不占位 */
const modeLabel = computed<string | undefined>(() => {
  if (store.status.state === "idle") return undefined;
  return store.status.mode === "sim" ? t("status.sim") : t("status.real");
});

/** 切换侧栏文字：只影响展开档，折叠档恒为图标 */
const toggleRail = (): void => {
  prefs.showNavLabels = !prefs.showNavLabels;
  prefs.persist();
};

/** 编辑/退出编辑布局 */
const toggleEdit = (): void => {
  if (layout.editing) layout.cancelEdit();
  else layout.enterEdit();
};

onMounted(() => {
  void prefs.init().then(() => store.setup());
  // 不自动连接任何设备：由用户在连接页主动选择模拟/实车
  // 空闲时预取路由 chunk，避免后续切换页面等待加载
  prefetchRoutes();
});
</script>

<template>
  <div class="md-shell">
    <!-- 底部导航（compact）：固定在下，内容区靠 padding-bottom 让位 -->
    <div v-if="navMode === 'bar'" class="md-shell__bar">
      <MdNavBar :items="navItems" />
    </div>

    <!-- 侧边导航（medium / expanded），底部放展开/收起入口 -->
    <MdNavRail v-else :items="navItems" :expanded="railExpanded">
      <div v-if="wide" class="md-shell__rail-footer">
        <MdIconButton
          :icon="railExpanded ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          :label="t('settings.showNavLabels')"
          :toggle="true"
          :selected="railExpanded"
          @click="toggleRail"
        />
      </div>
    </MdNavRail>

    <main class="md-shell__main">
      <MdTopAppBar :title="pageTitle" :subtitle="modeLabel" elevated>
        <template #leading>
          <span class="i-lucide-gauge md-shell__brand" aria-hidden="true" />
        </template>
        <template #actions>
          <!-- 仪表盘等待首帧数据：占用顶栏空位提示，窄屏隐藏 -->
          <span v-if="waitingData" class="md-shell__hint md-body-small">
            {{ t("dashboard.noData") }}
          </span>
          <!-- 主题切换：图标随主题切换（label 说明点下去会切到哪一档） -->
          <MdIconButton
            :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
            :label="isDark ? t('common.day') : t('common.night')"
            @click="prefs.toggleTheme()"
          />
          <!-- 仪表盘布局编辑开关 -->
          <MdIconButton
            v-if="isDashboard"
            icon="i-lucide-pen-line"
            :label="t('dashboard.edit')"
            :toggle="true"
            :selected="layout.editing"
            @click="toggleEdit"
          />
          <!-- 连接状态徽标：中性态用描边，其余用容器底，避免顶栏出现第四种色块 -->
          <MdBadge
            class="md-shell__status"
            :tone="statusTone"
            :variant="statusTone === 'neutral' ? 'outlined' : 'tonal'"
            :label="statusText"
          />
        </template>
      </MdTopAppBar>

      <div class="md-shell__content" :class="{ 'md-shell__content--compact': navMode === 'bar' }">
        <Suspense>
          <router-view v-slot="{ Component }">
            <Transition name="page" mode="out-in">
              <!-- KeepAlive：缓存页面组件，切换回来不重建（组件缓存） -->
              <KeepAlive>
                <component :is="Component" :key="route.path" />
              </KeepAlive>
            </Transition>
          </router-view>
          <!-- 路由 chunk 加载期间显示骨架占位 -->
          <template #fallback>
            <PageSkeleton />
          </template>
        </Suspense>
      </div>
    </main>
  </div>

  <!-- 安全引导：每次启动显示，除非勾选「不再显示」并确认 -->
  <OnboardingOverlay v-if="!prefs.skipOnboarding" />

  <!-- 全局提示条宿主：任意页面调用 useSnackbar().show() 即可弹出 -->
  <MdSnackbarHost />
</template>

<style scoped>
.md-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
}

/* 底部导航固定在下，滚动内容不带动它 */
.md-shell__bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--md-sys-z-nav);
}

.md-shell__rail-footer {
  display: flex;
  justify-content: center;
}

.md-shell__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.md-shell__brand {
  width: 24px;
  height: 24px;
  color: var(--md-sys-color-primary);
}

.md-shell__hint {
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
}

/* 顶栏动作区：徽标与图标按钮之间留 8dp */
.md-shell__status {
  margin-left: 8px;
}

/* 内容区是 flex 列：让子页面组件（如仪表盘）能用 flex:1 拿到确定高度基准，
   否则滚动容器自身高度靠内容撑开、页面根 height:100% 基准塌陷，卡片画布排布错乱。
   overflow:auto 让超高页面（连接/设置/关于等）正常滚动；仪表盘靠自身 flex:1 撑满剩余高度。 */
.md-shell__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  /* 始终预留滚动条槽位：否则页面在「内容超高」与「刚好放得下」之间切换时，
     居中内容会因为滚动条占宽而左右横跳几像素。 */
  scrollbar-gutter: stable;
  padding: 16px;
}

@media (min-width: 600px) {
  .md-shell__content {
    padding: 24px;
  }
}

/* 底部栏是 fixed 的，用底部留白保证最后一段内容不被遮住（放在媒体查询之后，避免被 padding 简写覆盖） */
.md-shell__content--compact {
  padding-bottom: 96px;
}

/* 窄屏顶栏空间紧张：隐藏「等待数据」提示 */
@media (max-width: 599px) {
  .md-shell__hint {
    display: none;
  }
}
</style>
