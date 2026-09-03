# Locais de armazenamento — implantação e conferência

## Escopo

Cadastro em **Cadastros → Locais de armazenamento**, padrão explícito, consulta de equipamentos, transferências internas e recebimento obrigatório nos retornos. A coleção `locations` existente é reutilizada. Máquinas e parceiros não são cadastrados como depósitos.

Não há migração no login, criação automática de assistências fictícias nem atribuição silenciosa de almoxarifado. A antiga rotina `locationMigration.ts` não é mais chamada pelo aplicativo; não a execute manualmente.

## Modelo e gravação

- `components.currentLocationId` OU `components.currentMachineId`: destino exclusivo nos registros com `placementVersion: 1`. O texto `currentMachine` permanece apenas para compatibilidade.
- `locations`: `INTERNAL` para espaços da empresa; `EXTERNAL_SERVICE` e `EXTERNAL_LOAN` vinculam destinos a `partners` pelo ID. Novos destinos externos têm IDs determinísticos por categoria/parceiro; não copiam endereço nem contatos.
- `storage_settings/main`: `defaultLocationId`, `revision`, `updatedAt`, `updatedBy`. O padrão é uma sugestão, nunca fallback invisível.
- `location_events`: registros imutáveis com equipamento, origem, destino, ação, referência operacional, responsável, data e justificativa.
- `storage_operations`: recibos imutáveis de idempotência. Repetir o mesmo identificador não repete a transação.
- `loans.returnLocationId` e `maintenances.returnLocationId`: destino do último recebimento. Em devoluções parciais, o histórico por equipamento preserva todos os destinos; `items` contém somente os pendentes e `returnedItems` os recebidos.

`storageModel.ts` valida os comandos sem efeitos colaterais. `storageRepository.ts` persiste operação, equipamentos, destinos, eventos e revisão na mesma transação. A revisão serializa os comandos de destino; leituras transacionais dos documentos detectam alterações concorrentes. As edições cadastrais com versão desatualizada são rejeitadas. Campos de vínculos obsoletos são removidos por substituição do documento, não por `undefined` ignorado.

Nesta versão o repositório lê as coleções operacionais e registra suas versões dentro da transação para incluir conflitos legados sem índices/campos normalizados. Isso tem custo proporcional ao volume de dados: antes de operar bases grandes, medir latência e leituras e evoluir para reservas por equipamento e consultas paginadas normalizadas. Não retirar o controle de revisão ao otimizar.

No Demo, os dados afetados são gravados em uma única entrada `agro_stock_gps_storage_state` antes de atualizar a interface. As entradas anteriores são lidas para compatibilidade. Não são usadas credenciais de produção nas operações Demo.

## Ordem de publicação

1. Fazer backup/exportação do Firestore no projeto correto (`agrostock-gps`) e guardar o estado das regras anteriores.
2. Em ambiente de homologação, testar regras e fluxos com perfis administrador e técnico. Não realizar testes destrutivos em produção.
3. Publicar `firestore.rules` **antes** do código: `npm run rules:deploy`. Se necessário, executar `npm run rules:login` manualmente. O comando não publica o aplicativo.
4. `firestore.indexes.json` continua sem índices compostos: as consultas novas não exigem nenhum. Não remover índices existentes de produção fora desse escopo.
5. Publicar código/deploy e solicitar atualização das sessões antigas. Clientes anteriores podem manter regras e formulários incompatíveis com o novo fluxo.
6. Cadastrar os espaços reais, definir um padrão ativo e revisar pendências. Só então habilitar o uso operacional para a equipe.

Não executei deploy de regras, migração ou alterações em dados de produção nesta implementação.

## Conferência do legado

1. Abrir a seção **Conferência de destinos** e **Exportar relatório**. O JSON contém pendências por equipamento e por cadastro de local.
2. Revisar documentos com destino ausente, IDs inexistentes, ambos os vínculos, destino inativo, parceiro ausente ou nomes duplicados. Nomes iguais não autorizam unir registros.
3. Verificar o backup e a localização física antes de usar **Conferir destino**. Escolher um destino e justificar. A correção preserva o status e cria um evento auditável.
4. O.S. pendentes precisam ser resolvidas antes da conferência. Para destino externo, o parceiro precisa corresponder à operação ativa. Não é permitido transformar empréstimo em armazenamento sem devolução.
5. Destinos externos legados sem parceiro ou duplicados são apenas apontados pelo relatório; exigem saneamento cadastral revisado antes de novos envios. Não há fusão automática de IDs, alteração de contratos nem reconstrução de históricos por suposição.
6. Exportar novo relatório e comparar quantidades e vínculos. Guardar ambos os relatórios com o backup.

## Verificação

Comandos: `npm run lint`, `npm run build`, `npm run test:storage`.

Roteiro de homologação: cadastrar local vazio, editar, definir padrão, cadastrar equipamento, transferir, abrir/iniciar/concluir instalação, remover para outro local, emprestar/devolver parcial e totalmente, enviar/receber manutenção com e sem conserto, tentar inativar local ocupado/padrão/reservado, tentar duas operações concorrentes e repetir uma requisição com o mesmo recibo.

Também validar teclado, toque, foco, rolagem e área segura em desktop e celular; verificar `?` em todas as telas envolvidas. Confirmar a atualização após recarregar no Demo e no Firebase.

O build e os testes locais não substituem os testes de regras no emulador. Firebase CLI e Java não estão disponíveis no ambiente de execução desta tarefa. A validação visual integrada foi interrompida pelo encerramento da página ao abrir o Demo; não foi possível homologar os fluxos por esse navegador.

## Recuperação

Falha de transação não deixa gravação parcial. Se a conexão cair após o commit, o recibo permite confirmar a mesma operação. Em erro, atualizar a tela antes de repetir e conferir o histórico. Não apagar `location_events` nem recibos para "destravar" operações. Correções físicas posteriores devem ser novas movimentações auditadas; restauração de backup é procedimento administrativo separado.
