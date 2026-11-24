# 插件能力验证

当前适配对象：`dsh-godot-ai@0.8.0`、DSH `0.2.2-rc.5` 官方 Web、Godot AI `4.4.2`、Godot `4.7`（本机引擎 `4.7.2`）。三款旧版游戏、Adaptive 矩阵和 `validation/rc2-release/` 中的报告属于 0.7.0 历史证据，不作为本版本的验收证据。

## 本次已执行

- 类型检查：`node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`，无诊断。
- 构建：`tsc -p tsconfig.json` 与 `tsdown`，产出 `lib/index.js`、`lib/agent.js`、`lib/client.js`。
- 单元与组件契约：`vitest run`，27 个文件 94 个用例，90 通过、4 个因运行环境禁止创建符号链接（`EPERM: operation not permitted, symlink`）无法执行；这 4 个用例本身在验证 symlink 拒绝逻辑，不是适配缺陷。
- 兼容清单契约：`compatibility.json` 与 `cordis.patch.yml` 对照 rc.5 官方 `presets/ptc.patch.yml` 逐行比对，除 Godot 声明与新增 `godot-ai-agent` 行外无差异。
- Godot AI 4.4.2 工具面：在独立 venv 中安装 `godot-ai==4.4.2`，直接调用 `create_server(ws_port=9500, capabilities=generate_capabilities(), http_port=8000)` 与 `tool_catalog_hash()`，得到 47 个工具、目录哈希 `0733ca47a6832d610a77258e953e8c48d5f00588dd40a186ba312b5d129bb114`、`attach_protocol_version` 1，与 `compatibility.json` 完全一致。

## 本次未执行

- 正式安装：未通过 DSH CLI 的 `plugin --profile ... add <tarball>` 安装打包产物。
- 真实 Host 挂载：未启动隔离 rc.5 Web 实例，未运行 `validation/rc2-smoke.mjs verify` 的 `/__dga-smoke` 探针。
- 编辑器链路：未连接 Godot 编辑器，因此未验证 Addon 会话、工具调用、编辑器写入、运行输入与完整游戏创作 E2E。
- 真实模型生成与发布比对：未重新测试；npm 线上包与 GitHub 附件的 SHA-256 比对属于发布流程。

上述缺口意味着本版本只声明静态契约与工具面适配，不声明运行时端到端通过。`validation/` 下的测试桥不进入 npm 包，只运行固定的只读 Godot 调用，不接受任意代码或项目修改；测试应使用独立 DSH Home/profile/端口，日常 Web profile 不参与。

## 重跑命令

```bash
pnpm check
pnpm test
pnpm build
```

Host 重跑需要先通过正式 CLI 在隔离 profile 安装测试 tarball，并挂载 test-only probe：

```bash
DSH_GODOT_SMOKE_URL=http://127.0.0.1:<测试端口> \
DSH_GODOT_TEST_LOG=<本次隔离Host私有启动日志> \
node validation/rc2-smoke.mjs verify
```

启动日志包含本次 Host 的认证链接，必须留在本地权限受控目录；报告不记录 token 或模型凭据。不要把日常 profile 用作测试目录。

## 历史证据

[单元报告](validation/rc2-release/unit-report.json)、[运行报告](validation/rc2-release/runtime-report.json)和[发布报告](validation/rc2-release/release-report.json)记录 0.7.0 各层的实际结果；0.8.0 未重新生成这些报告。0.7.0 的迁移门禁由 [plan.json](docs/10-plans/godot-creator-rc2/plan.json) 管理。

静态单元测试、类型检查和工具面比对不等同于完整游戏验收。
