import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "10mb" }));

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Generation API endpoint
  app.post("/api/generate", async (req, res) => {
    try {
      const { contextProfile, consumerProblem, landingPageUrl } = req.body;

      if (!contextProfile || !consumerProblem || !landingPageUrl) {
        return res.status(400).json({ error: "Harap isi semua kolom input." });
      }

      const ai = getAI();
      const promptContents = `
        Anda adalah seorang ahli pemasaran digital dan copywriter iklan SEM yang sangat berpengalaman. 
        Tugas Anda adalah menganalisis informasi berikut dan menghasilkan materi iklan Google Ads yang optimal.

        **Context Profile:**
        ${contextProfile}

        **Problem dari Konsumen:**
        ${consumerProblem}

        **URL Landing Page:**
        ${landingPageUrl}

        **Instruksi Khusus:**
        1. Analisis konten relevansi produk dan brand terhadap target audiens serta URL Landing Page.
        2. Hasilkan output dalam format JSON sesuai schema.
        3. **PATUHI BATASAN KARAKTER SECARA KETAT:**
           - Headline: Maksimal 30 karakter.
           - Deskripsi: Maksimal 90 karakter.
           - Sitelink Headline: Maksimal 30 karakter.
           - Sitelink Description: Maksimal 25 karakter.
           - Callout: Maksimal 25 karakter.
        4. Berikan 20 Headline, 15 Deskripsi, 20 Keyword Utama, 20 Keyword Pendukung, 20 Keyword Negatif, 10 Sitelink, dan 10 Callout.
        5. Gunakan Bahasa Indonesia yang persuasif dan profesional.
      `;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          materiIklan: {
            type: Type.OBJECT,
            properties: {
              headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
              descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["headlines", "descriptions"],
          },
          kataKunci: {
            type: Type.OBJECT,
            properties: {
              utama: { type: Type.ARRAY, items: { type: Type.STRING } },
              pendukung: { type: Type.ARRAY, items: { type: Type.STRING } },
              negatif: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["utama", "pendukung", "negatif"],
          },
          ekstensi: {
            type: Type.OBJECT,
            properties: {
              sitelinks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    headline: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["headline", "description"],
                },
              },
              callouts: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["sitelinks", "callouts"],
          },
        },
        required: ["materiIklan", "kataKunci", "ekstensi"],
      };

      // Models to try in order of preference to handle transient high-demand spikes
      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
      let lastError: any = null;
      let parsedData: any = null;

      for (const model of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: promptContents,
              config: {
                responseMimeType: "application/json",
                responseSchema,
              },
            });

            if (!response.text) {
              throw new Error("Respon kosong dari AI model.");
            }

            let text = response.text.trim();
            if (text.startsWith("```json")) {
              text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
            } else if (text.startsWith("```")) {
              text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }

            parsedData = JSON.parse(text);
            break;
          } catch (err: any) {
            lastError = err;
            const errMsg = String(err?.message || "");
            const isTransient =
              err?.status === 503 ||
              err?.code === 503 ||
              errMsg.includes("503") ||
              errMsg.includes("high demand") ||
              errMsg.includes("UNAVAILABLE") ||
              err?.status === 429 ||
              errMsg.includes("429");

            console.warn(`[AI Generation] Model ${model} (attempt ${attempt + 1}) failed:`, errMsg);

            if (isTransient && attempt === 0) {
              // Wait 1.5 seconds before retrying current model
              await new Promise((resolve) => setTimeout(resolve, 1500));
              continue;
            }
            // Move to next candidate model
            break;
          }
        }

        if (parsedData) {
          break;
        }
      }

      if (!parsedData) {
        throw lastError || new Error("Gagal menghasilkan konten dari seluruh model AI.");
      }

      return res.json(parsedData);
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      const isHighDemand =
        error?.status === 503 ||
        error?.code === 503 ||
        String(error?.message || "").includes("503") ||
        String(error?.message || "").includes("high demand");

      const clientMsg = isHighDemand
        ? "Model AI sedang mengalami lonjakan traffic sementara. Silakan coba klik tombol 'Generate Assets' kembali."
        : error?.message || "Terjadi kesalahan saat menghubungi server AI.";

      return res.status(500).json({
        error: clientMsg,
      });
    }
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
