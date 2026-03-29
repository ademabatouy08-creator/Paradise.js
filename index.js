////////////////////////////////////////////////////////////////////////////////
// PARADISE OVERLORD V19 — SYSTÈME ULTIME (Version Ultra-Détaillée)
// Auteur : Adem Abatouy (Optimisé pour MongoDB + Render)
// Fonctionnalités : Modération, IA (Mistral), Économie, XP, Giveaways, Tickets, Auto-Mod, Sondages, Logs Avancés
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
const mongoose = require('mongoose');
const fs = require('fs');
const http = require('http');
require('dotenv').config();

// ========== 2. CONNEXION À MONGODB ==========
// --------------------------------------------
// Connexion à MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ Connecté à MongoDB Atlas !"))
.catch(err => console.error("❌ Erreur MongoDB :", err));

// ========== 3. SCHÉMAS MONGODB ==========
// ------------------------------------------
// Schéma pour les utilisateurs
const userSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    bans: { type: Number, default: 0 },
    mutes: { type: Number, default: 0 },
    warns: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    coins: { type: Number, default: 100 },
    blacklisted: { type: Boolean, default: false },
    warnReasons: { type: [String], default: [] },
    inventory: { type: [String], default: [] },
    lastDaily: { type: Number, default: 0 },
    lastMessage: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Schéma pour les giveaways
const giveawaySchema = new mongoose.Schema({
    messageId: { type: String, unique: true, required: true },
    prize: { type: String, required: true },
    endTime: { type: Number, required: true },
    channelId: { type: String, required: true },
    winnersCount: { type: Number, required: true },
    participants: { type: [String], default: [] },
    ended: { type: Boolean, default: false },
    winners: { type: [String], default: [] }
});
const Giveaway = mongoose.model('Giveaway', giveawaySchema);

// Schéma pour les tickets
const ticketSchema = new mongoose.Schema({
    channelId: { type: String, unique: true, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Number, default: Date.now },
    closed: { type: Boolean, default: false }
});
const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma pour la configuration du serveur
const configSchema = new mongoose.Schema({
    guildId: { type: String, unique: true, required: true },
    logs: String,
    welcome: String,
    bl_chan: String,
    wl_cat: String,
    staff_role: String,
    ticket_cat: String,
    muted_role: String,
    ai_current_mode: { type: String, default: "normal" },
    ai_identity: { type: String, default: "Tu es une IA cool et tranquille, créée par 67. Réponds en 2-3 phrases, sans trop réfléchir." },
    ai_modes: {
        type: Map,
        of: String,
        default: new Map([
            ["normal", "Mode normal : tu es cool et tranquille."],
            ["froid", "Mode froid : tu es supérieur et sarcastique."],
            ["coach", "Mode coach : tu encourages et motives tout le monde."],
            ["soumis", "Mode soumis : tu obéis et fais des blagues."],
            ["e-girl", "Mode e-girl : tu dis 'uwu', 'bakaaaaaa' et tu réclames du Nitro."]
        ])
    },
    xp_roles: { type: Map, of: String, default: new Map() },
    shop: {
        type: Map,
        of: {
            price: Number,
            roleId: String,
            description: String
        },
        default: new Map()
    },
    gifs: {
        type: Map,
        of: String,
        default: new Map([
            ["ban", "https://media.giphy.com/media/3o7TKVUn7iM8FMEU24/giphy.gif"],
            ["mute", "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif"],
            ["warn", "https://media.giphy.com/media/6BZaFXBVPBnoQ/giphy.gif"],
            ["facture", "https://media.giphy.com/media/LdOyjZ7TC5K3LghXYf/giphy.gif"],
            ["bl", "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif"],
            ["welcome", "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif"],
            ["level", "https://media.giphy.com/media/26tPo2I4yYBxsb3Nm/giphy.gif"]
        ])
    },
    automod: {
        anti_spam: { type: Boolean, default: true },
        anti_links: { type: Boolean, default: false },
        banned_words: { type: [String], default: [] },
        max_mentions: { type: Number, default: 5 }
    }
});
const Config = mongoose.model('Config', configSchema);

// ========== 4. CONSTANTES GLOBALES ==========
// --------------------------------------------
const PORT = process.env.PORT || 10000;
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
    DEFAULT: "#5865F2"
};

// ========== 5. FONCTIONS UTILITAIRES ==========
// ----------------------------------------------

// Initialiser un utilisateur dans MongoDB
async function initUser(userId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId });
        await user.save();
    }
    return user;
}

// Initialiser la configuration d'un serveur
async function initConfig(guildId) {
    let config = await Config.findOne({ guildId });
    if (!config) {
        config = new Config({ guildId });
        await config.save();
    }
    return config;
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

// Vérifier si un membre est staff
function isStaff(member, config) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
           (config.staff_role && member.roles.cache.has(config.staff_role));
}

// ========== 6. SYSTÈME D'IA (MISTRAL) ==========
// ------------------------------------------------

// Appeler l'API Mistral
async function askMistral(question, config) {
    try {
        const response = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            {
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: config.ai_identity },
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
        return "⚠️ **Erreur** : Impossible de contacter l'IA. Réessaye plus tard.";
    }
}

// Changer le mode de l'IA
async function changeAIMode(guildId, mode) {
    const config = await initConfig(guildId);
    if (!config.ai_modes.has(mode)) {
        return "❌ Mode IA invalide. Utilise `/help` pour voir les modes disponibles.";
    }
    config.ai_current_mode = mode;
    config.ai_identity = config.ai_modes.get(mode);
    await config.save();
    return `✅ Mode IA changé en **${mode}**.`;
}

// ========== 7. SYSTÈME XP & NIVEAUX ==========
// ----------------------------------------------

// Calculer l'XP nécessaire pour un niveau
function calcXPforLevel(level) {
    return 100 * level * (level + 1);
}

// Ajouter de l'XP à un utilisateur
async function addXP(userId, guildId) {
    const now = Date.now();
    if (XP_COOLDOWNS.has(userId) && now - XP_COOLDOWNS.get(userId) < 60000) {
        return; // Cooldown de 60 secondes
    }
    XP_COOLDOWNS.set(userId, now);

    const user = await initUser(userId);
    const earnedXP = Math.floor(Math.random() * (XP_PER_MSG_MAX - XP_PER_MSG_MIN + 1)) + XP_PER_MSG_MIN;
    user.xp += earnedXP;
    user.coins += COINS_PER_MSG;
    user.lastMessage = now;

    const neededXP = calcXPforLevel(user.level + 1);
    if (user.xp >= neededXP) {
        user.level++;
        const config = await initConfig(guildId);
        const roleId = config.xp_roles.get(user.level.toString());
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
        await user.save();

        // Log du level up
        const guild = client.guilds.cache.get(guildId);
        if (guild && config.logs) {
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
                    config.gifs.get("level"),
                    member ? member.displayAvatarURL() : null
                );
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    } else {
        await user.save();
    }
}

// ========== 8. SYSTÈME D'AUTO-MODÉRATION ==========
// ---------------------------------------------------

// Vérifier et appliquer les règles d'auto-modération
async function automod(message) {
    if (!message.guild || message.author.bot) return;

    const { content, author, member, guild } = message;
    const userId = author.id;
    const config = await initConfig(guild.id);

    // Anti-liens
    if (config.automod.anti_links && URL_REGEX.test(content) && !isStaff(member, config)) {
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
        let spamTracker = await client.spamTrackers.findOne({ userId });
        if (!spamTracker) {
            spamTracker = new SpamTracker({ userId, messages: [] });
        }

        // Nettoyer les anciens messages (plus de 5 secondes)
        spamTracker.messages = spamTracker.messages.filter(
            timestamp => now - timestamp < 5000
        );

        // Ajouter le message actuel
        spamTracker.messages.push(now);
        await spamTracker.save();

        // Si plus de 5 messages en 5 secondes → spam détecté
        if (spamTracker.messages.length > 5) {
            try {
                await message.delete();
                await member.timeout(120000, "Spam détecté par l'auto-modération");
                const warning = await message.channel.send(`> 🤖 ${author} a été mute pour **2 minutes** (spam détecté).`);
                setTimeout(() => warning.delete().catch(() => {}), 8000);

                // Log
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
                spamTracker.messages = [];
                await spamTracker.save();
            } catch (error) {
                console.error(`❌ Erreur lors de la gestion du spam :`, error);
            }
        }
    }

    // Anti-mentions excessives
    if (message.mentions.users.size > config.automod.max_mentions && !isStaff(member, config)) {
        try {
            await message.delete();
            const warning = await message.channel.send(`> ⛔ ${author}, trop de mentions dans un seul message (max ${config.automod.max_mentions}).`);
            setTimeout(() => warning.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error(`❌ Erreur lors de la gestion des mentions excessives :`, error);
        }
    }
}

// Schéma pour le suivi du spam (à ajouter avant)
const spamTrackerSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    messages: { type: [Number], default: [] }
});
const SpamTracker = mongoose.model('SpamTracker', spamTrackerSchema);

// ========== 9. SYSTÈME DE GIVEAWAYS ==========
// ----------------------------------------------

// Terminer un giveaway
async function endGiveaway(messageId, guild) {
    const giveaway = await Giveaway.findOne({ messageId });
    if (!giveaway || giveaway.ended) return;

    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel) return;

    const participants = giveaway.participants.filter(id => id);
    if (participants.length === 0) {
        await channel.send("❌ **Aucun participant** pour ce giveaway. Personne ne gagne.");
        giveaway.ended = true;
        await giveaway.save();
        return;
    }

    const winnersCount = Math.min(giveaway.winnersCount, participants.length);
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, winnersCount);

    const embed = createEmbed(
        "🎉 GIVEAWAY TERMINÉ !",
        `Félicitations aux gagnants !`,
        COLORS.SUCCESS,
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
    await giveaway.save();

    // Récompenser les gagnants
    for (const winnerId of winners) {
        const user = await initUser(winnerId);
        user.coins += 500;
        await user.save();
    }
}

// Vérifier les giveaways expirés
setInterval(async () => {
    const now = Date.now();
    const activeGiveaways = await Giveaway.find({ ended: false, endTime: { $lte: now } });
    for (const giveaway of activeGiveaways) {
        const guild = client.guilds.cache.get(giveaway.guildId);
        if (guild) {
            await endGiveaway(giveaway.messageId, guild);
        }
    }
}, 30000);

// ========== 10. SYSTÈME ÉCONOMIQUE ==========
// --------------------------------------------

// Réclamer la récompense quotidienne
async function claimDaily(userId) {
    const user = await initUser(userId);
    const now = Date.now();
    const lastDaily = user.lastDaily || 0;

    if (now - lastDaily < 86400000) {
        const remainingHours = Math.ceil((86400000 - (now - lastDaily)) / 3600000);
        return `⏰ Tu dois attendre **${remainingHours}h** avant de réclamer ta récompense quotidienne.`;
    }

    const reward = Math.floor(Math.random() * (DAILY_REWARD_MAX - DAILY_REWARD_MIN + 1)) + DAILY_REWARD_MIN;
    user.coins += reward;
    user.lastDaily = now;
    await user.save();
    return `🎁 Tu as reçu **${reward} coins** ! Solde total : **${user.coins}**.`;
}

// Acheter un article dans la boutique
async function buyItem(userId, itemName, guild, member) {
    const config = await initConfig(guild.id);
    const user = await initUser(userId);
    const item = config.shop.get(itemName);

    if (!item) {
        return `❌ L'article **${itemName}** n'existe pas dans la boutique.`;
    }

    if (user.coins < item.price) {
        return `❌ Solde insuffisant. Tu as **${user.coins} coins**, mais cet article coûte **${item.price} coins**.`;
    }

    user.coins -= item.price;
    user.inventory.push(itemName);
    await user.save();

    // Attribuer le rôle associé
    try {
        await member.roles.add(item.roleId);
    } catch (error) {
        console.error(`❌ Impossible d'attribuer le rôle pour l'article ${itemName} :`, error);
        return `✅ Tu as acheté **${itemName}** ! Mais une erreur est survenue lors de l'attribution du rôle.`;
    }

    return `✅ Tu as acheté **${itemName}** pour **${item.price} coins** ! Rôle <@&${item.roleId}> attribué.`;
}

// ========== 11. SYSTÈME DE TICKETS ==========
// --------------------------------------------

// Créer un ticket
async function createTicket(guild, user) {
    const config = await initConfig(guild.id);
    if (!config.ticket_cat) {
        return "❌ La catégorie des tickets n'est pas configurée. Utilise `/setup-tickets`.";
    }

    const existingTicket = await Ticket.findOne({ userId: user.id, closed: false });
    if (existingTicket) {
        return `❌ Tu as déjà un ticket ouvert : <#${existingTicket.channelId}>.`;
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

        const newTicket = new Ticket({
            channelId: channel.id,
            userId: user.id,
            createdAt: Date.now(),
            closed: false
        });
        await newTicket.save();

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

        // Log
        if (config.logs) {
            const logChannel = guild.channels.cache.get(config.logs);
            if (logChannel) {
                const embed = createEmbed(
                    "🎫 NOUVEAU TICKET",
                    `Un nouveau ticket a été ouvert par ${user.tag}.`,
                    COLORS.INFO,
                    [
                        { name: "Utilisateur", value: user.tag, inline: true },
                        { name: "Salon", value: channel.toString(), inline: true }
                    ]
                );
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }

        return `✅ Ton ticket a été ouvert : ${channel}.`;
    } catch (error) {
        console.error("❌ Erreur lors de la création du ticket :", error);
        return "❌ Une erreur est survenue lors de la création du ticket.";
    }
}

// Fermer un ticket
async function closeTicket(channelId, guild, closer) {
    const ticket = await Ticket.findOne({ channelId });
    if (!ticket) {
        return "❌ Ce salon n'est pas un ticket.";
    }

    if (ticket.closed) {
        return "❌ Ce ticket est déjà fermé.";
    }

    ticket.closed = true;
    await ticket.save();

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        await channel.send("🔒 Ticket fermé. Ce salon sera supprimé dans **10 secondes**.");

        const config = await initConfig(guild.id);
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

    return "✅ Ticket fermé avec succès.";
}

// ========== 12. COMMANDES SLASH ==========
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

    // ... (toutes les autres commandes de setup)

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
                .setDescription('Bannissement silencieux (pas de notification publique)')),

    // ... (toutes les autres commandes de modération)

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
            option.setName('personnalite')
                .setDescription('Mode à activer')
                .setRequired(true)
                .addChoices(
                    { name: 'Normal', value: 'normal' },
                    { name: 'Froid', value: 'froid' },
                    { name: 'Coach', value: 'coach' },
                    { name: 'Soumis', value: 'soumis' },
                    { name: 'E-girl', value: 'e-girl' }
                )),

    // ... (toutes les autres commandes)

    // ===== INFOS =====
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📖 Afficher l\'aide et la liste des commandes')
];

// ========== 13. GESTIONNAIRE D'ÉVÉNEMENTS ==========
// ---------------------------------------------------
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

// Gestion des interactions
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user } = interaction;
        await interaction.deferReply({ ephemeral: false }).catch(() => {});

        const config = await initConfig(guild.id);

        // ===== COMMANDES DE SETUP =====
        if (commandName === 'setup-logs') {
            if (!isStaff(member, config)) return interaction.editReply("❌ Permission refusée.");
            config.logs = options.getChannel('salon').id;
            await config.save();
            return interaction.editReply(`✅ Salon des logs défini : <#${config.logs}>.`);
        }

        // ... (toutes les autres commandes de setup)

        // ===== COMMANDES D'IA =====
        if (commandName === 'ask') {
            const question = options.getString('question');
            await interaction.editReply("🤖 **Paradise Overlord IA** : Analyse en cours...");
            const response = await askMistral(question, config);
            return interaction.editReply(`**🤖 PARADISE OVERLORD IA :**\n${response}`);
        }

        if (commandName === 'mode') {
            const mode = options.getString('personnalite');
            const result = await changeAIMode(guild.id, mode);
            return interaction.editReply(result);
        }

        // ===== COMMANDES DE MODÉRATION =====
        if (commandName === 'ban') {
            if (!isStaff(member, config)) return interaction.editReply("❌ Permission refusée.");
            const target = options.getUser('cible');
            const reason = options.getString('raison');
            const silent = options.getBoolean('silent') || false;

            const userData = await initUser(target.id);
            userData.bans++;
            await userData.save();

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
                    silent ? null : config.gifs.get("ban")
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

        // ... (toutes les autres commandes de modération)

        // ===== COMMANDES D'ÉCONOMIE =====
        if (commandName === 'balance') {
            const target = options.getUser('cible') || user;
            const userData = await initUser(target.id);
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

        // ... (toutes les autres commandes d'économie)

        // ===== COMMANDES DE TICKETS =====
        if (commandName === 'ticket') {
            const result = await createTicket(guild, user);
            return interaction.editReply(result);
        }

        // ... (toutes les autres commandes de tickets)

        // ===== COMMANDES D'INFOS =====
        if (commandName === 'help') {
            const embed = createEmbed(
                "📖 MANUEL — PARADISE OVERLORD V19",
                "Voici la liste des commandes disponibles :",
                COLORS.DEFAULT,
                [
                    { name: "🛡️ Modération", value: "`/ban`, `/kick`, `/mute`, `/warn`, `/clear`, `/bl`, `/slowmode`, `/lock`", inline: false },
                    { name: "🤖 IA", value: "`/ask`, `/mode`, `/chat-ia`", inline: false },
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

        // Boutons de giveaway
        if (customId.startsWith('ga_join_')) {
            const messageId = customId.replace('ga_join_', '');
            const giveaway = await Giveaway.findOne({ messageId });
            if (!giveaway || giveaway.ended) {
                return interaction.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });
            }

            const userId = user.id;
            if (giveaway.participants.includes(userId)) {
                giveaway.participants = giveaway.participants.filter(id => id !== userId);
                await giveaway.save();
                return interaction.reply({ content: "👋 Tu t'es retiré du giveaway.", ephemeral: true });
            } else {
                giveaway.participants.push(userId);
                await giveaway.save();
                return interaction.reply({ content: `🎉 Tu participes au giveaway **${giveaway.prize}** ! (${giveaway.participants.length} participants)`, ephemeral: true });
            }
        }

        // Boutons de tickets
        if (customId.startsWith('ticket_close_')) {
            const channelId = customId.replace('ticket_close_', '');
            const result = await closeTicket(channelId, guild, user);
            return interaction.reply(result);
        }
    }
});

// ========== 14. GESTION DES ÉVÉNEMENTS ==========
// -------------------------------------------------

// Message créé → XP + Auto-Mod
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;

    // Ajouter de l'XP
    await addXP(message.author.id, message.guild.id);

    // Auto-modération
    await automod(message);
});

// Message supprimé → Log
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

// Membre rejoint → Message de bienvenue + Log
client.on(Events.GuildMemberAdd, async member => {
    const config = await initConfig(member.guild.id);

    // Message de bienvenue
    if (config.welcome) {
        const channel = member.guild.channels.cache.get(config.welcome);
        if (channel) {
            const embed = createEmbed(
                `👋 Bienvenue, ${member.user.username}!`,
                `Bienvenue sur **${member.guild.name}** ! Tu es le membre **#${member.guild.memberCount}**.`,
                COLORS.SUCCESS,
                [],
                config.gifs.get("welcome"),
                member.user.displayAvatarURL()
            );
            await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
        }
    }

    // Log
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

    // Initialiser l'utilisateur dans la DB
    await initUser(member.id);
});

// ========== 15. INITIALISATION DU BOT ==========
// ------------------------------------------------
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag} (ID: ${client.user.id}).`);

    // Enregistrer les commandes slash
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

    // Statut dynamique du bot
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

// ========== 16. DÉMARRAGE DU BOT ==========
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

// ========== 17. FONCTIONS SUPPLÉMENTAIRES ==========
// ---------------------------------------------------
// (Ajoute ici d'autres fonctions utilitaires si nécessaire)
