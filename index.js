const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// --- VARIABLES DE STOCKAGE (TEMPORAIRE) ---
let logChannelId = null; 
const db = new Map(); 
const messageCache = new Map();

// --- CONFIGURATION AUTO-MOD ---
const CONFIG = {
    COOLDOWN_SPAM: 3000,
    LIMIT_SPAM: 5,
    AUTO_BAN_AGE: 1000 * 60 * 60 * 2, // 2 heures
};

// --- ENREGISTREMENT DES SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration du bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('Définit le salon des logs de modération')
                .addChannelOption(option => 
                    option.setName('salon').setDescription('Le salon de logs').setRequired(true)
                )
        ),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Affiche l’historique d’un utilisateur')
        .addUserOption(option => option.setName('cible').setDescription('L’utilisateur à checker')),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre')
        .addUserOption(option => option.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(option => option.setName('raison').setDescription('La raison')),
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .addUserOption(option => option.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(option => option.setName('raison').setDescription('La raison')),
].map(command => command.toJSON());

// --- ÉVÈNEMENT : DÉMARRAGE ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Paradise Bot est en ligne : ${client.user.tag}`);
    client.user.setActivity("Paradise - /setup", { type: ActivityType.Shield });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('🔄 Actualisation des commandes slash...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ Commandes slash enregistrées !');
    } catch (error) {
        console.error(error);
    }
});

// --- GESTION DES COMMANDES SLASH ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;

    // 1. /setup logs
    if (commandName === 'setup') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Tu dois être Admin !", ephemeral: true });
        }
        if (options.getSubcommand() === 'logs') {
            const channel = options.getChannel('salon');
            logChannelId = channel.id;
            return interaction.reply(`✅ Le salon de logs a été défini sur ${channel}.`);
        }
    }

    // 2. /ban
    if (commandName === 'ban') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply("Permission manquante.");
        const target = options.getUser('cible');
        const reason = options.getString('raison') || "Aucune raison";
        
        await guild.members.ban(target, { reason }).catch(() => {});
        updateStats(target.id, 'ban');
        logToChannel("Ban", target, reason, interaction.user);
        interaction.reply(`🔨 ${target.tag} a été banni.`);
    }

    // 3. /warn
    if (commandName === 'warn') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply("Permission manquante.");
        const target = options.getUser('cible');
        const reason = options.getString('raison') || "Avertissement manuel";
        
        updateStats(target.id, 'warn');
        logToChannel("Warn", target, reason, interaction.user);
        interaction.reply(`⚠️ ${target.tag} a été averti.`);
    }

    // 4. /stats
    if (commandName === 'stats') {
        const target = options.getUser('cible') || interaction.user;
        const s = db.get(target.id) || { warns: 0, bans: 0 };
        const embed = new EmbedBuilder()
            .setTitle(`Historique : ${target.username}`)
            .setColor("#5865F2")
            .addFields(
                { name: "⚠️ Warns", value: `${s.warns}`, inline: true },
                { name: "🔨 Bans", value: `${s.bans}`, inline: true }
            );
        interaction.reply({ embeds: [embed] });
    }
});

// --- AUTO-MODÉRATION (ANTI-PUB & SPAM) ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    // Anti-Pub
    const inviteLinks = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+/g;
    if (inviteLinks.test(message.content)) {
        await message.delete().catch(() => {});
        logToChannel("Auto-Mod", message.author, "Lien publicitaire détecté");
    }

    // Anti-Spam
    const authorId = message.author.id;
    const now = Date.now();
    if (!messageCache.has(authorId)) {
        messageCache.set(authorId, { count: 1, lastTime: now });
    } else {
        const data = messageCache.get(authorId);
        if (now - data.lastTime < CONFIG.COOLDOWN_SPAM) {
            data.count++;
            if (data.count === CONFIG.LIMIT_SPAM) {
                await message.member.timeout(600000, "Spamming").catch(() => {});
                logToChannel("Auto-Mute", message.author, "Spam excessif (10 min)");
            }
        } else {
            data.count = 1;
            data.lastTime = now;
        }
    }
});

// --- FONCTIONS UTILITAIRES ---
function updateStats(userId, type) {
    if (!db.has(userId)) db.set(userId, { warns: 0, bans: 0 });
    const s = db.get(userId);
    if (type === 'warn') s.warns++;
    if (type === 'ban') s.bans++;
}

async function logToChannel(action, target, reason, mod = "Système Paradise") {
    if (!logChannelId) return;
    const channel = client.channels.cache.get(logChannelId);
    if (!channel) return;

    const s = db.get(target.id) || { warns: 0, bans: 0 };
    const embed = new EmbedBuilder()
        .setTitle(`Récapitulatif - ${action}`)
        .setColor(action.includes("Ban") ? "#ff0000" : "#5865f2")
        .setThumbnail(target.displayAvatarURL?.() || null)
        .addFields(
            { name: "Utilisateur", value: `${target.tag}`, inline: true },
            { name: "Modérateur", value: `${mod.username || mod}`, inline: true },
            { name: "Raison", value: reason },
            { name: "Historique", value: `⚠️ ${s.warns} Warns | 🔨 ${s.bans} Bans` }
        )
        .setTimestamp();

    channel.send({ embeds: [embed] });
}

process.on('unhandledRejection', error => console.error(error));
client.login(process.env.TOKEN);
