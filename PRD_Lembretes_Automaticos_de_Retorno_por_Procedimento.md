# PRD — Lembretes Automáticos de Retorno por Procedimento

**Versão:** 2.0  
**Data:** 18 de agosto de 2026  
**Produto:** Projeto Consultório.ia / Orquestra IA  
**Módulo:** relacionamento e reavaliação de manutenção  
**Fonte funcional:** 37 respostas registradas em 17/08/2026 às 20:01  
**Status das regras:** `DRAFT_INTERNAL`  
**Modo de execução:** `INTERNAL_ONLY`  
**Contato externo autorizado:** `false`

Esta versão substitui o rascunho anterior e incorpora as decisões fornecidas pela Dra. Marcella. Os prazos são regras registradas para esta clínica; não são duração universal, recomendação médica individual nem autorização para contatar pacientes.

## 1. Resumo executivo

O produto deverá identificar procedimentos efetivamente concluídos, calcular um marco de reavaliação aprovado pela clínica e ativar um lembrete **exatamente 14 dias corridos antes do marco**.

Nesta versão, o sistema poderá calcular expectativas, montar prévias e encaminhar exceções para revisão. Toda execução permanece interna. Publicar uma regra clínica não autoriza automaticamente o envio: identidade, contato, consentimento, restrições, template, canal, frequência e modo de autonomia possuem aprovações próprias.

A mensagem deve convidar para uma avaliação com a Dra. Marcella. Nunca deve afirmar que o efeito terminou, que o procedimento precisa ser repetido ou que existe recomendação clínica individual.

## 2. Problema e objetivo

A clínica precisa acompanhar quando cada pessoa se aproxima do período esperado de manutenção. Uma regra genérica por “última visita” não funciona porque os marcos variam, protocolos podem ter várias sessões, retoques alteram a referência e opt-out, restrições ou agendamentos podem mudar a elegibilidade.

Além disso:

- NF, venda, pagamento ou parcela não comprovam realização;
- nome isolado não comprova identidade;
- próxima sessão, acompanhamento clínico e manutenção são jornadas diferentes;
- registros incompletos não podem ser completados por inferência da IA.

O objetivo é criar expectativas rastreáveis de reavaliação de manutenção em D-14, com regras versionadas, falha fechada e revisão humana quando necessária.

## 3. Fora do escopo

- Diagnosticar, prescrever, garantir duração ou recomendar repetição.
- Definir prazo clínico por IA, média de pacientes ou valor financeiro.
- Unir pessoas apenas pelo nome.
- Criar campanha em massa, promoção ou cadência comercial.
- Incluir prontuário, diagnóstico, exame, foto ou intercorrência na mensagem.
- Enviar quando uma regra estiver em rascunho, bloqueada, vencida ou conflitante.
- Implementar WhatsApp, agenda ou CRM paralelo sem integração oficial aprovada.
- Tratar este PRD como autorização de produção.

## 4. Tipos de retorno e governança

| Tipo | Finalidade | Cobertura |
|---|---|---|
| `maintenance_reassessment` | Reavaliação futura de manutenção | Escopo principal |
| `protocol_next_session` | Próxima sessão de uma série | Fora do MVP; Esvaziador pendente |
| `clinical_followup` | Acompanhamento após consulta ou procedimento | Fora do MVP; Consulta pendente |

Uma regra de manutenção nunca gera próxima sessão ou acompanhamento clínico por inferência.

Ciclo da regra:

```text
RECORDED -> APPROVED -> PUBLISHED -> RETIRED
                \-> REJECTED
```

Modos de execução:

- `INTERNAL_ONLY`: cálculo, simulação e prévia, sem contato;
- `ASSISTED_CONTACT_AUTHORIZED`: contato individual após aprovação humana;
- `AUTOMATIC_SUPERVISED_AUTHORIZED`: envio automático com gates, supervisão e pausa emergencial.

O estado atual é `INTERNAL_ONLY` e `external_contact_authorized=false`.

## 5. Cálculo D-14

```text
renewal_on = add_calendar_months(anchor_date, renewal_milestone_months)
activation_on = renewal_on - 14 calendar_days
```

Para uma regra formalmente definida em dias:

```text
renewal_on = anchor_date + stated_interval_days
activation_on = renewal_on - 14 calendar_days
```

Regras:

- usar meses civis, nunca blocos de 30 dias;
- subtrair 14 dias corridos, nunca úteis;
- se o dia não existir no mês de destino, usar o último dia válido;
- registrar `anchor_date`, `renewal_on` e `activation_on`;
- calcular no fuso IANA publicado pela clínica;
- reavaliar todos os gates em D-14 e antes do handoff;
- não antecipar ou atrasar silenciosamente em domingo ou feriado;
- se o job perder D-14, usar `OVERDUE_REVIEW`, sem envio retroativo automático.

Exemplo:

```text
anchor_date = 17/08/2026
renewal_milestone_months = 4
renewal_on = 17/12/2026
activation_on = 03/12/2026
```

## 6. Catálogo consolidado

Todos os marcos abaixo têm origem `RECORDED`. Nenhum está autorizado para contato externo.

| ID | Procedimento/variante | Marco | Âncora | Tratamento adicional | Estado |
|---|---|---:|---|---|---|
| `RET-TOX-DYSPORT-001` | Toxina — Dysport | 4 meses | Conclusão do protocolo | Retoque válido reinicia; escopo clínico pendente | `DRAFT_INTERNAL` |
| `RET-TOX-XEOMIN-001` | Toxina — Xeomin | 4 meses | Conclusão do protocolo | Retoque válido reinicia; escopo clínico pendente | `DRAFT_INTERNAL` |
| `RET-BIO-ELLANSE-001` | Bioestímulo — Ellansé | 12 meses | Última aplicação após protocolo concluído | Finalidade e protocolo pendentes | `DRAFT_INTERNAL` |
| `RET-BIO-ELLEVA-X-001` | Bioestímulo — Elleva X | 12 meses | Última aplicação após protocolo concluído | Finalidade e protocolo pendentes | `DRAFT_INTERNAL` |
| `RET-BIO-RADIESSE-001` | Bioestímulo — Radiesse | 12 meses | Última aplicação após protocolo concluído | Finalidade e protocolo pendentes | `DRAFT_INTERNAL` |
| `RET-FIO-PDO-LISO-001` | Fios Lisos PDO | 18 meses | Conclusão do protocolo | Material, região e protocolo pendentes | `DRAFT_INTERNAL` |
| `RET-FIO-EYEBAG-001` | Fios Eyebag | 12 meses | Conclusão do protocolo | Produto, material e protocolo pendentes | `DRAFT_INTERNAL` |
| `RET-LINEAR-Z-001` | Linear Z — regiões listadas | 6 meses | Última sessão após protocolo concluído | Região, finalidade e ponteira obrigatórias | `BLOCKED` |
| `RET-PREEN-SHAPE-LIDO-001` | Glúteo — Shape Lido | 12 meses | Conclusão do protocolo | Semântica do retoque pendente | `DRAFT_INTERNAL` |
| `RET-PREEN-LIPS-DUO-001` | Lábios — Lips Duo | 12 meses | Conclusão do protocolo | Semântica do retoque pendente | `DRAFT_INTERNAL` |
| `RET-PREEN-SUBSKIN-NARIZ-001` | Nariz — Subskin | 12 meses | Conclusão do protocolo | Semântica do retoque pendente | `DRAFT_INTERNAL` |
| `RET-PREEN-SUBSKIN-QUEIXO-001` | Queixo — Subskin | 12 meses | Conclusão do protocolo | Semântica do retoque pendente | `DRAFT_INTERNAL` |
| `RET-PERNAS-MANUTENCAO-001` | Esvaziador de pernas — manutenção | 12 meses | Conclusão do protocolo | Não usar para próxima sessão | `DRAFT_INTERNAL` |
| `RET-CONSULTA-001` | Consulta | 30 dias informados | Data da consulta | Significado e fluxo ambíguos | `BLOCKED` |

## 7. Regras específicas e exceções

### 7.1 Toxina

- O piloto começa por Dysport e Xeomin.
- O marco registrado é de quatro meses.
- A âncora é a conclusão do protocolo.
- Um retoque classificado, concluído e coberto por regra publicada reinicia a contagem.
- Região, indicação, exceções e critérios de “retoque válido” precisam ser publicados.

### 7.2 Bioestimuladores e fios

- Ellansé, Elleva X e Radiesse: 12 meses desde a última aplicação que conclui o protocolo.
- Aplicação intermediária não cria manutenção.
- Fios Lisos PDO: 18 meses desde a conclusão do protocolo.
- Fios Eyebag: 12 meses desde a conclusão do protocolo.
- As âncoras e variantes dos fios precisam ser ratificadas na publicação.

### 7.3 Linear Z

O marco registrado é de seis meses para barriga, braço, coxa, glúteos, joelho, olhos, papada, pescoço, rosto e terço inferior.

Requisitos:

- âncora na última sessão que conclui o protocolo;
- região e finalidade definem a aplicabilidade;
- ponteira é obrigatória;
- falta de ponteira ou finalidade gera `REVIEW_REQUIRED`;
- profundidade, modo e protocolo devem ser publicados ou dispensados formalmente;
- protocolo em andamento não cria manutenção.

Linear Z permanece `BLOCKED` até a publicação da matriz ou de decisão explícita de que seis meses vale para todas as combinações autorizadas.

### 7.4 Preenchedores

As quatro combinações possuem marco registrado de 12 meses. A resposta “retoque de preenchedor: sim” não define se o retoque reinicia, mantém ou complementa o ciclo. Até essa decisão, todo retoque de preenchedor gera `REVIEW_REQUIRED`.

### 7.5 Esvaziador de pernas

A resposta selecionou dois relógios:

1. próxima sessão do protocolo;
2. manutenção após o protocolo.

Somente a manutenção recebeu prazo de 12 meses. A próxima sessão pertence a `protocol_next_session` e permanece bloqueada por falta de intervalo.

### 7.6 Consulta

“Após 30 dias” permite duas interpretações:

1. marco no 30º dia, com ativação no 16º dia após a consulta;
2. mensagem de acompanhamento no próprio 30º dia.

A segunda pertence a `clinical_followup`. Consulta permanece bloqueada até a responsável clínica definir significado, template e fluxo.

## 8. Regras transversais extraídas

| Tema | Decisão registrada | Comportamento desta versão |
|---|---|---|
| Objetivo | Sugerir renovação | Comunicação convida para avaliação; nunca afirma repetição necessária. |
| Data individual | Substitui regra após aprovação | Override auditado; nunca supera gates. |
| Âncora geral | Conclusão do protocolo | Exige evento canônico `completed`. |
| Retoque geral | Reiniciar a contagem | Aplicado ao rascunho de Toxina; demais categorias dependem de publicação. |
| Novo procedimento | Revisão da equipe | `REVIEW_REQUIRED`; sem substituição silenciosa. |
| Agendamento existente | Manter o envio | Intenção preservada; revisão até existir política e template compatíveis. |
| Vencimentos próximos | Mensagem separada por procedimento | Intenção preservada; depende de frequência e deduplicação. |
| Registro incompleto | Revisão da equipe | `REVIEW_REQUIRED`, nunca envio. |
| Bloqueios escolhidos | Opt-out e restrição médica | Bloqueios absolutos, somados aos gates do sistema. |
| Informação permitida | Nome do procedimento | Somente após aprovação de privacidade; piloto usa texto neutro. |
| Responsável | Recepção | Agenda e operação; conteúdo clínico escala para equipe clínica. |
| Envio | Segunda a sábado, horário comercial | Horas, fuso, domingo e feriados pendentes. |
| Piloto | Toxina | Dysport e Xeomin, inicialmente interno. |
| Estado-alvo | Aprovação médica e depois automático | Exige piloto e liberação formal separada. |
| Indicadores | Avaliações e procedimentos realizados | Acompanhados de métricas de proteção. |

## 9. Precedência e reconciliação

Aplicar nesta ordem:

1. opt-out, restrição médica, incidente e bloqueios obrigatórios;
2. data individual aprovada;
3. regra específica de produto, finalidade, região e protocolo;
4. regra específica do procedimento;
5. regra da categoria;
6. regra geral da clínica;
7. ausência, conflito ou baixa confiança resulta em `REVIEW_REQUIRED`.

A IA nunca completa dado clínico ausente, escolhe regra por similaridade ou supera bloqueio.

Novo procedimento compatível concluído vai para revisão. A revisão cancela, substitui ou mantém a expectativa anterior explicitamente. Nunca devem existir duas expectativas ativas para a mesma relação canônica.

## 10. Gates obrigatórios

Antes de preparar ou enviar qualquer mensagem, exigir:

### Evento e regra

- procedimento comprovado como concluído;
- data-âncora válida e não futura;
- pessoa canônica resolvida;
- exatamente uma regra `PUBLISHED` e vigente;
- variantes obrigatórias preenchidas;
- nenhum conflito entre eventos ou versões.

### Identidade, consentimento e restrições

- não unir pessoas somente pelo nome;
- telefone verificado e vinculado à pessoa;
- opt-out geral e do canal ausentes;
- finalidade, base legal e permissão publicadas;
- suppression list reavaliada;
- nenhuma restrição médica, reclamação, intercorrência ou possível evento adverso ativo;
- estado desconhecido falha fechado.

### Operação e canal

- template aprovado e vigente;
- canal oficial comprovado ponta a ponta;
- horário, fuso e política de feriados publicados;
- limite de frequência disponível;
- idempotência e reconciliação testadas;
- feature flag, modo de autonomia e pausa emergencial autorizados.

Os gates são rechecados na criação, em D-14, na reserva e antes do handoff.

## 11. Fluxo da expectativa

```text
DETECTED
  -> NEEDS_DATA | AWAITING_RULE
  -> SCHEDULED_INTERNAL
  -> DUE_REVIEW
  -> READY_ASSISTED
  -> DISPATCH_RESERVED
  -> DISPATCHED
  -> RESPONDED | BOOKED | CLOSED
```

Estados de exceção:

- `BLOCKED_OPT_OUT`
- `BLOCKED_MEDICAL_RESTRICTION`
- `BLOCKED_IDENTITY`
- `BLOCKED_POLICY_MISSING`
- `BLOCKED_CHANNEL`
- `REVIEW_REQUIRED`
- `OVERDUE_REVIEW`
- `CANCELLED`
- `SUPERSEDED`
- `FAILED`

Toda transição registra ator, horário, motivo, regra e versão. `DISPATCHED` só pode ocorrer com autorização externa explícita.

## 12. Mensagem e atendimento

Texto selecionado:

> Olá, [nome]. Seu período de acompanhamento está se aproximando. Podemos ajudar você a agendar uma avaliação com a Dra. Marcella?

Texto consolidado para aprovação:

> Olá, [nome]. Seu período de acompanhamento está se aproximando. Podemos ajudar você a agendar uma avaliação com a Dra. Marcella? Este lembrete não significa que seja necessário repetir qualquer procedimento; essa decisão depende de avaliação individual. Se não quiser receber novos lembretes, é só nos avisar.

Regras:

- piloto usa mensagem neutra, sem nome do procedimento;
- nome do procedimento só aparece após aprovação clínica e de privacidade;
- não usar urgência, medo, desconto, diagnóstico ou promessa;
- não afirmar término de efeito;
- não prometer horário automaticamente;
- usar o mínimo de dado pessoal necessário.

Tratamento das respostas:

| Resposta | Ação |
|---|---|
| Deseja agendar | Recepção assume o atendimento. |
| Dúvida clínica | Encaminhar à equipe clínica. |
| Reclamação ou possível intercorrência | Pausar automação e escalar imediatamente. |
| Recusa clara de contato | Registrar opt-out e cancelar ações pendentes. |
| Resposta ambígua | Revisão humana. |

Qualquer resposta que indique não desejar contato interrompe novos lembretes.

## 13. Agenda existente e múltiplos vencimentos

A decisão registrada é manter o envio mesmo com agendamento. Antes de executar, definir quais agendamentos são compatíveis, se a mensagem continua necessária, um template sem convite redundante e a frequência entre confirmação e lembrete. Até lá:

```text
future_compatible_appointment -> REVIEW_REQUIRED
```

A decisão registrada para vencimentos próximos é uma mensagem separada por procedimento. Antes de executar, definir máximo por pessoa, intervalo mínimo, prioridade no mesmo dia e deduplicação. No piloto interno, mostrar uma única prévia neutra consolidada no mesmo dia, preservando o vínculo com cada expectativa.

## 14. Piloto de Toxina

Escopo inicial:

- uma clínica e um workspace;
- Dysport e Xeomin;
- marco de quatro meses e ativação D-14;
- dados sintéticos ou prévias internas primeiro;
- pequeno lote somente após autorização assistida;
- revisão individual antes de cada contato;
- recepção responsável pelas respostas;
- WhatsApp oficial, opt-out ponta a ponta e pausa emergencial obrigatórios.

Para sair de `INTERNAL_ONLY`:

- regras de Toxina `PUBLISHED`, com escopo e vigência;
- identidade e telefone validados;
- consentimento e privacidade aprovados;
- template aprovado;
- horário, fuso, domingos, feriados e frequência definidos;
- canal oficial validado ponta a ponta;
- testes de idempotência, opt-out e pausa aprovados;
- autorização formal `ASSISTED_CONTACT_AUTHORIZED`.

Automação supervisionada só poderá ser considerada após um piloto assistido sem contato incorreto, opt-out violado, duplicidade grave ou perda de rastreabilidade, e mediante nova aprovação formal.

## 15. Modelo mínimo e idempotência

Entidades:

- `ProcedureReturnRule`: regra, versão, vigência, seletores, âncora e aprovadores;
- `ReturnExpectation`: pessoa, evento, regra, datas e estado;
- `ReminderDecision`: gates, template, canal, ator e resultado;
- `PatientPreference`: canal, finalidade, opt-out, fonte e auditoria.

Chave de idempotência:

```text
workspace_id + person_id + procedure_relation_key + activation_on + rule_version + template_version
```

Retry, reimportação ou duplicidade financeira não podem gerar segundo envio com a mesma chave.

## 16. Requisitos

### Funcionais

- Distinguir venda, pagamento, sessão, retoque, protocolo concluído e consulta.
- Resolver identidade sem nome isolado.
- Versionar e publicar regras clínicas.
- Calcular meses civis e D-14 de forma reproduzível.
- Aplicar override somente com aprovação auditada.
- Encaminhar novo procedimento, conflito e registro incompleto para revisão.
- Recalcular retoque somente quando a regra publicada permitir.
- Revalidar opt-out, restrições e identidade antes do handoff.
- Impedir duplicidade em retry e reimportação.
- Separar manutenção, próxima sessão e acompanhamento clínico.
- Disponibilizar fila de revisão, pausa global e auditoria.
- Nunca executar contato externo em `INTERNAL_ONLY`.

### Não funcionais

- LGPD por finalidade, minimização, retenção e rastreabilidade.
- RLS e isolamento por workspace.
- Criptografia em trânsito e em repouso.
- Logs sem conteúdo clínico desnecessário.
- Auditoria imutável de regra, gate, decisão e handoff.
- Jobs idempotentes, observáveis e reconciliáveis.
- Métricas e alertas para atraso, duplicidade, opt-out e falha de canal.
- Feature flags, kill switch e backfill somente como prévia.

## 17. Métricas

Resultados do piloto:

- avaliações agendadas;
- procedimentos efetivamente realizados;
- respostas recebidas;
- tempo até atendimento da recepção.

Métricas de proteção:

- contato com pessoa errada;
- opt-out desrespeitado;
- duplicidade;
- envio após restrição médica;
- expectativa sem regra publicada;
- itens em revisão e tempo de resolução;
- falha ou atraso de processamento;
- pedidos de interrupção.

Resultados de agenda e procedimento são associação operacional, não causalidade comprovada.

## 18. Critérios de aceite

1. Dysport e Xeomin concluídos calculam quatro meses e D-14 em simulação.
2. Bioestímulo usa a última aplicação que conclui o protocolo.
3. Aplicação intermediária não cria manutenção.
4. Fios Lisos PDO usam 18 meses e Eyebag 12 meses.
5. Linear Z incompleto ou em protocolo aberto vai para revisão.
6. Preenchedor com retoque fica em revisão até publicação da semântica.
7. Esvaziador cria manutenção de 12 meses sem inventar próxima sessão.
8. Consulta não cria lembrete enquanto a ambiguidade de 30 dias persistir.
9. Data individual sem aprovação é rejeitada.
10. Override aprovado não supera opt-out ou restrição médica.
11. Novo procedimento compatível cria revisão, não segunda expectativa silenciosa.
12. Registro financeiro sem conclusão não cria expectativa.
13. Homônimo ou identidade incerta permanece bloqueado.
14. Opt-out cancela ações pendentes antes do handoff.
15. D-14 usa dias corridos, meses civis, fim de mês e ano bissexto corretamente.
16. Domingo, feriado ou job atrasado não deslocam envio silenciosamente.
17. Retry com a mesma chave não duplica decisão ou envio.
18. Regra alterada preserva a versão usada na expectativa.
19. Múltiplos vencimentos aparecem consolidados na prévia interna do piloto.
20. `INTERNAL_ONLY` impede qualquer handoff externo.

## 19. Pendências para publicação e produção

- `P01` Confirmar nome, papel e autoridade da respondente.
- `P02` Registrar aprovadores clínico, operacional e de privacidade.
- `P03` Definir região, indicação, exceções e retoque válido de Toxina.
- `P04` Publicar finalidade e protocolo dos bioestimuladores.
- `P05` Ratificar âncoras e variantes dos fios.
- `P06` Publicar ou dispensar formalmente a matriz de Linear Z.
- `P07` Definir a semântica do retoque de preenchedor.
- `P08` Definir o intervalo da próxima sessão do Esvaziador.
- `P09` Resolver a ambiguidade da Consulta em 30 dias.
- `P10` Definir política para agendamento existente.
- `P11` Definir frequência e múltiplos vencimentos.
- `P12` Fixar horário, fuso, domingo e feriados.
- `P13` Aprovar template, menção ao procedimento e opt-out.
- `P14` Aprovar finalidade, base legal, retenção e canal.
- `P15` Comprovar integração oficial, idempotência, monitoramento e pausa.

Resolver pendências não concede autorização externa automaticamente.

## 20. Configuração estruturada de referência

Esta configuração é documental. `DRAFT_INTERNAL` e `BLOCKED` nunca podem ser tratados como executáveis.

```yaml
schema_version: reminder-rules.v2
source:
  submitted_at: "2026-08-17T20:01:00-03:00"
  answers_count: 37

governance:
  production_authorization: false
  external_contact_authorized: false
  execution_mode: INTERNAL_ONLY
  reminder_lead_days: 14
  timezone: PENDING_DECISION

rules:
  toxin:
    anchor: protocol_completed_on
    retouch_behavior: reset_when_valid_and_published
    products:
      dysport: { milestone_months: 4, status: DRAFT_INTERNAL }
      xeomin: { milestone_months: 4, status: DRAFT_INTERNAL }

  biostimulator:
    anchor: last_application_that_completes_protocol
    products:
      ellanse: { milestone_months: 12, status: DRAFT_INTERNAL }
      elleva_x: { milestone_months: 12, status: DRAFT_INTERNAL }
      radiesse: { milestone_months: 12, status: DRAFT_INTERNAL }

  threads:
    anchor: protocol_completed_on
    products:
      smooth_pdo: { milestone_months: 18, status: DRAFT_INTERNAL }
      eyebag: { milestone_months: 12, status: DRAFT_INTERNAL }

  linear_z:
    milestone_months: 6
    anchor: last_session_that_completes_protocol
    regions: [barriga, braco, coxa, gluteos, joelho, olhos, papada, pescoco, rosto, terco_inferior]
    required_for_eligibility: [region, purpose, tip]
    depth_mode_protocol: PENDING_DECISION
    missing_variant: REVIEW_REQUIRED
    status: BLOCKED

  filler:
    anchor: protocol_completed_on
    retouch_behavior: PENDING_DECISION
    products:
      shape_lido_gluteo: { milestone_months: 12, status: DRAFT_INTERNAL }
      lips_duo_labios: { milestone_months: 12, status: DRAFT_INTERNAL }
      subskin_nariz: { milestone_months: 12, status: DRAFT_INTERNAL }
      subskin_queixo: { milestone_months: 12, status: DRAFT_INTERNAL }

  leg_enzymes:
    maintenance: { milestone_months: 12, anchor: protocol_completed_on, status: DRAFT_INTERNAL }
    next_session: { interval: PENDING_DECISION, status: BLOCKED }

  consultation:
    stated_interval_days: 30
    flow_type: PENDING_DECISION
    status: BLOCKED

transversal:
  individual_override: requires_approval_and_audit
  new_compatible_procedure: REVIEW_REQUIRED
  future_compatible_appointment: REVIEW_REQUIRED
  multiple_due_procedures: REVIEW_REQUIRED
  incomplete_record: REVIEW_REQUIRED
  opt_out: ABSOLUTE_BLOCK
  medical_restriction: ABSOLUTE_BLOCK
  responsible_team: recepcao
  sending_days: [monday, tuesday, wednesday, thursday, friday, saturday]
  sending_hours: PENDING_DECISION

pilot:
  first_category: toxin
  current_mode: INTERNAL_ONLY
  next_possible_mode: ASSISTED_CONTACT_AUTHORIZED
  target_mode: AUTOMATIC_SUPERVISED_AUTHORIZED
  primary_outcomes: [evaluations_booked, procedures_completed]
```

## 21. Definição de pronto

O PRD estará pronto para implementação quando:

- as pendências P01–P15 tiverem decisão registrada;
- as regras do piloto estiverem `PUBLISHED` e versionadas;
- identidade, consentimento e restrições estiverem validados;
- template e canal oficial estiverem aprovados;
- cálculo D-14, idempotência e reconciliação tiverem testes aprovados;
- existir plano de piloto assistido, monitoramento, auditoria e pausa;
- o modo continuar `INTERNAL_ONLY` até autorização externa separada.

Até lá, este documento é a especificação canônica do produto e a base para simulação, revisão clínica e planejamento técnico.
