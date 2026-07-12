# 知识库答辩说明方案

## 1. 一句话亮点

本项目的知识库不是把课程资料直接塞进 prompt，而是构建一个外部可检索的课程记忆系统；Agent 只在需要时检索少量高相关片段进入上下文，从而实现低上下文占用、可引用、可追溯、低幻觉的个性化学习问答和资源生成。

## 2. 为什么这样设计

高校课程资料通常包括课件、教材、网页、课堂录播、课堂语音转写、题库和实践材料。如果把这些资料直接放进大模型上下文，会出现三个问题：

- 上下文窗口被快速占满，长课堂转写尤其明显。
- 模型难以准确指出答案来自哪一页、哪一节课、哪一个时间点。
- 多轮对话后历史消息和资料互相挤占，回答质量下降。

因此，本项目采用 RAG 思路：资料进入知识库，问题进入检索流程，最终只有少量高相关证据进入 prompt。

## 3. 与赛题要求的对应关系

| 赛题要求 | 本项目知识库设计 |
| --- | --- |
| 个性化学习资源生成 | 资源生成基于检索到的课程证据、学习画像和当前学习目标，而不是泛泛生成。 |
| 多模态学习资源 | 云大学堂课堂转写作为带时间轴的视频知识库，回答可跳转到课堂片段。 |
| 多智能体协同 | Source Agent 负责入库，Retrieval Agent 负责检索，Tutor Agent 负责答疑，Resource Agent 负责生成资源，Profile Agent 维护画像。 |
| 个性化学习路径 | LearningProfile 与 study_events 记录薄弱点、学习偏好、测验结果和复习行为。 |
| 防幻觉与内容安全 | 回答优先基于 citation；来源不足时标注通用解释；来源 metadata 支持追溯。 |
| 响应效率 | 长资料不整体进入 prompt，只取 Top K 证据，并对长 chunk 做上下文压缩。 |

## 4. 当前已实现能力

当前项目已经具备基础知识库闭环：

- 支持文件、网页、种子知识库、云大学堂课堂转写等来源类型。
- `Source` 保存来源标题、类型、状态、摘要、URL、解析质量和 metadata。
- `SourceChunk` 保存来源切片、位置、关键词和 metadata。
- `Citation` 保存回答引用，并支持课堂时间戳 metadata。
- 网络搜索来源支持搜索候选、批量导入和正文抽取。
- 云大学堂课堂转写可导入为 lecture 来源。
- 课堂来源按时间轴切片，回答中可返回具体时间戳。
- 点击课堂 citation 可以在本页弹窗播放录播片段。
- 对话历史使用摘要压缩，减少长期上下文占用。
- 课堂转写注入 prompt 时已经进行更短截断。

需要如实说明：当前检索仍是轻量关键词/规则检索，正式向量检索、数据库迁移、rerank 和检索评测属于下一步优化。

## 5. 下一步优化目标

下一阶段知识库将升级为：

```text
PostgreSQL + pgvector
+ PostgreSQL full-text search
+ metadata filtering
+ optional rerank
+ context compression
```

核心思想：

- `PostgreSQL` 保存课程、来源、切片、对话、生成物、画像和学习事件。
- `pgvector` 负责语义相似度检索。
- `full-text search` 负责关键词精确匹配。
- `metadata filtering` 负责限定课程、来源类型、质量状态、周次、节次、时间范围。
- `rerank` 负责从候选片段中选出最相关的 4-6 条。
- `context compression` 负责只把与问题相关的句子放进 prompt。

## 6. 课程转写的创新点

普通 RAG 通常只返回文档标题和页码。本项目针对课堂录播增加了时间轴 metadata：

```text
week
section
start_time
end_time
start_seconds
end_seconds
video_url
source_url
```

这让课堂转写不只是文本资料，而是可以被定位、引用和回放的视频知识库。

答辩时可以这样说明：

> 当学生问“老师有没有讲过某个知识点”时，系统会先从课堂转写知识库中检索相关片段。如果命中课堂来源，回答不仅给出文字解释，还会返回周次、节次和具体时间点。学生点击引用后，可以在当前页面直接播放对应课堂片段，播放结束后自动关闭。这使系统从普通文本问答升级为可回溯的课堂学习助手。

## 7. 网络搜索来源的作用

网络来源用于补充课程内容，但不应和课堂来源混在一起解释。

本项目建议将来源分层：

- 课堂来源：优先用于回答“老师讲过什么”“课堂中怎么解释”。
- 课件/文件来源：优先用于课程标准内容、考试范围和章节结构。
- 网络来源：用于补充解释、拓展阅读、实践案例和多角度理解。

网络来源需要保存：

```text
title
url
domain
source_provider
extraction_method
extraction_status
summary
chunks
metadata
```

答辩时应强调：网络资料不是直接相信，而是通过抓取质量、来源域名、摘要和引用进行管理。

## 8. 开源项目参考

本项目知识库设计参考了多个成熟项目和框架：

- LangChain：参考其 Documents、Text Splitters、Embeddings、Vector Stores、Retrievers 的知识库构建流程。链接：[LangChain Knowledge Base](https://docs.langchain.com/oss/python/langchain/knowledge-base)
- LlamaIndex：参考其 retriever 取回上下文、response synthesizer 基于上下文生成回答的流程。链接：[LlamaIndex Retriever](https://developers.llamaindex.ai/python/framework/module_guides/querying/retriever/)
- Dify：参考其向量检索、全文检索、混合检索、Top K、Score Threshold、Rerank 和引用展示能力。链接：[Dify Retrieval Settings](https://docs.dify.ai/en/cloud/use-dify/knowledge/create-knowledge/setting-indexing-methods)
- RAGFlow：参考其文档理解、chunk 模板、人工干预 chunk、关键词、问题和 tag 的设计。链接：[RAGFlow Docs](https://ragflow.io/docs/)
- Haystack：参考其 Document Store、Retriever、Pipeline 解耦思想。链接：[Haystack Document Store](https://docs.haystack.deepset.ai/docs/document-store)
- Letta / MemGPT：参考其将常驻上下文和外部长期记忆分离的思想。链接：[Letta Memory Blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks)

## 9. 推荐答辩表述

可以在 PPT 或系统开发说明书中使用以下表述：

> 本项目采用分层知识库架构：核心学习画像和当前任务状态作为短上下文注入，大规模课程资料、课堂转写、网络来源和历史学习事件存入外部知识库。Agent 在推理时通过 query rewrite、混合检索、metadata filtering、rerank 和上下文压缩按需取回少量高相关证据，从而在不占用大量上下文窗口的情况下，实现可引用、可追溯、低幻觉的个性化学习问答和资源生成。

针对课堂录播可以补充：

> 对于云大学堂课堂录播，本项目将语音转写处理为带时间轴的知识切片。每个片段保存周次、节次、起止时间和视频地址。当学生的问题命中课堂讲解内容时，系统返回可点击时间戳，学生可以直接回放老师讲到该知识点的片段。

针对网络搜索可以补充：

> 网络搜索来源作为课程资料的补充层，系统会保存来源 URL、域名、抓取方式、解析质量和摘要。回答时区分课程内证据和网络补充证据，避免把低质量网络内容当作课堂事实。

## 10. 演示建议

7 分钟演示视频中建议安排一个知识库能力片段：

1. 选择“云大学堂”来源并导入一节计算机网络课堂转写。
2. 提问：“这节课老师讲到计算机网络课程定位了吗？”
3. 展示回答中的课堂 citation。
4. 点击时间戳，弹出本页视频播放器并跳转到对应课堂片段。
5. 再提问一个拓展问题，例如 “TCP 拥塞控制有哪些常见算法？”
6. 展示系统同时引用网络来源和课程来源。
7. 说明系统没有把整节课转写放进 prompt，而是只检索少量证据片段。

## 11. 已实现与规划边界

答辩时建议这样区分：

已实现：

- 来源导入与切片。
- 来源摘要和关键词。
- 聊天 citation。
- 云大学堂课堂转写导入。
- 课堂时间戳 citation。
- 点击时间戳本页播放课堂片段。
- 对话摘要和基础上下文裁剪。

下一步优化：

- PostgreSQL + pgvector 数据库迁移。
- 正式 embedding 检索。
- PostgreSQL 全文检索。
- 混合检索和 metadata filtering。
- rerank 模型。
- 检索评测集和 citation 点击反馈。
- 更完整的学习效果评估和路径动态调整。

这样表达既能体现创新性，也不会夸大当前实现。

