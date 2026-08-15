# Release v2.2.0 — Kanban semanal de recolhimento

**Data:** 14/08/2026

## Resumo

O fluxo de recolhimento semanal foi ajustado para funcionar como um Kanban operacional com pouca intervenção: o usuário conclui cada máquina individualmente e o sistema atualiza automaticamente a situação da frente conforme o avanço das coletas.

## O que mudou

### Registros semanais persistentes

- Cada máquina recebe um registro próprio por semana, inicialmente como pendente.
- O identificador do registro combina semana e máquina, evitando duplicidades.
- Os dados essenciais da máquina e da frente são preservados no registro semanal para manter o histórico mesmo quando o cadastro da frota mudar depois.
- A preparação da semana ocorre ao acessar o sistema e permanece sincronizada enquanto a aplicação estiver aberta.

### Fluxo automático do Kanban

- Um toque na máquina pendente registra a coleta como concluída.
- A conclusão grava data, horário e usuário responsável.
- A frente muda automaticamente entre os estados:
  - **Pendente:** nenhuma máquina concluída.
  - **Em andamento:** pelo menos uma máquina concluída, mas ainda existem pendências.
  - **Concluída:** todas as máquinas da frente foram concluídas.
- A ação em massa de concluir uma frente foi removida para evitar registros incorretos.
- Uma máquina concluída não pode ser reaberta acidentalmente com um segundo toque.

### Histórico por semana

- Foi adicionado um seletor de semana no cabeçalho do recolhimento.
- A semana atual continua interativa; semanas anteriores são exibidas somente para consulta.
- O histórico informa quais máquinas foram concluídas, quando a coleta ocorreu e quem a registrou.
- Máquinas sem coleta ficam identificadas como **Não recolhida nesta semana**.
- O progresso e os agrupamentos por frente são recalculados para a semana selecionada.

### Ajuda integrada

- O botão de ajuda do recolhimento agora abre um guia visual em quatro etapas.
- O conteúdo explica os estados do quadro, a conclusão individual, a movimentação automática das frentes e a consulta ao histórico.
- A navegação pode ser feita pelos botões anterior/próximo ou pelos indicadores de etapa.
- O modal funciona como uma folha inferior no celular e como uma janela centralizada no desktop.
- A rolagem da tela de fundo é bloqueada durante a leitura, com rolagem interna e margem segura para dispositivos iOS.
- O guia também pode ser fechado pelo botão no cabeçalho, pelo fundo do modal ou pela tecla `Esc`.

### Histórico completo da máquina

- As coletas semanais agora aparecem no mesmo histórico da máquina que já reunia as ordens de serviço.
- A linha do tempo combina os eventos em ordem cronológica, sem duplicar informações no banco de dados.
- Foram adicionados filtros para visualizar todos os eventos, somente O.S. ou somente coletas.
- Cada coleta informa semana, situação, data, horário, responsável e frente vinculada.
- Semanas encerradas sem coleta ficam identificadas como **Não recolhida**; a pendência da semana atual também fica visível.
- O resumo do veículo passou a mostrar a última coleta, o total de coletas concluídas e a situação da semana atual.
- Os cards da frota agora informam a quantidade total de eventos do histórico, considerando O.S. e coletas.

### CRUD e ciclo de vida das ordens de serviço

- Corrigida a persistência das transições de status no Firestore, incluindo timestamp do servidor e validação correta dos campos alterados.
- O fluxo agora permite: **Aberta → Agendada → Em atendimento → Concluída**, além de reagendamento, retorno para aberta e cancelamento nos pontos permitidos.
- A abertura da O.S. não movimenta mais o equipamento antecipadamente; a situação e a localização são alteradas somente após a conclusão.
- A conclusão da O.S. e a atualização do equipamento são gravadas atomicamente.
- O.S. abertas ou agendadas podem ser editadas, e cada alteração acrescenta um evento ao histórico.
- Administradores podem excluir apenas O.S. abertas ou agendadas, sempre após confirmação.
- O.S. iniciadas, concluídas ou canceladas permanecem protegidas contra edição e exclusão para preservar a auditoria.
- O cancelamento foi mantido no menu de três pontos e ganhou confirmação explícita.
- Equipamentos com uma O.S. ativa ficam indisponíveis para uma segunda ordem simultânea.
- Formulários e modais de O.S. agora bloqueiam a rolagem da página de fundo no desktop e no mobile.

### Compatibilidade e segurança dos dados

- Registros antigos continuam reconhecidos por máquina e semana, mesmo quando utilizam o identificador anterior.
- As regras do Firestore foram ampliadas para aceitar os campos de snapshot e histórico.
- O blueprint do Firebase e os tipos da aplicação foram atualizados para refletir a nova estrutura.

### Modal global de notificações

- Confirmações e avisos agora abrem como uma folha inferior compacta no celular e permanecem centralizados no desktop.
- A área de ações respeita a margem segura do iOS e os botões têm alvos de toque maiores.
- A rolagem da página de fundo fica bloqueada enquanto o modal está aberto.
- Fechar pelo `X`, pelo fundo ou pela tecla `Esc` passa a cancelar corretamente a ação pendente.
- Confirmações destrutivas destacam a ação segura como foco inicial, reduzindo o risco de exclusões acidentais.
- Foram adicionados rótulos semânticos e estados de foco para melhorar a navegação por teclado e leitores de tela.

## Validação realizada

- Verificação de tipos com `npm run lint`.
- Build de produção com `npm run build`.
- Teste funcional no navegador confirmando:
  - movimentação de uma frente de pendente para em andamento;
  - movimentação automática para concluída após a última máquina;
  - bloqueio de uma segunda conclusão acidental;
  - persistência do estado após recarregar a página.
  - abertura e navegação completa da ajuda integrada.
  - combinação de ordens de serviço e coletas no histórico da máquina.
  - criação, edição, agendamento, início, conclusão e exclusão protegida de O.S.
  - atualização automática do equipamento somente após a conclusão da ordem.

## Observações para publicação

- As novas regras de `firestore.rules` precisam ser publicadas junto com a aplicação.
- O histórico completo começa a ser formado a partir desta versão. Sem um snapshot existente, semanas anteriores não podem ser reconstruídas com segurança, pois a composição da frota pode ter mudado.
