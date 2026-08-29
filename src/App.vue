<script setup lang="ts">
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

const { t } = useI18n();
const route = useRoute();
const store = useObdStore();
const prefs = usePrefsStore();
const layout = useDashboardStore();

const statusText = computed(() => {
  const key = store.status.state as "idle" | "connecting" | "connected" | "error";
  return t(`status.${key}`);
});

const isDark = computed(() => prefs.theme === "dark");

/** 当前页面标题（取自路由 meta，替代各页面自带的 h1，省出垂直空间） */
const pageTitle = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : ""));

/**
 * 手机竖屏：导航改为底部标签栏。
 * 竖屏时宽度稀缺（侧栏要吃掉 56px）而高度充裕；横屏（车载常见放置）保持侧栏，
 * 避免再压缩本就紧张的高度。
 */
const bottomNav = useMediaQuery("(max-width: 640px) and (orientation: portrait)");

/**
 * 侧栏收成图标条：窄窗或横屏手机下文字标签太占宽度，
 * 忽略用户的文字开关强制收窄（回到桌面尺寸后自动恢复）。
 */
const compactRail = useMediaQuery("(max-width: 640px), (max-height: 480px)");

/** 侧栏是否显示文字标签 */
const railLabels = computed(() => prefs.showNavLabels && !compactRail.value);

/** 仪表盘已连接但还没收到第一帧数据 */
const waitingData = computed(
  () => route.path === "/dashboard" && store.status.state === "connected" && store.lastTs === 0
);

const statusColor = computed(() => {
  const map: Record<string, string> = {
    idle: "bg-gray-500",
    connecting: "bg-amber-400",
    connected: "bg-emerald-400",
    error: "bg-red-400",
  };
  return map[store.status.state] ?? "bg-gray-500";
});

/** 导航项：开发者模式开启时追加开发者菜单 */
const navItems = computed(() => {
  const base = [
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

onMounted(() => {
  void prefs.init().then(() => store.setup());
  // 不自动连接任何设备：由用户在连接页主动选择模拟/实车
  // 空闲时预取路由 chunk，避免后续切换页面等待加载
  prefetchRoutes();
});
</script>

<template>
  <!-- 手机竖屏用 flex-col-reverse 把导航翻到底部，桌面/横屏保持左侧栏 -->
  <div class="flex h-full" :class="bottomNav ? 'flex-col-reverse' : ''">
    <component
      :is="bottomNav ? 'nav' : 'aside'"
      class="border-border overflow-hidden bg-[var(--color-bg-elevated)]"
      :class="
        bottomNav
          ? 'flex shrink-0 items-stretch justify-around gap-1 border-t px-1 py-1'
          : [
              // 折叠/展开只变宽度与标签透明度，几何位置保持一致以便平滑过渡
              'flex flex-col items-stretch gap-2 border-r px-2 py-4 transition-[width] duration-250 ease-out',
              railLabels ? 'w-44' : 'w-14',
            ]
      "
    >
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="text-secondary hover:bg-[var(--color-hover)] hover:text-primary flex items-center rounded-lg transition-colors"
        :class="[
          bottomNav ? 'min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5' : 'h-10',
          route.path === item.path ? '!text-primary bg-[var(--color-active)]' : '',
        ]"
        :title="t(item.key)"
      >
        <span
          :class="bottomNav ? '' : 'flex h-10 w-10 shrink-0 items-center justify-center'"
          class="shrink-0"
        >
          <span :class="item.icon" class="h-5 w-5" />
        </span>
        <!-- 底部标签栏固定带文字；侧栏文字可在设置中开关（折叠时淡出） -->
        <span v-if="bottomNav" class="w-full truncate text-center text-[10px] leading-tight">
          {{ t(item.key) }}
        </span>
        <Transition v-else name="nav-label">
          <span v-if="railLabels" class="truncate pr-2 text-sm">{{ t(item.key) }}</span>
        </Transition>
      </router-link>

      <!-- 切换导航文字说明（底部标签栏与强制收窄状态下无意义，隐藏） -->
      <button
        v-if="!bottomNav && !compactRail"
        class="btn-ghost btn-icon mt-auto self-start"
        :title="t('settings.showNavLabels')"
        @click="
          prefs.showNavLabels = !prefs.showNavLabels;
          prefs.persist();
        "
      >
        <span
          :class="prefs.showNavLabels ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          class="h-4 w-4"
        />
      </button>
    </component>

    <main class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        class="border-border flex items-center justify-between gap-2 border-b bg-[var(--color-bg-elevated)]/60 px-5 py-3 max-sm:px-3 max-sm:py-2"
      >
        <!-- 品牌标识 + 当前页面标题（页面内不再重复渲染标题） -->
        <div class="flex min-w-0 items-center gap-2">
          <span class="i-lucide-gauge text-[var(--color-accent)] h-5 w-5 shrink-0" />
          <!-- h1 无浏览器默认边距/字号，避免顶栏被撑高 -->
          <h1 class="text-primary my-0 truncate text-base font-semibold tracking-wide">
            {{ pageTitle }}
          </h1>
        </div>
        <div class="flex shrink-0 items-center gap-3 max-sm:gap-2">
          <!-- 仪表盘等待首帧数据：占用顶栏空位提示，不再单独占一行 -->
          <span v-if="waitingData" class="text-secondary text-xs max-sm:hidden">
            {{ t("dashboard.noData") }}
          </span>
          <!-- 主题切换按钮：图标随主题旋转淡入淡出 -->
          <button
            class="btn-ghost btn-icon"
            :title="isDark ? t('common.day') : t('common.night')"
            @click="prefs.toggleTheme()"
          >
            <Transition name="theme-icon" mode="out-in">
              <span
                :key="isDark ? 'moon' : 'sun'"
                :class="isDark ? 'i-lucide-moon' : 'i-lucide-sun text-amber-500'"
                class="h-4 w-4"
              />
            </Transition>
          </button>
          <!-- 仪表盘编辑按钮（仅仪表盘页面显示） -->
          <button
            v-if="route.path === '/dashboard'"
            class="btn-ghost btn-icon"
            :class="layout.editing ? 'btn-selected' : ''"
            :title="t('dashboard.edit')"
            @click="layout.editing ? layout.cancelEdit() : layout.enterEdit()"
          >
            <span class="i-lucide-pen-line h-4 w-4" />
          </button>
          <!-- 模拟/实车模式标识：仅连接后显示，手机窄屏下隐藏 -->
          <span v-if="store.status.state !== 'idle'" class="text-secondary text-xs max-sm:hidden">
            {{ store.status.mode === "sim" ? t("status.sim") : t("status.real") }}
          </span>
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :class="statusColor" />
            <span class="text-secondary text-xs">{{ statusText }}</span>
          </span>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-5 max-sm:p-2">
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
</template>
