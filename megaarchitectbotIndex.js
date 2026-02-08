'use strict';
//📢📢📢 MegaArchitectBot — Бот-архитектор для управления экосистемой ботов

const lib = process.env.NODE_ENV === 'production'
    ? require('libBotUtiletes')
    : require('../libBotUtilites/libBotUtilitesIndex.js');

const fs = require('fs');
const { execSync } = require('child_process');
const dbConnect = require('./dbconnect.json');

//region ===================== ИНИЦИАЛИЗАЦИЯ =====================

const vBotConfig = {
    glBotUserName: 'megaarchitectbot',
    schema: 'megaarchitectbot',
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
}//lcRefresh

function lcRegisterHandlers() {
    glArr.glBot.on('message', async (msg) => {
        console.log('📨 MESSAGE:', msg.text || '[no text]', 'from:', msg.from?.id);
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

//⛅️⛅️⛅️ Локальная реализация библиотечных функций🔽🔽🔽
async function lcAddProcessCommand(cleanCommand, paramCommand, updMsg) {
    return await lib.libAddProcessCommand(glArr, cleanCommand, paramCommand, updMsg);
} //➕➕➕Обработка команд для этого бота
async function lcSubstituteVars(vVariable, vBotUsersId) {// 📢📢📢Переменные
    let vResult = null;

    if (vVariable === 'startwelcome') {
        const vTelegramId = await lib.libGetTelegramIdByBotUsersId(glArr, vBotUsersId);
        const vIsAdmin = glArr.glAdminList.includes(Number(vTelegramId));

        if (vIsAdmin) {
            vResult = `🛠 Добро пожаловать, Повелитель!\n\nДоступные команды:\n/newbot — создать нового бота\n/deletebot — удалить бота`;
        } else {
            vResult = `⚠️ Это служебный бот для администрирования.\n\nДоступ ограничен. Обратитесь к @pkondaurov`;
        }//
    }//startwelcome

    return vResult;
}// 📢📢📢Переменные
async function lcPrepareQuestionStep(vTask, vMsgValue) {
    console.log('❓ lcPrepareQuestionStep:', vTask.taskType, vTask.currentScenarioStep?.stepname);
    if (vTask.taskType === 'deleteBot') {
        if (vTask.currentScenarioStep?.stepname === 'choose_bot') {
            // Динамические кнопки - список ботов из lib_bots
            if (!vTask.currentScenarioStep.buttons) {
                vTask.currentScenarioStep.buttons = [];
            }
            const dbBots = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                .select('id', 'botusername')
                .orderBy('botusername');

            for (const bot of dbBots) {
                vTask.currentScenarioStep.buttons.push({
                    buttoncaption: `@${bot.botusername}`,
                    initcommand: bot.botusername
                });
            }//
        }//choose_bot
        else if (vTask.currentScenarioStep?.stepname === 'confirm1') {
            // Подставляем информацию о выбранном боте
            const vBotUsername = vTask.choose_bot;

            // Получаем информацию о боте
            const dbBot = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                .select('id', 'botusername', 'bottelegramid', 'port')
                .where('botusername', vBotUsername)
                .first();

            // Количество пользователей
            const dbUsers = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_botusers`)
                .count('id as cnt')
                .where('botusername', vBotUsername)
                .first();

            // Количество таблиц в схеме
            const dbTables = await glArr.glKnex.raw(`
                SELECT count(*) as cnt FROM information_schema.tables
                WHERE table_schema = ?`, [vBotUsername]);

            // Количество команд
            const dbCommands = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_cmdmessages`)
                .count('id as cnt')
                .where('botusername', vBotUsername)
                .first();

            // Количество сценариев
            const dbScenarios = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_savescenario`)
                .count('id as cnt')
                .where('botusername', vBotUsername)
                .first();

            const vBotInfo = `<b>🤖 Бот:</b> @${vBotUsername}
<b>📋 Telegram ID:</b> ${dbBot?.bottelegramid || 'N/A'}
<b>🔌 Порт:</b> ${dbBot?.port || 'N/A'}
<b>👥 Пользователей:</b> ${dbUsers?.cnt || 0}
<b>🗄️ Таблиц в схеме:</b> ${dbTables?.rows?.[0]?.cnt || 0}
<b>💬 Команд:</b> ${dbCommands?.cnt || 0}
<b>📝 Сценариев:</b> ${dbScenarios?.cnt || 0}`;

            vTask.currentScenarioStep.question = vTask.currentScenarioStep.question.replace('🔬botinfo🔬', vBotInfo);
        }//confirm1
    }//deleteBot
} //❓🆗❓ Добавление динамических кнопок и обработка вопроса шага перед отправкой пользователю
async function lcActBeforeAssign(updMsg, vTask) {
    console.log('☀️ lcActBeforeAssign:', vTask.taskType, vTask.currentScenarioStep?.stepname);
    const vCbqValue = lib.libGetUpdValue(updMsg, vTask); // Получаем значение из callback/message

    if (vTask.taskType === 'createBot' && vTask.currentScenarioStep?.stepname === 'use_shared_test') {
        if (vCbqValue === 'yes') {
            // Получаем токен общего тестового бота из любого существующего бота
            const dbBot = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                .select(glArr.glKnex.raw("secrets->'telegram'->>'test' as testtoken"))
                .whereRaw("secrets->'telegram'->>'test' IS NOT NULL")
                .first();

            if (dbBot?.testtoken) {
                vTask.bottoken_test = dbBot.testtoken;
                // Шаг bottoken_test будет пропущен, т.к. значение уже заполнено
            }//
        }//Подстановка токена общего тестового бота
    }//createBot use_shared_test
    else if (vTask.taskType === 'deleteBot') {
        // Если на любом шаге подтверждения нажали "Нет" — отменяем
        if ((vTask.currentScenarioStep?.stepname === 'confirm1' ||
             vTask.currentScenarioStep?.stepname === 'confirm2' ||
             vTask.currentScenarioStep?.stepname === 'confirm3') && vCbqValue === 'no') {
            await lib.libSendBigMessage(glArr, vTask.vChatId, '✅ Удаление отменено. Бот сохранён.');
            await lib.libDeleteTask(glArr, vTask);
            return false; //⛔ Прерываем обработку
        }//
        // Проверка пароля
        if (vTask.currentScenarioStep?.stepname === 'delete_password' && vCbqValue !== 'похудаляй') {
            await lib.libSendBigMessage(glArr, vTask.vChatId, '❌ Неверный пароль! Удаление отменено.');
            await lib.libDeleteTask(glArr, vTask);
            return false; //⛔ Прерываем обработку
        }//
    }//deleteBot
    return true; //❗ Обязательно возвращаем true для продолжения обработки
} //☀️☀️☀️🛃🛃🛃 Дозаполнение полей перед присвоением значения шагу
async function lcSaveTaskToDb(vTask) {
    if (vTask.taskType === 'createBot') {
        let vResultMsg = '🤖 <b>Создание бота</b>\n\n';

        try {
            const vTokenProd = vTask.bottoken_prod?.trim();
            const vTokenTest = vTask.bottoken_test?.trim();
            const vStartMessage = vTask.start_message || 'Добро пожаловать!';

            // ============ A. ВАЛИДАЦИЯ ТОКЕНА И ПОЛУЧЕНИЕ BOT INFO ============
            vResultMsg += '📡 Проверка токена... ';
            const TelegramBot = require('node-telegram-bot-api');
            const tempBot = new TelegramBot(vTokenProd);
            let vBotInfo;
            try {
                vBotInfo = await tempBot.getMe();
            } catch (err) {
                vResultMsg += '❌\n\n⚠️ Неверный токен прод-бота!';
                await lib.libSendBigMessage(glArr, vTask.vChatId, vResultMsg);
                return; //⛔
            }//
            const vBotTelegramId = vBotInfo.id;
            const vBotUsername = vBotInfo.username.toLowerCase();
            vResultMsg += `✅ @${vBotUsername} (ID: ${vBotTelegramId})\n`;

            // ============ B. LIB_BOTS — ПРОВЕРКА/СОЗДАНИЕ ============
            vResultMsg += '💾 lib_bots... ';
            let vLibBotsId;
            const vExistingBot = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                .where('botusername', vBotUsername)
                .first();

            if (vExistingBot) {
                vLibBotsId = vExistingBot.id;
                vResultMsg += `⏭️ уже есть (id: ${vLibBotsId})\n`;
            } else {
                const vMaxPort = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                    .max('port as maxport')
                    .first();
                const vNewPort = (vMaxPort?.maxport || 3000) + 1;

                const vSecrets = {
                    telegram: { prod: vTokenProd, test: vTokenTest || null },
                    lib: {},
                    lc: {}
                };

                const [vNewBot] = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                    .insert({
                        botusername: vBotUsername,
                        bottelegramid: vBotTelegramId,
                        port: vNewPort,
                        secrets: JSON.stringify(vSecrets)
                    })
                    .returning('id');
                vLibBotsId = vNewBot.id || vNewBot;
                vResultMsg += `✅ создан (id: ${vLibBotsId}, port: ${vNewPort})\n`;
            }//

            // ============ C. СХЕМА БД — ПРОВЕРКА/СОЗДАНИЕ ============
            vResultMsg += '🗄️ Схема БД... ';
            const vSchemaName = vBotUsername;
            const vSchemaExists = await glArr.glKnex.raw(
                `SELECT 1 FROM information_schema.schemata WHERE schema_name = ?`, [vSchemaName]
            );

            if (vSchemaExists.rows.length > 0) {
                vResultMsg += `⏭️ ${vSchemaName} уже есть\n`;
            } else {
                await glArr.glKnex.raw(`CREATE SCHEMA "${vSchemaName}"`);
                vResultMsg += `✅ ${vSchemaName} создана\n`;
            }//

            // ============ D. РАБОЧИЕ ГРУППЫ — ПРОВЕРКА/СОЗДАНИЕ ============
            vResultMsg += '👥 Рабочие группы...\n';
            const vGroupTypes = [
                { codename: 'glLogChatId', name: `Лог ${vBotUsername}` },
                { codename: 'glErrorChatId', name: `Ошибки ${vBotUsername}` },
                { codename: 'glSalesChatId', name: `Заявки ${vBotUsername}` },
                { codename: 'glTestLogChatId', name: `Тестлог ${vBotUsername}` },
                { codename: 'glStoreFilesChatId', name: `Файлы ${vBotUsername}` },
                { codename: 'glStoreTalksChatId', name: `Переписки ${vBotUsername}` },
            ];

            for (const vGroup of vGroupTypes) {
                const vExistingGroup = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_workgroups`)
                    .where('botusername', vBotUsername)
                    .where('codename', vGroup.codename)
                    .first();

                if (vExistingGroup?.telegramid) {
                    vResultMsg += `   ${vGroup.codename}: ⏭️\n`;
                    continue; //🛑
                }//

                try {
                    const vGroupResult = await lib.libCreateChatForBot(glArr, vGroup.name, 'Рабочая группа');

                    // Добавляем нового бота в группу (по username, не по ID)
                    await lib.libAddMembersToChat(glArr, vGroupResult.vChatId, [
                        { id: `@${vBotUsername}`, rank: 'Main Bot' },
                    ]);

                    if (vExistingGroup) {
                        await glArr.glKnex(`${glArr.glPgLibSchema}.lib_workgroups`)
                            .where('id', vExistingGroup.id)
                            .update({ telegramid: vGroupResult.vChatId });
                    } else {
                        await glArr.glKnex(`${glArr.glPgLibSchema}.lib_workgroups`)
                            .insert({
                                telegramid: vGroupResult.vChatId,
                                codename: vGroup.codename,
                                groupname: vGroup.name,
                                botusername: vBotUsername
                            });
                    }//

                    vResultMsg += `   ${vGroup.codename}: ✅\n`;
                } catch (err) {
                    vResultMsg += `   ${vGroup.codename}: ❌ ${err.message}\n`;
                }//
            }//for groups

            // ============ E. LIB_CMDMESSAGES — /START ============
            vResultMsg += '💬 /start... ';
            const vExistingStart = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_cmdmessages`)
                .where('botusername', vBotUsername)
                .where('initcommand', '/start')
                .first();

            if (vExistingStart) {
                vResultMsg += '⏭️\n';
            } else {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_cmdmessages`)
                    .insert({
                        botusername: vBotUsername,
                        initcommand: '/start',
                        textmessage: vStartMessage
                    });
                vResultMsg += '✅\n';
            }//

            // ============ F. GITHUB + ДЕПЛОЙ ============
            const vRepoName = vBotUsername;
            const vOwner = 'pkondaurov';
            const vRepoUrl = `git@github.com:${vOwner}/${vRepoName}.git`;
            const vProdPath = `/home/notfstrf/bots/${vBotUsername}`;
            const vTestPath = `/home/pkondaurov/dev/${vBotUsername}`;
            const vLocalPath = glArr.glIsProd ? vProdPath : vTestPath;

            // Проверяем/создаём репозиторий
            vResultMsg += '📦 GitHub... ';
            try {
                let vRepoExists = false;
                try {
                    execSync(`gh repo view ${vOwner}/${vRepoName}`, { encoding: 'utf8', stdio: 'pipe' });
                    vRepoExists = true;
                } catch (e) { /* не существует */ }

                if (vRepoExists) {
                    vResultMsg += '⏭️ уже есть\n';
                } else {
                    const vDesc = vTask.botdescription || `Telegram bot ${vBotUsername}`;
                    execSync(`gh repo create ${vRepoName} --public --description "${vDesc}"`, { encoding: 'utf8' });
                    vResultMsg += '✅\n';
                }//
            } catch (err) {
                vResultMsg += `❌ ${err.message}\n`;
            }//

            // Клонируем локально
            vResultMsg += glArr.glIsProd ? '🚀 Клон на прод... ' : '🖥️ Клон на тест... ';
            try {
                if (!fs.existsSync(vLocalPath)) {
                    execSync(`git clone ${vRepoUrl} ${vLocalPath}`, { encoding: 'utf8' });

                    // Читаем шаблон из БД и заменяем переменные
                    const dbCfg = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_configs`).first();
                    const vIndexContent = dbCfg.indexjs
                        .replace(/🔬botusername🔬/g, vBotUsername)
                        .replace(/🔬schema🔬/g, vSchemaName)
                        .replace(/🔬description🔬/g, vTask.botdescription || `Telegram bot ${vBotUsername}`);

                    // Записываем Index.js
                    const vIndexPath = `${vLocalPath}/${vBotUsername}Index.js`;
                    fs.writeFileSync(vIndexPath, vIndexContent, 'utf8');

                    // Коммитим и пушим (в пустой репо нужен -u origin main)
                    execSync(`cd ${vLocalPath} && git checkout -b main && git add . && git commit -m "Initial commit: bot skeleton" && git push -u origin main`, { encoding: 'utf8' });

                    vResultMsg += '✅\n';
                } else {
                    vResultMsg += '⏭️\n';
                }//
            } catch (err) {
                vResultMsg += `❌ ${err.message}\n`;
            }//

            // Клонируем на удалённый сервер
            if (glArr.glIsProd) {
                // TODO: SSH на тест (пока недоступен с прода)
                vResultMsg += '🖥️ Клон на тест... ⏸️ (SSH не настроен)\n';
            } else {
                vResultMsg += '🚀 Клон на прод... ';
                try {
                    const vResult = execSync(`ssh notfstrf@84.252.140.239 "[ -d '${vProdPath}' ] && echo EXISTS || git clone ${vRepoUrl} ${vProdPath} && echo CLONED"`, { encoding: 'utf8' });
                    vResultMsg += vResult.includes('CLONED') ? '✅\n' : '⏭️\n';
                } catch (err) {
                    vResultMsg += `❌ ${err.message}\n`;
                }//
            }//

            // ============ ИТОГ ============
            vResultMsg += '\n✅ <b>Бот создан!</b>\n';
            vResultMsg += `@${vBotUsername} | lib_bots.id: ${vLibBotsId} | schema: ${vSchemaName}`;

            await lib.libSendBigMessage(glArr, vTask.vChatId, vResultMsg);

        } catch (err) {
            await lib.libProcessError(glArr, err, vTask.vInitialMsg, false, 'lcSaveTaskToDb createBot');
        }//catch
    }//createBot
    else if (vTask.taskType === 'deleteBot') {
        const vBotUsername = vTask.choose_bot;
        let vResultMsg = `🗑️ <b>Удаление бота @${vBotUsername}</b>\n\n`;

        try {
            const vTimestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
            const vBackupDir = `/home/pkondaurov/backups/deleted_bots/${vBotUsername}_${vTimestamp}`;
            const vTestBotPath = `/home/pkondaurov/dev/${vBotUsername}`;
            const vProdBotPath = `/home/notfstrf/bots/${vBotUsername}`;

            // SSH хосты
            const vTestHost = 'pkondaurov@92.51.45.118';
            const vProdHost = 'notfstrf@84.252.140.239';
            const vDbConfig = dbConnect; // используем уже загруженный конфиг

            // ============ 1. СОЗДАНИЕ ПАПКИ БЭКАПА ============
            vResultMsg += '📁 Создание папки бэкапа... ';
            if (glArr.glIsProd) {
                execSync(`ssh ${vTestHost} "mkdir -p ${vBackupDir}/db"`, { encoding: 'utf8' });
            } else {
                fs.mkdirSync(`${vBackupDir}/db`, { recursive: true });
            }
            vResultMsg += '✅\n';

            // ============ 2. БЭКАП БАЗЫ ДАННЫХ ============
            vResultMsg += '💾 Бэкап БД...\n';

            // Вспомогательная функция для записи JSON на тест
            const writeJsonToTest = (filePath, data) => {
                const jsonContent = JSON.stringify(data, null, 2);
                if (glArr.glIsProd) {
                    // Записываем локально во временный файл, потом scp на тест
                    const tmpFile = `/tmp/backup_${Date.now()}.json`;
                    fs.writeFileSync(tmpFile, jsonContent);
                    execSync(`scp ${tmpFile} ${vTestHost}:${filePath}`, { encoding: 'utf8' });
                    fs.unlinkSync(tmpFile);
                } else {
                    fs.writeFileSync(filePath, jsonContent);
                }
            };

            // 2.1 lib_bots
            const dbBot = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                .where('botusername', vBotUsername)
                .first();
            if (dbBot) {
                writeJsonToTest(`${vBackupDir}/db/lib_bots.json`, dbBot);
                vResultMsg += '   lib_bots ✅\n';
            }//

            // 2.2 lib_workgroups
            const dbWorkgroups = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_workgroups`)
                .where('botusername', vBotUsername);
            writeJsonToTest(`${vBackupDir}/db/lib_workgroups.json`, dbWorkgroups);
            vResultMsg += `   lib_workgroups (${dbWorkgroups.length}) ✅\n`;

            // 2.3 lib_botusers
            const dbBotusers = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_botusers`)
                .where('botusername', vBotUsername);
            writeJsonToTest(`${vBackupDir}/db/lib_botusers.json`, dbBotusers);
            vResultMsg += `   lib_botusers (${dbBotusers.length}) ✅\n`;

            // 2.4 lib_savescenario
            const dbScenarios = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_savescenario`)
                .where('botusername', vBotUsername);
            writeJsonToTest(`${vBackupDir}/db/lib_savescenario.json`, dbScenarios);
            vResultMsg += `   lib_savescenario (${dbScenarios.length}) ✅\n`;

            // 2.5 lib_scenariobuttons (по id сценариев)
            const vScenarioIds = dbScenarios.map(s => s.id);
            let dbButtons = [];
            if (vScenarioIds.length > 0) {
                dbButtons = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_scenariobuttons`)
                    .whereIn('savescenarioid', vScenarioIds);
            }//
            writeJsonToTest(`${vBackupDir}/db/lib_scenariobuttons.json`, dbButtons);
            vResultMsg += `   lib_scenariobuttons (${dbButtons.length}) ✅\n`;

            // 2.6 lib_cmdmessages
            const dbCmdmessages = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_cmdmessages`)
                .where('botusername', vBotUsername);
            writeJsonToTest(`${vBackupDir}/db/lib_cmdmessages.json`, dbCmdmessages);
            vResultMsg += `   lib_cmdmessages (${dbCmdmessages.length}) ✅\n`;

            // 2.7 lib_msgbuttons, lib_msgphotos, lib_msgfiles (связаны с cmdmessages)
            const vCmdmessagesIds = dbCmdmessages.map(c => c.id);

            let dbMsgbuttons = [];
            let dbMsgphotos = [];
            let dbMsgfiles = [];
            if (vCmdmessagesIds.length > 0) {
                dbMsgbuttons = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_msgbuttons`)
                    .whereIn('cmdmessagesid', vCmdmessagesIds);
                dbMsgphotos = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_msgphotos`)
                    .whereIn('cmdmessagesid', vCmdmessagesIds);
                dbMsgfiles = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_msgfiles`)
                    .whereIn('cmdmessagesid', vCmdmessagesIds);
            }
            writeJsonToTest(`${vBackupDir}/db/lib_msgbuttons.json`, dbMsgbuttons);
            writeJsonToTest(`${vBackupDir}/db/lib_msgphotos.json`, dbMsgphotos);
            writeJsonToTest(`${vBackupDir}/db/lib_msgfiles.json`, dbMsgfiles);
            vResultMsg += `   lib_msgbuttons (${dbMsgbuttons.length}) ✅\n`;
            vResultMsg += `   lib_msgphotos (${dbMsgphotos.length}) ✅\n`;
            vResultMsg += `   lib_msgfiles (${dbMsgfiles.length}) ✅\n`;

            // 2.8 Схема бота (pg_dump) — всегда выполняем на тесте
            try {
                const vDbConfig = require('./dbconnect.json');
                const vDumpCmd = `PGPASSWORD="${vDbConfig.password}" pg_dump -h ${vDbConfig.host} -U ${vDbConfig.user} -d ${vDbConfig.database} -n ${vBotUsername} --no-owner`;
                if (glArr.glIsProd) {
                    execSync(`ssh ${vTestHost} '${vDumpCmd} > "${vBackupDir}/db/schema_${vBotUsername}.sql"'`, { encoding: 'utf8' });
                } else {
                    execSync(`${vDumpCmd} > "${vBackupDir}/db/schema_${vBotUsername}.sql"`, { encoding: 'utf8' });
                }
                vResultMsg += `   schema_${vBotUsername} ✅\n`;
            } catch (err) {
                vResultMsg += `   schema_${vBotUsername} ⏭️ (пустая или не существует)\n`;
            }//

            // ============ 3. БЭКАП GITHUB ============
            vResultMsg += '📦 Бэкап GitHub... ';
            let vGithubRepoExists = false;
            try {
                if (glArr.glIsProd) {
                    execSync(`ssh ${vTestHost} 'git clone git@github.com:pkondaurov/${vBotUsername}.git "${vBackupDir}/github"'`, { encoding: 'utf8', stdio: 'pipe' });
                } else {
                    execSync(`git clone git@github.com:pkondaurov/${vBotUsername}.git "${vBackupDir}/github"`, { encoding: 'utf8', stdio: 'pipe' });
                }
                vResultMsg += '✅\n';
                vGithubRepoExists = true;
            } catch (err) {
                vResultMsg += '⏭️ (репо не существует)\n';
            }//

            // ============ 4. БЭКАП ПАПКИ НА ТЕСТЕ ============
            vResultMsg += '🖥️ Бэкап тест-папки... ';
            try {
                if (glArr.glIsProd) {
                    execSync(`ssh ${vTestHost} '[ -d "${vTestBotPath}" ] && cp -r "${vTestBotPath}" "${vBackupDir}/test" || echo NOTEXIST'`, { encoding: 'utf8' });
                } else {
                    if (fs.existsSync(vTestBotPath)) {
                        execSync(`cp -r "${vTestBotPath}" "${vBackupDir}/test"`, { encoding: 'utf8' });
                    }
                }
                vResultMsg += '✅\n';
            } catch (err) {
                vResultMsg += '⏭️ (не существует)\n';
            }//

            // ============ 5. БЭКАП ПАПКИ НА ПРОДЕ ============
            vResultMsg += '🚀 Бэкап прод-папки... ';
            try {
                if (glArr.glIsProd) {
                    // С прода: сначала tar локально, потом scp на тест
                    execSync(`tar -czf /tmp/${vBotUsername}_prod.tar.gz -C /home/notfstrf/bots ${vBotUsername} 2>/dev/null && scp /tmp/${vBotUsername}_prod.tar.gz ${vTestHost}:${vBackupDir}/prod.tar.gz && rm /tmp/${vBotUsername}_prod.tar.gz`, { encoding: 'utf8', timeout: 60000 });
                } else {
                    // С теста: ssh на прод и tar через pipe
                    execSync(`ssh ${vProdHost} "tar -czf - -C /home/notfstrf/bots ${vBotUsername}" > "${vBackupDir}/prod.tar.gz"`, { encoding: 'utf8', timeout: 60000 });
                }
                vResultMsg += '✅\n';
            } catch (err) {
                vResultMsg += `⏭️ (${err.message})\n`;
            }//

            vResultMsg += '\n✅ <b>Бэкап завершён!</b>\n';
            vResultMsg += `📂 ${vBackupDir}\n\n`;
            vResultMsg += '🗑️ <b>Начинаю удаление...</b>\n\n';
            await lib.libSendBigMessage(glArr, vTask.vChatId, vResultMsg);
            vResultMsg = '';

            // ============ 6. УДАЛЕНИЕ ИЗ БД ============
            // 6.1 lib_scenariobuttons
            try {
                if (vScenarioIds.length > 0) {
                    await glArr.glKnex(`${glArr.glPgLibSchema}.lib_scenariobuttons`)
                        .whereIn('savescenarioid', vScenarioIds)
                        .del();
                }//
                vResultMsg += '🗑️ lib_scenariobuttons ✅\n';
            } catch (err) {
                vResultMsg += `🗑️ lib_scenariobuttons ❌ ${err.message}\n`;
            }

            // 6.2 lib_savescenario
            try {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_savescenario`)
                    .where('botusername', vBotUsername)
                    .del();
                vResultMsg += '🗑️ lib_savescenario ✅\n';
            } catch (err) {
                vResultMsg += `🗑️ lib_savescenario ❌ ${err.message}\n`;
            }

            // 6.3 lib_cmdmessages
            try {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_cmdmessages`)
                    .where('botusername', vBotUsername)
                    .del();
                vResultMsg += '🗑️ lib_cmdmessages ✅\n';
            } catch (err) {
                vResultMsg += `🗑️ lib_cmdmessages ❌ ${err.message}\n`;
            }

            // 6.4 lib_workgroups
            try {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_workgroups`)
                    .where('botusername', vBotUsername)
                    .del();
                vResultMsg += '🗑️ lib_workgroups ✅\n';
            } catch (err) {
                vResultMsg += `🗑️ lib_workgroups ❌ ${err.message}\n`;
            }

            // 6.5 lib_botusers
            try {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_botusers`)
                    .where('botusername', vBotUsername)
                    .del();
                vResultMsg += '🗑️ lib_botusers ✅\n';
            } catch (err) {
                vResultMsg += `🗑️ lib_botusers ❌ ${err.message}\n`;
            }

            // 6.6 lib_bots
            try {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                    .where('botusername', vBotUsername)
                    .del();
                vResultMsg += '🗑️ lib_bots ✅\n';
            } catch (err) {
                vResultMsg += `🗑️ lib_bots ❌ ${err.message}\n`;
            }

            // 6.7 DROP SCHEMA
            try {
                await glArr.glKnex.raw(`DROP SCHEMA IF EXISTS "${vBotUsername}" CASCADE`);
                vResultMsg += `🗑️ schema "${vBotUsername}" ✅\n`;
            } catch (err) {
                vResultMsg += `🗑️ schema "${vBotUsername}" ❌ ${err.message}\n`;
            }//

            // ============ 7. УДАЛЕНИЕ ПАПКИ НА ТЕСТЕ ============
            vResultMsg += '🗑️ Папка на тесте... ';
            try {
                if (glArr.glIsProd) {
                    execSync(`ssh ${vTestHost} 'rm -rf "${vTestBotPath}"'`, { encoding: 'utf8' });
                } else {
                    if (fs.existsSync(vTestBotPath)) {
                        execSync(`rm -rf "${vTestBotPath}"`, { encoding: 'utf8' });
                    }
                }
                vResultMsg += '✅\n';
            } catch (err) {
                vResultMsg += `❌ ${err.message}\n`;
            }//

            // ============ 8. УДАЛЕНИЕ ПАПКИ НА ПРОДЕ ============
            vResultMsg += '🗑️ Папка на проде... ';
            try {
                if (glArr.glIsProd) {
                    execSync(`rm -rf "${vProdBotPath}"`, { encoding: 'utf8' });
                } else {
                    execSync(`ssh ${vProdHost} "rm -rf ${vProdBotPath}"`, { encoding: 'utf8', timeout: 30000 });
                }
                vResultMsg += '✅\n';
            } catch (err) {
                vResultMsg += `❌ ${err.message}\n`;
            }//

            // ============ 9. УДАЛЕНИЕ GITHUB РЕПОЗИТОРИЯ ============
            vResultMsg += '🗑️ GitHub репозиторий... ';
            if (vGithubRepoExists) {
                try {
                    // gh установлен на тесте, выполняем там
                    if (glArr.glIsProd) {
                        execSync(`ssh ${vTestHost} 'gh repo delete pkondaurov/${vBotUsername} --yes'`, { encoding: 'utf8' });
                    } else {
                        execSync(`gh repo delete pkondaurov/${vBotUsername} --yes`, { encoding: 'utf8' });
                    }
                    vResultMsg += '✅\n';
                } catch (err) {
                    vResultMsg += `❌ ${err.message}\n`;
                }//
            } else {
                vResultMsg += '⏭️ (не существовал)\n';
            }//

            // ============ 10. PM2 — ОСТАНОВКА И УДАЛЕНИЕ ============
            vResultMsg += '🗑️ PM2... ';
            try {
                // На тесте
                try {
                    if (glArr.glIsProd) {
                        execSync(`ssh ${vTestHost} 'pm2 delete ${vBotUsername}-test 2>/dev/null || true && pm2 save'`, { encoding: 'utf8' });
                    } else {
                        execSync(`pm2 delete ${vBotUsername}-test 2>/dev/null || true && pm2 save`, { encoding: 'utf8' });
                    }
                } catch (e) {
                    vResultMsg += `(тест: ${e.message}) `;
                }
                // На проде
                try {
                    if (glArr.glIsProd) {
                        execSync(`source ~/.nvm/nvm.sh && pm2 delete ${vBotUsername}-app 2>/dev/null || true && pm2 save`, { encoding: 'utf8' });
                    } else {
                        execSync(`ssh ${vProdHost} "source ~/.nvm/nvm.sh && pm2 delete ${vBotUsername}-app 2>/dev/null || true && pm2 save"`, { encoding: 'utf8', timeout: 30000 });
                    }
                } catch (e) {
                    vResultMsg += `(прод: ${e.message}) `;
                }
                vResultMsg += '✅\n';
            } catch (err) {
                vResultMsg += `❌ ${err.message}\n`;
            }//

            vResultMsg += '\n✅✅✅ <b>Бот @' + vBotUsername + ' полностью удалён!</b>\n';
            vResultMsg += `\n📂 Бэкап: ${vBackupDir}`;

            await lib.libSendBigMessage(glArr, vTask.vChatId, vResultMsg);

        } catch (err) {
            await lib.libProcessError(glArr, err, vTask.vInitialMsg, false, 'lcSaveTaskToDb deleteBot');
        }//catch
    }//deleteBot
}//🆘🆘🆘 Сохранение специфичных тасков для этого бота
async function lcGetFullInfoExtra(vBotUsersId) {
    return null;
}//ℹ️ Локальная информация для libGetFullInfo

onStart();
