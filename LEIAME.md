# Site da Ars Medica (arsmedica.med.br)

Site estático + contador anônimo, hospedado no Cloudflare Workers a partir deste repositório no GitHub (mesmo modelo do Instituto Aetherea).

## Estrutura
- `public/`: o site (página inicial, política de privacidade, 404, imagens, sitemap, robots).
- `worker/index.js`: entrega o site, redireciona www e arsmedicaibiuna.com.br para arsmedica.med.br e mantém o contador.
- `wrangler.jsonc`: configuração do Cloudflare (nome do projeto e banco D1 `ars-contador`).
- `medicao/gtm-ars-medica.json`: contêiner para importar no Google Tag Manager (GA4, Google Ads e Clarity).

## Contador anônimo (sem cookies)
Conta visitas, origem geral da visita e cliques no WhatsApp, inclusive de quem recusa os cookies. Não guarda IP nem dados do aparelho.

- Painel: `https://arsmedica.med.br/api/resumo?chave=SENHA` (segredo `PAINEL_CHAVE`, em Cloudflare › Workers › ars-medica › Settings › Variables and Secrets).
- `&mes=2026-12` no fim do endereço mostra um mês.

## Link do Perfil do Google
Use `https://arsmedica.med.br/?utm_source=google&utm_medium=perfil&utm_campaign=gbp` no campo "Site" do Perfil. Assim o contador separa quem veio do Maps.
