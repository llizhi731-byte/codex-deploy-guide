# 参与贡献

这是一个**零依赖的纯静态页面**，改完直接刷新浏览器就能看到效果，不需要构建。

## 本地改动流程

```bash
git clone https://github.com/<your-name>/codex-deploy-guide.git
cd codex-deploy-guide
# 直接双击 index.html，或用任意静态服务器
python -m http.server 8000     # 然后访问 http://localhost:8000
```

## 代码约定

- 只用原生 HTML / CSS / JavaScript：**不引入任何框架、构建工具或 CDN**。
- `app.js` 统一使用 `var` + `function` 的写法，保持 IIFE 包裹；新增 DOM 片段一律通过 `esc()` 转义后再拼接。
- 颜色、圆角、阴影都用 `styles.css` 顶部的 CSS 变量；深色模式靠 `body.dark` 覆盖变量，不要写死颜色。
- 新增视图的三步：`index.html` 加 `<section class="view" id="view-xxx">` → 侧边栏加一个 `data-view="xxx"` 按钮 → `app.js` 的 `viewFromHash()` 白名单里加上 `'xxx'`。
- 新增步骤：往 `getSteps()` 返回的数组里加对象（`id / stage / title / desc / term / code / tips`，可选 `extra`），编号要连续。

## 提交前自检

1. 12 个步骤都能展开、复制按钮有效；
2. 切换镜像源 / 修改 Base URL 后，第 5、10 步与一键脚本同步更新；
3. 勾选复选框，侧边栏进度条与 `x/12` 同步；
4. 深色模式下无低对比度文字；
5. 手机窄屏（< 860px）下侧边栏变成顶部标签，不出现横向滚动条。

## 提交 PR

- 一个 PR 只做一件事，标题写清改动范围（如 `docs: 修正 Alpine 换源说明`）。
- 涉及命令变更时，请在描述里贴出实际执行过的验证过程。
- **不要在 PR、截图或日志里出现真实 API Key。**
