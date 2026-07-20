$ErrorActionPreference = 'Stop'

$source = 'F:\projects\软件杯\docs\NetNote-中国软件杯-项目文档（4）.docx'
$output = 'F:\projects\软件杯\docs\NetNote-中国软件杯-项目文档（4）-必要修订.docx'

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

function Set-ParagraphByPrefix {
    param([string]$Prefix, [string]$Replacement)
    for ($i = 1; $i -le $script:doc.Paragraphs.Count; $i++) {
        $paragraph = $script:doc.Paragraphs.Item($i)
        $text = $paragraph.Range.Text.Trim([char]13, [char]7)
        if ($text.StartsWith($Prefix)) {
            $style = $paragraph.Range.Style
            $paragraph.Range.Text = "$Replacement`r"
            $paragraph.Range.Style = $style
            return
        }
    }
    throw "Paragraph not found: $Prefix"
}

function Set-CellText {
    param($Table, [int]$Row, [int]$Column, [string]$Text)
    $range = $Table.Cell($Row, $Column).Range
    $range.End = $range.End - 1
    $range.Text = $Text
}

try {
    Copy-Item -LiteralPath $source -Destination $output -Force
    $doc = $word.Documents.Open($output, $false, $false)

    # Correct only statements that conflict with the actual V1 source code.
    Set-ParagraphByPrefix 'NetNote 系统建立在高度成熟' 'NetNote 系统采用 Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、FastAPI 和 Pydantic。前端提供来源、聊天和 Studio 三栏工作台；后端提供来源导入、检索问答、学习资源生成和学习反馈接口。'
    Set-ParagraphByPrefix '1) 通过 Next.js 16 强大的服务端渲染' '1) 前端以 Client Component 和 React 状态维护工作区交互，支持来源列表、聊天流式展示、Markdown 渲染、思维导图和学习资源详情。'
    Set-ParagraphByPrefix '2) 基于 React 19 创新的 Actions API' '2) 前端通过 API 请求刷新工作区数据，并为上传、网页导入和资源生成提供加载状态，保证长任务过程可感知。'
    Set-ParagraphByPrefix '后端基于 Python 3.12 与高性能 FastAPI 路由网关' '后端采用 FastAPI 和 OpenAI-compatible 模型适配接口。当前 V1 使用本地 JSON 保存工作区状态，并基于来源切片、关键词、全文和元数据匹配实现轻量检索；PostgreSQL、pgvector、OCR 和显式智能体编排属于后续演进方向。'
    Set-ParagraphByPrefix '项目拥有极为丰富的初始测试语料' '项目面向计算机网络课程，支持导入本地课程资料、网络来源和可获取的云大学堂课堂转写。V1 的来源切片数量随正文长度变化，不以固定的向量维度或切片数量作为运行指标。'
    Set-ParagraphByPrefix '全国高校在校生群体庞大' '全国高校学生在课程复习、资料整理、概念问答和课堂内容回看中存在一站式学习工具需求。NetNote 通过来源引用、Studio 学习资源和学习反馈降低在多个工具间切换的成本；实际学习效果需要在后续教学场景中持续评估。'
    Set-ParagraphByPrefix '系统在运行过程中需维护一套科学合理的数据状态结构' '系统维护课程工作区、来源与来源片段、消息、生成物、学习画像和学习事件等状态。V1 将这些数据保存到本地 JSON 文件，上传文件保存到 uploads 目录；向量数据库和多用户持久化属于后续规划。'
    Set-ParagraphByPrefix '为了支撑系统的工程规范与赛题的硬性指标' 'V1 使用 Pydantic 数据模型约束来源、片段、消息、生成物和学习画像。表 3-1 反映当前来源对象字段；表 3-2 为后续可扩展画像字段示意，不作为 V1 已实现功能声明。'
    Set-ParagraphByPrefix '表 3-2 赛题硬性指标' '表 3-2 后续可扩展学习画像字段示意（V2 规划）'
    Set-ParagraphByPrefix '需求一：对话式学习画像自主构建' '需求一：学习画像随学更新。系统根据聊天兴趣、测验正确率和闪卡“会/不会/跳过”记录更新知识基础描述、学习目标、薄弱点、资源偏好、正确率、学习节奏、易错模式、兴趣和下一步建议。'
    Set-ParagraphByPrefix '需求二：多智能体协同的多模态资源生成' '需求二：按职责拆分的学习资源生成。后端按检索、辅导、资源生成、画像、安全和网页搜索等职责组织模块，支持概要、思维导图、测验、闪卡、问答卡片、拓展阅读和演示文稿。'
    Set-ParagraphByPrefix '需求四：网络搜索获取来源' '需求四：网络搜索获取来源。学生可主动搜索网页候选并选择导入；系统对网页正文执行多级抽取与摘要降级，并将结果保存到统一来源库。'
    Set-ParagraphByPrefix '需求五：云大学堂录播课程精准跳转播放' '需求五：云大学堂课堂转写与片段播放。系统可导入可获取的课堂转写，并保留课程、章节、时间和视频地址等元数据；课堂引用可打开视频或课程页面并跳转到对应片段。'
    Set-ParagraphByPrefix '需求六：伴学 Studio 套件自适应生成与一键 PPT' '需求六：伴学 Studio 资源生成与演示文稿导出。Studio 支持概要、抽认卡、测验、思维导图、问答卡片、拓展阅读和演示文稿；演示文稿由前端渲染，可导出 PDF 和图片版 PPTX。'
    Set-ParagraphByPrefix '性能与时延特性：' '交互与展示：聊天和生成任务提供加载状态与渐进输出，Markdown、表格和代码块保持可读。本文不使用未经独立压测验证的固定时延、并发量或帧率数据。'
    Set-ParagraphByPrefix '可靠性与本地保底机制：' '可靠性与降级：网页正文提取失败时，系统可保留搜索摘要并标记抓取质量；模型未配置或调用失败时，可使用本地规则和来源片段生成基础演示结果，避免外部服务异常导致流程中断。'
    Set-ParagraphByPrefix '系统基于双轨分布式微服务架构' '当前 V1 采用 Next.js 前端工作台与 FastAPI 后端服务的前后端分离架构。后端负责文件解析、网页抽取、来源切片、检索、问答、资源生成和学习反馈；工作区状态保存为本地 JSON。图 4-1 为后续可演进架构示意。'
    Set-ParagraphByPrefix '图 4-1 NetNote 系统多层技术架构图' '图 4-1 NetNote 后续演进架构示意'
    Set-ParagraphByPrefix '· 1.多源文档结构化导入清洗' '· 1. 多源文档导入：用户上传文件、选择网络候选或导入课堂转写；后端解析可读文本并切分为来源片段，随后更新本地工作区状态。'
    Set-ParagraphByPrefix '· 2. 严格 Grounding RAG 防幻觉会话流' '· 2. 来源问答：系统按关键词、全文、来源质量和元数据匹配相关片段；Tutor 模块将证据片段与问题组成上下文，返回回答和引用信息。未命中直接来源时，回答会标明通用解释。'
    Set-ParagraphByPrefix '· 3. 伴学 Studio 多智能体工作流' '· 3. Studio 与反馈：Resource 模块基于来源生成学习资源；测验和闪卡结果由 Profile 模块汇总，更新薄弱点和下一步建议；Safety 模块提供基础内容拦截。图 4-3 为职责划分与后续编排示意。'
    Set-ParagraphByPrefix 'NetNote 重构了强大的异常拦截链' '系统为网页抽取、模型调用和来源不足提供降级处理。网页正文提取失败时保留搜索摘要；没有检索到直接来源时，问答可继续给出通用解释并标明来源不足；模型服务不可用时使用本地启发式结果完成基本演示。'
    Set-ParagraphByPrefix '为确保系统能稳定承载大数据量的存储' '当前 V1 使用本地 JSON 文件保存工作区状态。以下数据库表和向量字段用于描述 PostgreSQL + pgvector 的 V2 演进方案，不属于 V1 已部署的物理表。'
    Set-ParagraphByPrefix '5.1 向量切片存储模型结构表' '5.1 V2 向量切片存储模型结构表（规划）'
    Set-ParagraphByPrefix '5.2 云大学堂课程录播视频映射存储结构表' '5.2 V2 云大学堂课程录播视频映射结构表（规划）'
    Set-ParagraphByPrefix '5.3Studio 伴学物料生成模型结构表' '5.3 V2 Studio 伴学物料生成模型结构表（规划）'
    Set-ParagraphByPrefix '5.4严格限制溯源会话消息模型结构表' '5.4 V2 溯源会话消息模型结构表（规划）'
    Set-ParagraphByPrefix '6.1 多模态文档解析与 PaddleOCR 识别模块' '6.1 V1 文件解析与 OCR 扩展规划'
    Set-ParagraphByPrefix '在 NetNote 的全新数据导入流程中' 'V1 的多源文档解析由 backend/app/parsers.py 调度：PDF 使用 pdfplumber，DOCX 使用 python-docx，PPTX 使用 python-pptx，TXT 和 Markdown 直接读取。图片来源当前只登记 OCR 管线入口，PaddleOCR 属于后续扩展规划。图 6-1 为后续处理流程示意。'
    Set-ParagraphByPrefix '1.后端爬取与 Jsoup 清洗' '1. 后端网页正文抽取：导入网页时优先尝试 Jina Reader，再使用 Trafilatura，最后使用 HTML 清洗或搜索摘要作为降级结果。'
    Set-ParagraphByPrefix '2. 原生数字文本流无损提取' '2. 文件与网页文本处理：系统针对不同来源提取可读文本，网页正文长度不足时保留摘要并标记抓取质量；不宣称 OCR、正文抽取或检索结果绝对准确。'
    Set-ParagraphByPrefix '3. 自动切片（20 Chunks）' '3. 来源切片与状态更新：文本按约 720 字符切片，并保留约 120 字符重叠；切片数量随正文长度变化。前端通过 React 状态和 API 请求刷新来源列表。'
    Set-ParagraphByPrefix '云大学堂的深度整合打破了传统' '云大学堂导入将课堂转写内容与课程元数据纳入统一来源库，便于将问答引用与课程片段关联。'
    Set-ParagraphByPrefix '系统支持一键导入云大学堂平台课程包' '系统可通过认证信息或 Cookie 建立云大学堂会话，查询课程并导入可获取的课堂转写。转写片段保存 start_time、end_time、start_seconds、end_seconds、video_url 和 source_url 等元数据。'
    Set-ParagraphByPrefix '学生在提问时，如果大模型基于 pgvector' '当问答引用命中课堂转写片段时，聊天区将展示可打开的课堂引用卡片。'
    Set-ParagraphByPrefix '学生点击该按钮，前端 Next.js 表现层' '引用卡片使用浏览器原生 video 元素或课程 iframe 打开内容，并根据 start_seconds 跳转到对应时间段播放；该能力依赖课程页面和视频地址的可访问性。'
    Set-ParagraphByPrefix '6.4 防幻觉 Grounding 问答与流式 SSE 问答模块' '6.4 来源问答与 HTTP 流式输出模块'
    Set-ParagraphByPrefix '中部主聊天窗口利用大模型的流式 Server-Sent Events' '用户提问后，Retrieval 模块从 ready 状态来源中检索关键词、全文和元数据匹配的片段，并对来源质量进行加权。Tutor 模块将相关片段与问题组成模型上下文，返回回答和来源引用。后端使用 HTTP 流式响应逐段返回文本；未命中直接来源时，会明确说明回答属于通用解释。'
    Set-ParagraphByPrefix '6.5 6D画像自适应更新与遗忘曲线决策引擎' '6.5 学习画像与学习建议模块'
    Set-ParagraphByPrefix '自适应引擎是系统的智脑' '学习画像包括知识基础描述、学习目标、薄弱点、资源偏好、正确率、学习节奏、易错模式、兴趣和下一步建议。聊天、测验和闪卡反馈可更新其中的相关字段。'
    Set-ParagraphByPrefix '闪卡评估交互链' '闪卡复习记录“会 / 不会 / 跳过”。“不会”会将对应主题加入或前置到薄弱点；测验提交后会更新正确率并记录错题主题。'
    Set-ParagraphByPrefix '-数据收集逻辑' '学习建议以“复习薄弱点 - 完成闪卡 - 进行测验 - 展开导图追问”等顺序组织。'
    Set-ParagraphByPrefix '(2) 点击“跳过”' 'V1 不包含固定分值加减、遗忘曲线调度或疲劳预测模型。'
    Set-ParagraphByPrefix '(3) 点击“会”' '上述学习反馈用于生成下一步建议，后续可再引入更精细的间隔重复策略。'
    Set-ParagraphByPrefix '6.6 交互式思维导图与网络层级折叠展开模块' '6.6 交互式思维导图模块'
    Set-ParagraphByPrefix '思维导图采用 React 拖拽画布组件 react-flow' '思维导图由资源生成模块输出树状 JSON，前端以自研 SVG 连线和 HTML 节点布局呈现。用户可展开或收起分支、缩放画布、下载 Markdown，并点击节点向聊天区发起基于来源的追问。'
    Set-ParagraphByPrefix '6.7 一键伴学 PPT 大纲自生成与导出模块' '6.7 演示文稿生成与浏览器端导出模块'
    Set-ParagraphByPrefix '为了解决学生在准备小组作业答辩' 'Studio 可根据当前来源生成结构化演示文稿，并在前端以分页预览呈现。演示文稿支持封面、要点、时间线、双栏比较、问答和总结等布局。'
    Set-ParagraphByPrefix '1. 语义汇报大纲蒸馏' '1. 内容生成：Resource 模块优先基于已导入来源与学习主题生成幻灯片 JSON；模型不可用时可使用来源关键词和预设结构生成基础讲义。'
    Set-ParagraphByPrefix '2. 幻灯片版式自适应规划' '2. 前端预览：Next.js 前端提供单页查看、缩略图导航和播放式展开，不将演示文稿数据写入 PostgreSQL。'
    Set-ParagraphByPrefix '3. 前端组件化渐进渲染' '3. 文档导出：前端支持 PDF 导出，并保留来源和学习主题相关内容用于讲义展示。'
    Set-ParagraphByPrefix '4. 物理 PPTX 一键流式合成与下载' '4. PPTX 导出：浏览器端使用 PptxGenJS 将渲染页面作为图片写入 PPTX。导出文件适合展示和提交，不承诺文字可编辑，也不依赖后端 python-pptx 服务。'
    Set-ParagraphByPrefix '• 软件环境：Ubuntu 22.04' '• 验证环境：Windows 本地开发环境；前端使用 Node.js、Next.js 和 npm，后端使用 Python、FastAPI 与 requirements.txt 中的依赖。'
    Set-ParagraphByPrefix '• 硬件环境：16 vCPU' '• 验证方法：执行 python -m compileall backend\\app、npm run lint、npm run build，并进行核心接口与页面流程人工联调。'
    Set-ParagraphByPrefix '• 物理测试机：一加手机' '• 本项目未进行 GPU 压测、Android 原生打包测试或大规模并发压测，因此不声明固定性能指标。'
    Set-ParagraphByPrefix '测试开发组针对 NetNote 系统核心端到端功能' '测试以当前 V1 已实现功能为范围，重点验证来源导入、网页导入、来源问答、Studio 生成、学习反馈、课堂转写和演示文稿导出等流程。'
    Set-ParagraphByPrefix '内容安全：双向内容安全机制测试' '内容安全与可靠性：Safety 模块对少量明显不安全的关键词进行基础拦截；模型提示词要求基于来源回答并区分来源依据和通用解释。网页抓取和模型调用均有降级路径，但该原型不宣称达到生产级内容审核或高可用指标。'
    Set-ParagraphByPrefix '时延性能：首包响应时延评测' '性能说明：模型响应时延受模型服务、网络、来源长度和本机环境影响。当前验证重点为功能正确性、加载状态和降级流程，不给出未经独立压测的固定延迟、并发量或帧率结论。'
    Set-ParagraphByPrefix '7.4 真实高校学生伴学实操消融对比评估报告' '7.4 演示场景验证'
    Set-ParagraphByPrefix '为了提供充分的数据和案例支撑' '演示场景验证：使用计算机网络课程种子知识、本地课程文件、网页来源和可获取的课堂转写进行端到端演示，验证从来源导入、来源问答、Studio 生成到学习反馈的闭环。'
    Set-ParagraphByPrefix '消融实验的核心置信结论表明' '教育效果评估属于后续工作。本 V1 尚未开展具有统计学结论的学生对照实验，因此不在本文中使用学习成绩提升或时间节省等量化结论。'
    Set-ParagraphByPrefix '在 NetNote 的开发和系统集成过程中' '项目使用的开源依赖和用途如下。第三方服务与后续规划技术会单独标注，避免与当前运行依赖混淆。'
    Set-ParagraphByPrefix '1.Next.js 16 App Router & React 19' '1. Next.js、React、TypeScript、Tailwind CSS：前端工作台与样式系统，遵循各自开源许可证。'
    Set-ParagraphByPrefix '2.TypeScript & Tailwind CSS' '2. html-to-image、jsPDF、PptxGenJS、KaTeX：浏览器端页面导出、演示文稿导出和数学公式渲染。'
    Set-ParagraphByPrefix '3.FastAPI：后端算力高性能网关' '3. FastAPI、Uvicorn、Pydantic：后端 API、服务运行和数据模型校验。'
    Set-ParagraphByPrefix '4.pdf-parse & Mammoth-JS' '4. pdfplumber、python-docx、python-pptx、Pillow、Trafilatura：PDF、DOCX、PPTX、图片文件支持和网页正文抽取。'
    Set-ParagraphByPrefix '5.LiteLLM / StarFire SDK' '5. LangGraph、PostgreSQL + pgvector、PaddleOCR、LiteLLM：当前作为 V2 可选演进方案，不属于 V1 运行依赖。'
    Set-ParagraphByPrefix '根据中国软件杯大赛关于“AI Coding”工具声明' '项目在需求梳理、界面迭代、代码检查和文档校对过程中使用了 AI Coding 工具进行辅助。AI 产出由项目成员审阅、修改和测试后再纳入项目。'
    Set-ParagraphByPrefix '1. 性能调试与算法重构提效' '1. 协作边界：AI 用于生成候选实现、解释报错、辅助重构和文档校对；架构取舍、功能验收、测试执行和最终提交由项目成员负责。'
    Set-ParagraphByPrefix '在 Next.js 16 App Router 服务端 Actions' '本文不以 AI 工具替代人工测试，也不宣称未经保存的性能优化、测试覆盖率或第三方实验结果。'
    Set-ParagraphByPrefix '2. 单元测试与状态一致性保障' '2. 工程质量：项目成员对关键交互、接口返回和演示流程进行人工复核，并通过后端编译检查、前端 lint 与 build 验证基础工程质量。'
    Set-ParagraphByPrefix '团队使用基于智谱 GLM' '后续将逐步补充自动化测试、性能基线和多用户持久化能力。'
    Set-ParagraphByPrefix '综上所述，NetNote 作为一款真正自主研发' '综上，NetNote V1 已完成面向计算机网络学习的来源导入、轻量 RAG 问答、学习资源生成、学习反馈、网页资料补充和课堂转写联动等能力。当前源码、运行说明与本文档保持一致；向量检索、OCR、显式智能体编排和大规模效果评估作为后续迭代方向。'

    # Keep the existing visual design, but remove two direct table contradictions.
    Set-CellText $doc.Tables.Item(2) 6 5 '文件解析或网页正文抽取后的可读文本；图片 OCR 为后续规划。'

    $tests = $doc.Tables.Item(8)
    $testRows = @(
        @('TC-IMP-01','文件来源导入','上传 PDF/DOCX/PPTX/TXT/MD','来源入库并可查看片段','可完成导入与查看','通过'),
        @('TC-WEB-02','网页候选导入','搜索并导入网页候选','获取正文或摘要降级结果','显示来源质量状态','通过'),
        @('TC-RAG-03','来源问答','基于已导入来源提问','返回回答与来源引用信息','聊天区显示引用条目','通过'),
        @('TC-STU-04','Studio 与反馈','生成资源并提交测验/闪卡结果','资源可查看，画像建议更新','可完成交互流程','通过'),
        @('TC-PPT-05','演示文稿导出','生成并导出 PDF/PPTX','浏览器下载导出文件','PPTX 为图片版','通过')
    )
    for ($r = 0; $r -lt $testRows.Count; $r++) {
        for ($c = 0; $c -lt $testRows[$r].Count; $c++) {
            Set-CellText $tests ($r + 2) ($c + 1) $testRows[$r][$c]
        }
    }

    foreach ($toc in $doc.TablesOfContents) { $toc.Update() | Out-Null }
    $doc.Fields.Update() | Out-Null
    $doc.Save()
    $doc.Close($false)
    Get-Item -LiteralPath $output | Format-List FullName, Length, LastWriteTime
}
finally {
    $word.Quit()
}
