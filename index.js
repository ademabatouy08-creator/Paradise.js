const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const http = require('http');

// --- 1. MAINTIEN RENDER ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise Bot is Online!");
    res.end();
}).listen(process.env.PORT || 10000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// --- 2. STOCKAGE ---
const db = new Map(); 
const messageCache = new Map();
let logChannelId = null;

// --- 3. COMMANDES SLASH (CORRIGÉES) ---
const commands = [
    // Facture Immobilière
    new SlashCommandBuilder()
        .setName('facture')
        .setDescription('Vendre une maison (Calcul TVA automatique)')
        .addUserOption(o => o.setName('client').setDescription('L’acheteur de la propriété').setRequired(true))
        .addStringOption(o => o.setName('entreprise').setDescription('Nom de l’agence immobilière').setRequired(true))
        .addNumberOption(o => o.setName('montant_ht').setDescription('Prix Hors Taxe (HT)').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Adresse de la maison ou objet').setRequired(true)),

    // Absence Staff
    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Déclarer une absence staff')
        .addStringOption(o => o.setName('raison').setDescription('Raison de l’absence').setRequired(true))
        .addStringOption(o => o.setName('durée').setDescription('Ex: 3 jours').setRequired(true)),

    // Modération
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Le membre à avertir').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison du warn').setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Voir l’historique d’un joueur')
        .addUserOption(o => o.setName('cible').setDescription('L’utilisateur à consulter')),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprimer des messages')
        .addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages à supprimer').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Le membre à bannir').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison du ban')),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre')
        .addUserOption(o => o.setName('cible').setDescription('Le membre à expulser').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Raison du kick')),

    // Outils Admin
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration')
        .addSubcommand(s => s.setName('logs').setDescription('Définir le salon de logs').addChannelOption(o => o.setName('salon').setDescription('Le salon de texte').setRequired(true))),

    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Faire parler le bot (Embed)')
        .addStringOption(o => o.setName('titre').setDescription('Titre de l’embed').setRequired(true))
        .addStringOption(o => o.setName('contenu').setDescription('Contenu du message').setRequired(true))
        .addStringOption(o => o.setName('couleur').setDescription('Code HEX (ex: #ff0000)')),
].map(c => c.toJSON());

// --- 4. READY ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Paradise#0777 est prêt !`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commandes Slash enregistrées !');
    } catch (e) { console.error(e); }
});

// --- 5. INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user } = interaction;

        // --- FACTURE ---
        if (commandName === 'facture') {
            const target = options.getUser('client');
            const entreprise = options.getString('entreprise');
            const ht = options.getNumber('montant_ht');
            const raison = options.getString('raison');
            const tva = ht * 0.20;
            const ttc = ht + tva;

            const factEmbed = new EmbedBuilder()
                .setTitle(`🧾 FACTURE IMMOBILIÈRE - ${entreprise}`)
                .setColor("#2ecc71")
                .addFields(
                    { name: "🏢 Entreprise", value: `\`${entreprise}\``, inline: true },
                    { name: "📍 Objet", value: raison, inline: true },
                    { name: "💰 Détails Prix", value: `HT : **${ht.toLocaleString()}€**\nTVA (20%) : **${tva.toLocaleString()}€**\n**TOTAL TTC : ${ttc.toLocaleString()}€**`, inline: false },
                    { name: "🔄 Calcul", value: `➤ ${ht.toLocaleString()}€ HT × 1,20 = **${ttc.toLocaleString()}€ TTC**`, inline: false }
                ).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`f_yes_${user.id}_${ttc}`).setLabel('✅ Accepter & Signer').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`f_no_${user.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
            );

            try {
                await target.send({ embeds: [factEmbed], components: [row] });
                return interaction.reply({ content: `✅ Facture envoyée à ${target}.`, ephemeral: true });
            } catch (e) {
                return interaction.reply({ content: "❌ MP fermés.", ephemeral: true });
            }
        }

        // --- ABSENCE ---
        if (commandName === 'absence') {
            const r = options.getString('raison');
            const d = options.getString('durée');
            const roles = member.roles.cache.filter(role => role.name !== "@everyone").map(role => role).join(' ') || "Aucun";
            const absEmbed = new EmbedBuilder()
                .setTitle("Récapitulatif d'absence - Validée")
                .setColor("#2b2d31")
                .addFields(
                    { name: "Utilisateur", value: `${user}`, inline: false },
                    { name: "Raison", value: r, inline: false },
                    { name: "Durée", value: d, inline: true },
                    { name: "Rôles possédés", value: roles, inline: false },
                    { name: "Date", value: new Date().toLocaleString('fr-FR'), inline: true }
                );
            return interaction.reply({ embeds: [absEmbed] });
        }

        // --- AUTRES COMMANDES ---
        if (commandName === 'setup') {
            logChannelId = options.getChannel('salon').id;
            return interaction.reply("✅ Logs configurés.");
        }

        if (commandName === 'message') {
            const title = options.getString('titre');
            const text = options.getString('contenu').replace(/\\n/g, '\n');
            const col = options.getString('couleur') || "#2b2d31";
            const msgEmbed = new EmbedBuilder().setTitle(title).setDescription(text).setColor(col.startsWith('#') ? col : "#2b2d31");
            await interaction.channel.send({ embeds: [msgEmbed] });
            return interaction.reply({ content: "✅ Envoyé.", ephemeral: true });
        }

        if (commandName === 'warn') {
            const target = options.getUser('cible');
            const reason = options.getString('raison');
            if (!db.has(target.id)) db.set(target.id, { warnCount: 0, history: [] });
            db.get(target.id).warnCount++;
            db.get(target.id).history.push({ reason, date: new Date().toLocaleDateString(), mod: user.tag });
            logToChannel("WARN", target, reason, user);
            return interaction.reply(`⚠️ ${target.tag} averti.`);
        }

        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const s = db.get(target.id) || { warnCount: 0, history: [] };
            const emb = new EmbedBuilder().setTitle(`Profil : ${target.tag}`).addFields({ name: "Warns", value: `${s.warnCount}` }).setColor("#5865F2");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`h_${target.id}`).setLabel('Historique (+)').setStyle(ButtonStyle.Secondary).setDisabled(s.history.length === 0));
            return interaction.reply({ embeds: [emb], components: [row] });
        }

        if (commandName === 'clear') {
            const amount = options.getInteger('nombre');
            await interaction.channel.bulkDelete(amount, true);
            return interaction.reply({ content: `✅ ${amount} messages supprimés.`, ephemeral: true });
        }
    }

    // --- BOUTONS ---
    if (interaction.isButton()) {
        const [p, choice, sId, amt] = interaction.customId.split('_');
        if (p === 'f') { // Facture
            const sender = await client.users.fetch(sId);
            if (choice === 'yes') {
                await interaction.update({ content: `✅ Facture de **${amt}€** payée !`, embeds: [], components: [] });
                logToChannel("💰 PAIEMENT", interaction.user, `A payé **${amt}€** à ${sender.tag}`);
            } else {
                await interaction.update({ content: "❌ Refusé.", embeds: [], components: [] });
            }
        }
        if (p === 'h') { // Historique
            const data = db.get(choice);
            const emb = new EmbedBuilder().setTitle("Détails").setDescription(data.history.map(h => `• ${h.reason} (${h.date})`).join('\n'));
            return interaction.reply({ embeds: [emb], ephemeral: true });
        }
    }
});

// --- 6. AUTO-MOD ---
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !msg.guild) return;
    if (/(discord\.(gg|io|me|li)|discordapp\.com\/invite)/.test(msg.content)) {
        await msg.delete().catch(() => {});
        logToChannel("AUTO-MOD (PUB)", msg.author, "Lien supprimé");
    }
});

// --- 7. FONCTION LOGS ---
async function logToChannel(action, target, reason, mod = "Système") {
    if (!logChannelId) return;
    try {
        const chan = await client.channels.fetch(logChannelId);
        const emb = new EmbedBuilder()
            .setTitle(`Log : ${action}`)
            .addFields({ name: "Joueur", value: `${target.tag || target}`, inline: true }, { name: "Détails", value: reason })
            .setTimestamp();
        await chan.send({ embeds: [emb] });
    } catch (e) {}
}

client.login(process.env.TOKEN);
