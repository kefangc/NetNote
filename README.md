# 软件杯 A3：NotebookLM 式计算机网络学习智能体

这是一个面向第十五届中国软件杯 A3 赛题的 V1 原型，目标是复刻 NotebookLM 的核心学习工作流：导入来源、基于来源问答、生成概要、闪卡、测验、思维导图、问答卡片、拓展阅读，并用学习行为维护个性化画像和学习路径。

## 项目结构

```text
frontend/  Next.js App Router 前端工作台
backend/   FastAPI 后端、多智能体服务、本地 RAG 和生成器
docs/      架构、演示、开源说明
plan       当前 V1 实施计划
```

## 快速启动

后端：

```powershell
cd F:\projects\软件杯
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

前端：

```powershell
cd F:\projects\软件杯\frontend
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

## 当前 V1 能力

- 默认课程工作区：计算机网络。
- 来源导入：支持 txt、md、pdf、docx、pptx、png、jpg 等入口。
- 网络补充：根据提示词生成候选资料，加入后进入统一来源库。
- 来源问答：基于本地检索返回答案，带来源引用；来源不足时提示补充。
- Studio 生成：概要、闪卡、测验、思维导图、问答卡片、拓展阅读。
- 学习反馈：测验报告、闪卡总结、画像更新、下一步学习建议。
- 无 API key 可演示：内置本地启发式 RAG fallback。

## 后续接入点

- 将 `backend/app/agents.py` 中的启发式生成替换为 OpenAI-compatible / 讯飞星火 / LiteLLM 模型调用。
- 将 `backend/app/store.py` 的 JSON 存储替换为 PostgreSQL + pgvector。
- 将 `backend/app/parsers.py` 的图片占位解析替换为 PaddleOCR。
- V2 接入云南大学计算机网络课程资料、章节结构和平台思维导图。

