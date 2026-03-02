/**
 * footy_bot/index.js — Footy Bot (Node.js) — multi-league predictions
 * /predict (league → team → match → modal), /leaderboard, /resetleaderboard, !score
 * Discord name: footy_bot
 */

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./database.js");
const { processMatchResults, POINTS_EXACT_SCORE, POINTS_CORRECT_RESULT, POINTS_CORRECT_SCORER } = require("./evaluator.js");
const { handleScoreCommand, LEAGUE_LABELS } = require("../core/score_lookup.js");

// ─── Config (env) ───────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.FOOTY_BOT_TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.FOOTY_BOT_CLIENT_ID || process.env.CLIENT_ID;
const GUILD_ID = process.env.FOOTY_BOT_GUILD_ID || process.env.GUILD_ID;
const BOT_NAME = "footy_bot";
const BOT_COLOR = 0x1a1a2e;
const BOT_FOOTER = "footy_bot • Football Score Predictor";
const BOT_EMOJI = "🏆";
const PREDICTIONS_CHANNEL_ID = process.env.FOOTY_BOT_PREDICTIONS_CHANNEL_ID || process.env.PREDICTIONS_CHANNEL_ID || "";
const RESULTS_CHANNEL_ID = process.env.FOOTY_BOT_RESULTS_CHANNEL_ID || process.env.RESULTS_CHANNEL_ID || PREDICTIONS_CHANNEL_ID;
const MATCH_WEEK_DAYS = 7;

const LEAGUE_OPTIONS = [
  { name: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League", value: "epl" },
  { name: "🇪🇸 La Liga", value: "la_liga" },
  { name: "🇩🇪 Bundesliga", value: "bundesliga" },
  { name: "🇫🇷 Ligue 1", value: "ligue_1" },
  { name: "🇮🇹 Serie A", value: "serie_a" },
  { name: "⭐ Champions League", value: "champions_league" },
  { name: "🟠 Europa League", value: "europa_league" },
  { name: "🟢 Conference League", value: "conference_league" },
  { name: "🏆 Overall", value: "overall" },
];

// ─── Stub: replace with real API ─────────────────────────────────────────────
async function fetchScores(league) {
  // return await yourSportsApi(league);
  return [];
}

// ─── Slash command definitions ───────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("predict").setDescription("Submit or update your score prediction for an upcoming match"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the prediction leaderboard")
    .addStringOption((o) =>
      o
        .setName("league")
        .setDescription("Which league (default: overall)")
        .setRequired(false)
        .addChoices(...LEAGUE_OPTIONS)
    )
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Season or all-time")
        .setRequired(false)
        .addChoices({ name: "This Season", value: "season" }, { name: "All Time", value: "alltime" })
    ),
  new SlashCommandBuilder()
    .setName("resetleaderboard")
    .setDescription("[ADMIN] Reset season points for a league or all leagues")
    .addStringOption((o) =>
      o
        .setName("league")
        .setDescription("Which league (leave blank for ALL)")
        .setRequired(false)
        .addChoices(...LEAGUE_OPTIONS.filter((x) => x.value !== "overall"))
    ),
].map((c) => c.toJSON());

// ─── Client ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ─── Custom IDs ──────────────────────────────────────────────────────────────
const PREFIX = "univ_";
const ID = {
  leagueSelect: `${PREFIX}league`,
  teamSelect: `${PREFIX}team`,
  matchSelect: `${PREFIX}match`,
  modal: (matchId) => `${PREFIX}modal_${matchId}`,
  resetConfirm: (league) => `${PREFIX}reset_${league || "all"}`,
  resetCancel: `${PREFIX}reset_cancel`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function headerEmbed(title, description) {
  return new EmbedBuilder().setColor(BOT_COLOR).setTitle(title).setDescription(description);
}

function predictionEmbed(username, homeName, awayName, kickoffUtc, homeGoals, awayGoals, scorers, league) {
  let koStr = kickoffUtc;
  try {
    koStr = new Date(kickoffUtc.replace("Z", "+00:00")).toUTCString().slice(0, 22);
  } catch {}
  const leagueLabel = LEAGUE_LABELS[league] || league;
  const embed = new EmbedBuilder()
    .setTitle("✅ Prediction Locked In!")
    .setColor(BOT_COLOR)
    .addFields(
      { name: `${BOT_EMOJI} Match`, value: `**${homeName} vs ${awayName}**\n📅 ${koStr}\n${leagueLabel}`, inline: false },
      { name: "👤 Member", value: username, inline: true },
      { name: "📊 Predicted Score", value: `${homeName} **${homeGoals} – ${awayGoals}** ${awayName}`, inline: false }
    );
  if (scorers && scorers.length) embed.addFields({ name: "⚽ Goal Scorers", value: scorers.join(", "), inline: false });
  embed.setFooter({ text: BOT_FOOTER });
  return embed;
}

// ─── /predict flow: league → team → match → modal ─────────────────────────────
function getUpcomingGames(games) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + MATCH_WEEK_DAYS * 24 * 60 * 60 * 1000);
  const upcoming = [];
  for (const g of games) {
    if (g.status !== "scheduled") continue;
    let ko;
    try {
      ko = new Date((g.start_time || "").replace("Z", "+00:00"));
    } catch {
      continue;
    }
    if (!isNaN(ko) && now <= ko && ko <= cutoff) upcoming.push({ ko, game: g });
  }
  upcoming.sort((a, b) => a.ko - b.ko);
  return upcoming;
}

client.on("interactionCreate", async (interaction) => {
  // ── /predict: show league select ───────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "predict") {
    const options = LEAGUE_OPTIONS.filter((o) => o.value !== "overall").map((o) => ({ label: o.name, value: o.value }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(ID.leagueSelect).setPlaceholder("Choose a league...").addOptions(options.slice(0, 25))
    );
    await interaction.reply({
      embeds: [headerEmbed(`${BOT_EMOJI} Score Predictor`, "Which league do you want to predict?")],
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // ── League selected → show team select ──────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === ID.leagueSelect) {
    const league = interaction.values[0];
    const games = await fetchScores(league);
    const upcoming = getUpcomingGames(games);
    if (!upcoming.length) {
      await interaction.update({
        embeds: [
          headerEmbed(
            "No upcoming fixtures",
            `No matches in the next ${MATCH_WEEK_DAYS} days for ${LEAGUE_LABELS[league] || league}.`
          ),
        ],
        components: [],
      });
      return;
    }
    const teamSet = new Set();
    for (const { game } of upcoming) {
      for (const t of Object.values(game.teams || {})) {
        const name = t?.name ?? "?";
        if (name) teamSet.add(name);
      }
    }
    const sortedTeams = [...teamSet].sort();
    const teamOptions = sortedTeams.slice(0, 25).map((name) => ({ label: name.slice(0, 100), value: name }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${ID.teamSelect}:${league}`)
        .setPlaceholder("Choose your team...")
        .addOptions(teamOptions)
    );
    await interaction.update({
      embeds: [headerEmbed(`${LEAGUE_LABELS[league] || league} — Choose a team`, "Select your team to see their upcoming fixtures.")],
      components: [row],
    });
    return;
  }

  // ── Team selected → show match select ──────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(ID.teamSelect)) {
    const league = interaction.customId.split(":")[1];
    const selectedTeam = interaction.values[0];
    const games = await fetchScores(league);
    const upcoming = getUpcomingGames(games);
    const filtered = upcoming.filter(({ game }) => {
      const names = Object.values(game.teams || {}).map((t) => t?.name ?? "");
      return names.includes(selectedTeam);
    });
    if (!filtered.length) {
      await interaction.update({
        embeds: [headerEmbed("No fixtures found", `No upcoming fixtures for **${selectedTeam}** in the next ${MATCH_WEEK_DAYS} days.`)],
        components: [],
      });
      return;
    }
    const matchOptions = filtered.slice(0, 25).map(({ ko, game }) => {
      const teams = Object.values(game.teams || {});
      const homeName = teams[0]?.name ?? "?";
      const awayName = teams[1]?.name ?? "?";
      const existing = db.getUserPrediction(game.id, interaction.user.id);
      const koStr = ko.toUTCString().slice(0, 22);
      return {
        label: `${homeName} vs ${awayName}`.slice(0, 100),
        description: `${koStr}${existing ? " • ✏️ edit" : ""}`.slice(0, 100),
        value: game.id,
      };
    });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${ID.matchSelect}:${league}`)
        .setPlaceholder("Choose a match to predict...")
        .addOptions(matchOptions)
    );
    await interaction.update({
      embeds: [headerEmbed(`${selectedTeam} — Choose a match`, "Select a match. Predictions lock at kick-off.")],
      components: [row],
    });
    return;
  }

  // ── Match selected → show modal ─────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(ID.matchSelect)) {
    const league = interaction.customId.split(":")[1];
    const matchId = interaction.values[0];
    const games = await fetchScores(league);
    const upcoming = getUpcomingGames(games);
    const found = upcoming.find(({ game }) => game.id === matchId);
    if (!found) {
      await interaction.reply({ content: "Session expired or match not found. Run /predict again.", ephemeral: true }).catch(() => {});
      return;
    }
    const { game } = found;
    const teams = Object.values(game.teams || {});
    const homeName = teams[0]?.name ?? "?";
    const awayName = teams[1]?.name ?? "?";
    const existing = db.getUserPrediction(matchId, interaction.user.id);
    const modal = new ModalBuilder()
      .setCustomId(`${ID.modal(matchId)}:${league}:${homeName}|${awayName}|${game.start_time || ""}`)
      .setTitle(`${homeName} vs ${awayName}`.slice(0, 45));
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("home_goals")
          .setLabel(`${homeName} — how many goals?`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 2")
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(existing ? String(existing.home_goals) : "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("away_goals")
          .setLabel(`${awayName} — how many goals?`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 1")
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(existing ? String(existing.away_goals) : "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("scorers")
          .setLabel("Goal scorers (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setValue(existing?.goalscorers || "")
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Modal submit: save prediction & post to channel ────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith(PREFIX + "modal_")) {
    const afterPrefix = interaction.customId.replace(/^univ_modal_/, "");
    const lastColon = afterPrefix.lastIndexOf(":");
    const namesPart = afterPrefix.slice(lastColon + 1);
    const before = afterPrefix.slice(0, lastColon);
    const firstColon = before.indexOf(":");
    const matchId = before.slice(0, firstColon);
    const league = before.slice(firstColon + 1);
    const [homeName, awayName, kickoffUtc] = (namesPart || "").split("|");
    const homeGoals = parseInt(interaction.fields.getTextInputValue("home_goals"), 10);
    const awayGoals = parseInt(interaction.fields.getTextInputValue("away_goals"), 10);
    const rawScorers = interaction.fields.getTextInputValue("scorers") || "";
    const scorers = rawScorers
      .replace(/\//g, ",")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
      await interaction.reply({ content: "❌ Goals must be whole numbers (0 or more).", ephemeral: true });
      return;
    }

    const saved = db.upsertPrediction(
      matchId,
      league,
      interaction.user.id,
      interaction.user.displayName,
      homeName,
      awayName,
      kickoffUtc,
      homeGoals,
      awayGoals,
      scorers
    );

    if (!saved) {
      await interaction.reply({ content: "⏱ This match has already kicked off — predictions are locked!", ephemeral: true });
      return;
    }

    await interaction.reply({ content: "✅ Prediction saved!", ephemeral: true });

    const channelId = PREDICTIONS_CHANNEL_ID.trim();
    if (channelId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await channel.send({
          embeds: [predictionEmbed(interaction.user.displayName, homeName, awayName, kickoffUtc, homeGoals, awayGoals, scorers, league)],
        });
      }
    }
    return;
  }

  // ── /leaderboard ────────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "leaderboard") {
    const league = interaction.options.getString("league") || "overall";
    const type = interaction.options.getString("type") || "season";
    const seasonArg = type === "alltime" ? "alltime" : null;
    const rows = db.getLeaderboard(league, seasonArg, 15);
    const label = LEAGUE_LABELS[league] || league;
    const typeLabel = type === "alltime" ? "All Time" : "This Season";
    const embed = new EmbedBuilder()
      .setTitle(`${BOT_EMOJI} Leaderboard — ${label}`)
      .setDescription(`*${typeLabel}*`)
      .setColor(BOT_COLOR);
    if (!rows.length) {
      embed.addFields({ name: "No predictions yet", value: "Be the first to `/predict`!", inline: false });
    } else {
      const medals = ["🥇", "🥈", "🥉"];
      const lines = rows.map((row, i) => `${medals[i] || `\`${i + 1}.\``} **${row.username}** — ${row.total_points} pts`);
      embed.addFields({ name: "Rankings", value: lines.join("\n"), inline: false });
    }
    embed.setFooter({ text: BOT_FOOTER });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── /resetleaderboard: confirm ───────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "resetleaderboard") {
    const league = interaction.options.getString("league") || null;
    const label = league ? (LEAGUE_LABELS[league] || league) : "ALL leagues";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ID.resetConfirm(league)).setLabel("Yes, reset").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ID.resetCancel).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Confirm Season Reset")
          .setDescription(
            `This will reset **season points** for **${label}**.\nAll-time points will **not** be affected.\n\nAre you sure?`
          )
          .setColor(0xff9900),
      ],
      components: [row],
      ephemeral: true,
    });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith(ID.resetConfirm(""))) {
    const league = interaction.customId.replace(ID.resetConfirm(""), "").replace("_all", "") || null;
    db.adminResetSeasonPoints(league);
    const label = league ? (LEAGUE_LABELS[league] || league) : "ALL leagues";
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Season Points Reset")
          .setDescription(`Season points for **${label}** have been reset.\nAll-time points unchanged.`)
          .setColor(0x00cc44),
      ],
      components: [],
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === ID.resetCancel) {
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle("Cancelled").setColor(0x888888)],
      components: [],
    });
    return;
  }
});

// ─── !score ──────────────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.toLowerCase().startsWith("!score")) {
    await handleScoreCommand(message, fetchScores);
  }
});

// ─── Ready & register ────────────────────────────────────────────────────────
client.once("ready", async () => {
  db.initDb();
  console.log(`[${BOT_NAME}] Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`[${BOT_NAME}] Slash commands registered.`);
  } catch (e) {
    console.error(`[${BOT_NAME}] Failed to register commands:`, e);
  }
});

process.on("SIGINT", () => {
  db.close();
  client.destroy();
  process.exit(0);
});
process.on("SIGTERM", () => {
  db.close();
  client.destroy();
  process.exit(0);
});

if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("[Config] Set FOOTY_BOT_TOKEN, FOOTY_BOT_CLIENT_ID, FOOTY_BOT_GUILD_ID (or DISCORD_TOKEN, CLIENT_ID, GUILD_ID) in .env");
  process.exit(1);
}

client.login(BOT_TOKEN).catch(console.error);
