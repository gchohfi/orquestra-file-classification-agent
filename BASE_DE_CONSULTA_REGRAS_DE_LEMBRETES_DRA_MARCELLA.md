# Base de Consulta — Regras de Lembretes de Retorno da Dra. Marcella

**Versão:** 1.1  
**Data da consolidação:** 17/08/2026  
**Fonte principal:** questionário enviado em 17/08/2026 às 20:01  
**Documento relacionado:** [PRD — Lembretes Automáticos de Retorno por Procedimento](./PRD_Lembretes_Automaticos_de_Retorno_por_Procedimento.md)  
**Status:** base canônica para consulta, simulação interna e preparação do piloto  
**Autorização para disparo automático:** não concedida por este documento
**Autorização para qualquer contato externo:** `false`

---

## 1. Finalidade

Este documento consolida as respostas fornecidas sobre prazos, datas de referência, bloqueios, mensagem, atendimento e piloto dos lembretes de retorno da clínica.

Ele deve ser usado como base para:

- consultar as decisões já registradas;
- configurar simulações do motor de lembretes;
- orientar a revisão do PRD;
- preparar regras versionadas para aprovação;
- identificar rapidamente o que ainda impede a automação;
- evitar que futuras conversas reinterpretarem silenciosamente as respostas.

Este documento **não**:

- valida clinicamente os prazos escolhidos;
- substitui avaliação individual da paciente;
- comprova consentimento ou autorização para WhatsApp;
- autoriza contato com pacientes;
- transforma uma duração estimada em obrigação de repetir procedimento;
- substitui os gates de identidade, privacidade, canal e auditoria do PRD.

## 2. Como interpretar esta base

Uma regra possui três dimensões independentes. Elas nunca devem ser tratadas como sinônimos:

| Dimensão | Valores | Significado |
|---|---|---|
| Origem da decisão | `RECORDED`, `SYSTEM_REQUIRED`, `INFERRED`, `PENDING_DECISION` | Indica de onde veio a informação. `RECORDED` significa apenas que a alternativa foi selecionada no questionário; não significa validação clínica. |
| Publicação da regra | `DRAFT_INTERNAL`, `BLOCKED`, `PUBLISHED` | Indica se a regra já foi formalmente aprovada, versionada e publicada. |
| Execução | `INTERNAL_ONLY`, `ASSISTED_CONTACT_AUTHORIZED`, `AUTOMATIC_SUPERVISED_AUTHORIZED` | Indica o maior efeito externo permitido. A autorização precisa ser formal, versionada e possuir escopo. |
| Resultado da avaliação | `INTERNAL_PREVIEW`, `REVIEW_REQUIRED`, `BLOCKED` | Define o encaminhamento atual. `REVIEW_REQUIRED` e `BLOCKED` nunca geram envio. |

Estado global desta versão:

```text
rule_publication = DRAFT_INTERNAL ou BLOCKED
execution = INTERNAL_ONLY
external_contact_authorized = false
```

Portanto, “candidata a piloto” significa apenas que a regra pode ser simulada, gerar uma prévia interna e passar por revisão. Não significa que uma pessoa revisora possa enviá-la. Um piloto com contato real exige uma autorização posterior e explícita no estado `ASSISTED_CONTACT_AUTHORIZED`.

`REVIEW_REQUIRED` e `BLOCKED` são estados **não enviáveis**. A recepção resolve questões operacionais; a responsável clínica resolve conteúdo clínico; e privacidade/jurídico resolvem canal, consentimento e retenção. Toda resolução deve registrar decisão, responsável e validade, e expira se a regra mudar ou o evento for substituído. A resolução cria uma nova avaliação de elegibilidade, nunca um envio imediato.

Em caso de conflito, a ordem de precedência é:

1. opt-out, restrição médica e demais gates obrigatórios;
2. data individual aprovada para a paciente;
3. regra específica de produto, finalidade, região ou protocolo;
4. regra da categoria do procedimento;
5. regra geral da clínica;
6. ausência ou conflito de regra resulta em revisão humana, nunca em escolha automática da IA.

Entre este documento e o PRD, os gates obrigatórios de segurança, identidade, privacidade e auditoria do PRD prevalecem. Qualquer conflito funcional permanece em revisão até decisão formal. Nenhum dos dois documentos, isoladamente, autoriza produção.

### 2.1 Rastreabilidade da fonte

A fonte recebida foi o conjunto textual das 37 respostas, com horário de envio informado como 17/08/2026 às 20:01. Nesta versão ainda não estão comprovados:

- nome, papel e autoridade de quem respondeu;
- hash ou anexo imutável da submissão original;
- assinatura de aprovação clínica, operacional e de privacidade;
- versão ou hash do PRD vigente no momento da resposta.

Assim, os prazos abaixo são decisões registradas da clínica, e não intervalos clinicamente validados por esta base.

## 3. Decisões centrais

| Tema | Decisão registrada | Estado atual |
|---|---|---|
| Objetivo interno | Sugerir renovação do procedimento | `RECORDED`; a comunicação externa deve falar em reavaliação de manutenção |
| Antecedência | Ativar 14 dias antes do marco | `RECORDED`; publicação pendente |
| Data individual | Substitui a regra automática após aprovação da equipe | `RECORDED`; exige override auditado |
| Âncora geral | Data da conclusão do protocolo | `RECORDED`; campos de comprovação pendentes |
| Retoque | Reinicia a contagem a partir do retoque | `RECORDED`; aplicabilidade por categoria pendente |
| Repetição do procedimento | Enviar para revisão da equipe | `RECORDED`; precisa ser reconciliada com a supersessão automática prevista no PRD |
| Agendamento já existente | Manter o envio | `RECORDED`; `PENDING_DECISION` por conflito com o PRD |
| Vários procedimentos próximos | Uma mensagem separada por procedimento | `RECORDED`; depende de limite de frequência e deduplicação |
| Registro incompleto | Enviar para revisão da equipe | `RECORDED`; estado não enviável |
| Responsável pelas respostas | Recepção | `RECORDED` |
| Dias de envio | Segunda a sábado, em horário comercial | `RECORDED`; horário exato e domingos/feriados pendentes |
| Piloto inicial | Toxina | `RECORDED`; somente simulação interna nesta versão |
| Modo desejado | Aprovação médica das regras e depois envio automático | Estado-alvo; piloto deve começar assistido |
| Indicadores comerciais | Avaliações agendadas e procedimentos realizados | `RECORDED` |

## 4. Regra de cálculo D-14

Para marcos definidos em meses:

```text
renewal_on = add_calendar_months(anchor_date, renewal_milestone_months)
activation_on = renewal_on - 14 calendar_days
```

Regras do cálculo:

- usar meses de calendário, e não blocos de 30 dias;
- usar dias corridos para a subtração dos 14 dias;
- se o dia não existir no mês de destino, usar o último dia válido;
- registrar separadamente `anchor_date`, `renewal_on` e `activation_on`;
- calcular no fuso da clínica, que ainda deve ser confirmado formalmente;
- ativar não significa enviar: todos os gates são reavaliados antes do contato.

Exemplo condicional:

```text
Âncora: 17/08/2026
Marco: 4 meses
renewal_on: 17/12/2026
activation_on: 03/12/2026
```

## 5. Catálogo consolidado de marcos

Todos os marcos numéricos desta tabela têm origem `RECORDED`. As condições adicionais podem conter gates `SYSTEM_REQUIRED` ou pontos `PENDING_DECISION`; nenhuma linha está `PUBLISHED` nesta versão.

| ID da regra | Procedimento ou variante | Marco | Âncora | Condição adicional | Estado |
|---|---|---:|---|---|---|
| `RET-TOX-DYSPORT-001` | Toxina — Dysport | 4 meses | Conclusão do protocolo | Retoque válido reinicia o ciclo; região, indicação, exceções e definição de protocolo concluído ainda pendentes | `DRAFT_INTERNAL`; candidata à simulação do piloto |
| `RET-TOX-XEOMIN-001` | Toxina — Xeomin | 4 meses | Conclusão do protocolo | Retoque válido reinicia o ciclo; região, indicação, exceções e definição de protocolo concluído ainda pendentes | `DRAFT_INTERNAL`; candidata à simulação do piloto |
| `RET-BIO-ELLANSE-001` | Bioestímulo — Ellansé | 12 meses | Última aplicação | Protocolo precisa estar concluído | `DRAFT_INTERNAL`; escopo de finalidade/protocolo pendente |
| `RET-BIO-ELLEVA-X-001` | Bioestímulo — Elleva X | 12 meses | Última aplicação | Protocolo precisa estar concluído | `DRAFT_INTERNAL`; escopo de finalidade/protocolo pendente |
| `RET-BIO-RADIESSE-001` | Bioestímulo — Radiesse | 12 meses | Última aplicação | Protocolo precisa estar concluído | `DRAFT_INTERNAL`; escopo de finalidade/protocolo pendente |
| `RET-FIO-PDO-LISO-001` | Fios Lisos PDO | 18 meses | Conclusão do protocolo | Material, região e protocolo aplicáveis precisam ser publicados | `DRAFT_INTERNAL` |
| `RET-FIO-EYEBAG-001` | Fios Eyebag | 12 meses | Conclusão do protocolo | Produto/material e protocolo precisam ser confirmados | `DRAFT_INTERNAL` |
| `RET-LINEAR-Z-001` | Linear Z — regiões listadas | 6 meses | Última sessão | Região, finalidade e ponteira obrigatórias; ausência vai para revisão | `BLOCKED` até resolver a matriz |
| `RET-PREEN-SHAPE-LIDO-001` | Glúteo — Shape Lido | 12 meses | Conclusão do protocolo | A resposta “sim” para retoque precisa ser traduzida em regra executável | `DRAFT_INTERNAL` |
| `RET-PREEN-LIPS-DUO-001` | Lábios — Lips Duo | 12 meses | Conclusão do protocolo | A resposta “sim” para retoque precisa ser traduzida em regra executável | `DRAFT_INTERNAL` |
| `RET-PREEN-SUBSKIN-NARIZ-001` | Nariz — Subskin | 12 meses | Conclusão do protocolo | A resposta “sim” para retoque precisa ser traduzida em regra executável | `DRAFT_INTERNAL` |
| `RET-PREEN-SUBSKIN-QUEIXO-001` | Queixo — Subskin | 12 meses | Conclusão do protocolo | A resposta “sim” para retoque precisa ser traduzida em regra executável | `DRAFT_INTERNAL` |
| `RET-PERNAS-MANUTENCAO-001` | Esvaziador de pernas — manutenção | 12 meses | Conclusão do protocolo | Não usar como prazo da próxima sessão | `DRAFT_INTERNAL` |
| `RET-CONSULTA-001` | Consulta | 30 dias | Data da consulta | Fluxo e significado do prazo ainda não definidos | `BLOCKED` |

### 5.1 Linear Z

O marco registrado é de seis meses para todas as regiões abaixo:

- barriga;
- braço;
- coxa;
- glúteos;
- joelho;
- olhos;
- papada;
- pescoço;
- rosto;
- terço inferior.

Interpretação mais consistente das respostas:

- região e finalidade determinam a aplicabilidade da regra;
- ponteira é um campo obrigatório para elegibilidade, mesmo sem alterar o prazo nesta versão;
- ausência de ponteira ou finalidade envia o item para revisão;
- profundidade, modo e protocolo ainda precisam ser confirmados como campos obrigatórios ou formalmente dispensados;
- uma série ainda em andamento não cria lembrete de manutenção.

### 5.2 Esvaziador de pernas

A resposta selecionou dois tipos de retorno:

1. próxima sessão do protocolo;
2. manutenção após o protocolo.

Somente a manutenção recebeu prazo de 12 meses. O prazo da próxima sessão continua sem definição e deve pertencer ao fluxo `protocol_next_session`, separado de `maintenance_reassessment`.

### 5.3 Consulta

Foi escolhido “sim, após 30 dias”. Existem duas interpretações possíveis:

1. o retorno ocorre no 30º dia e o lembrete é ativado 14 dias antes, portanto no 16º dia após a consulta;
2. a mensagem de acompanhamento é enviada no próprio 30º dia.

A segunda interpretação pertence ao fluxo `clinical_followup`, e não ao ciclo de manutenção. Nenhuma regra de consulta deve ser publicada até essa decisão ser registrada.

## 6. Retoque, repetição e nova âncora

### 6.1 Retoque

A resposta geral registrou que o retoque reinicia a contagem. Para Toxina, essa é a interpretação funcional adotada no rascunho. Para preenchedores, a resposta específica foi apenas “sim” e ainda precisa confirmar se significa reiniciar o ciclo, manter o marco ou somente registrar o complemento. Nas demais categorias, a aplicabilidade também precisa ser publicada expressamente.

Quando uma regra publicada determinar que o retoque reinicia o ciclo, o evento deve:

- estar concluído;
- ser vinculado à pessoa canônica correta;
- identificar procedimento, produto e região aplicáveis;
- indicar explicitamente que é um retoque;
- preservar a relação com o procedimento original;
- registrar a regra e versão usadas no recálculo.

### 6.2 Repetição do mesmo procedimento

A resposta do questionário determina revisão da equipe. O PRD, por outro lado, prevê que um novo procedimento compatível e concluído substitua a expectativa anterior automaticamente.

Até a reconciliação formal:

```text
novo_procedimento_compativel → REVIEW_REQUIRED
```

O sistema não deverá manter duas expectativas ativas da mesma relação nem decidir silenciosamente qual evento é a âncora.

### 6.3 Data individual

Uma data individual aprovada tem prioridade sobre o marco padrão, mas o override deve registrar:

- pessoa que aprovou;
- data e hora da aprovação;
- motivo;
- data escolhida;
- procedimento ou expectativa afetada;
- vigência;
- versão da regra substituída.

O override nunca pode ignorar opt-out, restrição médica ou outro gate obrigatório.

## 7. Bloqueios e revisão humana

### 7.1 Bloqueios selecionados no questionário

- paciente pediu para não receber mensagens;
- restrição registrada pela médica.

### 7.2 Gates obrigatórios do sistema

As escolhas do questionário não substituem os seguintes bloqueios:

- identidade ambígua ou pessoa identificada apenas pelo nome;
- telefone não verificado ou sem evidência de pertencimento;
- consentimento, base legal ou permissão do canal ausentes;
- reclamação, intercorrência ou possível evento adverso;
- acompanhamento clínico incompatível ainda em andamento;
- procedimento não comprovado como concluído;
- produto, material, finalidade, região ou protocolo obrigatórios ausentes;
- regra inexistente, vencida, conflitante ou não publicada;
- opt-out geral ou específico do canal;
- template, canal ou integração indisponíveis;
- limite de frequência excedido;
- agendamento ou novo procedimento em situação ainda não reconciliada;
- atraso operacional que retire o item da janela prevista.

Quando houver dúvida, a saída é `BLOCKED` ou `REVIEW_REQUIRED`. A IA não completa dados clínicos ausentes nem escolhe uma regra por semelhança.

## 8. Mensagem e atendimento

### 8.1 Decisões registradas

- o nome do procedimento pode ser mencionado;
- o template selecionado é genérico e não menciona o procedimento;
- toda mensagem deve informar que não existe obrigação de repetir;
- qualquer intenção clara de não receber contato interrompe futuros lembretes;
- a recepção responde aos pedidos de agenda;
- o envio ocorre de segunda a sábado, em horário comercial ainda não detalhado.

### 8.2 Template-base selecionado

> Olá, [nome]. Seu período de acompanhamento está se aproximando. Podemos ajudar você a agendar uma avaliação com a Dra. Marcella?

Esse texto ainda não cumpre sozinho as decisões sobre não obrigatoriedade e opt-out.

### 8.3 Template consolidado pendente de aprovação

> Olá, [nome]. Seu período de acompanhamento está se aproximando. Podemos ajudar você a agendar uma avaliação com a Dra. Marcella? Este lembrete não significa que seja necessário repetir qualquer procedimento; essa decisão depende de avaliação individual. Se não quiser receber novos lembretes, é só nos avisar.

No piloto, usar mensagem neutra. A inclusão do nome do procedimento depende de aprovação clínica e de privacidade, consentimento compatível e confirmação do canal da pessoa.

### 8.4 Encaminhamento das respostas

| Resposta da paciente | Ação |
|---|---|
| Deseja agendar | Recepção assume o atendimento, sem prometer horário automaticamente |
| Dúvida clínica | Encaminhar à equipe clínica |
| Reclamação ou possível intercorrência | Pausar automação e escalar à equipe clínica |
| Não deseja contato | Registrar opt-out e cancelar ações pendentes |
| Resposta ambígua | Revisão humana; não interpretar automaticamente como consentimento ou opt-out definitivo |

## 9. Agendamento existente e frequência

### 9.1 Agendamento existente

A resposta registrada foi “manter o envio”. O PRD determina que um agendamento futuro compatível coloque o lembrete em espera.

Até uma decisão formal reconciliar as duas políticas:

```text
future_appointment_compatible → REVIEW_REQUIRED
```

### 9.2 Procedimentos com vencimentos próximos

A resposta selecionou mensagens separadas. Antes de publicar essa política, devem ser definidos:

- intervalo mínimo entre mensagens;
- quantidade máxima por pessoa e período;
- comportamento quando duas ativações ocorrem no mesmo dia;
- prioridade entre procedimentos;
- conteúdo que evite exposição desnecessária.

No piloto, a política mais segura continua sendo uma ação neutra consolidada quando duas expectativas ativarem no mesmo dia.

## 10. Calendário de envio

Decisão registrada:

```text
dias_permitidos = segunda a sábado
janela = horário comercial
```

Pontos ainda obrigatórios:

- hora inicial e final;
- fuso IANA da clínica;
- feriados e dias silenciosos;
- comportamento quando D-14 cair no domingo;
- comportamento quando o job atrasar;
- SLA de revisão e resposta.

`activation_on` deve continuar sendo calculado exatamente em D-14. Se o canal não puder enviar naquele dia, o item não poderá ser antecipado ou atrasado silenciosamente.

## 11. Piloto de Toxina

### 11.1 Escopo proposto

- Dysport com marco de quatro meses;
- Xeomin com marco de quatro meses;
- eventos concluídos e reconciliados;
- data-âncora identificável;
- revisão humana antes de cada contato;
- template neutro;
- opt-out verificado antes do handoff;
- apenas um workspace ou unidade inicialmente;
- pausa emergencial disponível.

### 11.2 Modo de autonomia

A resposta descreve o estado-alvo: a médica aprova as regras e os envios passam a ser automáticos. Para o início do piloto, a base adota:

```text
modo_atual = internal_only
próximo_modo_possível = assisted_contact_authorized
modo_alvo_declarado = automatic_supervised_authorized
```

`automatic_supervised_authorized` ainda precisa definir se existe aprovação humana por regra, lote, pessoa ou mensagem, além de limites, auditoria, pausa e reversão. Enquanto isso não estiver formalizado, o termo descreve apenas uma intenção futura e não um modo executável.

Qualquer mudança de modo depende de aprovação formal, com responsável, escopo, vigência e critérios de saída. A resolução das pendências desta base não muda o modo automaticamente.

### 11.3 Indicadores

Indicadores escolhidos:

- avaliações agendadas;
- procedimentos efetivamente realizados.

Indicadores obrigatórios de proteção:

- mensagens duplicadas;
- contato com identidade errada;
- opt-outs respeitados;
- reclamações e intercorrências;
- candidatos bloqueados por motivo;
- entregas, falhas e respostas;
- rastreabilidade entre evento, regra, mensagem e resultado.

## 12. Pendências bloqueadoras

| ID | Decisão pendente | Owner sugerido | Impacto |
|---|---|---|---|
| `P01` | Confirmar se agendamento compatível mantém ou suspende o lembrete | Clínica + Operações | Bloqueia política de elegibilidade |
| `P02` | Definir limite e consolidação de mensagens próximas | Operações + Privacidade | Bloqueia frequência segura |
| `P03` | Publicar os campos obrigatórios do Linear Z | Responsável clínica | Bloqueia Linear Z |
| `P04` | Definir o intervalo da próxima sessão do esvaziador | Responsável clínica | Bloqueia `protocol_next_session` |
| `P05` | Definir o significado do retorno de consulta em 30 dias | Responsável clínica | Bloqueia consulta |
| `P06` | Definir domingo, feriados, horário e fuso | Operações | Bloqueia agenda de envio |
| `P07` | Aprovar o template completo com não obrigatoriedade e opt-out | Clínica + Privacidade | Bloqueia mensagem |
| `P08` | Reconciliar revisão de novo procedimento com supersessão automática | Clínica + Produto | Bloqueia recálculo automático |
| `P09` | Definir fonte que comprova procedimento concluído | Dados + Operações | Bloqueia criação de expectativas |
| `P10` | Aprovar identidade, consentimento, retenção e canal | Privacidade + Jurídico | Bloqueia qualquer contato |
| `P11` | Comprovar integração oficial, webhook e reconciliação | Tecnologia | Bloqueia efeito externo |
| `P12` | Registrar aprovador, versão, vigência e autoridade da resposta | Responsável clínica | Bloqueia publicação das regras |
| `P13` | Publicar região, indicação, exceções, protocolo concluído e retoque válido para Toxina | Responsável clínica | Bloqueia piloto com contato real |
| `P14` | Definir a supervisão automática: aprovação por regra, lote, pessoa ou mensagem | Clínica + Operações + Produto | Bloqueia modo automático supervisionado |
| `P15` | Definir em quais categorias o retoque reinicia o ciclo e esclarecer preenchedores | Responsável clínica | Bloqueia recálculo por retoque fora de Toxina |

Resolver `P01` a `P15` é necessário, mas não concede autorização externa. Depois disso, ainda deve existir um registro formal de liberação com modo, regras, população, canal, período, responsáveis e possibilidade de pausa.

## 13. Critérios mínimos para considerar uma regra publicada

Uma regra só pode mudar de rascunho para publicada quando possuir:

- ID e versão;
- procedimento e variantes aplicáveis;
- marco único executável;
- data-âncora;
- política de retoque e repetição;
- campos obrigatórios;
- responsável clínico identificado;
- aprovação clínica, operacional e de privacidade;
- data de vigência;
- template aplicável;
- critérios de bloqueio;
- testes de cálculo e fim de mês;
- trilha de auditoria.

Regras publicadas são imutáveis. Qualquer mudança cria uma nova versão e não reescreve contatos já realizados.

## 14. Configuração estruturada de referência

O bloco abaixo serve para consulta técnica. Ele não deve ser importado diretamente em produção enquanto houver pendências bloqueadoras.

```yaml
document:
  version: "1.1"
  status: consultation_base
  source_submission_at: "2026-08-17T20:01:00-03:00"
  production_authorization: false
  external_contact_authorized: false
  execution_mode: INTERNAL_ONLY

calculation:
  reminder_lead_days: 14
  month_semantics: calendar_months
  activation_semantics: calendar_days
  timezone: PENDING_DECISION

precedence:
  - mandatory_gates
  - approved_patient_override
  - procedure_specific_rule
  - category_rule
  - clinic_default
  - human_review

clinic_defaults:
  anchor: protocol_completed_on
  retouch_recorded_behavior: resets_cycle
  retouch_scope: PENDING_DECISION
  retouch_execution: BLOCKED
  repeated_procedure: REVIEW_REQUIRED
  incomplete_record: REVIEW_REQUIRED
  future_appointment: REVIEW_REQUIRED
  multiple_due_procedures: REVIEW_REQUIRED

rules:
  toxin:
    dysport:
      milestone_months: 4
      anchor: protocol_completed_on
      publication_status: DRAFT_INTERNAL
      execution_status: INTERNAL_ONLY
      pilot_candidate: true
    xeomin:
      milestone_months: 4
      anchor: protocol_completed_on
      publication_status: DRAFT_INTERNAL
      execution_status: INTERNAL_ONLY
      pilot_candidate: true

  biostimulation:
    anchor: last_application_after_protocol_completion
    products:
      ellanse: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
      elleva_x: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
      radiesse: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }

  threads:
    smooth_pdo: { milestone_months: 18, anchor: protocol_completed_on, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
    eyebag: { milestone_months: 12, anchor: protocol_completed_on, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }

  linear_z:
    milestone_months: 6
    anchor: last_session_after_protocol_completion
    areas:
      - barriga
      - braco
      - coxa
      - gluteos
      - joelho
      - olhos
      - papada
      - pescoco
      - rosto
      - terco_inferior
    required_for_eligibility:
      - area
      - purpose
      - tip
    depth_mode_protocol: PENDING_DECISION
    missing_variant: REVIEW_REQUIRED
    publication_status: BLOCKED
    execution_status: INTERNAL_ONLY

  fillers:
    anchor: protocol_completed_on
    retouch_semantics: PENDING_DECISION
    products:
      shape_lido_gluteo: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
      lips_duo_labios: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
      subskin_nariz: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
      subskin_queixo: { milestone_months: 12, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }

  leg_enzymes:
    maintenance: { milestone_months: 12, anchor: protocol_completed_on, publication_status: DRAFT_INTERNAL, execution_status: INTERNAL_ONLY }
    next_session: { interval: PENDING_DECISION, publication_status: BLOCKED, execution_status: INTERNAL_ONLY }

  consultation:
    stated_interval_days: 30
    flow_type: PENDING_DECISION
    publication_status: BLOCKED
    execution_status: INTERNAL_ONLY

communication:
  external_purpose: maintenance_reassessment
  mention_procedure_allowed: true
  pilot_default_mentions_procedure: false
  disclaimer_required: true
  opt_out_semantics: any_clear_refusal
  responsible_team: reception
  clinical_questions_route_to: clinical_team
  complaints_or_intercurrence: pause_and_escalate
  sending_days: [monday, tuesday, wednesday, thursday, friday, saturday]
  sending_hours: PENDING_DECISION

pilot:
  first_category: toxin
  current_mode: INTERNAL_ONLY
  next_possible_mode: ASSISTED_CONTACT_AUTHORIZED
  target_mode: AUTOMATIC_SUPERVISED_AUTHORIZED
  primary_outcomes:
    - evaluations_scheduled
    - procedures_completed
  guardrails:
    - zero_wrong_identity_contacts
    - zero_duplicate_dispatches
    - opt_out_enforced_before_handoff
    - all_decisions_auditable
```

## 15. Mapa de origem das decisões

| Perguntas da submissão | Conteúdo consolidado nesta base |
|---|---|
| 2 a 9 | Objetivo, override individual, âncora geral, retoque, repetição, agendamento, mensagens próximas e bloqueios selecionados |
| 10 a 17 | Marcos de Toxina, Bioestímulo e Fios, incluindo âncora dos bioestimuladores |
| 18 a 21 | Campos, regiões, marco, âncora e tratamento de dados ausentes do Linear Z |
| 22 e 23 | Marcos dos preenchedores e indicação de que existe uma regra de retoque ainda ambígua |
| 24 e 25 | Dois tipos de retorno para esvaziador de pernas e marco de manutenção de 12 meses |
| 26 e 27 | Consulta em 30 dias e revisão de registro incompleto |
| 28 a 31 | Conteúdo permitido, template, aviso de não obrigatoriedade e opt-out |
| 32 e 33 | Responsável pelas respostas e dias/horários de envio |
| 34 a 37 | Piloto de Toxina, modelo de liberação desejado, indicadores e confirmação do D-14 |

Este mapa registra a origem lógica, mas não substitui o anexo imutável e a validação da autoridade da respondente previstos em `P12`.

## 16. Controle de mudanças

Toda alteração desta base deve registrar:

| Campo | Preenchimento obrigatório |
|---|---|
| Versão anterior | Sim |
| Nova versão | Sim |
| Data da alteração | Sim |
| Autor da alteração | Sim |
| Motivo | Sim |
| Regras afetadas | Sim |
| Aprovação clínica | Quando houver conteúdo clínico |
| Aprovação operacional | Quando houver mudança de fluxo |
| Aprovação de privacidade | Quando houver mudança de mensagem, canal ou dados |
| Vigência | Sim |

### Histórico

| Versão | Data | Alteração | Status |
|---|---|---|---|
| 1.0 | 17/08/2026 | Consolidação inicial das 37 respostas e da análise de governança | Base de consulta; não autorizada para produção |
| 1.1 | 17/08/2026 | Separação entre origem, publicação e execução; inclusão de gate global, rastreabilidade e novos bloqueios | Base de consulta; somente uso interno |

---

## Resumo de uma linha

Os prazos e o D-14 estão registrados para consulta e simulação interna; Toxina é apenas candidata ao primeiro piloto, e nenhum contato externo está autorizado nesta versão, mesmo após a resolução das pendências `P01` a `P15`, sem uma liberação formal posterior.
