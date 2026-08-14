import nodemailer from "nodemailer";

// Shared SMTP helpers + HTML email builders used by the alert POST endpoints
// and by the /api/cron/alerts automation route.

export interface SmtpConfig {
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  fromEmail?: string;
  fromName?: string;
  isConfigured: boolean;
}

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";
  return {
    host,
    port,
    user,
    pass,
    fromEmail,
    fromName,
    isConfigured: !!(host && user && pass)
  };
}

export async function sendAlertEmail(
  to: string,
  subject: string,
  html: string,
  label: string
): Promise<{ sent: boolean; simulated: boolean }> {
  const smtp = getSmtpConfig();
  if (smtp.isConfigured) {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: {
        user: smtp.user,
        pass: smtp.pass
      }
    });
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject,
      html
    });
    return { sent: true, simulated: false };
  }
  console.log(`✉️  [SIMULAÇÃO DE EMAIL] ${label}`);
  console.log(`Para: ${to}`);
  console.log(`Assunto: ${subject}`);
  console.log(`[Aviso do Servidor] Configurações de SMTP não preenchidas — configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL.`);
  return { sent: false, simulated: true };
}

function getExpiringLicenses(licenses: any[], days: number): any[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return licenses.filter((lic: any) => {
    if (!lic.expirationDate) return false;
    const expDate = new Date(lic.expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= days;
  });
}

export function buildLicenseAlertEmail(licenses: any[], days: any, mode: 'upcoming' | 'expired' = 'upcoming'): { title: string; html: string } {
  const isExpired = mode === 'expired';
  const title = isExpired
    ? `⛔ Alerta AgroStockGPS: ${licenses.length} Licença(s) EXPIRADA(S)!`
    : `⚠️ Alerta AgroStockGPS: ${licenses.length} Licença(s) vencendo em até ${days} dias!`;

  const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <div style="background: ${isExpired ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}; padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Agro Stock GPS</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Gestão Automática de Ativos & Licenças</p>
          </div>
          
          <!-- Body Content -->
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">Olá,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              ${isExpired
                ? `Identificamos que as seguintes licenças de tecnologia e monitoramento agrícola <strong>já expiraram</strong> e precisam de renovação imediata.`
                : `Identificamos que as seguintes licenças de tecnologia e monitoramento agrícola estão com data de expiração programada para os próximos <strong>${days} dias</strong>.`}
            </p>
            <p style="font-size: 13px; color: ${isExpired ? '#ef4444' : '#ef4444'}; font-weight: 600; margin-bottom: 20px; display: flex; align-items: center;">
              ${isExpired ? '⛔ Licenças vencidas podem interromper o funcionamento dos equipamentos. Renove com urgência.' : '⚠️ É recomendada a renovação com os representantes para evitar prejuízos e paradas indesejadas nas operações agrícolas de campo.'}
            </p>

            <!-- License Cards Table -->
            <div style="overflow-x: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px; font-weight: 600; color: #475569;">Licença / Tecnologia</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569;">Número de Série (S/N)</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569;">${isExpired ? 'Vencida em' : 'Vencimento'}</th>
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
  return { title, html };
}

function getIsoWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekFormatted = weekNo < 10 ? `0${weekNo}` : `${weekNo}`;
  return `${d.getUTCFullYear()}-W${weekFormatted}`;
}

function weekdayNumber(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function buildCampoAlertEmail(input: {
  weekId: string;
  weekLabel?: string;
  pendingMachinesCount?: number;
  frentesPendente?: any[];
  frentesEmAndamento?: any[];
}): { title: string; html: string } {
  const weekLabelSafe = input.weekLabel || input.weekId;
  const pendingTotal = typeof input.pendingMachinesCount === 'number' ? input.pendingMachinesCount : 0;
  const frentesPend = Array.isArray(input.frentesPendente) ? input.frentesPendente : [];
  const frentesAndamento = Array.isArray(input.frentesEmAndamento) ? input.frentesEmAndamento : [];

  const buildFrenteRows = () => {
    let rows = '';
    if (frentesPend.length === 0 && frentesAndamento.length === 0) {
      rows += `
            <tr>
              <td colspan="3" style="padding: 12px 10px; color: #10b981; font-weight: 600; text-align: center; border: 1px solid #edf2f7;">
                🎉 Todas as frentes foram 100% concluídas nesta semana!
              </td>
            </tr>
          `;
      return rows;
    }
    frentesPend.forEach((f: any) => {
      const machines = Array.isArray(f.machines) ? f.machines.join(', ') : '-';
      rows += `
            <tr style="border-bottom: 1px solid #edf2f7;">
              <td style="padding: 12px 10px; border: 1px solid #edf2f7; font-weight: 600; color: #1e293b;">${f.frente || 'Sem Frente Atribuída'}</td>
              <td style="padding: 12px 10px; color: #ef4444; font-weight: 700; border: 1px solid #edf2f7;">100% pendente</td>
              <td style="padding: 12px 10px; font-size: 11px; color: #475569; line-height: 1.4; border: 1px solid #edf2f7;">${machines}</td>
            </tr>
          `;
    });
    frentesAndamento.forEach((f: any) => {
      const machines = Array.isArray(f.machines) ? f.machines.join(', ') : '-';
      const pendCount = typeof f.pendingCount === 'number' ? f.pendingCount : 0;
      const totalCount = typeof f.totalCount === 'number' ? f.totalCount : 0;
      rows += `
            <tr style="border-bottom: 1px solid #edf2f7; background-color: #fafafa;">
              <td style="padding: 12px 10px; border: 1px solid #edf2f7; font-weight: 600; color: #1e293b;">${f.frente || 'Sem Frente Atribuída'}</td>
              <td style="padding: 12px 10px; color: #b45309; font-weight: 700; border: 1px solid #edf2f7;">${pendCount}/${totalCount} pendente(s)</td>
              <td style="padding: 12px 10px; font-size: 11px; color: #475569; line-height: 1.4; border: 1px solid #edf2f7;">${machines}</td>
            </tr>
          `;
    });
    return rows;
  };

  const title = `⚠️ Agro Stock GPS: ${pendingTotal} Máquina(s) com Recolhimento de Dados Pendente — ${weekLabelSafe}`;

  const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #047857 0%, #065f46 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Agro Stock GPS</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Recolhimento de Dados de Campo</p>
          </div>

          <!-- Body Content -->
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">Olá,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              Segue o relatório semanal de recolhimento de telemetria dos monitores de piloto automático para a <strong>${weekLabelSafe}</strong> (${input.weekId}).
            </p>
            <p style="font-size: 13px; color: #b45309; font-weight: 600; margin-bottom: 20px;">
              ⚠️ Existem <strong>${pendingTotal}</strong> máquina(s) com dados de campo ainda <strong>pendentes</strong> de recolhimento nesta semana.
            </p>

            <!-- Table of Fronts -->
            <div style="overflow-x: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Frente de Trabalho</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Situação</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Máquinas Pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  ${buildFrenteRows()}
                </tbody>
              </table>
            </div>

            <!-- Action Advice -->
            <div style="background-color: #fffbeb; border: 1px dashed #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #b45309; font-weight: 700;">Como proceder?</h4>
              <p style="margin: 0; font-size: 12px; color: #b45309; line-height: 1.5;">
                Acione os técnicos de campo responsáveis por cada frente para concluir o recolhimento dos dados dos monitores de piloto automático antes do encerramento da semana.
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
  return { title, html };
}

export function buildLoansAlertEmail(loans: any[]): { title: string; html: string } {
  const title = `⚠️ Alerta AgroStockGPS: ${loans.length} Empréstimo(s) Vencido(s) ou Pendente(s)!`;

  const html = `
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
  return { title, html };
}

export function buildMaintenanceAlertEmail(maintenances: any[], kind: 'overdue' | 'completed'): { title: string; html: string } {
  const isOverdue = kind === 'overdue';
  const title = isOverdue
    ? `🔧 Alerta AgroStockGPS: ${maintenances.length} Manutenção(ões) em andamento há mais de ${maintenances[0]?.overdueDays ?? ''} dias!`
    : `✅ AgroStockGPS: ${maintenances.length} Manutenção(ões) concluída(s)!`;

  const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background: ${isOverdue ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}; padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Agro Stock GPS</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Gestão de Manutenções</p>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">Olá,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              ${isOverdue
                ? `As seguintes manutenções continuam <strong>em andamento</strong> além do prazo esperado:`
                : `As seguintes manutenções foram <strong>concluídas</strong> recentemente:`}
            </p>

            <div style="overflow-x: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Componente</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">S/N</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">${isOverdue ? 'Enviado em' : 'Concluído em'}</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Prestador</th>
                  </tr>
                </thead>
                <tbody>
                  ${maintenances.map((m: any, idx: number) => {
                    const dateRaw = isOverdue ? m.sentDate : (m.returnDate || m.updatedAt);
                    const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString('pt-BR') : '-';
                    return `
                      <tr style="border-bottom: 1px solid #edf2f7; ${idx % 2 === 1 ? 'background-color: #fafafa;' : ''}">
                        <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">${m.componentName}</td>
                        <td style="padding: 12px 10px; font-family: monospace; color: #0f172a;">${m.componentSerial}</td>
                        <td style="padding: 12px 10px; font-weight: 600; color: ${isOverdue ? '#ea580c' : '#166534'};">${dateStr}</td>
                        <td style="padding: 12px 10px; color: #475569;">${m.providerName}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 0;">
              Este é um e-mail automático enviado pelo sistema Agro Stock GPS. Não responda a esta mensagem.
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            <strong>Agro Stock GPS</strong> - Gestão Eficiente de Tecnologia de Precisão
          </div>
        </div>
      `;
  return { title, html };
}

export function buildIdleComponentsAlertEmail(components: any[]): { title: string; html: string } {
  const title = `📦 Alerta AgroStockGPS: ${components.length} Componente(s) ocioso(s) há mais de ${components[0]?.idleDays ?? ''} dias!`;

  const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Agro Stock GPS</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Controle de Estoque de Componentes</p>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">Olá,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              Os seguintes componentes estão <strong>disponíveis em estoque</strong> sem movimentação recente, podendo indicar estoque parado ou itens ociosos:
            </p>

            <div style="overflow-x: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Componente</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">S/N</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Tipo</th>
                    <th style="padding: 10px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0;">Último movimento</th>
                  </tr>
                </thead>
                <tbody>
                  ${components.map((c: any, idx: number) => {
                    const lastMove = c.lastMovementDate ? new Date(c.lastMovementDate).toLocaleDateString('pt-BR') : 'Nunca';
                    return `
                      <tr style="border-bottom: 1px solid #edf2f7; ${idx % 2 === 1 ? 'background-color: #fafafa;' : ''}">
                        <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">${c.name}</td>
                        <td style="padding: 12px 10px; font-family: monospace; color: #0f172a;">${c.serialNumber}</td>
                        <td style="padding: 12px 10px; color: #475569;">${c.type} · ${c.brand}</td>
                        <td style="padding: 12px 10px; font-weight: 600; color: #4f46e5;">${lastMove}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 0;">
              Este é um e-mail automático enviado pelo sistema Agro Stock GPS. Não responda a esta mensagem.
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            <strong>Agro Stock GPS</strong> - Gestão Eficiente de Tecnologia de Precisão
          </div>
        </div>
      `;
  return { title, html };
}

// Resolves recipient list from settings: prefers alertEmails[], falls back to legacy alertEmail (comma/semicolon)
export function resolveSettingsEmails(settings: any): string[] {
  if (Array.isArray(settings?.alertEmails)) {
    const list: string[] = (settings.alertEmails as unknown[]).filter(
      (e): e is string => typeof e === 'string' && e.trim().length > 0
    );
    if (list.length > 0) return [...new Set(list)];
  }
  if (typeof settings?.alertEmail === 'string' && settings.alertEmail.trim()) {
    const list: string[] = settings.alertEmail
      .split(/[,;]/)
      .map((e: string) => e.trim())
      .filter(Boolean);
    return [...new Set(list)];
  }
  return [];
}

// Maintenances stuck in 'Em Manutenção' for more than overdueDays
export function getOverdueMaintenances(maintenances: any[], overdueDays: number, now: Date = new Date()): any[] {
  if (!overdueDays || overdueDays <= 0) return [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - overdueDays);
  return (maintenances || []).filter((m: any) => {
    if (!m || m.status !== 'Em Manutenção' || !m.sentDate) return false;
    return new Date(m.sentDate).getTime() <= cutoff.getTime();
  });
}

// Recently completed maintenances (status 'Concluído') whose id is not in notifiedIds
export function getCompletedMaintenances(maintenances: any[], notifiedIds: string[] = [], now: Date = new Date()): any[] {
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);
  return (maintenances || []).filter((m: any) => {
    if (!m || m.status !== 'Concluído') return false;
    if (notifiedIds.includes(m.id)) return false;
    const completionDate = m.returnDate || m.updatedAt;
    if (!completionDate) return true;
    return new Date(completionDate).getTime() >= cutoff.getTime();
  });
}

// Components 'Disponível' without any movement in the last idleDays (no movement = idle)
export function getIdleComponents(components: any[], movements: any[], idleDays: number, now: Date = new Date()): any[] {
  if (!idleDays || idleDays <= 0) return [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - idleDays);

  const lastMovementByComponent: Record<string, string> = {};
  (movements || []).forEach((mv: any) => {
    const ts = mv.createdAt?.toDate ? mv.createdAt.toDate().getTime() : new Date(mv.createdAt || mv.date).getTime();
    if (isNaN(ts)) return;
    const cid = mv.componentId;
    if (!lastMovementByComponent[cid] || ts > new Date(lastMovementByComponent[cid]).getTime()) {
      lastMovementByComponent[cid] = new Date(ts).toISOString();
    }
  });

  return (components || []).filter((c: any) => {
    if (!c || c.status !== 'Disponível') return false;
    const last = lastMovementByComponent[c.id];
    if (!last) return true; // never moved -> idle
    return new Date(last).getTime() <= cutoff.getTime();
  });
}

// Weekday key (segunda..domingo) for a date at server local time.
export function getWeekdayKey(date: Date = new Date()): string {
  switch (date.getDay()) {
    case 1: return 'segunda';
    case 2: return 'terca';
    case 3: return 'quarta';
    case 4: return 'quinta';
    case 5: return 'sexta';
    case 6: return 'sabado';
    default: return 'domingo';
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function getTimeStr(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isCampoDue(
  campoSettings: any,
  now: Date = new Date()
): boolean {
  if (!campoSettings?.enabled) return false;
  if (resolveSettingsEmails(campoSettings).length === 0) return false;
  if (getWeekdayKey(now) !== campoSettings.scheduleDay) return false;
  if (getTimeStr(now) < (campoSettings.scheduleTime || '08:00')) return false;
  if (campoSettings.lastSentWeek === getIsoWeekId(now)) return false;
  return true;
}

export function isLoansDue(enabled: boolean, lastSentDate: string | undefined, overdueCount: number, now: Date = new Date()): boolean {
  if (!enabled) return false;
  if (overdueCount <= 0) return false;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return lastSentDate !== today;
}

export function todayStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export {
  getExpiringLicenses,
  getIsoWeekId,
  weekdayNumber
};