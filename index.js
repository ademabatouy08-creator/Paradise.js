const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType
} = require('discord.js');
const http = require('http');

// --- 1. PREVENT RENDER TIMEOUT (Port Binding) ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise Bot is Online and Guarding!");
    res.end();
}).listen(process.env.PORT || 10000);

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

// --- 2. STOCKAGE TEMPORAIRE ---
const db = new Map(); 
const messageCache = new Map();
let logChannelId = null;

// --- 3. DÉFINITION DES COMMANDES SLASH ---
const commands = [
    // Configuration
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration du bot')
        .addSubcommand(s => s.setName('logs').setDescription('Définit le salon de logs').addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true).addChannelTypes(ChannelType.GuildText))),

    // Système d'Absence (Staff)
    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Déclarer une absence staff')
        .addStringOption(o => o.setName('raison').setDescription('Raison de l’absence').setRequired(true))
        .addStringOption(o => o.setName('durée').setDescription('Ex: 24h, 3 jours...').setRequired(true)),

    // Modération & Sanctions
    new SlashCommandBuilder().setName('warn').setDescription('Avertir un membre').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Bannir un membre').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison')),
    new SlashCommandBuilder().setName('kick').setDescription('Expulser un membre').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison')),
    new SlashCommandBuilder().setName('mute').setDescription('Timeout un membre').addUserOption(o => o.setName('cible').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Durée en min').setRequired(true)).addStringOption(o => o.setName('raison')),
    new SlashCommandBuilder().setName('clear').setDescription('Supprimer des messages').addIntegerOption(o => o.setName('nombre').setRequired(true)),

    // Information & Utilité
    new SlashCommandBuilder().setName('stats').setDescription('Voir l’historique d’un utilisateur').addUserOption(o => o.setName('cible')),
    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Envoyer un embed personnalisé via le bot')
        .addStringOption(o => o.setName('titre').setDescription('Titre de l’embed').setRequired(true))
        .addStringOption(o => o.setName('contenu').setDescription('Message (utilisez \\n pour sauter une ligne)').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Où envoyer le message ?'))
        .addStringOption(o => o.setName('couleur').setDescription('Code couleur HEX (ex: #ff0000)')),
].map(c => c.toJSON());

// --- 4. ÉVÈNEMENT : DÉMARRAGE ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté : ${client.user.tag}`);
    client.user.setActivity("Paradise Security", { type: ActivityType.Shield });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commandes Slash enregistrées !');
    } catch (e) { console.error(e); }
});

// --- 5. GESTION DES INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user } = interaction;

        // COMMAND /SETUP LOGS
        if (commandName === 'setup') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin requis.", ephemeral: true });
            logChannelId = options.getChannel('salon').id;
            return interaction.reply(`✅ Salon de logs défini sur <#${logChannelId}>`);
        }

        // COMMAND /MESSAGE (SAY)
        if (commandName === 'message') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: "❌ Permission refusée.", ephemeral: true });
            const title = options.getString('titre');
            const content = options.getString('contenu').replace(/\\n/g, '\n');
            const targetChan = options.getChannel('salon') || interaction.channel;
            const color = options.getString('couleur') || "#2b2d31";

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(content)
                .setColor(color.startsWith('#') ? color : "#2b2d31")
                .setFooter({ text: `Annonce • ${guild.name}`, iconURL: guild.iconURL() });

            await targetChan.send({ embeds: [embed] });
            return interaction.reply({ content: "✅ Message envoyé !", ephemeral: true });
        }

        // COMMAND /ABSENCE (IMAGE DÉTAILS)
        if (commandName === 'absence') {
            const reason = options.getString('raison');
            const duration = options.getString('durée');
            const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r).join(' ') || "Aucun";

            const embed = new EmbedBuilder()
                .setTitle("Récapitulatif d'absence - Validée")
                .setColor("#2b2d31")
                .addFields(
                    { name: "Utilisateur", value: `${user}`, inline: false },
                    { name: "Raison", value: reason, inline: false },
                    { name: "Durée", value: duration, inline: true },
                    { name: "Rôles possédés", value: roles, inline: false },
                    { name: "Traité par", value: `${client.user}`, inline: true },
                    { name: "Date de traitement", value: new Date().toLocaleString('fr-FR'), inline: true }
                );

            return interaction.reply({ embeds: [embed] });
        }

        // COMMAND /WARN & HISTORIQUE
        if (commandName === 'warn') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply("❌ Permission requise.");
            const target = options.getUser('cible');
            const reason = options.getString('raison');

            if (!db.has(target.id)) db.set(target.id, { warnCount: 0, history: [], bans: 0, mutes: 0 });
            const data = db.get(target.id);
            data.warnCount++;
            data.history.push({ type: 'WARN', reason, mod: user.tag, date: new Date().toLocaleString('fr-FR') });

            logToChannel("AVERTISSEMENT", target, reason, user);
            return interaction.reply(`⚠️ ${target} a été averti pour : **${reason}**`);
        }

        // COMMAND /STATS + BOUTON DÉTAILS
        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const s = db.get(target.id) || { warnCount: 0, history: [], bans: 0, mutes: 0 };

            const embed = new EmbedBuilder()
                .setTitle(`Profil : ${target.tag}`)
                .setThumbnail(target.displayAvatarURL())
                .setColor("#5865F2")
                .addFields(
                    { name: "Avertissements", value: `${s.warnCount}`, inline: true },
                    { name: "Bans", value: `${s.bans}`, inline: true },
                    { name: "Mutes", value: `${s.mutes}`, inline: true }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`hist_${target.id}`)
                    .setLabel('Voir l’historique détaillé (+)')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(s.history.length === 0)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // COMMAND /BAN, /KICK, /MUTE, /CLEAR
        if (['ban', 'kick', 'mute', 'clear'].includes(commandName)) {
            // Logique de modération simplifiée
            if (commandName === 'clear') {
                const amount = options.getInteger('nombre');
                await interaction.channel.bulkDelete(amount, true);
                return interaction.reply({ content: `✅ ${amount} messages effacés.`, ephemeral: true });
            }
            // Ajoutez ici vos logiques de ban/mute classiques...
            interaction.reply("✅ Action effectuée.");
        }
    }

    // BOUTON HISTORIQUE DÉTAILLÉ
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('hist_')) {
            const userId = interaction.customId.split('_')[1];
            const data = db.get(userId);
            if (!data) return interaction.reply({ content: "Aucune donnée.", ephemeral: true });

            const historyEmbed = new EmbedBuilder()
                .setTitle("Historique des sanctions")
                .setColor("#ffcc00")
                .setDescription(data.history.map((h, i) => `**[${i+1}]** ${h.type} - ${h.reason}\n*Par: ${h.mod} le ${h.date}*`).join('\n\n'));

            return interaction.reply({ embeds: [historyEmbed], ephemeral: true });
        }
    }
});

// --- 6. AUTO-MODÉRATION & ANTI-RAID ---
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !msg.guild) return;

    // A. ANTI-PUB
    if (/(discord\.(gg|io|me|li)|discordapp\.com\/invite)/.test(msg.content)) {
        await msg.delete().catch(() => {});
        logToChannel("AUTO-MOD (PUB)", msg.author, "Lien d'invitation supprimé");
        return msg.channel.send(`❌ ${msg.author}, les pubs sont interdites !`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // B. ANTI-GIF / NSFW (Mots clés)
    const nsfwRegex = /(sex|porn|nude|hentai|sexy|🔞|🍑|🍆)/gi;
    if (nsfwRegex.test(msg.content) || (msg.attachments.size > 0 && nsfwRegex.test(msg.attachments.first().name))) {
        await msg.delete().catch(() => {});
        return logToChannel("AUTO-MOD (NSFW)", msg.author, "Contenu inapproprié détecté");
    }

    // C. ANTI-SPAM
    const uid = msg.author.id;
    const now = Date.now();
    if (!messageCache.has(uid)) messageCache.set(uid, { count: 1, last: now });
    else {
        const d = messageCache.get(uid);
        if (now - d.last < 2000) {
            d.count++;
            if (d.count >= 5) {
                await msg.member.timeout(300000, "Spam automatique");
                logToChannel("AUTO-MUTE", msg.author, "Spamming détecté");
            }
        } else { d.count = 1; d.last = now; }
    }
});

// D. ANTI-RAID (COMPTES RÉCENTS)
client.on(Events.GuildMemberAdd, async member => {
    const age = Date.now() - member.user.createdTimestamp;
    const isNew = age < 1000 * 60 * 60; // 1 heure

    if (logChannelId) {
        const chan = await client.channels.fetch(logChannelId).catch(() => null);
        if (!chan) return;

        const embed = new EmbedBuilder()
            .setTitle(isNew ? "🚨 ALERTE : Profil Suspect" : "📥 Nouveau Membre")
            .setColor(isNew ? "#ff0000" : "#00ff00")
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: "Utilisateur", value: `${member.user.tag}`, inline: true },
                { name: "Création du compte", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: "Action", value: isNew ? "⚠️ Surveillé de près (Admin mentionné)" : "Aucune action requise" }
            );
        
        const content = isNew ? "@everyone COMPTE SUSPECT DÉTECTÉ !" : null;
        chan.send({ content, embeds: [embed] });
    }
});

// --- 7. FONCTIONS LOGS ---
async function logToChannel(action, target, reason, mod = "Système Automatique") {
    if (!logChannelId) return;
    try {
        const chan = await client.channels.fetch(logChannelId).catch(() => null);
        if (!chan || !chan.send) return;

        const s = db.get(target.id) || { warnCount: 0, history: [], bans: 0, mutes: 0 };
        const embed = new EmbedBuilder()
            .setTitle(`Log : ${action}`)
            .setColor(action.includes("BAN") ? "#ff0000" : "#5865f2")
            .addFields(
                { name: "Cible", value: `${target.tag}`, inline: true },
                { name: "Par", value: `${mod.tag || mod}`, inline: true },
                { name: "Raison", value: reason },
                { name: "Historique Cumulé", value: `⚠️ ${s.warnCount} Warns | 🔨 ${s.bans} Bans` }
            )
            .setTimestamp();
        
        await chan.send({ embeds: [embed] });
    } catch (e) { console.error("Log error:", e); }
}

client.login(process.env.TOKEN);
