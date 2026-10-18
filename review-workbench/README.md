# 见片 本地审片台

截至 2026-10-18，版本 1.5.0。本地六阶段创作工作区，提供想法与选题、口播提纲、录制与素材、粗剪、精剪、定稿流程，以及视频预览、批注和剪辑版审核。原片只需批注或移除，完成后一键复制粗剪请求；支持按拍摄时间批量引用文件夹，以及视频批量移除、撤销和恢复。选题卡与提纲请求包含观众价值和真实表达标准。界面与服务无第三方运行时依赖，不调用 AI API，也不向云端上传素材。

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
6. 原片批注用于交接粗剪，页面显示“粗剪时处理”，无需逐条勾选处理或通过原片。粗剪及后续剪辑版可勾选批注处理状态；尚有待处理批注时不能通过该剪辑版，通过后新增或重新打开批注会重新进入需要修改状态。新剪辑版独立待审，不继承旧版通过结论。
7. 选择需要修改或通过本阶段。审核历史不会随着状态变化被覆盖。
8. 导出 Markdown 或 JSON 制作记录（包括前期想法、已选方向、提纲与录制备忘）。在当前对话里要求 agent 按反馈处理，再添加生成的新视频版本。保存或复制请求不会自动发送消息或启动 AI。

想法变化后，旧选题不能再确认；换选题或修改提纲后，旧提纲的通过状态失效。保存新版提纲时保留旧版正文和当时的审核信息。未保存的输入暂存在当前浏览器；点击保存后的内容进入后端文件，才能被其他工具读取。

## 移除、清理重复项与恢复

预览区“视频与版本”标题右侧提供“移除当前视频”和“管理视频”。前者预选当前片段，后者允许批量勾选；点击“移除选中的视频”后从本作品列表隐藏，并隐藏该版批注，不影响其他版本。磁盘上的源视频、上传副本和缩略图都保留，不提供永久删除。

管理窗口的“仅选多余重复项”按同一阶段、同一规范化完整路径识别，兼容本机 Windows 路径大小写，保留最早添加的一份，其余勾选后仍由用户点击移除。不同目录下的同名文件、复制后路径不同的同内容视频不自动判为重复，也不会按标签名相同就删除。

移除后可立即点击“撤销本次移除”，或在“管理视频 → 已移除”中勾选恢复。作品顶部也会出现“恢复已移除视频”，全部移除或切换到前期步骤后仍能找到恢复入口。刷新、服务重启后仍可恢复，恢复时带回原版本 ID、素材顺序、批注、处理状态和审核结论。恢复曾经通过的版本只是恢复原记录，不新增通过结论；缺少或移动了源文件时，恢复记录不能使文件重新出现。恢复旧引用可能产生用户主动确认的重复，可再管理。

内部只给版本添加 `removedAt`，原记录留在 `workspace.json`。`GET /api/workspace` 的 `versions` 和 `comments` 仅包含未移除内容，`removedVersions` 提供恢复清单摘要。已移除的视频和缩略图 URL 返回 404，评论和审核写入也被拒绝。普通 JSON/Markdown 制作导出仅包含当前视频与批注，JSON 额外附已移除摘要；完整备份仍须保存工作区目录与引用的源文件。移除后的路径可重新通过文件夹导入，原移除记录仍保留。

- `DELETE /api/projects/:id/versions/:versionId`：移除单个视频。
- `POST /api/projects/:id/versions/remove`：JSON `{"versionIds":["..."]}`，批量移除。
- `POST /api/projects/:id/versions/restore`：同上，批量恢复。

批量操作先验证所有 ID 都属于当前作品，再原子保存；返回实际变更的 `versionIds` 与 `count`，重复移除或恢复不重复写审核历史。每次最多 2000 个视频。移除和恢复均记入作品历史，不代用户筛选或删除真实素材。

## 文件夹批量导入原片

第 3 步点击“批量导入文件夹”，粘贴这台电脑上的完整路径，可选择包含子文件夹。扫描后显示从早到晚的列表、时间来源、重复和损坏项；可取消勾选部分文件，再一次导入所选。通用添加视频窗口也提供此入口。固定导入为第 3 步原始素材，每段独立预览与批注，后续粗剪另加新版本并审核。

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

### 只补录音频，定格画面配字幕（2026-10-18，v1.6.0）

粗剪或后续版本的待处理批注提供“用补录音频替换”；已建立补录任务时，播放器下方显示“补录配音”区域。点击“看字幕提示”会暂停到目标时间并叠出补录稿；默认播放经过该区间时也会自动暂停，可取消勾选。该提示只用于网页预览，现有视频文件不会因此改变。

点击“添加本段音频”，可修改补录稿和替换区间，再选择或拖入音频，也可粘贴本机完整路径。支持 MP3、M4A、WAV、AAC、FLAC、OGG、WebM、AMR，单份最多200MB、一小时；仅本机保存，不上传云端。选择文件会复制原音频，路径方式保留原文件引用；两种方式均另外生成 AAC/M4A 试听文件，原音频不修改。每次添加保留旧录音，可切换当前采用的录音，试听后再交接。

录音齐后，点击“录音已齐，复制配音合成请求”，粘贴到当前对话发起制作；复制失败时弹出可 Ctrl+C 的备用文本。添加录音与保存稿件只保存素材，不自动合成、不处理批注或通过审核。执行时核对实际声音、语句边界与字幕，按新声音长度定格合适画面，去掉替换区间的旧声音，接回原片，另存新的待审视频。已按用户要求完成的字幕勘误继续保留，不强制再补录。

工作区 `project.pickups` 保存 `commentId`、`versionId`、`time/end`、`text`、`visual:freeze`、`audios` 和 `selectedAudioId`。音频含原始路径、试听路径、时长、大小和文件名，公开接口附 `available` 与 `url`。JSON 与 Markdown 制作记录均包含补录信息；移除对应视频时一起隐藏，恢复后保留原关联和录音历史。

- `POST /api/projects/:id/pickups`：`commentId`、补录 `text`，可填 `time/end`；同一批注重复保存更新原任务。
- `PATCH /api/projects/:id/pickups/:pickupId`：修改稿件、区间或 `selectedAudioId`。
- `POST /api/projects/:id/pickups/:pickupId/import-path`：JSON `filePath`。
- `POST /api/projects/:id/pickups/:pickupId/upload?fileName=...`：原始音频流，需 `X-Review-Client: workbench`。
- `GET/HEAD /pickup-audio/:audioId`：AAC/M4A 试听，支持 Range；对应视频被移除后不可访问。

本网页与对话共享的是本机作品记录，不是已建立的消息通道。用户复制请求并发送后，agent 读取接口、完成这一阶段并写回，用户刷新即可查看，不必反复拷贝整段素材。也可用“导入回复”手动粘贴结果。网页不会把“已保存”显示成“AI 正在执行”。

原片批注完成后，在预览区下方点击唯一的“批注完成，复制粗剪请求”，按钮会保存录制备忘、刷新当前记录并直接复制请求，无需再在交接弹窗里点第二次复制。复制成功后页面提示粘贴到当前对话发送，发起第 4 步制作。浏览器拒绝直接复制时，才弹出已选中文字的备用窗口供 Ctrl+C 复制。当前批注输入框有未保存内容时，先提示保存，避免遗漏。

第 3 步已取消“需要修改”“通过本阶段”及手动标记原片批注已处理的操作，也移除了旧的重复交接按钮和“进入粗剪审核”链接。原片状态仅显示“原始素材”或“原片”，历史 `review` 数据保留兼容，不作为交接条件。需要舍弃的原片由用户移除；批注直接作为粗剪任务。第 4 步以后继续保留成片审核，阶段导航仍可查看对应版本。

粗剪请求包含当前有效原片和原片批注数量，并明确要求读取每段的批注与审核说明，按原片版本 ID 和时间处理。区间需核对语意，单个时间点需检查附近停顿或句子边界；涉及改口播意思的批注另列补录，不能冒充已经改成用户没录过的话。交付须有可播放合并粗剪、新的待审版本和逐条处理说明；尚未落实的批注继续待处理，不代用户审核。

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

### 可复用精剪与发布后清理（2026-10-18）

`scripts/finish_video.py` 已从实际精剪流程提取到源码，支持校对后的大字短句字幕、暖黄/珊瑚/蓝色重点、引用样式、短入场、上方提示及轻微推近。接受人工核对的画面段落，包括干净视频保留段与定格图；声音全程复制已审成片的完整AAC流，不修改语速、内容或审核状态。输入先验SHA-256，输出拒绝覆盖，完成后检查完整解码、帧数、时间与音频流一致性；验证通过即删除本次生成的大体积临时图片视频，只留小日志和结果。操作后仍需抽看字幕、语意与拼接，并检查浏览器播放。

```powershell
python scripts/finish_video.py C:/素材/本期/精剪_v1/finish-manifest.json --threads 6
python test/test_finish_video.py
```

清单含 `outputName`（同目录新MP4）、`audioFile`（已审AAC成片）、`fps`、`size`、`inputs`（每个输入的`filePath/sha256`）、有序 `segments`、`captions`，可选 `overlays/pushIns/theme/clips`。视频段含 `kind:copy/filePath/start/duration`，静帧段含 `kind:still/filePath/duration`；时长按帧率对齐，总时长应与已审声音相同。字幕项含 `start/end/lines`，最多两行，默认每行11字；可选 `emphasis`（一段原文字词）、`color:yellow|coral|blue`、`style:quote`、`animate:true`。主题默认按720宽画面主字号56、重点60缩放，可配置字体、字号、底部边距及每行字数；上方提示项含 `start/end/lines`、可选 `position/fontSize`；推近项含 `start/end/amount`（默认0.026）。输出ASS、SRT、`finish-result.json`。有旧烧录字幕的底片须先核对干净画面的准确映射，不能重复叠字或丢失已确认的补录与勘误。合成测试使用隔离小视频，检查完整AAC流保留、字幕生成、定格拼接、缓存收尾、输入保护和拒绝覆盖。

用户选择视频发布后自行删除整期作品目录。发布确认后，先把通用工具与经验保存到本源码和长期知识库，把必要的作品结果、用户反馈与发布链接记入台账；不要求永久保留本期转写、逐帧映射、检查截图、源素材或导出版本。制作与审核期间继续保留原片和旧版，待用户实际发布后再按其决定清理。知识库、源码和 `REVIEW_DATA_DIR` 在作品目录之外，删除本期目录不会删除它们；但路径引用的历史视频会不可播放，单靠批注和摘要不能恢复原片或保证精确回剪。当前没有自动检测发布、删除或将媒体标记为已归档的功能，不把本地第6步通过当作平台已发布。目录外原片、录音和应用媒体不会随作品目录一起删除。

### 本机粗剪脚本（2026-10-18）

`scripts/transcribe_footage.py` 将单个作品的 API 快照按原片备用排序转写，输出词级时间与静音检测结果。使用已缓存的 faster-whisper 模型，CPU int8，不下载模型或上传音视频；本机需已安装 faster-whisper、FFmpeg 和 FFprobe。`--prompt` 可填本期专用词。缓存核对源文件大小、修改时间、模型与提示词，变化后重新转写。`scripts/inspect_footage.py` 输出逐段抽样画面与技术信息，当前字体路径用于 Windows。静音检测和自动转写只辅助定位，不能直接决定删减或生成准确字幕。

`scripts/render_rough_cut.py` 根据人工核对的 `edit-manifest.json` 真正渲染合并视频，生成原片到成片的时间映射；`scripts/validate_rough_cut.py` 对成片完整解码、核对声画时长、测量响度并复核原文件 SHA-256。脚本不写工作区、不改批注或审核状态。制作快照、路径、转写、剪辑决定及媒体均存仓库外的本机素材目录。

```powershell
python scripts/transcribe_footage.py C:/素材/本期/作品快照.json C:/素材/本期/转写 --model small --threads 8
python scripts/inspect_footage.py C:/素材/本期/作品快照.json C:/素材/本期/检查
python scripts/render_rough_cut.py C:/素材/本期/粗剪_v1/edit-manifest.json --threads 6
python scripts/validate_rough_cut.py C:/素材/本期/粗剪_v1/render-result.json
```

快照应取 `GET /api/workspace` 中单个作品对象，包含当前有效 `versions`。清单顶层含 `fps`（默认30）、`size`（默认720×1280）、`outputName` 和按最终顺序排列的 `clips`；每段须含 `order`、`versionId`、`filePath`、`duration`、`sourceSize`、`sourceMtimeNs`、`sourceSha256`、`keep`。`keep` 为原片秒数的有序不重叠半开区间，并按输出帧率对齐。根据实际内容选区间，不用静音阈值一键删除所有停顿。

`scripts/render_voice_pickups.py` 用核对后的清单执行定格配音。先核验输入哈希，再将底片分成保留段与定格配音段，匹配新录音响度、给接点加短淡入淡出，合并 H.264/AAC 新版。它不会改工作区或批注状态。完成后同样运行 `validate_rough_cut.py`，后者会额外核验清单所列旧成片、补录音频等 `inputs`，并保留源素材检查。

```powershell
python scripts/render_voice_pickups.py C:/素材/本期/粗剪_v3/voice-manifest.json --threads 6
python scripts/validate_rough_cut.py C:/素材/本期/粗剪_v3/render-result.json
```

定格配音清单含 `baseFile`、`baseVersionId`、`requestedVersionId`、`outputName`、`fps`、`size`、`sourceClips`、`inputs` 和有序 `segments`。`inputs` 每项为 `filePath/sha256`；保留段含 `kind:copy`、`baseStart/baseEnd/duration`；配音段含 `kind:freeze_voice`、原替换范围、新 `duration`、`audioFile/audioStart/audioEnd`、`freezeFile` 和 `subtitleFile`。静帧和 ASS 字幕先在独立版本目录准备好，字幕路径用该目录下的相对文件名；录音范围与定格时长按帧率对齐。`render-result.json` 的 `timeline` 逐段列出旧版范围和新片 `outputStart/outputEnd`，变长的替换段不能视为一比一视频映射。人物静帧须抽看，字幕须与实际录音核对。

录音若绑定旧版，而新版已有应保留的修改，须先证明目标区间和声音对应关系一致，才能将选中录音应用于新版。无法证明时不能直接套时间点。最终播放检查、输入不变核验、完整新旧时间映射和处理说明完成后，再保存待审版本及落实批注。对短窗转写漏句或编码采样对齐差异，结合实际音频播放、对齐后的波形与上下文核实，不把自动识别结果当作声音缺失的唯一证据。

渲染以 H.264/AAC 输出，统一尺寸和采样率，切口加8毫秒音频淡入淡出，再做双遍响度归一化（dual-mono -16 LUFS、目标真峰值 -1.5 dBTP）。当前用于含视频和音频的口播原片；横竖屏、旋转、无音轨素材须先核对适配，不能直接套用。分段缓存仅在源文件统计与清单签名一致时复用；实际交付后应固定该输出文件，下一版使用新目录和新文件，避免覆盖已被工作区引用的版本。每版仍需检查关键语句切口、画面和浏览器可播放性，再通过路径导入接口保存为新的待审版本。

运行 `node server.mjs` 启动开发服务，运行 `npm test` 执行集成检查。测试使用隔离的临时资料目录，不改实际项目记录。文件夹检查使用 FFmpeg 生成的小视频，覆盖元数据排序、备用时间、损坏文件、重复与并发重试、文件变化和持久化。

演示视频由 `scripts/create_demo.py` 使用 Pillow 和 FFmpeg 生成，均明确标注为演示。首次运行测试前需有演示视频，生成脚本不会覆盖已有作品。

接口入口：`GET /api/workspace` 读取工作区；`POST /api/projects` 创建作品；`POST /api/projects/:id/import-path` 添加路径引用；`POST /api/projects/:id/upload` 流式导入文件；`POST /api/projects/:id/comments` 保存批注；`PATCH /api/projects/:id/comments/:commentId` 更新批注；`POST /api/projects/:id/review` 保存审核；`GET /api/projects/:id/export?format=json` 导出当前制作记录及已移除摘要。
