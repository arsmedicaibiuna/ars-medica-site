// Ars Medica · site + contador anônimo (sem cookies, sem IP, sem dados do aparelho)
// Painel: https://arsmedica.med.br/api/resumo?chave=SENHA   (segredo PAINEL_CHAVE)
//         acrescente &mes=2026-12 para ver um mês

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|whatsapp|telegram|curl|wget|python|monitor|uptime/i;
let pronto = false;

async function preparar(db) {
  if (pronto) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS visitas(dia TEXT NOT NULL, origem TEXT NOT NULL, pagina TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(dia, origem, pagina))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cliques(dia TEXT NOT NULL, origem TEXT NOT NULL, pagina TEXT NOT NULL, botao TEXT NOT NULL, proc TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(dia, origem, pagina, botao, proc))`),
  ]);
  pronto = true;
}

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // horário de Brasília
const corta = (s, n) => String(s || '').replace(/[^\p{L}\p{N} _\-/.·]/gu, '').slice(0, n);

function origem(d) {
  const s = String(d.s || '').toLowerCase(), m = String(d.m || '').toLowerCase();
  let host = '';
  try { host = d.r ? new URL(d.r).hostname.toLowerCase() : ''; } catch {}
  if (host.endsWith('arsmedica.med.br') || host.endsWith('arsmedicaibiuna.com.br')) host = 'interno';
  if (m === 'perfil' || s === 'gbp' || /gbp|maps/.test(d.c || '')) return 'Perfil do Google (Maps)';
  if (d.g || /cpc|ppc|paid|ads/.test(m)) return s && s !== 'google' ? 'Anúncio (' + corta(s, 20) + ')' : 'Anúncio Google';
  if (s) return 'Link marcado (' + corta(s, 20) + ')';
  if (!host) return 'Direto (digitou ou link sem origem)';
  if (host === 'interno') return 'Navegação interna';
  if (/(^|\.)google\./.test(host)) return 'Google (busca grátis)';
  if (/bing\.|duckduckgo|yahoo|ecosia|brave/.test(host)) return 'Outros buscadores';
  if (/instagram|facebook|fb\.|threads/.test(host)) return 'Instagram / Facebook';
  if (/chatgpt|openai|perplexity|gemini|claude|copilot|bard/.test(host)) return 'Assistentes de IA';
  if (/institutoaetherea/.test(host)) return 'Site do Instituto Aetherea';
  return 'Outros sites (' + corta(host, 30) + ')';
}

async function registrar(req, env, tipo) {
  if (BOT.test(req.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
  let d = {};
  try { d = JSON.parse((await req.text()).slice(0, 2000)); } catch {}
  const pagina = corta(d.p || '/', 60) || '/';
  await preparar(env.DB);
  if (tipo === 'visita') {
    await env.DB.prepare(`INSERT INTO visitas VALUES(?,?,?,1) ON CONFLICT(dia,origem,pagina) DO UPDATE SET n=n+1`)
      .bind(hoje(), origem(d), pagina).run();
  } else {
    await env.DB.prepare(`INSERT INTO cliques VALUES(?,?,?,?,?,1) ON CONFLICT(dia,origem,pagina,botao,proc) DO UPDATE SET n=n+1`)
      .bind(hoje(), origem(d), pagina, corta(d.b, 30) || 'outro', corta(d.x, 60)).run();
  }
  return new Response(null, { status: 204 });
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BOTOES = { header: 'Botão do topo', barra_mobile: 'Barra do celular', botao_flutuante: 'Botão flutuante', rodape: 'Rodapé', ficha_procedimento: 'Ficha de procedimento', contato: 'Seção de contato', hero: 'Abertura do site', outro: 'Outro' };

function tabela(titulo, linhas, col) {
  if (!linhas.length) return `<h2>${titulo}</h2><p class="m">Nada registrado ainda.</p>`;
  return `<h2>${titulo}</h2><table><tr><th>${col}</th><th>Visitas</th><th>Cliques</th><th>%</th></tr>` +
    linhas.map(l => `<tr><td>${esc(l.k)}</td><td>${l.v ?? ''}</td><td>${l.c ?? ''}</td><td>${l.v ? Math.round(100 * (l.c || 0) / l.v) + '%' : ''}</td></tr>`).join('') + '</table>';
}

async function resumo(url, env) {
  const chave = (url.searchParams.get('chave') || '').trim();
  const certa = String(env.PAINEL_CHAVE || '').trim();
  if (!certa) return new Response('Página não encontrada.', { status: 404 });   // segredo ausente (com ponto final)
  if (chave !== certa) return new Response('Página não encontrada', { status: 404 }); // senha diferente (sem ponto)
  await preparar(env.DB);
  const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : '';
  const ini = mes ? mes + '-01' : new Date(Date.now() - 3 * 3600e3 - 29 * 864e5).toISOString().slice(0, 10);
  const fim = mes ? mes + '-31' : '9999';
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results);
  const [vo, co, vp, cb, cp, meses, cm] = await Promise.all([
    q(`SELECT origem k, SUM(n) v FROM visitas WHERE dia BETWEEN ? AND ? AND origem<>'Navegação interna' GROUP BY 1 ORDER BY 2 DESC`, ini, fim),
    q(`SELECT origem k, SUM(n) c FROM cliques WHERE dia BETWEEN ? AND ? GROUP BY 1`, ini, fim),
    q(`SELECT pagina k, SUM(n) v FROM visitas WHERE dia BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, ini, fim),
    q(`SELECT botao k, SUM(n) c FROM cliques WHERE dia BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, ini, fim),
    q(`SELECT proc k, SUM(n) c FROM cliques WHERE dia BETWEEN ? AND ? AND proc<>'' GROUP BY 1 ORDER BY 2 DESC`, ini, fim),
    q(`SELECT substr(dia,1,7) k, SUM(n) v FROM visitas WHERE origem<>'Navegação interna' GROUP BY 1 ORDER BY 1 DESC`),
    q(`SELECT substr(dia,1,7) k, SUM(n) c FROM cliques GROUP BY 1`),
  ]);
  const cOrig = Object.fromEntries(co.map(r => [r.k, r.c]));
  const origens = vo.map(r => ({ ...r, c: cOrig[r.k] || 0 }));
  for (const r of co) if (!vo.find(x => x.k === r.k)) origens.push({ k: r.k, v: 0, c: r.c });
  const V = origens.reduce((a, r) => a + (r.v || 0), 0), C = co.reduce((a, r) => a + r.c, 0);
  const cMes = Object.fromEntries(cm.map(r => [r.k, r.c]));
  const chaveUrl = encodeURIComponent(chave);
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Contador · Ars Medica</title>
<style>body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f2f3f4;color:#10171d}.w{max-width:760px;margin:0 auto;padding:24px 16px 60px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}.m{color:#5b636b;font-size:13px}
.k{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.k div{background:#fff;border-radius:10px;padding:14px}.k b{display:block;font-size:26px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}td,th{padding:8px 10px;text-align:left;border-bottom:1px solid #e6e7e9;font-size:14px}th{font-size:12px;color:#5b636b;font-weight:600}td+td,th+th{text-align:right}a{color:#10171d}</style></head><body><div class="w">
<h1>Contador do site · Ars Medica</h1><p class="m">${mes ? 'Mês ' + mes + ' · <a href="?chave=' + chaveUrl + '">ver últimos 30 dias</a>' : 'Últimos 30 dias'} · conta todas as visitas, com ou sem aceite de cookies, sem identificar ninguém. Robôs ficam de fora.</p>
<div class="k"><div><span class="m">Visitas</span><b>${V}</b></div><div><span class="m">Cliques no WhatsApp</span><b>${C}</b></div><div><span class="m">Taxa de contato</span><b>${V ? (100 * C / V).toFixed(1) + '%' : '–'}</b></div></div>
${tabela('De onde vieram', origens, 'Origem')}
${tabela('Botões de WhatsApp usados', cb.map(r => ({ k: BOTOES[r.k] || r.k, c: r.c })), 'Botão')}
${tabela('Procedimentos de onde veio o clique', cp, 'Procedimento')}
${tabela('Páginas vistas', vp, 'Página')}
<h2>Mês a mês</h2>${meses.length ? '<table><tr><th>Mês</th><th>Visitas</th><th>Cliques</th><th>%</th></tr>' + meses.map(r => `<tr><td><a href="?chave=${chaveUrl}&mes=${r.k}">${r.k}</a></td><td>${r.v}</td><td>${cMes[r.k] || 0}</td><td>${r.v ? Math.round(100 * (cMes[r.k] || 0) / r.v) + '%' : ''}</td></tr>`).join('') + '</table>' : '<p class="m">Nada registrado ainda.</p>'}
<p class="m" style="margin-top:28px">Os seus próprios acessos também entram na conta. Evite abrir o site várias vezes por dia e não clique no WhatsApp do site para testar.</p></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // endereço alternativo e www → endereço principal
    if (url.hostname !== 'arsmedica.med.br' && !url.hostname.endsWith('.workers.dev') && url.hostname !== 'localhost') {
      return Response.redirect('https://arsmedica.med.br' + url.pathname + url.search, 301);
    }
    try {
      if (url.pathname === '/api/visita' && req.method === 'POST') return await registrar(req, env, 'visita');
      if (url.pathname === '/api/clique' && req.method === 'POST') return await registrar(req, env, 'clique');
      if (url.pathname === '/api/resumo') return await resumo(url, env);
    } catch (e) {
      if (url.pathname === '/api/resumo') return new Response('Erro no contador: ' + e.message, { status: 500 });
      return new Response(null, { status: 204 }); // o contador nunca atrapalha o site
    }
    return env.ASSETS.fetch(req);
  },
};
