# Memória de trabalho — Novidades (What's New)

> Registro das últimas implementações para retomar o trabalho depois.
> Última atualização: 2026-10-21

## Objetivo

Pop-up de "Novidades" exibido ao iniciar o sistema (ou ao recarregar), listando as
melhorias do app, com checkbox **"Não exibir mais"**. Volta a aparecer somente quando
houver **nova publicação** de novidades.

## Decisões tomadas

- **Controle é pelo lado do Admin, não por edição de arquivo + deploy.**
- **Tela Admin** no próprio app para editar e publicar novidades.
- **ID numérico autoincremento** (`lastPublishedId`) guardado no Firestore via **transação**
  (evita condição de corrida).
- **Persistência global** no Firestore: `settings/whatsNew`.
- **Persistência por usuário/dispositivo** no `localStorage`: chave
  `agro_stock_gps_whats_new_seen` (guarda o ID publicado que o usuário já viu).
- **Detecção** = compara `lastPublishedId` (Firestore) com o ID visto (localStorage).
  Diferente ou ausente → exibe o pop-up.
- **Seleção manual**: no Admin é possível marcar/desmarcar itens e categorias para
  publicar. Itens não marcados **não são publicados nem apagados** — ficam guardados no
  último conteúdo carregado do Firestore, disponíveis para uma próxima publicação.

## Regra de exibição do pop-up

| Situação | Exibe? |
|---|---|
| Firestore sem `settings/whatsNew` (nada publicado) | Não |
| localStorage sem a chave (nunca viu) | Sim |
| `seenId !== lastPublishedId` | Sim |
| `seenId === lastPublishedId` | Não |

Fluxo: o app lê o Firestore no startup, e se houver novidade exibe o modal após **4s**
(padrão de delay já usado nos alertas automáticos do `App.tsx`).

## Arquivos criados

- `src/constants/whatsNew.ts`
  - Tipos `WhatsNewItem` (title, description, icon, accent) e `WhatsNewCategory` (title, items).
  - `WHATS_NEW_STORAGE_KEY = 'agro_stock_gps_whats_new_seen'`.
  - `DEFAULT_WHATS_NEW`: conteúdo inicial/modelo (baseado nos release notes v2.1.0–v2.3.0 e O.S. PDF).
  - Mapas/opções de ícones (`WHATS_NEW_ICONS`, `WHATS_NEW_ICON_OPTIONS`, `getWhatsNewIcon`) e
    accents (`WHATS_NEW_ACCENTS`, `getWhatsNewAccent`).
- `src/utils/whatsNewFirestore.ts`
  - `getPublishedWhatsNew()` → lê `settings/whatsNew` (retorna `null` se não publicado ou id <= 0).
  - `publishWhatsNew({ content, publishedBy })` → `runTransaction`, incrementa `lastPublishedId` em +1,
    grava `content`, `publishedAt`/`updatedAt` (serverTimestamp) e `publishedBy`.
- `src/components/WhatsNewModal.tsx`
  - Modal baseado no padrão de `HelpGuideModal.tsx` (portal, bloqueio de scroll, Esc).
  - Lista todas as categorias/itens; checkbox "Não exibir mais estas novidades".
  - Ao fechar com o checkbox marcado, salva o `publishedId` no localStorage.
- `src/components/WhatsNewAdmin.tsx`
  - Tela de gerenciamento (apenas ADMINISTRADOR).
  - Editor de categorias/itens (adicionar/remover/reordenar, título, descrição, ícone, cor).
  - **Seleção manual**: checkbox por item e por categoria; contador "X selecionada(s) para publicar".
  - Botões **Pré-visualizar** (mostra só selecionados) e **Publicar novidades** (desabilitados se nada selecionado).
  - Mostra versão publicada e data da última publicação.

## Arquivos alterados

- `src/App.tsx`
  - Imports de `WhatsNewModal`, `WhatsNewAdmin`, constantes e `getPublishedWhatsNew`.
  - Estados: `showWhatsNew`, `whatsNewContent`, `whatsNewPublishedId`; guarda `whatsNewCheckedRef`.
  - `useEffect` de startup: lê Firestore, compara com localStorage, exibe modal após 4s se houver novidade.
  - Menu (desktop e mobile): item **"Gerenciar Novidades"** (ícone `Sparkles`) visível só para admin.
  - Aba `whatsnew` renderiza `<WhatsNewAdmin currentUserName={user.name} />`.
  - Render de `<WhatsNewModal />` no root do container.
- `firestore.rules`
  - Helpers `isValidWhatsNewItem`, `isValidWhatsNewCategory`, `isValidWhatsNew`.
  - Bloco `match /settings/whatsNew`:
    - `read` para autenticados;
    - `create` só admin com conteúdo válido;
    - `update` só admin e `lastPublishedId == resource.data.lastPublishedId + 1`;
    - `delete` negado.

## Comportamento do fluxo

1. Admin acessa **Gerenciar Novidades** → edita → marca o que publicar → **Publicar**.
2. Transação sobe o ID (1, 2, 3...).
3. No startup/reload, o app lê o ID publicado e compara com o local.
   - Nunca viu ou ID diferente → pop-up aparece após 4s.
4. Marcando "Não exibir mais" + Entendi → salva o ID atual no localStorage.
5. Só reaparece quando o ID subir (nova publicação).

## Pendências / próximos passos

- [ ] **Deploy das regras** do Firestore (obrigatório antes de usar em produção):
      `npm run rules:login` e depois `npm run rules:deploy`.
- [ ] Validar em produção: publicar versão 1, conferir pop-up em outro navegador/usuário.
- [ ] (Opcional) Persistir o **rascunho** do Admin (itens não publicados) no localStorage, para
      sobreviver a recarregar a página. Hoje o rascunho não selecionado vive só em memória e,
      ao clicar "Recarregar", volta ao último conteúdo publicado.
- [ ] (Opcional) Publicar conteúdo real definitivo (hoje o `DEFAULT_WHATS_NEW` é o modelo inicial).

## Verificação

- `npm run lint` (tsc --noEmit): passa.
- `npm run build`: passa (warnings de chunk são pré-existentes).

## Observações

- Não há versão de build/constante de versão no app; por isso o "é novidade" é definido pela
  **ação de publicar** (bump do ID), não pelo deploy.
- Em **modo demo**, o logout apaga todas as chaves com prefixo `agro_stock_gps_`, incluindo
  `agro_stock_gps_whats_new_seen` — comportamento aceitável para demo.
- `settings/whatsNew` convive com a regra existente `match /settings/{settingId}` (regras
  `allow` são combinadas por OR).
