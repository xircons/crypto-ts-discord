const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function getBaseUrl() {
  return 'https://api.challonge.com/v1';
}

function getTournamentId() {
  const id = process.env.CHALLONGE_TOURNAMENT_ID;
  if (!id) throw new Error('CHALLONGE_TOURNAMENT_ID not set');
  return id;
}

function getApiKey() {
  const key = process.env.CHALLONGE_API_KEY;
  if (!key) throw new Error('CHALLONGE_API_KEY not set');
  return key;
}

function toUrl(path, params) {
  const url = new URL(getBaseUrl() + path);
  url.searchParams.set('api_key', getApiKey());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function createParticipant(teamName) {
  const tournament = getTournamentId();
  const url = toUrl(`/tournaments/${encodeURIComponent(tournament)}/participants.json`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participant: { name: teamName } })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Challonge createParticipant failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  // API returns { participant: {...} }
  return data.participant || data;
}

async function listMatches() {
  const tournament = getTournamentId();
  const url = toUrl(`/tournaments/${encodeURIComponent(tournament)}/matches.json`);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Challonge listMatches failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Format: [ { match: {...} }, ... ]
  return data.map(x => x.match || x);
}

async function getMatch(matchId) {
  const tournament = getTournamentId();
  const url = toUrl(`/tournaments/${encodeURIComponent(tournament)}/matches/${encodeURIComponent(matchId)}.json`);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Challonge getMatch failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.match || data;
}

async function submitMatchResultByWinnerSide(matchId, winnerSide) {
  // winnerSide: 'A' | 'B' → player1_id vs player2_id
  const m = await getMatch(matchId);
  const winnerParticipantId = winnerSide === 'A' ? m.player1_id : m.player2_id;
  if (!winnerParticipantId) throw new Error('Unable to resolve winner participant ID');
  const tournament = getTournamentId();
  const url = toUrl(`/tournaments/${encodeURIComponent(tournament)}/matches/${encodeURIComponent(matchId)}.json`);
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match: { winner_id: winnerParticipantId, scores_csv: '1-0' } })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Challonge submitMatchResult failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.match || data;
}

module.exports = {
  createParticipant,
  listMatches,
  getMatch,
  submitMatchResultByWinnerSide
};


