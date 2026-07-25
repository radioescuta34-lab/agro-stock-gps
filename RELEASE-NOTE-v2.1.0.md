# Release Note — v2.1.0 (24/07/2026)

## Resumo

Correção crítica na instalação PWA e melhorias de segurança no sistema.

---

## Correções

### PWA — Botão "Instalar App" e modo aplicativo
- **Corrigido botão de instalação que não aparecia no Chrome** — o evento `beforeinstallprompt` era disparado antes do React montar, perdendo o evento. Solução: script inline no `<head>` do `index.html` captura o evento antes do bundle JS carregar.
- **Ícones PNG corrompidos** — todos os 4 arquivos PNG (`icon-128`, `icon-192`, `icon-512`, `apple-touch-icon`) tinham o primeiro byte `0x89` substituído por `0xEFBFBD` (UTF-8 replacement character) por processamento em modo texto. O Chrome rejeitava o manifest como inválido, impedindo completamente a instalação PWA.
- **Ícones regenerados** via script `scripts/generate-icons.mjs` (sem dependências externas).
- **`.gitattributes`** adicionado com regra `*.png binary` para impedir que o Git corrompa binários novamente.

### Botão "Instalar App" — UX
- Botão agora **sempre aparece** quando o app não está em modo standalone (independente do `beforeinstallprompt`).
- Se o Chrome suportar o prompt nativo → instala normalmente.
- Se não suportar → exibe tooltip com instruções (menu ⋮ → Instalar aplicativo).
- Botão esconde automaticamente quando o app já está instalado.

---

## Segurança

- **`crypto.ts`** — funções `encryptSensitive()` / `decryptSensitive()` via AES-GCM-256 (Web Crypto API).
- **Logout** — `handleLogout` agora limpa todas as chaves `agro_stock_gps_*` do `localStorage`.
- **Licenças** — códigos sensíveis (`code`, `masterUnlockKey`) mascarados na UI (`EI5W2...pM=`).
- **Firebase offline** — `enableIndexedDbPersistence()` habilitado para cache seguro via IndexedDB.

---

## Documentação
- **AGENTS.md** criado na raiz do projeto com instruções para agentes: comandos, arquitetura, quirks do Auth/Firestore, variáveis de ambiente e configuração PWA.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `index.html` | Script inline para capturar `beforeinstallprompt` antes do React |
| `src/App.tsx` | Botão install sempre visível, tooltip instrutivo, custom event `__installPromptReady` |
| `public/icon-128.png` | Regenerado (128×128, PNG válido) |
| `public/icon-192.png` | Regenerado (192×192, PNG válido) |
| `public/icon-512.png` | Regenerado (512×512, PNG válido) |
| `public/apple-touch-icon.png` | Regenerado (192×192, PNG válido) |
| `.gitattributes` | Novo — protege PNGs/JPGs/ICO/SVG de processamento em modo texto |
| `scripts/generate-icons.mjs` | Novo — gera PNGs válidos via Node.js (zlib nativo) |
| `src/utils/crypto.ts` | Novo — encrypt/decrypt sensível |
| `src/components/LicensesTab.tsx` | Códigos mascarados |
| `src/firebase.ts` | IndexedDB persistence habilitado |
| `AGENTS.md` | Novo — instruções para agentes |
