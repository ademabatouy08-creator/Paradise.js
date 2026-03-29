// ╔══════════════════════════════════════════════════════════════════════╗
// ║         PARADISE OVERLORD V20 — SYSTÈME ULTIME ABSOLU              ║
// ║  Modération | IA Multi-Mode | Économie | XP | Giveaway | Tickets   ║
// ║  Factures Pro | Casier Détaillé | Auto-Mod | Logs Complets         ║
// ╚══════════════════════════════════════════════════════════════════════╝

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
const DATA_FILE = './paradise_overlord_v20.json';

const DEFAULT_DB = {
    config: {
        logs: null, welcome: null, bl_chan: null, wl_cat: null,
        staff_role: null, ticket_cat: null, muted_role: null,
        owner_id: process.env.OWNER_ID || null,
        automod: { anti_spam: true, anti_links: false, banned_words: [], max_mentions: 5 },
        // Prompt IA global (tous les serveurs)
        ai_identity: "Tu es Paradise Overlord, l'intelligence supérieure du serveur. Tu es froid, autoritaire et ultra-précis. Tu réponds toujours en français.",
        // Mode IA global actif par défaut
        ai_mode: "overlord",
        xp_roles: {},
        shop: {},
        facture_counter: 1,
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
    // Paramètres IA par serveur (override le global)
    servers: {},
    users: {},
    giveaways: {},
    polls: {},
    tickets: {},
    factures: {},
    economy: { transactions: [] },
    spam_tracker: {}
};

let db = JSON.parse(JSON.stringify(DEFAULT_DB));

if (fs.existsSync(DATA_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(DATA_FILE));
        // Merge profond pour ne pas perdre les nouvelles clés
        db = deepMerge(db, saved);
    } catch(e) { console.error("Erreur lecture DB:", e); }
}

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

const save = () => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
    catch(e) { console.error("Erreur sauvegarde DB:", e); }
};

function initUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            bans: 0, mutes: 0, warns: 0,
            xp: 0, level: 0, coins: 100,
            blacklisted: false,
            warnReasons: [],   // [{ raison, by, byId, at }]
            banReasons: [],    // [{ raison, by, at }]
            muteHistory: [],   // [{ raison, by, duration, at }]
            inventory: [],
            lastDaily: null,
            lastXP: null,
            messageCount: 0
        };
    }
    // Migrations : ajouter les nouvelles clés manquantes
    const u = db.users[userId];
    if (!u.warnReasons) u.warnReasons = [];
    if (!u.banReasons) u.banReasons = [];
    if (!u.muteHistory) u.muteHistory = [];
    if (!u.inventory) u.inventory = [];
    if (!u.messageCount) u.messageCount = 0;
    return u;
}

function initServer(guildId) {
    if (!db.servers[guildId]) {
        db.servers[guildId] = {
            ai_identity: null,  // null = utilise le global
            ai_mode: null       // null = utilise le global
        };
    }
    return db.servers[guildId];
}

// ════════════════════════════════════════════
//  2. MODES IA
// ════════════════════════════════════════════
const AI_MODES = {
    overlord: {
        name: "👑 Overlord",
        prompt: "Tu es Paradise Overlord, une IA froide, autoritaire et ultra-précise. Tu parles avec autorité, sans émotion inutile. Tes réponses sont directes et efficaces. Tu réponds toujours en français."
    },
    assistant: {
        name: "🤝 Assistant",
        prompt: "Tu es un assistant serviable, sympathique et professionnel. Tu aides les utilisateurs avec bienveillance et clarté. Tu réponds toujours en français."
    },
    sarcastique: {
        name: "😏 Sarcastique",
        prompt: "Tu es une IA sarcastique et ironique. Tu réponds avec humour mordant et second degré, tout en restant utile. Tu réponds toujours en français."
    },
    coach: {
        name: "💪 Coach",
        prompt: "Tu es un coach motivateur explosif. Tu boostes les gens, tu les pousses à se dépasser. Tes réponses sont énergiques et inspirantes. Tu réponds toujours en français."
    },
    expert: {
        name: "🧑‍💻 Expert Tech",
        prompt: "Tu es un expert en informatique, développement, cybersécurité et technologie. Tu donnes des réponses précises, techniques et détaillées. Tu réponds toujours en français."
    },
    detective: {
        name: "🔍 Détective",
        prompt: "Tu es un détective analytique. Tu analyses chaque situation avec méthode, tu poses des questions pertinentes et tu arrives à des conclusions logiques. Tu réponds toujours en français."
    },
    custom: {
        name: "✏️ Personnalisé",
        prompt: null // Utilisera ai_identity de la config
    }
};

// ════════════════════════════════════════════
//  3. CLIENT DISCORD
// ════════════════════════════════════════════
const client = new Client({ intents: 3276799 });

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise Overlord V20: ONLINE"); res.end();
}).listen(process.env.PORT || 10000);

// ════════════════════════════════════════════
//  4. REGISTRE DES COMMANDES
// ════════════════════════════════════════════
const commands = [

    // ── SETUPS ──────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('setup-logs').setDescription('📑 Salon des logs de sécurité')
        .addChannelOption(o => o.setName('salon').setDescription('Salon des logs').setRequired(true)),
    new SlashCommandBuilder().setName('setup-welcome').setDescription('👋 Salon de bienvenue')
        .addChannelOption(o => o.setName('salon').setDescription('Salon bienvenue').setRequired(true)),
    new SlashCommandBuilder().setName('setup-blacklist').setDescription('🚫 Salon isolation Blacklist')
        .addChannelOption(o => o.setName('salon').setDescription('Salon isolation').setRequired(true)),
    new SlashCommandBuilder().setName('setup-whitelist').setDescription('📝 Catégorie Whitelist Staff')
        .addChannelOption(o => o.setName('cat').setDescription('Catégorie WL').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-staff').setDescription('👑 Rôle Staff autorisé')
        .addRoleOption(o => o.setName('role').setDescription('Rôle staff').setRequired(true)),
    new SlashCommandBuilder().setName('setup-tickets').setDescription('🎫 Catégorie tickets support')
        .addChannelOption(o => o.setName('cat').setDescription('Catégorie tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('setup-muted').setDescription('🔇 Rôle Muted')
        .addRoleOption(o => o.setName('role').setDescription('Rôle muted').setRequired(true)),
    new SlashCommandBuilder().setName('setup-gif').setDescription('🖼️ Modifier les visuels')
        .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
            .addChoices(
                {name:'Ban',value:'ban'},{name:'Mute',value:'mute'},{name:'Warn',value:'warn'},
                {name:'Facture',value:'facture'},{name:'BL',value:'bl'},
                {name:'Welcome',value:'welcome'},{name:'Level Up',value:'level'}
            ))
        .addStringOption(o => o.setName('url').setDescription('URL directe du GIF/image').setRequired(true)),
    new SlashCommandBuilder().setName('setup-xp-role').setDescription('🎖️ Associer un rôle à un niveau XP')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer').setRequired(true)),

    // ── IA ──────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('ask').setDescription('🤖 Interroger l\'IA Paradise Overlord')
        .addStringOption(o => o.setName('q').setDescription('Ta question').setRequired(true)),
    new SlashCommandBuilder().setName('ia-mode').setDescription('🧠 Changer le mode de l\'IA')
        .addStringOption(o => o.setName('mode').setDescription('Mode IA').setRequired(true)
            .addChoices(
                { name: '👑 Overlord — Froid & Autoritaire', value: 'overlord' },
                { name: '🤝 Assistant — Serviable & Pro', value: 'assistant' },
                { name: '😏 Sarcastique — Ironique & Drôle', value: 'sarcastique' },
                { name: '💪 Coach — Motivateur & Explosif', value: 'coach' },
                { name: '🧑‍💻 Expert Tech — Précis & Technique', value: 'expert' },
                { name: '🔍 Détective — Analytique & Logique', value: 'detective' },
                { name: '✏️ Personnalisé — Ton propre prompt', value: 'custom' }
            ))
        .addStringOption(o => o.setName('portee').setDescription('Portée du changement').setRequired(true)
            .addChoices(
                { name: '🌍 Global (tous les serveurs)', value: 'global' },
                { name: '🏠 Ce serveur uniquement', value: 'local' }
            )),
    new SlashCommandBuilder().setName('ia-prompt').setDescription('✏️ Définir un prompt personnalisé pour le mode Custom')
        .addStringOption(o => o.setName('prompt').setDescription('Le prompt personnalisé').setRequired(true))
        .addStringOption(o => o.setName('portee').setDescription('Portée').setRequired(true)
            .addChoices(
                { name: '🌍 Global', value: 'global' },
                { name: '🏠 Ce serveur', value: 'local' }
            )),
    new SlashCommandBuilder().setName('ia-info').setDescription('ℹ️ Voir le mode IA actif sur ce serveur'),
    new SlashCommandBuilder().setName('ia-conversation').setDescription('💬 Démarrer une conversation IA dans ce salon (répond à chaque message)')
        .addBooleanOption(o => o.setName('activer').setDescription('Activer ou désactiver').setRequired(true)),
    new SlashCommandBuilder().setName('resume').setDescription('📝 Résumer un texte avec l\'IA')
        .addStringOption(o => o.setName('texte').setDescription('Texte à résumer').setRequired(true)),
    new SlashCommandBuilder().setName('traduit').setDescription('🌍 Traduire un texte avec l\'IA')
        .addStringOption(o => o.setName('texte').setDescription('Texte à traduire').setRequired(true))
        .addStringOption(o => o.setName('langue').setDescription('Langue cible (ex: anglais, espagnol...)').setRequired(true)),
    new SlashCommandBuilder().setName('corrige').setDescription('✍️ Corriger l\'orthographe d\'un texte')
        .addStringOption(o => o.setName('texte').setDescription('Texte à corriger').setRequired(true)),

    // ── AUTO-MODÉRATION ──────────────────────────────────────────────────
    new SlashCommandBuilder().setName('automod').setDescription('🛡️ Configurer l\'auto-modération')
        .addStringOption(o => o.setName('option').setDescription('Option').setRequired(true)
            .addChoices(
                {name:'Anti-spam ON/OFF',value:'spam'},
                {name:'Anti-liens ON/OFF',value:'links'},
                {name:'Ajouter mot banni',value:'add_word'},
                {name:'Retirer mot banni',value:'del_word'},
                {name:'Max mentions',value:'mentions'},
                {name:'Voir la config',value:'view'}
            ))
        .addStringOption(o => o.setName('valeur').setDescription('Valeur')),

    // ── MODÉRATION ───────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannissement définitif')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true))
        .addBooleanOption(o => o.setName('silent').setDescription('Silencieux (pas d\'annonce publique)')),
    new SlashCommandBuilder().setName('kick').setDescription('👢 Expulser du serveur')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('🔇 Museler un utilisateur')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
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
        .addUserOption(o => o.setName('filtre').setDescription('Filtrer par utilisateur')),
    new SlashCommandBuilder().setName('bl').setDescription('🚫 Blacklist : Isolation immédiate')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif').setRequired(true)),
    new SlashCommandBuilder().setName('unbl').setDescription('✅ Libérer de la Blacklist')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('slowmode').setDescription('🐌 Slowmode sur le salon')
        .addIntegerOption(o => o.setName('secondes').setDescription('Délai (0 = désactiver)').setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller un salon'),
    new SlashCommandBuilder().setName('unlock').setDescription('🔓 Déverrouiller un salon'),
    new SlashCommandBuilder().setName('role-give').setDescription('🎭 Donner un rôle à un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
    new SlashCommandBuilder().setName('role-remove').setDescription('🗑️ Retirer un rôle à un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),

    // ── CASIER JUDICIAIRE ────────────────────────────────────────────────
    new SlashCommandBuilder().setName('stats').setDescription('📊 Casier judiciaire complet')
        .addUserOption(o => o.setName('cible').setDescription('Membre (toi si vide)')),
    new SlashCommandBuilder().setName('warns-list').setDescription('📋 Voir tous les avertissements d\'un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('casier-reset').setDescription('🔄 Réinitialiser le casier d\'un membre (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Que réinitialiser ?').setRequired(true)
            .addChoices(
                { name: 'Tout', value: 'all' },
                { name: 'Warns seulement', value: 'warns' },
                { name: 'Mutes seulement', value: 'mutes' },
                { name: 'Bans seulement', value: 'bans' }
            )),

    // ── XP ───────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('rank').setDescription('🏅 Voir son niveau et XP')
        .addUserOption(o => o.setName('cible').setDescription('Membre (toi si vide)')),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Top 10 membres les plus actifs'),
    new SlashCommandBuilder().setName('xp-give').setDescription('➕ Donner de l\'XP')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('XP').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('xp-remove').setDescription('➖ Retirer de l\'XP')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('XP').setRequired(true).setMinValue(1)),

    // ── ÉCONOMIE ─────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('balance').setDescription('💰 Voir son solde de coins')
        .addUserOption(o => o.setName('cible').setDescription('Membre (toi si vide)')),
    new SlashCommandBuilder().setName('pay').setDescription('💸 Transférer des coins')
        .addUserOption(o => o.setName('cible').setDescription('Destinataire').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('raison').setDescription('Motif')),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Récompense quotidienne'),
    new SlashCommandBuilder().setName('shop').setDescription('🏪 Boutique du serveur'),
    new SlashCommandBuilder().setName('buy').setDescription('🛒 Acheter un article')
        .addStringOption(o => o.setName('article').setDescription('Nom de l\'article').setRequired(true)),
    new SlashCommandBuilder().setName('shop-add').setDescription('➕ Ajouter un article (Staff)')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
        .addIntegerOption(o => o.setName('prix').setDescription('Prix en coins').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle attribué').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description')),
    new SlashCommandBuilder().setName('shop-remove').setDescription('🗑️ Retirer un article (Staff)')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true)),
    new SlashCommandBuilder().setName('coins-give').setDescription('💎 Donner des coins (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('coins-remove').setDescription('➖ Retirer des coins (Staff)')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('transactions').setDescription('📊 Voir les dernières transactions')
        .addUserOption(o => o.setName('cible').setDescription('Membre (toi si vide)')),

    // ── FACTURES ─────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('facture').setDescription('🧾 Générer une facture professionnelle (TVA 20%)')
        .addUserOption(o => o.setName('client').setDescription('Le client').setRequired(true))
        .addNumberOption(o => o.setName('ht').setDescription('Prix HT (€)').setRequired(true))
        .addStringOption(o => o.setName('objet').setDescription('Objet/description de la vente').setRequired(true))
        .addStringOption(o => o.setName('numero').setDescription('N° facture (auto si vide)'))
        .addStringOption(o => o.setName('notes').setDescription('Notes additionnelles')),
    new SlashCommandBuilder().setName('facture-list').setDescription('📋 Liste des factures émises')
        .addUserOption(o => o.setName('client').setDescription('Filtrer par client (optionnel)')),
    new SlashCommandBuilder().setName('facture-voir').setDescription('🔍 Voir une facture par son numéro')
        .addStringOption(o => o.setName('numero').setDescription('Numéro de facture').setRequired(true)),
    new SlashCommandBuilder().setName('devis').setDescription('📄 Générer un devis (sans TVA enregistrée)')
        .addUserOption(o => o.setName('client').setDescription('Le client').setRequired(true))
        .addNumberOption(o => o.setName('ht').setDescription('Prix HT (€)').setRequired(true))
        .addStringOption(o => o.setName('objet').setDescription('Objet du devis').setRequired(true))
        .addIntegerOption(o => o.setName('validite').setDescription('Validité en jours (défaut: 30)').setMinValue(1).setMaxValue(365)),

    // ── GIVEAWAY ─────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Lancer un giveaway')
        .addStringOption(o => o.setName('prix').setDescription('Le lot').setRequired(true))
        .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setRequired(true).setMinValue(1).setMaxValue(10))
        .addChannelOption(o => o.setName('salon').setDescription('Salon (actuel si vide)'))
        .addIntegerOption(o => o.setName('coins_requis').setDescription('Coins minimum pour participer (0 = pas de limite)').setMinValue(0)),
    new SlashCommandBuilder().setName('giveaway-end').setDescription('⏹️ Terminer un giveaway')
        .addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true)),
    new SlashCommandBuilder().setName('giveaway-reroll').setDescription('🔄 Nouveau tirage')
        .addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true)),

    // ── SONDAGE ──────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('poll').setDescription('📊 Créer un sondage')
        .addStringOption(o => o.setName('question').setDescription('La question').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('Option 3'))
        .addStringOption(o => o.setName('option4').setDescription('Option 4')),

    // ── TICKETS ──────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('ticket').setDescription('🎫 Ouvrir un ticket support'),
    new SlashCommandBuilder().setName('ticket-close').setDescription('🔒 Fermer ce ticket'),
    new SlashCommandBuilder().setName('ticket-add').setDescription('➕ Ajouter un membre au ticket')
        .addUserOption(o => o.setName('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('ticket-rename').setDescription('✏️ Renommer ce ticket')
        .addStringOption(o => o.setName('nom').setDescription('Nouveau nom').setRequired(true)),

    // ── BUSINESS ─────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('wl-start').setDescription('📝 Créer un salon de recrutement Staff')
        .addUserOption(o => o.setName('cible').setDescription('Candidat').setRequired(true)),
    new SlashCommandBuilder().setName('message').setDescription('📝 Créer un Embed stylisé'),
    new SlashCommandBuilder().setName('announce').setDescription('📢 Envoyer une annonce dans un salon')
        .addStringOption(o => o.setName('texte').setDescription('Texte').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon cible').setRequired(true))
        .addStringOption(o => o.setName('titre').setDescription('Titre'))
        .addStringOption(o => o.setName('couleur').setDescription('Couleur HEX'))
        .addBooleanOption(o => o.setName('mention').setDescription('@everyone ? (défaut: oui)')),
    new SlashCommandBuilder().setName('rappel').setDescription('⏰ Créer un rappel')
        .addIntegerOption(o => o.setName('minutes').setDescription('Dans combien de minutes ?').setRequired(true).setMinValue(1).setMaxValue(10080))
        .addStringOption(o => o.setName('message').setDescription('Le rappel').setRequired(true)),

    // ── INFOS ────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Informations détaillées d\'un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre')),
    new SlashCommandBuilder().setName('server-info').setDescription('ℹ️ Informations du serveur'),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Voir l\'avatar d\'un membre')
        .addUserOption(o => o.setName('cible').setDescription('Membre')),
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Latence du bot'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Liste complète des commandes'),

].map(c => c.toJSON());

// ════════════════════════════════════════════
//  5. MOTEUR IA (MISTRAL OFFICIEL)
// ════════════════════════════════════════════

// Récupère le bon prompt selon le serveur et le mode actif
function getAIPrompt(guildId) {
    const srv = db.servers[guildId] || {};
    const mode = srv.ai_mode || db.config.ai_mode || 'overlord';

    if (mode === 'custom') {
        return srv.ai_identity || db.config.ai_identity;
    }

    const modeData = AI_MODES[mode];
    return modeData ? modeData.prompt : AI_MODES.overlord.prompt;
}

async function askMistral(question, guildId = null, systemOverride = null) {
    const systemPrompt = systemOverride || getAIPrompt(guildId);

    try {
        const res = await axios.post(
            "https://api.mistral.ai/v1/chat/completions",
            {
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: question }
                ],
                max_tokens: 1000,
                temperature: 0.7
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 20000
            }
        );

        let text = res.data.choices[0].message.content.trim();
        // Nettoyer les balises de réflexion
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        text = text.replace(/\[INST\][\s\S]*?\[\/INST\]/gi, '').trim();
        return text || "Analyse terminée.";
    } catch (e) {
        if (e.response?.status === 429) return "⚠️ Trop de requêtes IA, réessaie dans quelques secondes.";
        return `⚠️ Liaison IA interrompue : ${e.message}`;
    }
}

// Salons avec mode conversation IA activé
const AI_CONVERSATION_CHANNELS = new Set();

// ════════════════════════════════════════════
//  6. SYSTÈME XP
// ════════════════════════════════════════════
const XP_COOLDOWNS = new Map();

function calcXPforLevel(lvl) { return 100 * lvl * (lvl + 1); }

async function addXP(userId, guild) {
    const now = Date.now();
    if (XP_COOLDOWNS.has(userId) && now - XP_COOLDOWNS.get(userId) < 60000) return;
    XP_COOLDOWNS.set(userId, now);

    const u = initUser(userId);
    const earned = Math.floor(Math.random() * 16) + 10; // 10-25 XP
    u.xp += earned;
    u.coins = (u.coins || 0) + 1;
    u.messageCount = (u.messageCount || 0) + 1;
    u.lastXP = now;

    const neededXP = calcXPforLevel(u.level + 1);
    if (u.xp >= neededXP) {
        u.level++;
        save();

        const roleId = db.config.xp_roles[u.level];
        if (roleId) {
            const member = guild.members.cache.get(userId);
            if (member) await member.roles.add(roleId).catch(() => {});
        }

        if (db.config.logs) {
            const logChan = guild.channels.cache.get(db.config.logs);
            if (logChan) {
                const member = guild.members.cache.get(userId);
                logChan.send({ embeds: [
                    new EmbedBuilder()
                        .setTitle("⬆️ LEVEL UP !")
                        .setColor("#f39c12")
                        .setImage(db.config.gifs.level)
                        .setThumbnail(member?.displayAvatarURL() || null)
                        .addFields(
                            { name: "Membre", value: `<@${userId}>`, inline: true },
                            { name: "Niveau", value: `**${u.level}**`, inline: true },
                            { name: "XP Total", value: `\`${u.xp}\``, inline: true }
                        ).setTimestamp()
                ]}).catch(() => {});
            }
        }
    }
    save();
}

// ════════════════════════════════════════════
//  7. AUTO-MODÉRATION
// ════════════════════════════════════════════
const URL_REGEX = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;

async function automod(message) {
    if (!message.guild || message.author.bot) return;
    const cfg = db.config.automod;
    const content = message.content;
    const userId = message.author.id;

    const sendWarning = async (text) => {
        const msg = await message.channel.send(`> ⛔ <@${userId}>, ${text}`).catch(() => {});
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 5000);
    };

    // Anti-liens
    if (cfg.anti_links && URL_REGEX.test(content)) {
        const isStaffMember = db.config.staff_role && message.member.roles.cache.has(db.config.staff_role);
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isStaffMember && !isAdmin) {
            await message.delete().catch(() => {});
            await sendWarning("les liens ne sont pas autorisés ici.");
            return;
        }
    }

    // Mots bannis
    for (const word of cfg.banned_words) {
        if (content.toLowerCase().includes(word.toLowerCase())) {
            await message.delete().catch(() => {});
            await sendWarning("ce message contient un mot interdit.");
            return;
        }
    }

    // Anti-spam
    if (cfg.anti_spam) {
        const now = Date.now();
        if (!db.spam_tracker[userId]) db.spam_tracker[userId] = { messages: [] };
        const tracker = db.spam_tracker[userId];
        tracker.messages = tracker.messages.filter(t => now - t < 5000);
        tracker.messages.push(now);

        if (tracker.messages.length > 5) {
            await message.delete().catch(() => {});
            await message.member.timeout(120000, "Auto-Mod : Spam").catch(() => {});
            await sendWarning("tu as été automatiquement muté 2 minutes pour spam.");
            await sendLog(message.guild, new EmbedBuilder()
                .setTitle("🤖 AUTO-MOD : SPAM")
                .setColor("#e74c3c")
                .addFields({ name: "Membre", value: `<@${userId}>` }, { name: "Action", value: "Mute 2 minutes" })
                .setTimestamp()
            );
            tracker.messages = [];
        }
    }

    // Anti-mentions excessives
    if (message.mentions.users.size >= cfg.max_mentions) {
        await message.delete().catch(() => {});
        await sendWarning("trop de mentions dans un seul message.");
    }
}

// ════════════════════════════════════════════
//  8. GIVEAWAYS
// ════════════════════════════════════════════
async function endGiveaway(messageId, guild, reroll = false) {
    const ga = db.giveaways[messageId];
    if (!ga || (ga.ended && !reroll)) return;

    const channel = await guild.channels.fetch(ga.channelId).catch(() => null);
    if (!channel) return;

    const participants = ga.participants.filter(Boolean);
    if (participants.length === 0) {
        await channel.send("❌ Aucun participant pour ce giveaway.").catch(() => {});
        ga.ended = true; save(); return;
    }

    const winnersCount = Math.min(ga.winnersCount, participants.length);
    const winners = [...participants].sort(() => Math.random() - 0.5).slice(0, winnersCount);

    const emb = new EmbedBuilder()
        .setTitle(reroll ? "🔄 REROLL" : "🎉 GIVEAWAY TERMINÉ !")
        .setColor(reroll ? "#e67e22" : "#2ecc71")
        .addFields(
            { name: "🏆 Prix", value: ga.prize },
            { name: "👑 Gagnant(s)", value: winners.map(id => `<@${id}>`).join(", ") },
            { name: "👥 Participants", value: `${participants.length}` }
        ).setTimestamp();

    await channel.send({ content: winners.map(id => `<@${id}>`).join(" ") + " 🎉 Vous avez gagné !", embeds: [emb] }).catch(() => {});

    for (const wId of winners) { const u = initUser(wId); u.coins = (u.coins || 0) + 500; }
    ga.ended = true; ga.winners = winners; save();
}

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
//  9. UTILITAIRES
// ════════════════════════════════════════════
function isStaff(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (db.config.staff_role && member.roles.cache.has(db.config.staff_role)) return true;
    return false;
}

function isOwner(userId) {
    return userId === (db.config.owner_id || process.env.OWNER_ID);
}

async function sendLog(guild, embed) {
    if (!db.config.logs) return;
    const logChan = await guild.channels.fetch(db.config.logs).catch(() => null);
    if (logChan?.isTextBased()) await logChan.send({ embeds: [embed] }).catch(() => {});
}

function formatDate(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════════════════════════
//  10. GESTIONNAIRE D'INTERACTIONS
// ════════════════════════════════════════════
client.on(Events.InteractionCreate, async i => {

    // ── BOUTONS ─────────────────────────────
    if (i.isButton()) {
        // Giveaway
        if (i.customId.startsWith('ga_join_')) {
            const msgId = i.customId.replace('ga_join_', '');
            const ga = db.giveaways[msgId];
            if (!ga || ga.ended) return i.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });

            // Vérifier coins requis
            if (ga.coins_requis > 0) {
                const u = initUser(i.user.id);
                if ((u.coins || 0) < ga.coins_requis) {
                    return i.reply({ content: `❌ Tu as besoin d'au moins **${ga.coins_requis} coins** pour participer.`, ephemeral: true });
                }
            }

            if (ga.participants.includes(i.user.id)) {
                ga.participants = ga.participants.filter(id => id !== i.user.id);
                save();
                return i.reply({ content: `👋 Tu t'es retiré du giveaway. (${ga.participants.length} participants)`, ephemeral: true });
            } else {
                ga.participants.push(i.user.id);
                save();
                return i.reply({ content: `🎉 Tu participes au giveaway **${ga.prize}** ! (${ga.participants.length} participants)`, ephemeral: true });
            }
        }

        // Sondage
        if (i.customId.startsWith('poll_')) {
            const parts = i.customId.split('_');
            const msgId = parts[1];
            const optIdx = parseInt(parts[2]);
            const poll = db.polls[msgId];
            if (!poll) return i.reply({ content: "❌ Sondage introuvable.", ephemeral: true });

            poll.votes[i.user.id] = optIdx;
            save();

            const totals = poll.options.map((_, idx) => Object.values(poll.votes).filter(v => v === idx).length);
            const total = totals.reduce((a, b) => a + b, 0);
            const bars = totals.map((count, idx) => {
                const pct = total ? Math.round((count / total) * 100) : 0;
                const filled = Math.floor(pct / 10);
                return `**${poll.options[idx]}**\n\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${pct}% *(${count} vote${count !== 1 ? 's' : ''})*`;
            });

            await i.update({ embeds: [
                new EmbedBuilder()
                    .setTitle(`📊 ${poll.question}`)
                    .setColor("#3498db")
                    .setDescription(bars.join("\n\n"))
                    .setFooter({ text: `${total} vote(s) au total` })
            ]}).catch(() => {});
        }

        // Fermer ticket
        if (i.customId.startsWith('ticket_close_')) {
            const ticket = db.tickets[i.channel.id];
            if (!ticket) return i.reply({ content: "❌ Pas un ticket.", ephemeral: true });
            if (!isStaff(i.member) && ticket.userId !== i.user.id) return i.reply({ content: "❌ Permission refusée.", ephemeral: true });

            ticket.closed = true; save();
            await i.reply({ content: "🔒 Ticket fermé. Suppression dans 10 secondes." });
            await sendLog(i.guild, new EmbedBuilder()
                .setTitle("🎫 TICKET FERMÉ")
                .setColor("#e74c3c")
                .addFields(
                    { name: "Ticket", value: `#${i.channel.name}` },
                    { name: "Fermé par", value: i.user.tag },
                    { name: "Ouvert par", value: `<@${ticket.userId}>` }
                ).setTimestamp()
            );
            setTimeout(() => i.channel.delete().catch(() => {}), 10000);
        }

        // Voir warns (bouton dans /stats)
        if (i.customId.startsWith('warns_detail_')) {
            const targetId = i.customId.replace('warns_detail_', '');
            const u = initUser(targetId);
            if (!u.warnReasons || u.warnReasons.length === 0) {
                return i.reply({ content: "✅ Aucun avertissement enregistré.", ephemeral: true });
            }
            const lines = u.warnReasons.map((w, idx) =>
                `**#${idx + 1}** — ${w.raison}\n> Par : ${w.by} | ${w.at ? formatDate(w.at) : 'Date inconnue'}`
            ).join("\n\n");
            return i.reply({ embeds: [
                new EmbedBuilder()
                    .setTitle(`📋 Détail des avertissements`)
                    .setColor("#f1c40f")
                    .setDescription(lines.slice(0, 4096))
                    .setFooter({ text: `${u.warnReasons.length} avertissement(s) au total` })
            ], ephemeral: true });
        }

        // Voir bans history
        if (i.customId.startsWith('bans_detail_')) {
            const targetId = i.customId.replace('bans_detail_', '');
            const u = initUser(targetId);
            if (!u.banReasons || u.banReasons.length === 0) {
                return i.reply({ content: "✅ Aucun ban enregistré.", ephemeral: true });
            }
            const lines = u.banReasons.map((b, idx) =>
                `**#${idx + 1}** — ${b.raison}\n> Par : ${b.by} | ${b.at ? formatDate(b.at) : 'Date inconnue'}`
            ).join("\n\n");
            return i.reply({ embeds: [
                new EmbedBuilder()
                    .setTitle(`🔨 Historique des bans`)
                    .setColor("#e74c3c")
                    .setDescription(lines.slice(0, 4096))
            ], ephemeral: true });
        }

        // Voir mutes history
        if (i.customId.startsWith('mutes_detail_')) {
            const targetId = i.customId.replace('mutes_detail_', '');
            const u = initUser(targetId);
            if (!u.muteHistory || u.muteHistory.length === 0) {
                return i.reply({ content: "✅ Aucun mute enregistré.", ephemeral: true });
            }
            const lines = u.muteHistory.map((m, idx) =>
                `**#${idx + 1}** — ${m.raison}\n> Par : ${m.by} | Durée : ${m.duration}min | ${m.at ? formatDate(m.at) : 'Date inconnue'}`
            ).join("\n\n");
            return i.reply({ embeds: [
                new EmbedBuilder()
                    .setTitle(`🔇 Historique des mutes`)
                    .setColor("#f1c40f")
                    .setDescription(lines.slice(0, 4096))
            ], ephemeral: true });
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
            return i.reply({ embeds: [emb] });
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

    // ════════════ SETUPS ════════════════════════════════════════════════
    if (commandName === 'setup-logs') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.logs = options.getChannel('salon').id; save();
        return i.editReply(`✅ Logs → <#${db.config.logs}>`);
    }
    if (commandName === 'setup-welcome') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.welcome = options.getChannel('salon').id; save();
        return i.editReply(`✅ Bienvenue → <#${db.config.welcome}>`);
    }
    if (commandName === 'setup-blacklist') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.bl_chan = options.getChannel('salon').id; save();
        return i.editReply(`✅ Blacklist → <#${db.config.bl_chan}>`);
    }
    if (commandName === 'setup-whitelist') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.wl_cat = options.getChannel('cat').id; save();
        return i.editReply(`✅ Catégorie WL définie.`);
    }
    if (commandName === 'setup-staff') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return i.editReply("❌ Administrateur requis.");
        db.config.staff_role = options.getRole('role').id; save();
        return i.editReply(`✅ Rôle Staff → <@&${db.config.staff_role}>`);
    }
    if (commandName === 'setup-tickets') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.ticket_cat = options.getChannel('cat').id; save();
        return i.editReply(`✅ Catégorie tickets définie.`);
    }
    if (commandName === 'setup-muted') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.muted_role = options.getRole('role').id; save();
        return i.editReply(`✅ Rôle Muted → <@&${db.config.muted_role}>`);
    }
    if (commandName === 'setup-gif') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const type = options.getString('type');
        db.config.gifs[type] = options.getString('url'); save();
        return i.editReply({ embeds: [new EmbedBuilder().setTitle(`✅ GIF ${type.toUpperCase()} mis à jour`).setImage(db.config.gifs[type]).setColor("#2ecc71")] });
    }
    if (commandName === 'setup-xp-role') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        db.config.xp_roles[options.getInteger('niveau')] = options.getRole('role').id; save();
        return i.editReply(`✅ Niveau **${options.getInteger('niveau')}** → <@&${options.getRole('role').id}>`);
    }

    // ════════════ IA ════════════════════════════════════════════════════
    if (commandName === 'ia-mode') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const mode = options.getString('mode');
        const portee = options.getString('portee');

        if (portee === 'global') {
            if (!isOwner(user.id)) return i.editReply("❌ Seul le propriétaire du bot peut modifier le mode global.");
            db.config.ai_mode = mode; save();
            return i.editReply(`✅ Mode IA **global** → **${AI_MODES[mode]?.name || mode}**`);
        } else {
            const srv = initServer(guild.id);
            srv.ai_mode = mode; save();
            return i.editReply(`✅ Mode IA **ce serveur** → **${AI_MODES[mode]?.name || mode}**`);
        }
    }

    if (commandName === 'ia-prompt') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const prompt = options.getString('prompt');
        const portee = options.getString('portee');

        if (portee === 'global') {
            if (!isOwner(user.id)) return i.editReply("❌ Seul le propriétaire du bot peut modifier le prompt global.");
            db.config.ai_identity = prompt;
            db.config.ai_mode = 'custom'; save();
            return i.editReply(`✅ Prompt global mis à jour. Mode → Custom`);
        } else {
            const srv = initServer(guild.id);
            srv.ai_identity = prompt;
            srv.ai_mode = 'custom'; save();
            return i.editReply(`✅ Prompt de ce serveur mis à jour. Mode → Custom`);
        }
    }

    if (commandName === 'ia-info') {
        const srv = db.servers[guild.id] || {};
        const mode = srv.ai_mode || db.config.ai_mode || 'overlord';
        const modeData = AI_MODES[mode] || AI_MODES.overlord;
        const prompt = getAIPrompt(guild.id);
        const emb = new EmbedBuilder()
            .setTitle("🧠 CONFIGURATION IA")
            .setColor("#9b59b6")
            .addFields(
                { name: "🌍 Mode global", value: AI_MODES[db.config.ai_mode]?.name || db.config.ai_mode, inline: true },
                { name: "🏠 Mode ce serveur", value: srv.ai_mode ? (AI_MODES[srv.ai_mode]?.name || srv.ai_mode) : "*(hérite du global)*", inline: true },
                { name: "✅ Mode actif", value: modeData.name, inline: true },
                { name: "📝 Prompt actif", value: `\`\`\`${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}\`\`\`` }
            );
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'ia-conversation') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const activer = options.getBoolean('activer');
        if (activer) {
            AI_CONVERSATION_CHANNELS.add(i.channel.id);
            return i.editReply("🤖 Mode conversation IA activé dans ce salon. Je répondrai à chaque message.");
        } else {
            AI_CONVERSATION_CHANNELS.delete(i.channel.id);
            return i.editReply("🔕 Mode conversation IA désactivé.");
        }
    }

    if (commandName === 'ask') {
        await i.editReply("🤖 Analyse en cours...");
        const rep = await askMistral(options.getString('q'), guild.id);
        const mode = db.servers[guild.id]?.ai_mode || db.config.ai_mode || 'overlord';
        return i.editReply(`**${AI_MODES[mode]?.name || '🤖 IA'} :**\n${rep}`);
    }

    if (commandName === 'resume') {
        await i.editReply("📝 Résumé en cours...");
        const rep = await askMistral(
            `Résume ce texte de façon claire et concise en français :\n\n${options.getString('texte')}`,
            guild.id,
            "Tu es un assistant spécialisé dans la synthèse de textes. Sois concis et clair. Réponds en français."
        );
        return i.editReply({ embeds: [new EmbedBuilder().setTitle("📝 RÉSUMÉ IA").setColor("#3498db").setDescription(rep.slice(0, 4096)).setTimestamp()] });
    }

    if (commandName === 'traduit') {
        await i.editReply("🌍 Traduction en cours...");
        const rep = await askMistral(
            `Traduis ce texte en ${options.getString('langue')} :\n\n${options.getString('texte')}`,
            guild.id,
            "Tu es un traducteur expert. Donne uniquement la traduction, sans commentaire ni explication."
        );
        return i.editReply({ embeds: [new EmbedBuilder().setTitle(`🌍 TRADUCTION → ${options.getString('langue').toUpperCase()}`).setColor("#2ecc71").setDescription(rep.slice(0, 4096)).setTimestamp()] });
    }

    if (commandName === 'corrige') {
        await i.editReply("✍️ Correction en cours...");
        const rep = await askMistral(
            `Corrige l'orthographe et la grammaire de ce texte et donne uniquement la version corrigée :\n\n${options.getString('texte')}`,
            guild.id,
            "Tu es un correcteur orthographique expert en français. Donne uniquement le texte corrigé, sans commentaire."
        );
        return i.editReply({ embeds: [new EmbedBuilder().setTitle("✍️ TEXTE CORRIGÉ").setColor("#e74c3c").setDescription(rep.slice(0, 4096)).setTimestamp()] });
    }

    // ════════════ AUTO-MOD ══════════════════════════════════════════════
    if (commandName === 'automod') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const opt = options.getString('option');
        const val = options.getString('valeur') || '';
        const cfg = db.config.automod;

        if (opt === 'view') {
            return i.editReply({ embeds: [new EmbedBuilder()
                .setTitle("🛡️ CONFIG AUTO-MOD")
                .setColor("#3498db")
                .addFields(
                    { name: "Anti-spam", value: cfg.anti_spam ? "✅ ON" : "❌ OFF", inline: true },
                    { name: "Anti-liens", value: cfg.anti_links ? "✅ ON" : "❌ OFF", inline: true },
                    { name: "Max mentions", value: `${cfg.max_mentions}`, inline: true },
                    { name: "Mots bannis", value: cfg.banned_words.length > 0 ? cfg.banned_words.map(w => `\`${w}\``).join(", ") : "Aucun" }
                )
            ]});
        }
        if (opt === 'spam') { cfg.anti_spam = !cfg.anti_spam; save(); return i.editReply(`🛡️ Anti-spam : **${cfg.anti_spam ? 'ON ✅' : 'OFF ❌'}**`); }
        if (opt === 'links') { cfg.anti_links = !cfg.anti_links; save(); return i.editReply(`🔗 Anti-liens : **${cfg.anti_links ? 'ON ✅' : 'OFF ❌'}**`); }
        if (opt === 'add_word') { if (!val) return i.editReply("❌ Précise un mot."); cfg.banned_words.push(val.toLowerCase()); save(); return i.editReply(`✅ Mot banni ajouté : \`${val}\``); }
        if (opt === 'del_word') { cfg.banned_words = cfg.banned_words.filter(w => w !== val.toLowerCase()); save(); return i.editReply(`✅ Mot retiré : \`${val}\``); }
        if (opt === 'mentions') { const n = parseInt(val); if (isNaN(n)) return i.editReply("❌ Valeur invalide."); cfg.max_mentions = n; save(); return i.editReply(`✅ Max mentions : **${n}**`); }
    }

    // ════════════ MODÉRATION ════════════════════════════════════════════
    if (commandName === 'ban') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const raison = options.getString('raison');
        const silent = options.getBoolean('silent') || false;
        const u = initUser(target.id);
        u.bans++;
        u.banReasons.push({ raison, by: user.tag, byId: user.id, at: Date.now() });
        save();

        try { await target.send({ embeds: [new EmbedBuilder().setTitle("🔨 Tu as été banni").setColor("#ff0000").addFields({ name: "Serveur", value: guild.name }, { name: "Raison", value: raison }).setTimestamp()] }); } catch {}
        await guild.members.ban(target.id, { reason: raison, deleteMessageSeconds: 86400 }).catch(() => {});

        const emb = new EmbedBuilder().setTitle("🔨 BAN EXÉCUTÉ").setColor("#ff0000")
            .setImage(silent ? null : db.config.gifs.ban)
            .addFields(
                { name: "🎯 Sujet", value: `${target.tag} (${target.id})`, inline: true },
                { name: "👮 Staff", value: user.tag, inline: true },
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
        const emb = new EmbedBuilder().setTitle("👢 KICK").setColor("#e67e22").addFields({ name: "Sujet", value: target.user.tag }, { name: "Raison", value: raison }, { name: "Staff", value: user.tag }).setTimestamp();
        await sendLog(guild, emb);
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'mute') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const mins = options.getInteger('minutes');
        const raison = options.getString('raison');
        const u = initUser(target.id);
        u.mutes++;
        u.muteHistory.push({ raison, by: user.tag, duration: mins, at: Date.now() });
        save();
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
        return i.editReply({ embeds: [new EmbedBuilder().setTitle("🔊 UNMUTE").setColor("#2ecc71").addFields({ name: "Sujet", value: `${target}` }).setTimestamp()] });
    }

    if (commandName === 'warn') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const raison = options.getString('raison');
        const u = initUser(target.id);
        u.warns++;
        u.warnReasons.push({ raison, by: user.tag, byId: user.id, at: Date.now() });
        save();
        try { await target.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Avertissement reçu").setColor("#f1c40f").addFields({ name: "Raison", value: raison }, { name: "Total warns", value: `${u.warns}` }).setTimestamp()] }); } catch {}
        const emb = new EmbedBuilder().setTitle("⚠️ WARN").setColor("#f1c40f")
            .setImage(db.config.gifs.warn)
            .addFields(
                { name: "🎯 Sujet", value: target.tag, inline: true },
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
        return i.editReply(`✅ Dernier warn retiré de **${target.tag}**. (Warns restants : ${u.warns})`);
    }

    if (commandName === 'clear') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const nb = options.getInteger('nb');
        const filterUser = options.getUser('filtre');
        let messages = await i.channel.messages.fetch({ limit: filterUser ? 100 : nb });
        if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id).first(nb);
        const deleted = await i.channel.bulkDelete(messages, true).catch(() => new Collection());
        return i.editReply(`🧹 **${deleted.size}** message(s) supprimé(s).`);
    }

    if (commandName === 'bl') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const raison = options.getString('raison');
        const u = initUser(target.id);
        u.blacklisted = true; save();
        if (db.config.bl_chan) await target.roles.set([]).catch(() => {});
        const emb = new EmbedBuilder().setTitle("🚫 BLACKLIST").setColor("#8e44ad")
            .setImage(db.config.gifs.bl)
            .addFields({ name: "🎯 Sujet", value: target.user.tag }, { name: "📋 Raison", value: raison }, { name: "👮 Staff", value: user.tag })
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

    if (commandName === 'role-give') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const role = options.getRole('role');
        await target.roles.add(role.id).catch(() => {});
        return i.editReply(`✅ Rôle <@&${role.id}> donné à <@${target.id}>.`);
    }

    if (commandName === 'role-remove') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        const role = options.getRole('role');
        await target.roles.remove(role.id).catch(() => {});
        return i.editReply(`✅ Rôle <@&${role.id}> retiré de <@${target.id}>.`);
    }

    // ════════════ CASIER JUDICIAIRE ═════════════════════════════════════
    if (commandName === 'stats') {
        const target = options.getUser('cible') || user;
        const u = initUser(target.id);

        const lastWarn = u.warnReasons?.slice(-1)[0];
        const lastBan = u.banReasons?.slice(-1)[0];
        const lastMute = u.muteHistory?.slice(-1)[0];

        const emb = new EmbedBuilder()
            .setTitle(`📊 CASIER : ${target.username.toUpperCase()}`)
            .setColor(u.blacklisted ? "#8e44ad" : u.warns >= 3 ? "#e74c3c" : "#2b2d31")
            .setThumbnail(target.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: "🔨 Bans", value: `\`${u.bans}\``, inline: true },
                { name: "🔇 Mutes", value: `\`${u.mutes}\``, inline: true },
                { name: "⚠️ Warns", value: `\`${u.warns}\``, inline: true },
                { name: "🚫 Blacklisté", value: u.blacklisted ? "**OUI ⛔**" : "Non ✅", inline: true },
                { name: "⭐ XP / Niveau", value: `${u.xp || 0} XP — Niv. ${u.level || 0}`, inline: true },
                { name: "💰 Coins", value: `${u.coins || 0}`, inline: true },
                { name: "💬 Messages envoyés", value: `${u.messageCount || 0}`, inline: true },
                { name: "📅 Dernier warn", value: lastWarn ? `${lastWarn.raison} *(${lastWarn.by})*` : "Aucun", inline: false },
                { name: "🔨 Dernier ban", value: lastBan ? `${lastBan.raison} *(${lastBan.by})*` : "Aucun", inline: true },
                { name: "🔇 Dernier mute", value: lastMute ? `${lastMute.raison} — ${lastMute.duration}min` : "Aucun", inline: true }
            )
            .setFooter({ text: `ID: ${target.id}` })
            .setTimestamp();

        // Boutons détail
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`warns_detail_${target.id}`).setLabel(`⚠️ Voir ${u.warns} warn(s)`).setStyle(ButtonStyle.Secondary).setDisabled(u.warns === 0),
            new ButtonBuilder().setCustomId(`bans_detail_${target.id}`).setLabel(`🔨 Voir ${u.bans} ban(s)`).setStyle(ButtonStyle.Danger).setDisabled(u.bans === 0),
            new ButtonBuilder().setCustomId(`mutes_detail_${target.id}`).setLabel(`🔇 Voir ${u.mutes} mute(s)`).setStyle(ButtonStyle.Primary).setDisabled(u.mutes === 0)
        );

        return i.editReply({ embeds: [emb], components: [row] });
    }

    if (commandName === 'warns-list') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const u = initUser(target.id);
        if (!u.warnReasons || u.warnReasons.length === 0) return i.editReply(`✅ **${target.tag}** n'a aucun avertissement.`);

        const lines = u.warnReasons.map((w, idx) =>
            `**#${idx + 1}** — ${w.raison}\n> 👮 Par : **${w.by}** | 📅 ${w.at ? formatDate(w.at) : 'Date inconnue'}`
        ).join("\n\n");

        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`📋 Avertissements de ${target.username}`)
            .setColor("#f1c40f")
            .setDescription(lines.slice(0, 4096))
            .setFooter({ text: `${u.warnReasons.length} avertissement(s) au total` })
            .setThumbnail(target.displayAvatarURL())
        ]});
    }

    if (commandName === 'casier-reset') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const type = options.getString('type');
        const u = initUser(target.id);

        if (type === 'all' || type === 'warns') { u.warns = 0; u.warnReasons = []; }
        if (type === 'all' || type === 'mutes') { u.mutes = 0; u.muteHistory = []; }
        if (type === 'all' || type === 'bans') { u.bans = 0; u.banReasons = []; }
        save();
        return i.editReply(`✅ Casier de **${target.tag}** réinitialisé (${type}).`);
    }

    // ════════════ XP ════════════════════════════════════════════════════
    if (commandName === 'rank') {
        const target = options.getUser('cible') || user;
        const u = initUser(target.id);
        const nextXP = calcXPforLevel(u.level + 1);
        const pct = Math.min(Math.round((u.xp / nextXP) * 100), 100);
        const filled = Math.floor(pct / 5);
        const bar = "█".repeat(filled) + "░".repeat(20 - filled);

        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`🏅 RANG : ${target.username.toUpperCase()}`)
            .setColor("#f39c12")
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "📈 Niveau", value: `**${u.level}**`, inline: true },
                { name: "⭐ XP", value: `${u.xp} / ${nextXP}`, inline: true },
                { name: "💰 Coins", value: `${u.coins || 0}`, inline: true },
                { name: "💬 Messages", value: `${u.messageCount || 0}`, inline: true },
                { name: "📊 Progression", value: `\`${bar}\` **${pct}%**` }
            ).setTimestamp()
        ]});
    }

    if (commandName === 'leaderboard') {
        const sorted = Object.entries(db.users)
            .filter(([, u]) => u.xp > 0)
            .sort(([, a], [, b]) => (b.xp || 0) - (a.xp || 0))
            .slice(0, 10);

        const medals = ["🥇", "🥈", "🥉"];
        const lines = sorted.map(([uid, u], idx) => {
            const m = guild.members.cache.get(uid);
            const name = m?.displayName || `User ${uid.slice(-4)}`;
            return `${medals[idx] || `\`${idx + 1}.\``} **${name}** — Niv. **${u.level || 0}** | ${u.xp || 0} XP`;
        });

        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle("🏆 TOP 10 — MEMBRES LES PLUS ACTIFS")
            .setColor("#f1c40f")
            .setDescription(lines.join("\n") || "Aucune donnée.")
            .setTimestamp()
        ]});
    }

    if (commandName === 'xp-give') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const u = initUser(target.id);
        u.xp += options.getInteger('montant'); save();
        return i.editReply(`✅ **+${options.getInteger('montant')} XP** → ${target.tag} (Total : ${u.xp})`);
    }

    if (commandName === 'xp-remove') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const u = initUser(target.id);
        u.xp = Math.max(0, u.xp - options.getInteger('montant')); save();
        return i.editReply(`✅ **-${options.getInteger('montant')} XP** → ${target.tag} (Total : ${u.xp})`);
    }

    // ════════════ ÉCONOMIE ══════════════════════════════════════════════
    if (commandName === 'balance') {
        const target = options.getUser('cible') || user;
        const u = initUser(target.id);
        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`💰 SOLDE : ${target.username.toUpperCase()}`)
            .setColor("#2ecc71")
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "💎 Coins", value: `**${u.coins || 0}**`, inline: true },
                { name: "🏅 Niveau", value: `${u.level || 0}`, inline: true },
                { name: "🎒 Inventaire", value: u.inventory?.length > 0 ? u.inventory.join(", ") : "Vide", inline: false }
            )
        ]});
    }

    if (commandName === 'pay') {
        const target = options.getUser('cible');
        const montant = options.getInteger('montant');
        const raison = options.getString('raison') || "Aucune raison";
        if (target.id === user.id) return i.editReply("❌ Tu ne peux pas te payer toi-même.");
        const u = initUser(user.id); const t = initUser(target.id);
        if (u.coins < montant) return i.editReply(`❌ Solde insuffisant. Tu as **${u.coins}** coins.`);
        u.coins -= montant; t.coins += montant;
        db.economy.transactions.push({ from: user.id, fromTag: user.tag, to: target.id, toTag: target.tag, amount: montant, reason: raison, timestamp: Date.now() });
        save();
        return i.editReply({ embeds: [new EmbedBuilder().setTitle("💸 TRANSFERT").setColor("#2ecc71")
            .addFields({ name: "De", value: user.tag, inline: true }, { name: "Vers", value: target.tag, inline: true }, { name: "Montant", value: `**${montant} coins**`, inline: true }, { name: "Motif", value: raison })
        ]});
    }

    if (commandName === 'daily') {
        const u = initUser(user.id);
        const now = Date.now();
        if (u.lastDaily && now - u.lastDaily < 86400000) {
            const restant = Math.ceil((86400000 - (now - u.lastDaily)) / 3600000);
            return i.editReply(`⏰ Reviens dans **${restant}h** pour ta récompense quotidienne.`);
        }
        const reward = Math.floor(Math.random() * 201) + 100;
        u.coins = (u.coins || 0) + reward; u.lastDaily = now; save();
        return i.editReply(`🎁 Tu as reçu **${reward} coins** ! Solde : **${u.coins}** coins.`);
    }

    if (commandName === 'shop') {
        const items = Object.entries(db.config.shop);
        if (items.length === 0) return i.editReply("🏪 La boutique est vide.");
        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle("🏪 BOUTIQUE DU SERVEUR")
            .setColor("#9b59b6")
            .setDescription(items.map(([name, item]) =>
                `**${name}** — \`${item.price} coins\`\n${item.description || ""} → <@&${item.roleId}>`
            ).join("\n\n"))
            .setFooter({ text: "Utilise /buy <article> pour acheter" })
        ]});
    }

    if (commandName === 'buy') {
        const nom = options.getString('article');
        const item = db.config.shop[nom];
        if (!item) return i.editReply(`❌ Article **${nom}** introuvable.`);
        const u = initUser(user.id);
        if (u.coins < item.price) return i.editReply(`❌ Solde insuffisant. Tu as **${u.coins}** coins, il en faut **${item.price}**.`);
        u.coins -= item.price;
        if (!u.inventory) u.inventory = [];
        u.inventory.push(nom); save();
        try { await member.roles.add(item.roleId); } catch {}
        return i.editReply(`✅ Tu as acheté **${nom}** ! Rôle <@&${item.roleId}> attribué.`);
    }

    if (commandName === 'shop-add') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const nom = options.getString('nom');
        db.config.shop[nom] = { price: options.getInteger('prix'), roleId: options.getRole('role').id, description: options.getString('description') || "" };
        save();
        return i.editReply(`✅ Article **${nom}** ajouté à la boutique.`);
    }

    if (commandName === 'shop-remove') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        delete db.config.shop[options.getString('nom')]; save();
        return i.editReply(`✅ Article **${options.getString('nom')}** retiré.`);
    }

    if (commandName === 'coins-give') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const u = initUser(target.id);
        u.coins = (u.coins || 0) + options.getInteger('montant'); save();
        return i.editReply(`✅ **+${options.getInteger('montant')} coins** → **${target.tag}** (Total : ${u.coins})`);
    }

    if (commandName === 'coins-remove') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getUser('cible');
        const u = initUser(target.id);
        u.coins = Math.max(0, (u.coins || 0) - options.getInteger('montant')); save();
        return i.editReply(`✅ **-${options.getInteger('montant')} coins** → **${target.tag}** (Total : ${u.coins})`);
    }

    if (commandName === 'transactions') {
        const target = options.getUser('cible') || user;
        const txs = db.economy.transactions
            .filter(t => t.from === target.id || t.to === target.id)
            .slice(-10)
            .reverse();

        if (txs.length === 0) return i.editReply("📊 Aucune transaction trouvée.");
        const lines = txs.map(t => {
            const dir = t.from === target.id ? "➡️ Envoyé" : "⬅️ Reçu";
            const other = t.from === target.id ? t.toTag : t.fromTag;
            return `${dir} **${t.amount} coins** ${t.from === target.id ? 'à' : 'de'} **${other}**\n> ${t.reason} | ${formatDate(t.timestamp)}`;
        });

        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`📊 Transactions de ${target.username}`)
            .setColor("#3498db")
            .setDescription(lines.join("\n\n").slice(0, 4096))
        ]});
    }

    // ════════════ FACTURES ══════════════════════════════════════════════
    if (commandName === 'facture') {
        const client_user = options.getUser('client');
        const ht = options.getNumber('ht');
        const tva = ht * 0.20;
        const ttc = ht + tva;
        const objet = options.getString('objet');
        const notes = options.getString('notes') || null;
        const num = options.getString('numero') || `FAC-${String(db.config.facture_counter || 1).padStart(4, '0')}`;
        db.config.facture_counter = (db.config.facture_counter || 1) + 1;

        // Enregistrer la facture
        db.factures[num] = {
            numero: num,
            client: client_user.id,
            clientTag: client_user.tag,
            emetteur: user.id,
            emetteurTag: user.tag,
            objet, ht, tva, ttc,
            notes,
            date: Date.now(),
            statut: "Émise"
        };
        save();

        const emb = new EmbedBuilder()
            .setTitle("🧾 FACTURE OFFICIELLE")
            .setColor("#2ecc71")
            .setImage(db.config.gifs.facture)
            .addFields(
                { name: "📋 N° Facture", value: `\`${num}\``, inline: true },
                { name: "📅 Date", value: new Date().toLocaleDateString('fr-FR'), inline: true },
                { name: "✅ Statut", value: "Émise", inline: true },
                { name: "👤 Client", value: `<@${client_user.id}> (${client_user.tag})`, inline: true },
                { name: "🖊️ Émetteur", value: `<@${user.id}> (${user.tag})`, inline: true },
                { name: "📦 Objet", value: objet },
                { name: "💵 Prix HT", value: `${ht.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`, inline: true },
                { name: "📊 TVA 20%", value: `${tva.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`, inline: true },
                { name: "💰 Total TTC", value: `**${ttc.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €**`, inline: true }
            )
            .setFooter({ text: `Paradise Overlord V20 — Facture enregistrée` })
            .setTimestamp();

        if (notes) emb.addFields({ name: "📝 Notes", value: notes });

        // Envoyer aussi en DM au client
        try {
            await client_user.send({ embeds: [emb] });
        } catch {}

        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'facture-list') {
        const filterClient = options.getUser('client');
        let factures = Object.values(db.factures);
        if (filterClient) factures = factures.filter(f => f.client === filterClient.id);
        if (factures.length === 0) return i.editReply("📋 Aucune facture trouvée.");

        factures = factures.slice(-10).reverse();
        const lines = factures.map(f =>
            `**${f.numero}** — ${f.objet}\n> Client : **${f.clientTag}** | TTC : **${f.ttc.toFixed(2)}€** | ${formatDate(f.date)}`
        );

        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle("📋 LISTE DES FACTURES")
            .setColor("#2ecc71")
            .setDescription(lines.join("\n\n").slice(0, 4096))
            .setFooter({ text: `${Object.keys(db.factures).length} facture(s) au total` })
        ]});
    }

    if (commandName === 'facture-voir') {
        const num = options.getString('numero');
        const f = db.factures[num];
        if (!f) return i.editReply(`❌ Facture \`${num}\` introuvable.`);

        const emb = new EmbedBuilder()
            .setTitle(`🧾 FACTURE ${f.numero}`)
            .setColor("#2ecc71")
            .addFields(
                { name: "📅 Date", value: formatDate(f.date), inline: true },
                { name: "✅ Statut", value: f.statut, inline: true },
                { name: "👤 Client", value: `<@${f.client}> (${f.clientTag})`, inline: true },
                { name: "🖊️ Émetteur", value: `${f.emetteurTag}`, inline: true },
                { name: "📦 Objet", value: f.objet },
                { name: "💵 HT", value: `${f.ht.toFixed(2)}€`, inline: true },
                { name: "📊 TVA", value: `${f.tva.toFixed(2)}€`, inline: true },
                { name: "💰 TTC", value: `**${f.ttc.toFixed(2)}€**`, inline: true }
            );
        if (f.notes) emb.addFields({ name: "📝 Notes", value: f.notes });
        return i.editReply({ embeds: [emb] });
    }

    if (commandName === 'devis') {
        const client_user = options.getUser('client');
        const ht = options.getNumber('ht');
        const tva = ht * 0.20;
        const ttc = ht + tva;
        const validite = options.getInteger('validite') || 30;
        const expiration = new Date(Date.now() + validite * 86400000);

        const emb = new EmbedBuilder()
            .setTitle("📄 DEVIS")
            .setColor("#3498db")
            .addFields(
                { name: "📋 Référence", value: `DEV-${Date.now().toString().slice(-6)}`, inline: true },
                { name: "📅 Date", value: new Date().toLocaleDateString('fr-FR'), inline: true },
                { name: "⏰ Valide jusqu'au", value: expiration.toLocaleDateString('fr-FR'), inline: true },
                { name: "👤 Client", value: `<@${client_user.id}>`, inline: true },
                { name: "📦 Objet", value: options.getString('objet') },
                { name: "💵 HT", value: `${ht.toFixed(2)}€`, inline: true },
                { name: "📊 TVA 20%", value: `${tva.toFixed(2)}€`, inline: true },
                { name: "💰 TTC", value: `**${ttc.toFixed(2)}€**`, inline: true }
            )
            .setFooter({ text: "Ce devis est valable sans engagement." })
            .setTimestamp();

        return i.editReply({ embeds: [emb] });
    }

    // ════════════ GIVEAWAY ══════════════════════════════════════════════
    if (commandName === 'giveaway') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const prix = options.getString('prix');
        const duree = options.getInteger('duree');
        const gagnants = options.getInteger('gagnants');
        const chan = options.getChannel('salon') || i.channel;
        const coins_requis = options.getInteger('coins_requis') || 0;
        const endTime = Date.now() + duree * 60000;

        const emb = new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY !")
            .setColor("#e91e63")
            .addFields(
                { name: "🏆 Prix", value: prix },
                { name: "👑 Gagnants", value: `${gagnants}`, inline: true },
                { name: "⏰ Fin", value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
                { name: "🚀 Organisateur", value: `${user}`, inline: true },
                ...(coins_requis > 0 ? [{ name: "💰 Coins requis", value: `${coins_requis}`, inline: true }] : [])
            )
            .setFooter({ text: "Clique pour participer !" })
            .setTimestamp(new Date(endTime));

        const fetchedChan = await guild.channels.fetch(chan.id).catch(() => null);
        if (!fetchedChan?.isTextBased()) return i.editReply("❌ Salon invalide.");

        const msg = await fetchedChan.send({ embeds: [emb], components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ga_join_PLACEHOLDER`).setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
            )
        ]});

        db.giveaways[msg.id] = { prize: prix, endTime, channelId: chan.id, winnersCount: gagnants, participants: [], ended: false, coins_requis };
        save();

        await msg.edit({ components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ga_join_${msg.id}`).setLabel("🎉 Participer").setStyle(ButtonStyle.Primary)
        )]});

        return i.editReply(`✅ Giveaway lancé dans <#${chan.id}> !`);
    }

    if (commandName === 'giveaway-end') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        await endGiveaway(options.getString('message_id'), guild);
        return i.editReply("✅ Giveaway terminé.");
    }

    if (commandName === 'giveaway-reroll') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        await endGiveaway(options.getString('message_id'), guild, true);
        return i.editReply("🔄 Reroll effectué.");
    }

    // ════════════ SONDAGE ═══════════════════════════════════════════════
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
            .setDescription(opts.map(o => `**${o}**\n\`${"░".repeat(10)}\` 0%`).join("\n\n"))
            .setFooter({ text: "Clique sur un bouton pour voter" })
            .setTimestamp();

        const msg = await i.channel.send({ embeds: [emb], components: [
            new ActionRowBuilder().addComponents(
                opts.map((o, idx) => new ButtonBuilder()
                    .setCustomId(`poll_PLACEHOLDER_${idx}`)
                    .setLabel(`${emojis[idx]} ${o}`.slice(0, 80))
                    .setStyle(ButtonStyle.Secondary)
                )
            )
        ]});

        db.polls[msg.id] = { question, options: opts, votes: {}, channelId: i.channel.id };
        save();

        await msg.edit({ components: [new ActionRowBuilder().addComponents(
            opts.map((o, idx) => new ButtonBuilder()
                .setCustomId(`poll_${msg.id}_${idx}`)
                .setLabel(`${emojis[idx]} ${o}`.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
            )
        )]});

        return i.editReply("✅ Sondage créé !");
    }

    // ════════════ TICKETS ═══════════════════════════════════════════════
    if (commandName === 'ticket') {
        if (!db.config.ticket_cat) return i.editReply("❌ Catégorie tickets non configurée (`/setup-tickets`).");
        const existing = Object.entries(db.tickets).find(([, t]) => t.userId === user.id && !t.closed);
        if (existing) return i.editReply(`❌ Tu as déjà un ticket ouvert : <#${existing[0]}>`);

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

        await chan.send({
            content: `<@${user.id}> Bienvenue ! Le staff va te répondre.`,
            embeds: [new EmbedBuilder().setTitle("🎫 TICKET OUVERT").setColor("#2ecc71")
                .addFields({ name: "Ouvert par", value: user.tag }, { name: "Créé le", value: formatDate(Date.now()) })
                .setDescription("Décris ton problème ici.")],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ticket_close_${chan.id}`).setLabel("🔒 Fermer le ticket").setStyle(ButtonStyle.Danger)
            )]
        });

        await sendLog(guild, new EmbedBuilder().setTitle("🎫 NOUVEAU TICKET").setColor("#2ecc71").addFields({ name: "Utilisateur", value: user.tag }, { name: "Salon", value: `<#${chan.id}>` }).setTimestamp());
        return i.editReply(`✅ Ton ticket est ouvert : <#${chan.id}>`);
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
        if (!ticket) return i.editReply("❌ Pas un ticket.");
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const target = options.getMember('cible');
        await i.channel.permissionOverwrites.edit(target, { ViewChannel: true, SendMessages: true });
        return i.editReply(`✅ <@${target.id}> ajouté au ticket.`);
    }

    if (commandName === 'ticket-rename') {
        const ticket = db.tickets[i.channel.id];
        if (!ticket) return i.editReply("❌ Pas un ticket.");
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        await i.channel.setName(options.getString('nom'));
        return i.editReply(`✅ Ticket renommé.`);
    }

    // ════════════ BUSINESS ══════════════════════════════════════════════
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
        await chan.send({ embeds: [new EmbedBuilder().setTitle("📝 RECRUTEMENT STAFF").setColor("#3498db")
            .setDescription(`Bienvenue <@${cible.id}> ! Un membre du staff va te contacter.`)
            .addFields({ name: "Candidat", value: cible.user.tag }, { name: "Lancé par", value: user.tag })
        ]});
        return i.editReply(`✅ Salon WL créé : <#${chan.id}>`);
    }

    if (commandName === 'announce') {
        if (!isStaff(member)) return i.editReply("❌ Permission refusée.");
        const texte = options.getString('texte');
        const chan = options.getChannel('salon');
        const couleur = options.getString('couleur') || '#5865F2';
        const titre = options.getString('titre') || '📢 Annonce';
        const mention = options.getBoolean('mention') !== false;
        const fetchedChan = await guild.channels.fetch(chan.id).catch(() => null);
        if (!fetchedChan?.isTextBased()) return i.editReply("❌ Salon invalide.");
        await fetchedChan.send({
            content: mention ? "@everyone" : undefined,
            embeds: [new EmbedBuilder().setTitle(titre).setDescription(texte).setColor(couleur.startsWith('#') ? couleur : `#${couleur}`).setTimestamp().setFooter({ text: `Annonce de ${user.tag}` })]
        });
        return i.editReply(`✅ Annonce envoyée dans <#${chan.id}>.`);
    }

    if (commandName === 'rappel') {
        const mins = options.getInteger('minutes');
        const msg = options.getString('message');
        const chanId = i.channel.id;
        setTimeout(async () => {
            const chan = await guild.channels.fetch(chanId).catch(() => null);
            if (chan?.isTextBased()) {
                chan.send({ embeds: [new EmbedBuilder()
                    .setTitle("⏰ RAPPEL !")
                    .setColor("#e67e22")
                    .setDescription(msg)
                    .addFields({ name: "Demandé par", value: user.tag })
                    .setTimestamp()
                ], content: `<@${user.id}>` }).catch(() => {});
            }
        }, mins * 60000);
        return i.editReply(`✅ Rappel programmé dans **${mins} minute(s)** !`);
    }

    // ════════════ INFOS ═════════════════════════════════════════════════
    if (commandName === 'userinfo') {
        const target = options.getMember('cible') || member;
        const u = target.user;
        const roles = target.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => `<@&${r.id}>`).join(", ") || "Aucun";
        const userData = db.users[u.id];
        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`👤 ${u.username}`)
            .setColor("#3498db")
            .setThumbnail(u.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: "🆔 ID", value: u.id, inline: true },
                { name: "📛 Pseudo", value: target.displayName, inline: true },
                { name: "🤖 Bot", value: u.bot ? "Oui" : "Non", inline: true },
                { name: "📅 Compte créé", value: `<t:${Math.floor(u.createdTimestamp / 1000)}:D>`, inline: true },
                { name: "📥 A rejoint", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
                { name: "⭐ Niveau", value: userData ? `Niv. ${userData.level} (${userData.xp} XP)` : "0", inline: true },
                { name: "💰 Coins", value: userData ? `${userData.coins}` : "0", inline: true },
                { name: "⚠️ Warns", value: userData ? `${userData.warns}` : "0", inline: true },
                { name: "🎭 Rôles", value: roles.length > 1024 ? roles.slice(0, 1020) + "..." : roles }
            ).setTimestamp()
        ]});
    }

    if (commandName === 'server-info') {
        const owner = await guild.fetchOwner();
        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`ℹ️ ${guild.name}`)
            .setColor("#2b2d31")
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: "👑 Propriétaire", value: owner.user.tag, inline: true },
                { name: "🆔 ID", value: guild.id, inline: true },
                { name: "👥 Membres", value: `${guild.memberCount}`, inline: true },
                { name: "📅 Créé", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                { name: "💎 Boosts", value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
                { name: "📢 Salons", value: `${guild.channels.cache.size}`, inline: true },
                { name: "🎭 Rôles", value: `${guild.roles.cache.size}`, inline: true },
                { name: "😀 Emojis", value: `${guild.emojis.cache.size}`, inline: true },
                { name: "🛡️ Vérification", value: guild.verificationLevel.toString(), inline: true }
            ).setTimestamp()
        ]});
    }

    if (commandName === 'avatar') {
        const target = options.getUser('cible') || user;
        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle(`🖼️ Avatar de ${target.username}`)
            .setColor("#9b59b6")
            .setImage(target.displayAvatarURL({ size: 512, dynamic: true }))
        ]});
    }

    if (commandName === 'ping') {
        return i.editReply(`🏓 Latence WS : **${client.ws.ping}ms** | API : **${Date.now() - i.createdTimestamp}ms**`);
    }

    if (commandName === 'help') {
        return i.editReply({ embeds: [new EmbedBuilder()
            .setTitle("📖 PARADISE OVERLORD V20 — MANUEL COMPLET")
            .setColor("#5865F2")
            .addFields(
                { name: "🛡️ Modération", value: "`/ban` `/kick` `/mute` `/unmute` `/warn` `/unwarn` `/clear` `/bl` `/unbl` `/slowmode` `/lock` `/unlock` `/role-give` `/role-remove`" },
                { name: "📊 Casier", value: "`/stats` `/warns-list` `/casier-reset`" },
                { name: "🤖 Auto-Mod", value: "`/automod` (anti-spam, anti-liens, mots bannis, mentions)" },
                { name: "🧠 IA Multi-Mode", value: "`/ask` `/ia-mode` `/ia-prompt` `/ia-info` `/ia-conversation` `/resume` `/traduit` `/corrige`" },
                { name: "📈 XP", value: "`/rank` `/leaderboard` `/xp-give` `/xp-remove` `/setup-xp-role`" },
                { name: "💰 Économie", value: "`/balance` `/pay` `/daily` `/shop` `/buy` `/coins-give` `/coins-remove` `/transactions`" },
                { name: "🧾 Factures", value: "`/facture` `/facture-list` `/facture-voir` `/devis`" },
                { name: "🎉 Giveaway", value: "`/giveaway` `/giveaway-end` `/giveaway-reroll`" },
                { name: "📊 Sondage", value: "`/poll`" },
                { name: "🎫 Tickets", value: "`/ticket` `/ticket-close` `/ticket-add` `/ticket-rename`" },
                { name: "📢 Business", value: "`/wl-start` `/message` `/announce` `/rappel`" },
                { name: "⚙️ Setup", value: "`/setup-logs` `/setup-welcome` `/setup-staff` `/setup-blacklist` `/setup-whitelist` `/setup-tickets` `/setup-muted` `/setup-gif` `/setup-xp-role`" },
                { name: "ℹ️ Infos", value: "`/userinfo` `/server-info` `/avatar` `/ping`" }
            )
            .setFooter({ text: "Paradise Overlord V20 — Système Ultime Absolu" })
            .setTimestamp()
        ]});
    }
});

// ════════════════════════════════════════════
//  11. ÉVÉNEMENTS DU SERVEUR
// ════════════════════════════════════════════

// Message → XP + Auto-Mod + Mode conversation IA
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    await automod(message);
    await addXP(message.author.id, message.guild);

    // Mode conversation IA
    if (AI_CONVERSATION_CHANNELS.has(message.channel.id)) {
        if (message.content.trim().length < 2) return;
        try {
            await message.channel.sendTyping();
            const rep = await askMistral(message.content, message.guild.id);
            await message.reply(rep.slice(0, 2000)).catch(() => {});
        } catch {}
    }
});

// Message supprimé → log
client.on(Events.MessageDelete, async message => {
    if (!message.guild || !db.config.logs || message.author?.bot) return;
    const logChan = await message.guild.channels.fetch(db.config.logs).catch(() => null);
    if (!logChan?.isTextBased() || !message.content) return;
    await logChan.send({ embeds: [new EmbedBuilder()
        .setTitle("🗑️ MESSAGE SUPPRIMÉ")
        .setColor("#e74c3c")
        .addFields(
            { name: "Auteur", value: `${message.author?.tag || 'Inconnu'}`, inline: true },
            { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
            { name: "Contenu", value: message.content.slice(0, 1024) || "—" }
        ).setTimestamp()
    ]}).catch(() => {});
});

// Message modifié → log
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!oldMsg.guild || !db.config.logs || oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;
    const logChan = await oldMsg.guild.channels.fetch(db.config.logs).catch(() => null);
    if (!logChan?.isTextBased()) return;
    await logChan.send({ embeds: [new EmbedBuilder()
        .setTitle("✏️ MESSAGE MODIFIÉ")
        .setColor("#f39c12")
        .addFields(
            { name: "Auteur", value: `${oldMsg.author?.tag || 'Inconnu'}`, inline: true },
            { name: "Salon", value: `<#${oldMsg.channel.id}>`, inline: true },
            { name: "Avant", value: (oldMsg.content || "—").slice(0, 512) },
            { name: "Après", value: (newMsg.content || "—").slice(0, 512) }
        ).setTimestamp()
    ]}).catch(() => {});
});

// Membre rejoint → bienvenue + log
client.on(Events.GuildMemberAdd, async member => {
    if (db.config.welcome) {
        try {
            const chan = await member.guild.channels.fetch(db.config.welcome);
            if (chan?.isTextBased()) {
                await chan.send({ content: `<@${member.id}>`, embeds: [
                    new EmbedBuilder()
                        .setTitle(`👋 Bienvenue ${member.user.username} !`)
                        .setDescription(`Bienvenue sur **${member.guild.name}** ! Tu es le membre **#${member.guild.memberCount}**.`)
                        .setColor("#2ecc71")
                        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                        .setImage(db.config.gifs.welcome)
                        .setTimestamp()
                ]});
            }
        } catch {}
    }

    if (db.config.logs) {
        try {
            const logChan = await member.guild.channels.fetch(db.config.logs);
            if (logChan?.isTextBased()) {
                await logChan.send({ embeds: [new EmbedBuilder()
                    .setTitle("📥 NOUVEAU MEMBRE")
                    .setColor("#2ecc71")
                    .addFields(
                        { name: "Membre", value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                        { name: "ID", value: member.id, inline: true },
                        { name: "Compte créé", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }
                    )
                    .setThumbnail(member.user.displayAvatarURL())
                    .setTimestamp()
                ]});
            }
        } catch {}
    }

    initUser(member.id); save();
});

// Membre part → log
client.on(Events.GuildMemberRemove, async member => {
    if (!db.config.logs) return;
    try {
        const logChan = await member.guild.channels.fetch(db.config.logs);
        if (!logChan?.isTextBased()) return;
        await logChan.send({ embeds: [new EmbedBuilder()
            .setTitle("📤 MEMBRE PARTI")
            .setColor("#e74c3c")
            .addFields(
                { name: "Membre", value: member.user.tag, inline: true },
                { name: "ID", value: member.id, inline: true },
                { name: "Sur le serveur depuis", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Inconnu" }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp()
        ]});
    } catch {}
});

// Rôles modifiés → log
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (!db.config.logs) return;
    const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (added.size === 0 && removed.size === 0) return;
    try {
        const logChan = await newMember.guild.channels.fetch(db.config.logs);
        if (!logChan?.isTextBased()) return;
        const emb = new EmbedBuilder().setTitle("🎭 RÔLES MODIFIÉS").setColor("#9b59b6").addFields({ name: "Membre", value: newMember.user.tag });
        if (added.size > 0) emb.addFields({ name: "➕ Ajouté", value: added.map(r => `<@&${r.id}>`).join(", ") });
        if (removed.size > 0) emb.addFields({ name: "➖ Retiré", value: removed.map(r => `<@&${r.id}>`).join(", ") });
        await logChan.send({ embeds: [emb.setTimestamp()] });
    } catch {}
});

// ════════════════════════════════════════════
//  12. INITIALISATION
// ════════════════════════════════════════════
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté : ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`🚀 ${commands.length} commandes enregistrées.`);
    } catch (e) { console.error("Erreur commandes:", e); }

    const statuses = [
        { type: ActivityType.Watching, text: "le serveur" },
        { type: ActivityType.Playing, text: "Paradise Overlord V20" },
        { type: ActivityType.Listening, text: "/help — Système Ultime" },
        { type: ActivityType.Watching, text: `${client.guilds.cache.size} serveurs` }
    ];
    let idx = 0;
    client.user.setActivity(statuses[0].text, { type: statuses[0].type });
    setInterval(() => {
        idx = (idx + 1) % statuses.length;
        client.user.setActivity(statuses[idx].text, { type: statuses[idx].type });
    }, 30000);

    console.log("🔥 PARADISE OVERLORD V20 : SYSTÈME ULTIME ABSOLU EN LIGNE");
});

client.login(process.env.TOKEN);
