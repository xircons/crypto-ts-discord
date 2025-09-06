const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('announce-qualification')
    .setDescription('Post all qualification announcements'),
  new SlashCommandBuilder()
    .setName('announce-match')
    .setDescription('Post one qualification match announcement')
    .addIntegerOption(o => o.setName('number').setDescription('Match number 1-3').setRequired(true)),
  new SlashCommandBuilder()
    .setName('test-format')
    .setDescription('Post a sample announcement block'),
  new SlashCommandBuilder()
    .setName('ticket-move')
    .setDescription('Move this ticket to a category')
    .addStringOption(o => o.setName('category_id').setDescription('Target category ID').setRequired(false)),
  new SlashCommandBuilder()
    .setName('register-team')
    .setDescription('Register a team and create a role')
    .addStringOption(o => o.setName('name').setDescription('Team name').setRequired(true))
    .addStringOption(o => o.setName('players').setDescription('Comma-separated Discord IDs').setRequired(true))
    .addStringOption(o => o.setName('logo').setDescription('Logo URL').setRequired(false)),
  new SlashCommandBuilder()
    .setName('match-schedule')
    .setDescription('Schedule a match between two teams')
    .addStringOption(o => o.setName('team_a').setDescription('Team A name').setRequired(true))
    .addStringOption(o => o.setName('team_b').setDescription('Team B name').setRequired(true))
    .addStringOption(o => o.setName('round').setDescription('Round label').setRequired(true))
    .addStringOption(o => o.setName('time_iso').setDescription('ISO datetime, e.g., 2025-01-31T20:00:00Z').setRequired(true))
  ,
  new SlashCommandBuilder()
    .setName('match-result')
    .setDescription('Submit a match result with proof URL')
    .addIntegerOption(o => o.setName('match_id').setDescription('Match ID').setRequired(true))
    .addStringOption(o => o.setName('winner').setDescription('A or B').setRequired(true).addChoices({ name: 'Team A', value: 'A' }, { name: 'Team B', value: 'B' }))
    .addAttachmentOption(o => o.setName('proof').setDescription('Screenshot image').setRequired(false))
    .addStringOption(o => o.setName('proof_url').setDescription('Screenshot URL').setRequired(false))
  ,
  new SlashCommandBuilder()
    .setName('match-confirm')
    .setDescription('Confirm a submitted match result (admin)')
    .addIntegerOption(o => o.setName('match_id').setDescription('Match ID').setRequired(true))
  ,
  new SlashCommandBuilder()
    .setName('support-panel')
    .setDescription('Post a support ticket button in this channel')
    .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(false))
    .addStringOption(o => o.setName('description').setDescription('Panel description').setRequired(false))
    .addStringOption(o => o.setName('button').setDescription('Button label').setRequired(false))
];

module.exports = { commands };


