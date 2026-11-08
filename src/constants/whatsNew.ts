import {
  Sparkles,
  Truck,
  ClipboardList,
  MonitorSmartphone,
  ShieldCheck,
  FileText,
  History,
  LayoutList,
  SlidersHorizontal,
  CalendarCheck,
  FileDown,
  Building2,
  Info,
  Bell,
  Settings,
  Users,
  Wrench,
  Package,
  MapPin,
  Calendar,
  FileCheck,
  Download,
  Upload,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface WhatsNewItem {
  title: string;
  description: string;
  icon: string;
  accent: string;
}

export interface WhatsNewCategory {
  title: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW_STORAGE_KEY = 'agro_stock_gps_whats_new_seen';

export const WHATS_NEW_ICON_NAMES = [
  'Sparkles',
  'Truck',
  'ClipboardList',
  'MonitorSmartphone',
  'ShieldCheck',
  'FileText',
  'History',
  'LayoutList',
  'SlidersHorizontal',
  'CalendarCheck',
  'FileDown',
  'Building2',
  'Info',
  'Bell',
  'Settings',
  'Users',
  'Wrench',
  'Package',
  'MapPin',
  'Calendar',
  'FileCheck',
  'Download',
  'Upload',
  'Lock',
  'Eye',
  'EyeOff'
] as const;

export type WhatsNewIconName = (typeof WHATS_NEW_ICON_NAMES)[number];

export const WHATS_NEW_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Truck,
  ClipboardList,
  MonitorSmartphone,
  ShieldCheck,
  FileText,
  History,
  LayoutList,
  SlidersHorizontal,
  CalendarCheck,
  FileDown,
  FileCheck,
  Building2,
  Info,
  Bell,
  Settings,
  Users,
  Wrench,
  Package,
  MapPin,
  Calendar,
  Download,
  Upload,
  Lock,
  Eye,
  EyeOff
};

export const WHATS_NEW_ICON_OPTIONS: WhatsNewIconName[] = [
  'Sparkles',
  'Truck',
  'ClipboardList',
  'MonitorSmartphone',
  'ShieldCheck',
  'FileText',
  'History',
  'LayoutList',
  'SlidersHorizontal',
  'CalendarCheck',
  'FileDown',
  'FileCheck',
  'Building2',
  'Info',
  'Bell',
  'Settings',
  'Users',
  'Wrench',
  'Package',
  'MapPin',
  'Calendar',
  'Download',
  'Upload',
  'Lock',
  'Eye',
  'EyeOff'
];

export function getWhatsNewIcon(name: string): LucideIcon {
  return WHATS_NEW_ICONS[name] || Sparkles;
}

export const WHATS_NEW_ACCENTS: { label: string; value: string }[] = [
  { label: 'Verde', value: 'bg-emerald-50 text-emerald-700' },
  { label: 'Azul', value: 'bg-blue-50 text-blue-700' },
  { label: 'Âmbar', value: 'bg-amber-50 text-amber-700' },
  { label: 'Violeta', value: 'bg-violet-50 text-violet-700' },
  { label: 'Rosa', value: 'bg-rose-50 text-rose-700' },
  { label: 'Ciano', value: 'bg-cyan-50 text-cyan-700' },
  { label: 'Laranja', value: 'bg-orange-50 text-orange-700' },
  { label: 'Cinza', value: 'bg-slate-100 text-slate-700' }
];

export function getWhatsNewAccent(value: string | undefined): string {
  return value && value.trim() ? value : 'bg-emerald-50 text-emerald-700';
}

export const DEFAULT_WHATS_NEW: WhatsNewCategory[] = [
  {
    title: 'Gestão de Frota',
    items: [
      {
        title: 'Filtros por Marca, Modelo e Frente de Trabalho',
        description:
          'Além do filtro de Tipo, agora é possível filtrar por Marca, Modelo e Frente de Trabalho. Há botão "Limpar filtros" e tags coloridas no cabeçalho indicando os filtros ativos.',
        icon: 'SlidersHorizontal',
        accent: 'bg-blue-50 text-blue-700'
      },
      {
        title: 'Nova tabela no desktop',
        description:
          'Na tela de Frota, a visualização em cards foi substituída por uma tabela com Prefixo, Tipo, Marca, Modelo, Frota/Frente, Histórico e Detalhes. No celular, os cards continuam sendo exibidos.',
        icon: 'LayoutList',
        accent: 'bg-blue-50 text-blue-700'
      }
    ]
  },
  {
    title: 'Recolhimento semanal (Kanban)',
    items: [
      {
        title: 'Kanban operacional de recolhimento',
        description:
          'Toque em uma máquina pendente para marcar a coleta como concluída. O quadro alterna automaticamente entre os status Pendente, Em andamento e Concluída.',
        icon: 'Truck',
        accent: 'bg-emerald-50 text-emerald-700'
      },
      {
        title: 'Histórico por semana',
        description:
          'Selecione a semana desejada no cabeçalho para consultar semanas anteriores, ver quem coletou, quando coletou e quais máquinas não foram recolhidas.',
        icon: 'CalendarCheck',
        accent: 'bg-emerald-50 text-emerald-700'
      },
      {
        title: 'Histórico completo da máquina',
        description:
          'As coletas semanais e as Ordens de Serviço agora aparecem em uma linha do tempo única. É possível filtrar para ver Tudo, apenas O.S. ou apenas Coletas.',
        icon: 'History',
        accent: 'bg-emerald-50 text-emerald-700'
      },
      {
        title: 'Ajuda integrada',
        description:
          'Guia visual com 4 etapas explicando como usar o Kanban, concluir coletas individualmente e consultar o histórico.',
        icon: 'Info',
        accent: 'bg-emerald-50 text-emerald-700'
      }
    ]
  },
  {
    title: 'Ordens de Serviço',
    items: [
      {
        title: 'Baixar O.S. em PDF',
        description:
          'Gere o PDF da Ordem de Serviço para impressão ou envio. Opções: "O.S." (enxuta, ideal para assinatura em campo) ou "O.S. com Histórico" (com todos os eventos registrados).',
        icon: 'FileDown',
        accent: 'bg-amber-50 text-amber-700'
      },
      {
        title: 'Cabeçalho com dados da empresa',
        description:
          'O PDF exibe o logo, razão social, CNPJ e contatos cadastrados em Configurações → Empresa, além do campo para assinatura do Responsável Técnico.',
        icon: 'Building2',
        accent: 'bg-amber-50 text-amber-700'
      },
      {
        title: 'Fluxo completo de O.S.',
        description:
          'Agora as O.S. seguem o ciclo Aberta → Agendada → Em atendimento → Concluída, com opções de reagendamento, retorno e cancelamento com confirmação. O equipamento só é atualizado no momento da conclusão.',
        icon: 'ClipboardList',
        accent: 'bg-amber-50 text-amber-700'
      },
      {
        title: 'Proteção da auditoria',
        description:
          'O.S. iniciadas, concluídas ou canceladas não podem ser editadas nem excluídas. Equipamentos com O.S. ativa não aceitam uma nova ordem até que a atual seja finalizada.',
        icon: 'ShieldCheck',
        accent: 'bg-amber-50 text-amber-700'
      },
      {
        title: 'Detalhes mais organizados',
        description:
          'O histórico de eventos da O.S. fica recolhido por padrão. Toque em "Histórico da O.S." para expandir e visualizar todos os registros.',
        icon: 'FileText',
        accent: 'bg-amber-50 text-amber-700'
      }
    ]
  },
  {
    title: 'Interface e Experiência',
    items: [
      {
        title: 'Instalação do App corrigida',
        description:
          'O botão "Instalar App" passou a funcionar corretamente. Quando o navegador não oferece o prompt nativo, é exibida uma dica de instalação manual. O botão some automaticamente quando o app já está instalado.',
        icon: 'MonitorSmartphone',
        accent: 'bg-violet-50 text-violet-700'
      },
      {
        title: 'Modais reformulados',
        description:
          'Os modais agora abrem em folha inferior no celular e em janela centralizada no desktop. É possível fechar pelo X, pelo fundo escurecido ou pela tecla Esc. O scroll da página fica bloqueado enquanto o modal estiver aberto.',
        icon: 'Sparkles',
        accent: 'bg-violet-50 text-violet-700'
      }
    ]
  },
  {
    title: 'Segurança',
    items: [
      {
        title: 'Mais proteção dos seus dados',
        description:
          'Licenças passaram a ser mascaradas na tela. Dados sensíveis são criptografados com AES. O cache offline foi reforçado (IndexedDB) e, ao sair do sistema, os dados armazenados no navegador são removidos completamente.',
        icon: 'ShieldCheck',
        accent: 'bg-rose-50 text-rose-700'
      }
    ]
  }
];
