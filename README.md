# virtual-net

浏览器里的"虚拟配网"沙盘。拖设备、连网线、配 IP，直接验证"能不能通、在哪断、为什么"。

面向家庭、工作室和小公司的网络规划。当前已完成局域网、多设备、路径动画、通用访问控制、服务器与单级代理，以及工作台和连线优化。新增复制与固定分组、整体强调色、图片/PDF 导出、品牌分享卡片和导入前分步检查均已完成本地验证；虚拟网络与独立学习模块仍在规划中。

配色只改变工作台的整体强调色，画布和节点保持白灰底色；不再提供深色、背景和设备填充设置。强调色随网络图保存及导入导出，支持撤销和重做；旧配色字段仍可读取，但不会恢复旧的填充效果。

本轮 415 项测试、代码检查、构建及类型检查通过，桌面与手机实际全流程通过，无页面异常；尚未部署。

- 路线图与阶段目标：[ROADMAP.md](ROADMAP.md)
- 检查点细化文档：`docs/checkpoints/`
- 设计文档：`docs/design/`
- 网络模型与已完成页面优化：[2026-09-07 修订](docs/design/network-model-and-ui.md)
- 新增工作台交互：[复制与分组](docs/checkpoints/UX-groups.md)、[配色](docs/checkpoints/UX-appearance.md)、[导出与分享](docs/checkpoints/UX-export.md)、[导入检查](docs/checkpoints/UX-import.md)；本地进度和验收以各文档为准，未部署。

## 环境要求

- Node 22（仓库根有 `.nvmrc`，用 nvm 的话直接 `nvm use`）
- pnpm 11。没装就跑 `corepack enable`，进到仓库后 pnpm 会按 `packageManager` 字段自动用对版本；也可以 `npm i -g pnpm`

## 上手

```bash
pnpm install   # 装依赖
pnpm dev       # 固定 http://127.0.0.1:5180/，已启动时复用，端口占用不自动换号
pnpm test      # 跑引擎测试
```

## 其他命令

```bash
pnpm lint        # 代码检查 + 格式校验，不改文件
pnpm lint:fix    # 自动修可修的问题
pnpm format      # 只格式化
pnpm typecheck   # 每个包各自做类型检查
pnpm build       # 类型检查后打包，产出 apps/web/dist
```

## 部署

线上地址：<https://vnet.flyooo.uk>（备用 <https://virtual-net.jiwzdj.workers.dev>）

一条命令完成打包和发布：

```bash
pnpm deploy    # 等价于 pnpm build && wrangler deploy
```

站点跑在 Cloudflare Workers 的静态资源托管上，配置在仓库根的 `wrangler.jsonc`：
访问未命中的路径统一回落到 `index.html`（前端路由需要），`apps/web/public/_headers`
给带 hash 的构建产物加了长缓存。首次在新机器上部署要先 `npx wrangler login` 登录 Cloudflare。

## 目录结构

`packages/engine` 是纯 TypeScript 的模拟引擎，`apps/web` 是网页；网页单向引用引擎。
