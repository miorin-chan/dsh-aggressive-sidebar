# 项目文档

- [展开模式、键盘焦点和持久化规则](../README.zh.md)
- [实现约束与验证步骤](../AGENTS.local.md)

浏览器验证在一次性配置中进行。打开插件详情页，切换展开模式并刷新确认选择已保存。
宽屏下检查全屏和左边栏边缘两种落点。
在「展开到左边栏」模式中，收起、打开或拖动左边栏时，右侧栏应始终贴合左栏边缘。
同时检查原生分屏按钮和键盘焦点。窄屏下检查原生全屏和详情页宽度。
停用插件后，测试新会话是否回到原生分屏。

构建后可用逐帧回归测试验证收展动画和减少动态效果。
用 [dsh-web-drive](../../../tools/dsh-web-drive/README.md) 准备刚安装插件的一次性英文 profile，将其登录 URL 传给测试。
测试从默认的「展开到左边栏」开始。

```sh
DSH_SIDEBAR_TEST_URL="$test_profile_url" node --test test/sidebar-motion.test.mts
```
