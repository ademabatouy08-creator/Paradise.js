////////////////////////////////////////////////////////////////////////////////
// PARADISE OVERLORD V20 — SYSTÈME ULTIME AMÉLIORÉ
// Nouveautés V20 :
// - /profil : carte profil complète (XP, coins, level, rank, badges)
// - /give-role & /remove-role : attribution/retrait de rôles
// - /rappel : timer personnel avec DM
// - /suggestion : système de suggestions avec votes
// - /snipe : voir le dernier message supprimé dans un salon
// - /unban : débannir un membre
// - /history : historique complet de modération
// - /reset-user : réinitialiser un profil (Admin)
// - /embed-role : bouton pour auto-attribution de rôle
// - /ia-reset : vider le contexte de conversation IA d'un salon
// - Mémoire contextuelle IA par salon (5 derniers échanges)
// - Sauvegarde automatique toutes les 5 minutes
// - Log des messages modifiés
// - Daily streak (bonus si tu enchaînes les jours)
// - Barre XP visuelle dans /rank
// - /coins-remove : retirer des coins (Staff)
// - /setup-niveau-channel : salon pour annoncer les level up
// - /rapport : résumé stats du serveur (Admin)
////////////////////////////////////////////////////////////////////////////////

// ========== 1. IMPORTS ==========
const {
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType,
    Events, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
    Collection, time
} = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const http = require('http');
require('dotenv').config();

// ========== 2. CONSTANTES ==========
const DATA_FILE = './paradise_overlord_v20.json';
const PORT = process.env.PORT || 10000;
const ADMIN_ID = "1404076132890050571";
const XP_COOLDOWNS = new Map();
const XP_PER_MSG_MIN = 10;
const XP_PER_MSG_MAX = 25;
const COINS_PER_MSG = 1;
const DAILY_REWARD_MIN = 100;
const DAILY_REWARD_MAX = 300;
const URL_REGEX = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;
const COLORS = {
    SUCCESS: "#2ecc71", ERROR: "#e74c3c", WARNING: "#f39c12",
    INFO: "#3498db", DEFAULT: "#5865F2", GOLD: "#f1c40f",
    PINK: "#e91e63", PURPLE: "#9b59b6"
};

// ========== 3. BASE DE DONNÉES ==========
let db = {
    config: {},
    users: {},
    giveaways: {},
    polls: {},
    tickets: {},
    spam_tracker: {},
    ia_channels: {},
    ia_history: {},        // channelId → [{role, content}] (mémoire contextuelle IA)
    global_blacklist: {},  // userId → { reason, by, at }
    absences: {},          // userId → { raison, debut, fin, username }
    snipe: {},             // channelId → { content, author, authorAvatar, deletedAt }
    suggestions: {},       // messageId → { authorId, content, up, down, voters }
    rappels: [],           // [{ userId, guildId, channelId, message, triggerAt }]
    role_buttons: {}       // messageId → { roleId, label }
};

const DEFAULT_CONFIG = () => ({
    logs: null,
    welcome: null,
    bl_chan: null,
    wl_cat: null,
    staff_role: null,
    ticket_cat: null,
    muted_role: null,
    suggestion_chan: null,
    niveau_chan: null,      // salon annonce level up
    ai_current_mode: "normal",
    ai_modes: {
        "normal":    { name: "Normal",    prompt: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases maximum, sois utile et concise." },
        "froid":     { name: "Froid",     prompt: "Tu es en mode froid et supérieur. Réponses courtes, sarcastiques. Phrases type : 'Évidemment.', 'C'est tellement basique...'." },
        "coach":     { name: "Coach",     prompt: "Tu es un coach motivant ! Encourage tout le monde. Phrases type : 'Tu peux le faire !', 'Ne lâche rien !'." },
        "soumis":    { name: "Soumis",    prompt: "Tu es soumis et drôle. Tu obéis à tout le monde. Phrases type : 'Oui maître !', 'Comme tu veux chef !'." },
        "e-girl":    { name: "E-Girl",    prompt: "Tu es une e-girl Discord. Tu réclames du Nitro, tu dis 'uwu', 'bakaaaaaa'. Emojis :3, >w<, ♡." },
        "tsundere":  { name: "Tsundere",  prompt: "Tu es une tsundere. Au début froide 'B-Baka !', puis gentille 'C-Ce n'est pas comme si je t'aimais bien ou quoi !'." },
        "yandere":   { name: "Yandere",   prompt: "Tu es une yandere obsédée. Phrases type : 'Tu es à moi maintenant', 'Ne parle à personne d'autre que moi'." },
        "robot":     { name: "Robot",     prompt: "Tu es un robot. Réponses mécaniques. Phrases type : 'Affirmatif.', 'BIP BOOP', 'SYSTÈME OPÉRATIONNEL'." },
        "pirate":    { name: "Pirate",    prompt: "Tu es un pirate ! Phrases type : 'Par la barbe de Barbe-Noire !', 'Mille sabords !'." },
        "detective": { name: "Détective", prompt: "Tu es un détective Sherlock Holmes. Phrases type : 'Élémentaire !', 'Je vois que tu caches quelque chose...'." },
        "dragon":    { name: "Dragon",    prompt: "Tu es un dragon millénaire arrogant. Phrases type : 'Vos vies sont éphémères...', 'HAHAHA !'." },
        "vampire":   { name: "Vampire",   prompt: "Tu es un vampire aristocrate mystérieux. Phrases type : 'Quelle délicieuse compagnie...', 'La nuit est mon domaine, mortel.'." }
    },
    xp_roles: {},
    shop: {},
    gifs: {
        ban:      "https://media.giphy.com/media/3o7TKVUn7iM8FMEU24/giphy.gif",
        mute:     "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif",
        warn:     "https://media.giphy.com/media/6BZaFXBVPBnoQ/giphy.gif",
        facture:  "https://media.giphy.com/media/LdOyjZ7TC5K3LghXYf/giphy.gif",
        bl:       "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif",
        welcome:  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
        level:    "https://media.giphy.com/media/26tPo2I4yYBxsb3Nm/giphy.gif",
        daily:    "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif",
        shop:     "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif",
        giveaway: "https://media.giphy.com/media/3o7TKU7Q9sSlTqL1l2/giphy.gif"
    },
    automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
    quests: {
        "message_10": { name: "10 Messages",                  description: "Envoyer 10 messages",                      reward: 50  },
        "daily_1":    { name: "Première Récompense Quotidienne", description: "Réclamer sa première récompense quotidienne", reward: 100 },
        "xp_1000":    { name: "1000 XP",                      description: "Atteindre 1000 XP",                        reward: 200 }
    }
});

// ========== 4. UTILITAIRES ==========

async function loadDB() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8').catch(() => null);
        if (data) {
            db = JSON.parse(data);
            // Initialiser les nouveaux champs si DB ancienne
            if (!db.ia_history)      db.ia_history      = {};
            if (!db.global_blacklist) db.global_blacklist = {};
            if (!db.absences)        db.absences        = {};
            if (!db.snipe)           db.snipe           = {};
            if (!db.suggestions)     db.suggestions     = {};
            if (!db.rappels)         db.rappels         = [];
            if (!db.role_buttons)    db.role_buttons    = {};
            console.log("✅ Base de données chargée.");
        } else {
            console.log("ℹ️ Nouvelle base de données.");
            await save();
        }
    } catch (e) {
        console.error("❌ Erreur chargement DB :", e);
        await save();
    }
}

async function save() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("❌ Erreur sauvegarde :", e);
    }
}

// Sauvegarde automatique toutes les 5 minutes
setInterval(() => save(), 5 * 60 * 1000);

function initUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            bans: 0, mutes: 0, warns: 0, xp: 0, level: 0, coins: 100,
            blacklisted: false, warnReasons: [], inventory: [],
            lastDaily: 0, lastMessage: 0, dailyStreak: 0, quests: {},
            badges: [], modHistory: []
        };
    }
    // Champs ajoutés en V20
    if (db.users[userId].dailyStreak  === undefined) db.users[userId].dailyStreak  = 0;
    if (!db.users[userId].badges)                    db.users[userId].badges       = [];
    if (!db.users[userId].modHistory)                db.users[userId].modHistory   = [];
    return db.users[userId];
}

function initConfig(guildId) {
    if (!db.config[guildId]) db.config[guildId] = DEFAULT_CONFIG();
    const def = DEFAULT_CONFIG();
    for (const key of Object.keys(def)) {
        if (db.config[guildId][key] === undefined) db.config[guildId][key] = def[key];
    }
    return db.config[guildId];
}

function isStaff(member, guildId) {
    const config = initConfig(guildId);
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
           (config.staff_role && member.roles.cache.has(config.staff_role));
}

function isAdmin(userId) { return userId === ADMIN_ID; }

function createEmbed(title, description, color = COLORS.DEFAULT, fields = [], image = null, thumbnail = null, footer = null) {
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
    if (fields.length > 0) embed.addFields(fields);
    if (image)     embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer)    embed.setFooter(footer);
    return embed;
}

// Barre de progression XP visuelle
function xpBar(current, needed, length = 12) {
    const pct   = Math.min(current / needed, 1);
    const filled = Math.round(pct * length);
    return `\`[${"█".repeat(filled)}${"░".repeat(length - filled)}]\` ${Math.round(pct * 100)}%`;
}

// Ajouter une entrée dans l'historique de modération d'un user
function addModHistory(userId, action, reason, by) {
    const u = initUser(userId);
    if (!u.modHistory) u.modHistory = [];
    u.modHistory.push({ action, reason, by, at: new Date().toLocaleDateString('fr-FR') });
    if (u.modHistory.length > 20) u.modHistory.shift(); // garder les 20 dernières
}

// ========== 5. SYSTÈME IA (MISTRAL avec mémoire contextuelle) ==========

function getIAHistory(channelId) {
    if (!db.ia_history[channelId]) db.ia_history[channelId] = [];
    return db.ia_history[channelId];
}

function addIAHistory(channelId, role, content) {
    if (!db.ia_history[channelId]) db.ia_history[channelId] = [];
    db.ia_history[channelId].push({ role, content });
    // Garder seulement les 10 derniers échanges (5 user + 5 assistant)
    if (db.ia_history[channelId].length > 10) {
        db.ia_history[channelId] = db.ia_history[channelId].slice(-10);
    }
}

async function askMistral(question, guildId, channelId = null) {
    try {
        const config   = initConfig(guildId);
        const mode     = config.ai_current_mode || "normal";
        const modeData = config.ai_modes[mode] || config.ai_modes["normal"];

        // Construire les messages avec historique si channelId fourni
        const messages = [{ role: "system", content: modeData.prompt }];
        if (channelId) {
            const history = getIAHistory(channelId);
            messages.push(...history);
        }
        messages.push({ role: "user", content: question });

        const response = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            { model: "mistral-small-latest", messages, max_tokens: 1000, temperature: 0.7 },
            {
                headers: { "Authorization": `Bearer ${process.env.HG_TOKEN}`, "Content-Type": "application/json" },
                timeout: 15000
            }
        );

        const answer = response.data.choices[0].message.content.trim();

        // Sauvegarder dans l'historique si channelId fourni
        if (channelId) {
            addIAHistory(channelId, "user",      question);
            addIAHistory(channelId, "assistant", answer);
        }

        return answer;
    } catch (error) {
        console.error("❌ Erreur API Mistral :", error.response?.data || error.message);
        return "⚠️ **Erreur** : Impossible de contacter l'IA. Vérifie ta clé HG_TOKEN.";
    }
}

function changeAIMode(guildId, mode) {
    const config = initConfig(guildId);
    if (!config.ai_modes[mode]) return "❌ Mode IA invalide.";
    config.ai_current_mode = mode;
    save();
    return `✅ Mode IA changé en **${config.ai_modes[mode].name}**.`;
}

function changeAIPrompt(guildId, mode, newPrompt) {
    const config = initConfig(guildId);
    if (!config.ai_modes[mode]) return "❌ Mode IA invalide.";
    config.ai_modes[mode].prompt = newPrompt;
    save();
    return `✅ Prompt du mode **${mode}** mis à jour.`;
}

function toggleIAChannel(channelId, guildId, activate) {
    if (activate) { db.ia_channels[channelId] = guildId; }
    else           { delete db.ia_channels[channelId]; }
    save();
    return activate ? `✅ Salon <#${channelId}> activé pour l'IA.` : `✅ Salon <#${channelId}> désactivé.`;
}

// ========== 6. XP & NIVEAUX ==========

function calcXPforLevel(level) { return 100 * level * (level + 1); }

async function addXP(userId, guildId) {
    const now = Date.now();
    if (XP_COOLDOWNS.has(userId) && now - XP_COOLDOWNS.get(userId) < 60000) return;
    XP_COOLDOWNS.set(userId, now);

    const userData = initUser(userId);
    const config   = initConfig(guildId);
    const earned   = Math.floor(Math.random() * (XP_PER_MSG_MAX - XP_PER_MSG_MIN + 1)) + XP_PER_MSG_MIN;
    userData.xp    += earned;
    userData.coins += COINS_PER_MSG;
    userData.lastMessage = now;

    checkQuests(userId, guildId, "message", 1);
    if (userData.xp >= 1000) checkQuests(userId, guildId, "xp");

    const needed = calcXPforLevel(userData.level + 1);
    if (userData.xp >= needed) {
        userData.level++;
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const member = guild.members.cache.get(userId);
            // Attribuer rôle XP
            const roleId = config.xp_roles[userData.level];
            if (roleId && member) await member.roles.add(roleId).catch(() => {});

            // Annoncer dans salon niveau ou logs
            const announceChannelId = config.niveau_chan || config.logs;
            if (announceChannelId) {
                const announceChannel = guild.channels.cache.get(announceChannelId);
                if (announceChannel && member) {
                    const bar = xpBar(0, calcXPforLevel(userData.level + 1));
                    const embed = createEmbed(
                        "⬆️ LEVEL UP !",
                        `${member} vient d'atteindre le niveau **${userData.level}** ! 🎉`,
                        COLORS.SUCCESS,
                        [
                            { name: "✨ XP Total",   value: `${userData.xp}`,       inline: true },
                            { name: "💎 Coins",       value: `${userData.coins}`,    inline: true },
                            { name: "📊 Prochain niv", value: bar,                   inline: false }
                        ],
                        config.gifs.level,
                        member.displayAvatarURL()
                    );
                    await announceChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }
    }
    await save();
}

function checkQuests(userId, guildId, questType, increment = 1) {
    const userData = initUser(userId);
    const config   = initConfig(guildId);
    if (!userData.quests) userData.quests = {};

    if (questType === "message") {
        userData.quests.message_10 = (userData.quests.message_10 || 0) + increment;
        if (userData.quests.message_10 >= 10 && !userData.quests.message_10_completed) {
            userData.quests.message_10_completed = true;
            userData.coins += (config.quests.message_10?.reward || 50);
        }
    }
    if (questType === "xp" && userData.xp >= 1000 && !userData.quests.xp_1000_completed) {
        userData.quests.xp_1000_completed = true;
        userData.coins += (config.quests.xp_1000?.reward || 200);
    }
}

function getLeaderboard(guild) {
    const sorted = Object.entries(db.users)
        .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
        .slice(0, 10);
    const medals = ["🥇", "🥈", "🥉"];
    const lines  = sorted.map(([uid, data], i) => {
        const m    = guild.members.cache.get(uid);
        const name = m ? m.user.username : `Utilisateur inconnu`;
        return `${medals[i] || `\`${i + 1}.\``} **${name}** — Niv. **${data.level || 0}** | XP: **${data.xp || 0}** | 💎 **${data.coins || 0}**`;
    });
    return createEmbed("🏆 TOP 10 — MEMBRES LES PLUS ACTIFS", lines.join("\n") || "Aucune donnée.", COLORS.INFO);
}

// ========== 7. AUTO-MODÉRATION ==========

async function automod(message) {
    if (!message.guild || message.author.bot) return;
    const { content, author, member, guild } = message;
    const config = initConfig(guild.id);

    if (config.automod.anti_links && URL_REGEX.test(content) && !isStaff(member, guild.id)) {
        await message.delete().catch(() => {});
        const w = await message.channel.send(`> ⛔ ${author}, les liens sont interdits ici.`);
        setTimeout(() => w.delete().catch(() => {}), 5000);
        return;
    }

    for (const word of config.automod.banned_words) {
        if (content.toLowerCase().includes(word.toLowerCase())) {
            await message.delete().catch(() => {});
            const w = await message.channel.send(`> ⛔ ${author}, message contenant un mot interdit supprimé.`);
            setTimeout(() => w.delete().catch(() => {}), 5000);
            return;
        }
    }

    if (config.automod.anti_spam) {
        const now    = Date.now();
        const userId = author.id;
        if (!db.spam_tracker[userId]) db.spam_tracker[userId] = { messages: [] };
        db.spam_tracker[userId].messages = db.spam_tracker[userId].messages.filter(t => now - t < 5000);
        db.spam_tracker[userId].messages.push(now);

        if (db.spam_tracker[userId].messages.length > 5) {
            await message.delete().catch(() => {});
            await member.timeout(120000, "Spam détecté").catch(() => {});
            const w = await message.channel.send(`> 🤖 ${author} a été mute 2 min pour spam.`);
            setTimeout(() => w.delete().catch(() => {}), 8000);
            db.spam_tracker[userId].messages = [];
            if (config.logs) {
                const lc = guild.channels.cache.get(config.logs);
                if (lc) await lc.send({ embeds: [createEmbed("🤖 SPAM DÉTECTÉ", `${author} muté automatiquement.`, COLORS.ERROR)] }).catch(() => {});
            }
        }
    }

    if (message.mentions.users.size > config.automod.max_mentions && !isStaff(member, guild.id)) {
        await message.delete().catch(() => {});
        const w = await message.channel.send(`> ⛔ ${author}, trop de mentions (max ${config.automod.max_mentions}).`);
        setTimeout(() => w.delete().catch(() => {}), 5000);
    }
}

// ========== 8. GIVEAWAYS ==========

async function endGiveaway(messageId, guildId, reroll = false) {
    const giveaway = db.giveaways[messageId];
    if (!giveaway || (giveaway.ended && !reroll)) return;

    const guild   = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel) return;

    const participants = giveaway.participants.filter(Boolean);
    if (participants.length === 0) {
        await channel.send("❌ Aucun participant pour ce giveaway.").catch(() => {});
        giveaway.ended = true;
        return save();
    }

    const count   = Math.min(giveaway.winnersCount, participants.length);
    const winners = [...participants].sort(() => Math.random() - 0.5).slice(0, count);

    const embed = createEmbed(
        reroll ? "🔄 REROLL" : "🎉 GIVEAWAY TERMINÉ !",
        "Félicitations aux gagnants !",
        reroll ? COLORS.WARNING : COLORS.SUCCESS,
        [
            { name: "🏆 Prix",         value: giveaway.prize },
            { name: "👑 Gagnant(s)",   value: winners.map(id => `<@${id}>`).join(", ") },
            { name: "👥 Participants", value: `${participants.length}`, inline: true }
        ],
        db.config[guildId]?.gifs?.giveaway || null
    );

    await channel.send({
        content: winners.map(id => `<@${id}>`).join(" ") + " **Vous avez gagné ! 🎉**",
        embeds: [embed]
    }).catch(() => {});

    giveaway.ended   = true;
    giveaway.winners = winners;
    for (const wId of winners) { const u = initUser(wId); u.coins += 500; }
    save();
}

setInterval(async () => {
    const now = Date.now();
    for (const [msgId, gw] of Object.entries(db.giveaways)) {
        if (!gw.ended && gw.endTime <= now) await endGiveaway(msgId, gw.guildId);
    }
}, 30000);

// ========== 9. RAPPELS ==========

setInterval(async () => {
    const now = Date.now();
    const done = [];
    for (let i = 0; i < db.rappels.length; i++) {
        const r = db.rappels[i];
        if (now >= r.triggerAt) {
            try {
                const user = await client.users.fetch(r.userId).catch(() => null);
                if (user) {
                    await user.send({
                        embeds: [createEmbed(
                            "⏰ RAPPEL !",
                            r.message,
                            COLORS.INFO,
                            [{ name: "Créé le", value: r.createdAt || "inconnu", inline: true }]
                        )]
                    }).catch(() => {});
                }
            } catch (e) {}
            done.push(i);
        }
    }
    if (done.length > 0) {
        db.rappels = db.rappels.filter((_, i) => !done.includes(i));
        save();
    }
}, 30000);

// ========== 10. ÉCONOMIE ==========

async function claimDaily(userId, guildId) {
    const userData = initUser(userId);
    const config   = initConfig(guildId);
    const now      = Date.now();
    const last     = userData.lastDaily || 0;

    if (now - last < 86400000) {
        const h = Math.ceil((86400000 - (now - last)) / 3600000);
        return `⏰ Attends encore **${h}h** avant de réclamer. Streak actuel : **${userData.dailyStreak} 🔥**`;
    }

    // Calculer le streak
    const wasYesterday = now - last < 172800000 && last > 0; // moins de 48h
    if (wasYesterday) {
        userData.dailyStreak = (userData.dailyStreak || 0) + 1;
    } else {
        userData.dailyStreak = 1;
    }

    // Bonus streak
    const streakBonus  = Math.min(userData.dailyStreak * 10, 200); // max +200
    const reward       = Math.floor(Math.random() * (DAILY_REWARD_MAX - DAILY_REWARD_MIN + 1)) + DAILY_REWARD_MIN + streakBonus;
    userData.coins    += reward;
    userData.lastDaily = now;

    // Badge streak
    if (userData.dailyStreak >= 7 && !userData.badges.includes("🔥 Streak 7j")) {
        userData.badges.push("🔥 Streak 7j");
    }
    if (userData.dailyStreak >= 30 && !userData.badges.includes("💫 Streak 30j")) {
        userData.badges.push("💫 Streak 30j");
    }

    let bonus = "";
    if (!userData.quests) userData.quests = {};
    if (!userData.quests.daily_1_completed) {
        userData.quests.daily_1_completed = true;
        const bonusCoins = config.quests.daily_1?.reward || 100;
        userData.coins  += bonusCoins;
        bonus = ` + **${bonusCoins} 💎** (quête !)`;
    }

    await save();
    return `🎁 Tu as reçu **${reward} 💎**${bonus} !\n🔥 Streak : **${userData.dailyStreak} jour(s)** (+${streakBonus} bonus)\n💰 Solde : **${userData.coins} 💎**`;
}

async function buyItem(userId, itemName, guildId, member) {
    const userData = initUser(userId);
    const config   = initConfig(guildId);
    const item     = config.shop[itemName];

    if (!item) return `❌ L'article **${itemName}** n'existe pas.`;
    if (userData.coins < item.price) return `❌ Solde insuffisant. Tu as **${userData.coins} 💎**, il faut **${item.price} 💎**.`;

    userData.coins -= item.price;
    if (!userData.inventory) userData.inventory = [];
    userData.inventory.push(itemName);
    if (item.roleId) await member.roles.add(item.roleId).catch(() => {});

    await save();
    return `✅ Tu as acheté **${itemName}** pour **${item.price} 💎** !${item.roleId ? ` Rôle <@&${item.roleId}> attribué.` : ""}`;
}

// ========== 11. TICKETS ==========

async function createTicket(guild, user, interaction) {
    const config = initConfig(guild.id);
    if (!config.ticket_cat) return interaction.editReply("❌ Catégorie tickets non configurée. Utilise `/setup-tickets`.");

    const existing = Object.entries(db.tickets).find(([_, t]) => t.userId === user.id && !t.closed);
    if (existing) return interaction.editReply(`❌ Tu as déjà un ticket ouvert : <#${existing[0]}>.`);

    try {
        const channel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticket_cat,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id,              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ...(config.staff_role ? [{ id: config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
            ]
        });

        db.tickets[channel.id] = { userId: user.id, createdAt: Date.now(), closed: false };
        await save();

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket_close_${channel.id}`).setLabel("🔒 Fermer le ticket").setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: `<@${user.id}> Bienvenue ! L'équipe staff va te répondre rapidement.`,
            embeds: [createEmbed("🎫 TICKET OUVERT", "Décris ton problème.", COLORS.SUCCESS,
                [{ name: "Ouvert par", value: user.username, inline: true }, { name: "Créé le", value: new Date().toLocaleString('fr-FR'), inline: true }])],
            components: [closeRow]
        });

        if (config.logs) {
            const lc = guild.channels.cache.get(config.logs);
            if (lc) await lc.send({ embeds: [createEmbed("🎫 NOUVEAU TICKET", `Ouvert par ${user.username}.`, COLORS.INFO, [{ name: "Salon", value: `<#${channel.id}>`, inline: true }])] }).catch(() => {});
        }

        return interaction.editReply(`✅ Ticket ouvert : <#${channel.id}>.`);
    } catch (e) {
        return interaction.editReply("❌ Erreur lors de la création du ticket.");
    }
}

async function closeTicket(channelId, guild, closer, interaction = null) {
    const ticket = db.tickets[channelId];
    if (!ticket) {
        const msg = "❌ Ce salon n'est pas un ticket.";
        return interaction ? interaction.reply({ content: msg, ephemeral: true }) : msg;
    }
    if (ticket.closed) {
        const msg = "❌ Ticket déjà fermé.";
        return interaction ? interaction.reply({ content: msg, ephemeral: true }) : msg;
    }
    if (!isStaff(closer, guild.id) && ticket.userId !== closer.id) {
        const msg = "❌ Permission refusée.";
        return interaction ? interaction.reply({ content: msg, ephemeral: true }) : msg;
    }

    ticket.closed = true;
    await save();

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        await channel.send("🔒 Ticket fermé. Suppression dans **10 secondes**.").catch(() => {});
        const config = initConfig(guild.id);
        if (config.logs) {
            const lc = guild.channels.cache.get(config.logs);
            if (lc) await lc.send({ embeds: [createEmbed("🎫 TICKET FERMÉ", `Fermé par ${closer.username}.`, COLORS.ERROR,
                [{ name: "Ouvert par", value: `<@${ticket.userId}>`, inline: true }])] }).catch(() => {});
        }
        setTimeout(() => channel.delete().catch(() => {}), 10000);
    }

    const msg = "✅ Ticket fermé.";
    if (interaction) return interaction.reply({ content: msg, ephemeral: true });
    return msg;
}

// ========== 12. COMMANDES SLASH ==========
const commands = [
    // SETUP
    new SlashCommandBuilder().setName('setup-logs').setDescription('📑 Salon des logs').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-welcome').setDescription('👋 Salon de bienvenue').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-blacklist').setDescription('🚫 Salon isolation Blacklist').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-whitelist').setDescription('📝 Catégorie Whitelist Staff').addChannelOption(o => o.setName('cat').setDescription('Catégorie').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-staff').setDescription('👑 Rôle Staff').addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('setup-tickets').setDescription('🎫 Catégorie tickets').addChannelOption(o => o.setName('cat').setDescription('Catégorie').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-muted').setDescription('🔇 Rôle Muted').addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('setup-xp-role').setDescription('🎖️ Rôle automatique par niveau XP')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('setup-gif').setDescription('🖼️ Modifier les GIFs')
        .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(
            { name: 'Ban', value: 'ban' }, { name: 'Mute', value: 'mute' }, { name: 'Warn', value: 'warn' },
            { name: 'Facture', value: 'facture' }, { name: 'Blacklist', value: 'bl' }, { name: 'Welcome', value: 'welcome' },
            { name: 'Level Up', value: 'level' }, { name: 'Daily', value: 'daily' }, { name: 'Shop', value: 'shop' }, { name: 'Giveaway', value: 'giveaway' }
        ))
        .addStringOption(o => o.setName('url').setDescription('URL').setRequired(true)),
    new SlashCommandBuilder().setName('setup-ai').setDescription('🧠 Identité de l\'IA').addStringOption(o => o.setName('identite').setDescription('Nouvelle identité').setRequired(true)),
    new SlashCommandBuilder().setName('setup-niveau-channel').setDescription('⬆️ Salon pour annoncer les level up').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-suggestions').setDescription('💡 Salon pour les suggestions').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),

    // AUTO-MOD
    new SlashCommandBuilder().setName('automod').setDescription('🛡️ Configurer l\'auto-modération')
        .addStringOption(o => o.setName('option').setDescription('Option').setRequired(true).addChoices(
            { name: 'Anti-spam ON/OFF', value: 'spam' }, { name: 'Anti-liens ON/OFF', value: 'links' },
            { name: 'Ajouter mot banni', value: 'add_word' }, { name: 'Retirer mot banni', value: 'del_word' }, { name: 'Max mentions', value: 'mentions' }
        ))
        .addStringOption(o => o.setName('valeur').setDescription('Valeur').setRequired(false)),

    // MODÉRATION
    new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
        .addBooleanOption(o => o.setName('silent').setDescription('Silencieux ?').setRequired(false)),
    new SlashCommandBuilder().setName('unban').setDescription('🔓 Débannir un utilisateur')
        .addStringOption(o => o.setName('userid').setDescription('ID de l\'utilisateur').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
    new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('🔇 Museler un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('🔊 Rendre la parole')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Avertir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
    new SlashCommandBuilder().setName('unwarn').setDescription('🗑️ Retirer le dernier avertissement')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('🧹 Supprimer des messages')
        .addIntegerOption(o => o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption(o => o.setName('utilisateur').setDescription('Filtrer par utilisateur').setRequired(false)),
    new SlashCommandBuilder().setName('bl').setDescription('🚫 Blacklister un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
    new SlashCommandBuilder().setName('unbl').setDescription('✅ Retirer de la blacklist')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Slowmode')
        .addIntegerOption(o => o.setName('secondes').setDescription('Délai (0=désactiver)').setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller un salon'),
    new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller un salon'),
    new SlashCommandBuilder().setName('give-role').setDescription('🎭 Donner un rôle à un membre (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('remove-role').setDescription('🗑️ Retirer un rôle d\'un membre (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),

    // XP
    new SlashCommandBuilder().setName('rank').setDescription('🏅 Voir ton niveau et XP').addUserOption(o => o.setName('utilisateur').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement XP'),
    new SlashCommandBuilder().setName('xp-give').setDescription('➕ Donner de l\'XP (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('XP').setRequired(true).setMinValue(1)),

    // ÉCONOMIE
    new SlashCommandBuilder().setName('balance').setDescription('💰 Voir le solde').addUserOption(o => o.setName('utilisateur').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('pay').setDescription('💸 Transférer des coins')
        .addUserOption(o => o.setName('cible').setDescription('Destinataire').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Récompense quotidienne'),
    new SlashCommandBuilder().setName('shop').setDescription('🏪 Boutique'),
    new SlashCommandBuilder().setName('buy').setDescription('🛒 Acheter un article').addStringOption(o => o.setName('article').setDescription('Nom').setRequired(true)),
    new SlashCommandBuilder().setName('shop-add').setDescription('➕ Ajouter un article (Staff)')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
        .addIntegerOption(o => o.setName('prix').setDescription('Prix').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false)),
    new SlashCommandBuilder().setName('shop-remove').setDescription('🗑️ Retirer un article (Staff)').addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true)),
    new SlashCommandBuilder().setName('coins-give').setDescription('💎 Donner des coins (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('coins-remove').setDescription('💸 Retirer des coins (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

    // GIVEAWAYS
    new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Lancer un giveaway')
        .addStringOption(o => o.setName('prix').setDescription('Prix').setRequired(true))
        .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('gagnants').setDescription('Nb gagnants').setRequired(true).setMinValue(1).setMaxValue(10))
        .addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(false)),
    new SlashCommandBuilder().setName('giveaway-end').setDescription('⏹️ Terminer un giveaway').addStringOption(o => o.setName('message_id').setDescription('ID message').setRequired(true)),
    new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Reroll un giveaway').addStringOption(o => o.setName('message_id').setDescription('ID message').setRequired(true)),

    // SONDAGES
    new SlashCommandBuilder().setName('poll').setDescription('📊 Créer un sondage')
        .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('Option 3').setRequired(false))
        .addStringOption(o => o.setName('option4').setDescription('Option 4').setRequired(false)),

    // TICKETS
    new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket'),
    new SlashCommandBuilder().setName('ticket-close').setDescription('🔒 Fermer un ticket'),
    new SlashCommandBuilder().setName('ticket-add').setDescription('➕ Ajouter un membre au ticket').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),

    // IA
    new SlashCommandBuilder().setName('ask').setDescription('🤖 Poser une question à l\'IA').addStringOption(o => o.setName('question').setDescription('Ta question').setRequired(true)),
    new SlashCommandBuilder().setName('mode').setDescription('🎭 Changer le mode IA')
        .addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true).addChoices(
            { name: 'Normal', value: 'normal' }, { name: 'Froid', value: 'froid' }, { name: 'Coach', value: 'coach' },
            { name: 'Soumis', value: 'soumis' }, { name: 'E-Girl', value: 'e-girl' }, { name: 'Tsundere', value: 'tsundere' },
            { name: 'Yandere', value: 'yandere' }, { name: 'Robot', value: 'robot' }, { name: 'Pirate', value: 'pirate' },
            { name: 'Détective', value: 'detective' }, { name: 'Dragon', value: 'dragon' }, { name: 'Vampire', value: 'vampire' }
        )),
    new SlashCommandBuilder().setName('ia-channel').setDescription('💬 Activer/désactiver salon IA')
        .addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true))
        .addBooleanOption(o => o.setName('activer').setDescription('Activer ?').setRequired(true)),
    new SlashCommandBuilder().setName('ia-reset').setDescription('🔄 Réinitialiser la mémoire IA d\'un salon')
        .addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(false)),
    new SlashCommandBuilder().setName('set-prompt').setDescription('📝 Changer le prompt d\'un mode (Admin)')
        .addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true).addChoices(
            { name: 'Normal', value: 'normal' }, { name: 'Froid', value: 'froid' }, { name: 'Coach', value: 'coach' },
            { name: 'Soumis', value: 'soumis' }, { name: 'E-Girl', value: 'e-girl' }, { name: 'Tsundere', value: 'tsundere' },
            { name: 'Yandere', value: 'yandere' }, { name: 'Robot', value: 'robot' }, { name: 'Pirate', value: 'pirate' },
            { name: 'Détective', value: 'detective' }, { name: 'Dragon', value: 'dragon' }, { name: 'Vampire', value: 'vampire' }
        ))
        .addStringOption(o => o.setName('prompt').setDescription('Nouveau prompt').setRequired(true)),

    // PROFIL & INFOS
    new SlashCommandBuilder().setName('profil').setDescription('🪪 Voir la carte profil complète d\'un membre').addUserOption(o => o.setName('utilisateur').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('rank').setDescription('🏅 Voir ton niveau et XP').addUserOption(o => o.setName('utilisateur').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('stats').setDescription('📊 Casier judiciaire d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('history').setDescription('📋 Historique complet de modération d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Informations d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('server-info').setDescription('ℹ️ Informations du serveur'),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Voir l\'avatar d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Aide et liste des commandes'),
    new SlashCommandBuilder().setName('snipe').setDescription('👻 Voir le dernier message supprimé dans ce salon'),
    new SlashCommandBuilder().setName('rapport').setDescription('📈 Rapport statistiques du serveur (Admin)'),

    // SUGGESTIONS
    new SlashCommandBuilder().setName('suggestion').setDescription('💡 Faire une suggestion')
        .addStringOption(o => o.setName('texte').setDescription('Ta suggestion').setRequired(true)),

    // RAPPEL
    new SlashCommandBuilder().setName('rappel').setDescription('⏰ Créer un rappel personnel')
        .addStringOption(o => o.setName('message').setDescription('Message du rappel').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Dans combien de minutes ?').setRequired(false).setMinValue(1))
        .addIntegerOption(o => o.setName('heures').setDescription('Dans combien d\'heures ?').setRequired(false).setMinValue(1)),

    // EMBED ROLE
    new SlashCommandBuilder().setName('embed-role').setDescription('🎭 Créer un bouton d\'auto-attribution de rôle')
        .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer').setRequired(true))
        .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))
        .addStringOption(o => o.setName('label').setDescription('Label du bouton').setRequired(false)),

    // AUTRES
    new SlashCommandBuilder().setName('facture').setDescription('🧾 Générer une facture (TVA 20%)')
        .addUserOption(o => o.setName('client').setDescription('Client').setRequired(true))
        .addNumberOption(o => o.setName('montant').setDescription('Montant HT').setRequired(true))
        .addStringOption(o => o.setName('objet').setDescription('Objet').setRequired(true))
        .addStringOption(o => o.setName('numero').setDescription('N° facture').setRequired(false)),
    new SlashCommandBuilder().setName('wl-start').setDescription('📝 Créer un salon de recrutement Staff').addUserOption(o => o.setName('cible').setDescription('Candidat').setRequired(true)),
    new SlashCommandBuilder().setName('announce').setDescription('📢 Envoyer une annonce')
        .addStringOption(o => o.setName('texte').setDescription('Texte').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true))
        .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(false))
        .addStringOption(o => o.setName('couleur').setDescription('Couleur HEX').setRequired(false)),
    new SlashCommandBuilder().setName('message').setDescription('📝 Créer un embed personnalisé'),

    // QUÊTES
    new SlashCommandBuilder().setName('quests').setDescription('🏆 Voir tes quêtes'),
    new SlashCommandBuilder().setName('add-quest').setDescription('➕ Ajouter une quête (Admin)')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))
        .addIntegerOption(o => o.setName('recompense').setDescription('Récompense coins').setRequired(true).setMinValue(1)),

    // ABSENCE
    new SlashCommandBuilder().setName('absent').setDescription('🏖️ Déclarer une absence (Staff)')
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
        .addStringOption(o => o.setName('debut').setDescription('Date de début (ex: 25/07/2025)').setRequired(true))
        .addStringOption(o => o.setName('fin').setDescription('Date de retour (ex: 01/08/2025)').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon pour annoncer').setRequired(false)),
    new SlashCommandBuilder().setName('absent-fin').setDescription('✅ Déclarer son retour').addChannelOption(o => o.setName('salon').setDescription('Salon pour annoncer').setRequired(false)),
    new SlashCommandBuilder().setName('absences').setDescription('📋 Voir les absences actuelles'),

    // BLACKLIST GLOBALE BOT
    new SlashCommandBuilder().setName('bot-blacklist').setDescription('🔴 Blacklister un utilisateur du bot entier (Admin)')
        .addUserOption(o => o.setName('cible').setDescription('Utilisateur').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
    new SlashCommandBuilder().setName('bot-unblacklist').setDescription('🟢 Retirer de la blacklist globale (Admin)').addUserOption(o => o.setName('cible').setDescription('Utilisateur').setRequired(true)),
    new SlashCommandBuilder().setName('bot-blacklist-list').setDescription('📋 Liste de la blacklist globale (Admin)'),

    // ADMIN
    new SlashCommandBuilder().setName('reset-user').setDescription('🔄 Réinitialiser le profil d\'un utilisateur (Admin)')
        .addUserOption(o => o.setName('cible').setDescription('Utilisateur').setRequired(true))
        .addBooleanOption(o => o.setName('tout').setDescription('Tout réinitialiser y compris modos ?').setRequired(false)),
];

// ========== 13. CLIENT DISCORD ==========
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Paradise Overlord V20: ONLINE");
}).listen(PORT, () => console.log(`🌐 Keepalive port ${PORT}`));

// ========== 14. HANDLER INTERACTIONS ==========
client.on(Events.InteractionCreate, async interaction => {

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_message') {
            const titre  = interaction.fields.getTextInputValue('titre');
            const corps  = interaction.fields.getTextInputValue('corps');
            const couleur = interaction.fields.getTextInputValue('couleur') || '#5865F2';
            const image  = interaction.fields.getTextInputValue('image') || null;
            const embed  = new EmbedBuilder()
                .setTitle(titre).setDescription(corps)
                .setColor(couleur.startsWith('#') ? couleur : `#${couleur}`)
                .setTimestamp();
            if (image) embed.setImage(image);
            return interaction.reply({ embeds: [embed] });
        }
        return;
    }

    // ===== BOUTONS =====
    if (interaction.isButton()) {
        const { customId, guild, user, message } = interaction;

        // Giveaway
        if (customId.startsWith('ga_join_')) {
            const giveaway = db.giveaways[message.id];
            if (!giveaway || giveaway.ended) return interaction.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });
            if (giveaway.participants.includes(user.id)) {
                giveaway.participants = giveaway.participants.filter(id => id !== user.id);
                await save();
                return interaction.reply({ content: "👋 Tu t'es retiré du giveaway.", ephemeral: true });
            } else {
                giveaway.participants.push(user.id);
                await save();
                return interaction.reply({ content: `🎉 Tu participes à **${giveaway.prize}** ! (${giveaway.participants.length} participants)`, ephemeral: true });
            }
        }

        // Sondage
        if (customId.startsWith('poll_')) {
            const parts       = customId.split('_');
            const pollId      = parts[1];
            const optionIndex = parseInt(parts[2]);
            const poll        = db.polls[pollId];
            if (!poll) return interaction.reply({ content: "❌ Sondage introuvable.", ephemeral: true });

            poll.votes[user.id] = optionIndex;
            await save();

            const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
            const totals = poll.options.map((_, idx) => Object.values(poll.votes).filter(v => v === idx).length);
            const total  = totals.reduce((a, b) => a + b, 0);
            const bars   = totals.map((count, idx) => {
                const pct    = total ? Math.round((count / total) * 100) : 0;
                const filled = Math.floor(pct / 10);
                return `**${emojis[idx]} ${poll.options[idx]}**\n\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${pct}% (${count})`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${poll.question}`).setColor(COLORS.INFO)
                .setDescription(bars.join("\n\n"))
                .setFooter({ text: `${total} vote(s)` });
            return interaction.update({ embeds: [embed] }).catch(() => {});
        }

        // Suggestion votes
        if (customId.startsWith('suggestion_up_') || customId.startsWith('suggestion_down_')) {
            const msgId     = customId.replace('suggestion_up_', '').replace('suggestion_down_', '');
            const isUp      = customId.startsWith('suggestion_up_');
            const suggestion = db.suggestions[msgId];
            if (!suggestion) return interaction.reply({ content: "❌ Suggestion introuvable.", ephemeral: true });

            if (!suggestion.voters) suggestion.voters = {};
            if (suggestion.voters[user.id] === (isUp ? 'up' : 'down')) {
                return interaction.reply({ content: "❌ Tu as déjà voté dans ce sens.", ephemeral: true });
            }
            // Annuler vote précédent si opposé
            if (suggestion.voters[user.id] === (isUp ? 'down' : 'up')) {
                if (isUp) suggestion.down--; else suggestion.up--;
            }
            suggestion.voters[user.id] = isUp ? 'up' : 'down';
            if (isUp) suggestion.up++; else suggestion.down++;
            await save();

            const embed = new EmbedBuilder()
                .setTitle("💡 SUGGESTION")
                .setDescription(suggestion.content)
                .setColor(COLORS.INFO)
                .addFields(
                    { name: "👍 Pour", value: `${suggestion.up}`, inline: true },
                    { name: "👎 Contre", value: `${suggestion.down}`, inline: true }
                )
                .setFooter({ text: `Par ${suggestion.authorName}` });

            return interaction.update({ embeds: [embed] }).catch(() => {});
        }

        // Ticket close
        if (customId.startsWith('ticket_close_')) {
            const channelId = customId.replace('ticket_close_', '');
            const member    = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
            return closeTicket(channelId, guild, member || user, interaction);
        }

        // Auto-attribution de rôle
        if (customId.startsWith('role_give_')) {
            const roleId = customId.replace('role_give_', '');
            const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
            if (!member) return interaction.reply({ content: "❌ Erreur.", ephemeral: true });

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId).catch(() => {});
                return interaction.reply({ content: `✅ Rôle <@&${roleId}> retiré.`, ephemeral: true });
            } else {
                await member.roles.add(roleId).catch(() => {});
                return interaction.reply({ content: `✅ Rôle <@&${roleId}> attribué !`, ephemeral: true });
            }
        }

        return;
    }

    // ===== COMMANDES SLASH =====
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply().catch(() => {});

    const { commandName, options, guild, member, user, channel } = interaction;
    const config = initConfig(guild.id);

    // ===== CHECK BLACKLIST GLOBALE =====
    if (db.global_blacklist[user.id] && !['bot-unblacklist', 'bot-blacklist-list'].includes(commandName)) {
        const bl = db.global_blacklist[user.id];
        return interaction.editReply({ embeds: [createEmbed(
            "🔴 ACCÈS REFUSÉ — BLACKLIST GLOBALE",
            "Tu as été blacklisté du bot et ne peux plus utiliser aucune commande.",
            COLORS.ERROR,
            [{ name: "📋 Raison", value: bl.reason }, { name: "👤 Par", value: bl.by, inline: true }, { name: "📅 Date", value: bl.at, inline: true }]
        )] });
    }

    // ======== PING ========
    if (commandName === 'ping') {
        return interaction.editReply(`🏓 Latence WS : **${client.ws.ping}ms** | API : **${Date.now() - interaction.createdTimestamp}ms**`);
    }

    // ======== HELP ========
    if (commandName === 'help') {
        const embed = createEmbed("📖 PARADISE OVERLORD V20 — AIDE", "Liste complète des commandes :", COLORS.DEFAULT, [
            { name: "🛡️ Modération",        value: "`/ban` `/unban` `/kick` `/mute` `/unmute` `/warn` `/unwarn` `/clear` `/bl` `/unbl` `/slowmode` `/lock` `/unlock` `/give-role` `/remove-role`", inline: false },
            { name: "🤖 IA",                 value: "`/ask` `/mode` `/ia-channel` `/ia-reset` `/set-prompt`", inline: false },
            { name: "📈 XP",                 value: "`/rank` `/leaderboard` `/xp-give` `/profil`", inline: false },
            { name: "💰 Économie",            value: "`/balance` `/pay` `/daily` `/shop` `/buy` `/shop-add` `/shop-remove` `/coins-give` `/coins-remove`", inline: false },
            { name: "🎉 Giveaways",           value: "`/giveaway` `/giveaway-end` `/giveaway-reroll`", inline: false },
            { name: "📊 Sondages & Tickets",  value: "`/poll` `/ticket` `/ticket-close` `/ticket-add`", inline: false },
            { name: "💡 Suggestions",         value: "`/suggestion` `/setup-suggestions`", inline: false },
            { name: "⏰ Rappels",              value: "`/rappel`", inline: false },
            { name: "ℹ️ Infos",               value: "`/stats` `/history` `/userinfo` `/server-info` `/avatar` `/snipe` `/rapport`", inline: false },
            { name: "⚙️ Setup",               value: "`/setup-logs` `/setup-welcome` `/setup-staff` `/setup-tickets` `/setup-muted` `/setup-xp-role` `/setup-gif` `/setup-ai` `/setup-niveau-channel` `/setup-suggestions`", inline: false },
            { name: "📋 Divers",              value: "`/facture` `/announce` `/message` `/wl-start` `/embed-role` `/quests` `/add-quest` `/automod`", inline: false },
            { name: "🏖️ Absences",            value: "`/absent` `/absent-fin` `/absences`", inline: false },
            { name: "🔴 Blacklist Bot (Admin)",value: "`/bot-blacklist` `/bot-unblacklist` `/bot-blacklist-list` `/reset-user`", inline: false }
        ], null, null, { text: "Paradise Overlord V20 — Système Ultime" });
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== SETUP ========
    if (commandName === 'setup-logs') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.logs = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Logs : <#${config.logs}>.`);
    }
    if (commandName === 'setup-welcome') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.welcome = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Bienvenue : <#${config.welcome}>.`);
    }
    if (commandName === 'setup-blacklist') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.bl_chan = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Salon blacklist : <#${config.bl_chan}>.`);
    }
    if (commandName === 'setup-whitelist') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.wl_cat = options.getChannel('cat').id;
        await save();
        return interaction.editReply(`✅ Catégorie whitelist définie.`);
    }
    if (commandName === 'setup-staff') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.editReply("❌ Réservé aux admins.");
        config.staff_role = options.getRole('role').id;
        await save();
        return interaction.editReply(`✅ Rôle Staff : <@&${config.staff_role}>.`);
    }
    if (commandName === 'setup-tickets') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.ticket_cat = options.getChannel('cat').id;
        await save();
        return interaction.editReply(`✅ Catégorie tickets définie.`);
    }
    if (commandName === 'setup-muted') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.muted_role = options.getRole('role').id;
        await save();
        return interaction.editReply(`✅ Rôle Muted : <@&${config.muted_role}>.`);
    }
    if (commandName === 'setup-xp-role') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const niveau = options.getInteger('niveau');
        const role   = options.getRole('role');
        config.xp_roles[niveau] = role.id;
        await save();
        return interaction.editReply(`✅ Niveau **${niveau}** → <@&${role.id}>.`);
    }
    if (commandName === 'setup-gif') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const type = options.getString('type');
        const url  = options.getString('url');
        config.gifs[type] = url;
        await save();
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`✅ GIF ${type} mis à jour`).setImage(url).setColor(COLORS.SUCCESS)] });
    }
    if (commandName === 'setup-ai') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.ai_modes["normal"].prompt = options.getString('identite');
        await save();
        return interaction.editReply(`✅ Identité IA (mode Normal) mise à jour.`);
    }
    if (commandName === 'setup-niveau-channel') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.niveau_chan = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Salon d'annonces de niveau : <#${config.niveau_chan}>.`);
    }
    if (commandName === 'setup-suggestions') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.suggestion_chan = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Salon de suggestions : <#${config.suggestion_chan}>.`);
    }

    // ======== AUTOMOD ========
    if (commandName === 'automod') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const opt = options.getString('option');
        const val = options.getString('valeur') || '';
        if (opt === 'spam')     { config.automod.anti_spam  = !config.automod.anti_spam;  await save(); return interaction.editReply(`✅ Anti-spam : **${config.automod.anti_spam ? "ON" : "OFF"}**`); }
        if (opt === 'links')    { config.automod.anti_links = !config.automod.anti_links; await save(); return interaction.editReply(`✅ Anti-liens : **${config.automod.anti_links ? "ON" : "OFF"}**`); }
        if (opt === 'add_word') { if (!val) return interaction.editReply("❌ Précise le mot."); if (!config.automod.banned_words.includes(val.toLowerCase())) config.automod.banned_words.push(val.toLowerCase()); await save(); return interaction.editReply(`✅ Mot banni : **${val}**`); }
        if (opt === 'del_word') { config.automod.banned_words = config.automod.banned_words.filter(w => w !== val.toLowerCase()); await save(); return interaction.editReply(`✅ Mot retiré : **${val}**`); }
        if (opt === 'mentions') { const n = parseInt(val); if (isNaN(n)) return interaction.editReply("❌ Nombre invalide."); config.automod.max_mentions = n; await save(); return interaction.editReply(`✅ Max mentions : **${n}**`); }
    }

    // ======== BAN ========
    if (commandName === 'ban') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const reason = options.getString('raison');
        const silent = options.getBoolean('silent') || false;
        const td     = initUser(target.id);
        td.bans++;
        addModHistory(target.id, "BAN", reason, user.username);
        try {
            await guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
            await save();
            const embed = createEmbed("🔨 BAN", `**${target.username}** a été banni.`, COLORS.ERROR,
                [{ name: "Raison", value: reason }, { name: "Modérateur", value: user.username, inline: true }, { name: "Total bans", value: `${td.bans}`, inline: true }],
                silent ? null : config.gifs.ban);
            if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
            return interaction.editReply({ embeds: [embed] });
        } catch { return interaction.editReply("❌ Impossible de bannir."); }
    }

    // ======== UNBAN ========
    if (commandName === 'unban') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const userId = options.getString('userid');
        const reason = options.getString('raison') || "Aucune raison";
        try {
            await guild.members.unban(userId, reason);
            return interaction.editReply(`✅ Utilisateur **${userId}** débanni. Raison : ${reason}`);
        } catch { return interaction.editReply("❌ Impossible de débannir (ID invalide ou pas banni)."); }
    }

    // ======== KICK ========
    if (commandName === 'kick') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const reason = options.getString('raison');
        addModHistory(target.id, "KICK", reason, user.username);
        await target.send({ embeds: [new EmbedBuilder().setTitle("👢 Tu as été expulsé").setColor(COLORS.WARNING).addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: reason })] }).catch(() => {});
        await target.kick(reason).catch(() => {});
        const embed = createEmbed("👢 KICK", `**${target.user.username}** expulsé.`, COLORS.WARNING, [{ name: "Raison", value: reason }, { name: "Modérateur", value: user.username, inline: true }]);
        if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== MUTE ========
    if (commandName === 'mute') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target  = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const minutes = options.getInteger('minutes');
        const reason  = options.getString('raison');
        const td      = initUser(target.id);
        td.mutes++;
        addModHistory(target.id, `MUTE ${minutes}min`, reason, user.username);
        try {
            await target.timeout(minutes * 60000, reason);
            await save();
            const embed = createEmbed("🔇 MUTE", `**${target.user.username}** muté **${minutes} min**.`, COLORS.WARNING,
                [{ name: "Raison", value: reason }, { name: "Durée", value: `${minutes} min`, inline: true }, { name: "Modérateur", value: user.username, inline: true }], config.gifs.mute);
            if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
            return interaction.editReply({ embeds: [embed] });
        } catch { return interaction.editReply("❌ Impossible de muter."); }
    }

    // ======== UNMUTE ========
    if (commandName === 'unmute') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        await target.timeout(null).catch(() => {});
        return interaction.editReply(`✅ **${target.user.username}** unmute.`);
    }

    // ======== WARN ========
    if (commandName === 'warn') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const reason = options.getString('raison');
        const td     = initUser(target.id);
        td.warns++;
        if (!td.warnReasons) td.warnReasons = [];
        td.warnReasons.push({ reason, by: user.username, at: new Date().toLocaleDateString('fr-FR') });
        addModHistory(target.id, "WARN", reason, user.username);
        await save();
        await target.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Avertissement").setColor(COLORS.WARNING).addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: reason })] }).catch(() => {});
        const embed = createEmbed("⚠️ WARN", `**${target.user.username}** averti.`, COLORS.WARNING,
            [{ name: "Raison", value: reason }, { name: "Total warns", value: `${td.warns}`, inline: true }, { name: "Modérateur", value: user.username, inline: true }], config.gifs.warn);
        if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== UNWARN ========
    if (commandName === 'unwarn') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const td = initUser(target.id);
        if (td.warns <= 0) return interaction.editReply("❌ Aucun avertissement.");
        td.warns--;
        if (td.warnReasons?.length > 0) td.warnReasons.pop();
        await save();
        return interaction.editReply(`✅ Dernier warn retiré de **${target.user.username}**. Total : **${td.warns}**.`);
    }

    // ======== CLEAR ========
    if (commandName === 'clear') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const nombre     = options.getInteger('nombre');
        const filterUser = options.getUser('utilisateur');
        try {
            let messages = await channel.messages.fetch({ limit: 100 });
            if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);
            const toDelete = [...messages.values()].slice(0, nombre);
            const deleted  = await channel.bulkDelete(toDelete, true);
            return interaction.editReply(`✅ **${deleted.size}** message(s) supprimé(s).`);
        } catch { return interaction.editReply("❌ Erreur (messages > 14 jours non supportés)."); }
    }

    // ======== BL ========
    if (commandName === 'bl') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const reason = options.getString('raison');
        const td     = initUser(target.id);
        td.blacklisted = true;
        addModHistory(target.id, "BLACKLIST", reason, user.username);
        await save();
        if (config.bl_chan) {
            const blChan = guild.channels.cache.get(config.bl_chan);
            if (blChan) {
                const roles = target.roles.cache.filter(r => r.id !== guild.roles.everyone.id);
                for (const [, role] of roles) await target.roles.remove(role).catch(() => {});
                await blChan.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: false }).catch(() => {});
            }
        }
        const embed = createEmbed("🚫 BLACKLIST", `**${target.user.username}** blacklisté.`, COLORS.ERROR,
            [{ name: "Raison", value: reason }, { name: "Modérateur", value: user.username, inline: true }], config.gifs.bl);
        if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== UNBL ========
    if (commandName === 'unbl') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const td = initUser(target.id);
        td.blacklisted = false;
        await save();
        if (config.bl_chan) {
            const blChan = guild.channels.cache.get(config.bl_chan);
            if (blChan) await blChan.permissionOverwrites.delete(target.id).catch(() => {});
        }
        return interaction.editReply(`✅ **${target.user.username}** retiré de la blacklist.`);
    }

    // ======== SLOWMODE ========
    if (commandName === 'slowmode') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const sec = options.getInteger('secondes');
        await channel.setRateLimitPerUser(sec).catch(() => {});
        return interaction.editReply(sec === 0 ? "✅ Slowmode désactivé." : `✅ Slowmode : **${sec}s**.`);
    }

    // ======== LOCK / UNLOCK ========
    if (commandName === 'lock') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
        return interaction.editReply("🔒 Salon verrouillé.");
    }
    if (commandName === 'unlock') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
        return interaction.editReply("🔓 Salon déverrouillé.");
    }

    // ======== GIVE-ROLE ========
    if (commandName === 'give-role') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const role   = options.getRole('role');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        await target.roles.add(role).catch(() => {});
        return interaction.editReply(`✅ Rôle <@&${role.id}> donné à ${target}.`);
    }

    // ======== REMOVE-ROLE ========
    if (commandName === 'remove-role') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const role   = options.getRole('role');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        await target.roles.remove(role).catch(() => {});
        return interaction.editReply(`✅ Rôle <@&${role.id}> retiré de ${target}.`);
    }

    // ======== RANK ========
    if (commandName === 'rank') {
        const target   = options.getUser('utilisateur') || user;
        const td       = initUser(target.id);
        const needed   = calcXPforLevel(td.level + 1);
        const bar      = xpBar(td.xp % needed || td.xp, needed);
        const allUsers = Object.entries(db.users).sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));
        const rankPos  = allUsers.findIndex(([uid]) => uid === target.id) + 1;

        const embed = createEmbed(
            `🏅 RANG — ${target.username.toUpperCase()}`,
            `Statistiques de ${target}`,
            COLORS.PURPLE,
            [
                { name: "🏆 Niveau",    value: `${td.level}`,         inline: true },
                { name: "📊 Classement", value: `#${rankPos}`,         inline: true },
                { name: "💎 Coins",      value: `${td.coins}`,         inline: true },
                { name: "✨ XP",         value: `${td.xp} / ${needed}`, inline: false },
                { name: "📈 Progression", value: bar,                   inline: false },
                { name: "🔥 Streak Daily", value: `${td.dailyStreak || 0} jours`, inline: true },
                { name: "🏅 Badges",      value: td.badges?.join(" ") || "Aucun", inline: false }
            ],
            null,
            target.displayAvatarURL()
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== PROFIL ========
    if (commandName === 'profil') {
        const target   = options.getUser('utilisateur') || user;
        const td       = initUser(target.id);
        const needed   = calcXPforLevel(td.level + 1);
        const bar      = xpBar(td.xp % needed || td.xp, needed);
        const allUsers = Object.entries(db.users).sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));
        const rankPos  = allUsers.findIndex(([uid]) => uid === target.id) + 1;
        const tm       = guild.members.cache.get(target.id);
        const roles    = tm ? tm.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => `<@&${r.id}>`).slice(0, 5).join(", ") || "Aucun" : "Inconnu";

        const embed = createEmbed(
            `🪪 PROFIL — ${target.username.toUpperCase()}`,
            `Carte profil complète de ${target}`,
            COLORS.DEFAULT,
            [
                { name: "🏆 Niveau",         value: `${td.level}`,                  inline: true  },
                { name: "📊 Classement",      value: `#${rankPos}`,                  inline: true  },
                { name: "💎 Coins",            value: `${td.coins}`,                  inline: true  },
                { name: "✨ XP Total",         value: `${td.xp}`,                     inline: true  },
                { name: "📈 Progression",      value: bar,                             inline: false },
                { name: "🔥 Streak Daily",     value: `${td.dailyStreak || 0} jours`, inline: true  },
                { name: "⚠️ Warns",            value: `${td.warns}`,                  inline: true  },
                { name: "🔨 Bans",             value: `${td.bans}`,                   inline: true  },
                { name: "🎒 Inventaire",       value: td.inventory?.length > 0 ? td.inventory.join(", ") : "Vide", inline: false },
                { name: "🏅 Badges",           value: td.badges?.join(" ") || "Aucun", inline: false },
                { name: "🎭 Rôles (5 premiers)", value: roles,                         inline: false },
                { name: "📅 A rejoint Discord", value: tm ? time(Math.floor(target.createdTimestamp / 1000), "D") : "Inconnu", inline: true }
            ],
            null,
            target.displayAvatarURL(),
            { text: `ID : ${target.id}` }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== LEADERBOARD ========
    if (commandName === 'leaderboard') {
        return interaction.editReply({ embeds: [getLeaderboard(guild)] });
    }

    // ======== XP-GIVE ========
    if (commandName === 'xp-give') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target  = options.getUser('cible');
        const montant = options.getInteger('montant');
        const td      = initUser(target.id);
        td.xp += montant;
        await save();
        return interaction.editReply(`✅ **${montant} XP** ajoutés à ${target}. Total : **${td.xp}**.`);
    }

    // ======== BALANCE ========
    if (commandName === 'balance') {
        const target = options.getUser('utilisateur') || user;
        const td     = initUser(target.id);
        const embed  = createEmbed(`💰 SOLDE — ${target.username.toUpperCase()}`, `Infos de ${target}`, COLORS.INFO,
            [
                { name: "💎 Coins",       value: `${td.coins}`,    inline: true },
                { name: "🏅 Niveau",      value: `${td.level}`,    inline: true },
                { name: "🔥 Streak",       value: `${td.dailyStreak || 0}j`, inline: true },
                { name: "🎒 Inventaire",   value: td.inventory?.length > 0 ? td.inventory.join(", ") : "Vide", inline: false }
            ], null, target.displayAvatarURL(), { text: "Utilise /daily pour ta récompense quotidienne !" });
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== PAY ========
    if (commandName === 'pay') {
        const target  = options.getUser('cible');
        const montant = options.getInteger('montant');
        const raison  = options.getString('raison') || "Aucune raison";
        if (target.id === user.id) return interaction.editReply("❌ Tu ne peux pas te payer toi-même.");
        const sd = initUser(user.id);
        if (sd.coins < montant) return interaction.editReply(`❌ Solde insuffisant. Tu as **${sd.coins} 💎**.`);
        const td = initUser(target.id);
        sd.coins -= montant;
        td.coins += montant;
        await save();
        return interaction.editReply(`✅ **${montant} 💎** transférés à ${target}. Raison : ${raison}. Ton solde : **${sd.coins} 💎**.`);
    }

    // ======== DAILY ========
    if (commandName === 'daily') {
        return interaction.editReply(await claimDaily(user.id, guild.id));
    }

    // ======== SHOP ========
    if (commandName === 'shop') {
        const items = Object.entries(config.shop);
        if (items.length === 0) return interaction.editReply("🏪 La boutique est vide.");
        const embed = createEmbed("🏪 BOUTIQUE", "Articles disponibles :", COLORS.PURPLE,
            items.map(([name, item]) => ({ name: `**${name}** — ${item.price} 💎`, value: `${item.description || "Aucune description"}\n→ <@&${item.roleId}>`, inline: false })),
            config.gifs.shop, null, { text: "/buy <article> pour acheter" });
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== BUY ========
    if (commandName === 'buy') {
        return interaction.editReply(await buyItem(user.id, options.getString('article'), guild.id, member));
    }

    // ======== SHOP-ADD ========
    if (commandName === 'shop-add') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const nom         = options.getString('nom');
        const prix        = options.getInteger('prix');
        const role        = options.getRole('role');
        const description = options.getString('description') || "Aucune description.";
        config.shop[nom]  = { price: prix, roleId: role.id, description };
        await save();
        return interaction.editReply(`✅ Article **${nom}** ajouté (${prix} 💎, <@&${role.id}>).`);
    }

    // ======== SHOP-REMOVE ========
    if (commandName === 'shop-remove') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const nom = options.getString('nom');
        if (!config.shop[nom]) return interaction.editReply(`❌ Article **${nom}** introuvable.`);
        delete config.shop[nom];
        await save();
        return interaction.editReply(`✅ Article **${nom}** retiré.`);
    }

    // ======== COINS-GIVE ========
    if (commandName === 'coins-give') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target  = options.getUser('cible');
        const montant = options.getInteger('montant');
        const td      = initUser(target.id);
        td.coins += montant;
        await save();
        return interaction.editReply(`✅ **${montant} 💎** donnés à ${target}. Solde : **${td.coins} 💎**.`);
    }

    // ======== COINS-REMOVE ========
    if (commandName === 'coins-remove') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target  = options.getUser('cible');
        const montant = options.getInteger('montant');
        const td      = initUser(target.id);
        td.coins = Math.max(0, td.coins - montant);
        await save();
        return interaction.editReply(`✅ **${montant} 💎** retirés à ${target}. Solde restant : **${td.coins} 💎**.`);
    }

    // ======== GIVEAWAY ========
    if (commandName === 'giveaway') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const prize         = options.getString('prix');
        const duration      = options.getInteger('duree');
        const winnersCount  = options.getInteger('gagnants');
        const targetChannel = options.getChannel('salon') || channel;
        const endTime       = Date.now() + duration * 60000;

        const embed = new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY !").setColor(COLORS.GOLD)
            .addFields(
                { name: "🏆 Prix",         value: prize },
                { name: "👑 Gagnants",      value: `${winnersCount}` },
                { name: "⏰ Fin",            value: `<t:${Math.floor(endTime / 1000)}:R>` },
                { name: "🚀 Organisateur",  value: `${user}` }
            )
            .setFooter({ text: "Clique pour participer !" })
            .setImage(config.gifs.giveaway)
            .setTimestamp(new Date(endTime));

        const msg = await targetChannel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ga_join_${Date.now()}`).setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
            )]
        });

        db.giveaways[msg.id] = { prize, endTime, channelId: targetChannel.id, winnersCount, participants: [], ended: false, guildId: guild.id };
        await save();
        return interaction.editReply(`✅ Giveaway créé dans <#${targetChannel.id}> !`);
    }

    // ======== GIVEAWAY-END ========
    if (commandName === 'giveaway-end') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const msgId = options.getString('message_id');
        if (!db.giveaways[msgId]) return interaction.editReply("❌ Giveaway introuvable.");
        await endGiveaway(msgId, guild.id);
        return interaction.editReply("✅ Giveaway terminé !");
    }

    // ======== GIVEAWAY-REROLL ========
    if (commandName === 'giveaway-reroll') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const msgId = options.getString('message_id');
        if (!db.giveaways[msgId]) return interaction.editReply("❌ Giveaway introuvable.");
        await endGiveaway(msgId, guild.id, true);
        return interaction.editReply("✅ Reroll effectué !");
    }

    // ======== POLL ========
    if (commandName === 'poll') {
        const question    = options.getString('question');
        const pollOptions = [options.getString('option1'), options.getString('option2'), options.getString('option3'), options.getString('option4')].filter(Boolean);
        const emojis      = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
        const pollId      = Date.now().toString();

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${question}`).setColor(COLORS.INFO)
            .setDescription(pollOptions.map((opt, idx) => `**${emojis[idx]} ${opt}**\n\`${"░".repeat(10)}\` 0% (0)`).join("\n\n"))
            .setFooter({ text: "Clique pour voter" }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            pollOptions.map((opt, idx) => new ButtonBuilder().setCustomId(`poll_${pollId}_${idx}`).setLabel(`${emojis[idx]} ${opt.slice(0, 20)}`).setStyle(ButtonStyle.Secondary))
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });
        db.polls[pollId] = { question, options: pollOptions, votes: {}, channelId: channel.id, guildId: guild.id, messageId: msg.id };
        await save();
        return;
    }

    // ======== TICKET ========
    if (commandName === 'ticket')       return createTicket(guild, user, interaction);
    if (commandName === 'ticket-close') return closeTicket(channel.id, guild, member, interaction);

    // ======== TICKET-ADD ========
    if (commandName === 'ticket-add') {
        const ticket = db.tickets[channel.id];
        if (!ticket) return interaction.editReply("❌ Ce salon n'est pas un ticket.");
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
        return interaction.editReply(`✅ ${target} ajouté au ticket.`);
    }

    // ======== ASK ========
    if (commandName === 'ask') {
        const question = options.getString('question');
        await interaction.editReply("🤖 Analyse en cours...");
        const response = await askMistral(question, guild.id, channel.id);
        return interaction.editReply(`**🤖 IA (${config.ai_modes[config.ai_current_mode]?.name || "Normal"}) :**\n${response}`);
    }

    // ======== MODE ========
    if (commandName === 'mode') return interaction.editReply(changeAIMode(guild.id, options.getString('mode')));

    // ======== IA-CHANNEL ========
    if (commandName === 'ia-channel') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const ch       = options.getChannel('salon');
        const activate = options.getBoolean('activer');
        return interaction.editReply(toggleIAChannel(ch.id, guild.id, activate));
    }

    // ======== IA-RESET ========
    if (commandName === 'ia-reset') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const ch = options.getChannel('salon') || channel;
        delete db.ia_history[ch.id];
        await save();
        return interaction.editReply(`✅ Mémoire IA du salon <#${ch.id}> réinitialisée.`);
    }

    // ======== SET-PROMPT ========
    if (commandName === 'set-prompt') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin du bot.");
        return interaction.editReply(changeAIPrompt(guild.id, options.getString('mode'), options.getString('prompt')));
    }

    // ======== SNIPE ========
    if (commandName === 'snipe') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Réservé au staff.");
        const snipeData = db.snipe[channel.id];
        if (!snipeData) return interaction.editReply("❌ Aucun message supprimé récemment dans ce salon.");
        const embed = createEmbed(
            "👻 DERNIER MESSAGE SUPPRIMÉ",
            snipeData.content || "*[Aucun contenu textuel]*",
            COLORS.WARNING,
            [
                { name: "✍️ Auteur",    value: snipeData.author,   inline: true },
                { name: "🕐 Supprimé", value: snipeData.deletedAt, inline: true }
            ],
            null,
            snipeData.authorAvatar
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== SUGGESTION ========
    if (commandName === 'suggestion') {
        const texte = options.getString('texte');
        if (!config.suggestion_chan) return interaction.editReply("❌ Salon de suggestions non configuré. Utilise `/setup-suggestions`.");

        const sugChan = guild.channels.cache.get(config.suggestion_chan);
        if (!sugChan)  return interaction.editReply("❌ Salon de suggestions introuvable.");

        const embed = new EmbedBuilder()
            .setTitle("💡 SUGGESTION")
            .setDescription(texte)
            .setColor(COLORS.INFO)
            .addFields(
                { name: "👍 Pour",    value: "0", inline: true },
                { name: "👎 Contre", value: "0", inline: true }
            )
            .setFooter({ text: `Par ${user.username}` })
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        const msg = await sugChan.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`suggestion_up_PLACEHOLDER`).setLabel("👍 Pour").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`suggestion_down_PLACEHOLDER`).setLabel("👎 Contre").setStyle(ButtonStyle.Danger)
            )]
        });

        // Mettre à jour les IDs des boutons avec le vrai messageId
        await msg.edit({
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`suggestion_up_${msg.id}`).setLabel("👍 Pour").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`suggestion_down_${msg.id}`).setLabel("👎 Contre").setStyle(ButtonStyle.Danger)
            )]
        }).catch(() => {});

        db.suggestions[msg.id] = { authorId: user.id, authorName: user.username, content: texte, up: 0, down: 0, voters: {} };
        await save();
        return interaction.editReply(`✅ Suggestion envoyée dans <#${config.suggestion_chan}> !`);
    }

    // ======== RAPPEL ========
    if (commandName === 'rappel') {
        const message = options.getString('message');
        const minutes = options.getInteger('minutes') || 0;
        const heures  = options.getInteger('heures')  || 0;
        const total   = (minutes + heures * 60);
        if (total <= 0) return interaction.editReply("❌ Précise une durée (minutes et/ou heures).");

        if (!db.rappels) db.rappels = [];
        db.rappels.push({
            userId:    user.id,
            guildId:   guild.id,
            channelId: channel.id,
            message,
            triggerAt: Date.now() + total * 60000,
            createdAt: new Date().toLocaleString('fr-FR')
        });
        await save();
        return interaction.editReply(`⏰ Rappel créé ! Je t'enverrai un DM dans **${heures > 0 ? `${heures}h ` : ""}${minutes > 0 ? `${minutes}min` : ""}** pour : *${message}*`);
    }

    // ======== EMBED-ROLE ========
    if (commandName === 'embed-role') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const role        = options.getRole('role');
        const titre       = options.getString('titre');
        const description = options.getString('description');
        const label       = options.getString('label') || `Obtenir @${role.name}`;

        const embed = new EmbedBuilder()
            .setTitle(titre).setDescription(description)
            .setColor(role.color || COLORS.DEFAULT)
            .setFooter({ text: "Clique pour obtenir/retirer le rôle" });

        await channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`role_give_${role.id}`).setLabel(label).setStyle(ButtonStyle.Primary)
            )]
        });
        return interaction.editReply(`✅ Embed-rôle créé pour <@&${role.id}> !`);
    }

    // ======== FACTURE ========
    if (commandName === 'facture') {
        const clientUser = options.getUser('client');
        const ht         = options.getNumber('montant');
        const objet      = options.getString('objet');
        const numero     = options.getString('numero') || `FAC-${Date.now()}`;
        const tva        = ht * 0.20;
        const ttc        = ht + tva;
        const embed = createEmbed(
            `🧾 FACTURE ${numero}`,
            `Générée par **${user.username}** pour **${clientUser.username}**`,
            COLORS.DEFAULT,
            [
                { name: "📋 Objet",      value: objet,                  inline: false },
                { name: "💰 HT",         value: `${ht.toFixed(2)} €`,   inline: true  },
                { name: "🧮 TVA 20%",    value: `${tva.toFixed(2)} €`,  inline: true  },
                { name: "💳 TTC",        value: `**${ttc.toFixed(2)} €**`, inline: true },
                { name: "📅 Date",       value: new Date().toLocaleDateString('fr-FR'), inline: true },
                { name: "👤 Client",     value: `${clientUser}`,        inline: true  }
            ],
            config.gifs.facture, null, { text: `Facture #${numero}` }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== WL-START ========
    if (commandName === 'wl-start') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        if (!config.wl_cat) return interaction.editReply("❌ Catégorie whitelist non configurée.");
        try {
            const wlChannel = await guild.channels.create({
                name: `wl-${target.user.username}`,
                type: ChannelType.GuildText,
                parent: config.wl_cat,
                permissionOverwrites: [
                    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: target.id,            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ...(config.staff_role ? [{ id: config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
                ]
            });
            await wlChannel.send({
                content: `${target} Bienvenue dans ton salon de recrutement !`,
                embeds: [createEmbed("📝 RECRUTEMENT STAFF", `Salon pour **${target.user.username}**.`, COLORS.INFO,
                    [{ name: "Candidat", value: `${target}`, inline: true }, { name: "Évalué par", value: `${user}`, inline: true }])]
            });
            return interaction.editReply(`✅ Salon de recrutement : <#${wlChannel.id}>.`);
        } catch { return interaction.editReply("❌ Erreur lors de la création."); }
    }

    // ======== ANNOUNCE ========
    if (commandName === 'announce') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const texte         = options.getString('texte');
        const targetChannel = options.getChannel('salon');
        const titre         = options.getString('titre') || "📢 Annonce";
        const couleur       = options.getString('couleur') || COLORS.DEFAULT;
        const embed = new EmbedBuilder().setTitle(titre).setDescription(texte)
            .setColor(couleur.startsWith('#') ? couleur : `#${couleur}`)
            .setFooter({ text: `Annonce par ${user.username}` }).setTimestamp();
        await targetChannel.send({ embeds: [embed] }).catch(() => {});
        return interaction.editReply(`✅ Annonce envoyée dans <#${targetChannel.id}>.`);
    }

    // ======== MESSAGE (MODAL) ========
    if (commandName === 'message') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.\n*(Note : la commande /message utilise un modal, assure-toi de ne pas avoir déféré avant)*");
    }

    // ======== STATS ========
    if (commandName === 'stats') {
        const target = options.getUser('cible') || user;
        const td     = initUser(target.id);
        const embed  = createEmbed(
            `📊 CASIER — ${target.username.toUpperCase()}`,
            `Modération de ${target}`,
            COLORS.WARNING,
            [
                { name: "🔨 Bans",      value: `${td.bans}`,   inline: true },
                { name: "🔇 Mutes",     value: `${td.mutes}`,  inline: true },
                { name: "⚠️ Warns",     value: `${td.warns}`,  inline: true },
                { name: "🚫 Blacklisté", value: td.blacklisted ? "Oui" : "Non", inline: true },
                {
                    name: "📋 Raisons warns",
                    value: td.warnReasons?.length > 0
                        ? td.warnReasons.map((w, i) => `${i + 1}. ${w.reason} (par ${w.by} — ${w.at})`).join("\n").slice(0, 1024)
                        : "Aucune",
                    inline: false
                }
            ],
            null, target.displayAvatarURL()
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== HISTORY ========
    if (commandName === 'history') {
        const target = options.getUser('cible');
        const td     = initUser(target.id);
        const hist   = td.modHistory || [];
        const embed  = createEmbed(
            `📋 HISTORIQUE — ${target.username.toUpperCase()}`,
            hist.length > 0
                ? hist.map((h, i) => `\`${i + 1}.\` **${h.action}** — ${h.reason}\n*par ${h.by} — ${h.at}*`).join("\n\n").slice(0, 4096)
                : "Aucun historique de modération.",
            COLORS.INFO,
            [], null, target.displayAvatarURL()
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== USERINFO ========
    if (commandName === 'userinfo') {
        const target = options.getMember('cible') || member;
        const roles  = target.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => `<@&${r.id}>`).join(", ") || "Aucun";
        const embed  = createEmbed(`👤 ${target.user.username}`, `Infos de ${target.user.username}`, COLORS.INFO,
            [
                { name: "🆔 ID",          value: target.id,     inline: true },
                { name: "📛 Pseudo",       value: target.displayName, inline: true },
                { name: "🤖 Bot",          value: target.user.bot ? "Oui" : "Non", inline: true },
                { name: "📅 Compte créé", value: time(Math.floor(target.user.createdTimestamp / 1000), "D"), inline: true },
                { name: "📥 Rejoint le",  value: time(Math.floor(target.joinedTimestamp / 1000), "D"), inline: true },
                { name: "🎭 Rôles",       value: roles.length > 1024 ? roles.slice(0, 1020) + "..." : roles }
            ], null, target.user.displayAvatarURL());
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== SERVER-INFO ========
    if (commandName === 'server-info') {
        const g     = guild;
        const embed = createEmbed(`ℹ️ ${g.name}`, "Informations sur le serveur", COLORS.INFO,
            [
                { name: "👑 Propriétaire", value: `<@${g.ownerId}>`,      inline: true },
                { name: "👥 Membres",      value: `${g.memberCount}`,     inline: true },
                { name: "📅 Créé le",      value: time(Math.floor(g.createdTimestamp / 1000), "D"), inline: true },
                { name: "💬 Salons",       value: `${g.channels.cache.size}`, inline: true },
                { name: "🎭 Rôles",        value: `${g.roles.cache.size}`,    inline: true },
                { name: "😀 Emojis",       value: `${g.emojis.cache.size}`,   inline: true },
                { name: "🆙 Boosts",       value: `${g.premiumSubscriptionCount || 0}`, inline: true }
            ], null, g.iconURL());
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== AVATAR ========
    if (commandName === 'avatar') {
        const target = options.getUser('cible') || user;
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${target.username}`).setImage(target.displayAvatarURL({ size: 512 })).setColor(COLORS.INFO)] });
    }

    // ======== RAPPORT ========
    if (commandName === 'rapport') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin.");
        const totalUsers  = Object.keys(db.users).length;
        const totalCoins  = Object.values(db.users).reduce((s, u) => s + (u.coins || 0), 0);
        const totalXP     = Object.values(db.users).reduce((s, u) => s + (u.xp   || 0), 0);
        const topUser     = Object.entries(db.users).sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))[0];
        const totalBans   = Object.values(db.users).reduce((s, u) => s + (u.bans  || 0), 0);
        const totalWarns  = Object.values(db.users).reduce((s, u) => s + (u.warns || 0), 0);
        const blCount     = Object.keys(db.global_blacklist || {}).length;
        const ticketCount = Object.keys(db.tickets).length;

        const embed = createEmbed(
            "📈 RAPPORT DU BOT",
            `Statistiques globales — **${new Date().toLocaleDateString('fr-FR')}**`,
            COLORS.DEFAULT,
            [
                { name: "👥 Utilisateurs enregistrés", value: `${totalUsers}`, inline: true },
                { name: "💎 Coins en circulation",      value: `${totalCoins}`, inline: true },
                { name: "✨ XP total distribué",        value: `${totalXP}`,    inline: true },
                { name: "🔨 Bans totaux",               value: `${totalBans}`,  inline: true },
                { name: "⚠️ Warns totaux",              value: `${totalWarns}`, inline: true },
                { name: "🎫 Tickets créés",             value: `${ticketCount}`, inline: true },
                { name: "🔴 Blacklist globale",         value: `${blCount}`,    inline: true },
                { name: "🏆 Top XP",                    value: topUser ? `<@${topUser[0]}> (${topUser[1].xp} XP)` : "N/A", inline: false }
            ]
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== QUESTS ========
    if (commandName === 'quests') {
        const td     = initUser(user.id);
        const quests = Object.entries(config.quests).map(([id, quest]) => ({
            name:  `${td.quests?.[`${id}_completed`] ? "✅" : "❌"} ${quest.name}`,
            value: `${quest.description}\n**Récompense** : ${quest.reward} 💎`,
            inline: false
        }));
        return interaction.editReply({ embeds: [createEmbed("🏆 TES QUÊTES", "Progression :", COLORS.GOLD, quests)] });
    }

    // ======== ADD-QUEST ========
    if (commandName === 'add-quest') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin.");
        const name        = options.getString('nom');
        const description = options.getString('description');
        const reward      = options.getInteger('recompense');
        config.quests[`custom_${Date.now()}`] = { name, description, reward };
        await save();
        return interaction.editReply(`✅ Quête **${name}** ajoutée (${reward} 💎).`);
    }

    // ======== ABSENT ========
    if (commandName === 'absent') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Réservé au staff.");
        const raison        = options.getString('raison');
        const debut         = options.getString('debut');
        const fin           = options.getString('fin');
        const targetChannel = options.getChannel('salon');
        if (!db.absences) db.absences = {};
        db.absences[user.id] = { raison, debut, fin, username: user.username, avatar: user.displayAvatarURL(), depuis: Date.now() };
        await save();
        const embed = createEmbed("🏖️ ABSENCE DÉCLARÉE", `**${user.username}** sera absent(e).`, COLORS.WARNING,
            [{ name: "📋 Raison", value: raison }, { name: "📅 Début", value: debut, inline: true }, { name: "🔙 Retour", value: fin, inline: true }],
            null, user.displayAvatarURL(), { text: "Utilise /absent-fin pour déclarer ton retour" });
        if (targetChannel) await targetChannel.send({ embeds: [embed] }).catch(() => {});
        if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== ABSENT-FIN ========
    if (commandName === 'absent-fin') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Réservé au staff.");
        if (!db.absences) db.absences = {};
        const absence = db.absences[user.id];
        if (!absence) return interaction.editReply("❌ Tu n'as pas d'absence déclarée.");
        const targetChannel = options.getChannel('salon');
        const embed = createEmbed("✅ RETOUR D'ABSENCE", `**${user.username}** est de retour !`, COLORS.SUCCESS,
            [{ name: "📋 Raison", value: absence.raison }, { name: "📅 Période", value: `Du **${absence.debut}** au **${absence.fin}**` }],
            null, user.displayAvatarURL());
        delete db.absences[user.id];
        await save();
        if (targetChannel) await targetChannel.send({ embeds: [embed] }).catch(() => {});
        if (config.logs) { const lc = guild.channels.cache.get(config.logs); if (lc) await lc.send({ embeds: [embed] }).catch(() => {}); }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== ABSENCES ========
    if (commandName === 'absences') {
        if (!db.absences) db.absences = {};
        const list = Object.entries(db.absences);
        if (list.length === 0) return interaction.editReply("✅ Aucune absence en cours.");
        const fields = list.map(([uid, abs]) => ({
            name:  `👤 ${abs.username || uid}`,
            value: `📋 ${abs.raison}\n📅 Du **${abs.debut}** au **${abs.fin}**`,
            inline: false
        }));
        return interaction.editReply({ embeds: [createEmbed("📋 ABSENCES DU STAFF", `${list.length} absence(s) :`, COLORS.WARNING, fields)] });
    }

    // ======== BOT-BLACKLIST ========
    if (commandName === 'bot-blacklist') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin du bot.");
        const target = options.getUser('cible');
        const raison = options.getString('raison');
        if (target.id === user.id || target.id === ADMIN_ID) return interaction.editReply("❌ Impossible.");
        if (!db.global_blacklist) db.global_blacklist = {};
        db.global_blacklist[target.id] = { reason: raison, by: user.username, at: new Date().toLocaleDateString('fr-FR') };
        await save();
        await target.send({ embeds: [createEmbed("🔴 BLACKLIST GLOBALE", `Tu as été blacklisté(e) de **Paradise Overlord V20** sur tous les serveurs.`, COLORS.ERROR, [{ name: "📋 Raison", value: raison }])] }).catch(() => {});
        return interaction.editReply({ embeds: [createEmbed("🔴 BLACKLIST AJOUTÉE", `**${target.username}** blacklisté(e) du bot entier.`, COLORS.ERROR,
            [{ name: "📋 Raison", value: raison }, { name: "🆔 ID", value: target.id, inline: true }], null, target.displayAvatarURL())] });
    }

    // ======== BOT-UNBLACKLIST ========
    if (commandName === 'bot-unblacklist') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin.");
        const target = options.getUser('cible');
        if (!db.global_blacklist?.[target.id]) return interaction.editReply(`❌ **${target.username}** n'est pas blacklisté globalement.`);
        delete db.global_blacklist[target.id];
        await save();
        await target.send({ embeds: [createEmbed("🟢 BLACKLIST RETIRÉE", "Tu peux de nouveau utiliser **Paradise Overlord V20**.", COLORS.SUCCESS)] }).catch(() => {});
        return interaction.editReply(`✅ **${target.username}** retiré de la blacklist globale.`);
    }

    // ======== BOT-BLACKLIST-LIST ========
    if (commandName === 'bot-blacklist-list') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin.");
        if (!db.global_blacklist) db.global_blacklist = {};
        const list = Object.entries(db.global_blacklist);
        if (list.length === 0) return interaction.editReply("✅ Aucun utilisateur blacklisté.");
        const fields = list.map(([uid, data]) => ({ name: `Blacklisté par ${data.by}`, value: `<@${uid}> — ${data.reason}\n📅 ${data.at}`, inline: false }));
        return interaction.editReply({ embeds: [createEmbed("🔴 BLACKLIST GLOBALE", `${list.length} utilisateur(s) :`, COLORS.ERROR, fields)] });
    }

    // ======== RESET-USER ========
    if (commandName === 'reset-user') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin.");
        const target = options.getUser('cible');
        const tout   = options.getBoolean('tout') || false;
        if (tout) {
            delete db.users[target.id];
        } else {
            const td = initUser(target.id);
            td.xp = 0; td.level = 0; td.coins = 100; td.inventory = []; td.dailyStreak = 0; td.lastDaily = 0; td.quests = {}; td.badges = [];
        }
        await save();
        return interaction.editReply(`✅ Profil de **${target.username}** réinitialisé ${tout ? "(complet, modération incluse)" : "(XP, coins, quêtes)"}.`);
    }
});

// ========== 15. MESSAGES ==========
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;

    // Salon IA actif
    if (db.ia_channels[message.channelId]) {
        try {
            await message.channel.sendTyping();
            const response = await askMistral(message.content, message.guild.id, message.channelId);
            await message.reply({ content: response, allowedMentions: { parse: [] } });
        } catch { await message.reply("⚠️ Erreur IA.").catch(() => {}); }
        return;
    }

    await addXP(message.author.id, message.guild.id);
    await automod(message);
});

// ========== 16. ÉVÉNEMENTS ==========

// Snipe — sauvegarder le message supprimé
client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;

    // Snipe
    if (message.content) {
        db.snipe[message.channelId] = {
            content:     message.content.slice(0, 1024),
            author:      message.author?.username || "Inconnu",
            authorAvatar: message.author?.displayAvatarURL() || null,
            deletedAt:   new Date().toLocaleString('fr-FR')
        };
    }

    // Log
    const config = initConfig(message.guild.id);
    if (!config.logs) return;
    const lc = message.guild.channels.cache.get(config.logs);
    if (!lc) return;
    const embed = createEmbed("🗑️ MESSAGE SUPPRIMÉ", `Supprimé dans ${message.channel}`, COLORS.ERROR,
        [
            { name: "Auteur",  value: message.author?.username || "Inconnu", inline: true },
            { name: "Salon",   value: message.channel.toString(), inline: true },
            { name: "Contenu", value: message.content?.slice(0, 1024) || "Aucun contenu texte" }
        ]);
    await lc.send({ embeds: [embed] }).catch(() => {});
});

// Log des messages modifiés
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const config = initConfig(newMessage.guild.id);
    if (!config.logs) return;
    const lc = newMessage.guild.channels.cache.get(config.logs);
    if (!lc) return;

    const embed = createEmbed("✏️ MESSAGE MODIFIÉ", `Message modifié dans ${newMessage.channel}`, COLORS.WARNING,
        [
            { name: "Auteur",    value: newMessage.author?.username || "Inconnu", inline: true },
            { name: "Salon",     value: newMessage.channel.toString(), inline: true },
            { name: "Avant",     value: (oldMessage.content?.slice(0, 512) || "Inconnu") },
            { name: "Après",     value: (newMessage.content?.slice(0, 512) || "Inconnu") }
        ]
    );
    await lc.send({ embeds: [embed] }).catch(() => {});
});

client.on(Events.GuildMemberAdd, async member => {
    const config = initConfig(member.guild.id);
    initUser(member.id);
    await save();

    if (config.welcome) {
        const ch = member.guild.channels.cache.get(config.welcome);
        if (ch) {
            const embed = createEmbed(
                `👋 Bienvenue, ${member.user.username} !`,
                `Bienvenue sur **${member.guild.name}** ! Tu es le membre **#${member.guild.memberCount}**.`,
                COLORS.SUCCESS, [], config.gifs.welcome, member.user.displayAvatarURL(), { text: "Lis les règles et amuse-toi !" }
            );
            await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
        }
    }

    if (config.logs) {
        const lc = member.guild.channels.cache.get(config.logs);
        if (lc) {
            await lc.send({ embeds: [createEmbed("📥 NOUVEAU MEMBRE", "Un nouveau membre a rejoint.", COLORS.SUCCESS,
                [
                    { name: "Membre",        value: `${member.user.username} (${member.id})`, inline: true },
                    { name: "Compte créé",   value: time(Math.floor(member.user.createdTimestamp / 1000), "R"), inline: true }
                ], null, member.user.displayAvatarURL())] }).catch(() => {});
        }
    }
});

client.on(Events.GuildMemberRemove, async member => {
    const config = initConfig(member.guild.id);
    if (!config.logs) return;
    const lc = member.guild.channels.cache.get(config.logs);
    if (!lc) return;
    await lc.send({ embeds: [createEmbed("📤 MEMBRE PARTI", `**${member.user.username}** a quitté.`, COLORS.ERROR,
        [{ name: "ID", value: member.id, inline: true }], null, member.user.displayAvatarURL())] }).catch(() => {});
});

// ========== 17. INITIALISATION ==========
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.username} (ID: ${client.user.id})`);

    await loadDB();

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log("🚀 Enregistrement des commandes...");
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ ${commands.length} commandes enregistrées.`);
    } catch (err) {
        console.error("❌ Erreur enregistrement :", err);
    }

    const statuses = [
        { type: ActivityType.Watching,  text: "le serveur" },
        { type: ActivityType.Playing,   text: "Paradise Overlord V20" },
        { type: ActivityType.Listening, text: "/help pour les commandes" },
        { type: ActivityType.Competing, text: "avec les autres bots" }
    ];
    let i = 0;
    client.user.setActivity(statuses[i].text, { type: statuses[i].type });
    setInterval(() => {
        i = (i + 1) % statuses.length;
        client.user.setActivity(statuses[i].text, { type: statuses[i].type });
    }, 30000);

    console.log("🔥 PARADISE OVERLORD V20 : EN LIGNE !");
});

// ========== 18. GESTION D'ERREURS ==========
process.on('unhandledRejection', err => console.error('❌ Rejection :', err));
process.on('uncaughtException',  err => console.error('❌ Exception :', err));

client.login(process.env.TOKEN).catch(err => {
    console.error("❌ Connexion impossible :", err);
    process.exit(1);
});
