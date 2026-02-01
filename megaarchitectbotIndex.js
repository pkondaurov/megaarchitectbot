'use strict';
//📢📢📢 MegaArchitectBot — Бот-архитектор для управления экосистемой ботов

const lib = process.env.NODE_ENV === 'production'
    ? require('libBotUtiletes')
    : require('../libBotUtilites/libBotUtilitesIndex.js');

const dbConnect = require('./dbconnect.json');

//region ===================== ИНИЦИАЛИЗАЦИЯ =====================

const vBotConfig = {
    glBotUserName: 'megaarchitectbot',
    schema: 'megaarchitect',
    dbConnect: dbConnect,
    onStart: onStart,
    cbLcAddProcessCommand: lcAddProcessCommand,
    cbLcSubstituteVars: lcSubstituteVars,
    cbLcSaveTaskToDb: lcSaveTaskToDb,
    cbLcPrepareQuestionStep: lcPrepareQuestionStep,
    cbLcActBeforeAssign: lcActBeforeAssign,
    cbLcGetFullInfoExtra: lcGetFullInfoExtra,
};

let glArr = lib.libCreateBotInstance(vBotConfig);

//endregion

//region ===================== СТАРТ =====================

async function onStart() {
    try {
        await lib.libInitBot(glArr);
        lcRegisterHandlers();
        await lcRefresh();
        await glArr.glBot.startPolling();
        console.log(`✅ ${glArr.glBotUserName} запущен (${glArr.glIsProd ? 'PROD' : 'TEST'})`);
    } catch (err) {
        console.error('❌ Ошибка запуска:', err);
        process.exit(1);
    }//
}//onStart

async function lcRefresh() {
    await lib.libRefresh(glArr);
    // Локальные данные
    glArr.glManagedBots = await glArr.glKnex('managed_bots').select('*').orderBy('id');
    glArr.glFieldTypes = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_savescenario`)
        .distinct('fieldtype')
        .whereNotNull('fieldtype')
        .orderBy('fieldtype');
}//lcRefresh

function lcRegisterHandlers() {
    glArr.glBot.on('message', async (msg) => {
        await lib.libEnqueueMessage(glArr, msg);
    });

    glArr.glBot.on('callback_query', async (cbq) => {
        await lib.libEnqueueMessage(glArr, cbq);
    });

    glArr.glBot.on('polling_error', (err) => {
        console.error('Polling error:', err.message);
    });
}//lcRegisterHandlers

//endregion

//region ===================== ОБРАБОТКА КОМАНД =====================

async function lcAddProcessCommand(glArr, vCmd, vParam, msg) {
    let vTaskType = null;
    let vTaskName = null;

    switch (vCmd) {
        case '/newbot':
            vTaskType = 'createBot';
            vTaskName = 'Создание нового бота';
            break;
        case '/newcmd':
            vTaskType = 'createCommand';
            vTaskName = 'Создание новой команды';
            break;
        case '/genprompt':
            vTaskType = 'generatePrompt';
            vTaskName = 'Генерация промпта';
            break;
        case '/testplan':
            vTaskType = 'viewTestPlan';
            vTaskName = 'Просмотр тест-плана';
            break;
        case '/listbots':
            // Одноходовая команда
            await lcSendManagedBotsList(glArr, msg);
            return true;
        case '/listcmds':
            vTaskType = 'listCommands';
            vTaskName = 'Список команд бота';
            break;
        case '/refresh':
            await lcRefresh();
            await lib.libSendBigMessage(glArr, lib.libGetChatId(msg), '✅ Данные обновлены');
            return true;
        default:
            return false;
    }//switch

    if (vTaskType) {
        await lib.libCreateTask(glArr, msg, vTaskType, vTaskName);
        return true;
    }//

    return false;
}//lcAddProcessCommand

//endregion

//region ===================== ПОДГОТОВКА ШАГОВ =====================

async function lcPrepareQuestionStep(glArr, vTask) {
    const vStepName = vTask.currentScenarioStep?.stepname;

    // Выбор бота
    if (vStepName === 'target_bot') {
        const vBots = await glArr.glKnex('managed_bots').select('id', 'botusername');
        if (vBots.length === 0) {
            vTask.target_bot = false;
            await lib.libActualiseCurrentStep(glArr, vTask);
            return;
        }//
        vTask.currentScenarioStep.dynamicButtons = vBots.map(b => ({
            text: `@${b.botusername}`,
            callback_data: `btn_${b.id}`
        }));
    }//target_bot

    // Выбор команды бота
    if (vStepName === 'target_command' && vTask.target_bot) {
        const vBotId = parseInt(vTask.target_bot.replace('btn_', ''));
        const vCommands = await glArr.glKnex('managed_commands')
            .where('managed_bots_id', vBotId)
            .select('id', 'command');
        if (vCommands.length === 0) {
            vTask.target_command = false;
            await lib.libActualiseCurrentStep(glArr, vTask);
            return;
        }//
        vTask.currentScenarioStep.dynamicButtons = vCommands.map(c => ({
            text: `/${c.command}`,
            callback_data: `cmd_${c.id}`
        }));
    }//target_command

    // Выбор типа поля
    if (vStepName && vStepName.includes('fieldtype')) {
        vTask.currentScenarioStep.dynamicButtons = glArr.glFieldTypes.map(f => ({
            text: f.fieldtype,
            callback_data: `ftype_${f.fieldtype}`
        }));
    }//fieldtype

}//lcPrepareQuestionStep

//endregion

//region ===================== ДЕЙСТВИЯ ПЕРЕД ПРИСВОЕНИЕМ =====================

async function lcActBeforeAssign(glArr, msg, vTask) {
    // Пока без специальной логики
}//lcActBeforeAssign

//endregion

//region ===================== СОХРАНЕНИЕ В БД =====================

async function lcSaveTaskToDb(glArr, vTask) {
    const vBotUsersId = vTask.botUsersId;

    if (vTask.taskType === 'createBot') {
        await lcCreateNewBot(glArr, vTask);
    }//createBot

    if (vTask.taskType === 'createCommand') {
        await lcCreateNewCommand(glArr, vTask);
    }//createCommand

    if (vTask.taskType === 'generatePrompt') {
        await lcGenerateAndSendPrompt(glArr, vTask);
    }//generatePrompt

}//lcSaveTaskToDb

//endregion

//region ===================== СОЗДАНИЕ БОТА =====================

async function lcCreateNewBot(glArr, vTask) {
    const vChatId = vTask.chatId;
    const vBotUsername = vTask.botusername?.toLowerCase().replace('@', '');
    const vDescription = vTask.botdescription || '';
    const vTokenProd = vTask.bottoken_prod;
    const vTokenTest = vTask.bottoken_test;
    const vCreateGithub = vTask.github_create === 'btn_yes';
    const vDeployServer = vTask.server_deploy === 'btn_yes';

    try {
        // 1. Проверяем, не существует ли уже
        const vExisting = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
            .where('botusername', vBotUsername)
            .first();

        if (vExisting) {
            await lib.libSendBigMessage(glArr, vChatId, `❌ Бот @${vBotUsername} уже существует в lib_bots`);
            return;
        }//

        // 2. Получаем bot_id из Telegram
        const TelegramBot = require('node-telegram-bot-api');
        const tempBot = new TelegramBot(vTokenProd);
        const botInfo = await tempBot.getMe();
        const vBotTelegramId = botInfo.id;

        // 3. Создаём запись в lib_bots
        const vSecrets = {
            telegram: {
                prod: vTokenProd,
                test: vTokenTest || null
            },
            lib: {},
            lc: {}
        };

        const [vLibBotsId] = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
            .insert({
                botusername: vBotUsername,
                bottelegramid: vBotTelegramId,
                secrets: JSON.stringify(vSecrets),
                port: 3000 + Math.floor(Math.random() * 1000) // Случайный порт
            })
            .returning('id');

        // 4. Создаём схему в БД
        await glArr.glKnex.raw(`CREATE SCHEMA IF NOT EXISTS ${vBotUsername}`);

        // 5. Сохраняем в managed_bots
        const [vManagedBotId] = await glArr.glKnex('managed_bots')
            .insert({
                botusername: vBotUsername,
                lib_bots_id: vLibBotsId.id || vLibBotsId,
                createdby: vTask.botUsersId
            })
            .returning('id');

        // 6. Генерируем файлы
        const vFiles = lcGenerateBotSkeleton(vBotUsername, vDescription);

        let vResultMsg = `✅ Бот @${vBotUsername} создан!\n\n`;
        vResultMsg += `📋 lib_bots.id: ${vLibBotsId.id || vLibBotsId}\n`;
        vResultMsg += `📋 managed_bots.id: ${vManagedBotId.id || vManagedBotId}\n`;
        vResultMsg += `📋 Telegram ID: ${vBotTelegramId}\n`;
        vResultMsg += `📋 Схема БД: ${vBotUsername}\n\n`;

        // 7. Создаём репозиторий на GitHub (если нужно)
        if (vCreateGithub) {
            vResultMsg += `⏳ Создание GitHub репозитория...\n`;
            // TODO: Использовать mcp__github__create_repository
        }//

        // 8. Отправляем сгенерированные файлы
        await lib.libSendBigMessage(glArr, vChatId, vResultMsg);

        // Отправляем файлы как документы
        for (const file of vFiles) {
            await lib.libSendBigMessage(glArr, vChatId, `📄 **${file.name}**\n\`\`\`javascript\n${file.content.substring(0, 3000)}${file.content.length > 3000 ? '\n...(обрезано)' : ''}\n\`\`\``);
        }//for

    } catch (err) {
        await lib.libProcessError(glArr, err, vTask.msg, false, 'lcCreateNewBot');
    }//catch
}//lcCreateNewBot

function lcGenerateBotSkeleton(botUsername, description) {
    const vIndexName = `${botUsername}Index.js`;
    const vSchemaName = botUsername.replace('bot', '').replace('_', '');

    const vIndexContent = `'use strict';
//📢📢📢 ${botUsername} — ${description}

const lib = process.env.NODE_ENV === 'production'
    ? require('libBotUtiletes')
    : require('../libBotUtilites/libBotUtilitesIndex.js');

const dbConnect = require('./dbconnect.json');

//region ===================== ИНИЦИАЛИЗАЦИЯ =====================

const vBotConfig = {
    glBotUserName: '${botUsername}',
    schema: '${vSchemaName}',
    dbConnect: dbConnect,
    onStart: onStart,
    cbLcAddProcessCommand: lcAddProcessCommand,
    cbLcSubstituteVars: lcSubstituteVars,
    cbLcSaveTaskToDb: lcSaveTaskToDb,
    cbLcPrepareQuestionStep: lcPrepareQuestionStep,
    cbLcActBeforeAssign: lcActBeforeAssign,
    cbLcGetFullInfoExtra: lcGetFullInfoExtra,
};

let glArr = lib.libCreateBotInstance(vBotConfig);

//endregion

//region ===================== СТАРТ =====================

async function onStart() {
    try {
        await lib.libInitBot(glArr);
        lcRegisterHandlers();
        await lcRefresh();
        await glArr.glBot.startPolling();
        console.log(\`✅ \${glArr.glBotUserName} запущен (\${glArr.glIsProd ? 'PROD' : 'TEST'})\`);
    } catch (err) {
        console.error('❌ Ошибка запуска:', err);
        process.exit(1);
    }//
}//onStart

async function lcRefresh() {
    await lib.libRefresh(glArr);
    // TODO: Загрузка локальных данных
}//lcRefresh

function lcRegisterHandlers() {
    glArr.glBot.on('message', async (msg) => {
        await lib.libEnqueueMessage(glArr, msg);
    });

    glArr.glBot.on('callback_query', async (cbq) => {
        await lib.libEnqueueMessage(glArr, cbq);
    });

    glArr.glBot.on('polling_error', (err) => {
        console.error('Polling error:', err.message);
    });
}//lcRegisterHandlers

//endregion

//region ===================== ОБРАБОТКА КОМАНД =====================

async function lcAddProcessCommand(glArr, vCmd, vParam, msg) {
    // TODO: Обработка локальных команд
    return false;
}//lcAddProcessCommand

//endregion

//region ===================== ПОДГОТОВКА ШАГОВ =====================

async function lcPrepareQuestionStep(glArr, vTask) {
    // TODO: Динамические кнопки
}//lcPrepareQuestionStep

//endregion

//region ===================== ДЕЙСТВИЯ ПЕРЕД ПРИСВОЕНИЕМ =====================

async function lcActBeforeAssign(glArr, msg, vTask) {
    // TODO: Логика перед присвоением
}//lcActBeforeAssign

//endregion

//region ===================== СОХРАНЕНИЕ В БД =====================

async function lcSaveTaskToDb(glArr, vTask) {
    // TODO: Сохранение результатов задачи
}//lcSaveTaskToDb

//endregion

//region ===================== ПОДСТАНОВКА ПЕРЕМЕННЫХ =====================

async function lcSubstituteVars(glArr, vVariable, vBotUsersId) {
    // TODO: Локальные переменные
    return null;
}//lcSubstituteVars

//endregion

//region ===================== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ =====================

async function lcGetFullInfoExtra(glArr, vBotUsersId) {
    // TODO: Локальная информация для libGetFullInfo
    return null;
}//lcGetFullInfoExtra

//endregion

onStart();
`;

    const vPackageContent = `{
  "name": "${botUsername}",
  "version": "1.0.0",
  "description": "${description}",
  "main": "${vIndexName}",
  "scripts": {
    "start": "node ${vIndexName}",
    "dev": "NODE_ENV=development node ${vIndexName}"
  },
  "dependencies": {
    "libBotUtiletes": "github:pkondaurov/libBotUtilites"
  }
}`;

    const vGitignoreContent = `node_modules/
dbconnect.json
*.log
.idea/
.vscode/
`;

    return [
        { name: vIndexName, content: vIndexContent },
        { name: 'package.json', content: vPackageContent },
        { name: '.gitignore', content: vGitignoreContent }
    ];
}//lcGenerateBotSkeleton

//endregion

//region ===================== СОЗДАНИЕ КОМАНДЫ =====================

async function lcCreateNewCommand(glArr, vTask) {
    const vChatId = vTask.chatId;

    try {
        const vBotId = parseInt(vTask.target_bot?.replace('btn_', ''));
        const vBot = await glArr.glKnex('managed_bots').where('id', vBotId).first();

        if (!vBot) {
            await lib.libSendBigMessage(glArr, vChatId, '❌ Бот не найден');
            return;
        }//

        const vCommandName = vTask.command_name?.replace('/', '');
        const vTaskType = vTask.tasktype;
        const vDescription = vTask.command_description || '';

        // Сохраняем команду
        const [vCmdId] = await glArr.glKnex('managed_commands')
            .insert({
                managed_bots_id: vBotId,
                command: vCommandName,
                tasktype: vTaskType,
                description: vDescription,
                createdby: vTask.botUsersId
            })
            .returning('id');

        // TODO: Создание шагов в lib_savescenario
        // TODO: Генерация тест-плана
        // TODO: Генерация промпта

        let vResultMsg = `✅ Команда /${vCommandName} создана для @${vBot.botusername}\n\n`;
        vResultMsg += `📋 taskType: ${vTaskType}\n`;
        vResultMsg += `📋 managed_commands.id: ${vCmdId.id || vCmdId}\n\n`;
        vResultMsg += `⏳ Теперь добавьте шаги через /addstep или сгенерируйте промпт через /genprompt`;

        await lib.libSendBigMessage(glArr, vChatId, vResultMsg);

    } catch (err) {
        await lib.libProcessError(glArr, err, vTask.msg, false, 'lcCreateNewCommand');
    }//catch
}//lcCreateNewCommand

//endregion

//region ===================== ГЕНЕРАЦИЯ ПРОМПТОВ =====================

async function lcGenerateAndSendPrompt(glArr, vTask) {
    const vChatId = vTask.chatId;

    try {
        const vCmdId = parseInt(vTask.target_command?.replace('cmd_', ''));
        const vCommand = await glArr.glKnex('managed_commands').where('id', vCmdId).first();

        if (!vCommand) {
            await lib.libSendBigMessage(glArr, vChatId, '❌ Команда не найден');
            return;
        }//

        const vBot = await glArr.glKnex('managed_bots').where('id', vCommand.managed_bots_id).first();

        // Получаем шаги команды из lib_savescenario
        const vSteps = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_savescenario`)
            .where('botusername', vBot.botusername)
            .where('tasktype', vCommand.tasktype)
            .orderBy('ordernumber');

        const vPrompt = lcGenerateClaudePrompt(vBot.botusername, vCommand, vSteps);

        // Сохраняем промпт
        await glArr.glKnex('claude_prompts').insert({
            managed_commands_id: vCmdId,
            prompt_type: vTask.prompt_type || 'full_implementation',
            prompt_text: vPrompt
        });

        await lib.libSendBigMessage(glArr, vChatId, `📝 **Промпт для Claude Code:**\n\n${vPrompt}`);

    } catch (err) {
        await lib.libProcessError(glArr, err, vTask.msg, false, 'lcGenerateAndSendPrompt');
    }//catch
}//lcGenerateAndSendPrompt

function lcGenerateClaudePrompt(botUsername, command, steps) {
    let vPrompt = `## Задача: Реализовать команду /${command.command} для бота @${botUsername}\n\n`;
    vPrompt += `### Описание\n${command.description || 'Нет описания'}\n\n`;
    vPrompt += `### taskType: \`${command.tasktype}\`\n\n`;

    if (steps.length > 0) {
        vPrompt += `### Шаги сценария\n`;
        vPrompt += `| # | stepname | fieldtype | Вопрос |\n`;
        vPrompt += `|---|----------|-----------|--------|\n`;
        steps.forEach((s, i) => {
            vPrompt += `| ${i + 1} | ${s.stepname} | ${s.fieldtype || '-'} | ${(s.questiontext || '-').substring(0, 50)} |\n`;
        });
        vPrompt += `\n`;
    }//

    vPrompt += `### Что нужно реализовать\n\n`;
    vPrompt += `1. **lcPrepareQuestionStep** — если есть динамические кнопки:\n`;
    vPrompt += `\`\`\`javascript\nif (vTask.taskType === '${command.tasktype}' && vStepName === 'STEPNAME') {\n    // Загрузка данных для кнопок\n    vTask.currentScenarioStep.dynamicButtons = [...];\n}\n\`\`\`\n\n`;

    vPrompt += `2. **lcActBeforeAssign** — логика перед присвоением:\n`;
    vPrompt += `\`\`\`javascript\nif (vTask.taskType === '${command.tasktype}' && vTask.currentScenarioStep.stepname === 'STEPNAME') {\n    // Дозаполнение полей\n}\n\`\`\`\n\n`;

    vPrompt += `3. **lcSaveTaskToDb** — сохранение результатов:\n`;
    vPrompt += `\`\`\`javascript\nif (vTask.taskType === '${command.tasktype}') {\n    // Сохранение в БД\n}\n\`\`\`\n\n`;

    return vPrompt;
}//lcGenerateClaudePrompt

//endregion

//region ===================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====================

async function lcSendManagedBotsList(glArr, msg) {
    const vChatId = lib.libGetChatId(msg);
    const vBots = await glArr.glKnex('managed_bots')
        .leftJoin(`${glArr.glPgLibSchema}.lib_bots`, 'managed_bots.lib_bots_id', 'lib_bots.id')
        .select('managed_bots.*', 'lib_bots.bottelegramid');

    if (vBots.length === 0) {
        await lib.libSendBigMessage(glArr, vChatId, '📋 Нет управляемых ботов.\n\nИспользуйте /newbot для создания.');
        return;
    }//

    let vMsg = '📋 **Управляемые боты:**\n\n';
    for (const bot of vBots) {
        vMsg += `• @${bot.botusername}`;
        if (bot.github_repo) vMsg += ` [GitHub](${bot.github_repo})`;
        vMsg += `\n`;
    }//for

    vMsg += `\n/newbot — создать нового бота\n/newcmd — создать команду`;

    await lib.libSendBigMessage(glArr, vChatId, vMsg, { parse_mode: 'Markdown' });
}//lcSendManagedBotsList

async function lcSubstituteVars(glArr, vVariable, vBotUsersId) {
    // Локальные переменные
    return null;
}//lcSubstituteVars

async function lcGetFullInfoExtra(glArr, vBotUsersId) {
    const vManagedCount = await glArr.glKnex('managed_bots').count('id as cnt').first();
    const vCommandsCount = await glArr.glKnex('managed_commands').count('id as cnt').first();
    return `🤖 Ботов: ${vManagedCount?.cnt || 0} | Команд: ${vCommandsCount?.cnt || 0}`;
}//lcGetFullInfoExtra

//endregion

onStart();
