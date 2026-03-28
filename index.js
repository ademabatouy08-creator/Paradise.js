const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder, 
    Collection 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences
    ]
});

// --- BASE DE DONNÉES TEMPORAIRE ---
const db = new Map(); 
const messageCache = new Map();
let logChannelId = null;

// --- ENREGISTREMENT DES COMMANDES SLASH ---
const commands = [
    // Configuration
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration du bot')
        .addSubcommand(sub => sub.setName('logs').setDescription('Définit le salon de logs').addChannelOption(opt => opt.setName('salon').setDescription('Le salon').setRequired(true))),

    // Système d'Absence (Ta photo)
    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Déclarer une absence (Staff)')
        .addStringOption(opt => opt.setName('raison').setDescription('Raison de l’absence').setRequired(true))
        .addStringOption(opt => opt.setName('durée').setDescription('Ex: 24h, 3 jours...').setRequired(true)),

    // Modération
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre')
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison du ban')),
    
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre')
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison du kick')),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mettre un membre en sourdine (Timeout)')
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addIntegerOption(opt => opt.setName('temps').setDescription('Temps en minutes').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison')),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .addUserOption(opt => opt.setName('cible').setDescription('Le membre').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison')),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprimer des messages')
        .addIntegerOption(opt => opt.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Voir l’historique d’un utilisateur')
        .addUserOption(opt => opt.setName('cible').setDescription('L’utilisateur')),
].map(c => c.toJSON());

// --- DÉMARRAGE ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Paradise Bot prêt : ${client.user.tag}`);
    client.user.setActivity("Paradise - /absence", { type: ActivityType.Watching });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commandes slash synchronisées !');
    } catch (e) { console.error(e); }
});

// --- GESTION DES INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, user } = interaction;

    // 1. COMMANDE ABSENCE (RÉCAPITULATIF)
    if (commandName === 'absence') {
        const raison = options.getString('raison');
        const duree = options.getString('durée');
        const roles = member.roles.cache.map(r => r).join(' ');

        const embed = new EmbedBuilder()
            .setTitle("Récapitulatif d'absence - Validée")
            .setColor("#2b2d31")
            .addFields(
                { name: "Utilisateur", value: `${user}`, inline: false },
                { name: "Raison", value: raison, inline: false },
                { name: "Durée", value: duree, inline: true },
                { name: "Rôles possédés", value: roles || "Aucun", inline: false },
                { name: "Traité par", value: `${client.user}`, inline: true },
                { name: "Date de traitement", value: new Date().toLocaleString('fr-FR'), inline: true }
            )
            .setFooter({ text: "Système de gestion des absences Paradise" });

        return interaction.reply({ embeds: [embed] });
    }

    // 2. SETUP LOGS
    if (commandName === 'setup') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "Admin uniquement.", ephemeral: true });
        logChannelId = options.getChannel('salon').id;
        return interaction.reply(`✅ Logs configurés dans <#${logChannelId}>`);
    }

    // 3. MODÉRATION (BAN, KICK, WARN, MUTE)
    if (['ban', 'kick', 'warn', 'mute'].includes(commandName)) {
        const target = options.getMember('cible');
        const reason = options.getString('raison') || "Aucune raison fournie";
        if (!target) return interaction.reply("Membre introuvable.");

        if (commandName === 'ban') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply("Pas de permission.");
            await target.ban({ reason });
            updateDB(target.id, 'ban');
        } else if (commandName === 'kick') {
            if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply("Pas de permission.");
            await target.kick(reason);
            updateDB(target.id, 'kick');
        } else if (commandName === 'mute') {
            const temps = options.getInteger('temps');
            await target.timeout(temps * 60000, reason);
            updateDB(target.id, 'mute');
        } else if (commandName === 'warn') {
            updateDB(target.id, 'warn');
        }

        logToChannel(commandName.toUpperCase(), target.user, reason, user);
        return interaction.reply(`✅ Action **${commandName}** effectuée sur ${target.user.tag}`);
    }

    // 4. CLEAR
    if (commandName === 'clear') {
        const amount = options.getInteger('nombre');
        await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: `✅ ${amount} messages supprimés.`, ephemeral: true });
    }

    // 5. STATS
    if (commandName === 'stats') {
        const target = options.getUser('cible') || user;
        const s = db.get(target.id) || { warn: 0, ban: 0, kick: 0, mute: 0 };
        const embed = new EmbedBuilder()
            .setTitle(`Historique : ${target.tag}`)
            .setColor("#5865F2")
            .addFields(
                { name: "⚠️ Warns", value: `${s.warn}`, inline: true },
                { name: "🔨 Bans", value: `${s.ban}`, inline: true },
                { name: "👢 Kicks", value: `${s.kick}`, inline: true },
                { name: "🔇 Mutes", value: `${s.mute}`, inline: true }
            );
        return interaction.reply({ embeds: [embed] });
    }
});

// --- AUTO-MODÉRATION (ANTI-PUB & NOUVEAUX COMPTES) ---
client.on(Events.GuildMemberAdd, async member => {
    const age = Date.now() - member.user.createdTimestamp;
    const isNew = age < 1000 * 60 * 60 * 24; // 24h

    if (logChannelId) {
        const chan = client.channels.cache.get(logChannelId);
        const embed = new EmbedBuilder()
            .setTitle("Anti-Pub / Sécurité")
            .setThumbnail(member.user.displayAvatarURL())
            .setColor(isNew ? "#ff0000" : "#00ff00")
            .setDescription(`${member} a rejoint le serveur.`)
            .addFields(
                { name: "Création", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: "Plateforme", value: member.presence?.clientStatus ? Object.keys(member.presence.clientStatus).join(', ') : "Web/Inconnu", inline: true },
                { name: "Attention", value: isNew ? "⚠️ Compte récent (Profil suspect)" : "✅ Compte ancien" }
            );
        chan.send({ embeds: [embed] });
    }
});

client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !msg.guild) return;

    // Anti-Pub
    if (/(discord\.(gg|io|me|li)|discordapp\.com\/invite)/.test(msg.content)) {
        await msg.delete().catch(() => {});
        msg.channel.send(`${msg.author}, les pubs sont interdites !`).then(m => setTimeout(() => m.delete(), 5000));
        logToChannel("AUTO-MOD (PUB)", msg.author, "Tentative de lien d'invitation");
    }

    // Anti-Spam
    const uid = msg.author.id;
    const now = Date.now();
    if (!messageCache.has(uid)) messageCache.set(uid, { count: 1, last: now });
    else {
        const data = messageCache.get(uid);
        if (now - data.last < 3000) {
            data.count++;
            if (data.count >= 5) {
                await msg.member.timeout(600000, "Spam automatique");
                logToChannel("AUTO-MUTE", msg.author, "Spam détecté");
            }
        } else { data.count = 1; data.last = now; }
    }
});

// --- FONCTIONS SYSTÈME ---
function updateDB(uid, type) {
    if (!db.has(uid)) db.set(uid, { warn: 0, ban: 0, kick: 0, mute: 0 });
    db.get(uid)[type]++;
}

async function logToChannel(action, target, reason, mod = "Système Automatique") {
    if (!logChannelId) return;
    const chan = client.channels.cache.get(logChannelId);
    if (!chan) return;

    const s = db.get(target.id) || { warn: 0, ban: 0, kick: 0, mute: 0 };
    const embed = new EmbedBuilder()
        .setTitle(`Log : ${action}`)
        .setColor(action.includes("BAN") ? "#ff0000" : "#5865f2")
        .addFields(
            { name: "Cible", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Modérateur", value: `${mod.tag || mod}`, inline: true },
            { name: "Raison", value: reason },
            { name: "Historique", value: `⚠️ ${s.warn} Warns | 🔨 ${s.ban} Bans | 🔇 ${s.mute} Mutes` }
        )
        .setTimestamp();
    chan.send({ embeds: [embed] });
}

client.login(process.env.TOKEN);
