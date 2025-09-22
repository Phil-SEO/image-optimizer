'use client';

import { useEffect, useRef, useState } from 'react';
import { FaImage } from 'react-icons/fa';
import { MdOutlineDeleteOutline, MdDarkMode, MdLightMode } from 'react-icons/md';
import { HiDownload } from 'react-icons/hi';
import { RiImage2Line, RiSparklingFill } from 'react-icons/ri';
import { IoMdReturnRight } from 'react-icons/io';
import { CgSpinner } from "react-icons/cg";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const gradientBtnStyle = `
  .gradient-btn {
    background-image: linear-gradient(108deg, #4F5156 0%, #676A70 50%, #4F5156 100%);
    background-size: 200% 100%;
    transition: background-position 0.5s ease;
  }
  .gradient-btn:hover {
    background-position: -100% 0;
  }
`;

export default function MultiConverter() {
  const [items, setItems] = useState([]); // {id, file, preview, status, downloadUrl?, downloadName?, error?}
  const [format, setFormat] = useState('webp');
  const [quality, setQuality] = useState(80);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const idRef = useRef(1);
  const [formats, setFormats] = useState([]);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [formatsError, setFormatsError] = useState(null);

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach(i => {
        if (i.downloadUrl) URL.revokeObjectURL(i.downloadUrl);
        if (i.preview) URL.revokeObjectURL(i.preview);
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setFormatsLoading(true);
        const res = await fetch('/api/convert', { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const list = Array.isArray(data?.supported) ? data.supported : [];
        if (cancelled) return;
        setFormats(list);
        // Ensure current format is valid; prefer webp if available
        setFormat(f => list.includes(f) ? f : (list.includes('webp') ? 'webp' : (list[0] || '')));
      } catch (e) {
        if (!cancelled) setFormatsError('Failed to load supported formats');
      } finally {
        if (!cancelled) setFormatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function onPickFiles(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function addFiles(fileList) {
    const next = Array.from(fileList || []).map(f => ({
      id: idRef.current++,
      file: f,
      preview: URL.createObjectURL(f),
      status: 'idle',
      downloadUrl: null,
      downloadName: '',
      error: null,
    }));
    if (next.length) setItems(prev => [...prev, ...next]);
  }

  function removeItem(id) {
    setItems(prev => {
      const item = prev.find(x => x.id === id);
      if (item?.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(x => x.id !== id);
    });
  }

  function clearResults() {
    setItems(prev => prev.map(i => {
      if (i.downloadUrl) URL.revokeObjectURL(i.downloadUrl);
      return { ...i, status: 'idle', downloadUrl: null, downloadName: '', error: null };
    }));
  }

  function clearAll() {
    items.forEach(i => {
      if (i.downloadUrl) URL.revokeObjectURL(i.downloadUrl);
      if (i.preview) URL.revokeObjectURL(i.preview);
    });
    setItems([]);
  }

  async function convertOne(item) {
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'converting', error: null, downloadUrl: null } : x));
    try {
      const form = new FormData();
      form.append('file', item.file, item.file.name);

      const qs = new URLSearchParams({
        format,
        quality: String(quality),
        ...(width ? { w: String(width) } : {}),
        ...(height ? { h: String(height) } : {}),
      });

      const res = await fetch(`/api/convert?${qs}`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const cd = res.headers.get('content-disposition') || '';
      const name = /filename="(.+?)"/i.exec(cd)?.[1] || makeOutName(item.file.name, format);

      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', downloadUrl: url, downloadName: name } : x));
    } catch (err) {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: err?.message || 'Failed' } : x));
    }
  }

  async function onConvertAll() {
    clearResults();
    setBusy(true);
    try {
      const queue = [...items];
      const CONCURRENCY = 4;

      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
          const next = queue.shift();
          if (next) await convertOne(next);
        }
      });

      await Promise.allSettled(workers);
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    const ready = itemsRef.current.filter(i => i.status === 'done' && i.downloadUrl);
    for (const i of ready) {
      const a = document.createElement('a');
      a.href = i.downloadUrl;
      a.download = i.downloadName || makeOutName(i.file.name, format);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise(r => setTimeout(r, 150));
    }
  }

  function makeOutName(name, fmt) {
    const base = name.replace(/\.[^.]+$/, '');
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    return `${base}.${ext}`;
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }
  function prevent(e) { e.preventDefault(); }

  const doneCount = items.filter(i => i.status === 'done' && i.downloadUrl).length;

  return (
    <>
      <style>{gradientBtnStyle}</style>
      <main className="min-h-screen bg-[linear-gradient(108deg,#151517_0%,#121215_50%,#111014_75%,#0F0E13_100%)] text-gray-100">
        <nav className="w-full z-50 bg-[#17171A]/80 backdrop-blur-md border-b border-[#4F5156] sticky top-0">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 p-3">
            <h1 className="text-white text-xl font-bold">Bulk Image Converter</h1>
          </div>
        </nav>

        <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
          <div className="bg-[#17171A] border border-[#4F5156] rounded-sm w-full">
            <div
              onDrop={onDrop}
              onDragOver={(e) => { prevent(e); setDragOver(true); }}
              onDragEnter={() => setDragOver(true)}
              onDragLeave={() => setDragOver(false)}
              className={[
                'p-8 text-center cursor-pointer transition-colors duration-300 rounded-sm',
                dragOver ? 'bg-[#1B1B1F]' : ''
              ].join(' ')}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onPickFiles}
                className="hidden"
              />
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-[#121215] text-[#4F5156] border border-[#4F5156] transition-transform group-hover:scale-105">
                <FaImage size={24} />
              </div>
              <p className="m-0 text-base text-gray-200">
                <span className="font-semibold">Drag & drop images</span> or <span className="underline underline-offset-2">browse files</span>
              </p>
              <p className="mt-2 text-xs text-[#4F5156]">
                Files are processed in your browser. No data is uploaded.
              </p>
            </div>
          </div>

          <div className="bg-[#17171A] border border-[#4F5156] rounded-sm w-full p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="grid gap-2">
                <span className="text-sm font-medium text-gray-400">Format</span>
                <Select
                  value={format}
                  onValueChange={setFormat}
                  disabled={formatsLoading || !formats.length}
                >
                  <SelectTrigger className="w-full bg-[#1B1B1F] border border-[#4F5156] rounded-sm p-2 text-gray-100 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder={formatsLoading ? "Loading formats..." : "Select format"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#17171A] border border-[#4F5156] text-gray-100">
                    {formats.map(fmt => (
                      <SelectItem
                        key={fmt}
                        value={fmt}
                        className="cursor-pointer focus:bg-[#232426]"
                      >
                        {fmt === 'jpeg' ? 'JPEG / JPG' : fmt.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formatsError && (
                  <p className="text-xs text-red-400 mt-1">{formatsError}</p>
                )}
              </div>

              <label className="grid gap-2 col-span-2 md:col-span-1">
                <span className="text-sm font-medium text-gray-400">Quality: <b>{quality}</b></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  className="w-full h-2 bg-[#1B1B1F] rounded-lg appearance-none cursor-pointer accent-[#676A70]"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-400">Width</span>
                <div className="bg-[#1B1B1F] border border-[#4F5156] rounded-sm">
                  <input
                    type="number"
                    min="0"
                    placeholder="Auto"
                    value={width}
                    onChange={e => setWidth(Number(e.target.value) || 0)}
                    className="w-full bg-transparent p-2 text-gray-100 focus:ring-0 border-none"
                  />
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-400">Height</span>
                <div className="bg-[#1B1B1F] border border-[#4F5156] rounded-sm">
                  <input
                    type="number"
                    min="0"
                    placeholder="Auto"
                    value={height}
                    onChange={e => setHeight(Number(e.target.value) || 0)}
                    className="w-full bg-transparent p-2 text-gray-100 focus:ring-0 border-none"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#4F5156] pt-4">
              <button
                type="button"
                onClick={onConvertAll}
                className={`w-40 h-10 rounded-sm text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-100 flex items-center justify-center gap-2 cursor-pointer ${(items.length && !busy) ? 'gradient-btn text-gray-900' : 'bg-[#232426] text-[#4F5156]'}`}
                disabled={!items.length || busy}
              >
                {busy ? (
                  <CgSpinner className="h-5 w-5 animate-spin-fast" />
                ) : (
                  <RiSparklingFill className="h-5 w-5" />
                )}
                {busy ? 'Converting...' : `Convert (${items.length})`}
              </button>

              <button
                type="button"
                onClick={downloadAll}
                className="cursor-pointer h-10 px-4 rounded-sm bg-[#232426] text-[#4F5156] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 text-sm hover:text-gray-200 transition-colors"
                disabled={busy || doneCount === 0}
              >
                <HiDownload size={18} />
                <span>Download All ({doneCount})</span>
              </button>

              <button
                type="button"
                onClick={clearAll}
                className="h-10 px-4 rounded-sm bg-transparent text-[#4F5156] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center text-sm hover:text-red-400 transition-colors ml-auto"
                disabled={!items.length || busy}
              >
                Clear All
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="bg-[#17171A] border border-[#4F5156] rounded-sm w-full">
              <div className="p-2 border-b border-[#4F5156]">
                <h2 className="text-sm text-[#4F5156] font-medium">Conversion Queue</h2>
              </div>
              <ul className="divide-y divide-[#1B1B1F]">
                {items.map(item => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    <RiImage2Line size={20} className="shrink-0 text-[#4F5156]" />
                    <div className="min-w-0 truncate text-sm font-medium text-gray-300" title={item.file.name}>
                      {item.file.name}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      <StatusBadge status={item.status} />

                      {item.status === 'done' && item.downloadUrl ? (
                        <a
                          href={item.downloadUrl}
                          download={item.downloadName || 'output'}
                          title="Download"
                          aria-label="Download"
                          className="text-[#4F5156] hover:text-gray-200 transition-colors"
                        >
                          <HiDownload size={20} />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => convertOne(item)}
                          disabled={item.status === 'converting' || busy}
                          title="Convert this file"
                          className="text-[#4F5156] hover:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <IoMdReturnRight size={20} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={busy}
                        title="Remove"
                        aria-label="Remove"
                        className="text-[#4F5156] hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        <MdOutlineDeleteOutline size={20} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function StatusBadge({ status }) {
  const base = "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold";
  if (status === 'done') return <span className={`${base} bg-emerald-900/50 text-emerald-300`}>Ready</span>;
  if (status === 'converting') return <span className={`${base} bg-blue-900/50 text-blue-300 animate-pulse`}>Working</span>;
  if (status === 'error') return <span className={`${base} bg-red-900/50 text-red-300`}>Error</span>;
  return <span className={`${base} bg-[#232426] text-[#4F5156]`}>Queued</span>;
}
