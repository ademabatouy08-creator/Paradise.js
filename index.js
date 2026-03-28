const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const http = require('http');
const fs = require('fs');

// --- 1. MOTEUR DE DONNÉES (PERSISTANT) ---
const DB_PATH = './paradise_db.json';
let db = {
    config: {
        logs: null, staffRole: null, ticketCat: null, welcomeChan: null,
        welcomeGif: "https://i.ibb.co/L6Zz7nQ/welcome.gif",
        autoMod: true,
        thresholds: { mute: 3, kick: 5, ban: 10 }
    },
    users: {} // { userId: { warns: 0, bans: 0, mutes: 0, kicks: 0, history: [] } }
};

if (fs.existsSync(DB_PATH)) db = JSON.parse(fs.readFileSync(DB_PATH));
const saveDB = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

const client = new Client({ intents: 3276799 });
http.createServer((req, res) => { res.write("Paradise Ultimate Engine Online"); res.end(); }).listen(process.env.PORT || 10000);

// --- 2. REGISTRE DES COMMANDES ---
const commands = [
    // CONFIGURATION
    new SlashCommandBuilder().setName('setup').setDescription('⚙️ Configuration complète du serveur Paradise'),
    
    // MODÉRATION
    new SlashCommandBuilder().setName('stats').setDescription('📊 Dossier judiciaire complet').addUserOption(o => o.setName('cible').setDescription('Joueur à vérifier')),
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Sanctionner un joueur').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('🧹 Nettoyage industriel du chat').addIntegerOption(o => o.setName('nombre').setRequired(true)),
    
    // RP & IMMOBILIER
    new SlashCommandBuilder().setName('facture').setDescription('🏠 Vente Immobilière (Calcul TVA)').addUserOption(o => o.setName('client').setRequired(true)).addStringOption(o => o.setName('agence').setRequired(true)).addNumberOption(o => o.setName('prix_ht').setRequired(true)).addStringOption(o => o.setName('maison').setRequired(true)),
    new SlashCommandBuilder().setName('absence').setDescription('💤 Déclarer une absence staff').addStringOption(o => o.setName('raison').setRequired(true)).addStringOption(o => o.setName('durée').setRequired(true)),
    
    // COMMUNICATION
    new SlashCommandBuilder().setName('message').setDescription('📝 Créer une annonce pro (Modal)'),
    new SlashCommandBuilder().setName('ticket-panel').setDescription('📩 Installer le support ticket'),
].map(c => c.toJSON());

// --- 3. DÉMARRAGE ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`💎 PARADISE ULTIMATE : ${client.user.tag} est prêt.`);
    client.user.setActivity("veiller sur Paradise", { type: ActivityType.Watching });
});

// --- 4. GESTION DES INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    
    // --- COMMANDES SLASH ---
    if (interaction.isChatInputCommand()) {
        const { commandName, options, member, guild, user } = interaction;

        // DASHBOARD SETUP
        if (commandName === 'setup') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Réservé aux Fondateurs.", ephemeral: true });
            
            const emb = new EmbedBuilder()
                .setTitle("⚙️ Configuration Paradise Engine")
                .setDescription("Choisissez le module à configurer ci-dessous.")
                .addFields(
                    { name: "🛡️ Sécurité", value: db.config.autoMod ? "✅ Activée" : "❌ Désactivée", inline: true },
                    { name: "📜 Logs", value: db.config.logs ? `<#${db.config.logs}>` : "❌ Non défini", inline: true }
                ).setColor("#2b2d31");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('conf_logs').setLabel('Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
                new ButtonBuilder().setCustomId('conf_staff').setLabel('Rôle Staff').setStyle(ButtonStyle.Secondary).setEmoji('👮'),
                new ButtonBuilder().setCustomId('conf_welcome').setLabel('Bienvenue').setStyle(ButtonStyle.Secondary).setEmoji('👋'),
                new ButtonBuilder().setCustomId('conf_security').setLabel('Anti-Insulte').setStyle(ButtonStyle.Danger).setEmoji('🛡️')
            );
            return interaction.reply({ embeds: [emb], components: [row], ephemeral: true });
        }

        // STATS DÉTAILLÉES (BEAUTÉ MAXIMALE)
        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const u = db.users[target.id] || { warns: 0, bans: 0, mutes: 0, kicks: 0, history: [] };

            const statEmb = new EmbedBuilder()
                .setTitle(`📊 Dossier Judiciaire : ${target.username}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setColor(u.warns > 5 ? "#e74c3c" : "#3498db")
                .addFields(
                    { name: "⚠️ Avertissements", value: `\`${u.warns}\``, inline: true },
                    { name: "🔇 Mutes", value: `\`${u.mutes}\``, inline: true },
                    { name: "👞 Kicks", value: `\`${u.kicks}\``, inline: true },
                    { name: "🔨 Bannissements", value: `\`${u.bans}\``, inline: true },
                    { name: "📅 Ancienneté", value: `<t:${Math.floor(guild.members.cache.get(target.id)?.joinedTimestamp / 1000)}:R>`, inline: false }
                )
                .setFooter({ text: "Paradise Police Department" }).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`hist_${target.id}`).setLabel('Voir l\'Historique (+)').setStyle(ButtonStyle.Primary).setDisabled(u.history.length === 0)
            );
            return interaction.reply({ embeds: [statEmb], components: [row] });
        }

        // FACTURE IMMO
        if (commandName === 'facture') {
            const target = options.getUser('client');
            const ht = options.getNumber('prix_ht');
            const ttc = ht * 1.20;
            
            const factEmb = new EmbedBuilder()
                .setTitle(`🏠 CONTRAT DE VENTE - ${options.getString('agence')}`)
                .setColor("#2ecc71").setThumbnail("https://i.giphy.com/media/LdOyjZ7TC5K3LghXYf/giphy.gif")
                .setDescription(`Un nouveau contrat a été édité pour l'adresse :\n**${options.getString('maison')}**`)
                .addFields(
                    { name: "💰 Prix Net (HT)", value: `\`${ht.toLocaleString()}€\``, inline: true },
                    { name: "🏦 Taxes (20%)", value: `\`${(ht * 0.2).toLocaleString()}€\``, inline: true },
                    { name: "💎 MONTANT TTC", value: `**${ttc.toLocaleString()}€**` }
                )
                .setFooter({ text: "Calcul : Prix HT × 1,20 = Prix TTC" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pay_yes_${user.id}_${ttc}`).setLabel('Signer et Payer').setStyle(ButtonStyle.Success).setEmoji('🖋️'),
                new ButtonBuilder().setCustomId('pay_no').setLabel('Refuser l\'offre').setStyle(ButtonStyle.Danger)
            );
            await target.send({ embeds: [factEmb], components: [row] }).catch(() => {});
            return interaction.reply({ content: `✅ Contrat envoyé à ${target.username}.`, ephemeral: true });
        }

        // MESSAGE MODAL
        if (commandName === 'message') {
            const modal = new ModalBuilder().setCustomId('m_say').setTitle('Créateur d\'Annonce Paradise');
            const tInput = new TextInputBuilder().setCustomId('t').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true);
            const cInput = new TextInputBuilder().setCustomId('c').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true);
            const iInput = new TextInputBuilder().setCustomId('i').setLabel('URL Image/GIF').setStyle(TextInputStyle.Short).setRequired(false);
            
            modal.addComponents(new ActionRowBuilder().addComponents(tInput), new ActionRowBuilder().addComponents(cInput), new ActionRowBuilder().addComponents(iInput));
            await interaction.showModal(modal);
        }

        // ABSENCE
        if (commandName === 'absence') {
            const absEmb = new EmbedBuilder()
                .setTitle("📋 Absence Staff Validée")
                .setColor("#2b2d31")
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: "Membre", value: `${user}`, inline: true },
                    { name: "Durée", value: options.getString('durée'), inline: true },
                    { name: "Motif", value: options.getString('raison') }
                );
            return interaction.reply({ embeds: [absEmb] });
        }

        // WARN
        if (commandName === 'warn') {
            const target = options.getUser('cible');
            const raison = options.getString('raison');
            await applySanction(target, raison, user, guild);
            return interaction.reply({ content: `⚠️ Sanction appliquée à ${target.tag}.`, ephemeral: true });
        }
    }

    // --- GESTION DES MODALS ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'm_say') {
            const t = interaction.fields.getTextInputValue('t');
            const c = interaction.fields.getTextInputValue('c');
            const i = interaction.fields.getTextInputValue('i');
            const emb = new EmbedBuilder().setTitle(t).setDescription(c).setColor("#2b2d31");
            if (i) emb.setImage(i);
            await interaction.channel.send({ embeds: [emb] });
            await interaction.reply({ content: "✅ Envoyé !", ephemeral: true });
        }
    }

    // --- GESTION DES BOUTONS ---
    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        
        if (parts[0] === 'hist') {
            const data = db.users[parts[1]];
            const emb = new EmbedBuilder().setTitle("📜 Historique Détaillé").setColor("#f1c40f")
                .setDescription(data.history.map((h, i) => `**#${i+1}** [${h.type}] - ${h.reason} *(le ${h.date})*`).join('\n'));
            return interaction.reply({ embeds: [emb], ephemeral: true });
        }

        if (parts[0] === 'pay') {
            const sender = await client.users.fetch(parts[2]);
            if (parts[1] === 'yes') {
                await interaction.update({ content: `✅ Vous avez signé pour **${parts[3]}€** !`, embeds: [], components: [] });
                logAction("💰 PAIEMENT", `${interaction.user.tag} a payé **${parts[3]}€** à ${sender.tag}`);
                try { await sender.send(`💰 **Paiement reçu !** ${interaction.user.tag} a signé pour ${parts[3]}€.`); } catch(e){}
            } else {
                await interaction.update({ content: "❌ Offre refusée.", embeds: [], components: [] });
            }
        }
    }
});

// --- 5. LOGIQUE DE SANCTION AUTOMATIQUE ---
async function applySanction(target, reason, moderator, guild) {
    if (!db.users[target.id]) db.users[target.id] = { warns: 0, bans: 0, mutes: 0, kicks: 0, history: [] };
    const u = db.users[target.id];

    u.warns++;
    u.history.push({ type: "WARN", reason, mod: moderator.tag, date: new Date().toLocaleDateString() });

    // Seuil de Mute
    if (u.warns === db.config.thresholds.mute) {
        u.mutes++;
        const member = guild.members.cache.get(target.id);
        if (member) await member.timeout(24 * 60 * 60 * 1000, "Seuil de warns atteint").catch(() => {});
        logAction("🔇 AUTO-MUTE", `${target.tag} a été mute (3 warns).`);
    }

    // Seuil de Kick
    if (u.warns === db.config.thresholds.kick) {
        u.kicks++;
        const member = guild.members.cache.get(target.id);
        if (member) await member.kick("Seuil de 5 warns atteint").catch(() => {});
        logAction("👞 AUTO-KICK", `${target.tag} a été kick (5 warns).`);
    }

    // Seuil de Ban
    if (u.warns >= db.config.thresholds.ban) {
        u.bans++;
        guild.members.ban(target.id, { reason: "Seuil de 10 warns atteint" }).catch(() => {});
        logAction("🔨 AUTO-BAN", `${target.tag} a été banni définitivement.`);
    }

    saveDB();
    logAction("⚠️ WARN", `${target.tag} sanctionné par ${moderator.tag} pour : ${reason}`);
}

// --- 6. AUTO-MOD (AUTO-WARN) ---
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !db.config.autoMod) return;
    const insultes = ["fdp", "salope", "pute", "connard", "nique"];
    if (insultes.some(i => msg.content.toLowerCase().includes(i))) {
        await msg.delete().catch(() => {});
        await applySanction(msg.author, "Langage inapproprié (Auto-Mod)", client.user, msg.guild);
        msg.channel.send(`⚠️ ${msg.author}, les insultes sont interdites. **Avertissement automatique ajouté.**`).then(m => setTimeout(() => m.delete(), 5000));
    }
});

// --- 7. FONCTION LOGS ---
async function logAction(title, desc) {
    if (!db.config.logs) return;
    const chan = await client.channels.fetch(db.config.logs).catch(() => null);
    if (chan) {
        const emb = new EmbedBuilder().setTitle(title).setDescription(desc).setColor("#e74c3c").setTimestamp();
        chan.send({ embeds: [emb] });
    }
}

client.login(process.env.TOKEN);
