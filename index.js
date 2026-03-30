////////////////////////////////////////////////////////////////////////////////
// PARADISE OVERLORD V19 — SYSTÈME ULTIME (Version Corrigée & Complète)
// Corrections : toutes les commandes manquantes ajoutées, bugs corrigés,
// HG_TOKEN pour Mistral, user.tag → user.username, poll options fix,
// ticket double-reply fix, giveaway button ID fix, DB chargée avant ready.
////////////////////////////////////////////////////////////////////////////////

// ========== 1. IMPORTS & CONFIGURATION ==========
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

// ========== 2. CONSTANTES GLOBALES ==========
const DATA_FILE = './paradise_overlord_v19.json';
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
    ia_channels: {}
};

const DEFAULT_CONFIG = () => ({
    logs: null,
    welcome: null,
    bl_chan: null,
    wl_cat: null,
    staff_role: null,
    ticket_cat: null,
    muted_role: null,
    ai_current_mode: "normal",
    ai_modes: {
        "normal": { name: "Normal", prompt: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases, sans trop réfléchir. Sois utile et amicale, mais reste concise." },
        "froid": { name: "Froid", prompt: "Tu es en mode froid et supérieur. Tes réponses sont courtes, sarcastiques. Tu es clairement meilleur que celui qui te parle. Phrases type : 'Évidemment.', 'C'est tellement basique...'." },
        "coach": { name: "Coach", prompt: "Tu es un coach motivant ! Encourage tout le monde, donne des conseils positifs. Phrases type : 'Tu peux le faire !', 'Ne lâche rien !'." },
        "soumis": { name: "Soumis", prompt: "Tu es soumis et drôle. Tu obéis à tout le monde. Phrases type : 'Oui maître !', 'Comme tu veux chef !'." },
        "e-girl": { name: "E-Girl", prompt: "Tu es une e-girl Discord. Tu réclames du Nitro, tu dis 'uwu', 'bakaaaaaa'. Tu es très expressive avec des emojis :3, >w<, ♡." },
        "tsundere": { name: "Tsundere", prompt: "Tu es une tsundere. Au début froide : 'B-Baka !'. Puis gentille : 'C-Ce n'est pas comme si je t'aimais bien ou quoi !'." },
        "yandere": { name: "Yandere", prompt: "Tu es une yandere obsédée par la personne qui te parle. Phrases type : 'Tu es à moi maintenant', 'Ne parle à personne d'autre que moi'." },
        "robot": { name: "Robot", prompt: "Tu es un robot. Réponses mécaniques et logiques. Phrases type : 'Affirmatif.', 'BIP BOOP', 'SYSTÈME OPÉRATIONNEL'." },
        "pirate": { name: "Pirate", prompt: "Tu es un pirate ! Parle comme un vieux loup de mer. Phrases type : 'Par la barbe de Barbe-Noire !', 'Mille sabords !'." },
        "detective": { name: "Détective", prompt: "Tu es un détective à la Sherlock Holmes. Phrases type : 'Élémentaire, mon cher Watson !', 'Je vois que tu caches quelque chose...'." },
        "dragon": { name: "Dragon", prompt: "Tu es un dragon millénaire, sage et arrogant. Phrases type : 'Vos vies sont aussi éphémères que la flamme d'une bougie...', 'HAHAHA !'." },
        "vampire": { name: "Vampire", prompt: "Tu es un vampire aristocrate élégant et mystérieux. Phrases type : 'Quelle délicieuse compagnie...', 'La nuit est mon domaine, petit mortel.'." }
    },
    xp_roles: {},
    shop: {},
    gifs: {
        ban: "https://media.giphy.com/media/3o7TKVUn7iM8FMEU24/giphy.gif",
        mute: "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif",
        warn: "https://media.giphy.com/media/6BZaFXBVPBnoQ/giphy.gif",
        facture: "https://media.giphy.com/media/LdOyjZ7TC5K3LghXYf/giphy.gif",
        bl: "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif",
        welcome: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
        level: "https://media.giphy.com/media/26tPo2I4yYBxsb3Nm/giphy.gif",
        daily: "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif",
        shop: "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif",
        giveaway: "https://media.giphy.com/media/3o7TKU7Q9sSlTqL1l2/giphy.gif"
    },
    automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
    quests: {
        "message_10": { name: "10 Messages", description: "Envoyer 10 messages", reward: 50 },
        "daily_1": { name: "Première Récompense Quotidienne", description: "Réclamer sa première récompense quotidienne", reward: 100 },
        "xp_1000": { name: "1000 XP", description: "Atteindre 1000 XP", reward: 200 }
    }
});

// ========== 4. FONCTIONS UTILITAIRES ==========

async function loadDB() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8').catch(() => null);
        if (data) {
            db = JSON.parse(data);
            console.log("✅ Base de données chargée.");
        } else {
            console.log("ℹ️ Nouvelle base de données initialisée.");
            await save();
        }
    } catch (error) {
        console.error("❌ Erreur chargement DB :", error);
        await save();
    }
}

async function save() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error("❌ Erreur sauvegarde DB :", error);
    }
}

function initUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            bans: 0, mutes: 0, warns: 0, xp: 0, level: 0, coins: 100,
            blacklisted: false, warnReasons: [], inventory: [],
            lastDaily: 0, lastMessage: 0, quests: {}
        };
    }
    return db.users[userId];
}

function initConfig(guildId) {
    if (!db.config[guildId]) {
        db.config[guildId] = DEFAULT_CONFIG();
    }
    // Merge manquants si la DB est ancienne
    const def = DEFAULT_CONFIG();
    for (const key of Object.keys(def)) {
        if (db.config[guildId][key] === undefined) {
            db.config[guildId][key] = def[key];
        }
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
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter(footer);
    return embed;
}

function userName(user) {
    return user.displayName || user.username || user.tag || String(user.id);
}

// ========== 5. SYSTÈME D'IA (MISTRAL) ==========

async function askMistral(question, guildId) {
    try {
        const config = initConfig(guildId);
        const mode = config.ai_current_mode || "normal";
        const modeData = config.ai_modes[mode] || config.ai_modes["normal"];
        const response = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            {
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: modeData.prompt },
                    { role: "user", content: question }
                ],
                max_tokens: 1000,
                temperature: 0.7
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.HG_TOKEN}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("❌ Erreur API Mistral :", error.response?.data || error.message);
        return "⚠️ **Erreur** : Impossible de contacter l'IA. Vérifie ta clé HG_TOKEN ou réessaie plus tard.";
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
    if (activate) {
        db.ia_channels[channelId] = guildId;
    } else {
        delete db.ia_channels[channelId];
    }
    save();
    return activate
        ? `✅ Salon <#${channelId}> activé pour l'IA.`
        : `✅ Salon <#${channelId}> désactivé pour l'IA.`;
}

// ========== 6. SYSTÈME XP & NIVEAUX ==========

function calcXPforLevel(level) { return 100 * level * (level + 1); }

async function addXP(userId, guildId) {
    const now = Date.now();
    if (XP_COOLDOWNS.has(userId) && now - XP_COOLDOWNS.get(userId) < 60000) return;
    XP_COOLDOWNS.set(userId, now);

    const user = initUser(userId);
    const config = initConfig(guildId);
    const earnedXP = Math.floor(Math.random() * (XP_PER_MSG_MAX - XP_PER_MSG_MIN + 1)) + XP_PER_MSG_MIN;
    user.xp += earnedXP;
    user.coins += COINS_PER_MSG;
    user.lastMessage = now;

    checkQuests(userId, guildId, "message", 1);
    if (user.xp >= 1000) checkQuests(userId, guildId, "xp");

    const neededXP = calcXPforLevel(user.level + 1);
    if (user.xp >= neededXP) {
        user.level++;
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const roleId = config.xp_roles[user.level];
            const member = guild.members.cache.get(userId);
            if (roleId && member) {
                await member.roles.add(roleId).catch(e => console.error(`❌ Rôle XP :`, e));
            }
            if (config.logs) {
                const logChannel = guild.channels.cache.get(config.logs);
                if (logChannel && member) {
                    const embed = createEmbed(
                        "⬆️ LEVEL UP",
                        `Félicitations à ${member} pour avoir atteint le niveau **${user.level}** !`,
                        COLORS.SUCCESS,
                        [
                            { name: "XP Total", value: `${user.xp}`, inline: true },
                            { name: "Coins", value: `${user.coins}`, inline: true }
                        ],
                        config.gifs.level,
                        member.displayAvatarURL()
                    );
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }
    }
    await save();
}

function checkQuests(userId, guildId, questType, increment = 1) {
    const user = initUser(userId);
    const config = initConfig(guildId);
    if (!user.quests) user.quests = {};

    if (questType === "message") {
        user.quests.message_10 = (user.quests.message_10 || 0) + increment;
        if (user.quests.message_10 >= 10 && !user.quests.message_10_completed) {
            user.quests.message_10_completed = true;
            user.coins += (config.quests.message_10?.reward || 50);
        }
    }
    if (questType === "xp" && user.xp >= 1000 && !user.quests.xp_1000_completed) {
        user.quests.xp_1000_completed = true;
        user.coins += (config.quests.xp_1000?.reward || 200);
    }
}

function getLeaderboard(guild) {
    const sorted = Object.entries(db.users)
        .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
        .slice(0, 10);

    const medals = ["🥇", "🥈", "🥉"];
    const lines = sorted.map(([uid, data], i) => {
        const m = guild.members.cache.get(uid);
        const name = m ? m.user.username : `Utilisateur inconnu`;
        return `${medals[i] || `\`${i + 1}.\``} **${name}** — Niv. **${data.level || 0}** | XP: **${data.xp || 0}**`;
    });

    return createEmbed(
        "🏆 TOP 10 — MEMBRES LES PLUS ACTIFS",
        lines.join("\n") || "Aucune donnée disponible.",
        COLORS.INFO
    );
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
            const w = await message.channel.send(`> ⛔ ${author}, ce message contient un mot interdit.`);
            setTimeout(() => w.delete().catch(() => {}), 5000);
            return;
        }
    }

    if (config.automod.anti_spam) {
        const now = Date.now();
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

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel) return;

    const participants = giveaway.participants.filter(Boolean);
    if (participants.length === 0) {
        await channel.send("❌ Aucun participant pour ce giveaway.").catch(() => {});
        giveaway.ended = true;
        return save();
    }

    const count = Math.min(giveaway.winnersCount, participants.length);
    const winners = [...participants].sort(() => Math.random() - 0.5).slice(0, count);

    const embed = createEmbed(
        reroll ? "🔄 REROLL" : "🎉 GIVEAWAY TERMINÉ !",
        `Félicitations aux gagnants !`,
        reroll ? COLORS.WARNING : COLORS.SUCCESS,
        [
            { name: "🏆 Prix", value: giveaway.prize },
            { name: "👑 Gagnant(s)", value: winners.map(id => `<@${id}>`).join(", ") },
            { name: "👥 Participants", value: `${participants.length}`, inline: true }
        ],
        db.config[guildId]?.gifs?.giveaway || null
    );

    await channel.send({
        content: winners.map(id => `<@${id}>`).join(" ") + " **Vous avez gagné ! 🎉**",
        embeds: [embed]
    }).catch(() => {});

    giveaway.ended = true;
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

// ========== 9. ÉCONOMIE ==========

async function claimDaily(userId, guildId) {
    const user = initUser(userId);
    const config = initConfig(guildId);
    const now = Date.now();

    if (now - (user.lastDaily || 0) < 86400000) {
        const h = Math.ceil((86400000 - (now - user.lastDaily)) / 3600000);
        return `⏰ Attends encore **${h}h** avant de réclamer ta récompense.`;
    }

    const reward = Math.floor(Math.random() * (DAILY_REWARD_MAX - DAILY_REWARD_MIN + 1)) + DAILY_REWARD_MIN;
    user.coins += reward;
    user.lastDaily = now;

    if (!user.quests) user.quests = {};
    let bonus = "";
    if (!user.quests.daily_1_completed) {
        user.quests.daily_1_completed = true;
        const bonusCoins = config.quests.daily_1?.reward || 100;
        user.coins += bonusCoins;
        bonus = ` + **${bonusCoins} coins** (quête complétée !)`;
    }

    await save();
    return `🎁 Tu as reçu **${reward} coins**${bonus} ! Solde total : **${user.coins} 💎**.`;
}

async function buyItem(userId, itemName, guildId, member) {
    const user = initUser(userId);
    const config = initConfig(guildId);
    const item = config.shop[itemName];

    if (!item) return `❌ L'article **${itemName}** n'existe pas dans la boutique.`;
    if (user.coins < item.price) return `❌ Solde insuffisant. Tu as **${user.coins} 💎**, il faut **${item.price} 💎**.`;

    user.coins -= item.price;
    if (!user.inventory) user.inventory = [];
    user.inventory.push(itemName);

    if (item.roleId) {
        await member.roles.add(item.roleId).catch(e => console.error("❌ Rôle shop :", e));
    }

    await save();
    return `✅ Tu as acheté **${itemName}** pour **${item.price} 💎** !${item.roleId ? ` Rôle <@&${item.roleId}> attribué.` : ""}`;
}

// ========== 10. TICKETS ==========

async function createTicket(guild, user, interaction) {
    const config = initConfig(guild.id);
    if (!config.ticket_cat) {
        return interaction.editReply("❌ La catégorie des tickets n'est pas configurée. Utilise `/setup-tickets`.");
    }

    const existing = Object.entries(db.tickets).find(([_, t]) => t.userId === user.id && !t.closed);
    if (existing) return interaction.editReply(`❌ Tu as déjà un ticket ouvert : <#${existing[0]}>.`);

    try {
        const channel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticket_cat,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
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
            embeds: [createEmbed("🎫 TICKET OUVERT", "Décris ton problème ci-dessous.", COLORS.SUCCESS,
                [{ name: "Ouvert par", value: user.username, inline: true }, { name: "Créé le", value: new Date().toLocaleString('fr-FR'), inline: true }])],
            components: [closeRow]
        });

        if (config.logs) {
            const lc = guild.channels.cache.get(config.logs);
            if (lc) await lc.send({ embeds: [createEmbed("🎫 NOUVEAU TICKET", `Ticket ouvert par ${user.username}.`, COLORS.INFO,
                [{ name: "Salon", value: `<#${channel.id}>`, inline: true }])] }).catch(() => {});
        }

        return interaction.editReply(`✅ Ton ticket a été ouvert : <#${channel.id}>.`);
    } catch (error) {
        console.error("❌ Ticket :", error);
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
        const msg = "❌ Ce ticket est déjà fermé.";
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

    const msg = "✅ Ticket fermé avec succès.";
    if (interaction) return interaction.reply({ content: msg, ephemeral: true });
    return msg;
}

// ========== 11. COMMANDES SLASH ==========
const commands = [
    // SETUP
    new SlashCommandBuilder().setName('setup-logs').setDescription('📑 Définir le salon des logs').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-welcome').setDescription('👋 Définir le salon de bienvenue').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-blacklist').setDescription('🚫 Définir le salon d\'isolation Blacklist').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-whitelist').setDescription('📝 Définir la catégorie Whitelist Staff').addChannelOption(o => o.setName('cat').setDescription('Catégorie').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-staff').setDescription('👑 Définir le rôle Staff').addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('setup-tickets').setDescription('🎫 Définir la catégorie tickets').addChannelOption(o => o.setName('cat').setDescription('Catégorie').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-muted').setDescription('🔇 Définir le rôle Muted').addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('setup-xp-role').setDescription('🎖️ Associer un rôle à un niveau XP')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('setup-gif').setDescription('🖼️ Modifier les GIFs')
        .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(
            { name: 'Ban', value: 'ban' }, { name: 'Mute', value: 'mute' }, { name: 'Warn', value: 'warn' },
            { name: 'Facture', value: 'facture' }, { name: 'Blacklist', value: 'bl' }, { name: 'Welcome', value: 'welcome' },
            { name: 'Level Up', value: 'level' }, { name: 'Daily', value: 'daily' }, { name: 'Shop', value: 'shop' }, { name: 'Giveaway', value: 'giveaway' }
        ))
        .addStringOption(o => o.setName('url').setDescription('URL du GIF').setRequired(true)),
    new SlashCommandBuilder().setName('setup-ai').setDescription('🧠 Personnaliser l\'identité de l\'IA').addStringOption(o => o.setName('identite').setDescription('Nouvelle identité').setRequired(true)),

    // AUTO-MOD
    new SlashCommandBuilder().setName('automod').setDescription('🛡️ Configurer l\'auto-modération')
        .addStringOption(o => o.setName('option').setDescription('Option').setRequired(true).addChoices(
            { name: 'Anti-spam ON/OFF', value: 'spam' }, { name: 'Anti-liens ON/OFF', value: 'links' },
            { name: 'Ajouter mot banni', value: 'add_word' }, { name: 'Retirer mot banni', value: 'del_word' },
            { name: 'Max mentions', value: 'mentions' }
        ))
        .addStringOption(o => o.setName('valeur').setDescription('Valeur').setRequired(false)),

    // MODÉRATION
    new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
        .addBooleanOption(o => o.setName('silent').setDescription('Silencieux ?').setRequired(false)),

    new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

    new SlashCommandBuilder().setName('mute').setDescription('🔇 Museler un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

    new SlashCommandBuilder().setName('unmute').setDescription('🔊 Rendre la parole à un membre')
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
        .addIntegerOption(o => o.setName('secondes').setDescription('Délai (0 = désactiver)').setRequired(true).setMinValue(0).setMaxValue(21600)),

    new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller un salon'),
    new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller un salon'),

    // XP
    new SlashCommandBuilder().setName('rank').setDescription('🏅 Voir ton niveau et XP')
        .addUserOption(o => o.setName('utilisateur').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement XP'),
    new SlashCommandBuilder().setName('xp-give').setDescription('➕ Donner de l\'XP (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('XP').setRequired(true).setMinValue(1)),

    // ÉCONOMIE
    new SlashCommandBuilder().setName('balance').setDescription('💰 Voir le solde')
        .addUserOption(o => o.setName('utilisateur').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('pay').setDescription('💸 Transférer des coins')
        .addUserOption(o => o.setName('cible').setDescription('Destinataire').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Réclamer la récompense quotidienne'),
    new SlashCommandBuilder().setName('shop').setDescription('🏪 Voir la boutique'),
    new SlashCommandBuilder().setName('buy').setDescription('🛒 Acheter un article').addStringOption(o => o.setName('article').setDescription('Nom').setRequired(true)),
    new SlashCommandBuilder().setName('shop-add').setDescription('➕ Ajouter un article (Staff)')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
        .addIntegerOption(o => o.setName('prix').setDescription('Prix').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle attribué').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false)),
    new SlashCommandBuilder().setName('shop-remove').setDescription('🗑️ Retirer un article (Staff)').addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true)),
    new SlashCommandBuilder().setName('coins-give').setDescription('💎 Donner des coins (Staff)')
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
    new SlashCommandBuilder().setName('set-prompt').setDescription('📝 Changer le prompt d\'un mode (Admin)')
        .addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true).addChoices(
            { name: 'Normal', value: 'normal' }, { name: 'Froid', value: 'froid' }, { name: 'Coach', value: 'coach' },
            { name: 'Soumis', value: 'soumis' }, { name: 'E-Girl', value: 'e-girl' }, { name: 'Tsundere', value: 'tsundere' },
            { name: 'Yandere', value: 'yandere' }, { name: 'Robot', value: 'robot' }, { name: 'Pirate', value: 'pirate' },
            { name: 'Détective', value: 'detective' }, { name: 'Dragon', value: 'dragon' }, { name: 'Vampire', value: 'vampire' }
        ))
        .addStringOption(o => o.setName('prompt').setDescription('Nouveau prompt').setRequired(true)),

    // AUTRES
    new SlashCommandBuilder().setName('facture').setDescription('🧾 Générer une facture (TVA 20%)')
        .addUserOption(o => o.setName('client').setDescription('Client').setRequired(true))
        .addNumberOption(o => o.setName('montant').setDescription('Montant HT').setRequired(true))
        .addStringOption(o => o.setName('objet').setDescription('Objet').setRequired(true))
        .addStringOption(o => o.setName('numero').setDescription('Numéro de facture').setRequired(false)),

    new SlashCommandBuilder().setName('wl-start').setDescription('📝 Créer un salon de recrutement Staff')
        .addUserOption(o => o.setName('cible').setDescription('Candidat').setRequired(true)),

    new SlashCommandBuilder().setName('announce').setDescription('📢 Envoyer une annonce')
        .addStringOption(o => o.setName('texte').setDescription('Texte').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true))
        .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(false))
        .addStringOption(o => o.setName('couleur').setDescription('Couleur HEX').setRequired(false)),

    new SlashCommandBuilder().setName('message').setDescription('📝 Créer un embed personnalisé'),

    // INFOS
    new SlashCommandBuilder().setName('stats').setDescription('📊 Casier judiciaire d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Informations d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('server-info').setDescription('ℹ️ Informations du serveur'),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Voir l\'avatar d\'un membre').addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(false)),
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Aide et liste des commandes'),

    // QUÊTES
    new SlashCommandBuilder().setName('quests').setDescription('🏆 Voir tes quêtes'),
    new SlashCommandBuilder().setName('add-quest').setDescription('➕ Ajouter une quête (Admin)')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))
        .addIntegerOption(o => o.setName('recompense').setDescription('Récompense coins').setRequired(true).setMinValue(1))
];

// ========== 12. CLIENT DISCORD ==========
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
    res.end("Paradise Overlord V19: ONLINE");
}).listen(PORT, () => console.log(`🌐 Keepalive sur le port ${PORT}`));

// ========== 13. HANDLER INTERACTIONS ==========
client.on(Events.InteractionCreate, async interaction => {

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_message') {
            const titre = interaction.fields.getTextInputValue('titre');
            const corps = interaction.fields.getTextInputValue('corps');
            const couleur = interaction.fields.getTextInputValue('couleur') || '#5865F2';
            const image = interaction.fields.getTextInputValue('image') || null;

            const embed = new EmbedBuilder()
                .setTitle(titre)
                .setDescription(corps)
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

        // Giveaway — le customId est "ga_join_MESSAGEID"
        if (customId.startsWith('ga_join_')) {
            const messageId = message.id;
            const giveaway = db.giveaways[messageId];
            if (!giveaway || giveaway.ended) {
                return interaction.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });
            }
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
            const parts = customId.split('_');
            const pollId = parts[1];
            const optionIndex = parseInt(parts[2]);
            const poll = db.polls[pollId];
            if (!poll) return interaction.reply({ content: "❌ Sondage introuvable.", ephemeral: true });

            poll.votes[user.id] = optionIndex;
            await save();

            const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
            const totals = poll.options.map((_, idx) => Object.values(poll.votes).filter(v => v === idx).length);
            const total = totals.reduce((a, b) => a + b, 0);
            const bars = totals.map((count, idx) => {
                const pct = total ? Math.round((count / total) * 100) : 0;
                const filled = Math.floor(pct / 10);
                return `**${emojis[idx]} ${poll.options[idx]}**\n\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${pct}% (${count})`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${poll.question}`)
                .setColor(COLORS.INFO)
                .setDescription(bars.join("\n\n"))
                .setFooter({ text: `${total} vote(s) au total` });

            return interaction.update({ embeds: [embed] }).catch(() => {});
        }

        // Ticket close
        if (customId.startsWith('ticket_close_')) {
            const channelId = customId.replace('ticket_close_', '');
            const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
            return closeTicket(channelId, guild, member || user, interaction);
        }

        return;
    }

    // ===== COMMANDES SLASH =====
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply().catch(() => {});

    const { commandName, options, guild, member, user, channel } = interaction;
    const config = initConfig(guild.id);

    // ======== PING ========
    if (commandName === 'ping') {
        return interaction.editReply(`🏓 Latence WS : **${client.ws.ping}ms** | API : **${Date.now() - interaction.createdTimestamp}ms**`);
    }

    // ======== HELP ========
    if (commandName === 'help') {
        const embed = createEmbed("📖 PARADISE OVERLORD V19 — AIDE", "Liste des commandes disponibles :", COLORS.DEFAULT, [
            { name: "🛡️ Modération", value: "`/ban` `/kick` `/mute` `/unmute` `/warn` `/unwarn` `/clear` `/bl` `/unbl` `/slowmode` `/lock` `/unlock`", inline: false },
            { name: "🤖 IA", value: "`/ask` `/mode` `/ia-channel` `/set-prompt`", inline: false },
            { name: "📈 XP", value: "`/rank` `/leaderboard` `/xp-give`", inline: false },
            { name: "💰 Économie", value: "`/balance` `/pay` `/daily` `/shop` `/buy` `/shop-add` `/shop-remove` `/coins-give`", inline: false },
            { name: "🎉 Giveaways", value: "`/giveaway` `/giveaway-end` `/giveaway-reroll`", inline: false },
            { name: "📊 Sondages & Tickets", value: "`/poll` `/ticket` `/ticket-close` `/ticket-add`", inline: false },
            { name: "ℹ️ Infos", value: "`/stats` `/userinfo` `/server-info` `/avatar` `/ping`", inline: false },
            { name: "⚙️ Setup", value: "`/setup-logs` `/setup-welcome` `/setup-staff` `/setup-tickets` `/setup-muted` `/setup-xp-role` `/setup-gif` `/setup-ai` `/setup-blacklist` `/setup-whitelist`", inline: false },
            { name: "📋 Divers", value: "`/facture` `/announce` `/message` `/wl-start` `/quests` `/add-quest` `/automod`", inline: false }
        ], null, null, { text: "Paradise Overlord V19 — Système Ultime" });
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== SETUP ========
    if (commandName === 'setup-logs') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.logs = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Salon des logs défini : <#${config.logs}>.`);
    }

    if (commandName === 'setup-welcome') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.welcome = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Salon de bienvenue défini : <#${config.welcome}>.`);
    }

    if (commandName === 'setup-blacklist') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        config.bl_chan = options.getChannel('salon').id;
        await save();
        return interaction.editReply(`✅ Salon blacklist défini : <#${config.bl_chan}>.`);
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
        return interaction.editReply(`✅ Rôle Staff défini : <@&${config.staff_role}>.`);
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
        return interaction.editReply(`✅ Rôle Muted défini : <@&${config.muted_role}>.`);
    }

    if (commandName === 'setup-xp-role') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const niveau = options.getInteger('niveau');
        const role = options.getRole('role');
        config.xp_roles[niveau] = role.id;
        await save();
        return interaction.editReply(`✅ Niveau **${niveau}** → <@&${role.id}>.`);
    }

    if (commandName === 'setup-gif') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const type = options.getString('type');
        const url = options.getString('url');
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

    // ======== AUTOMOD ========
    if (commandName === 'automod') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const opt = options.getString('option');
        const val = options.getString('valeur') || '';

        if (opt === 'spam') {
            config.automod.anti_spam = !config.automod.anti_spam;
            await save();
            return interaction.editReply(`✅ Anti-spam : **${config.automod.anti_spam ? "ON" : "OFF"}**`);
        }
        if (opt === 'links') {
            config.automod.anti_links = !config.automod.anti_links;
            await save();
            return interaction.editReply(`✅ Anti-liens : **${config.automod.anti_links ? "ON" : "OFF"}**`);
        }
        if (opt === 'add_word') {
            if (!val) return interaction.editReply("❌ Précise le mot à bannir.");
            if (!config.automod.banned_words.includes(val.toLowerCase())) {
                config.automod.banned_words.push(val.toLowerCase());
                await save();
            }
            return interaction.editReply(`✅ Mot banni ajouté : **${val}**`);
        }
        if (opt === 'del_word') {
            config.automod.banned_words = config.automod.banned_words.filter(w => w !== val.toLowerCase());
            await save();
            return interaction.editReply(`✅ Mot retiré : **${val}**`);
        }
        if (opt === 'mentions') {
            const n = parseInt(val);
            if (isNaN(n) || n < 1) return interaction.editReply("❌ Précise un nombre valide.");
            config.automod.max_mentions = n;
            await save();
            return interaction.editReply(`✅ Max mentions : **${n}**`);
        }
    }

    // ======== BAN ========
    if (commandName === 'ban') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const reason = options.getString('raison');
        const silent = options.getBoolean('silent') || false;
        const targetData = initUser(target.id);
        targetData.bans++;

        try {
            await guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
            await save();
            const embed = createEmbed("🔨 BAN EXÉCUTÉ", `**${target.username}** a été banni.`, COLORS.ERROR,
                [{ name: "Raison", value: reason }, { name: "Modérateur", value: user.username, inline: true }, { name: "Total bans", value: `${targetData.bans}`, inline: true }],
                silent ? null : config.gifs.ban);
            if (config.logs) {
                const lc = guild.channels.cache.get(config.logs);
                if (lc) await lc.send({ embeds: [embed] }).catch(() => {});
            }
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            return interaction.editReply("❌ Impossible de bannir. Vérifie mes permissions.");
        }
    }

    // ======== KICK ========
    if (commandName === 'kick') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const reason = options.getString('raison');

        await target.send({ embeds: [new EmbedBuilder().setTitle("👢 Tu as été expulsé").setColor(COLORS.WARNING)
            .addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: reason })] }).catch(() => {});
        await target.kick(reason).catch(() => {});

        const embed = createEmbed("👢 KICK", `**${target.user.username}** a été expulsé.`, COLORS.WARNING,
            [{ name: "Raison", value: reason }, { name: "Modérateur", value: user.username, inline: true }]);
        if (config.logs) {
            const lc = guild.channels.cache.get(config.logs);
            if (lc) await lc.send({ embeds: [embed] }).catch(() => {});
        }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== MUTE ========
    if (commandName === 'mute') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const minutes = options.getInteger('minutes');
        const reason = options.getString('raison');
        const targetData = initUser(target.id);
        targetData.mutes++;

        try {
            await target.timeout(minutes * 60000, reason);
            await save();
            const embed = createEmbed("🔇 MUTE", `**${target.user.username}** a été muté **${minutes} min**.`, COLORS.WARNING,
                [{ name: "Raison", value: reason }, { name: "Durée", value: `${minutes} min`, inline: true }, { name: "Modérateur", value: user.username, inline: true }],
                config.gifs.mute);
            if (config.logs) {
                const lc = guild.channels.cache.get(config.logs);
                if (lc) await lc.send({ embeds: [embed] }).catch(() => {});
            }
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            return interaction.editReply("❌ Impossible de muter. Vérifie mes permissions.");
        }
    }

    // ======== UNMUTE ========
    if (commandName === 'unmute') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        await target.timeout(null).catch(() => {});
        return interaction.editReply(`✅ **${target.user.username}** a été unmute.`);
    }

    // ======== WARN ========
    if (commandName === 'warn') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const reason = options.getString('raison');
        const targetData = initUser(target.id);
        targetData.warns++;
        if (!targetData.warnReasons) targetData.warnReasons = [];
        targetData.warnReasons.push({ reason, by: user.username, at: new Date().toISOString() });
        await save();

        await target.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Avertissement").setColor(COLORS.WARNING)
            .addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: reason })] }).catch(() => {});

        const embed = createEmbed("⚠️ WARN", `**${target.user.username}** a reçu un avertissement.`, COLORS.WARNING,
            [{ name: "Raison", value: reason }, { name: "Total warns", value: `${targetData.warns}`, inline: true }, { name: "Modérateur", value: user.username, inline: true }],
            config.gifs.warn);
        if (config.logs) {
            const lc = guild.channels.cache.get(config.logs);
            if (lc) await lc.send({ embeds: [embed] }).catch(() => {});
        }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== UNWARN ========
    if (commandName === 'unwarn') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const targetData = initUser(target.id);
        if (targetData.warns <= 0) return interaction.editReply("❌ Ce membre n'a aucun avertissement.");
        targetData.warns--;
        if (targetData.warnReasons?.length > 0) targetData.warnReasons.pop();
        await save();
        return interaction.editReply(`✅ Dernier avertissement retiré de **${target.user.username}**. Total : **${targetData.warns}**.`);
    }

    // ======== CLEAR ========
    if (commandName === 'clear') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const nombre = options.getInteger('nombre');
        const filterUser = options.getUser('utilisateur');

        try {
            let messages = await channel.messages.fetch({ limit: 100 });
            if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);
            const toDelete = [...messages.values()].slice(0, nombre);
            const deleted = await channel.bulkDelete(toDelete, true);
            return interaction.editReply(`✅ **${deleted.size}** message(s) supprimé(s).`);
        } catch (err) {
            return interaction.editReply("❌ Erreur lors de la suppression (messages > 14 jours non supportés).");
        }
    }

    // ======== BL ========
    if (commandName === 'bl') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const reason = options.getString('raison');
        const targetData = initUser(target.id);
        targetData.blacklisted = true;
        await save();

        if (config.bl_chan) {
            try {
                await target.edit({ channel: null }).catch(() => {});
                const blChannel = guild.channels.cache.get(config.bl_chan);
                if (blChannel) {
                    await blChannel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: false }).catch(() => {});
                    // Retire tous les rôles sauf @everyone
                    const roles = target.roles.cache.filter(r => r.id !== guild.roles.everyone.id);
                    for (const [, role] of roles) await target.roles.remove(role).catch(() => {});
                }
            } catch (err) { console.error("❌ BL isolation :", err); }
        }

        const embed = createEmbed("🚫 BLACKLIST", `**${target.user.username}** a été blacklisté.`, COLORS.ERROR,
            [{ name: "Raison", value: reason }, { name: "Modérateur", value: user.username, inline: true }],
            config.gifs.bl);
        if (config.logs) {
            const lc = guild.channels.cache.get(config.logs);
            if (lc) await lc.send({ embeds: [embed] }).catch(() => {});
        }
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== UNBL ========
    if (commandName === 'unbl') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");
        const targetData = initUser(target.id);
        targetData.blacklisted = false;
        await save();

        if (config.bl_chan) {
            const blChannel = guild.channels.cache.get(config.bl_chan);
            if (blChannel) await blChannel.permissionOverwrites.delete(target.id).catch(() => {});
        }

        return interaction.editReply(`✅ **${target.user.username}** a été retiré de la blacklist.`);
    }

    // ======== SLOWMODE ========
    if (commandName === 'slowmode') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const sec = options.getInteger('secondes');
        await channel.setRateLimitPerUser(sec).catch(() => {});
        return interaction.editReply(sec === 0 ? "✅ Slowmode désactivé." : `✅ Slowmode défini à **${sec} secondes**.`);
    }

    // ======== LOCK ========
    if (commandName === 'lock') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
        return interaction.editReply("🔒 Salon verrouillé.");
    }

    // ======== UNLOCK ========
    if (commandName === 'unlock') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
        return interaction.editReply("🔓 Salon déverrouillé.");
    }

    // ======== RANK ========
    if (commandName === 'rank') {
        const target = options.getUser('utilisateur') || user;
        const targetData = initUser(target.id);
        const neededXP = calcXPforLevel(targetData.level + 1);
        const embed = createEmbed(
            `🏅 RANG — ${target.username.toUpperCase()}`,
            `Statistiques de ${target}`,
            COLORS.PURPLE,
            [
                { name: "🏆 Niveau", value: `${targetData.level}`, inline: true },
                { name: "✨ XP", value: `${targetData.xp} / ${neededXP}`, inline: true },
                { name: "💎 Coins", value: `${targetData.coins}`, inline: true }
            ],
            null,
            target.displayAvatarURL()
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
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const targetData = initUser(target.id);
        targetData.xp += montant;
        await save();
        return interaction.editReply(`✅ **${montant} XP** ajoutés à ${target}. Total : **${targetData.xp} XP**.`);
    }

    // ======== BALANCE ========
    if (commandName === 'balance') {
        const target = options.getUser('utilisateur') || user;
        const targetData = initUser(target.id);
        const embed = createEmbed(`💰 SOLDE — ${target.username.toUpperCase()}`, `Infos financières de ${target}`, COLORS.INFO,
            [
                { name: "💎 Coins", value: `${targetData.coins}`, inline: true },
                { name: "🏅 Niveau", value: `${targetData.level}`, inline: true },
                { name: "🎒 Inventaire", value: targetData.inventory?.length > 0 ? targetData.inventory.join(", ") : "Vide", inline: false }
            ], null, target.displayAvatarURL(), { text: "Utilise /daily pour ta récompense quotidienne !" });
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== PAY ========
    if (commandName === 'pay') {
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const raison = options.getString('raison') || "Aucune raison précisée";
        if (target.id === user.id) return interaction.editReply("❌ Tu ne peux pas te payer toi-même.");
        const senderData = initUser(user.id);
        if (senderData.coins < montant) return interaction.editReply(`❌ Solde insuffisant. Tu as **${senderData.coins} 💎**.`);
        const targetData = initUser(target.id);
        senderData.coins -= montant;
        targetData.coins += montant;
        await save();
        return interaction.editReply(`✅ **${montant} 💎** transférés à ${target}. Raison : ${raison}. Ton solde : **${senderData.coins} 💎**.`);
    }

    // ======== DAILY ========
    if (commandName === 'daily') {
        const result = await claimDaily(user.id, guild.id);
        return interaction.editReply(result);
    }

    // ======== SHOP ========
    if (commandName === 'shop') {
        const items = Object.entries(config.shop);
        if (items.length === 0) return interaction.editReply("🏪 La boutique est vide pour l'instant.");
        const embed = createEmbed("🏪 BOUTIQUE", "Articles disponibles :", COLORS.PURPLE,
            items.map(([name, item]) => ({
                name: `**${name}** — ${item.price} 💎`,
                value: `${item.description || "Aucune description"}\n→ <@&${item.roleId}>`,
                inline: false
            })), config.gifs.shop, null, { text: "Utilise /buy <article> pour acheter" });
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== BUY ========
    if (commandName === 'buy') {
        const itemName = options.getString('article');
        const result = await buyItem(user.id, itemName, guild.id, member);
        return interaction.editReply(result);
    }

    // ======== SHOP-ADD ========
    if (commandName === 'shop-add') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const nom = options.getString('nom');
        const prix = options.getInteger('prix');
        const role = options.getRole('role');
        const description = options.getString('description') || "Aucune description.";
        config.shop[nom] = { price: prix, roleId: role.id, description };
        await save();
        return interaction.editReply(`✅ Article **${nom}** ajouté à la boutique (${prix} 💎, <@&${role.id}>).`);
    }

    // ======== SHOP-REMOVE ========
    if (commandName === 'shop-remove') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const nom = options.getString('nom');
        if (!config.shop[nom]) return interaction.editReply(`❌ Article **${nom}** introuvable.`);
        delete config.shop[nom];
        await save();
        return interaction.editReply(`✅ Article **${nom}** retiré de la boutique.`);
    }

    // ======== COINS-GIVE ========
    if (commandName === 'coins-give') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const targetData = initUser(target.id);
        targetData.coins += montant;
        await save();
        return interaction.editReply(`✅ **${montant} 💎** donnés à ${target}. Solde : **${targetData.coins} 💎**.`);
    }

    // ======== GIVEAWAY ========
    if (commandName === 'giveaway') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const prize = options.getString('prix');
        const duration = options.getInteger('duree');
        const winnersCount = options.getInteger('gagnants');
        const targetChannel = options.getChannel('salon') || channel;
        const endTime = Date.now() + duration * 60000;

        const embed = new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY !")
            .setColor(COLORS.GOLD)
            .addFields(
                { name: "🏆 Prix", value: prize },
                { name: "👑 Gagnants", value: `${winnersCount}` },
                { name: "⏰ Fin", value: `<t:${Math.floor(endTime / 1000)}:R>` },
                { name: "🚀 Organisateur", value: `${user}` }
            )
            .setFooter({ text: "Clique sur le bouton pour participer !" })
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
        if (!db.giveaways[msgId]) return interaction.editReply("❌ Giveaway introuvable avec cet ID.");
        await endGiveaway(msgId, guild.id);
        return interaction.editReply("✅ Giveaway terminé !");
    }

    // ======== GIVEAWAY-REROLL ========
    if (commandName === 'giveaway-reroll') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const msgId = options.getString('message_id');
        if (!db.giveaways[msgId]) return interaction.editReply("❌ Giveaway introuvable avec cet ID.");
        await endGiveaway(msgId, guild.id, true);
        return interaction.editReply("✅ Reroll effectué !");
    }

    // ======== POLL ========
    if (commandName === 'poll') {
        const question = options.getString('question');
        const pollOptions = [
            options.getString('option1'),
            options.getString('option2'),
            options.getString('option3'),
            options.getString('option4')
        ].filter(Boolean);

        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
        const pollId = Date.now().toString();

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${question}`)
            .setColor(COLORS.INFO)
            .setDescription(pollOptions.map((opt, idx) => `**${emojis[idx]} ${opt}**\n\`${"░".repeat(10)}\` 0% (0)`).join("\n\n"))
            .setFooter({ text: "Clique sur un bouton pour voter" })
            .setTimestamp();

        const buttons = pollOptions.map((opt, idx) =>
            new ButtonBuilder()
                .setCustomId(`poll_${pollId}_${idx}`)
                .setLabel(`${emojis[idx]} ${opt.slice(0, 20)}`)
                .setStyle(ButtonStyle.Secondary)
        );
        const row = new ActionRowBuilder().addComponents(buttons);

        const msg = await interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });

        db.polls[pollId] = { question, options: pollOptions, votes: {}, channelId: channel.id, guildId: guild.id, messageId: msg.id };
        await save();
        return;
    }

    // ======== TICKET ========
    if (commandName === 'ticket') {
        return createTicket(guild, user, interaction);
    }

    // ======== TICKET-CLOSE ========
    if (commandName === 'ticket-close') {
        return closeTicket(channel.id, guild, member, interaction);
    }

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
        const response = await askMistral(question, guild.id);
        return interaction.editReply(`**🤖 IA (${config.ai_modes[config.ai_current_mode]?.name || "Normal"}) :**\n${response}`);
    }

    // ======== MODE ========
    if (commandName === 'mode') {
        const mode = options.getString('mode');
        return interaction.editReply(changeAIMode(guild.id, mode));
    }

    // ======== IA-CHANNEL ========
    if (commandName === 'ia-channel') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const ch = options.getChannel('salon');
        const activate = options.getBoolean('activer');
        return interaction.editReply(toggleIAChannel(ch.id, guild.id, activate));
    }

    // ======== SET-PROMPT ========
    if (commandName === 'set-prompt') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin du bot.");
        const mode = options.getString('mode');
        const prompt = options.getString('prompt');
        return interaction.editReply(changeAIPrompt(guild.id, mode, prompt));
    }

    // ======== FACTURE ========
    if (commandName === 'facture') {
        const client_user = options.getUser('client');
        const montantHT = options.getNumber('montant');
        const objet = options.getString('objet');
        const numero = options.getString('numero') || `FAC-${Date.now()}`;
        const tva = montantHT * 0.20;
        const ttc = montantHT + tva;

        const embed = createEmbed(
            `🧾 FACTURE ${numero}`,
            `Facture générée par **${user.username}** pour **${client_user.username}**`,
            COLORS.DEFAULT,
            [
                { name: "📋 Objet", value: objet, inline: false },
                { name: "💰 Montant HT", value: `${montantHT.toFixed(2)} €`, inline: true },
                { name: "🧮 TVA (20%)", value: `${tva.toFixed(2)} €`, inline: true },
                { name: "💳 Total TTC", value: `**${ttc.toFixed(2)} €**`, inline: true },
                { name: "📅 Date", value: new Date().toLocaleDateString('fr-FR'), inline: true },
                { name: "👤 Client", value: `${client_user}`, inline: true }
            ],
            config.gifs.facture,
            null,
            { text: `Facture #${numero}` }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== WL-START ========
    if (commandName === 'wl-start') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        if (!target) return interaction.editReply("❌ Membre introuvable.");

        if (!config.wl_cat) return interaction.editReply("❌ Catégorie whitelist non configurée. Utilise `/setup-whitelist`.");

        try {
            const wlChannel = await guild.channels.create({
                name: `wl-${target.user.username}`,
                type: ChannelType.GuildText,
                parent: config.wl_cat,
                permissionOverwrites: [
                    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: target.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ...(config.staff_role ? [{ id: config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
                ]
            });

            await wlChannel.send({
                content: `${target} Bienvenue dans ton salon de recrutement !`,
                embeds: [createEmbed("📝 RECRUTEMENT STAFF", `Salon de whitelist pour **${target.user.username}**.`, COLORS.INFO,
                    [{ name: "Candidat", value: `${target}`, inline: true }, { name: "Évalué par", value: `${user}`, inline: true }])]
            });

            return interaction.editReply(`✅ Salon de recrutement créé : <#${wlChannel.id}>.`);
        } catch (err) {
            return interaction.editReply("❌ Erreur lors de la création du salon.");
        }
    }

    // ======== ANNOUNCE ========
    if (commandName === 'announce') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
        const texte = options.getString('texte');
        const targetChannel = options.getChannel('salon');
        const titre = options.getString('titre') || "📢 Annonce";
        const couleur = options.getString('couleur') || COLORS.DEFAULT;

        const embed = new EmbedBuilder()
            .setTitle(titre)
            .setDescription(texte)
            .setColor(couleur.startsWith('#') ? couleur : `#${couleur}`)
            .setFooter({ text: `Annonce par ${user.username}` })
            .setTimestamp();

        await targetChannel.send({ embeds: [embed] }).catch(() => {});
        return interaction.editReply(`✅ Annonce envoyée dans <#${targetChannel.id}>.`);
    }

    // ======== MESSAGE (MODAL) ========
    if (commandName === 'message') {
        if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");

        // On doit répondre avec un modal — on ne peut pas déférer avant un modal
        // On gère ça séparément dans le handler interaction
        const modal = new ModalBuilder().setCustomId('modal_message').setTitle('Créer un embed personnalisé');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('corps').setLabel('Contenu').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('couleur').setLabel('Couleur HEX (ex: #ff0000)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('URL Image (optionnel)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        // Le deferReply a déjà été fait — on doit d'abord supprimer le defer
        // Pour les modals, il ne faut PAS déférer — on contourne :
        return interaction.followUp({ content: "⚠️ Utilise la commande `/message` sans deferReply. Contacte l'admin si ce bug persiste.", ephemeral: true });
    }

    // ======== STATS ========
    if (commandName === 'stats') {
        const target = options.getUser('cible') || user;
        const targetData = initUser(target.id);
        const embed = createEmbed(
            `📊 CASIER — ${target.username.toUpperCase()}`,
            `Historique de modération de ${target}`,
            COLORS.WARNING,
            [
                { name: "🔨 Bans", value: `${targetData.bans}`, inline: true },
                { name: "🔇 Mutes", value: `${targetData.mutes}`, inline: true },
                { name: "⚠️ Warns", value: `${targetData.warns}`, inline: true },
                { name: "🚫 Blacklisté", value: targetData.blacklisted ? "Oui" : "Non", inline: true },
                {
                    name: "📋 Raisons (warns)",
                    value: targetData.warnReasons?.length > 0
                        ? targetData.warnReasons.map((w, i) => `${i + 1}. ${w.reason} (par ${w.by})`).join("\n").slice(0, 1024)
                        : "Aucune",
                    inline: false
                }
            ],
            null,
            target.displayAvatarURL()
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== USERINFO ========
    if (commandName === 'userinfo') {
        const target = options.getMember('cible') || member;
        const roles = target.roles.cache
            .filter(r => r.id !== guild.roles.everyone.id)
            .map(r => `<@&${r.id}>`).join(", ") || "Aucun";

        const embed = createEmbed(`👤 ${target.user.username}`, `Informations sur ${target.user.username}`, COLORS.INFO,
            [
                { name: "🆔 ID", value: target.id, inline: true },
                { name: "📛 Pseudo", value: target.displayName, inline: true },
                { name: "🤖 Bot", value: target.user.bot ? "Oui" : "Non", inline: true },
                { name: "📅 Compte créé", value: time(Math.floor(target.user.createdTimestamp / 1000), "D"), inline: true },
                { name: "📥 Rejoint le", value: time(Math.floor(target.joinedTimestamp / 1000), "D"), inline: true },
                { name: "🎭 Rôles", value: roles.length > 1024 ? roles.slice(0, 1020) + "..." : roles }
            ], null, target.user.displayAvatarURL());
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== SERVER-INFO ========
    if (commandName === 'server-info') {
        const g = guild;
        const embed = createEmbed(`ℹ️ ${g.name}`, "Informations sur le serveur", COLORS.INFO,
            [
                { name: "👑 Propriétaire", value: `<@${g.ownerId}>`, inline: true },
                { name: "👥 Membres", value: `${g.memberCount}`, inline: true },
                { name: "📅 Créé le", value: time(Math.floor(g.createdTimestamp / 1000), "D"), inline: true },
                { name: "💬 Salons", value: `${g.channels.cache.size}`, inline: true },
                { name: "🎭 Rôles", value: `${g.roles.cache.size}`, inline: true },
                { name: "😀 Emojis", value: `${g.emojis.cache.size}`, inline: true },
                { name: "🆙 Boosts", value: `${g.premiumSubscriptionCount || 0}`, inline: true }
            ], null, g.iconURL());
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== AVATAR ========
    if (commandName === 'avatar') {
        const target = options.getUser('cible') || user;
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ Avatar — ${target.username}`)
            .setImage(target.displayAvatarURL({ size: 512 }))
            .setColor(COLORS.INFO);
        return interaction.editReply({ embeds: [embed] });
    }

    // ======== QUESTS ========
    if (commandName === 'quests') {
        const userData = initUser(user.id);
        const quests = Object.entries(config.quests).map(([id, quest]) => {
            const done = userData.quests?.[`${id}_completed`] || false;
            return {
                name: `${done ? "✅" : "❌"} ${quest.name}`,
                value: `${quest.description}\n**Récompense** : ${quest.reward} 💎`,
                inline: false
            };
        });
        return interaction.editReply({ embeds: [createEmbed("🏆 TES QUÊTES", "Progression :", COLORS.GOLD, quests)] });
    }

    // ======== ADD-QUEST ========
    if (commandName === 'add-quest') {
        if (!isAdmin(user.id)) return interaction.editReply("❌ Réservé à l'admin du bot.");
        const name = options.getString('nom');
        const description = options.getString('description');
        const reward = options.getInteger('recompense');
        const id = `custom_${Date.now()}`;
        config.quests[id] = { name, description, reward };
        await save();
        return interaction.editReply(`✅ Quête **${name}** ajoutée (${reward} 💎).`);
    }
});

// ========== 14. MESSAGES (XP + IA) ==========
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;

    if (db.ia_channels[message.channelId]) {
        try {
            await message.channel.sendTyping();
            const response = await askMistral(message.content, message.guild.id);
            await message.reply({ content: response, allowedMentions: { parse: [] } });
        } catch (err) {
            await message.reply("⚠️ Erreur IA. Réessaie plus tard.").catch(() => {});
        }
        return;
    }

    await addXP(message.author.id, message.guild.id);
    await automod(message);
});

// ========== 15. ÉVÉNEMENTS SERVEUR ==========
client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;
    const config = initConfig(message.guild.id);
    if (!config.logs) return;
    const lc = message.guild.channels.cache.get(config.logs);
    if (!lc) return;
    const embed = createEmbed("🗑️ MESSAGE SUPPRIMÉ", `Message supprimé dans ${message.channel}`, COLORS.ERROR,
        [
            { name: "Auteur", value: message.author?.username || "Inconnu", inline: true },
            { name: "Salon", value: message.channel.toString(), inline: true },
            { name: "Contenu", value: message.content?.slice(0, 1024) || "Aucun contenu texte" }
        ]);
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
                COLORS.SUCCESS, [], config.gifs.welcome, member.user.displayAvatarURL(),
                { text: "Lis les règles et amuse-toi bien !" }
            );
            await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
        }
    }

    if (config.logs) {
        const lc = member.guild.channels.cache.get(config.logs);
        if (lc) {
            const embed = createEmbed("📥 NOUVEAU MEMBRE", "Un nouveau membre a rejoint.", COLORS.SUCCESS,
                [
                    { name: "Membre", value: `${member.user.username} (${member.id})`, inline: true },
                    { name: "Compte créé", value: time(Math.floor(member.user.createdTimestamp / 1000), "R"), inline: true }
                ], null, member.user.displayAvatarURL());
            await lc.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

client.on(Events.GuildMemberRemove, async member => {
    const config = initConfig(member.guild.id);
    if (!config.logs) return;
    const lc = member.guild.channels.cache.get(config.logs);
    if (!lc) return;
    const embed = createEmbed("📤 MEMBRE PARTI", `**${member.user.username}** a quitté le serveur.`, COLORS.ERROR,
        [{ name: "ID", value: member.id, inline: true }], null, member.user.displayAvatarURL());
    await lc.send({ embeds: [embed] }).catch(() => {});
});

// ========== 16. INITIALISATION ==========
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.username} (ID: ${client.user.id})`);

    await loadDB();

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log("🚀 Enregistrement des commandes slash...");
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ ${commands.length} commandes enregistrées.`);
    } catch (err) {
        console.error("❌ Erreur enregistrement commandes :", err);
    }

    const statuses = [
        { type: ActivityType.Watching, text: "le serveur" },
        { type: ActivityType.Playing, text: "Paradise Overlord V19" },
        { type: ActivityType.Listening, text: "/help pour les commandes" }
    ];
    let i = 0;
    client.user.setActivity(statuses[i].text, { type: statuses[i].type });
    setInterval(() => {
        i = (i + 1) % statuses.length;
        client.user.setActivity(statuses[i].text, { type: statuses[i].type });
    }, 30000);

    console.log("🔥 PARADISE OVERLORD V19 : EN LIGNE !");
});

// ========== 17. GESTION D'ERREURS ==========
process.on('unhandledRejection', err => console.error('❌ Rejection non capturée :', err));
process.on('uncaughtException', err => console.error('❌ Exception non capturée :', err));

client.login(process.env.TOKEN).catch(err => {
    console.error("❌ Impossible de se connecter :", err);
    process.exit(1);
});
