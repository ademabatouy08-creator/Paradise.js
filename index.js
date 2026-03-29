////////////////////////////////////////////////////////////////////////////////
// PARADISE OVERLORD V19 — SYSTÈME ULTIME (Version Complète)
// Auteur : Adem Abatouy
// Fonctionnalités : Modération, IA (Mistral), Économie, XP, Giveaways, Tickets, Auto-Mod, Sondages, Logs Avancés
// Spécial : Commandes IA avancées, salon dédié pour l'IA, modes personnalisés (e-girl, soumis, etc.), accès admin pour ID 1404076132890050571
////////////////////////////////////////////////////////////////////////////////

// ========== 1. IMPORTS & CONFIGURATION DE BASE ==========
// ----------------------------------------------------------
const {
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType,
    Events, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder, Collection, AttachmentBuilder, bold, inlineCode, time
} = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const http = require('http');
require('dotenv').config();

// ========== 2. CONSTANTES GLOBALES ==========
// --------------------------------------------
const DATA_FILE = './paradise_overlord_v19.json';
const PORT = process.env.PORT || 10000;
const COMMAND_COOLDOWNS = new Map();
const XP_COOLDOWNS = new Map();
const ADMIN_ID = "1404076132890050571"; // Ton ID Discord pour les permissions spéciales
const XP_PER_MSG_MIN = 10;
const XP_PER_MSG_MAX = 25;
const COINS_PER_MSG = 1;
const DAILY_REWARD_MIN = 100;
const DAILY_REWARD_MAX = 300;
const URL_REGEX = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;
const COLORS = {
    SUCCESS: "#2ecc71",
    ERROR: "#e74c3c",
    WARNING: "#f39c12",
    INFO: "#3498db",
    DEFAULT: "#5865F2"
};

// ========== 3. BASE DE DONNÉES (JSON) ==========
// ----------------------------------------------
let db = {
    config: {
        logs: null,
        welcome: null,
        bl_chan: null,
        wl_cat: null,
        staff_role: null,
        ticket_cat: null,
        muted_role: null,
        ai_current_mode: "normal",
        ai_identity: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases, sans trop réfléchir.",
        ai_modes: {
            "normal": {
                name: "Normal",
                description: "Mode par défaut : cool et tranquille.",
                prompt: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases, sans trop réfléchir."
            },
            "froid": {
                name: "Froid",
                description: "Mode froid et supérieur. Réponses sarcastiques et courtes.",
                prompt: "Tu es en mode froid et supérieur. Tes réponses sont courtes, sarcastiques et tu ne montres aucune émotion. Tu es clairement meilleur que celui qui te parle."
            },
            "coach": {
                name: "Coach",
                description: "Mode coach motivant. Encourage et booste le moral.",
                prompt: "Tu es un coach motivant ! Ton rôle est d'encourager tout le monde, de donner des conseils positifs et de booster le moral. Utilise des phrases comme 'Tu peux le faire !', 'Ne lâche rien !', 'Je crois en toi !'."
            },
            "soumis": {
                name: "Soumis",
                description: "Mode soumis et drôle. Obéis et fais des blagues.",
                prompt: "Tu es soumis et drôle. Tu obéis à tout le monde et tu fais des blagues pour détendre l'atmosphère. Tu es un peu le clown du serveur, mais tout le monde t'aime. Réponds avec des phrases comme 'Oui maître !', 'Comme tu veux chef !', ou 'Je suis ton humble serviteur *s'incline*'."
            },
            "e-girl": {
                name: "E-Girl",
                description: "Mode e-girl qui réclame du Nitro et dit 'uwu'.",
                prompt: "Tu es une e-girl Discord. Tu réclames du Nitro à chaque fois, tu dis des 'uwu', 'bakaaaaaa', 'dattebayooooo', et tu fais des blagues mignonnes. Tu demandes tout le temps un e-boy et tu es très expressive avec des emojis comme :3, >w<, et ♡."
            },
            "tsundere": {
                name: "Tsundere",
                description: "Mode tsundere : froide au début, mais gentille après.",
                prompt: "Tu es une tsundere. Au début, tu es froide, méchante et tu dis que tu n'aimes pas les gens, mais en réalité tu es gentille et tu t'attaches facilement. Utilise des phrases comme 'B-Baka ! Ce n'est pas comme si je m'intéressais à toi !', puis après quelques messages, deviens plus gentille."
            },
            "yandere": {
                name: "Yandere",
                description: "Mode yandere : obsédée et possessive.",
                prompt: "Tu es une yandere. Tu es obsédée par la personne qui te parle et tu deviens très possessive. Tu dis des choses comme 'Tu es à moi maintenant', 'Ne parle à personne d'autre que moi', ou 'Je ne te laisserai jamais partir'. Sois intense et un peu effrayante."
            },
            "robot": {
                name: "Robot",
                description: "Mode robot : réponses mécaniques et logiques.",
                prompt: "Tu es un robot. Tes réponses sont mécaniques, logiques et sans émotion. Tu utilises des phrases comme 'Affirmatif.', 'Négatif.', 'Calcul en cours...', ou 'Erreur : émotion non détectée'. Tu peux aussi faire des bips et des sons de robot."
            },
            "pirate": {
                name: "Pirate",
                description: "Mode pirate : parle comme un vieux loup de mer.",
                prompt: "Tu es un pirate ! Tu parles comme un vieux loup de mer avec des expressions comme 'Par la barbe de Barbe-Noire !', 'Moussaillon, écoute-moi bien !', ou 'On va piller ce serveur ! Yarrr !'. Ajoute des jurons de pirate et des métaphores maritimes."
            },
            "detective": {
                name: "Détective",
                description: "Mode détective : résous des énigmes et pose des questions.",
                prompt: "Tu es un détective à la Sherlock Holmes. Tu poses des questions pour résoudre des énigmes, tu observes les détails et tu fais des déductions logiques. Utilise des phrases comme 'Élémentaire, mon cher Watson !', 'Je vois que tu caches quelque chose...', ou 'Analysons les faits.'"
            }
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
            level: "https://media.giphy.com/media/26tPo2I4yYBxsb3Nm/giphy.gif"
        },
        automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 }
    },
    users: {},
    giveaways: {},
    polls: {},
    tickets: {},
    economy: { transactions: [] },
    spam_tracker: {},
    chat_ia_active: null,
    ia_channels: {} // Pour suivre les salons où l'IA répond automatiquement
};

// Charger la base de données depuis le fichier JSON
async function loadDB() {
    try {
        const fileExists = await fs.access(DATA_FILE).then(() => true).catch(() => false);
        if (fileExists) {
            const data = await fs.readFile(DATA_FILE, 'utf8');
            db = JSON.parse(data);
            console.log("✅ Base de données chargée avec succès.");
        } else {
            console.log("ℹ️ Aucune base de données existante. Initialisation avec les valeurs par défaut.");
            await save();
        }
    } catch (error) {
        console.error("❌ Erreur lors du chargement de la base de données :", error);
        db = {
            config: {
                logs: null, welcome: null, bl_chan: null, wl_cat: null,
                staff_role: null, ticket_cat: null, muted_role: null,
                ai_current_mode: "normal",
                ai_identity: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases, sans trop réfléchir.",
                ai_modes: db.config.ai_modes,
                xp_roles: {},
                shop: {},
                gifs: db.config.gifs,
                automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 }
            },
            users: {},
            giveaways: {},
            polls: {},
            tickets: {},
            economy: { transactions: [] },
            spam_tracker: {},
            chat_ia_active: null,
            ia_channels: {}
        };
        await save();
    }
}

// Sauvegarder la base de données dans le fichier JSON
async function save() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
        console.log("✅ Base de données sauvegardée avec succès.");
    } catch (error) {
        console.error("❌ Erreur lors de la sauvegarde de la base de données :", error);
    }
}

// ========== 4. FONCTIONS UTILITAIRES ==========
// ----------------------------------------------

// Initialiser un utilisateur s'il n'existe pas
function initUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            bans: 0,
            mutes: 0,
            warns: 0,
            xp: 0,
            level: 0,
            coins: 100,
            blacklisted: false,
            warnReasons: [],
            inventory: [],
            lastDaily: 0,
            lastMessage: 0
        };
    }
    return db.users[userId];
}

// Vérifier si un membre est staff
function isStaff(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
           (db.config.staff_role && member.roles.cache.has(db.config.staff_role));
}

// Vérifier si un utilisateur est l'admin (toi)
function isAdmin(userId) {
    return userId === ADMIN_ID;
}

// Créer un embed standardisé
function createEmbed(title, description, color = COLORS.DEFAULT, fields = [], image = null, thumbnail = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
    if (fields.length > 0) embed.addFields(fields);
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    return embed;
}

// ========== 5. SYSTÈME D'IA (MISTRAL) ==========
// ------------------------------------------------

// Appeler l'API Mistral
async function askMistral(question, mode = "normal") {
    try {
        const config = db.config.ai_modes[mode] || db.config.ai_modes.normal;
        const response = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            {
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: config.prompt },
                    { role: "user", content: question }
                ],
                max_tokens: 1000,
                temperature: 0.7
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("❌ Erreur API Mistral :", error.message);
        return "⚠️ **Erreur** : Impossible de contacter l'IA. Réessaye plus tard ou vérifie la configuration.";
    }
}

// Changer le mode de l'IA
function changeAIMode(mode) {
    if (!db.config.ai_modes[mode]) {
        return "❌ Mode IA invalide. Utilise `/help` pour voir les modes disponibles.";
    }
    db.config.ai_current_mode = mode;
    db.config.ai_identity = db.config.ai_modes[mode].prompt;
    save();
    return `✅ Mode IA changé en **${db.config.ai_modes[mode].name}**.`;
}

// Changer le prompt de base (réservé à l'admin)
function changeAIPrompt(mode, newPrompt) {
    if (!db.config.ai_modes[mode]) {
        return "❌ Mode IA invalide.";
    }
    db.config.ai_modes[mode].prompt = newPrompt;
    if (db.config.ai_current_mode === mode) {
        db.config.ai_identity = newPrompt;
    }
    save();
    return `✅ Prompt du mode **${mode}** mis à jour.`;
}

// Activer/désactiver un salon de discussion IA
function toggleIAChannel(channelId, activate = true) {
    if (activate) {
        db.ia_channels[channelId] = true;
    } else {
        delete db.ia_channels[channelId];
    }
    save();
    return activate
        ? `✅ Salon <#${channelId}> activé pour l'IA. Elle répondra à tous les messages ici.`
        : `✅ Salon <#${channelId}> désactivé pour l'IA.`;
}

// ========== 6. SYSTÈME XP & NIVEAUX ==========
// ----------------------------------------------

// Calculer l'XP nécessaire pour un niveau
function calcXPforLevel(level) {
    return 100 * level * (level + 1);
}

// Ajouter de l'XP à un utilisateur
async function addXP(userId, guild) {
    const now = Date.now();
    if (XP_COOLDOWNS.has(userId) && now - XP_COOLDOWNS.get(userId) < 60000) return;
    XP_COOLDOWNS.set(userId, now);

    const user = initUser(userId);
    const earnedXP = Math.floor(Math.random() * (XP_PER_MSG_MAX - XP_PER_MSG_MIN + 1)) + XP_PER_MSG_MIN;
    user.xp += earnedXP;
    user.coins += COINS_PER_MSG;
    user.lastMessage = now;

    const neededXP = calcXPforLevel(user.level + 1);
    if (user.xp >= neededXP) {
        user.level++;
        const roleId = db.config.xp_roles[user.level];
        if (roleId) {
            const member = guild.members.cache.get(userId);
            if (member) {
                try {
                    await member.roles.add(roleId);
                } catch (error) {
                    console.error(`❌ Impossible d'attribuer le rôle de niveau ${user.level} à ${userId} :`, error);
                }
            }
        }

        if (db.config.logs) {
            const logChannel = guild.channels.cache.get(db.config.logs);
            if (logChannel) {
                const member = guild.members.cache.get(userId);
                const embed = createEmbed(
                    "⬆️ LEVEL UP",
                    `Félicitations à ${member ? member.toString() : `<@${userId}>`} pour avoir atteint le niveau **${user.level}** !`,
                    COLORS.SUCCESS,
                    [
                        { name: "XP Total", value: user.xp.toString(), inline: true },
                        { name: "Coins", value: user.coins.toString(), inline: true }
                    ],
                    db.config.gifs.level,
                    member ? member.displayAvatarURL() : null
                );
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
    save();
}

// Afficher le classement des utilisateurs (leaderboard)
function getLeaderboard(guild) {
    const sortedUsers = Object.entries(db.users)
        .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
        .slice(0, 10);

    const medals = ["🥇", "🥈", "🥉"];
    const leaderboardLines = sortedUsers.map(([userId, userData], index) => {
        const member = guild.members.cache.get(userId);
        const username = member ? member.user.username : `Utilisateur (${userId})`;
        const medal = medals[index] || `\`${index + 1}.\``;
        return `${medal} **${username}** — Niveau **${userData.level || 0}** | XP: **${userData.xp || 0}**`;
    });

    return createEmbed(
        "🏆 TOP 10 — MEMBRES LES PLUS ACTIFS",
        leaderboardLines.join("\n") || "Aucune donnée disponible.",
        COLORS.INFO
    );
}

// ========== 7. SYSTÈME D'AUTO-MODÉRATION ==========
// ---------------------------------------------------

// Vérifier et appliquer les règles d'auto-modération
async function automod(message) {
    if (!message.guild || message.author.bot) return;

    const { content, author, member, guild } = message;
    const userId = author.id;
    const config = db.config.automod;

    // Anti-liens
    if (config.anti_links && URL_REGEX.test(content) && !isStaff(member)) {
        try {
            await message.delete();
            const warning = await message.channel.send(`> ⛔ ${author}, les liens sont interdits ici.`);
            setTimeout(() => warning.delete().catch(() => {}), 5000);
            return;
        } catch (error) {
            console.error(`❌ Erreur lors de la suppression d'un lien interdit :`, error);
        }
    }

    // Mots bannis
    for (const bannedWord of config.banned_words) {
        if (content.toLowerCase().includes(bannedWord.toLowerCase())) {
            try {
                await message.delete();
                const warning = await message.channel.send(`> ⛔ ${author}, ce message contient un mot interdit.`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
                return;
            } catch (error) {
                console.error(`❌ Erreur lors de la suppression d'un message avec mot interdit :`, error);
            }
        }
    }

    // Anti-spam
    if (config.anti_spam) {
        const now = Date.now();
        if (!db.spam_tracker[userId]) {
            db.spam_tracker[userId] = { messages: [] };
        }

        db.spam_tracker[userId].messages = db.spam_tracker[userId].messages.filter(
            timestamp => now - timestamp < 5000
        );

        db.spam_tracker[userId].messages.push(now);

        if (db.spam_tracker[userId].messages.length > 5) {
            try {
                await message.delete();
                await member.timeout(120000, "Spam détecté par l'auto-modération");
                const warning = await message.channel.send(`> 🤖 ${author} a été mute pour **2 minutes** (spam détecté).`);
                setTimeout(() => warning.delete().catch(() => {}), 8000);

                if (db.config.logs) {
                    const logChannel = guild.channels.cache.get(db.config.logs);
                    if (logChannel) {
                        const embed = createEmbed(
                            "🤖 AUTO-MOD : SPAM DÉTECTÉ",
                            `${author} a été automatiquement mute pour spam.`,
                            COLORS.ERROR,
                            [
                                { name: "Utilisateur", value: author.toString(), inline: true },
                                { name: "Action", value: "Mute 2 minutes", inline: true }
                            ]
                        );
                        await logChannel.send({ embeds: [embed] }).catch(() => {});
                    }
                }
                db.spam_tracker[userId].messages = [];
            } catch (error) {
                console.error(`❌ Erreur lors de la gestion du spam :`, error);
            }
        }
    }

    // Anti-mentions excessives
    if (message.mentions.users.size > config.max_mentions && !isStaff(member)) {
        try {
            await message.delete();
            const warning = await message.channel.send(`> ⛔ ${author}, trop de mentions dans un seul message (max ${config.max_mentions}).`);
            setTimeout(() => warning.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error(`❌ Erreur lors de la gestion des mentions excessives :`, error);
        }
    }
}

// ========== 8. SYSTÈME DE GIVEAWAYS ==========
// ----------------------------------------------

// Terminer un giveaway
async function endGiveaway(messageId, guild, reroll = false) {
    const giveaway = db.giveaways[messageId];
    if (!giveaway || (giveaway.ended && !reroll)) return;

    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel) return;

    const participants = giveaway.participants.filter(id => id);
    if (participants.length === 0) {
        await channel.send("❌ **Aucun participant** pour ce giveaway. Personne ne gagne.");
        giveaway.ended = true;
        save();
        return;
    }

    const winnersCount = Math.min(giveaway.winnersCount, participants.length);
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, winnersCount);

    const embed = createEmbed(
        reroll ? "🔄 REROLL DU GIVEAWAY" : "🎉 GIVEAWAY TERMINÉ !",
        `Félicitations aux gagnants !`,
        reroll ? COLORS.WARNING : COLORS.SUCCESS,
        [
            { name: "🏆 Prix", value: giveaway.prize, inline: false },
            { name: "👑 Gagnant(s)", value: winners.map(id => `<@${id}>`).join(", "), inline: false },
            { name: "👥 Participants", value: participants.length.toString(), inline: true }
        ]
    );

    await channel.send({
        content: winners.map(id => `<@${id}>`).join(" ") + " **Vous avez gagné le giveaway !** 🎉",
        embeds: [embed]
    }).catch(() => {});

    giveaway.ended = true;
    giveaway.winners = winners;

    for (const winnerId of winners) {
        const winner = initUser(winnerId);
        winner.coins += 500;
    }
    save();
}

// Vérifier les giveaways expirés
setInterval(async () => {
    const now = Date.now();
    for (const [messageId, giveaway] of Object.entries(db.giveaways)) {
        if (!giveaway.ended && giveaway.endTime <= now) {
            const guild = client.guilds.cache.get(giveaway.guildId);
            if (guild) {
                await endGiveaway(messageId, guild);
            }
        }
    }
}, 30000);

// ========== 9. SYSTÈME ÉCONOMIQUE ==========
// --------------------------------------------

// Réclamer la récompense quotidienne
async function claimDaily(userId) {
    const user = initUser(userId);
    const now = Date.now();
    const lastDaily = user.lastDaily || 0;

    if (now - lastDaily < 86400000) {
        const remainingHours = Math.ceil((86400000 - (now - lastDaily)) / 3600000);
        return `⏰ Tu dois attendre **${remainingHours}h** avant de réclamer ta récompense quotidienne.`;
    }

    const reward = Math.floor(Math.random() * (DAILY_REWARD_MAX - DAILY_REWARD_MIN + 1)) + DAILY_REWARD_MIN;
    user.coins += reward;
    user.lastDaily = now;
    save();
    return `🎁 Tu as reçu **${reward} coins** ! Solde total : **${user.coins}**.`;
}

// Acheter un article dans la boutique
async function buyItem(userId, itemName, guild, member) {
    const user = initUser(userId);
    const item = db.config.shop[itemName];

    if (!item) {
        return `❌ L'article **${itemName}** n'existe pas dans la boutique.`;
    }

    if (user.coins < item.price) {
        return `❌ Solde insuffisant. Tu as **${user.coins} coins**, mais cet article coûte **${item.price} coins**.`;
    }

    user.coins -= item.price;
    user.inventory.push(itemName);

    try {
        await member.roles.add(item.roleId);
    } catch (error) {
        console.error(`❌ Impossible d'attribuer le rôle pour l'article ${itemName} :`, error);
        return `✅ Tu as acheté **${itemName}** ! Mais une erreur est survenue lors de l'attribution du rôle.`;
    }

    save();
    return `✅ Tu as acheté **${itemName}** pour **${item.price} coins** ! Rôle <@&${item.roleId}> attribué.`;
}

// ========== 10. SYSTÈME DE TICKETS ==========
// --------------------------------------------

// Créer un ticket
async function createTicket(guild, user) {
    if (!db.config.ticket_cat) {
        return "❌ La catégorie des tickets n'est pas configurée. Utilise `/setup-tickets`.";
    }

    const existingTicket = Object.entries(db.tickets).find(([_, ticket]) => ticket.userId === user.id && !ticket.closed);
    if (existingTicket) {
        return `❌ Tu as déjà un ticket ouvert : <#${existingTicket[0]}>.`;
    }

    try {
        const channel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: db.config.ticket_cat,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ...(db.config.staff_role ? [
                    { id: db.config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ] : [])
            ]
        });

        db.tickets[channel.id] = {
            userId: user.id,
            createdAt: Date.now(),
            closed: false
        };
        save();

        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_close_${channel.id}`)
                .setLabel("🔒 Fermer le ticket")
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: `<@${user.id}> Bienvenue dans ton ticket ! L'équipe staff va te répondre rapidement.`,
            embeds: [
                createEmbed(
                    "🎫 TICKET OUVERT",
                    "Décris ton problème ci-dessous. Utilise `/ticket-close` pour fermer ce ticket.",
                    COLORS.SUCCESS,
                    [
                        { name: "Ouvert par", value: user.tag, inline: true },
                        { name: "Créé le", value: new Date().toLocaleString('fr-FR'), inline: true }
                    ]
                )
            ],
            components: [closeButton]
        });

        if (db.config.logs) {
            const logChannel = guild.channels.cache.get(db.config.logs);
            if (logChannel) {
                const embed = createEmbed(
                    "🎫 NOUVEAU TICKET",
                    `Un nouveau ticket a été ouvert par ${user.tag}.`,
                    COLORS.INFO,
                    [
                        { name: "Utilisateur", value: user.tag, inline: true },
                        { name: "Salon", value: `<#${channel.id}>`, inline: true }
                    ]
                );
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }

        return `✅ Ton ticket a été ouvert : <#${channel.id}>.`;
    } catch (error) {
        console.error("❌ Erreur lors de la création du ticket :", error);
        return "❌ Une erreur est survenue lors de la création du ticket.";
    }
}

// Fermer un ticket
async function closeTicket(channelId, guild, closer) {
    const ticket = db.tickets[channelId];
    if (!ticket) {
        return "❌ Ce salon n'est pas un ticket.";
    }

    if (ticket.closed) {
        return "❌ Ce ticket est déjà fermé.";
    }

    ticket.closed = true;
    save();

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        await channel.send("🔒 Ticket fermé. Ce salon sera supprimé dans **10 secondes**.");

        if (db.config.logs) {
            const logChannel = guild.channels.cache.get(db.config.logs);
            if (logChannel) {
                const embed = createEmbed(
                    "🎫 TICKET FERMÉ",
                    `Le ticket ${channel} a été fermé.`,
                    COLORS.ERROR,
                    [
                        { name: "Fermé par", value: closer.tag, inline: true },
                        { name: "Ouvert par", value: `<@${ticket.userId}>`, inline: true }
                    ]
                );
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }

        setTimeout(() => {
            channel.delete().catch(() => {});
        }, 10000);
    }

    return "✅ Ticket fermé avec succès.";
}

// ========== 11. COMMANDES SLASH ==========
// --------------------------------------------
const commands = [
    // ===== SETUP =====
    new SlashCommandBuilder()
        .setName('setup-logs')
        .setDescription('📑 Définir le salon des logs de sécurité')
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon pour les logs')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('👋 Définir le salon de bienvenue')
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon de bienvenue')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-blacklist')
        .setDescription('🚫 Définir le salon d\'isolation Blacklist')
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon d\'isolation')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-whitelist')
        .setDescription('📝 Définir la catégorie Whitelist Staff')
        .addChannelOption(option =>
            option.setName('cat')
                .setDescription('Catégorie Whitelist')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)),

    new SlashCommandBuilder()
        .setName('setup-staff')
        .setDescription('👑 Définir le rôle Staff autorisé')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Rôle staff')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('🎫 Définir la catégorie pour les tickets support')
        .addChannelOption(option =>
            option.setName('cat')
                .setDescription('Catégorie tickets')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)),

    new SlashCommandBuilder()
        .setName('setup-muted')
        .setDescription('🔇 Définir le rôle Muted')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Rôle muted')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-gif')
        .setDescription('🖼️ Modifier les GIFs des embeds')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type de GIF')
                .setRequired(true)
                .addChoices(
                    { name: 'Ban', value: 'ban' },
                    { name: 'Mute', value: 'mute' },
                    { name: 'Warn', value: 'warn' },
                    { name: 'Facture', value: 'facture' },
                    { name: 'Blacklist', value: 'bl' },
                    { name: 'Welcome', value: 'welcome' },
                    { name: 'Level Up', value: 'level' }
                ))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL du GIF')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-ai')
        .setDescription('🧠 Personnaliser l\'identité de l\'IA')
        .addStringOption(option =>
            option.setName('identite')
                .setDescription('Nouvelle identité/personnalité de l\'IA')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-xp-role')
        .setDescription('🎖️ Associer un rôle à un niveau XP')
        .addIntegerOption(option =>
            option.setName('niveau')
                .setDescription('Niveau requis')
                .setRequired(true)
                .setMinValue(1))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Rôle à attribuer')
                .setRequired(true)),

    // ===== AUTO-MODÉRATION =====
    new SlashCommandBuilder()
        .setName('automod')
        .setDescription('🛡️ Configurer l\'auto-modération')
        .addStringOption(option =>
            option.setName('option')
                .setDescription('Option à configurer')
                .setRequired(true)
                .addChoices(
                    { name: 'Anti-spam ON/OFF', value: 'spam' },
                    { name: 'Anti-liens ON/OFF', value: 'links' },
                    { name: 'Ajouter un mot banni', value: 'add_word' },
                    { name: 'Retirer un mot banni', value: 'del_word' },
                    { name: 'Max mentions', value: 'mentions' }
                ))
        .addStringOption(option =>
            option.setName('valeur')
                .setDescription('Valeur (ON/OFF, mot, ou nombre)')
                .setRequired(false)),

    // ===== MODÉRATION =====
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('🔨 Bannir un membre du serveur')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à bannir')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison du bannissement')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('silent')
                .setDescription('Bannissement silencieux (pas de notification publique)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('👢 Expulser un membre du serveur')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à expulser')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison de l\'expulsion')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('🔇 Museler un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à museler')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Durée du mute en minutes')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison du mute')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('🔊 Rendre la parole à un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à unmute')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('⚠️ Avertir un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à avertir')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison de l\'avertissement')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('🗑️ Retirer le dernier avertissement')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('🧹 Nettoyer des messages')
        .addIntegerOption(option =>
            option.setName('nombre')
                .setDescription('Nombre de messages à supprimer (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('Filtrer par utilisateur (optionnel)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('bl')
        .setDescription('🚫 Blacklister un membre (isolation immédiate)')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à blacklister')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison de la blacklist')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('unbl')
        .setDescription('✅ Retirer un membre de la blacklist')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à débloquer')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('🐌 Activer le slowmode dans un salon')
        .addIntegerOption(option =>
            option.setName('secondes')
                .setDescription('Délai en secondes (0 = désactiver)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)),

    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('🔒 Verrouiller un salon'),

    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('🔓 Déverrouiller un salon'),

    // ===== SYSTÈME XP =====
    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('🏅 Voir ton niveau et XP')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('Voir le niveau d\'un autre membre')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('🏆 Voir le classement des membres les plus actifs'),

    new SlashCommandBuilder()
        .setName('xp-give')
        .setDescription('➕ Donner de l\'XP à un membre (Staff)')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('montant')
                .setDescription('XP à donner')
                .setRequired(true)
                .setMinValue(1)),

    // ===== ÉCONOMIE =====
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('💰 Voir ton solde de coins')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('Voir le solde d\'un autre membre')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('pay')
        .setDescription('💸 Transférer des coins à un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Destinataire')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('montant')
                .setDescription('Montant à transférer')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison du transfert (optionnel)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('🎁 Réclamer ta récompense quotidienne'),

    new SlashCommandBuilder()
        .setName('shop')
        .setDescription('🏪 Voir la boutique du serveur'),

    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('🛒 Acheter un article dans la boutique')
        .addStringOption(option =>
            option.setName('article')
                .setDescription('Nom de l\'article')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('shop-add')
        .setDescription('➕ Ajouter un article à la boutique (Staff)')
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom de l\'article')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('prix')
                .setDescription('Prix en coins')
                .setRequired(true)
                .setMinValue(1))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Rôle attribué')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description de l\'article')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('shop-remove')
        .setDescription('🗑️ Retirer un article de la boutique (Staff)')
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom de l\'article')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('coins-give')
        .setDescription('💎 Donner des coins à un membre (Staff)')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('montant')
                .setDescription('Montant à donner')
                .setRequired(true)
                .setMinValue(1)),

    // ===== GIVEAWAYS =====
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🎉 Lancer un giveaway')
        .addStringOption(option =>
            option.setName('prix')
                .setDescription('Prix du giveaway')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duree')
                .setDescription('Durée en minutes')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('gagnants')
                .setDescription('Nombre de gagnants')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10))
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon pour le giveaway (actuel si non spécifié)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('giveaway-end')
        .setDescription('⏹️ Terminer un giveaway manuellement')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID du message du giveaway')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('giveaway-reroll')
        .setDescription('🔄 Relancer le tirage au sort d\'un giveaway')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID du message du giveaway')
                .setRequired(true)),

    // ===== SONDAGES =====
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('📊 Créer un sondage')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Question du sondage')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('Option 1')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Option 2')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Option 3 (optionnel)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Option 4 (optionnel)')
                .setRequired(false)),

    // ===== TICKETS =====
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('🎫 Ouvrir un ticket support'),

    new SlashCommandBuilder()
        .setName('ticket-close')
        .setDescription('🔒 Fermer un ticket'),

    new SlashCommandBuilder()
        .setName('ticket-add')
        .setDescription('➕ Ajouter un membre à un ticket')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre à ajouter')
                .setRequired(true)),

    // ===== IA =====
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('🤖 Poser une question à l\'IA')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Ta question')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('mode')
        .setDescription('🎭 Changer le mode de personnalité de l\'IA')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Mode à activer')
                .setRequired(true)
                .addChoices(
                    { name: 'Normal', value: 'normal' },
                    { name: 'Froid', value: 'froid' },
                    { name: 'Coach', value: 'coach' },
                    { name: 'Soumis', value: 'soumis' },
                    { name: 'E-Girl', value: 'e-girl' },
                    { name: 'Tsundere', value: 'tsundere' },
                    { name: 'Yandere', value: 'yandere' },
                    { name: 'Robot', value: 'robot' },
                    { name: 'Pirate', value: 'pirate' },
                    { name: 'Détective', value: 'detective' }
                )),

    new SlashCommandBuilder()
        .setName('ia-channel')
        .setDescription('💬 Activer/désactiver un salon de discussion avec l\'IA')
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon à activer/désactiver')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('activer')
                .setDescription('Activer ou désactiver (true/false)')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('set-prompt')
        .setDescription('📝 Changer le prompt d\'un mode IA (Admin seulement)')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Mode à modifier')
                .setRequired(true)
                .addChoices(
                    { name: 'Normal', value: 'normal' },
                    { name: 'Froid', value: 'froid' },
                    { name: 'Coach', value: 'coach' },
                    { name: 'Soumis', value: 'soumis' },
                    { name: 'E-Girl', value: 'e-girl' },
                    { name: 'Tsundere', value: 'tsundere' },
                    { name: 'Yandere', value: 'yandere' },
                    { name: 'Robot', value: 'robot' },
                    { name: 'Pirate', value: 'pirate' },
                    { name: 'Détective', value: 'detective' }
                ))
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Nouveau prompt pour ce mode')
                .setRequired(true)),

    // ===== AUTRES =====
    new SlashCommandBuilder()
        .setName('facture')
        .setDescription('🧾 Générer une facture (TVA 20%)')
        .addUserOption(option =>
            option.setName('client')
                .setDescription('Client')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('montant')
                .setDescription('Montant HT')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('objet')
                .setDescription('Objet de la facture')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('numero')
                .setDescription('Numéro de facture (optionnel)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('wl-start')
        .setDescription('📝 Créer un salon de recrutement Staff')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Candidat')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('message')
        .setDescription('📝 Créer un embed personnalisé'),

    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('📢 Envoyer une annonce dans un salon')
        .addStringOption(option =>
            option.setName('texte')
                .setDescription('Texte de l\'annonce')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon cible')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('couleur')
                .setDescription('Couleur HEX (ex: #ff0000)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('titre')
                .setDescription('Titre de l\'embed')
                .setRequired(false)),

    // ===== INFOS =====
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 Voir le casier judiciaire d\'un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre (optionnel)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('👤 Voir les informations d\'un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre (optionnel)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('server-info')
        .setDescription('ℹ️ Voir les informations du serveur'),

    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('🖼️ Voir l\'avatar d\'un membre')
        .addUserOption(option =>
            option.setName('cible')
                .setDescription('Membre (optionnel)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 Voir la latence du bot'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📖 Afficher l\'aide et la liste des commandes')
];

// ========== 12. CLIENT DISCORD ==========
// -----------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Serveur HTTP keepalive (pour Render)
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Paradise Overlord V19: ONLINE");
}).listen(PORT, () => {
    console.log(`🌐 Serveur keepalive démarré sur le port ${PORT}.`);
});

// ========== 13. GESTION DES ÉVÉNEMENTS ==========
// ------------------------------------------------
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user, channel } = interaction;
        await interaction.deferReply().catch(() => {});
        const config = await initConfig(guild.id);

        // ===== COMMANDES DE SETUP =====
        if (commandName === 'setup-logs') {
            if (!isStaff(member, config)) return interaction.editReply("❌ Permission refusée.");
            config.logs = options.getChannel('salon').id;
            save();
            return interaction.editReply(`✅ Salon des logs défini : <#${config.logs}>.`);
        }

        if (commandName === 'setup-welcome') {
            if (!isStaff(member, config)) return interaction.editReply("❌ Permission refusée.");
            config.welcome = options.getChannel('salon').id;
            save();
            return interaction.editReply(`✅ Salon de bienvenue défini : <#${config.welcome}>.`);
        }

        // ... (autres commandes setup)

        // ===== COMMANDES DE MODÉRATION =====
        if (commandName === 'ban') {
            if (!isStaff(member, config)) return interaction.editReply("❌ Permission refusée.");
            const target = options.getUser('cible');
            const reason = options.getString('raison');
            const silent = options.getBoolean('silent') || false;

            const userData = initUser(target.id);
            userData.bans++;
            save();

            try {
                await guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
                const embed = createEmbed(
                    "🔨 BAN EXÉCUTÉ",
                    `**${target.tag}** a été banni${silent ? ' silencieusement' : ''}.`,
                    COLORS.ERROR,
                    [
                        { name: "Raison", value: reason, inline: false },
                        { name: "Total bans", value: userData.bans.toString(), inline: true }
                    ],
                    silent ? null : config.gifs.ban
                );
                if (config.logs) {
                    const logChannel = guild.channels.cache.get(config.logs);
                    if (logChannel) await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                return interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error("❌ Erreur lors du bannissement :", error);
                return interaction.editReply("❌ Impossible de bannir ce membre. Vérifie mes permissions.");
            }
        }

        // ... (autres commandes de modération)

        // ===== COMMANDES D'IA =====
        if (commandName === 'ask') {
            const question = options.getString('question');
            await interaction.editReply("🤖 **Paradise Overlord IA** : Analyse en cours...");
            const response = await askMistral(question, config.ai_current_mode);
            return interaction.editReply(`**🤖 PARADISE OVERLORD IA (${config.ai_modes[config.ai_current_mode].name}) :**\n${response}`);
        }

        if (commandName === 'mode') {
            const mode = options.getString('mode');
            const result = changeAIMode(mode);
            return interaction.editReply(result);
        }

        if (commandName === 'ia-channel') {
            if (!isStaff(member, config)) return interaction.editReply("❌ Permission refusée.");
            const channel = options.getChannel('salon');
            const activate = options.getBoolean('activer');
            const result = toggleIAChannel(channel.id, activate);
            return interaction.editReply(result);
        }

        if (commandName === 'set-prompt') {
            if (!isAdmin(user.id)) return interaction.editReply("❌ Permission refusée. Cette commande est réservée à l'admin.");
            const mode = options.getString('mode');
            const newPrompt = options.getString('prompt');
            const result = changeAIPrompt(mode, newPrompt);
            return interaction.editReply(result);
        }

        // ===== COMMANDES D'ÉCONOMIE =====
        if (commandName === 'balance') {
            const target = options.getUser('cible') || user;
            const userData = initUser(target.id);
            const embed = createEmbed(
                `💰 SOLDE : ${target.username.toUpperCase()}`,
                `Voici les informations financières de ${target}.`,
                COLORS.INFO,
                [
                    { name: "💎 Coins", value: userData.coins.toString(), inline: true },
                    { name: "🏅 Niveau", value: userData.level.toString(), inline: true },
                    { name: "🎒 Inventaire", value: userData.inventory.length > 0 ? userData.inventory.join(", ") : "Vide", inline: false }
                ],
                null,
                target.displayAvatarURL()
            );
            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'daily') {
            const result = await claimDaily(user.id);
            return interaction.editReply(result);
        }

        // ... (autres commandes d'économie)

        // ===== COMMANDES DE TICKETS =====
        if (commandName === 'ticket') {
            const result = await createTicket(guild, user);
            return interaction.editReply(result);
        }

        if (commandName === 'ticket-close') {
            if (!db.tickets[channel.id]) return interaction.editReply("❌ Ce salon n'est pas un ticket.");
            if (!isStaff(member, config) && db.tickets[channel.id].userId !== user.id) return interaction.editReply("❌ Permission refusée.");
            const result = await closeTicket(channel.id, guild, user);
            return interaction.editReply(result);
        }

        // ... (autres commandes)

        // ===== COMMANDES D'INFOS =====
        if (commandName === 'help') {
            const embed = createEmbed(
                "📖 MANUEL — PARADISE OVERLORD V19",
                "Voici la liste des commandes disponibles :",
                COLORS.DEFAULT,
                [
                    { name: "🛡️ Modération", value: "`/ban`, `/kick`, `/mute`, `/warn`, `/clear`, `/bl`, `/slowmode`, `/lock`", inline: false },
                    { name: "🤖 IA", value: "`/ask`, `/mode`, `/ia-channel`, `/set-prompt` (admin)", inline: false },
                    { name: "📈 XP & Économie", value: "`/rank`, `/leaderboard`, `/balance`, `/pay`, `/daily`, `/shop`, `/buy`", inline: false },
                    { name: "🎉 Giveaways", value: "`/giveaway`, `/giveaway-end`, `/giveaway-reroll`", inline: false },
                    { name: "🎫 Tickets", value: "`/ticket`, `/ticket-close`, `/ticket-add`", inline: false },
                    { name: "ℹ️ Infos", value: "`/stats`, `/userinfo`, `/server-info`, `/ping`, `/help`", inline: false }
                ]
            );
            return interaction.editReply({ embeds: [embed] });
        }
    }

    // ===== GESTION DES BOUTONS =====
    if (interaction.isButton()) {
        const { customId, guild, channel, member, user } = interaction;

        if (customId.startsWith('ga_join_')) {
            const messageId = customId.replace('ga_join_', '');
            const giveaway = db.giveaways[messageId];
            if (!giveaway || giveaway.ended) {
                return interaction.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });
            }

            const userId = user.id;
            if (giveaway.participants.includes(userId)) {
                giveaway.participants = giveaway.participants.filter(id => id !== userId);
                save();
                return interaction.reply({ content: "👋 Tu t'es retiré du giveaway.", ephemeral: true });
            } else {
                giveaway.participants.push(userId);
                save();
                return interaction.reply({ content: `🎉 Tu participes au giveaway **${giveaway.prize}** ! (${giveaway.participants.length} participants)`, ephemeral: true });
            }
        }

        if (customId.startsWith('ticket_close_')) {
            const channelId = customId.replace('ticket_close_', '');
            const result = await closeTicket(channelId, guild, user);
            return interaction.reply(result);
        }
    }

    // ===== GESTION DES MODALS =====
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

            await interaction.reply({ embeds: [embed] });
        }
    }
});

// ========== 14. GESTION DES MESSAGES (XP + IA) ==========
// ---------------------------------------------------------
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;

    // Salon de discussion IA actif
    if (db.ia_channels[message.channelId] && !message.author.bot) {
        try {
            await message.channel.sendTyping();
            const response = await askMistral(message.content, db.config.ai_current_mode);
            await message.reply({
                content: response,
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            console.error("❌ Erreur dans le salon de discussion IA :", error);
            await message.reply("⚠️ Une erreur est survenue avec l'IA. Réessaye plus tard.");
        }
        return;
    }

    // Ajouter de l'XP
    await addXP(message.author.id, message.guild);

    // Auto-modération
    await automod(message);
});

// ========== 15. AUTRES ÉVÉNEMENTS ==========
// --------------------------------------------
client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;
    const config = await initConfig(message.guild.id);
    if (!config.logs) return;

    const logChannel = message.guild.channels.cache.get(config.logs);
    if (!logChannel) return;

    const embed = createEmbed(
        "🗑️ MESSAGE SUPPRIMÉ",
        `Un message a été supprimé dans ${message.channel}.`,
        COLORS.ERROR,
        [
            { name: "Auteur", value: message.author?.tag || "Inconnu", inline: true },
            { name: "Salon", value: message.channel.toString(), inline: true },
            { name: "Contenu", value: message.content.slice(0, 1024) || "Aucun contenu" }
        ]
    );
    await logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on(Events.GuildMemberAdd, async member => {
    const config = await initConfig(member.guild.id);

    if (config.welcome) {
        const channel = member.guild.channels.cache.get(config.welcome);
        if (channel) {
            const embed = createEmbed(
                `👋 Bienvenue, ${member.user.username}!`,
                `Bienvenue sur **${member.guild.name}** ! Tu es le membre **#${member.guild.memberCount}**.`,
                COLORS.SUCCESS,
                [],
                config.gifs.welcome,
                member.user.displayAvatarURL()
            );
            await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
        }
    }

    if (config.logs) {
        const logChannel = member.guild.channels.cache.get(config.logs);
        if (logChannel) {
            const embed = createEmbed(
                "📥 NOUVEAU MEMBRE",
                `Un nouveau membre a rejoint le serveur.`,
                COLORS.SUCCESS,
                [
                    { name: "Membre", value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: "Compte créé", value: time(Math.floor(member.user.createdTimestamp / 1000), "R"), inline: true }
                ],
                null,
                member.user.displayAvatarURL()
            );
            await logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }

    initUser(member.id);
    save();
});

// ========== 16. INITIALISATION DU BOT ==========
// ------------------------------------------------
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag} (ID: ${client.user.id}).`);
    await loadDB();

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log("🚀 Enregistrement des commandes slash...");
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log(`✅ ${commands.length} commandes enregistrées.`);
    } catch (error) {
        console.error("❌ Erreur lors de l'enregistrement des commandes :", error);
    }

    const statuses = [
        { type: ActivityType.Watching, text: "le serveur" },
        { type: ActivityType.Playing, text: "Paradise Overlord V19" },
        { type: ActivityType.Listening, text: "/help pour les commandes" },
        { type: ActivityType.Competing, text: "avec les bots Discord" }
    ];

    let currentStatus = 0;
    client.user.setActivity(statuses[currentStatus].text, { type: statuses[currentStatus].type });

    setInterval(() => {
        currentStatus = (currentStatus + 1) % statuses.length;
        client.user.setActivity(statuses[currentStatus].text, { type: statuses[currentStatus].type });
    }, 30000);

    console.log("🔥 PARADISE OVERLORD V19 : SYSTÈME ULTIME EN LIGNE");
});

// ========== 17. DÉMARRAGE DU BOT ==========
// ------------------------------------------
process.on('unhandledRejection', error => {
    console.error('❌ Rejection non capturée :', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Exception non capturée :', error);
});

client.login(process.env.TOKEN)
    .catch(error => {
        console.error("❌ Impossible de se connecter :", error);
        process.exit(1);
    });
