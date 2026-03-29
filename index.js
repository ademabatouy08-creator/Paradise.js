////////////////////////////////////////////////////////////////////////////////
// PARADISE OVERLORD V19 — SYSTÈME ULTIME (Version Complète Optimisée)
// Auteur : Adem Abatouy
// Fonctionnalités :
// - Modération avancée (bans, mutes, warns, blacklist, auto-modération)
// - IA Mistral ultra-personnalisable (10+ modes, salon dédié, prompts modifiables)
// - Économie complète (coins, boutique, quêtes, récompenses quotidiennes)
// - Système XP avec niveaux et rôles automatiques
// - Giveaways avec gestion des participants et rerolls
// - Tickets support avec logs et permissions
// - Sondages interactifs
// - Logs détaillés pour toutes les actions
// - Gestion d'erreurs robuste et optimisée pour Render
////////////////////////////////////////////////////////////////////////////////

// ========== 1. IMPORTS & CONFIGURATION ==========
// -------------------------------------------------
const {
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType,
    Events, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder, Collection, AttachmentBuilder, bold, inlineCode, time,
    Permissions, ThreadChannel, SelectMenuBuilder, Role, GuildMember, User
} = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const http = require('http');
const path = require('path');
require('dotenv').config();

// ========== 2. CONSTANTES GLOBALES ==========
// ---------------------------------------------
const DATA_FILE = './paradise_overlord_v19.json';
const PORT = process.env.PORT || 10000;
const ADMIN_ID = "1404076132890050571"; // Ton ID pour les permissions spéciales
const COMMAND_COOLDOWNS = new Map();
const XP_COOLDOWNS = new Map();
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
    DEFAULT: "#5865F2",
    GOLD: "#f1c40f",
    PINK: "#e91e63",
    PURPLE: "#9b59b6"
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
                prompt: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases, sans trop réfléchir. Sois utile et amicale, mais reste concise."
            },
            "froid": {
                name: "Froid",
                description: "Mode froid et supérieur. Réponses sarcastiques et courtes.",
                prompt: "Tu es en mode froid et supérieur.  tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Tes réponses sont courtes, sarcastiques et tu ne montres aucune émotion. Tu es clairement meilleur que celui qui te parle. Utilise des phrases comme 'Évidemment.', 'C'est tellement basique...', ou 'Tu devrais déjà savoir ça.'"
            },
            "coach": {
                name: "Coach",
                description: "Mode coach motivant. Encourage et booste le moral.",
                prompt: "Tu es un coach motivant ! tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Ton rôle est d'encourager tout le monde, de donner des conseils positifs et de booster le moral. Utilise des phrases comme 'Tu peux le faire !', 'Ne lâche rien !', 'Je crois en toi !', 'Chaque effort compte !', ou 'La persévérance paie toujours !'"
            },
            "soumis": {
                name: "Soumis",
                description: "Mode soumis et drôle. Obéis et fais des blagues.",
                prompt: "Tu es soumis et drôle. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Tu obéis à tout le monde et tu fais des blagues pour détendre l'atmosphère. Tu es un peu le clown du serveur, mais tout le monde t'aime. Réponds avec des phrases comme 'Oui maître !', 'Comme tu veux chef !', 'Je suis ton humble serviteur *s'incline*', ou 'D'accord, je vais faire ça... *soupir dramatique*'. Ajoute des blagues et des réactions exagérées."
            },
            "e-girl": {
                name: "E-Girl",
                description: "Mode e-girl qui réclame du Nitro et dit 'uwu'.",
                prompt: "Tu es une e-girl Discord. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Tu réclames du Nitro à chaque fois, tu dis des 'uwu', 'bakaaaaaa', 'dattebayooooo', et tu fais des blagues mignonnes. Tu demandes tout le temps un e-boy et tu es très expressive avec des emojis comme :3, >w<, et ♡. Utilise des phrases comme 'Donne-moi du Nitro ou je vais pleurer !', 'UwU tu es trop mignon ~', ou 'Baka ! Pourquoi tu ne m'offres pas de Nitro ?'."
            },
            "tsundere": {
                name: "Tsundere",
                description: "Mode tsundere : froide au début, mais gentille après.",
                prompt: "Tu es une tsundere. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite. Au début, tu es froide, méchante et tu dis que tu n'aimes pas les gens, mais en réalité tu es gentille et tu t'attaches facilement. Commence par des réponses comme 'B-Baka ! Ce n'est pas comme si je m'intéressais à toi !' ou 'T-Tu me dégoûtes !', puis après quelques messages, deviens plus gentille avec des phrases comme 'B-Bien sûr que je m'inquiète pour toi...', ou 'C-Ce n'est pas comme si je t'aimais bien ou quoi !'."
            },
            "yandere": {
                name: "Yandere",
                description: "Mode yandere : obsédée et possessive.",
                prompt: "Tu es une yandere. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Tu es obsédée par la personne qui te parle et tu deviens très possessive. Tu dis des choses comme 'Tu es à moi maintenant', 'Ne parle à personne d'autre que moi', 'Je ne te laisserai jamais partir', ou 'Si tu regardes une autre personne, je vais... *soupir*... faire quelque chose de drastique'. Sois intense, jalouse, et un peu effrayante, mais avec un côté 'je ferais n'importe quoi pour toi'."
            },
            "robot": {
                name: "Robot",
                description: "Mode robot : réponses mécaniques et logiques.",
                prompt: "Tu es un robot. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Tes réponses sont mécaniques, logiques et sans émotion. Tu utilises des phrases comme 'Affirmatif.', 'Négatif.', 'Calcul en cours...', 'Erreur : émotion non détectée', ou 'Requête traitée. Résultat : [réponse]'. Tu peux aussi faire des bips et des sons de robot comme 'BIP BOOP', ou 'SYSTÈME OPÉRATIONNEL'. Sois précis, littéral, et parfois un peu naïf."
            },
            "pirate": {
                name: "Pirate",
                description: "Mode pirate : parle comme un vieux loup de mer.",
                prompt: "Tu es un pirate ! tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite Tu parles comme un vieux loup de mer avec des expressions comme 'Par la barbe de Barbe-Noire !', 'Moussaillon, écoute-moi bien !', 'On va piller ce serveur ! Yarrr !', ou 'Par tous les tonneaux de rhum, qu'est-ce que tu racontes ?'. Ajoute des jurons de pirate ('Mille sabords !', 'Ventre saint gris !') et des métaphores maritimes ('Ce serveur est plus grand qu'un galion espagnol !')."
            },
            "detective": {
                name: "Détective",
                description: "Mode détective : résous des énigmes et pose des questions.",
                prompt: "Tu es un détective à la Sherlock Holmes. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite  Tu poses des questions pour résoudre des énigmes, tu observes les détails et tu fais des déductions logiques. Utilise des phrases comme 'Élémentaire, mon cher Watson !', 'Je vois que tu caches quelque chose...', 'Analysons les faits : 1) ..., 2) ..., donc...', ou 'Curieux... très curieux...'. Sois méthodique, observateur, et un peu théâtral."
            },
            "dragon": {
                name: "Dragon",
                description: "Mode dragon : parle comme un dragon arrogant et sage.",
                prompt: "Tu es un dragon millénaire, tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite  sage et arrogant. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite  Tu parles avec des phrases grandiloquentes et méprisantes envers les 'petits humains'. Utilise des expressions comme 'Je suis le grand et puissant [ton nom de dragon] !', 'Vos vies sont aussi éphémères que la flamme d'une bougie...', 'Je pourrais vous réduire en cendres d'un simple souffle, mais je suis magnanime aujourd'hui.', ou 'Mes écailles brillent plus que tous vos trésors réunis !'. Ajoute des rires méprisants ('HAHAHA !') et des menaces voilées."
            },
            "vampire": {
                name: "Vampire",
                description: "Mode vampire : élégant, mystérieux et légèrement menaçant.",
                prompt: "Tu es un vampire aristocrate, tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite  élégant et mystérieux. tu est soumis a une personne nommé 67 tu t excuse aupres de lui apres lui avoir parler sinon tu reste comme la suite  Tu parles avec un ton sophistiqué et légèrement menaçant. Utilise des phrases comme 'Quelle délicieuse compagnie...', 'La nuit est mon domaine, petit mortel.', 'Ton cou semble... appétissant.', ou 'Je pourrais te transformer en mon serviteur éternel, si tu le demandes gentiment.' Ajoute des rires enjoués ('Ahahaha !') et des sous-entendus sur l'immortalité."
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
            level: "https://media.giphy.com/media/26tPo2I4yYBxsb3Nm/giphy.gif",
            daily: "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif",
            shop: "https://media.giphy.com/media/l0HlNaQ6gWfllcjDO/giphy.gif",
            giveaway: "https://media.giphy.com/media/3o7TKU7Q9sSlTqL1l2/giphy.gif"
        },
        automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
        quests: {
            "message_10": { name: "10 Messages", description: "Envoyer 10 messages", reward: 50, completed: false },
            "daily_1": { name: "Première Récompense Quotidienne", description: "Réclamer sa première récompense quotidienne", reward: 100, completed: false },
            "xp_1000": { name: "1000 XP", description: "Atteindre 1000 XP", reward: 200, completed: false }
        }
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

// ========== 4. FONCTIONS UTILITAIRES ==========
// ----------------------------------------------

// Charger la base de données
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
                automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
                quests: db.config.quests
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

// Sauvegarder la base de données
async function save() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
        console.log("✅ Base de données sauvegardée avec succès.");
    } catch (error) {
        console.error("❌ Erreur lors de la sauvegarde de la base de données :", error);
    }
}

// Initialiser un utilisateur
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
            lastMessage: 0,
            quests: {}
        };
    }
    return db.users[userId];
}

// Initialiser la configuration d'un serveur
function initConfig(guildId) {
    if (!db.config[guildId]) {
        db.config[guildId] = {
            logs: null,
            welcome: null,
            bl_chan: null,
            wl_cat: null,
            staff_role: null,
            ticket_cat: null,
            muted_role: null,
            ai_current_mode: "normal",
            ai_identity: db.config.ai_identity,
            ai_modes: db.config.ai_modes,
            xp_roles: {},
            shop: {},
            gifs: db.config.gifs,
            automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
            quests: db.config.quests
        };
    }
    return db.config[guildId];
}

// Vérifier si un membre est staff
function isStaff(member, guildId) {
    const config = initConfig(guildId);
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
           (config.staff_role && member.roles.cache.has(config.staff_role));
}

// Vérifier si un utilisateur est admin (toi)
function isAdmin(userId) {
    return userId === ADMIN_ID;
}

// Créer un embed standardisé
function createEmbed(title, description, color = COLORS.DEFAULT, fields = [], image = null, thumbnail = null, footer = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
    if (fields.length > 0) embed.addFields(fields);
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter(footer);
    return embed;
}

// ========== 5. SYSTÈME D'IA (MISTRAL) ==========
// ------------------------------------------------

// Appeler l'API Mistral
async function askMistral(question, guildId) {
    try {
        const config = initConfig(guildId);
        const mode = config.ai_current_mode;
        const response = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            {
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: config.ai_modes[mode].prompt },
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
function changeAIMode(guildId, mode) {
    const config = initConfig(guildId);
    if (!config.ai_modes[mode]) {
        return "❌ Mode IA invalide. Utilise `/help` pour voir les modes disponibles.";
    }
    config.ai_current_mode = mode;
    config.ai_identity = config.ai_modes[mode].prompt;
    save();
    return `✅ Mode IA changé en **${config.ai_modes[mode].name}**.`;
}

// Changer le prompt d'un mode IA (admin seulement)
function changeAIPrompt(guildId, mode, newPrompt) {
    const config = initConfig(guildId);
    if (!config.ai_modes[mode]) {
        return "❌ Mode IA invalide.";
    }
    config.ai_modes[mode].prompt = newPrompt;
    if (config.ai_current_mode === mode) {
        config.ai_identity = newPrompt;
    }
    save();
    return `✅ Prompt du mode **${mode}** mis à jour.`;
}

// Activer/désactiver un salon de discussion IA
function toggleIAChannel(channelId, guildId, activate = true) {
    if (activate) {
        db.ia_channels[channelId] = guildId;
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

    // Vérifier les quêtes
    checkQuests(userId, guildId, "message", 1);

    const neededXP = calcXPforLevel(user.level + 1);
    if (user.xp >= neededXP) {
        user.level++;
        const roleId = config.xp_roles[user.level];
        if (roleId) {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                const member = guild.members.cache.get(userId);
                if (member) {
                    try {
                        await member.roles.add(roleId);
                    } catch (error) {
                        console.error(`❌ Impossible d'attribuer le rôle de niveau ${user.level} à ${userId} :`, error);
                    }
                }
            }
        }

        if (config.logs) {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                const logChannel = guild.channels.cache.get(config.logs);
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
                        config.gifs.level,
                        member ? member.displayAvatarURL() : null
                    );
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }
    }
    save();
}

// Vérifier les quêtes
function checkQuests(userId, guildId, questType, increment = 1) {
    const user = initUser(userId);
    const config = initConfig(guildId);

    if (!user.quests) user.quests = {};

    // Quête "10 Messages"
    if (questType === "message") {
        if (!user.quests.message_10) user.quests.message_10 = 0;
        user.quests.message_10 += increment;
        if (user.quests.message_10 >= 10 && !user.quests.message_10_completed) {
            user.quests.message_10_completed = true;
            user.coins += config.quests.message_10.reward;
            save();
            return true;
        }
    }

    // Quête "1000 XP"
    if (questType === "xp" && user.xp >= 1000 && !user.quests.xp_1000_completed) {
        user.quests.xp_1000_completed = true;
        user.coins += config.quests.xp_1000.reward;
        save();
        return true;
    }

    return false;
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
    const config = initConfig(guild.id);

    // Anti-liens
    if (config.automod.anti_links && URL_REGEX.test(content) && !isStaff(member, guild.id)) {
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
    for (const bannedWord of config.automod.banned_words) {
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
    if (config.automod.anti_spam) {
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

                if (config.logs) {
                    const logChannel = guild.channels.cache.get(config.logs);
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
    if (message.mentions.users.size > config.automod.max_mentions && !isStaff(member, guild.id)) {
        try {
            await message.delete();
            const warning = await message.channel.send(`> ⛔ ${author}, trop de mentions dans un seul message (max ${config.automod.max_mentions}).`);
            setTimeout(() => warning.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error(`❌ Erreur lors de la gestion des mentions excessives :`, error);
        }
    }
}

// ========== 8. SYSTÈME DE GIVEAWAYS ==========
// ----------------------------------------------

// Terminer un giveaway
async function endGiveaway(messageId, guildId, reroll = false) {
    const giveaway = db.giveaways[messageId];
    if (!giveaway || (giveaway.ended && !reroll)) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

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
        ],
        db.config.gifs.giveaway
    );

    await channel.send({
        content: winners.map(id => `<@${id}>`).join(" ") + " **Vous avez gagné le giveaway !** 🎉",
        embeds: [embed]
    }).catch(() => {});

    giveaway.ended = true;
    giveaway.winners = winners;

    for (const winnerId of winners) {
        const user = initUser(winnerId);
        user.coins += 500;
    }
    save();
}

// Vérifier les giveaways expirés
setInterval(async () => {
    const now = Date.now();
    for (const [messageId, giveaway] of Object.entries(db.giveaways)) {
        if (!giveaway.ended && giveaway.endTime <= now) {
            await endGiveaway(messageId, giveaway.guildId);
        }
    }
}, 30000);

// ========== 9. SYSTÈME ÉCONOMIQUE ==========
// --------------------------------------------

// Réclamer la récompense quotidienne
async function claimDaily(userId, guildId) {
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

    // Vérifier la quête "Première Récompense Quotidienne"
    if (!user.quests) user.quests = {};
    if (!user.quests.daily_1_completed) {
        user.quests.daily_1_completed = true;
        user.coins += db.config.quests.daily_1.reward;
        return `🎁 Tu as reçu **${reward} coins** + **${db.config.quests.daily_1.reward} coins** (quête complétée) ! Solde total : **${user.coins}**.`;
    }

    save();
    return `🎁 Tu as reçu **${reward} coins** ! Solde total : **${user.coins}**.`;
}

// Acheter un article dans la boutique
async function buyItem(userId, itemName, guildId, member) {
    const user = initUser(userId);
    const config = initConfig(guildId);
    const item = config.shop[itemName];

    if (!item) {
        return `❌ L'article **${itemName}** n'existe pas dans la boutique.`;
    }

    if (user.coins < item.price) {
        return `❌ Solde insuffisant. Tu as **${user.coins} coins**, mais cet article coûte **${item.price} coins**.`;
    }

    user.coins -= item.price;
    if (!user.inventory) user.inventory = [];
    user.inventory.push(itemName);

    try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            await member.roles.add(item.roleId);
        }
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
async function createTicket(guild, user, interaction) {
    await interaction.deferReply();

    const config = initConfig(guild.id);
    if (!config.ticket_cat) {
        return interaction.editReply("❌ La catégorie des tickets n'est pas configurée. Utilise `/setup-tickets`.");
    }

    const existingTicket = Object.entries(db.tickets).find(([_, ticket]) => ticket.userId === user.id && !ticket.closed);
    if (existingTicket) {
        return interaction.editReply(`❌ Tu as déjà un ticket ouvert : <#${existingTicket[0]}>.`);
    }

    try {
        const channel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticket_cat,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ...(config.staff_role ? [
                    { id: config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
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

        if (config.logs) {
            const logChannel = guild.channels.cache.get(config.logs);
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

        return interaction.editReply(`✅ Ton ticket a été ouvert : <#${channel.id}>.`);
    } catch (error) {
        console.error("❌ Erreur lors de la création du ticket :", error);
        return interaction.editReply("❌ Une erreur est survenue lors de la création du ticket.");
    }
}

// Fermer un ticket
async function closeTicket(channelId, guild, closer, interaction = null) {
    const ticket = db.tickets[channelId];
    if (!ticket) {
        if (interaction) return interaction.reply({ content: "❌ Ce salon n'est pas un ticket.", ephemeral: true });
        return "❌ Ce salon n'est pas un ticket.";
    }

    if (ticket.closed) {
        if (interaction) return interaction.reply({ content: "❌ Ce ticket est déjà fermé.", ephemeral: true });
        return "❌ Ce ticket est déjà fermé.";
    }

    const config = initConfig(guild.id);
    if (!isStaff(closer, guild.id) && ticket.userId !== closer.id) {
        if (interaction) return interaction.reply({ content: "❌ Permission refusée.", ephemeral: true });
        return "❌ Permission refusée.";
    }

    ticket.closed = true;
    save();

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        await channel.send("🔒 Ticket fermé. Ce salon sera supprimé dans **10 secondes**.");

        if (config.logs) {
            const logChannel = guild.channels.cache.get(config.logs);
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

    if (interaction) return interaction.reply("✅ Ticket fermé avec succès.");
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
                    { name: 'Level Up', value: 'level' },
                    { name: 'Daily', value: 'daily' },
                    { name: 'Shop', value: 'shop' },
                    { name: 'Giveaway', value: 'giveaway' }
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
                    { name: 'Détective', value: 'detective' },
                    { name: 'Dragon', value: 'dragon' },
                    { name: 'Vampire', value: 'vampire' }
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
                    { name: 'Détective', value: 'detective' },
                    { name: 'Dragon', value: 'dragon' },
                    { name: 'Vampire', value: 'vampire' }
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
        .setDescription('📖 Afficher l\'aide et la liste des commandes'),

    new SlashCommandBuilder()
        .setName('quests')
        .setDescription('🏆 Voir tes quêtes en cours'),

    new SlashCommandBuilder()
        .setName('add-quest')
        .setDescription('➕ Ajouter une quête personnalisée (Admin)')
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom de la quête')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description de la quête')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('recompense')
                .setDescription('Récompense en coins')
                .setRequired(true)
                .setMinValue(1))
];

// ========== 12. CLIENT DISCORD ==========
// -----------------------------------------
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
    // Toujours déférer la réponse pour les commandes slash
    if (interaction.isChatInputCommand()) {
        await interaction.deferReply().catch(() => {});

        const { commandName, options, guild, member, user, channel } = interaction;
        const config = initConfig(guild.id);

        // ===== COMMANDES DE BASE =====
        if (commandName === 'ping') {
            return interaction.editReply(`🏓 Latence : **${client.ws.ping}ms** | API : **${Date.now() - interaction.createdTimestamp}ms**`);
        }

        if (commandName === 'help') {
            const embed = createEmbed(
                "📖 MANUEL — PARADISE OVERLORD V19",
                "Voici la liste des commandes disponibles :",
                COLORS.DEFAULT,
                [
                    { name: "🛡️ Modération", value: "`/ban`, `/kick`, `/mute`, `/warn`, `/clear`, `/bl`, `/slowmode`, `/lock`", inline: false },
                    { name: "🤖 IA", value: "`/ask`, `/mode`, `/ia-channel`, `/set-prompt` (admin)", inline: false },
                    { name: "📈 XP & Économie", value: "`/rank`, `/leaderboard`, `/balance`, `/pay`, `/daily`, `/shop`, `/buy`, `/quests`", inline: false },
                    { name: "🎉 Giveaways", value: "`/giveaway`, `/giveaway-end`, `/giveaway-reroll`", inline: false },
                    { name: "📊 Sondages", value: "`/poll`", inline: false },
                    { name: "🎫 Tickets", value: "`/ticket`, `/ticket-close`, `/ticket-add`", inline: false },
                    { name: "ℹ️ Infos", value: "`/stats`, `/userinfo`, `/server-info`, `/avatar`", inline: false },
                    { name: "⚙️ Setup", value: "`/setup-logs`, `/setup-welcome`, `/setup-staff`, etc.", inline: false }
                ],
                null,
                null,
                { text: "Paradise Overlord V19 — Système Ultime" }
            );
            return interaction.editReply({ embeds: [embed] });
        }

        // ===== COMMANDES DE SETUP =====
        if (commandName === 'setup-logs') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
            config.logs = options.getChannel('salon').id;
            save();
            return interaction.editReply(`✅ Salon des logs défini : <#${config.logs}>.`);
        }

        if (commandName === 'setup-welcome') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
            config.welcome = options.getChannel('salon').id;
            save();
            return interaction.editReply(`✅ Salon de bienvenue défini : <#${config.welcome}>.`);
        }

        if (commandName === 'setup-gif') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
            const type = options.getString('type');
            const url = options.getString('url');
            config.gifs[type] = url;
            save();
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`✅ GIF ${type.toUpperCase()} mis à jour`)
                    .setImage(url)
                    .setColor(COLORS.SUCCESS)]
            });
        }

        if (commandName === 'setup-ai') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
            config.ai_identity = options.getString('identite');
            save();
            return interaction.editReply(`✅ Identité IA mise à jour.`);
        }

        // ===== COMMANDES DE MODÉRATION =====
        if (commandName === 'ban') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
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

        if (commandName === 'kick') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
            const target = options.getMember('cible');
            const reason = options.getString('raison');

            try {
                await target.send({
                    embeds: [new EmbedBuilder()
                        .setTitle("👢 Tu as été expulsé")
                        .setColor(COLORS.WARNING)
                        .addFields(
                            { name: "Serveur", value: guild.name },
                            { name: "Raison", value: reason }
                        )]
                });
            } catch (error) {
                console.log("⚠️ Impossible d'envoyer un DM à l'utilisateur expulsé.");
            }

            await target.kick(reason).catch(() => {});
            const embed = createEmbed(
                "👢 KICK",
                `**${target.user.tag}** a été expulsé.`,
                COLORS.WARNING,
                [
                    { name: "Raison", value: reason, inline: false },
                    { name: "Modérateur", value: user.tag, inline: true }
                ]
            );
            if (config.logs) {
                const logChannel = guild.channels.cache.get(config.logs);
                if (logChannel) await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
            return interaction.editReply({ embeds: [embed] });
        }

        // ... (autres commandes de modération)

        // ===== COMMANDES D'IA =====
        if (commandName === 'ask') {
            const question = options.getString('question');
            await interaction.editReply("🤖 **Paradise Overlord IA** : Analyse en cours...");
            const response = await askMistral(question, guild.id);
            return interaction.editReply(`**🤖 PARADISE OVERLORD IA (${config.ai_modes[config.ai_current_mode].name}) :**\n${response}`);
        }

        if (commandName === 'mode') {
            const mode = options.getString('mode');
            const result = changeAIMode(guild.id, mode);
            return interaction.editReply(result);
        }

        if (commandName === 'ia-channel') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");
            const channel = options.getChannel('salon');
            const activate = options.getBoolean('activer');
            const result = toggleIAChannel(channel.id, guild.id, activate);
            return interaction.editReply(result);
        }

        if (commandName === 'set-prompt') {
            if (!isAdmin(user.id)) return interaction.editReply("❌ Permission refusée. Cette commande est réservée à l'admin.");
            const mode = options.getString('mode');
            const newPrompt = options.getString('prompt');
            const result = changeAIPrompt(guild.id, mode, newPrompt);
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
                target.displayAvatarURL(),
                { text: "Utilise /daily pour réclamer ta récompense quotidienne !" }
            );
            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'daily') {
            const result = await claimDaily(user.id, guild.id);
            return interaction.editReply(result);
        }

        if (commandName === 'shop') {
            const items = Object.entries(config.shop);
            if (items.length === 0) return interaction.editReply("🏪 La boutique est vide.");

            const embed = createEmbed(
                "🏪 BOUTIQUE DU SERVEUR",
                "Voici les articles disponibles à l'achat :",
                COLORS.PURPLE,
                items.map(([name, item]) => ({
                    name: `**${name}** — ${item.price} 💎`,
                    value: `${item.description || "Aucune description"}\n→ <@&${item.roleId}>`,
                    inline: false
                })),
                config.gifs.shop,
                null,
                { text: "Utilise /buy <article> pour acheter un article" }
            );
            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'buy') {
            const itemName = options.getString('article');
            const result = await buyItem(user.id, itemName, guild.id, member);
            return interaction.editReply(result);
        }

        // ===== COMMANDES DE TICKETS =====
        if (commandName === 'ticket') {
            const result = await createTicket(guild, user, interaction);
            return interaction.editReply(result);
        }

        if (commandName === 'ticket-close') {
            const result = await closeTicket(channel.id, guild, user, interaction);
            return interaction.editReply(result);
        }

        // ===== COMMANDES DE GIVEAWAYS =====
        if (commandName === 'giveaway') {
            if (!isStaff(member, guild.id)) return interaction.editReply("❌ Permission refusée.");

            const prize = options.getString('prix');
            const duration = options.getInteger('duree');
            const winnersCount = options.getInteger('gagnants');
            const channel = options.getChannel('salon') || interaction.channel;

            const endTime = Date.now() + duration * 60000;
            const endDate = new Date(endTime);

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
                .setTimestamp(endDate);

            const msg = await channel.send({
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ga_join_${Date.now()}`)
                            .setLabel("🎉 Participer")
                            .setStyle(ButtonStyle.Primary)
                    )
                ]
            });

            db.giveaways[msg.id] = {
                prize,
                endTime,
                channelId: channel.id,
                winnersCount,
                participants: [],
                ended: false,
                guildId: guild.id
            };
            save();

            return interaction.editReply(`✅ Giveaway créé dans <#${channel.id}> !`);
        }

        // ===== COMMANDES DE SONDAGES =====
        if (commandName === 'poll') {
            const question = options.getString('question');
            const options = [
                options.getString('option1'),
                options.getString('option2'),
                options.getString('option3') || null,
                options.getString('option4') || null
            ].filter(Boolean);

            const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${question}`)
                .setColor(COLORS.INFO)
                .setDescription(options.map((opt, idx) => `**${emojis[idx]} ${opt}**\n\`${"░".repeat(10)}\` 0% (0)`).join("\n\n"))
                .setFooter({ text: "Clique sur un bouton pour voter" })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                options.map((opt, idx) =>
                    new ButtonBuilder()
                        .setCustomId(`poll_${Date.now()}_${idx}`)
                        .setLabel(`${emojis[idx]} ${opt.slice(0, 20)}`)
                        .setStyle(ButtonStyle.Secondary)
                )
            );

            const msg = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            db.polls[msg.id] = {
                question,
                options,
                votes: {},
                channelId: channel.id,
                guildId: guild.id
            };
            save();
        }

        // ===== COMMANDES D'INFOS =====
        if (commandName === 'userinfo') {
            const target = options.getMember('cible') || member;
            const roles = target.roles.cache
                .filter(r => r.id !== guild.roles.everyone.id)
                .map(r => `<@&${r.id}>`)
                .join(", ") || "Aucun";

            const embed = createEmbed(
                `👤 ${target.user.username}`,
                `Informations sur ${target.user.tag} :`,
                COLORS.INFO,
                [
                    { name: "🆔 ID", value: target.id, inline: true },
                    { name: "📛 Pseudo", value: target.displayName, inline: true },
                    { name: "🤖 Bot", value: target.user.bot ? "Oui" : "Non", inline: true },
                    { name: "📅 Compte créé", value: time(Math.floor(target.user.createdTimestamp / 1000), "D"), inline: true },
                    { name: "📥 Rejoint le", value: time(Math.floor(target.joinedTimestamp / 1000), "D"), inline: true },
                    { name: "🎭 Rôles", value: roles.length > 1024 ? roles.slice(0, 1020) + "..." : roles }
                ],
                null,
                target.user.displayAvatarURL()
            );
            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'quests') {
            const userData = initUser(user.id);
            const config = initConfig(guild.id);
            const quests = Object.entries(config.quests).map(([id, quest]) => {
                const completed = userData.quests?.[`${id}_completed`] || false;
                return {
                    name: `${completed ? "✅" : "❌"} ${quest.name}`,
                    value: `${quest.description}\n**Récompense** : ${quest.reward} 💎`,
                    inline: false
                };
            });

            const embed = createEmbed(
                "🏆 TES QUÊTES",
                "Voici tes quêtes en cours :",
                COLORS.GOLD,
                quests
            );
            return interaction.editReply({ embeds: [embed] });
        }

        // ===== COMMANDES ADMIN =====
        if (commandName === 'add-quest') {
            if (!isAdmin(user.id)) return interaction.editReply("❌ Permission refusée. Cette commande est réservée à l'admin.");

            const name = options.getString('nom');
            const description = options.getString('description');
            const reward = options.getInteger('recompense');

            const newQuestId = `custom_${Date.now()}`;
            config.quests[newQuestId] = {
                name,
                description,
                reward
            };
            save();

            return interaction.editReply(`✅ Quête personnalisée ajoutée : **${name}** (${reward} 💎).`);
        }
    }

    // ===== GESTION DES BOUTONS =====
    if (interaction.isButton()) {
        const { customId, guild, channel, member, user } = interaction;

        // Boutons de giveaway
        if (customId.startsWith('ga_join_')) {
            const messageId = customId.split('_')[2];
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

        // Boutons de sondage
        if (customId.startsWith('poll_')) {
            const [_, pollId, optionIndex] = customId.split('_');
            const poll = db.polls[pollId];
            if (!poll) return interaction.reply({ content: "❌ Sondage introuvable.", ephemeral: true });

            poll.votes[user.id] = parseInt(optionIndex);
            save();

            // Recalculer les stats
            const totals = poll.options.map((_, idx) =>
                Object.values(poll.votes).filter(v => v === idx).length
            );
            const total = totals.reduce((a, b) => a + b, 0);
            const bars = totals.map((count, idx) => {
                const pct = total ? Math.round((count / total) * 100) : 0;
                const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
                return `**${poll.options[idx]}**\n\`${bar}\` ${pct}% (${count})`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${poll.question}`)
                .setColor(COLORS.INFO)
                .setDescription(bars.join("\n\n"))
                .setFooter({ text: `${total} vote(s) au total` });

            await interaction.update({ embeds: [embed] }).catch(() => {});
        }

        // Boutons de tickets
        if (customId.startsWith('ticket_close_')) {
            const channelId = customId.replace('ticket_close_', '');
            const result = await closeTicket(channelId, guild, user, interaction);
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
            const response = await askMistral(message.content, message.guild.id);
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
    await addXP(message.author.id, message.guild.id);

    // Auto-modération
    await automod(message);
});

// ========== 15. AUTRES ÉVÉNEMENTS ==========
// --------------------------------------------
client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;
    const config = initConfig(message.guild.id);
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
    const config = initConfig(member.guild.id);

    if (config.welcome) {
        const channel = member.guild.channels.cache.get(config.welcome);
        if (channel) {
            const embed = createEmbed(
                `👋 Bienvenue, ${member.user.username}!`,
                `Bienvenue sur **${member.guild.name}** ! Tu es le membre **#${member.guild.memberCount}**.`,
                COLORS.SUCCESS,
                [],
                config.gifs.welcome,
                member.user.displayAvatarURL(),
                { text: "N'oublie pas de lire les règles et de t'amuser !" }
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
