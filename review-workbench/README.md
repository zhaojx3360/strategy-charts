# 见片 本地审片台

截至 2026-10-16，版本 1.1.0。本地六阶段创作工作区，提供想法与选题、口播提纲、录制与素材、粗剪、精剪、定稿流程，以及视频预览、独立版本批注和审核。界面与服务无第三方运行时依赖，不调用 AI API，也不向云端上传素材。

## 打开

双击 `C:/disk/self-space/self-media/打开本地审片台.cmd`，或运行当前目录的 `start.ps1`。服务只监听本机 `http://127.0.0.1:4317`，重复启动会复用已运行的服务。

需要 Node.js 22 或更新版本；启动脚本优先使用 PATH 中的 Node，也支持当前 Codex 配套运行时。FFmpeg 与 ffprobe 可从 PATH 读取，用于视频轨道检查和缩略图；不修改原视频。

停止时执行当前目录的 `stop.ps1`。停止和重新启动不会清除素材、版本、批注或审核记录。

## 使用

1. 创建作品，在第 1 步自由输入想法，可补充受众和预计时长。点击保存并整理选题，复制请求到当前 Codex 对话发送。agent 保存三个方向后刷新网页，也可导入选题 JSON；每个方向包含标题、主旨、矛盾、观点、理由和待补内容。确认一个方向后进入第 2 步。
2. 在第 2 步复制提纲请求并发到对话，或直接填写、导入提纲正文。修改、保存和审核提纲：需要修改时填写意见；通过后进入第 3 步。录制页展示提纲、准备勾选和备忘，可上传原片。已有素材也可直接添加，继续后期。
3. 添加原始素材、粗剪、精剪或定稿版本。选择文件会复制到本地素材区；本机路径模式只保存引用，原文件不能随意移动。
4. 播放、拖动进度、切换版本。MP4（H.264）兼容性最好；MOV、HEVC 等格式是否可播取决于浏览器解码支持。
5. 暂停后写批注，可以使用当前时间，也可以直接填写 `01:32.5` 或秒数。开启区间后填写结束时间。批注始终绑定具体版本。
6. 勾选批注的处理状态。尚有待处理批注时不能通过该版本；通过后新增或重新打开批注，会重新进入需要修改状态。新版本独立待审，不继承旧版通过结论。
7. 选择需要修改或通过本阶段。审核历史不会随着状态变化被覆盖。
8. 导出 Markdown 或 JSON 制作记录（包括前期想法、已选方向、提纲与录制备忘）。在当前对话里要求 agent 按反馈处理，再添加生成的新视频版本。保存或复制请求不会自动发送消息或启动 AI。

想法变化后，旧选题不能再确认；换选题或修改提纲后，旧提纲的通过状态失效。保存新版提纲时保留旧版正文和当时的审核信息。未保存的输入暂存在当前浏览器；点击保存后的内容进入后端文件，才能被其他工具读取。

## 与当前对话的衔接

本网页与对话共享的是本机作品记录，不是已建立的消息通道。用户复制请求并发送后，agent 读取接口、完成这一阶段并写回，用户刷新即可查看，不必反复拷贝整段素材。也可用“导入回复”手动粘贴结果。网页不会把“已保存”显示成“AI 正在执行”。

真正自动启动模型需要单独实现运行连接、任务状态和错误处理。官方 [Codex App Server 的 thread/start 与 thread/resume](https://learn.chatgpt.com/docs/app-server#start-or-resume-a-thread) 提供集成能力；此版本没有建立该连接，也不读取桌面应用的内部会话数据库。

前期结果写入 `PATCH /api/projects/:id/planning`，请求 JSON 的 `action` 可为：

- `ideas`：`ideas`、`audience`、`duration`，返回新的 `ideasRevision`。
- `topics`：`ideasRevision` 必须等于当前版本；`topics` 必须有三个对象，字符串字段为 `title`、`premise`、`conflict`、`viewpoint`、`reasons`、`missing`，可有 `recommended` 布尔字段。
- `select-topic`：`topicId`，只允许当前想法对应的候选。
- `outline`：`topicId`、`topicRevision`、`text`，必须匹配已选方向；保存为待审。
- `outline-review`：`outlineRevision`、`status`（`approved` 或 `changes_requested`）、`note`；退回须附意见。
- `recording`：`notes`、`checklist`（`audio`、`framing`、`facts`、`materials` 布尔字段）。

agent 只写入候选与提纲，不能代替用户选择方向或通过真实作品。演示项目里的确认与审核仅用于 UI 验收。

快捷键：空格播放或暂停，左右方向键跳转五秒，C 聚焦批注。输入框内不响应这些快捷键。

## 本地数据

默认目录为 `C:/disk/self-space/self-media/审片台`：

- `workspace.json` 保存项目、版本文件路径、批注、审核与历史。
- `workspace.json.bak` 保留上一次保存前的记录。
- `media/` 保存复制导入的视频、缩略图和明确标记的演示视频。

备份时完整复制该目录；路径引用模式下，也需要保留引用的原视频。`REVIEW_DATA_DIR` 环境变量可调整资料目录，`PORT` 可调整直接运行服务时的端口。启动脚本默认使用 4317。

原始视频和运行数据不提交到源码仓库。长期维护入口与创作规则只在 `C:/disk/self-space/agent-memory-vault/10-项目记忆/自媒体/自媒体创作.md` 维护。

## 验证与本地开发

运行 `node server.mjs` 启动开发服务，运行 `node --test test/server.test.mjs` 执行集成检查。测试使用隔离的临时资料目录，不改实际项目记录。

演示视频由 `scripts/create_demo.py` 使用 Pillow 和 FFmpeg 生成，均明确标注为演示。首次运行测试前需有演示视频，生成脚本不会覆盖已有作品。

接口入口：`GET /api/workspace` 读取工作区；`POST /api/projects` 创建作品；`POST /api/projects/:id/import-path` 添加路径引用；`POST /api/projects/:id/upload` 流式导入文件；`POST /api/projects/:id/comments` 保存批注；`PATCH /api/projects/:id/comments/:commentId` 更新批注；`POST /api/projects/:id/review` 保存审核；`GET /api/projects/:id/export?format=json` 导出完整记录。
