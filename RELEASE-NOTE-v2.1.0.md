# Release — Melhorias no App (24/07/2026)

## O que mudou?

### 1. Instalação do App (PWA) agora funciona de verdade

O botão "Instalar App" sempre aparecia mas nunca funcionava — isso acontecia porque os arquivos de ícone estavam corrompidos (abriram como texto e quebraram). O Chrome não reconhecia o site como aplicativo instalável.

- Recriamos todos os ícones do zero (128, 192, 512 pixels)
- Colocamos uma trava para o Git não corromper imagens novamente
- O botão agora captura o evento de instalação antes mesmo do site carregar completo

### 2. Botão "Instalar App" mais esperto

- Se o navegador suportar instalação → instala direto
- Se não suportar → mostra uma dica de como instalar manualmente (menu ⋮ → Instalar aplicativo)
- Some automaticamente quando o app já está instalado

### 3. Mais segurança

- Dados das licenças agora aparecem mascarados na tela (ex: `EI5W2...pM=`)
- Saiu do sistema? Toda informação salva no navegador é apagada
- Criptografia AES adicionada para dados sensíveis
- Cache offline via IndexedDB (mais seguro que localStorage)

### 4. Documentação

- Criamos um guia (AGENTS.md) para ajudar quem mexer no código no futuro

---

O deploy já foi enviado. É só acessar o site que as mudanças já estão no ar.
