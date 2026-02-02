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

//⛅️⛅️⛅️ Локальная реализация библиотечных функций🔽🔽🔽
async function lcAddProcessCommand(cleanCommand, paramCommand, updMsg) {
    let vTaskType;
    let vTaskName;

    if (cleanCommand === '/newbot') vTaskType = 'createBot', vTaskName = 'Создание нового бота';

    if (!vTaskName) return await lib.libAddProcessCommand(glArr, cleanCommand, paramCommand, updMsg); //⛔

    const vTask = await lib.libCreateTask(glArr, updMsg, vTaskType, vTaskName);
    if (vTask) await lib.libProcessUpd(glArr, updMsg, vTask);
    return false;
} ////➕➕➕Обработка команд для этого бота
async function lcSubstituteVars(glArr, vVariable, vBotUsersId) {// 📢📢📢Переменные
    let vResult = null;

    if (vVariable === 'startwelcome') {
        const vTelegramId = await lib.libGetTelegramIdByBotUsersId(glArr, vBotUsersId);
        const vIsAdmin = glArr.glAdminList.includes(Number(vTelegramId));

        if (vIsAdmin) {
            vResult = `🛠 Добро пожаловать, Повелитель!\n\nДоступные команды:\n/newbot — создать нового бота`;
        } else {
            vResult = `⚠️ Это служебный бот для администрирования.\n\nДоступ ограничен. Обратитесь к @pkondaurov`;
        }//
    }//startwelcome

    return vResult;
}// 📢📢📢Переменные
async function lcPrepareQuestionStep(glArr, vTask) {
    // Динамических кнопок пока нет
} //❓🆗❓ Добавление динамических кнопок и обработка вопроса шага перед отправкой пользователю
async function lcActBeforeAssign(glArr, msg, vTask) {
    if (vTask.taskType === 'createBot' && vTask.currentScenarioStep?.stepname === 'bottoken_test') {
        if (vTask.use_shared_test === 'yes') {
            // Получаем токен общего тестового бота из любого существующего бота
            const dbBot = await glArr.glKnex(`${glArr.glPgLibSchema}.lib_bots`)
                .select(glArr.glKnex.raw("secrets->'telegram'->>'test' as testtoken"))
                .whereRaw("secrets->'telegram'->>'test' IS NOT NULL")
                .first();

            if (dbBot?.testtoken) {
                vTask.bottoken_test = dbBot.testtoken;
                await lib.libActualiseCurrentStep(glArr, vTask);
            }//
        }//Подстановка токена общего тестового бота
    }//createBot bottoken_test
} //☀️☀️☀️🛃🛃🛃 Дозаполнение полей перед присвоением значения шагу
async function lcSaveTaskToDb(glArr, vTask) {
    if (vTask.taskType === 'createBot') {
        const vChatId = vTask.chatId;
        let vResultMsg = '🤖 **Создание бота**\n\n';

        try {
            const vTokenProd = vTask.bottoken_prod?.trim();
            const vTokenTest = vTask.bottoken_test?.trim();
            const vDescription = vTask.botdescription || '';
            const vCreateGithub = vTask.create_github === 'yes';
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
                await lib.libSendBigMessage(glArr, vChatId, vResultMsg);
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

                    // Добавляем нового бота в группу
                    await lib.libAddMembersToChat(glArr, vGroupResult.vChatId, [
                        { id: vBotTelegramId, rank: 'Main Bot' },
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
                .where('command', '/start')
                .first();

            if (vExistingStart) {
                vResultMsg += '⏭️\n';
            } else {
                await glArr.glKnex(`${glArr.glPgLibSchema}.lib_cmdmessages`)
                    .insert({
                        botusername: vBotUsername,
                        command: '/start',
                        messagetext: vStartMessage
                    });
                vResultMsg += '✅\n';
            }//

            // ============ F. MANAGED_BOTS ============
            vResultMsg += '📋 managed_bots... ';
            const vExistingManaged = await glArr.glKnex('megaarchitect.managed_bots')
                .where('botusername', vBotUsername)
                .first();

            if (vExistingManaged) {
                vResultMsg += '⏭️\n';
            } else {
                const vBotUsersId = await lib.libGetBotUsersIdByTelegramId(glArr, lib.libGetTelegramIdByUpdMsg(vTask.vInitialMsg));
                await glArr.glKnex('megaarchitect.managed_bots')
                    .insert({
                        botusername: vBotUsername,
                        lib_bots_id: vLibBotsId,
                        github_repo: vCreateGithub ? `pkondaurov/${vBotUsername}` : null,
                        createdby: vBotUsersId
                    });
                vResultMsg += '✅\n';
            }//

            // ============ G. GITHUB ============
            if (vCreateGithub) {
                vResultMsg += '📦 GitHub... ⏳ TODO\n';
            }//

            // ============ ИТОГ ============
            vResultMsg += '\n✅ **Бот создан!**\n';
            vResultMsg += `@${vBotUsername} | lib_bots.id: ${vLibBotsId} | schema: ${vSchemaName}`;

            await lib.libSendBigMessage(glArr, vChatId, vResultMsg, { parse_mode: 'Markdown' });

        } catch (err) {
            vResultMsg += `\n\n❌ **Ошибка:** ${err.message}`;
            await lib.libSendBigMessage(glArr, vChatId, vResultMsg, { parse_mode: 'Markdown' });
            await lib.libProcessError(glArr, err, vTask.vInitialMsg, false, 'lcSaveTaskToDb createBot');
        }//catch
    }//createBot
}//🆘🆘🆘 Сохранение специфичных тасков для этого бота
async function lcGetFullInfoExtra(glArr, vBotUsersId) {
    return null;
}//ℹ️ Локальная информация для libGetFullInfo

onStart();
