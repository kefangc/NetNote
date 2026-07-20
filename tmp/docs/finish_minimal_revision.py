from __future__ import annotations

import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


ROOT = Path(r"F:\projects\软件杯")
SOURCE = ROOT / "docs" / "NetNote-中国软件杯-项目文档（4）-必要修订.docx"
OUTPUT = ROOT / "docs" / "NetNote-中国软件杯-项目文档（4）-必要修订-完善版.docx"
TEMP = ROOT / "tmp" / "docs" / "finish_minimal_revision_work.docx"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}
W = f"{{{W_NS}}}"


def text_of(paragraph) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS)).strip()


def set_text(paragraph, value: str) -> None:
    # Only replace text nodes. This retains floating drawings, hyperlinks,
    # bookmarks, and other layout anchors in the original document.
    nodes = paragraph.xpath(".//w:t", namespaces=NS)
    if nodes:
        nodes[0].text = value
        for node in nodes[1:]:
            node.text = ""
        return
    run = etree.SubElement(paragraph, W + "r")
    etree.SubElement(run, W + "t").text = value


def set_style(paragraph, style: str) -> None:
    ppr = paragraph.find(W + "pPr")
    if ppr is None:
        ppr = etree.Element(W + "pPr")
        paragraph.insert(0, ppr)
    pstyle = ppr.find(W + "pStyle")
    if pstyle is None:
        pstyle = etree.SubElement(ppr, W + "pStyle")
    pstyle.set(W + "val", style)


def main() -> None:
    with ZipFile(SOURCE) as source_zip:
        archive = [(item, source_zip.open(item).read()) for item in source_zip.infolist()]
    entries = {item.filename: data for item, data in archive}
    root = etree.fromstring(entries["word/document.xml"])
    paragraphs = root.xpath(".//w:p", namespaces=NS)

    replacements = {
        "网络检索与即时学术拓展场景：": "网络检索与即时学术拓展场景：学生可在来源管理栏输入检索词，获得网页候选并选择导入。系统依次尝试 Jina Reader、Trafilatura 和 HTML 清洗提取正文；正文不足时保留搜索摘要作为降级结果。导入后的网页与本地资料进入同一来源库，可用于来源问答和 Studio 学习资源生成。",
        "3. 云大学堂多模态视听联动场景：": "3. 云大学堂课堂转写联动场景：系统可连接云大学堂并导入可获取的课堂转写内容。课堂片段保存课程、章节、起止时间和视频地址等元数据；当问答引用命中课堂片段时，学生可打开视频或课程页面并从对应时间段播放。该能力依赖课程页面和视频地址的可访问性。",
        "NetNote 的核心技术价值在于其“三智能体博弈协同”": "NetNote 的核心技术价值在于来源管理、轻量检索问答、学习资源生成、学习反馈和课堂转写联动的统一工作台体验。后端按 Retrieval、Tutor、Resource、Profile、Safety 和 WebSearch 等职责拆分模块，当前由 API 路由完成隐式调度；显式智能体图编排属于后续演进方向。",
        "2) 基于 React 19 创新的 Actions API": "2) 前端通过 React 状态和 API 请求维护来源、聊天和 Studio 数据，并为上传、导入和生成任务提供加载状态。当前未将 useActionState、useOptimistic 或固定帧率作为项目实现与性能结论。",
        "基于新时代大学生的学习诉求": "基于新时代大学生的学习诉求，本系统围绕课程资料学习实现 6 项核心功能，并将后续扩展能力与当前 V1 实现区分说明。",
        "该新增物理表专门存储云大学堂课程包": "该表用于描述 V2 中云大学堂课程录播与转写片段的结构化存储规划。当前 V1 将课堂时间、视频地址和课程页面等信息保存在来源及片段的 metadata 中。",
        "6.1 多模态文档解析与 PaddleOCR 识别模块": "6.1 文件解析与 OCR 扩展规划",
        "6.4 防幻觉 Grounding 问答与流式 SSE 问答模块": "6.4 来源问答与 HTTP 流式输出模块",
        "6.5 6D画像自适应更新与遗忘曲线决策引擎": "6.5 学习画像与学习建议模块",
        "6.6 交互式思维导图与网络层级折叠展开模块": "6.6 自研交互式思维导图模块",
        "6.7 一键伴学 PPT 大纲自生成与导出模块": "6.7 演示文稿生成与浏览器端导出模块",
        "1.Next.js 16 App Router & React 19": "1. Next.js、React、TypeScript、Tailwind CSS：前端工作台与样式系统，遵循各自开源许可证。",
        "2.TypeScript & Tailwind CSS": "2. html-to-image、jsPDF、PptxGenJS、KaTeX：浏览器端页面导出、演示文稿导出和数学公式渲染。",
        "3.FastAPI：后端算力高性能网关": "3. FastAPI、Uvicorn、Pydantic：后端 API、服务运行和数据模型校验。",
        "4.pdf-parse & Mammoth-JS": "4. pdfplumber、python-docx、python-pptx、Pillow、Trafilatura：PDF、DOCX、PPTX、图片文件支持和网页正文抽取。",
        "5.LiteLLM / StarFire SDK": "5. LangGraph、PostgreSQL + pgvector、PaddleOCR、LiteLLM：当前作为 V2 可选演进方案，不属于 V1 运行依赖。",
        "根据中国软件杯大赛关于“AI Coding”工具声明": "项目在需求梳理、界面迭代、代码检查和文档校对过程中使用 AI Coding 工具进行辅助。AI 产出由项目成员审阅、修改和测试后再纳入项目。",
    }
    applied = set()
    for paragraph in paragraphs:
        current = text_of(paragraph)
        for prefix, replacement in replacements.items():
            if current.startswith(prefix):
                set_text(paragraph, replacement)
                applied.add(prefix)
                break
        # Legacy empty heading beside a floating figure should not enter the TOC.
        if not current:
            ppr = paragraph.find(W + "pPr")
            pstyle = ppr.find(W + "pStyle") if ppr is not None else None
            if pstyle is not None and pstyle.get(W + "val", "").startswith("Heading"):
                set_style(paragraph, "Normal")

    missing = set(replacements) - applied
    if missing:
        raise RuntimeError("Unmatched targeted paragraphs: " + " | ".join(sorted(missing)))

    # Ask Word to refresh the field-based TOC when the document is opened.
    settings = etree.fromstring(entries["word/settings.xml"])
    update_fields = settings.find(W + "updateFields")
    if update_fields is None:
        update_fields = etree.SubElement(settings, W + "updateFields")
    update_fields.set(W + "val", "true")

    entries["word/document.xml"] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    entries["word/settings.xml"] = etree.tostring(settings, xml_declaration=True, encoding="UTF-8", standalone=True)
    TEMP.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(TEMP, "w", ZIP_DEFLATED) as target_zip:
        for item, data in archive:
            if item.filename == "word/document.xml":
                data = entries["word/document.xml"]
            elif item.filename == "word/settings.xml":
                data = entries["word/settings.xml"]
            target_zip.writestr(item, data)
    shutil.copyfile(TEMP, OUTPUT)
    print(f"Applied {len(applied)} focused fixes")
    print(OUTPUT)


if __name__ == "__main__":
    main()
