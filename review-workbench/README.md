# 见片 本地审片台

截至 2026-10-18，版本 1.3.0。本地六阶段创作工作区，提供想法与选题、口播提纲、录制与素材、粗剪、精剪、定稿流程，以及视频预览、独立版本批注和审核。原片支持按拍摄时间批量引用文件夹，选题卡与提纲请求包含观众价值和真实表达标准。界面与服务无第三方运行时依赖，不调用 AI API，也不向云端上传素材。

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

## 文件夹批量导入原片

第 3 步点击“批量导入文件夹”，粘贴这台电脑上的完整路径，可选择包含子文件夹。扫描后显示从早到晚的列表、时间来源、重复和损坏项；可取消勾选部分文件，再一次导入所选。通用添加视频窗口也提供此入口。固定导入为第 3 步原始素材，每段独立预览、批注与审核，后续粗剪另加新版本。

只保存原文件引用，不复制、移动或上传云端，请保留原路径。支持 MP4、MOV、M4V、WebM；能否播放仍取决于浏览器解码。扫描不改变作品视频记录；导入时逐段生成缩略图并保存，可停止后续导入，已完成的片段保留。失败不阻塞后续，清单保留原因，可重试；文件改变或移动后须重新扫描。刷新或关闭网页会停止后续请求，已保存的片段不丢失，再次扫描会识别已存在项。

时间规则：优先 QuickTime `com.apple.quicktime.creationdate`，其次容器/视频轨 `creation_time`；无有效元数据时用文件修改时间，并标为备用。无时区的时间按北京时间解释并提示；全表显示北京时间，相同时间按文件名自然排序。创建时间也可能来自导出软件，备用时间可能是拷贝或编辑日期，应先核对。原片预览卡按此时间升序排列；旧素材无时间信息时显示未记录拍摄时间，以添加时间排序。剪辑版本继续按添加顺序倒序显示。

重复判断范围为当前作品的原始素材，以规范化完整路径判断，兼容 Windows 路径大小写；不按内容哈希去重，复制或改名后视为另一个文件。子目录链接不跟随；不可读子文件夹和损坏文件给出提示。单次最多 2000 个支持的视频，最多遍历 20000 个目录项，超限请分文件夹扫描。

- `POST /api/projects/:id/folder-scan`：JSON `{"folderPath":"C:/素材/本期","includeSubfolders":false}`，返回 `scan.id`。
- `GET /api/projects/:id/folder-scan/:scanId`：异步扫描状态及有序 `entries`。状态为 `scanning`、`ready`、`failed` 或 `cancelled`；条目包含唯一 `id`、`order`、`filePath`、`capturedAt`、`sortAt`、`timeSource`、`timeLabel`、`timezoneAssumed`、`duplicate` 和可能的 `error`。
- `DELETE /api/projects/:id/folder-scan/:scanId`：当前元数据读取完成后停止扫描。
- `POST /api/projects/:id/folder-import`：JSON `{"scanId":"...","entryId":"..."}`，逐项引用。新增返回 201，已存在返回 200 且 `skipped:true`；网页一次点击后按清单顺序发送这些请求，显示进度和结果。

扫描清单保存在服务内存，一小时未访问或服务重启后需重新扫描。只允许导入清单内的条目，导入前后检查文件变化；并发重试同一路径只保存一份。版本 `material` 保留批次、来源、次序与时间依据，`mediaTime` 保存读取的时间信息；导出保留来源与排序依据。后续 agent 据此组织原片，再根据内容调整叙事顺序。

## 观众价值与真实表达

每张选题卡新增“观众能获得什么”“真实经历切入点”“观众为什么关心”。点击卡片上的编辑入口即可补充，保存后仍保留该选题的 ID 和已选方向。旧记录缺少这些字段时显示待补充；素材不足可以明确写待补问题，本期无需自曝也可说明，不自动生成用户经历。

修改已选方向的补充会让提纲恢复需要修改，并清空本版自检；补充其他候选不会取消当前提纲审核。修改后仍保留旧提纲，可重新保存核对后的版本；视频审核独立保留。

提纲页显示已选方向的三项约定，并提供四项内容自检：观众所得、真实依据、表达推进和结尾回应。勾选后点击保存自检，或随提纲审核一起保存。自检是辅助记录，不要求全部勾选才能审核，也不自动通过提纲。正文有未保存修改或选题关联变化时，保存自检会先保存提纲为待审新版。新提纲清空自检，旧版历史保留当时的记录。

网页生成的选题、提纲和粗剪请求都会携带当前创作标准；选题请求要求返回三项新字段，提纲请求带上已选方向的具体约定。JSON 导出保留全部记录，Markdown 导出包含已选方向的观众价值与提纲自检。应用文案按知识库 2026-10-18 原则实现，原则主源继续由知识库维护。

## 与当前对话的衔接

本网页与对话共享的是本机作品记录，不是已建立的消息通道。用户复制请求并发送后，agent 读取接口、完成这一阶段并写回，用户刷新即可查看，不必反复拷贝整段素材。也可用“导入回复”手动粘贴结果。网页不会把“已保存”显示成“AI 正在执行”。

真正自动启动模型需要单独实现运行连接、任务状态和错误处理。官方 [Codex App Server 的 thread/start 与 thread/resume](https://learn.chatgpt.com/docs/app-server#start-or-resume-a-thread) 提供集成能力；此版本没有建立该连接，也不读取桌面应用的内部会话数据库。

前期结果写入 `PATCH /api/projects/:id/planning`，请求 JSON 的 `action` 可为：

- `ideas`：`ideas`、`audience`、`duration`，返回新的 `ideasRevision`。
- `topics`：`ideasRevision` 必须等于当前版本；`topics` 必须有三个对象，字符串字段为 `title`、`premise`、`conflict`、`viewpoint`、`reasons`、`missing`，可有 `recommended` 布尔字段。新请求还要求填写字符串 `audienceValue`、`authenticEntry`、`audienceConnection`；为兼容旧回复，接口允许省略并保存为空字符串，页面显示待补充。
- `topic-values`：`topicId`、当前 `topicRevision`，以及 `audienceValue`、`authenticEntry`、`audienceConnection` 三个字符串。阻止过期修改；修改已选方向会让提纲重新核对。
- `select-topic`：`topicId`，只允许当前想法对应的候选。
- `outline`：`topicId`、`topicRevision`、`text`，必须匹配已选方向；保存为待审。
- `outline-checklist`：当前 `outlineRevision`、`checklist`，键为 `audienceValue`、`authenticity`、`progression`、`takeaway`，值为布尔值；必须对应当前选题与提纲。
- `outline-review`：`outlineRevision`、`status`（`approved` 或 `changes_requested`）、`note`；退回须附意见，可同时传入上述 `checklist`。
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

运行 `node server.mjs` 启动开发服务，运行 `npm test` 执行集成检查。测试使用隔离的临时资料目录，不改实际项目记录。文件夹检查使用 FFmpeg 生成的小视频，覆盖元数据排序、备用时间、损坏文件、重复与并发重试、文件变化和持久化。

演示视频由 `scripts/create_demo.py` 使用 Pillow 和 FFmpeg 生成，均明确标注为演示。首次运行测试前需有演示视频，生成脚本不会覆盖已有作品。

接口入口：`GET /api/workspace` 读取工作区；`POST /api/projects` 创建作品；`POST /api/projects/:id/import-path` 添加路径引用；`POST /api/projects/:id/upload` 流式导入文件；`POST /api/projects/:id/comments` 保存批注；`PATCH /api/projects/:id/comments/:commentId` 更新批注；`POST /api/projects/:id/review` 保存审核；`GET /api/projects/:id/export?format=json` 导出完整记录。
