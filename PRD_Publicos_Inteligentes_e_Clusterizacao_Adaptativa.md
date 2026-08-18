# PRD — Públicos Inteligentes e Clusterização Adaptativa

**Status:** proposta aprovada para detalhamento e implementação futura  
**Produto:** Projeto Consultório.ia / Orquestra IA  
**Público do documento:** Produto, Engenharia e Operações  
**Data:** 14 de agosto de 2026

## 1. Resumo executivo

Criar uma funcionalidade de **Públicos inteligentes** que organize leads e pacientes em poucos grupos acionáveis, explicáveis e adaptativos. Esses públicos servirão como entrada para campanhas de reativação, nutrição, cross-selling e relacionamento VIP, aumentando a assertividade sem transformar a operação em uma coleção difícil de administrar de microsegmentos.

A classificação será recalculada à medida que novos dados confiáveis forem incorporados ou que a pessoa interagir com a clínica. Uma pessoa poderá pertencer a mais de um público quando isso fizer sentido, mas regras de prioridade, compatibilidade e frequência impedirão sobrecarga de campanhas.

O MVP terá seis públicos iniciais:

1. Lead morno.
2. Lead frio.
3. Paciente em risco.
4. Paciente inativo.
5. Oportunidade de cross-sell.
6. VIP.

O sistema usará pontuações explicáveis, regras versionadas e calibração por organização. A automação recalculará classificações e sugerirá melhorias, enquanto pessoas autorizadas continuarão responsáveis por aprovar alterações nas regras, novos públicos e cada entrega para campanha.

A responsabilidade operacional deste PRD termina no **handoff para campanha**. O escopo inclui criar o pacote de handoff e receber eventos neutros de resultado para fechar o ciclo de aprendizagem. Escolha de canal, redação de mensagens, criação de peças, cadência e envio pertencem ao módulo futuro de campanhas.

## 2. Contexto e problema

As bases de clínicas costumam reunir históricos extensos, porém heterogêneos, de leads, atendimentos, compras, agendamentos e interações. Sem uma camada de interpretação, a equipe precisa criar listas manualmente, aplicar filtros estáticos e repetir análises a cada campanha.

Essa abordagem gera cinco problemas principais:

- Públicos envelhecem rapidamente e deixam de refletir o comportamento atual.
- Segmentos demais aumentam complexidade operacional sem ganho proporcional.
- Pessoas podem receber campanhas incompatíveis ou em excesso.
- Regras pouco transparentes dificultam revisão, confiança e aprendizagem.
- Dados ainda não reconciliados, identidades ambíguas ou opt-outs podem alcançar uma campanha indevidamente.

A oportunidade é transformar a base canônica em públicos vivos, com critérios claros, atualização contínua e supervisão humana nos pontos de maior risco.

## 3. Objetivos

### 3.1 Objetivo principal

Permitir que cada organização identifique, revise e entregue para campanhas os grupos com maior aderência a um objetivo comercial ou de relacionamento, usando dados confiáveis e regras que se adaptam ao longo do tempo.

### 3.2 Objetivos específicos

- Manter uma taxonomia inicial pequena e operacionalmente compreensível.
- Atualizar a classificação quando a pessoa for nutrida, enriquecida ou mudar de comportamento.
- Explicar por que cada pessoa entrou, permaneceu ou saiu de um público.
- Separar classificação analítica de elegibilidade para ativação.
- Permitir sobreposição útil entre públicos sem gerar excesso de contato.
- Gerar um snapshot imutável e auditável para cada handoff de campanha.
- Receber resultados futuros das campanhas e usá-los para recalcular pontuações e sugerir melhorias.
- Respeitar isolamento entre organizações, consentimento, opt-out e restrições comerciais ou clínicas.

### 3.3 Resultado esperado

Ao final do MVP, uma equipe autorizada deverá conseguir abrir o painel de Públicos inteligentes, compreender os seis grupos recomendados, revisar as pessoas e os motivos, resolver alertas, simular alterações e aprovar um pacote de público para uma campanha futura. O produto também deverá aceitar eventos neutros e idempotentes de resultado, sem assumir responsabilidade pela execução da campanha.

## 4. Fora de escopo

- Escolher WhatsApp, e-mail, SMS ou qualquer outro canal.
- Redigir mensagens, roteiros, assuntos, criativos ou cadências.
- Enviar campanhas ou administrar infraestrutura de entrega.
- Definir a lógica interna do módulo futuro de campanhas; este PRD especifica somente seu contrato de interoperabilidade.
- Automatizar contato sem aprovação humana.
- Recomendar tratamento, diagnóstico ou conduta clínica.
- Usar prontuário, prescrição, exame, diagnóstico ou outro dado sensível de saúde como sinal de marketing.
- Substituir o onboarding, a promoção atômica, a resolução de identidades ou a reconciliação da base.
- Criar um editor completo de papéis personalizados; o MVP usará capacidades integradas ao RBAC da plataforma.
- Utilizar modelo preditivo opaco ou IA que altere regras autonomamente.
- Compartilhar dados de pessoas, parâmetros aprendidos em nível individual ou resultados identificáveis entre organizações.

## 5. Princípios do produto

### 5.1 Poucos públicos, alta utilidade

O sistema começará com seis públicos e aceitará no máximo dez públicos ativos por organização. Os quatro espaços adicionais existirão para sugestões realmente distintas, comprovadas por evidência e aprovadas por uma pessoa autorizada.

### 5.2 Classificação não é autorização de contato

Uma pessoa pode ser classificada analiticamente mesmo quando estiver impedida de participar de campanhas. Elegibilidade, consentimento, qualidade do contato e restrições serão avaliados em uma camada separada e aplicada novamente no momento do handoff.

### 5.3 Automação supervisionada

O sistema automatizará cálculo, atualização, explicação, simulação e sugestão. Alterações de taxonomia ou regras e a liberação de um snapshot para campanha exigirão aprovação humana auditável.

### 5.4 Explicabilidade antes de sofisticação

O MVP utilizará fatores e fórmulas compreensíveis, com fontes e versões visíveis. Modelos preditivos mais complexos só poderão ser considerados depois de existir base histórica suficiente, avaliação de viés e uma forma igualmente clara de revisão.

### 5.5 Adaptação com estabilidade

Os públicos devem reagir a eventos relevantes sem oscilar a cada pequena mudança. Para isso, a entrada e a saída usarão limiares distintos, permanência mínima e exceções para eventos fortes.

### 5.6 Isolamento por organização

Padrões da plataforma poderão iniciar a configuração, mas pesos, limiares, janelas e resultados serão calibrados dentro de cada organização. Nenhum dado de paciente ou lead será compartilhado entre tenants.

### 5.7 Significado de clusterização adaptativa

Neste PRD, **clusterização adaptativa** significa associação dinâmica a públicos governados por regras e pontuações explicáveis. O MVP não executará clustering estatístico não supervisionado nem criará taxonomias sozinho. A descoberta de padrões poderá produzir propostas de novos públicos, sempre simuladas e aprovadas antes de qualquer efeito.

## 6. Usuários, capacidades e responsabilidades

O MVP deverá integrar as seguintes capacidades ao RBAC já existente:

- **Visualizar públicos:** consultar contagens, composição, motivos e histórico permitido.
- **Revisar público:** analisar pessoas, alertas, conflitos e simulações.
- **Gerenciar regras:** propor ajustes de peso, limiar, janela e permanência.
- **Aprovar regras:** publicar uma nova versão depois de revisar a simulação.
- **Gerenciar matriz de cross-sell:** cadastrar e revisar relações entre interesses, produtos e serviços.
- **Aprovar matriz de cross-sell:** registrar aprovação comercial e clínica quando aplicável.
- **Gerenciar benefícios VIP:** cadastrar benefício, custo, validade e condições.
- **Aprovar handoff:** congelar e liberar o snapshot e o briefing para uma campanha.
- **Consultar auditoria:** acessar mudanças de regra, overrides, aprovações e resultados.

Uma mesma pessoa poderá acumular capacidades conforme o papel, mas ações incompatíveis poderão exigir segregação no futuro. O MVP não criará um construtor de papéis; apenas consumirá capacidades da plataforma.

### 6.1 Workflow de aprovação

Regras, matrizes, benefícios e novos públicos seguirão o fluxo:

`rascunho → simulado → aguardando aprovação → publicado → substituído`

Estados alternativos serão `rejeitado`, `cancelado` e `revertido`. Publicação e reversão exigirão capacidade específica, motivo e auditoria. Uma pessoa poderá propor e aprovar somente se tiver ambas as capacidades; a organização poderá exigir dupla aprovação por política. Quando o destino de cross-sell for um serviço de natureza clínica, a aprovação clínica será obrigatória, independentemente do valor comercial.

A presença de pessoas com baixa confiança será aprovada no nível do snapshot, com contagem e alerta explícitos. O revisor poderá excluir casos individuais, mas o MVP não exigirá aprovação pessoa a pessoa.

### 6.2 Responsáveis operacionais

- **Produto da plataforma:** taxonomia padrão, contratos, guardrails e critérios globais.
- **Engenharia/Dados:** disponibilidade dos sinais, processamento, segurança, auditoria e SLAs.
- **Administrador da organização:** calibração local, responsáveis e aprovação final do handoff.
- **Responsável comercial:** objetivos, ofertas, matriz de compatibilidade e benefícios.
- **Responsável clínico:** aprovação das relações que envolvam serviços de natureza clínica.
- **Operações:** revisão de alertas, qualidade da base, fila de conflitos e acompanhamento do piloto.

Toda proposta, gate ou incidente deverá ter responsável, estado, data de criação, prazo configurado e histórico. Inclusão indevida de pessoa com bloqueio obrigatório será incidente crítico: novos handoffs serão suspensos para o workspace até reconciliação e liberação auditada.

## 7. Pré-requisitos e gates de entrada

A funcionalidade poderá ser explorada com dados sintéticos, mas não poderá produzir handoff real enquanto os gates abaixo não estiverem comprovados para a organização e o workspace.

### 7.1 Gate da base canônica

- Lote promovido de forma atômica e idempotente.
- Reconciliação entre plano, staging e registros promovidos concluída.
- Linhas de origem contabilizadas e rastreáveis.
- Catálogo, eventos e relacionamentos necessários disponíveis no modelo canônico.
- Base da organização isolada e protegida por autorização no backend e no banco.

### 7.2 Gate de identidade

- Nenhuma união definitiva baseada somente em nome.
- Duplicidades críticas e identidades ambíguas resolvidas ou mantidas fora da ativação.
- Mudanças de identidade reversíveis e auditáveis.
- Merge, split ou nova importação deve invalidar e recalcular associações afetadas.

### 7.3 Gate de ativação

- Consentimentos, opt-outs e restrições disponíveis em fonte confiável.
- Pelo menos um meio de contato verificado, pertencente à pessoa e sem restrição conhecida.
- Reclamações abertas, restrições legais ou clínicas e bloqueios operacionais identificáveis.
- Capacidade de aplicar exclusões novamente no instante em que o snapshot for criado.

O gate distingue **elegibilidade universal** de **elegibilidade por canal**. Opt-out geral ou bloqueio universal impede o handoff. Opt-out específico impede somente aquele canal. Como o canal não é escolhido neste PRD, o handoff deverá transportar as restrições por canal e aceitar apenas pessoas com pelo menos uma opção marcada como permitida. Estado `desconhecido` será tratado como bloqueado para o canal correspondente. O módulo de campanha deverá consultar novamente essa elegibilidade antes de qualquer tentativa.

### 7.4 Comportamento quando um gate falhar

O sistema deverá falhar de forma fechada: poderá exibir uma prévia analítica identificada como não acionável, mas não poderá gerar um handoff liberado. A interface deverá mostrar o gate pendente e o caminho para resolvê-lo.

### 7.5 Contrato verificável dos gates

Cada gate será exposto pelo backend como `ReadinessGateStatus`, com:

- `gate_type`: `canonical_base`, `identity`, `activation`, `authorization` ou `campaign_integration`.
- `scope_type`: `organization`, `workspace`, `batch`, `person` ou `actor`.
- `scope_id`.
- `state`: `passed`, `blocked` ou `expired`.
- Evidências e referências de origem.
- Versão do avaliador.
- Responsável, `evaluated_at` e `expires_at`.
- Motivos estruturados quando não estiver aprovado.

O handoff consultará os gates de organização, workspace, pessoa e ator na mesma operação transacional que reserva frequência. Ausência, expiração ou erro de consulta equivale a `blocked`.

## 8. Universos e estados operacionais

### 8.1 Lead

Pessoa que ainda não possui atendimento concluído na organização. Agendamento criado ou interesse declarado não transforma o lead em paciente.

### 8.2 Paciente

Pessoa com pelo menos um atendimento concluído. A transição de lead para paciente ocorre somente após um evento confiável de atendimento realizado. O histórico anterior permanece rastreável, mas as regras de temperatura deixam de produzir públicos de lead.

### 8.3 Estados que não são públicos

Os seguintes estados serão exibidos como camadas operacionais, nunca como novos clusters:

- **Sem ação recomendada:** há dados suficientes, mas nenhum público atingiu o critério aplicável.
- **Não ativável:** existe ao menos um bloqueio obrigatório para handoff.
- **Baixa confiança:** a melhor classificação disponível foi calculada com evidência incompleta ou pouco atual.

Uma pessoa com baixa confiança poderá entrar em um snapshot aprovado, desde que receba alerta explícito. Uma pessoa não ativável nunca poderá entrar no handoff, ainda que pertença analiticamente a um ou mais públicos.

## 9. Taxonomia inicial de públicos

### 9.1 Regras de sobreposição

- Lead morno e lead frio são mutuamente exclusivos.
- Paciente em risco e paciente inativo são mutuamente exclusivos.
- Cross-sell pode coexistir com um público de ciclo de vida e pode incluir leads ou pacientes.
- VIP pode coexistir com paciente em risco, paciente inativo ou cross-sell, mas é exclusivo para pacientes.
- Uma pessoa pode não pertencer a nenhum dos seis públicos.

### 9.2 Lead morno

**Universo:** leads.  
**Propósito:** identificar pessoas que demonstram sinais recentes ou consistentes de intenção e têm maior probabilidade de avançar na jornada.  
**Sinais elegíveis:** recência e frequência de interação, resposta a contato, interesse declarado, origem do lead, avanço no agendamento, presença ou cancelamento de agenda, complementação voluntária de dados e fatos permitidos vindos de fonte pública oficial.  
**Saída típica:** perda de recência, ausência prolongada de resposta, transição para paciente ou queda abaixo do limiar de permanência.

### 9.3 Lead frio

**Universo:** leads.  
**Propósito:** identificar leads com baixo engajamento atual, sinais antigos ou tentativa de contato sem avanço, que ainda podem ser nutridos de forma apropriada.  
**Sinais elegíveis:** tempo desde o último sinal, tentativas anteriores, ausência de resposta, origem, interesse declarado e qualidade do contato.  
**Saída típica:** novo engajamento suficiente para lead morno, transição para paciente ou expiração definida pela organização.

### 9.4 Paciente em risco

**Universo:** pacientes.  
**Propósito:** identificar pessoas que se aproximam ou ultrapassam a janela esperada de retorno, mas ainda não satisfazem o critério de inatividade.  
**Regra-base:** comparar a data do último atendimento concluído da relação canônica com sua `ReturnWindowDefinition` publicada.  
**Sinais complementares:** histórico de frequência, cancelamentos, ausência, respostas recentes e próximos agendamentos.  
**Saída típica:** novo atendimento, agendamento futuro válido que altere a recomendação ou entrada em inatividade.

### 9.5 Paciente inativo

**Universo:** pacientes.  
**Propósito:** identificar pessoas que ultrapassaram de forma significativa a janela de retorno esperada e podem ser consideradas para reativação.  
**Regra-base:** atraso acima do limiar de inatividade da `ReturnWindowDefinition` que determinou a relação-âncora.  
**Sinais complementares:** histórico de retorno, valor e frequência anteriores, respostas, cancelamentos e ausência de agenda futura.  
**Saída típica:** novo atendimento concluído ou retorno à faixa de risco após correção de dados.

Para tornar risco e inatividade determinísticos, a organização publicará `ReturnWindowDefinition` com identificador estável, itens ou categoria de catálogo cobertos, itens que satisfazem o retorno, janela esperada, tolerância, bandas de risco/inatividade, prioridade, validade e versão. Um item exato prevalece sobre uma categoria; depois prevalece a maior prioridade. Sobreposição no mesmo nível e prioridade bloqueia a publicação.

Cada item de atendimento concluído será vinculado a no máximo uma definição. A instância canônica da relação será `canonical_person_id × return_window_definition_id`. Para cada instância:

`retorno_esperado_em = último_atendimento_concluído_da_relação + janela_aprovada`

Relações sem definição publicada não participam do cálculo. Para escolher a âncora, o motor ordenará as instâncias por maior banda de severidade, maior razão de atraso sobre a tolerância, retorno esperado mais antigo e, por fim, identificador estável da definição. Se a âncora estiver na banda inativa, a pessoa será inativa; se estiver apenas na banda de risco, será em risco; caso contrário, não receberá nenhum desses públicos. Um novo atendimento coberto pelos itens de satisfação da mesma definição encerra a expectativa anterior e cria outra. A explicação preservará todas as relações avaliadas e indicará a âncora.

### 9.6 Oportunidade de cross-sell

**Universo:** leads e pacientes.  
**Propósito:** identificar aderência comercial legítima a outro produto, serviço ou categoria, sem transformar a classificação em recomendação clínica.

Para leads, a evidência deverá vir de interesse declarado, origem compatível ou comportamento relacionado. Para pacientes, poderá considerar histórico de compras e atendimentos, afinidade e complementaridade previamente aprovadas.

Toda relação deverá existir em uma matriz de cross-sell versionada, contendo:

- Item ou interesse de origem.
- Item, serviço ou categoria de destino.
- Universo permitido.
- Evidência mínima.
- Motivo comercial.
- Restrições e exclusões.
- Validade.
- Aprovação comercial.
- Aprovação clínica quando houver qualquer possibilidade de interpretação assistencial.

A matriz sinaliza uma oportunidade de conversa. Ela não prescreve, diagnostica nem garante elegibilidade clínica.

Cross-sell será calculado na granularidade `pessoa × destino aprovado`. Uma pessoa poderá ter várias oportunidades, cada uma com `cross_sell_matrix_entry_id`, destino, pontuação, confiança e validade. O cartão do público contará pessoas únicas. Cada handoff de cross-sell terá exatamente um `target_offer_id`; incluirá apenas as pessoas cuja oportunidade válida corresponda a esse destino. Outros destinos exigirão outro handoff. O snapshot deduplicará a pessoa canônica e registrará a oportunidade usada.

### 9.7 VIP

**Universo:** pacientes.  
**Propósito:** reconhecer relacionamentos relevantes e oferecer vantagens coerentes com seu valor e histórico.

A classificação será baseada em pontuação composta, comparada ao percentil da própria organização e condicionada a mínimos versionados de histórico, valor e/ou frequência. A regra deverá evitar que uma única compra recente e atípica gere status VIP sem evidência de relacionamento.

O catálogo de benefícios VIP deverá conter:

- Nome e descrição do benefício.
- Tipo financeiro ou não financeiro.
- Custo estimado e responsável pelo orçamento.
- Condições e limites de uso.
- Data de início, expiração e versão.
- Públicos e situações compatíveis.
- Aprovação responsável.

## 10. Motor de classificação adaptativa

### 10.1 Pontuações explicáveis

Cada público será calculado por uma função versionada composta por fatores normalizados:

`pontuação = arredondar(100 × soma(peso × contribuição) ÷ soma(pesos incluídos))`

Cada valor normalizado ficará entre `0` e `1`. Para um fator positivo, `contribuição = valor_normalizado`; para um fator negativo, `contribuição = 1 - valor_normalizado`. Pesos serão não negativos. O resultado ficará entre `0` e `100`.

O PRD define os fatores e o comportamento, mas os pesos e limiares numéricos serão configurações versionadas, calibradas no piloto. Eles não serão hardcoded nem escolhidos autonomamente pela IA.

Cada `FactorDefinition` deverá declarar:

- Chave e descrição.
- Evento ou campo canônico de origem.
- Unidade e agregação: último, contagem, soma, média, máximo ou booleano.
- Janela de observação ou uso de todo o histórico.
- Normalização: binária, faixa mínima/máxima, percentil local, decaimento exponencial ou banda de limiar.
- Direção positiva ou negativa e peso.
- Política para ausência: excluir o fator, usar valor neutro, reduzir confiança ou impedir classificação.
- Validade, procedência mínima e regra de atualização.

Se todos os fatores forem ausentes ou bloqueados, não haverá pontuação e a pessoa ficará sem ação recomendada. Uma regra não poderá ser publicada sem fatores, normalizações, pesos, limiares, tratamento de ausentes e fixtures de teste completos.

Cada cálculo deverá armazenar ou tornar reproduzíveis:

- Universo avaliado.
- Valor de cada fator.
- Peso aplicado.
- Fonte e data de validade do sinal.
- Pontuação final.
- Limiar de entrada e de saída.
- Confiança.
- Versão da regra.
- Motivos predominantes.

### 10.1.1 Contratos dos seis públicos

- **Temperatura de lead:** um único `lead_temperature_score` usa recência, respostas, interesse declarado, origem, avanço de agenda e sinais públicos permitidos. Lead morno ocupa a banda superior; lead frio ocupa a banda inferior; a faixa entre as bandas produz sem ação recomendada. Cada banda terá limiares distintos de entrada e saída.
- **Retorno do paciente:** usa a relação-âncora e as bandas versionadas `em_risco` e `inativo`. A banda inativa sempre prevalece sobre a banda de risco, garantindo exclusividade.
- **Cross-sell:** calcula uma pontuação separada para cada destino aprovado na matriz. O limiar é aplicado à oportunidade, não à pessoa inteira.
- **VIP:** calcula relação composta e percentil dentro da organização, mas exige também mínimos explícitos de histórico e pelo menos um dos mínimos aprovados de valor ou frequência. Percentil sem os mínimos não gera associação.

As configurações numéricas de produção serão definidas no piloto, mas Engenharia deverá implementar e testar o motor com uma configuração de referência sintética e fixtures versionadas. Uma organização sem configuração publicada poderá ver simulação, porém não gerar handoff real.

### 10.2 Confiança

A confiança deverá considerar pelo menos cobertura, confiabilidade, consistência e atualidade dos sinais. Ela não substitui a pontuação de aderência.

`confiança = 100 × média ponderada(cobertura, confiabilidade da fonte, consistência e atualidade)`

Os quatro componentes ficarão entre `0` e `1`; pesos e limiar de baixa confiança serão versionados. A explicação exibirá cada componente. Conflito de identidade não será convertido em baixa confiança: continuará sendo bloqueio de ativação.

Quando houver evidência suficiente para uma melhor estimativa, mas confiança baixa, o sistema poderá classificar a pessoa e marcar **Baixa confiança**. O alerta deverá acompanhar a pessoa até a revisão e o handoff. Ausência de um dado nunca poderá ser convertida silenciosamente em evidência positiva.

### 10.3 Recalculo

O motor terá dois modos complementares:

- **Orientado a eventos:** recalcula associações afetadas por novo atendimento, compra, agendamento, resposta, alteração de interesse, correção de identidade, promoção de dados ou resultado de campanha. Opt-out e restrições recalculam imediatamente a elegibilidade, sem remover a associação analítica.
- **Reconciliação diária:** revisa janelas temporais, expiração de sinais, permanência mínima, dados atrasados e eventos que não tenham sido processados.

Um evento confiável deverá refletir na classificação em até cinco minutos. Reprocessamentos, eventos duplicados ou fora de ordem não poderão criar transições duplicadas nem restaurar estado antigo indevidamente.

### 10.4 Estabilidade e transições

Cada público terá:

- Limiar de entrada.
- Limiar de saída diferente do limiar de entrada.
- Permanência mínima configurável.
- Lista de eventos fortes que permitem transição imediata.

Eventos fortes de associação incluem atendimento concluído, mudança comprovada de universo, resolução de evidência, merge ou split de pessoa. Opt-out, reclamação e bloqueio obrigatório são eventos fortes de elegibilidade: interrompem a ativação imediatamente, mas não apagam o público analítico. O histórico deverá registrar a causa de cada entrada, saída, permanência ou mudança de elegibilidade.

### 10.5 Sugestão de novos públicos

A IA poderá sugerir criar, fundir, dividir ou desativar um público somente quando houver:

- Padrão estável em mais de um ciclo de análise.
- Quantidade mínima de pessoas e cobertura suficiente.
- Oportunidade ou necessidade operacional distinta das já existentes.
- Critério explicável e dados permitidos.
- Simulação do impacto.
- Respeito ao limite de dez públicos ativos.
- Aprovação de uma pessoa com capacidade adequada.

Uma sugestão não altera a taxonomia até a publicação de uma nova versão. Públicos sugeridos deverão ter nome compreensível, objetivo, universo, critérios de entrada e saída, incompatibilidades, riscos e plano de medição.

O workflow de criar, simular, aprovar, publicar, substituir e desativar até quatro públicos adicionais faz parte da capacidade do MVP. A existência de um público adicional real não é obrigatória para o piloto; o aceite técnico usará uma definição sintética para provar o fluxo completo.

### 10.6 Aprendizado supervisionado

Os resultados recebidos de campanhas futuras poderão gerar propostas de ajuste em pesos, limiares, janelas ou prioridades. A proposta deverá explicar:

- Evidência observada.
- Período e volume analisados.
- Efeito esperado.
- Pessoas que entrariam, sairiam ou mudariam de prioridade.
- Riscos e possíveis vieses.
- Diferença em relação à versão vigente.

A mudança só produzirá efeito após simulação e aprovação.

## 11. Elegibilidade e proteção contra sobrecarga

### 11.1 Bloqueios obrigatórios

Os seguintes estados impedem qualquer handoff de ativação:

- Opt-out geral aplicável a comunicações de campanha.
- Identidade ambígua ou contato sem vínculo confiável.
- Ausência de ao menos um canal conhecido como permitido e com contato verificado.
- Restrição legal, clínica ou operacional registrada.
- Reclamação aberta que exija suspensão de comunicação.
- Gate da base, autorização ou isolamento não comprovado.

A plataforma fornecerá essa base conservadora. A organização poderá adicionar restrições, mas não remover os bloqueios obrigatórios.

Restrições específicas de canal não apagam a elegibilidade universal quando existir outro canal permitido. O handoff levará `channel_eligibility` por canal com estado `allowed`, `blocked` ou `unknown`; somente `allowed` poderá ser usado pelo módulo futuro. O valor de contato será resolvido no backend no momento da execução, nunca confiado a partir de uma exportação antiga.

### 11.2 Limite de frequência

Uma pessoa poderá participar de no máximo **duas campanhas em uma janela móvel de 30 dias**. O cálculo será feito por pessoa canônica e considerará consumos confirmados nos últimos 30 dias mais reservas ativas de campanhas aprovadas.

A aprovação criará uma `FrequencyReservation` atômica por pessoa e handoff. Campanhas concorrentes não poderão reservar um terceiro espaço. A reserva será convertida em consumo na primeira tentativa registrada e contará por 30 dias a partir dessa tentativa. Rejeição, expiração ou cancelamento antes de qualquer tentativa libera a reserva; depois de uma tentativa, o consumo permanece. Reservas terão validade igual à do handoff e nunca poderão ficar abertas indefinidamente.

### 11.3 Objetivos, compatibilidade e prioridade

Cada campanha terá exatamente um objetivo publicado em `CampaignObjectiveDefinition`, contendo código, descrição, públicos aceitos, tipos de oferta permitidos, prioridade padrão, objetivos compatíveis e incompatíveis, validade máxima e política de atribuição exigida.

Os códigos iniciais serão `nurture_warm_lead`, `nurture_cold_lead`, `retain_at_risk_patient`, `reactivate_inactive_patient`, `cross_sell` e `vip_relationship`. A organização configurará prioridade e compatibilidade entre eles antes do primeiro handoff; ausência dessa configuração bloqueia aprovação.

O fluxo poderá combinar vários públicos, mas sua união será deduplicada por `canonical_person_id`. Motivos e oportunidades continuarão separados; o snapshot terá uma única linha operacional por pessoa e campanha. Em cross-sell, o handoff selecionará um único destino e filtrará somente oportunidades correspondentes.

- Campanhas incompatíveis serão priorizadas e enfileiradas; somente a primeira elegível poderá avançar naquele momento.
- Campanhas compatíveis poderão coexistir dentro do limite de duas em 30 dias.
- A ordem determinística será: maior prioridade aprovada do objetivo, maior aderência individual, oportunidade que expira primeiro e solicitação criada primeiro.
- Empate ou conflito não resolvido deverá aparecer na revisão humana, sem decisão silenciosa.

A mesma transação que cria `FrequencyReservation` verificará a matriz de compatibilidade contra todas as reservas e consumos ativos da pessoa. Quando encontrar campanha incompatível, não criará reserva: criará `CampaignConflictQueueEntry` com pessoa, handoff candidato, objetivo, ordem, motivo e validade. O membro ficará `queued_conflict` e não poderá ser executado.

Quando a reserva incompatível for liberada antes da tentativa ou quando seu consumo sair da janela móvel de 30 dias, o primeiro item válido da fila será reavaliado. Se gates, validade, limite e versão continuarem válidos, o sistema criará a reserva e moverá o membro para `reserved`; caso contrário, marcará `excluded` ou `reconciliation_required`. A aprovação original cobre a passagem automática enquanto handoff, snapshot e oferta permanecerem válidos; qualquer mudança de regra, oferta ou validade exige novo snapshot e nova aprovação.

### 11.4 Reavaliação no handoff

Elegibilidade, frequência e compatibilidade serão recalculadas no momento em que o snapshot for congelado. Uma lista antiga ou prévia de tela nunca será suficiente para liberar uma campanha.

A rechecagem transacional produzirá um fingerprint de elegibilidade por pessoa. Antes de cada tentativa, o módulo futuro deverá consultar novamente a elegibilidade universal e a do canal escolhido. Opt-out ou novo bloqueio após aprovação preserva o snapshot histórico, mas marca a pessoa como excluída da execução e impede novas tentativas.

## 12. Experiência do usuário

### 12.1 Entrada

A navegação usará o nome **Públicos inteligentes**. A experiência combinará um painel de acompanhamento com um fluxo guiado para revisão e handoff.

### 12.2 Painel

O painel deverá mostrar:

- Seis cartões de públicos iniciais e até quatro aprovados posteriormente.
- Total classificado, total ativável, bloqueado e com baixa confiança.
- Variação desde o período anterior.
- Data e estado do último recálculo.
- Versão das regras.
- Alertas de qualidade, identidade, consentimento ou resultado atrasado.
- Campanhas recentes que já consumiram frequência.

### 12.3 Detalhe do público

O detalhe deverá permitir:

- Filtrar por ativável, baixa confiança, bloqueio, origem, unidade e período.
- Visualizar pessoas sem expor mais dados pessoais do que o papel permite.
- Abrir a explicação individual.
- Comparar versão atual e versão proposta.
- Consultar entradas, saídas e principais motivos agregados.
- Exportar apenas por meio do handoff aprovado, nunca como atalho que ignore os gates.

### 12.4 Explicação individual

Para cada associação, a interface deverá mostrar:

- Público e pontuação.
- Principais fatores positivos e negativos.
- Fontes e atualidade.
- Nível de confiança e motivo do alerta.
- Versão da regra.
- Data da entrada e permanência mínima.
- O que faria a pessoa entrar, sair ou mudar de prioridade.
- Bloqueios de ativação separados da aderência.

### 12.5 Fluxo guiado de handoff

1. Escolher o objetivo de campanha.
2. Selecionar um ou mais públicos compatíveis.
3. Aplicar critérios adicionais permitidos.
4. Revisar elegibilidade, baixa confiança, frequência e conflitos.
5. Informar oferta ou benefício, prioridade e validade.
6. Conferir a prévia e o plano de medição.
7. Aprovar e congelar o snapshot.
8. Disponibilizar o pacote ao módulo de campanha futuro.

Sair, voltar ou usar teclado/mobile não poderá perder filtros, revisão ou rascunho, respeitando permissões e expiração de sessão.

### 12.6 Override manual

Uma pessoa autorizada poderá incluir, excluir ou fixar temporariamente uma associação quando houver justificativa operacional legítima. Todo override exigirá:

- Motivo obrigatório.
- Autor e timestamp.
- Público e efeito.
- Data de expiração.
- Evidências ou observação.

Após a expiração, o motor recalculará a pessoa. Override nunca poderá remover opt-out ou outro bloqueio obrigatório.

Override também não poderá violar o universo ou as invariantes da taxonomia: lead não pode ser VIP, frio e morno não podem coexistir, risco e inatividade não podem coexistir e cross-sell não pode apontar para destino ausente ou não aprovado. Se uma inclusão manual conflitar com outra associação exclusiva, o sistema deverá simular a substituição e exigir confirmação explícita.

## 13. Simulação e versionamento

Qualquer proposta de alteração deverá gerar um `SimulationDiff` antes da aprovação, contendo:

- Total de pessoas que entram, saem e permanecem.
- Pessoas que entram, saem, mudam de associação ou mudam de prioridade.
- Efeito sobre ativáveis, bloqueados e baixa confiança.
- Distribuição por unidade, período e origem, quando permitido.
- Mudança esperada na quantidade de handoffs.
- Alertas de concentração, cobertura, qualidade e possível viés.
- Comparação com a versão vigente.

Cada publicação criará uma nova versão imutável. Resultados históricos permanecerão associados à regra e ao snapshot que os produziram, permitindo reprodução e auditoria.

## 14. Handoff para campanhas

### 14.1 Limite do produto neste PRD

O handoff formaliza **quem**, **por quê**, **com qual objetivo** e **sob quais restrições** poderá seguir para uma campanha. Este produto cria e governa o pacote e recebe resultados estruturados; ele não define canal, texto, criativo, cadência nem executa envio.

### 14.2 Conteúdo do pacote

Cada `CampaignHandoffBrief` deverá conter:

- Identificador, organização e workspace.
- Código e versão do objetivo da campanha.
- Oferta ou benefício aprovado.
- Prioridade.
- Snapshot imutável do público.
- Uma ocorrência por pessoa canônica, mesmo quando vários públicos forem combinados.
- Único `target_offer_id` e respectiva oportunidade quando o objetivo for cross-sell.
- Motivos de aderência agregados e individuais permitidos.
- Alertas de baixa confiança.
- Exclusões aplicadas e contagens por motivo.
- Elegibilidade universal, restrições por canal e fingerprint da rechecagem.
- Regras de incompatibilidade e frequência consideradas.
- Reservas de frequência e entradas de fila por pessoa.
- Data de criação, validade e expiração.
- Versões de público, regras, matriz e benefícios.
- Aprovador e trilha de auditoria.
- Plano e política de atribuição.

O snapshot deverá distinguir membros `reserved` de candidatos `queued_conflict` no momento da aprovação. Somente `reserved` integra a lista executável. Mudanças posteriores não alteram o snapshot silenciosamente. Uma camada operacional registrará avanço da fila, exclusões, cancelamento, reconciliação ou supersessão, preservando a decisão original e o estado atual.

### 14.3 Ciclo de vida do handoff

O handoff seguirá:

`draft → validating → approved_reserved → accepted → executing → completed`

Estados alternativos serão:

- `rejected`: módulo futuro recusou o pacote antes da execução.
- `expired`: validade terminou antes do aceite ou da execução.
- `cancelled`: responsável cancelou o pacote.
- `superseded`: uma nova versão substituiu o pacote antes da execução.
- `reconciliation_required`: opt-out, restrição, erro ou divergência exige revisão antes de prosseguir.

O snapshot é congelado e as reservas ou entradas de fila são criadas na transição atômica para `approved_reserved`. O módulo futuro deverá aceitar ou rejeitar o handoff idempotentemente. Cada membro terá seu próprio estado operacional: `queued_conflict`, `reserved`, `accepted`, `attempted`, `excluded`, `responded`, `converted` ou `completed`.

Quando um membro avançar de `queued_conflict` para `reserved` depois do aceite inicial, o produto emitirá um delta idempotente `handoff_member_released`, referenciando handoff, snapshot e pessoa. O módulo futuro não poderá tentar contato até confirmar o delta. Handoff concluído, cancelado ou expirado não libera novos membros; a fila correspondente expira.

Se surgir bloqueio antes da primeira tentativa, a pessoa será marcada `excluded`, sua reserva será liberada e o snapshot histórico permanecerá intacto. Se surgir depois de uma tentativa, novas tentativas serão interrompidas e o consumo de frequência será preservado. Rejeição ou cancelamento parcial deverá devolver resultado por pessoa.

### 14.4 Contrato de retorno

O módulo futuro de campanha deverá devolver eventos neutros de canal, como:

- Handoff aceito ou rejeitado.
- Campanha iniciada, pausada, cancelada ou concluída.
- Pessoa excluída antes do envio.
- Tentativa realizada.
- Resposta recebida e categoria operacional.
- Agendamento criado, alterado ou cancelado.
- Atendimento concluído.
- Opt-out ou reclamação.

Cada evento deverá ter identificador idempotente, pessoa canônica, campanha, handoff, snapshot, estado anterior quando aplicável, timestamp de ocorrência, timestamp de recebimento, origem e versão de schema. Eventos duplicados ou fora de ordem não poderão contar resultados duas vezes. Transições inválidas serão rejeitadas e enviadas à reconciliação, sem reescrever silenciosamente o histórico.

## 15. Dados e sinais

### 15.1 Fontes primárias permitidas

- Pessoa e contatos canônicos.
- Consentimentos, opt-outs e restrições.
- Atendimentos concluídos.
- Compras e itens reconciliados.
- Agendamentos e seus estados.
- Respostas e interações registradas.
- Interesses declarados.
- Origem do lead.
- Resultados de campanhas futuras.

### 15.2 Fontes externas

Somente dados de fontes públicas oficiais, com procedência, data de coleta, validade e base de uso registrada, poderão complementar a avaliação. Dados de terceiros sem origem comprovável e dados sensíveis de saúde não serão aceitos como sinais de marketing.

### 15.3 Recência e retenção

O cálculo poderá usar todo o histórico disponível, aplicando peso decrescente conforme a antiguidade quando adequado. O histórico detalhado de pontuações, fatores e transições será mantido por 24 meses. Depois desse período, serão preservados agregados e evidências mínimas de auditoria conforme a política de retenção da plataforma.

## 16. Contratos conceituais

Os nomes abaixo representam contratos de produto e orientarão o design técnico futuro. Eles não autorizam implementação ou mudança de schema por este PRD.

### `AudienceDefinition`

Define nome, objetivo, universo, fatores, limiares, permanência, incompatibilidades, validade, estado e versão de um público.

### `AudienceRuleVersion` e `FactorDefinition`

Registram fórmula, fatores, origem, unidade, agregação, janela, normalização, direção, peso, tratamento de ausentes, limiares, fixtures, autoria, aprovação e validade necessários para reproduzir um cálculo.

### `AudienceMembership`

Registra pessoa, público, oportunidade-destino quando aplicável, relação-âncora quando aplicável, pontuação, confiança, motivos, entrada, saída, permanência, versão e estado do cálculo.

### `ActivationEligibility`

Separa baixa confiança, elegibilidade universal e elegibilidade por canal, com motivo, fonte, validade, fingerprint e instante da última avaliação.

### `ReadinessGateStatus`

Expõe de modo verificável o tipo, escopo, estado, evidências, versão, responsável e validade de cada gate.

### `CrossSellMatrixEntry`

Define relação origem-destino, universo, evidência mínima, exclusões, aprovações e validade.

### `ReturnWindowDefinition`

Define identidade estável da relação de retorno, mapeamento de catálogo, itens que satisfazem o retorno, janela, tolerância, bandas, prioridade, validade e versão.

### `VipBenefitDefinition`

Define benefício, tipo, custo, limite, condição, validade e aprovação.

### `AudienceSnapshot`

Congela pessoas canônicas deduplicadas, associações de origem, destino único de cross-sell quando aplicável, membros reservados, candidatos em fila, exclusões, versões, fatores relevantes, elegibilidade, frequência e timestamp para um handoff.

### `CampaignObjectiveDefinition`

Define código, públicos aceitos, tipos de oferta, prioridade, compatibilidades, validade e política de atribuição obrigatória.

### `CampaignHandoffBrief`

Agrupa objetivo, oferta, prioridade, snapshot, motivos, alertas, exclusões, validade, aprovação e plano de medição.

### `HandoffMember`, `FrequencyReservation` e `CampaignConflictQueueEntry`

Registram o estado operacional individual, a reserva atômica e a fila determinística necessárias para impedir excesso e campanhas incompatíveis concorrentes.

### `CampaignOutcomeEvent`

Transporta um resultado idempotente do módulo futuro de campanha para a classificação.

### `AttributionPolicy`

Define janela, modo, precedência, tratamento de sobreposição e regra que liga resposta, agendamento e atendimento a um handoff.

### `RuleChangeProposal`

Descreve ajuste sugerido, evidência, motivação, riscos e relação com a versão vigente.

### `SimulationDiff`

Compara composição, elegibilidade, impacto e alertas entre duas versões.

### `ManualOverride`

Registra inclusão, exclusão ou fixação temporária, com motivo, autor e expiração.

> Observação: qualquer estrutura existente usada para agrupar arquivos, abas ou fontes de importação não deverá ser reutilizada como público de pessoas. Agrupamento de origem e segmentação de relacionamento são conceitos diferentes.

## 17. Requisitos não funcionais

### 17.1 Escala e desempenho

- Suportar até 100.000 pessoas e dez públicos ativos por workspace.
- Medir o SLA desde `ingested_at` do evento aceito no log canônico até a nova associação estar consultável: p95 de até cinco minutos e p99 de até 15 minutos.
- Sustentar, no teste de referência, 10 eventos por segundo por 15 minutos e pico de 50 eventos por segundo por um minuto, com 100.000 pessoas no workspace.
- Concluir a reconciliação diária em até quatro horas após o início configurado, sem bloquear consultas ou handoffs já aprovados.
- Paginar listas e executar agregações no backend.
- Permitir reprocessamento seletivo de pessoas afetadas por importação, merge, split ou evento.

### 17.2 Segurança e privacidade

- Aplicar isolamento por organização e workspace no backend e no banco.
- Impedir acesso baseado apenas em estado da interface.
- Não registrar dados pessoais, sinais sensíveis ou segredos em logs indevidos.
- Minimizar dados exibidos e transferidos conforme a capacidade do papel.
- Manter auditoria de leitura sensível, aprovação, regra, override e handoff.
- Tratar integrações e eventos externos como entrada não confiável.

### 17.3 Confiabilidade

- Processamento idempotente.
- Ordenação segura de eventos por ocorrência e versão.
- Retry sem duplicar associação, transição, contagem ou resultado.
- Snapshot imutável.
- Regras e configurações versionadas.
- Falha fechada quando elegibilidade ou autorização não puder ser confirmada.

### 17.4 Observabilidade

Monitorar:

- Tempo e falha de recálculo.
- Pessoas desatualizadas além do SLA.
- Eventos duplicados, atrasados ou rejeitados.
- Cobertura e confiança dos sinais.
- Variação anormal no tamanho dos públicos.
- Bloqueios por motivo.
- Overrides ativos e expirados.
- Handoffs, reconciliações e resultados pendentes.

## 18. Métricas e medição

### 18.1 Métrica principal

**Atendimentos realizados associados às campanhas originadas pelos Públicos inteligentes.**

Agendamento criado é indicador intermediário. O resultado principal exige atendimento concluído, recebido por evento confiável e ligado ao snapshot e à campanha correspondentes. Associação operacional não será descrita como causalidade comprovada.

### 18.1.1 Política de atribuição operacional

Cada objetivo deverá publicar, antes do handoff, uma `AttributionPolicy` com janela em dias e um dos modos:

- `direct`: o evento carrega campanha, handoff ou agendamento originado explicitamente pela campanha.
- `last_eligible_touch`: na ausência de vínculo direto, associa ao handoff elegível mais recente dentro da janela e marca o resultado como inferido.

Resposta com identificador de campanha será direta. Agendamento herdará o vínculo direto que o criou; atendimento herdará o vínculo do agendamento. Quando não houver vínculo direto, aplica-se `last_eligible_touch`. Cada atendimento contará uma única vez na métrica principal, embora os demais handoffs candidatos permaneçam registrados para auditoria. Sem política válida ou sem candidato dentro da janela, o resultado ficará `unattributed` e não será forçado para uma campanha.

### 18.2 Métricas de produto e segurança

- Cobertura classificável por universo.
- Percentual ativável, bloqueado e de baixa confiança.
- Distribuição e sobreposição dos públicos.
- Taxa de entrada e saída por versão.
- Tempo entre evento e atualização.
- Taxa de revisão e aprovação de sugestões.
- Pessoas excluídas por frequência ou incompatibilidade.
- Taxa de resposta e de agendamento como indicadores intermediários.
- Atendimentos realizados por objetivo.
- Opt-outs, reclamações e incidentes de segurança.
- Custo por lead ativado e por atendimento realizado, quando o módulo de campanha fornecer custos.

### 18.3 Método do piloto

O piloto usará comparação antes/depois com períodos históricos comparáveis por objetivo e sazonalidade. Não haverá grupo de controle no primeiro ciclo; portanto, o relatório apresentará tendência e associação, não lift causal.

Antes da primeira campanha, o plano do piloto deverá congelar baseline, período de comparação, população, duração, volume mínimo analisável, janela e modo de atribuição, custo, responsável, limitações e critérios de pausa. O primeiro ciclo comparável servirá para calibrar a meta percentual; essa meta e o efeito mínimo relevante deverão ser publicados antes do ciclo seguinte usado para decisão.

O piloto será considerado promissor quando:

- Todos os critérios de segurança e qualidade estiverem atendidos.
- Não houver incidente de ativação indevida.
- Houver melhoria positiva em atendimentos realizados acima da meta publicada após a calibração.
- Eventos de resultado e atribuição estiverem reconciliados.

O piloto será pausado imediatamente se houver pessoa com bloqueio obrigatório ativada, falha de isolamento, impossibilidade de interromper opt-out, aumento de reclamações acima do limite publicado ou resultados não reconciliáveis. Outros limites numéricos serão definidos somente após o primeiro ciclo comparável, evitando números arbitrários sem baseline confiável.

## 19. Fases de entrega do MVP

O MVP é único, mas será construído em slices sequenciais e verificáveis.

### Slice 1 — Pré-requisitos, elegibilidade e sinais

- Consumir apenas base canônica promovida e reconciliada.
- Definir universos lead/paciente.
- Implementar gates verificáveis e elegibilidade universal e por canal.
- Disponibilizar fontes, validade e confiança dos sinais.

### Slice 2 — Motor e seis públicos

- Implementar pontuações explicáveis e regras versionadas.
- Calcular os seis públicos iniciais e sobreposições.
- Aplicar histerese, permanência e eventos fortes.
- Executar recálculo por evento e reconciliação diária.

### Slice 3 — Painel e explicabilidade

- Criar cartões, lista, filtros e detalhe individual.
- Exibir motivos, fontes, confiança, versão e próximos gatilhos.
- Garantir continuidade em mobile, teclado, sair e voltar.

### Slice 4 — Governança e handoff

- Criar simulação de mudanças, aprovações e overrides.
- Aplicar frequência, reservas atômicas, prioridade e compatibilidade.
- Congelar snapshot deduplicado e gerar briefing imutável.
- Implementar ciclo de vida, expiração, cancelamento e reconciliação do handoff.

### Slice 5 — Resultados e aprendizagem supervisionada

- Receber eventos neutros de campanha.
- Reconciliar atribuição operacional e atualizar pontuações.
- Sugerir ajustes de regras sem publicá-los automaticamente.
- Gerar o pacote de prontidão e a linha de base necessários ao piloto da Dra. Marcella.

Nenhum slice autoriza contato real por si só. A construção do MVP deste PRD termina quando os cinco slices passam seus critérios técnicos. A execução e o piloto ponta a ponta dependem do módulo de campanha e de gates próprios, aprovados separadamente; por isso, sucesso do piloto é um gate de liberação, não uma tarefa interna do motor de públicos.

## 20. Critérios de aceite

### 20.1 Base e identidade

- O motor recusa handoff quando a base não está promovida e reconciliada.
- Identidade ambígua permanece classificável apenas quando seguro, mas nunca ativável.
- Merge e split recalculam apenas as pessoas e snapshots futuros afetados, preservando auditoria.
- Lead muda para paciente somente após atendimento concluído.

### 20.2 Classificação

- Os seis públicos iniciais produzem resultado reproduzível para a mesma pessoa, sinais, configuração e versão, validado por fixtures.
- Lead frio/morno e paciente em risco/inativo nunca coexistem entre si.
- Cross-sell e VIP coexistem somente nas combinações permitidas.
- VIP nunca inclui lead.
- Cross-sell de lead exige interesse declarado ou evidência de origem compatível.
- Cross-sell de paciente exige histórico ou afinidade prevista em matriz aprovada.
- Cross-sell preserva uma associação por destino e o cartão conta pessoas canônicas únicas.
- Cada handoff de cross-sell possui um único destino; oportunidades de outros destinos não entram no mesmo pacote.
- Risco e inatividade usam `ReturnWindowDefinition`, registram uma única relação-âncora determinística e preservam as demais relações avaliadas.
- Entrada e saída respeitam histerese e permanência, exceto em evento forte.
- Baixa confiança acompanha a associação e o handoff como alerta explícito.

### 20.3 Segurança de ativação

- Nenhuma pessoa com opt-out geral, identidade ambígua, ausência de canal permitido, restrição obrigatória ou reclamação aberta entra no snapshot.
- Opt-out específico bloqueia o canal correspondente e a rechecagem pré-tentativa impede seu uso.
- Alteração de opt-out invalida imediatamente a elegibilidade para snapshots futuros e aciona reconciliação dos ainda não executados.
- Override não remove bloqueio obrigatório nem viola universo, exclusividade ou matriz aprovada.
- Dados clínicos sensíveis não aparecem como fator, motivo ou campo de handoff.
- Isolamento entre organizações e capacidades de aprovação são comprovados por testes adversariais.

### 20.4 Frequência e conflitos

- Uma pessoa não ultrapassa duas campanhas na janela móvel de 30 dias.
- Aprovações concorrentes usam reserva atômica e não conseguem criar um terceiro espaço.
- Campanhas incompatíveis são enfileiradas por prioridade.
- Campanhas incompatíveis concorrentes não conseguem reservar a mesma pessoa; a fila avança somente após rechecagem transacional.
- Campanhas compatíveis coexistem somente dentro do limite.
- Cancelamento antes de tentativa libera a reserva; tentativa converte reserva em consumo por 30 dias.

### 20.5 Recalculo e confiabilidade

- Evento confiável atualiza a pessoa em p95 de até cinco minutos e p99 de até 15 minutos no teste de referência.
- Reconciliação diária termina em até quatro horas e corrige evento atrasado sem duplicar transições.
- Retry, duplicidade e evento fora de ordem não duplicam associação ou resultado.
- Uma nova importação recalcula somente depois de promoção e reconciliação concluídas.
- O sistema suporta 100.000 pessoas por workspace dentro do SLA definido.

### 20.6 Governança

- Toda versão de regra tem autor, aprovador, motivo, simulação e timestamp.
- A simulação mostra entradas, saídas, permanências, bloqueios e alertas antes da publicação.
- Nenhum novo público ultrapassa o limite de dez ativos.
- Uma definição sintética adicional completa criação, simulação, aprovação, publicação, substituição e desativação.
- Sugestão da IA não produz efeito sem aprovação.
- Override exige motivo e expiração e volta ao motor automaticamente.

### 20.7 Handoff e resultados

- O snapshot permanece imutável e reproduzível.
- A união de vários públicos contém uma única ocorrência por pessoa canônica.
- O briefing contém objetivo, oferta ou benefício, prioridade, motivos, alertas, exclusões, validade e medição.
- O contrato não exige canal nem contém mensagem ou criativo.
- Handoff percorre somente transições válidas e exclusão posterior não reescreve o snapshot.
- Resultado duplicado é contado uma única vez.
- Atendimento realizado só é associado quando a política versionada o vincula de modo auditável à pessoa, campanha, handoff e snapshot; caso contrário fica não atribuído.

### 20.8 Experiência

- O usuário entende por que uma pessoa está em cada público sem consultar documentação técnica.
- Filtros, rascunho e revisão não se perdem ao voltar, trocar de dispositivo compatível ou navegar por teclado.
- Estados sem ação, não ativável e baixa confiança não são apresentados como clusters adicionais.
- Alertas deixam claro quando uma prévia é apenas analítica e ainda não pode ser entregue a campanha.

## 21. Casos de teste prioritários

1. Lead com interesse recente entra como morno; depois de perda de recência, só muda para frio ao cruzar o limiar de saída e cumprir permanência.
2. Lead com agendamento futuro continua lead; após atendimento concluído, torna-se paciente e é reavaliado pelas regras de paciente.
3. Paciente próximo da janela de retorno entra em risco; ao ultrapassar a tolerância, passa para inativo sem coexistência entre os dois.
4. Paciente inativo com afinidade aprovada pertence também a cross-sell.
5. Paciente VIP em risco conserva as duas associações, mas campanhas incompatíveis são priorizadas.
6. Lead com interesse declarado compatível entra em cross-sell com baixa confiança e segue ao handoff apenas com alerta e aprovação.
7. Pessoa com alta aderência e opt-out aparece na análise como não ativável e nunca entra no snapshot.
8. Duas campanhas compatíveis consomem o limite de 30 dias; uma terceira fica enfileirada.
9. Merge de identidade soma evidências sem duplicar histórico; split redistribui evidências e recalcula as duas pessoas.
10. Evento de campanha duplicado ou atrasado não duplica resposta, agendamento ou atendimento.
11. Alteração proposta de limiar mostra o diff completo e não muda o público antes da aprovação.
12. Override expira, registra auditoria e devolve a pessoa à classificação calculada.
13. Override que tentaria tornar um lead VIP ou manter frio e morno simultaneamente é rejeitado.
14. Seleção de vários públicos gera uma única ocorrência da pessoa; um handoff de cross-sell aceita somente oportunidades do seu destino único.
15. Dois handoffs concorrentes reservam os espaços disponíveis; o terceiro falha ou fica em fila sem ultrapassar o limite.
16. Opt-out específico mantém outros canais permitidos, mas impede tentativa no canal bloqueado; opt-out geral impede todo o handoff.
17. Bloqueio após aprovação exclui a pessoa da execução sem alterar o snapshot histórico.
18. Um público adicional sintético percorre todo o workflow e respeita o limite de dez ativos.
19. Dois handoffs incompatíveis concorrentes não executam a mesma pessoa; o segundo entra em fila e avança após liberação e rechecagem.
20. Mapeamentos sobrepostos de retorno no mesmo nível e prioridade impedem publicação; com configuração válida, duas execuções escolhem a mesma relação-âncora.

## 22. Riscos e mitigação

### Segmentos baseados em dados incompletos

**Risco:** aparência de precisão com baixa cobertura.  
**Mitigação:** confiança separada, fontes visíveis, alerta no handoff e métricas de cobertura.

### Excesso de públicos

**Risco:** fragmentação e operação inviável.  
**Mitigação:** seis padrões, limite de dez ativos e evidência obrigatória para qualquer adição.

### Oscilação de pessoas entre públicos

**Risco:** listas instáveis e campanhas contraditórias.  
**Mitigação:** limiares de entrada/saída, permanência mínima, eventos fortes e histórico de transições.

### Sobreposição e fadiga

**Risco:** pessoa elegível para várias campanhas simultâneas.  
**Mitigação:** compatibilidade, fila de prioridade e limite de duas campanhas em 30 dias.

### Interpretação clínica indevida

**Risco:** cross-sell ou VIP parecer recomendação assistencial.  
**Mitigação:** exclusão de dados clínicos sensíveis, matriz aprovada e linguagem de oportunidade, nunca de indicação.

### Aprendizado reforçar viés histórico

**Risco:** resultados passados privilegiarem grupos já mais contatados.  
**Mitigação:** sugestões explicáveis, comparação de distribuição, alerta de concentração, aprovação humana e ausência de ajuste autônomo.

### Base inconsistente alcançar campanha

**Risco:** duplicidade, contato errado ou violação de opt-out.  
**Mitigação:** gates obrigatórios, elegibilidade separada, rechecagem no handoff e falha fechada.

## 23. Dependências

- Onboarding com `ClassificationPlanDraft`, revisão e `ImportPlan` claramente separados.
- Promoção atômica, idempotente e reconciliada para a base canônica.
- Identidade canônica reversível e auditável.
- Eventos confiáveis de atendimento, compra, agendamento e interação.
- Consentimento, opt-out, contato e restrições governados.
- RLS e autorização por capacidade no backend e no banco.
- Catálogo de serviços/produtos e janelas de retorno por organização.
- Módulo futuro de campanhas aderente aos contratos de handoff e retorno.

## 24. Decisões de calibração para o piloto

O piloto controlado será realizado com a base da Dra. Marcella somente depois da conclusão dos gates de onboarding, identidade, promoção e reconciliação.

Antes da ativação, Produto, Operações e responsáveis da clínica deverão publicar a primeira configuração versionada com:

- Pesos e limiares de entrada e saída.
- Permanência mínima e eventos fortes.
- Janelas esperadas de retorno por serviço ou categoria.
- Mapeamentos canônicos e prioridade das `ReturnWindowDefinition`.
- Percentil e mínimos do VIP.
- Matriz inicial de cross-sell e suas aprovações.
- Catálogo de benefícios VIP, custo e validade.
- Prioridades e incompatibilidades entre objetivos.
- Definição do baseline comparável.
- Política operacional para alertas de baixa confiança.
- Elegibilidade e opt-outs por canal.
- Janela e modo de atribuição por objetivo.
- Duração, volume mínimo, efeito mínimo e critérios de pausa do piloto.

Esses valores são configuração de produto sujeita a evidência e aprovação. Não devem ser inventados pela IA nem embutidos definitivamente no código.

## 25. Definição de pronto do MVP

### 25.1 Pronto técnico deste produto

O MVP de Públicos inteligentes estará tecnicamente pronto quando os seis públicos puderem ser calculados e explicados com configuração publicada sobre uma base canônica validada; gates, elegibilidade, frequência e concorrência forem aplicados de forma segura; alterações puderem ser simuladas, versionadas e aprovadas; um snapshot deduplicado e imutável com briefing puder ser entregue; e eventos neutros de resultado puderem retornar idempotentemente segundo o contrato.

### 25.2 Pronto para piloto ponta a ponta

O piloto só poderá começar quando, além do pronto técnico, existirem canal real, módulo de campanha, rechecagem pré-tentativa, retorno de resultados, política de atribuição e plano de medição aprovados. O piloto será concluído quando demonstrar segurança, qualidade de dados, reconciliação e melhoria acima da meta publicada após o ciclo de calibração.

Até que esses componentes externos estejam integrados e comprovados, a experiência deverá ser descrita como **protótipo técnico de Públicos inteligentes**, não como campanha ponta a ponta em produção.

## 26. Glossário operacional

- **Base promovida:** registros que saíram do staging por uma promoção atômica aprovada e possuem `PromotionResult` reconciliado.
- **Base reconciliada:** totais, identidades e efeitos promovidos conferem com o plano e não há bloqueio crítico aberto.
- **Evento confiável:** evento canônico validado, autorizado, idempotente e com origem e timestamp verificáveis.
- **Fonte confiável:** fonte permitida com procedência, validade, versão e nível mínimo definido pela regra.
- **Evidência mínima:** conjunto de sinais declarado e testável na versão da regra ou da matriz; nunca inferido fora dela.
- **Baixa confiança:** confiança abaixo do limiar publicado, sem bloqueio crítico de identidade ou ativação.
- **Relação-âncora:** relação de retorno que determina de modo reproduzível o estado de risco ou inatividade.
- **Campanhas compatíveis:** objetivos cuja matriz publicada permite coexistência para a mesma pessoa e janela.
- **Ciclo de análise:** período versionado usado para avaliar estabilidade de um padrão e comparar resultados.
- **Incidente de ativação indevida:** tentativa de contato com pessoa que possuía bloqueio obrigatório válido no instante da rechecagem.
- **Atendimento associado:** atendimento ligado por uma `AttributionPolicy`; associação inferida não prova causalidade.
