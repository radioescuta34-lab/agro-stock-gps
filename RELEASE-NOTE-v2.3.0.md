# Release v2.3.0 — Filtros da tela de Frota

**Data:** 22/08/2026

## O que mudou

### Filtros completos na gestao de frota

- Adicionados filtros por **Marca**, **Modelo** e **Frente de Trabalho**, alem do filtro de **Tipo** que ja existia.
- Os dropdowns listam apenas os valores presentes nos cadastros atuais (exceto Tipo, que reflete todos os tipos ativos do cadastro de tipos de veiculos).
- Botao "Limpar filtros" aparece quando ha filtros ativos.
- Filtros ativos sao exibidos como tags coloridas no cabecalho com botao de remocao individual.

### Layout em lista para desktop

- A grade de cards foi substituida por uma **tabela** no desktop, com colunas: Prefixo, Tipo, Marca, Modelo, Frota/Frente, Historico e Detalhes.
- O layout em cards continua disponivel no mobile.

## Validacao

- Verificacao de tipos com `npm run lint` (sem erros).
