import express from "express";
import path from "path";
import { createWorker } from "tesseract.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

export async function createApp() {
  const app = express();

  // Initialize firebase-admin safely
  try {
    if (getApps().length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccount) {
        initializeApp({
          credential: JSON.parse(serviceAccount),
        });
        console.log("Firebase Admin initialized with service account");
      } else {
        initializeApp({
          projectId: "agrostock-gps",
        });
        console.log("Firebase Admin initialized with projectId only");
      }
    }
  } catch (error: any) {
    console.error("Failed to initialize Firebase Admin:", error.message || error);
  }

  // Crucial: Increase body size limit for base64 image uploads
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  function getDefaultModel(provider: string): string {
    switch (provider) {
      case 'openai': return 'gpt-4o-mini';
      case 'deepseek': return 'deepseek-chat';
      case 'gemini': return 'gemini-2.0-flash';
      case 'claude': return 'claude-sonnet-4-20250514';
      default: return 'deepseek-chat';
    }
  }

  async function callAIProvider(
    systemPrompt: string,
    userPrompt: string,
    config: { provider: string; apiKey: string; model: string }
  ): Promise<string> {
    const { provider, apiKey, model } = config;

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 2000, temperature: 0.1
        })
      });
      if (!response.ok) throw new Error(`OpenAI API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Resposta em branco do modelo ${model}.`);
      return content;
    }

    if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 2000, temperature: 0.1
        })
      });
      if (!response.ok) throw new Error(`DeepSeek API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Resposta em branco do modelo ${model}.`);
      return content;
    }

    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        })
      });
      if (!response.ok) throw new Error(`Gemini API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Resposta em branco do modelo Gemini.');
      return text;
    }

    if (provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 2000, system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      if (!response.ok) throw new Error(`Claude API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('Resposta em branco do modelo Claude.');
      return text;
    }

    throw new Error(`Provedor não suportado: ${provider}`);
  }

  // Try new format (AI_API_KEY, AI_PROVIDER, AI_MODEL), fallback to old DEEPSEEK_API_KEY
  let aiConfig: { provider: string; apiKey: string; model: string } | null = null;
  const envApiKey = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const envProvider = process.env.AI_PROVIDER || 'deepseek';
  const envModel = process.env.AI_MODEL || getDefaultModel(envProvider);
  if (envApiKey) {
    aiConfig = { provider: envProvider, apiKey: envApiKey, model: envModel };
  }

  // Only try Firestore if a service account is configured
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const db = getFirestore();
      const configDoc = await db.collection('settings').doc('app_config').get();
      if (configDoc.exists) {
        const data = configDoc.data()!;
        if (data.aiApiKey) {
          aiConfig = {
            provider: data.aiProvider || 'deepseek',
            apiKey: data.aiApiKey,
            model: data.aiModel || getDefaultModel(data.aiProvider || 'deepseek')
          };
          console.log("[Settings] AI config loaded from Firestore");
        } else if (data.deepseekApiKey) {
          // Migrate old format
          aiConfig = { provider: 'deepseek', apiKey: data.deepseekApiKey, model: 'deepseek-chat' };
          console.log("[Settings] Legacy DeepSeek config loaded from Firestore");
        }
      }
    } catch (e: any) {
      console.log("[Settings] Could not load from Firestore: " + e.message);
    }
  }

  // API Route for parsing license images
  app.post("/api/licenses/parse-image", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: "Dados de imagem inválidos ou ausentes na requisição." });
      }

      if (!aiConfig || !aiConfig.apiKey) {
        return res.status(500).json({ 
          error: "Chave de API não configurada no servidor. Acesse Configurações > Integrações > A.I. para configurar." 
        });
      }

      // Step 1: OCR local com Tesseract.js
      console.log("[OCR] Iniciando reconhecimento de texto na imagem...");
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const worker = await createWorker('por+eng');
      const { data } = await worker.recognize(imageBuffer);
      await worker.terminate();

      const extractedText = data.text?.trim();
      if (!extractedText || extractedText.length < 10) {
        throw new Error("Não foi possível extrair texto da imagem. Verifique se a imagem está legível e tente novamente.");
      }
      console.log(`[OCR] Texto extraído (${extractedText.length} caracteres):`, extractedText.substring(0, 300));

      // Step 2: AI estrutura o texto em JSON
      const systemPrompt = "Você é um assistente especializado em extrair dados estruturados de licenças agrícolas Trimble/Topcon. Sempre responda com um objeto JSON válido.";
      const userPrompt = `Analise o texto extraído de um documento de ativação de licença agrícola (Trimble ou Topcon) abaixo e extraia os campos solicitados.

Instruções Especiais de Extração:
1. Fabricante (brand): Identifique se é 'Trimble' ou 'Topcon'.
2. Serviço (subscriptionService): Extraia o nome exato do serviço (ex: 'Ag Regional CenterPoint RTX Plus 1 Year (Brazil Only)').
3. Datas (startDate, expirationDate): Converta datas como '18-JUL-2026' para ISO 'YYYY-MM-DD' (ex: '2026-07-18'). Mapeamento: JAN=01, FEV=02, MAR=03, ABR=04, MAI=05, JUN=06, JUL=07, AGO=08, SET=09, OUT=10, NOV=11, DEZ=12.
4. Número de Série (serialNumber): Extraia sob 'Número De Série' ou 'Serial Number'.
5. Modelo (model): Extraia o modelo (ex: 'XCN-2050' ou 'GFX-750').
6. Código de permissão de ativação (permissionCode): Código hash em Base64 ou chave alfanumérica, extraia o valor completo incluindo '=' no final.
7. Chave Master Unlock (masterUnlockKey): Se houver, extraia o valor completo.

Retorne APENAS um objeto JSON SEM formatação adicional (sem markdown, sem code blocks) com estes campos: subscriptionService, brand, startDate, expirationDate, serialNumber, model, permissionCode, masterUnlockKey

Texto extraído:
${extractedText}`;

      const content = await callAIProvider(systemPrompt, userPrompt, aiConfig);

      let jsonStr = content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsedData = JSON.parse(jsonStr);
      return res.json(parsedData);
    } catch (error: any) {
      console.error("Erro na análise OCR/AI de licença:", error);
      return res.status(500).json({ error: error.message || "Falha na análise da imagem da licença." });
    }
  });

  // Generic helper to persist AI config
  async function persistAiConfig(config: { provider: string; apiKey: string; model: string }) {
    aiConfig = config;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const dbs = getFirestore();
        await dbs.collection('settings').doc('app_config').set({
          aiProvider: config.provider,
          aiApiKey: config.apiKey,
          aiModel: config.model,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e: any) {
        console.log("[Settings] Could not persist to Firestore, saved in memory only (" + e.message + ")");
      }
    } else {
      console.log("[Settings] No FIREBASE_SERVICE_ACCOUNT_KEY, config saved in memory only");
    }
    console.log(`[Settings] AI config saved (provider: ${config.provider}, model: ${config.model})`);
  }

  // POST /api/settings/ai — new multi-provider endpoint
  app.post("/api/settings/ai", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "Chave da API não informada." });
      }
      const actualProvider = provider || 'deepseek';
      await persistAiConfig({
        provider: actualProvider,
        apiKey: apiKey.trim(),
        model: model || getDefaultModel(actualProvider)
      });
      return res.json({ success: true, provider: actualProvider, model: model || getDefaultModel(actualProvider) });
    } catch (error: any) {
      console.error("Erro ao salvar configuração AI:", error);
      return res.status(500).json({ error: error.message || "Erro ao salvar configuração AI." });
    }
  });

  // POST /api/settings/ai-key — backward-compatible (accepts just apiKey, defaults to deepseek)
  app.post("/api/settings/ai-key", async (req, res) => {
    try {
      const { apiKey, provider, model } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "Chave da API não informada." });
      }
      const actualProvider = provider || 'deepseek';
      await persistAiConfig({
        provider: actualProvider,
        apiKey: apiKey.trim(),
        model: model || getDefaultModel(actualProvider)
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao salvar chave de API:", error);
      return res.status(500).json({ error: error.message || "Erro ao salvar chave de API." });
    }
  });

  // GET /api/settings/ai/status — new multi-provider status
  app.get("/api/settings/ai/status", async (req, res) => {
    try {
      let config = aiConfig;
      if (!config && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const dbs = getFirestore();
          const configDoc = await dbs.collection('settings').doc('app_config').get();
          if (configDoc.exists) {
            const data = configDoc.data()!;
            if (data.aiApiKey) {
              config = { provider: data.aiProvider || 'deepseek', apiKey: data.aiApiKey, model: data.aiModel || getDefaultModel(data.aiProvider || 'deepseek') };
            } else if (data.deepseekApiKey) {
              config = { provider: 'deepseek', apiKey: data.deepseekApiKey, model: 'deepseek-chat' };
            }
          }
        } catch (e) {}
      }
      return res.json({
        configured: !!(config?.apiKey),
        provider: config?.provider || null,
        model: config?.model || null
      });
    } catch (error: any) {
      return res.json({ configured: false, provider: null, model: null });
    }
  });

  // GET /api/settings/ai-key/status — backward-compatible
  app.get("/api/settings/ai-key/status", async (req, res) => {
    try {
      let configured = !!(aiConfig?.apiKey);
      let providerName = aiConfig?.provider || 'deepseek';
      if (!aiConfig && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const dbs = getFirestore();
          const configDoc = await dbs.collection('settings').doc('app_config').get();
          if (configDoc.exists) {
            const data = configDoc.data()!;
            configured = !!(data.aiApiKey || data.deepseekApiKey);
            providerName = data.aiProvider || 'deepseek';
          }
        } catch (e) {}
      }
      return res.json({ configured, key: aiConfig?.apiKey || null, provider: providerName });
    } catch (error: any) {
      return res.json({ configured: !!(aiConfig?.apiKey), key: aiConfig?.apiKey || null, provider: aiConfig?.provider || 'deepseek' });
    }
  });

  // POST /api/settings/ai/test — test any provider
  app.post("/api/settings/ai/test", async (req, res) => {
    try {
      const { apiKey, provider, model } = req.body;
      const testProvider = provider || aiConfig?.provider || 'deepseek';
      const testKey = apiKey || aiConfig?.apiKey || '';
      const testModel = model || aiConfig?.model || getDefaultModel(testProvider);

      if (!testKey) {
        return res.status(400).json({ error: "Nenhuma chave para testar." });
      }

      await callAIProvider(
        "Você é um assistente útil.",
        "Responda apenas: OK",
        { provider: testProvider, apiKey: testKey, model: testModel }
      );

      return res.json({ success: true, provider: testProvider, model: testModel });
    } catch (error: any) {
      console.error("Erro ao testar conexão AI:", error);
      return res.status(500).json({ error: error.message || "Falha ao testar conexão." });
    }
  });

  // POST /api/settings/ai-key/test — backward-compatible
  app.post("/api/settings/ai-key/test", async (req, res) => {
    try {
      const { apiKey } = req.body;
      const testKey = apiKey || aiConfig?.apiKey || '';
      const testProvider = aiConfig?.provider || 'deepseek';
      const testModel = aiConfig?.model || getDefaultModel(testProvider);

      if (!testKey) {
        return res.status(400).json({ error: "Nenhuma chave para testar." });
      }

      await callAIProvider(
        "Você é um assistente útil.",
        "Responda apenas: OK",
        { provider: testProvider, apiKey: testKey, model: testModel }
      );

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao testar conexão AI:", error);
      return res.status(500).json({ error: error.message || "Falha ao testar conexão." });
    }
  });

  // API Route for sending license expiration email alerts
  app.post("/api/licenses/send-alert-email", async (req, res) => {
    try {
      const { alertEmail, days, licenses } = req.body;
      if (!alertEmail) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!licenses || !Array.isArray(licenses) || licenses.length === 0) {
        return res.status(400).json({ error: "Nenhuma licença fornecida para o alerta." });
      }

      // Check if SMTP environment variables are defined
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";

      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      // Construct detailed email content
      const title = `⚠️ Alerta AgroStockGPS: ${licenses.length} Licença(s) vencendo em até ${days} dias!`;
      
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Agro Stock GPS</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Gestão Automática de Ativos & Licenças</p>
          </div>
          
          <!-- Body Content -->
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">Olá,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              Identificamos que as seguintes licenças de tecnologia e monitoramento agrícola estão com data de expiração programada para os próximos <strong>${days} dias</strong>.
            </p>
            <p style="font-size: 13px; color: #ef4444; font-weight: 600; margin-bottom: 20px; display: flex; align-items: center;">
              ⚠️ É recomendada a renovação com os representantes para evitar prejuízos e paradas indesejadas nas operações agrícolas de campo.
            </p>

            <!-- License Cards Table -->
            <div style="overflow-x: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px; font-weight: 600; color: #475569;">Licença / Tecnologia</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569;">Número de Série (S/N)</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569;">Vencimento</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569;">Máquina</th>
                  </tr>
                </thead>
                <tbody>
                  ${licenses.map((lic: any, idx: number) => {
                    const serialNum = lic.deviceSerialNumber || lic.associatedComponentSerial || "Não cadastrado";
                    const expDateFormatted = lic.expirationDate ? new Date(lic.expirationDate).toLocaleDateString('pt-BR') : 'Perpétua';
                    return `
                      <tr style="border-bottom: 1px solid #edf2f7; ${idx % 2 === 1 ? 'background-color: #fafafa;' : ''}">
                        <td style="padding: 12px 10px;">
                          <div style="font-weight: 600; color: #1e293b;">${lic.name}</div>
                          <div style="font-size: 11px; color: #64748b;">Chave: <code style="background-color: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-family: monospace;">${lic.code}</code></div>
                          <div style="font-size: 11px; color: #64748b;">Marca: ${lic.brand}</div>
                        </td>
                        <td style="padding: 12px 10px; font-family: monospace; font-weight: 600; color: #0f172a;">
                          ${serialNum}
                        </td>
                        <td style="padding: 12px 10px; font-weight: 600; color: #ef4444;">
                          ${expDateFormatted}
                        </td>
                        <td style="padding: 12px 10px; color: #334155;">
                          ${lic.associatedMachinePrefix || "Almoxarifado"}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Action Advice -->
            <div style="background-color: #f0fdf4; border: 1px dashed #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #166534; font-weight: 700;">Como proceder?</h4>
              <p style="margin: 0; font-size: 12px; color: #166534; line-height: 1.5;">
                Entre em contato com a revendedora autorizada informando a marca e os <strong>Números de Série (S/N)</strong> destacados acima para solicitar o faturamento ou reativação do sinal contratado.
              </p>
            </div>

            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 0;">
              Este é um e-mail automático enviado pelo sistema Agro Stock GPS. Não responda a esta mensagem.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            <strong>Agro Stock GPS</strong> - Gestão Eficiente de Tecnologia de Precisão
          </div>
        </div>
      `;

      if (isSmtpConfigured) {
        // Create Transporter
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465, // true for 465, false for other ports
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        // Send Email
        await transporter.sendMail({
          from: `"${smtpFromName}" <${smtpFromEmail}>`,
          to: alertEmail,
          subject: title,
          html: emailHtml,
        });

        console.log(`✉️  [Nodemailer] Alerta de expiração enviado com SUCESSO para ${alertEmail}`);

        return res.json({
          success: true,
          message: `E-mail de alerta de ${days} dias enviado com sucesso para ${alertEmail}!`,
          sentCount: licenses.length,
          simulated: false
        });
      } else {
        // Simulate sending and show detailed debug message in terminal + response
        console.log(`\n========================================================================`);
        console.log(`✉️  [SIMULAÇÃO DE EMAIL] ENVIANDO ALERTA DE VENCIMENTO DE LICENÇA (${days} DIAS)`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`Para: ${alertEmail}`);
        console.log(`Assunto: ${title}`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`[Aviso do Servidor] Configurações de SMTP do servidor não foram preenchidas.`);
        console.log(`Para envio em produção, cadastre as seguintes variáveis em Configurações > Secrets:`);
        console.log(`- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL`);
        console.log(`------------------------------------------------------------------------`);
        
        licenses.forEach((lic: any, idx: number) => {
          console.log(`  [Licença #${idx + 1}] ${lic.name} | S/N: ${lic.deviceSerialNumber || lic.associatedComponentSerial || 'Não cadastrado'} | Exp: ${lic.expirationDate}`);
        });
        console.log(`========================================================================\n`);

        return res.json({
          success: true,
          simulated: true,
          sentCount: licenses.length,
          message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o email com as licenças e seus respectivos Números de Série foi impresso no console de desenvolvimento. Para receber em sua caixa de entrada, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL nas configurações de Secrets do AI Studio.`
        });
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de licença:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });

  // API Route for sending loan expiration/overdue email alerts
  app.post("/api/loans/send-alert-email", async (req, res) => {
    try {
      const { alertEmail, loans } = req.body;
      if (!alertEmail) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!loans || !Array.isArray(loans) || loans.length === 0) {
        return res.status(400).json({ error: "Nenhum empréstimo fornecido para o alerta." });
      }

      // Check if SMTP environment variables are defined
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";

      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      // Construct detailed email content
      const title = `⚠️ Alerta AgroStockGPS: ${loans.length} Empréstimo(s) Vencido(s) ou Pendente(s)!`;
      
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Agro Stock GPS</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Gestão de Empréstimos & Controle de Devolução</p>
          </div>
          
          <!-- Body Content -->
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">Olá,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              Identificamos os seguintes empréstimos de equipamentos agrícolas concedidos a terceiros que estão <strong>vencidos ou pendentes de devolução</strong>.
            </p>
            <p style="font-size: 13px; color: #ef4444; font-weight: 600; margin-bottom: 20px;">
              ⚠️ Solicitamos que os responsáveis ou empresas listadas sejam contatados para providenciar a restituição dos itens ao estoque.
            </p>

            <!-- Table of Loans -->
            <div style="overflow-x: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Nº Termo / Responsável</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Empresa / Terceiro</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Data de Saída</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Previsão de Retorno</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Equipamentos</th>
                  </tr>
                </thead>
                <tbody>
                  ${loans.map((loan: any, idx: number) => {
                    const outDate = loan.loanDate ? new Date(loan.loanDate).toLocaleDateString('pt-BR') : '-';
                    const estReturn = loan.estimatedReturnDate ? new Date(loan.estimatedReturnDate).toLocaleDateString('pt-BR') : 'Indeterminada';
                    const itemsList = loan.items.map((it: any) => `${it.componentName} (S/N: ${it.componentSerial})`).join('<br/>');
                    return `
                      <tr style="border-bottom: 1px solid #edf2f7; ${idx % 2 === 1 ? 'background-color: #fafafa;' : ''}">
                        <td style="padding: 12px 10px; border: 1px solid #edf2f7;">
                          <div style="font-weight: 600; color: #1e293b;">${loan.contractNumber}</div>
                          <div style="font-size: 12px; color: #475569;">${loan.thirdPartyName}</div>
                          <div style="font-size: 11px; color: #64748b;">Doc: ${loan.thirdPartyDocument}</div>
                        </td>
                        <td style="padding: 12px 10px; color: #334155; font-weight: 500; border: 1px solid #edf2f7;">
                          ${loan.thirdPartyCompany}
                        </td>
                        <td style="padding: 12px 10px; color: #475569; border: 1px solid #edf2f7;">
                          ${outDate}
                        </td>
                        <td style="padding: 12px 10px; font-weight: 600; color: #ef4444; border: 1px solid #edf2f7;">
                          ${estReturn}
                        </td>
                        <td style="padding: 12px 10px; font-size: 11px; color: #475569; line-height: 1.4; border: 1px solid #edf2f7;">
                          ${itemsList}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Action Advice -->
            <div style="background-color: #fffbeb; border: 1px dashed #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #b45309; font-weight: 700;">Como proceder?</h4>
              <p style="margin: 0; font-size: 12px; color: #b45309; line-height: 1.5;">
                Sugerimos acionar os contatos dos prestadores terceiros listados para agendar a entrega física dos equipamentos no almoxarifado de sua usina ou unidade.
              </p>
            </div>

            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 0;">
              Este é um e-mail automático enviado pelo sistema Agro Stock GPS. Não responda a esta mensagem.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            <strong>Agro Stock GPS</strong> - Gestão Eficiente de Tecnologia de Precisão
          </div>
        </div>
      `;

      if (isSmtpConfigured) {
        // Create Transporter
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        // Send Email
        await transporter.sendMail({
          from: `"${smtpFromName}" <${smtpFromEmail}>`,
          to: alertEmail,
          subject: title,
          html: emailHtml,
        });

        console.log(`✉️  [Nodemailer] Alerta de empréstimos vencidos enviado com SUCESSO para ${alertEmail}`);

        return res.json({
          success: true,
          message: `E-mail de alerta de empréstimos vencidos enviado com sucesso para ${alertEmail}!`,
          sentCount: loans.length,
          simulated: false
        });
      } else {
        // Simulate sending
        console.log(`\n========================================================================`);
        console.log(`✉️  [SIMULAÇÃO DE EMAIL] ENVIANDO ALERTA DE EMPRÉSTIMOS VENCIDOS`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`Para: ${alertEmail}`);
        console.log(`Assunto: ${title}`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`[Aviso do Servidor] Configurações de SMTP do servidor não foram preenchidas.`);
        console.log(`Para envio em produção, configure as variáveis em Secrets.`);
        console.log(`========================================================================\n`);

        return res.json({
          success: true,
          simulated: true,
          sentCount: loans.length,
          message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o email com as licenças e seus respectivos Números de Série foi impresso no console de desenvolvimento. Para receber em sua caixa de entrada, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL nas configurações de Secrets do AI Studio.`
        });
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de empréstimo:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });


  // API Route for updating a user in Firebase Auth using Admin SDK
  app.post("/api/admin/users/update", async (req, res) => {
    try {
      const { uid, email, password, displayName } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID do usuário não informado." });
      }

      const updateParams: any = {};
      if (email) updateParams.email = email;
      if (password) updateParams.password = password;
      if (displayName) updateParams.displayName = displayName;

      await getAuth().updateUser(uid, updateParams);
      console.log(`User ${uid} updated in Firebase Auth successfully`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao atualizar usuário no Firebase Auth:", error);
      return res.status(500).json({ error: error.message || "Erro ao atualizar usuário no Firebase Auth." });
    }
  });

  // API Route for deleting a user from Firebase Auth using Admin SDK
  app.post("/api/admin/users/delete", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID do usuário não informado." });
      }

      await getAuth().deleteUser(uid);
      console.log(`User ${uid} deleted from Firebase Auth successfully`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao deletar usuário no Firebase Auth:", error);
      if (error.code === 'auth/user-not-found') {
        return res.json({ success: true, warning: "Usuário não existia no Firebase Auth." });
      }
      return res.status(500).json({ error: error.message || "Erro ao deletar usuário no Firebase Auth." });
    }
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = parseInt(process.env.PORT || '3003', 10);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Prevent service worker from being cached by the browser
    app.get('/sw.js', (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      next();
    });

    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        }
      }
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Run directly (local dev) or export for Vercel
if (process.env.VERCEL !== '1') {
  startServer();
}

export default createApp;
