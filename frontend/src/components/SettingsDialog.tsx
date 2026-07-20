"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchLlmModels, getLlmSettings, saveLlmSettings } from "@/lib/api";

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getLlmSettings()
      .then((settings) => {
        if (!active) return;
        setBaseUrl(settings.base_url);
        setModel(settings.model);
        setApiKey("");
        setApiKeySet(settings.api_key_set);
        setStatus("");
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "读取设置失败");
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  async function loadModels() {
    setLoading(true);
    setStatus("");
    try {
      const result = await fetchLlmModels({ base_url: baseUrl, api_key: apiKey || undefined });
      setModels(result.items);
      setStatus(result.items.length ? `已获取 ${result.items.length} 个模型` : "接口未返回可用模型");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "获取模型失败");
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const result = await saveLlmSettings({ base_url: baseUrl, api_key: apiKey || undefined, model });
      setApiKey("");
      setApiKeySet(result.api_key_set);
      setStatus(result.configured ? "设置已保存，AI 已就绪" : "设置已保存；请补充 API Key 后使用 AI");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#202124]/35 p-4" role="presentation" onMouseDown={onClose}>
      <section className="w-full max-w-[560px] rounded-3xl border border-[#dfe3eb] bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="settings-title" className="text-lg font-semibold text-[#202124]">AI 设置</h2>
            <p className="mt-1 text-sm leading-6 text-[#5f6368]">连接 OpenAI 兼容接口。Key 只保存在当前服务端，不会回显。</p>
          </div>
          <button type="button" className="top-button" onClick={onClose} aria-label="关闭设置">关闭</button>
        </div>

        <form className="space-y-4" onSubmit={(event) => void save(event)}>
          <label className="block text-sm font-medium text-[#3c4043]">
            Base URL
            <input className="mt-2 h-11 w-full rounded-xl border border-[#d9dde7] px-3 text-sm outline-none focus:border-[#6f7de8]" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" autoComplete="url" required />
          </label>
          <label className="block text-sm font-medium text-[#3c4043]">
            API Key
            <input className="mt-2 h-11 w-full rounded-xl border border-[#d9dde7] px-3 text-sm outline-none focus:border-[#6f7de8]" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={apiKeySet ? "已保存；留空则保持不变" : "输入 API Key"} type="password" autoComplete="new-password" />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-[#3c4043]" htmlFor="llm-model">模型</label>
              <button type="button" className="text-sm font-medium text-[#5663c7] hover:text-[#3645b0]" onClick={() => void loadModels()} disabled={loading}>从 /v1/models 获取</button>
            </div>
            <input id="llm-model" list="llm-model-options" className="h-11 w-full rounded-xl border border-[#d9dde7] px-3 text-sm outline-none focus:border-[#6f7de8]" value={model} onChange={(event) => setModel(event.target.value)} placeholder="选择或手动输入模型名称" required />
            <datalist id="llm-model-options">{models.map((item) => <option key={item} value={item} />)}</datalist>
          </div>

          {status ? <p className="rounded-xl bg-[#f4f6ff] px-3 py-2 text-sm text-[#4853a9]">{status}</p> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="top-button" onClick={onClose}>取消</button>
            <button type="submit" className="h-9 rounded-full bg-[#3f51c5] px-5 text-sm font-medium text-white shadow-sm" disabled={loading}>{loading ? "处理中…" : "保存设置"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
