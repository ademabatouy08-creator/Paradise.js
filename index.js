const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const http = require('http');

// --- 1. SERVEUR DE MAINTIEN (RENDER) ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise RP Engine is Online!");
    res.end();
}).listen(process.env.PORT || 10000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildPresences
    ]
});

// --- 2. VARIABLES DE STOCKAGE ---
const db = new Map(); 
const messageCache = new Map();
let logChannelId = null;

// --- 3. DÉFINITION DE TOUTES LES COMMANDES ---
const commands = [
    // Système Immobilier / Facture
    new SlashCommandBuilder()
        .setName('facture')
        .setDescription('Vendre une maison (Calcul TVA automatique)')
        .addUserOption(o => o.setName('client').setDescription('L’acheteur').setRequired(true))
        .addStringOption(o => o.setName('entreprise').setDescription('Nom de l’entreprise/agence').setRequired(true))
        .addNumberOption(o => o.setName('montant_ht').setDescription('Prix Hors Taxe (HT)').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Adresse de la maison / Objet').setRequired(true)),

    // Système Absence (Staff)
    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Déclarer une absence staff')
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
        .addStringOption(o => o.setName('durée').setDescription('Ex: 3 jours').setRequired(true)),

    // Modération & Stats
    new SlashCommandBuilder().setName('warn').setDescription('Avertir un membre').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('stats').setDescription('Voir l’historique d’un joueur').addUserOption(o => o.setName('cible')),
    new SlashCommandBuilder().setName('clear').setDescription('Supprimer des messages').addIntegerOption(o => o.setName('nombre').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Bannir').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison')),
    new SlashCommandBuilder().setName('kick').setDescription('Expulser').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison')),

    // Outils Admin
    new SlashCommandBuilder().setName('setup').setDescription('Configuration').addSubcommand(s => s.setName('logs').setDescription('Définir le salon de logs').addChannelOption(o => o.setName('salon').setRequired(true))),
    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Faire parler le bot (Embed)')
        .addStringOption(o => o.setName('titre').setRequired(true))
        .addStringOption(o => o.setName('contenu').setRequired(true))
        .addStringOption(o => o.setName('couleur').setDescription('Code HEX (ex: #ff0000)')),
].map(c => c.toJSON());

// --- 4. DÉMARRAGE ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Paradise#0777 connecté !`);
    client.user.setActivity("Vendre des maisons", { type: ActivityType.Watching });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Toutes les commandes synchronisées !');
    } catch (e) { console.error(e); }
});

// --- 5. GESTION DES INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user } = interaction;

        // --- COMMANDE FACTURE (IMMOBILIER) ---
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
                    { name: "🔄 Comment calculer ?", value: `➤ HT (${ht}) × 1,20 = **${ttc.toLocaleString()}€ TTC**`, inline: false }
                )
                .setFooter({ text: "Acceptez pour confirmer l'achat de la propriété." })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`f_yes_${user.id}_${ttc}`).setLabel('✅ Accepter & Signer').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`f_no_${user.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
            );

            try {
                await target.send({ embeds: [factEmbed], components: [row] });
                return interaction.reply({ content: `✅ Facture pour "${raison}" envoyée à ${target}.`, ephemeral: true });
            } catch (e) {
                return interaction.reply({ content: "❌ MP fermés pour cet utilisateur.", ephemeral: true });
            }
        }

        // --- COMMANDE ABSENCE (TON IMAGE) ---
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

        // --- COMMANDE MESSAGE (SAY) ---
        if (commandName === 'message') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: "Admin requis.", ephemeral: true });
            const title = options.getString('titre');
            const text = options.getString('contenu').replace(/\\n/g, '\n');
            const col = options.getString('couleur') || "#2b2d31";

            const msgEmbed = new EmbedBuilder().setTitle(title).setDescription(text).setColor(col.startsWith('#') ? col : "#2b2d31");
            await interaction.channel.send({ embeds: [msgEmbed] });
            return interaction.reply({ content: "✅ Envoyé.", ephemeral: true });
        }

        // --- COMMANDE WARN & STATS ---
        if (commandName === 'warn') {
            const target = options.getUser('cible');
            const reason = options.getString('raison');
            if (!db.has(target.id)) db.set(target.id, { warnCount: 0, history: [] });
            const data = db.get(target.id);
            data.warnCount++;
            data.history.push({ reason, date: new Date().toLocaleDateString(), mod: user.tag });
            logToChannel("AVERTISSEMENT", target, reason, user);
            return interaction.reply(`⚠️ ${target.tag} a été averti.`);
        }

        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const s = db.get(target.id) || { warnCount: 0, history: [] };
            const statEmbed = new EmbedBuilder().setTitle(`Profil : ${target.tag}`).addFields({ name: "Avertissements", value: `${s.warnCount}` }).setColor("#5865F2");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`h_${target.id}`).setLabel('Voir l’historique (+)').setStyle(ButtonStyle.Secondary).setDisabled(s.history.length === 0));
            return interaction.reply({ embeds: [statEmbed], components: [row] });
        }

        if (commandName === 'setup') {
            logChannelId = options.getChannel('salon').id;
            return interaction.reply("✅ Salon de logs configuré.");
        }
    }

    // --- GESTION DES BOUTONS (FACTURES & HISTORIQUE) ---
    if (interaction.isButton()) {
        const [prefix, choice, senderId, amount] = interaction.customId.split('_');

        if (prefix === 'f') { // Factures
            const sender = await client.users.fetch(senderId);
            if (choice === 'yes') {
                await interaction.update({ content: `✅ Facture de **${amount}€** acceptée !`, embeds: [], components: [] });
                logToChannel("💰 PAIEMENT REÇU", interaction.user, `A payé **${amount}€** à ${sender.tag}`);
                try { await sender.send(`✅ **${interaction.user.tag}** a payé sa facture !`); } catch(e){}
            } else {
                await interaction.update({ content: "❌ Facture refusée.", embeds: [], components: [] });
                try { await sender.send(`❌ **${interaction.user.tag}** a refusé de payer.`); } catch(e){}
            }
        }

        if (prefix === 'h') { // Historique Stats
            const data = db.get(choice);
            const histEmbed = new EmbedBuilder().setTitle("Détails des Sanctions").setColor("#ffaa00").setDescription(data.history.map(h => `• ${h.reason} (par ${h.mod} le ${h.date})`).join('\n'));
            return interaction.reply({ embeds: [histEmbed], ephemeral: true });
        }
    }
});

// --- 6. AUTO-MOD (ANTI-PUB & NSFW) ---
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !msg.guild) return;
    if (/(discord\.(gg|io|me|li)|discordapp\.com\/invite)/.test(msg.content)) {
        await msg.delete().catch(() => {});
        logToChannel("AUTO-MOD (PUB)", msg.author, "Lien supprimé");
    }
    if (/(sex|porn|🔞|🍆|🍑)/gi.test(msg.content)) {
        await msg.delete().catch(() => {});
        logToChannel("AUTO-MOD (NSFW)", msg.author, "Mots inappropriés");
    }
});

// --- 7. FONCTION LOGS ---
async function logToChannel(action, target, reason, mod = "Système") {
    if (!logChannelId) return;
    try {
        const chan = await client.channels.fetch(logChannelId).catch(() => null);
        if (!chan) return;
        const logEmbed = new EmbedBuilder()
            .setTitle(`Log : ${action}`)
            .setColor(action.includes("PAIEMENT") ? "#2ecc71" : "#3498db")
            .addFields({ name: "Cible", value: `${target.tag || target}`, inline: true }, { name: "Modo", value: `${mod.tag || mod}`, inline: true }, { name: "Détails", value: reason })
            .setTimestamp();
        await chan.send({ embeds: [logEmbed] });
    } catch (e) {}
}

client.login(process.env.TOKEN);
