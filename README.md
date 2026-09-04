# virtual-net

浏览器里的"虚拟配网"沙盘。拖设备、连网线、配 IP，直接验证"能不能通、在哪断、为什么"。

覆盖中国家庭和小公司的真实上网环境：光猫、路由器、交换机、软路由、旁路由、PVE、VPS、长城防火墙、代理线路。

- 路线图与阶段目标：[ROADMAP.md](ROADMAP.md)
- 检查点细化文档：`docs/checkpoints/`
- 设计文档：`docs/design/`

## 环境要求

- Node 22（仓库根有 `.nvmrc`，用 nvm 的话直接 `nvm use`）
- pnpm 11。没装就跑 `corepack enable`，进到仓库后 pnpm 会按 `packageManager` 字段自动用对版本；也可以 `npm i -g pnpm`

## 上手

```bash
pnpm install   # 装依赖
pnpm dev       # 启动网页，打开终端打印的地址
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

## 目录结构

`packages/engine` 是纯 TypeScript 的模拟引擎，`apps/web` 是网页；网页单向引用引擎。
