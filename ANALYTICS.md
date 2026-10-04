# Web Analytics — ForkRun

Painel: https://vercel.com/lucasluzadabo-2699s-projects/kahoot-log/analytics

Integração oficial `@vercel/analytics/react`, montada uma vez dentro do
BrowserRouter, fora de Routes. As mudanças de localização do React Router
geram as visualizações; o rastreamento automático de history é desativado
pelo SDK quando a propriedade route é fornecida, evitando duplicações.

Coleta somente em produção e em https://fr.adabo.com.br. As rotas permitidas
são `/`, `/join`, `/admin` e `/perguntas`. Rotas desconhecidas são bloqueadas.
Não há identificação de usuários, leitura de formulários, propriedades de
partidas, eventos personalizados ou campanhas UTM. Jogar, responder perguntas,
criar partidas e preencher um PIN não geram eventos de ação. As etapas de uma
partida que permanecem em `/join` aparecem como a mesma página.

Antes do envio, parâmetros, fragmentos, credenciais e campos extras do evento
são removidos. O referrer é reduzido à origem antes de carregar o script,
porque o callback beforeSend não recebe esse campo. A política HTTP referrer
`origin` é definida no HTML. A atribuição antiga do SDK é descartada; outros
dados de sessão do aplicativo permanecem intactos. Se a preparação de
privacidade falhar, o script não é carregado.

Nenhum plano, adicional ou serviço foi contratado. No plano Hobby da equipe,
a documentação consultada em 04/10/2026 informa 50.000 eventos por mês,
compartilhados entre os projetos, e um mês de histórico garantido. Ao exceder
a cota, a coleta pode ser interrompida, sem cobrança de excedentes. Cliques e
ações específicas exigem eventos personalizados em plano pago e não foram
habilitados. Bloqueadores de Analytics podem impedir algumas contagens.

Fonte: https://vercel.com/docs/analytics/limits-and-pricing

Uma vez por semana, compare visitantes e visualizações dos últimos sete dias
com a semana anterior. Confira origens, países, dispositivos e o consumo de
Web Analytics da equipe. Antes de os dados saírem da janela de um mês, guarde
um resumo e screenshots dos agregados. Nos meses de 31 dias, preserve também
as semanas iniciais antes de elas desaparecerem. Não some visitantes semanais
como visitantes únicos mensais, pois a mesma pessoa pode aparecer novamente.

Resumo mensal sugerido: intervalo exato, visitantes, visualizações,
principais origens, países, dispositivos, comparação com o período anterior
e eventuais dias sem coleta. Não guarde dados individuais dos jogadores.

Verificação: `npm test`, `npm run build` e revisão ESLint dos arquivos alterados.
`node tools/analytics-check.mjs` verifica o build com o script oficial;
`node tools/analytics-check.mjs --live` realiza uma visita sintética em produção
e verifica as quatro rotas, voltar no navegador, preenchimento de formulários
sem enviar dados, URLs sensíveis bloqueadas e ausência de duplicação.

O teste usa somente valores fictícios e não cria salas nem entra em partidas.
Verificação local em 04/10/2026: seis testes passaram, build concluído, ESLint
dos arquivos alterados sem erros. O teste no navegador verificou as quatro
rotas, voltar no histórico, um script, sete visualizações sem duplicação,
formulários sem eventos extras, bloqueio de caminhos desconhecidos e URLs,
origens e cabeçalho Referer sem dados sensíveis. Nenhum erro JavaScript.

As consultas de confirmação usam a API oficial que alimenta o painel:
https://vercel.com/docs/analytics/web-analytics-api
