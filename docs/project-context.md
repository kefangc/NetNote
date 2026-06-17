# 软件杯 A3 项目上下文总览

更新时间：2026-06-17

## 1. 项目目标

本项目用于参加第十五届中国软件杯 A 组赛题 **A3：基于大模型的个性化资源生成与学习多智能体系统开发**。

当前产品定位是：以 **计算机网络课程** 为切入点，开发一个接近 NotebookLM 体验的个性化学习智能体系统。V1 先完成可演示、可扩展的核心学习闭环，暂不深度接入云南大学智慧教育平台。云南大学智慧教育平台中的计算机网络课程、概览和思维导图能力作为 V2 的课程结构接入参考。

V1 主流程：

1. 创建或进入“计算机网络”课程工作区。
2. 上传或搜索补充来源。
3. 解析来源，生成每个来源自己的来源指南。
4. 基于来源与 AI 聊天，支持 Markdown 和流式输出。
5. 生成学习资源：概要、闪卡、测验、思维导图、问答卡片、拓展阅读。
6. 通过测验、闪卡、问答行为形成学习画像。
7. 根据画像生成学习建议和下一步路径。

## 2. 竞赛要求映射

赛题核心要求与当前项目映射如下：

| 赛题要求 | 当前设计/实现 |
| --- | --- |
| 对话式学习画像自主构建 | 通过聊天、测验、闪卡结果更新 `LearningProfile`，包含知识基础、学习目标、薄弱点、资源偏好、正确率、学习节奏、易错模式、兴趣方向等维度。 |
| 多智能体协同资源生成 | 后端以 Agent 职责拆分：`WebSearchAgent`、`RetrievalAgent`、`TutorAgent`、`ResourceAgent`、`ProfileAgent`、`SafetyAgent` 等。后续可用 LangGraph 显式编排。 |
| 至少 5 类个性化资源 | 已覆盖概要、闪卡、测验、思维导图、问答卡片、拓展阅读。 |
| 个性化学习路径规划和资源推送 | `ProfileAgent.recommend()` 基于薄弱点和学习记录生成下一步建议。 |
| 智能辅导加分项 | 聊天区支持基于来源的学习问答，来源不足时允许通用解释并标明通用知识。 |
| 学习效果评估加分项 | 测验报告、闪卡掌握/不会/跳过记录已形成简版闭环。 |
| 防幻觉与内容安全 | RAG 引用、来源不足提示策略已调整为“不拒答但标明通用知识”；`SafetyAgent` 做基础安全过滤。 |
| 响应体验 | 聊天流式输出；网络搜索、资源生成有加载态和进度感；长任务避免白屏。 |
| 文档与开源说明 | `docs/` 下已有架构、API、演示脚本、开源声明等文档，本文件补充完整上下文。 |

## 3. 当前技术栈

### 前端

- Next.js App Router
- TypeScript
- Tailwind CSS
- 自定义 CSS 组件风格，目标是高度复刻 NotebookLM，而不是普通后台管理界面
- Markdown 渲染组件：`frontend/src/components/Markdown.tsx`

### 后端

- FastAPI
- Pydantic
- JSON 文件存储，当前数据文件：`backend/data/workspace.json`
- 本地文件上传目录：`backend/uploads`
- Web 正文抽取：Jina Reader、Trafilatura、HTML fallback、搜索摘要兜底
- AI 接口：OpenAI-compatible API，通过环境变量配置 `base_url`、`api_key`、`model`

### 当前暂未引入但可作为后续增强

- LangGraph：用于显式多智能体图编排。
- PostgreSQL + pgvector：替换当前 JSON 存储，支持持久化、并发写入和向量检索。
- Qdrant：更强向量/混合检索。
- Firecrawl：增强动态网页抓取。
- LiteLLM：模型网关、fallback、用量统计。
- React Flow：若需要更强思维导图编辑/拖拽能力，可替换当前自研 SVG 画布。

## 4. NotebookLM 复刻原则

用户明确要求项目“几乎完美复刻 NotebookLM”的核心体验。当前设计重点：

1. 三栏布局：
   - 左栏：来源、上传、网络搜索、来源列表、来源详情。
   - 中栏：对话，支持流式输出、Markdown、引用、输入框固定底部。
   - 右栏：Studio，生成与查看学习资源。

2. 左侧来源：
   - “添加来源”按钮为圆角胶囊。
   - 网络搜索来源卡片为灰底圆角卡片。
   - 当前搜索卡顶部是输入框，placeholder 为“在网络中搜索新来源”。
   - 下方保留 `Web` 与 `Fast Research` 模式按钮。
   - 搜索结果直接在来源区下方展开，可勾选导入。
   - 全部导入完成后隐藏“全选 / 删除 / 导入”，改为“已导入 X 个来源 / 完成”状态。

3. 来源详情：
   - 默认显示连续正文，而不是暴露 RAG chunk。
   - 底层 chunk 仍然保留，用于检索、引用和调试。
   - 提供“查看片段 / 连续正文”切换。
   - 来源指南只显示在来源页面。
   - 来源指南支持 Markdown。
   - 来源指南下方 tag 可点击后向 AI 提问。

4. Studio：
   - 上方资源按钮为 NotebookLM 风格卡片。
   - 右侧箭头用于打开自定义生成菜单。
   - 打开一个资源后，整个 Studio 区域被该资源详情覆盖，而不是在列表中展开。
   - 来源自动生成的来源指南不进入 Studio。
   - 用户主动生成的“概要”才显示在 Studio，并且是所有来源的综合总结。

5. 思维导图：
   - 打开思维导图时，右侧 Studio 自动加宽。
   - 导图画布支持适配画布、放大、缩小、下载 Markdown、更多菜单、关闭。
   - 节点右侧箭头展开/收起。
   - 点击节点本体向 AI 提问。
   - 暂不复刻“优质内容 / 劣质内容”反馈按钮。

6. 聊天：
   - AI 回复支持 Markdown 渲染。
   - 回复支持流式传输。
   - 等待首字时只显示符合项目风格的 thinking/loading 状态。
   - 不再出现“当前来源不足以可靠回答，建议先上传资料”的拒答式提示；允许普通对话，来源不足时标明通用解释。

## 5. 当前功能状态

### 已实现

- 工作区加载：`GET /workspace`
- 文件上传：`POST /sources/upload`
- 网络搜索候选：`POST /sources/search-web`
- 单条网络来源导入：`POST /sources/add-web`
- 批量网络来源导入：`POST /sources/add-web-batch`
- 基于来源聊天：`POST /chat`
- 学习资源生成：`POST /artifacts/generate`
- 测验提交：`POST /quiz/{artifact_id}/submit`
- 闪卡复习记录：`POST /flashcards/{artifact_id}/review`
- 学习画像获取：`GET /profile`
- Markdown 渲染、代码块、表格基础样式
- 搜索结果选择、全选、批量导入、完成状态
- 来源详情连续正文与片段切换
- Studio 资源详情覆盖式打开
- 思维导图可展开、缩放、适配、下载、关闭

### 近期关键修改

- 后端新增 `AddWebSourcesRequest` 和 `/sources/add-web-batch`。
- 批量导入在后端最多 3 个并发抓取网页，再一次性写入，避免 JSON 文件并发覆盖。
- 上传/导入来源不再自动向 Studio 插入“来源概要”。
- 用户主动生成的概要会设置 `manual: true`，Studio 只展示手动概要。
- 来源详情默认展示连续正文，片段视图变成可选。
- 左侧网络搜索卡改成单输入框结构。

### 需要注意的当前限制

- 当前仍是 JSON 文件存储，不适合真实多用户或高并发。
- 当前检索是轻量关键词/规则检索，不是正式 embedding + vector search。
- 多智能体目前是代码职责拆分，还未用 LangGraph 做显式图编排。
- 网页抓取对反爬、登录页、强动态页面仍可能只能摘要兜底。
- 批量导入接口并发数固定为 3，后续可改为配置项。

## 6. 网络搜索与网页导入设计

当前搜索与导入分两步：

1. 搜索候选：
   - 优先使用 `SEARXNG_BASE_URL`。
   - 未配置时使用 DuckDuckGo HTML/lite fallback。
   - 返回候选项：标题、URL、摘要、域名、搜索提供方。

2. 导入正文：
   - 优先 Jina Reader。
   - 再 Trafilatura。
   - 再 HTML 去标签。
   - 最后搜索摘要兜底。

导入质量状态：

- `complete`：完整正文。
- `partial`：部分正文。
- `fallback`：摘要兜底。
- `failed`：抓取失败。
- `unknown`：未知或旧数据。

正文长度控制：

- 网页正文最多保留较长文本后再切片，避免来源详情明显不完整。
- chunk 用于 RAG，不应默认暴露给普通用户。

## 7. 网络搜索思维导图的更优方案

当前思维导图是“已导入来源 -> 生成导图”。更好的 V2 方案是 **搜索研究图谱**：

1. 用户输入搜索问题。
2. Search Agent 搜索多条候选资料。
3. Extract Agent 抽取每条候选的标题、摘要、主题、可信度、适合章节。
4. Graph Agent 将搜索结果聚类为主题图谱：
   - 中心节点：搜索问题。
   - 一级节点：主题簇，例如 TCP 拥塞控制、流量控制、可靠传输。
   - 二级节点：候选来源。
   - 每个来源节点展示摘要、域名、抓取质量、是否已导入。
5. 用户在图谱中勾选主题或来源。
6. Source Agent 正式导入选中的网页。
7. Resource Agent 基于导入来源生成课程思维导图、测验、闪卡。

这个方案的价值：

- 更贴 NotebookLM 的 Research/Source Discovery 体验。
- 更能体现多智能体协作。
- 演示效果更强：搜索不是列表，而是“可筛选的研究图谱”。
- 可以避免把低质量来源直接导入。

## 8. AI 接口与安全注意事项

项目使用 OpenAI-compatible API。实际密钥不得写入代码或文档，应通过 `.env` 或运行环境变量配置。

文档、提交和演示材料中只能说明：

- 支持配置 `base_url`
- 支持配置 `api_key`
- 支持配置 `model`

不得公开真实 API key。

当前后端 `/health` 会返回：

- 服务是否正常
- AI 是否配置
- 当前模型名

## 9. 代码结构

```text
F:\projects\软件杯
├─ backend
│  ├─ app
│  │  ├─ agents.py        # Agent 职责、检索、问答、资源生成、画像、安全
│  │  ├─ llm_client.py    # OpenAI-compatible LLM 客户端
│  │  ├─ main.py          # FastAPI 路由
│  │  ├─ parsers.py       # 文件解析与切片
│  │  ├─ schemas.py       # Pydantic 数据模型
│  │  ├─ store.py         # JSON 文件存储
│  │  └─ web_ingest.py    # 网页正文抽取
│  ├─ data
│  │  └─ workspace.json   # 当前演示数据
│  └─ uploads             # 上传文件
├─ frontend
│  └─ src
│     ├─ app
│     │  ├─ page.tsx      # 三栏主界面与顶层状态
│     │  └─ globals.css   # 全局 UI 样式
│     ├─ components
│     │  ├─ ArtifactViews.tsx
│     │  ├─ ChatPanel.tsx
│     │  ├─ Common.tsx
│     │  ├─ Markdown.tsx
│     │  ├─ SourcesPanel.tsx
│     │  └─ StudioPanel.tsx
│     └─ lib
│        ├─ api.ts
│        ├─ artifacts.ts
│        └─ types.ts
└─ docs
```

## 10. 代码规范与协作约定

### 通用规范

- 保持代码可维护，避免继续扩大单个组件的复杂度。
- 前端组件过大时应拆分，例如：
  - `SourcesPanel` 可拆为 SearchCard、SearchResults、SourceList、SourceDetail。
  - `ArtifactViews` 可拆为 SummaryView、QuizView、FlashcardsView、MindMapView。
- 不回滚用户已有改动。
- 不把 API key 写进仓库。
- 不提交临时截图、Playwright 输出、缓存文件。

### 前端设计规范

- 目标是 NotebookLM 式产品体验，不是普通 SaaS 管理后台。
- 三栏布局保持稳定，侧栏可收起。
- 操作按钮尽量使用图标与圆形/胶囊控件。
- 文本不能溢出或截断到无法理解。
- 资源按钮文字可放在图标下方或自动换行，避免截断。
- 长任务必须显示加载或进度状态。
- Studio 中打开资源后，整个 Studio 区域应切换为详情。
- 思维导图打开时应自动扩大右侧区域。
- Markdown 表格和代码块必须可读、可横向滚动。

### 后端规范

- 当前 JSON 存储下，避免多个请求同时读写同一状态造成覆盖。
- 批量写入应尽量在服务端合并后一次性保存。
- Web 抓取失败不能让整个导入流程崩溃，应降级为摘要兜底。
- 来源导入后只更新来源自身摘要，不自动生成 Studio 概要。
- 用户主动生成的概要必须面向所有 ready 来源。
- 聊天不应因来源不足拒答，但必须区分来源依据和通用知识。

## 11. 验证命令

常用检查：

```powershell
python -m compileall backend\app
```

```powershell
cd frontend
npm run lint
npm run build
```

接口健康检查：

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health"
```

批量导入接口是否生效：

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri "http://127.0.0.1:8000/sources/add-web-batch" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"items":[]}'
```

## 12. 当前运行状态

最近一次验证通过：

- `python -m compileall backend\app`
- `npm run lint`
- `npm run build`
- 后端 `/health` 正常
- 批量导入接口返回 `200`
- 前端页面可访问

后端新增接口后已经重启过一次。若后续修改后端但不是 reload 模式，需要再次重启 FastAPI 服务。

## 13. 后续优先级

建议下一步按这个顺序推进：

1. 拆分前端大组件，提高维护性。
2. 完成搜索研究图谱，也就是“网络搜索思维导图”。
3. 将 JSON 存储迁移到 PostgreSQL + pgvector。
4. 引入正式 embedding 检索，替代当前轻量关键词检索。
5. 用 LangGraph 显式实现多智能体编排，并在文档和演示中展示图结构。
6. 接入云南大学计算机网络课程结构、章节目录、课件和平台思维导图。
7. 增强学习画像与学习效果评估。
8. 完善开源协议、测试说明、部署说明和 7 分钟演示视频脚本。

