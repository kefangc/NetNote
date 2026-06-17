# API 摘要

后端地址默认：

```text
http://127.0.0.1:8000
```

核心接口：

- `GET /workspace`：获取课程工作区、来源、消息、生成物、画像。
- `POST /sources/upload`：上传文件来源。
- `POST /sources/search-web`：根据提示词生成网络补充候选。
- `POST /sources/add-web`：将候选网页加入来源。
- `POST /chat`：基于来源问答，文本流式返回。
- `POST /artifacts/generate`：生成 summary、flashcards、quiz、mindmap、qa、reading。
- `POST /quiz/{artifact_id}/submit`：提交测验答案并生成报告。
- `POST /flashcards/{artifact_id}/review`：记录闪卡掌握状态。
- `GET /profile`：获取学习画像。

