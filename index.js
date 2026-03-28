const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, Collection
} = require('discord.js');
const http = require('http');
const fs = require('fs');
const axios = require('axios');

// --- 1. BASE DE DONNÉES MAÎTRESSE ---
const DB_PATH = './paradise_master_v7.json';
let db = {
    config: { 
        logs: null, welcome: null, ticketCat: null, staff: null,
        ai_prompt: "Tu es l'assistant suprême de Paradise RP. Tu es sérieux, immersif et tu connais parfaitement les règles du serveur.",
        antiRaid: true, antiInsulte: true,
        gifs: {
            ban: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/3o7TKVUn7iM8FMEU24/giphy.gif",
            warn: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/6BZaFXBVPBnoQ/giphy.gif",
            welcome: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/3o7TKMGpxP5P90bQxq/giphy.gif",
            clear: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/3o7TKMGpxP5P90bQxq/giphy.gif",
            facture: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/LdOyjZ7TC5K3LghXYf/giphy.gif"
        }
    },
    users: {}
};
if (fs.existsSync(DB_PATH)) db = JSON.parse(fs.readFileSync(DB_PATH));
const save = () => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

// --- 2. INITIALISATION ---
const client = new Client({ intents: 3276799 });
http.createServer((req, res) => { res.write("Paradise Omni-Engine V7: ONLINE"); res.end(); }).listen(process.env.PORT || 10000);

// --- 3. COMMANDES (LA TOTALE) ---
const commands = [
    // --- SETUPS ---
    new SlashCommandBuilder().setName('setup-global').setDescription('⚙️ Configurer tous les salons en une fois'),
    new SlashCommandBuilder().setName('setup-gif').setDescription('🖼️ Modifier les images du bot').addStringOption(o => o.setName('action').setRequired(true).addChoices({name:'Ban',value:'ban'},{name:'Warn',value:'warn'},{name:'Facture',value:'facture'},{name:'Welcome',value:'welcome'})).addStringOption(o => o.setName('url').setRequired(true)),
    new SlashCommandBuilder().setName('ia-config').setDescription('🧠 [ADMIN] Voir/Modifier le prompt de l\'IA').addStringOption(o => o.setName('nouveau_prompt').setRequired(false)),
    
    // --- MODÉRATION ---
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Sanctionner un joueur').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannissement définitif').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('🧹 Nettoyage de zone').addIntegerOption(o => o.setName('nombre').setRequired(true)),
    new SlashCommandBuilder().setName('lock').setDescription('🔒 Verrouiller le salon'),
    
    // --- IA & FUN ---
    new SlashCommandBuilder().setName('ask').setDescription('🤖 Question à l\'IA Mistral (Gratuit)').addStringOption(o => o.setName('question').setRequired(true)),
    new SlashCommandBuilder().setName('8ball').setDescription('🎱 Boule magique').addStringOption(o => o.setName('question').setRequired(true)),
    new SlashCommandBuilder().setName('pile-ou-face').setDescription('🪙 Lancer une pièce'),
    new SlashCommandBuilder().setName('humeur').setDescription('🎭 État du bot'),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Voir l\'avatar d\'un membre').addUserOption(o => o.setName('cible')),

    // --- RP & INFOS ---
    new SlashCommandBuilder().setName('stats').setDescription('📊 Dossier judiciaire complet').addUserOption(o => o.setName('cible')),
    new SlashCommandBuilder().setName('facture').setDescription('🏠 Contrat Immobilier (TVA 20%)').addUserOption(o => o.setName('client').setRequired(true)).addNumberOption(o => o.setName('prix_ht').setRequired(true)).addStringOption(o => o.setName('objet').setRequired(true)),
    new SlashCommandBuilder().setName('absence').setDescription('💤 Déclarer une absence staff').addStringOption(o => o.setName('raison').setRequired(true)).addStringOption(o => o.setName('durée').setRequired(true)),
    new SlashCommandBuilder().setName('server-info').setDescription('ℹ️ État du serveur Paradise'),
    new SlashCommandBuilder().setName('message').setDescription('📝 Créer une annonce (Modal /say)')
].map(c => c.toJSON());

// --- 4. MOTEUR IA MISTRAL (GRATUIT) ---
async function askMistral(question) {
    try {
        const response = await axios.post(
            "https://api-inference.huggingface.co/models/MistralAI/Mistral-7B-Instruct-v0.2",
            { inputs: `<s>[INST] ${db.config.ai_prompt} \nQuestion: ${question} [/INST]` },
            { headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` } }
        );
        return response.data[0].generated_text.split('[/INST]')[1] || "Je réfléchis...";
    } catch (e) { return "❌ Erreur : Vérifie ton HF_TOKEN dans les variables d'environnement."; }
}

// --- 5. LOGIQUE DES INTERACTIONS ---
client.on(Events.InteractionCreate, async i => {
    if (i.isChatInputCommand()) {
        // ANTI-CRASH : On diffère systématiquement
        if (i.commandName !== 'message') await i.deferReply();

        const { commandName, options, guild, user, member, channel } = i;

        // --- ADMIN : IA CONFIG ---
        if (commandName === 'ia-config') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return i.editReply("❌ Accès réservé aux fondateurs.");
            const newP = options.getString('nouveau_prompt');
            if (newP) { db.config.ai_prompt = newP; save(); }
            const emb = new EmbedBuilder().setTitle("🧠 Configuration Cerveau Paradise").addFields({name: "Prompt Actuel", value: `\`\`\`${db.config.ai_prompt}\`\`\``}).setColor("#9b59b6");
            return i.editReply({ embeds: [emb] });
        }

        // --- IA ASK ---
        if (commandName === 'ask') {
            const reply = await askMistral(options.getString('question'));
            return i.editReply(`**🤖 Paradise IA :**\n${reply}`);
        }

        // --- FUN ---
        if (commandName === '8ball') {
            const r = ["Oui", "Non", "C'est certain", "Peu probable", "Demande à ton chef"];
            return i.editReply(`🎱 | **${r[Math.floor(Math.random()*r.length)]}**`);
        }
        if (commandName === 'pile-ou-face') {
            const side = Math.random() > 0.5 ? "Pile 🪙" : "Face 🪙";
            return i.editReply(`Le résultat est : **${side}**`);
        }

        // --- MODÉRATION ---
        if (commandName === 'warn') {
            const target = options.getUser('cible');
            if (!db.users[target.id]) db.users[target.id] = { warns: 0, history: [] };
            db.users[target.id].warns++;
            db.users[target.id].history.push({reason: options.getString('raison'), date: new Date().toLocaleDateString()});
            save();
            const emb = new EmbedBuilder().setTitle("⚠️ Sanction").setImage(db.config.gifs.warn).setDescription(`${target} a reçu un avertissement pour : ${options.getString('raison')}`).setColor("#f1c40f");
            return i.editReply({ embeds: [emb] });
        }

        if (commandName === 'clear') {
            const n = options.getInteger('nombre');
            await channel.bulkDelete(n > 100 ? 100 : n);
            const emb = new EmbedBuilder().setTitle("🧹 Nettoyage").setImage(db.config.gifs.clear).setDescription(`Zone nettoyée : ${n} messages supprimés.`);
            return i.editReply({ embeds: [emb] });
        }

        // --- RP & INFOS ---
        if (commandName === 'facture') {
            const ht = options.getNumber('prix_ht');
            const ttc = ht * 1.20;
            const emb = new EmbedBuilder().setTitle("🏠 CONTRAT IMMOBILIER").setImage(db.config.gifs.facture).setColor("#2ecc71")
                .addFields({name: "📍 Bien", value: options.getString('objet')}, {name: "💰 Total TTC (TVA 20%)", value: `**${ttc.toLocaleString()}€**`});
            return i.editReply({ embeds: [emb] });
        }

        if (commandName === 'server-info') {
            const emb = new EmbedBuilder().setTitle(`ℹ️ Paradise OS : ${guild.name}`).setThumbnail(guild.iconURL())
                .addFields({name: "Membres", value: `👥 ${guild.memberCount}`, inline: true}, {name: "Boosts", value: `💎 ${guild.premiumSubscriptionCount}`, inline: true})
                .setColor("#3498db");
            return i.editReply({ embeds: [emb] });
        }

        // --- MESSAGE (SAY MODAL) ---
        if (commandName === 'message') {
            const modal = new ModalBuilder().setCustomId('say_mod').setTitle('Annonce Paradise');
            const t = new TextInputBuilder().setCustomId('ti').setLabel('Titre').setStyle(TextInputStyle.Short);
            const d = new TextInputBuilder().setCustomId('de').setLabel('Message').setStyle(TextInputStyle.Paragraph);
            modal.addComponents(new ActionRowBuilder().addComponents(t), new ActionRowBuilder().addComponents(d));
            await i.showModal(modal);
        }
    }

    // Gestion Modal
    if (i.isModalSubmit() && i.customId === 'say_mod') {
        const emb = new EmbedBuilder().setTitle(i.fields.getTextInputValue('ti')).setDescription(i.fields.getTextInputValue('de')).setColor("#2b2d31").setFooter({text: "Annonce Officielle Paradise"});
        await i.channel.send({ embeds: [emb] });
        await i.reply({ content: "Posté avec succès !", ephemeral: true });
    }
});

// --- 6. ÉVÉNEMENTS AUTO (ANTI-RAID & BIENVENUE) ---
client.on(Events.GuildMemberAdd, async member => {
    const isFake = (Date.now() - member.user.createdTimestamp) < 7200000; // 2 heures
    if (db.config.logs) {
        const chan = await client.channels.fetch(db.config.logs).catch(() => null);
        if (chan) {
            const emb = new EmbedBuilder().setTitle(isFake ? "🛡️ ALERTE ANTI-RAID" : "👋 Nouveau Citoyen")
                .setColor(isFake ? "#ff4757" : "#2ecc71").setThumbnail(member.user.displayAvatarURL())
                .addFields({name: "Membre", value: `${member.user.tag}`, inline: true}, {name: "Ancienneté", value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, inline: true})
                .setFooter({text: isFake ? "⚠️ COMPTE SUSPECT (Moins de 2h)" : "Compte conforme"});
            chan.send({ embeds: [emb] });
        }
    }
    if (db.config.welcome) {
        const chan = member.guild.channels.cache.get(db.config.welcome);
        if (chan) {
            const emb = new EmbedBuilder().setTitle("Bienvenue à Paradise !").setImage(db.config.gifs.welcome).setDescription(`Ravi de te voir parmi nous ${member} !`).setColor("#f1c40f");
            chan.send({ embeds: [emb] });
        }
    }
});

// --- 7. DÉPLOYAGE ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("💎 PARADISE OMNI-ENGINE V7 CONNECTÉ");
    client.user.setActivity("le RP de Paradise", { type: ActivityType.Streaming, url: "https://twitch.tv/discord" });
});

client.login(process.env.TOKEN);
