# 考研每日追踪

考研备考每日任务追踪与计时 Android App，基于 Capacitor 构建。

## 功能

- **今日专项** — 每日待办科目勾选、完成度进度条
- **专项计时** — 按科目分项计时，自动累计学习时长
- **统计数据** — 饼状图展示各科时间占比、7 天趋势对比
- **每日复盘** — 当日复盘记录
- **本地存储** — 纯前端 localStorage，无需后端

## 技术栈

- HTML/CSS/Vanilla JS（Web 端）
- [Capacitor](https://capacitorjs.com/) 6.x（Android 封装）
- Gradle + Android SDK（APK 构建）

## 开发

```bash
# 安装依赖
npm install

# 同步 web 资源到 Android
npm run build

# 构建 APK（需要 Android SDK）
./build-apk.sh

# 构建并安装到模拟器
./build-apk.sh --install
```

## 项目结构

```
├── www/                  # Web 应用源码
│   ├── index.html        # 主页面（4 个 Tab）
│   ├── js/app.js         # 核心逻辑
│   └── css/style.css     # 样式
├── android/              # Capacitor Android 工程
├── index.html            # 根入口（Capacitor webDir 为 www）
├── package.json
└── capacitor.config.json
```
