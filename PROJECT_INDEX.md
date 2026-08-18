# Projeto Consultório.ia — Índice canônico

**Última verificação:** 18/08/2026  
**Escopo:** inventário de repositórios, documentos, aplicações e versões implantadas.

> Este índice organiza as fontes de verdade do projeto. Ele não autoriza contato com pacientes, promoção de dados, envio de campanhas ou execução de procedimentos clínicos.

## 1. Repositórios

| Componente | Repositório | Visibilidade | Branch canônica | Estado verificado |
|---|---|---:|---|---|
| Agente de classificação e documentação de produto | [gchohfi/orquestra-file-classification-agent](https://github.com/gchohfi/orquestra-file-classification-agent) | Público | `main` | PRDs principais, base de lembretes, classificador e testes versionados |
| Patient Ops, importação e Supabase | [gchohfi/Clinica](https://github.com/gchohfi/Clinica) | Privado | `main` | Aplicação e migrations versionadas; [PR #9](https://github.com/gchohfi/Clinica/pull/9) ainda precisa ser integrada para refletir o estado registrado do banco |
| Questionário de regras de retorno | [gchohfi/questionario-retorno-marcella](https://github.com/gchohfi/questionario-retorno-marcella) | Privado | `main` | Formulário, API, D1, painel administrativo e controles de segurança versionados |
| Questionário do protocolo LinearZ | **Repositório privado pendente** | — | — | Site existe, mas a fonte ainda não está em um repositório GitHub verificado |

## 2. Documentos de produto

| Documento | Local canônico | Estado |
|---|---|---|
| PRD — Onboarding Inteligente de Dados | [`PRD_Onboarding_Inteligente_de_Dados.md`](https://github.com/gchohfi/orquestra-file-classification-agent/blob/main/PRD_Onboarding_Inteligente_de_Dados.md) | Publicado na `main` |
| PRD — Públicos Inteligentes e Clusterização Adaptativa | [`PRD_Publicos_Inteligentes_e_Clusterizacao_Adaptativa.md`](https://github.com/gchohfi/orquestra-file-classification-agent/blob/main/PRD_Publicos_Inteligentes_e_Clusterizacao_Adaptativa.md) | Publicado na `main` |
| PRD — Lembretes Automáticos de Retorno | [`PRD_Lembretes_Automaticos_de_Retorno_por_Procedimento.md`](https://github.com/gchohfi/orquestra-file-classification-agent/blob/main/PRD_Lembretes_Automaticos_de_Retorno_por_Procedimento.md) | Versão 2.0 publicada |
| Base de regras — Dra. Marcella | [`BASE_DE_CONSULTA_REGRAS_DE_LEMBRETES_DRA_MARCELLA.md`](https://github.com/gchohfi/orquestra-file-classification-agent/blob/main/BASE_DE_CONSULTA_REGRAS_DE_LEMBRETES_DRA_MARCELLA.md) | Versão 1.1 publicada; contato externo continua bloqueado até autorização explícita |
| PRD — Catálogo de Procedimentos e Ciclos de Protocolo | `PRD_Catalogo_de_Procedimentos_e_Ciclos_de_Protocolo.md` | Publicação pendente em PR exclusiva |

## 3. Sites e versões

| Aplicação | URL | Fonte versionada | Situação em 18/08/2026 |
|---|---|---|---|
| Questionário de regras de retorno | [questionario-retorno-marcella.gchohfi.chatgpt.site](https://questionario-retorno-marcella.gchohfi.chatgpt.site/) | [GitHub privado](https://github.com/gchohfi/questionario-retorno-marcella) | Sites: commit `6963c5f`; GitHub: `82e51db`. Reimplantação da versão segura pendente |
| Questionário LinearZ | [protocolo-linearz-marcella.gchohfi.chatgpt.site](https://protocolo-linearz-marcella.gchohfi.chatgpt.site/) | Repositório privado pendente | Sites possui versões `d71f3a2` e `eb9e68c`; nenhuma delas foi localizada no GitHub conectado |

## 4. Regras de fonte de verdade

1. A `main` de cada repositório é a fonte de verdade do código e da documentação aprovada.
2. Todo deploy deve registrar o commit exato publicado e corresponder a uma versão existente no GitHub.
3. Toda migration aplicada em ambiente hospedado deve existir na `main`, acompanhada do respectivo teste e de um registro de aplicação.
4. PRDs novos ou alterados entram por PR própria, com título, versão, data e status.
5. Arquivos com pacientes, telefones, documentos, prontuários, pagamentos, respostas identificadas ou segredos não entram no GitHub.
6. Dados operacionais permanecem em serviços privados autorizados, com acesso mínimo e trilha de auditoria.
7. Aprovação de regra não equivale a autorização de contato. Opt-out, restrição médica e revisão humana continuam sendo gates obrigatórios.

## 5. Estado operacional

- **Contato externo automático:** não autorizado por este índice.
- **Dados em staging:** não equivalem a dados promovidos.
- **Questionário de retorno:** código seguro versionado; atualização do deploy pendente.
- **Catálogo de procedimentos:** PRD pendente de publicação.
- **LinearZ:** código-fonte pendente de repositório privado.
- **Patient Ops:** alinhamento da PR #9 com a `main` pendente.

## 6. Processo de atualização

Ao concluir uma entrega:

1. abrir uma PR com escopo único;
2. executar build, testes e varredura de segredos;
3. revisar impacto em LGPD, opt-out e acesso;
4. integrar a PR na `main`;
5. implantar somente o commit integrado;
6. atualizar este índice com o novo commit, versão e estado;
7. remover branches já integradas após confirmação.
