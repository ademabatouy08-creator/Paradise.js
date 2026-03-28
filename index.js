const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    Collection
} = require('discord.js');
const http = require('http');

// --- 1. SERVEUR DE MAINTIEN RENDER ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Paradise Bot System: Online & Active");
    res.end();
}).listen(process.env.PORT || 10000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildPresences
    ]
});

// --- 2. STORAGE (Map() simulant une DB) ---
const db = new Map(); // Stocke : { warnCount, history, notes, balance }
const settings = { logChannel: null, staffRole: null, announcementChannel: null };

// --- 3. DÉFINITION DES COMMANDES SLASH ---
const commands = [
    // --- IMMOBILIER & FACTURES ---
    new SlashCommandBuilder()
        .setName('facture')
        .setDescription('Vendre une maison (Calcul TVA 20% automatique)')
        .addUserOption(o => o.setName('client').setDescription('L’acheteur').setRequired(true))
        .addStringOption(o => o.setName('entreprise').setDescription('Nom de l’agence').setRequired(true))
        .addNumberOption(o => o.setName('montant_ht').setDescription('Prix HT').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Adresse de la propriété').setRequired(true)),

    // --- STAFF & ABSENCE ---
    new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Déclarer une absence staff')
        .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
        .addStringOption(o => o.setName('durée').setDescription('Ex: 1 semaine').setRequired(true)),

    // --- MODÉRATION AVANCÉE ---
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .addUserOption(o => o.setName('cible').setDescription('Le fautif').setRequired(true))
        .addStringOption(o => o.setName('raison').setDescription('Motif du warn').setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Dossier complet d’un joueur (Warns + Notes)')
        .addUserOption(o => o.setName('cible').setDescription('L’utilisateur')),

    new SlashCommandBuilder()
        .setName('note')
        .setDescription('Ajouter un pense-bête sur un joueur (Visible uniquement par le staff)')
        .addUserOption(o => o.setName('cible').setDescription('Le joueur').setRequired(true))
        .addStringOption(o => o.setName('texte').setDescription('La note à enregistrer').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Nettoyer le chat')
        .addIntegerOption(o => o.setName('nombre').setDescription('Messages (1-100)').setRequired(true)),

    // --- ADMINISTRATION & MESSAGE ---
    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Créer un embed pro')
        .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
        .addStringOption(o => o.setName('contenu').setDescription('Texte (\\n pour ligne)').setRequired(true))
        .addStringOption(o => o.setName('couleur').setDescription('HEX (ex: #00ff00)')),

    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration intégrale du serveur')
        .addSubcommand(s => s.setName('logs').setDescription('Salon des logs').addChannelOption(o => o.setName('salon').setDescription('Le salon').setRequired(true)))
        .addSubcommand(s => s.setName('staff').setDescription('Rôle staff').addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true))),

    // --- FUN & "INUTILE" ---
    new SlashCommandBuilder().setName('humeur').setDescription('Comment se sent le bot aujourd’hui ?'),
    new SlashCommandBuilder().setName('pile_ou_face').setDescription('Lancer une pièce'),
    new SlashCommandBuilder().setName('8ball').setDescription('Poser une question au destin').addStringOption(o => o.setName('question').setDescription('Votre question').setRequired(true)),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Infos techniques du serveur'),

].map(c => c.toJSON());

// --- 4. READY ---
client.once(Events.ClientReady, async () => {
    console.log(`🚀 Paradise Bot connecté : ${client.user.tag}`);
    client.user.setActivity("veiller sur Paradise", { type: ActivityType.Watching });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Synchronisation Slash Commands OK');
    } catch (e) { console.error(e); }
});

// --- 5. LOGIQUE DES INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, user, channel } = interaction;

        // --- FACTURE IMMOBILIÈRE ---
        if (commandName === 'facture') {
            const target = options.getUser('client');
            const ent = options.getString('entreprise');
            const ht = options.getNumber('montant_ht');
            const raison = options.getString('raison');
            const ttc = ht * 1.20;

            const embed = new EmbedBuilder()
                .setTitle(`🏠 CONTRAT DE VENTE - ${ent}`)
                .setColor("#2ecc71")
                .addFields(
                    { name: "👤 Acheteur", value: `${target}`, inline: true },
                    { name: "📍 Adresse", value: `\`${raison}\``, inline: true },
                    { name: "🧾 Facturation", value: `HT : **${ht.toLocaleString()}€**\nTVA (20%) : **${(ht * 0.2).toLocaleString()}€**\n**TOTAL TTC : ${ttc.toLocaleString()}€**` },
                    { name: "🔄 Calcul Rapide", value: `*${ht}€ HT × 1,20 = ${ttc}€ TTC*` }
                )
                .setFooter({ text: "Paradise Immo System" }).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fact_ok_${user.id}_${ttc}`).setLabel('Signer').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`fact_no_${user.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger)
            );

            try {
                await target.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: `✅ Contrat envoyé à ${target.username}.`, ephemeral: true });
            } catch { return interaction.reply({ content: "❌ MP fermés.", ephemeral: true }); }
        }

        // --- STATS DÉTAILLÉES ---
        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const data = db.get(target.id) || { warnCount: 0, history: [], notes: [] };

            const embed = new EmbedBuilder()
                .setTitle(`📂 Dossier Joueur : ${target.tag}`)
                .setThumbnail(target.displayAvatarURL())
                .setColor("#3498db")
                .addFields(
                    { name: "⚠️ Warns", value: `**${data.warnCount}**`, inline: true },
                    { name: "📝 Pense-bêtes", value: `**${data.notes.length}**`, inline: true },
                    { name: "📅 Arrivée", value: `<t:${Math.floor(guild.members.cache.get(target.id)?.joinedTimestamp / 1000)}:R>`, inline: false }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`view_warns_${target.id}`).setLabel('Détails Warns (+)').setStyle(ButtonStyle.Primary).setDisabled(data.warnCount === 0),
                new ButtonBuilder().setCustomId(`view_notes_${target.id}`).setLabel('Pense-bêtes Staff').setStyle(ButtonStyle.Secondary).setDisabled(data.notes.length === 0)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- NOTE (PENSE-BÊTE) ---
        if (commandName === 'note') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply("❌ Staff uniquement.");
            const target = options.getUser('cible');
            const txt = options.getString('texte');

            if (!db.has(target.id)) db.set(target.id, { warnCount: 0, history: [], notes: [] });
            db.get(target.id).notes.push({ content: txt, mod: user.tag, date: new Date().toLocaleDateString() });

            return interaction.reply({ content: `✅ Note ajoutée sur le profil de **${target.tag}**.`, ephemeral: true });
        }

        // --- ABSENCE STAFF ---
        if (commandName === 'absence') {
            const r = options.getString('raison');
            const d = options.getString('durée');
            const staffRoles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r).join(' ') || "Aucun";

            const absEmbed = new EmbedBuilder()
                .setTitle("Récapitulatif d'absence - Validée")
                .setColor("#2b2d31")
                .addFields(
                    { name: "Utilisateur", value: `${user}`, inline: false },
                    { name: "Raison", value: r, inline: false },
                    { name: "Durée", value: d, inline: true },
                    { name: "Rôles", value: staffRoles, inline: false },
                    { name: "Traité par", value: `${client.user}`, inline: true }
                );
            return interaction.reply({ embeds: [absEmbed] });
        }

        // --- MESSAGE (SAY) ---
        if (commandName === 'message') {
            const titre = options.getString('titre');
            const texte = options.getString('contenu').replace(/\\n/g, '\n');
            const couleur = options.getString('couleur') || "#2b2d31";

            const msgEmbed = new EmbedBuilder().setTitle(titre).setDescription(texte).setColor(couleur.startsWith('#') ? couleur : "#2b2d31");
            await channel.send({ embeds: [msgEmbed] });
            return interaction.reply({ content: "✅ Envoyé.", ephemeral: true });
        }

        // --- FUN COMMANDS ---
        if (commandName === 'humeur') {
            const moods = ["Heureux ! 😊", "Un peu fatigué par le spam... 😴", "Prêt à bannir des gens ! 🔨", "Je me sens riche avec toutes ces factures 💰"];
            return interaction.reply(moods[Math.floor(Math.random() * moods.length)]);
        }

        if (commandName === 'pile_ou_face') {
            return interaction.reply(`C'est tombé sur : **${Math.random() > 0.5 ? "PILE" : "FACE"}** !`);
        }

        if (commandName === 'warn') {
            const target = options.getUser('cible');
            const reason = options.getString('raison');
            if (!db.has(target.id)) db.set(target.id, { warnCount: 0, history: [], notes: [] });
            const data = db.get(target.id);
            data.warnCount++;
            data.history.push({ reason, date: new Date().toLocaleString(), mod: user.tag });
            logToChannel("WARN", target, reason, user);
            return interaction.reply(`⚠️ ${target} a été averti.`);
        }

        if (commandName === 'setup') {
            const sub = options.getSubcommand();
            if (sub === 'logs') {
                settings.logChannel = options.getChannel('salon').id;
                return interaction.reply(`✅ Logs : <#${settings.logChannel}>`);
            }
        }
    }

    // --- GESTION DES BOUTONS ---
    if (interaction.isButton()) {
        const [id, type, targetId, val] = interaction.customId.split('_');
        
        // Détails Stats (Warns ou Notes)
        if (id === 'view') {
            const data = db.get(targetId);
            const content = type === 'warns' 
                ? data.history.map(h => `• ${h.reason} (par ${h.mod})`).join('\n')
                : data.notes.map(n => `• ${n.content} (${n.date})`).join('\n');
            
            const emb = new EmbedBuilder().setTitle(`Détails : ${type}`).setDescription(content || "Vide").setColor("#ffaa00");
            return interaction.reply({ embeds: [emb], ephemeral: true });
        }

        // Factures
        if (id === 'fact') {
            const seller = await client.users.fetch(targetId);
            if (type === 'ok') {
                await interaction.update({ content: `✅ Contrat signé !`, embeds: [], components: [] });
                logToChannel("💰 VENTE IMMO", interaction.user, `A payé **${val}€** à ${seller.tag}`);
                try { await seller.send(`💰 ${interaction.user.tag} a signé le contrat de **${val}€** !`); } catch(e){}
            } else {
                await interaction.update({ content: "❌ Offre refusée.", embeds: [], components: [] });
            }
        }
    }
});

// --- 6. AUTO-MOD & FUN EVENTS ---
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot) return;

    // Anti-Pub
    if (msg.content.includes("discord.gg/")) {
        await msg.delete().catch(() => {});
        return msg.channel.send(`Pas de pub ici ${msg.author} !`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // easter egg
    if (msg.content.toLowerCase() === "ça va bot ?") {
        msg.reply("Tranquille, je regarde les factures passer ! 💸");
    }
});

// --- 7. LOGS FUNCTION ---
async function logToChannel(title, target, reason, mod = "Système") {
    if (!settings.logChannel) return;
    const chan = await client.channels.fetch(settings.logChannel).catch(() => null);
    if (!chan) return;

    const logEmb = new EmbedBuilder()
        .setTitle(`🛡️ LOG : ${title}`)
        .addFields(
            { name: "Utilisateur", value: `${target.tag || target}`, inline: true },
            { name: "Responsable", value: `${mod.tag || mod}`, inline: true },
            { name: "Détails", value: reason }
        ).setTimestamp().setColor("#e74c3c");
    await chan.send({ embeds: [logEmb] });
}

client.login(process.env.TOKEN);
