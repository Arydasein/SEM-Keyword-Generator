/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Target, 
  Link as LinkIcon, 
  Send, 
  Loader2, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Upload,
  X,
  FileJson,
  FileDown,
  ChevronRight,
  Check
} from "lucide-react";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface GeneratedData {
  materiIklan: {
    headlines: string[];
    descriptions: string[];
  };
  kataKunci: {
    utama: string[];
    pendukung: string[];
    negatif: string[];
  };
  ekstensi: {
    sitelinks: { headline: string; description: string }[];
    callouts: string[];
  };
}

type TabType = "materi" | "kunci" | "ekstensi";

export default function App() {
  const [contextProfile, setContextProfile] = useState("");
  const [consumerProblem, setConsumerProblem] = useState("");
  const [landingPageUrl, setLandingPageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [result, setResult] = useState<GeneratedData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("materi");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setError("");

    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();

      if (fileType === "txt" || fileType === "json") {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          if (fileType === "json") {
            try {
              const json = JSON.parse(content);
              setContextProfile(JSON.stringify(json, null, 2));
            } catch {
              setContextProfile(content);
            }
          } else {
            setContextProfile(content);
          }
          setIsFileLoading(false);
        };
        reader.readAsText(file);
      } 
      else if (fileType === "docx") {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          try {
            const result = await mammoth.extractRawText({ arrayBuffer });
            setContextProfile(result.value);
          } catch (err) {
            setError("Gagal membaca file DOCX.");
          } finally {
            setIsFileLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } 
      else if (fileType === "pdf") {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          try {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            let fullText = "";
            
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item: any) => item.str)
                .join(" ");
              fullText += pageText + "\n";
            }
            
            setContextProfile(fullText.trim());
          } catch (err) {
            console.error(err);
            setError("Gagal membaca file PDF.");
          } finally {
            setIsFileLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } 
      else {
        setError("Format file tidak didukung. Gunakan .txt, .json, .pdf, atau .docx.");
        setIsFileLoading(false);
      }
    } catch (err) {
      setError("Terjadi kesalahan saat memproses file.");
      setIsFileLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextProfile || !consumerProblem || !landingPageUrl) {
      setError("Harap isi semua kolom input.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contextProfile,
          consumerProblem,
          landingPageUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal menghasilkan konten.");
      }

      setResult(data);
      setActiveTab("materi");
    } catch (err: any) {
      console.error("Generate error:", err);
      setError(err?.message || "Terjadi kesalahan saat menghubungi server AI. Pastikan URL valid dan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const StatusBadge = ({ text, limit }: { text: string; limit: number }) => {
    const isOk = text.length <= limit;
    return (
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isOk ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
        {isOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
        {text.length}/{limit}
      </div>
    );
  };

  const TableHeader = ({ left, right }: { left: string; right?: string }) => (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{left}</span>
      {right && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{right}</span>}
    </div>
  );

  const TableRow = ({ text, limit, showBadge = true }: { text: string; limit?: number; showBadge?: boolean }) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors group">
      <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">{text}</span>
      {showBadge && limit !== undefined && <StatusBadge text={text} limit={limit} />}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-rose-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#800020] w-10 h-10 rounded-lg flex items-center justify-center shadow-md">
              <span className="text-white font-black text-lg tracking-tighter">BB</span>
            </div>
            <h1 className="font-bold text-lg md:text-xl tracking-tight text-slate-800">
              SEM Keyword Generator <span className="text-slate-400 font-normal">by Boleh Belajar</span>
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Input Section */}
          <div className="lg:col-span-4 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
            >
              <form onSubmit={handleGenerate} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <FileText className="w-4 h-4 text-[#800020]" />
                      Context Profile
                    </label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isFileLoading}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#800020] hover:underline uppercase tracking-wider disabled:opacity-50"
                    >
                      {isFileLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3" />
                      )}
                      Upload File
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".txt,.json,.pdf,.docx"
                      className="hidden"
                    />
                  </div>
                  <div className="relative">
                    <textarea
                      value={contextProfile}
                      onChange={(e) => setContextProfile(e.target.value)}
                      placeholder="Brand, produk, target audiens, dan nilai perusahaan..."
                      className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#800020] focus:border-transparent transition-all resize-none text-sm"
                    />
                    {contextProfile && (
                      <button
                        type="button"
                        onClick={() => setContextProfile("")}
                        className="absolute top-2 right-2 p-1 bg-white/80 hover:bg-white rounded-md text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <FileText className="w-2.5 h-2.5" /> TXT
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <FileJson className="w-2.5 h-2.5" /> JSON
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <FileDown className="w-2.5 h-2.5" /> PDF
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <FileText className="w-2.5 h-2.5" /> DOCX
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <Target className="w-4 h-4 text-rose-500" />
                    Problem dari Konsumen
                  </label>
                  <textarea
                    value={consumerProblem}
                    onChange={(e) => setConsumerProblem(e.target.value)}
                    placeholder="Pain point, USP, dan solusi yang ditawarkan..."
                    className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#800020] focus:border-transparent transition-all resize-none text-sm"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <LinkIcon className="w-4 h-4 text-emerald-500" />
                    URL Landing Page
                  </label>
                  <input
                    type="url"
                    value={landingPageUrl}
                    onChange={(e) => setLandingPageUrl(e.target.value)}
                    placeholder="https://example.com/landing-page"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#800020] focus:border-transparent transition-all text-sm"
                  />
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-medium"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setContextProfile("");
                      setConsumerProblem("");
                      setLandingPageUrl("");
                      setError("");
                    }}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-sm"
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-[2] py-4 bg-[#800020] hover:bg-[#600018] disabled:bg-rose-300 text-white font-bold rounded-xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2 group text-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        Generate Assets
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>

          {/* Output Section */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[600px]"
                >
                  {/* Tabs Header */}
                  <div className="bg-slate-50 p-4 flex items-center gap-4 border-b border-slate-200">
                    <button
                      onClick={() => setActiveTab("materi")}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "materi" ? "bg-[#800020] text-white shadow-lg shadow-rose-200" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Ide Headline dan Deskripsi
                    </button>
                    <button
                      onClick={() => setActiveTab("kunci")}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "kunci" ? "bg-[#800020] text-white shadow-lg shadow-rose-200" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Ide Keyword
                    </button>
                    <button
                      onClick={() => setActiveTab("ekstensi")}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "ekstensi" ? "bg-[#800020] text-white shadow-lg shadow-rose-200" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Ide Extension
                    </button>
                    <div className="ml-auto">
                      <button
                        onClick={copyToClipboard}
                        className="p-2 text-slate-400 hover:text-[#800020] transition-colors"
                        title="Copy all as JSON"
                      >
                        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {activeTab === "materi" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                        <section>
                          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            Headline (≤30 karakter)
                          </h2>
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <TableHeader left="TEKS HEADLINE" right="JUMLAH KARAKTER" />
                            {result.materiIklan.headlines.map((h, i) => (
                              <TableRow key={i} text={h} limit={30} />
                            ))}
                          </div>
                        </section>

                        <section>
                          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            Deskripsi (≤90 karakter)
                          </h2>
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <TableHeader left="TEKS DESKRIPSI" right="JUMLAH KARAKTER" />
                            {result.materiIklan.descriptions.map((d, i) => (
                              <TableRow key={i} text={d} limit={90} />
                            ))}
                          </div>
                        </section>
                      </motion.div>
                    )}

                    {activeTab === "kunci" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                        <section>
                          <h2 className="text-xl font-bold text-slate-800 mb-4">Keyword Utama</h2>
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <TableHeader left="KATA KUNCI" />
                            {result.kataKunci.utama.map((k, i) => (
                              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <span className="text-sm text-slate-700 font-medium">{k}</span>
                              </div>
                            ))}
                          </div>
                        </section>
                        <section>
                          <h2 className="text-xl font-bold text-slate-800 mb-4">Keyword Pendukung</h2>
                          <div className="grid grid-cols-2 gap-2">
                            {result.kataKunci.pendukung.map((k, i) => (
                              <div key={i} className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm text-slate-600 flex items-center gap-2">
                                <ChevronRight className="w-3 h-3 text-emerald-500" />
                                {k}
                              </div>
                            ))}
                          </div>
                        </section>
                        <section>
                          <h2 className="text-xl font-bold text-rose-700 mb-4">Keyword Negatif</h2>
                          <div className="flex flex-wrap gap-2">
                            {result.kataKunci.negatif.map((k, i) => (
                              <span key={i} className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-full text-xs font-medium">
                                {k}
                              </span>
                            ))}
                          </div>
                        </section>
                      </motion.div>
                    )}

                    {activeTab === "ekstensi" && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                        <section>
                          <h2 className="text-xl font-bold text-slate-800 mb-4">Sitelink Extension</h2>
                          <div className="grid md:grid-cols-2 gap-4">
                            {result.ekstensi.sitelinks.map((s, i) => (
                              <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[#800020] font-bold text-sm">{s.headline}</span>
                                  <StatusBadge text={s.headline} limit={30} />
                                </div>
                                <p className="text-slate-500 text-xs leading-relaxed">{s.description}</p>
                                <div className="pt-2">
                                  <StatusBadge text={s.description} limit={25} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                        <section>
                          <h2 className="text-xl font-bold text-slate-800 mb-4">Callout Extension</h2>
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <TableHeader left="TEKS CALLOUT" />
                            {result.ekstensi.callouts.map((c, i) => (
                              <TableRow key={i} text={c} showBadge={false} />
                            ))}
                          </div>
                        </section>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full min-h-[600px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 p-8 text-center"
                >
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center">
                      <Target className="w-6 h-6 text-rose-200" />
                    </div>
                  </div>
                  <p className="font-bold text-slate-600">Ayo generate keyword sekarang!</p>
                  <p className="text-sm mt-1 max-w-xs">Isi formulir di sebelah kiri untuk mulai membuat aset iklan Google Ads yang optimal.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-slate-400 text-[10px] border-t border-slate-100 mt-12 uppercase tracking-widest font-bold">
        &copy; 2026 SEM Keyword Generator by Boleh Belajar. Powered by Gemini AI.
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
