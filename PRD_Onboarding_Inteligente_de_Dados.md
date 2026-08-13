# PRD — Onboarding Inteligente de Dados

## 1. Visão do produto

Criar um módulo da Orquestra IA capaz de transformar arquivos heterogêneos de clínicas em uma base canônica, confiável e rastreável no Supabase.

A planilha da Dra. Marcella será o primeiro caso de validação, não o modelo definitivo. Ela combina competência, atendimentos, procedimentos, produtos, profissionais, parcelas, custos e resultados financeiros em granularidades diferentes.

### Objetivo principal

Produzir uma base pronta para uso, garantindo:

- Nenhuma perda silenciosa de dados.
- Rastreabilidade até arquivo, aba, linha e coluna de origem.
- Interpretação semântica por agente de IA.
- Validação determinística de todas as linhas.
- Aprovação administrativa antes da promoção.
- Reversão segura do lote e das uniões de identidade.

### Fora do MVP

- Prontuários, prescrições, exames e conteúdo assistencial.
- Sincronização contínua com planilhas.
- Segmentações, campanhas ou recomendações após a importação.
- Confirmação automática de pagamentos.
- Alteração do schema pela IA.
- Criação automática de usuários.
- Importação parcial de um lote com bloqueios.
- Operação fora do padrão brasileiro.

## 2. Usuários e jornada

Somente administradores da organização poderão enviar, revisar, promover ou reverter importações.

Fluxo:

1. Acessar pelo onboarding ou pelas configurações.
2. Enviar um lote com vários XLSX ou CSV, até 100 MB no total.
3. Acompanhar parsing, análise e validação assíncronos.
4. Receber o inventário de arquivos, abas, entidades e relações detectadas.
5. Revisar o plano proposto pela IA em um assistente guiado.
6. Resolver ambiguidades de identidade, catálogo, campos adicionais e financeiro.
7. Conferir a simulação e a reconciliação.
8. Aprovar a promoção atômica.
9. Receber relatório, identidades provisórias e checklist de complementação.

Estados do lote:

`recebido → verificando → processando → analisando → aguardando revisão → pronto para promover → promovendo → promovido`

Estados alternativos:

`bloqueado`, `falhou`, `cancelado`, `revertido` e `expirado`.

O plano para arquivos de até 100 MB deverá ficar pronto em até 30 minutos. O usuário poderá sair da tela e retornar sem interromper o processamento.

## 3. Modelo canônico

### Entidades principais

- Organização e unidade/workspace.
- Pessoa, contatos, documentos, endereços e consentimentos.
- Identidade de origem e estado `provisória` ou `verificada`.
- Profissional, sem associação automática a uma conta de usuário.
- Catálogo canônico de procedimentos e produtos.
- Aliases de catálogo por organização.
- Atendimento/venda como evento principal.
- Participantes e profissionais relacionados ao evento.
- Itens de procedimento e produto.
- Plano financeiro e parcelas.
- Contas a receber com estado inicial `pendente` quando não houver prova de pagamento.
- Meios de pagamento.
- Comissões, impostos e alocações de custo categorizadas.
- Resultados financeiros canônicos recalculados.
- Observações e campos adicionais.
- Lotes, arquivos, abas, linhas, mapeamentos, decisões e auditoria.

### Campos coringa

Campos não pertencentes ao núcleo serão armazenados como atributos tipados e categorizados, nunca como `coringa_1` ou JSON sem governança.

Cada definição terá:

- Organização e entidade proprietária.
- Nome e descrição.
- Categoria.
- Tipo: texto, número, moeda, data, booleano ou lista.
- Coluna de origem.
- Regra de validação.
- Estado de aprovação.

A IA poderá propor novos campos, mas somente o administrador poderá aprová-los.

### Terminologia

O backend usará entidades universais. A interface poderá mostrar “Paciente”, “Cliente” ou outro termo configurado pela organização.

## 4. Agente de mapeamento

O agente analisará integralmente o lote por meio de ferramentas. O arquivo de 100 MB não será enviado como um único prompt.

O agente poderá:

- Inventariar arquivos, abas, cabeçalhos e relações.
- Consultar estatísticas e amostras.
- Inspecionar blocos direcionados.
- Inferir entidades e granularidades.
- Propor campos, transformações, aliases e cadastros provisórios.
- Explicar evidências, confiança e conflitos.
- Solicitar validações determinísticas sobre todas as linhas.

O agente produzirá um `ImportPlan` versionado e validável. Ele não poderá:

- Executar SQL.
- Gravar diretamente no modelo canônico.
- Criar tabelas ou migrations.
- Descartar dados sem indicação explícita.
- Considerar sua própria pontuação como evidência suficiente.
- Tratar conteúdo de células como instruções operacionais.

### Gate do provedor de IA

O fornecedor será escolhido posteriormente, mas deverá oferecer:

- API empresarial e processamento server-side.
- Proibição contratual de treinamento com os dados.
- Retenção controlada.
- Criptografia e isolamento.
- Região e subprocessadores conhecidos.
- Exclusão verificável.
- Adapter que permita substituição do fornecedor.

Sem aprovação técnica, jurídica e de privacidade, o processamento falhará de forma fechada.

## 5. Regras de mapeamento e identidade

### Confiança por risco

A automação não usará um percentual global:

- Campos descritivos exigem compatibilidade de cabeçalho, tipo e contexto.
- Campos financeiros exigem tipo, granularidade e reconciliação.
- Identidade exige identificador forte ou múltiplas evidências independentes.
- Campos protegidos exigem validação adicional ou revisão.

A IA poderá preparar automaticamente o staging. A promoção sempre dependerá da aprovação do administrador.

### Identidade

- Mesmo nome nunca será evidência suficiente para uma união definitiva.
- CPF, identificador legado único ou múltiplos sinais compatíveis poderão autorizar união automática.
- Toda união será auditável e reversível.
- Registros apenas com nome gerarão identidades provisórias vinculadas à origem.
- Agrupamentos por nome dentro do lote serão provisórios e não poderão unir automaticamente pessoas de outras fontes.

### Atualizações

Em campos comuns, o lote aprovado mais recente vence, com exceções:

- Células vazias não apagam valores existentes.
- Documento, identidade, consentimento, opt-out e estados financeiros são protegidos.
- Ausência no arquivo não exclui nem inativa registros.
- Conflitos relevantes preservam observações concorrentes e exigem revisão.
- Repetir o mesmo lote não cria duplicidades.

## 6. Financeiro e reconciliação

Um atendimento poderá conter vários procedimentos, produtos, profissionais, custos e parcelas.

Regras:

- As linhas não serão somadas cegamente.
- Combinações entre itens e parcelas serão desmontadas em entidades relacionadas.
- Parcelas sem comprovação de pagamento entram como contas a receber pendentes.
- Custos serão alocações categorizadas, permitindo categorias diferentes em cada clínica.
- Lucro, comissão e valores derivados serão recalculados.
- Valores originais e fórmulas serão preservados como evidência.
- Divergências superiores a R$ 0,01 no registro lógico serão sinalizadas.
- Fórmulas e macros do arquivo não serão executadas.
- Campos financeiros reconciliados deverão usar precisão decimal, nunca ponto flutuante.

No caso representativo, há colunas de resultado e conferência que nem sempre coincidem; isso deverá gerar reconciliação, não substituição silenciosa.

## 7. Promoção, retenção e reversão

A promoção será atômica e bloqueada enquanto houver:

- Coluna crítica sem destino.
- Linha não contabilizada.
- Conflito de identidade crítico.
- Cadastro auxiliar obrigatório não aprovado.
- Divergência financeira não explicada.
- Violação de campo protegido.
- Plano inválido ou alterado depois da aprovação.

O arquivo bruto ficará armazenado por 90 dias, criptografado e isolado por organização. Logs não poderão conter dados pessoais.

A reversão:

- Remove somente efeitos ainda atribuíveis ao lote.
- Restaura valores anteriores quando não houve edição posterior.
- Preserva alterações feitas depois da promoção.
- Apresenta impacto e conflitos antes da confirmação.
- Permite desfazer uniões de identidade.
- Mantém trilha de auditoria após a exclusão do arquivo bruto.

## 8. Interfaces e contratos

Contratos principais:

- `WorkbookManifest`: arquivos, abas, dimensões, tipos e alertas.
- `CanonicalSchemaCatalog`: entidades e campos aceitos pelo backend.
- `MappingProposal`: origem, destino, transformação, confiança e justificativa.
- `EntityProposal`: profissionais, unidades, catálogo e campos adicionais.
- `IdentityDecision`: evidências, conflitos e decisão reversível.
- `ReconciliationCheck`: valores de origem, cálculo canônico e diferença.
- `ImportPlan`: versão consolidada e hash do lote.
- `ImportPreview`: criações, atualizações, identidades provisórias, bloqueios e totais.
- `PromotionResult`: registros promovidos, rejeições, auditoria e checklist.
- `RollbackImpact`: dados seguros para reversão e dependências posteriores.

Todas as respostas do agente deverão passar por validação de schema antes de produzir qualquer efeito.

## 9. Critérios de aceite

### Integridade

- 100% das linhas de origem contabilizadas como importadas, preservadas, bloqueadas ou explicitamente excluídas.
- 100% dos valores promovidos rastreáveis à origem.
- Nenhum campo descartado silenciosamente.
- Totais reconciliados no nível correto de granularidade.
- Retry e reenvio não criam duplicidades.

### Segurança

- RLS e isolamento entre organizações comprovados.
- Nenhum segredo ou dado pessoal em logs.
- Arquivos acessíveis apenas por URLs assinadas.
- Conteúdo das células tratado como dado não confiável.
- Provedor de IA bloqueado até aprovação do gate.

### Identidade

- Nenhuma união definitiva somente por nome.
- Identidades provisórias claramente sinalizadas.
- Toda união reversível.
- Campos protegidos nunca sobrescritos silenciosamente.

### Experiência

- Administrador consegue sair e retornar ao processamento.
- Bloqueios mostram motivo, evidência e ação necessária.
- Promoção exige confirmação explícita.
- Relatório final diferencia base pronta, dados provisórios e pendências.

### Caso Dra. Marcella

O teste deverá comprovar que:

- As abas relacionadas formam eventos únicos, itens e parcelas.
- Repetições combinatórias não multiplicam receitas ou custos.
- Nomes sem identificadores fortes geram identidades provisórias.
- Profissionais, procedimentos e produtos viram propostas canônicas com aliases.
- Parcelas entram como pendentes.
- Divergências entre resultado informado e recalculado são exibidas.
- Nenhuma regra específica desta planilha é incorporada como regra universal.

## 10. Métricas do piloto

Métrica principal: integridade e rastreabilidade.

Metas:

- 100% das linhas contabilizadas.
- Zero perda silenciosa.
- Zero duplicidade após retry.
- Zero união por nome apenas.
- 100% dos registros promovidos com linhagem.
- 100% das divergências críticas apresentadas antes da promoção.
- Plano gerado em até 30 minutos para lote de 100 MB.
- Reversão validada sem apagar edições posteriores.

## 11. Lançamento

1. Validar parsing e reconciliação com dados sintéticos.
2. Validar segurança, RLS e o contrato do agente.
3. Executar o caso da Dra. Marcella em staging, sem promoção automática.
4. Revisar o plano com um administrador.
5. Promover um lote piloto reversível.
6. Conferir a base canônica e o relatório.
7. Somente depois liberar o onboarding para outras organizações.

## 12. Limite desta entrega

Este documento define o produto e seus critérios. Nenhum código, migration, integração ou alteração de banco faz parte desta entrega.
