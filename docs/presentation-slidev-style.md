# Slidev 风格演示文稿生成方案

## 目标

本方案为 NetNote 新增“演示文稿”资源类型。它参考 Slidev 的思路：先生成结构化幻灯片数据，再用 Web 技术渲染 16:9 幻灯片，最后将每页截图导出为 PDF 或图片版 PPTX。

第一版不追求 PPT 中的文字可编辑，而是优先保证视觉效果、中文排版稳定性和演示一致性。

## 整体流程

```text
用户点击 Studio / 演示文稿
→ POST /artifacts/generate kind=presentation
→ ResourceAgent 生成 SlideSpec JSON
→ 前端 PresentationView 渲染幻灯片
→ html-to-image 逐页截图
→ jsPDF 生成 PDF
→ PptxGenJS 生成图片版 PPTX
```

## 数据结构

```ts
type PresentationData = {
  title: string;
  subtitle?: string;
  theme: "netnote-blue";
  slides: PresentationSlide[];
};

type PresentationSlide = {
  id: string;
  layout: "cover" | "section" | "bullets" | "two-column" | "timeline" | "quote" | "quiz" | "summary";
  title: string;
  subtitle?: string;
  bullets?: string[];
  leftTitle?: string;
  leftItems?: string[];
  rightTitle?: string;
  rightItems?: string[];
  steps?: string[];
  quote?: string;
  question?: string;
  options?: string[];
  answer?: string;
  notes?: string;
  citations?: string[];
};
```

## 后端生成策略

`ResourceAgent` 对 `presentation` 的处理分两层：

1. 优先调用大模型生成符合 SlideSpec 的 JSON。
2. 如果 AI 未配置、返回异常或 JSON 不完整，则根据来源片段、关键词和课程默认知识生成兜底演示文稿。

兜底版本至少包含：

- 封面页
- 学习目标页
- 核心概念页
- 知识点对比页
- 推荐学习步骤页
- 课堂检查题页
- 总结页

这样可以保证比赛演示时即使模型不可用，也不会出现空白结果。

## 前端渲染策略

前端新增 `PresentationView`，显示当前页预览，并在页面外渲染一个固定尺寸的隐藏导出舞台：

```tsx
<div className="presentation-export-stage" aria-hidden="true">
  {slides.map((slide, index) => (
    <div className="presentation-export-slide" ref={(node) => { exportRefs.current[index] = node; }}>
      <SlideCanvas slide={slide} index={index} total={slides.length} exportMode />
    </div>
  ))}
</div>
```

可见预览负责交互体验，隐藏导出舞台负责稳定截图。导出舞台固定为 `1280x720`，确保 PDF 和 PPTX 每页比例一致。

## PDF 导出

```ts
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

async function exportPdf(nodes: HTMLElement[], filename: string) {
  const images = [];
  for (const node of nodes) {
    images.push(await toPng(node, {
      width: 1280,
      height: 720,
      pixelRatio: 2,
      backgroundColor: "#f8f9ff",
    }));
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720], compress: true });
  images.forEach((image, index) => {
    if (index > 0) pdf.addPage([1280, 720], "landscape");
    pdf.addImage(image, "PNG", 0, 0, 1280, 720);
  });
  pdf.save(filename);
}
```

## PPTX 导出

```ts
import PptxGenJS from "pptxgenjs";

async function exportPptx(images: string[], filename: string) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "NetNote";

  images.forEach((image) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F8F9FF" };
    slide.addImage({ data: image, x: 0, y: 0, w: 13.333, h: 7.5 });
  });

  await pptx.writeFile({ fileName: filename });
}
```

这里的 PPTX 每页都是高清图片，适合演示、汇报和提交材料，不适合后续在 PowerPoint 中逐字编辑。

## 与 Slidev 的关系

本项目没有直接引入 Slidev，而是参考它的核心产品思路：

- 用 Web 技术描述幻灯片。
- 在浏览器中实时预览。
- 通过截图导出 PDF 或 PPTX。
- 允许未来继续扩展代码高亮、Mermaid、动画和主题系统。

这样可以和现有 Next.js 前端、Studio 资源体系无缝集成，避免引入完整 Slidev 工程带来的路由、构建和主题管理复杂度。

## 后续扩展

- 增加更多布局：图表页、代码页、流程图页、实验案例页。
- 接入 Mermaid，把协议流程渲染成图。
- 接入动画卡片，把 TCP 三次握手、滑动窗口等内容变成可播放讲解页。
- 增加主题选择：课堂讲义、答辩展示、考试复习。
- 增加服务端导出能力，用 Playwright 在后端统一截图，提升多端一致性。
