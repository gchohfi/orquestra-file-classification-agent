# PRD — Lembretes Automáticos de Retorno por Procedimento

**Status:** rascunho para aprovação clínica, operacional, jurídica e técnica

**Produto:** Projeto Consultório.ia / Orquestra IA · **Módulo:** relacionamento com pacientes

**Público:** Produto, Engenharia, Operações, Responsável Clínico e Privacidade

**Data:** 17 de agosto de 2026 · **Escopo:** especificação; nenhuma automação ou integração foi implementada

## 1. Resumo executivo

Criar um recurso que transforme cada **procedimento concluído** de um paciente em uma expectativa rastreável de retorno. O sistema calculará um marco de renovação aprovado pela clínica e ativará o lembrete **exatamente 14 dias corridos antes desse marco**.

A ativação em D-14 será automática e determinística. O envio no mesmo dia poderá ocorrer em modo **automático supervisionado** somente quando a regra clínica, o template, a identidade, o contato, o consentimento e o canal estiverem válidos. Se qualquer gate falhar, o item permanecerá bloqueado ou irá para revisão; o sistema nunca deverá contatar uma pessoa apenas porque seu nome aparece em uma planilha.

Faixas como “4 a 6 meses” não são executáveis sozinhas. Cada produto, material, finalidade ou variante aplicável deverá ter um único `renewal_milestone_months` publicado e aprovado. As faixas informadas pela usuária serão preservadas como briefing, mas não serão convertidas silenciosamente em recomendação clínica.

O texto ao paciente deverá convidar para uma **reavaliação**, sem afirmar que o efeito terminou, que o procedimento precisa ser repetido ou que existe uma recomendação clínica individual.

## 2. Contexto e evidências disponíveis

O arquivo da Dra. Marcella apresenta três tipos de informação com granularidades diferentes:

- `Competência`: número da NF, data da venda, cliente e profissional.
- `Planilha1`: valores agregados por procedimento.
- `Caixa`: estrutura financeira descrita como contendo atendimento, cliente, procedimento, pagamentos, custos, lucro e repasses.

O próprio material informa que cada nota fiscal entra como `PENDENTE` e que tratamentos e pagamentos são completados posteriormente na tela de Vendas e Notas Fiscais. Portanto:

- Uma venda ou NF pendente não prova que o procedimento foi realizado.
- Um resumo financeiro por procedimento não permite identificar pacientes elegíveis.
- Nome e data isolados não provam identidade canônica.
- Valor, pagamento, parcela, lucro ou repasse não devem determinar o ciclo de retorno.

O documento mestre da Orquestra IA define princípios compatíveis com este PRD: Postgres como fonte operacional, separação entre dado canônico e procedência, jobs assíncronos, idempotência, RLS, timeline única, consentimento, suppression list, policy gate, WhatsApp oficial e automação supervisionada. O mesmo documento registra que envio real de WhatsApp e calendário ainda não estavam comprovados ponta a ponta no snapshot consultado; logo, esta especificação não deve ser interpretada como integração pronta.

O PRD de Públicos Inteligentes já introduz `ReturnWindowDefinition` para risco e inatividade. Este PRD reutiliza e especializa esse contrato para criar expectativas e lembretes individuais, sem criar uma segunda taxonomia concorrente.

## 3. Problema

A equipe precisa lembrar manualmente quando um paciente se aproxima da janela de retorno de um procedimento. Como os procedimentos têm durações diferentes — e alguns dependem de marca, produto, material, ponteira, finalidade, região ou protocolo — um filtro único por “última visita” gera contatos antecipados, atrasados ou clinicamente inadequados.

Sem um motor governado, também há risco de duplicidade, contato com homônimo, uso de NF pendente como se fosse atendimento, desrespeito a opt-out, exposição desnecessária do nome do procedimento e envio retroativo depois de uma falha do sistema.

## 4. Objetivos

### 4.1 Objetivo principal

Ativar automaticamente uma única expectativa de contato em D-14 para cada relação válida entre paciente e procedimento, usando um marco de renovação publicado pela clínica e preservando identidade, consentimento, procedência e auditoria.

### 4.2 Objetivos específicos

- Calcular o marco e D-14 de forma reproduzível, inclusive em fins de mês e anos bissextos.
- Permitir regras específicas por produto, material, finalidade e variante, sem inferência clínica pela IA.
- Cancelar ou recalcular expectativas diante de novo procedimento, correção, agendamento válido, opt-out ou mudança de identidade.
- Impedir duplicidades em retries, reimportações e linhas financeiras repetidas.
- Separar geração automática, elegibilidade, aprovação e efeito externo.
- Operar em modo assistido no piloto e permitir evolução segura para automático supervisionado.
- Medir envio, resposta, agendamento e retorno sem confundir correlação com atribuição comprovada.

## 5. Não objetivos

- Diagnosticar, prescrever ou recomendar repetição de procedimento.
- Definir duração clínica por IA, valor financeiro ou comportamento de outros pacientes.
- Usar apenas nome para unir pessoas ou autorizar contato.
- Transformar a planilha agregada `Planilha1` em lista individual de pacientes.
- Tratar NF, cobrança ou pagamento como prova automática de procedimento concluído.
- Criar uma infraestrutura paralela de CRM, WhatsApp ou agenda.
- Enviar campanhas em massa, descontos ou uma cadência comercial multietapas.
- Incluir prontuário, diagnóstico, prescrição, exame, foto clínica ou descrição sensível na mensagem.
- Criar lembretes para procedimentos ainda sem regra aprovada.
- Misturar acompanhamento pós-procedimento, próxima sessão de protocolo e reavaliação de manutenção no mesmo relógio.

## 6. Definições e decisões centrais

### 6.1 Tipo de lembrete deste PRD

Este PRD cobre somente `maintenance_reassessment`: convite para reavaliação próximo de uma janela estimada de manutenção.

Devem existir fluxos separados para:

- `clinical_followup`: acompanhamento pós-procedimento definido pela médica;
- `protocol_next_session`: próxima sessão de um protocolo ou série;
- `maintenance_reassessment`: reavaliação futura tratada neste PRD.

Uma regra de manutenção nunca substitui os dois primeiros fluxos.

### 6.2 Invariante D-14

```text
renewal_on =
  add_calendar_months(procedure_completed_on, renewal_milestone_months)

activation_on =
  renewal_on - 14 calendar_days
```

Regras do cálculo:

- Usar a data civil e o fuso IANA da clínica, por exemplo `America/Sao_Paulo`.
- Não converter meses em 30 dias nem anos em 365 dias.
- Se o dia não existir no mês de destino, usar o último dia válido daquele mês.
- A expectativa torna-se elegível no início do dia local de `activation_on`.
- O worker deve processá-la dentro da janela operacional configurada do mesmo dia.
- `reminder_lead_days` será fixo em `14` no MVP.

### 6.3 Faixa informativa versus marco executável

`duration_min_months` e `duration_max_months` registram a faixa fornecida pela clínica. `renewal_milestone_months` é o único valor usado no cálculo. Ele deve ter produto/protocolo aplicável, responsável clínico, versão, vigência e data de aprovação.

Sem um marco único publicado, a relação fica em `blocked_policy_missing`; o sistema não escolhe automaticamente mínimo, média ou máximo.

### 6.4 Ativar não significa enviar

Em D-14, o sistema sempre reavalia o item. O resultado pode ser:

- `ready_for_assisted_review`: piloto ou política exige revisão humana.
- `ready_for_automatic_dispatch`: automático supervisionado e todos os gates passaram.
- `blocked`: falta identidade, contato, consentimento, regra, variante, template ou canal.
- `cancelled` ou `superseded`: a expectativa deixou de ser válida.

Nenhuma mensagem pode ser enviada apenas com base na existência do lembrete.

## 7. Catálogo inicial para validação

Os intervalos abaixo vieram do briefing da usuária. Eles devem permanecer como evidência de negócio até a clínica aprovar uma regra específica. Fontes oficiais consultadas confirmam que duração de efeito não equivale automaticamente a recomendação individual de repetição.

| Categoria observada | Faixa informada | Granularidade mínima antes de publicar | Marco executável inicial |
|---|---:|---|---|
| Toxina | 4–6 meses | produto/marca, indicação, região e protocolo | rascunho de 4 meses; bloqueado até aprovação específica |
| Bioestímulo | 12–18 meses | produto/material, finalidade e distinção entre série e manutenção | nenhum marco genérico |
| Fio liso | 18–24 meses | marca, material, tipo, região e IFU aplicável | nenhum marco genérico |
| Linear Z | depende de ponteira e finalidade | cartucho/ponteira, profundidade, modo, área, finalidade e protocolo | nenhum marco genérico |

### 7.1 Justificativas clínicas de produto

- **Toxina:** a Anvisa informa que o intervalo varia conforme o produto. A bula brasileira do BOTOX registra efeito estético aproximado de 3–4 meses na maioria e até 6 meses em alguns casos, além de indicar que intervalos inferiores a 3 meses em geral não são recomendados. Esses dados não devem ser transportados automaticamente para outra marca ou indicação.
- **Bioestímulo:** a categoria reúne produtos distintos. Sculptra/PLLA pode envolver série de sessões e manutenção de longo prazo; Radiesse/CaHA tem informações específicas por produto e indicação. O sistema deve separar produto e tipo de retorno.
- **Fio liso:** material e fabricante alteram absorção e duração estimada. Informação de PDO não pode ser aplicada a PLLA, PCL ou outra marca/material.
- **Linear Z:** fabricante descreve variação por paciente e protocolo, múltiplos cartuchos/profundidades e modos. “Ponteira” isolada ainda é insuficiente.

### 7.2 Outros itens observados

O resumo também contém `Consulta`, `Esvaziador pernas`, `Fio eyebag`, `Preenchedor` e `Retoque toxina`.

- `Consulta` não cria ciclo de renovação por padrão.
- `Retoque toxina` não reinicia o ciclo até a clínica publicar se ele reinicia, mantém ou apenas complementa a expectativa anterior.
- Os demais itens permanecem `unconfigured` e não geram lembretes.
- Aliases de planilha só apontam para item canônico após revisão.

### 7.3 Exemplo condicional do cálculo

Se o responsável clínico publicar Toxina com marco de 4 meses e o procedimento for concluído em 17/08/2026:

```text
renewal_on  = 17/12/2026
activation_on = 03/12/2026
```

Se publicar Bioestímulo com marco de 12 meses para um produto e finalidade específicos:

```text
renewal_on  = 17/08/2027
activation_on = 03/08/2027
```

Se publicar Fio liso com marco de 18 meses para um material e protocolo específicos:

```text
renewal_on  = 17/02/2028
activation_on = 03/02/2028
```

Sem regra completa, nenhum desses exemplos se torna elegível para envio.

## 8. Usuários e responsabilidades

- **Responsável clínico:** aprova procedimento, variante, faixa, marco, linguagem e itens que reiniciam o ciclo.
- **Administrador:** configura unidade, fuso, canal, horário, template, modo de autonomia e responsáveis.
- **Operações/atendimento:** revisa fila assistida, resolve bloqueios e acompanha respostas e agendamentos.
- **Privacidade/jurídico:** valida base legal, consentimento, opt-out, retenção, conteúdo e classificação da comunicação.
- **Engenharia/dados:** garante modelo canônico, cálculo, fila, segurança, idempotência, reconciliação e observabilidade.
- **Paciente:** recebe mensagem respeitosa, pode responder, pedir contato ou interromper comunicações.

## 9. Histórias de usuário

### 9.1 Responsável clínico

- Como responsável clínico, quero publicar um marco exato por produto e variante para que o sistema não interprete uma faixa por conta própria.
- Como responsável clínico, quero separar próxima sessão, acompanhamento e manutenção para evitar contato no momento errado.
- Como responsável clínico, quero definir se um retoque reinicia o ciclo.
- Como responsável clínico, quero simular o impacto antes de publicar uma regra.

### 9.2 Operações

- Como atendente, quero ver quem entra em D-14 hoje, o motivo e os bloqueios.
- Como atendente, quero que novo procedimento ou agendamento válido retire automaticamente um lembrete ainda não enviado.
- Como gestora, quero distinguir agendado, ativado, bloqueado, enviado, respondido e convertido.

### 9.3 Paciente

- Como paciente, quero receber no máximo uma comunicação adequada e no momento esperado para decidir se desejo uma reavaliação.
- Como paciente, quero poder recusar novas mensagens de forma simples e imediata.
- Como paciente, não quero que a mensagem revele detalhes sensíveis sem autorização apropriada.

### 9.4 Auditoria e privacidade

- Como auditora, quero reproduzir por que uma pessoa recebeu ou não recebeu uma mensagem usando evento, regra, versão, gates, template e tentativas.
- Como responsável por privacidade, quero que opt-out e supressão interrompam ações pendentes antes de qualquer efeito externo.

## 10. Fluxo funcional do MVP

### 10.1 Configuração governada

Fluxo da regra:

```text
draft
→ simulated
→ awaiting_clinical_approval
→ awaiting_operational_approval
→ published
→ superseded
```

Estados alternativos: `rejected`, `cancelled` e `revoked`.

Uma regra publicada é imutável. Alterações geram nova versão. Sobreposição não resolvida entre regras aplicáveis ao mesmo item e variante bloqueia a publicação.

### 10.2 Criação da expectativa

Somente um item de atendimento canônico com `status = completed` pode iniciar ou renovar um ciclo. O processamento deverá:

1. Resolver organização e workspace.
2. Resolver a pessoa canônica sem depender apenas do nome.
3. Resolver evento, item, produto/material e variante.
4. Encontrar exatamente uma regra publicada e vigente.
5. Selecionar o item concluído mais recente que satisfaz a relação.
6. Calcular marco e D-14.
7. Fazer upsert idempotente de uma única expectativa ativa.
8. Registrar evento, origem, regra, versão e resultado na timeline.

NF pendente, venda sem confirmação operacional, agendamento, consulta, procedimento cancelado, item agregado e linha financeira repetida não iniciam ciclo.

### 10.3 Ativação diária

Um job diário e reconciliável deverá:

1. Buscar expectativas `scheduled` cuja `activation_on` seja a data local corrente.
2. Recalcular se o evento-âncora continua válido.
3. Reavaliar identidade, contato, consentimento, supressão, frequência, agenda e restrições.
4. Produzir decisão versionada de elegibilidade.
5. Encaminhar para revisão assistida ou despacho automático supervisionado.
6. Registrar resultado e próxima ação.

Executar o job mais de uma vez deve produzir o mesmo estado e nunca duplicar o efeito externo.

### 10.4 Novo procedimento, correção e agendamento

Quando um novo procedimento concluído satisfizer a mesma regra:

- a expectativa anterior ainda não enviada passa para `superseded_by_new_procedure`;
- qualquer reserva de envio é cancelada;
- uma nova expectativa única usa o evento mais recente;
- histórico enviado permanece imutável e o novo evento inicia o próximo ciclo.

Correção, reversão, merge ou split de identidade invalida a decisão afetada, recalcula a expectativa e preserva antes/depois em auditoria. Evento antigo importado fora de ordem nunca substitui silenciosamente uma âncora mais recente.

Se já existir agendamento válido para reavaliação ou procedimento que satisfaça a mesma regra, o lembrete fica `held_by_future_appointment`. Cancelamento antes do marco devolve o item à revisão, não ao envio retroativo automático.

## 11. Modelo lógico de domínio

### 11.1 `ReturnWindowDefinition`

- `definition_id` estável;
- `organization_id` e `workspace_id`;
- item ou categoria canônica;
- marca, produto e material, quando aplicáveis;
- aliases aprovados;
- indicação, região e seletores de variante;
- para Linear Z: cartucho/ponteira, profundidade, modo, área e finalidade;
- `duration_min_months` e `duration_max_months`;
- `renewal_milestone_months`;
- intervalo mínimo aplicável e sua fonte;
- `reminder_lead_days = 14`;
- tipo `maintenance_reassessment`;
- itens que satisfazem ou reiniciam o ciclo;
- regra de retoque;
- prioridade e vigência;
- versão e estado;
- aprovações clínica, operacional e de privacidade;
- autoria, motivo e trilha de auditoria.

### 11.2 `ReturnExpectation`

Uma relação ativa por:

```text
organization_id
+ workspace_id
+ canonical_person_id
+ return_window_definition_id
```

Campos mínimos:

- pessoa canônica;
- item/evento concluído usado como âncora;
- `procedure_completed_on`;
- `renewal_on`;
- `activation_on`;
- definição e versão fixadas;
- estado e motivo;
- expectativa anterior substituída;
- linhagem até lote, arquivo, aba, linha e decisão de promoção.

### 11.3 `ReminderCandidate`

- identificador e chave idempotente;
- expectativa de origem;
- modo `assisted` ou `automatic_supervised`;
- estado;
- decisão de elegibilidade;
- template e versão;
- canal pretendido;
- aprovação ou política que autorizou o efeito;
- timestamps de reserva, handoff, envio, entrega, resposta e cancelamento;
- motivo estruturado de bloqueio, expiração ou supersessão.

### 11.4 `ReminderEligibilityDecision`

Snapshot imutável no instante da decisão:

- estado da base canônica;
- confiança de identidade;
- contato verificado e pertencimento;
- consentimento e opt-out geral e por canal;
- suppression list;
- restrições clínica, jurídica e operacional;
- frequência e contatos concorrentes;
- agendamento futuro;
- regra, template e canal válidos;
- avaliador, versão, evidências e validade.

Ausência, expiração ou erro de consulta equivale a `blocked`.

### 11.5 `ReminderDeliveryAttempt`

- `idempotency_key` externa;
- provedor e conexão;
- template aprovado;
- tentativa e limite;
- estado aceito, enviado, entregue, lido, falho ou reconciliado;
- ID externo;
- erro tipado e sanitizado;
- timestamps e custo;
- payload bruto protegido ou hash, conforme política de retenção.

## 12. Estados da expectativa e do lembrete

Fluxo principal:

```text
scheduled
→ activated_d14
→ ready_for_assisted_review | ready_for_automatic_dispatch
→ reserved
→ handed_off
→ sent
→ delivered | delivery_failed
→ responded | converted | closed
```

Estados alternativos:

- `blocked_policy_missing`;
- `blocked_variant_missing`;
- `blocked_identity`;
- `blocked_contact`;
- `blocked_consent`;
- `blocked_frequency`;
- `held_by_future_appointment`;
- `overdue_review`;
- `superseded_by_new_procedure`;
- `cancelled_by_opt_out`;
- `cancelled`;
- `expired`.

Estados enviados ou concluídos nunca serão apagados ou reescritos; correções criam eventos compensatórios.

## 13. Gates obrigatórios

### 13.1 Base e evento

- Lote promovido, reconciliado e rastreável.
- Evento e item canônicos.
- Procedimento efetivamente concluído.
- Data civil válida e não futura.
- Regra publicada e vigente.
- Produto, material, indicação e variante completos quando exigidos.

### 13.2 Identidade

- Pessoa canônica resolvida por evidência suficiente.
- Homônimos e merges pendentes bloqueados.
- Telefone ou outro canal verificado e ligado à pessoa.
- Alteração de identidade invalida decisões ainda não executadas.

### 13.3 Consentimento e restrições

- Opt-out geral ausente.
- Canal sem opt-out específico.
- Estado desconhecido tratado como bloqueado para aquele canal.
- Suppression list e reclamações verificadas.
- Base legal, finalidade e retenção publicadas pela organização.
- Ausência de restrição clínica, jurídica ou operacional aplicável.

Opt-out será rechecado na criação da expectativa, em D-14, na reserva e imediatamente antes do handoff. Opt-out posterior cancela toda ação ainda não enviada sem apagar o histórico analítico.

### 13.4 Canal e automação

- Integração oficial saudável e comprovada ponta a ponta.
- Template vigente e permitido para o contexto do canal.
- Fuso, janela de contato e limite de frequência válidos.
- Idempotência e reconciliação do provedor aprovadas.
- Modo de autonomia publicado para o workspace.
- Feature flag do piloto ou do automático supervisionado habilitada.

### 13.5 Comportamento fechado

Se qualquer gate obrigatório estiver ausente, vencido ou indisponível, o lembrete poderá aparecer em prévia, mas não poderá produzir efeito externo.

## 14. Política de autonomia e rollout

### 14.1 Modo `assisted`

Padrão do piloto. O sistema calcula, ativa e prepara a mensagem automaticamente; uma pessoa autorizada revisa e libera. Alteração de texto cria nova versão ou registra override auditado.

### 14.2 Modo `automatic_supervised`

Estado-alvo do recurso. O sistema envia no dia D-14 sem aprovação individual quando:

- regra e template tiveram aprovação prévia;
- o workspace concluiu o piloto;
- todos os gates passaram;
- limites, pausa emergencial e monitoramento estão ativos;
- não há condição que exija handoff humano.

Qualquer incerteza, reclamação, conflito, opt-out, erro de identidade, variante ausente ou atraso operacional retira o item do automático.

### 14.3 Pausa emergencial

Owner e admin deverão poder pausar imediatamente novos handoffs por organização, workspace, procedimento, regra, template, canal ou provedor. A pausa não apaga expectativas; muda-as para revisão.

## 15. Mensagem e experiência do paciente

### 15.1 Princípios de conteúdo

- Falar em “acompanhamento” ou “reavaliação”, não em obrigação de repetir.
- Não afirmar duração garantida, término de efeito ou necessidade clínica individual.
- Não usar urgência artificial, medo, diagnóstico, desconto ou promessa de resultado.
- Informar a clínica e oferecer ação simples: conversar, agendar avaliação ou não receber novas mensagens.
- Usar o mínimo de dado pessoal necessário.

### 15.2 Template neutro recomendado para o piloto

> Olá, {{primeiro_nome}}. Está se aproximando o período de acompanhamento de um atendimento realizado em nossa clínica. Este lembrete não significa que seja necessário repetir qualquer procedimento; essa decisão depende de avaliação individual. Se desejar, podemos ajudar a agendar uma reavaliação. Para não receber novos lembretes, responda SAIR.

O nome do procedimento não deverá aparecer por padrão. Um template específico só poderá ser publicado após avaliação clínica e de privacidade, consentimento compatível e confirmação de que o canal pertence à pessoa.

### 15.3 Respostas

- Pedido de agendamento: criar handoff para atendimento ou agenda, sem prometer horário.
- Dúvida clínica: encaminhar a pessoa; o robô não responde conduta individual.
- Reclamação ou possível evento adverso: interromper automação e encaminhar ao protocolo humano apropriado.
- `SAIR` ou intenção equivalente: registrar opt-out imediatamente e cancelar ações pendentes.

## 16. Deduplicação, frequência e concorrência

### 16.1 Chaves idempotentes

Geração da expectativa:

```text
organization_id
+ workspace_id
+ canonical_person_id
+ return_window_definition_id
+ anchor_service_item_id
+ definition_version
```

Efeito externo:

```text
reminder_candidate_id
+ channel
+ template_version
+ dispatch_cycle
```

### 16.2 Regras

- Reprocessar o mesmo evento ou job não cria outro lembrete.
- Linhas repetidas de parcelas ou meios de pagamento não criam ciclos.
- Um novo procedimento concluído substitui apenas a relação compatível.
- Eventos de procedimentos diferentes permanecem independentes.
- Se dois lembretes da mesma pessoa ativarem no mesmo dia, o sistema cria uma única ação de contato neutra e vincula as duas expectativas.
- Cada candidato conserva sua data D-14 mesmo quando a política de frequência bloquear ou consolidar o envio.
- O lembrete consome o orçamento global de frequência da pessoa até decisão jurídica diversa e publicada.

## 17. Indisponibilidade e atraso

- Se o job não rodar no dia exato, o item passa para `overdue_review`.
- Não haverá envio retroativo automático.
- Um revisor poderá cancelar ou autorizar contato tardio com motivo, depois de reavaliar os gates.
- Tentativas aceitas pelo provedor não serão reenviadas por falta de confirmação local; primeiro reconciliar pelo ID externo.
- Falha transitória poderá usar retry limitado no mesmo dia, com a mesma idempotency key.
- Falha terminal, template rejeitado ou canal indisponível irá para revisão; não trocar de canal silenciosamente.

## 18. Experiência operacional

### 18.1 Painel “Retornos”

O painel deverá mostrar:

- ativações de hoje;
- próximos 30, 60 e 90 dias;
- bloqueados por motivo;
- atrasados;
- enviados, entregues, respondidos e convertidos;
- filtros por unidade, procedimento, produto/variante, profissional, regra e estado;
- modo assistido ou automático supervisionado;
- botão de pausa e acesso à auditoria.

Cada item deverá explicar:

- qual procedimento/evento iniciou a expectativa;
- qual regra e versão foram usadas;
- como marco e D-14 foram calculados;
- por que está elegível, bloqueado, cancelado ou consolidado;
- quais dados de origem sustentam a decisão.

### 18.2 Prévia antes da base canônica

Enquanto a base real não estiver promovida e reconciliada, poderá existir relatório local não acionável com:

- totais `scheduled`, `activated_d14`, `blocked` e `overdue_review`;
- procedimento, variante, data do evento, marco e ativação;
- regra e versão;
- motivo estruturado do bloqueio;
- origem rastreável;
- banner permanente “prévia não acionável”.

Nomes reais não deverão ser gravados em logs, JSON ou Git. Relatórios identificados permanecem locais, com acesso restrito e sem scripts ou rede.

## 19. Requisitos funcionais

### 19.1 P0 — obrigatório

1. Publicar regras versionadas com marco exato e `reminder_lead_days = 14`.
2. Exigir aprovação clínica antes de publicar qualquer produto ou variante.
3. Criar expectativa somente a partir de procedimento canônico concluído.
4. Calcular meses civis, fim de mês, ano bissexto e D-14 de forma determinística.
5. Bloquear categorias genéricas sem os atributos mínimos definidos na seção 7.
6. Separar expectativa, elegibilidade, candidato, handoff e tentativa de envio.
7. Reavaliar gates em D-14 e antes de qualquer efeito externo.
8. Respeitar opt-out, suppression list, frequência, restrições e agenda futura.
9. Cancelar ou substituir expectativa quando houver novo evento válido.
10. Impedir duplicidade em importação, retry, concorrência e reconciliação.
11. Registrar timeline e auditoria reproduzíveis.
12. Disponibilizar fila assistida, bloqueios, pausa e prévia.
13. Usar template neutro e opt-out simples no piloto.
14. Isolar organização e workspace no backend e banco.
15. Falhar fechado quando dado, gate ou provedor estiver indisponível.

### 19.2 P1 — próxima fase

- Agregação de múltiplas expectativas da mesma pessoa.
- Integração com agenda para oferecer horários após interesse explícito.
- Dashboard de resposta, agendamento e retorno.
- Regras adicionais por produto, material, dose, ponteira, finalidade e profissional, quando aprovadas.
- Canal alternativo explicitamente escolhido pelo paciente.
- Automático supervisionado após aprovação do piloto.

### 19.3 P2 — futuro

- Segundo lembrete configurável, sujeito a nova avaliação de frequência.
- Sugestões analíticas de ajuste do marco usando somente dados agregados, sem publicação automática.
- Experimentos controlados de linguagem e horário.
- Preferências de comunicação escolhidas pelo paciente.
- Integração com campanhas, sem transformar lembrete em disparo em massa.

## 20. Requisitos não funcionais

### 20.1 Segurança e privacidade

- RLS por organização e workspace.
- Autorização no banco/backend, nunca apenas na interface.
- Segredos e tokens somente no servidor.
- Criptografia, retenção e acesso compatíveis com dado de saúde sensível.
- Logs sanitizados, sem conteúdo clínico ou contato completo.
- Auditoria de consulta, alteração, aprovação, pausa e envio.
- Exclusão e retenção reconciliáveis sem quebrar trilha obrigatória.

### 20.2 Confiabilidade

- Job com lease, heartbeat, retry limitado, dead-letter e reconciliação.
- Idempotência interna e externa.
- Processamento independente da página aberta.
- Monitoramento de backlog, atraso, duplicidade, falha de gate e provedor.
- Relógio e timezone testados; sem depender do timezone do navegador.

### 20.3 Desempenho

- 99% das expectativas do dia avaliadas dentro da janela operacional local.
- Consulta do painel paginada e filtrável.
- Reprocessamento incremental por evento, sem varrer toda a base a cada atualização.

### 20.4 Acessibilidade e UX

- Estados não dependem apenas de cor.
- Operação completa por teclado e em viewport móvel.
- Motivos de bloqueio e ações corretivas em linguagem clara.
- Nenhum botão de envio disponível quando gate obrigatório estiver bloqueado.

## 21. Métricas de sucesso

### 21.1 Proteção e confiabilidade

- 100% dos lembretes ativados com `activation_on = renewal_on - 14 dias`.
- Zero mensagens duplicadas para a mesma chave idempotente.
- Zero mensagens para identidade ambígua, opt-out ou canal bloqueado.
- 100% dos efeitos externos com regra, evento, template, gate e tentativa auditáveis.
- 100% dos opt-outs aplicados antes da próxima tentativa.
- Pelo menos 99% dos candidatos do dia processados na janela operacional.

Qualquer contato com pessoa errada, opt-out desrespeitado ou vazamento entre organizações é incidente crítico e pausa o automático supervisionado.

### 21.2 Produto

- Percentual de procedimentos concluídos com regra publicada.
- Percentual de expectativas bloqueadas por identidade, variante, consentimento ou contato.
- Taxa de entrega por canal.
- Taxa de resposta em até 14 dias após o envio.
- Taxa de pedidos de reavaliação e agendamentos vinculados.
- Taxa de retornos concluídos dentro da janela de atribuição publicada.
- Opt-out e reclamação por mil mensagens.

O primeiro ciclo de 30 dias será usado para estabelecer baseline. Metas comerciais só serão publicadas depois de existir volume mínimo, atribuição e reconciliação suficientes; não serão inventadas a partir do resumo financeiro.

## 22. Critérios de aceite

1. **D-14 exato:** dado procedimento concluído em 17/08/2026 e regra aprovada com marco de 4 meses, o motor calcula `renewal_on = 17/12/2026` e `activation_on = 03/12/2026`.
2. **Fim de mês:** se o dia não existir no mês de destino, o marco usa o último dia válido antes de subtrair 14 dias.
3. **Ano bissexto:** o cálculo é determinístico ao atravessar fevereiro.
4. **Faixa sem marco:** faixa 4–6 meses sem `renewal_milestone_months` publicado não produz lembrete.
5. **Categoria incompleta:** Toxina, Bioestímulo, Fio liso ou Linear Z sem os atributos mínimos fica bloqueado.
6. **NF pendente:** venda pendente sem atendimento concluído não cria ciclo.
7. **Resumo agregado:** total por procedimento não cria pessoa, expectativa ou mensagem.
8. **Nome isolado:** pessoa identificada apenas por nome pode aparecer em prévia bloqueada, mas nunca é contatada.
9. **Homônimo:** dois registros com o mesmo nome não são unidos automaticamente.
10. **Retry idempotente:** executar o job duas vezes gera um único candidato e no máximo um efeito externo.
11. **Parcela repetida:** repetir linhas financeiras do mesmo evento não cria outro ciclo.
12. **Novo procedimento:** novo evento concluído da mesma relação cancela o lembrete não enviado e cria expectativa com nova data.
13. **Evento antigo:** importar depois um evento mais antigo não retrocede a âncora atual.
14. **Retoque toxina:** sem política aprovada, o retoque não reinicia o ciclo.
15. **Agendamento futuro:** agendamento válido compatível impede despacho automático e coloca o item em espera.
16. **Opt-out antes do envio:** opt-out registrado depois da aprovação cancela a reserva antes do handoff.
17. **Canal indisponível:** erro de gate ou provedor não causa troca silenciosa de canal nem envio retroativo.
18. **Atraso do job:** falha no dia D-14 produz `overdue_review`, nunca envio automático tardio.
19. **Regra substituída:** nova versão não reescreve lembretes já enviados; eventos futuros usam a versão vigente.
20. **Múltiplos itens no dia:** duas expectativas da mesma pessoa ativadas no mesmo dia geram uma única ação neutra vinculada a ambas.
21. **Isolamento:** usuário de outra organização ou workspace não consegue ler, aprovar, pausar ou enviar o lembrete.
22. **Mensagem segura:** o template padrão não expõe o procedimento nem afirma necessidade de repetição.
23. **Automático supervisionado:** somente workspace com piloto aprovado, feature flag e todos os gates pode despachar sem aprovação individual.
24. **Auditoria:** cada decisão pode ser reproduzida por evento, regra, versão, gates, ator/política, template e tentativa.

## 23. Cenários de teste do piloto

O conjunto sintético deverá cobrir:

- Toxina com produto/indicação completos e incompletos.
- Bioestímulo com distinção entre série e manutenção.
- Fio liso com materiais diferentes.
- Linear Z com e sem cartucho, profundidade, modo e finalidade.
- Retoque toxina sem política.
- Procedimento no último dia do mês e ano bissexto.
- Duas parcelas para um único evento e reimportação do lote.
- Evento antigo chegando depois.
- Novo procedimento antes de D-14 e no próprio D-14.
- Agendamento futuro, cancelamento e no-show.
- Opt-out geral, específico e desconhecido.
- Telefone inválido, não verificado e compartilhado.
- Homônimos e identidade em revisão.
- Duas organizações com IDs semelhantes.
- Worker duplicado, timeout depois de aceitar no provedor e reconciliação.
- Pausa emergencial por regra e por workspace.

## 24. Fases recomendadas

### Fase 0 — Aprovação e preparação

- Validar marcos clínicos, produtos, materiais e variantes.
- Definir comportamento de retoques.
- Mapear aliases para catálogo canônico.
- Validar base legal, consentimento, retenção e template.
- Provar que o evento `completed` é confiável e separado da NF pendente.

### Fase 1 — Prévia não acionável

- Calcular com dados sintéticos e/ou base local protegida.
- Revisar datas, bloqueios, duplicidades e volume.
- Nenhum handoff ou envio.

### Fase 2 — Piloto assistido

- Pequeno volume e um workspace.
- Revisão individual antes do handoff.
- WhatsApp oficial e opt-out comprovados ponta a ponta.
- Monitoramento diário e pausa imediata.

### Fase 3 — Automático supervisionado

- Liberar apenas depois dos critérios de saída do piloto.
- Regras e templates pré-aprovados.
- Exceções permanecem assistidas.
- Auditoria e reconciliação contínuas.

### Fase 4 — Otimização

- Estabelecer baseline e metas.
- Avaliar agregação, horário, preferências e atribuição.
- Propor novas regras sem alteração autônoma.

## 25. Critérios de saída do piloto

- Zero contato com identidade errada ou opt-out.
- Zero duplicidade de envio.
- 100% dos candidatos auditáveis.
- Regras clínicas e templates sem pendências.
- Canal oficial, webhook, status e reconciliação comprovados.
- Pausa emergencial testada.
- Backlog e atrasos dentro do SLA publicado.
- Amostra revisada sem divergência entre evento concluído, marco e D-14.
- Responsáveis clínico, operacional, técnico e de privacidade aprovam a mudança de modo.

## 26. Riscos e mitigação

**Usar venda como procedimento realizado.** Mitigação: exigir evento canônico `completed`; NF pendente nunca inicia ciclo.

**Transformar duração estimada em recomendação individual.** Mitigação: separar `maintenance_reassessment`, usar linguagem de reavaliação e exigir aprovação clínica.

**Aplicar prazo genérico a produtos diferentes.** Mitigação: produto, material, indicação, região, protocolo e IFU/fonte aplicável fazem parte da regra.

**Linear Z sem granularidade suficiente.** Mitigação: bloquear até existir cartucho/ponteira, profundidade, modo, área e finalidade.

**Contato com homônimo ou telefone errado.** Mitigação: identidade canônica, contato verificado, fila de conflitos e falha fechada.

**Exposição de dado sensível no WhatsApp.** Mitigação: template neutro por padrão, mínimo de dados e aprovação de privacidade.

**Duplicidade por parcelas, retries ou concorrência.** Mitigação: granularidade por evento/item, chaves idempotentes, reserva única e reconciliação.

**Mensagem depois de novo procedimento ou agendamento.** Mitigação: rechecagem em D-14 e antes do handoff; supersessão e hold.

**Envio retroativo após indisponibilidade.** Mitigação: `overdue_review`; nenhuma recuperação automática com efeito externo.

**Automação antes de integração real.** Mitigação: fases separadas, feature flag e gate de prova ponta a ponta.

## 27. Questões em aberto

### 27.1 Bloqueadoras antes da publicação de regras

1. **[Responsável clínico]** Aprovar um marco exato por produto, indicação e protocolo; confirmar se 4 meses poderá ser o rascunho de Toxina nos casos definidos pela clínica.
2. **[Responsável clínico]** Desmembrar Bioestímulo por produto/material e separar série de sessões de manutenção.
3. **[Responsável clínico]** Desmembrar Fio liso por marca, material, tipo, região e fonte aplicável; validar ou rejeitar a faixa de 18–24 meses.
4. **[Responsável clínico]** Mapear cartucho/ponteira, profundidade, modo, área, finalidade e protocolo do Linear Z.
5. **[Responsável clínico]** Definir se `Retoque toxina` reinicia, mantém ou complementa o ciclo.
6. **[Dados/Operações]** Definir qual evento prova procedimento concluído e como corrige/cancela esse estado.
7. **[Dados/Privacidade]** Definir evidência mínima de identidade e pertencimento do telefone.
8. **[Privacidade/Jurídico]** Validar finalidade, base legal, consentimento, template, opt-out, frequência e retenção.
9. **[Engenharia]** Confirmar o sistema operacional fonte de verdade; não implementar produção no classificador local por conveniência.

### 27.2 Não bloqueadoras para a prévia

10. **[Operações]** Definir horário local preferencial e dias silenciosos.
11. **[Produto]** Definir janela de atribuição entre lembrete, resposta, agendamento e retorno.
12. **[Operações]** Definir como consolidar expectativas próximas sem perder D-14 analítico.
13. **[Produto/Clínica]** Decidir se o nome do procedimento poderá aparecer em algum template futuro.

## 28. Dependências

- Catálogo canônico de procedimentos, produtos, materiais e variantes.
- Base promovida e reconciliada.
- Pessoa canônica e contato verificado.
- Consentimentos, opt-outs e suppression list.
- Evento confiável de procedimento concluído.
- Job queue, timeline e auditoria.
- Policy gate de canal e frequência.
- WhatsApp Business Platform oficial comprovado ponta a ponta.
- Agenda, se o hold por agendamento for ativado.
- RLS e permissões por organização/workspace.

## 29. Definição de pronto

O recurso só poderá ser chamado de “lembrete automático em produção” quando:

- as regras clínicas por produto/variante estiverem publicadas;
- o cálculo D-14 tiver testes determinísticos;
- a base canônica, identidade, consentimento e contato estiverem comprovados;
- o piloto assistido terminar sem incidente crítico;
- o canal oficial tiver envio, status, opt-out e reconciliação reais;
- o automático supervisionado estiver autorizado, monitorado e pausável;
- os critérios de aceite, segurança, RLS e auditoria tiverem evidência registrada.

Até lá, o resultado correto é classificar o módulo como **PRD**, **prévia não acionável** ou **piloto assistido**, conforme a fase alcançada.

## 30. Referências do projeto

- `Upload_Dra_Marcella_Base.md`, resumo fornecido da base da Dra. Marcella.
- `Orquestra_IA_Documento_Mestre_Continuidade_Tecnica (2).docx`, especialmente modelo de dados, consentimento, automação, agenda, jobs, WhatsApp e política de autonomia.
- `PRD_Publicos_Inteligentes_e_Clusterizacao_Adaptativa.md`, especialmente gates e `ReturnWindowDefinition`.
- `PRD_Onboarding_Inteligente_de_Dados.md`, para promoção, reconciliação, identidade e procedência.

## 31. Referências clínicas, regulatórias e de privacidade

Consultadas em 17/08/2026. Servem para governar a configuração; não substituem avaliação da responsável clínica, bula/IFU vigente do produto efetivamente usado nem orientação jurídica.

- [Anvisa — alerta sobre toxina botulínica](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2025/anvisa-alerta-sobre-risco-de-botulismo-apos-administracao-de-toxina-botulinica/), 12/03/2025.
- [AbbVie — bula brasileira BOTOX](https://www.abbvie.com.br/content/dam/abbvie-com2/br/documents/Bula_BOTOX_VPS.pdf), revisão/notificação indicada em 05/01/2026.
- [Jeisys Brasil — LinearZ](https://tecnologia.jeisys.com.br/compra-linearz-lp) e [Jeisys global — customização do LinearZ](https://www.jeisys.com/who_we_are/newsroom.php?boardid=news_room&idx=132&mode=view&offset=0&sk=&sw=).
- [Sociedade Brasileira de Dermatologia — informe sobre ultrassom microfocado](https://www.sbd.org.br/mm/cms/2021/11/12/informesbd-ultrassom-microfocado.pdf).
- [Galderma — Sculptra](https://www.galderma.com/sculptra) e [instruções de uso](https://www.galderma.com/sites/default/files/2025-03/IFU_Sculptra-Jul_2022.pdf).
- [Merz — instruções de uso Radiesse por mercado](https://www.ifu.merzaesthetics.com/products/) e [versão brasileira](https://www.ifu.merzaesthetics.com/products/versions/radiesse-lidocaine.html?cdg=br).
- [MINT PDO — informações do fabricante para pacientes](https://www.mintpdo.com/for-patients), usada apenas como exemplo de produto PDO, não como regra para outras marcas ou materiais.
- [CFM — Resolução nº 2.336/2023](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf), publicidade e comunicação médica.
- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) e [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
