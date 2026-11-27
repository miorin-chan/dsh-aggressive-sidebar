# AGENTS.local

本文件补充 [通用规则](AGENTS.md)。
项目专属规则在其适用范围内优先。

## 范围与项目文档

按详情页保存的模式展开右侧栏，并在每次打开时把键盘焦点移入活动页面。
本项目保持独立安装和启停。

- [README.md](README.md) 为英文用户说明（安装、用法与限制），[README.zh.md](README.zh.md) 为中文版本。
- [DESIGN.md](DESIGN.md) 为产品设计入口，变更产品行为前先阅读；它说明要解决的问题、目标体验、边界与可观察成功标准。
- 将实现约定、提案和实际验证记录与产品设计分开，以[项目文档索引](docs/README.md)为索引，验证记录说明实际测过的内容。
- 发布时通过 `CHANGELOG.md` 记录版本变化；进度、排期与调试记录留在任务记录中，
  任务收尾前将已确认的产品决策更新回产品设计并反向链接。
- 设计与开发说明优先用中文。修改文案时同步维护八种 locale（`en zh ja de es fr pt ru`）。
- 插件详情页要整体短、每项一眼能懂。
  只展示用户当下需要知道或操作的内容，细节按需展开。

## 结构

`npm run build:tools` 从 `scripts/` 下的 `.mts` 生成同路径 `.mjs`，Git 跟踪 TypeScript 源码。
Node.js 22.18 或更新版本直接运行 `.test.mts`。

- `src/client/index.ts` 是浏览器半的源码，`node scripts/build.mjs` 生成的 `client.js` 由 Git 忽略。
  改之前先读源码顶部的机制说明。产物不手改，`npm run check` 里的 `--check` 核对产物与源码是否一致。
- `src/host/index.ts` 声明可即时保存的展开模式。
  `src/client/mode-settings.tsx` 用 DSH 的 `configForms` 服务读取和写入该选项。
- `tsconfig.json`、`scripts/build.mts`、`scripts/sync-types.mts` 是 TypeScript 基座，
  模板来自工作区 `tools/dsh-plugin-ts/`。
  Host 自带构建时打包的配置验证库；Client 通过宿主服务和插槽复用原生能力。
- `test/client.test.mts` 用假的 `ctx`、控制器、store 与页面验证全屏形态的预置、页面焦点与卸载还原。
  测试加载的是构建后的 `client.js`，源码迁移不改变它们。
- `locale/*.json` 存放 Plugin Manager 的本地化元数据。

## 复用 DSH 原生界面

- 优先复用 DSH 原生组件、行为、主题 token 和同类界面布局，以减少自写代码和维护成本。
- 当前版本有受支持的运行时入口且性能可接受时，优先通过公开插槽、
  组件工厂或宿主提供的可加载模块动态复用，让宿主提供组件实现。
  只有现有组件和扩展点无法满足需求时，才补足必要的插件实现。
- 静态引入或打包官方代码或资源时，在引用处标注上游包名、版本或提交、源码路径及符号名，便于升级时回看和同步，
  并保留适用的许可证与署名。

## 实现

- 常见操作按钮优先使用易识别的图标，仅在图标无法明确表达操作含义时使用可见文字。
- 编写插件时，除非有特殊说明，否则使用 TypeScript。
  复用与目标 DSH 版本匹配的官方类型，在接口、配置和事件中保留类型信息，对未知输入先校验再收窄，并同步维护类型依赖。
- 新实现限于 DSH 支持的插件 API 和扩展点。
  禁止修改 DSH 源码或安装产物，也禁止用全局猴子补丁或覆写内部实现绕过边界。
  扩展点不足时说明缺口，并将实现限制在插件能力内。
- 两种展开模式都复用原生全屏形态，预置逻辑只看该会话的 `layout.expanded` 与 `layout.mode`。
  「展开到左边栏」在 `shell.overlay` 插槽挂载样式，让右侧栏跨越原生布局的第二、第三列，并隔离被覆盖的会话区。
  窄屏抽屉沿用原生宽度。
- 焦点处理跟随 store 的 `expanded` 从 `false` 变 `true`，覆盖标题栏按钮、切换快捷键、文件链接、工具行与侧栏入口。
- 焦点先落到活动的停靠分栏，再落到活动页面的内容：嵌入 frame、编辑器、
  面积足够大的 `tabindex="-1"` 内容根，或页面的滚动查看器。
  没有 `tabindex` 的滚动查看器临时加 `tabindex="-1"` 与 `data-dsh-aggressive-sidebar-focus`，卸载时按标记移除。
  页面已有焦点时不覆盖。
- 聚焦补试在页面取得焦点、面板关闭或切换会话、下一次指针或按键、窗口失焦或 800 毫秒后结束。
  标题栏展开按钮只通过控制器的原生 `toggleExpanded` 打开；不模拟点击，也不直接写 store 的展开状态。
- 「打开中」的面板属于用户：只在收起态预置全屏；用户在打开时切回分屏必须保留，直到面板关闭。
  若要让打开中的面板也强制全屏，先确认这是产品要求。
- 改动必须走 store 自己声明的 `setMode` 动作，保持撤销历史与持久化语义；不要直接写 `localStorage`。
- 所有对 DSH 内部结构的访问都要 fail-safe：`ctx.sidebarRight.adopted` 不是 Map、store 缺 `actions.setMode`、
  快照缺字段时都不包装，保持 DSH 原行为并只写一条 `console.warn`。
- store 通知期间不直接再发动作（会形成动作套动作）：预置动作排到微任务里执行，仍在下一帧绘制前完成。
- DSH 升级后先重跑 `node --test`，再在真实界面确认「首次打开 / 关闭重开 / 打开时切回分屏」三条路径，
  并分别用终端、版本管理与带滚动的文件预览确认打开后的键盘操作落在页面内容里。

将注册与清理放在 `apply` 的 `ctx.effect` 或 `ctx.on` 中，保持 factory 无副作用。
在客户端入口头部记录对 DSH 内部结构的依赖和退化行为。

## 版本与验证

主版本升级由用户决定，常规迭代沿用当前主版本。

- 在新检出的项目目录运行 `pnpm install --frozen-lockfile` 安装依赖并生成产物，然后运行 `npm run check`。
  `node --test`、`tsc -p tsconfig.json`、
  `node scripts/build.mjs --check` 与 `node scripts/sync-types.mjs --check` 依次检查行为、类型、产物新鲜度与类型包版本。
- DSH 升级后先 `node scripts/sync-types.mjs` 重新钉住类型包版本，再跑 `npm run check`。
- 在默认工作区根运行 `node tools/new-dsh-plugin/cli.mts --check plugins/dsh-aggressive-sidebar`。
- 安装、卸载及实机验证使用一次性 profile。
  报告区分夹具测试和实机观察。
- 用 `docs/scripts/reflow md <path>` 重排修改过的英文 Markdown。
  命令需要 Python 3.11 或更新版本。
- 在项目根运行 `prek install`，之后提交时会自动重排暂存的 Markdown。
- 在 DSH 沙箱内提交时，用 `PREK_HOME="${TMPDIR:?}/prek-dsh" git commit -m "<commit message>"`，
  让 reflow 钩子照常运行，并把 `prek` 的缓存和日志写到可写的临时目录。
