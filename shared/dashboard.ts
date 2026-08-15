import type { Pid } from "./obd";

export type { Pid };

/** 卡片呈现方式 */
export type GaugeType = "gauge" | "line" | "bar" | "value";

/** 仪表盘卡片定义 */
export interface DashboardCard {
  /** 唯一标识 */
  id: string;
  /** 数据源 PID */
  pid: Pid;
  /** 呈现方式 */
  type: GaugeType;
  /** 量程下限，null 表示自动 */
  min: number | null;
  /** 量程上限，null 表示自动（无最大值） */
  max: number | null;
  /** 网格列坐标（0 起） */
  x: number;
  /** 网格行坐标（0 起） */
  y: number;
  /** 占网格列数 */
  w: number;
  /** 占网格行数 */
  h: number;
}

/** 布局配置文件 */
export interface DashboardLayout {
  version: number;
  cards: DashboardCard[];
}

/** 布局网格列数 */
export const GRID_COLS = 12;
/** 单行高度（px） */
export const GRID_ROW_HEIGHT = 96;
/** 卡片最小尺寸（网格单元） */
export const CARD_MIN_W = 2;
export const CARD_MIN_H = 2;
/** 卡片最大尺寸（网格单元） */
export const CARD_MAX_W = GRID_COLS;
export const CARD_MAX_H = 8;

let seq = 0;
export const nextCardId = (): string => `card-${Date.now()}-${seq++}`;

/**
 * 生成卡片
 * @param pid - 数据源 PID
 * @param type - 呈现方式
 * @param x - 列坐标
 * @param y - 行坐标
 * @param w - 占列数
 * @param h - 占行数
 */
export const makeCard = (
  pid: Pid,
  type: GaugeType,
  x: number,
  y: number,
  w: number,
  h: number
): DashboardCard => ({
  id: nextCardId(),
  pid,
  type,
  min: null,
  max: null,
  x,
  y,
  w,
  h,
});

/** 默认布局：2 仪表大卡 + 8 数值卡 + 3 曲线卡 */
export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  cards: [
    makeCard("SPEED", "gauge", 0, 0, 5, 4),
    makeCard("RPM", "gauge", 5, 0, 5, 4),
    makeCard("COOLANT_TEMP", "line", 0, 4, 3, 3),
    makeCard("ENGINE_LOAD", "line", 3, 4, 3, 3),
    makeCard("MAF", "line", 6, 4, 3, 3),
    makeCard("THROTTLE_POS", "line", 9, 4, 3, 3),
    makeCard("FUEL_LEVEL", "line", 0, 7, 3, 3),
    makeCard("INTAKE_TEMP", "line", 3, 7, 3, 3),
    makeCard("INTAKE_PRESSURE", "line", 6, 7, 3, 3),
    makeCard("FUEL_RATE", "line", 9, 7, 3, 3),
    makeCard("VOLTAGE", "line", 0, 10, 4, 3),
    makeCard("BAROMETRIC_PRESSURE", "line", 4, 10, 4, 3),
    makeCard("AMBIANT_AIR_TEMP", "line", 8, 10, 4, 3),
  ],
};

/** 紧凑预设：全部折线小卡 */
export const COMPACT_LAYOUT: DashboardLayout = {
  version: 1,
  cards: [
    makeCard("SPEED", "line", 0, 0, 4, 2),
    makeCard("RPM", "line", 4, 0, 4, 2),
    makeCard("COOLANT_TEMP", "line", 8, 0, 4, 2),
    makeCard("ENGINE_LOAD", "line", 0, 2, 4, 2),
    makeCard("MAF", "line", 4, 2, 4, 2),
    makeCard("THROTTLE_POS", "line", 8, 2, 4, 2),
    makeCard("FUEL_LEVEL", "line", 0, 4, 4, 2),
    makeCard("INTAKE_TEMP", "line", 4, 4, 4, 2),
    makeCard("VOLTAGE", "line", 8, 4, 4, 2),
  ],
};

/** 仪表预设：全部表盘 */
export const GAUGE_LAYOUT: DashboardLayout = {
  version: 1,
  cards: [
    makeCard("SPEED", "gauge", 0, 0, 4, 4),
    makeCard("RPM", "gauge", 4, 0, 4, 4),
    makeCard("COOLANT_TEMP", "gauge", 8, 0, 4, 4),
    makeCard("ENGINE_LOAD", "gauge", 0, 4, 4, 4),
    makeCard("THROTTLE_POS", "gauge", 4, 4, 4, 4),
    makeCard("VOLTAGE", "gauge", 8, 4, 4, 4),
  ],
};

export const LAYOUT_PRESETS: Record<string, DashboardLayout> = {
  default: DEFAULT_LAYOUT,
  compact: COMPACT_LAYOUT,
  gauge: GAUGE_LAYOUT,
};

/** 布局可用的 PID 列表（供添加卡片选择） */
export const CARD_PIDS: Pid[] = [
  "SPEED",
  "RPM",
  "COOLANT_TEMP",
  "ENGINE_LOAD",
  "MAF",
  "THROTTLE_POS",
  "FUEL_LEVEL",
  "INTAKE_TEMP",
  "INTAKE_PRESSURE",
  "FUEL_RATE",
  "BAROMETRIC_PRESSURE",
  "AMBIANT_AIR_TEMP",
  "VOLTAGE",
  "RUN_TIME",
  "TIMING_ADVANCE",
  "DISTANCE_SINCE_DTC_CLEAR",
];
