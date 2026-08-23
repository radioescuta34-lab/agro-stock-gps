import { jsPDF } from 'jspdf';
import { CompanyProfile, MovementLog, MovementStatus } from '../types';

const STATUS_LABELS: Record<MovementStatus, string> = {
  'Aberta': 'Aberta',
  'Agendada': 'Agendada',
  'Em Atendimento': 'Em Atendimento',
  'Concluída': 'Concluída',
  'Cancelada': 'Cancelada'
};

const formatDate = (d: any) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

const formatDateTime = (d: any) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
};

export function generateOsPdf(movement: MovementLog, companyProfile?: CompanyProfile | null, includeHistory: boolean = true) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const margin = 20;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = 268;
  let y = 18;

  let sectionIndex = 0;
  const numberedTitle = (title: string) => {
    sectionIndex += 1;
    sectionTitle(`${sectionIndex}. ${title}`);
  };

  const drawFrame = () => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(10, 10, pageWidth - 20, 277);
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      drawFrame();
      y = 20;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, y);
    y += 3;
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + 22, y);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin + 24, y, pageWidth - margin, y);
    y += 7;
  };

  const fieldRow = (label: string, value: string, half: boolean = false, secondLabel?: string, secondValue?: string) => {
    const colW = half ? contentWidth / 2 - 4 : contentWidth;
    ensureSpace(12);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), margin, y);
    if (half && secondLabel !== undefined) {
      doc.text(secondLabel.toUpperCase(), margin + contentWidth / 2 + 4, y);
    }
    y += 4.5;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const split = doc.splitTextToSize(value || '—', colW);
    doc.text(split, margin, y);
    if (half && secondValue !== undefined) {
      const splitSecond = doc.splitTextToSize(secondValue || '—', colW);
      doc.text(splitSecond, margin + contentWidth / 2 + 4, y);
    }
    y += Math.max(split.length, secondValue ? doc.splitTextToSize(secondValue || '—', colW).length : 1) * 4.8 + 3;
  };

  drawFrame();

  // ─── Header: empresa geradora ───────────────────────────────
  const headerTop = y;
  const infoX = margin + (companyProfile?.logoUrl ? 30 : 0);

  if (companyProfile?.logoUrl) {
    try {
      let format: 'PNG' | 'JPEG' | 'WEBP' = 'PNG';
      if (companyProfile.logoUrl.includes('image/jpeg') || companyProfile.logoUrl.includes('image/jpg')) {
        format = 'JPEG';
      } else if (companyProfile.logoUrl.includes('image/webp')) {
        format = 'WEBP';
      }
      doc.addImage(companyProfile.logoUrl, format, margin, headerTop, 26, 16);
    } catch (e) {
      console.error('Erro ao desenhar logotipo da empresa no PDF: ', e);
    }
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(companyProfile?.tradingName || companyProfile?.name || 'Empresa', infoX, headerTop + 4);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const companyLines = [
    companyProfile?.name && companyProfile.name !== companyProfile.tradingName ? companyProfile.name : null,
    companyProfile?.cnpj ? `CNPJ: ${companyProfile.cnpj}` : null,
    [companyProfile?.phone, companyProfile?.email].filter(Boolean).join(' · ') || null,
    companyProfile?.address || null
  ].filter(Boolean) as string[];
  doc.text(doc.splitTextToSize(companyLines.join('\n'), 78), infoX, headerTop + 9);

  // Box da O.S. à direita
  const boxW = 55;
  const boxH = companyLines.length > 3 ? 20 : 16;
  const boxX = pageWidth - margin - boxW;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(boxX, headerTop - 2, boxW, boxH, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('ORDEM DE SERVIÇO', boxX + boxW / 2, headerTop + 3, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(5, 150, 105);
  doc.text(`Nº ${String(movement.osNumber || 0).padStart(4, '0')}`, boxX + boxW / 2, headerTop + 10.5, { align: 'center' });

  y = headerTop + boxH + 12;

  // Linha separadora
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ─── 1. Dados da O.S. ──────────────────────────────────────
  numberedTitle('DADOS DA ORDEM DE SERVIÇO');
  fieldRow(
    'Tipo de serviço',
    movement.action,
    true,
    'Situação atual',
    STATUS_LABELS[movement.status || 'Aberta']
  );
  fieldRow(
    'Data de abertura',
    formatDateTime(movement.date),
    true,
    movement.status === 'Cancelada'
      ? 'Cancelada em'
      : movement.status === 'Concluída'
        ? 'Concluída em'
        : 'Última atualização',
    formatDateTime(
      movement.status === 'Cancelada'
        ? movement.cancelledAt
        : movement.status === 'Concluída'
          ? movement.completedAt
          : movement.updatedAt || movement.createdAt
    )
  );

  // ─── 2. Equipamento ─────────────────────────────────────────
  numberedTitle('EQUIPAMENTO');
  fieldRow('Componente', movement.componentName, true, 'Número de série', movement.componentSerial);
  fieldRow(
    'Localização',
    movement.machinePrefix === 'Almoxarifado' ? 'Almoxarifado' : `Veículo ${movement.machinePrefix}`
  );

  // ─── 3. Responsável ─────────────────────────────────────────
  numberedTitle('RESPONSÁVEL');
  fieldRow('Técnico designado', movement.technicianName);

  // ─── 4. Observações técnicas ────────────────────────────────
  if (movement.notes) {
    numberedTitle('OBSERVAÇÕES TÉCNICAS');
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const splitNotes = doc.splitTextToSize(movement.notes, contentWidth);
    ensureSpace(splitNotes.length * 4.8 + 4);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 4.8 + 6;
  }

  // ─── 5. Histórico da O.S. (opcional) ────────────────────────
  if (includeHistory) {
    numberedTitle('HISTÓRICO DA O.S.');

    if ((movement.history || []).length > 0) {
      (movement.history || []).forEach((h, i) => {
        const detailSplit = h.detail ? doc.splitTextToSize(h.detail, contentWidth - 6) : [];
        const blockH = 8 + detailSplit.length * 4.2;
        ensureSpace(blockH);

        // marcador
        doc.setFillColor(16, 185, 129);
        doc.circle(margin + 1.5, y - 1, 1.2, 'F');
        if (i < (movement.history?.length || 0) - 1) {
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.line(margin + 1.5, y + 1, margin + 1.5, y + blockH - 4);
        }

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(h.action, margin + 6, y);
        y += 4.5;

        if (h.detail) {
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          doc.text(detailSplit, margin + 6, y);
          y += detailSplit.length * 4.2;
        }

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`${formatDateTime(h.timestamp)} · ${h.actorName}`, margin + 6, y);
        y += 6;
      });
    } else {
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Sem histórico registrado.', margin, y);
      y += 8;
    }
  }

  // ─── Assinatura ─────────────────────────────────────────────
  ensureSpace(34);
  y = Math.max(y + 14, 244);

  doc.setLineWidth(0.3);
  doc.setDrawColor(148, 163, 184);
  doc.line(pageWidth / 2 - 32.5, y, pageWidth / 2 + 32.5, y);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(movement.technicianName, pageWidth / 2, y + 4, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Responsável Técnico', pageWidth / 2, y + 7.5, { align: 'center' });

  doc.setFont('italic', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Documento emitido eletronicamente pelo Agro Stock GPS em ${formatDateTime(new Date())}.`,
    pageWidth / 2,
    281,
    { align: 'center' }
  );

  doc.save(`OS_${String(movement.osNumber || 0).padStart(4, '0')}.pdf`);
}
