# 软件杯 A3 V1 实施计划

目标：实现一个 NotebookLM 式“计算机网络”学习智能体原型，覆盖来源导入、来源检索、基于来源问答、概要、闪卡、测验、思维导图、学习画像与路径推荐。

技术栈：
- Frontend: Next.js App Router + TypeScript + Tailwind CSS + shadcn-like components + React Flow
- Backend: FastAPI + Python service layer
- AI/RAG: OpenAI-compatible adapter预留，V1 内置本地启发式 RAG fallback，保证无 key 也可演示
- Storage: V1 使用本地 JSON/文件存储，保留 PostgreSQL + pgvector 接口边界与文档

V1 交付：
1. 三栏工作台：左侧来源，中间聊天，右侧 Studio 生成物。
2. 来源导入：支持 txt/md/pdf/docx/pptx/png/jpg 上传，解析失败时给出明确状态。
3. 搜索补充：根据提示词生成可加入来源的候选条目。
4. 来源问答：基于来源片段检索，回答带引用；来源不足时提示补充资料。
5. 生成物：概要、闪卡、测验、思维导图、问答卡片、拓展阅读。
6. 学习交互：闪卡翻转与掌握标记，测验逐题反馈与最终报告，思维导图展开与节点提问。
7. 学习画像：基于聊天、测验、闪卡事件维护至少 6 个维度，并生成学习路径。
8. 文档：README、技术架构、环境变量、开源说明、演示脚本。

V2 预留：
- 云南大学计算机网络课程接入
- PostgreSQL + pgvector 持久化
- LangGraph 完整编排图可视化
- LiteLLM/讯飞模型网关
- 多模态图解/动画/短视频讲解
