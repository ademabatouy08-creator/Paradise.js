const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, AuditLogEvent 
} = require('discord.js');
const mongoose = require('mongoose');

// --- INITIALISATION DU CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// --- CONFIGURATION & CONSTANTES ---
const CONFIG = {
    LOG_CHANNEL: "ID_DE_TON_SALON_LOGS",
    PREFIX: "!",
    COOLDOWN_SPAM: 3000, // 3 secondes
    LIMIT_SPAM: 5,        // Max 5 messages en 3s
    AUTO_BAN_AGE: 1000 * 60 * 60 * 2, // Ban direct si compte < 2 heures (Anti-Raid)
};

// --- SCHEMA MONGODB (Historique Utilisateur) ---
const UserSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    warns: { type: Number, default: 0 },
    mutes: { type: Number, default: 0 },
    bans: { type: Number, default: 0 },
    history: Array
});
const UserData = mongoose.model('UserData', UserSchema);

// --- SYSTÈME ANTI-SPAM INTERNE ---
const messageCache = new Map();

// --- ÉVÈNEMENT : CONNEXION ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setActivity("Surveiller le serveur", { type: ActivityType.Shield });

    // Connexion MongoDB
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🍃 Connecté à MongoDB Atlas");
    } catch (err) {
        console.error("❌ Erreur MongoDB:", err);
    }
});

// --- SYSTÈME D'AUTO-MODÉRATION (SANS STAFF) ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const authorId = message.author.id;
    const now = Date.now();

    // 1. Détection Anti-Pub (Discord & Liens Externes)
    const inviteLinks = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+/g;
    if (inviteLinks.test(message.content)) {
        await message.delete().catch(() => {});
        return handleViolation(message.author, message.guild, "Publicité interdite", "Warn/Delete");
    }

    // 2. Détection Anti-Spam
    if (!messageCache.has(authorId)) {
        messageCache.set(authorId, { count: 1, lastTime: now });
    } else {
        const data = messageCache.get(authorId);
        if (now - data.lastTime < CONFIG.COOLDOWN_SPAM) {
            data.count++;
            if (data.count === CONFIG.LIMIT_SPAM) {
                await message.member.timeout(600000, "Spam intensif (Auto-Mod)"); // 10 min
                message.channel.send(`🔇 ${message.author} a été mute 10 min pour spam.`);
                logToChannel("Auto-Mute", message.author, "Spamming");
            }
        } else {
            data.count = 1;
            data.lastTime = now;
        }
    }

    // 3. Commandes de Modération Manuelle
    if (message.content.startsWith(CONFIG.PREFIX)) {
        const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Commande : !ban @user raison
        if (command === "ban") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
            const target = message.mentions.members.first();
            if (!target) return message.reply("Utilisateur introuvable.");
            const reason = args.slice(1).join(" ") || "Aucune raison";
            
            await target.ban({ reason });
            await updateDatabase(target.id, message.guild.id, "ban", reason);
            logToChannel("Ban", target.user, reason, message.author);
            message.channel.send(`🔨 ${target.user.tag} a été banni.`);
        }

        // Commande : !warn @user raison
        if (command === "warn") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
            const target = message.mentions.users.first();
            if (!target) return message.reply("Utilisateur introuvable.");
            const reason = args.slice(1).join(" ") || "Aucune raison";

            await updateDatabase(target.id, message.guild.id, "warn", reason);
            logToChannel("Warn", target, reason, message.author);
            message.channel.send(`⚠️ ${target.tag} a été averti.`);
        }

        // Commande : !stats @user (Affiche l'historique complet)
        if (command === "stats") {
            const target = message.mentions.users.first() || message.author;
            const data = await UserData.findOne({ userId: target.id, guildId: message.guild.id });

            const statsEmbed = new EmbedBuilder()
                .setTitle(`Historique de ${target.username}`)
                .setColor("#5865F2")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "Avertissements", value: `${data?.warns || 0}`, inline: true },
                    { name: "Mutes", value: `${data?.mutes || 0}`, inline: true },
                    { name: "Bans", value: `${data?.bans || 0}`, inline: true }
                )
                .setFooter({ text: "Données extraites de la base MongoDB" });

            message.channel.send({ embeds: [statsEmbed] });
        }
    }
});

// --- GESTION DES NOUVEAUX ARRIVANTS (ANTI-RAID) ---
client.on(Events.GuildMemberAdd, async (member) => {
    const accountAge = Date.now() - member.user.createdTimestamp;

    if (accountAge < CONFIG.AUTO_BAN_AGE) {
        await member.send("Votre compte est trop récent pour rejoindre ce serveur (Sécurité Anti-Raid).").catch(() => {});
        await member.kick("Compte suspect (Moins de 2h)");
        logToChannel("Anti-Raid", member.user, "Compte créé il y a moins de 2 heures");
    }
});

// --- FONCTIONS UTILITAIRES ---

async function updateDatabase(userId, guildId, type, reason) {
    let user = await UserData.findOne({ userId, guildId });
    if (!user) user = new UserData({ userId, guildId, history: [] });

    if (type === "warn") user.warns++;
    if (type === "mute") user.mutes++;
    if (type === "ban") user.bans++;

    user.history.push({ type, reason, date: new Date().toLocaleString() });
    await user.save();
}

async function logToChannel(action, target, reason, moderator = "Système Automatique") {
    const channel = client.channels.cache.get(CONFIG.LOG_CHANNEL);
    if (!channel) return;

    // Récupération des stats DB pour l'embed
    const data = await UserData.findOne({ userId: target.id });

    const embed = new EmbedBuilder()
        .setTitle(`[LOG] Action : ${action}`)
        .setColor(action.includes("Ban") ? "#d00000" : "#ffaa00")
        .setThumbnail(target.displayAvatarURL())
        .addFields(
            { name: "Utilisateur", value: `${target.tag} (${target.id})`, inline: false },
            { name: "Modérateur", value: `${moderator}`, inline: true },
            { name: "Raison", value: reason, inline: true },
            { name: "Historique Cumulé", value: `⚠️ ${data?.warns || 0} | 🔇 ${data?.mutes || 0} | 🔨 ${data?.bans || 0}` }
        )
        .setTimestamp();

    channel.send({ embeds: [embed] });
}

async function handleViolation(user, guild, reason, actionType) {
    await updateDatabase(user.id, guild.id, "warn", reason);
    logToChannel("Auto-Warn", user, reason);
}

// --- GESTION DES ERREURS POUR EVITER LE CRASH SUR RENDER ---
process.on('unhandledRejection', error => console.error('Erreur non gérée :', error));

client.login(process.env.TOKEN);
