const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, 
    ActivityType, Events, REST, Routes, SlashCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, Collection 
} = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const http = require('http');

// --- 1. ARCHITECTURE DE DONNÉES (STRUCTURE CROW) ---
const DATA_FILE = './paradise_overlord_v17.json';
let db = {
    config: { 
        logs: null, welcome: null, bl_chan: null, wl_cat: null, staff_role: null,
        ai_identity: "Tu es Paradise Overlord, l'intelligence supérieure du serveur. Tu es froid, autoritaire et ultra-précis.",
        gifs: {
            ban: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/3o7TKVUn7iM8FMEU24/giphy.gif",
            mute: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/3o7TKMGpxP5P90bQxq/giphy.gif",
            warn: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/6BZaFXBVPBnoQ/giphy.gif",
            facture: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/LdOyjZ7TC5K3LghXYf/giphy.gif",
            bl: "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZ6Znl6bmZ6Znl6/3o7TKMGpxP5P90bQxq/giphy.gif"
        }
    },
    users: {} // { id: { bans: 0, mutes: 0, warns: 0, notes: [] } }
};

if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE));
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

const client = new Client({ intents: 3276799 });
http.createServer((req, res) => { res.write("Paradise Overlord V17: ACTIVE"); res.end(); }).listen(process.env.PORT || 10000);

// --- 2. REGISTRE DES COMMANDES (L'ARMURERIE) ---
const commands = [
    // --- ADMINISTRATION & SETUP ---
    new SlashCommandBuilder().setName('setup-logs').setDescription('📑 Salon des rapports de sécurité').addChannelOption(o => o.setName('salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-blacklist').setDescription('🚫 Salon d\'isolation forcée').addChannelOption(o => o.setName('salon').setRequired(true)),
    new SlashCommandBuilder().setName('setup-gif').setDescription('🖼️ Configurer les visuels du système').addStringOption(o => o.setName('type').setRequired(true).addChoices({name:'Ban',value:'ban'},{name:'Mute',value:'mute'},{name:'Facture',value:'facture'})).addStringOption(o => o.setName('url').setRequired(true)),
    
    // --- MODÉRATION RADICALE ---
    new SlashCommandBuilder().setName('ban').setDescription('🔨 Bannissement définitif du sujet').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('🔇 Museler un utilisateur (Timeout)').addUserOption(o => o.setName('cible').setRequired(true)).addIntegerOption(o => o.setName('minutes').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Notification d\'avertissement').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('bl').setDescription('🚫 Blacklist : Isolation immédiate').addUserOption(o => o.setName('cible').setRequired(true)).addStringOption(o => o.setName('raison').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('🧹 Purge chirurgicale des messages').addIntegerOption(o => o.setName('nb').setRequired(true)),

    // --- DOSSIERS & INTELLIGENCE ---
    new SlashCommandBuilder().setName('stats').setDescription('📊 Accéder au casier judiciaire complet').addUserOption(o => o.setName('cible')),
    new SlashCommandBuilder().setName('ask').setDescription('🤖 Interroger l\'IA Mistral Pro').addStringOption(o => o.setName('q').setRequired(true)),
    
    // --- BUSINESS ---
    new SlashCommandBuilder().setName('facture').setDescription('🧾 Générer un reçu de transaction (TVA 20%)').addUserOption(o => o.setName('client').setRequired(true)).addNumberOption(o => o.setName('ht').setRequired(true)).addStringOption(o => o.setName('objet').setRequired(true)),
    
    // --- TOOLS ---
    new SlashCommandBuilder().setName('message').setDescription('📝 Créer un Embed stylisé (SAY)')
].map(c => c.toJSON());

// --- 3. MOTEUR IA MISTRAL (DYNAMIQUE) ---
async function askMistral(q) {
    try {
        const response = await axios.post("https://api-inference.huggingface.co/models/MistralAI/Mistral-7B-Instruct-v0.2",
            { inputs: `<s>[INST] ${db.config.ai_identity} \nQuestion: ${q} [/INST]` },
            { headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` } });
        return response.data[0].generated_text.split('[/INST]')[1] || "Analyse terminée. Aucune réponse cohérente.";
    } catch (e) { return "⚠️ Liaison IA interrompue. Vérifiez la clé API."; }
}

// --- 4. GESTION DES INTERACTIONS (PERFORMANCE) ---
client.on(Events.InteractionCreate, async i => {
    if (i.isChatInputCommand()) {
        if (i.commandName !== 'message') await i.deferReply();
        const { commandName, options, guild, member, user, channel } = i;

        // --- MODULE BAN ---
        if (commandName === 'ban') {
            const target = options.getUser('cible');
            const raison = options.getString('raison');
            if (!db.users[target.id]) db.users[target.id] = { bans: 0, mutes: 0, warns: 0 };
            db.users[target.id].bans++; save();

            await guild.members.ban(target.id, { reason: raison }).catch(() => {});
            const emb = new EmbedBuilder().setTitle("🔨 EXÉCUTION : BANNISSEMENT").setColor("#ff0000").setImage(db.config.gifs.ban)
                .addFields({name: "Sujet", value: `${target.tag}`, inline: true}, {name: "Raison", value: raison, inline: true}, {name: "Total Bans", value: `\`${db.users[target.id].bans}\``, inline: true});
            return i.editReply({ embeds: [emb] });
        }

        // --- MODULE MUTE ---
        if (commandName === 'mute') {
            const target = options.getMember('cible');
            const min = options.getInteger('minutes');
            if (!db.users[target.id]) db.users[target.id] = { bans: 0, mutes: 0, warns: 0 };
            db.users[target.id].mutes++; save();

            await target.timeout(min * 60000, options.getString('raison'));
            const emb = new EmbedBuilder().setTitle("🔇 MESURE DISCIPLINAIRE : MUTE").setColor("#f1c40f").setImage(db.config.gifs.mute)
                .addFields({name: "Sujet", value: `${target}`, inline: true}, {name: "Durée", value: `${min}m`, inline: true}, {name: "Récidives", value: `\`${db.users[target.id].mutes}\``, inline: true});
            return i.editReply({ embeds: [emb] });
        }

        // --- MODULE STATS (CASIER) ---
        if (commandName === 'stats') {
            const target = options.getUser('cible') || user;
            const u = db.users[target.id] || { bans: 0, mutes: 0, warns: 0 };
            const emb = new EmbedBuilder()
                .setTitle(`📊 ARCHIVES JUDICIAIRES : ${target.username.toUpperCase()}`)
                .setColor("#2b2d31").setThumbnail(target.displayAvatarURL())
                .setDescription(`Historique complet des interactions disciplinaires enregistrées pour ce sujet.`)
                .addFields(
                    { name: '┃ 🔨 Bans', value: `\`${u.bans}\``, inline: true },
                    { name: '┃ 🔇 Mutes', value: `\`${u.mutes}\``, inline: true },
                    { name: '┃ ⚠️ Warns', value: `\`${u.warns}\``, inline: true }
                ).setFooter({ text: "Paradise Overlord System • Section Archives" });
            return i.editReply({ embeds: [emb] });
        }

        // --- MODULE FACTURE ---
        if (commandName === 'facture') {
            const ttc = options.getNumber('ht') * 1.20;
            const emb = new EmbedBuilder().setTitle("🧾 REÇU DE TRANSACTION").setColor("#2ecc71").setImage(db.config.gifs.facture)
                .addFields(
                    { name: '👤 Client', value: `${options.getUser('client')}`, inline: true },
                    { name: '📦 Objet', value: options.getString('objet'), inline: true },
                    { name: '💰 Total TTC', value: `**${ttc.toLocaleString()}€**` }
                ).setFooter({ text: "Certifié par Paradise Business" });
            return i.editReply({ embeds: [emb] });
        }

        // --- MODULE IA ASK ---
        if (commandName === 'ask') {
            const result = await askMistral(options.getString('q'));
            return i.editReply(`**🤖 Réponse de l'IA Overlord :**\n\n${result}`);
        }
    }
});

// --- 5. INITIALISATION ---
client.once(Events.ClientReady, async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("💎 PARADISE OVERLORD V17 : CONNECTÉ ET OPÉRATIONNEL");
    client.user.setActivity("Surveiller le Secteur", { type: ActivityType.Watching });
});

client.login(process.env.TOKEN);
