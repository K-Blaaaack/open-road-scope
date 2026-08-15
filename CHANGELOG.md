# 更新日志
## [0.1.2](https://github.com/K-Blaaaack/open-road-scope/compare/v0.1.1...v0.1.2) (2026-08-15)

### ✨ 新功能

* 开发者模式按钮加入 Toast 点击倒数提示 ([bc1c968](https://github.com/K-Blaaaack/open-road-scope/commit/bc1c9682c971d27f3a2b3372b00bac23037b85e6))

### 🐛 修复

* 安卓端 splash 卡死（init 超时兜底与双保险移除） ([b56b2d5](https://github.com/K-Blaaaack/open-road-scope/commit/b56b2d52bf65e22a6edaa96d57ca03fb96f11275))
* 模拟模式选项仅开发者模式开启时显示 ([17b7ee4](https://github.com/K-Blaaaack/open-road-scope/commit/17b7ee479c772c6491a45f2156baf802c44f33b4))
* 内置模拟数据仅开发者模式开启时激活 ([f3d7a0f](https://github.com/K-Blaaaack/open-road-scope/commit/f3d7a0f43d2b6ec0ee5c4a2e3bc0a4a8117900af))
* 移除启动自动连接模拟设备，未连接不显示模式标识 ([975cd81](https://github.com/K-Blaaaack/open-road-scope/commit/975cd811d51bd8aba38ddd9d2a21a8fae221e252))
## [0.1.1](https://github.com/K-Blaaaack/open-road-scope/compare/v0.1.0...v0.1.1) (2026-08-15)

### 🤖 CI

- 回退删除旧 Release 步骤 ([46028e2](https://github.com/K-Blaaaack/open-road-scope/commit/46028e21271fd9ffeb64c2fffbb9bf9557bee242))

## 0.1.0 (2026-08-15)

### ✨ 新功能

- 搭建 OpenRoadScope 项目骨架并打通 OBD 数据链路
- 仪表盘支持卡片化自定义布局与编辑模式（拖拽 / 缩放 / 预设 / 导入导出）
- 数值卡片支持字号调节、图表新增时间轴
- 实车连接支持 USB / 蓝牙 / 网络（RJ45 OBD）串口分类
- 新增启动动画（参考 SPlayer-Next 模式，逐字入场）
- 新增设置页支持中英文切换与黑白主题
- 新增界面热重载、开发者模式（连击开启）与开发者菜单
- 清除故障码功能改为实验性开关控制显示并弹醒目确认
- 左侧导航新增文字说明开关与快捷切换按钮、关于页面
- 加入安卓构建（Capacitor）与无 Electron 环境的演示桥接

### 🐛 修复

- 修正仪表盘指针方向、零刻度位置与量程标签
- 修复页面切换失效与过渡动画中断
- 窗口适配模式下小窗口内容裁切改为可滚动
- 主题切换按钮图标与背景随日夜模式自动切换
- 深色模式下月亮图标改为深色

### 🚀 性能优化

- 移除 PixiJS 依赖，仪表盘构建体积大幅下降

### 📦 构建

- 多平台多目标发行格式（Windows NSIS/MSI/portable、macOS DMG/ZIP、Linux AppImage/deb/rpm/snap/tar.gz、Android APK）
- GitHub Actions 四平台自动构建与发布
- 应用图标与品牌资源
- 应用内版本号跟随 package.json 自动注入

### 📝 文档

- 添加 GPL-2.0 许可证文件与仓库声明
- 关于页面标明 GPL-2.0 许可证

### 🧹 杂项

- 配置版本管理（conventional commits + changelog）
