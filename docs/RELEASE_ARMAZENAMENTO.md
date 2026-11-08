# Release — locais de armazenamento

- Novo cadastro de espaços em **Cadastros**, com consulta de locais vazios, busca, situação, edição e inativação protegida.
- Resumo com abas Dados, Equipamentos e Histórico; acesso à listagem de equipamentos já filtrada.
- Local padrão configurável; armazenamento exigido no cadastro e nos recebimentos.
- Transferência interna individual ou em lote, sem gerar O.S. fictícia nem alterar o status.
- Destinos vinculados por ID em instalações, remoções, empréstimos e manutenção pela O.S.; limpeza de vínculos antigos na movimentação.
- Gravação transacional de operação, equipamento e histórico, com revalidação de conflitos e recibos de idempotência; persistência unificada no Demo.
- Relatório de conferência do legado, correção individual justificada e fim da migração automática no login.
- Ajuda contextual de armazenamento, equipamentos, O.S., empréstimos, parceiros, frota e manutenções revisada.
- Estoque operacional: a disponibilidade passa a considerar O.S. abertas, manutenção pendente, empréstimos e assistência externa. Uma manutenção iniciada pela O.S. bloqueia o equipamento desde a abertura e só a conclusão do reparo o libera.
- A listagem de equipamentos ganhou resumo operacional com filtros rápidos para prontos para uso, reservados, manutenção e cadastros a conferir.

**Antes da produção:** publicar as regras do Firestore, homologar com os dois perfis e revisar os destinos antigos. Nenhuma migração ou publicação em produção foi executada nesta etapa.
