import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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

  // Initialize Gemini client
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey ? new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  }) : null;

  // API Route for parsing license images
  app.post("/api/licenses/parse-image", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: "Dados de imagem inválidos ou ausentes na requisição." });
      }

      if (!ai) {
        return res.status(500).json({ 
          error: "Chave de API do Gemini não está configurada no servidor. Por favor, configure GEMINI_API_KEY em Configurações > Secrets." 
        });
      }

      // Format image part for Google GenAI SDK
      const imagePart = {
        inlineData: {
          mimeType: mimeType,
          data: imageBase64,
        },
      };

      const promptPart = {
        text: `Analise a imagem deste documento de ativação de licença agrícola (geralmente Trimble ou Topcon).
Extraia os campos com precisão cirúrgica e retorne-os exatamente no formato JSON especificado.

Instruções Especiais de Extração:
1. Fabricante (brand): Identifique se é 'Trimble' ou 'Topcon'. Se a imagem mencionar 'sua assinatura Trimble' ou modelos como 'XCN-2050', 'GFX-750', etc., defina como 'Trimble'.
2. Serviço (subscriptionService): Extraia o nome exato do serviço sob 'Serviço de assinatura' ou 'Subscription service' (ex: 'Ag Regional CenterPoint RTX Plus 1 Year (Brazil Only)').
3. Datas (startDate, expirationDate): Converta datas como '18-JUL-2026' ou '18-JUL-2027' para o formato ISO 'YYYY-MM-DD' (ex: '2026-07-18', '2027-07-18'). Lembre-se que JUL = 07, AGO = 08, SET = 09, OUT = 10, NOV = 11, DEZ = 12, JAN = 01, FEV = 02, MAR = 03, ABR = 04, MAI = 05, JUN = 06.
4. Número de Série (serialNumber): Extraia sob 'Número De Série' ou 'Serial Number'.
5. Modelo (model): Extraia o modelo sob 'Modelo' ou 'Model' (ex: 'XCN-2050' ou 'GFX-750').
6. Código de permissão de ativação (permissionCode): Pode ser uma chave convencional de letras e números separados por traços OU um código hash em Base64 longo terminando em '=' (ex: 'EI5W2vwrhW3/mQxFRFTBWUwwWFyKhLQhMvVHPQXm9WpM='), geralmente localizado ao lado de 'Código de permissão de ativação de assinatura:' ou 'Activation Passcode'. Extraia este valor por completo.
7. Chave Master Unlock (masterUnlockKey): Se houver um campo para 'Master Unlock Key', extraia o valor por completo. Ele também pode ser um hash Base64 longo terminando em '=' (ex: 'EI5W2vwrhW3/mQxFRFTBWUwwWFyKhLQhMvVHPQXm9WpM=').

Certifique-se de extrair as informações exatamente como estão escritas, sem omitir caracteres especiais ou o sinal de igual '=' no final dos hashes.`,
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, promptPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subscriptionService: { 
                type: Type.STRING, 
                description: "Nome exato do Serviço de assinatura (ex: 'Ag Regional CenterPoint RTX Plus 1 Year (Brazil Only)')" 
              },
              brand: {
                type: Type.STRING,
                description: "Fabricante da tecnologia, obrigatoriamente 'Trimble' ou 'Topcon'."
              },
              startDate: { 
                type: Type.STRING, 
                description: "Data de início convertida para o formato YYYY-MM-DD (ex: '2026-07-18')" 
              },
              expirationDate: { 
                type: Type.STRING, 
                description: "Data de validade/vencimento convertida para o formato YYYY-MM-DD (ex: '2027-07-18')" 
              },
              serialNumber: { 
                type: Type.STRING, 
                description: "Número de série do aparelho (ex: '5816550640')" 
              },
              model: { 
                type: Type.STRING, 
                description: "Modelo do monitor/aparelho (ex: 'XCN-2050')" 
              },
              permissionCode: { 
                type: Type.STRING, 
                description: "Código de permissão de ativação ou código hash longo em Base64 terminando em '=' (ex: 'EI5W2vwrhW3/mQxFRFTBWUwwWFyKhLQhMvVHPQXm9WpM=')" 
              },
              masterUnlockKey: { 
                type: Type.STRING, 
                description: "Chave Master Unlock Key ou código hash longo em Base64 terminando em '=' (ex: 'EI5W2vwrhW3/mQxFRFTBWUwwWFyKhLQhMvVHPQXm9WpM=')" 
              }
            },
            required: ["subscriptionService", "brand", "startDate", "expirationDate", "serialNumber", "model", "permissionCode"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Resposta em branco gerada pelo modelo do Gemini.");
      }

      const parsedData = JSON.parse(text);
      return res.json(parsedData);
    } catch (error: any) {
      console.error("Erro na análise OCR/AI de licença:", error);
      return res.status(500).json({ error: error.message || "Falha na análise da imagem da licença pelo Gemini." });
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
