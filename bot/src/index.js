require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, InteractionType, Partials, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType } = require('discord.js');
const { commands } = require('./commands');
const { startScheduler, postResultAndNextRound } = require('./scheduler');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

const commandData = commands.map(c => c.toJSON());

async function registerCommands() {
  if (!process.env.BOT_TOKEN || !process.env.DISCORD_CLIENT_ID) return;
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
  try {
    if (guildId) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
        console.log(`Bot commands registered for guild ${guildId}`);
        return;
      } catch (e) {
        const code = e?.rawError?.code || e?.code || e?.status;
        if (code === 50001 || code === 403) {
          console.warn('Guild command registration missing access; falling back to global registration. Is the bot invited to this guild and is the GUILD_ID correct?');
        } else {
          throw e;
        }
      }
    }
    await rest.put(Routes.applicationCommands(clientId), { body: commandData });
    console.log('Bot commands registered globally');
  } catch (err) {
    console.error('Failed to register commands', err);
  }
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startScheduler(client);
  // Auto-post support panel to a specific channel if configured
  const panelChannelId = process.env.TICKET_PANEL_CHANNEL_ID;
  if (panelChannelId) {
    (async () => {
      try {
        const channel = await client.channels.fetch(panelChannelId);
        if (channel && channel.isTextBased()) {
          // Check basic permissions before attempting to send
          const me = channel.guild?.members?.me;
          const perms = channel.permissionsFor?.(me ?? client.user);
          const canSend = perms?.has(PermissionsBitField.Flags.ViewChannel) && perms?.has(PermissionsBitField.Flags.SendMessages);
          if (!canSend) {
            console.warn(`Skipping support panel: missing permissions in channel ${panelChannelId}`);
            return;
          }
          const title = process.env.TICKET_PANEL_TITLE || 'Open a Support Ticket';
          const description = process.env.TICKET_PANEL_DESCRIPTION || 'Click the button below to open a private ticket with staff.';
          // Check if a panel from this bot already exists in recent history
          const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
          let exists = false;
          if (recent) {
            for (const msg of recent.values()) {
              if (msg.author?.id !== client.user.id) continue;
              const hasButton = (msg.components || []).some(row => row.components?.some(c => c.customId === 'open_ticket'));
              const hasTitle = (msg.embeds || []).some(e => (e.title || '') === title);
              if (hasButton && hasTitle) { exists = true; break; }
            }
          }
          if (!exists) {
            const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x00aeef);
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('open_ticket').setLabel(process.env.TICKET_PANEL_BUTTON || 'Open Ticket').setStyle(ButtonStyle.Primary)
            );
            await channel.send({ embeds: [embed], components: [row] });
            console.log(`Support panel posted to channel ${panelChannelId}`);
          } else {
            console.log(`Support panel already exists in channel ${panelChannelId}, skipping duplicate.`);
          }
        }
      } catch (err) {
        console.warn('Failed to post support panel', err);
      }
    })();
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
    return;
  }
  if (interaction.commandName === 'test-format') {
    const msg = buildQualificationAnnouncement('26/09/2024', 'TEAM1', 'TEAM2');
    const channelId = process.env.MATCH_ANNOUNCE_CHANNEL_ID || '1413801493517041696';
    await sendToChannelById(interaction.client, channelId, msg);
    await interaction.reply({ content: 'Sent.', ephemeral: true });
    return;
  }
  if (interaction.commandName === 'announce-qualification') {
    const channelId = process.env.MATCH_ANNOUNCE_CHANNEL_ID || '1413801493517041696';
    for (let i = 0; i < QUAL_MATCHES.length; i++) {
      const m = QUAL_MATCHES[i];
      const msg = buildQualificationAnnouncement(m.date, m.team1, m.team2);
      await sendToChannelById(interaction.client, channelId, msg);
      if (i < QUAL_MATCHES.length - 1) await delay(2000);
    }
    await interaction.reply({ content: 'Posted all qualification announcements.', ephemeral: true });
    return;
  }
  if (interaction.commandName === 'announce-match') {
    const idx = interaction.options.getInteger('number', true);
    if (!idx || idx < 1 || idx > QUAL_MATCHES.length) {
      await interaction.reply({ content: 'Number must be 1..3', ephemeral: true });
      return;
    }
    const m = QUAL_MATCHES[idx - 1];
    const msg = buildQualificationAnnouncement(m.date, m.team1, m.team2);
    const channelId = process.env.MATCH_ANNOUNCE_CHANNEL_ID || '1413801493517041696';
    await sendToChannelById(interaction.client, channelId, msg);
    await interaction.reply({ content: `Posted match ${idx}.`, ephemeral: true });
    return;
  }
  if (interaction.commandName === 'ticket-move') {
    try {
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply('Run this in a text channel.');
        return;
      }
      const target = interaction.options.getString('category_id') || process.env.TICKET_CATEGORY_ID;
      if (!target) {
        await interaction.editReply('No category specified and TICKET_CATEGORY_ID is not set.');
        return;
      }
      try {
        await channel.setParent(target, { lockPermissions: false });
        await interaction.editReply(`Moved to category ${target}.`);
      } catch (err) {
        console.error('ticket-move error', err);
        await interaction.editReply('Failed to move channel. Check permissions and category ID.');
      }
    } catch (err) {
      console.error('ticket-move defer error', err);
    }
    return;
  }
  if (interaction.commandName === 'register-team') {
    const name = interaction.options.getString('name', true);
    const logo = interaction.options.getString('logo') || null;
    const playersRaw = interaction.options.getString('players', true);
    const players = playersRaw.split(',').map(s => s.trim()).filter(Boolean);
    try {
      await interaction.deferReply({ ephemeral: true });
      // Create role
      const role = await interaction.guild.roles.create({
        name: name,
        reason: 'Team registration',
        mentionable: true
      });
      // Assign to captain (interaction.user) and listed players if in guild
      const membersToAssign = new Set([interaction.user.id, ...players]);
      for (const userId of membersToAssign) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          await member.roles.add(role);
        } catch (_) {
          // ignore if not found
        }
      }
      // Persist via backend
      if (process.env.API_BASE_URL) {
        const res = await fetch(`${process.env.API_BASE_URL}/register/team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            logo,
            captain_discord_id: interaction.user.id,
            players: Array.from(membersToAssign)
          })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend error: ${res.status} ${text}`);
        }
      }
      await interaction.editReply(`Team '${name}' registered. Role ${role.toString()} created and assigned.`);
    } catch (err) {
      console.error('register-team error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Failed to register team.');
      } else {
        await interaction.reply({ content: 'Failed to register team.', ephemeral: true });
      }
    }
  }
  if (interaction.commandName === 'match-schedule') {
    const team_a = interaction.options.getString('team_a', true);
    const team_b = interaction.options.getString('team_b', true);
    const round = interaction.options.getString('round', true);
    const time_iso = interaction.options.getString('time_iso', true);
    try {
      await interaction.deferReply({ ephemeral: true });
      if (!process.env.API_BASE_URL) throw new Error('API_BASE_URL not set');
      const res = await fetch(`${process.env.API_BASE_URL}/matches/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_a, team_b, round, time: time_iso })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Backend error ${res.status}: ${text}`);
      }
      const data = await res.json();
      const ts = Math.floor(Date.parse(time_iso) / 1000);
      await interaction.editReply(`Match scheduled (#${data.id}): ${team_a} vs ${team_b} (${round}) @ <t:${ts}:F> (<t:${ts}:R>)`);
    } catch (err) {
      console.error('match-schedule error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Failed to schedule match.');
      } else {
        await interaction.reply({ content: 'Failed to schedule match.', ephemeral: true });
      }
    }
  }
  if (interaction.commandName === 'match-result') {
    const match_id = interaction.options.getInteger('match_id', true);
    const winner = interaction.options.getString('winner', true);
    const proofAttachment = interaction.options.getAttachment('proof');
    const proof_url = proofAttachment?.url || interaction.options.getString('proof_url') || '';
    try {
      await interaction.deferReply({ ephemeral: true });
      if (!process.env.API_BASE_URL) throw new Error('API_BASE_URL not set');
      const res = await fetch(`${process.env.API_BASE_URL}/matches/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id, winner, proof_url })
      });
      if (!res.ok) throw new Error(`Backend error ${res.status}`);
      await interaction.editReply(`Submitted result for match #${match_id}: winner ${winner}`);
    } catch (err) {
      console.error('match-result error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Failed to submit result.');
      } else {
        await interaction.reply({ content: 'Failed to submit result.', ephemeral: true });
      }
    }
  }
  if (interaction.commandName === 'match-confirm') {
    const match_id = interaction.options.getInteger('match_id', true);
    try {
      await interaction.deferReply({ ephemeral: true });
      if (!process.env.API_BASE_URL) throw new Error('API_BASE_URL not set');
      const res = await fetch(`${process.env.API_BASE_URL}/matches/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id, confirm: true })
      });
      if (!res.ok) throw new Error(`Backend error ${res.status}`);
      const data = await res.json();
      await interaction.editReply(`Confirmed result for match #${match_id}: winner ${data.result}`);
      // Post winner + next round announcement in the configured announce channel
      try { await postResultAndNextRound(interaction.client, match_id); } catch (_) {}
    } catch (err) {
      console.error('match-confirm error', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Failed to confirm result.');
      } else {
        await interaction.reply({ content: 'Failed to confirm result.', ephemeral: true });
      }
    }
  }
  if (interaction.commandName === 'match-result') {
    // handled above; additionally no changes here
  }
  if (interaction.commandName === 'support-panel') {
    const title = interaction.options.getString('title') || process.env.TICKET_PANEL_TITLE || 'Open a Support Ticket';
    const description = interaction.options.getString('description') || process.env.TICKET_PANEL_DESCRIPTION || 'Click the button below to open a private ticket with staff.';
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x00aeef);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel(interaction.options.getString('button') || process.env.TICKET_PANEL_BUTTON || 'Open Ticket').setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  }
});

// Qualification announcements (prefix commands)
function buildQualificationAnnouncement(dateStr, team1, team2) {
  return (
    `------------------ (รอบคัดเลือก) teams ${dateStr} ------------------\n` +
    `${team1} vs ${team2}\n` +
    `เวลา 20:00 น.\n` +
    `---------------------------------------------------------------------`
  );
}

async function sendToChannelById(client, channelId, content) {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(content);
      console.log(`[announce] sent to ${channelId}`);
    }
  } catch (_) {}
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const QUAL_MATCHES = [
  { date: '26/09/2024', team1: 'วิทยาลัยนานาชาตินวัตกรรมดิจิทัล', team2: 'คณะวิศวกรรมศาสตร์ team2' },
  { date: '27/09/2024', team1: 'คณะแพทยศาสตร์ team2', team2: 'คณะวิศวกรรมศาสตร์ team1' },
  { date: '28/09/2024', team1: 'วิทยาลัยศิลปะ สื่อ และเทคโนโลยี team1', team2: 'คณะวิทยาศาสตร์' }
];

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    const content = (message.content || '').trim();
    if (!content.startsWith('!')) return;
    const channelId = process.env.MATCH_ANNOUNCE_CHANNEL_ID || '1413801493517041696';

    if (content === '!test-format') {
      const msg = buildQualificationAnnouncement('26/09/2024', 'TEAM1', 'TEAM2');
      await sendToChannelById(message.client, channelId, msg);
      return;
    }

    if (content === '!check-announce') {
      await sendToChannelById(message.client, channelId, 'Announcement channel reachable.');
      return;
    }

    if (content === '!announce-qualification') {
      for (let i = 0; i < QUAL_MATCHES.length; i++) {
        const m = QUAL_MATCHES[i];
        const msg = buildQualificationAnnouncement(m.date, m.team1, m.team2);
        await sendToChannelById(message.client, channelId, msg);
        if (i < QUAL_MATCHES.length - 1) await delay(2000);
      }
      return;
    }

    if (content.startsWith('!announce-match')) {
      const parts = content.split(/\s+/);
      const idx = Number(parts[1]);
      if (!idx || idx < 1 || idx > QUAL_MATCHES.length) {
        await message.reply('Usage: !announce-match [1..3]');
        return;
      }
      const m = QUAL_MATCHES[idx - 1];
      const msg = buildQualificationAnnouncement(m.date, m.team1, m.team2);
      await sendToChannelById(message.client, channelId, msg);
      return;
    }
  } catch (err) {
    console.error('announce command error', err);
  }
});
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId === 'open_ticket') {
    try {
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
      const guild = interaction.guild;
      const overwrites = [];
      const F = PermissionsBitField.Flags;
      if (guild.roles.everyone) overwrites.push({ id: guild.roles.everyone.id, deny: [F.ViewChannel] });
      overwrites.push({ id: interaction.user.id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory] });
      const staffRoleId = process.env.STAFF_ROLE_ID;
      if (staffRoleId) overwrites.push({ id: staffRoleId, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory] });
      // Ensure the bot itself can manage/read the channel
      const botId = interaction.client.user.id;
      overwrites.push({ id: botId, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.ManageChannels] });
      // Try to create directly under the configured category; if it fails, create at root and move
      const parentId = process.env.TICKET_CATEGORY_ID || undefined;
      let channel;
      try {
        channel = await guild.channels.create({
          name: `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
          type: ChannelType.GuildText,
          parent: parentId,
          permissionOverwrites: overwrites
        });
      } catch (err) {
        console.warn('ticket create under category failed, fallback to root', { parentId, errCode: err?.code, status: err?.status });
        // Fallback to root without parent if permission/visibility issues
        try {
          channel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
            type: ChannelType.GuildText,
            permissionOverwrites: overwrites
          });
          // Best-effort move to category after create
          if (parentId) {
            try { await channel.setParent(parentId, { lockPermissions: false }); } catch (_) {}
          }
        } catch (err2) {
          console.error('open_ticket create error', err2);
          throw err2;
        }
      }
      await channel.setTopic(`ticket-owner:${interaction.user.id}`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('📩 Close Ticket').setStyle(ButtonStyle.Danger)
      );
      await channel.send({ content: `<@${interaction.user.id}> สร้าง Ticket เรียบร้อย | Staff จะตอบคุณในเร็วๆนี้`, components: [row] });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `สร้าง Ticket เรียบร้อย: ${channel}` });
      } else {
        await interaction.reply({ content: `สร้าง Ticket เรียบร้อย: ${channel}`, ephemeral: true });
      }
    } catch (err) {
      console.error('open_ticket error', err);
      if (interaction.deferred || interaction.replied) {
        try { await interaction.editReply({ content: 'Failed to create ticket.' }); } catch (_) {}
      } else {
        try { await interaction.reply({ content: 'Failed to create ticket.', ephemeral: true }); } catch (_) {}
      }
    }
  }
  if (interaction.customId === 'close_ticket') {
    try {
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
      const channel = interaction.channel;
      const guild = interaction.guild;
      const staffRoleId = process.env.STAFF_ROLE_ID;
      const archiveCategoryId = process.env.TICKET_ARCHIVE_CATEGORY_ID || process.env.TICKET_CATEGORY_ID;
      const openerId = (channel.topic && channel.topic.startsWith('ticket-owner:')) ? channel.topic.replace('ticket-owner:', '') : interaction.user.id;
      // Lock sending and restrict visibility to opener + staff only
      const overwrites = [];
      const F = PermissionsBitField.Flags;
      if (guild.roles.everyone) overwrites.push({ id: guild.roles.everyone.id, deny: [F.ViewChannel] });
      if (staffRoleId) overwrites.push({ id: staffRoleId, allow: [F.ViewChannel, F.ReadMessageHistory], deny: [F.SendMessages] });
      if (openerId) overwrites.push({ id: openerId, allow: [F.ViewChannel, F.ReadMessageHistory], deny: [F.SendMessages] });
      // Keep bot access to manage/close
      const botId = interaction.client.user.id;
      overwrites.push({ id: botId, allow: [F.ViewChannel, F.ReadMessageHistory, F.SendMessages, F.ManageChannels] });
      await channel.edit({
        name: `${channel.name}`.slice(0, 80) + '-archived 🟢',
        permissionOverwrites: overwrites
      });
      if (archiveCategoryId) {
        await channel.setParent(archiveCategoryId, { lockPermissions: false });
      }
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'เก็บ Ticketไว้แล้ว มีแค่ผู้เปิด Ticket และ Staff ที่เท่านั้นที่สามารถดูได้' });
      } else {
        await interaction.reply({ content: 'เก็บ Ticketไว้แล้ว มีแค่ผู้เปิด Ticket และ Staff ที่เท่านั้นที่สามารถดูได้', ephemeral: true });
      }
    } catch (err) {
      console.error('close_ticket error', err);
    }
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.channel || !message.attachments || message.attachments.size === 0) return;
    const attachment = message.attachments.first();
    const url = attachment.url;
    const channelId = message.channel.id;
    if (!process.env.API_BASE_URL) return;
    const res = await fetch(`${process.env.API_BASE_URL}/matches/by-channel/${channelId}`);
    if (!res.ok) return;
    const match = await res.json();
    const isCaptainA = message.author.id === match.captain_a;
    const isCaptainB = message.author.id === match.captain_b;
    if (!isCaptainA && !isCaptainB) return;
    const team = isCaptainA ? 'A' : 'B';
    await fetch(`${process.env.API_BASE_URL}/matches/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: match.id, team, proof_url: url })
    });
    await message.reply('Proof received and recorded.');
  } catch (_) {}
});

if (require.main === module) {
  registerCommands().then(() => client.login(process.env.BOT_TOKEN));
}

module.exports = { client };


