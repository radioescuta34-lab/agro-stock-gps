import React, { useState, useRef } from 'react';
import { UserProfile } from '../types';
import {
  LifeBuoy,
  Paperclip,
  X,
  CheckCircle2,
  Loader2,
  ExternalLink,
  FileText,
  AlertTriangle
} from 'lucide-react';

interface SupportAttachment {
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
  previewUrl: string | null;
  sizeBytes: number;
}

interface TicketSuccess {
  ticketId: string;
  cardUrl: string;
  attachmentsFailed: string[];
}

interface SupportTabProps {
  user: UserProfile;
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const COMPRESS_THRESHOLD = 800 * 1024;
const MAX_DIMENSION = 1600;
const MAX_DESC_LENGTH = 5000;

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa', dot: 'bg-emerald-500' },
  { value: 'media', label: 'Média', dot: 'bg-amber-500' },
  { value: 'alta', label: 'Alta', dot: 'bg-rose-500' }
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Erro ao ler o arquivo ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem neste navegador.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
    img.src = dataUrl;
  });
}

export default function SupportTab({ user }: SupportTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState('');
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media');
  const [descricao, setDescricao] = useState('');
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TicketSuccess | null>(null);

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    setError(null);
    if (files.length === 0) return;

    const remaining = MAX_FILES - attachments.length;
    if (files.length > remaining) {
      setError(`Você pode anexar no máximo ${MAX_FILES} arquivos por ticket.`);
    }
    const selected = files.slice(0, Math.max(remaining, 0));
    if (selected.length === 0) return;

    const processed: SupportAttachment[] = [];
    for (const file of selected) {
      try {
        if (file.type === 'application/pdf') {
          if (file.size > MAX_FILE_BYTES) {
            setError(`O arquivo ${file.name} excede o limite de 6MB.`);
            continue;
          }
          const dataUrl = await readAsDataUrl(file);
          processed.push({
            id: generateAttachmentId(),
            filename: file.name,
            mimeType: file.type,
            base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            previewUrl: null,
            sizeBytes: file.size
          });
        } else if (file.type.startsWith('image/')) {
          let dataUrl = await readAsDataUrl(file);
          let mimeType = file.type;
          let filename = file.name;
          let sizeBytes = file.size;
          if (mimeType !== 'image/gif' && sizeBytes > COMPRESS_THRESHOLD) {
            dataUrl = await compressImage(dataUrl);
            mimeType = 'image/jpeg';
            sizeBytes = Math.round(dataUrl.length * 0.75);
            if (!/\.jpe?g$/i.test(filename)) {
              filename = `${filename.replace(/\.[^.]+$/, '')}.jpg`;
            }
          }
          if (sizeBytes > MAX_FILE_BYTES) {
            setError(`O arquivo ${file.name} excede o limite de 6MB.`);
            continue;
          }
          processed.push({
            id: generateAttachmentId(),
            filename,
            mimeType,
            base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            previewUrl: dataUrl,
            sizeBytes
          });
        } else {
          setError(`Formato não suportado (${file.name}). Use imagens PNG, JPG, WEBP, GIF ou PDF.`);
        }
      } catch (err: any) {
        setError(err?.message || `Erro ao processar ${file.name}.`);
      }
    }

    if (processed.length > 0) {
      setAttachments(prev => [...prev, ...processed].slice(0, MAX_FILES));
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!titulo.trim()) {
      setError('Informe um título para o ticket.');
      return;
    }
    if (!descricao.trim()) {
      setError('Descreva o problema ou a solicitação.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          prioridade,
          autorNome: user.name,
          autorEmail: user.email,
          anexos: attachments.map(a => ({
            filename: a.filename,
            mimeType: a.mimeType,
            base64: a.base64
          }))
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Erro ao criar o ticket. Tente novamente.');
      }
      setSuccess({
        ticketId: data.ticketId,
        cardUrl: data.cardUrl || '',
        attachmentsFailed: Array.isArray(data.attachmentsFailed) ? data.attachmentsFailed : []
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar o ticket. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewTicket = () => {
    setTitulo('');
    setDescricao('');
    setPrioridade('media');
    setAttachments([]);
    setError(null);
    setSuccess(null);
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">Ticket criado com sucesso!</h1>
          <p className="text-xs text-slate-500 mt-1">Guarde o código abaixo para acompanhar sua solicitação:</p>

          <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 inline-block">
            <span className="text-xl font-extrabold tracking-wider text-emerald-600 font-mono select-all notranslate">
              {success.ticketId}
            </span>
          </div>

          {success.attachmentsFailed.length > 0 && (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-left">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700">
                Não foi possível anexar: {success.attachmentsFailed.join(', ')}. A equipe de suporte pode solicitar os arquivos novamente.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {success.cardUrl && (
              <a
                href={success.cardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Acompanhar no Trello
              </a>
            )}
            <button
              onClick={handleNewTicket}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Abrir outro ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Suporte</h1>
          <p className="text-xs text-slate-500 mt-0.5">Abra um ticket e nossa equipe entrará em contato</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="support-title" className="block text-xs font-bold text-slate-700 mb-1.5">
            Título <span className="text-rose-500">*</span>
          </label>
          <input
            id="support-title"
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            maxLength={150}
            placeholder="Resumo do problema ou solicitação"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Prioridade</label>
          <div className="grid grid-cols-3 gap-2">
            {PRIORIDADES.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPrioridade(p.value as 'baixa' | 'media' | 'alta')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                  prioridade === p.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/30'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${p.dot}`} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="support-description" className="block text-xs font-bold text-slate-700">
              Descrição <span className="text-rose-500">*</span>
            </label>
            <span className={`text-[10px] font-semibold ${descricao.length > MAX_DESC_LENGTH - 200 ? 'text-amber-600' : 'text-slate-400'}`}>
              {descricao.length}/{MAX_DESC_LENGTH}
            </span>
          </div>
          <textarea
            id="support-description"
            value={descricao}
            onChange={e => setDescricao(e.target.value.slice(0, MAX_DESC_LENGTH))}
            rows={6}
            placeholder="Descreva com detalhes o que aconteceu, como reproduzir o problema e qual o resultado esperado..."
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all resize-y placeholder:text-slate-400"
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Anexos <span className="font-normal text-slate-400">(imagens ou PDF • máx. {MAX_FILES} arquivos de 6MB)</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={handleFilesChange}
            className="hidden"
          />

          {attachments.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {attachments.map(att => (
                <div key={att.id} className="relative group border border-slate-200 rounded-xl overflow-hidden bg-slate-50 aspect-square">
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                      <FileText className="h-7 w-7 text-rose-500" />
                      <span className="text-[9px] font-bold text-slate-500 uppercase">PDF</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    title={`Remover ${att.filename}`}
                    className="absolute top-1 right-1 p-1 bg-slate-900/70 text-white rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1">
                    <p className="text-[9px] font-semibold text-white truncate">{att.filename}</p>
                    <p className="text-[8px] text-slate-300">{formatFileSize(att.sizeBytes)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {attachments.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <Paperclip className="h-4 w-4" />
              Adicionar imagens ou PDFs
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !titulo.trim() || !descricao.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm font-extrabold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando ticket...
            </>
          ) : (
            <>
              <LifeBuoy className="h-4 w-4" />
              Abrir Ticket de Suporte
            </>
          )}
        </button>

        <p className="text-[10px] text-slate-400 text-center">
          Ao abrir o ticket você receberá um código de acompanhamento. O tempo de resposta varia conforme a prioridade.
        </p>
      </div>
    </div>
  );
}
