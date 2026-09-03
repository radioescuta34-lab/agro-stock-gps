# Release — locais de armazenamento

- Novo cadastro de espaços em **Cadastros**, com consulta de locais vazios, busca, situação, edição e inativação protegida.
- Resumo com abas Dados, Equipamentos e Histórico; acesso à listagem de equipamentos já filtrada.
- Local padrão configurável; armazenamento exigido no cadastro e nos recebimentos.
- Transferência interna individual ou em lote, sem gerar O.S. fictícia nem alterar o status.
- Destinos vinculados por ID em instalações, remoções, empréstimos e manutenção externa; limpeza de vínculos antigos na movimentação.
- Gravação transacional de operação, equipamento e histórico, com revalidação de conflitos e recibos de idempotência; persistência unificada no Demo.
- Relatório de conferência do legado, correção individual justificada e fim da migração automática no login.
- Ajuda contextual de armazenamento, equipamentos, O.S., empréstimos, parceiros, frota e manutenção externa revisada.

**Antes da produção:** publicar as regras do Firestore, homologar com os dois perfis e revisar os destinos antigos. Nenhuma migração ou publicação em produção foi executada nesta etapa.
