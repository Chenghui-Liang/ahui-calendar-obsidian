# Ahui Calendar

> Obsidian 日历插件：**一天可以有多篇日期笔记**，并按文件夹分组管理。

本项目 fork 自 [liamcain/obsidian-calendar-plugin](https://github.com/liamcain/obsidian-calendar-plugin)（MIT），
保留原插件的全部功能，并针对「同一天存在多篇以日期命名的笔记」这一场景做了改造。

---

## 它解决什么问题

原版 Calendar 插件内部的日记索引是 `Record<日期, 文件>` —— **一天只能存一篇**。
扫描时后遇到的同名文件会覆盖先遇到的，其余的在日历上永远点不到。

如果你把笔记按主题分散在多个文件夹，例如：

```
每日阅读/raw/2026-09-15.md
炒股/信息差/raw/已归档/2026-09-15.md
炒股/机构视角/raw/已归档/2026-09-15.md
```

原版只会认到其中一篇。实测（852 篇笔记的库）：

| 范围 | 实际文件 | 原版能认到 | 丢失 |
|---|---|---|---|
| 2026-09 | 25 篇 / 18 天 | 18 天 | **7 篇** |
| 全库 | 98 篇 / 85 天 | 85 天 | **13 篇** |

本插件把这些全部识别出来，并让你一眼看到一天有几篇、分别属于哪个文件夹。

## 功能

- 一天可识别**任意多篇**日期笔记；日历格右下角用**实心圆点**表示当天篇数（最多 5 个）
- 日历**下方常驻「当天笔记列表」**，按分组分节展示，点击即打开（`Ctrl/Cmd + 点击` 新分屏）
- 编辑器切换到任意日期笔记时，下方列表自动跟随
- **日期文件名格式**可自定义，支持配置多个格式
- **按文件夹分组**，可设置是否包含子目录；命中多个分组时取路径更具体的那个
- 可配置扫描范围与排除目录
- 保留原插件全部功能：周数、任务圆点、标签属性、悬浮预览、拖拽等

## 安装

### 手动安装

1. 下载本仓库（或用 `git clone`）
2. 把 `main.js`、`manifest.json`、`styles.css` 复制到：

   ```
   <你的库>/.obsidian/plugins/ahui-calendar/
   ```

3. Obsidian → 设置 → 第三方插件 → 启用 **Ahui Calendar**

> ⚠️ **本插件与原版 Calendar 使用相同的视图类型（`calendar`），两者不能同时启用。**
> 请先停用原版 Calendar 插件，否则会出现两个插件抢同一个日历面板的情况。

### BRAT

在 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 中添加本仓库地址即可。

## 设置项

| 设置项 | 说明 |
|---|---|
| 日期文件名格式 | 每行一个 moment.js 格式，默认 `YYYY-MM-DD` |
| 扫描范围 | 每行一个文件夹路径，留空表示扫描整个库 |
| 排除的文件夹 | 每行一个，默认排除 `.trash` |
| 显示笔记数量 | 是否在日历格上用圆点显示当天笔记篇数 |
| 新建笔记的文件夹 | 在空白日期新建时的落点；留空则沿用 Daily Notes 插件的设置 |
| 分组 | 名称 + 文件夹路径 + 是否包含子文件夹 |

> 圆点的语义已由「字数」改为「篇数」。原「每个圆点代表的字数」设置项因此移除。

## 开发

```bash
npm install
npm run build     # 产出 main.js
npm run dev       # 监听模式
```

**注意**：`npm run lint` 会报错，原因是依赖的 `obsidian` API 类型定义使用了 TypeScript 4.5+ 的语法，
而本项目锁定在 TypeScript 4.2.3。**这不影响 `npm run build` 的产物**，构建可以正常完成。

### 源码结构

```
src/
├── main.ts                    插件入口；索引重建、事件调度
├── settings.ts                设置定义 + 设置页
├── constants.ts
├── i18n.ts                    界面文案（目前为中文）
├── view.ts                    日历视图：上半日历 + 下半当天笔记列表
├── io/
│   ├── dateNotesIndex.ts      ★ 一对多的日期笔记索引（核心改动）
│   ├── dailyNotes.ts
│   └── weeklyNotes.ts
└── ui/
    ├── Calendar.svelte
    ├── stores.ts
    ├── sources/               日历格数据源
    │   ├── streak.ts          ★ 圆点 = 当天笔记篇数
    │   ├── tasks.ts
    │   ├── tags.ts
    │   └── wordCount.ts       （已不再注册，保留代码备查）
    ├── fileMenu.ts
    ├── modal.ts
    └── utils.ts
```

## 已知限制

- 只支持「天」这一种粒度。年份级（`2026.md`）或月份级（`2026-09.md`）的文件无法作为日历格的内容
  （月份格式会被解析到当月 1 号，语义不正确）。
- 界面文案目前只有中文。

## 许可

[MIT](LICENSE)。原插件版权归 [Liam Cain](https://github.com/liamcain) 所有。
