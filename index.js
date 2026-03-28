// ╔══════════════════════════════════════════════════════════════════╗
// ║          PARADISE OVERLORD V19 — SYSTÈME ULTIME                 ║
// ║  Modération | IA | Économie | XP | Giveaway | Tickets | Auto-Mod║
// ╚══════════════════════════════════════════════════════════════════╝

const {
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField,
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, Collection,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const http = require('http');

// ════════════════════════════════════════════
//  1. BASE DE DONNÉES PERSISTANTE
// ════════════════════════════════════════════
const DATA_FILE = './paradise_overlord_v19.json';
let db = {
    config: {
        logs: null, welcome: null, bl_chan: null, wl_cat: null,
        staff_role: null, ticket_cat: null, muted_role: null,
        automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
        ai_identity: "Tu es Paradise Overlord, l'intelligence supérieure du serveur. Tu es froid, autoritaire et ultra-précis.",
        xp_roles: {},   // { level: roleId }
        shop: {},       // { itemName: { price, roleId, description } }
        gifs: {
            ban:     "https://media.giphy.com/media/3o7TKVUn7iM8FMEU24/giphy.gif",
            mute:    "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif",
            warn:    "https://media.giphy.com/media/6BZaFXBVPBnoQ/giphy.gif",
            facture: "https://media.giphy.com/media/LdOyjZ7TC5K3LghXYf/giphy.gif",
            bl:      "https://media.giphy.com/media/3o7TKMGpxP5P90bQxq/giphy.gif",
            welcome: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
            level:   "https://media.giphy.com/media/26tPo2I4yYBxsb3Nm/giphy.gif"
        }
    },
    users: {},      // { userId: { bans, mutes, warns, xp, level, coins, blacklisted, warnReasons[] } }
    giveaways: {},  // { messageId: { prize, endTime, channelId, winnersCount, participants[], ended } }
    polls: {},      // { messageId: { question, options, votes: {userId: optIndex}, channelId } }
    tickets: {},    // { channelId: { userId, createdAt, closed } }
    economy: {
        transactions: []  // { from, to, amount, reason, timestamp }
    },
    spam_tracker: {} // { userId: { count, last } }
};

if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE)); }
    catch(e) { console.error("Erreur lecture DB:", e); }
}

const save = () => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
    catch(e) { console.error("Erreur sauvegarde DB:", e); }
};

// Initialiser un utilisateur si absent
function initUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            bans: 0, mutes: 0, warns: 0,
            xp: 0, level: 0, coins: 100,
            blacklisted: false, warnReasons: [],
            inventory: []
        };
    }
    return db.users[userId];
}

// ════════════════════════════════════════════
//  2. CLIENT DISCORD
// ════════════════════════════════════════════
const client = new Client({ intents: 3276799 });

// Serveur HTTP keepalive
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise Overlord V19: ONLINE"); res.end();
}).listen(process.env.PORT || 10000);

// ════════════════════════════════════════════
//  3. REGISTRE DES COMMANDES (ARSENAL COMPLET)
// ════════════════════════════════════════════
const commands = [
    // ── SETUPS ──────────────────────────────
    new SlashCommandBuilder().setName('setup-logs').setDescription('📑 Salon des logs de sécurité')
        .addChannelOption(o => o.setName('salon').setDescription('Salon des logs').setRequired(true)),
    new SlashCommandBuilder().setName('setup-welcome').setDescription('👋 Salon de bienvenue')
        .addChannelOption(o => o.setName('salon').setDescription('Salon bienvenue').setRequired(true)),
    new SlashCommandBuilder().setName('setup-blacklist').setDescription('🚫 Salon d\'isolation Blacklist')
        .addChannelOption(o => o.setName('salon').setDescription('Salon isolation').setRequired(true)),
    new SlashCommandBuilder().setName('setup-whitelist').setDescription('📝 Catégorie Whitelist Staff')
        .addChannelOption(o => o.setName('cat').setDescription('Catégorie WL').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-staff').setDescription('👑 Rôle Staff autorisé')
        .addRoleOption(o => o.setName('role').setDescription('Rôle staff').setRequired(true)),
    new SlashCommandBuilder().setName('setup-tickets').setDescription('🎫 Catégorie pour les tickets support')
        .addChannelOption(o => o.setName('cat').setDescription('Catégorie tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-muted').setDescription('🔇 Rôle Muted (créer manuellement)')
        .addRoleOption(o => o.setName('role').setDescription('Rôle muted').setRequired(true)),
    new SlashCommandBuilder().setName('setup-gif').setDescription('🖼️ Modifier les visuels')
        .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
            .addChoices(
                {name:'Ban',value:'ban'},{name:'Mute',value:'mute'},{name:'Warn',value:'warn'},
                {name:'Facture',value:'facture'},{name:'BL',value:'bl'},{name:'Welcome',value:'welcome'},{name:'Level',value:'level'}
            ))
        .addStringOption(o => o.setName('url').setDescription('URL directe du GIF').setRequired(true)),
    new SlashCommandBuilder().setName('setup-ai').setDescription('🧠 Personnaliser l\'identité de l\'IA')
        .addStringOption(o => o.setName('identite').setDescription('Identité/personnalité de l\'IA').setRequired(true)),

    // ── AUTO-MODÉRATION ──────────────────────
    new SlashCommandBuilder().setName('automod').setDescription('🛡️ Configurer l\'auto-modération')
        .addStringOption(o => o.setName('option').setDescription('Option').setRequired(true)
            .addChoices(
                {name:'Anti-spam ON/OFF',value:'spam'},
                {name:'Anti-liens ON/OFF',value:'links'},
                {name:'Ajouter mot banni',value:'add_word'},
                {name:'Retirer mot banni',value:'del_word'},
                {name:'Max mentions',value:'mentions'}
            ))
        .addStringOption(o => o.setName('valeur').setDescription('Valeur (ON/OFF ou le mot ou le nombre)')),

    // ── MODÉRATION ───────────────────────────
    new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannissement définitif')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true))
        .addBooleanOption(o => o.setName('silent').setDescription('Bannissement silencieux (DM seulement)')),
    new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser du serveur')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('🔇 Museler un utilisateur')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('🔊 Rendre la parole')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Avertissement officiel')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true)),
    new SlashCommandBuilder().setName('unwarn').setDescription('🗑️ Retirer le dernier avertissement')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('🧹 Nettoyage de messages')
        .addIntegerOption(o => o.setName('nb').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption(o => o.setName('filtre').setDescription('Supprimer uniquement les messages de cet utilisateur')),
    new SlashCommandBuilder().setName('bl').setDescription('🚫 Blacklist : Isolation immédiate')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true)),
    new SlashCommandBuilder().setName('unbl').setDescription('✅ Libérer de la Blacklist')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Activer le slowmode sur le salon')
        .addIntegerOption(o => o.setName('secondes').setDescription('Délai en secondes (0 = désactiver)').setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller un salon'),
    new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller un salon'),

    // ── SYSTÈME XP ───────────────────────────
    new SlashCommandBuilder().setName('rank').setDescription('🏅 Voir son niveau et XP')
        .addUserOption(o => o.setName('cible').setDescription('Membre (optionnel)')),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Top 10 des membres les plus actifs'),
    new SlashCommandBuilder().setName('xp-give').setDescription('➕ Donner de l\'XP à un membre (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('XP à donner').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('setup-xp-role').setDescription('🎖️ Associer un rôle à un niveau')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer').setRequired(true)),

    // ── ÉCONOMIE ─────────────────────────────
    new SlashCommandBuilder().setName('balance').setDescription('💰 Voir son solde de coins')
        .addUserOption(o => o.setName('cible').setDescription('Membre (optionnel)')),
    new SlashCommandBuilder().setName('pay').setDescription('💸 Transférer des coins à un membre')
        .addUserOption(o => o.setName('cible').setDescription('Destinataire').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('raison').setDescription('Motif')),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Récompense quotidienne (coins)'),
    new SlashCommandBuilder().setName('shop').setDescription('🏪 Voir la boutique du serveur'),
    new SlashCommandBuilder().setName('buy').setDescription('🛒 Acheter un article de la boutique')
        .addStringOption(o => o.setName('article').setDescription('Nom de l\'article').setRequired(true)),
    new SlashCommandBuilder().setName('shop-add').setDescription('➕ Ajouter un article à la boutique (Staff)')
        .addStringOption(o => o.setName('nom').setDescription('Nom de l\'article').setRequired(true))
        .addIntegerOption(o => o.setName('prix').setDescription('Prix en coins').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle attribué').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description')),
    new SlashCommandBuilder().setName('shop-remove').setDescription('🗑️ Retirer un article de la boutique (Staff)')
        .addStringOption(o => o.setName('nom').setDescription('Nom de l\'article').setRequired(true)),
    new SlashCommandBuilder().setName('coins-give').setDescription('💎 Donner des coins à un membre (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

    // ── GIVEAWAY ─────────────────────────────
    new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Lancer un giveaway')
        .addStringOption(o => o.setName('prix').setDescription('Ce qu\'on gagne').setRequired(true))
        .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setRequired(true).setMinValue(1).setMaxValue(10))
        .addChannelOption(o => o.setName('salon').setDescription('Salon (actuel si non spécifié)')),
    new SlashCommandBuilder().setName('giveaway-end').setDescription('⏹️ Terminer un giveaway immédiatement')
        .addStringOption(o => o.setName('message_id').setDescription('ID du message du giveaway').setRequired(true)),
    new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Retirer un nouveau gagnant')
        .addStringOption(o => o.setName('message_id').setDescription('ID du message du giveaway').setRequired(true)),

    // ── SONDAGE ──────────────────────────────
    new SlashCommandBuilder().setName('poll').setDescription('📊 Créer un sondage')
        .addStringOption(o => o.setName('question').setDescription('La question').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('Option 3'))
        .addStringOption(o => o.setName('option4').setDescription('Option 4')),

    // ── TICKETS ──────────────────────────────
    new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket support'),
    new SlashCommandBuilder().setName('ticket-close').setDescription('🔒 Fermer ce ticket'),
    new SlashCommandBuilder().setName('ticket-add').setDescription('➕ Ajouter un membre au ticket')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),

    // ── IA & BUSINESS ────────────────────────
    new SlashCommandBuilder().setName('ask').setDescription('🤖 Interroger l\'IA Paradise Overlord')
        .addStringOption(o => o.setName('q').setDescription('Ta question').setRequired(true)),
    new SlashCommandBuilder().setName('facture').setDescription('🧾 Générer une facture (TVA 20%)')
        .addUserOption(o => o.setName('client').setDescription('Le client').setRequired(true))
        .addNumberOption(o => o.setName('ht').setDescription('Prix HT').setRequired(true))
        .addStringOption(o => o.setName('objet').setDescription('Objet de vente').setRequired(true))
        .addStringOption(o => o.setName('numero').setDescription('Numéro de facture (auto si vide)')),
    new SlashCommandBuilder().setName('wl-start').setDescription('📝 Créer un salon de recrutement Staff')
        .addUserOption(o => o.setName('cible').setDescription('Candidat').setRequired(true)),
    new SlashCommandBuilder().setName('message').setDescription('📝 Créer un Embed stylisé'),
    new SlashCommandBuilder().setName('announce').setDescription('📢 Envoyer une annonce dans un salon')
        .addStringOption(o => o.setName('texte').setDescription('Texte de l\'annonce').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true))
        .addStringOption(o => o.setName('couleur').setDescription('Couleur HEX (ex: #ff0000)'))
        .addStringOption(o => o.setName('titre').setDescription('Titre de l\'embed')),

    // ── INFOS ────────────────────────────────
    new SlashCommandBuilder().setName('stats').setDescription('📊 Casier judiciaire complet')
        .addUserOption(o => o.setName('cible').setDescription('Membre')),
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Informations détaillées d\'un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre')),
    new SlashCommandBuilder().setName('server-info').setDescription('ℹ️ Informations du serveur'),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Voir l\'avatar d\'un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre')),
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Liste complète des commandes'),
].map(c => c.toJSON());

// ════════════════════════════════════════════
//  4. MOTEUR IA (MISTRAL via HuggingFace)
// ════════════════════════════════════════════
async function askMistral(q) {
    try {
        const res = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            {
                model: "mistral-small-latest", // gratuit
                messages: [
                    { role: "system", content: db.config.ai_identity },
                    { role: "user", content: q }
                ],
                max_tokens: 1000
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );
        return res.data.choices[0].message.content.trim();
    } catch (e) {
        return `⚠️ Liaison IA interrompue : ${e.message}`;
    }
}

// ════════════════════════════════════════════
//  5. SYSTÈME XP
// ════════════════════════════════════════════
const XP_COOLDOWNS = new Map();
const XP_PER_MSG_MIN = 10;
const XP_PER_MSG_MAX = 25;

function calcXPforLevel(lvl) { return 100 * lvl * (lvl + 1); }

async function addXP(userId, guild) {
    const now = Date.now();
    if (XP_COOLDOWNS.has(userId) && now - XP_COOLDOWNS.get(userId) < 60000) return;
    XP_COOLDOWNS.set(userId, now);

    const u = initUser(userId);
    const earned = Math.floor(Math.random() * (XP_PER_MSG_MAX - XP_PER_MSG_MIN + 1)) + XP_PER_MSG_MIN;
    u.xp += earned;
    u.coins += 1; // 1 coin par message

    // Vérifier le niveau up
    const neededXP = calcXPforLevel(u.level + 1);
    if (u.xp >= neededXP) {
        u.level++;
        save();

        // Attribuer rôle si configuré
        const roleId = db.config.xp_roles[u.level];
        if (roleId) {
            const member = guild.members.cache.get(userId);
            if (member) {
                try {
                    await member.roles.add(roleId);
                } catch {}
            }
        }

        // Annoncer le level up dans les logs
        if (db.config.logs) {
            const logChan = guild.channels.cache.get(db.config.logs);
            if (logChan) {
                const member = guild.members.cache.get(userId);
                const emb = new EmbedBuilder()
                    .setTitle("⬆️ LEVEL UP")
                    .setColor("#f39c12")
                    .setImage(db.config.gifs.level)
                    .addFields(
                        { name: "Membre", value: `<@${userId}>`, inline: true },
                        { name: "Nouveau niveau", value: `**${u.level}**`, inline: true },
                        { name: "XP Total", value: `\`${u.xp}\``, inline: true }
                    )
                    .setThumbnail(member?.displayAvatarURL() || null);
                logChan.send({ embeds: [emb] }).catch(() => {});
            }
        }
    }
    save();
}

// ════════════════════════════════════════════
//  6. AUTO-MODÉRATION
// ════════════════════════════════════════════
const URL_REGEX = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;

async function automod(message) {
    if (!message.guild || message.author.bot) return;
    const cfg = db.config.automod;
    const content = message.content;
    const userId = message.author.id;

    // Anti-liens
    if (cfg.anti_links && URL_REGEX.test(content)) {
        const hasStaffRole = db.config.staff_role && message.member.roles.cache.has(db.config.staff_role);
        if (!hasStaffRole) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`> ⛔ <@${userId}>, les liens sont interdits.`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
            return;
        }
    }

    // Mots bannis
    for (const word of cfg.banned_words) {
        if (content.toLowerCase().includes(word.toLowerCase())) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`> ⛔ <@${userId}>, ce message contient un mot interdit.`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
            return;
        }
    }

    // Anti-spam (plus de 5 messages en 5s)
    if (cfg.anti_spam) {
        const now = Date.now();
        if (!db.spam_tracker[userId]) db.spam_tracker[userId] = { count: 0, last: now, messages: [] };
        const tracker = db.spam_tracker[userId];

        // Nettoyer les anciens messages (>5s)
        tracker.messages = tracker.messages.filter(t => now - t < 5000);
        tracker.messages.push(now);

        if (tracker.messages.length > 5) {
            await message.delete().catch(() => {});
            // Timeout automatique 2 minutes
            await message.member.timeout(120000, "Auto-Mod : Spam détecté").catch(() => {});
            const warn = await message.channel.send(`> 🤖 <@${userId}> a été automatiquement mute 2 minutes pour spam.`);
            setTimeout(() => warn.delete().catch(() => {}), 8000);

            // Log
            if (db.config.logs) {
                const logChan = message.guild.channels.cache.get(db.config.logs);
                if (logChan) {
                    const emb = new EmbedBuilder()
                        .setTitle("🤖 AUTO-MOD : SPAM")
                        .setColor("#e74c3c")
                        .addFields({ name: "Membre", value: `<@${userId}>` }, { name: "Action", value: "Mute 2 minutes automatique" })
                        .setTimestamp();
                    logChan.send({ embeds: [emb] }).catch(() => {});
                }
            }
            tracker.messages = [];
        }
    }

    // Anti-mentions excessives
    if (message.mentions.users.size >= cfg.max_mentions) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(`> ⛔ <@${userId}>, trop de mentions dans un seul message.`);
        setTimeout(() => warn.delete().catch(() => {}), 5000);
    }
}

// ════════════════════════════════════════════
//  7. SYSTÈME DE GIVEAWAY
// ════════════════════════════════════════════
async function endGiveaway(messageId, guild, reroll = false) {
    const ga = db.giveaways[messageId];
    if (!ga || (ga.ended && !reroll)) return;

    const channel = guild.channels.cache.get(ga.channelId);
    if (!channel) return;

    const participants = ga.participants.filter(id => id);
    if (participants.length === 0) {
        channel.send("❌ Aucun participant pour ce giveaway. Personne ne gagne.").catch(() => {});
        ga.ended = true; save();
        return;
    }

    const winnersCount = Math.min(ga.winnersCount, participants.length);
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, winnersCount);

    const emb = new EmbedBuilder()
        .setTitle(reroll ? "🔄 REROLL DU GIVEAWAY" : "🎉 GIVEAWAY TERMINÉ !")
        .setColor(reroll ? "#e67e22" : "#2ecc71")
        .addFields(
            { name: "🏆 Prix", value: ga.prize },
            { name: "👑 Gagnant(s)", value: winners.map(id => `<@${id}>`).join(", ") },
            { name: "👥 Participants", value: `${participants.length}` }
        )
        .setTimestamp();

    channel.send({ content: winners.map(id => `<@${id}>`).join(" ") + " **Vous avez gagné le giveaway !**", embeds: [emb] }).catch(() => {});
    ga.ended = true;
    ga.winners = winners;
    save();

    // Donner des coins aux gagnants
    for (const wId of winners) {
        const u = initUser(wId);
        u.coins += 500;
    }
    save();
}

// Vérifier les giveaways expirés toutes les 30s
setInterval(async () => {
    const now = Date.now();
    for (const [msgId, ga] of Object.entries(db.giveaways)) {
        if (!ga.ended && ga.endTime <= now) {
            for (const guild of client.guilds.cache.values()) {
                await endGiveaway(msgId, guild);
            }
        }
    }
}, 30000);

// ════════════════════════════════════════════
//  8. HELPERS UTILITAIRES
// ════════════════════════════════════════════
function isStaff(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (db.config.staff_role && member.roles.cache.has(db.config.staff_role)) return true;
    return false;
}

function colorFromHex(hex) {
    if (!hex) return "#5865F2";
    return hex.startsWith("#") ? hex : `#${hex}`;
}

function randomId() {
    return Math.floor(Math.random() * 900000 + 100000).toString();
}

async function sendLog(guild, embed) {
    if (!db.config.logs) return;
    const logChan = guild.channels.cache.get(db.config.logs);
    if (logChan) await logChan.send({ embeds: [embed] }).catch(() => {});
}

// ════════════════════════════════════════════
//  9. GESTIONNAIRE D'INTERACTIONS PRINCIPAL
// ════════════════════════════════════════════
client.on(Events.InteractionCreate, async i => {
    // ── BOUTONS ──────────────────────────────
    if (i.isButton()) {
        // Bouton participation giveaway
        if (i.customId.startsWith('ga_join_')) {
            const msgId = i.customId.replace('ga_join_', '');
            const ga = db.giveaways[msgId];
            if (!ga || ga.ended) return i.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });

            if (ga.participants.includes(i.user.id)) {
                // Se retirer
                ga.participants = ga.participants.filter(id => id !== i.user.id);
                save();
                return i.reply({ content: "👋 Tu t'es retiré du giveaway.", ephemeral: true });
            } else {
                ga.participants.push(i.user.id);
                save();
                return i.reply({ content: `🎉 Tu participes au giveaway **${ga.prize}** ! (${ga.participants.length} participants)`, ephemeral: true });
            }
        }

        // Boutons sondage
        if (i.customId.startsWith('poll_')) {
            const [, msgId, optIdx] = i.customId.split('_');
            const poll = db.polls[msgId];
            if (!poll) return i.reply({ content: "❌ Sondage introuvable.", ephemeral: true });

            poll.votes[i.user.id] = parseInt(optIdx);
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

            const emb = new EmbedBuilder()
                .setTitle(`📊 ${poll.question}`)
                .setColor("#3498db")
                .setDescription(bars.join("\n\n"))
                .setFooter({ text: `${total} vote(s) au total` });

            await i.update({ embeds: [emb] }).catch(() => {});
        }

        // Fermer ticket
        if (i.customId.startsWith('ticket_close_')) {
            const ticket = db.tickets[i.channel.id];
            if (!ticket) return i.reply({ content: "❌ Ce n'est pas un ticket.", ephemeral: true });

            ticket.closed = true; save();
            await i.reply({ content: "🔒 Ticket fermé. Ce salon sera supprimé dans 10 secondes." });
            await sendLog(i.guild, new EmbedBuilder()
                .setTitle("🎫 TICKET FERMÉ")
                .setColor("#e74c3c")
                .addFields(
                    { name: "Ticket", value: `#${i.channel.name}` },
                    { name: "Fermé par", value: `${i.user.tag}` },
                    { name: "Ouvert par", value: `<@${ticket.userId}>` }
                )
                .setTimestamp()
            );
            setTimeout(() => i.channel.delete().catch(() => {}), 10000);
        }
    }

    // ── MODALS ───────────────────────────────
    if (i.isModalSubmit()) {
        if (i.customId === 'modal_message') {
            const titre = i.fields.getTextInputValue('titre');
            const corps = i.fields.getTextInputValue('corps');
            const couleur = i.fields.getTextInputValue('couleur') || '#5865F2';
            const image = i.fields.getTextInputValue('image') || null;

            const emb = new EmbedBuilder()
                .setTitle(titre)
                .setDescription(corps)
                .setColor(couleur.startsWith('#') ? couleur : `#${couleur}`)
                .setTimestamp();
            if (image) emb.setImage(image);

            await i.reply({ embeds: [emb] });
        }

        if (i.customId === 'modal_wl') {
            const candidat_id = i.customId.split('_')[2];
        }
    }

    // ── SLASH COMMANDS ───────────────────────
    if (!i.isChatInputCommand()) return;

    // /message ouvre un modal
    if (i.commandName === 'message') {
        const modal = new ModalBuilder().setCustomId('modal_message').setTitle('✏️ Créer un Embed');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('corps').setLabel('Contenu').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('couleur').setLabel('Couleur HEX (ex: #ff0000)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('#5865F2')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('URL image/GIF (optionnel)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return i.showModal(modal);
    }

    await i.deferReply().catch(() => {});
    const { commandName, options, guild, member, user } = i;

    // ════════════ SETUPS ════════════
    if (commandName === 'setup-logs') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.logs = options.getChannel('salon').id; save();
        return i.editReply(`✅ Salon des logs défini : <#${db.config.logs}>`);
    }
    if (commandName === 'setup-welcome') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.welcome = options.getChannel('salon').id; save();
        return i.editReply(`✅ Salon de bienvenue défini : <#${db.config.welcome}>`);
    }
    if (commandName === 'setup-blacklist') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.bl_chan = options.getChannel('salon').id; save();
        return i.editReply(`✅ Salon Blacklist défini : <#${db.config.bl_chan}>`);
    }
    if (commandName === 'setup-whitelist') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.wl_cat = options.getChannel('cat').id; save();
        return i.editReply(`✅ Catégorie Whitelist définie : <#${db.config.wl_cat}>`);
    }
    if (commandName === 'setup-staff') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return i.editReply("❌ Administrateur requis.");
        db.config.staff_role = options.getRole('role').id; save();
        return i.editReply(`✅ Rôle Staff défini : <@&${db.config.staff_role}>`);
    }
    if (commandName === 'setup-tickets') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.ticket_cat = options.getChannel('cat').id; save();
        return i.editReply(`✅ Catégorie tickets définie.`);
    }
    if (commandName === 'setup-muted') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.muted_role = options.getRole('role').id; save();
        return i.editReply(`✅ Rôle Muted défini : <@&${db.config.muted_role}>`);
    }
    if (commandName === 'setup-gif') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const type = options.getString('type');
        db.config.gifs[type] = options.getString('url'); save();
        return i.editReply({ embeds: [new EmbedBuilder().setTitle(`✅ GIF ${type.toUpperCase()} mis à jour`).setImage(db.config.gifs[type]).setColor("#2ecc71")] });
    }
    if (commandName === 'setup-ai') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.ai_identity = options.getString('identite'); save();
        return i.editReply(`✅ Identité IA mise à jour.`);
    }
    if (commandName === 'setup-xp-role') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const lvl = options.getInteger('niveau');
        const role = options.getRole('role');
        db.config.xp_roles[lvl] = role.id; save();
        return i.editReply(`✅ Niveau **${lvl}** → rôle <@&${role.id}>.`);
    }

    // ════════════ AUTO-MOD ════════════
    if (commandName === 'automod') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const opt = options.getString('option');
        const val = options.getString('valeur') || '';
        const cfg = db.config.automod;

        if (opt === 'spam') { cfg.anti_spam = !cfg.anti_spam; save(); return i.editReply(`🛡️ Anti-spam : **${cfg.anti_spam ? 'ON' : 'OFF'}**`); }
        if (opt === 'links') { cfg.anti_links = !cfg.anti_links; save(); return i.editReply(`🔗 Anti-liens : **${cfg.anti_links ? 'ON' : 'OFF'}**`); }
        if (opt === 'add_word') { if (!val) return i.editReply("❌ Précise un mot."); cfg.banned_words.push(val.toLowerCase()); save(); return i.editReply(`✅ Mot banni ajouté : \`${val}\``); }
        if (opt === 'del_word') { cfg.banned_words = cfg.banned_words.filter(w => w !== val.toLowerCase()); save(); return i.editReply(`✅ Mot retiré : \`${val}\``); }
        if (opt === 'mentions') { const n = parseInt(val); if (isNaN(n)) return i.editReply("❌ Valeur invalide."); cfg.max_mentions = n; save(); return i.editReply(`✅ Max mentions : **${n}**`); }
    }

    // ════════════ MODÉRATION ════════════
    if (commandName === 'ban') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const raison = options.getString('raison');
        const silent = options.getBoolean('silent') || false;
        const u = initUser(target.id);
        u.bans++; save();

        // DM la cible
        try {
            const dmEmb = new EmbedBuilder().setTitle("🔨 Tu as été banni").setColor("#ff0000")
                .addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: raison })
                .setTimestamp();
            await target.send({ embeds: [dmEmb] });
        } catch {}

        await guild.members.ban(target.id, { reason: raison, deleteMessageSeconds: 86400 }).catch(() => {});
        const emb = new EmbedBuilder().setTitle("🔨 BAN EXÉCUTÉ").setColor("#ff0000")
            .setImage(silent ? null : db.config.gifs.ban)
            .addFields(
                { name: "🎯 Sujet", value: `${target.tag} (${target.id})`, inline: true },
                { name: "👮 Staff", value: `${user.tag}`, inline: true },
                { name: "📋 Raison", value: raison },
                { name: "📊 Total bans", value: `\`${u.bans}\`` }
            ).setTimestamp();

        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'kick') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const raison = options.getString('raison');
        try { await target.send({ embeds: [new EmbedBuilder().setTitle("👢 Tu as été expulsé").setColor("#e67e22").addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: raison })] }); } catch {}
        await target.kick(raison).catch(() => {});
        const emb = new EmbedBuilder().setTitle("👢 KICK").setColor("#e67e22").addFields({ name: "Sujet", value: `${target.user.tag}` }, { name: "Raison", value: raison }, { name: "Staff", value: user.tag }).setTimestamp();
        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'mute') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const mins = options.getInteger('minutes');
        const raison = options.getString('raison');
        const u = initUser(target.id);
        u.mutes++; save();
        await target.timeout(mins * 60000, raison);
        const emb = new EmbedBuilder().setTitle("🔇 MUTE").setColor("#f1c40f")
            .setImage(db.config.gifs.mute)
            .addFields(
                { name: "🎯 Sujet", value: `${target}`, inline: true },
                { name: "⏱️ Durée", value: `${mins} minute(s)`, inline: true },
                { name: "📋 Raison", value: raison },
                { name: "📊 Total mutes", value: `\`${u.mutes}\`` }
            ).setTimestamp();
        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'unmute') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        await target.timeout(null);
        const emb = new EmbedBuilder().setTitle("🔊 UNMUTE").setColor("#2ecc71").addFields({ name: "Sujet", value: `${target}` }).setTimestamp();
        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'warn') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const raison = options.getString('raison');
        const u = initUser(target.id);
        u.warns++;
        if (!u.warnReasons) u.warnReasons = [];
        u.warnReasons.push({ raison, by: user.tag, at: new Date().toISOString() });
        save();

        try {
            await target.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Avertissement reçu").setColor("#f1c40f").addFields({ name: "Raison", value: raison }, { name: "Total warns", value: `${u.warns}` })] });
        } catch {}

        const emb = new EmbedBuilder().setTitle("⚠️ WARN").setColor("#f1c40f")
            .setImage(db.config.gifs.warn)
            .addFields(
                { name: "🎯 Sujet", value: `${target.tag}`, inline: true },
                { name: "👮 Staff", value: user.tag, inline: true },
                { name: "📋 Raison", value: raison },
                { name: "📊 Total warns", value: `\`${u.warns}\`` }
            ).setTimestamp();
        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'unwarn') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const u = initUser(target.id);
        if (u.warns > 0) { u.warns--; u.warnReasons?.pop(); save(); }
        return i.editReply(`✅ Dernier avertissement retiré de **${target.tag}**. (Warns : ${u.warns})`);
    }

    if (commandName === 'clear') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const nb = options.getInteger('nb');
        const filterUser = options.getUser('filtre');
        let messages = await i.channel.messages.fetch({ limit: filterUser ? 100 : nb });
        if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id).first(nb);
        const deleted = await i.channel.bulkDelete(messages, true).catch(() => new Collection());
        return i.editReply({ content: `🧹 **${deleted.size}** message(s) supprimé(s).`, embeds: [] });
    }

    if (commandName === 'bl') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const raison = options.getString('raison');
        const u = initUser(target.id);
        u.blacklisted = true; save();

        // Retirer tous les rôles et ajouter au salon de quarantaine
        if (db.config.bl_chan) {
            const blChan = guild.channels.cache.get(db.config.bl_chan);
            if (blChan) {
                // Retirer la permission de parler partout et forcer dans bl_chan
                await target.roles.set([]).catch(() => {});
            }
        }

        const emb = new EmbedBuilder().setTitle("🚫 BLACKLIST").setColor("#8e44ad")
            .setImage(db.config.gifs.bl)
            .addFields({ name: "🎯 Sujet", value: `${target.user.tag}` }, { name: "📋 Raison", value: raison }, { name: "👮 Staff", value: user.tag })
            .setTimestamp();
        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'unbl') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const u = initUser(target.id);
        u.blacklisted = false; save();
        return i.editReply(`✅ **${target.user.tag}** retiré de la blacklist.`);
    }

    if (commandName === 'slowmode') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const secs = options.getInteger('secondes');
        await i.channel.setRateLimitPerUser(secs);
        return i.editReply(secs === 0 ? "✅ Slowmode désactivé." : `✅ Slowmode **${secs}s** activé.`);
    }

    if (commandName === 'lock') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return i.editReply("🔒 Salon verrouillé.");
    }

    if (commandName === 'unlock') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        await i.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return i.editReply("🔓 Salon déverrouillé.");
    }

    // ════════════ XP ════════════
    if (commandName === 'rank') {
        const target = options.getUser('cible') || user;
        const u = initUser(target.id);
        const nextXP = calcXPforLevel(u.level + 1);
        const pct = Math.round((u.xp / nextXP) * 100);
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));

        const emb = new EmbedBuilder()
            .setTitle(`🏅 RANG : ${target.username.toUpperCase()}`)
            .setColor("#f39c12")
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "📈 Niveau", value: `**${u.level}**`, inline: true },
                { name: "⭐ XP", value: `${u.xp} / ${nextXP}`, inline: true },
                { name: "💰 Coins", value: `${u.coins}`, inline: true },
                { name: "📊 Progression", value: `\`${bar}\` ${pct}%` }
            ).setTimestamp();
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'leaderboard') {
        const sorted = Object.entries(db.users)
            .sort(([, a], [, b]) => (b.xp || 0) - (a.xp || 0))
            .slice(0, 10);

        const medals = ["🥇", "🥈", "🥉"];
        const lines = await Promise.all(sorted.map(async ([uid, u], idx) => {
            const membre = guild.members.cache.get(uid);
            const name = membre?.displayName || `Utilisateur (${uid})`;
            return `${medals[idx] || `\`${idx + 1}.\``} **${name}** — Niveau **${u.level || 0}** | XP: ${u.xp || 0}`;
        }));

        const emb = new EmbedBuilder()
            .setTitle("🏆 TOP 10 — MEMBRES LES PLUS ACTIFS")
            .setColor("#f1c40f")
            .setDescription(lines.join("\n") || "Aucune donnée.")
            .setTimestamp();
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'xp-give') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const u = initUser(target.id);
        u.xp += montant; save();
        return i.editReply(`✅ **+${montant} XP** donnés à ${target.tag} (Total : ${u.xp} XP)`);
    }

    // ════════════ ÉCONOMIE ════════════
    if (commandName === 'balance') {
        const target = options.getUser('cible') || user;
        const u = initUser(target.id);
        const emb = new EmbedBuilder()
            .setTitle(`💰 SOLDE : ${target.username.toUpperCase()}`)
            .setColor("#2ecc71")
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "💎 Coins", value: `**${u.coins || 0}**`, inline: true },
                { name: "🏅 Niveau", value: `${u.level || 0}`, inline: true },
                { name: "🎒 Inventaire", value: u.inventory?.length > 0 ? u.inventory.join(", ") : "Vide" }
            );
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'pay') {
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const raison = options.getString('raison') || "Aucune raison";
        if (target.id === user.id) return i.editReply("❌ Tu ne peux pas te payer toi-même.");
        const u = initUser(user.id);
        const t = initUser(target.id);
        if (u.coins < montant) return i.editReply(`❌ Solde insuffisant. Tu as **${u.coins}** coins.`);
        u.coins -= montant;
        t.coins += montant;
        db.economy.transactions.push({ from: user.id, to: target.id, amount: montant, reason: raison, timestamp: Date.now() });
        save();
        const emb = new EmbedBuilder().setTitle("💸 TRANSFERT").setColor("#2ecc71")
            .addFields({ name: "De", value: user.tag, inline: true }, { name: "Vers", value: target.tag, inline: true }, { name: "Montant", value: `**${montant} coins**`, inline: true }, { name: "Motif", value: raison });
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'daily') {
        const u = initUser(user.id);
        const now = Date.now();
        if (u.lastDaily && now - u.lastDaily < 86400000) {
            const restant = Math.ceil((86400000 - (now - u.lastDaily)) / 3600000);
            return i.editReply(`⏰ Reviens dans **${restant}h** pour ta récompense quotidienne.`);
        }
        const reward = Math.floor(Math.random() * 200) + 100; // 100-300 coins
        u.coins = (u.coins || 0) + reward;
        u.lastDaily = now;
        save();
        return i.editReply(`🎁 Tu as reçu **${reward} coins** ! Solde total : **${u.coins}** coins.`);
    }

    if (commandName === 'shop') {
        const items = Object.entries(db.config.shop);
        if (items.length === 0) return i.editReply("🏪 La boutique est vide.");
        const emb = new EmbedBuilder().setTitle("🏪 BOUTIQUE DU SERVEUR").setColor("#9b59b6")
            .setDescription(items.map(([name, item]) => `**${name}** — ${item.price} coins\n${item.description || ""} → <@&${item.roleId}>`).join("\n\n"))
            .setFooter({ text: "Utilise /buy <article> pour acheter" });
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'buy') {
        const nom = options.getString('article');
        const item = db.config.shop[nom];
        if (!item) return i.editReply(`❌ Article **${nom}** introuvable dans la boutique.`);
        const u = initUser(user.id);
        if (u.coins < item.price) return i.editReply(`❌ Solde insuffisant. Tu as **${u.coins}** coins, il en faut **${item.price}**.`);
        u.coins -= item.price;
        if (!u.inventory) u.inventory = [];
        u.inventory.push(nom);
        save();
        // Attribuer le rôle
        try { await member.roles.add(item.roleId); } catch {}
        return i.editReply(`✅ Tu as acheté **${nom}** ! Rôle <@&${item.roleId}> attribué.`);
    }

    if (commandName === 'shop-add') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const nom = options.getString('nom');
        const prix = options.getInteger('prix');
        const role = options.getRole('role');
        const desc = options.getString('description') || "";
        db.config.shop[nom] = { price: prix, roleId: role.id, description: desc }; save();
        return i.editReply(`✅ Article **${nom}** (${prix} coins → <@&${role.id}>) ajouté à la boutique.`);
    }

    if (commandName === 'shop-remove') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const nom = options.getString('nom');
        delete db.config.shop[nom]; save();
        return i.editReply(`✅ Article **${nom}** retiré de la boutique.`);
    }

    if (commandName === 'coins-give') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const u = initUser(target.id);
        u.coins = (u.coins || 0) + montant; save();
        return i.editReply(`✅ **+${montant} coins** donnés à **${target.tag}**. Solde : ${u.coins}`);
    }

    // ════════════ GIVEAWAY ════════════
    if (commandName === 'giveaway') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const prix = options.getString('prix');
        const duree = options.getInteger('duree');
        const gagnants = options.getInteger('gagnants');
        const chan = options.getChannel('salon') || i.channel;

        const endTime = Date.now() + duree * 60000;
        const endDate = new Date(endTime);

        const emb = new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY !")
            .setColor("#e91e63")
            .addFields(
                { name: "🏆 Prix", value: prix },
                { name: "👑 Gagnants", value: `${gagnants}` },
                { name: "⏰ Fin", value: `<t:${Math.floor(endTime / 1000)}:R>` },
                { name: "🚀 Organisateur", value: `${user}` }
            )
            .setFooter({ text: "Clique sur le bouton pour participer !" })
            .setTimestamp(endDate);

        const msg = await chan.send({ embeds: [emb], components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ga_join_PLACEHOLDER`).setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
            )
        ]});

        db.giveaways[msg.id] = { prize: prix, endTime, channelId: chan.id, winnersCount: gagnants, participants: [], ended: false };
        save();

        // Mettre à jour le bouton avec le vrai ID
        await msg.edit({ components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ga_join_${msg.id}`).setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
            )
        ]});

        return i.editReply(`✅ Giveaway créé dans <#${chan.id}> !`);
    }

    if (commandName === 'giveaway-end') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const msgId = options.getString('message_id');
        await endGiveaway(msgId, guild);
        return i.editReply("✅ Giveaway terminé.");
    }

    if (commandName === 'giveaway-reroll') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const msgId = options.getString('message_id');
        await endGiveaway(msgId, guild, true);
        return i.editReply("🔄 Reroll effectué.");
    }

    // ════════════ SONDAGE ════════════
    if (commandName === 'poll') {
        const question = options.getString('question');
        const opts = [
            options.getString('option1'),
            options.getString('option2'),
            options.getString('option3'),
            options.getString('option4')
        ].filter(Boolean);

        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
        const emb = new EmbedBuilder()
            .setTitle(`📊 ${question}`)
            .setColor("#3498db")
            .setDescription(opts.map((o, idx) => `**${o}**\n\`${"░".repeat(10)}\` 0% (0)`).join("\n\n"))
            .setFooter({ text: "Clique sur un bouton pour voter" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            opts.map((o, idx) => new ButtonBuilder()
                .setCustomId(`poll_PLACEHOLDER_${idx}`)
                .setLabel(`${emojis[idx]} ${o}`.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
            )
        );

        const msg = await i.channel.send({ embeds: [emb], components: [row] });

        db.polls[msg.id] = { question, options: opts, votes: {}, channelId: i.channel.id };
        save();

        // Mettre à jour les boutons avec le vrai ID
        const realRow = new ActionRowBuilder().addComponents(
            opts.map((o, idx) => new ButtonBuilder()
                .setCustomId(`poll_${msg.id}_${idx}`)
                .setLabel(`${emojis[idx]} ${o}`.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
            )
        );
        await msg.edit({ components: [realRow] });

        return i.editReply("✅ Sondage créé !");
    }

    // ════════════ TICKETS ════════════
    if (commandName === 'ticket') {
        if (!db.config.ticket_cat) return i.editReply("❌ Catégorie tickets non configurée. Utilise `/setup-tickets`.");

        const existingTicket = Object.entries(db.tickets).find(([, t]) => t.userId === user.id && !t.closed);
        if (existingTicket) return i.editReply(`❌ Tu as déjà un ticket ouvert : <#${existingTicket[0]}>`);

        const chan = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: db.config.ticket_cat,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ...(db.config.staff_role ? [{ id: db.config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
            ]
        });

        db.tickets[chan.id] = { userId: user.id, createdAt: Date.now(), closed: false };
        save();

        const closeBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket_close_${chan.id}`).setLabel("🔒 Fermer le ticket").setStyle(ButtonStyle.Danger)
        );

        await chan.send({
            content: `<@${user.id}> Bienvenue dans ton ticket ! L'équipe staff va te répondre.`,
            embeds: [new EmbedBuilder().setTitle("🎫 TICKET OUVERT").setColor("#2ecc71").addFields({ name: "Ouvert par", value: `${user.tag}` }, { name: "Créé le", value: new Date().toLocaleString('fr-FR') }).setDescription("Décris ton problème ci-dessous.")],
            components: [closeBtn]
        });

        await sendLog(guild, new EmbedBuilder().setTitle("🎫 NOUVEAU TICKET").setColor("#2ecc71").addFields({ name: "Utilisateur", value: user.tag }, { name: "Salon", value: `<#${chan.id}>` }).setTimestamp());
        return i.editReply({ content: `✅ Ton ticket a été ouvert : <#${chan.id}>`, ephemeral: true } || `✅ Ticket ouvert : <#${chan.id}>`);
    }

    if (commandName === 'ticket-close') {
        const ticket = db.tickets[i.channel.id];
        if (!ticket) return i.editReply("❌ Ce salon n'est pas un ticket.");
        if (!isStaff(member) && ticket.userId !== user.id) return i.editReply("❌ Permission refusée.");
        ticket.closed = true; save();
        await i.editReply("🔒 Ticket fermé. Suppression dans 10 secondes.");
        setTimeout(() => i.channel.delete().catch(() => {}), 10000);
    }

    if (commandName === 'ticket-add') {
        const ticket = db.tickets[i.channel.id];
        if (!ticket) return i.editReply("❌ Ce salon n'est pas un ticket.");
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        await i.channel.permissionOverwrites.edit(target, { ViewChannel: true, SendMessages: true });
        return i.editReply(`✅ <@${target.id}> ajouté au ticket.`);
    }

    // ════════════ IA & BUSINESS ════════════
    if (commandName === 'ask') {
        const q = options.getString('q');
        await i.editReply("🤖 Analyse en cours...");
        const rep = await askMistral(q);
        return i.editReply(`**🤖 PARADISE OVERLORD IA :**\n${rep}`);
    }

    if (commandName === 'facture') {
        const ht = options.getNumber('ht');
        const tva = ht * 0.20;
        const ttc = ht + tva;
        const client_user = options.getUser('client');
        const objet = options.getString('objet');
        const num = options.getString('numero') || `INV-${Date.now().toString().slice(-6)}`;
        const emb = new EmbedBuilder()
            .setTitle("🧾 FACTURE OFFICIELLE")
            .setColor("#2ecc71")
            .setImage(db.config.gifs.facture)
            .addFields(
                { name: "📋 N° Facture", value: num, inline: true },
                { name: "📅 Date", value: new Date().toLocaleDateString('fr-FR'), inline: true },
                { name: "👤 Client", value: `${client_user}`, inline: true },
                { name: "📦 Objet", value: objet },
                { name: "💵 Prix HT", value: `${ht.toLocaleString('fr-FR')}€`, inline: true },
                { name: "📊 TVA 20%", value: `${tva.toLocaleString('fr-FR')}€`, inline: true },
                { name: "💰 Total TTC", value: `**${ttc.toLocaleString('fr-FR')}€**`, inline: true }
            )
            .setFooter({ text: `Facturé par ${user.tag}` })
            .setTimestamp();
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'wl-start') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        if (!db.config.wl_cat) return i.editReply("❌ Catégorie WL non configurée.");
        const cible = options.getMember('cible');
        const chan = await guild.channels.create({
            name: `wl-${cible.user.username}`,
            type: ChannelType.GuildText,
            parent: db.config.wl_cat,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: cible.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ...(db.config.staff_role ? [{ id: db.config.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
            ]
        });
        await chan.send({
            embeds: [new EmbedBuilder().setTitle("📝 RECRUTEMENT STAFF").setColor("#3498db")
                .setDescription(`Bienvenue <@${cible.id}> ! Un membre du staff va bientôt te contacter pour la whitelist.`)
                .addFields({ name: "Candidat", value: `${cible.user.tag}` }, { name: "Lancé par", value: user.tag })
            ]
        });
        return i.editReply(`✅ Salon WL créé : <#${chan.id}>`);
    }

    if (commandName === 'announce') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const texte = options.getString('texte');
        const chan = options.getChannel('salon');
        const couleur = colorFromHex(options.getString('couleur') || '#5865F2');
        const titre = options.getString('titre') || '📢 Annonce';
        const emb = new EmbedBuilder().setTitle(titre).setDescription(texte).setColor(couleur).setTimestamp().setFooter({ text: `Annonce de ${user.tag}` });
        await chan.send({ content: "@everyone", embeds: [emb] });
        return i.editReply(`✅ Annonce envoyée dans <#${chan.id}>.`);
    }

    // ════════════ INFOS ════════════
    if (commandName === 'stats') {
        const target = options.getUser('cible') || user;
        const u = initUser(target.id);
        const reasons = u.warnReasons?.slice(-3).map((w, idx) => `\`${idx + 1}.\` ${w.raison} (par ${w.by})`).join("\n") || "Aucun";
        const emb = new EmbedBuilder()
            .setTitle(`📊 DOSSIER : ${target.username.toUpperCase()}`)
            .setColor("#2b2d31")
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "🔨 Bans", value: `\`${u.bans}\``, inline: true },
                { name: "🔇 Mutes", value: `\`${u.mutes}\``, inline: true },
                { name: "⚠️ Warns", value: `\`${u.warns}\``, inline: true },
                { name: "🚫 Blacklisté", value: u.blacklisted ? "**OUI**" : "Non", inline: true },
                { name: "⭐ XP / Niveau", value: `${u.xp || 0} XP | Niveau ${u.level || 0}`, inline: true },
                { name: "💰 Coins", value: `${u.coins || 0}`, inline: true },
                { name: "📋 Derniers warns", value: reasons }
            )
            .setTimestamp();
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'userinfo') {
        const target = options.getMember('cible') || member;
        const u = target.user;
        const roles = target.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => `<@&${r.id}>`).join(", ") || "Aucun";
        const emb = new EmbedBuilder()
            .setTitle(`👤 ${u.username}`)
            .setColor("#3498db")
            .setThumbnail(u.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: "🆔 ID", value: u.id, inline: true },
                { name: "📛 Pseudo", value: target.displayName, inline: true },
                { name: "🤖 Bot", value: u.bot ? "Oui" : "Non", inline: true },
                { name: "📅 Compte créé", value: `<t:${Math.floor(u.createdTimestamp / 1000)}:D>`, inline: true },
                { name: "📥 Rejoint le", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
                { name: "🎭 Rôles", value: roles.length > 1024 ? roles.slice(0, 1020) + "..." : roles }
            )
            .setTimestamp();
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'server-info') {
        const owner = await guild.fetchOwner();
        const emb = new EmbedBuilder()
            .setTitle(`ℹ️ ${guild.name.toUpperCase()}`)
            .setColor("#2b2d31")
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: "👑 Propriétaire", value: `${owner.user.tag}`, inline: true },
                { name: "🆔 ID", value: guild.id, inline: true },
                { name: "👥 Membres", value: `${guild.memberCount}`, inline: true },
                { name: "📅 Créé le", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                { name: "✅ Vérification", value: guild.verificationLevel.toString(), inline: true },
                { name: "💎 Boosts", value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
                { name: "📢 Salons", value: `${guild.channels.cache.size}`, inline: true },
                { name: "🎭 Rôles", value: `${guild.roles.cache.size}`, inline: true },
                { name: "😀 Emojis", value: `${guild.emojis.cache.size}`, inline: true }
            )
            .setTimestamp();
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'avatar') {
        const target = options.getUser('cible') || user;
        const emb = new EmbedBuilder()
            .setTitle(`🖼️ Avatar de ${target.username}`)
            .setColor("#9b59b6")
            .setImage(target.displayAvatarURL({ size: 512, dynamic: true }));
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'ping') {
        return i.editReply(`🏓 Latence : **${client.ws.ping}ms** | API : **${Date.now() - i.createdTimestamp}ms**`);
    }

    if (commandName === 'help') {
        const emb = new EmbedBuilder()
            .setTitle("📖 MANUEL — PARADISE OVERLORD V19")
            .setColor("#5865F2")
            .setDescription("Système de gestion ultime du serveur.")
            .addFields(
                { name: "🛡️ Modération", value: "`/ban` `/kick` `/mute` `/unmute` `/warn` `/unwarn` `/clear` `/bl` `/unbl` `/slowmode` `/lock` `/unlock`" },
                { name: "🤖 Auto-Mod", value: "`/automod` (anti-spam, anti-liens, mots bannis, anti-mentions)" },
                { name: "📈 Système XP", value: "`/rank` `/leaderboard` `/xp-give` `/setup-xp-role`" },
                { name: "💰 Économie", value: "`/balance` `/pay` `/daily` `/shop` `/buy` `/coins-give`" },
                { name: "🏪 Boutique Staff", value: "`/shop-add` `/shop-remove`" },
                { name: "🎉 Giveaway", value: "`/giveaway` `/giveaway-end` `/giveaway-reroll`" },
                { name: "📊 Sondage", value: "`/poll`" },
                { name: "🎫 Tickets", value: "`/ticket` `/ticket-close` `/ticket-add`" },
                { name: "🧠 IA & Business", value: "`/ask` `/facture` `/wl-start` `/message` `/announce`" },
                { name: "⚙️ Configuration", value: "`/setup-logs` `/setup-welcome` `/setup-staff` `/setup-blacklist` `/setup-whitelist` `/setup-tickets` `/setup-muted` `/setup-gif` `/setup-ai` `/setup-xp-role`" },
                { name: "ℹ️ Infos", value: "`/stats` `/userinfo` `/server-info` `/avatar` `/ping`" }
            )
            .setFooter({ text: "Paradise Overlord V19 — Système Ultime" })
            .setTimestamp();
        return i.editReply({ embeds: [emb] });
    }
});

// ════════════════════════════════════════════
//  10. ÉVÉNEMENTS DU SERVEUR
// ════════════════════════════════════════════

// XP sur message
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    await automod(message);
    await addXP(message.author.id, message.guild);
});

// Message supprimé → log
client.on(Events.MessageDelete, async message => {
    if (!message.guild || !db.config.logs || message.author?.bot) return;
    const logChan = message.guild.channels.cache.get(db.config.logs);
    if (!logChan || !message.content) return;
    const emb = new EmbedBuilder()
        .setTitle("🗑️ MESSAGE SUPPRIMÉ")
        .setColor("#e74c3c")
        .addFields(
            { name: "Auteur", value: `${message.author?.tag || 'Inconnu'}`, inline: true },
            { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
            { name: "Contenu", value: message.content.slice(0, 1024) || "—" }
        )
        .setTimestamp();
    logChan.send({ embeds: [emb] }).catch(() => {});
});

// Message modifié → log
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!oldMsg.guild || !db.config.logs || oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;
    const logChan = oldMsg.guild.channels.cache.get(db.config.logs);
    if (!logChan) return;
    const emb = new EmbedBuilder()
        .setTitle("✏️ MESSAGE MODIFIÉ")
        .setColor("#f39c12")
        .addFields(
            { name: "Auteur", value: `${oldMsg.author?.tag || 'Inconnu'}`, inline: true },
            { name: "Salon", value: `<#${oldMsg.channel.id}>`, inline: true },
            { name: "Avant", value: (oldMsg.content || "—").slice(0, 512) },
            { name: "Après", value: (newMsg.content || "—").slice(0, 512) }
        )
        .setTimestamp();
    logChan.send({ embeds: [emb] }).catch(() => {});
});

// Membre qui rejoint → bienvenue + log
client.on(Events.GuildMemberAdd, async member => {
    if (db.config.welcome) {
        const chan = member.guild.channels.cache.get(db.config.welcome);
        if (chan) {
            const emb = new EmbedBuilder()
                .setTitle(`👋 Bienvenue ${member.user.username} !`)
                .setDescription(`Bienvenue sur **${member.guild.name}** ! Tu es le membre **#${member.guild.memberCount}**.`)
                .setColor("#2ecc71")
                .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                .setImage(db.config.gifs.welcome)
                .setTimestamp();
            chan.send({ content: `<@${member.id}>`, embeds: [emb] }).catch(() => {});
        }
    }

    if (db.config.logs) {
        const logChan = member.guild.channels.cache.get(db.config.logs);
        if (logChan) {
            const emb = new EmbedBuilder()
                .setTitle("📥 NOUVEAU MEMBRE")
                .setColor("#2ecc71")
                .addFields(
                    { name: "Membre", value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                    { name: "ID", value: member.id, inline: true },
                    { name: "Compte créé", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            logChan.send({ embeds: [emb] }).catch(() => {});
        }
    }

    // Initialiser l'utilisateur
    initUser(member.id);
    save();
});

// Membre qui quitte → log
client.on(Events.GuildMemberRemove, async member => {
    if (!db.config.logs) return;
    const logChan = member.guild.channels.cache.get(db.config.logs);
    if (!logChan) return;
    const emb = new EmbedBuilder()
        .setTitle("📤 MEMBRE PARTI")
        .setColor("#e74c3c")
        .addFields(
            { name: "Membre", value: `${member.user.tag}`, inline: true },
            { name: "ID", value: member.id, inline: true },
            { name: "Était sur le serveur depuis", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Inconnu" }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
    logChan.send({ embeds: [emb] }).catch(() => {});
});

// Rôle ajouté/retiré → log
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (!db.config.logs) return;
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    const logChan = newMember.guild.channels.cache.get(db.config.logs);
    if (!logChan) return;
    const emb = new EmbedBuilder().setTitle("🎭 RÔLES MODIFIÉS").setColor("#9b59b6")
        .addFields({ name: "Membre", value: `${newMember.user.tag}` });
    if (addedRoles.size > 0) emb.addFields({ name: "➕ Ajouté", value: addedRoles.map(r => `<@&${r.id}>`).join(", ") });
    if (removedRoles.size > 0) emb.addFields({ name: "➖ Retiré", value: removedRoles.map(r => `<@&${r.id}>`).join(", ") });
    emb.setTimestamp();
    logChan.send({ embeds: [emb] }).catch(() => {});
});

// ════════════════════════════════════════════
//  11. INITIALISATION
// ════════════════════════════════════════════
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // Enregistrement des commandes
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`🚀 ${commands.length} commandes enregistrées.`);
    } catch (e) {
        console.error("Erreur enregistrement commandes:", e);
    }

    // Statut du bot (rotation)
    const statuses = [
        { type: ActivityType.Watching, text: "le serveur" },
        { type: ActivityType.Playing, text: "Paradise Overlord V19" },
        { type: ActivityType.Listening, text: "/help pour les commandes" }
    ];
    let statusIdx = 0;
    client.user.setActivity(statuses[0].text, { type: statuses[0].type });
    setInterval(() => {
        statusIdx = (statusIdx + 1) % statuses.length;
        client.user.setActivity(statuses[statusIdx].text, { type: statuses[statusIdx].type });
    }, 30000);

    console.log("🔥 PARADISE OVERLORD V19 : SYSTÈME ULTIME EN LIGNE");
});

client.login(process.env.TOKEN);
