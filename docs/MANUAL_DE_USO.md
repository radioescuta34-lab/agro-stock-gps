# Manual de Uso — Agro Stock GPS

Manual de referência das funcionalidades implementadas nesta etapa. Ele descreve o comportamento esperado no sistema (tanto em modo Demo quanto em produção com Firebase) e como operar cada recurso.

> Atualização de armazenamento: consulte também [Implantação e conferência](ARMAZENAMENTO_IMPLANTACAO.md).

> Este manual cobre: **Ordens de Serviço com múltiplos equipamentos** (PR6), **Integridade funcional equipamento ↔ máquina e exclusão por inativação** (PR7) e o **processo de publicação das regras do Firestore**.

---

## 1. Ordem de Serviço com múltiplos equipamentos (O.S. multi-equipamento)

Permite que uma única O.S. envolva **vários equipamentos GPS ao mesmo tempo** (ex.: instalar uma antena e um monitor no mesmo trator, ou remover um conjunto completo de uma máquina).

### 1.1 Como selecionar mais de um equipamento

Ao criar uma O.S. (Movimentações → Nova O.S.), o campo **"Equipamentos GPS"** agora é uma lista de seleção múltipla:

1. Marque a caixa ao lado de cada equipamento desejado.
2. O equipamento marcado **primeiro** é identificado como **"Principal"** — ele define os dados principais da O.S. (número da O.S., serial de referência, histórico).
3. Ao marcar mais de um, aparece uma nota indicando quantos foram selecionados.

> A lista só mostra equipamentos **elegíveis** para a operação escolhida:
> - **Instalação** → apenas equipamentos **Disponíveis**.
> - **Remoção/Calibração** → equipamentos **Em Uso**.
> - **Manutenção interna** → equipamentos em máquinas ou armazenamentos, sem conflito operacional.
> Itens **inativados** (excluídos) **não** aparecem na seleção.

### 1.2 Validação por equipamento

Antes de criar a O.S., o sistema valida **cada equipamento** selecionado:
- Nenhum dos equipamentos pode já ter outra O.S. **em aberto/agendada/em atendimento**.
- Se algum já tiver O.S. ativa, a criação é recusada e você vê exatamente qual equipamento conflita.

### 1.3 Conclusão da O.S. atualiza todos os equipamentos

Ao **concluir** a O.S.:
- **Todos** os equipamentos da lista são atualizados de uma vez (ex.: todos ficam "Em Uso" na máquina de destino na Instalação; todos vão para o local de recebimento escolhido na Remoção).
- Isso vale tanto em modo Demo quanto em produção (nesta última, as atualizações são feitas em lote/atomicamente).

### 1.4 Edição de O.S.

Ao editar uma O.S. criada com múltiplos equipamentos:
- A seleção é **pré-carregada** com os equipamentos já vinculados.
- Os conflitos de O.S. ativa são revalidados para cada equipamento da lista.
- O.S. abrem/agendadas podem ser editadas; O.S. em atendimento/concluídas/canceladas **não**.

---

## 2. Integridade equipamento ↔ máquina (FK forte)

Todo equipamento GPS vinculado a uma máquina passa a registrar a **referência canônica da máquina** (`currentMachineId`), além do prefixo legado (`currentMachine`). Isso garante histórico confiável mesmo que um prefixo seja reutilizado ou renomeado.

Efeitos visíveis:
- Quando uma O.S. de **Instalação** é concluída, o equipamento grava o **id** e o **prefixo** da máquina de destino.
- Na **Remoção**, escolha um armazenamento ativo: a conclusão remove o vínculo com a máquina e recebe o equipamento nesse espaço.
- **Calibração e manutenção interna** preservam o local físico. Para enviar à assistência, remova primeiro da máquina e use o fluxo **Manutenção externa**.

---

## 3. Exclusão por inativação (soft-delete)

Máquinas e equipamentos GPS **não são apagados do sistema** — são **inativados** (soft-delete). O histórico (O.S., manutenções, localizações) é preservado e continua íntegro.

### 3.1 Remover Máquina

**Bloqueios (integridade referencial):**
- Se alguma máquina está com um equipamento **"Em Uso"** nela, a remoção é **bloqueada**: o sistema mostra qual equipamento impede a exclusão e pede para remover/concluir a O.S. antes.

**Comportamento:**
- Sem bloqueio, a máquina é **inativada** (mantida no cadastro e no histórico), não excluída fisicamente.

### 3.2 Excluir Equipamento GPS

**Bloqueios:**
- Se o equipamento possui uma O.S. **em aberto/em atendimento**, a exclusão é **bloqueada**.
- Se o equipamento está em **manutenção ativa** (status "Em Manutenção"), a exclusão é **bloqueada**.

**Comportamento:**
- Sem bloqueio, o equipamento é **inativado** (mantido no cadastro e no histórico).

### 3.3 Itens inativados

- Equipamentos e máquinas inativados **não aparecem** como opção em novas O.S. (não gera novas movimentações sobre itens excluídos).
- Permanecem **visíveis** nas listagens e histórico para consulta/auditoria.
- Somente **administradores** podem inativar (regra também imposta no Firestore).

### 3.4 Visibilidade/consulta

- Consulte a localização dos equipamentos em **Cadastros → Equipamentos GPS**, usando o filtro de local e o agrupamento da listagem. Itens inativados não são ofertados para novas operações.

---

## 3.5 Fluxos de uso passo a passo (com telas)

> As imagens abaixo são **guia visual**. Se ainda não houver captura, substitua o caminho `docs/screenshots/*.png` por uma imagem real (Print Screen) do sistema.
> Estrutura sugerida: crie a pasta `docs/screenshots/` e salve as capturas com os nomes indicados.

### Fluxo A — Criar uma O.S. multi-equipamento (Instalação em um trator)

**Objetivo:** instalar antena + monitor no trator T03 em uma única ordem de serviço.

![1. Abrir Nova O.S.](docs/screenshots/nova-os.png)
*Tela: Movimentações → Nova ordem de serviço.*

1. Vá em **Movimentações** e clique em **Nova ordem de serviço**.
2. Em **Tipo da O.S.**, selecione **Instalação** (a lista passa a exibir apenas equipamentos **Disponíveis**).
3. Em **Equipamentos GPS**, marque as caixas da **antena** e do **monitor**. O primeiro marcado recebe o selo **Principal**.

![2. Seleção múltipla de equipamentos](docs/screenshots/multi-selecao.png)
*Exemplo: dois equipamentos marcados; o primeiro está como "Principal".*

4. Em **Máquina do Campo**, escolha **T03** (lista já exibe só máquinas ativas).
5. Preencha **Observações / Diagnóstico** e clique em salvar.
6. O sistema valida cada equipamento (nenhum pode ter O.S. ativa). Ao concluir, o trator fica **Em Uso** com o T03 para os dois.

**Resultado esperado:**
- A O.S. passa a ter numeração sequencial (ex.: `#0012`) e contém os dois equipamentos, com o principal definindo os dados de referência.

---

### Fluxo B — Criar uma O.S. que é recusada por conflito

![3. Conflito de O.S. ativa](docs/screenshots/erro-conflito-os.png)
*Exemplo: ao tentar criar a O.S., aparece o alerta de equipamento com ordem ativa.*

1. Acesse **Movimentações → Nova ordem de serviço**.
2. Selecione um equipamento que **já possui O.S. em aberto/em atendimento**.
3. Ao salvar, o sistema **bloqueia** e informa exatamente qual equipamento conflita.

**Resultado esperado:**
- A O.S. **não** é criada. Nenhum registro duplicado ou mortalha é gravado.

---

### Fluxo C — Concluir a O.S. e atualizar todos os equipamentos

![4. Concluir O.S.](docs/screenshots/concluir-os.png)
*Tela: aba da O.S. com botão de conclusão.*

1. Na listagem de movimentações, abra a O.S. multi-equipamento.
2. Clique em **Concluir**.
3. Todos os equipamentos da O.S. são atualizados de uma vez (ex.: todos passam a "Em Uso" no T03).

**Resultado esperado:**
- **Todos** os equipamentos vinculados mudam de estado juntos (em produção, em uma única transação/batch).

---

### Fluxo D — Editar uma O.S. multi-equipamento

![5. Editar O.S.](docs/screenshots/editar-os.png)
*Tela: Editar O.S. com a seleção pré-carregada.*

1. Na O.S. **aberta/agendada**, clique em **Editar**.
2. A lista de equipamentos aparece **pré-carregada** com os já vinculados.
3. Ajuste e salve.

**Resultado esperado:**
- O.S. em atendimento/concluídas/canceladas **não** podem ser editadas (o sistema bloqueia).

---

### Fluxo E — Excluir um equipamento GPS (soft-delete)

![6. Excluir equipamento](docs/screenshots/excluir-equipamento.png)
*Tela: detalhes do equipamento → Excluir equipamento.*

1. Abra o equipamento e clique em **Excluir equipamento**.
2. Leia o aviso: a ação **inativa o item** (não apaga o histórico).
3. Confirme em **Sim, Excluir**.

**Bloqueios que podem aparecer:**

![7. Bloqueio por O.S. ativa](docs/screenshots/bloqueio-os-equipamento.png)
- _"O equipamento X possui uma O.S. em aberto/atendimento. Conclua ou cancele antes de excluir."_

![8. Bloqueio por manutenção](docs/screenshots/bloqueio-manutencao.png)
- _"O equipamento X está em manutenção ativa. Finalize antes de excluir."_

**Resultado esperado:**
- Sem bloqueio, o equipamento some das novas O.S., mas **permanece** na listagem/histórico como inativo.

---

### Fluxo F — Remover uma máquina (soft-delete)

![9. Remover máquina](docs/screenshots/remover-maquina.png)
*Tela: frota de máquinas → Remover veículo.*

1. Na frota, clique em **Remover** na máquina desejada.
2. Leia o aviso: a ação **inativa a máquina** (preserva o histórico).
3. Confirme em **Sim, Remover**.

![10. Bloqueio de máquina em uso](docs/screenshots/bloqueio-maquina-uso.png)
- Em caso de equipamento **"Em Uso"** na máquina: _"A máquina X está em uso pelo equipamento Y. Remova ou conclua a O.S. antes de excluir."_

**Resultado esperado:**
- Máquina sem vínculo ativo é inativada; máquina em uso é **protegida** até que o equipamento seja removido/concluído.

---

## 4. Publicação das regras do Firestore (implantação)

Antes de disponibilizar a produção das funcionalidades acima, as **regras do Firestore** precisam ser publicadas. Como as regras tem **negativa padrão (default deny)**, o deploy deve acontecer **antes** de lançar o código que depende delas.

### 4.1 Pré-requisitos

- Node.js e o pacote `firebase-tools` (CLI do Firebase).
- Autenticar uma vez (abre navegador): 
  ```powershell
  npm run rules:login
  ```

### 4.2 Publicar as regras

```powershell
npm run rules:deploy
```

Isso executa:
```powershell
firebase deploy --only firestore:rules --project agrostock-gps
```

- O deploy é **só de regras** (`firebase.json` está limitado a `firestore`); não altera hosting/storage.
- As regras incluem a coleção `locations`, o contador atômico `counters`, `maintenances`, `providers` e o novo comportamento **soft-delete** (delete negado; só administrador pode inativar via `active:false` + `deletedAt`).

### 4.3 Arquivos de referência

| Arquivo | Função |
| --- | --- |
| `firebase.json` | Escopo do deploy (Firestore rules/indexes) |
| `firestore.rules` | Regras de segurança (leitura/escrita, soft-delete) |
| `firestore.indexes.json` | Índices (atualmente vazio — nenhum índice novo) |

---

## 5. Apêndice — Resumo das mudanças nos arquivos

| Área | Arquivo | O que faz |
| --- | --- | --- |
| Multi-equipamento | `src/components/MovementsTab.tsx` | Multi-select de equipamentos, componente "Principal", pré-carga na edição |
| Multi-equipamento | `src/App.tsx` | `handleAddMovement` valida e grava `componentIds`/`primaryComponentId`; conclusão atualiza todos; `handleUpdateMovement` revalida múltiplos |
| FK forte | `src/App.tsx` | `storageModel.ts` grava o destino exclusivo e os eventos; `storageRepository.ts` persiste atomicamente |
| Soft-delete | `src/App.tsx` | `handleDeleteMachine`/`handleDeleteComponent` bloqueiam por referências ativas e inativam em vez de apagar |
| Soft-delete | `src/types.ts` | Campos `active`/`deletedAt` em `Machine` e `AutopilotComponent`; `currentMachineId` |
| Filtros | `src/components/MovementsTab.tsx` | Itens inativados fora dos selects de O.S. |
| Regras | `firestore.rules` | Helper `isSoftDeleteUpdate`; delete negado em `machines`/`components`; suporte a `locations`/`counters`/`maintenances`/`providers` |
| Deploy | `firebase.json`, `firestore.indexes.json`, `package.json` | Scripts `rules:login`/`rules:deploy`; escopo do deploy |
| Docs | `docs/MANUAL_DE_USO.md` | Este manual |


## 7. Locais de armazenamento

### Preparação

1. Acesse **Cadastros → Locais de armazenamento** e clique em **Novo** (administrador).
2. Informe nome, código opcional, endereço/referência e observações. Cadastre espaços físicos da empresa, não assistências nem máquinas.
3. Abra o local e use **Definir como local padrão** se quiser sugeri-lo nos recebimentos. É possível escolher outro destino em cada operação.

Todos os locais aparecem, inclusive vazios. O resumo possui **Dados**, **Equipamentos** e **Histórico**. O lápis edita o cadastro; os três pontos permitem inativar/reativar. Não é possível inativar o padrão, um local com equipamento vinculado ou com uma O.S. pendente de recebimento.

### Equipamentos e transferências

- No novo equipamento, selecione o armazenamento inicial. O status começa como Disponível.
- Na aba Equipamentos do local, marque os itens e use **Transferir selecionados**. Ou abra o resumo do equipamento → Localização → Transferir.
- Escolha o recebimento, informe observação opcional e confirme. A transferência mantém o status e registra origem/destino/usuário. Não cria uma O.S.
- Equipamentos instalados, em empréstimo, em manutenção externa ou com O.S. pendente usam o fluxo próprio; não podem ser transferidos diretamente.
- **Ver equipamentos na listagem** abre Equipamentos GPS filtrado por aquele local.

### Recebimentos

| Operação | Resultado físico |
| --- | --- |
| Abrir, agendar ou iniciar O.S. | Não altera o destino |
| Concluir instalação | Vincula à máquina e limpa armazenamento anterior |
| Concluir remoção | Recebe no armazenamento escolhido e libera a máquina |
| Calibração / manutenção interna | Preserva o destino |
| Empréstimo | Vincula ao parceiro recebedor |
| Devolução parcial ou total | Somente os itens recebidos vão ao armazenamento selecionado |
| Envio à assistência | Vincula ao parceiro do tipo Assistência técnica |
| Retorno da assistência | Recebe no armazenamento; sem conserto também precisa de local |

O **status** informa a situação operacional; o **destino** informa onde o item está. Um equipamento descartado pode continuar fisicamente em um depósito. Transferir não torna o item disponível automaticamente.

### Legado e ajuda

A seção de conferência permite exportar pendências e confirmar individualmente o destino após backup e verificação física, com justificativa. Falta de informação aparece como **Local não informado**, nunca como almoxarifado presumido. Nomes iguais não fundem IDs. Os destinos externos sem parceiro ou duplicados exigem revisão administrativa; não há migração automática.

Use **?** em Locais, Equipamentos, Manutenção externa, Serviços de Campo, Empréstimos, Parceiros e Frota para consultar as etapas relacionadas. As permissões do Firebase precisam estar publicadas antes de usar os novos fluxos em produção.
