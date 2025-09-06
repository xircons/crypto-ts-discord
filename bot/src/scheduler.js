const SCHEDULE_MS = 60_000; // check every minute

function formatTwoDigits(n) { return String(n).padStart(2, '0'); }

function toBangkok(dateLike) {
  const d = new Date(dateLike);
  // Derive parts in Asia/Bangkok timezone
  const parts = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const day = parts.day || formatTwoDigits(d.getUTCDate());
  const month = parts.month || formatTwoDigits(d.getUTCMonth() + 1);
  const year = parts.year || String(d.getUTCFullYear());
  const hour = (parts.hour || '00').padStart(2, '0');
  const minute = (parts.minute || '00').padStart(2, '0');
  return { day, month, year, hour, minute };
}

function formatMatchBlock(roundLabel, isoTime, teamA, teamB) {
  const { day, month, year, hour, minute } = toBangkok(isoTime);
  const dateStr = `${day}/${month}/${year}`;
  const timeStr = `${hour}:${minute}`;
  return [
    `------------------ (${roundLabel}) teams ${dateStr} ------------------`,
    `${teamA} vs ${teamB}`,
    `เวลา ${timeStr} น.`,
    `---------------------------------------------------------------------`
  ].join('\n');
}

async function sendToAnnounceChannel(client, content) {
  const channelId = process.env.MATCH_ANNOUNCE_CHANNEL_ID;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) return;
  await channel.send(content);
}

function startScheduler(client, fetchImpl = fetch, apiBase = process.env.API_BASE_URL) {
  if (!apiBase) return;
  async function tick() {
    try {
      const res = await fetchImpl(`${apiBase}/matches/upcoming`);
      if (!res.ok) return;
      const matches = await res.json();
      const now = Date.now();
      for (const m of matches) {
        const matchTime = Date.parse(m.time);
        const delta = matchTime - now;
        // Only 30 minutes pre-match: send if within +/- 30s of target
        const near = (targetMs) => Math.abs(delta - targetMs) <= 30_000;
        try {
          if (near(30 * 60_000)) {
            await announce(client, m);
          }
        } catch (_) {}
      }
      // Create result channels for concluded matches without channel
      try {
        const r2 = await fetchImpl(`${apiBase}/matches/awaiting-proof`);
        if (r2.ok) {
          const needChannels = await r2.json();
          for (const m of needChannels) {
            await createResultChannel(client, m, fetchImpl, apiBase);
          }
        }
      } catch (_) {}
    } catch (_) {}
  }
  const interval = setInterval(tick, SCHEDULE_MS);
  return () => clearInterval(interval);
}

async function announce(client, match) {
  const block = formatMatchBlock(match.round, match.time, match.team_a, match.team_b);
  await sendToAnnounceChannel(client, block);
}

async function createResultChannel(client, match, fetchImpl, apiBase) {
  const guildId = process.env.GUILD_ID;
  const categoryId = process.env.RESULT_CATEGORY_ID || null;
  if (!guildId) return;
  const guild = await client.guilds.fetch(guildId);
  const overwrites = [];
  // Only captains and staff role can view
  if (guild.roles.everyone) {
    overwrites.push({ id: guild.roles.everyone.id, deny: ['ViewChannel'] });
  }
  const staffRoleId = process.env.STAFF_ROLE_ID;
  if (staffRoleId) overwrites.push({ id: staffRoleId, allow: ['ViewChannel','SendMessages','ReadMessageHistory'] });
  const channel = await guild.channels.create({
    name: `result-${match.id}-${match.team_a}-vs-${match.team_b}`.slice(0, 90),
    type: 0,
    parent: categoryId || undefined,
    permissionOverwrites: overwrites
  });
  // Bind channel to match
  await fetchImpl(`${apiBase}/matches/result-channel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: match.id, channel_id: channel.id })
  });
  // Mention captains
  const captainMentions = [match.captain_a, match.captain_b].filter(Boolean).map(id => `<@${id}>`).join(' ');
  await channel.send(`Result submission channel for match #${match.id}. Captains ${captainMentions} please upload your result screenshots. Bot will record the first image from each team.`);
}

module.exports.createResultChannel = createResultChannel;

async function postResultAndNextRound(client, matchId, fetchImpl = fetch, apiBase = process.env.API_BASE_URL) {
  if (!apiBase) return;
  // Fetch full bracket to locate the match and any next-round references
  const r = await fetchImpl(`${apiBase}/bracket`);
  if (!r.ok) return;
  const rounds = await r.json();
  let found = null;
  let currentRoundKey = null;
  for (const [roundKey, arr] of Object.entries(rounds)) {
    const m = arr.find(mm => Number(mm.id) === Number(matchId));
    if (m) { found = m; currentRoundKey = roundKey; break; }
  }
  if (!found) return;
  const result = (found.result || '').toUpperCase();
  const winnerName = result === 'A' ? found.team_a : result === 'B' ? found.team_b : null;
  const loserName = result === 'A' ? found.team_b : result === 'B' ? found.team_a : null;
  if (winnerName) {
    await sendToAnnounceChannel(client, `🏆 ${winnerName} defeats ${loserName || ''} in ${currentRoundKey}!`.trim());
  }

  // Try to find a next-round match that references this match winner by placeholder
  const placeholder = `Winner of Match #${matchId}`;
  // Determine next round label by looking for any round not equal to current with a match referencing placeholder
  let next = null;
  for (const [roundKey, arr] of Object.entries(rounds)) {
    if (roundKey === currentRoundKey) continue;
    const n = arr.find(mm => mm.team_a === placeholder || mm.team_b === placeholder || mm.team_a === winnerName || mm.team_b === winnerName);
    if (n) { next = { roundKey, match: n }; break; }
  }
  if (next) {
    const nextTeamA = next.match.team_a === placeholder ? winnerName : next.match.team_a;
    const nextTeamB = next.match.team_b === placeholder ? winnerName : next.match.team_b;
    const block = formatMatchBlock(next.roundKey, next.match.time, nextTeamA, nextTeamB);
    await sendToAnnounceChannel(client, block);
  }
}

module.exports = { startScheduler, postResultAndNextRound, createResultChannel };


