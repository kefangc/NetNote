# NetNote 图标资源说明

## 推荐使用

这次资源参考了 `source/` 里的两个 Gemini SVG 重新整理：

- `gemini-icon-source.svg`：纯图标参考稿，适合做前端图标、favicon、PWA 图标。
- `gemini-wordmark-source.svg`：图标 + NetNote 字标 + 中文标语的组合参考稿，适合放在文档、封面、PPT 或项目介绍里。

最终建议以 `frontend-icons/netnote-icon.svg` 作为前端主图标。它是纯 SVG 矢量文件，体积小，结构干净，适合直接放进前端项目。

## 文件夹说明

- `document-icons/`：文档用图标，主要是 PNG 和 SVG，适合放进 Word、PPT、项目文档、答辩材料。
- `frontend-icons/`：前端用图标，包含 SVG、favicon、Apple Touch Icon、PWA 图标尺寸。
- `source/`：原始参考 SVG，不建议直接用于生产，只作为设计来源保留。

## 文档用文件

- `document-icons/netnote-icon-1024.png`：高清图标，适合封面、PPT 大图。
- `document-icons/netnote-icon-512.png`：通用文档图标。
- `document-icons/netnote-icon-256.png`：较小尺寸图标。
- `document-icons/netnote-wordmark.png`：组合标识，包含图标、NetNote 字标和中文标语。
- `document-icons/netnote-icon.svg`：文档中如果支持 SVG，可以优先使用这个。
- `document-icons/netnote-wordmark.svg`：组合标识 SVG 版本。

## 前端用文件

- `frontend-icons/netnote-icon.svg`：前端主图标，推荐优先使用。
- `frontend-icons/netnote-wordmark.svg`：前端组合标识。
- `frontend-icons/favicon.ico`：浏览器标签页图标。
- `frontend-icons/netnote-icon-32.png`：小尺寸图标。
- `frontend-icons/netnote-icon-48.png`：浏览器或系统图标备用尺寸。
- `frontend-icons/apple-touch-icon-180.png`：iOS 主屏图标。
- `frontend-icons/pwa-icon-192.png`：PWA 标准图标。
- `frontend-icons/pwa-icon-512.png`：PWA 高清图标。

## 前端引用示例

本次已经把主要前端资源同步到 `frontend/public/brand/`，可以这样使用：

```html
<img src="/brand/netnote-icon.svg" alt="NetNote" />
```

组合标识可以这样使用：

```html
<img src="/brand/netnote-wordmark.svg" alt="NetNote 让学习更有结构" />
```

注意：`netnote-wordmark.svg` 里的文字仍然使用字体渲染。如果需要在所有设备上完全一致，后续可以用 Figma、Illustrator 或 Inkscape 把文字转成路径。
