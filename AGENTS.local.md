# AGENTS.local

本文件补充 [通用规则](AGENTS.md)。
项目专属规则在其适用范围内优先。

## 范围与项目文档

让右侧栏默认全屏，并在每次展开时把键盘焦点移入活动页面的内容。
本项目保持独立安装和启停。

[README.md](README.md) 为英文用户说明，[README.zh.md](README.zh.md) 为中文版本。
[项目文档索引](docs/README.md) 指向行为说明、维护约束和验证入口。
设计与开发说明优先用中文。修改文案时同步维护八种 locale（`en zh ja de es fr pt ru`）。
新增设计记录放在 `docs/` 并登记到索引，发布时通过 `CHANGELOG.md` 记录变化。

## 结构

- `client.js` 是浏览器半：手写的 module-loader 产物，不经构建。
  改之前先读它顶部的机制说明。
- `index.js` 是 Host 半，保持无副作用，只用于让 bundle 行被加载。
- `test/client.test.mjs` 用假的 `ctx`、控制器、store 与页面固定默认全屏的判定、页面焦点落点与卸载还原。
- `locale/*.json` 存放 Plugin Manager 的本地化元数据。

## 实现

- 默认全屏的判定只看 store 快照里该会话的 `layout.expanded` 与 `layout.mode`。
  焦点处理跟随 store 的 `expanded` 从 `false` 变 `true`，因此覆盖标题栏按钮、切换快捷键、
  文件链接、工具行与侧栏入口；不推算侧栏几何。
- 焦点先落到活动的停靠分栏，再落到活动页面的内容：嵌入 frame、编辑器、
  面积足够大的 `tabindex="-1"` 内容根，或页面的滚动查看器。
  没有 `tabindex` 的滚动查看器临时加 `tabindex="-1"` 与 `data-dsh-sidebar-fullscreen-focus`，卸载时按标记移除。
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

- 在项目根运行 `node --test` 和 `node --check client.js && node --check index.js`。
- 在默认工作区根运行 `node tools/new-dsh-plugin/cli.mjs --check plugins/dsh-sidebar-fullscreen`。
- 安装、卸载及实机验证使用一次性 profile。
  报告区分夹具测试和实机观察。
- 用 `docs/scripts/reflow md <path>` 重排修改过的英文 Markdown。
  命令需要 Python 3.11 或更新版本。
- 在项目根运行 `prek install`，之后提交时会自动重排暂存的 Markdown。
- 在 DSH 沙箱内提交时，用 `PREK_HOME="${TMPDIR:?}/prek-dsh" git commit -m "<commit message>"`，
  让 reflow 钩子照常运行，并把 `prek` 的缓存和日志写到可写的临时目录。
