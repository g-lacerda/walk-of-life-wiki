-- Tabela do canal de sugestões da WOL Wiki (D1). Veja docs/sugestoes.md.
-- ip_hash: HMAC-SHA256 do IP com o segredo SUGESTOES_IP_SECRET. O IP puro nunca é gravado.
-- contato: dado pessoal e opcional. Apague depois de responder.
CREATE TABLE IF NOT EXISTS sugestoes (
  id       TEXT PRIMARY KEY,
  tipo     TEXT NOT NULL CHECK (tipo IN ('correcao', 'pagina_nova', 'outro')),
  mensagem TEXT NOT NULL,
  contato  TEXT,
  url      TEXT,
  idioma   TEXT NOT NULL,
  data     TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'nova' CHECK (status IN ('nova', 'lida', 'resolvida', 'descartada')),
  ip_hash  TEXT
);

CREATE INDEX IF NOT EXISTS sugestoes_status_data ON sugestoes (status, data);
