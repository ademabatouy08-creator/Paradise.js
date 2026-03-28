const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const http = require('http');

// --- 1. PREVENT RENDER TIMEOUT ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise Bot Ultra is Running!");
    res.end();
}).listen(process.env.PORT || 10000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildPresences
    ]
});

// --- 2. BASE DE DONNÉES TEMPORAIRE ---
const db = new Map(); 
let logChannelId = null;

// --- 3. DÉFINITION DES COMMANDES (CORRIGÉES AVEC DESCRIPTIONS) ---
const commands = [
    // --- Système RP / Facture ---
    new SlashCommandBuilder()
        .setName('facture')
        .setDescription('Vendre une maison (Calcul TVA automatique)')
        .addUserOption(o => o.setName('client').setDescription('L’acheteur de la propriété').setRequired(true))
        .addStringOption(o => o.setName('entreprise').setDescription('Nom de l’agence immobilière').setRequired(true))
        .addNumberOption(o => o.setName('montant_ht').setDescription('Prix Hors Taxe (HT)').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Adresse de la maison ou objet').setRequired(true)),

    // --- Système Staff / Absence ---
    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Déclarer une absence staff')
        .addStringOption(o => o.setName('raison').setDescription('Raison de l’absence').setRequired(true))
        .addStringOption(o => o.setName('durée').setDescription('Ex: 3 jours').setRequired(true)),

    // --- Modération ---
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Le membre à avertir').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison du warn').setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Voir l’historique ultra-détaillé d’un joueur')
        .addUserOption(o => o.setName('cible').setDescription('L’utilisateur à consulter')),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprimer des messages')
        .addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre')
        .addUserOption(o => o.setName('cible').setDescription('Le membre à expulser').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison du kick')),

    // --- Utilitaires & Admin ---
    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Envoyer un message Embed personnalisé')
        .addStringOption(o => o.setName('titre').setDescription('Titre de l’embed').setRequired(true))
        .addStringOption(o => o.setName('contenu').setDescription('Contenu (utilisez \\n pour sauter une ligne)').setRequired(true))
        .addStringOption(o => o.setName('couleur').setDescription('Code HEX (ex: #ff0000)')),

    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Afficher les informations d’un utilisateur')
        .addUserOption(o => o.setName('cible').setDescription('L’utilisateur')),

    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Afficher les informations du serveur'),

    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration du bot')
        .addSubcommand(s => s.setName('logs').setDescription('Définir le salon de logs').addChannelOption(o => o.setName('salon').setDescription('Le salon de texte').setRequired(true))),
].map(c => c.toJSON());

// --- 4. ÉVÈNEMENT READY ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setActivity("Paradise RP", { type: ActivityType.Competing });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commandes Slash enregistrées (Version Ultra)');
    } catch (e) { console.error(e); }
});

// --- 5. GESTION DES INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user } = interaction;

        // --- COMMANDE MESSAGE (SAY EMBED) ---
        if (commandName === 'message') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: "❌ Permission refusée.", ephemeral: true });
            
            const titre = options.getString('titre');
            const texte = options.getString('contenu').replace(/\\n/g, '\n');
            const couleur = options.getString('couleur') || "#2b2d31";

            const embed = new EmbedBuilder()
                .setTitle(titre)
                .setDescription(texte)
                .setColor(couleur.startsWith('#') ? couleur : "#2b2d31")
                .setFooter({ text: `Message de l'administration • ${guild.name}` });

            await interaction.channel.send({ embeds: [embed] });
            return interaction.reply({ content: "✅ Embed envoyé avec succès.", ephemeral: true });
        }

        // --- STATS DÉTAILLÉES ---
        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const s = db.get(target.id) || { warnCount: 0, history: [], lastSanction: "Aucune" };

            const embed = new EmbedBuilder()
                .setTitle(`📊 Dossier Disciplinaire : ${target.username}`)
                .setThumbnail(target.displayAvatarURL())
                .setColor("#5865F2")
                .addFields(
                    { name: "🆔 Identifiant", value: `\`${target.id}\``, inline: true },
                    { name: "⚠️ Nombre de Warns", value: `**${s.warnCount}**`, inline: true },
                    { name: "🕒 Dernière sanction", value: `${s.lastSanction}`, inline: false }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`h_${target.id}`).setLabel('Voir tout l’historique (+)').setStyle(ButtonStyle.Primary).setDisabled(s.history.length === 0)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- FACTURE RP ---
        if (commandName === 'facture') {
            const clientUser = options.getUser('client');
            const agence = options.getString('entreprise');
            const ht = options.getNumber('montant_ht');
            const raison = options.getString('raison');
            const tva = ht * 0.20;
            const ttc = ht + tva;

            const factEmbed = new EmbedBuilder()
                .setTitle(`🏠 CONTRAT DE VENTE - ${agence}`)
                .setColor("#2ecc71")
                .addFields(
                    { name: "📍 Adresse / Objet", value: raison, inline: false },
                    { name: "💰 Détails Financiers", value: `Prix HT : **${ht.toLocaleString()}€**\nTVA (20%) : **${tva.toLocaleString()}€**\n**TOTAL TTC : ${ttc.toLocaleString()}€**`, inline: false },
                    { name: "🔄 Calcul", value: `*${ht.toLocaleString()}€ HT × 1,20 (TVA) = ${ttc.toLocaleString()}€ TTC*`, inline: false }
                )
                .setFooter({ text: "Facture générée par le système Paradise" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`f_yes_${user.id}_${ttc}`).setLabel('✅ Signer le contrat').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`f_no_${user.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
            );

            try {
                await clientUser.send({ embeds: [factEmbed], components: [row] });
                return interaction.reply({ content: `✅ Offre envoyée en MP à ${clientUser.username}.`, ephemeral: true });
            } catch (e) {
                return interaction.reply({ content: "❌ Impossible d'envoyer le MP (privé fermé).", ephemeral: true });
            }
        }

        // --- ABSENCE (TON IMAGE) ---
        if (commandName === 'absence') {
            const raison = options.getString('raison');
            const duree = options.getString('durée');
            const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r).join(' ') || "Aucun";

            const absEmbed = new EmbedBuilder()
                .setTitle("Récapitulatif d'absence - Validée")
                .setColor("#2b2d31")
                .addFields(
                    { name: "Utilisateur", value: `${user}`, inline: false },
                    { name: "Raison", value: raison, inline: false },
                    { name: "Durée", value: duree, inline: true },
                    { name: "Rôles possédés", value: roles, inline: false },
                    { name: "Traité par", value: `${client.user}`, inline: true },
                    { name: "Date", value: new Date().toLocaleString('fr-FR'), inline: true }
                );
            return interaction.reply({ embeds: [absEmbed] });
        }

        // --- WARN ---
        if (commandName === 'warn') {
            const target = options.getUser('cible');
            const reason = options.getString('raison');
            if (!db.has(target.id)) db.set(target.id, { warnCount: 0, history: [], lastSanction: "Aucune" });
            const data = db.get(target.id);
            data.warnCount++;
            data.lastSanction = reason;
            data.history.push({ reason, date: new Date().toLocaleString('fr-FR'), mod: user.tag });
            logToChannel("AVERTISSEMENT", target, reason, user);
            return interaction.reply(`⚠️ **${target.tag}** a été averti pour : ${reason}`);
        }

        // --- INFOS ---
        if (commandName === 'userinfo') {
            const u = options.getMember('cible') || member;
            const embed = new EmbedBuilder()
                .setTitle(`Informations : ${u.user.username}`)
                .setThumbnail(u.user.displayAvatarURL())
                .addFields(
                    { name: "Rejoint le", value: `<t:${Math.floor(u.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: "Compte créé", value: `<t:${Math.floor(u.user.createdTimestamp / 1000)}:R>`, inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'setup') {
            logChannelId = options.getChannel('salon').id;
            return interaction.reply("✅ Salon de logs configuré !");
        }
    }

    // --- GESTION DES BOUTONS ---
    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        const prefix = parts[0];
        
        if (prefix === 'h') { // Bouton Histoire
            const data = db.get(parts[1]);
            if (!data) return interaction.reply({ content: "Aucune donnée.", ephemeral: true });
            const list = data.history.map((h, i) => `**#${i+1}** - ${h.reason}\n📅 *${h.date} par ${h.mod}*`).join('\n\n');
            const embed = new EmbedBuilder().setTitle("Historique Détaillé").setDescription(list).setColor("#ffaa00");
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (prefix === 'f') { // Bouton Facture
            const sender = await client.users.fetch(parts[2]);
            if (parts[1] === 'yes') {
                await interaction.update({ content: `✅ Vous avez signé le contrat ! (Montant : **${parts[3]}€**)`, embeds: [], components: [] });
                logToChannel("💰 TRANSACTION VALIDÉE", interaction.user, `A payé **${parts[3]}€** à ${sender.tag}`);
            } else {
                await interaction.update({ content: "❌ Contrat refusé.", embeds: [], components: [] });
                logToChannel("❌ TRANSACTION ANNULÉE", interaction.user, `A refusé l'offre de ${sender.tag}`);
            }
        }
    }
});

// --- 6. AUTO-MOD (ANTI-PUB) ---
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !msg.guild) return;
    if (/(discord\.(gg|io|me|li)|discordapp\.com\/invite)/.test(msg.content)) {
        await msg.delete().catch(() => {});
        logToChannel("AUTO-MOD (PUB)", msg.author, "Lien d'invitation supprimé");
    }
});

// --- 7. FONCTION LOGS ---
async function logToChannel(action, target, reason, mod = "Système") {
    if (!logChannelId) return;
    try {
        const chan = await client.channels.fetch(logChannelId).catch(() => null);
        if (!chan) return;
        const embed = new EmbedBuilder()
            .setTitle(`LOG : ${action}`)
            .addFields(
                { name: "Cible", value: `${target.tag || target}`, inline: true },
                { name: "Modérateur", value: `${mod.tag || mod}`, inline: true },
                { name: "Détails", value: reason }
            ).setTimestamp();
        await chan.send({ embeds: [embed] });
    } catch (e) {}
}

client.login(process.env.TOKEN);
